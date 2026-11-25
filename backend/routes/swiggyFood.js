import express from "express";
import {
  connectSwiggyFoodMcp,
  getSwiggyFoodStatus,
  searchSwiggyFood,
  getUserSwiggyFoodStatus,
  searchSwiggyFoodUser
} from "../services/swiggyFoodMcpService.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/status", async (_req, res) => {
  const connection = await connectSwiggyFoodMcp();

  res.json({
    success: connection.status === "connected",
    status: getSwiggyFoodStatus()
  });
});

router.get("/tools", async (_req, res) => {
  await connectSwiggyFoodMcp();
  const status = getSwiggyFoodStatus();

  res.json({
    success: status.status === "connected",
    tools: status.tools,
    status
  });
});

router.post("/search", async (req, res) => {
  try {
    const { query = "", location = "", limit = 8 } = req.body || {};
    const result = await searchSwiggyFood({
      query,
      location,
      limit: Number(limit) || 8
    });

    res.json({
      success: Boolean(result.connected),
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || "Swiggy Food MCP search failed"
    });
  }
});

// Authenticated routes (user must be logged in)

router.get("/status/user", protect, async (req, res) => {
  try {
    const status = await getUserSwiggyFoodStatus(String(req.user._id));
    res.json({
      success: status.status === "connected",
      status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || "Unable to check user Swiggy status"
    });
  }
});

router.get("/search", protect, async (req, res) => {
  try {
    const { q: query, location, limit = 8 } = req.query;

    if (!query) {
      return res.status(400).json({ 
        success: false,
        error: "Query parameter 'q' is required" 
      });
    }

    const result = await searchSwiggyFoodUser({
      userId: String(req.user._id),
      query: String(query),
      location: location ? String(location) : "",
      limit: Math.min(Number(limit) || 8, 20)
    });

    res.json({
      success: result.connected,
      ...result
    });
  } catch (error) {
    console.error("[Swiggy Search] Error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message || "Swiggy search failed",
      tip: error.message.includes("not linked") 
        ? "Please link your Swiggy account first via GET /api/auth/swiggy/link/url"
        : undefined
    });
  }
});

export default router;
