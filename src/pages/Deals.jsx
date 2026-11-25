import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import "./Deals.css";
import { buildApiUrl } from "../utils/api";
import { buildAuthHeaders, buildUserQueryParams } from "../utils/userProfile";
import { getSourceStatus } from "../utils/sourceStatus";
import { DEFAULT_LOCATION } from "../utils/location";
import { useLocationContext } from "../context/LocationContext";
import { useAddToCart } from "../utils/useAddToCart";

const formatLiveTimestamp = (value) =>
  value
    ? new Date(value).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit"
      })
    : "--";

const sourceLabels = {
  mcp: "Zomato MCP Live",
  "zomato-native-app": "Zomato MCP Live",
  "zomato-web": "Zomato Web Live",
  multiple: "Cross-app comparison",
  swiggy: "Swiggy comparison",
  zepto: "Zepto comparison",
  unavailable: "No Live Deals Found"
};

const getEmptyStateCopy = ({ error, diagnostics }) => {
  if (error) {
    return error;
  }

  if (diagnostics?.mode === "empty") {
    return diagnostics.message || "All live sources responded, but no fresh realtime deals are available right now. The page will refresh automatically.";
  }

  if (diagnostics?.code === "EACCES") {
    return "Realtime deal fetching is currently blocked by the runtime environment. The page will keep retrying automatically.";
  }

  return "No verified live Zomato deals are available right now. The page will refresh automatically.";
};

export default function Deals() {
  const [deals, setDeals] = useState([]);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(12);
  const [diagnostics, setDiagnostics] = useState(null);
  const { location: activeLocation, locationLabel, subscribeToLocation } = useLocationContext();
  const [cartStatus, setCartStatus] = useState({});
  const handleAddToCart = useAddToCart();
  const onCartStatus = (key, s) => setCartStatus((prev) => ({ ...prev, [key]: s }));
  const sourceStatus = getSourceStatus(meta?.source || "unavailable", diagnostics);
  const emptyStateCopy = getEmptyStateCopy({ error, diagnostics });

  const fetchDeals = useCallback(async (locationOverride) => {
    const loc = locationOverride ?? activeLocation;
    try {
      setRefreshing(true);
      const locationQuery = encodeURIComponent(loc || DEFAULT_LOCATION);
      const res = await axios.get(buildApiUrl(`/api/deals?location=${locationQuery}&limit=24${buildUserQueryParams()}`), {
        headers: buildAuthHeaders()
      });
      setDeals(res.data.deals || []);
      setMeta(res.data.meta || null);
      setDiagnostics(res.data.diagnostics || null);
      setError("");
    } catch (requestError) {
      setDeals([]);
      setMeta(null);
      setDiagnostics(null);
      setError(requestError.response?.data?.msg || requestError.message);
    } finally {
      setRefreshing(false);
    }
  }, [activeLocation]);

  // Initial fetch
  useEffect(() => {
    fetchDeals(activeLocation);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch whenever location changes via global picker
  useEffect(() => {
    return subscribeToLocation((newLoc) => {
      fetchDeals(newLoc);
    });
  }, [subscribeToLocation, fetchDeals]);

  // Auto-refresh every 10s using always-fresh fetchDeals
  useEffect(() => {
    const interval = setInterval(() => fetchDeals(), 10000);
    return () => clearInterval(interval);
  }, [fetchDeals]);

  useEffect(() => {
    setVisibleCount(12);
  }, [deals.length]);


  return (
    <div className="deals-page">
      <div className="deals-shell">
        <section className="deals-hero">
          <div className="deals-header">
            <div>
              <p className="deals-eyebrow">Realtime feed</p>
              <h1>Live Deal Stream</h1>
              <p>Fresh restaurant picks ranked by current pricing intelligence, discount strength, and delivery-ready signals.</p>
              <div className="deals-location-chip">
                  <strong>{locationLabel}</strong>
                  <span style={{ fontSize: "0.72rem", color: "#4b5563" }}>Change via header 📍</span>
                </div>
            </div>
            <div className="deals-actions">
              <button type="button" className="refresh-btn" onClick={() => fetchDeals(activeLocation)}>
                {refreshing ? "Refreshing..." : "Refresh Now"}
              </button>
              <span className="live-pill">Refreshes every 10s</span>
            </div>
          </div>

          <div className="deals-stats">
            <article className="deals-stat-card">
              <span>Live now</span>
              <strong>{meta?.liveNowCount ?? 0}</strong>
            </article>
            <article className="deals-stat-card">
              <span>Total tracked</span>
              <strong>{meta?.totalDeals ?? 0}</strong>
            </article>
            <article className="deals-stat-card">
              <span>Location</span>
              <strong>{meta?.location || activeLocation || DEFAULT_LOCATION}</strong>
            </article>
            <article className="deals-stat-card">
              <span>Last sync</span>
              <strong>{formatLiveTimestamp(meta?.fetchedAt)}</strong>
            </article>
            <article className="deals-stat-card">
              <span>Source</span>
              <strong>{sourceLabels[meta?.source || "unavailable"] || meta?.source || "Unknown"}</strong>
            </article>
          </div>
        </section>

        <section className={`source-banner ${sourceStatus.tone}`}>
          <strong>{sourceStatus.title}</strong>
          <p>{sourceStatus.message}</p>
        </section>

        {diagnostics?.mode === "empty" ? (
          <section className="source-detail-card">
            <strong>No live deals found for this location.</strong>
            <p>{diagnostics?.message}</p>
            <span>Make sure the Zomato MCP server is running and try a different dish or location.</span>
          </section>
        ) : null}

        {deals.length ? (
          <div className="deals-grid">
            {deals.slice(0, visibleCount).map((deal, i) => (
              <article className="deal-card" key={i}>
                <div className="deal-visual">
                  <img
                    src={deal.imageUrl || deal.cuisineImageUrl || "/placeholder-food.jpg"}
                    alt={deal.dishName || deal.restaurant}
                    className="deal-thumb"
                  />
                  <span className="discount">{deal.discount}% OFF</span>
                </div>
                <div className="deal-content">
                  <div className="deal-topline">
                    <span>{deal.platform || "Zomato"}{deal.isComboDeal ? " · Combo" : ""}</span>
                    <span>{deal.confidence}% confidence</span>
                  </div>
                  <h3>{deal.restaurant}</h3>
                  <p className="deal-meta">Rating: {deal.rating} • {deal.location}</p>
                  <p className="deal-copy">{deal.analysis || "Live price opportunity available now."}</p>
                  {deal.bestCouponCombo?.length > 0 && (
                    <div className="deal-coupon-summary">
                      Best coupon: {deal.bestCouponCombo.map((coupon) => coupon.code).join(" + ")} → Save Rs{deal.bestCouponCombo.reduce((sum, coupon) => sum + Number(coupon.savings || 0), 0)}
                    </div>
                  )}
                  {deal.availableCoupons?.length > 0 && (
                    <div className="deal-coupon-list">
                      {deal.availableCoupons.slice(0, 2).map((coupon) => (
                        <span key={coupon.code} className="deal-coupon-item">{coupon.code}</span>
                      ))}
                      {deal.availableCoupons.length > 2 && <span className="deal-coupon-item">+{deal.availableCoupons.length - 2} more</span>}
                    </div>
                  )}
                  <div className="deal-price">
                    <span className="new">Rs{deal.couponAdjustedPrice || deal.finalPrice}</span>
                    {deal.originalPrice ? <span className="old">Rs{deal.originalPrice}</span> : null}
                  </div>
                  <div className="deal-tags">
                    {deal.bestCouponCombo?.length ? <span>{deal.bestCouponCombo.map((coupon) => coupon.code).join(" + ")}</span> : null}
                    <span>{deal.eta || "Fast delivery"}</span>
                    <span>{deal.isOrderableNow ? "Order-ready" : "Monitor"}</span>
                  </div>
                  {deal.isOrderableNow && (
                    <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="refresh-btn"
                        style={{
                          flex: 1, padding: "8px 12px", fontSize: "0.8rem",
                          background: cartStatus[`${deal.restaurant}-${deal.dishName}-${deal.res_id}`] === "done" ? "#22c55e" :
                           cartStatus[`${deal.restaurant}-${deal.dishName}-${deal.res_id}`] === "error" ? "#ef4444" : "#3b82f6"
                        }}
                        disabled={cartStatus[`${deal.restaurant}-${deal.dishName}-${deal.res_id}`] === "loading"}
                        onClick={(e) => { e.stopPropagation(); handleAddToCart(deal, { onStatus: onCartStatus }); }}
                      >
                        {cartStatus[`${deal.restaurant}-${deal.dishName}-${deal.res_id}`] === "loading" ? "Adding..." :
                         cartStatus[`${deal.restaurant}-${deal.dishName}-${deal.res_id}`] === "done" ? "✓ Added to Cart!" :
                         cartStatus[`${deal.restaurant}-${deal.dishName}-${deal.res_id}`] === "error" ? "Retry" :
                         "Add to Cart"}

                      </button>
                    </div>
                  )}

                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">{emptyStateCopy}</div>
        )}

        {deals.length > visibleCount ? (
          <div className="deals-more-wrap">
            <button type="button" className="refresh-btn deals-more-btn" onClick={() => setVisibleCount((count) => count + 12)}>
              Show More Deals
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
