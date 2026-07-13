class e extends Error {
  constructor(r = "Authentication required") {
    super(r), this.code = "AUTH_REQUIRED", this.name = "AuthError";
  }
}
class i extends Error {
  constructor(r, o, s) {
    super(`API ${r} failed: ${o}${s ? ` — ${s}` : ""}`), this.code = "API_ERROR", this.name = "ApiError", this.status = o, this.path = r;
  }
}
class n extends Error {
  constructor(r, o) {
    super(`Network error on ${r}${o ? `: ${o.message}` : ""}`), this.code = "NETWORK_ERROR", this.name = "NetworkError", this.path = r, o && (this.cause = o);
  }
}
class c extends Error {
  constructor(r) {
    super(r), this.code = "VALIDATION_ERROR", this.name = "ValidationError";
  }
}
function E(t) {
  return t instanceof e || t instanceof i || t instanceof n || t instanceof c;
}
export {
  i as ApiError,
  e as AuthError,
  n as NetworkError,
  c as ValidationError,
  E as isSniperError
};
//# sourceMappingURL=errors.js.map
