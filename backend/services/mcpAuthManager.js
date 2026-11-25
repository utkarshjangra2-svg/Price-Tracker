import { spawn, exec } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const PROVIDER_CONFIGS = {
  zomato: {
    name: "Zomato",
    url: process.env.ZOMATO_MCP_OFFICIAL_URL || "https://mcp-server.zomato.com/mcp",
    port: 15384,
    tokenPrefix: "e209b33186e466c19f1e7a2290f87e9b"
  },
  swiggy: {
    name: "Swiggy",
    url: process.env.SWIGGY_FOOD_MCP_URL || "https://mcp.swiggy.com/food",
    port: 21621,
    tokenPrefix: "fa6692c0b97b83fe2b5b0c069efd0232"
  }
};

const authState = {
  zomato: { status: "disconnected", authUrl: "", error: "", lastAttempt: 0 },
  swiggy: { status: "disconnected", authUrl: "", error: "", lastAttempt: 0 }
};

const activeProcesses = {
  zomato: null,
  swiggy: null
};

// Check if tokens exist in ~/.mcp-auth
export const checkExistingTokens = (provider = "zomato") => {
  const config = PROVIDER_CONFIGS[provider.toLowerCase()];
  if (!config) return false;

  const authDirs = [
    path.join(os.homedir(), ".mcp-auth", "mcp-remote-v1"),
    path.join(os.homedir(), ".mcp-auth", "mcp-remote-0.1.37")
  ];

  for (const dir of authDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      const hasToken = files.some((f) => f.includes(config.tokenPrefix) && f.endsWith("_tokens.json"));
      if (hasToken) return true;
    }
  }
  return false;
};

// Clean corrupted or stale tokens for a provider
export const cleanProviderTokens = (provider = "zomato") => {
  const config = PROVIDER_CONFIGS[provider.toLowerCase()];
  if (!config) return;

  const authDirs = [
    path.join(os.homedir(), ".mcp-auth", "mcp-remote-v1"),
    path.join(os.homedir(), ".mcp-auth", "mcp-remote-0.1.37")
  ];

  for (const dir of authDirs) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.includes(config.tokenPrefix)) {
            fs.unlinkSync(path.join(dir, file));
            console.log(`[mcpAuthManager] Removed stale token file: ${file}`);
          }
        }
      } catch (err) {
        console.warn(`[mcpAuthManager] Failed cleaning ${dir}:`, err.message);
      }
    }
  }
};

// Kill any process holding the callback port (Windows)
const freePort = (port) => {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve();
    exec(`powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"`, () => {
      resolve();
    });
  });
};

export const startProviderAuth = async (provider = "zomato") => {
  const key = provider.toLowerCase();
  const config = PROVIDER_CONFIGS[key];
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  // If already authenticated and not forced, check
  if (checkExistingTokens(key)) {
    authState[key].status = "authenticated";
    return { status: "authenticated", message: `${config.name} is already authenticated.` };
  }

  // Free callback port if held by previous zombie process
  await freePort(config.port);

  // Terminate any existing auth process for this provider
  if (activeProcesses[key]) {
    try { activeProcesses[key].kill(); } catch {}
    activeProcesses[key] = null;
  }

  authState[key] = {
    status: "waiting_for_auth",
    authUrl: "",
    error: "",
    lastAttempt: Date.now()
  };

  return new Promise((resolve, reject) => {
    const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
    const args = ["-y", "mcp-remote", config.url];

    console.log(`[mcpAuthManager] Launching ${config.name} auth: ${cmd} ${args.join(" ")}`);
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], shell: true });
    activeProcesses[key] = child;

    let resolved = false;

    child.stderr.on("data", (data) => {
      const text = data.toString();
      console.log(`[${config.name} MCP Auth]`, text);

      // Look for the authorization URL
      const urlMatch = text.match(/https:\/\/[^\s]+authorize[^\s]*/i);
      if (urlMatch && !authState[key].authUrl) {
        const authUrl = urlMatch[0];
        authState[key].authUrl = authUrl;
        authState[key].status = "waiting_for_user";
        console.log(`[mcpAuthManager] ${config.name} Auth URL captured: ${authUrl}`);

        // Automatically open browser on the host machine
        if (process.platform === "win32") {
          exec(`start "" "${authUrl}"`);
        } else if (process.platform === "darwin") {
          exec(`open "${authUrl}"`);
        } else {
          exec(`xdg-open "${authUrl}"`);
        }

        if (!resolved) {
          resolved = true;
          resolve({ status: "waiting_for_user", authUrl });
        }
      }

      // Check for token completion signals
      if (text.includes("Token exchange successful") || text.includes("tokens saved") || text.includes("Connected to remote server")) {
        authState[key].status = "authenticated";
        authState[key].error = "";
      }

      // Check for code_verifier corruption
      if (text.includes("Missing or invalid code_verifier")) {
        console.warn(`[mcpAuthManager] Stale token detected for ${config.name}. Auto-cleaning...`);
        cleanProviderTokens(key);
      }
    });

    child.stdout.on("data", (data) => {
      const text = data.toString();
      console.log(`[${config.name} MCP stdout]`, text);
    });

    child.on("close", (code) => {
      activeProcesses[key] = null;
      if (checkExistingTokens(key)) {
        authState[key].status = "authenticated";
        authState[key].error = "";
      } else {
        authState[key].status = "error";
        authState[key].error = `Auth process exited with code ${code}`;
      }

      if (!resolved) {
        resolved = true;
        if (checkExistingTokens(key)) {
          resolve({ status: "authenticated" });
        } else {
          resolve({ status: authState[key].status, error: authState[key].error });
        }
      }
    });

    // Resolve if no URL caught within 15s but process is running
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({
          status: authState[key].status,
          authUrl: authState[key].authUrl,
          message: authState[key].authUrl ? "Auth URL ready" : "Process started, waiting for URL..."
        });
      }
    }, 15000);
  });
};

export const getProviderAuthStatus = (provider = "zomato") => {
  const key = provider.toLowerCase();
  const config = PROVIDER_CONFIGS[key];
  if (!config) return { status: "unknown" };

  const hasTokens = checkExistingTokens(key);
  if (hasTokens) {
    return {
      provider: key,
      name: config.name,
      status: "authenticated",
      authenticated: true
    };
  }

  return {
    provider: key,
    name: config.name,
    status: authState[key].status,
    authenticated: false,
    authUrl: authState[key].authUrl,
    error: authState[key].error
  };
};

export const getAllProvidersAuthStatus = () => {
  return {
    zomato: getProviderAuthStatus("zomato"),
    swiggy: getProviderAuthStatus("swiggy")
  };
};
