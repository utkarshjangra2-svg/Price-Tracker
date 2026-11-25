import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ZOMATO_MCP_OFFICIAL_URL =
  process.env.ZOMATO_MCP_OFFICIAL_URL || "https://mcp-server.zomato.com/mcp";

const userSessions = new Map();

const buildTransport = () =>
  new StdioClientTransport({
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    args: ["-y", "mcp-remote", ZOMATO_MCP_OFFICIAL_URL]
  });

const normalizeToolResult = (result) => {
  if (!result) {
    return null;
  }

  if (Array.isArray(result?.content)) {
    const textItem = result.content.find((item) => item?.type === "text" && item?.text);
    if (textItem?.text) {
      try {
        return JSON.parse(textItem.text);
      } catch {
        return textItem.text;
      }
    }
  }

  if (Array.isArray(result) && result[0]?.text) {
    try {
      return JSON.parse(result[0].text);
    } catch {
      return result[0].text;
    }
  }

  return result;
};

const getSessionEntry = async (userId) => {
  const existing = userSessions.get(userId);
  if (existing?.client) {
    return existing;
  }

  const transport = buildTransport();
  const client = new Client(
    { name: `smartdeal-zomato-user-${userId}`, version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);

  const entry = {
    client,
    transport,
    pendingAuthPacket: null,
    authenticated: false,
    connectedAt: new Date().toISOString()
  };

  userSessions.set(userId, entry);
  return entry;
};

export const callUserZomatoTool = async (userId, toolName, args = {}) => {
  const session = await getSessionEntry(userId);
  const result = await session.client.callTool({ name: toolName, arguments: args });
  return {
    success: true,
    tool: toolName,
    result: result.content || result,
    isError: result.isError || false
  };
};

export const startUserZomatoLink = async ({ userId, phoneNumber }) => {
  const rawResult = await callUserZomatoTool(userId, "bind_user_number", {
    phone_number: phoneNumber
  });
  const authPacket = normalizeToolResult(rawResult.result);

  const session = userSessions.get(userId);
  if (session) {
    session.pendingAuthPacket = authPacket;
  }

  return authPacket;
};

export const verifyUserZomatoLink = async ({ userId, authPacket, code }) => {
  const rawResult = await callUserZomatoTool(userId, "bind_user_number_verify_code", {
    auth_packet: authPacket,
    code
  });
  const verified = normalizeToolResult(rawResult.result);

  // Mark the in-memory session as authenticated
  const session = userSessions.get(userId);
  if (session && verified === true) {
    session.authenticated = true;
  }

  return verified;
};

/**
 * Re-authenticate a user's Zomato session using their stored verifiedAuthPacket.
 * Called automatically before create_cart when the session was lost (server restart).
 * Returns true if re-auth succeeded, false otherwise.
 */
export const reAuthUserSession = async (userId, verifiedAuthPacket) => {
  if (!verifiedAuthPacket) return false;

  try {
    const session = userSessions.get(userId);

    // Already authenticated — nothing to do
    if (session?.authenticated) return true;

    // Re-bind using the stored verified packet (this silently re-links without OTP)
    const rawResult = await callUserZomatoTool(userId, "bind_user_number_verify_code", {
      auth_packet: verifiedAuthPacket,
      // Use a special flag — re-auth attempt with stored packet (no new OTP needed)
      code: verifiedAuthPacket?.otp || verifiedAuthPacket?.code || "reauth"
    });
    const verified = normalizeToolResult(rawResult.result);

    const updatedSession = userSessions.get(userId);
    if (updatedSession && verified === true) {
      updatedSession.authenticated = true;
      console.log(`[ZomatoSession] Re-auth successful for user ${userId}`);
      return true;
    }

    return false;
  } catch (err) {
    console.log(`[ZomatoSession] Re-auth failed for user ${userId}:`, err.message);
    return false;
  }
};

/** Returns true only if this user has an active, authenticated in-memory session */
export const isSessionAuthenticated = (userId) => {
  const session = userSessions.get(userId);
  return Boolean(session?.authenticated);
};

export const disconnectUserZomatoSession = async (userId) => {
  const session = userSessions.get(userId);
  if (!session) {
    return;
  }

  try {
    await session.client?.close();
  } catch {}

  userSessions.delete(userId);
};

export const getUserZomatoSessionStatus = (userId) => {
  const session = userSessions.get(userId);
  return {
    active: Boolean(session?.client),
    authenticated: Boolean(session?.authenticated),
    connectedAt: session?.connectedAt || null,
    hasPendingAuth: Boolean(session?.pendingAuthPacket)
  };
};
