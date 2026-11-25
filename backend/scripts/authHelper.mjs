import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const TARGET = process.argv[2] || "zomato";
const MCP_URL = TARGET === "swiggy" 
  ? "https://mcp.swiggy.com/food" 
  : "https://mcp-server.zomato.com/mcp";

console.log(`\n==============================================`);
console.log(`Starting ${TARGET.toUpperCase()} MCP Authentication`);
console.log(`URL: ${MCP_URL}`);
console.log(`==============================================\n`);

const p = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["-y", "mcp-remote", MCP_URL], {
  stdio: ["pipe", "pipe", "pipe"],
  shell: true
});

let authUrlFound = false;

p.stdout.on("data", (data) => {
  const text = data.toString();
  console.log(`[${TARGET} OUT]`, text);
});

p.stderr.on("data", (data) => {
  const text = data.toString();
  console.log(`[${TARGET} LOG]`, text);

  const match = text.match(/https:\/\/[^\s]+authorize[^\s]*/i) || text.match(/https:\/\/mcp[^\s]+/i);
  if (match && !authUrlFound) {
    authUrlFound = true;
    console.log(`\n>>> PLEASE OPEN THIS URL IN YOUR BROWSER TO LOGIN TO ${TARGET.toUpperCase()}:`);
    console.log(match[0]);
    console.log(`<<<\n`);
  }
});

p.on("close", (code) => {
  console.log(`[${TARGET}] Process exited with code ${code}`);
  process.exit(code || 0);
});

// Wait up to 3 minutes for user to complete browser auth
setTimeout(() => {
  console.log(`[${TARGET}] Timeout reached. Terminating...`);
  p.kill();
  process.exit(1);
}, 180000);
