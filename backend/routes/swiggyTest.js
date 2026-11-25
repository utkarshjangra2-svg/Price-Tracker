import express from "express";
import { getSwiggyFoodStatus, getUserSwiggyFoodStatus, searchSwiggyFoodUser } from "../services/swiggyFoodMcpService.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Health check - verify Swiggy MCP connection (no auth required)
router.get("/swiggy/health", async (req, res) => {
  try {
    const status = getSwiggyFoodStatus();
    res.json({
      msg: "Swiggy Food MCP health check",
      status: status.status,
      configured: Boolean(status.url),
      url: status.url,
      toolCount: status.toolCount,
      authRequired: status.authRequired
    });
  } catch (error) {
    res.status(500).json({ msg: "Health check failed", error: error.message });
  }
});

// Health check with user auth - verify user's authenticated connection
router.get("/swiggy/health/user", protect, async (req, res) => {
  try {
    const status = await getUserSwiggyFoodStatus(String(req.user._id));
    res.json({
      msg: "Swiggy Food MCP user health check",
      userId: req.user._id,
      status: status.status,
      toolCount: status.tools?.length || 0,
      authRequired: status.authRequired,
      url: status.url
    });
  } catch (error) {
    res.status(500).json({ msg: "User health check failed", error: error.message });
  }
});

// Search with authenticated user
router.get("/swiggy/search", protect, async (req, res) => {
  try {
    const { q: query, location, limit = 8 } = req.query;

    if (!query) {
      return res.status(400).json({ msg: "Query parameter 'q' is required" });
    }

    const results = await searchSwiggyFoodUser({
      userId: String(req.user._id),
      query: String(query),
      location: location ? String(location) : "",
      limit: Math.min(Number(limit) || 8, 20)
    });

    res.json(results);
  } catch (error) {
    console.error("[Swiggy Search] Error:", error.message);
    res.status(500).json({
      msg: "Swiggy search failed",
      error: error.message,
      tip: error.message.includes("not linked") 
        ? "Please link your Swiggy account first via /api/auth/swiggy/link/url"
        : undefined
    });
  }
});

export default router;
