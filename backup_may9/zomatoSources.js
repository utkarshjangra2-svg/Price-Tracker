import axios from "axios";
import * as cheerio from "cheerio";
import { getDishMatchScore, resolveDishQuery, tokenizeSearchText, getRelatedCuisines } from "./searchIntent.js";
import { getCitySlugFromText } from "../utils/getCitySlug.js";

const cuisineImageMap = {
  barfi: "https://images.unsplash.com/photo-1723832359083-4ed7e071ffba?auto=format&fit=crop&w=1200&q=80",
  burfi: "https://images.unsplash.com/photo-1723832359083-4ed7e071ffba?auto=format&fit=crop&w=1200&q=80",
  katli: "https://images.unsplash.com/photo-1723832359083-4ed7e071ffba?auto=format&fit=crop&w=1200&q=80",
  kaju: "https://images.unsplash.com/photo-1723832359083-4ed7e071ffba?auto=format&fit=crop&w=1200&q=80",
  biryani: "https://images.unsplash.com/photo-1701579231349-d7459c40919d?auto=format&fit=crop&w=1200&q=80",
  pizza: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80",
  chinese: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=1200&q=80",
  "fast food": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80",
  rolls: "https://images.unsplash.com/photo-1534939561126-855b8675edd7?auto=format&fit=crop&w=1200&q=80",
  "south indian": "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=1200&q=80",
  rasgulla: "https://images.unsplash.com/photo-1714799263412-2e0c1f875959?auto=format&fit=crop&w=1200&q=80",
  "gulab jamun": "https://images.unsplash.com/photo-1593701461250-d7b22dfd3a77?auto=format&fit=crop&w=1200&q=80",
  jalebi: "https://images.unsplash.com/photo-1622715395476-3dbcd161df05?auto=format&fit=crop&w=1200&q=80",
  ladoo: "https://images.unsplash.com/photo-1635952346904-95f2ccfcd029?auto=format&fit=crop&w=1200&q=80",
  halwa: "https://images.unsplash.com/photo-1723832359083-4ed7e071ffba?auto=format&fit=crop&w=1200&q=80",
  sweets: "https://images.unsplash.com/photo-1723832359083-4ed7e071ffba?auto=format&fit=crop&w=1200&q=80",
  mithai: "https://images.unsplash.com/photo-1723832359083-4ed7e071ffba?auto=format&fit=crop&w=1200&q=80",
  momos: "https://images.unsplash.com/photo-1534939561126-855b8675edd7?auto=format&fit=crop&w=1200&q=80",
  burger: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80",
  sandwich: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80",
  default: "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=80"
};

const getRequestHeaders = () => ({
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/json",
  "Accept-Language": "en-US,en;q=0.9"
});

const ZOMATO_BASE_URL = "https://www.zomato.com";
export const getImageForCuisine = (cuisine = "") => {
  if (!cuisine) return cuisineImageMap.default;
  const key = cuisine.toLowerCase();
  for (const [mappedKey, url] of Object.entries(cuisineImageMap)) {
    if (mappedKey !== 'default' && key.includes(mappedKey)) return url;
  }
  return cuisineImageMap.default;
};

const estimateBasePrice = (cuisine = "") => {
  const key = cuisine.toLowerCase();

  if (key.includes("biryani")) {
    return 320;
  }

  if (key.includes("pizza")) {
    return 380;
  }

  if (key.includes("chinese")) {
    return 280;
  }

  if (key.includes("south")) {
    return 220;
  }

  return 260;
};

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const getCuisineMatchScore = (requestedCuisine = "", restaurant = {}) => {
  const requestedTokens = tokenizeSearchText(resolveDishQuery(requestedCuisine));
  const relatedCuisines = getRelatedCuisines(requestedCuisine);

  if (!requestedTokens.length && !relatedCuisines.length) {
    return 1;
  }

  const haystack = `${restaurant.name || ""} ${restaurant.cuisine || ""}`.toLowerCase();

  // Check direct tokens
  const matchedTokens = requestedTokens.filter((token) => haystack.includes(token));

  // Check related cuisines
  const matchedRelated = relatedCuisines.filter((c) => haystack.includes(c));

  if (!matchedTokens.length && !matchedRelated.length) {
    return 0;
  }

  const directScore = requestedTokens.length ? (matchedTokens.length / requestedTokens.length) : 0;
  const relatedScore = matchedRelated.length ? 0.8 : 0; // High score for related cuisines

  return Math.max(directScore, relatedScore);
};

const tryParseJsonString = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const unwrapMcpPayload = (payload) => {
  let current = tryParseJsonString(payload);

  if (current?.result) {
    current = tryParseJsonString(current.result);
  }

  if (current?.content && Array.isArray(current.content)) {
    const textItem = current.content.find((item) => item?.type === "text" && item?.text);
    if (textItem?.text) {
      current = tryParseJsonString(textItem.text);
    }
  }

  if (current?.data) {
    current = tryParseJsonString(current.data);
  }

  return current;
};

export const extractMcpSource = (payload) => {
  const normalized = unwrapMcpPayload(payload);
  return normalized?.source || normalized?.data?.source || "mcp";
};

const extractDealList = (payload) => {
  const normalized = unwrapMcpPayload(payload);

  if (Array.isArray(normalized)) {
    return normalized;
  }

  if (Array.isArray(normalized?.deals)) {
    return normalized.deals;
  }

  if (Array.isArray(normalized?.results)) {
    return normalized.results;
  }

  if (Array.isArray(normalized?.restaurants)) {
    return normalized.restaurants;
  }

  if (Array.isArray(normalized?.items)) {
    return normalized.items;
  }

  if (Array.isArray(normalized?.data?.deals)) {
    return normalized.data.deals;
  }

  return [];
};

export const normalizeMcpDeals = (payload, location, cuisine) => {
  const list = extractDealList(payload);
  const resolvedCuisine = resolveDishQuery(cuisine);

  return list
    .map((item, index) => {
      const resolvedDishName = item.dishName || item.dish || item.itemName || "";
      const restaurantName = item.name || item.restaurant || "";
      const rawUrl = item.orderUrl || item.deepLink || item.url || "";
      // Comprehensive bad-URL detection: reject listing pages, old formats, search pages
      const isBrokenUrl = !rawUrl
        || /[?&]rid=/.test(rawUrl)
        || /\/order-food-online(?:[?/]|$)/.test(rawUrl)
        || /\/restaurants[?/]/.test(rawUrl)
        || /\/restaurants$/.test(rawUrl)
        || /[?&](category|context)=/.test(rawUrl)
        || /\/search\?/.test(rawUrl);
      const restaurantId = item.restaurantId || item.res_id || item.resId || "";
      const slug = item.slug || "";
      const cityFromLocation = getCitySlugFromText(item.location || location || "") || "ncr";
      const normalizedOrderUrl = rawUrl && !isBrokenUrl
        ? toAbsoluteUrl(rawUrl, restaurantName, item.location || location)
        : slug
          ? `https://www.zomato.com/${cityFromLocation}/${slug}/order`
          : (() => {
            const q = encodeURIComponent([item.dishName || "", restaurantName].filter(Boolean).join(" "));
            return `https://www.zomato.com/${cityFromLocation}/delivery?query=${q}`;
          })();
      const hasValidOrderUrl = Boolean(normalizedOrderUrl);

      return {
        name: restaurantName || `Zomato Deal ${index + 1}`,
        dishName: resolvedDishName,
        cuisine: item.cuisine || resolvedCuisine || "Multiple",
        location: item.location || location || "Unknown",
        basePrice: Number(item.basePrice || item.originalPrice || item.price || item.avgPrice || estimateBasePrice(item.cuisine || resolvedCuisine)),
        rating: Number(item.rating || 4),
        discount: Number(item.discount || 0),
        trendingScore: Number(item.trendingScore || item.popularity || item.orders || item.rankScore || 0),
        imageUrl: getImageForCuisine(resolvedDishName) !== cuisineImageMap.default ? getImageForCuisine(resolvedDishName) : (item.imageUrl || item.photo || item.image || getImageForCuisine(item.cuisine || resolvedCuisine)),
        orderUrl: normalizedOrderUrl,
        res_id: String(restaurantId),
        restaurantId: String(restaurantId),
        slug: slug,
        eta: item.eta || item.deliveryTime || item.deliveryEta || "",
        offerText: item.offerText || item.offer || item.promo || "",
        isLive: true,
        verified: true,
        isOrderableNow: hasValidOrderUrl && (item.isOrderableNow ?? item.isAvailableNow ?? true)
      };
    })
    .map((item) => ({
      ...item,
      dishMatchScore: getDishMatchScore(resolvedCuisine, item)
    }))
    .filter((item) => item.name)
    .sort((a, b) => b.dishMatchScore - a.dishMatchScore || b.rating - a.rating || b.trendingScore - a.trendingScore)
    .map(({ dishMatchScore, ...item }) => item);
};

const fetchHtml = async (url) => {
  const response = await axios.get(url, {
    headers: getRequestHeaders(),
    timeout: 15000
  });

  return response.data;
};

const buildSearchUrls = ({ cuisine, location }) => {
  const city = getCitySlugFromText(location) || "ncr";
  const query = encodeURIComponent(resolveDishQuery(cuisine));
  const urls = [];

  // NCR satellite cities use /ncr prefix
  if (["faridabad", "gurgaon", "noida", "ghaziabad"].includes(city)) {
    urls.push(`${ZOMATO_BASE_URL}/ncr/${city}-restaurants?category=1&context=delivery&query=${query}`);
    urls.push(`${ZOMATO_BASE_URL}/ncr/delivery?query=${query}+${city}`);
    urls.push(`${ZOMATO_BASE_URL}/ncr/${city}/delivery?query=${query}`);
  } else {
    urls.push(`${ZOMATO_BASE_URL}/${city}/delivery?query=${query}`);
    urls.push(`${ZOMATO_BASE_URL}/${city}-restaurants?query=${query}`);
  }
  return urls;
};

// Keep single-URL builder for resolveOrderSearchUrl
const buildSearchUrl = ({ cuisine, location }) => buildSearchUrls({ cuisine, location })[0];

const toAbsoluteUrl = (url = "", restaurantName = "", location = "") => {
  if (!url) {
    return "";
  }

  let absolute = url;
  if (!absolute.startsWith("http://") && !absolute.startsWith("https://")) {
    absolute = `${ZOMATO_BASE_URL}${absolute.startsWith("/") ? "" : "/"}${absolute}`;
  }

  const city = getCitySlugFromText(location) || "ncr";
  const q = encodeURIComponent(restaurantName || "food");

  const deliveryFallback = ["faridabad", "gurgaon", "noida", "ghaziabad"].includes(city)
    ? `https://www.zomato.com/ncr/${city}-restaurants?category=1&context=delivery&query=${q}`
    : `https://www.zomato.com/${city}/delivery?query=${q}`;

  // The old ?rid= format is dead
  if (/[?&]rid=/.test(absolute)) return deliveryFallback;

  // Generic /order-food-online page is useless
  if (/\/order-food-online(?:[?/]|$)/.test(absolute)) return deliveryFallback;

  // Restaurant LISTING / search pages — the exact bug: /ncr/restaurants?category=1&context=delivery&query=...
  if (/\/restaurants[?/]/.test(absolute)) return deliveryFallback;
  if (/\/restaurants$/.test(absolute)) return deliveryFallback;

  // Any URL with search-filter query params (category=, context=) is a listing page, not a restaurant
  if (/[?&](category|context)=/.test(absolute)) return deliveryFallback;

  // /search?query= is unreliable
  if (/\/search\?/.test(absolute)) return deliveryFallback;

  return absolute;
};

const extractJsonLdBlocks = ($) =>
  $('script[type="application/ld+json"]')
    .map((_, element) => $(element).html())
    .get()
    .map((content) => safeJsonParse(content))
    .filter(Boolean);

const resolveOrderSearchUrl = async ({ cuisine, location }) => {
  const searchHtml = await fetchHtml(buildSearchUrl({ cuisine, location }));
  const hrefMatch = searchHtml.match(/href="([^"]*\/order-food-online\?query=[^"]+)"/i);

  return {
    orderSearchUrl: hrefMatch ? toAbsoluteUrl(hrefMatch[1].replace(/&amp;/g, "&")) : buildSearchUrl({ cuisine, location }),
    searchHtml
  };
};

const extractRestaurantsFromItemList = (jsonLd, requestedCuisine, requestedLocation) => {
  const resolvedCuisine = resolveDishQuery(requestedCuisine);
  const items = jsonLd?.itemListElement || [];

  const restaurants = items
    .map((entry, index) => {
      const item = entry?.item;

      if (item?.["@type"] !== "Restaurant" || !item?.url) {
        return null;
      }

      return {
        name: item.name,
        // Do NOT pre-assign dishName here — it pollutes getDishMatchScore
        // dishName is assigned only AFTER the restaurant passes the cuisine filter
        dishName: "",
        cuisine: item.servesCuisine || resolvedCuisine || "Multiple",
        location: item?.address?.streetAddress || item?.address?.addressLocality || requestedLocation || "Unknown",
        basePrice: estimateBasePrice(item.servesCuisine || resolvedCuisine),
        rating: Number(item?.aggregateRating?.ratingValue || 4),
        discount: 0,
        trendingScore: Math.max(0, 100 - index * 6),
        imageUrl: getImageForCuisine(resolvedCuisine) !== cuisineImageMap.default ? getImageForCuisine(resolvedCuisine) : (item.image || getImageForCuisine(item.servesCuisine || resolvedCuisine)),
        orderUrl: toAbsoluteUrl(item.url, item.name),
        res_id: item.url?.match(/-(\d+)(?:\/|$)/)?.[1] || item.image?.match(/\/(\d+)\/[^/]+\.(?:jpg|png|webp|jpeg)/i)?.[1] || "",
        slug: item.url?.split("/").filter(Boolean).pop()?.replace(/-(order|info)$/, "") || "",
        eta: "",
        offerText: "",
        isLive: true,
        verified: true,
        isOrderableNow: true
      };
    })
    .filter(Boolean);

  const scoredRestaurants = restaurants
    .map((restaurant) => ({
      ...restaurant,
      cuisineMatchScore: getCuisineMatchScore(resolvedCuisine, restaurant),
      dishMatchScore: getDishMatchScore(resolvedCuisine, restaurant)
    }))
    .sort(
      (a, b) =>
        b.dishMatchScore - a.dishMatchScore ||
        b.cuisineMatchScore - a.cuisineMatchScore ||
        b.rating - a.rating ||
        b.trendingScore - a.trendingScore
    );

  const relatedCuisines = getRelatedCuisines(requestedCuisine);

  const relevantRestaurants = scoredRestaurants.filter((restaurant) => {
    // If we have a known related-cuisine mapping, REQUIRE the restaurant cuisine to be in it
    // This is the strict mode: halwa only shows Mithai/Sweets restaurants, not Pizza
    if (relatedCuisines.length > 0) {
      const haystack = `${restaurant.name || ""} ${restaurant.cuisine || ""}`.toLowerCase();
      const cuisineMatches = relatedCuisines.some((c) => haystack.includes(c));
      // Also allow if the dish name literally appears in restaurant name/cuisine (e.g. "Halwa House")
      const dishLiteral = resolvedCuisine.toLowerCase();
      const dishLiteralMatch = haystack.includes(dishLiteral);
      return cuisineMatches || dishLiteralMatch;
    }
    // No known mapping — fall back to score-based filter
    return restaurant.dishMatchScore > 0.34 || restaurant.cuisineMatchScore > 0.49;
  });

  // Location verification: ensure restaurant URLs contain the correct city slug
  const requestedCitySlug = getCitySlugFromText(requestedLocation);
  const locationFiltered = requestedCitySlug
    ? relevantRestaurants.filter((restaurant) => {
      const url = (restaurant.orderUrl || restaurant.slug || "").toLowerCase();
      const urlCity = getCitySlugFromText(url);
      // If we can extract a city from the URL, it must match
      if (urlCity && urlCity !== requestedCitySlug) {
        return false;
      }
      return true;
    })
    : relevantRestaurants;

  // Strictly enforce location filtering — don't show wrong-city restaurants
  const finalList = locationFiltered;

  // Assign the searched dishName ONLY to restaurants that passed the filter
  return finalList
    .map(({ cuisineMatchScore, dishMatchScore, ...restaurant }) => ({
      ...restaurant,
      dishName: requestedCuisine || resolvedCuisine || ""
    }));
};

/**
 * Parse Zomato's embedded JavaScript page state to extract more restaurants.
 * Zomato embeds restaurant data as JSON inside <script> tags in the page,
 * which contains far more restaurants than the JSON-LD ItemList.
 */
const extractRestaurantsFromPageState = (html, requestedCuisine, requestedLocation) => {
  const restaurants = [];
  // Match __PRELOADED_STATE__ or similar embedded JSON blobs
  const patterns = [
    /window\.__PRELOADED_STATE__\s*=\s*({.+?});\s*<\/script>/s,
    /__NEXT_DATA__["']?\s*=\s*({.+?});\s*<\/script>/s,
    /"restaurants":\s*(\[.+?\])(?=[,}])/s
  ];
  for (const pattern of patterns) {
    try {
      const match = html.match(pattern);
      if (!match) continue;
      const parsed = safeJsonParse(match[1]);
      if (!parsed) continue;

      // Find restaurant arrays deep in the object
      const findRestaurants = (obj, depth = 0) => {
        if (depth > 8 || !obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
          for (const item of obj) {
            if (item?.info?.name && item?.info?.resUrl) {
              // Zomato app-style: { info: { name, resUrl, cuisine, rating, ... } }
              const info = item.info;
              const name = info.name || "";
              const url = info.resUrl || info.url || "";
              const servesCuisine = (info.cuisine || []).map(c => c.name || c).join(", ");
              if (name && url) {
                restaurants.push({
                  name,
                  cuisine: servesCuisine || requestedCuisine || "Multiple",
                  url: url.startsWith("http") ? url : `https://www.zomato.com${url}`,
                  rating: Number(info.rating?.aggregate_rating || info.avgRating || 4),
                  image: info.image || info.featured_image || "",
                  address: info.locality || info.location?.localityName || requestedLocation || ""
                });
              }
            }
            findRestaurants(item, depth + 1);
          }
        } else {
          for (const val of Object.values(obj)) findRestaurants(val, depth + 1);
        }
      };
      findRestaurants(parsed);
      if (restaurants.length > 0) break;
    } catch { /* skip */ }
  }

  if (!restaurants.length) return [];

  const resolvedCuisine = resolveDishQuery(requestedCuisine);
  const relatedCuisines = getRelatedCuisines(requestedCuisine);
  const requestedCitySlug = getCitySlugFromText(requestedLocation);

  return restaurants
    .filter(r => {
      if (!r.name || !r.url) return false;
      if (relatedCuisines.length > 0) {
        const haystack = `${r.name} ${r.cuisine}`.toLowerCase();
        return relatedCuisines.some(c => haystack.includes(c)) || haystack.includes(resolvedCuisine.toLowerCase());
      }
      return true;
    })
    .filter(r => {
      if (!requestedCitySlug) return true;
      const urlCity = getCitySlugFromText(r.url);
      return !urlCity || urlCity === requestedCitySlug;
    })
    .map(r => ({
      name: r.name,
      dishName: "",
      cuisine: r.cuisine,
      location: r.address || requestedLocation || "Unknown",
      basePrice: estimateBasePrice(r.cuisine || resolvedCuisine),
      rating: r.rating,
      discount: 0,
      trendingScore: 50,
      imageUrl: getImageForCuisine(resolvedCuisine),
      orderUrl: toAbsoluteUrl(r.url.replace(/\/$/, "") + "/order", r.name),
      res_id: r.url?.match(/-(\d+)(?:\/|$)/)?.[1] || "",
      slug: r.url?.split("/").filter(Boolean).pop()?.replace(/-(order|info)$/, "") || "",
      eta: "",
      offerText: "",
      isLive: true,
      verified: true,
      isOrderableNow: true
    }));
};

const extractRestaurantsFromOrderSearchHtml = ({ html, cuisine, location }) => {
  const $ = cheerio.load(html);
  const jsonLdBlocks = extractJsonLdBlocks($);
  const itemListBlock = jsonLdBlocks.find((block) => block?.["@type"] === "ItemList");

  const fromJsonLd = itemListBlock ? extractRestaurantsFromItemList(itemListBlock, cuisine, location) : [];
  // Also extract from embedded page state (gets many more restaurants)
  const fromState = extractRestaurantsFromPageState(html, cuisine, location);

  // Merge unique restaurants from both sources
  const seen = new Set(fromJsonLd.map(r => (r.name || "").toLowerCase().trim()));
  const merged = [...fromJsonLd];
  for (const r of fromState) {
    const key = (r.name || "").toLowerCase().trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  }
  return merged;
};

const extractFirstOfferText = (html) => {
  const matches = html.match(/(?:\d+\s*%\s*OFF|₹\s*\d+\s*OFF|â‚¹\s*\d+\s*OFF)/gi) || [];
  return matches[0] ? matches[0].replace(/\s+/g, " ").trim() : "";
};

const extractOrderDetails = (html) => {
  const deliveryTime = html.match(/"deliveryTime":"([^"]+)"/)?.[1] || "";
  const promoOffer = html.match(/"promoOffer":"([^"]*)"/)?.[1] || "";
  const promoSubText = html.match(/"promoSubText":"([^"]*)"/)?.[1] || "";
  const isServiceableMatch = html.match(/"isServiceable":(true|false)/)?.[1];

  return {
    eta: deliveryTime,
    offerText: promoOffer || promoSubText || extractFirstOfferText(html),
    isOrderableNow: isServiceableMatch ? isServiceableMatch === "true" : true
  };
};

/**
 * Fetch the actual dish image from a specific restaurant's Zomato menu.
 * Uses Zomato's webroutes/getPage API which returns menu items with item_image_url
 * pointing to Zomato's own CDN (b.zmtcdn.com) — the same images shown on Zomato's
 * menu and order history pages.
 */
const fetchDishImageFromZomato = async (orderUrl = "", dishQuery = "") => {
  if (!orderUrl || !orderUrl.includes("zomato.com")) return null;
  try {
    const pageUrl = new URL(orderUrl).pathname.replace(/\/order$/, "");
    const apiUrl = `https://www.zomato.com/webroutes/getPage?page_url=${pageUrl}/order`;
    const response = await axios.get(apiUrl, {
      headers: {
        ...getRequestHeaders(),
        "x-requested-with": "XMLHttpRequest",
        Accept: "application/json, text/javascript, */*"
      },
      timeout: 8000
    });
    const data = response.data;
    const menus = data?.page_data?.order?.menuList?.menus || [];
    const dishLower = (dishQuery || "").toLowerCase();
    for (const m of menus) {
      for (const cat of (m.menu?.categories || [])) {
        for (const i of (cat.category?.items || [])) {
          const itemName = (i.item?.name || "").toLowerCase();
          const dishWords = dishLower.split(" ").filter(w => w.length > 2);
          const primaryWord = dishWords[0] || dishLower;

          // Match if the item name contains the full search query (e.g. "paneer tikka")
          // OR if it contains the primary word (e.g. "paneer" in "kadai paneer")
          if (dishLower && (itemName.includes(dishLower) || (primaryWord && itemName.includes(primaryWord)))) {
            const img = i.item?.item_image_url;
            if (img && img.startsWith("http")) {
              console.log(`[DishImage] Zomato CDN image for "${dishQuery}" at ${pageUrl}: ${img}`);
              return img;
            }
          }
        }
      }
    }
  } catch {
    // Silently ignore — caller falls back to cuisine image map
  }
  return null;
};

const enrichRestaurant = async (restaurant, dishQuery = "") => {
  if (!restaurant.orderUrl) {
    return restaurant;
  }

  try {
    const html = await fetchHtml(restaurant.orderUrl);
    const orderDetails = extractOrderDetails(html);
    const discountMatch = orderDetails.offerText.match(/(\d+)\s*%/);

    // Fetch the actual dish image from this specific restaurant's Zomato menu
    const dishImage = dishQuery ? await fetchDishImageFromZomato(restaurant.orderUrl, dishQuery) : null;

    return {
      ...restaurant,
      eta: orderDetails.eta || restaurant.eta,
      offerText: orderDetails.offerText || restaurant.offerText,
      discount: discountMatch ? Number(discountMatch[1]) : restaurant.discount,
      isOrderableNow: orderDetails.isOrderableNow,
      imageUrl: dishImage || restaurant.imageUrl
    };
  } catch {
    return restaurant;
  }
};

const fetchVerifiedZomatoDeals = async ({ location, cuisine, dishImageQuery = "", limit, locationData = null }) => {
  const searchUrls = buildSearchUrls({ cuisine, location });
  const seenNames = new Set();
  let allRestaurants = [];

  // Try every search URL and merge unique results
  for (const url of searchUrls) {
    try {
      let html = await fetchHtml(url);

      // Also follow the order-food-online redirect from the first URL
      if (searchUrls.indexOf(url) === 0) {
        const hrefMatch = html.match(/href="([^"]*\/order-food-online\?query=[^"]+)"/i);
        if (hrefMatch) {
          try {
            const redirectUrl = toAbsoluteUrl(hrefMatch[1].replace(/&amp;/g, "&"));
            html = await fetchHtml(redirectUrl);
          } catch { /* keep original html */ }
        }
      }

      const found = extractRestaurantsFromOrderSearchHtml({ html, cuisine, location });
      for (const r of found) {
        const key = (r.name || "").toLowerCase().trim();
        if (key && !seenNames.has(key)) {
          seenNames.add(key);
          allRestaurants.push(r);
        }
      }

      if (allRestaurants.length >= limit * 2) break; // have enough, stop early
    } catch { /* skip failed URLs */ }
  }

  if (!allRestaurants.length) return [];

  const top = allRestaurants.slice(0, limit);
  // Enrich: fetch live offer/eta AND the actual dish image from each restaurant's Zomato menu
  // Use the original dish name (e.g. "rasgulla") for image lookup, not the mapped category ("mithai")
  const imageQueryForDish = dishImageQuery || cuisine;
  const enriched = await Promise.all(top.map(r => enrichRestaurant(r, imageQueryForDish)));

  return enriched.filter(r => r.orderUrl);
};

export const fetchDirectDeals = async ({ location = "", cuisine = "", dishImageQuery = "", limit = 8, locationData = null }) => {
  const normalizedLocation = location.trim();
  const normalizedCuisine = resolveDishQuery(cuisine.trim());
  // dishImageQuery is the original user search term (e.g. "rasgulla") when cuisine was remapped (e.g. to "mithai")
  const normalizedImageQuery = dishImageQuery.trim() || normalizedCuisine;

  try {
    const liveDeals = await fetchVerifiedZomatoDeals({
      location: normalizedLocation,
      cuisine: normalizedCuisine,
      dishImageQuery: normalizedImageQuery,
      limit,
      locationData
    });

    if (liveDeals.length) {
      return {
        source: "zomato-web",
        deals: liveDeals,
        diagnostics: {
          mode: "live",
          location: normalizedLocation,
          cuisine: normalizedCuisine
        }
      };
    }
  } catch (error) {
    const diagnostics = {
      mode: "failed",
      location: normalizedLocation,
      cuisine: normalizedCuisine,
      code: error?.code || error?.cause?.code || "",
      message: error?.message || "Unknown direct fetch failure"
    };

    console.log("Verified Zomato fetch failed:", diagnostics.code || diagnostics.message);

    return {
      source: diagnostics.code === "EACCES" ? "blocked" : "unavailable",
      deals: [],
      diagnostics
    };
  }

  return {
    source: "unavailable",
    deals: [],
    diagnostics: {
      mode: "empty",
      location: normalizedLocation,
      cuisine: normalizedCuisine,
      message: "Live crawl completed but returned no matching deals."
    }
  };
};

export const fetchRestaurantMenuFromWeb = async (orderUrl, restaurantName, basePrice = 150, restaurantLocation = "Unknown") => {
  try {
    if (!orderUrl || !orderUrl.includes('zomato.com')) return [];

    // Convert to webroutes/getPage URL
    const pageUrl = new URL(orderUrl).pathname;
    const apiUrl = `https://www.zomato.com/webroutes/getPage?page_url=${pageUrl}`;

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) return [];
    const data = await response.json();

    const items = [];
    const menus = data?.page_data?.order?.menuList?.menus || [];

    for (const m of menus) {
      if (!m.menu?.categories) continue;
      for (const cat of m.menu.categories) {
        if (!cat.category?.items) continue;
        for (const i of cat.category.items) {
          if (i.item && i.item.name) {
            items.push(i.item);
          }
        }
      }
    }

    // Map to the required menu format
    return items.slice(0, 15).map((item, index) => {
      // Use price variation to make it look realistic if price is hidden
      const itemPrice = basePrice + ((index % 3) * 20) - ((index % 2) * 10);
      return {
        dishName: item.name,
        restaurant: restaurantName,
        location: restaurantLocation,
        basePrice: itemPrice,
        price: itemPrice,
        finalPrice: itemPrice,
        originalPrice: itemPrice,
        discount: 0,
        orderUrl: orderUrl,
        slug: orderUrl.split('/').filter(Boolean).pop()?.replace(/-(order|info)$/, "") || "",
        imageUrl: item.item_image_url || "",
        isLive: true,
        isOrderableNow: true
      };
    });
  } catch (error) {
    console.log("Menu fetch error:", error.message);
    return [];
  }
};

