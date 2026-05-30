/**
 * @smc/superfib-sdk
 *
 * SMC SuperFib Dashboard SDK.
 * Typed API client, domain types, utilities, constants, and mock fixtures for
 * the SMC SuperFib trading signal platform.
 *
 * Sub-path imports (tree-shakeable):
 *   import { SniperClient } from "@smc/superfib-sdk/client"
 *   import type { SignalCandidate } from "@smc/superfib-sdk/types"
 *   import { fmtPrice, freshnessLabel } from "@smc/superfib-sdk/utils"
 *   import { DEFAULT_WATCHLIST } from "@smc/superfib-sdk/constants"
 *   import { mockSignals } from "@smc/superfib-sdk/mocks"
 *   import { getAuthHeader } from "@smc/superfib-sdk/auth"
 */

// Client
export { SniperClient } from "./client/SniperClient.js";
export type { SniperClientConfig } from "./client/SniperClient.js";
export {
  AuthError,
  ApiError,
  NetworkError,
  ValidationError,
  isSniperError,
} from "./client/errors.js";
export type { SniperError } from "./client/errors.js";

// Auth
export {
  encodeBasicCredentials,
  setCredentials,
  getAuthHeader,
  clearCredentials,
  hasCredentials,
  getWordPressNonce,
  hasWordPressNonce,
} from "./auth/index.js";

// Types (all domain types)
export type {
  FreshnessState,
  EngineBlocker,
  PriceSource,
  TwelveDataKeyStatus,
  KnownSymbol,
  Symbol,
  FibFamily,
  FibRole,
  FibLevel,
  SequenceState,
  DisplacementQuality,
  PdState,
  SymbolDiagnostic,
  PairPrice,
  ChartCandle,
  ChartSnapshot,
  RegimeState,
  GateState,
  SignalStatus,
  Verdict,
  SignalCandidate,
  TradePlan,
  Position,
  PendingOrder,
  EngineHealth,
  DashboardSettings,
  RiskProfile,
  AccountState,
  AccountTelemetry,
  UserProgressState,
  UserProgressEquityPulse,
  UserProgressStreak,
  UserProgressMilestones,
  UserProgress,
  SoakEvidenceType,
  SoakEvidenceRow,
  SoakEvidencePayload,
  SoakCheckpointType,
  SoakCheckpointSnapshot,
  SoakCheckpointRow,
  SoakReport,
  SoakType,
  SoakTemplateConfig,
  MarketSnapshot,
  SessionInfo,
} from "./types/index.js";
export { SOAK_TEMPLATES } from "./types/index.js";

// Utils
export {
  fmtPrice,
  fmtPct,
  fmtCurrency,
  fmtUSC,
  fmtZAR,
  relTime,
  pipDecimals,
  tickSize,
  isLive,
  isStale,
  isUnavailable,
  isBlocked,
  isMock,
  isPendingSync,
  isUsable,
  freshnessLabel,
  freshnessColor,
  isSignalActionable,
  isEngineBlocked,
  blockerLabel,
  FIB_RATIOS,
  fibRole,
  fibLabel,
  fibPriceAtRatio,
  nearestFibLevel,
  fibLevelsNear,
  pdZone,
} from "./utils/index.js";
export type { FibRatio } from "./utils/index.js";

// Constants
export {
  FOREX_PAIRS,
  METALS,
  INDICES,
  CRYPTO,
  ALL_KNOWN_SYMBOLS,
  DEFAULT_WATCHLIST,
  isKnownSymbol,
  isJpyPair,
  isCrypto,
  isMetal,
  TRADING_SESSIONS,
  activeSession,
  currentSessionName,
  API_NAMESPACE,
  DEFAULT_BACKEND_URL,
  DEFAULT_REFRESH_INTERVAL_SEC,
  DEFAULT_STALE_THRESHOLD_SEC,
  VERDICT_RANK,
  SIGNAL_STATUS_RANK,
} from "./constants/index.js";
export type { TradingSession } from "./constants/index.js";

// Mocks (separate import path preferred, but also available here for convenience)
export {
  MOCK_WATCHLIST,
  mockPrices,
  mockRegimes,
  mockGates,
  mockSignals,
  mockPlan,
  mockPositions,
  mockOrders,
  mockEngineHealth,
  mockSettings,
  mockRiskProfile,
  mockAccount,
  mockUserProgress,
  mockPriceSeries,
  mockFibLevels,
  mockEquityCurve,
} from "./mocks/index.js";
