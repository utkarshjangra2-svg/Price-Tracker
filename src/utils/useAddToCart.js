/**
 * Shared "Add to Cart" logic used across PriceTrack, DishFinder, and Deals.
 * - Adds item to website cart (sidebar opens automatically)
 * - Silently calls backend to add to Zomato app cart via MCP
 * - Passes the user's active delivery location so order history is correct
 * - NO automatic redirects, NO alert() popups
 * - Shows a toast notification instead
 */
import { useCallback } from "react";
import { useCart } from "../context/CartContext";
import { useLocationContext } from "../context/LocationContext";
import { buildApiUrl } from "./api";
import { buildAuthHeaders, getStoredToken } from "./userProfile";
import { showToast } from "./toast";
import { showAuthPrompt } from "./authPrompt";

export function useAddToCart() {
  const { addItem } = useCart();
  // Always use the live delivery location from the global context
  const { location: deliveryLocation } = useLocationContext();

  const handleAddToCart = useCallback(async (deal, { onStatus } = {}) => {
    const restaurantId = deal.restaurantId || deal.res_id || "";
    const key = `${deal?.restaurant}-${deal?.dishName || ""}-${restaurantId}`;

    if (!getStoredToken()) {
      // No token at all — ask the user to sign in
      showAuthPrompt({ message: "Please sign in to add items to your cart." });
      return;
    }

    if (!deal?.restaurant) {
      showToast("This deal cannot be added to cart.", "error");
      return;
    }

    onStatus?.(key, "loading");

    try {
      const res = await fetch(buildApiUrl("/api/orders/add-to-cart"), {
        method: "POST",
        headers: buildAuthHeaders({ "Content-Type": "application/json" }),
        // Send deliveryLocation so the backend stores the correct address in order history
        body: JSON.stringify({ 
          deal: {
            ...deal,
            restaurantId,
            slug: deal.slug || ""
          }, 
          deliveryLocation: deliveryLocation || "" 
        })
      });

      const data = await res.json();

      if (res.status === 401) {
        // Token expired or invalid — show auth modal instead of hard redirect
        showAuthPrompt({
          message: data.msg && data.msg !== "Invalid token"
            ? data.msg
            : "Your session has expired. Please sign in again to continue."
        });
        onStatus?.(key, null);
        return;
      }

      if (!res.ok) throw new Error(data.msg || "Unable to add to cart");

      onStatus?.(key, "done");

      // Add to website cart — sidebar opens automatically
      addItem(deal, {
        appliedCoupon: data.appliedCoupon || null,
        zomatoCartAdded: Boolean(data.cartAdded)
      });

      if (data.cartAdded) {
        // MCP added it directly to Zomato app cart — no redirect needed
        const couponMsg = data.appliedCoupon ? ` · Coupon ${data.appliedCoupon} applied` : "";
        showToast(`✓ Added to cart + Zomato app${couponMsg}`, "success");
      } else {
        const couponMsg = data.appliedCoupon ? ` · Use coupon ${data.appliedCoupon}` : "";
        showToast(`✓ Saved to cart!${couponMsg}`, "info");
      }

      setTimeout(() => onStatus?.(key, null), 3000);
    } catch (err) {
      onStatus?.(key, "error");
      showToast(`Could not add to cart: ${err.message}`, "error");
      setTimeout(() => onStatus?.(key, null), 3000);
    }
  }, [addItem, deliveryLocation]);

  return handleAddToCart;
}
