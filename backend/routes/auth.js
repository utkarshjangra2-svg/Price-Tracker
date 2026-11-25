import express from "express";
import {
  signup,
  signin,
  forgotPassword,
  resetPassword,
  getZomatoLinkStatus,
  startZomatoLink,
  verifyZomatoLink,
  unlinkZomatoAccount,
  getSwiggyLinkButtonUrl,
  getSwiggyAccountLinkStatus,
  swiggyOAuthCallback,
  linkSwiggyWithToken,
  unlinkSwiggyFromAccount
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/signup",signup);
router.post("/signin",signin);
router.post("/forgot",forgotPassword);
router.post("/reset",resetPassword);
router.get("/zomato/status", protect, getZomatoLinkStatus);
router.post("/zomato/link/start", protect, startZomatoLink);
router.post("/zomato/link/verify", protect, verifyZomatoLink);
router.post("/zomato/unlink", protect, unlinkZomatoAccount);

// Swiggy OAuth routes
router.get("/swiggy/link/url", protect, getSwiggyLinkButtonUrl);
router.get("/swiggy/status", protect, getSwiggyAccountLinkStatus);
router.get("/swiggy/callback", swiggyOAuthCallback);
router.post("/swiggy/link", protect, linkSwiggyWithToken);
router.post("/swiggy/unlink", protect, unlinkSwiggyFromAccount);

export default router;
