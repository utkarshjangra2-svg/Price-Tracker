/**
 * Imperative trigger for the AuthModal.
 * Call showAuthPrompt({ message, onConfirm }) from anywhere — no React context needed.
 * Similar pattern to toast.js.
 */

let resolver = null;

/** Show a sign-in required prompt. Returns a Promise<boolean> — true if user clicked "Sign In". */
export function showAuthPrompt({ message = "Your session has expired. Please sign in to continue." } = {}) {
  // Fire the custom DOM event — AuthModal listens for this
  const event = new CustomEvent("sd:auth-required", { detail: { message } });
  window.dispatchEvent(event);

  return new Promise((resolve) => {
    resolver = resolve;
  });
}

/** Called by AuthModal when the user makes a choice */
export function resolveAuthPrompt(confirmed) {
  if (resolver) {
    resolver(confirmed);
    resolver = null;
  }
}
