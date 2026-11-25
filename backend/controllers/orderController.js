import OrderHistory from "../models/OrderHistory.js";
import User from "../models/User.js";
import { callUserZomatoTool, reAuthUserSession, isSessionAuthenticated } from "../services/zomatoUserSessionService.js";
import { callZomatoMcpTool } from "../services/zomatoOfficialMcp.js";
import { fetchUserZomatoCoupons } from "../services/couponOptimizer.js";


export const createOrderHistory = async (req, res) => {
  try {
    const {
      restaurant,
      dishName = "",
      cuisine = "",
      location = "",
      imageUrl = "",
      orderUrl,
      finalPrice = 0,
      couponAdjustedPrice = 0,
      originalPrice = 0,
      discount = 0,
      rating = 0,
      confidence = 0,
      eta = "",
      source = "",
      restaurantId = "",
      restaurantUrl = ""
    } = req.body;

    const effectiveOrderUrl = (orderUrl || restaurantUrl || "https://www.zomato.com").trim();

    if (!restaurant?.trim()) {
      return res.status(400).json({ msg: "Restaurant name is required" });
    }

    const order = await OrderHistory.create({
      user: req.user._id,
      restaurant: restaurant.trim(),
      dishName: dishName.trim(),
      cuisine: cuisine.trim(),
      location: location.trim(),
      imageUrl: imageUrl.trim(),
      orderUrl: effectiveOrderUrl,
      finalPrice: Number(finalPrice) || 0,
      couponAdjustedPrice: Number(couponAdjustedPrice) || Number(finalPrice) || 0,
      originalPrice: Number(originalPrice) || 0,
      discount: Number(discount) || 0,
      rating: Number(rating) || 0,
      confidence: Number(confidence) || 0,
      eta: eta.trim(),
      source: source.trim(),
      restaurantId: String(restaurantId || "").trim()
    });

    res.status(201).json({
      msg: "Order saved to history",
      order
    });
  } catch (error) {
    console.log("createOrderHistory error:", error);
    res.status(500).json({ msg: error.message || "Unable to save order history" });
  }
};

// Parse addresses from Zomato MCP response
const parseAddresses = (rawText = "") => {
  try {
    const jsonMatch = rawText.match(/\{[\s\S]+?\}(?=\s*\{|\s*$)/);
    const authData = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    return authData?.addresses || authData?.data?.addresses || [];
  } catch {
    return [];
  }
};

// Parse Zomato order history from MCP response
const parseZomatoOrders = (result) => {
  let raw = result;
  if (Array.isArray(raw) && raw[0]?.text) {
    try { raw = JSON.parse(raw[0].text); } catch { return []; }
  }
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  const orders = raw?.orders || raw?.data?.orders || raw?.order_history || [];
  return Array.isArray(orders) ? orders : [];
};

export const getMyOrderHistory = async (req, res) => {
  try {
    // Trigger background sync from Zomato if user linked — fire-and-forget
    if (req.user?.zomato?.linked) {
      syncFromZomato(req.user._id).catch(() => {});
    }

    const orders = await OrderHistory.find({ user: req.user._id })
      .sort({ orderedAt: -1, createdAt: -1 })
      .limit(50);

    res.json({ orders });
  } catch (error) {
    console.log("getMyOrderHistory error:", error);
    res.status(500).json({ msg: error.message || "Unable to fetch order history" });
  }
};

// Pull and upsert Zomato order history for the user
const syncFromZomato = async (userId) => {
  try {
    const result = await callUserZomatoTool(String(userId), "get_order_history", {});
    if (!result?.success || !result?.result) return;

    const zOrders = parseZomatoOrders(result.result);
    if (!zOrders.length) return;

    for (const zo of zOrders) {
      const orderId = String(zo.order_id || zo.id || "");
      if (!orderId) continue;

      const restaurant = zo.restaurant_name || zo.restaurant?.name || "";
      const dishName = zo.items?.[0]?.name || zo.item_name || "";
      const cuisine = zo.cuisine || "";
      const finalPrice = Number(zo.total_amount || zo.order_amount || zo.price || 0);
      const couponAdjustedPrice = Number(zo.paid_amount || zo.final_amount || finalPrice);
      const orderUrl = zo.order_url || zo.deep_link || "";
      const imageUrl = zo.restaurant_image || zo.image_url || "";

      const orderedAt = zo.ordered_at || zo.placed_at || zo.created_at
        ? new Date(zo.ordered_at || zo.placed_at || zo.created_at)
        : new Date();

      if (!restaurant) continue;

      // Upsert by zomatoOrderId to avoid duplicates
      await OrderHistory.updateOne(
        { user: userId, zomatoOrderId: orderId },
        {
          $setOnInsert: {
            user: userId,
            zomatoOrderId: orderId,
            restaurant,
            dishName,
            cuisine,
            location: zo.delivery_address?.city || "",
            imageUrl,
            orderUrl,
            finalPrice,
            couponAdjustedPrice,
            originalPrice: Number(zo.original_amount || finalPrice),
            discount: Number(zo.discount_percent || 0),
            rating: Number(zo.restaurant_rating || 0),
            confidence: 0,
            eta: "",
            source: "zomato-sync",
            orderedAt
          }
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.log("[orderController] syncFromZomato failed:", err.message);
  }
};

// GET /api/orders/sync — explicit sync endpoint
export const syncZomatoOrderHistory = async (req, res) => {
  try {
    const result = await callUserZomatoTool(String(req.user._id), "get_order_history", {});
    if (!result?.success || !result?.result) {
      return res.json({ msg: "No Zomato order history available", synced: 0 });
    }

    const zOrders = parseZomatoOrders(result.result);
    let synced = 0;

    for (const zo of zOrders) {
      const orderId = String(zo.order_id || zo.id || "");
      const restaurant = zo.restaurant_name || zo.restaurant?.name || "";
      if (!orderId || !restaurant) continue;

      const finalPrice = Number(zo.total_amount || zo.order_amount || zo.price || 0);
      const couponAdjustedPrice = Number(zo.paid_amount || zo.final_amount || finalPrice);
      const orderedAt = zo.ordered_at || zo.placed_at || zo.created_at
        ? new Date(zo.ordered_at || zo.placed_at || zo.created_at)
        : new Date();

      const up = await OrderHistory.updateOne(
        { user: req.user._id, zomatoOrderId: orderId },
        {
          $setOnInsert: {
            user: req.user._id,
            zomatoOrderId: orderId,
            restaurant,
            dishName: zo.items?.[0]?.name || "",
            cuisine: zo.cuisine || "",
            location: zo.delivery_address?.city || "",
            imageUrl: zo.restaurant_image || "",
            orderUrl: zo.order_url || "",
            finalPrice,
            couponAdjustedPrice,
            originalPrice: Number(zo.original_amount || finalPrice),
            discount: Number(zo.discount_percent || 0),
            rating: Number(zo.restaurant_rating || 0),
            confidence: 0,
            eta: "",
            source: "zomato-sync",
            orderedAt
          }
        },
        { upsert: true }
      );
      if (up.upsertedCount > 0) synced++;
    }

    const orders = await OrderHistory.find({ user: req.user._id })
      .sort({ orderedAt: -1 })
      .limit(50);

    res.json({ msg: `Synced ${synced} new orders from Zomato`, synced, orders });
  } catch (error) {
    console.log("syncZomatoOrderHistory error:", error);
    res.status(500).json({ msg: error.message || "Unable to sync order history" });
  }
};

export const validateCart = async (req, res) => {
  try {
    const { items, restaurantId } = req.body;
    if (!items?.length || !restaurantId) {
      return res.status(400).json({ msg: "Items and restaurantId are required" });
    }

    if (!req.user?.zomato?.linked) {
      return res.json({ msg: "Real-time Zomato validation requires a linked account.", validated: false });
    }

    // Try to get real cart data from Zomato
    // Step 1: Create a temporary cart
    const addressRes = await callUserZomatoTool(String(req.user._id), "get_saved_addresses_for_user", {});
    const addresses = parseAddresses(addressRes?.result?.[0]?.text || "");
    if (!addresses.length) {
      return res.json({ msg: "No saved addresses found on Zomato", validated: false });
    }

    const cartData = {
      res_id: Number(restaurantId),
      items: items.map(i => ({ variant_id: i.catalogueId, quantity: 1 })),
      address_id: addresses[0].address_id || addresses[0].id,
      payment_type: "pay_later"
    };

    const cartRes = await callUserZomatoTool(String(req.user._id), "create_cart", cartData);
    if (!cartRes?.success || cartRes?.isError) {
      return res.json({ msg: "Zomato cart validation failed", validated: false, error: cartRes?.result });
    }

    // Step 2: Get checkout details (real price, taxes, etc.)
    const checkoutRes = await callUserZomatoTool(String(req.user._id), "checkout_cart", {
      cart_id: cartRes.result?.cart_id || cartRes.result?.id
    });

    if (checkoutRes?.success && !checkoutRes?.isError) {
      let raw = checkoutRes.result;
      if (Array.isArray(raw) && raw[0]?.text) {
        try { raw = JSON.parse(raw[0].text); } catch {}
      }
      
      const bill = raw?.bill_details || raw?.data?.bill_details || {};
      return res.json({
        msg: "Real-time Zomato price fetched!",
        validated: true,
        realPrice: bill.total_amount || bill.to_pay || 0,
        taxes: bill.taxes_and_charges || 0,
        deliveryFee: bill.delivery_charge || 0,
        appliedCoupon: raw?.promo?.code || null
      });
    }

    res.json({ msg: "Added to Zomato cart, but couldn't fetch real price", validated: true });
  } catch (error) {
    console.log("validateCart error:", error);
    res.status(500).json({ msg: error.message });
  }
};

export const addToCart = async (req, res) => {
  try {
    const { deal, deliveryLocation } = req.body;

    if (!deal || !deal.restaurant) {
      return res.status(400).json({ msg: "Invalid deal data" });
    }

    // Use the user's selected delivery location, NOT the restaurant's district
    const userDeliveryLocation = deliveryLocation || deal.userLocation || deal.location || "";

    // Pick the best coupon
    let bestPromoCode = deal.bestCouponCombo?.[0]?.code || null;
    try {
      const liveCoupons = await fetchUserZomatoCoupons(String(req.user._id));
      if (liveCoupons.length) {
        let bestSavings = 0;
        const price = deal.couponAdjustedPrice || deal.finalPrice || 0;
        for (const c of liveCoupons) {
          if (c.minOrder && price < c.minOrder) continue;
          const saving = c.kind === "flat"
            ? Math.min(c.value, c.cap || c.value, price)
            : Math.min(Math.round((price * c.value) / 100), c.cap || 999);
          if (saving > bestSavings) {
            bestSavings = saving;
            bestPromoCode = c.code;
          }
        }
      }
    } catch {}

    // Build the fallback order URL — the old ?rid= format is dead on Zomato (404).
    // Use the restaurant's direct page URL if available, otherwise use delivery search by dish/restaurant name.
    const isBrokenUrl = deal.orderUrl && (/[?&]rid=/.test(deal.orderUrl) || /\/order-food-online\?rid=/.test(deal.orderUrl));
    const restaurantId = deal.restaurantId || deal.res_id || "";
    
    // If we have a restaurant ID, we should ideally use that for navigation.
    // For external Zomato, we prefer the slug or direct page URL if MCP provided it.
    const orderUrl = (deal.orderUrl && !isBrokenUrl)
      ? deal.orderUrl
      : deal.slug 
        ? `https://www.zomato.com/restaurant/${deal.slug}/order`
        : `https://www.zomato.com/order-food-online`; // No more search query based navigation if broken

    // Always save to history first — use user's selected delivery location, not restaurant's district
    await OrderHistory.create({
      user: req.user._id,
      restaurant: deal.restaurant || "",
      dishName: deal.dishName || "",
      cuisine: deal.cuisine || "",
      location: userDeliveryLocation,          // ← user's delivery address, not deal.location
      imageUrl: deal.imageUrl || "",
      orderUrl,                                 // ← sanitized URL (no broken ?rid= links)
      finalPrice: deal.finalPrice || 0,
      couponAdjustedPrice: deal.couponAdjustedPrice || deal.finalPrice || 0,
      originalPrice: deal.originalPrice || deal.finalPrice || 0,
      discount: deal.discount || 0,
      rating: deal.rating || 0,
      confidence: deal.confidence || 0,
      eta: deal.eta || "",
      source: "cart-added",
      restaurantId: String(restaurantId).trim(),
      orderedAt: new Date()
    });

    const isZomatoDeal = /zomato\.com/i.test(orderUrl || "") || /zomato/i.test(deal.source || "");

    // Only attempt create_cart if this deal looks like a Zomato order and we have linked session info.
    if (isZomatoDeal && deal.res_id && deal.catalogueId && req.user?.zomato?.linked) {

      // Auto re-authenticate the user's session if it was lost (server restart)
      if (!isSessionAuthenticated(String(req.user._id))) {
        const storedPacket = req.user.zomato?.verifiedAuthPacket
          || (await User.findById(req.user._id).select("zomato"))?.zomato?.verifiedAuthPacket;

        if (storedPacket) {
          console.log(`[addToCart] Re-authenticating Zomato session for user ${req.user._id}`);
          await reAuthUserSession(String(req.user._id), storedPacket);
        }
      }

      // Get delivery address
      let addressesRaw = null;
      try {
        const addrRes = await callUserZomatoTool(String(req.user._id), "get_saved_addresses_for_user", {});
        if (addrRes?.success && addrRes?.result?.length) {
          addressesRaw = addrRes.result;
        }
      } catch {}

      if (!addressesRaw) {
        try {
          const addrRes = await callZomatoMcpTool("get_saved_addresses_for_user", {});
          if (addrRes?.success && addrRes?.result?.length) {
            addressesRaw = addrRes.result;
          }
        } catch {}
      }

      const addresses = parseAddresses(
        Array.isArray(addressesRaw) ? addressesRaw[0]?.text || "" : String(addressesRaw || "")
      );

      if (addresses.length) {
        const address = addresses[0];
        const cartData = {
          res_id: Number(deal.res_id),
          items: [{ variant_id: deal.catalogueId, quantity: 1 }],
          address_id: address.address_id || address.id,
          payment_type: "pay_later",
          ...(bestPromoCode ? { promo_code: bestPromoCode } : {})
        };

        // Try user session first, then global
        let cartResponse = null;
        try {
          cartResponse = await callUserZomatoTool(String(req.user._id), "create_cart", cartData);
        } catch (e) {
          console.log("[addToCart] User session create_cart failed:", e.message);
        }

        if (!cartResponse?.success) {
          try {
            cartResponse = await callZomatoMcpTool("create_cart", cartData);
          } catch (e) {
            console.log("[addToCart] Global MCP create_cart failed:", e.message);
          }
        }

        if (cartResponse?.success && !cartResponse?.isError) {
          return res.json({
            msg: "Added to cart on Zomato!",
            cartAdded: true,
            appliedCoupon: bestPromoCode || null,
            savedToHistory: true
          });
        }

        console.log("[addToCart] create_cart failed, falling back to URL");
      }
    }

    // Fallback: return URL so frontend opens Zomato directly
    return res.json({
      msg: "Saved to history! Opening Zomato to complete your order.",
      cartAdded: false,
      orderUrl,
      appliedCoupon: bestPromoCode || null,
      savedToHistory: true
    });
  } catch (error) {
    console.log("addToCart error:", error);
    res.status(500).json({ msg: error.message || "Unable to process cart request" });
  }
};
