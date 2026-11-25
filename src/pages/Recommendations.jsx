import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl, parseJsonResponse } from "../utils/api";
import { buildAuthHeaders, buildUserPayload } from "../utils/userProfile";
import { useLocationContext } from "../context/LocationContext";
import { useAddToCart } from "../utils/useAddToCart";
import { sanitizeZomatoUrl, openZomatoUrl } from "../utils/zomatoUrl";
import "./Recommendations.css";

const formatCurrency = (value) => `₹${Math.round(value ?? 0)}`;
const getEffectivePrice = (deal) => Number(deal?.couponAdjustedPrice || deal?.finalPrice || deal?.price || 0);

const FOOD_CATEGORIES = [
  { id: "all", name: "All Picks", icon: "🍽️", query: "" },
  { id: "bakery", name: "Bakery", icon: "🥐", query: "bakery cake pastry bread" },
  { id: "sweets", name: "Sweets", icon: "🍬", query: "sweets mithai ladoo gulab jamun rasgulla jalebi barfi" },
  { id: "fastfood", name: "Fast Food", icon: "🍔", query: "burger pizza fries wrap sandwich fast food" },
  { id: "biryani", name: "Biryani & Rice", icon: "🍚", query: "biryani pulao fried rice" },
  { id: "chinese", name: "Chinese", icon: "🥡", query: "chinese noodles manchurian momos" },
  { id: "south", name: "South Indian", icon: "🥘", query: "dosa idli vada uttapam south indian" },
  { id: "thali", name: "Thali & Meals", icon: "🍱", query: "thali meal combo platter" },
  { id: "streetfood", name: "Street Food", icon: "🌮", query: "chaat samosa kachori pav bhaji golgappa" },
  { id: "dessert", name: "Desserts", icon: "🍰", query: "ice cream brownie dessert waffle" },
];

export default function BestPicks() {
  const navigate = useNavigate();
  const { location: globalLocation, locationData, locationLabel } = useLocationContext();
  const location = globalLocation || "Delhi";
  const [deals, setDeals] = useState([]);
  const [zomatoDeals, setZomatoDeals] = useState([]);
  const [swiggyDeals, setSwiggyDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [cartStatus, setCartStatus] = useState({});
  const handleAddToCart = useAddToCart();
  const onCartStatus = (key, s) => setCartStatus((prev) => ({ ...prev, [key]: s }));

  const activeCategoryData = useMemo(
    () => FOOD_CATEGORIES.find((c) => c.id === activeCategory) || FOOD_CATEGORIES[0],
    [activeCategory]
  );

  const normalizeDeals = useCallback((items = []) => {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    return list
      .slice()
      .sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b) || Number(b.rating || 0) - Number(a.rating || 0))
      .slice(0, 16);
  }, []);

  const fetchDeals = useCallback(async (category = activeCategory) => {
    setLoading(true);
    setError("");

    try {
      const categoryData = FOOD_CATEGORIES.find((c) => c.id === category) || FOOD_CATEGORIES[0];
      const query = categoryData.query;
      let result = { deals: [], zomatoDeals: [], swiggyDeals: [] };

      if (query) {
        // Use search endpoint for specific categories
        const response = await fetch(buildApiUrl("/api/deals/search"), {
          method: "POST",
          headers: buildAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            location,
            locationData: locationData || null,
            cuisine: query,
            budget: 2000,
            user: buildUserPayload()
          })
        });
        const data = await parseJsonResponse(response);
        if (!response.ok) throw new Error(data.msg || data.error || "Unable to fetch deals");
        result = {
          deals: normalizeDeals(data.deals || []),
          zomatoDeals: data.zomatoDeals || [],
          swiggyDeals: data.swiggyDeals || []
        };
      } else {
        // All picks — use recommendations
        const encodedLocation = encodeURIComponent(location);
        const response = await fetch(buildApiUrl(`/api/deals/recommendations?location=${encodedLocation}&limit=16`), {
          headers: buildAuthHeaders()
        });
        const data = await parseJsonResponse(response);
        if (!response.ok) throw new Error(data.msg || data.error || "Unable to fetch recommendations");
        result = {
          deals: normalizeDeals(data.deals || []),
          zomatoDeals: data.zomatoDeals || [],
          swiggyDeals: data.swiggyDeals || []
        };
      }

      setDeals(result.deals);
      setZomatoDeals(result.zomatoDeals);
      setSwiggyDeals(result.swiggyDeals);
      setLastUpdated(new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }));
    } catch (err) {
      setDeals([]);
      setZomatoDeals([]);
      setSwiggyDeals([]);
      setError(err.message || "Unable to load deals");
    } finally {
      setLoading(false);
    }
  }, [activeCategory, location, locationData, normalizeDeals]);

  useEffect(() => {
    fetchDeals(activeCategory);
  }, [activeCategory, fetchDeals]);

  const handleCategorySelect = (categoryId) => {
    setActiveCategory(categoryId);
    setMenuOpen(false);
  };

  // Stats for comparison chart
  const zAvg = useMemo(() => {
    const prices = zomatoDeals.map(getEffectivePrice).filter(p => p > 0);
    return prices.length ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : 0;
  }, [zomatoDeals]);

  const sAvg = useMemo(() => {
    const prices = swiggyDeals.map(getEffectivePrice).filter(p => p > 0);
    return prices.length ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : 0;
  }, [swiggyDeals]);

  const renderDealCard = (deal, index) => {
    const key = `${deal.restaurant}-${deal.dishName}-${deal.res_id || index}`;
    const isSwiggy = String(deal.platform || deal.source || deal.provider || "").toLowerCase().includes("swiggy");
    const directUrl = isSwiggy ? deal.orderUrl : sanitizeZomatoUrl(deal, deal.restaurant);
    const rid = deal.restaurantId || deal.res_id;
    const effectivePrice = getEffectivePrice(deal);
    const originalPrice = Number(deal.originalPrice || deal.basePrice || 0);
    const canAdd = Boolean(deal.restaurant);
    const platformColor = isSwiggy ? "#fc8019" : "#e23744";

    return (
      <article key={key} className="mcp-deal-card">
        <button
          type="button"
          className="mcp-card-main"
          onClick={() => {
            if (rid && !isSwiggy) navigate(`/restaurant/${rid}`);
          }}
        >
          <div className="mcp-deal-image">
            <img
              src={deal.imageUrl || deal.cuisineImageUrl || "/placeholder-food.jpg"}
              alt={deal.dishName || deal.cuisine || deal.restaurant}
              onError={(event) => {
                event.currentTarget.src = "/placeholder-food.jpg";
              }}
            />
            <span className="mcp-deal-rank">#{index + 1}</span>
            {deal.isOrderableNow ? <span className="mcp-live-pill">Live</span> : null}
          </div>

          <div className="mcp-deal-content">
            <div className="mcp-platform-badge" style={{ background: `${platformColor}18`, color: platformColor }}>
              {deal.platform || "Zomato"}{deal.isComboDeal ? " / Combo" : ""}
            </div>
            <h3 className="mcp-restaurant-name">{deal.restaurant || "Restaurant"}</h3>
            <p className="mcp-dish-name">{deal.dishName || deal.cuisine || "Recommended item"}</p>

            <div className="mcp-deal-meta">
              <span>{deal.rating ? `${deal.rating} rating` : "Rating N/A"}</span>
              {deal.eta ? <span>{deal.eta}</span> : null}
              {deal.discount > 0 ? <span>{deal.discount}% off</span> : null}
            </div>

            {(deal.address || deal.location) ? (
              <div className="mcp-deal-meta">
                <span>{deal.address || deal.location}</span>
              </div>
            ) : null}

            <div className="mcp-price-section">
              <span className="mcp-current-price">{formatCurrency(effectivePrice)}</span>
              {originalPrice > effectivePrice ? <span className="mcp-original-price">{formatCurrency(originalPrice)}</span> : null}
            </div>

            {deal.bestCouponCombo?.length > 0 ? (
              <div className="mcp-coupon-badge">
                <span className="mcp-coupon-code">{deal.bestCouponCombo[0].code}</span>
                <span className="mcp-coupon-save">Save {formatCurrency(deal.bestCouponCombo[0].savings)}</span>
              </div>
            ) : null}
          </div>
        </button>

        <div className="mcp-deal-actions">
          <button
            className={`mcp-visit-btn ${isSwiggy ? "swiggy-visit" : ""}`}
            type="button"
            style={isSwiggy ? { background: "linear-gradient(135deg, #fc8019, #e06d10)" } : {}}
            onClick={() => {
              if (isSwiggy && deal.orderUrl) {
                window.open(deal.orderUrl, "_blank", "noopener,noreferrer");
              } else if (directUrl) {
                openZomatoUrl(deal, deal.restaurant);
              } else if (rid) {
                navigate(`/restaurant/${rid}`);
              }
            }}
            disabled={!directUrl && !rid && !(isSwiggy && deal.orderUrl)}
          >
            {isSwiggy ? "Open Swiggy" : directUrl ? "Open Zomato" : rid ? "Menu" : "Details"}
          </button>

          {canAdd ? (
            <button
              className={`mcp-add-btn${cartStatus[key] === "done" ? " success" : cartStatus[key] === "error" ? " error" : ""}`}
              type="button"
              onClick={() => handleAddToCart(deal, { onStatus: onCartStatus })}
              disabled={cartStatus[key] === "loading"}
            >
              {cartStatus[key] === "loading" ? "Adding..." :
                cartStatus[key] === "done" ? "Added" :
                  cartStatus[key] === "error" ? "Retry" : "Add"}
            </button>
          ) : null}
        </div>
      </article>
    );
  };

  return (
    <div className="best-picks-page">
      <div className="best-picks-container">
        <header className="best-picks-header">
          <div className="best-picks-brand" style={{ cursor: "pointer" }} onClick={() => navigate("/")}>
            <div className="best-picks-badge">SD</div>
            <div className="best-picks-text">
              <p className="best-picks-eyebrow">Smart food recommendations</p>
              <h1>{activeCategoryData.icon} {activeCategoryData.name}</h1>
              <p>{locationLabel || location}</p>
            </div>
          </div>
          <div className="best-picks-header-actions">
            {lastUpdated ? <span>Updated {lastUpdated}</span> : null}
            <button className="best-picks-home-btn" onClick={() => navigate("/PriceTrack")}>Live Prices</button>
            <button className="best-picks-home-btn" onClick={() => navigate("/dish-finder")}>Dish Finder</button>
            <button className="best-picks-home-btn" onClick={() => navigate("/")}>Home</button>

            {/* HAMBURGER MENU */}
            <div className="hamburger-wrapper">
              <button
                className={`hamburger-btn ${menuOpen ? "open" : ""}`}
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label="Food categories menu"
              >
                <span className="hamburger-line"></span>
                <span className="hamburger-line"></span>
                <span className="hamburger-line"></span>
              </button>

              {menuOpen && (
                <div className="hamburger-dropdown">
                  <div className="hamburger-dropdown-header">
                    <h3>Food Categories</h3>
                    <p>Browse by type</p>
                  </div>
                  <div className="hamburger-dropdown-grid">
                    {FOOD_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        className={`hamburger-category-btn ${activeCategory === cat.id ? "active" : ""}`}
                        onClick={() => handleCategorySelect(cat.id)}
                      >
                        <span className="cat-icon">{cat.icon}</span>
                        <span className="cat-name">{cat.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* COMPARISON STATS BAR */}
        {(zomatoDeals.length > 0 || swiggyDeals.length > 0) && !loading && (
          <div className="bp-comparison-bar">
            <div className="bp-comp-stat">
              <span className="bp-comp-platform zomato">Zomato</span>
              <span className="bp-comp-count">{zomatoDeals.length} deals</span>
              {zAvg > 0 && <span className="bp-comp-avg">Avg ₹{zAvg}</span>}
            </div>
            <div className="bp-comp-vs">VS</div>
            <div className="bp-comp-stat">
              <span className="bp-comp-platform swiggy">Swiggy</span>
              <span className="bp-comp-count">{swiggyDeals.length} deals</span>
              {sAvg > 0 && <span className="bp-comp-avg">Avg ₹{sAvg}</span>}
            </div>
          </div>
        )}

        <main className="best-picks-content">
          {error ? (
            <div className="mcp-error-message">
              <p>{error}</p>
              <button onClick={() => fetchDeals(activeCategory)}>Retry</button>
            </div>
          ) : null}

          {loading ? (
            <div className="mcp-loading">
              <div className="mcp-spinner" />
              <p>Loading {activeCategoryData.name.toLowerCase()}...</p>
            </div>
          ) : (
            deals.length ? (
              <div className="mcp-deals-grid">
                {deals.map((deal, index) => renderDealCard(deal, index))}
              </div>
            ) : (
              <div className="mcp-empty-state">
                <h3>No picks found</h3>
                <p>Try another category or change your location.</p>
              </div>
            )
          )}
        </main>
      </div>

      {/* Click-away overlay for hamburger */}
      {menuOpen && <div className="hamburger-overlay" onClick={() => setMenuOpen(false)} />}
    </div>
  );
}
