import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  DEFAULT_LOCATION,
  GEO_ERROR,
  clearManualLocationOverride,
  getCachedExactLocation,
  getManualLocationOverride,
  resolveExactLocation,
  saveManualLocationOverride
} from "../utils/location";

const LocationContext = createContext(null);

export function LocationProvider({ children }) {
  const [location, setLocationState] = useState(
    () => getManualLocationOverride()?.query || getCachedExactLocation()?.query || DEFAULT_LOCATION
  );
  const [locationData, setLocationData] = useState(
    () => getManualLocationOverride() || getCachedExactLocation() || null
  );
  const [locationLabel, setLocationLabel] = useState(
    () => getManualLocationOverride()?.title || getCachedExactLocation()?.title || "Detecting location..."
  );
  // "detecting" | "manual" | "ok" | "fallback" | "denied" | "timeout" | "unavailable"
  const [locationStatus, setLocationStatus] = useState(
    () => getManualLocationOverride()?.query ? "manual" : getCachedExactLocation()?.query ? "cached" : "detecting"
  );
  // Error message to display in UI (null = no error)
  const [locationError, setLocationError] = useState(null);

  const [savedAddresses, setSavedAddresses] = useState([]);
  const listenersRef  = useRef(new Set());
  const didBootstrap  = useRef(false);

  // Notify all page-level subscribers when location changes
  const notifyListeners = useCallback((newLocation, newLocationData) => {
    listenersRef.current.forEach(fn => fn(newLocation, newLocationData));
  }, []);

  const applyLocation = useCallback((query, data, status = "ok") => {
    setLocationState(query);
    setLocationData(data);
    setLocationLabel(data?.title || query);
    setLocationStatus(status);
    // Clear any previous GPS error when location is successfully set
    if (status === "ok" || status === "manual" || status === "cached") {
      setLocationError(null);
    }
    notifyListeners(query, data);
  }, [notifyListeners]);

  // Auto-detect GPS on first mount
  useEffect(() => {
    if (didBootstrap.current) return;
    didBootstrap.current = true;

    // If manual override already set, honour it without hitting GPS
    const manual = getManualLocationOverride();
    if (manual?.query) {
      applyLocation(manual.query, manual, "manual");
      return;
    }

    const bootstrap = async () => {
      const result = await resolveExactLocation({ preferFresh: true });

      if (result.error) {
        // GPS failed — map the error code to a display status
        const statusMap = {
          [GEO_ERROR.DENIED]:      "denied",
          [GEO_ERROR.TIMEOUT]:     "timeout",
          [GEO_ERROR.UNAVAILABLE]: "unavailable",
          [GEO_ERROR.UNSUPPORTED]: "unavailable"
        };
        const errorStatus = statusMap[result.error] || "fallback";
        const errorMsg =
          result.error === GEO_ERROR.DENIED
            ? "Location access was denied. Using default city. You can set it manually using the 📍 button."
            : result.error === GEO_ERROR.TIMEOUT
            ? "GPS timed out. Using default city. You can set it manually using the 📍 button."
            : "GPS unavailable. Using default city. You can set it manually using the 📍 button.";

        applyLocation(result.query || DEFAULT_LOCATION, result, errorStatus);
        setLocationError(errorMsg);
      } else {
        applyLocation(
          result.query || DEFAULT_LOCATION,
          result,
          result.source === "fallback" || result.source === "fallback-cache" ? "fallback" : "ok"
        );
      }
    };

    bootstrap();
  }, [applyLocation]);

  // Set location manually (from picker)
  const setLocationManually = useCallback(async (query, preBuiltData = null) => {
    setLocationError(null);
    try {
      if (preBuiltData) {
        await saveManualLocationOverride(query);
        applyLocation(query, { ...preBuiltData, query, source: "manual" }, "manual");
      } else {
        await saveManualLocationOverride(query);
        const updated = getManualLocationOverride();
        applyLocation(query, updated || { query, title: query }, "manual");
      }
    } catch {
      applyLocation(query, { query, title: query }, "manual");
    }
  }, [applyLocation]);

  // Reset to device GPS
  const resetToDevice = useCallback(async () => {
    clearManualLocationOverride();
    setLocationStatus("detecting");
    setLocationLabel("Detecting location...");
    setLocationError(null);

    const result = await resolveExactLocation({ preferFresh: true });

    if (result.error) {
      const statusMap = {
        [GEO_ERROR.DENIED]:      "denied",
        [GEO_ERROR.TIMEOUT]:     "timeout",
        [GEO_ERROR.UNAVAILABLE]: "unavailable",
        [GEO_ERROR.UNSUPPORTED]: "unavailable"
      };
      const errorMsg =
        result.error === GEO_ERROR.DENIED
          ? "Location access denied. Please allow it in browser settings."
          : result.error === GEO_ERROR.TIMEOUT
          ? "GPS timed out. Set location manually."
          : "GPS unavailable on this device. Set location manually.";

      applyLocation(result.query || DEFAULT_LOCATION, result, statusMap[result.error] || "fallback");
      setLocationError(errorMsg);
      return { success: false, error: result.error, message: errorMsg };
    }

    applyLocation(
      result.query || DEFAULT_LOCATION,
      result,
      result.source === "fallback" || result.source === "fallback-cache" ? "fallback" : "ok"
    );
    return { success: true };
  }, [applyLocation]);

  // Subscribe to location changes (for pages that need to react)
  const subscribeToLocation = useCallback((fn) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  }, []);

  const value = {
    location,
    locationData,
    locationLabel,
    locationStatus,
    locationError,          // ← new: GPS error string or null
    savedAddresses,
    setSavedAddresses,
    setLocationManually,
    resetToDevice,
    subscribeToLocation
  };

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocationContext() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocationContext must be used within LocationProvider");
  return ctx;
}
