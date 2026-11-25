import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useLocationContext } from "../context/LocationContext";
import { buildApiUrl, parseJsonResponse } from "../utils/api";
import { buildAuthHeaders } from "../utils/userProfile";
import { showToast } from "../utils/toast";
import "./DishFinder.css";

const formatCurrency = (v) => `Rs${Math.round(v ?? 0)}`;

export default function Checkout() {
  const { items, clearCart } = useCart();
  const { location, locationLabel } = useLocationContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [realData, setRealData] = useState(null);

  const restaurantId = items.length > 0 ? items[0].restaurantId : null;

  useEffect(() => {
    if (!items.length) return;

    const validate = async () => {
      setValidating(true);
      try {
        const res = await fetch(buildApiUrl("/api/orders/validate-cart"), {
          method: "POST",
          headers: buildAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ items, restaurantId })
        });
        const data = await res.json();
        if (data.validated) {
          setRealData(data);
          showToast("✓ Verified with Zomato real-time price", "success");
        }
      } catch (e) {
        console.error("Validation failed", e);
      } finally {
        setValidating(false);
      }
    };

    validate();
  }, [items, restaurantId]);

  const totalBase = items.reduce((s, i) => s + (i.basePrice || i.originalPrice || 0), 0);
  const totalOptimized = items.reduce((s, i) => s + (i.finalPrice || 0), 0);
  const totalFinal = realData?.realPrice || items.reduce((s, i) => s + (i.couponAdjustedPrice || i.finalPrice || 0), 0);
  const savings = totalBase - totalFinal;

  const handlePlaceOrder = async () => {
    if (!items.length) return;
    setLoading(true);

    try {
      // Save order to history for the logged-in user
      for (const item of items) {
        const res = await fetch(buildApiUrl("/api/orders"), {
          method: "POST",
          headers: buildAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            ...item,
            orderUrl: item.orderUrl || item.restaurantUrl || "https://www.zomato.com",
            finalPrice: item.price,
            location: locationLabel || location,
            source: "checkout"
          })
        });
        if (!res.ok) {
          const data = await parseJsonResponse(res);
          throw new Error(data.msg || "Failed to place order");
        }
      }

      showToast("Order placed successfully!", "success");
      clearCart();
      navigate("/history");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  if (!items.length) {
    return (
      <div className="dish-finder-page">
        <div className="df-empty">
          <h3>Your cart is empty</h3>
          <p>Add some delicious food to your cart before checking out.</p>
          <button className="elegant-search-btn" onClick={() => navigate("/")}>Go Shopping</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dish-finder-page">
      <div className="dish-finder-shell">
        <nav className="df-nav">
          <div style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }} onClick={() => navigate("/")}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, boxShadow: "0 2px 8px rgba(234, 88, 12, 0.25)" }}>
              SD
            </div>
            <div>
              <p className="df-nav-eyebrow">Checkout</p>
              <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800 }}>Confirm Your Order</h1>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => navigate("/cart")}>Cart</button>
            <button onClick={() => navigate("/")}>Home</button>
          </div>
        </nav>

        <section className="df-detail-panel" style={{ marginTop: "2rem" }}>
          <div className="df-detail-header">
            <div>
              <span className="df-detail-tag">Delivery Address</span>
              <h3>{locationLabel}</h3>
            </div>
            <button className="df-copy-btn" onClick={() => navigate("/")}>Change</button>
          </div>

          <div className="df-detail-body">
            <h4>Order Summary</h4>
            <div className="df-results-list" style={{ marginTop: "1rem" }}>
              {items.map((item, idx) => (
                <div key={item.id + idx} className="df-card" style={{ marginBottom: "1rem", cursor: "default" }}>
                  <div className="df-card-topline">
                    <h3 className="df-card-title">{item.restaurant}</h3>
                    <span className="df-price-current">{formatCurrency(item.price)}</span>
                  </div>
                  <p className="df-card-dish">{item.dishName}</p>
                </div>
              ))}
            </div>

            <div className="checkout-summary-card">
              <div className="summary-row">
                <span>Items Subtotal</span>
                <span>{formatCurrency(totalOptimized)}</span>
              </div>
              {realData?.taxes > 0 && (
                <div className="summary-row">
                  <span>Taxes & Charges</span>
                  <span>{formatCurrency(realData.taxes)}</span>
                </div>
              )}
              {realData?.deliveryFee > 0 && (
                <div className="summary-row">
                  <span>Delivery Fee</span>
                  <span>{formatCurrency(realData.deliveryFee)}</span>
                </div>
              )}
              <div className="summary-row total">
                <span>Total Amount</span>
                <span className={validating ? "pulse" : ""}>
                  {validating ? "Calculating..." : formatCurrency(totalFinal)}
                </span>
              </div>
              <p className="savings-tag">
                {validating ? "Fetching Zomato deals..." : `You save ${formatCurrency(savings)} on this order`}
              </p>
            </div>

            <button
              className="elegant-search-btn"
              style={{ width: "100%", marginTop: "2rem", padding: "1.2rem" }}
              disabled={loading}
              onClick={handlePlaceOrder}
            >
              {loading ? "Placing Order..." : "Place Order (Save to History)"}
            </button>

            <button
              className="df-copy-btn"
              style={{ width: "100%", marginTop: "1rem", padding: "1rem", border: "1px dashed var(--primary)" }}
              onClick={() => window.open("https://www.zomato.com/cart", "_blank")}
            >
              Order on Zomato App ↗
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
