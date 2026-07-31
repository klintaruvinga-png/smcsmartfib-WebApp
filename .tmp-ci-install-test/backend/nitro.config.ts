/**
 * Nitro configuration for the SMC SuperFIB TanStack Start backend.
 *
 * Local dev runs on Node (nitro dev). For production, override the preset with
 * the Cloudflare Workers target once Phase 4 validation passes:
 *   NITRO_PRESET=cloudflare-module src/..
 */
import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  // serverDir is the backend source root (routes/, lib/, etc.)
  serverDir: "src",
  // API routes live under src/routes/**
  routeRules: {
    "/api/**": {
      cors: {
        origin: "https://smcsuperfibwebapp.klintaruvinga.workers.dev",
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        headers: ["Authorization", "Content-Type"],
        credentials: true,
        maxAge: 86400,
      },
    },
  },
  runtimeConfig: {
    // Private (server-only) runtime config — never exposed to client.
    databaseUrl: process.env.DATABASE_URL ?? "",
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    eaApiKey: process.env.EA_API_KEY ?? "",
    jwtSecret: process.env.JWT_SECRET ?? "",
    wordpressApiUrl: process.env.WORDPRESS_API_URL ?? "",
    wordpressApiKey: process.env.WORDPRESS_API_KEY ?? "",
  },
  // Cloudflare Workers preset is applied at build time via NITRO_PRESET env.
  // For local Phase 0 development we default to the Node server preset.
  preset: (process.env.NITRO_PRESET as string | undefined) ?? "node-server",
  devServer: {
    port: 3000,
    hostname: "0.0.0.0",
  },
});
