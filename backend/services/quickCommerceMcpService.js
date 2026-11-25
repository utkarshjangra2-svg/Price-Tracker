import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const DEFAULT_TIMEOUT_MS = Number(process.env.QUICK_COMMERCE_MCP_TIMEOUT_MS || 12000);
const RECONNECT_COOLDOWN_MS = 8000;

let client = null;
let tools = [];
let status = "disconnected";
let lastAttempt = 0;
let lastError = "";

const splitArgs = (value = "") =>
  value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

const getConfig = () => {
  const command = process.env.QUICK_COMMERCE_MCP_COMMAND?.trim();
  const argsFromJson = process.env.QUICK_COMMERCE_MCP_ARGS_JSON?.trim();
  const argsFromText = process.env.QUICK_COMMERCE_MCP_ARGS?.trim();
  let args = [];

  if (argsFromJson) {
    try {
      args = JSON.parse(argsFromJson);
    } catch {
      args = splitArgs(argsFromText);
    }
  } else {
    args = splitArgs(argsFromText);
  }

  return {
    command,
    args: Array.isArray(args) ? args.map(String) : [],
    enabled: process.env.USE_QUICK_COMMERCE_MCP === "true" || Boolean(command)
  };
};

const withTimeout = (promise, timeoutMs = DEFAULT_TIMEOUT_MS) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Quick commerce MCP timed out after ${timeoutMs}ms`)), timeoutMs);
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

const normalizeProduct = (item = {}, platform = "") => ({
  id: item.id || item.product_id || item.sku || `${platform}-${item.name || item.title || Math.random()}`,
  name: item.name || item.title || item.productName || item.product_name || "Product",
  brand: item.brand || item.manufacturer || "",
  platform: item.platform || platform || item.source || "Quick commerce",
  price: Number(item.price || item.finalPrice || item.sale_price || item.sellingPrice || 0),
  mrp: Number(item.mrp || item.originalPrice || item.list_price || item.maximumRetailPrice || 0),
  quantity: item.quantity || item.packSize || item.pack_size || item.unit || "",
  eta: item.eta || item.deliveryTime || item.delivery_time || "",
  available: item.available ?? item.inStock ?? item.in_stock ?? true,
  imageUrl: item.imageUrl || item.image || item.image_url || "",
  deepLink: item.deepLink || item.url || item.productUrl || item.product_url || "",
  raw: item
});

const extractProducts = (payload, platform = "") => {
  if (Array.isArray(payload)) return payload.map((item) => normalizeProduct(item, platform));

  const candidates =
    payload?.results ||
    payload?.products ||
    payload?.items ||
    payload?.data?.results ||
    payload?.data?.products ||
    payload?.data?.items ||
    [];

  return Array.isArray(candidates) ? candidates.map((item) => normalizeProduct(item, platform)) : [];
};

export const getQuickCommerceConfig = () => {
  const config = getConfig();
  return {
    configured: Boolean(config.command),
    enabled: config.enabled,
    command: config.command || "",
    args: config.args
  };
};

export const connectQuickCommerceMcp = async () => {
  const config = getConfig();

  if (!config.command) {
    status = "not_configured";
    lastError = "Set QUICK_COMMERCE_MCP_COMMAND and QUICK_COMMERCE_MCP_ARGS to enable this connector.";
    return { status, tools: [], error: lastError, configured: false };
  }

  if (status === "connected" && client) {
    return { status, tools, configured: true };
  }

  if (status === "connecting") {
    return { status, tools, configured: true };
  }

  if (Date.now() - lastAttempt < RECONNECT_COOLDOWN_MS) {
    return { status, tools, error: lastError, configured: true, message: "Reconnect cooldown active" };
  }

  lastAttempt = Date.now();
  status = "connecting";
  lastError = "";

  try {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args
    });
    const nextClient = new Client(
      { name: "price-optimizer-quick-commerce", version: "1.0.0" },
      { capabilities: {} }
    );

    await withTimeout(nextClient.connect(transport));
    client = nextClient;
    status = "connected";

    const toolResult = await withTimeout(client.listTools());
    tools = toolResult.tools || [];

    return { status, tools, configured: true };
  } catch (error) {
    status = "error";
    client = null;
    tools = [];
    lastError = error.message || "Unable to connect quick-commerce MCP";
    return { status, tools, error: lastError, configured: true };
  }
};

export const getQuickCommerceStatus = () => ({
  ...getQuickCommerceConfig(),
  status,
  error: lastError,
  toolCount: tools.length,
  tools: tools.map((tool) => ({
    name: tool.name,
    description: tool.description || ""
  }))
});

const callTool = async (tool, args = {}) => {
  const connection = await connectQuickCommerceMcp();
  if (connection.status !== "connected" || !client) {
    throw new Error(connection.error || "Quick commerce MCP is not connected");
  }

  const result = await withTimeout(client.callTool({ name: tool.name, arguments: args }));
  if (result?.isError) {
    throw new Error(`Quick commerce MCP tool failed: ${tool.name}`);
  }
  return parseMcpContent(result);
};

export const searchQuickCommerceProducts = async ({ query = "", platforms = ["zepto", "swiggy"], limit = 8 } = {}) => {
  const connection = await connectQuickCommerceMcp();
  if (connection.status !== "connected") {
    return {
      connected: false,
      configured: connection.configured,
      error: connection.error,
      products: [],
      source: "quick-commerce-mcp"
    };
  }

  const searchTool = findTool(["search", "find product", "product"]);
  if (!searchTool) {
    return {
      connected: true,
      configured: true,
      error: "Connected, but no product search tool was exposed by this MCP.",
      products: [],
      tools
    };
  }

  const allProducts = [];
  for (const platform of platforms) {
    try {
      const payload = await callTool(searchTool, { query, platform, limit });
      allProducts.push(...extractProducts(payload, platform));
    } catch (error) {
      allProducts.push({
        id: `${platform}-error`,
        name: `${platform} search failed`,
        platform,
        price: 0,
        available: false,
        raw: { error: error.message }
      });
    }
  }

  return {
    connected: true,
    configured: true,
    tool: searchTool.name,
    products: allProducts
      .filter((item) => item.price > 0 || item.available === false)
      .sort((a, b) => a.price - b.price)
      .slice(0, limit * platforms.length),
    source: "quick-commerce-mcp"
  };
};

export const compareQuickCommerceCart = async ({ items = [], platforms = ["zepto", "swiggy"] } = {}) => {
  const connection = await connectQuickCommerceMcp();
  if (connection.status !== "connected") {
    return {
      connected: false,
      configured: connection.configured,
      error: connection.error,
      comparison: [],
      source: "quick-commerce-mcp"
    };
  }

  const compareTool = findTool(["compare", "cart", "best platform", "cheapest"]);
  if (compareTool) {
    const payload = await callTool(compareTool, { items, platforms });
    return {
      connected: true,
      configured: true,
      tool: compareTool.name,
      comparison: payload?.comparison || payload?.results || payload?.platforms || payload || [],
      source: "quick-commerce-mcp"
    };
  }

  const comparison = [];
  for (const item of items) {
    const result = await searchQuickCommerceProducts({ query: item, platforms, limit: 3 });
    comparison.push({
      item,
      best: result.products?.find((product) => product.price > 0) || null,
      products: result.products || []
    });
  }

  return {
    connected: true,
    configured: true,
    tool: "search fallback",
    comparison,
    source: "quick-commerce-mcp"
  };
};
