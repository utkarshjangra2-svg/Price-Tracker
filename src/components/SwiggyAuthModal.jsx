import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { buildApiUrl, parseJsonResponse } from "../utils/api";
import "./AuthModal.css"; // Reuse existing modal styles

export default function SwiggyAuthModal() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handler = () => {
      // Check if we already showed it this session to avoid spamming
      if (!sessionStorage.getItem("swiggy_auth_prompted")) {
        setVisible(true);
        sessionStorage.setItem("swiggy_auth_prompted", "true");
      }
    };
    window.addEventListener("sd:swiggy-auth-required", handler);
    return () => window.removeEventListener("sd:swiggy-auth-required", handler);
  }, []);

  const handleLinkSwiggy = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        // If not logged into the app itself, they need to do that first
        window.dispatchEvent(new CustomEvent("sd:auth-required", { 
          detail: { message: "Please sign in to link your Swiggy account." } 
        }));
        setVisible(false);
        return;
      }

      const res = await fetch(buildApiUrl("/api/auth/swiggy/link/url"), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await parseJsonResponse(res);
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Could not get Swiggy linking URL.");
        setLoading(false);
      }
    } catch (err) {
      alert("Failed to get Swiggy link URL: " + err.message);
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
  };

  if (!visible) return null;

  return createPortal(
    <div className="auth-modal-overlay" onClick={handleDismiss}>
      <div
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Swiggy Authentication Required"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="auth-modal-icon" style={{ background: "#fc8019", color: "white" }}>S</div>
        <h2 className="auth-modal-title">Link Swiggy Account</h2>
        <p className="auth-modal-msg">
          To get live Swiggy deals and prices, you need to link your Swiggy account. It only takes a second!
        </p>

        <div className="auth-modal-actions">
          <button className="auth-modal-dismiss" onClick={handleDismiss} disabled={loading}>
            Not Now
          </button>
          <button 
            className="auth-modal-signin" 
            onClick={handleLinkSwiggy} 
            disabled={loading}
            style={{ background: "linear-gradient(135deg, #fc8019, #e06d10)" }}
          >
            {loading ? "Redirecting..." : "Link Swiggy ↗"}
          </button>
        </div>

        <p className="auth-modal-hint">
          You'll be redirected to Swiggy to authenticate securely.
        </p>
      </div>
    </div>,
    document.body
  );
}
