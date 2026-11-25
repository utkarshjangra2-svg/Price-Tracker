

// ── Text-only city slug normalizer (no API, instant) ───────────────────────
const CITY_SLUG_MAP = [
  { patterns: ["delhi", "new delhi", "dwarka", "rohini", "janakpuri", "laxmi nagar", "saket", "noida extension"], slug: "delhi" },
  { patterns: ["noida", "greater noida"], slug: "noida" },
  { patterns: ["gurgaon", "gurugram", "sohna", "manesar"], slug: "gurgaon" },
  { patterns: ["faridabad"], slug: "faridabad" },
  { patterns: ["ghaziabad"], slug: "ghaziabad" },
  { patterns: ["rewari", "rewāri"], slug: "rewari" },
  { patterns: ["bangalore", "bengaluru", "whitefield", "koramangala", "indiranagar", "hsr"], slug: "bangalore" },
  { patterns: ["mumbai", "thane", "navi mumbai", "kalyan", "andheri", "bandra", "borivali"], slug: "mumbai" },
  { patterns: ["pune", "pimpri", "chinchwad", "kothrud", "hadapsar"], slug: "pune" },
  { patterns: ["hyderabad", "secunderabad", "hitec city", "banjara hills", "jubilee hills", "miyapur"], slug: "hyderabad" },
  { patterns: ["chennai", "velachery", "t nagar", "anna nagar", "adyar", "tambaram"], slug: "chennai" },
  { patterns: ["kolkata", "howrah", "salt lake", "new town", "dumdum"], slug: "kolkata" },
  { patterns: ["ahmedabad", "gandhinagar", "surat", "vadodara", "rajkot"], slug: "ahmedabad" },
  { patterns: ["jaipur", "ajmer"], slug: "jaipur" },
  { patterns: ["chandigarh", "mohali", "panchkula"], slug: "chandigarh" },
  { patterns: ["lucknow", "kanpur", "agra", "varanasi"], slug: "lucknow" },
  { patterns: ["bhopal", "indore", "jabalpur"], slug: "bhopal" },
  { patterns: ["patna"], slug: "patna" },
  { patterns: ["nagpur"], slug: "nagpur" },
  { patterns: ["coimbatore", "madurai", "trichy"], slug: "coimbatore" },
  { patterns: ["kochi", "trivandrum", "thrissur", "kozhikode"], slug: "kochi" },
  { patterns: ["visakhapatnam", "vizag"], slug: "visakhapatnam" },
  { patterns: ["surat"], slug: "surat" },
  { patterns: ["ludhiana", "amritsar", "jalandhar", "patiala"], slug: "ludhiana" },
  { patterns: ["dehradun"], slug: "dehradun" },
  { patterns: ["ranchi", "jamshedpur"], slug: "ranchi" },
  { patterns: ["bhubaneswar", "cuttack"], slug: "bhubaneswar" },
  { patterns: ["mysore", "mangalore"], slug: "mysore" },
];

/**
 * Convert free-text location into a valid Zomato city slug.
 * Pure in-memory, no external calls.
 */
export const getCitySlugFromText = (location = "") => {
  const normalized = location
    .toLowerCase()
    .replace(/[^a-z0-9\s,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return null;

  for (const { patterns, slug } of CITY_SLUG_MAP) {
    if (patterns.some((p) => normalized.includes(p))) {
      return slug;
    }
  }

  // Generic slugify for unknown cities
  const firstPart = normalized.split(",")[0].trim();
  if (!firstPart) return null;

  return firstPart.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
};

const CITY_BOUNDARIES = [
  { slug: "delhi", minLat: 28.4, maxLat: 28.9, minLng: 76.8, maxLng: 77.4 },
  { slug: "gurgaon", minLat: 28.35, maxLat: 28.55, minLng: 76.95, maxLng: 77.15 },
  { slug: "noida", minLat: 28.5, maxLat: 28.7, minLng: 77.3, maxLng: 77.6 },
  { slug: "faridabad", minLat: 28.3, maxLat: 28.5, minLng: 77.2, maxLng: 77.4 },
  { slug: "rewari", minLat: 28.1, maxLat: 28.3, minLng: 76.5, maxLng: 76.7 },
  { slug: "mumbai", minLat: 18.8, maxLat: 19.3, minLng: 72.7, maxLng: 73.1 },
  { slug: "bangalore", minLat: 12.8, maxLat: 13.2, minLng: 77.4, maxLng: 77.8 },
  { slug: "pune", minLat: 18.4, maxLat: 18.7, minLng: 73.7, maxLng: 74.1 },
  { slug: "hyderabad", minLat: 17.2, maxLat: 17.6, minLng: 78.2, maxLng: 78.7 },
  { slug: "chennai", minLat: 12.8, maxLat: 13.2, minLng: 80.1, maxLng: 80.3 },
  { slug: "kolkata", minLat: 22.4, maxLat: 22.7, minLng: 88.2, maxLng: 88.5 },
];

/**
 * Offline bounding box detection for city coordinates.
 * Pure in-memory, no API calls.
 */
export const getCityFromCoordsOffline = (lat, lng) => {
  if (lat == null || lng == null) return null;
  const numLat = Number(lat);
  const numLng = Number(lng);

  for (const city of CITY_BOUNDARIES) {
    if (
      numLat >= city.minLat &&
      numLat <= city.maxLat &&
      numLng >= city.minLng &&
      numLng <= city.maxLng
    ) {
      return city.slug;
    }
  }

  return null;
};

/**
 * Hybrid resolver: tries coords first (offline bounding box), then text.
 * Always returns a string (may be null if nothing works).
 */
export const getCitySlug = async (location = "", locationData = null) => {
  const fromCoords = getCityFromCoordsOffline(
    locationData?.latitude,
    locationData?.longitude
  );
  if (fromCoords) return fromCoords;

  return getCitySlugFromText(location) || null;
};
