/**
 * Cloudflare Worker entry for smcsuperfibwebapp.
 *
 * Behavior:
 * - /api/*  -> proxy to Railway backend, preserving method/body/headers.
 *             OPTIONS preflight returns 204 with CORS headers.
 * - /*      -> serve the existing TanStack Start SSR shell + static assets.
 */

import serverEntry from "../dist/server/server.js";

const BACKEND_URL = "https://smcsmartfib-webapp-production.up.railway.app";

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = [
  "Authorization",
  "Content-Type",
  "X-EA-API-Key",
  "X-API-KEY",
  "X-SMC-Token",
  "X-SMC-Auth",
  "X-Sniper-Secret",
  "X-WP-Nonce",
  "X-Requested-With",
].join(", ");

function isApiPath(url) {
  return url.pathname === "/api" || url.pathname.startsWith("/api/");
}

function wantsJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json");
}

function corsHeadersFor(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function apiResponseHeaders(request, upstream) {
  const headers = new Headers(upstream.headers);
  for (const [key, value] of Object.entries(corsHeadersFor(request))) {
    headers.set(key, value);
  }
  return headers;
}

async function handleApi(request, backendBase) {
  const url = new URL(request.url);
  const targetUrl = new URL(url.pathname + url.search, backendBase);

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers: request.headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer(),
    redirect: "manual",
  });

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeadersFor(request),
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: apiResponseHeaders(request, upstream),
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (isApiPath(url)) {
      const backendBase = env?.RAILWAY_BACKEND_URL || BACKEND_URL;
      if (!backendBase) {
        return new Response(JSON.stringify({ error: "RAILWAY_BACKEND_URL missing" }), {
          status: 500,
          headers: { "content-type": "application/json", ...corsHeadersFor(request) },
        });
      }
      return handleApi(request, backendBase);
    }

    if (typeof serverEntry?.fetch === "function") {
      return serverEntry.fetch(request);
    }

    return new Response("smc-superfib-worker misconfigured: missing serverEntry.fetch", {
      status: 500,
    });
  },
};
