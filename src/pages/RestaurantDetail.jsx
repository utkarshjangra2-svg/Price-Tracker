import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { buildApiUrl, parseJsonResponse } from "../utils/api";
import { buildAuthHeaders } from "../utils/userProfile";
import { useLocationContext } from "../context/LocationContext";
import { buildZomatoOrderUrl } from "../utils/zomatoUrl";
import "./DishFinder.css";
import "./RestaurantDetail.css";

const formatCurrency = (v) => `Rs${Math.round(v ?? 0)}`;

export default function RestaurantDetail() {
  const { restaurantId } = useParams();
  const navigate = useNavigate();
  const { location } = useLocationContext();
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        buildApiUrl(`/api/deals/restaurant/${restaurantId}?location=${encodeURIComponent(location)}`),
        { headers: buildAuthHeaders() }
      );
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.msg || "Failed to fetch restaurant");
      setRestaurant(data.restaurant);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, location]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (loading) {
    return (
      <div className="dish-finder-page">
        <div className="rd-loading-wrap">
          <div className="rd-spinner" />
          <p>Fetching restaurant menu…</p>
        </div>
      </div>
    );
  }

  if (error || !restaurant) {
    return (
      <div className="dish-finder-page">
        <div className="df-empty">
          <h3>Restaurant Not Found</h3>
          <p>{error || "We couldn't find the restaurant you're looking for."}</p>
          <button className="df-search-btn" style={{ marginTop: "16px" }} onClick={() => navigate("/dish-finder")}>
            ← Back to Dish Finder
          </button>
        </div>
      </div>
    );
  }

  const zomatoUrl = buildZomatoOrderUrl(restaurant, restaurant.restaurant);
  const menu = restaurant.menu || [];

  return (
    <div className="dish-finder-page">
      <div className="dish-finder-shell">
        {/* ── Nav ─────────────────────────────────────────────── */}
        <nav className="df-nav">
          <div style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }} onClick={() => navigate("/")}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, boxShadow: "0 2px 8px rgba(234, 88, 12, 0.25)" }}>
              SD
            </div>
            <div>
              <p className="df-nav-eyebrow">Restaurant Menu</p>
              <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800 }}>{restaurant.restaurant}</h1>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => navigate("/dish-finder")}>← Back</button>
            <button onClick={() => navigate("/recommendations")}>Deals</button>
            <button onClick={() => navigate("/")}>Home</button>
          </div>
        </nav>

        {/* ── Restaurant Hero ──────────────────────────────────── */}
        <div className="rd-hero">
          {restaurant.imageUrl && (
            <img src={restaurant.imageUrl} alt={restaurant.restaurant} className="rd-hero-img" />
          )}
          <div className="rd-hero-info">
            <h2 className="rd-hero-name">{restaurant.restaurant}</h2>
            <p className="rd-hero-location">📍 {restaurant.location}</p>
            <div className="rd-hero-meta">
              <span>⭐ {restaurant.rating || "—"}</span>
              {restaurant.eta && <span>🕒 {restaurant.eta}</span>}
              {restaurant.cuisine && <span className="df-cuisine-chip">{restaurant.cuisine}</span>}
            </div>
            <a
              href={zomatoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rd-open-zomato-btn"
            >
              Open Restaurant on Zomato ↗
            </a>
          </div>
        </div>

        {/* ── Menu Section ─────────────────────────────────────── */}
        <div className="rd-menu-section">
          <div className="df-section-label">
            <span className="df-badge live">🍽️ {menu.length === 1 ? "Top Recommendation" : "Menu"}</span>
            <small>{menu.length} item{menu.length !== 1 ? "s" : ""}</small>
          </div>

          {menu.length === 0 ? (
            <div className="df-empty">
              <h3>Menu unavailable</h3>
              <p>We couldn't load the full menu. Browse directly on Zomato.</p>
              <a href={zomatoUrl} target="_blank" rel="noopener noreferrer" className="df-search-btn" style={{ marginTop: "16px", display: "inline-block", textDecoration: "none" }}>
                View on Zomato ↗
              </a>
            </div>
          ) : (
            <div className="rd-menu-grid">
              {menu.map((item, idx) => {
                const price = item.couponAdjustedPrice || item.finalPrice;
                const originalPrice = item.basePrice || item.originalPrice;
                const hasDiscount = originalPrice && originalPrice > price;
                // Build item-level Zomato URL: same restaurant URL, dish name as search hint
                const itemZomatoUrl = buildZomatoOrderUrl({ ...restaurant, dishName: item.dishName }, restaurant.restaurant);

                return (
                  <article key={item.id || idx} className="rd-menu-card">
                    {/* Dish image */}
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.dishName} className="rd-menu-card-img" />
                    ) : (
                      <div className="rd-menu-card-img rd-menu-card-img-placeholder">
                        <span>🍛</span>
                      </div>
                    )}

                    <div className="rd-menu-card-body">
                      <h3 className="rd-menu-card-name">{item.dishName || "Menu Item"}</h3>

                      <div className="rd-menu-card-price">
                        <span className="rd-price-current">{formatCurrency(price)}</span>
                        {hasDiscount && (
                          <span className="rd-price-original">{formatCurrency(originalPrice)}</span>
                        )}
                      </div>

                      <a
                        href={itemZomatoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rd-order-btn"
                      >
                        Order on Zomato ↗
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
