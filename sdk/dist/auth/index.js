const n = "smc_wp_auth";
function s(e, t) {
  const o = `${e}:${t}`;
  return typeof btoa < "u" ? btoa(o) : Buffer.from(o).toString("base64");
}
function i(e, t) {
  typeof sessionStorage > "u" || sessionStorage.setItem(n, s(e, t));
}
function u() {
  if (typeof sessionStorage > "u") return null;
  const e = sessionStorage.getItem(n);
  return e ? `Basic ${e}` : null;
}
function f() {
  typeof sessionStorage < "u" && sessionStorage.removeItem(n);
}
function a() {
  return typeof sessionStorage > "u" ? !1 : !!sessionStorage.getItem(n);
}
function r() {
  if (typeof window > "u") return null;
  const e = window;
  return e.SNIPER?.nonce ?? e.wpApiSettings?.nonce ?? null;
}
function d() {
  return !!r();
}
export {
  f as clearCredentials,
  s as encodeBasicCredentials,
  u as getAuthHeader,
  r as getWordPressNonce,
  a as hasCredentials,
  d as hasWordPressNonce,
  i as setCredentials
};
//# sourceMappingURL=index.js.map
