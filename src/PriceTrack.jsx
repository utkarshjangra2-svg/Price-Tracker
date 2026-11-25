import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Price.css";
import { buildApiUrl } from "./utils/api";
import { buildAuthHeaders, buildUserPayload } from "./utils/userProfile";
import { getSourceStatus } from "./utils/sourceStatus";
import { useLocationContext } from "./context/LocationContext";
import { useAddToCart } from "./utils/useAddToCart";
import { sanitizeZomatoUrl, openZomatoUrl } from "./utils/zomatoUrl";

const sourceLabels = {
  mcp: "Zomato MCP Live",
  "zomato-native-app": "Zomato MCP Live",
  "zomato-web": "Zomato Web Live",
  multiple: "Cross-app comparison",
  swiggy: "Swiggy comparison",
  "swiggy-food-mcp": "Swiggy Food MCP",
  zepto: "Zepto comparison",
  unavailable: "No Live Deals Found"
};

const PLATFORM_COLORS = {
  Zomato: { bg: "linear-gradient(135deg, #e23744, #ff5a5f)", text: "#fff", badge: "#e23744" },
  Swiggy: { bg: "linear-gradient(135deg, #fc8019, #ff9f40)", text: "#fff", badge: "#fc8019" },
};

const formatCurrency = (value) => `₹${Math.round(value ?? 0)}`;
const formatLiveTimestamp = (value) =>
  value
    ? new Date(value).toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit"
    })
    : "--";

const getDealPlatform = (deal = {}) => {
  const source = String(deal.platform || deal.source || deal.provider || deal.orderUrl || "").toLowerCase();
  if (source.includes("swiggy")) return "Swiggy";
  if (source.includes("zepto")) return "Zepto";
  return "Zomato";
};

// Simple SVG bar chart for Zomato vs Swiggy comparison
function PriceComparisonChart({ zomatoDeals = [], swiggyDeals = [] }) {
  const getAvg = (deals) => {
    const prices = deals.map(d => d.couponAdjustedPrice || d.finalPrice || 0).filter(p => p > 0);
    return prices.length ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : 0;
  };
  const getMin = (deals) => {
    const prices = deals.map(d => d.couponAdjustedPrice || d.finalPrice || 0).filter(p => p > 0);
    return prices.length ? Math.min(...prices) : 0;
  };
  const getMax = (deals) => {
    const prices = deals.map(d => d.couponAdjustedPrice || d.finalPrice || 0).filter(p => p > 0);
    return prices.length ? Math.max(...prices) : 0;
  };

  const zAvg = getAvg(zomatoDeals);
  const sAvg = getAvg(swiggyDeals);
  const zMin = getMin(zomatoDeals);
  const sMin = getMin(swiggyDeals);
  const zMax = getMax(zomatoDeals);
  const sMax = getMax(swiggyDeals);
  const maxVal = Math.max(zAvg, sAvg, zMax, sMax, 100);

  if (!zomatoDeals.length && !swiggyDeals.length) return null;

  const barHeight = (val) => Math.max((val / maxVal) * 140, 8);

  return (
    <div className="comparison-chart-container">
      <h3 className="comparison-chart-title">Zomato vs Swiggy — Price Comparison</h3>
      <div className="comparison-chart-body">
        <div className="comparison-chart-grid">
          {/* Zomato bars */}
          <div className="chart-bar-group">
            <span className="chart-bar-label">Avg</span>
            <div className="chart-bar-track">
              <div className="chart-bar zomato" style={{ height: barHeight(zAvg) }}>{zAvg ? `₹${zAvg}` : "—"}</div>
            </div>
            <span className="chart-platform-label zomato-label">Zomato</span>
          </div>
          <div className="chart-bar-group">
            <span className="chart-bar-label">Avg</span>
            <div className="chart-bar-track">
              <div className="chart-bar swiggy" style={{ height: barHeight(sAvg) }}>{sAvg ? `₹${sAvg}` : "—"}</div>
            </div>
            <span className="chart-platform-label swiggy-label">Swiggy</span>
          </div>

          <div className="chart-divider" />

          <div className="chart-bar-group">
            <span className="chart-bar-label">Min</span>
            <div className="chart-bar-track">
              <div className="chart-bar zomato" style={{ height: barHeight(zMin) }}>{zMin ? `₹${zMin}` : "—"}</div>
            </div>
            <span className="chart-platform-label zomato-label">Zomato</span>
          </div>
          <div className="chart-bar-group">
            <span className="chart-bar-label">Min</span>
            <div className="chart-bar-track">
              <div className="chart-bar swiggy" style={{ height: barHeight(sMin) }}>{sMin ? `₹${sMin}` : "—"}</div>
            </div>
            <span className="chart-platform-label swiggy-label">Swiggy</span>
          </div>

          <div className="chart-divider" />

          <div className="chart-bar-group">
            <span className="chart-bar-label">Max</span>
            <div className="chart-bar-track">
              <div className="chart-bar zomato" style={{ height: barHeight(zMax) }}>{zMax ? `₹${zMax}` : "—"}</div>
            </div>
            <span className="chart-platform-label zomato-label">Zomato</span>
          </div>
          <div className="chart-bar-group">
            <span className="chart-bar-label">Max</span>
            <div className="chart-bar-track">
              <div className="chart-bar swiggy" style={{ height: barHeight(sMax) }}>{sMax ? `₹${sMax}` : "—"}</div>
            </div>
            <span className="chart-platform-label swiggy-label">Swiggy</span>
          </div>
        </div>

        <div className="comparison-summary-row">
          <div className="comparison-summary-stat">
            <span className="stat-label">Zomato deals</span>
            <span className="stat-value">{zomatoDeals.length}</span>
          </div>
          <div className="comparison-summary-stat">
            <span className="stat-label">Swiggy deals</span>
            <span className="stat-value">{swiggyDeals.length}</span>
          </div>
          <div className="comparison-summary-stat featured">
            <span className="stat-label">Best price</span>
            <span className="stat-value">
              {Math.min(zMin || Infinity, sMin || Infinity) === Infinity
                ? "—"
                : `₹${Math.min(zMin || Infinity, sMin || Infinity)}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PriceTrack() {
  const navigate = useNavigate();
  const { location: globalLocation, locationData: globalLocationData, locationLabel: globalLocationTitle, subscribeToLocation, setLocationManually } = useLocationContext();
  const [location, setLocation] = useState(globalLocation || "");
  const [cuisine, setCuisine] = useState("");
  const [budget, setBudget] = useState("");
  const [results, setResults] = useState([]);
  const [zomatoDeals, setZomatoDeals] = useState([]);
  const [swiggyDeals, setSwiggyDeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [locationTitle, setLocationTitle] = useState(globalLocationTitle || "Locating your address");
  const [source, setSource] = useState("unavailable");
  const [cartStatus, setCartStatus] = useState({});
  const handleAddToCart = useAddToCart();
  const onCartStatus = (key, s) => setCartStatus((prev) => ({ ...prev, [key]: s }));

  const [error, setError] = useState("");
  const [meta, setMeta] = useState(null);
  const [lastQuery, setLastQuery] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const sourceStatus = getSourceStatus(source, diagnostics);
  const activeLocationLabel = lastQuery?.location || location || locationTitle;

  // Keep the location field in sync when global context changes
  useEffect(() => {
    if (globalLocation) {
      setLocation(globalLocation);
      setLocationTitle(globalLocationTitle || globalLocation);
    }
  }, [globalLocation, globalLocationTitle]);

  // Subscribe to location picker changes
  useEffect(() => {
    return subscribeToLocation((newLoc, newData) => {
      setLocation(newLoc);
      setLocationTitle(newData?.title || newLoc);
    });
  }, [subscribeToLocation]);

  const runSearch = useCallback(async ({ location: queryLocation, cuisine: queryCuisine, budget: queryBudget }, options = {}) => {
    const { silent = false } = options;

    if (!queryCuisine || !queryBudget || !queryLocation) {
      setError("Please fill location, dish, and budget.");
      return;
    }

    const budgetValue = Number(queryBudget);
    if (Number.isNaN(budgetValue) || budgetValue <= 0) {
      setError("Budget must be a valid number above 0.");
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    setError("");

    try {
      const res = await fetch(buildApiUrl("/api/deals/search"), {
        method: "POST",
        headers: buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          location: queryLocation,
          cuisine: queryCuisine,
          budget: queryBudget,
          locationData: globalLocationData || null,
          user: buildUserPayload()
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.msg || "Unable to fetch deals");
      }

      setResults(data.deals || []);
      setZomatoDeals(data.zomatoDeals || []);
      setSwiggyDeals(data.swiggyDeals || []);
      setSource(data.source || "fallback");
      setMeta(data.meta || null);
      setDiagnostics(data.diagnostics || null);
      setLastQuery({ location: queryLocation, cuisine: queryCuisine, budget: queryBudget });

      localStorage.setItem(
        "priceTrackPreferences",
        JSON.stringify({ location: queryLocation, cuisine: queryCuisine, budget: queryBudget })
      );
    } catch (requestError) {
      setResults([]);
      setZomatoDeals([]);
      setSwiggyDeals([]);
      setSource("unavailable");
      setMeta(null);
      setDiagnostics(null);
      setError(requestError.message);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [globalLocationData]);

  const handleSearch = async (e) => {
    e.preventDefault();
    // Sync the location to global context on submit (not just on blur)
    if (location.trim() && location.trim() !== globalLocation) {
      setLocationManually(location.trim());
    }
    await runSearch({ location, cuisine, budget });
  };

  useEffect(() => {
    if (!lastQuery) {
      return undefined;
    }

    const interval = setInterval(() => {
      runSearch(lastQuery, { silent: true });
    }, 30000);

    return () => clearInterval(interval);
  }, [lastQuery, runSearch]);

  const filteredResults = results;

  // Group deals side-by-side ordered by price irrespective of restaurant match
  const groupedDeals = useMemo(() => {
    const zomatoDeals = filteredResults
      .filter(d => getDealPlatform(d) === "Zomato")
      .sort((a, b) => (a.price || a.basePrice || Infinity) - (b.price || b.basePrice || Infinity));
      
    const swiggyDeals = filteredResults
      .filter(d => getDealPlatform(d) === "Swiggy")
      .sort((a, b) => (a.price || a.basePrice || Infinity) - (b.price || b.basePrice || Infinity));

    const maxDeals = Math.max(zomatoDeals.length, swiggyDeals.length);
    const groups = [];

    for (let i = 0; i < maxDeals; i++) {
      const zDeal = zomatoDeals[i] || null;
      const sDeal = swiggyDeals[i] || null;
      
      groups.push({
        label: `Option #${i + 1}`,
        zomato: zDeal,
        swiggy: sDeal,
        all: [zDeal, sDeal].filter(Boolean)
      });
    }

    return groups;
  }, [filteredResults]);

  const getDealKey = (deal) => `${deal.restaurant}-${deal.dishName}-${deal.res_id || ""}`;

  const renderDealCompactCard = (deal, index, side) => {
    if (!deal) return (
      <div className={`compare-card compare-card-empty ${side}`}>
        <div className="compare-empty-label">No {side === "swiggy" ? "Swiggy" : "Zomato"} match</div>
      </div>
    );

    const platform = getDealPlatform(deal);
    const platformColors = PLATFORM_COLORS[platform] || PLATFORM_COLORS.Zomato;
    const directUrl = platform === "Zomato" ? sanitizeZomatoUrl(deal, deal.restaurant) : deal.orderUrl;

    const handleHeaderClick = (e) => {
      if (platform === "Zomato" && directUrl) {
        e.preventDefault();
        openZomatoUrl(deal, deal.restaurant);
      } else if (platform === "Swiggy" && directUrl) {
        // default <a> link target="_blank" will handle Swiggy
      } else if (deal.restaurantId || deal.res_id) {
        e.preventDefault();
        navigate(`/restaurant/${deal.restaurantId || deal.res_id}`);
      } else {
        e.preventDefault();
      }
    };

    const offerText = deal.discount > 0 ? `${deal.discount}% OFF` : (deal.offerText || "");

    return (
      <div className={`compare-card ${side}`}>
        {/* Left Column - Details */}
        <div className="compare-card-left">
          <a
            href={directUrl || "#"}
            target={directUrl ? "_blank" : "_self"}
            rel="noopener noreferrer"
            className="compare-rest-header-link"
            onClick={handleHeaderClick}
          >
            By {deal.restaurant}
          </a>

          <div className="compare-meta-v2">
            <span>⭐ {deal.rating}</span>
            {deal.eta && <span>• {deal.eta}</span>}
          </div>

          {offerText && (
            <span className="compare-offer-tag">🏷️ {offerText}</span>
          )}

          <hr className="compare-card-divider" />

          <div className="veg-icon-badge">
            <span className="veg-circle"></span>
          </div>

          <h5 className="compare-dish-name-v2">{deal.dishName || deal.cuisine}</h5>

          <div className="compare-price-row-v2">
            <span className="compare-price-v2">{formatCurrency(deal.couponAdjustedPrice || deal.finalPrice)}</span>
            {deal.basePrice > (deal.couponAdjustedPrice || deal.finalPrice) && (
              <span className="compare-original-v2">{formatCurrency(deal.basePrice)}</span>
            )}
          </div>
        </div>

        {/* Right Column - Image & Add Button */}
        <div className="compare-card-right">
          <div className="compare-image-container">
            <img
              src={deal.imageUrl || deal.cuisineImageUrl || "/placeholder-food.jpg"}
              alt={deal.dishName || deal.cuisine}
              className="compare-card-img-v2"
              onError={(e) => { e.currentTarget.src = "/placeholder-food.jpg"; }}
            />
            <span className="compare-platform-badge" style={{ background: platformColors.badge }}>
              {platform}
            </span>
          </div>

          {deal.isOrderableNow && (
            <button
              className={`compare-add-btn-v2${cartStatus[getDealKey(deal)] === "done" ? " success" : cartStatus[getDealKey(deal)] === "error" ? " error" : ""}`}
              onClick={(e) => { e.stopPropagation(); handleAddToCart(deal, { onStatus: onCartStatus }); }}
              disabled={cartStatus[getDealKey(deal)] === "loading"}
            >
              {cartStatus[getDealKey(deal)] === "loading" ? "..." : cartStatus[getDealKey(deal)] === "done" ? "Added ✓" : "Add +"}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="price-page">
      {/* MASSIVE AESTHETIC TOP HERO OVERLAY */}
      <div className="price-header-banner">
        <div className="price-header-container">
          <nav className="price-nav-glass">
            <div style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }} onClick={() => navigate("/")}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, boxShadow: "0 2px 8px rgba(234, 88, 12, 0.25)" }}>
                SD
              </div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0 }}>Smart<span style={{ color: "var(--primary)" }}>Deal</span></h2>
            </div>
            <div className="nav-actions">
              <span className="status-chip">{sourceLabels[source] || "Live Feed"}</span>
              <span className="status-chip subtle">Updated {formatLiveTimestamp(meta?.fetchedAt)}</span>
              {lastQuery ? (
                <button type="button" className="refresh-btn-glass" onClick={() => runSearch(lastQuery)}>
                  Refresh
                </button>
              ) : null}
              <button className="home-btn-glass" onClick={() => navigate("/recommendations")}>Deals</button>
              <button className="home-btn-glass" onClick={() => navigate("/dish-finder")}>Dish Finder</button>
              <button className="home-btn-glass" onClick={() => navigate("/")}>Home</button>
            </div>
          </nav>

          <div className="price-hero-content">
            <h1>Find your perfect food deal,<br />elegantly.</h1>


            <form className="aesthetic-search-panel" onSubmit={handleSearch}>
              <div className="aesthetic-input-group">
                <label>Target Dish / Cuisine</label>
                <input
                  type="text"
                  placeholder="e.g. Veg Biryani, Pizza..."
                  value={cuisine}
                  onChange={(e) => setCuisine(e.target.value)}
                />
              </div>
              <div className="aesthetic-input-group">
                <label>Budget (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 500"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </div>
              <div className="aesthetic-input-group">
                <label>Location</label>
                <input
                  type="text"
                  placeholder={locationTitle}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val && val !== globalLocation) {
                      setLocationManually(val);
                    }
                  }}
                />
              </div>
              <button className="elegant-search-btn" type="submit" disabled={loading}>
                {loading ? (<><span className="btn-spinner" />Tracking...</>) : "Track Deals"}
              </button>
            </form>

            {error && <p className="error-banner">{error}</p>}
          </div>
        </div>
      </div>

      <div className="price-shell-main side-by-side-layout">
        {/* COMPARISON CHART */}
        {(zomatoDeals.length > 0 || swiggyDeals.length > 0) && (
          <div className="chart-sidebar">
            <PriceComparisonChart zomatoDeals={zomatoDeals} swiggyDeals={swiggyDeals} />
          </div>
        )}

        {/* MAIN COLUMN: DEALS */}
        <div className="main-column-grid">
          <div className="section-header-row">
            <div className="header-titles">
              <p className="eyebrow-accent">Ranked live results — Zomato & Swiggy</p>
              <h2>{filteredResults.length ? `Verified offers near ${activeLocationLabel}` : "MCP and direct live fetch are currently unavailable, so no fresh deals could be loaded."}</h2>
              {meta?.locationVerified === false && filteredResults.length > 0 && (
                <div className="location-warning-banner">
                  ⚠️ Location could not be fully verified. Some results may not deliver to <strong>{activeLocationLabel}</strong>.
                </div>
              )}
            </div>
            <div className="source-tone-badge">
              <span className={`status-dot ${sourceStatus.tone}`}></span>
              <span className="tone-label">{sourceStatus.message}</span>
            </div>
            {meta?.source ? (
              <div className="source-summary">
                Comparison source: {meta.source.split(",").map((item) => item.trim()).filter(Boolean).join(" / ")}
              </div>
            ) : null}
          </div>

          {/* SIDE-BY-SIDE COMPARISON VIEW */}
          <div className="comparison-results-list">
            {groupedDeals.map((group, index) => (
              <div key={`${group.label}-${index}`} className="comparison-row">
                <div className="comparison-row-label">
                  <span className="comparison-rank">#{index + 1}</span>
                  <span className="comparison-dish-name">{group.label}</span>
                </div>
                <div className="comparison-cards sxs">
                  {renderDealCompactCard(group.zomato, index, "zomato")}
                  <div className="comparison-vs">VS</div>
                  {renderDealCompactCard(group.swiggy, index, "swiggy")}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="elegant-loading-overlay">
          <div className="elegant-loading-card">
            <div className="elegant-spinner"></div>
            <p>Interfacing with Zomato & Swiggy systems...</p>
          </div>
        </div>
      )}
    </div>
  );
}
