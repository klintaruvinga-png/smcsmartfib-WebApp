import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../cloudflare/cors-preflight-worker.js";

const SNIPER_URL = "https://trader.stokvelsociety.co.za/wp-json/sniper/v1/user/settings?_=test";

function makeRequest(method, origin, url = SNIPER_URL) {
  return new Request(url, {
    method,
    headers: origin
      ? {
          Origin: origin,
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "Authorization, Content-Type",
        }
      : undefined,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("trader CORS preflight worker", () => {
  it("returns CORS headers for allowed preflight requests", async () => {
    const response = await worker.fetch(makeRequest("OPTIONS", "https://smcsmartfib.lovable.app"));

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://smcsmartfib.lovable.app",
    );
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("X-SMC-Token");
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("adds CORS headers to allowed actual sniper API responses", async () => {
    const origin = "http://localhost:5173";
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(makeRequest("GET", origin));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("passes through non-sniper paths without CORS handling", async () => {
    const fetchMock = vi.fn(async () => new Response("origin", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      makeRequest(
        "OPTIONS",
        "https://smcsmartfib.lovable.app",
        "https://trader.stokvelsociety.co.za/wp-json/other/v1/ping",
      ),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("denies disallowed preflight origins without origin reflection", async () => {
    const response = await worker.fetch(makeRequest("OPTIONS", "https://malicious.example.com"));

    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Vary")).toBe("Origin");
  });
});
