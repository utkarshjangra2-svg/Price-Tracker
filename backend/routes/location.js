import express from "express";
import { callZomatoMcpTool, connectToZomatoMcp } from "../services/zomatoOfficialMcp.js";
import { callUserZomatoTool } from "../services/zomatoUserSessionService.js";
import { optionalProtect } from "../middleware/optionalAuthMiddleware.js";

const router = express.Router();

const normalizeToolResult = (result) => {
  if (!result) return null;
  if (Array.isArray(result?.content)) {
    const textItem = result.content.find((item) => item?.type === "text" && item?.text);
    if (textItem?.text) {
      try { return JSON.parse(textItem.text); } catch { return textItem.text; }
    }
  }
  if (Array.isArray(result) && result[0]?.text) {
    try { return JSON.parse(result[0].text); } catch { return result[0].text; }
  }
  return result;
};

const getToolCaller = (user) => {
  if (user?.id && user?.zomato?.linked) {
    return (toolName, args) => callUserZomatoTool(String(user.id), toolName, args);
  }
  return (toolName, args) => callZomatoMcpTool(toolName, args);
};

const hasLinkedUserZomatoSession = (user) => Boolean(user?.id && user?.zomato?.linked);

// GET /api/location/saved — fetch saved addresses from Zomato
router.get("/saved", optionalProtect, async (req, res) => {
  try {
    const user = req.user || null;
    if (!hasLinkedUserZomatoSession(user)) {
      await connectToZomatoMcp();
    }
    const callTool = getToolCaller(user);

    const addressRes = await callTool("get_saved_addresses_for_user", {});
    const raw = normalizeToolResult(addressRes?.result || addressRes);
    const addresses = raw?.addresses || raw?.data?.addresses || (Array.isArray(raw) ? raw : []);

    const simplified = addresses.map((addr) => ({
      id: addr.address_id || addr.id,
      label: addr.label || addr.tag || "Saved",
      fullAddress: addr.address || addr.full_address || addr.title || "",
      area: addr.area || addr.suburb || addr.locality || "",
      city: addr.city || "",
      latitude: addr.latitude || addr.lat || null,
      longitude: addr.longitude || addr.lng || addr.lon || null
    })).filter((addr) => addr.fullAddress || addr.area);

    res.json({ success: true, addresses: simplified });
  } catch (error) {
    console.log("[Location API] Saved addresses fetch failed:", error.message);
    res.json({ success: false, addresses: [], error: error.message });
  }
});

// POST /api/location/set — set active delivery location in Zomato MCP session
// Body: { addressId?, latitude?, longitude?, query }
router.post("/set", optionalProtect, async (req, res) => {
  try {
    const { addressId, latitude, longitude, query } = req.body;

    if (!addressId && !latitude && !query) {
      return res.status(400).json({ success: false, error: "addressId, coordinates, or query required" });
    }

    const user = req.user || null;
    if (!hasLinkedUserZomatoSession(user)) {
      await connectToZomatoMcp();
    }
    const callTool = getToolCaller(user);

    let result = null;
    let usedMethod = "";

    // Method 1: Use saved address ID (most accurate — Zomato knows this address)
    if (addressId) {
      try {
        const toolArgs = { address_id: String(addressId) };
        const setRes = await callTool("set_delivery_address", toolArgs);
        result = normalizeToolResult(setRes?.result || setRes);
        usedMethod = "address_id";
      } catch (e) {
        console.log("[Location API] set_delivery_address by id failed:", e.message);
      }
    }

    // Method 2: Use GPS coordinates
    if (!result && latitude && longitude) {
      try {
        const coordArgs = { latitude: parseFloat(latitude), longitude: parseFloat(longitude) };
        const setRes = await callTool("set_delivery_address", coordArgs);
        result = normalizeToolResult(setRes?.result || setRes);
        usedMethod = "coordinates";
      } catch (e) {
        console.log("[Location API] set_delivery_address by coords failed:", e.message);
      }
    }

    // Method 3: Text-based address search (least precise but always available)
    if (!result && query) {
      try {
        const textArgs = { query: String(query) };
        const setRes = await callTool("set_delivery_address", textArgs);
        result = normalizeToolResult(setRes?.result || setRes);
        usedMethod = "query";
      } catch (e) {
        console.log("[Location API] set_delivery_address by query failed:", e.message);
      }
    }

    if (result) {
      return res.json({
        success: true,
        method: usedMethod,
        location: result?.location || result?.address || query,
        result
      });
    }

    // Even if MCP set failed, return success so the frontend can still use local location
    res.json({
      success: true,
      method: "local-only",
      note: "Zomato MCP address set was not available; location saved locally only.",
      location: query
    });
  } catch (error) {
    console.log("[Location API] set location error:", error.message);
    res.json({
      success: true,
      method: "local-only",
      note: "Zomato MCP not available; location saved locally.",
      location: req.body.query || ""
    });
  }
});

export default router;
