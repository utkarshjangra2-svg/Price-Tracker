import fs from 'fs';

const targetFile = 'c:/Users/dell/Downloads/Price Optimizer (2) (1)/Price Optimizer (6)/Price Optimizer/backend/services/zomatoService.js';

// --- Read original clean file ---
let content = fs.readFileSync(targetFile, 'utf8');
console.log('Clean file loaded, length:', content.length, 'lines:', content.split('\n').length);

// ── PATCH 1: Add imports for new dependencies ──────────────────────────────
const oldImports = `import axios from "axios";
import { extractMcpSource, fetchDirectDeals, normalizeMcpDeals } from "./zomatoSources.js";
import { callZomatoMcpTool } from "./zomatoOfficialMcp.js";
import { callUserZomatoTool } from "./zomatoUserSessionService.js";
import { resolveDishQuery } from "./searchIntent.js";
import { fetchDealsFromMongo } from "./databaseDeals.js";
import { buildSmartFallbackDeals } from "./fallbackDeals.js";`;

const newImports = `import axios from "axios";
import { extractMcpSource, fetchDirectDeals, normalizeMcpDeals, getImageForCuisine } from "./zomatoSources.js";
import { callZomatoMcpTool } from "./zomatoOfficialMcp.js";
import { callUserZomatoTool } from "./zomatoUserSessionService.js";
import { resolveDishQuery, scoreDishRelevance } from "./searchIntent.js";
import { fetchDealsFromMongo } from "./databaseDeals.js";
import { buildSmartFallbackDeals } from "./fallbackDeals.js";
import { getCitySlugFromText } from "../utils/getCitySlug.js";`;

content = content.replace(oldImports, newImports);
console.log('Patch 1 (imports):', content.includes('getCitySlugFromText') ? 'OK' : 'FAILED');

// ── PATCH 2: Add location verifier + city slug helpers after imports block ──
const afterImports = `\nlet mcpRetryAfter = 0;`;
const locationHelpers = `
const NCR_DELIVERY_CITIES = new Set(["faridabad", "gurgaon", "noida", "ghaziabad"]);
const getZomatoUrlCitySegment = (city = "") => (NCR_DELIVERY_CITIES.has(city) ? "ncr" : city || "ncr");

const verifyRestaurantForLocation = (restaurant = {}, requestedLocation = "") => {
  if (!requestedLocation || requestedLocation.trim().length < 3) return true;
  const requestedCitySlug = getCitySlugFromText(requestedLocation);
  const haystack = [
    restaurant.location || "", restaurant.city || "", restaurant.address || "",
    restaurant.area || "", restaurant.locality || "", restaurant.orderUrl || "",
    restaurant.restaurantUrl || "", restaurant.slug || ""
  ].join(" ").toLowerCase();
  const restaurantCitySlug = getCitySlugFromText(haystack);
  if (requestedCitySlug && restaurantCitySlug) {
    return requestedCitySlug === restaurantCitySlug;
  }
  const requestedTokens = requestedLocation.toLowerCase().replace(/[^a-z0-9\\s,]/g, " ").split(/[,\\s]+/).filter(t => t.length >= 3);
  return requestedTokens.some(token => haystack.includes(token));
};

let mcpRetryAfter = 0;`;

content = content.replace(afterImports, locationHelpers);
console.log('Patch 2 (location verifier):', content.includes('verifyRestaurantForLocation') ? 'OK' : 'FAILED');

// ── PATCH 3: Replace the tryFetchFromMcp Zomato branch with rich deal mapping ──
// Replace from "const tryFetchFromMcp" through "throw new Error(`Unsupported MCP provider:"
const oldTryFetch = `const tryFetchFromMcp = async ({ location, cuisine, limit, provider = "zomato", locationData = null, user = {} }) => {
  const callTool = getZomatoToolCaller(user);

  if (provider === "zomato" || provider === "zomato-mcp") {
    const keyword = cuisine || location || "food";
    let bestAddressId = "";

    // Try to get saved address for user-specific delivery
    try {
      const addressRes = await callTool("get_saved_addresses_for_user", {});
      if (addressRes?.success && addressRes?.result?.length) {
        const rawText = addressRes.result[0]?.text || "";
        const jsonMatch = rawText.match(/\\{[\\s\\S]+?\\}(?=\\s*\\{|\\s*$)/);
        const authData = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
        const addresses = authData?.addresses || authData?.data?.addresses || [];
        if (addresses.length) {
          const matched = findMatchingSavedAddress(addresses, location, locationData);
          if (matched) {
            // Only use address_id if it's an actual location match
            bestAddressId = String(matched.address_id || matched.id || "");
            console.log(\`[MCP] Location "\${location}" matched saved address: \${matched.address_id || matched.id}\`);
          } else {
            // No match — do NOT fall back to first address (would give wrong city results)
            // We'll embed the location in the keyword instead
            console.log(\`[MCP] Location "\${location}" not in saved addresses, using keyword-location search\`);
          }
        }
      }
    } catch (addrErr) {
      console.log("[MCP] Address fetch skipped:", addrErr.message);
    }

    // Build keyword: always include location when not using address_id (so Zomato searches the right city)
    const keywordWithLocation = bestAddressId
      ? keyword                              // address_id handles location context
      : \`\${cuisine || ""} \${location || "Delhi"}\`.trim().replace(/\\s+/g, " ");

    const searchArgs = bestAddressId
      ? { keyword: cuisine || location || "food", address_id: bestAddressId }
      : { keyword: keywordWithLocation };    // let Zomato resolve location from keyword text

    console.log(\`[Native MCP] Searching: keyword="\${keyword}"\`, bestAddressId ? \`address_id=\${bestAddressId}\` : \`location=\${location}\`);

    const searchRes = await callTool("get_restaurants_for_keyword", searchArgs);

    if (!searchRes?.success || !searchRes?.result?.length) {
      throw new Error("MCP get_restaurants_for_keyword returned no results");
    }

    let parsedData = {};
    try {
      const rawSearch = searchRes.result[0]?.text || "";
      const jsonMatch2 = rawSearch.match(/\\{[\\s\\S]+?\\}(?=\\s*\\{|\\s*$)/);
      parsedData = JSON.parse(jsonMatch2 ? jsonMatch2[0] : rawSearch);
    } catch (parseErr) {
      throw new Error(\`MCP search parse error: \${parseErr.message}\`);
    }

    const rawResults = parsedData?.results || [];
    console.log(\`[Native MCP] Got \${rawResults.length} restaurants for "\${keyword}"\`);

    // Use the user-requested location label for display (not the raw MCP address)
    const displayLocation = location || "Nearby";

    const deals = [];
    for (const r of rawResults) {
      const items = r.items?.length ? r.items : [{ name: cuisine || r.name || "Special", price: r.min_price || 200 }];
      for (const item of items) {
        const p = Number(item.price || item.discounted_price || 200);
        const original = item.discounted_price ? Math.round(p / 0.85) : Math.round(p * 1.2);
        const nativeLink = r.url || "";
        const isSearchLink = /\\/search\\?query=/.test(nativeLink);

        deals.push({
          name: r.name,
          restaurant: r.name,
          res_id: r.res_id,
          dishName: item.name || cuisine || "Dish",
          catalogueId: item.catalogue_id || "",
          cuisine: cuisine || "General",
          location: displayLocation,
          basePrice: original,
          price: p,
          discount: Math.round(((original - p) / original) * 100) || 0,
          rating: Number(r.rating) || 4.0,
          eta: r.eta || "30 mins",
          imageUrl: item.image_link || r.res_image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
          orderUrl: !isSearchLink ? nativeLink : "",
          isLive: true,
          isOrderableNow: !isSearchLink && (r.serviceability_status === "serviceable" || !r.serviceability_status)
        });

        if (deals.length >= limit) break;
      }
      if (deals.length >= limit) break;
    }

    if (!deals.length) {
      throw new Error("MCP returned restaurants but no menu items could be mapped");
    }

    return { deals, upstreamSource: "zomato-native-app", diagnostics: null };
  }

  throw new Error(\`Unsupported MCP provider: \${provider}\`);
};`;

const newTryFetch = `const tryFetchFromMcp = async ({ location, cuisine, limit, provider = "zomato", locationData = null, user = {} }) => {
  const callTool = getZomatoToolCaller(user);

  if (provider === "zomato" || provider === "zomato-mcp") {
    const keyword = cuisine || location || "food";
    let bestAddressId = "";
    let fallbackAddressId = "";

    try {
      const addressRes = await callTool("get_saved_addresses_for_user", {});
      if (addressRes?.success && addressRes?.result?.length) {
        const rawText = addressRes.result[0]?.text || "";
        const jsonMatch = rawText.match(/\\{[\\s\\S]+?\\}(?=\\s*\\{|\\s*$)/);
        const authData = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
        const addresses = authData?.addresses || authData?.data?.addresses || [];
        if (addresses.length) {
          fallbackAddressId = String(addresses[0].address_id || addresses[0].id || "");
          const matched = findMatchingSavedAddress(addresses, location, locationData);
          if (matched) {
            bestAddressId = String(matched.address_id || matched.id || "");
            console.log(\`[MCP] Location "\${location}" matched saved address: \${bestAddressId}\`);
          } else {
            console.log(\`[MCP] Location "\${location}" not in saved addresses — using keyword+city search with fallback address\`);
          }
        }
      }
    } catch (addrErr) {
      console.log("[MCP] Address fetch skipped:", addrErr.message);
    }

    // Build search: prefer matched address; if no match, try keyword+city with any available address
    let searchArgs;
    if (bestAddressId) {
      searchArgs = { keyword: cuisine || location || "food", address_id: bestAddressId };
      console.log(\`[Native MCP] Searching: keyword="\${cuisine || location || "food"}" address_id=\${bestAddressId} (matched)\`);
    } else if (fallbackAddressId) {
      const keywordWithCity = \`\${cuisine || "food"} \${location || ""}\`.trim().replace(/\\s+/g, " ");
      searchArgs = { keyword: keywordWithCity, address_id: fallbackAddressId };
      console.log(\`[Native MCP] Cross-city search: keyword="\${keywordWithCity}" address_id=\${fallbackAddressId} (fallback)\`);
    } else {
      const keywordWithCity = \`\${cuisine || "food"} \${location || ""}\`.trim().replace(/\\s+/g, " ");
      searchArgs = { keyword: keywordWithCity };
      console.log(\`[Native MCP] No address available, searching: keyword="\${keywordWithCity}"\`);
    }

    const searchRes = await callTool("get_restaurants_for_keyword", searchArgs);

    if (!searchRes?.success || !searchRes?.result?.length) {
      throw new Error("MCP get_restaurants_for_keyword returned no results");
    }

    let parsedData = {};
    try {
      const rawSearch = searchRes.result[0]?.text || "";
      try { parsedData = JSON.parse(rawSearch); } catch {
        const jsonMatch2 = rawSearch.match(/\\{[\\s\\S]+?\\}(?=\\s*\\{|\\s*$)/);
        if (jsonMatch2) parsedData = JSON.parse(jsonMatch2[0]);
      }
    } catch (parseErr) {
      throw new Error(\`MCP search parse error: \${parseErr.message}\`);
    }

    const rawResults = parsedData?.results || [];
    console.log(\`[Native MCP] Got \${rawResults.length} restaurants for "\${keyword}"\`);

    const displayLocation = location || "Nearby";
    const citySlug = getCitySlugFromText(location) || "ncr";

    const deals = [];
    for (const r of rawResults) {
      const items = r.items?.length ? r.items : [{ name: cuisine || r.name || "Special", price: r.min_price || 200, isRestaurantOnly: true }];
      for (const item of items) {
        const p = Number(item.price || item.discounted_price || 200);
        const original = item.discounted_price ? Math.round(p / 0.85) : Math.round(p * 1.2);

        // Build best Zomato URL from slug (most reliable for direct restaurant links)
        let restaurantUrl = "";
        let finalOrderUrl = "";

        const candidateUrls = [r.page_url, r.permalink, r.web_url, r.url, r.order_url]
          .filter(Boolean)
          .map(u => u.startsWith("http") ? u : \`https://www.zomato.com\${u.startsWith("/") ? "" : "/"}\${u}\`);

        const isSpecificRestaurantUrl = (u) => u &&
          u.includes("zomato.com") &&
          !/\\/restaurants[?/]/.test(u) &&
          !/[?&](category|context|query)=/.test(u) &&
          !/[?&]rid=/.test(u) &&
          !/\\/order-food-online/.test(u) &&
          !/\\/delivery(?:-[^/?#]+)?(?:\\/|[?#]|$)/.test(u) &&
          u.replace(/^https?:\\/\\/[^/]+/, "").replace(/^\\//, "").split("/").filter(Boolean).length >= 2;

        const directUrl = candidateUrls.find(isSpecificRestaurantUrl);

        if (directUrl) {
          restaurantUrl = directUrl.replace(/\\/order(?:\\/.*)?$/, "").replace(/\\/$/, "");
          finalOrderUrl = /\\/order(?:\\/|$)/i.test(directUrl) ? directUrl : (\`\${restaurantUrl}/order\`);
        } else if (r.slug) {
          restaurantUrl = \`https://www.zomato.com/\${getZomatoUrlCitySegment(citySlug)}/\${r.slug}\`;
          finalOrderUrl = \`\${restaurantUrl}/order\`;
        }

        const dishImg = getImageForCuisine(cuisine || "");
        const restaurantAddress = [r.address, r.locality, r.area, r.city].filter(Boolean).join(", ");

        deals.push({
          name: item.name || r.name,
          restaurant: r.name,
          res_id: String(r.res_id || ""),
          restaurantId: String(r.res_id || ""),
          slug: r.slug || "",
          dishName: item.name || cuisine || "Dish",
          catalogueId: item.catalogue_id || "",
          restaurantUrl,
          cuisine: cuisine || "General",
          location: restaurantAddress || displayLocation,
          city: r.city || "",
          address: restaurantAddress || "",
          basePrice: original,
          price: p,
          discount: Math.round(((original - p) / original) * 100) || 0,
          rating: Number(r.rating) || 4.0,
          eta: r.eta || "30 mins",
          imageUrl: item.image_link || r.res_image || dishImg,
          cuisineImageUrl: dishImg,
          orderUrl: finalOrderUrl,
          provider,
          source: "zomato-native-app",
          platform: "Zomato",
          isLive: true,
          verified: true,
          isOrderableNow: Boolean(finalOrderUrl) && (r.serviceability_status === "serviceable" || !r.serviceability_status)
        });

        if (deals.length >= limit) break;
      }
      if (deals.length >= limit) break;
    }

    // Soft location filter: keep verified deals if available, else keep all as unverified
    let finalDeals = deals;
    if (location && location.trim().length >= 3) {
      const verified = deals.filter(d => verifyRestaurantForLocation(d, location));
      if (verified.length > 0) {
        finalDeals = verified;
      } else {
        console.log(\`[MCP] No location-verified deals for "\${location}" — keeping \${deals.length} unverified (MCP account city mismatch)\`);
        finalDeals = deals.map(d => ({ ...d, verified: false }));
      }
    }

    if (!finalDeals.length) {
      throw new Error("MCP returned restaurants but no menu items could be mapped");
    }

    return { deals: finalDeals, upstreamSource: "zomato-native-app", diagnostics: null };
  }

  throw new Error(\`Unsupported MCP provider: \${provider}\`);
};`;

if (!content.includes('const tryFetchFromMcp')) {
  console.error('Patch 3: tryFetchFromMcp not found!');
} else {
  content = content.replace(oldTryFetch, newTryFetch);
  console.log('Patch 3 (rich MCP mapping + soft location filter):', content.includes('isSpecificRestaurantUrl') ? 'OK' : 'FAILED');
}

// ── PATCH 4: Fix fetchMcpDeals to use web scraper fallback properly ──
const oldFetchMcp = `  // Removed smart fallback - only MCP now

  // Slice to the total limit
  const finalDeals = allDeals.slice(0, limit);

  if (finalDeals.length) {
    return {
      source: combinedSource || "multiple",
      deals: finalDeals,
      diagnostics
    };
  }

  return {
    source: combinedSource || "mcp",
    deals: [],
    diagnostics: {
      mode: "empty",
      location: normalizedLocation,
      cuisine: normalizedCuisine,
      message: "No live MCP deals were available for the requested query."
    }
  };
};`;

const newFetchMcp = `  // Slice to the total limit (prefer verified deals, else use all)
  const validatedDeals = allDeals.filter(d => verifyRestaurantForLocation(d, normalizedLocation));
  const finalDeals = (validatedDeals.length > 0 ? validatedDeals : allDeals).slice(0, limit);

  if (finalDeals.length) {
    return {
      source: combinedSource || "multiple",
      deals: finalDeals,
      diagnostics
    };
  }

  // Fallback to web scraper for cities the MCP account doesn't cover
  console.log(\`[fetchMcpDeals] MCP returned 0 usable deals for "\${normalizedCuisine}" in "\${normalizedLocation}" — trying web scraper\`);
  const WEB_SCRAPER_CATEGORY_MAP = {
    "ladoo": "mithai", "rasgulla": "mithai", "gulab jamun": "mithai",
    "jalebi": "mithai", "barfi": "mithai", "kaju katli": "mithai",
    "halwa": "mithai", "pedha": "mithai", "samosa": "street food",
    "kachori": "street food", "panipuri": "street food", "golgappa": "street food",
    "vadapav": "street food", "vada pav": "street food", "pav bhaji": "street food", "chaat": "street food",
  };
  const broaderCategory = WEB_SCRAPER_CATEGORY_MAP[normalizedCuisine.toLowerCase()] || "";
  try {
    const webResult = await fetchDirectDeals({
      location: normalizedLocation,
      cuisine: broaderCategory || normalizedCuisine,
      limit
    });
    const webDeals = webResult?.deals || [];
    if (webDeals.length) {
      return { source: webResult.source || "web-scraper", deals: webDeals, diagnostics: webResult.diagnostics || null };
    }
  } catch (webErr) {
    console.log("[fetchMcpDeals] Web scraper also failed:", webErr.message);
  }

  return {
    source: combinedSource || "unavailable",
    deals: [],
    diagnostics: {
      mode: "empty",
      location: normalizedLocation,
      cuisine: normalizedCuisine,
      message: "No live deals found via MCP or web scraper for this query."
    }
  };
};`;

content = content.replace(oldFetchMcp, newFetchMcp);
console.log('Patch 4 (web scraper fallback):', content.includes('web scraper for cities') ? 'OK' : 'FAILED');

fs.writeFileSync(targetFile, content);
console.log('All patches applied. Final length:', content.length, 'lines:', content.split('\n').length);
