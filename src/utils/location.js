// ─── Storage keys ───────────────────────────────────────────────────────────
const LOCATION_STORAGE_KEY      = "smartDealExactLocation";
const MANUAL_LOCATION_STORAGE_KEY = "smartDealManualLocation";
const LOCATION_CACHE_TTL_MS     = 10 * 60 * 1000;  // 10 min

export const DEFAULT_LOCATION = "Delhi";

// ─── GPS error codes ─────────────────────────────────────────────────────────
export const GEO_ERROR = {
  DENIED:      "PERMISSION_DENIED",   // user blocked location
  UNAVAILABLE: "POSITION_UNAVAILABLE", // device can't get a fix
  TIMEOUT:     "TIMEOUT",             // took too long
  UNSUPPORTED: "UNSUPPORTED",         // browser has no geolocation
};

// ─── Internal cache helpers ──────────────────────────────────────────────────
const readCachedLocation = () => {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCATION_STORAGE_KEY) || "null");
    if (!parsed?.query || !parsed?.savedAt) return null;
    if (Date.now() - parsed.savedAt > LOCATION_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
};

const saveCachedLocation = (location) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LOCATION_STORAGE_KEY,
      JSON.stringify({ ...location, savedAt: Date.now() })
    );
  } catch {}
};

const getLocationArea = (address = {}) =>
  address.suburb || address.neighbourhood || address.city_district || address.road || "";

const getLocationCity = (address = {}) =>
  address.city || address.town || address.village || "";

const getLocationTitle = (address = {}) => {
  const area = getLocationArea(address);
  const city = getLocationCity(address);
  return [area, city].filter(Boolean).join(", ") || "";
};

const getLocationQuery = (address = {}, fallback = "") =>
  [
    address.house_number && address.road
      ? `${address.house_number} ${address.road}`
      : address.road,
    getLocationArea(address),
    getLocationCity(address),
    address.postcode,
    address.state
  ]
    .filter(Boolean)
    .join(", ") || fallback;

// ─── Public: read cached / manual locations ───────────────────────────────────
export const getCachedExactLocation = () => readCachedLocation();

export const getManualLocationOverride = () => {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(MANUAL_LOCATION_STORAGE_KEY) || "null"
    );
    return parsed?.query ? parsed : null;
  } catch {
    return null;
  }
};

export const getPreferredLocation = () => {
  const manual = getManualLocationOverride();
  if (manual?.query) return manual;
  return readCachedLocation();
};

// ─── Public: save / clear manual location ─────────────────────────────────────
export const saveManualLocationOverride = async (location = "") => {
  if (typeof window === "undefined") return;
  const query = location.toString().trim();
  if (!query) {
    window.localStorage.removeItem(MANUAL_LOCATION_STORAGE_KEY);
    return;
  }
  try {
    const geocoded = await forwardGeocode(query);
    const entry = {
      query,
      title:       query,
      fullAddress: geocoded.display_name || query,
      latitude:    parseFloat(geocoded.lat),
      longitude:   parseFloat(geocoded.lon),
      source:      "manual-geocoded",
      savedAt:     Date.now()
    };
    window.localStorage.setItem(MANUAL_LOCATION_STORAGE_KEY, JSON.stringify(entry));
    saveCachedLocation(entry);
  } catch {
    const entry = { query, title: query, fullAddress: query, source: "manual", savedAt: Date.now() };
    window.localStorage.setItem(MANUAL_LOCATION_STORAGE_KEY, JSON.stringify(entry));
    saveCachedLocation(entry);
  }
};

export const clearManualLocationOverride = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(MANUAL_LOCATION_STORAGE_KEY);
};

// ─── Geocoding helpers ────────────────────────────────────────────────────────
const reverseGeocode = async ({ latitude, longitude }) => {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${latitude}&lon=${longitude}`,
    { headers: { "Accept-Language": "en" } }
  );
  if (!response.ok) throw new Error("Reverse geocode request failed.");
  return response.json();
};

const forwardGeocode = async (locationQuery) => {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(locationQuery)}`,
    { headers: { "Accept-Language": "en" } }
  );
  if (!response.ok) throw new Error("Forward geocode request failed.");
  const results = await response.json();
  if (!results.length) throw new Error("Location not found.");
  return results[0];
};

// ─── Main: resolve exact location ─────────────────────────────────────────────
/**
 * Resolves the user's location with full error differentiation.
 *
 * Returns a location object:
 * {
 *   query, title, fullAddress,
 *   latitude?, longitude?, accuracy?,
 *   source: "manual" | "geolocation" | "cache" | "fallback",
 *   error?: GEO_ERROR.*  // set when GPS failed but we returned a fallback
 * }
 *
 * Never throws — always resolves with the best available location.
 */
export const resolveExactLocation = async ({ preferFresh = true } = {}) => {
  // 1. Manual override takes absolute precedence
  const manual = getManualLocationOverride();
  if (manual?.query) return manual;

  // 2. Valid cache if not forced fresh
  const cached = readCachedLocation();
  if (cached && !preferFresh) return cached;

  // 3. No geolocation support
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return cached || {
      query:       DEFAULT_LOCATION,
      title:       "Location unavailable",
      fullAddress: "Your browser does not support geolocation.",
      source:      "fallback",
      error:       GEO_ERROR.UNSUPPORTED
    };
  }

  // 4. Try GPS
  let position;
  try {
    position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout:            15000,
        maximumAge:         0
      });
    });
  } catch (gpsErr) {
    // Distinguish the three GeolocationPositionError codes
    let errorCode = GEO_ERROR.UNAVAILABLE;
    if (gpsErr?.code === 1) errorCode = GEO_ERROR.DENIED;
    else if (gpsErr?.code === 3) errorCode = GEO_ERROR.TIMEOUT;

    console.warn(`[Location] GPS failed (${errorCode}):`, gpsErr?.message);

    return {
      ...(cached || {
        query:       DEFAULT_LOCATION,
        title:       errorCode === GEO_ERROR.DENIED
          ? "Location access denied"
          : errorCode === GEO_ERROR.TIMEOUT
          ? "Location timed out"
          : "Location unavailable",
        fullAddress: errorCode === GEO_ERROR.DENIED
          ? "Please allow location access in your browser settings."
          : errorCode === GEO_ERROR.TIMEOUT
          ? "GPS took too long. Using default city."
          : "GPS signal unavailable. Using default city."
      }),
      source: cached ? "fallback-cache" : "fallback",
      error:  errorCode
    };
  }

  const { latitude, longitude, accuracy } = position.coords;

  // 5. Reverse geocode the coordinates
  try {
    const data    = await reverseGeocode({ latitude, longitude });
    const address = data.address || {};
    const fullAddress = data.display_name || "Current location";
    const query   = getLocationQuery(address, fullAddress) || fullAddress || DEFAULT_LOCATION;
    const resolved = {
      query,
      title:       getLocationTitle(address) || address.state_district || address.state || "Current location",
      fullAddress,
      latitude,
      longitude,
      accuracy:    accuracy ?? null,
      source:      "geolocation"
    };
    saveCachedLocation(resolved);
    return resolved;
  } catch (geocodeErr) {
    console.warn("[Location] Reverse geocode failed:", geocodeErr.message);
    // We have coordinates but no address — use coordinate string as fallback
    const coordinateFallback = {
      query:       `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      title:       "Current location (GPS)",
      fullAddress: `GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}${accuracy ? ` (±${Math.round(accuracy)}m)` : ""}`,
      latitude,
      longitude,
      accuracy:    accuracy ?? null,
      source:      "geolocation-coords-only"
    };
    saveCachedLocation(coordinateFallback);
    return coordinateFallback;
  }
};
