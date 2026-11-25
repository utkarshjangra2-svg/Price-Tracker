import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl, parseJsonResponse } from "../utils/api";
import { buildAuthHeaders } from "../utils/userProfile";
import { DEFAULT_LOCATION } from "../utils/location";
import { useLocationContext } from "../context/LocationContext";
import { useAddToCart } from "../utils/useAddToCart";
import { getDirectZomatoUrl, sanitizeZomatoUrl, openZomatoUrl } from "../utils/zomatoUrl";
import "./DishFinder.css";

// Group a flat deal list into one entry per restaurant (keep highest-rated deal per restaurant)
const groupByRestaurant = (deals) => {
  const map = new Map();
  for (const deal of deals) {
    const key = (deal.restaurant || "").trim().toLowerCase();
    if (!key) continue;
    const existing = map.get(key);
    if (!existing || Number(deal.rating) > Number(existing.rating)) {
      map.set(key, deal);
    }
  }
  return [...map.values()].sort((a, b) => Number(b.rating) - Number(a.rating));
};

const POPULAR_DISHES = [
  "Biryani", "Butter Chicken", "Pizza", "Burger", "Paneer Butter Masala",
  "Chicken Tikka", "Momos", "Noodles", "Pasta", "Shawarma",
  "Dosa", "Chole Bhature", "Dal Makhani", "Fried Rice", "Thali",
  "Kebab", "Rolls", "Samosa", "Pav Bhaji", "Paratha",
  "Ice Cream", "Cake", "Tandoori Chicken", "Fish Curry"
];

const formatCurrency = (v) => `Rs${Math.round(v ?? 0)}`;

export default function DishFinder() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("search"); // "search" | "nearby"
  const [dish, setDish] = useState("");
  const [budget, setBudget] = useState("");
  const { location, locationData, locationLabel, locationStatus, subscribeToLocation } = useLocationContext();
  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [expandedCoupons, setExpandedCoupons] = useState(new Set());
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [cartStatus, setCartStatus] = useState({}); // { [dealKey]: 'loading'|'done'|'error' }
  const handleAddToCart = useAddToCart();
  const onCartStatus = (key, s) => setCartStatus((prev) => ({ ...prev, [key]: s }));
  const acRef = useRef(null);

  // ── Nearby Restaurants state ──────────────────────────────────
  const [nearbyRestaurants, setNearbyRestaurants] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyFetched, setNearbyFetched] = useState(false);

  const fetchNearby = useCallback(async (locOverride) => {
    const effectiveLoc = locOverride || locationData?.query || location || DEFAULT_LOCATION;
    setNearbyLoading(true);
    try {
      const res = await fetch(
        buildApiUrl(`/api/deals?location=${encodeURIComponent(effectiveLoc)}&limit=30`),
        { headers: buildAuthHeaders() }
      );
      const data = await parseJsonResponse(res);
      const deals = data.deals || [];
      setNearbyRestaurants(groupByRestaurant(deals));
    } catch {
      setNearbyRestaurants([]);
    } finally {
      setNearbyLoading(false);
      setNearbyFetched(true);
    }
  }, [location, locationData]);

  // Close autocomplete on outside click
  useEffect(() => {
    const handler = (e) => {
      if (acRef.current && !acRef.current.contains(e.target)) {
        setShowAutocomplete(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Auto-fetch nearby on mount
  useEffect(() => {
    fetchNearby();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-search / re-fetch when global location changes
  useEffect(() => {
    return subscribeToLocation((newLoc) => {
      if (searched) {
        setSearched(false);
        setResults([]);
      }
      // Always refresh nearby list on location change
      setNearbyFetched(false);
      fetchNearby(newLoc);
    });
  }, [subscribeToLocation, searched, fetchNearby]);

  const filteredDishes = dish.trim()
    ? POPULAR_DISHES.filter((d) =>
        d.toLowerCase().includes(dish.toLowerCase())
      ).slice(0, 8)
    : POPULAR_DISHES.slice(0, 8);

  const handleSearch = useCallback(async () => {
    if (!dish.trim() || loading) return;

    setLoading(true);
    setSearched(true);
    setResults([]);
    setMeta(null);
    setSelectedDeal(null);

    try {
      const userRaw = localStorage.getItem("user");
      let user = {};
      try { user = userRaw ? JSON.parse(userRaw) : {}; } catch { /* ignore */ }

      const effectiveLocation = locationData?.query || location || DEFAULT_LOCATION;

      const res = await fetch(buildApiUrl("/api/dish-search"), {
        method: "POST",
        headers: buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          dish: dish.trim(),
          budget: Number(budget) || 0,
          location: effectiveLocation,
          locationData,
          user
        })
      });

      const data = await parseJsonResponse(res);

      if (data.success && data.deals?.length) {
        setResults(data.deals);
        setMeta(data.meta || null);
      } else {
        setResults([]);
        setMeta(null);
      }
    } catch {
      setResults([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [dish, budget, location, locationData, loading]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      setShowAutocomplete(false);
      handleSearch();
    }
  };

  const toggleCouponExpand = (idx) => {
    setExpandedCoupons((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const getDealKey = (deal) => `${deal.restaurant}-${deal.dishName}-${deal.res_id || ""}`;

  const liveDeals = results.filter((deal) => deal.isOrderableNow);
  const trackingDeals = results.filter((deal) => !deal.isOrderableNow);

  const renderDealCard = (deal, idx, isTracking = false) => {
    const effectivePrice = deal.couponAdjustedPrice || deal.finalPrice;
    const hasCoupons = deal.bestCouponCombo?.length > 0;
    const couponCodes = hasCoupons
      ? deal.bestCouponCombo.map((c) => c.code).join(" + ")
      : null;
    const isExpanded = expandedCoupons.has(`${isTracking ? "t" : "l"}-${idx}`);
    const key = getDealKey(deal);
    const cartState = cartStatus[key];
    const canCart = Boolean(deal.restaurant);

    return (
      <article
        key={key}
        className={`df-card${selectedDeal === deal ? " selected" : ""}${isTracking ? " df-card-tracking" : ""}`}
        onClick={() => {
          const rid = deal.restaurantId || deal.res_id;
          if (rid) navigate(`/restaurant/${rid}`);
        }}
        style={{ animationDelay: `${Math.min(idx * 0.04, 0.4)}s`, cursor: "pointer" }}
      >
        {/* Top line */}
        <div className="df-card-topline">
          <div className="df-card-badges">
            <span className="df-badge rank">#{idx + 1}</span>
            {deal.isOrderableNow ? (
              <span className="df-badge live">Live</span>
            ) : (
              <span className="df-badge offline">Tracking</span>
            )}
            {deal.isTrendingLow && <span className="df-badge trend">Trending Low</span>}
          </div>
          <div className="df-card-price">
            <span className="df-price-current">{formatCurrency(effectivePrice)}</span>
            {deal.basePrice > effectivePrice && (
              <span className="df-price-original">{formatCurrency(deal.basePrice)}</span>
            )}
          </div>
        </div>

        {/* Restaurant & dish */}
        <h3 className="df-card-title">{deal.restaurant}</h3>
        <p className="df-card-dish">{deal.dishName}</p>

        {/* Meta */}
        <div className="df-card-meta">
          <span className="df-meta-rating">⭐ {deal.rating}</span>
          {deal.eta && <span className="df-meta-distance">🕒 {deal.eta}</span>}
          {deal.location && (
            <span className="df-meta-location" title={deal.location}>
               {deal.location.split(",").slice(0, 2).join(",")}
            </span>
          )}
        </div>

        {/* Coupons */}
        {hasCoupons && (
          <div className="df-card-coupons">
            <button
              className="df-coupon-toggle"
              onClick={(event) => {
                event.stopPropagation();
                toggleCouponExpand(`${isTracking ? "t" : "l"}-${idx}`);
              }}
            >
              <span className="df-coupon-code">{couponCodes}</span>
              <span className="df-coupon-arrow">{isExpanded ? "▲" : "▼"}</span>
            </button>
            {isExpanded && (
              <div className="df-coupon-details">
                {deal.bestCouponCombo.map((coupon, cidx) => (
                  <div key={cidx} className="df-coupon-item">
                    <strong>{coupon.code}</strong>
                    {coupon.source === "zomato-live" && <span className="df-coupon-live-tag"> ✓ Your Zomato coupon</span>}
                    : {coupon.description} — saves {formatCurrency(coupon.savings)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="df-card-actions">
          {sanitizeZomatoUrl(deal, deal.restaurant) && (
            <button
              className="df-order-btn df-nearby-zomato-btn"
              onClick={(e) => { e.stopPropagation(); openZomatoUrl(deal, deal.restaurant); }}
              style={{ marginRight: '8px' }}
            >
              Order on Zomato ↗
            </button>
          )}
          {canCart && (
            <button
              type="button"
              className={`df-order-btn${cartState === "done" ? " df-btn-success" : cartState === "error" ? " df-btn-error" : ""}`}
              disabled={cartState === "loading"}
              onClick={(e) => { e.stopPropagation(); handleAddToCart(deal, { onStatus: onCartStatus }); }}
            >
              {cartState === "loading" ? "Adding..." : cartState === "done" ? "✓ Added!" : cartState === "error" ? "Retry" : "Add to Cart"}
            </button>
          )}
        </div>
      </article>
    );
  };

  // ── Nearby restaurant card renderer ──────────────────────────
  const renderNearbyCard = (rest, idx) => {
    const rid = rest.restaurantId || rest.res_id;
    const directZomatoUrl = getDirectZomatoUrl(rest, rest.restaurant);
    const cuisineLabel = rest.cuisine || rest.resolvedCuisine || "";
    const locationSnippet = rest.location ? rest.location.split(",").slice(0, 2).join(",") : "";
    return (
      <article
        key={`${rest.restaurant}-${idx}`}
        className="df-nearby-bar"
        style={{ animationDelay: `${Math.min(idx * 0.05, 0.5)}s` }}
        onClick={() => rid && navigate(`/restaurant/${rid}`)}
      >
        {rest.imageUrl ? (
          <img src={rest.imageUrl} alt={rest.restaurant} className="df-nearby-bar-img" />
        ) : (
          <div className="df-nearby-bar-img df-nearby-bar-img-placeholder">
            <span>🍽️</span>
          </div>
        )}
        <div className="df-nearby-bar-body">
          <div className="df-nearby-bar-topline">
            {rest.isOrderableNow ? (
              <span className="df-badge live">Open</span>
            ) : (
              <span className="df-badge offline">Closed</span>
            )}
            {cuisineLabel && <span className="df-cuisine-chip">{cuisineLabel}</span>}
          </div>
          <h3 className="df-nearby-bar-name">{rest.restaurant}</h3>
          <div className="df-nearby-bar-meta">
            <span>⭐ {rest.rating || "--"}</span>
            {rest.eta && <span> {rest.eta}</span>}
            {locationSnippet && <span className="df-nearby-location" title={rest.location}> {locationSnippet}</span>}
          </div>
        </div>
        <div className="df-nearby-bar-actions" onClick={(e) => e.stopPropagation()}>
          {rid && (
            <button
              className="df-nearby-bar-btn"
              onClick={(e) => { e.stopPropagation(); navigate(`/restaurant/${rid}`); }}
            >
              Menu
            </button>
          )}
          {rest.isOrderableNow && directZomatoUrl && (
            <a
              className="df-nearby-bar-btn df-nearby-zomato-btn"
              href={directZomatoUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ textDecoration: 'none' }}
            >
              Order ↗
            </a>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="dish-finder-page">
      <div className="dish-finder-shell">
        {/* Nav */}
        <nav className="df-nav">
          <div style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }} onClick={() => navigate("/")}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, boxShadow: "0 2px 8px rgba(234, 88, 12, 0.25)" }}>
              SD
            </div>
            <div>
              <p className="df-nav-eyebrow">Price finder</p>
              <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800 }}>Dish Finder</h1>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => navigate("/recommendations")}>Deals</button>
            <button onClick={() => navigate("/PriceTrack")}>Live Prices</button>
            <button onClick={() => navigate("/")}>Home</button>
          </div>
        </nav>

        {/* Hero */}
        <section className="df-hero">
          <h2>Find the Cheapest Dish Near You</h2>
          <p>
            Enter a dish name and budget. We search across Zomato restaurants,
            apply your available coupons automatically, and show the lowest price first.
          </p>
        </section>

        {/* Search Card */}
        <div className="df-search-card">
          <div className="df-form">
            <div className="df-input-row">
              <div className="df-input-group df-autocomplete-wrapper" ref={acRef}>
                <label>Dish Name</label>
                <input
                  type="text"
                  placeholder="e.g. Biryani, Pizza, Momos..."
                  value={dish}
                  onChange={(e) => {
                    setDish(e.target.value);
                    setShowAutocomplete(true);
                  }}
                  onFocus={() => setShowAutocomplete(true)}
                  onKeyDown={handleKeyDown}
                  id="dish-finder-input"
                />
                {showAutocomplete && filteredDishes.length > 0 && (
                  <div className="df-autocomplete-list">
                    {filteredDishes.map((d) => (
                      <div
                        key={d}
                        className="df-autocomplete-item"
                        onClick={() => {
                          setDish(d);
                          setShowAutocomplete(false);
                        }}
                      >
                        {d}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="df-input-group">
                <label>Budget (optional)</label>
                <input
                  type="number"
                  placeholder="e.g. 300"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  onKeyDown={handleKeyDown}
                  min="0"
                  id="dish-finder-budget"
                />
              </div>
            </div>

            {/* Location — controlled globally via header LocationPicker */}
            <div className={`df-location-row${locationStatus === "manual" ? " is-manual" : ""}`}>
              <span className={`df-gps-dot ${locationStatus === "detecting" ? "detecting" : locationStatus === "fallback" ? "error" : ""}`} />
              <span className="df-location-text">
                {locationStatus === "manual" && <span className="df-manual-tag">Manual · </span>}
                <strong>{locationLabel}</strong>
              </span>
              <span className="df-location-hint">Change via header 📍</span>
            </div>

            <button
              className="df-search-btn"
              onClick={() => { setShowAutocomplete(false); handleSearch(); }}
              disabled={!dish.trim() || loading}
              id="dish-finder-search-btn"
            >
              {loading ? "Searching..." : "Search Lowest Prices"}
            </button>
          </div>
        </div>

        {/* ── Tab Bar ─────────────────────────────────────────── */}
        <div className="df-tab-bar">
          <button
            className={`df-tab${activeTab === "search" ? " df-tab-active" : ""}`}
            onClick={() => setActiveTab("search")}
          >
           Search Results
          </button>
          <button
            className={`df-tab${activeTab === "nearby" ? " df-tab-active" : ""}`}
            onClick={() => { setActiveTab("nearby"); if (!nearbyFetched) fetchNearby(); }}
          >
           Nearby Restaurants
            {nearbyRestaurants.length > 0 && <span className="df-tab-count">{nearbyRestaurants.length}</span>}
          </button>
        </div>

        {/* ── Nearby Restaurants Panel ─────────────────────────── */}
        {activeTab === "nearby" && (
          <div className="df-nearby-panel">
            <div className="df-nearby-header">
              <h3>Restaurants near <strong>{locationLabel.split(",")[0]}</strong></h3>
              <button className="df-nearby-refresh-btn" onClick={() => fetchNearby()} disabled={nearbyLoading}>
                {nearbyLoading ? "Refreshing…" : "↻ Refresh"}
              </button>
            </div>

            {nearbyLoading && (
              <div className="df-skeleton-grid">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="df-skeleton-card df-skeleton-nearby" />
                ))}
              </div>
            )}

            {!nearbyLoading && nearbyFetched && nearbyRestaurants.length === 0 && (
              <div className="df-empty">
                <h3>No nearby restaurants found</h3>
                <p>Try changing your location using the header 📍 picker.</p>
              </div>
            )}

            {!nearbyLoading && nearbyRestaurants.length > 0 && (
              <div className="df-nearby-list">
                {nearbyRestaurants.map((rest, idx) => renderNearbyCard(rest, idx))}
              </div>
            )}
          </div>
        )}

        {activeTab === "search" && (
          <>
        {/* Loading */}
        {loading && (
          <div className="df-skeleton-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="df-skeleton-card" />
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && searched && results.length > 0 && (
          <>
            <div className="df-results-header">
              <h3>{results.length} restaurants found</h3>
              <div className="df-results-meta">
                {meta?.bestPrice != null && (
                  <span>Best price: <strong>{formatCurrency(meta.bestPrice)}</strong></span>
                )}
                {meta?.bestCoupon && (
                  <span>Best coupon: <strong>{meta.bestCoupon}</strong></span>
                )}
                <span>Live: <strong>{meta?.liveNowCount ?? 0}</strong></span>
                <span>Location: <strong>{locationLabel}</strong></span>
              </div>
            </div>

            {selectedDeal ? (
              <section className="df-detail-panel">
                <div className="df-detail-header">
                  <div>
                    <span className="df-detail-tag">{selectedDeal.isOrderableNow ? "Live offer detail" : "Tracking deal"}</span>
                    <h3>{selectedDeal.dishName || selectedDeal.cuisine || "Selected offer"}</h3>
                    <p className="df-detail-subtitle">
                      {selectedDeal.restaurant} · {selectedDeal.location || location}
                    </p>
                  </div>
                  <div className="df-detail-price-block">
                    <span className="df-price-current">
                      {formatCurrency(selectedDeal.couponAdjustedPrice || selectedDeal.finalPrice)}
                    </span>
                    {selectedDeal.basePrice > (selectedDeal.couponAdjustedPrice || selectedDeal.finalPrice) && (
                      <span className="df-price-original">
                        {formatCurrency(selectedDeal.basePrice)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="df-detail-meta">
                  <span>Rating: <strong>{selectedDeal.rating || "--"}</strong></span>
                  <span>ETA: <strong>{selectedDeal.eta || "--"}</strong></span>
                  <span style={{ color: selectedDeal.isOrderableNow ? "#22c55e" : "#94a3b8" }}>
                    {selectedDeal.isOrderableNow ? "Orderable now" : "Tracking only"}
                  </span>
                </div>

                <div className="df-detail-body">
                  {selectedDeal.offerText ? (
                    <p className="df-detail-description">{selectedDeal.offerText}</p>
                  ) : (
                    <p className="df-detail-description">
                      {selectedDeal.isOrderableNow
                        ? "Live Zomato deal, checked for current availability and coupons."
                        : "This deal is currently being tracked. Price shown is live market estimate."}
                    </p>
                  )}

                  {selectedDeal.bestCouponCombo?.length ? (
                    <div className="df-detail-coupons">
                      <h4>Best coupon combo</h4>
                      <p>{selectedDeal.bestCouponCombo.map((coupon) => coupon.code).join(" + ")}</p>
                      <ul>
                        {selectedDeal.bestCouponCombo.map((coupon, cidx) => (
                          <li key={cidx}>
                            {coupon.code}
                            {coupon.source === "zomato-live" && " ✓ Your Zomato coupon"}
                            : {coupon.description} — saves {formatCurrency(coupon.savings)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="df-detail-coupons muted">
                      No coupon matched this deal for your account.
                    </div>
                  )}

                  {/* Cross-deal combo tip: not applicable for a single dish — only surfaced in Best Picks */}
                </div>

                <div className="df-detail-actions">
                  {selectedDeal.isOrderableNow ? (
                    <>
                      {getDirectZomatoUrl(selectedDeal, selectedDeal.restaurant) ? (
                        <a
                          className="df-order-btn"
                          href={sanitizeZomatoUrl(selectedDeal, selectedDeal.restaurant)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ textDecoration: 'none', textAlign: 'center' }}
                        >
                          Open in Zomato
                        </a>
                      ) : (selectedDeal.restaurantId || selectedDeal.res_id) ? (
                        <button
                          className="df-order-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/restaurant/${selectedDeal.restaurantId || selectedDeal.res_id}`);
                          }}
                        >
                          View Restaurant Menu
                        </button>
                      ) : null}
                      {selectedDeal.res_id && selectedDeal.catalogueId ? (
                        <button
                          className="df-order-btn"
                          disabled={cartStatus[getDealKey(selectedDeal)] === "loading"}
                          onClick={(e) => { e.stopPropagation(); handleAddToCart(selectedDeal, { onStatus: onCartStatus }); }}
                        >
                          {cartStatus[getDealKey(selectedDeal)] === "loading"
                            ? "Adding..."
                            : cartStatus[getDealKey(selectedDeal)] === "done"
                            ? "✓ Added to Cart!"
                            : "Add to Cart (Auto-coupon)"}


                        </button>
                      ) : !selectedDeal.orderUrl ? (
                        <span className="df-order-unavailable">
                          Search &ldquo;{selectedDeal.restaurant}&rdquo; on Zomato app
                        </span>
                      ) : (
                        <span className="df-order-unavailable">
                          Direct cart unavailable — use the restaurant menu above
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="df-order-unavailable">
                      This deal is tracking only — not orderable right now.
                    </span>
                  )}
                </div>
              </section>
            ) : null}



            
            {liveDeals.length > 0 && (
              <>
                <div className="df-section-label">
                  <span className="df-badge live">🟢 Live & Orderable Now</span>
                  <small>{liveDeals.length} deals ready to order</small>
                </div>
                <div className="df-results-grid">
                  {liveDeals.map((deal, idx) => renderDealCard(deal, idx, false))}
                </div>
              </>
            )}

            
            {trackingDeals.length > 0 && (
              <>
                <div className="df-section-label df-section-label-muted">
                  <span className="df-badge offline">⚪ Also Tracking</span>
                  <small>{trackingDeals.length} deals being monitored</small>
                </div>
                <div className="df-results-grid">
                  {trackingDeals.map((deal, idx) => renderDealCard(deal, idx, true))}
                </div>
              </>
            )}
          </>
        )}

        {/* No Results */}
        {!loading && searched && results.length === 0 && (
          <div className="df-empty">
            <h3>No results found</h3>
            <p>
              Try a different dish name, increase your budget, or change the location.
            </p>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
