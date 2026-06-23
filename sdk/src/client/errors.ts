/** Thrown when the backend returns 401 or credentials are absent. */
export class AuthError extends Error {
  readonly code = "AUTH_REQUIRED" as const;

  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthError";
  }
}

/** Thrown when the backend returns a non-2xx status other than 401. */
export class ApiError extends Error {
  readonly code = "API_ERROR" as const;
  readonly status: number;
  readonly path: string;

  constructor(path: string, status: number, detail?: string) {
    super(`API ${path} failed: ${status}${detail ? ` — ${detail}` : ""}`);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
  }
}

/** Thrown when the fetch itself fails (DNS failure, no connectivity, CORS abort). */
export class NetworkError extends Error {
  readonly code = "NETWORK_ERROR" as const;
  readonly path: string;
  cause?: Error;

  constructor(path: string, cause?: Error) {
    super(`Network error on ${path}${cause ? `: ${cause.message}` : ""}`);
    this.name = "NetworkError";
    this.path = path;
    if (cause) this.cause = cause;
  }
}

/** Thrown when a payload fails SDK-side validation before hitting the network. */
export class ValidationError extends Error {
  readonly code = "VALIDATION_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export type SniperError = AuthError | ApiError | NetworkError | ValidationError;

export function isSniperError(err: unknown): err is SniperError {
  return (
    err instanceof AuthError ||
    err instanceof ApiError ||
    err instanceof NetworkError ||
    err instanceof ValidationError
  );
}
