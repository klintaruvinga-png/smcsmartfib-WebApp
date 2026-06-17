declare const __BUILD_ID__: string | undefined;
declare const __SCHEMA_VERSION__: string | undefined;

export const APP_VERSION = "13.1.0";
export const BUILD_ID = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : (process.env.VITE_BUILD_ID ?? "dev");
export const SCHEMA_VERSION = typeof __SCHEMA_VERSION__ !== "undefined" ? __SCHEMA_VERSION__ : (process.env.VITE_SCHEMA_VERSION ?? "1"); // Increment on breaking schema changes
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
