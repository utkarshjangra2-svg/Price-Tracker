/**
 * Lightweight imperactive toast system.
 * Call showToast(msg, type) from anywhere — no React context needed.
 * Types: "success" | "error" | "info"
 */

let container = null;

const getContainer = () => {
  if (!container) {
    container = document.createElement("div");
    container.id = "sd-toast-container";
    Object.assign(container.style, {
      position: "fixed",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "10px",
      zIndex: "9999",
      pointerEvents: "none"
    });
    document.body.appendChild(container);
  }
  return container;
};

export function showToast(message, type = "success", durationMs = 3000) {
  const c = getContainer();

  const toast = document.createElement("div");
  const colors = {
    success: { bg: "#22c55e", color: "#fff" },
    error:   { bg: "#ef4444", color: "#fff" },
    info:    { bg: "#6366f1", color: "#fff" }
  };
  const { bg, color } = colors[type] || colors.info;

  Object.assign(toast.style, {
    background: bg,
    color,
    padding: "11px 22px",
    borderRadius: "12px",
    fontSize: "0.9rem",
    fontWeight: "600",
    boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
    opacity: "0",
    transform: "translateY(16px)",
    transition: "opacity 0.22s ease, transform 0.22s ease",
    maxWidth: "420px",
    textAlign: "center",
    lineHeight: "1.5",
    fontFamily: "inherit",
    pointerEvents: "auto"
  });

  toast.textContent = message;
  c.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });
  });

  // Animate out and remove
  const remove = () => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(16px)";
    setTimeout(() => toast.remove(), 250);
  };

  const timer = setTimeout(remove, durationMs);
  toast.addEventListener("click", () => { clearTimeout(timer); remove(); });
}
