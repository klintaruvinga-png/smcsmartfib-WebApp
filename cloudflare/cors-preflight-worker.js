/**
 * Cloudflare Worker: CORS handler for trader.stokvelsociety.co.za.
 *
 * Deploy:
 *   wrangler deploy --config cloudflare/wrangler-cors.jsonc
 *
 * Route:
 *   trader.stokvelsociety.co.za/wp-json/sniper/v1/*
 *
 * The origin server rejects OPTIONS before WordPress can run the PHP CORS
 * handler. This Worker handles preflight at the edge and also attaches CORS
 * headers to actual REST responses for browser enforcement.
 */

const ALLOWED_ORIGINS = new Set([
  "https://smcsmartfib.lovable.app",
  "https://trader.stokvelsociety.co.za",
  "https://smcsuperfibwebapp.klintaruvinga.workers.dev",
  "https://id-preview--97eda4a2-efed-4b50-8b90-e9ac49043f57.lovable.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
]);

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

const ALLOWED_HEADERS = [
  "Authorization",
  "Content-Type",
  "X-WP-Nonce",
  "X-Requested-With",
  "X-SMC-Token",
  "X-SMC-Auth",
  "X-Sniper-Secret",
  "X-EA-API-Key",
  "X-API-KEY",
].join(", ");

function isSniperApiPath(url) {
  return url.pathname.startsWith("/wp-json/sniper/v1/");
}

function normalizeOrigin(origin) {
  return origin ? origin.replace(/\/+$/, "") : "";
}

function isAllowedOrigin(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (ALLOWED_ORIGINS.has(normalized)) return true;

  try {
    const { hostname, protocol } = new URL(normalized);
    if (protocol !== "https:") return false;
    if (/^[0-9a-f-]+\.lovableproject\.com$/.test(hostname)) return true;
    if (/^id-preview--[0-9a-z-]+\.lovable\.app$/.test(hostname)) return true;
  } catch {
    return false;
  }

  return false;
}

function getCorsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": normalizeOrigin(origin),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
  };
}

function appendVaryOrigin(headers) {
  const vary = headers.get("Vary");
  if (!vary) {
    headers.set("Vary", "Origin");
    return;
  }

  const values = vary.split(",").map((value) => value.trim().toLowerCase());
  if (!values.includes("origin")) {
    headers.set("Vary", `${vary}, Origin`);
  }
}

function addCorsHeaders(response, origin) {
  const patched = new Response(response.body, response);
  for (const [key, value] of Object.entries(getCorsHeaders(origin))) {
    patched.headers.set(key, value);
  }
  appendVaryOrigin(patched.headers);
  return patched;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (!isSniperApiPath(url)) {
      return fetch(request);
    }

    if (!isAllowedOrigin(origin)) {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 403,
          headers: {
            "Content-Length": "0",
            Vary: "Origin",
          },
        });
      }

      return fetch(request);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...getCorsHeaders(origin),
          "Content-Length": "0",
          Vary: "Origin",
        },
      });
    }

    const response = await fetch(request);
    return addCorsHeaders(response, origin);
  },
};
