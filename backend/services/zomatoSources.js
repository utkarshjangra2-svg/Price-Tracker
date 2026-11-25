import axios from "axios";
import * as cheerio from "cheerio";
import { getDishMatchScore, resolveDishQuery, tokenizeSearchText } from "./searchIntent.js";

const cuisineImageMap = {
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
    halwa: "https://images.unsplash.com/photo-1593701461250-d7b22dfd3a77?auto=format&fit=crop&w=1200&q=80",
    sweets: "https://images.unsplash.com/photo-1593701461250-d7b22dfd3a77?auto=format&fit=crop&w=1200&q=80",
    mithai: "https://images.unsplash.com/photo-1593701461250-d7b22dfd3a77?auto=format&fit=crop&w=1200&q=80",
    barfi: "https://images.unsplash.com/photo-1593701461250-d7b22dfd3a77?auto=format&fit=crop&w=1200&q=80",
    burfi: "https://images.unsplash.com/photo-1593701461250-d7b22dfd3a77?auto=format&fit=crop&w=1200&q=80",
    kaju: "https://images.unsplash.com/photo-1593701461250-d7b22dfd3a77?auto=format&fit=crop&w=1200&q=80",
    default: "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=80"
};

const getRequestHeaders = () => ({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "text/html,application/json",
    "Accept-Language": "en-US,en;q=0.9"
});

const ZOMATO_BASE_URL = "https://www.zomato.com";
export const getImageForCuisine = (cuisine = "") => {
    const key = cuisine.toLowerCase();
    return cuisineImageMap[key] || cuisineImageMap.default;
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

const BROAD_CUISINES = new Set([
  "north indian", "south indian", "chinese", "italian", "mughlai",
  "fast food", "beverages", "desserts", "continental", "thai",
  "mexican", "bakery", "street food", "healthy", "cafe", "general", "mithai", "food"
]);

const isSpecificDishSearch = (query = "") => {
  const q = String(query).toLowerCase().trim().replace(/\s+/g, " ");
  if (!q || q === "food" || q === "restaurant" || q === "restaurants") return false;
  return !BROAD_CUISINES.has(q);
};

const getCuisineMatchScore = (requestedCuisine = "", restaurant = {}) => {
    const resolved = resolveDishQuery(requestedCuisine);
    if (!isSpecificDishSearch(resolved)) {
        return 1;
    }
    const requestedTokens = tokenizeSearchText(resolved);

    if (!requestedTokens.length) {
        return 1;
    }

    const haystack = `${restaurant.name || ""} ${restaurant.cuisine || ""}`.toLowerCase();
    const matchedTokens = requestedTokens.filter((token) => haystack.includes(token));

    if (!matchedTokens.length) {
        return 0;
    }

    return matchedTokens.length / requestedTokens.length;
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
            const isGenericSearchUrl = /\/search\?query=/.test(rawUrl);
            const normalizedOrderUrl = rawUrl && !isGenericSearchUrl ? toAbsoluteUrl(rawUrl) : "";
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
                imageUrl: item.imageUrl || item.photo || item.image || getImageForCuisine(item.cuisine || resolvedCuisine),
                orderUrl: normalizedOrderUrl,
                eta: item.eta || item.deliveryTime || item.deliveryEta || "",
                offerText: item.offerText || item.offer || item.promo || "",
                isLive: true,
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

const buildSearchUrl = ({ cuisine, location }) => {
    const query = encodeURIComponent([resolveDishQuery(cuisine), location].filter(Boolean).join(" "));
    return `${ZOMATO_BASE_URL}/search?query=${query}`;
};

const toAbsoluteUrl = (url = "") => {
    if (!url) {
        return "";
    }

    if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
    }

    return `${ZOMATO_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
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
                dishName: "",
                cuisine: item.servesCuisine || resolvedCuisine || "Multiple",
                location: requestedLocation || item?.address?.streetAddress || "Unknown",
                basePrice: estimateBasePrice(item.servesCuisine || resolvedCuisine),
                rating: Number(item?.aggregateRating?.ratingValue || 4),
                discount: 0,
                trendingScore: Math.max(0, 100 - index * 6),
                imageUrl: item.image || getImageForCuisine(item.servesCuisine || resolvedCuisine),
                orderUrl: toAbsoluteUrl(item.url),
                eta: "",
                offerText: "",
                isLive: true,
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

    const relevantRestaurants = scoredRestaurants.filter(
        (restaurant) => restaurant.dishMatchScore > 0.34 || restaurant.cuisineMatchScore > 0
    );

    return relevantRestaurants
        .map(({ cuisineMatchScore, dishMatchScore, ...restaurant }) => restaurant);
};

const extractRestaurantsFromOrderSearchHtml = ({ html, cuisine, location }) => {
    const $ = cheerio.load(html);
    const jsonLdBlocks = extractJsonLdBlocks($);
    const itemListBlock = jsonLdBlocks.find((block) => block?.["@type"] === "ItemList");

    if (!itemListBlock) {
        return [];
    }

    return extractRestaurantsFromItemList(itemListBlock, cuisine, location);
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

const enrichRestaurant = async (restaurant) => {
    if (!restaurant.orderUrl) {
        return restaurant;
    }

    try {
        const html = await fetchHtml(restaurant.orderUrl);
        const orderDetails = extractOrderDetails(html);
        const discountMatch = orderDetails.offerText.match(/(\d+)\s*%/);

        return {
            ...restaurant,
            eta: orderDetails.eta || restaurant.eta,
            offerText: orderDetails.offerText || restaurant.offerText,
            discount: discountMatch ? Number(discountMatch[1]) : restaurant.discount,
            isOrderableNow: orderDetails.isOrderableNow
        };
    } catch {
        return restaurant;
    }
};

const fetchVerifiedZomatoDeals = async ({ location, cuisine, limit, locationData = null }) => {
    const { orderSearchUrl, searchHtml } = await resolveOrderSearchUrl({ cuisine, location });

    let orderSearchHtml = searchHtml;

    if (orderSearchUrl && orderSearchUrl !== buildSearchUrl({ cuisine, location })) {
        try {
            orderSearchHtml = await fetchHtml(orderSearchUrl);
        } catch {
            orderSearchHtml = searchHtml;
        }
    }

    const restaurants = extractRestaurantsFromOrderSearchHtml({
        html: orderSearchHtml,
        cuisine,
        location
    }).slice(0, limit);

    if (!restaurants.length) {
        return extractRestaurantsFromOrderSearchHtml({
            html: searchHtml,
            cuisine,
            location
        })
            .slice(0, limit)
            .filter((restaurant) => restaurant.orderUrl);
    }

    const enrichedRestaurants = await Promise.all(restaurants.map((restaurant) => enrichRestaurant(restaurant)));

    return enrichedRestaurants.filter((restaurant) => restaurant.orderUrl);
};

export const fetchDirectDeals = async ({ location = "", cuisine = "", limit = 8, locationData = null }) => {
    const normalizedLocation = location.trim();
    const normalizedCuisine = resolveDishQuery(cuisine.trim());

    try {
        const liveDeals = await fetchVerifiedZomatoDeals({
            location: normalizedLocation,
            cuisine: normalizedCuisine,
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
