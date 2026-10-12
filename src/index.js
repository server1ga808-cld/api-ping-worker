// src/index.js - Advanced API Ping Worker
// Keeps Anikoto API and ToonStream Scraper awake

const ANIKOTO_API = "https://anikoto-api-bl5m.onrender.com";
const TOONSTREAM_API = "https://toonstream-scraper-5mws.onrender.com";

// Lightweight endpoints for pinging (fast + cached)
const PING_ENDPOINTS = [
  {
    name: "Anikoto API",
    url: `${ANIKOTO_API}/api/home`,
    timeout: 90000,
  },
  {
    name: "ToonStream Scraper",
    url: `${TOONSTREAM_API}/api/search?q=naruto`,
    timeout: 90000,
  },
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" || path === "/status") {
      const results = await pingAll();
      return jsonResponse({
        success: true,
        worker: "api-ping-worker",
        timestamp: new Date().toISOString(),
        results: results,
      });
    }

    if (path === "/ping-anikoto") {
      const r = await pingOne(PING_ENDPOINTS[0]);
      return jsonResponse(r);
    }

    if (path === "/ping-toonstream") {
      const r = await pingOne(PING_ENDPOINTS[1]);
      return jsonResponse(r);
    }

    return jsonResponse({
      success: true,
      message: "Ping Worker is running",
      endpoints: {
        status: "/ or /status (checks both APIs)",
        anikoto: "/ping-anikoto",
        toonstream: "/ping-toonstream",
      },
    });
  },

  async scheduled(event, env, ctx) {
    // Cron Trigger — প্রতি ৫ মিনিটে চলে
    ctx.waitUntil(pingAll());
  },
};

async function pingAll() {
  const results = await Promise.all(PING_ENDPOINTS.map((e) => pingOne(e)));
  const okCount = results.filter((r) => r.success).length;
  console.log(`[CRON] Pinged ${results.length} APIs, ${okCount} succeeded`);
  return results;
}

async function pingOne(endpoint) {
  const start = Date.now();
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), endpoint.timeout);

      const response = await fetch(endpoint.url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PingWorker/1.0)",
          "Accept": "application/json",
        },
      });
      clearTimeout(timeout);

      const duration = Date.now() - start;
      const success = response.ok || response.status < 500;

      // রেসপন্স বডি পড়া (ক্যাশ প্রি-ওয়ার্মের জন্য)
      const text = await response.text();
      const size = text.length;

      return {
        name: endpoint.name,
        success: success,
        status: response.status,
        duration_ms: duration,
        response_size: size,
        attempt: attempt,
        timestamp: new Date().toISOString(),
      };
    } catch (e) {
      if (attempt === 2) {
        return {
          name: endpoint.name,
          success: false,
          error: e.message,
          duration_ms: Date.now() - start,
          attempt: attempt,
          timestamp: new Date().toISOString(),
        };
      }
      // ২য় চেষ্টার আগে ১ সেকেন্ড অপেক্ষা
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}
