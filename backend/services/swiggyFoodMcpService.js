import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getSwiggyAccessToken, getSwiggyAuthorizeUrl, isSwiggyOAuthConfigured } from "./swiggyOAuthService.js";
import { buildSwiggyFallbackDeals } from "./swiggyWebFallback.js";
import { cleanProviderTokens } from "./mcpAuthManager.js";

const SWIGGY_FOOD_MCP_URL = process.env.SWIGGY_FOOD_MCP_URL || "https://mcp.swiggy.com/food";
const DEFAULT_TIMEOUT_MS = Number(process.env.SWIGGY_FOOD_MCP_TIMEOUT_MS || 15000);
const RECONNECT_COOLDOWN_MS = 8000;

let client = null;
let tools = [];
let status = "disconnected";
let lastAttempt = 0;
let lastError = "";
let authRequired = false;
let authUrl = "";

// User-authenticated clients (cached by user ID)
const userClients = new Map();
const userClientStatus = new Map();
const userLastError = new Map();

const isAuthError = (message = "") => /invalid_token|unauthorized|oauth|auth|401/i.test(message);

const withTimeout = (promise, timeoutMs = DEFAULT_TIMEOUT_MS) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Swiggy Food MCP timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]);

const parseMcpContent = (result) => {
  if (result?.structuredContent) {
    return result.structuredContent;
  }
  const content = result?.content || result;

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (part?.type === "text") return part.text;
        if (typeof part === "string") return part;
        return "";
      })
      .filter(Boolean)
      .join("\n");

    if (text) {
      try {
        return JSON.parse(text);
      } catch {
        return { text };
      }
    }
  }

  return content || {};
};

const findTool = (patterns = []) => {
  const normalizedPatterns = patterns.map((pattern) => pattern.toLowerCase());
  return tools.find((tool) => {
    const haystack = `${tool.name || ""} ${tool.description || ""}`.toLowerCase();
    return normalizedPatterns.some((pattern) => haystack.includes(pattern));
  });
};

const buildSwiggySearchUrl = ({ cuisine = "", restaurant = "" } = {}) => {
  const query = (cuisine || restaurant || "food").toLowerCase().trim().replace(/\s+/g, "%20");
  return `https://www.swiggy.com/search?query=${query}`;
};

const normalizeFoodResult = (item = {}, fallbackQuery = "") => ({
  id: item.id || item.res_id || item.restaurantId || item.restaurant_id || item.name || fallbackQuery,
  restaurant: item.restaurant || item.restaurantName || item.name || item.title || "Swiggy restaurant",
  dishName: item.dishName || item.itemName || item.item_name || item.dish || item.cuisine || fallbackQuery,
  price: Number(item.price || item.finalPrice || item.final_price || item.cost || 0),
  rating: item.rating || item.avgRating || item.avg_rating || "",
  eta: item.eta || item.deliveryTime || item.delivery_time || item.sla || "",
  location: item.location || item.area || item.locality || "",
  offerText: item.offerText || item.offer || item.coupon || "",
  orderUrl: item.orderUrl || item.url || item.deepLink || item.deeplink || "",
  imageUrl: item.imageUrl || item.image || item.cloudinaryImageId || "",
  platform: "Swiggy Food",
  raw: item
});

const extractFoodResults = (payload, fallbackQuery = "") => {
  if (Array.isArray(payload)) return payload.map((item) => normalizeFoodResult(item, fallbackQuery));

  const candidates =
    payload?.restaurants ||
    payload?.results ||
    payload?.items ||
    payload?.data?.restaurants ||
    payload?.data?.results ||
    payload?.data?.items ||
    [];

  if (Array.isArray(candidates)) {
    return candidates.map((item) => normalizeFoodResult(item, fallbackQuery));
  }

  if (payload?.text) {
    return [{
      id: `swiggy-text-${fallbackQuery}`,
      restaurant: "Swiggy Food MCP",
      dishName: fallbackQuery || "Food search",
      price: 0,
      rating: "",
      eta: "",
      location: "",
      offerText: payload.text,
      orderUrl: "",
      imageUrl: "",
      platform: "Swiggy Food",
      raw: payload
    }];
  }

  return [];
};

const buildTransport = () => {
  return new StdioClientTransport({
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    args: ["-y", "mcp-remote", SWIGGY_FOOD_MCP_URL]
  });
};

export const connectSwiggyFoodMcp = async () => {
  if (status === "connected" && client) {
    return { status, tools, url: SWIGGY_FOOD_MCP_URL, authRequired: false };
  }

  if (status === "connecting") {
    return { status, tools, url: SWIGGY_FOOD_MCP_URL, authRequired };
  }

  if (Date.now() - lastAttempt < RECONNECT_COOLDOWN_MS) {
    return { status, tools, error: lastError, url: SWIGGY_FOOD_MCP_URL, message: "Reconnect cooldown active", authRequired };
  }

  lastAttempt = Date.now();
  status = "connecting";
  lastError = "";
  authRequired = false;
  authUrl = "";

  try {
    console.log("[Swiggy Food MCP] Attempting to connect to:", SWIGGY_FOOD_MCP_URL);
    const transport = buildTransport();
    const nextClient = new Client(
      { name: "price-optimizer-swiggy-food", version: "1.0.0" },
      { capabilities: {} }
    );

    await withTimeout(nextClient.connect(transport));
    client = nextClient;
    status = "connected";

    const toolResult = await withTimeout(client.listTools());
    tools = toolResult.tools || [];
    
    console.log(`[Swiggy Food MCP] Successfully connected. ${tools.length} tools available`);

    return { status, tools, url: SWIGGY_FOOD_MCP_URL, authRequired: false };
  } catch (error) {
    status = "error";
    client = null;
    tools = [];
    lastError = error.message || "Unable to connect Swiggy Food MCP";
    console.error("[Swiggy Food MCP] Connection failed:", lastError);
    if (lastError.includes("code_verifier") || lastError.includes("OAuthError")) {
      console.warn("[Swiggy Food MCP] Detected corrupted OAuth tokens. Auto-cleaning...");
      cleanProviderTokens("swiggy");
    }
    
    return { 
      status, 
      tools: [], 
      error: lastError, 
      url: SWIGGY_FOOD_MCP_URL 
    };
  }
};

export const connectUserSwiggyFoodMcp = async (userId) => {
  if (!userId) {
    throw new Error("User ID is required");
  }

  // Check if we have a valid cached connection
  if (userClients.has(userId) && userClientStatus.get(userId) === "connected") {
    return { status: "connected", userId, tools: userClients.get(userId).tools || [] };
  }

  const userStatus = userClientStatus.get(userId) || "disconnected";
  const userLastAttempt = userClientStatus.get(`${userId}_lastAttempt`) || 0;

  if (userStatus === "connecting") {
    return { status: "connecting", userId };
  }

  if (Date.now() - userLastAttempt < RECONNECT_COOLDOWN_MS) {
    return { status: userStatus, userId, error: userLastError.get(userId), message: "Reconnect cooldown active" };
  }

  userClientStatus.set(`${userId}_lastAttempt`, Date.now());
  userClientStatus.set(userId, "connecting");
  userLastError.delete(userId);

  try {
    // Get user's Swiggy OAuth token
    const accessToken = await getSwiggyAccessToken(userId);

    // mcp-remote will handle authentication with OAuth token if provided
    const transport = buildTransport();
    const nextClient = new Client(
      { name: `price-optimizer-swiggy-food-${userId}`, version: "1.0.0" },
      { capabilities: {} }
    );

    await withTimeout(nextClient.connect(transport));

    const toolResult = await withTimeout(nextClient.listTools());
    const userTools = toolResult.tools || [];

    userClients.set(userId, { client: nextClient, tools: userTools });
    userClientStatus.set(userId, "connected");

    return { status: "connected", userId, tools: userTools };
  } catch (error) {
    const errorMsg = error.message || "Unable to connect Swiggy Food MCP";
    userClientStatus.set(userId, "error");
    userLastError.set(userId, errorMsg);
    return {
      status: "error",
      userId,
      error: errorMsg,
      authRequired: isAuthError(errorMsg)
    };
  }
};

export const getSwiggyFoodStatus = () => ({
  status,
  error: lastError,
  authRequired,
  authUrl: authRequired ? authUrl : undefined,
  url: SWIGGY_FOOD_MCP_URL,
  toolCount: tools.length,
  tools: tools.map((tool) => ({
    name: tool.name,
    description: tool.description || ""
  }))
});

export const getUserSwiggyFoodStatus = async (userId) => {
  if (!userId) return { status: "error", error: "User ID is required" };
  
  const connection = await connectUserSwiggyFoodMcp(userId);
  return Object.assign({ url: SWIGGY_FOOD_MCP_URL }, connection);
};

const callTool = async (tool, args = {}) => {
  const connection = await connectSwiggyFoodMcp();
  if (connection.status !== "connected" || !client) {
    throw new Error(connection.error || "Swiggy Food MCP is not connected");
  }

  const result = await withTimeout(client.callTool({ name: tool.name, arguments: args }));
  if (result?.isError) {
    throw new Error(`Swiggy Food MCP tool failed: ${tool.name}`);
  }
  return parseMcpContent(result);
};

const callUserTool = async (userId, tool, args = {}) => {
  if (!userId) {
    throw new Error("User ID is required");
  }

  const connection = await connectUserSwiggyFoodMcp(userId);
  if (connection.status !== "connected") {
    throw new Error(connection.error || `Swiggy Food MCP not connected for user ${userId}`);
  }

  const userClientData = userClients.get(userId);
  if (!userClientData?.client) {
    throw new Error(`No active connection for user ${userId}`);
  }

  const result = await withTimeout(userClientData.client.callTool({ name: tool.name, arguments: args }));
  if (result?.isError) {
    throw new Error(`Swiggy Food MCP tool failed: ${tool.name}`);
  }
  return parseMcpContent(result);
};

export const searchSwiggyFood = async ({ query = "", location = "", limit = 8, isSpecificDish = false } = {}) => {
  const connection = await connectSwiggyFoodMcp();
  if (connection.status !== "connected") {
    return {
      connected: false,
      error: connection.error,
      restaurants: [],
      source: "swiggy-food-mcp"
    };
  }

  // Find the search_restaurants tool
  const searchTool = connection.tools.find(t => t.name === "search_restaurants");
  if (!searchTool) {
    return {
      connected: true,
      error: "Connected, but search_restaurants tool not available from Swiggy MCP.",
      restaurants: [],
      source: "swiggy-food-mcp"
    };
  }

  // Get addresses to find a valid addressId
  const addressTool = connection.tools.find(t => t.name === "get_addresses");
  if (!addressTool) {
    return {
      connected: true,
      error: "Connected, but get_addresses tool not available from Swiggy MCP.",
      restaurants: [],
      source: "swiggy-food-mcp"
    };
  }

  let addressId = "";
  let fallbackAddressId = "";
  try {
    const addressResult = await callTool(addressTool, {});
    const addressText = addressResult?.text || JSON.stringify(addressResult);
    let addressData = {};
    try {
      addressData = JSON.parse(addressText);
    } catch {
      const jsonMatch = addressText.match(/\{[\s\S]+?\}/);
      if (jsonMatch) addressData = JSON.parse(jsonMatch[0]);
    }
    
    // Extract first address as fallback, try to find location-specific address
    const addresses = addressData?.addresses || addressData?.data?.addresses || [];
    if (addresses.length > 0) {
      fallbackAddressId = String(addresses[0].address_id || addresses[0].id || "");
      addressId = fallbackAddressId;  // Start with fallback as best match
    }
  } catch (e) {
    console.log("[Swiggy] Address fetch skipped:", e.message);
  }

  if (!addressId && !fallbackAddressId) {
    // Only return mock fallback deals if there's absolutely no saved address
    console.log("[Swiggy] No address found, will return search-based estimates");
    const fallbackDeals = buildSwiggyFallbackDeals({
      cuisine: query,
      location,
      limit
    });
    
    return {
      connected: true,
      tool: searchTool.name,
      restaurants: fallbackDeals.map(deal => ({
        id: deal.res_id || `swiggy-fallback-${deal.restaurant}`,
        restaurant: deal.restaurant,
        dishName: deal.dishName,
        price: deal.price,
        rating: deal.rating,
        eta: deal.eta || "30-35 min",
        location: deal.location,
        orderUrl: deal.orderUrl,
        imageUrl: deal.imageUrl || "",
        raw: deal
      })),
      source: "swiggy-web-fallback",
      fallbackReason: "No saved delivery address in Swiggy profile. Showing estimated search results."
    };
  }

  // Call search_restaurants with correct parameters (camelCase!)
  let restaurants = [];
  try {
    // Build search query - enhance with location when using fallback address
    let searchQuery = query || "food";
    if (fallbackAddressId && location && !isSpecificDish) {
      searchQuery = `${query || "food"} ${location}`.trim().replace(/\s+/g, " ");
      console.log(`[Swiggy] Cross-city search: query="${searchQuery}" addressId=${addressId} (fallback)`);
    } else {
      console.log(`[Swiggy] Search: query="${searchQuery}" addressId=${addressId}`);
    }
    
    const payload = await callTool(searchTool, {
      query: searchQuery,
      addressId: addressId  // camelCase, not address_id!
    });

    console.log(`[Swiggy] Tool response type: ${typeof payload}, has text: ${Boolean(payload?.text)}, is array: ${Array.isArray(payload)}`);

    // Parse Swiggy's response format
    let parsedData = {};
    if (payload?.text) {
      // Response wrapped in text field
      console.log(`[Swiggy] Parsing text response (length: ${payload.text.length})`);
      try {
        parsedData = JSON.parse(payload.text);
      } catch {
        const jsonMatch = payload.text.match(/\{[\s\S]+?\}/);
        if (jsonMatch) parsedData = JSON.parse(jsonMatch[0]);
      }
    } else if (Array.isArray(payload)) {
      console.log(`[Swiggy] Got array response with ${payload.length} items`);
      restaurants = payload;
    } else if (payload?.restaurants) {
      console.log(`[Swiggy] Got restaurants field with ${payload.restaurants.length} items`);
      restaurants = payload.restaurants;
    } else if (typeof payload === "object") {
      parsedData = payload;
    }

    // Extract restaurants from parsed data
    if (!restaurants.length && parsedData) {
      restaurants = parsedData.restaurants || parsedData.results || parsedData.items || [];
      if (restaurants.length) {
        console.log(`[Swiggy] Extracted ${restaurants.length} restaurants from parsed data`);
      }
    }

    if (!restaurants.length) {
      console.log(`[Swiggy] No restaurants found in MCP response`);
    }

  } catch (e) {
    console.log("[Swiggy Search] Tool call error:", e.message);
  }

  return {
    connected: true,
    tool: searchTool.name,
    addressId,
    restaurants: extractFoodResults(restaurants.slice(0, limit), query),
    source: "swiggy-food-mcp"
  };
};

export const searchSwiggyFoodUser = async ({ userId, query = "", location = "", limit = 8, isSpecificDish = false } = {}) => {
  if (!userId) {
    return {
      connected: false,
      error: "User ID is required",
      restaurants: [],
      source: "swiggy-food-mcp"
    };
  }

  const connection = await connectUserSwiggyFoodMcp(userId);
  if (connection.status !== "connected") {
    return {
      connected: false,
      error: connection.error,
      restaurants: [],
      source: "swiggy-food-mcp",
      authRequired: isAuthError(connection.error || "")
    };
  }

  const userTools = connection.tools || [];
  const searchTool = userTools.find((tool) => {
    const haystack = `${tool.name || ""} ${tool.description || ""}`.toLowerCase();
    const patterns = ["restaurant search", "search", "dish", "restaurant", "menu"];
    return patterns.some((pattern) => haystack.includes(pattern));
  });

  if (!searchTool) {
    return {
      connected: true,
      error: "Connected, but no food search tool was exposed by Swiggy MCP.",
      restaurants: [],
      tools: userTools,
      source: "swiggy-food-mcp"
    };
  }

  // Get addresses to find a valid addressId for this user
  const addressTool = userTools.find(t => t.name === "get_addresses");
  let addressId = "";
  let fallbackAddressId = "";
  if (addressTool) {
    try {
      const addressResult = await callUserTool(userId, addressTool, {});
      const addressText = addressResult?.text || JSON.stringify(addressResult);
      let addressData = {};
      try {
        addressData = JSON.parse(addressText);
      } catch {
        const jsonMatch = addressText.match(/\{[\s\S]+?\}/);
        if (jsonMatch) addressData = JSON.parse(jsonMatch[0]);
      }
      
      const addresses = addressData?.addresses || addressData?.data?.addresses || [];
      if (addresses.length > 0) {
        fallbackAddressId = String(addresses[0].address_id || addresses[0].id || "");
        addressId = fallbackAddressId;  // Start with fallback as best match
        
        // Look for a match based on city or location string
        if (location) {
          const queryTerm = String(location).toLowerCase().trim();
          for (const addr of addresses) {
            const fullAddr = String(addr.address || addr.full_address || addr.suburb || "").toLowerCase();
            const areaName = String(addr.area || addr.locality || addr.city || "").toLowerCase();
            
            if (fullAddr.includes(queryTerm) || areaName.includes(queryTerm) || queryTerm.includes(areaName)) {
              addressId = String(addr.address_id || addr.id);
              console.log(`[Swiggy User] Found matching saved address for search location: ${location}`);
              break;
            }
          }
        }
      }
    } catch (e) {
      console.log("[Swiggy User] Address fetch failed:", e.message);
    }
  }

  if (!addressId && !fallbackAddressId) {
    console.log("[Swiggy User] No Swiggy address found. Falling back to search-based estimates.");
    // Return empty array and set source to fallback so we trigger fallback to Zomato deals
    return {
      connected: true,
      tool: searchTool.name,
      restaurants: [],
      source: "swiggy-web-fallback",
      fallbackReason: "No saved delivery address in Swiggy profile."
    };
  }

  let restaurants = [];
  try {
    let searchQuery = query || "food";
    if (fallbackAddressId && addressId === fallbackAddressId && location && !isSpecificDish) {
      searchQuery = `${query || "food"} ${location}`.trim().replace(/\s+/g, " ");
      console.log(`[Swiggy User] Cross-city search: query="${searchQuery}" addressId=${addressId} (fallback)`);
    } else {
      console.log(`[Swiggy User] Search: query="${searchQuery}" addressId=${addressId}`);
    }

    const payload = await callUserTool(userId, searchTool, {
      query: searchQuery,
      addressId: addressId
    });

    let parsedData = {};
    if (payload?.text) {
      try {
        parsedData = JSON.parse(payload.text);
      } catch {
        const jsonMatch = payload.text.match(/\{[\s\S]+?\}/);
        if (jsonMatch) parsedData = JSON.parse(jsonMatch[0]);
      }
    } else if (Array.isArray(payload)) {
      restaurants = payload;
    } else if (payload?.restaurants) {
      restaurants = payload.restaurants;
    } else if (typeof payload === "object") {
      parsedData = payload;
    }

    if (!restaurants.length && parsedData) {
      restaurants = parsedData.restaurants || parsedData.results || parsedData.items || [];
    }

  } catch (e) {
    console.log("[Swiggy User Search] Tool call error:", e.message);
  }

  return {
    connected: true,
    tool: searchTool.name,
    authenticated: true,
    addressId,
    restaurants: extractFoodResults(restaurants.slice(0, limit), query),
    source: "swiggy-food-mcp"
  };
};

export const fetchSwiggyRestaurantMenu = async ({ userId, restaurantId, addressId } = {}) => {
  if (!restaurantId || !addressId) {
    console.log("[Swiggy Menu] Missing restaurantId or addressId");
    return [];
  }
  try {
    let result;
    if (userId) {
      const connection = await connectUserSwiggyFoodMcp(userId);
      if (connection.status !== "connected") {
        console.log("[Swiggy Menu] User MCP connection not active");
        return [];
      }
      const tool = (connection.tools || []).find(t => t.name === "get_restaurant_menu");
      if (!tool) {
        console.log("[Swiggy Menu] get_restaurant_menu tool not found for user");
        return [];
      }
      result = await callUserTool(userId, tool, { restaurantId, addressId });
    } else {
      const connection = await connectSwiggyFoodMcp();
      if (connection.status !== "connected") {
        console.log("[Swiggy Menu] Global MCP connection not active");
        return [];
      }
      const tool = (tools || []).find(t => t.name === "get_restaurant_menu");
      if (!tool) {
        console.log("[Swiggy Menu] get_restaurant_menu tool not found globally");
        return [];
      }
      result = await callTool(tool, { restaurantId, addressId });
    }

    const categories = result?.categories || [];
    const items = [];
    for (const cat of categories) {
      const catItems = cat.items || cat.menuItems || [];
      for (const item of catItems) {
        if (item && item.name) {
          items.push({
            name: item.name,
            dishName: item.name,
            price: Number(item.price || 0),
            description: item.description || "",
            isVeg: Boolean(item.isVeg),
            rating: item.rating || "",
            imageUrl: item.imageUrl || ""
          });
        }
      }
    }
    console.log(`[Swiggy Menu] Found ${items.length} items for restaurant ${restaurantId}`);
    return items;
  } catch (error) {
    console.log(`[Swiggy Menu] Error fetching menu for restaurant ${restaurantId}:`, error.message);
    return [];
  }
};
