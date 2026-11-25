import express from "express";
import {
  compareQuickCommerceCart,
  connectQuickCommerceMcp,
  getQuickCommerceStatus,
  searchQuickCommerceProducts
} from "../services/quickCommerceMcpService.js";

const router = express.Router();

router.get("/status", async (_req, res) => {
  const connection = await connectQuickCommerceMcp();
  res.json({
    success: connection.status === "connected",
    status: getQuickCommerceStatus()
  });
});

router.get("/tools", async (_req, res) => {
  await connectQuickCommerceMcp();
  const status = getQuickCommerceStatus();

  res.json({
    success: status.status === "connected",
    tools: status.tools,
    status
  });
});

router.post("/search", async (req, res) => {
  try {
    const { query = "", platforms = ["zepto", "swiggy"], limit = 8 } = req.body || {};
    const result = await searchQuickCommerceProducts({
      query,
      platforms: Array.isArray(platforms) ? platforms : String(platforms).split(","),
      limit: Number(limit) || 8
    });

    res.json({
      success: Boolean(result.connected),
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || "Quick commerce search failed"
    });
  }
});

router.post("/compare", async (req, res) => {
  try {
    const { items = [], platforms = ["zepto", "swiggy"] } = req.body || {};
    const result = await compareQuickCommerceCart({
      items: Array.isArray(items) ? items : String(items).split(",").map((item) => item.trim()).filter(Boolean),
      platforms: Array.isArray(platforms) ? platforms : String(platforms).split(",")
    });

    res.json({
      success: Boolean(result.connected),
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || "Quick commerce comparison failed"
    });
  }
});

export default router;
