import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocationContext } from "../context/LocationContext";
import { buildApiUrl } from "../utils/api";
import { buildAuthHeaders } from "../utils/userProfile";
import "./LocationPicker.css";

const QUICK_CITIES = [
  { label: "Delhi", query: "New Delhi, Delhi" },
  { label: "Mumbai", query: "Mumbai, Maharashtra" },
  { label: "Bengaluru", query: "Bengaluru, Karnataka" },
  { label: "Hyderabad", query: "Hyderabad, Telangana" },
  { label: "Chennai", query: "Chennai, Tamil Nadu" },
  { label: "Kolkata", query: "Kolkata, West Bengal" },
  { label: "Pune", query: "Pune, Maharashtra" },
  { label: "Ahmedabad", query: "Ahmedabad, Gujarat" },
  { label: "Jaipur", query: "Jaipur, Rajasthan" },
  { label: "Noida", query: "Noida, Uttar Pradesh" }
];

const debounce = (fn, delay) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
};

export default function LocationPicker() {
  const { location, locationLabel, locationStatus, locationError, setLocationManually, resetToDevice } = useLocationContext();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [settingLocation, setSettingLocation] = useState(false);
  const [activeTab, setActiveTab] = useState("search"); // "search" | "saved"
  const [statusMsg, setStatusMsg] = useState("");
  const inputRef = useRef(null);
  const modalRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
      fetchSavedAddresses();
    } else {
      setSearchQuery("");
      setSuggestions([]);
      setStatusMsg("");
    }
  }, [open]);

  const fetchSavedAddresses = async () => {
    setLoadingSaved(true);
    try {
      const res = await fetch(buildApiUrl("/api/location/saved"), {
        headers: buildAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.addresses?.length) {
        setSavedAddresses(data.addresses);
      }
    } catch {
      // Silently fail — saved addresses are bonus
    } finally {
      setLoadingSaved(false);
    }
  };

  // Nominatim autocomplete
  const fetchSuggestions = useCallback(
    debounce(async (q) => {
      if (!q.trim() || q.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      setLoadingSuggestions(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=in&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { headers: { "Accept-Language": "en" } });
        const results = await res.json();
        setSuggestions(results.slice(0, 6));
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 420),
    []
  );

  useEffect(() => {
    fetchSuggestions(searchQuery);
  }, [searchQuery, fetchSuggestions]);

  const applyLocationChoice = async ({ query, latitude, longitude, title, addressId }) => {
    setSettingLocation(true);
    setStatusMsg("Setting location...");

    try {
      // 1. Save locally
      await setLocationManually(query, { query, title: title || query, latitude, longitude });

      // 2. Attempt to push to Zomato MCP session (best-effort)
      const body = { query };
      if (addressId) body.addressId = addressId;
      if (latitude) body.latitude = latitude;
      if (longitude) body.longitude = longitude;

      const res = await fetch(buildApiUrl("/api/location/set"), {
        method: "POST",
        headers: buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (data.method === "local-only") {
        setStatusMsg("📍 Location saved locally. Zomato sync not available right now.");
      } else {
        setStatusMsg(`✅ Location set via Zomato (${data.method})`);
      }

      setTimeout(() => setOpen(false), 800);
    } catch {
      setStatusMsg("📍 Location saved locally.");
      setTimeout(() => setOpen(false), 600);
    } finally {
      setSettingLocation(false);
    }
  };

  const handleSuggestionSelect = (s) => {
    const addressParts = s.address || {};
    const parts = [
      addressParts.suburb || addressParts.neighbourhood || addressParts.road,
      addressParts.city || addressParts.town || addressParts.village,
      addressParts.state
    ].filter(Boolean);
    const title = parts.slice(0, 2).join(", ") || s.display_name.split(",").slice(0, 2).join(",");
    const query = s.display_name;
    applyLocationChoice({
      query,
      title,
      latitude: parseFloat(s.lat),
      longitude: parseFloat(s.lon)
    });
  };

  const handleQuickCity = (city) => {
    applyLocationChoice({ query: city.query, title: city.label });
  };

  const handleSavedAddress = (addr) => {
    const query = addr.fullAddress || `${addr.area}, ${addr.city}`.trim();
    applyLocationChoice({
      query,
      title: `${addr.label} · ${addr.area || addr.city}`,
      latitude: addr.latitude,
      longitude: addr.longitude,
      addressId: addr.id
    });
  };

  const handleUseDevice = async () => {
    setSettingLocation(true);
    setStatusMsg("Detecting your GPS location...");
    const result = await resetToDevice();
    if (!result.success) {
      // Show the specific error from context
      setStatusMsg(result.message || "Could not detect location. Please set it manually.");
      setSettingLocation(false);
      return; // do NOT close the modal — let user set manually
    }
    setStatusMsg("📍 Location updated to your GPS position.");
    setTimeout(() => setOpen(false), 800);
    setSettingLocation(false);
  };

  const dotClass =
    locationStatus === "detecting"   ? "loc-dot detecting" :
    locationStatus === "denied"      ? "loc-dot denied" :
    locationStatus === "timeout"     ? "loc-dot denied" :
    locationStatus === "unavailable" ? "loc-dot denied" :
    locationStatus === "fallback"    ? "loc-dot fallback" :
    locationStatus === "manual"      ? "loc-dot manual" : "loc-dot ok";

  return (
    <>
      {/* Pill button */}
      <button
        className="loc-pill"
        onClick={() => setOpen(true)}
        title="Change your delivery location"
        id="location-picker-btn"
        aria-haspopup="dialog"
      >
        <span className={dotClass} />
        <span className="loc-pill-label">
          {locationStatus === "detecting" ? "Detecting..." : locationLabel.split(",")[0]}
        </span>
        <svg className="loc-pill-chevron" viewBox="0 0 12 12" width="11" height="11" fill="none">
          <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Modal */}
      {open && (
        <div className="loc-overlay" role="dialog" aria-modal="true" aria-label="Location picker">
          <div className="loc-modal" ref={modalRef}>
            <div className="loc-modal-header">
              <div className="loc-modal-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" fill="currentColor"/>
                </svg>
                <h2>Set your delivery location</h2>
              </div>
              <button className="loc-close-btn" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>

            <div className="loc-current-strip">
              <span className={dotClass} />
              <span className="loc-current-text">
                {locationStatus === "detecting"   ? "Detecting your location..." :
                 locationStatus === "denied"      ? "⚠️ Location access denied" :
                 locationStatus === "timeout"     ? "⚠️ GPS timed out" :
                 locationStatus === "unavailable" ? "⚠️ GPS unavailable" :
                 `Currently: ${locationLabel}`}
              </span>
            </div>

            {/* Show GPS error hint in modal */}
            {locationError && (
              <div className="loc-error-banner">
                <span>⚠️</span>
                <span>{locationError}</span>
              </div>
            )}

            {/* Search input */}
            <div className="loc-search-wrap">
              <svg className="loc-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
                <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input
                ref={inputRef}
                type="text"
                className="loc-search-input"
                placeholder="Search city, area, or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={settingLocation}
                id="location-search-input"
              />
              {searchQuery && (
                <button className="loc-input-clear" onClick={() => { setSearchQuery(""); setSuggestions([]); inputRef.current?.focus(); }}>✕</button>
              )}
            </div>

            {/* Tabs */}
            {savedAddresses.length > 0 && (
              <div className="loc-tabs">
                <button className={`loc-tab ${activeTab === "search" ? "active" : ""}`} onClick={() => setActiveTab("search")}>Search</button>
                <button className={`loc-tab ${activeTab === "saved" ? "active" : ""}`} onClick={() => setActiveTab("saved")}>
                  Saved Addresses
                  <span className="loc-tab-badge">{savedAddresses.length}</span>
                </button>
              </div>
            )}

            <div className="loc-modal-body">
              {/* Suggestions from Nominatim */}
              {activeTab === "search" && (
                <>
                  {loadingSuggestions && (
                    <div className="loc-loader-row">
                      <span className="loc-spinner" />
                      <span>Searching locations...</span>
                    </div>
                  )}

                  {suggestions.length > 0 && (
                    <div className="loc-suggestions">
                      {suggestions.map((s) => {
                        const city = s.address?.city || s.address?.town || s.address?.village || "";
                        const area = s.address?.suburb || s.address?.neighbourhood || s.address?.road || "";
                        const state = s.address?.state || "";
                        return (
                          <button
                            key={s.place_id}
                            className="loc-suggestion-item"
                            onClick={() => handleSuggestionSelect(s)}
                            disabled={settingLocation}
                          >
                            <svg className="loc-suggestion-pin" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                            </svg>
                            <div className="loc-suggestion-text">
                              <span className="loc-suggestion-main">{area || city}</span>
                              <span className="loc-suggestion-sub">{[city, state].filter(Boolean).join(", ")}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Use device GPS */}
                  <button className="loc-device-btn" onClick={handleUseDevice} disabled={settingLocation}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="3" fill="currentColor"/>
                      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                    Use my current location (GPS)
                  </button>

                  {/* Quick cities */}
                  {!searchQuery && (
                    <>
                      <p className="loc-section-label">Popular cities</p>
                      <div className="loc-quick-grid">
                        {QUICK_CITIES.map((city) => (
                          <button
                            key={city.label}
                            className={`loc-quick-chip${location.toLowerCase().includes(city.label.toLowerCase()) ? " active" : ""}`}
                            onClick={() => handleQuickCity(city)}
                            disabled={settingLocation}
                          >
                            {city.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Saved Zomato addresses */}
              {activeTab === "saved" && (
                <div className="loc-saved-list">
                  {loadingSaved ? (
                    <div className="loc-loader-row">
                      <span className="loc-spinner" />
                      <span>Loading saved addresses...</span>
                    </div>
                  ) : savedAddresses.length === 0 ? (
                    <p className="loc-empty-msg">No saved Zomato addresses found. Sign in and add addresses in the Zomato app.</p>
                  ) : (
                    savedAddresses.map((addr) => (
                      <button
                        key={addr.id}
                        className="loc-saved-item"
                        onClick={() => handleSavedAddress(addr)}
                        disabled={settingLocation}
                      >
                        <div className="loc-saved-icon">
                          {addr.label?.toLowerCase().includes("home") ? "🏠" :
                           addr.label?.toLowerCase().includes("work") ? "🏢" :
                           addr.label?.toLowerCase().includes("hotel") ? "🏨" : "📍"}
                        </div>
                        <div className="loc-saved-text">
                          <span className="loc-saved-label">{addr.label}</span>
                          <span className="loc-saved-address">{addr.fullAddress || `${addr.area}, ${addr.city}`}</span>
                        </div>
                        <svg className="loc-saved-chevron" width="14" height="14" viewBox="0 0 12 12" fill="none">
                          <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Status message */}
              {statusMsg && (
                <div className="loc-status-msg">{statusMsg}</div>
              )}

              {settingLocation && (
                <div className="loc-setting-overlay">
                  <span className="loc-spinner large" />
                  <span>Updating location...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
