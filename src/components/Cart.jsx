import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useLocationContext } from "../context/LocationContext";
import { openZomatoUrl, sanitizeZomatoUrl } from "../utils/zomatoUrl";
import "./Cart.css";

const formatRs = (v) => `Rs${Math.round(v ?? 0)}`;

export default function Cart({ isPage = false }) {
  const navigate = useNavigate();
  const { items, isOpen, closeCart, removeItem, clearCart } = useCart();
  const { locationLabel } = useLocationContext();
  const total = items.reduce((s, i) => s + (i.price || 0), 0);

  if (!isOpen && !isPage) return null;



  return createPortal(
    <>
      {/* Overlay */}
      <div className="cart-overlay" onClick={closeCart} />

      {/* Sidebar */}
      <aside className="cart-sidebar" role="dialog" aria-label="Your cart">

        {/* Header */}
        <div className="cart-header">
          <div className="cart-header-left">
            <span className="cart-header-icon">🛒</span>
            <h2>My Cart</h2>
            {items.length > 0 && (
              <span className="cart-header-count">
                {items.length} item{items.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button className="cart-close-btn" onClick={closeCart} aria-label="Close cart">✕</button>
        </div>

        {/* Delivery location banner */}
        <div className="cart-location-bar">
          <span className="cart-location-icon">📍</span>
          <span className="cart-location-text">
            Delivering to: <strong>{locationLabel || "Detecting location…"}</strong>
          </span>
        </div>

        {/* Empty state */}
        {items.length === 0 ? (
          <div className="cart-empty">
            <span className="cart-empty-icon">🍽️</span>
            <h3>Your cart is empty</h3>
            <p>Browse deals and click <strong>"Add to Cart"</strong> to start adding items here.</p>
          </div>
        ) : (
          <>
            {/* Items list */}
            <div className="cart-items">
              {items.map((item) => {
                const isSwiggy = String(item.platform || item.source || item.provider || "").toLowerCase().includes("swiggy");

                return (
                <div key={item.id} className="cart-item">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.restaurant} className="cart-item-img" />
                  ) : (
                    <div className="cart-item-img cart-item-img-placeholder">🍱</div>
                  )}

                  <div className="cart-item-body">
                    <p className="cart-item-restaurant">{item.restaurant}</p>
                    <p className="cart-item-dish">{item.dishName || "Food item"}</p>

                    <div className="cart-item-price-row">
                      <span className="cart-item-price">{formatRs(item.price)}</span>
                      {item.originalPrice > item.price && (
                        <span className="cart-item-original">{formatRs(item.originalPrice)}</span>
                      )}
                    </div>

                    <div className="cart-item-badges">
                      {item.coupon && (
                        <span className="cart-item-coupon">🏷 {item.coupon}</span>
                      )}
                      {item.zomatoCartAdded && (
                        <span className="cart-item-zomato-badge cart-item-zomato-ok">✓ In Zomato cart</span>
                      )}
                    </div>

                    {/* Per-item "Order on Zomato" — only shown if NOT already in Zomato cart AND a valid URL exists */}
                    {!isSwiggy && !item.zomatoCartAdded && sanitizeZomatoUrl(item, item.restaurant) && (
                      <button
                        className="cart-item-order-btn"
                        onClick={() => openZomatoUrl(item, item.restaurant)}
                        title={`Order ${item.restaurant} on Zomato`}
                      >
                        Order on Zomato ↗
                      </button>
                    )}
                  </div>

                  <div className="cart-item-actions">
                    <button
                      className="cart-item-remove-btn"
                      onClick={() => removeItem(item.id)}
                      aria-label="Remove from cart"
                      title="Remove"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
              })}
            </div>

            {/* Footer */}
            <div className="cart-footer">
              <div className="cart-total-row">
                <span className="cart-total-label">Estimated Total</span>
                <span className="cart-total-value">{formatRs(total)}</span>
              </div>

              <p className="cart-footer-hint">
                <strong>✓ In Zomato cart</strong> = Added directly to your Zomato app.<br />
                Use <em>"Order on Zomato"</em> on each item to place orders one by one.
              </p>

              <div className="cart-footer-actions">
                <button className="cart-clear-btn" onClick={clearCart}>Clear All</button>

              </div>
            </div>
          </>
        )}
      </aside>
    </>,
    document.body
  );
}

/** Cart icon shown in the header */
export function CartTrigger() {
  const { items, toggleCart } = useCart();
  const count = items.length;

  return (
    <button
      className={`cart-trigger-btn${count > 0 ? " has-items" : ""}`}
      onClick={toggleCart}
      aria-label={`Cart (${count} items)`}
      title="View Cart"
    >
      🛒
      {count > 0 && <span className="cart-badge">{count > 99 ? "99+" : count}</span>}
    </button>
  );
}
