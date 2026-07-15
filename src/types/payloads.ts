/**
 * Backend-migration request payload types.
 *
 * These were introduced alongside the standalone backend migration. They are
 * kept in their own module (rather than edited into the shared contracts file)
 * so the migration work can land incrementally. They depend only on types that
 * `@/types/sniper` already re-exports from the shared contracts package.
 */
import type {
  AccountState,
  DashboardSettings,
  RiskProfile,
  Symbol,
} from "@/types/sniper";

export interface UserSettingsPayload extends Partial<DashboardSettings> {
  watchlist?: Symbol[];
}

export interface RiskProfilePayload extends Partial<RiskProfile> {
  updatedAt?: string;
}

export interface UserAccountPayload extends Partial<AccountState> {}

export interface TwelveDataKeyPayload {
  apiKey: string;
  testOnly?: boolean;
}

export interface ExecuteSignalsPayload {
  signalIds: string[];
}

export interface EngineBatchPayload {
  symbols?: Symbol[];
}

export interface WatchlistChangePayload {
  symbol: Symbol;
}
