const ZOMATO_BASE_URL = "https://www.zomato.com";

// ── City slug lookup (client-side, no API needed) ────────────────────────────
const CITY_SLUG_MAP = [
  { patterns: ["delhi", "new delhi", "dwarka", "rohini", "janakpuri", "laxmi nagar", "saket"], slug: "delhi" },
  { patterns: ["noida", "greater noida"], slug: "noida" },
  { patterns: ["gurgaon", "gurugram", "sohna", "manesar"], slug: "gurgaon" },
  { patterns: ["rewari", "rewāri"], slug: "rewari" },
  { patterns: ["faridabad"], slug: "faridabad" },
  { patterns: ["ghaziabad"], slug: "ghaziabad" },
  { patterns: ["bangalore", "bengaluru", "whitefield", "koramangala", "indiranagar", "hsr"], slug: "bangalore" },
  { patterns: ["mumbai", "thane", "navi mumbai", "andheri", "bandra", "borivali"], slug: "mumbai" },
  { patterns: ["pune", "pimpri", "kothrud", "hadapsar"], slug: "pune" },
  { patterns: ["hyderabad", "secunderabad", "hitec city", "banjara hills", "jubilee hills"], slug: "hyderabad" },
  { patterns: ["chennai", "velachery", "t nagar", "anna nagar", "adyar", "tambaram"], slug: "chennai" },
  { patterns: ["kolkata", "howrah", "salt lake", "new town", "dumdum"], slug: "kolkata" },
  { patterns: ["ahmedabad", "gandhinagar"], slug: "ahmedabad" },
  { patterns: ["surat"], slug: "surat" },
  { patterns: ["jaipur", "ajmer"], slug: "jaipur" },
  { patterns: ["chandigarh", "mohali", "panchkula"], slug: "chandigarh" },
  { patterns: ["lucknow", "kanpur", "agra", "varanasi"], slug: "lucknow" },
  { patterns: ["bhopal", "indore"], slug: "bhopal" },
  { patterns: ["nagpur"], slug: "nagpur" },
  { patterns: ["patna"], slug: "patna" },
  { patterns: ["coimbatore", "madurai", "trichy"], slug: "coimbatore" },
  { patterns: ["kochi", "trivandrum", "thrissur", "kozhikode"], slug: "kochi" },
  { patterns: ["visakhapatnam", "vizag"], slug: "visakhapatnam" },
  { patterns: ["ludhiana", "amritsar", "jalandhar", "patiala"], slug: "ludhiana" },
  { patterns: ["dehradun"], slug: "dehradun" },
  { patterns: ["mysore", "mangalore"], slug: "mysore" },
];

const getCitySlugFromText = (location = "") => {
  const normalized = (location || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  for (const { patterns, slug } of CITY_SLUG_MAP) {
    if (patterns.some((p) => normalized.includes(p))) return slug;
  }

  // Generic slugify for unknown cities
  const firstPart = normalized.split(",")[0].trim();
  return firstPart ? firstPart.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const normalizeTarget = (target = "", restaurantName = "") => {
  if (target && typeof target === "object") return target;
  return { orderUrl: target, restaurant: restaurantName };
};

const toAbsoluteUrl = (url = "") => {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${ZOMATO_BASE_URL}${value.startsWith("/") ? "" : "/"}${value}`;
};

const trimTrailingSlash = (value = "") => value.replace(/\/+$/, "");
const NCR_DELIVERY_CITIES = new Set(["faridabad", "gurgaon", "noida", "ghaziabad"]);
const getZomatoUrlCitySegment = (city = "") => (NCR_DELIVERY_CITIES.has(city) ? "ncr" : city || "ncr");



const isBadUrl = (url = "") => {
  if (!url) return true;
  if (/\/webroutes\/getPage\?page_url=\/\d+(?:\/|%2F|$)/i.test(url)) return true; // bare res_id page_url 404
  if (/zomato\.com\/(?:restaurant\/)?\d+(?:\/|[?#]|$)/i.test(url)) return true; // bare res_id paths are not valid public pages
  if (/[?&]rid=/.test(url)) return true;                              // old rid= format
  if (/\/order-food-online(?:[?/]|$)/.test(url)) return true;        // dead generic page
  if (/\/search\?/.test(url)) return true;                            // /search?query= unreliable
  if (/\/delivery(?:-[^/?#]+)?(?:\/|[?#]|$)/.test(url)) return true;  // blocks /delivery or /delivery-in-faridabad generic pages
  const isDeliveryListingSearch = /\/[^/?#]*restaurants\?/.test(url) && /[?&]context=delivery/.test(url);
  if (!isDeliveryListingSearch) {
    if (/\/restaurants[?/]/.test(url)) return true;
    if (/\/restaurants$/.test(url)) return true;
    if (/[?&](category|context)=/.test(url)) return true;
  }
  // A URL like /delivery?query=... is OK (intentional fallback) but /order appended to ?query= is not
  // Detect if someone built "...?query=.../order" (broken append)
  if (/\?[^#]*\/order(?:\/|$)/.test(url)) return true;
  return false;
};

const ensureOrderPath = (url = "") => {
  const absolute = toAbsoluteUrl(url);
  if (!absolute) return "";
  if (/[?#]/.test(absolute) || /\/order(?:\/|$)/i.test(absolute)) return absolute;
  return `${trimTrailingSlash(absolute)}/order`;
};

const isSearchOrListingUrl = (url = "") =>
  /\/search\?/.test(url) ||
  /\/delivery\?/.test(url) ||
  /\/[^/?#]*restaurants\?/.test(url);

const buildZomatoSearchUrl = (target = "", restaurantName = "") => {
  const resolved = normalizeTarget(target, restaurantName);
  const city = getZomatoUrlCitySegment(getCitySlugFromText(resolved.location || "") || "ncr");
  const query = [
    resolved.restaurant || restaurantName,
    resolved.dishName || resolved.cuisine || ""
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || "food";

  return `${ZOMATO_BASE_URL}/${city}/delivery?query=${encodeURIComponent(query)}`;
};

const hasCityPrefix = (path = "") => {
  const firstSegment = String(path || "").replace(/^\/+/, "").split("/")[0].toLowerCase();
  return firstSegment === "ncr" || CITY_SLUG_MAP.some(({ slug }) => slug === firstSegment);
};

const buildZomatoSlugUrl = (rawSlug = "", city = "ncr") => {
  if (rawSlug.startsWith("http")) return rawSlug;
  if (rawSlug.startsWith("/")) {
    return hasCityPrefix(rawSlug)
      ? `${ZOMATO_BASE_URL}${rawSlug}`
      : `${ZOMATO_BASE_URL}/${city}${rawSlug}`;
  }
  return `${ZOMATO_BASE_URL}/${city}/${rawSlug}`;
};

export function getDirectZomatoUrl(target = "", restaurantName = "") {
  const resolved = normalizeTarget(target, restaurantName);
  const candidates = [
    resolved.orderUrl,
    resolved.restaurantUrl,
    resolved.pageUrl,
    resolved.permalink,
    resolved.webUrl,
    resolved.shareUrl,
    resolved.url,
  ]
    .map((u) => toAbsoluteUrl(u))
    .filter((u) => u && !isBadUrl(u) && !isSearchOrListingUrl(u));

  if (candidates.length > 0) {
    const withOrder = candidates.find((u) => /\/order(?:\/|$)/i.test(u));
    const finalUrl = withOrder || ensureOrderPath(candidates[0]);

    if (resolved.dishName && finalUrl.includes("/order")) {
      const char = finalUrl.includes("?") ? "&" : "?";
      return `${finalUrl}${char}search=${encodeURIComponent(resolved.dishName)}`;
    }

    return finalUrl;
  }

  const rawSlug = String(resolved.slug || "").trim();
  const cityFromDeal = getCitySlugFromText(resolved.location || "");

  if (rawSlug && rawSlug.toLowerCase() !== "order" && !rawSlug.includes("?")) {
    const city = getZomatoUrlCitySegment(cityFromDeal || "ncr");
    const slugPath = buildZomatoSlugUrl(rawSlug, city);
    const finalUrl = ensureOrderPath(slugPath);

    if (resolved.dishName) {
      const char = finalUrl.includes("?") ? "&" : "?";
      return `${finalUrl}${char}search=${encodeURIComponent(resolved.dishName)}`;
    }

    return finalUrl;
  }

  return "";
}

// ── Core URL builder (priority chain) ────────────────────────────────────────
/**
 * Build the best possible Zomato order URL for a deal object.
 *
 * Priority:
 * 1. Clean direct URL from MCP (page_url / permalink / orderUrl)
 * 2. city-slug + restaurant-slug  →  /city/slug/order
 * 3. city-slug + delivery search  →  /city/delivery?query=dish restaurant
 * 4. Generic delivery search (NCR)  →  /ncr/delivery?query=…
 */
export function buildZomatoOrderUrl(target = "", restaurantName = "") {
  const resolved = normalizeTarget(target, restaurantName);

  // 1. Collect and score all explicit URLs from the deal object
  const candidates = [
    resolved.orderUrl,
    resolved.restaurantUrl,
    resolved.pageUrl,
    resolved.permalink,
    resolved.webUrl,
    resolved.shareUrl,
    resolved.url,
  ]
    .map((u) => toAbsoluteUrl(u))
    .filter((u) => u && !isBadUrl(u) && !isSearchOrListingUrl(u));

  if (candidates.length > 0) {
    // Prefer a URL that already has /order
    const withOrder = candidates.find((u) => /\/order(?:\/|$)/i.test(u));
    const finalUrl = withOrder || ensureOrderPath(candidates[0]);
    if (resolved.dishName && finalUrl.includes('/order')) {
      const char = finalUrl.includes('?') ? '&' : '?';
      return `${finalUrl}${char}search=${encodeURIComponent(resolved.dishName)}`;
    }
    return finalUrl;
  }

  // 2. slug + city slug → /city/slug/order
  const rawSlug = String(resolved.slug || "").trim();
  const cityFromDeal = getCitySlugFromText(resolved.location || "");

  if (rawSlug && rawSlug.toLowerCase() !== "order" && !rawSlug.includes("?")) {
    const city = getZomatoUrlCitySegment(cityFromDeal || "ncr");
    const slugPath = buildZomatoSlugUrl(rawSlug, city);
    
    const finalUrl = ensureOrderPath(slugPath);
    if (resolved.dishName) {
      const char = finalUrl.includes('?') ? '&' : '?';
      return `${finalUrl}${char}search=${encodeURIComponent(resolved.dishName)}`;
    }
    return finalUrl;
  }

  return buildZomatoSearchUrl(resolved, restaurantName);
}

export function sanitizeZomatoUrl(target = "", restaurantName = "") {
  const resolved = normalizeTarget(target, restaurantName);
  const directUrl = getDirectZomatoUrl(resolved, restaurantName);

  if (directUrl) {
    return directUrl;
  }

  const rawOrderUrl = typeof target === "string" ? target : resolved.orderUrl;
  const url = toAbsoluteUrl(rawOrderUrl);

  if (!url || isBadUrl(url)) {
    return buildZomatoOrderUrl(resolved, restaurantName);
  }

  return url;
}

export function openZomatoUrl(target = "", restaurantName = "") {
  const safeUrl = sanitizeZomatoUrl(
    typeof target === "string" ? { orderUrl: target, restaurant: restaurantName } : target,
    restaurantName
  );

  if (safeUrl) {
    window.open(safeUrl, "_blank", "noopener,noreferrer");
    return true;
  }

  return false;
}
