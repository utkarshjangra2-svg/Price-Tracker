import { createContext, useCallback, useContext, useEffect, useState } from "react";

const CartContext = createContext(null);

const STORAGE_KEY = "smartdeal_cart";

const loadCart = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveCart = (items) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
};

export function CartProvider({ children }) {
  const [items, setItems] = useState(loadCart);
  const [isOpen, setIsOpen] = useState(false);

  // Persist on every change
  useEffect(() => {
    saveCart(items);
  }, [items]);

  const addItem = useCallback((deal, opts = {}) => {
    const restaurantId = deal.restaurantId || deal.res_id || "";
    const id = `${deal.restaurant}-${deal.dishName || deal.cuisine || ""}-${restaurantId || Date.now()}`;
    
    setItems((prev) => {
      // Enforce single restaurant cart
      if (prev.length > 0 && restaurantId && prev[0].restaurantId !== restaurantId) {
        if (!window.confirm(`Your cart contains items from "${prev[0].restaurant}". Clear cart to add from "${deal.restaurant}"?`)) {
          return prev;
        }
        prev = []; // Clear cart if user confirmed
      }

      const exists = prev.find((i) => i.id === id);
      if (exists) return prev; // already in cart
      return [...prev, {
        id,
        restaurant: deal.restaurant || "",
        restaurantId: String(restaurantId),
        slug: deal.slug || "",
        dishName: deal.dishName || deal.cuisine || "",
        location: deal.location || "",
        imageUrl: deal.imageUrl || "",
        price: deal.couponAdjustedPrice || deal.finalPrice || 0,
        originalPrice: deal.originalPrice || deal.finalPrice || 0,
        coupon: opts.appliedCoupon || null,
        orderUrl: deal.orderUrl || "",
        restaurantUrl: deal.restaurantUrl || "",
        res_id: restaurantId || null,
        addedAt: new Date().toISOString(),
        zomatoCartAdded: opts.zomatoCartAdded || false
      }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const toggleCart = useCallback(() => setIsOpen((o) => !o), []);

  return (
    <CartContext.Provider value={{ items, isOpen, addItem, removeItem, clearCart, openCart, closeCart, toggleCart }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
};
