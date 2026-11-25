import express from "express";
import { 
  createOrderHistory, 
  getMyOrderHistory, 
  addToCart, 
  syncZomatoOrderHistory,
  validateCart
} from "../controllers/orderController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/me", protect, getMyOrderHistory);
router.get("/sync", protect, syncZomatoOrderHistory);
router.post("/", protect, createOrderHistory);
router.post("/add-to-cart", protect, addToCart);
router.post("/validate-cart", protect, validateCart);

export default router;
