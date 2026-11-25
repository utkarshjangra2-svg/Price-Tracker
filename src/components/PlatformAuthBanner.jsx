import { useEffect, useState, useCallback } from "react";
import { buildApiUrl } from "../utils/api";
import "./PlatformAuthBanner.css";

export default function PlatformAuthBanner({ onAuthSuccess }) {
  const [authStatus, setAuthStatus] = useState({
    zomato: { authenticated: false, status: "checking" },
    swiggy: { authenticated: false, status: "checking" }
  });
  const [loadingProvider, setLoadingProvider] = useState(null);
  const [activeAuthUrl, setActiveAuthUrl] = useState({});
  const [msg, setMsg] = useState("");

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl("/api/mcp/auth-status"));
      const data = await res.json();
      if (data.success && data.auth) {
        setAuthStatus(data.auth);
        return data.auth;
      }
    } catch (err) {
      console.warn("Failed checking MCP auth status:", err.message);
    }
    return null;
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Polling when an auth is in progress
  useEffect(() => {
    if (!loadingProvider) return;

    const interval = setInterval(async () => {
      const current = await checkStatus();
      if (current && current[loadingProvider]?.authenticated) {
        setMsg(`🎉 ${loadingProvider.toUpperCase()} connected successfully! Live deals activated.`);
        setLoadingProvider(null);
        setActiveAuthUrl((prev) => ({ ...prev, [loadingProvider]: null }));
        if (onAuthSuccess) onAuthSuccess(loadingProvider);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [loadingProvider, checkStatus, onAuthSuccess]);

  const handleStartAuth = async (provider) => {
    setLoadingProvider(provider);
    setMsg(`Starting ${provider.toUpperCase()} authorization...`);
    try {
      const res = await fetch(buildApiUrl(`/api/mcp/auth-start/${provider}`), {
        method: "POST"
      });
      const data = await res.json();

      if (data.status === "authenticated") {
        setMsg(`✅ ${provider.toUpperCase()} is already authenticated!`);
        setLoadingProvider(null);
        checkStatus();
        if (onAuthSuccess) onAuthSuccess(provider);
        return;
      }

      if (data.authUrl) {
        setActiveAuthUrl((prev) => ({ ...prev, [provider]: data.authUrl }));
        window.open(data.authUrl, "_blank");
        setMsg(`Opened ${provider.toUpperCase()} login in a new tab. Please complete login there!`);
      } else {
        setMsg(`Waiting for ${provider.toUpperCase()} authentication to finish in your browser...`);
      }
    } catch (err) {
      setMsg(`Error launching ${provider} auth: ${err.message}`);
      setLoadingProvider(null);
    }
  };

  const handleResetAuth = async (provider) => {
    try {
      await fetch(buildApiUrl(`/api/mcp/auth-clear/${provider}`), { method: "POST" });
      setMsg(`Cleared saved tokens for ${provider.toUpperCase()}. You can now re-authenticate.`);
      checkStatus();
    } catch (err) {
      setMsg(`Failed clearing tokens: ${err.message}`);
    }
  };

  const allConnected = authStatus.zomato?.authenticated && authStatus.swiggy?.authenticated;

  return (
    <div className={`platform-auth-banner ${allConnected ? "all-connected" : "needs-auth"}`}>
      <div className="pab-header">
        <div className="pab-title-wrap">
          <span className="pab-pulse-dot" />
          <h4 className="pab-title">Realtime Platform Authorization</h4>
        </div>
        <div className="pab-providers">
          {/* Zomato Status */}
          <div className={`pab-provider-chip ${authStatus.zomato?.authenticated ? "connected" : "unlinked"}`}>
            <span className="pab-badge zomato">Zomato</span>
            {authStatus.zomato?.authenticated ? (
              <span className="pab-status-text">🟢 Connected (Live)</span>
            ) : (
              <button
                type="button"
                className="pab-auth-btn zomato-btn"
                disabled={loadingProvider === "zomato"}
                onClick={() => handleStartAuth("zomato")}
              >
                {loadingProvider === "zomato" ? "Authorizing..." : "🔑 Link Zomato"}
              </button>
            )}
            {authStatus.zomato?.authenticated && (
              <button
                type="button"
                className="pab-reset-btn"
                title="Reset Zomato Auth"
                onClick={() => handleResetAuth("zomato")}
              >
                ↺
              </button>
            )}
          </div>

          {/* Swiggy Status */}
          <div className={`pab-provider-chip ${authStatus.swiggy?.authenticated ? "connected" : "unlinked"}`}>
            <span className="pab-badge swiggy">Swiggy</span>
            {authStatus.swiggy?.authenticated ? (
              <span className="pab-status-text">🟢 Connected (Live)</span>
            ) : (
              <button
                type="button"
                className="pab-auth-btn swiggy-btn"
                disabled={loadingProvider === "swiggy"}
                onClick={() => handleStartAuth("swiggy")}
              >
                {loadingProvider === "swiggy" ? "Authorizing..." : "🔑 Link Swiggy"}
              </button>
            )}
            {authStatus.swiggy?.authenticated && (
              <button
                type="button"
                className="pab-reset-btn"
                title="Reset Swiggy Auth"
                onClick={() => handleResetAuth("swiggy")}
              >
                ↺
              </button>
            )}
          </div>
        </div>
      </div>

      {msg && <p className="pab-msg">{msg}</p>}

      {/* Direct link if popup was blocked */}
      {loadingProvider && activeAuthUrl[loadingProvider] && (
        <div className="pab-direct-link">
          <span>Browser didn't open? </span>
          <a
            href={activeAuthUrl[loadingProvider]}
            target="_blank"
            rel="noopener noreferrer"
            className="pab-link"
          >
            Click here to open {loadingProvider.toUpperCase()} Sign-in ↗
          </a>
        </div>
      )}
    </div>
  );
}
