#!/usr/bin/env node
// Run on YOUR Windows/Mac/Linux machine (not on DO).
// Starts an HTTP CONNECT proxy bound to this machine's Tailscale IP so the DO
// container can route YouTube requests through your residential internet.
//
// Uses HTTP CONNECT (not SOCKS5) because Python's urllib supports it natively
// without needing PySocks installed. Combined with NO_PROXY env var on the
// server, POT HTTP requests to localhost stay local while YouTube requests
// route through this tunnel.
//
// Prereqs (one-time):
//   1. Install Tailscale: https://tailscale.com/download/windows
//      Sign in with the SAME account as the DO containers (ptchblckchocopie@).
//
// Usage:
//   node scripts/home-egress-win.js
//
// Keep this terminal open. Closing it stops the proxy.

const net = require("net");
const http = require("http");
const { execSync } = require("child_process");
const crypto = require("crypto");

const PORT = parseInt(process.env.HOME_PROXY_PORT || "1080", 10);

// Get Tailscale IPv4
function getTailscaleIp() {
  const cmds = ["tailscale", '"C:\\Program Files\\Tailscale\\tailscale.exe"'];
  for (const cmd of cmds) {
    try {
      const out = execSync(`${cmd} ip -4`, { encoding: "utf8", shell: true }).trim();
      const ip = out.split("\n")[0].trim();
      if (/^100\.\d+\.\d+\.\d+$/.test(ip)) return ip;
    } catch {}
    try {
      const out = execSync(`${cmd} status`, { encoding: "utf8", shell: true });
      const selfLine = out.split("\n").find((l) => l.includes(" - ") || l.includes(require("os").hostname()));
      if (selfLine) {
        const m = selfLine.match(/^(100\.\d+\.\d+\.\d+)/);
        if (m) return m[1];
      }
    } catch {}
  }
  return null;
}

const TAILNET_IP = getTailscaleIp();
if (!TAILNET_IP) {
  console.error("ERROR: Could not get Tailscale IP.");
  console.error("Make sure Tailscale is installed, running, and authenticated.");
  console.error("  Download: https://tailscale.com/download/windows");
  console.error("  Then sign in with the same account as your DO containers.");
  process.exit(1);
}

// Random credentials for this session
const PROXY_USER = "rv-" + crypto.randomBytes(4).toString("hex");
const PROXY_PASS = crypto.randomBytes(16).toString("hex");
const AUTH_TOKEN = Buffer.from(`${PROXY_USER}:${PROXY_PASS}`).toString("base64");

function checkAuth(req) {
  const auth = req.headers["proxy-authorization"] || "";
  if (!auth.startsWith("Basic ")) return false;
  return auth.slice(6) === AUTH_TOKEN;
}

// ── HTTP CONNECT proxy ────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // Regular HTTP requests (non-CONNECT) — reject
  if (!checkAuth(req)) {
    res.writeHead(407, { "Proxy-Authenticate": 'Basic realm="proxy"' });
    res.end("Proxy authentication required");
    return;
  }
  // Forward plain HTTP requests (rare — most traffic uses CONNECT for HTTPS)
  const url = new URL(req.url);
  const opts = {
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname + url.search,
    method: req.method,
    headers: { ...req.headers },
  };
  delete opts.headers["proxy-authorization"];
  const proxy = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxy.on("error", () => {
    res.writeHead(502);
    res.end("Bad gateway");
  });
  req.pipe(proxy);
});

// CONNECT method — the main path for HTTPS (YouTube, etc.)
server.on("connect", (req, clientSocket, head) => {
  if (!checkAuth(req)) {
    clientSocket.write("HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm=\"proxy\"\r\n\r\n");
    clientSocket.destroy();
    return;
  }

  const [host, portStr] = req.url.split(":");
  const port = parseInt(portStr || "443", 10);

  const target = net.createConnection(port, host, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length > 0) target.write(head);
    clientSocket.pipe(target);
    target.pipe(clientSocket);
  });

  target.on("error", () => {
    clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    clientSocket.destroy();
  });

  clientSocket.on("error", () => target.destroy());
});

server.listen(PORT, TAILNET_IP, () => {
  const EGRESS_URL = `http://${PROXY_USER}:${PROXY_PASS}@${TAILNET_IP}:${PORT}`;

  console.log(`
================================================================
  HTTP CONNECT proxy running on ${TAILNET_IP}:${PORT}

  Set this on Digital Ocean (App Platform > Settings > Env Vars):

  EGRESS_PROXY_URL=${EGRESS_URL}

  Then redeploy. Keep this terminal open!
================================================================
`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`ERROR: Port ${PORT} already in use. Kill the old process or set HOME_PROXY_PORT=<other>`);
  } else if (err.code === "EADDRNOTAVAIL") {
    console.error(`ERROR: Cannot bind to ${TAILNET_IP}. Is Tailscale running?`);
  } else {
    console.error("Server error:", err.message);
  }
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\nShutting down proxy...");
  server.close();
  process.exit(0);
});
