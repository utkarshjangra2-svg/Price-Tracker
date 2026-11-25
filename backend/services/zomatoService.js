import { fetchDirectDeals, getImageForCuisine, fetchRestaurantMenuFromWeb } from "./zomatoSources.js";
import { callZomatoMcpTool } from "./zomatoOfficialMcp.js";
import { callUserZomatoTool } from "./zomatoUserSessionService.js";
import { searchSwiggyFood, searchSwiggyFoodUser, fetchSwiggyRestaurantMenu } from "./swiggyFoodMcpService.js";
import { resolveDishQuery, scoreDishRelevance } from "./searchIntent.js";
import { buildSwiggyFallbackDeals } from "./swiggyWebFallback.js";
import { getCitySlugFromText } from "../utils/getCitySlug.js";

// ── Broad Cuisine lists & Specific Dish helpers ──────────────────────────────
const BROAD_CUISINES = new Set([
  "north indian", "south indian", "chinese", "italian", "mughlai",
  "fast food", "beverages", "desserts", "continental", "thai",
  "mexican", "bakery", "street food", "healthy", "cafe", "general", "mithai", "food"
]);

const isSpecificDishSearch = (query = "") => {
  const q = String(query).toLowerCase().trim().replace(/\s+/g, " ");
  if (!q || q === "food" || q === "restaurant" || q === "restaurants") return false;
  if (CATEGORY_QUERIES.has(q)) return false;
  return !BROAD_CUISINES.has(q);
};

const getQueryTokens = (query = "") => {
  return String(query)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1);
};

const CATEGORY_QUERIES = new Set([
  "bakery cake pastry bread",
  "sweets mithai ladoo gulab jamun rasgulla jalebi barfi",
  "burger pizza fries wrap sandwich fast food",
  "biryani pulao fried rice",
  "chinese noodles manchurian momos",
  "dosa idli vada uttapam south indian",
  "thali meal combo platter",
  "chaat samosa kachori pav bhaji golgappa",
  "ice cream brownie dessert waffle",
  "ice cream brownie desserts waffle"
]);

const isCategoryQuery = (query = "") => {
  const q = String(query).toLowerCase().trim().replace(/\s+/g, " ");
  return CATEGORY_QUERIES.has(q);
};

const CATEGORY_TO_CUISINE_MAP = {
  "bakery cake pastry bread": "bakery",
  "sweets mithai ladoo gulab jamun rasgulla jalebi barfi": "mithai",
  "burger pizza fries wrap sandwich fast food": "fast food",
  "biryani pulao fried rice": "biryani",
  "chinese noodles manchurian momos": "chinese",
  "dosa idli vada uttapam south indian": "south indian",
  "thali meal combo platter": "thali",
  "chaat samosa kachori pav bhaji golgappa": "street food",
  "ice cream brownie dessert waffle": "desserts",
  "ice cream brownie desserts waffle": "desserts"
};

const isItemMatchingQuery = (itemName = "", itemDesc = "", tokens = [], matchAny = false) => {
  if (!tokens.length) return true;
  const nameLower = itemName.toLowerCase();
  const descLower = String(itemDesc || "").toLowerCase();
  if (matchAny) {
    return tokens.some(token => nameLower.includes(token) || descLower.includes(token));
  }
  return tokens.every(token => nameLower.includes(token) || descLower.includes(token));
};

// ── City/URL helpers ─────────────────────────────────────────────────────────
const NCR_DELIVERY_CITIES = new Set(["faridabad", "gurgaon", "noida", "ghaziabad"]);
const getZomatoUrlCitySegment = (city = "") => (NCR_DELIVERY_CITIES.has(city) ? "ncr" : city || "ncr");

/**
 * Verify a restaurant deal belongs to the requested city.
 * Uses slug-based city matching; falls back to token matching.
 * Returns true when no city can be resolved (prefer showing results over hiding them).
 */
const verifyRestaurantForLocation = (restaurant = {}, requestedLocation = "") => {
  if (!requestedLocation || requestedLocation.trim().length < 3) return true;
  const requestedCitySlug = getCitySlugFromText(requestedLocation);
  const haystack = [
    restaurant.location || "", restaurant.city || "", restaurant.address || "",
    restaurant.area || "", restaurant.locality || "",
    restaurant.orderUrl || "", restaurant.restaurantUrl || "", restaurant.slug || ""
  ].join(" ").toLowerCase();
  const restaurantCitySlug = getCitySlugFromText(haystack);
  if (requestedCitySlug && restaurantCitySlug) {
    return requestedCitySlug === restaurantCitySlug;
  }
  // Token fallback
  const requestedTokens = requestedLocation.toLowerCase()
    .replace(/[^a-z0-9\s,]/g, " ").split(/[,\s]+/).filter(t => t.length >= 3);
  return requestedTokens.some(token => haystack.includes(token));
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
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  if (authHeaderName && authHeaderValue) headers[authHeaderName] = authHeaderValue;
  return headers;
};

const isMcpEnabled = (provider = "zomato") => {
  const config = getMcpConfig(provider);
  return config.enabled && Date.now() >= mcpRetryAfter;
};

const getErrorLabel = (error) => error?.message || error?.code || "Unknown MCP error";

const logSourceStatus = (message) => {
  if (lastSourceLog === message) return;
  lastSourceLog = message;
  console.log(message);
};

const buildRecentCacheKey = ({ location = "", cuisine = "" }) =>
  `${location.trim().toLowerCase()}|${cuisine.trim().toLowerCase()}`;

const normalizeLocationText = (value = "") =>
  value.toString().toLowerCase().replace(/[^a-z0-9\s,]/g, " ").replace(/\s+/g, " ").trim();

const getSignificantLocationTokens = (value = "") =>
  normalizeLocationText(value).split(/[,\s]+/).filter((token) => token.length >= 4);

const findMatchingSavedAddress = (addresses = [], requestedLocation = "", locationData = null) => {
  const normalizedLocation = normalizeLocationText(requestedLocation);

  if (locationData?.latitude && locationData?.longitude) {
    const targetLat = locationData.latitude;
    const targetLng = locationData.longitude;
    let closestAddress = null;
    let minDistance = Infinity;

    for (const address of addresses) {
      const addrLat = address.latitude || address.lat;
      const addrLng = address.longitude || address.lng || address.lon;
      if (addrLat && addrLng) {
        const distance = Math.sqrt(Math.pow(targetLat - addrLat, 2) + Math.pow(targetLng - addrLng, 2));
        if (distance < minDistance) { minDistance = distance; closestAddress = address; }
      }
    }
    if (closestAddress && minDistance < 0.1) return closestAddress;
  }

  if (!normalizedLocation || normalizedLocation === "unknown" || normalizedLocation === "detecting") {
    return addresses[0] || null;
  }

  const requestedTokens = getSignificantLocationTokens(normalizedLocation);
  return (
    addresses.find((address) => {
      const addressText = normalizeLocationText(JSON.stringify(address));
      if (!addressText) return false;
      if (addressText.includes(normalizedLocation)) return true;
      if (!requestedTokens.length) return false;
      const matchedTokens = requestedTokens.filter((token) => addressText.includes(token));
      return matchedTokens.length === requestedTokens.length && matchedTokens.length >= Math.min(2, requestedTokens.length);
    }) || null   // Do NOT fall back to addresses[0] — that gives the wrong city
  );
};

const saveRecentLiveDeals = ({ location = "", cuisine = "", deals = [], source = "" }) => {
  if (!Array.isArray(deals) || !deals.length) return;
  recentLiveDealsCache.set(buildRecentCacheKey({ location, cuisine }), { deals, source, savedAt: Date.now() });
};

const readRecentLiveDeals = ({ location = "", cuisine = "" }) => {
  const keysToTry = [
    buildRecentCacheKey({ location, cuisine }),
    buildRecentCacheKey({ location, cuisine: "" })
  ];
  if (!location.trim()) keysToTry.push(buildRecentCacheKey({ location: "", cuisine: "" }));

  for (const key of keysToTry) {
    const entry = recentLiveDealsCache.get(key);
    if (!entry) continue;
    if (Date.now() - entry.savedAt > RECENT_LIVE_CACHE_TTL_MS) { recentLiveDealsCache.delete(key); continue; }
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

const isSwiggyProvider = (provider = "") => normalizeProvider(provider).includes("swiggy");

const buildSwiggySearchUrl = ({ cuisine = "", restaurant = "" } = {}) => {
  const query = [restaurant, cuisine].filter(Boolean).join(" ").trim() || "food";
  return `https://www.swiggy.com/search?query=${encodeURIComponent(query)}`;
};

const normalizeSwiggyOrderUrl = (url = "", fallback = {}) => {
  const value = String(url || "").trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `https://www.swiggy.com${value}`;
  return buildSwiggySearchUrl(fallback);
};

const normalizeSwiggyImageUrl = (value = "") => {
  const image = String(value || "").trim();
  if (!image) return "";
  if (/^https?:\/\//i.test(image)) return image;
  return `https://media-assets.swiggy.com/swiggy/image/upload/${image}`;
};

const normalizeSwiggyFoodDeals = (items = [], { location = "", cuisine = "", limit = 8 } = {}) => {
  const imageFallback = getImageForCuisine(cuisine || "food");

  return items
    .map((item, index) => {
      const raw = item.raw || {};
      const restaurant = item.restaurant || raw.restaurant || raw.restaurantName || raw.name || `Swiggy Restaurant ${index + 1}`;
      const dishName = item.dishName || raw.dishName || raw.itemName || raw.name || cuisine || "Food";
      const price = Number(item.price || raw.price || raw.finalPrice || raw.final_price || raw.cost || 0);
      const basePrice = Number(raw.basePrice || raw.originalPrice || raw.mrp || 0) || Math.max(Math.round((price || 220) * 1.18), price || 220);
      const orderUrl = normalizeSwiggyOrderUrl(item.orderUrl || raw.orderUrl || raw.url || raw.deepLink || raw.deeplink, {
        cuisine: dishName || cuisine,
        restaurant
      });
      const imageUrl = normalizeSwiggyImageUrl(item.imageUrl || raw.imageUrl || raw.image || raw.cloudinaryImageId);

      return {
        name: restaurant,
        restaurant,
        res_id: String(item.id || raw.res_id || raw.restaurantId || raw.restaurant_id || ""),
        restaurantId: String(item.id || raw.res_id || raw.restaurantId || raw.restaurant_id || ""),
        dishName,
        cuisine: raw.cuisine || cuisine || "Food",
        location: [item.location || raw.location || raw.area || raw.locality || "", location].filter(Boolean).join(", ") || "Nearby",
        city: location,
        basePrice,
        price: price || basePrice,
        discount: Number(raw.discount || raw.discountPercentage || 0),
        rating: Number(item.rating || raw.rating || raw.avgRating || raw.avg_rating || 4),
        eta: item.eta || raw.eta || raw.deliveryTime || raw.delivery_time || "",
        offerText: item.offerText || raw.offerText || raw.offer || raw.coupon || "",
        imageUrl: imageUrl || imageFallback,
        cuisineImageUrl: imageFallback,
        orderUrl,
        provider: "swiggy",
        source: "swiggy-food-mcp",
        platform: "Swiggy",
        isLive: true,
        verified: true,
        isOrderableNow: Boolean(orderUrl)
      };
    })
    .filter((deal) => deal.restaurant)
    .slice(0, limit);
};

const tryFetchFromSwiggyFood = async ({ location, cuisine, limit, user = {} }) => {
  const query = cuisine || "food";
  const isSpecificDish = isSpecificDishSearch(query);
  const result = user?.id && user?.swiggy?.linked
    ? await searchSwiggyFoodUser({ userId: String(user.id), query, location, limit, isSpecificDish })
    : await searchSwiggyFood({ query, location, limit, isSpecificDish });

  if (!result?.connected) {
    throw new Error(result?.error || "Swiggy Food MCP is not connected");
  }

  if (result.source === "swiggy-web-fallback") {
    throw new Error("Swiggy has no saved address; triggering Zomato-based fallback");
  }

  let deals = [];
  const rawRestaurants = result.restaurants || [];

  if (isSpecificDishSearch(query) && rawRestaurants.length && result.addressId) {
    console.log(`[Swiggy] Query "${query}" is a specific dish. Fetching restaurant menus in parallel...`);
    const addressId = result.addressId;
    const userId = user?.id && user?.swiggy?.linked ? String(user.id) : null;

    // Fetch menu for top 10 restaurants to increase match probability
    const candidateRestaurants = rawRestaurants.slice(0, 10);
    const menuPromises = candidateRestaurants.map(r =>
      fetchSwiggyRestaurantMenu({ userId, restaurantId: r.id, addressId })
        .then(items => ({ restaurant: r, items }))
        .catch(() => ({ restaurant: r, items: [] }))
    );

    const resolvedMenus = await Promise.all(menuPromises);
    const queryTokens = getQueryTokens(query);
    const isCategory = isCategoryQuery(query);

    for (const { restaurant: r, items } of resolvedMenus) {
      const matchingItems = items.filter(item => isItemMatchingQuery(item.name, item.description, queryTokens, isCategory));

      if (matchingItems.length > 0) {
        for (const item of matchingItems) {
          const basePrice = item.price || 150;
          const discount = 14;
          const finalPrice = Math.round(basePrice * (1 - discount / 100));

          deals.push({
            name: item.name,
            restaurant: r.restaurant || "Swiggy Restaurant",
            res_id: String(r.id || ""),
            restaurantId: String(r.id || ""),
            dishName: item.name,
            location: [r.location || "", location].filter(Boolean).join(", ") || "Nearby",
            city: location,
            basePrice,
            price: finalPrice,
            couponAdjustedPrice: finalPrice,
            discount,
            rating: Number(item.rating || r.rating || 4.0),
            eta: r.eta || "30 mins",
            imageUrl: item.imageUrl || r.imageUrl || "",
            cuisineImageUrl: r.imageUrl || "",
            orderUrl: r.orderUrl,
            provider: "swiggy",
            source: "swiggy-food-mcp",
            platform: "Swiggy",
            isLive: true,
            verified: true,
            isOrderableNow: Boolean(r.orderUrl)
          });
        }
      } else {
        console.log(`[Swiggy] Restaurant "${r.restaurant}" skipped: no menu items match "${query}"`);
      }
    }
  } else {
    deals = normalizeSwiggyFoodDeals(rawRestaurants, { location, cuisine: query, limit });
  }

  if (!deals.length) {
    // Swiggy MCP was reachable but found no matching items for this dish.
    // Return empty with noMatch flag so the caller does NOT trigger the fake fallback.
    return {
      deals: [],
      noMatch: true,
      upstreamSource: result.source || "swiggy-food-mcp",
      diagnostics: {
        mode: "live",
        provider: "swiggy",
        tool: result.tool || "",
        authenticated: Boolean(result.authenticated)
      }
    };
  }

  return {
    deals,
    upstreamSource: result.source || "swiggy-food-mcp",
    diagnostics: {
      mode: "live",
      provider: "swiggy",
      tool: result.tool || "",
      authenticated: Boolean(result.authenticated)
    }
  };
};

/**
 * Determine if a URL is a direct Zomato restaurant page (not a listing/search page).
 * Valid pattern: https://www.zomato.com/{city}/{restaurant-slug}[/order]
 */
const isSpecificRestaurantUrl = (u) => {
  if (!u || !u.includes("zomato.com")) return false;
  if (/\/restaurants[?/]/.test(u) || /\/restaurants$/.test(u)) return false;
  if (/[?&](category|context|query)=/.test(u)) return false;
  if (/[?&]rid=/.test(u)) return false;
  if (/\/order-food-online/.test(u)) return false;
  if (/\/delivery(?:-[^/?#]+)?(?:\/|[?#]|$)/.test(u)) return false;
  if (/\/search[?]/.test(u)) return false;
  const path = u.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "");
  return path.split("/").filter(Boolean).length >= 2;
};

const tryFetchFromMcp = async ({ location, cuisine, limit, provider = "zomato", locationData = null, user = {} }) => {
  if (isSwiggyProvider(provider)) {
    return tryFetchFromSwiggyFood({ location, cuisine, limit, user });
  }

  const callTool = getZomatoToolCaller(user);

  if (provider === "zomato" || provider === "zomato-mcp") {
    const keyword = cuisine || location || "food";
    let bestAddressId = "";
    let fallbackAddressId = "";

    try {
      const addressRes = await callTool("get_saved_addresses_for_user", {});
      if (addressRes?.success && addressRes?.result?.length) {
        const rawText = addressRes.result[0]?.text || "";
        let authData = {};
        try { authData = JSON.parse(rawText); } catch {
          const jsonMatch = rawText.match(/\{[\s\S]+?\}(?=\s*\{|\s*$)/);
          if (jsonMatch) authData = JSON.parse(jsonMatch[0]);
        }
        const addresses = authData?.addresses || authData?.data?.addresses || [];
        if (addresses.length) {
          fallbackAddressId = String(addresses[0].address_id || addresses[0].id || "");
          const matched = findMatchingSavedAddress(addresses, location, locationData);
          if (matched) {
            bestAddressId = String(matched.address_id || matched.id || "");
            console.log(`[MCP] Location "${location}" matched saved address: ${bestAddressId}`);
          } else {
            console.log(`[MCP] Location "${location}" not in saved addresses — cross-city search with fallback address`);
          }
        }
      }
    } catch (addrErr) {
      console.log("[MCP] Address fetch skipped:", addrErr.message);
    }

    // Build search args — always include city in keyword when no address match, unless it's a specific dish
    let searchArgs;
    const isSpecificDish = isSpecificDishSearch(cuisine);

    if (bestAddressId) {
      searchArgs = { keyword: cuisine || location || "food", address_id: bestAddressId };
      console.log(`[Native MCP] Searching: keyword="${cuisine || "food"}" address_id=${bestAddressId} (matched)`);
    } else if (fallbackAddressId) {
      const keywordWithCity = isSpecificDish ? cuisine.trim() : `${cuisine || "food"} ${location || ""}`.trim().replace(/\s+/g, " ");
      searchArgs = { keyword: keywordWithCity, address_id: fallbackAddressId };
      console.log(`[Native MCP] Cross-city: keyword="${keywordWithCity}" address_id=${fallbackAddressId} (fallback)`);
    } else {
      const keywordWithCity = isSpecificDish ? cuisine.trim() : `${cuisine || "food"} ${location || ""}`.trim().replace(/\s+/g, " ");
      searchArgs = { keyword: keywordWithCity };
      console.log(`[Native MCP] No address available — keyword only: "${keywordWithCity}"`);
    }

    const searchRes = await callTool("get_restaurants_for_keyword", searchArgs);
    if (!searchRes?.success || !searchRes?.result?.length) {
      throw new Error("MCP get_restaurants_for_keyword returned no results");
    }

    let parsedData = {};
    try {
      const rawSearch = searchRes.result[0]?.text || "";
      console.log(`[MCP Parse] Raw length: ${rawSearch.length}, first 200: ${rawSearch.substring(0, 200)}`);
      try { parsedData = JSON.parse(rawSearch); } catch {
        let depth = 0, startIdx = -1, bestJson = null;
        for (let i = 0; i < rawSearch.length; i++) {
          if (rawSearch[i] === "{") { if (depth === 0) startIdx = i; depth++; }
          else if (rawSearch[i] === "}") {
            depth--;
            if (depth === 0 && startIdx >= 0) {
              const c = rawSearch.substring(startIdx, i + 1);
              if (!bestJson || c.length > bestJson.length) bestJson = c;
            }
          }
        }
        if (bestJson) parsedData = JSON.parse(bestJson);
        else throw new Error("No JSON found in MCP response");
      }
    } catch (parseErr) {
      throw new Error(`MCP search parse error: ${parseErr.message}`);
    }

    const rawResults = parsedData?.results || [];
    console.log(`[Native MCP] Got ${rawResults.length} restaurants for "${keyword}"`);

    const displayLocation = location || "Nearby";
    const citySlug = getCitySlugFromText(location) || "ncr";
    const dishImg = getImageForCuisine(cuisine || "");

    const deals = [];
    const queryTokens = getQueryTokens(cuisine);
    const isDishSearch = isSpecificDishSearch(cuisine);
    const isCategory = isCategoryQuery(cuisine);

    if (isDishSearch && rawResults.length) {
      console.log(`[Zomato] Query "${cuisine}" is a specific dish. Fetching restaurant menus in parallel...`);
      const candidateRestaurants = rawResults.slice(0, 10);
      const menuPromises = candidateRestaurants.map(async (r) => {
        if (r.items && r.items.length) {
          const matches = r.items.filter(item => isItemMatchingQuery(item.name, item.desc, queryTokens, isCategory));
          if (matches.length > 0) {
            return { restaurant: r, items: matches };
          }
        }

        const pageUrl = [r.page_url, r.permalink, r.web_url, r.url, r.order_url]
          .filter(Boolean)
          .map(u => u.startsWith("http") ? u : `https://www.zomato.com${u.startsWith("/") ? "" : "/"}${u}`)[0];

        if (pageUrl) {
          try {
            const fetchedItems = await fetchRestaurantMenuFromWeb(
              pageUrl,
              r.name,
              r.min_price || 200,
              [r.address, r.locality, r.area, r.city].filter(Boolean).join(", ")
            );
            const matches = fetchedItems.filter(item => isItemMatchingQuery(item.dishName || item.name, item.desc || item.description, queryTokens, isCategory));
            return { restaurant: r, items: matches };
          } catch (e) {
            console.log(`[Zomato] Error fetching web menu for ${r.name}:`, e.message);
          }
        }
        return { restaurant: r, items: [] };
      });

      const resolvedMenus = await Promise.all(menuPromises);

      for (const { restaurant: r, items } of resolvedMenus) {
        if (!items.length) {
          console.log(`[Zomato] Restaurant "${r.name}" skipped: no menu items match "${cuisine}"`);
          continue;
        }

        for (const item of items) {
          const p = Number(item.price || item.discounted_price || r.min_price || 200);
          const original = item.discounted_price ? Math.round(p / 0.85) : Math.round(p * 1.2);

          let restaurantUrl = "";
          let finalOrderUrl = "";
          const candidateUrls = [r.page_url, r.permalink, r.web_url, r.url, r.order_url]
            .filter(Boolean)
            .map(u => u.startsWith("http") ? u : `https://www.zomato.com${u.startsWith("/") ? "" : "/"}${u}`);
          const directUrl = candidateUrls.find(isSpecificRestaurantUrl);
          if (directUrl) {
            restaurantUrl = directUrl.replace(/\/order(?:\/.*)?$/, "").replace(/\/$/, "");
            finalOrderUrl = /\/order(?:\/|$)/i.test(directUrl) ? directUrl : `${restaurantUrl}/order`;
          } else if (r.slug) {
            restaurantUrl = `https://www.zomato.com/${getZomatoUrlCitySegment(citySlug)}/${r.slug}`;
            finalOrderUrl = `${restaurantUrl}/order`;
          }

          const restaurantAddress = [r.address, r.locality, r.area, r.city].filter(Boolean).join(", ");

          deals.push({
            name: item.dishName || item.name || r.name,
            restaurant: r.name,
            res_id: String(r.res_id || ""),
            restaurantId: String(r.res_id || ""),
            slug: r.slug || "",
            dishName: item.dishName || item.name || cuisine,
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
            imageUrl: item.imageUrl || item.item_image_url || r.res_image || dishImg,
            cuisineImageUrl: dishImg,
            orderUrl: finalOrderUrl,
            provider,
            source: "zomato-native-app",
            platform: "Zomato",
            isLive: true,
            verified: true,
            isOrderableNow: Boolean(finalOrderUrl) && (r.serviceability_status === "serviceable" || !r.serviceability_status)
          });
        }
      }
    } else {
      for (const r of rawResults) {
        const items = r.items?.length
          ? r.items
          : [{ name: cuisine || r.name || "Special", price: r.min_price || 200, isRestaurantOnly: true }];

        for (const item of items) {
          const p = Number(item.price || item.discounted_price || 200);
          const original = item.discounted_price ? Math.round(p / 0.85) : Math.round(p * 1.2);

          let restaurantUrl = "";
          let finalOrderUrl = "";

          const candidateUrls = [r.page_url, r.permalink, r.web_url, r.url, r.order_url]
            .filter(Boolean)
            .map(u => u.startsWith("http") ? u : `https://www.zomato.com${u.startsWith("/") ? "" : "/"}${u}`);

          const directUrl = candidateUrls.find(isSpecificRestaurantUrl);

          if (directUrl) {
            restaurantUrl = directUrl.replace(/\/order(?:\/.*)?$/, "").replace(/\/$/, "");
            finalOrderUrl = /\/order(?:\/|$)/i.test(directUrl) ? directUrl : `${restaurantUrl}/order`;
          } else if (r.slug) {
            restaurantUrl = `https://www.zomato.com/${getZomatoUrlCitySegment(citySlug)}/${r.slug}`;
            finalOrderUrl = `${restaurantUrl}/order`;
          }

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
    }

    if (!deals.length) {
      throw new Error("MCP returned restaurants but no menu items could be mapped");
    }

    // Soft location filter: keep verified if available, else pass all through as unverified
    let finalDeals = deals;
    if (location && location.trim().length >= 3) {
      const verified = deals.filter(d => verifyRestaurantForLocation(d, location));
      if (verified.length > 0) {
        finalDeals = verified;
        console.log(`[MCP] Location verified: ${verified.length}/${deals.length} deals match "${location}"`);
      } else {
        console.log(`[MCP] No location-verified deals for "${location}" — keeping ${deals.length} unverified (MCP account bound to different city)`);
        finalDeals = deals.map(d => ({ ...d, verified: false }));
      }
    }

    return { deals: finalDeals, upstreamSource: "zomato-native-app", diagnostics: null };
  }

  throw new Error(`Unsupported MCP provider: ${provider}`);
};

export const fetchMcpDeals = async ({ location = "", cuisine = "", limit = 8, providers = null, provider = "zomato", locationData = null, user = {}, baseDeals = null }) => {
  if (!Array.isArray(providers) || !providers.length) {
    providers = String(provider || "zomato").split(",");
  }
  const normalizedProviders = providers.map(p => normalizeProvider(p));
  const normalizedLocation = location.trim();

  let targetCuisine = cuisine.trim();
  const lowerCuisine = targetCuisine.toLowerCase().replace(/\s+/g, " ");
  if (CATEGORY_TO_CUISINE_MAP[lowerCuisine]) {
    targetCuisine = CATEGORY_TO_CUISINE_MAP[lowerCuisine];
  }
  const normalizedCuisine = resolveDishQuery(targetCuisine);
  const onlySwiggy = normalizedProviders.length > 0 && normalizedProviders.every(isSwiggyProvider);

  const allDeals = [];
  let combinedSource = "";
  let diagnostics = null;
  // Track whether Swiggy was reachable but found no dish matches — in that case we skip the fake fallback
  let swiggySearchedNoMatch = false;

  for (const provider of normalizedProviders) {
    if (isSwiggyProvider(provider) || isMcpEnabled(provider)) {
      try {
        console.log(`[fetchMcpDeals] Provider=${provider}, calling MCP for "${normalizedCuisine}" in "${normalizedLocation}"...`);
        const { deals: mcpDeals, noMatch, upstreamSource, diagnostics: diag } = await tryFetchFromMcp({
          location: normalizedLocation,
          cuisine: normalizedCuisine,
          limit: Math.ceil(limit / normalizedProviders.length),
          provider,
          locationData,
          user
        });

        if (noMatch && isSwiggyProvider(provider)) {
          // Swiggy MCP was reachable but dish simply has no matches — do NOT fake it
          swiggySearchedNoMatch = true;
          logSourceStatus(`Swiggy MCP searched for "${normalizedCuisine}" but found no matching items. Skipping fake fallback.`);
        } else if (mcpDeals.length) {
          allDeals.push(...mcpDeals);
          combinedSource += (combinedSource ? ", " : "") + (upstreamSource === "zomato-web" ? "mcp" : upstreamSource || `${provider}-mcp`);
          if (!diagnostics) diagnostics = diag;
          saveRecentLiveDeals({
            location: normalizedLocation,
            cuisine: normalizedCuisine,
            deals: mcpDeals,
            source: upstreamSource === "zomato-web" ? "mcp" : upstreamSource || `${provider}-mcp`
          });
          logSourceStatus(`MCP live source active: ${mcpDeals.length} deals from ${upstreamSource} for ${normalizedCuisine || "all cuisines"} in ${normalizedLocation || "default location"}.`);
        } else {
          logSourceStatus(diag?.code === "EACCES"
            ? "MCP is online, but outbound live fetch is blocked by the runtime environment (EACCES)."
            : "MCP server is reachable, but it returned 0 deals. Trying fallback next.");
        }
      } catch (error) {
        if (error?.code === "ECONNREFUSED") mcpRetryAfter = Date.now() + MCP_RETRY_COOLDOWN_MS;
        logSourceStatus(`MCP fetch failed for ${provider} (${getErrorLabel(error)}). Falling back to next available source.`);
      }
    } else if ((process.env.USE_ZOMATO_MCP === "true" || process.env.USE_SWIGGY_MCP === "true" || process.env.USE_MCP === "true") && mcpRetryAfter > Date.now()) {
      logSourceStatus(`MCP cooldown active for ${Math.ceil((mcpRetryAfter - Date.now()) / 1000)}s after connection failure.`);
    }
  }

  // Only use Swiggy fallback when Swiggy MCP was truly unreachable (connection/auth failure),
  // NOT when it searched and simply found no matching items for this dish.
  const hasSwiggy = normalizedProviders.some(isSwiggyProvider);
  const gotSwiggy = allDeals.some(d => d.provider === "swiggy" || d.platform?.toLowerCase().includes("swiggy"));

  if (hasSwiggy && !gotSwiggy && !swiggySearchedNoMatch) {
    console.log("[fetchMcpDeals] Swiggy MCP unreachable. Appending Swiggy fallback deals...");
    const zomatoDeals = baseDeals || allDeals.filter(d => d.provider === "zomato" || d.platform?.toLowerCase().includes("zomato"));
    const fallbackDeals = buildSwiggyFallbackDeals({
      location: normalizedLocation,
      cuisine: normalizedCuisine,
      limit: Math.ceil(limit / 2) || 8,
      baseDeals: zomatoDeals
    });

    if (fallbackDeals.length) {
      allDeals.push(...fallbackDeals);
      combinedSource += (combinedSource ? ", " : "") + "swiggy-web-fallback";
    }
  }

  // Prefer location-verified deals; if none pass, keep all (MCP may be account-bound to another city)
  const validatedDeals = allDeals.filter(d => verifyRestaurantForLocation(d, normalizedLocation));
  const candidateDeals = validatedDeals.length > 0 ? validatedDeals : allDeals;

  const zomatoDeals = candidateDeals.filter(d => d.platform === "Zomato");
  const swiggyDeals = candidateDeals.filter(d => d.platform === "Swiggy");

  const finalDeals = [
    ...zomatoDeals.slice(0, limit),
    ...swiggyDeals.slice(0, limit)
  ];

  if (finalDeals.length) {
    return { source: combinedSource || "multiple", deals: finalDeals, diagnostics };
  }


  // Web scraper fallback for other cities
  console.log(`[fetchMcpDeals] MCP returned 0 usable deals for "${normalizedCuisine}" in "${normalizedLocation}" — trying web scraper`);

  if (isSpecificDishSearch(normalizedCuisine)) {
    console.log(`[fetchMcpDeals] Skipping web scraper for specific dish "${normalizedCuisine}" to prevent fake deals.`);
    return {
      source: combinedSource || "unavailable",
      deals: [],
      diagnostics: {
        mode: "empty",
        location: normalizedLocation,
        cuisine: normalizedCuisine,
        message: "No live deals found via MCP. Web scraper fallback disabled for specific dishes to ensure accuracy."
      }
    };
  }

  const WEB_SCRAPER_CATEGORY_MAP = {
    "ladoo": "mithai", "rasgulla": "mithai", "gulab jamun": "mithai",
    "jalebi": "mithai", "barfi": "mithai", "kaju katli": "mithai",
    "halwa": "mithai", "pedha": "mithai",
    "samosa": "street food", "kachori": "street food", "panipuri": "street food",
    "golgappa": "street food", "vadapav": "street food", "vada pav": "street food",
    "pav bhaji": "street food", "chaat": "street food",
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
      console.log(`[fetchMcpDeals] Web scraper returned ${webDeals.length} deals for "${normalizedCuisine}" in "${normalizedLocation}"`);
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
};

export { fetchMcpDeals as fetchZomatoDeals };
