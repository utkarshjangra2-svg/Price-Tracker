import axios from "axios";
import { extractMcpSource, fetchDirectDeals, normalizeMcpDeals, getImageForCuisine } from "./zomatoSources.js";
import { callZomatoMcpTool } from "./zomatoOfficialMcp.js";
import { callUserZomatoTool } from "./zomatoUserSessionService.js";
import { resolveDishQuery, getDishMatchScore, getRelatedCuisines } from "./searchIntent.js";
import { fetchDealsFromMongo } from "./databaseDeals.js";

import { getCitySlug, getCitySlugFromText } from "../utils/getCitySlug.js";

// ── Location verification helpers ──────────────────────────────────────────

/**
 * Verify that a restaurant result actually belongs to the user-requested location.
 * Checks the restaurant's location/address/city against the requested location tokens.
 * Returns true if the restaurant is verified for the location, false otherwise.
 */
const verifyRestaurantForLocation = (restaurant = {}, requestedLocation = "") => {
  if (!requestedLocation || requestedLocation.trim().length < 3) return true; // too vague to filter

  const requestedNorm = requestedLocation.toLowerCase().replace(/[^a-z0-9\s,]/g, " ").replace(/\s+/g, " ").trim();
  const requestedTokens = requestedNorm.split(/[,\s]+/).filter(t => t.length >= 3);
  if (!requestedTokens.length) return true;

  // Resolve the city slug the user asked for
  const requestedCitySlug = getCitySlugFromText(requestedLocation);

  // Build a haystack from all location-relevant fields of the restaurant
  const haystack = [
    restaurant.location || "",
    restaurant.city || "",
    restaurant.address || "",
    restaurant.area || "",
    restaurant.locality || "",
    restaurant.orderUrl || "",
    restaurant.restaurantUrl || "",
    restaurant.slug || ""
  ].join(" ").toLowerCase();

  // 1. If we can resolve a city slug for the restaurant, compare it with the requested slug
  const restaurantCitySlug = getCitySlugFromText(haystack);
  if (requestedCitySlug && restaurantCitySlug) {
    // Cities must match — this is the strongest signal
    return requestedCitySlug === restaurantCitySlug;
  }

  // 2. If we can't resolve city slugs, fall back to token matching
  // At least one significant location token must appear in the restaurant's location data
  const matchCount = requestedTokens.filter(token => haystack.includes(token)).length;
  return matchCount >= 1;
};


let mcpRetryAfter = 0;
const MCP_RETRY_COOLDOWN_MS = Number(process.env.MCP_RETRY_COOLDOWN_MS || 15000);
const RECENT_LIVE_CACHE_TTL_MS = Number(process.env.RECENT_LIVE_CACHE_TTL_MS || 20 * 60 * 1000);
let lastSourceLog = "";
const recentLiveDealsCache = new Map();

const normalizeProvider = (provider = "zomato") =>
  provider?.toString()?.trim()?.toLowerCase() || "zomato";

const getMcpConfig = (provider = "zomato") => {
  const normalizedProvider = normalizeProvider(provider);
  const baseConfig = {
    url: process.env.MCP_URL?.trim(),
    tool: process.env.MCP_TOOL?.trim(),
    bearerToken: process.env.MCP_BEARER_TOKEN?.trim(),
    authHeaderName: process.env.MCP_AUTH_HEADER?.trim(),
    authHeaderValue: process.env.MCP_AUTH_VALUE?.trim(),
    enabled: process.env.USE_MCP === "true"
  };

  if (normalizedProvider === "swiggy") {
    return {
      ...baseConfig,
      url: baseConfig.url || process.env.SWIGGY_MCP_URL?.trim(),
      tool:
        baseConfig.tool ||
        process.env.SWIGGY_MCP_TOOL?.trim() ||
        process.env.MCP_TOOL?.trim() ||
        "get_deals",
      bearerToken: baseConfig.bearerToken || process.env.SWIGGY_MCP_BEARER_TOKEN?.trim(),
      authHeaderName:
        baseConfig.authHeaderName || process.env.SWIGGY_MCP_AUTH_HEADER?.trim(),
      authHeaderValue:
        baseConfig.authHeaderValue || process.env.SWIGGY_MCP_AUTH_VALUE?.trim(),
      enabled: baseConfig.enabled || process.env.USE_SWIGGY_MCP === "true"
    };
  }

  return {
    ...baseConfig,
    url: baseConfig.url || process.env.ZOMATO_MCP_URL || "http://localhost:7000/mcp",
    tool:
      baseConfig.tool || process.env.ZOMATO_MCP_TOOL?.trim() || "get_zomato_deals",
    bearerToken: baseConfig.bearerToken || process.env.ZOMATO_MCP_BEARER_TOKEN?.trim(),
    authHeaderName:
      baseConfig.authHeaderName || process.env.ZOMATO_MCP_AUTH_HEADER?.trim(),
    authHeaderValue:
      baseConfig.authHeaderValue || process.env.ZOMATO_MCP_AUTH_VALUE?.trim(),
    enabled: baseConfig.enabled || process.env.USE_ZOMATO_MCP === "true"
  };
};

const buildMcpHeaders = (provider = "zomato") => {
  const headers = {};
  const { bearerToken, authHeaderName, authHeaderValue } = getMcpConfig(provider);

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  if (authHeaderName && authHeaderValue) {
    headers[authHeaderName] = authHeaderValue;
  }

  return headers;
};

const isMcpEnabled = (provider = "zomato") => {
  const config = getMcpConfig(provider);
  return config.enabled && Date.now() >= mcpRetryAfter;
};

const getErrorLabel = (error) => error?.message || error?.code || "Unknown MCP error";

const logSourceStatus = (message) => {
  if (lastSourceLog === message) {
    return;
  }

  lastSourceLog = message;
  console.log(message);
};

const buildRecentCacheKey = ({ location = "", cuisine = "" }) =>
  `${location.trim().toLowerCase()}|${cuisine.trim().toLowerCase()}`;

const normalizeLocationText = (value = "") =>
  value
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9\s,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getSignificantLocationTokens = (value = "") =>
  normalizeLocationText(value)
    .split(/[,\s]+/)
    .filter((token) => token.length >= 4);

const findMatchingSavedAddress = (addresses = [], requestedLocation = "", locationData = null) => {
  const normalizedLocation = normalizeLocationText(requestedLocation);

  // If we have coordinates, find the closest saved address
  if (locationData?.latitude && locationData?.longitude) {
    const targetLat = locationData.latitude;
    const targetLng = locationData.longitude;

    let closestAddress = null;
    let minDistance = Infinity;

    for (const address of addresses) {
      const addrLat = address.latitude || address.lat;
      const addrLng = address.longitude || address.lng || address.lon;

      if (addrLat && addrLng) {
        const distance = Math.sqrt(
          Math.pow(targetLat - addrLat, 2) + Math.pow(targetLng - addrLng, 2)
        );

        if (distance < minDistance) {
          minDistance = distance;
          closestAddress = address;
        }
      }
    }

    // If we found a reasonably close address (within ~10km), use it
    if (closestAddress && minDistance < 0.1) { // Rough approximation: 0.1 degrees ~ 11km
      return closestAddress;
    }
  }

  if (!normalizedLocation || normalizedLocation === "unknown" || normalizedLocation === "detecting") {
    return addresses[0] || null;
  }

  const requestedTokens = getSignificantLocationTokens(normalizedLocation);

  // STRICT: Only return an address that genuinely matches the user-requested location.
  // Do NOT fall back to addresses[0] — that causes wrong-city results.
  const matched = addresses.find((address) => {
    const addressText = normalizeLocationText(JSON.stringify(address));

    if (!addressText) {
      return false;
    }

    if (addressText.includes(normalizedLocation)) {
      return true;
    }

    if (!requestedTokens.length) {
      return false;
    }

    const matchedTokens = requestedTokens.filter((token) => addressText.includes(token));
    return matchedTokens.length === requestedTokens.length && matchedTokens.length >= Math.min(2, requestedTokens.length);
  });

  if (!matched) {
    console.log(`[MCP] No saved address matched "${requestedLocation}" — will use keyword-only search (not falling back to first address)`);
  }

  return matched || null;
};

const saveRecentLiveDeals = ({ location = "", cuisine = "", deals = [], source = "" }) => {
  if (!Array.isArray(deals) || !deals.length) {
    return;
  }

  recentLiveDealsCache.set(buildRecentCacheKey({ location, cuisine }), {
    deals,
    source,
    savedAt: Date.now()
  });
};

const readRecentLiveDeals = ({ location = "", cuisine = "" }) => {
  const keysToTry = [
    buildRecentCacheKey({ location, cuisine }),
    buildRecentCacheKey({ location, cuisine: "" })
  ];

  // Only try empty location if no specific location requested
  if (!location.trim()) {
    keysToTry.push(buildRecentCacheKey({ location: "", cuisine: "" }));
  }

  for (const key of keysToTry) {
    const entry = recentLiveDealsCache.get(key);

    if (!entry) {
      continue;
    }

    if (Date.now() - entry.savedAt > RECENT_LIVE_CACHE_TTL_MS) {
      recentLiveDealsCache.delete(key);
      continue;
    }

    return entry;
  }

  return null;
};

const getZomatoToolCaller = (user = {}) => {
  if (user?.id && user?.zomato?.linked) {
    return (toolName, args = {}) => callUserZomatoTool(String(user.id), toolName, args);
  }

  return (toolName, args = {}) => callZomatoMcpTool(toolName, args);
};

const tryFetchFromMcp = async ({ location, cuisine, limit, provider = "zomato", locationData = null, user = {} }) => {
  const callTool = getZomatoToolCaller(user);

  if (provider === "zomato" || provider === "zomato-mcp") {
    const keyword = cuisine || location || "food";
    let bestAddressId = "";

    // Try to get saved address for user-specific delivery
    try {
      const addressRes = await callTool("get_saved_addresses_for_user", {});
      if (addressRes?.success && addressRes?.result?.length) {
        const rawText = addressRes.result[0]?.text || "";
        const jsonMatch = rawText.match(/\{[\s\S]+?\}(?=\s*\{|\s*$)/);
        const authData = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
        const addresses = authData?.addresses || authData?.data?.addresses || [];
        if (addresses.length) {
          const matched = findMatchingSavedAddress(addresses, location, locationData);
          if (matched) {
            // Only use address_id if it's an actual location match
            bestAddressId = String(matched.address_id || matched.id || "");
            console.log(`[MCP] Location "${location}" matched saved address: ${matched.address_id || matched.id}`);
          } else {
            // No match — do NOT fall back to first address (would give wrong city results)
            // We'll embed the location in the keyword instead
            console.log(`[MCP] Location "${location}" not in saved addresses, using keyword-location search`);
          }
        }
      }
    } catch (addrErr) {
      console.log("[MCP] Address fetch skipped:", addrErr.message);
    }
    // Build search args — address_id is REQUIRED by the Zomato MCP tool.
    let searchArgs;
    if (bestAddressId) {
      // Best case: exact address match — use it with cuisine-only keyword
      searchArgs = { keyword: cuisine || location || "food", address_id: bestAddressId };
      console.log(`[Native MCP] Searching: keyword="${cuisine || location || "food"}" address_id=${bestAddressId} (matched)`);
    } else if (location && location.trim().length >= 3) {
      // User explicitly requested a location, but we have NO matching saved address.
      // The Zomato MCP tool strictly searches the delivery radius of the given address_id.
      // If we pass a Delhi address_id, it will return Delhi restaurants even if we put "Mumbai" in the keyword.
      // Therefore, we MUST throw an error here to force `fetchMcpDeals` to use the web scraper fallback
      // which properly supports cross-city searches without needing an address_id.
      throw new Error(`No saved address matches "${location}". MCP cannot search cross-city. Forcing web scraper fallback.`);
    } else {
      // No specific location requested ("Nearby") — safe to use the first available address
      let fallbackAddressId = "";
      try {
        const addrRes2 = await callTool("get_saved_addresses_for_user", {});
        const addrs2 = Array.isArray(addrRes2?.result) ? addrRes2.result : [];
        const parsed2 = addrs2.length && addrs2[0]?.text ? JSON.parse(addrs2[0].text) : {};
        const addrList = parsed2?.addresses || parsed2?.saved_addresses || (Array.isArray(parsed2) ? parsed2 : []);
        if (addrList.length) {
          fallbackAddressId = String(addrList[0].address_id || addrList[0].id || "");
        }
      } catch { }

      if (fallbackAddressId) {
        searchArgs = { keyword: cuisine || "food", address_id: fallbackAddressId };
        console.log(`[Native MCP] Searching nearby: keyword="${cuisine || "food"}" address_id=${fallbackAddressId}`);
      } else {
        // Absolutely no addresses — the tool will likely fail, but we'll try
        searchArgs = { keyword: cuisine || "food" };
        console.log(`[Native MCP] Searching nearby: keyword="${cuisine || "food"}" (NO address_id available)`);
      }
    }

    const searchRes = await callTool("get_restaurants_for_keyword", searchArgs);

    if (!searchRes?.success || !searchRes?.result?.length) {
      throw new Error("MCP get_restaurants_for_keyword returned no results");
    }

    let parsedData = {};
    try {
      const rawSearch = searchRes.result[0]?.text || "";
      console.log(`[MCP Parse] Raw response length: ${rawSearch.length}, first 200 chars: ${rawSearch.substring(0, 200)}`);

      // Strategy 1: Direct JSON parse (response is a clean JSON string)
      try {
        parsedData = JSON.parse(rawSearch);
      } catch {
        // Strategy 2: Find the outermost JSON object with balanced braces
        let depth = 0, startIdx = -1;
        let bestJson = null;
        for (let i = 0; i < rawSearch.length; i++) {
          if (rawSearch[i] === "{") {
            if (depth === 0) startIdx = i;
            depth++;
          } else if (rawSearch[i] === "}") {
            depth--;
            if (depth === 0 && startIdx >= 0) {
              const candidate = rawSearch.substring(startIdx, i + 1);
              if (!bestJson || candidate.length > bestJson.length) {
                bestJson = candidate;
              }
            }
          }
        }

        if (bestJson) {
          parsedData = JSON.parse(bestJson);
        } else {
          throw new Error("No JSON object found in MCP response");
        }
      }
    } catch (parseErr) {
      console.error(`[MCP Parse] Failed:`, parseErr.message);
      console.error(`[MCP Parse] Raw text (first 500 chars):`, (searchRes.result[0]?.text || "").substring(0, 500));
      throw new Error(`MCP search parse error: ${parseErr.message}`);
    }

    const rawResults = parsedData?.results || [];
    console.log(`[Native MCP] Got ${rawResults.length} restaurants for "${keyword}"`);

    // Use the user-requested location label for display (not the raw MCP address)
    const displayLocation = location || "Nearby";

    // Resolve city slug once for all deals in this batch
    const citySlug = await getCitySlug(location, locationData);
    console.log(`[MCP] Resolved city slug: "${citySlug}" for location "${location}"`);

    const deals = [];
    for (const r of rawResults) {
      if (deals.length === 0) {
        console.log(`[MCP Debug] Restaurant keys:`, Object.keys(r).join(", "));
      }
      const items = r.items?.length ? r.items : [{ name: cuisine || r.name || "Special", price: r.min_price || 200 }];
      for (const item of items) {
        const p = Number(item.price || item.discounted_price || 200);
        const original = item.discounted_price ? Math.round(p / 0.85) : Math.round(p * 1.2);

        // ── URL resolution pipeline (most specific → least specific) ──────────
        //
        // A VALID Zomato restaurant URL looks like:
        //   https://www.zomato.com/{city}/{restaurant-slug}
        //   https://www.zomato.com/{city}/{restaurant-slug}/order
        //
        // INVALID patterns returned by MCP that must be rejected:
        //   /ncr/restaurants?category=1&context=delivery&query=...  ← listing page
        //   /order-food-online  ← generic dead page
        //   ?rid=  ← old format (404)
        //   /search?query=  ← search page

        const isSpecificRestaurantUrl = (u) => {
          if (!u) return false;
          // Must be a zomato.com URL
          if (!u.includes("zomato.com")) return false;
          // Reject any URL that is a search or listing page
          if (/\/restaurants[?/]/.test(u)) return false;      // /ncr/restaurants?category=...
          if (/\/restaurants$/.test(u)) return false;          // /ncr/restaurants
          if (/[?&](category|context|query|search)=/.test(u)) return false; // has search params
          if (/[?&]rid=/.test(u)) return false;               // old rid= format
          if (/\/order-food-online/.test(u)) return false;    // dead generic page
          if (/\/search[?]/.test(u)) return false;            // /search? page
          // Must look like a slug path: /city/restaurant-slug or /city/restaurant-slug/order
          const path = u.replace(/^https?:\/\/[^/]+/, "");
          const parts = path.replace(/^\//, "").split("/").filter(Boolean);
          // Valid: at least 2 path segments (city + slug), e.g. /delhi/restaurant-name
          return parts.length >= 2;
        };

        // Collect raw URL candidates from MCP response
        const candidateUrls = [
          r.page_url, r.permalink, r.web_url, r.share_url,
          r.order_url, r.restaurant_url, r.link, r.url
        ]
          .filter(Boolean)
          .map((u) => u.startsWith("http") ? u : `https://www.zomato.com${u.startsWith("/") ? "" : "/"}${u}`);

        // Only keep URLs that are actual restaurant pages (not listing/search pages)
        const directUrl = candidateUrls.find(isSpecificRestaurantUrl);

        let restaurantUrl = "";
        let finalOrderUrl = "";

        if (directUrl) {
          // Strip any trailing /order so we have a clean base
          restaurantUrl = directUrl.replace(/\/order(?:\/.*)?$/, "").replace(/\/$/, "");
          // Only append /order if the URL is a clean slug path (no query string)
          if (/\/order(?:\/|$)/i.test(directUrl)) {
            finalOrderUrl = directUrl;
          } else if (/[?#]/.test(restaurantUrl)) {
            // URL has query params — unsafe to append /order, fall through to slug build
            finalOrderUrl = "";
          } else {
            finalOrderUrl = `${restaurantUrl}/order`;
          }
        }

        // If directUrl gave us nothing usable, build from slug + city (most reliable)
        if (!finalOrderUrl) {
          if (r.slug && citySlug) {
            // Build from city slug + restaurant slug (most reliable fallback)
            restaurantUrl = `https://www.zomato.com/${citySlug}/${r.slug}`;
            finalOrderUrl = `${restaurantUrl}/order`;
          } else if (r.slug) {
            // We have a slug but no city — try to extract city from location text
            const fallbackCity = getCitySlugFromText(location) || "ncr";
            restaurantUrl = `https://www.zomato.com/${fallbackCity}/${r.slug}`;
            finalOrderUrl = `${restaurantUrl}/order`;
          } else if (citySlug) {
            // No slug at all — deep-link to city delivery search for this dish/restaurant
            const query = encodeURIComponent(
              [cuisine || r.name || "food", r.name].filter(Boolean).join(" ")
            );
            finalOrderUrl = `https://www.zomato.com/${citySlug}/delivery?query=${query}`;
            restaurantUrl = finalOrderUrl;
          } else {
            // Last resort: city-level delivery search, never /order-food-online
            const q = encodeURIComponent(r.name || cuisine || "food");
            finalOrderUrl = `https://www.zomato.com/ncr/delivery?query=${q}`;
            restaurantUrl = finalOrderUrl;
          }
        }

        const DEFAULT_FOOD_IMG = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80";
        const dishSpecificImg = getImageForCuisine(cuisine || "");
        const resolvedImageUrl = dishSpecificImg !== DEFAULT_FOOD_IMG
          ? dishSpecificImg
          : (item.image_link || r.res_image || DEFAULT_FOOD_IMG);

        const deal = {
          name: item.name || r.name,
          dishName: item.name || r.name,
          restaurant: r.name,
          res_id: String(r.res_id || ""),
          restaurantId: String(r.res_id || ""),
          slug: r.slug || "",
          catalogueId: item.catalogue_id || "",
          restaurantUrl,
          cuisine: cuisine || "General",
          location: displayLocation,
          city: r.city || r.location?.city || "",
          area: r.area || r.locality || r.location?.area || "",
          address: r.address || r.location?.address || "",
          basePrice: original,
          price: p,
          discount: Math.round(((original - p) / original) * 100) || 0,
          rating: Number(r.rating) || 4.0,
          eta: r.eta || "30 mins",
          imageUrl: resolvedImageUrl,
          orderUrl: finalOrderUrl,
          isLive: true,
          verified: true,
          isOrderableNow: Boolean(finalOrderUrl) && (r.serviceability_status === "serviceable" || !r.serviceability_status)
        };
        deals.push(deal);

        if (deals.length >= limit) break;
      }
      if (deals.length >= limit) break;
    }

    let finalDeals = deals;

    // ── Location verification: only keep restaurants that match the requested location ──
    if (location && location.trim().length >= 3) {
      const locationVerified = finalDeals.filter(deal => verifyRestaurantForLocation(deal, location));
      const droppedCount = finalDeals.length - locationVerified.length;
      if (droppedCount > 0) {
        console.log(`[MCP] Location verification: dropped ${droppedCount}/${finalDeals.length} restaurants not matching "${location}"`);
      }
      // Set to verified ONLY. If 0 remain, that's correct—they were all wrong city.
      finalDeals = locationVerified;
    }

    if (cuisine) {
      const resolvedCuisine = resolveDishQuery(cuisine);
      const relatedCuisines = getRelatedCuisines(resolvedCuisine);
      
      const cuisineFiltered = finalDeals.filter(deal => {
        // If this is a known dish (e.g. rasgulla→mithai), use strict cuisine matching
        if (relatedCuisines.length > 0) {
          const haystack = `${deal.restaurant || ""} ${deal.cuisine || ""}`.toLowerCase();
          const strictMatch = relatedCuisines.some(c => haystack.includes(c));
          const dishLiteralMatch = haystack.includes(resolvedCuisine.toLowerCase());
          return strictMatch || dishLiteralMatch;
        }
        // Otherwise use fuzzy score
        const score = getDishMatchScore(resolvedCuisine, deal);
        const restScore = getDishMatchScore(resolvedCuisine, { name: deal.restaurant });
        return score > 0.25 || restScore > 0.3;
      });
      if (cuisineFiltered.length) {
        finalDeals = cuisineFiltered;
      } else if (deals.length > 0) {
        throw new Error(`MCP returned deals but none matched the strict query for "${cuisine}"`);
      }
    }

    if (!finalDeals.length) {
      throw new Error("MCP returned restaurants but no menu items could be mapped");
    }

    return { deals: finalDeals, upstreamSource: "zomato-native-app", diagnostics: null };
  }

  throw new Error(`Unsupported MCP provider: ${provider}`);
};

export const fetchMcpDeals = async ({ location = "", cuisine = "", limit = 8, providers = ["zomato"], locationData = null, user = {} }) => {
  if (!Array.isArray(providers) || !providers.length) {
    providers = ["zomato"];
  }
  const normalizedProviders = providers.map(p => normalizeProvider(p));
  const normalizedLocation = location.trim();
  const normalizedCuisine = resolveDishQuery(cuisine.trim());

  const allDeals = [];
  let combinedSource = "";
  let diagnostics = null;

  for (const provider of normalizedProviders) {
    const mcpEnabled = isMcpEnabled(provider);
    console.log(`[fetchMcpDeals] Provider=${provider}, enabled=${mcpEnabled}, cooldownActive=${mcpRetryAfter > Date.now()}, cooldownLeft=${Math.max(0, Math.ceil((mcpRetryAfter - Date.now()) / 1000))}s`);

    if (mcpEnabled) {
      try {
        console.log(`[fetchMcpDeals] Calling tryFetchFromMcp for "${normalizedCuisine}" in "${normalizedLocation}"...`);
        const { deals: mcpDeals, upstreamSource, diagnostics: diag } = await tryFetchFromMcp({
          location: normalizedLocation,
          cuisine: normalizedCuisine,
          limit: Math.ceil(limit / normalizedProviders.length),
          provider,
          locationData,
          user
        });

        if (mcpDeals.length) {
          allDeals.push(...mcpDeals);
          combinedSource += (combinedSource ? ", " : "") + (upstreamSource === "zomato-web" ? "mcp" : upstreamSource || `${provider}-mcp`);
          if (!diagnostics) diagnostics = diag;
          saveRecentLiveDeals({
            location: normalizedLocation,
            cuisine: normalizedCuisine,
            deals: mcpDeals,
            source: upstreamSource === "zomato-web" ? "mcp" : upstreamSource || `${provider}-mcp`
          });
          logSourceStatus(
            `MCP live source active: ${mcpDeals.length} deals from ${upstreamSource} for ${normalizedCuisine || "all cuisines"} in ${normalizedLocation || "default location"}.`
          );
        } else {
          logSourceStatus(
            diag?.code === "EACCES"
              ? "MCP is online, but outbound live fetch is blocked by the runtime environment (EACCES)."
              : "MCP server is reachable, but it returned 0 deals for this query."
          );
        }
      } catch (error) {
        // Only apply cooldown for actual connection-level errors, not data/parsing issues
        const isConnectionError = error?.code === "ECONNREFUSED" || error?.message?.includes("not connected") || error?.message?.includes("transport");
        if (isConnectionError) {
          mcpRetryAfter = Date.now() + MCP_RETRY_COOLDOWN_MS;
          console.error(`[fetchMcpDeals] CONNECTION error — cooldown set for ${MCP_RETRY_COOLDOWN_MS / 1000}s:`, error.message);
        } else {
          // Data/parsing errors should NOT block future attempts
          console.error(`[fetchMcpDeals] MCP data error (no cooldown):`, error.message);
        }
        logSourceStatus(`MCP fetch failed for ${provider} (${getErrorLabel(error)}).`);
      }
    } else if ((process.env.USE_ZOMATO_MCP === "true" || process.env.USE_SWIGGY_MCP === "true" || process.env.USE_MCP === "true") && mcpRetryAfter > Date.now()) {
      logSourceStatus(`MCP cooldown active for ${Math.ceil((mcpRetryAfter - Date.now()) / 1000)}s after connection failure.`);
    }

    // Removed fallbacks - only MCP now
  }

  // Removed smart fallback - only MCP now
  // Slice to the total limit
  const finalDeals = allDeals.slice(0, limit);

  if (finalDeals.length) {
    return {
      source: combinedSource || "multiple",
      deals: finalDeals,
      diagnostics
    };
  }

  // Fallback: If MCP failed or couldn't find deals in the requested city, use the web scraper
  // The official Zomato MCP tool requires an address_id, so it cannot search outside the user's saved address cities.
  // The web scraper (fetchDirectDeals) handles cross-city searches perfectly.

  // Zomato Web only exposes JSON-LD for top-level SEO categories. Niche dishes will fail.
  // We map them to their broader category to ensure the bot can extract live restaurants.
  const WEB_SCRAPER_CATEGORY_MAP = {
    "ladoo": "mithai",
    "rasgulla": "mithai",
    "gulab jamun": "mithai",
    "jalebi": "mithai",
    "barfi": "mithai",
    "kaju katli": "mithai",
    "halwa": "mithai",
    "pedha": "mithai",
    "samosa": "street food",
    "kachori": "street food",
    "panipuri": "street food",
    "golgappa": "street food",
    "vadapav": "street food",
    "vada pav": "street food",
    "pav bhaji": "street food",
    "chaat": "street food",
    "bhel": "street food",
    "sev puri": "street food",
    "dahipuri": "street food",
    "chai": "beverages",
    "coffee": "beverages",
    "tea": "beverages",
    "milkshake": "beverages",
    "lassi": "beverages",
    "ice cream": "desserts",
    "pastry": "bakery",
    "cake": "bakery",
    "waffle": "desserts",
    "pancake": "desserts",
    "brownie": "desserts",
    "pasta": "fast food",
    "maggi": "fast food",
    "fries": "fast food",
    "sandwich": "fast food",
    "burgers": "burger",
    "wrap": "rolls",
    "shawarma": "rolls",
    "roll": "rolls",
    "noodles": "chinese",
    "momos": "chinese",
    "fried rice": "chinese",
    "manchurian": "chinese",
    "dosa": "south indian",
    "idli": "south indian",
    "vada": "south indian",
    "uttapam": "south indian",
    "paneer": "north indian",
    "chicken": "north indian",
    "mutton": "north indian",
    "dal": "north indian",
    "roti": "north indian",
    "naan": "north indian",
    "paratha": "north indian",
    "chole bhature": "north indian",
    "thali": "north indian",
    "kebab": "north indian",
    "tikka": "north indian"
  };

  try {
    const webScrapeCuisine = WEB_SCRAPER_CATEGORY_MAP[normalizedCuisine.toLowerCase()] || normalizedCuisine;

    logSourceStatus(`MCP returned 0 deals for "${normalizedLocation}". Falling back to Zomato web scraper (searching as "${webScrapeCuisine}")...`);
    // Pass the ORIGINAL dish name (e.g. "rasgulla") as dishImageQuery so the menu image
    // lookup searches for "rasgulla" inside each restaurant's menu, not "mithai"
    const webRes = await fetchDirectDeals({
      location: normalizedLocation,
      cuisine: webScrapeCuisine,
      dishImageQuery: normalizedCuisine, // e.g. "rasgulla" — used for image fetch only
      limit,
      locationData
    });
    const webDeals = webRes?.deals || [];
    console.log(`[fetchMcpDeals] Web scraper returned source=${webRes?.source}, deals=${webDeals.length}, diagMode=${webRes?.diagnostics?.mode}`);

    if (webDeals.length) {
      logSourceStatus(`Web scraper found ${webDeals.length} live deals for "${normalizedLocation}".`);

      // If we searched using a category (e.g. "mithai" for "halwa"), restore the original
      // user's query as dishName so the UI shows "halwa" not "mithai"
      const originalDish = normalizedCuisine;
      const dealsWithCorrectDish = webScrapeCuisine !== originalDish
        ? webDeals.map(d => ({ ...d, dishName: originalDish }))
        : webDeals;

      return {
        source: "zomato-web",
        deals: dealsWithCorrectDish,
        diagnostics: {
          mode: "web-scrape",
          location: normalizedLocation,
          cuisine: normalizedCuisine,
          message: "Fetched live deals directly from Zomato web since MCP couldn't access this location."
        }
      };
    }
  } catch (webErr) {
    console.error("[fetchMcpDeals] Web scraper fallback failed:", webErr.message);
  }

  // No fallbacks — only return verified live deals
  logSourceStatus(`No live deals found for "${normalizedCuisine}" in "${normalizedLocation}". No fallback data will be shown.`);
  return {
    source: "unavailable",
    deals: [],
    diagnostics: {
      mode: "empty",
      location: normalizedLocation,
      cuisine: normalizedCuisine,
      message: `No verified live deals found for "${normalizedCuisine || "food"}" in "${normalizedLocation || "your location"}". Please check that the Zomato MCP server is running and try again.`
    }
  };
};

export { fetchMcpDeals as fetchZomatoDeals };
