declare const __SCHEMA_VERSION__: string | undefined;

export const SCHEMA_VERSION =
  typeof __SCHEMA_VERSION__ !== "undefined"
    ? __SCHEMA_VERSION__
    : (process.env.VITE_SCHEMA_VERSION ?? "1"); // Increment on breaking schema changes
export const APP_VERSION_LABEL = "v13.1.0";
