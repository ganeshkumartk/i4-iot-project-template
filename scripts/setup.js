#!/usr/bin/env node
/**
 * Cross-platform first-time setup: copy config templates and print LAN IP.
 * Usage: node scripts/setup.js
 */

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function copyIfMissing(src, dest) {
  if (fs.existsSync(dest)) {
    console.log(`  skip  ${path.relative(root, dest)} (already exists)`);
    return false;
  }
  fs.copyFileSync(src, dest);
  console.log(`  create ${path.relative(root, dest)}`);
  return true;
}

function getLanIp() {
  const nets = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family !== "IPv4" && net.family !== 4) continue;
      if (net.internal) continue;
      if (net.address.startsWith("169.254.")) continue;
      candidates.push({ name, address: net.address });
    }
  }

  // Prefer Wi-Fi / Ethernet adapters on Windows and macOS
  const preferred = candidates.find((c) =>
    /wi-?fi|wlan|ethernet|en0|eth/i.test(c.name)
  );
  return preferred ?? candidates[0];
}

console.log("\nSmart Irrigation — setup\n");

copyIfMissing(path.join(root, ".env.example"), path.join(root, ".env"));
copyIfMissing(
  path.join(root, "firmware", "config.example.h"),
  path.join(root, "firmware", "config.h")
);

const ip = getLanIp();
console.log("\n--- Next steps ---\n");
console.log("1. Edit firmware/config.h  → Wi-Fi + SERVER_HOST");
if (ip) {
  console.log(`   Suggested SERVER_HOST: "${ip.address}"  (${ip.name})`);
} else {
  console.log("   SERVER_HOST: run ipconfig (Windows) or ipconfig getifaddr en0 (macOS)");
}
console.log("2. npm install && npm start");
console.log("3. Open http://localhost:3000");
console.log("4. Flash ESP32 — Arduino IDE → ESP32 Dev Module\n");

if (process.platform === "win32") {
  console.log("Windows tips:");
  console.log("  • ESP32 port: Device Manager → COM port (install CH340/CP210x driver if missing)");
  console.log("  • Allow Node.js through Windows Firewall when prompted (port 3000)");
  console.log("  • Or run: scripts\\setup.bat / scripts\\start-server.bat\n");
}
