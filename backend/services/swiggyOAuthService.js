import axios from "axios";
import User from "../models/User.js";
import crypto from "crypto";

const SWIGGY_OAUTH_CLIENT_ID = process.env.SWIGGY_OAUTH_CLIENT_ID || "";
const SWIGGY_OAUTH_CLIENT_SECRET = process.env.SWIGGY_OAUTH_CLIENT_SECRET || "";
const SWIGGY_OAUTH_REDIRECT_URI = process.env.SWIGGY_OAUTH_REDIRECT_URI || "http://localhost:3000/auth/swiggy/callback";
const SWIGGY_OAUTH_AUTH_URL = "https://auth.swiggy.com/oauth/authorize";
const SWIGGY_OAUTH_TOKEN_URL = "https://auth.swiggy.com/oauth/token";
const SWIGGY_API_BASE = "https://api.swiggy.com";

const oauthStateStore = new Map(); // In production, use Redis or database

export const isSwiggyOAuthConfigured = () => {
  return Boolean(SWIGGY_OAUTH_CLIENT_ID && SWIGGY_OAUTH_CLIENT_SECRET);
};

export const generateOAuthState = () => {
  const state = crypto.randomBytes(32).toString("hex");
  oauthStateStore.set(state, { createdAt: Date.now() });
  
  // Clean up old states after 10 minutes
  setTimeout(() => oauthStateStore.delete(state), 10 * 60 * 1000);
  
  return state;
};

export const verifyOAuthState = (state) => {
  const stored = oauthStateStore.get(state);
  if (!stored) return false;
  
  // State is only valid for 10 minutes
  if (Date.now() - stored.createdAt > 10 * 60 * 1000) {
    oauthStateStore.delete(state);
    return false;
  }
  
  oauthStateStore.delete(state);
  return true;
};

export const getSwiggyAuthorizeUrl = () => {
  if (!isSwiggyOAuthConfigured()) {
    throw new Error("Swiggy OAuth is not configured. Set SWIGGY_OAUTH_CLIENT_ID and SWIGGY_OAUTH_CLIENT_SECRET.");
  }

  const state = generateOAuthState();
  const params = new URLSearchParams({
    client_id: SWIGGY_OAUTH_CLIENT_ID,
    redirect_uri: SWIGGY_OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: "food:order_placed,food:order_history,restaurants:search,restaurants:menu",
    state
  });

  return `${SWIGGY_OAUTH_AUTH_URL}?${params.toString()}`;
};

export const exchangeCodeForToken = async (code) => {
  try {
    const response = await axios.post(SWIGGY_OAUTH_TOKEN_URL, {
      grant_type: "authorization_code",
      code,
      client_id: SWIGGY_OAUTH_CLIENT_ID,
      client_secret: SWIGGY_OAUTH_CLIENT_SECRET,
      redirect_uri: SWIGGY_OAUTH_REDIRECT_URI
    });

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token || null,
      expiresIn: response.data.expires_in || 3600,
      tokenType: response.data.token_type || "Bearer"
    };
  } catch (error) {
    console.error("[Swiggy OAuth] Token exchange failed:", error.response?.data || error.message);
    throw new Error(`Failed to exchange code for token: ${error.message}`);
  }
};

export const refreshAccessToken = async (refreshToken) => {
  try {
    const response = await axios.post(SWIGGY_OAUTH_TOKEN_URL, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: SWIGGY_OAUTH_CLIENT_ID,
      client_secret: SWIGGY_OAUTH_CLIENT_SECRET
    });

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token || refreshToken,
      expiresIn: response.data.expires_in || 3600,
      tokenType: response.data.token_type || "Bearer"
    };
  } catch (error) {
    console.error("[Swiggy OAuth] Token refresh failed:", error.response?.data || error.message);
    throw new Error(`Failed to refresh token: ${error.message}`);
  }
};

export const getUserSwiggyProfile = async (accessToken) => {
  try {
    const response = await axios.get(`${SWIGGY_API_BASE}/user/profile`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return {
      userId: response.data.id || response.data.user_id,
      name: response.data.name || response.data.full_name,
      email: response.data.email,
      phoneNumber: response.data.phone_number || response.data.phone
    };
  } catch (error) {
    console.error("[Swiggy OAuth] Profile fetch failed:", error.response?.data || error.message);
    throw new Error(`Failed to fetch user profile: ${error.message}`);
  }
};

export const linkSwiggyAccount = async (userId, accessToken, refreshToken, expiresIn) => {
  try {
    const profile = await getUserSwiggyProfile(accessToken);
    
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    user.swiggy = {
      linked: true,
      accessToken,
      refreshToken,
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      userId: profile.userId,
      phoneNumber: profile.phoneNumber,
      name: profile.name,
      email: profile.email,
      linkedAt: new Date(),
      lastVerifiedAt: new Date()
    };

    await user.save();

    console.log(`[Swiggy OAuth] Account linked for user ${userId}`);
    return {
      linked: true,
      userId: profile.userId,
      email: profile.email,
      name: profile.name
    };
  } catch (error) {
    console.error("[Swiggy OAuth] Link failed:", error.message);
    throw error;
  }
};

export const getSwiggyAccessToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user?.swiggy?.linked) {
      throw new Error("Swiggy account not linked");
    }

    // Check if token is expired
    if (user.swiggy.tokenExpiresAt && new Date() > user.swiggy.tokenExpiresAt) {
      if (!user.swiggy.refreshToken) {
        throw new Error("Token expired and no refresh token available");
      }

      // Refresh the token
      console.log(`[Swiggy OAuth] Token expired, refreshing for user ${userId}`);
      const newTokens = await refreshAccessToken(user.swiggy.refreshToken);

      user.swiggy.accessToken = newTokens.accessToken;
      user.swiggy.refreshToken = newTokens.refreshToken;
      user.swiggy.tokenExpiresAt = new Date(Date.now() + newTokens.expiresIn * 1000);
      user.swiggy.lastVerifiedAt = new Date();

      await user.save();
      return newTokens.accessToken;
    }

    return user.swiggy.accessToken;
  } catch (error) {
    console.error("[Swiggy OAuth] Get token failed:", error.message);
    throw error;
  }
};

export const unlinkSwiggyAccount = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    user.swiggy = {
      linked: false,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      userId: null,
      phoneNumber: null,
      name: null,
      email: null,
      linkedAt: null,
      lastVerifiedAt: null
    };

    await user.save();

    console.log(`[Swiggy OAuth] Account unlinked for user ${userId}`);
    return { linked: false };
  } catch (error) {
    console.error("[Swiggy OAuth] Unlink failed:", error.message);
    throw error;
  }
};

export const getSwiggyLinkStatus = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user?.swiggy?.linked) {
      return { linked: false };
    }

    const isExpired = user.swiggy.tokenExpiresAt && new Date() > user.swiggy.tokenExpiresAt;

    return {
      linked: true,
      userId: user.swiggy.userId,
      name: user.swiggy.name,
      email: user.swiggy.email,
      phoneNumber: user.swiggy.phoneNumber,
      linkedAt: user.swiggy.linkedAt,
      tokenExpired: isExpired
    };
  } catch (error) {
    console.error("[Swiggy OAuth] Status check failed:", error.message);
    return { linked: false, error: error.message };
  }
};
