import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { resolveAuthPrompt } from "../utils/authPrompt";
import "./AuthModal.css";

export default function AuthModal() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("Your session has expired. Please sign in to continue.");

  useEffect(() => {
    const handler = (e) => {
      setMessage(e.detail?.message || "Your session has expired. Please sign in to continue.");
      setVisible(true);
    };
    window.addEventListener("sd:auth-required", handler);
    return () => window.removeEventListener("sd:auth-required", handler);
  }, []);

  const handleSignIn = () => {
    setVisible(false);
    resolveAuthPrompt(true);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/signin");
  };

  const handleDismiss = () => {
    setVisible(false);
    resolveAuthPrompt(false);
  };

  if (!visible) return null;

  return createPortal(
    <div className="auth-modal-overlay" onClick={handleDismiss}>
      <div
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Sign in required"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="auth-modal-icon">🔐</div>
        <h2 className="auth-modal-title">Authorization Required</h2>
        <p className="auth-modal-msg">{message}</p>

        <div className="auth-modal-actions">
          <button className="auth-modal-dismiss" onClick={handleDismiss}>
            Dismiss
          </button>
          <button className="auth-modal-signin" onClick={handleSignIn}>
            Sign In →
          </button>
        </div>

        <p className="auth-modal-hint">
          You'll be redirected to the sign-in page. Your cart items will be preserved.
        </p>
      </div>
    </div>,
    document.body
  );
}
