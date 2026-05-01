<?php
/**
 * SMC SuperFIB — Execution Engine v12.0.9.1
 * sniper-execution-engine.php
 *
 * Loaded by sniper-webhook.php via:
 *   require_once SNIPER_PLUGIN_DIR . 'sniper-execution-engine.php';
 *
 * PURPOSE
 *   Sits on top of the live signal store and translates computed signals
 *   into execution-ready trade blueprints:
 *     - 3-stage ladder entries (staggered 20/30/50 risk allocation)
 *     - Per-stage lot sizes calculated against user's live account equity
 *     - SL pips, risk in USC + ZAR, R:R
 *     - Max drawdown impact warning
 *     - Persisted to user's trade queue for next page load
 *
 * ENDPOINTS (routes registered in sniper-webhook.php — NO add_action here)
 *   GET  /sniper/v1/user/risk-profile    sniper_exe_get_risk_profile()
 *   POST /sniper/v1/user/risk-profile    sniper_exe_save_risk_profile()
 *   GET  /sniper/v1/user/trade-queue     sniper_exe_get_trade_queue()
 *   POST /sniper/v1/user/trade-queue     sniper_exe_save_trade_queue()
 *   POST /sniper/v1/user/execute-signals sniper_exe_execute_signals()
 *
 * DEPENDENCIES (all provided by sniper-webhook.php before this file loads)
 *   sniper_normalise_pair()          — instrument normalisation
 *   sniper_user_payload_response()   — standard REST envelope
 *   sniper_get_user_meta_value()     — user meta helper
 *   sniper_update_user_meta_value()  — user meta helper
 */

if ( ! defined( 'ABSPATH' ) && 'cli' !== PHP_SAPI ) {
	exit;
}

// ── SANITY CHECK ─────────────────────────────────────────────────────────────
// If sniper-webhook.php did not load first the helpers below will be missing.
// Emit a clear notice rather than a cryptic fatal.
if ( ! function_exists( 'sniper_normalise_pair' ) ) {
	if ( 'cli' === PHP_SAPI ) {
		function sniper_normalise_pair( $pair ) {
			$s = strtoupper( trim( (string) $pair ) );
			if ( strpos( $s, ':' ) !== false ) {
				$parts = explode( ':', $s );
				$s     = end( $parts );
			}
			$alpha_only = preg_replace( '/[^A-Z]/', '', $s );
			if ( strlen( $alpha_only ) === 6 ) {
				return $alpha_only;
			}
			$alnum = preg_replace( '/[^A-Z0-9]/', '', $s );
			return ( strlen( $alnum ) >= 3 && strlen( $alnum ) <= 8 ) ? $alnum : '';
		}
	} else {
		error_log( 'SMC SuperFIB: sniper-execution-engine.php loaded before sniper-webhook.php — execution engine disabled.' );
		return;
	}
}

// ═════════════════════════════════════════════════════════════════════════════
// INSTRUMENT SPEC HELPERS
// Pip math derived from sniper_instrument_specs() defined in sniper-webhook.php.
// Formula: lot = risk / (sl_pips × pip_val × 100)
//          where pip_val = pip_value_usd_per_lot / 100
// ═════════════════════════════════════════════════════════════════════════════

/**
 * USD value of 1 pip for 1.0 standard lot for $pair.
 *
 * USD-quoted  : contract_size × pip_size (constant).
 * Rate-dependent pairs: uses $live_rates[] keyed by normalised symbol (e.g. 'USDJPY').
 * Falls back to sensible approximate rates when live prices are unavailable.
 *
 * @param string $pair
 * @param array  $live_rates        Associative: normalised_symbol => price float.
 * @param array  $instrument_overrides  Per-user contract_size/pip_size overrides.
 * @return float|null
 */
function sniper_exe_pip_value_usd( $pair, array $live_rates = [], array $instrument_overrides = [] ) {
	$specs = sniper_instrument_specs();
	$key   = sniper_normalise_pair( $pair );
	$spec  = $specs[ $key ] ?? null;
	if ( ! $spec ) {
		static $warned_usd = [];
		if ( empty( $warned_usd[ $key ] ) ) {
			$warned_usd[ $key ] = true;
			error_log( 'SMC SuperFIB: no instrument spec for "' . $key . '"' );
		}
		return null;
	}

	// Apply user overrides for instruments marked user_overrideable.
	if ( $spec['user_overrideable'] && ! empty( $instrument_overrides[ $key ] ) ) {
		$ov = $instrument_overrides[ $key ];
		if ( isset( $ov['contract_size'] ) && is_numeric( $ov['contract_size'] ) ) {
			$spec['contract_size'] = floatval( $ov['contract_size'] );
		}
		if ( isset( $ov['pip_size'] ) && is_numeric( $ov['pip_size'] ) ) {
			$spec['pip_size'] = floatval( $ov['pip_size'] );
		}
	}

	$pip_size      = floatval( $spec['pip_size'] );
	$contract_size = floatval( $spec['contract_size'] );
	$quote         = strtoupper( $spec['quote'] ?? 'USD' );

	if ( 'USD' === $quote ) {
		return $contract_size * $pip_size; // constant — no rate needed
	}

	// Rate-dependent: approximate fallbacks kept tight to typical ranges.
	$rate_fallbacks = [
		'JPY' => [ 'divisor' => true,  'symbol' => 'USDJPY', 'default' => 155.0 ],
		'CAD' => [ 'divisor' => true,  'symbol' => 'USDCAD', 'default' => 1.36  ],
		'CHF' => [ 'divisor' => true,  'symbol' => 'USDCHF', 'default' => 0.90  ],
		'GBP' => [ 'divisor' => false, 'symbol' => 'GBPUSD', 'default' => 1.27  ],
		'AUD' => [ 'divisor' => false, 'symbol' => 'AUDUSD', 'default' => 0.65  ],
		'NZD' => [ 'divisor' => false, 'symbol' => 'NZDUSD', 'default' => 0.60  ],
	];
	if ( isset( $rate_fallbacks[ $quote ] ) ) {
		$rf   = $rate_fallbacks[ $quote ];
		$rate = floatval( $live_rates[ $rf['symbol'] ] ?? $rf['default'] );
		return $rf['divisor']
			? ( $contract_size * $pip_size ) / $rate   // USD = quote_units / rate
			: ( $contract_size * $pip_size ) * $rate;  // USD = quote_units × rate
	}

	error_log( 'SMC SuperFIB: unknown quote currency "' . $quote . '" for pair "' . $key . '" — pip_size used as-is' );
	return $contract_size * $pip_size;
}

/**
 * pip_value_usd / 100 — the "pipVal" used in the lot formula:
 *   lot = risk / (sl_pips × pipVal × 100)
 * Backward-compatible wrapper around sniper_exe_pip_value_usd().
 *
 * @return float|null
 */
function sniper_exe_pip_value( $pair, $allow_fallback = true, array $live_rates = [], array $instrument_overrides = [] ) {
	$usd = sniper_exe_pip_value_usd( $pair, $live_rates, $instrument_overrides );
	if ( null === $usd ) {
		if ( $allow_fallback ) return 0.10; // legacy fallback — log already emitted above
		return null;
	}
	return $usd / 100.0;
}

/**
 * Convert a price distance to pips using the instrument's canonical pip_size.
 * Falls back to the old JPY/non-JPY heuristic for unknown instruments.
 */
function sniper_exe_pips_to_price_delta( $pair, $pips ) {
	$specs = sniper_instrument_specs();
	$key   = sniper_normalise_pair( $pair );
	$spec  = $specs[ $key ] ?? null;
	$pip_size = $spec ? floatval( $spec['pip_size'] ) : ( strpos( $key, 'JPY' ) !== false ? 0.01 : 0.0001 );
	return floatval( $pips ) * $pip_size;
}

function sniper_exe_asset_class_for_pair( $pair ) {
	$normalized = sniper_normalise_pair( $pair );
	if ( 0 === strpos( $normalized, 'XAU' ) || 0 === strpos( $normalized, 'XAG' ) ) {
		return 'METAL';
	}
	if ( false !== strpos( $normalized, 'US30' ) || false !== strpos( $normalized, 'NAS100' ) ) {
		return 'INDEX';
	}
	if ( false !== strpos( $normalized, 'JPY' ) ) {
		return 'FX_JPY';
	}
	return 'FX';
}

function sniper_exe_stop_floor_pips( $pair ) {
	$class = sniper_exe_asset_class_for_pair( $pair );
	if ( 'METAL' === $class ) {
		return 80.0;
	}
	if ( 'INDEX' === $class ) {
		return 20.0;
	}
	if ( 'FX_JPY' === $class ) {
		return 40.0;
	}
	return 40.0;
}

function sniper_exe_compute_stage_tp( $entry, $sl, $direction, $stage_index, $tp1 = null, $tp2 = null ) {
	if ( ! is_numeric( $entry ) || ! is_numeric( $sl ) ) {
		return null;
	}
	$entry = floatval( $entry );
	$sl    = floatval( $sl );
	$risk  = abs( $entry - $sl );
	if ( $risk <= 0.0 ) {
		return null;
	}

	$rr_map      = [ 2.0, 3.0, 4.0 ];
	$target_rr   = $rr_map[ intval( $stage_index ) ] ?? 2.0;
	$target_dist = $risk * $target_rr;

	$provided_tp = null;
	if ( 2 === intval( $stage_index ) && is_numeric( $tp2 ) ) {
		$provided_tp = floatval( $tp2 );
	} elseif ( is_numeric( $tp1 ) ) {
		$provided_tp = floatval( $tp1 );
	}

	if ( 'SELL' === strtoupper( $direction ) ) {
		$min_tp = $entry - $target_dist;
		if ( is_numeric( $provided_tp ) && $provided_tp < $entry ) {
			return min( $provided_tp, $min_tp );
		}
		return $min_tp;
	}

	$min_tp = $entry + $target_dist;
	if ( is_numeric( $provided_tp ) && $provided_tp > $entry ) {
		return max( $provided_tp, $min_tp );
	}
	return $min_tp;
}

function sniper_exe_build_final_stages( $pair, $direction, array $entries, array $stage_sls, $tp1 = null, $tp2 = null ) {
	$normalized_direction = strtoupper( sanitize_text_field( $direction ) );
	$stop_floor_pips      = sniper_exe_stop_floor_pips( $pair );
	$delta_floor          = sniper_exe_pips_to_price_delta( $pair, $stop_floor_pips );
	$stages               = [];

	for ( $i = 0; $i < 3; $i++ ) {
		$entry = isset( $entries[ $i ] ) && is_numeric( $entries[ $i ] ) ? floatval( $entries[ $i ] ) : null;
		$sl    = isset( $stage_sls[ $i ] ) && is_numeric( $stage_sls[ $i ] ) ? floatval( $stage_sls[ $i ] ) : null;
		if ( null === $entry || null === $sl ) {
			$stages[] = null;
			continue;
		}

		$sl_pips = sniper_exe_price_to_pips( $pair, $entry, $sl );
		if ( $sl_pips < $stop_floor_pips ) {
			$sl = 'SELL' === $normalized_direction
				? $entry + $delta_floor
				: $entry - $delta_floor;
			$sl_pips = sniper_exe_price_to_pips( $pair, $entry, $sl );
		}

		$stage_tp = sniper_exe_compute_stage_tp( $entry, $sl, $normalized_direction, $i, $tp1, $tp2 );
		$rr       = null;
		if ( is_numeric( $stage_tp ) ) {
			$tp_pips = sniper_exe_price_to_pips( $pair, $entry, $stage_tp );
			$rr      = $sl_pips > 0 ? round( $tp_pips / $sl_pips, 2 ) : null;
		}

		$stages[] = [
			'stage'     => 'E' . ( $i + 1 ),
			'entry'     => $entry,
			'sl'        => $sl,
			'sl_pips'   => round( $sl_pips, 1 ),
			'tp'        => is_numeric( $stage_tp ) ? floatval( $stage_tp ) : null,
			'rr'        => $rr,
			'target_rr' => [ 2.0, 3.0, 4.0 ][ $i ] ?? 2.0,
		];
	}

	$monotonic_stop_pass = true;
	$prev_pips = null;
	for ( $i = 0; $i < count( $stages ); $i++ ) {
		if ( ! is_array( $stages[ $i ] ) ) {
			continue;
		}
		$current_pips = $stages[ $i ]['sl_pips'];
		if ( null !== $prev_pips && $prev_pips < $current_pips ) {
			$monotonic_stop_pass = false;
		}
		$prev_pips = $current_pips;
	}

	$rr_validation_pass = true;
	$stage_tps = [];
	for ( $i = 0; $i < count( $stages ); $i++ ) {
		$stage = $stages[ $i ];
		if ( ! is_array( $stage ) ) {
			$stage_tps[] = null;
			continue;
		}
		$stage_tps[] = $stage['tp'];
		if ( ! is_numeric( $stage['rr'] ) || $stage['rr'] < $stage['target_rr'] ) {
			$rr_validation_pass = false;
		}
	}

	return [
		'stages_final'        => $stages,
		'stage_tps'           => $stage_tps,
		'monotonic_stop_pass' => $monotonic_stop_pass,
		'rr_validation_pass'  => $rr_validation_pass,
		'stop_floor_pips'     => $stop_floor_pips,
		'legacy_fallback'     => false,
	];
}

function sniper_exe_normalize_fib_timeframe( $raw ) {
	$tf = strtoupper( trim( (string) $raw ) );
	if ( in_array( $tf, [ 'DAILY', 'DAY', 'D', '1D' ], true ) ) {
		return 'DAILY';
	}
	if ( in_array( $tf, [ 'WEEKLY', 'WEEK', 'W', '1W' ], true ) ) {
		return 'WEEKLY';
	}
	if ( in_array( $tf, [ 'MONTHLY', 'MONTH', 'M', '1M', 'H4' ], true ) ) {
		return 'MONTHLY';
	}
	if ( in_array( $tf, [ 'YEARLY', 'YEAR', 'Y', '1Y', 'ANNUAL' ], true ) ) {
		return 'YEARLY';
	}
	return 'MONTHLY';
}

function sniper_exe_timeframe_profile( $timeframe ) {
	switch ( sniper_exe_normalize_fib_timeframe( $timeframe ) ) {
		case 'DAILY':
			return [
				'key'                => 'DAILY',
				'label'              => 'Day Trader',
				'candleInterval'     => '1h',
				'interval'           => '1h',
				'historyDepth'       => 160,
				'outputSize'         => 160,
				'proximityThreshold' => 12,
				'strategyHorizon'    => '1 Day',
				'executionHorizon'   => '1 Day',
				'riskMultiplier'     => 0.50,
				'minRr'              => 1.50,
				'maxOpenTrades'      => 4,
				'defaultValidityBars'=> 24,
				'barDurationSeconds' => 3600,
				'slBufferMultiplier' => 1.50,
			];
		case 'MONTHLY':
			return [
				'key'                => 'MONTHLY',
				'label'              => 'Positional',
				'candleInterval'     => '1day',
				'interval'           => '1day',
				'historyDepth'       => 180,
				'outputSize'         => 180,
				'proximityThreshold' => 35,
				'strategyHorizon'    => '1 Month',
				'executionHorizon'   => '1 Month',
				'riskMultiplier'     => 1.00,
				'minRr'              => 2.50,
				'maxOpenTrades'      => 2,
				'defaultValidityBars'=> 20,
				'barDurationSeconds' => 86400,
				'slBufferMultiplier' => 2.00,
			];
		case 'YEARLY':
			return [
				'key'                => 'YEARLY',
				'label'              => 'Institutional',
				'candleInterval'     => '1week',
				'interval'           => '1week',
				'historyDepth'       => 220,
				'outputSize'         => 220,
				'proximityThreshold' => 50,
				'strategyHorizon'    => '1 Year',
				'executionHorizon'   => '1 Year',
				'riskMultiplier'     => 1.00,
				'minRr'              => 3.00,
				'maxOpenTrades'      => 1,
				'defaultValidityBars'=> 12,
				'barDurationSeconds' => 604800,
				'slBufferMultiplier' => 2.00,
			];
		case 'WEEKLY':
		default:
			return [
				'key'                => 'WEEKLY',
				'label'              => 'Swing Trader',
				'candleInterval'     => '4h',
				'interval'           => '4h',
				'historyDepth'       => 140,
				'outputSize'         => 140,
				'proximityThreshold' => 20,
				'strategyHorizon'    => '1 Week',
				'executionHorizon'   => '1 Week',
				'riskMultiplier'     => 0.75,
				'minRr'              => 2.00,
				'maxOpenTrades'      => 3,
				'defaultValidityBars'=> 10,
				'barDurationSeconds' => 14400,
				'slBufferMultiplier' => 1.50,
			];
	}
}

// ═════════════════════════════════════════════════════════════════════════════
// POSITION SIZING MATHS
// Mirror of the JS buildRiskBreakdown() function.  Both must stay in sync.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Convert a price distance to pips using the instrument's canonical pip_size.
 * Falls back to the traditional JPY/non-JPY heuristic for unknown instruments.
 */
function sniper_exe_price_to_pips( $pair, $price_a, $price_b ) {
	$specs    = sniper_instrument_specs();
	$key      = sniper_normalise_pair( $pair );
	$spec     = $specs[ $key ] ?? null;
	$pip_size = $spec ? floatval( $spec['pip_size'] ) : ( strpos( $key, 'JPY' ) !== false ? 0.01 : 0.0001 );
	$diff     = abs( floatval( $price_a ) - floatval( $price_b ) );
	return $pip_size > 0 ? $diff / $pip_size : 0;
}

/**
 * Calculate lot size for a single entry stage.
 * Floored to 0.01; returns 0 if the computed size is sub-minimum.
 *
 * Formula: risk_account / ( sl_pips × pip_val_account × 100 )
 * where pip_val_account = pip_value_usd_per_lot × usd_to_account_rate / 100.
 *
 * @param string $pair
 * @param float  $risk_account  Risk budget in account currency.
 * @param float  $sl_pips
 * @param array  $live_rates    Normalised symbol → price (for rate-dependent pairs).
 * @param float  $usd_rate      usd_to_account_rate (default 1.0 = USD account).
 * @param array  $overrides     Per-user instrument_overrides.
 */
function sniper_exe_calc_lot( $pair, $risk_account, $sl_pips, array $live_rates = [], $usd_rate = 1.0, array $overrides = [] ) {
	if ( $sl_pips <= 0 || $risk_account <= 0 ) return 0;
	$pip_val_usd = sniper_exe_pip_value_usd( $pair, $live_rates, $overrides );
	if ( null === $pip_val_usd ) return 0;
	$pip_val = ( $pip_val_usd * floatval( $usd_rate ) ) / 100.0;
	$raw     = $risk_account / ( $sl_pips * $pip_val * 100 );
	$lot     = floor( $raw * 100 ) / 100;
	return $lot < 0.01 ? 0 : $lot;
}

/**
 * Build a full 3-stage risk breakdown for a single ladder.
 *
 * Allocation: E1 (shallow) = 20%, E2 (mid) = 30%, E3 (deep) = 50%.
 * This matches the JS `buildRiskBreakdown()` staggered logic exactly.
 *
 * @param string $pair     Any pair format — will be normalised internally.
 * @param array  $entries  [e1_price, e2_price, e3_price] — nulls/zeros skipped.
 * @param float  $sl       Shared stop-loss price for all stages.
 * @param array  $profile  Risk profile from sniper_exe_get_risk_profile_data().
 * @param array  $live_rates  Normalised symbol → price, for rate-dependent pip values.
 * @return array           See return keys below.
 */
function sniper_exe_risk_breakdown( $pair, array $entries, $sl, array $profile, $live_rates = [], array $stage_sls = [], array $stages_final = [] ) {
	$balance    = floatval( $profile['balance']        ?? $profile['balance_usc'] ?? 0 );
	$currency   = strtoupper( sanitize_text_field( $profile['account_currency']    ?? 'USD' ) );
	$usd_rate   = floatval( $profile['usd_to_account_rate'] ?? $profile['usc_zar_rate'] ?? 1.0 );
	$risk_pct   = floatval( $profile['risk_pct']           ?? 1.0 );
	$max_dd_pct = floatval( $profile['max_drawdown_pct']    ?? 5.0 );
	$overrides  = is_array( $profile['instrument_overrides'] ?? null ) ? $profile['instrument_overrides'] : [];

	if ( $balance <= 0 ) {
		return [ 'available' => false, 'reason' => 'Account balance not set — upload broker report first' ];
	}

	// pip_value_account = pip_value_usd × usd_to_account_rate
	$pip_val_usd = sniper_exe_pip_value_usd( $pair, (array) $live_rates, $overrides );
	if ( null === $pip_val_usd ) {
		return [
			'available' => false,
			'reason'    => 'Risk calculation unavailable for unsupported pair ' . sanitize_text_field( (string) $pair ),
		];
	}
	$pip_val = ( $pip_val_usd * $usd_rate ) / 100.0; // account-currency pipVal for the lot formula

	$total_risk_budget = $balance * ( $risk_pct / 100 );
	$max_dd_budget     = $balance * ( $max_dd_pct / 100 );
	$alloc             = [ 0.20, 0.30, 0.50 ];
	$stages            = [];
	$total             = 0.0;

	foreach ( $entries as $i => $entry_price ) {
		if ( ! is_numeric( $entry_price ) || floatval( $entry_price ) === 0.0 ) {
			$stages[] = [ 'entry' => null, 'sl' => null, 'lot' => 0, 'sl_pips' => 0, 'risk_amount' => 0, 'currency' => $currency ];
			continue;
		}

		$entry_price  = floatval( $entry_price );
		$final_stage  = ( isset( $stages_final[ $i ] ) && is_array( $stages_final[ $i ] ) ) ? $stages_final[ $i ] : null;
		$stage_sl     = is_array( $final_stage ) && is_numeric( $final_stage['sl'] ?? null )
			? floatval( $final_stage['sl'] )
			: ( ( isset( $stage_sls[ $i ] ) && is_numeric( $stage_sls[ $i ] ) ) ? floatval( $stage_sls[ $i ] ) : floatval( $sl ) );
		$sl_pips      = is_array( $final_stage ) && is_numeric( $final_stage['sl_pips'] ?? null )
			? floatval( $final_stage['sl_pips'] )
			: sniper_exe_price_to_pips( $pair, $entry_price, $stage_sl );
		$stage_budget = $total_risk_budget * ( $alloc[ $i ] ?? 0.33 );
		$lot          = ( $sl_pips > 0 && $pip_val > 0 ) ? floor( ( $stage_budget / ( $sl_pips * $pip_val * 100 ) ) * 100 ) / 100 : 0;
		$lot          = $lot < 0.01 ? 0 : $lot;
		$actual_risk  = $lot > 0 ? round( $lot * $sl_pips * $pip_val * 100, 2 ) : 0.0;

		$stages[] = [
			'entry'       => $entry_price,
			'sl'          => $stage_sl,
			'lot'         => $lot,
			'sl_pips'     => round( $sl_pips, 1 ),
			'risk_amount' => $actual_risk,
			'currency'    => $currency,
		];
		$total += $actual_risk;
	}

	$monotonic_lot_pass = true;
	for ( $i = 1; $i < count( $stages ); $i++ ) {
		if ( $stages[ $i - 1 ]['lot'] > $stages[ $i ]['lot'] ) {
			$monotonic_lot_pass = false;
			$stages[ $i - 1 ]['lot']         = $stages[ $i ]['lot'];
			$stages[ $i - 1 ]['risk_amount'] = round( $stages[ $i - 1 ]['lot'] * $stages[ $i - 1 ]['sl_pips'] * $pip_val * 100, 2 );
		}
	}

	$total = 0.0;
	foreach ( $stages as $stage ) {
		$total += floatval( $stage['risk_amount'] ?? 0.0 );
	}

	$dd_pct     = $balance > 0 ? round( ( $total / $balance ) * 100, 2 ) : 0;
	$dd_warning = $total > $max_dd_budget;

	return [
		'available'          => true,
		'currency'           => $currency,
		'stages'             => $stages,
		'stage_lots'         => array_map( fn( $s ) => floatval( $s['lot'] ?? 0 ), $stages ),
		'monotonic_lot_pass' => $monotonic_lot_pass,
		'total_risk_amount'  => round( $total, 2 ),
		'dd_impact_pct'      => $dd_pct,
		'dd_warning'         => $dd_warning,
		'dd_warning_msg'     => $dd_warning
			? 'Warning: Total risk ' . $currency . ' ' . round( $total ) . ' exceeds max DD cap of ' . $currency . ' ' . round( $max_dd_budget )
			: null,
	];
}

function sniper_exe_legacy_stage_entries( $zone_price, $direction, $dp ) {
	$spread = ( 2 === intval( $dp ) ) ? 0.15 : 0.00015;
	return [
		'SELL' === $direction ? round( $zone_price - 2 * $spread, $dp ) : round( $zone_price + 2 * $spread, $dp ),
		'SELL' === $direction ? round( $zone_price - 1 * $spread, $dp ) : round( $zone_price + 1 * $spread, $dp ),
		round( $zone_price, $dp ),
	];
}

function sniper_exe_extract_stage_price( $row, array $keys ) {
	if ( ! is_array( $row ) ) return null;
	foreach ( $keys as $key ) {
		if ( isset( $row[ $key ] ) && is_numeric( $row[ $key ] ) && floatval( $row[ $key ] ) > 0 ) {
			return floatval( $row[ $key ] );
		}
	}
	return null;
}

function sniper_exe_resolve_stage_entries( array $sig, $zone_price, $direction, $dp ) {
	$legacy_entries = sniper_exe_legacy_stage_entries( $zone_price, $direction, $dp );
	$raw_levels     = isset( $sig['entry_levels'] ) && is_array( $sig['entry_levels'] ) ? $sig['entry_levels'] : [];
	$stage_labels   = [ 'E1', 'E2', 'E3' ];
	$entry_source   = sanitize_text_field( $sig['entry_source'] ?? '' );
	$fallback_reason = sanitize_text_field( $sig['fallback_reason'] ?? '' );
	$entries        = [];
	$meta           = [];

	for ( $i = 0; $i < 3; $i++ ) {
		$row   = ( isset( $raw_levels[ $i ] ) && is_array( $raw_levels[ $i ] ) ) ? $raw_levels[ $i ] : [];
		$price = sniper_exe_extract_stage_price( $row, [ 'price', 'entry' ] );
		$uses_legacy = ! is_numeric( $price ) || $price <= 0;
		if ( $uses_legacy ) {
			$price = $legacy_entries[ $i ];
			if ( '' === $fallback_reason && ! empty( $raw_levels ) ) $fallback_reason = 'ENTRY_STAGE_MISSING';
		}
		$entries[] = round( floatval( $price ), $dp );
		$meta[] = [
			'stage'  => $stage_labels[ $i ],
			'price'  => round( floatval( $price ), $dp ),
			'source' => $uses_legacy ? 'LEGACY_SPREAD' : sanitize_text_field( $row['source'] ?? $entry_source ?: 'SIGNAL' ),
			'label'  => sanitize_text_field( $row['label'] ?? $row['fib'] ?? $stage_labels[ $i ] ),
			'fib'    => sanitize_text_field( $row['fib'] ?? '' ),
		];
	}

	return [
		'entries'         => $entries,
		'entry_levels'    => $meta,
		'entry_source'    => $entry_source ?: ( ! empty( $raw_levels ) ? 'SIGNAL' : 'FIB' ),
		'fallback_reason' => $fallback_reason ?: null,
	];
}

function sniper_exe_resolve_stage_sls( array $sig, array $entries, $shared_sl, $dp ) {
	$raw_levels   = isset( $sig['sl_levels'] ) && is_array( $sig['sl_levels'] ) ? $sig['sl_levels'] : [];
	$stage_labels = [ 'E1', 'E2', 'E3' ];
	$stage_sls    = [];
	$meta         = [];
	$default_rule = sanitize_text_field( $sig['sl_rule'] ?? '' );

	for ( $i = 0; $i < 3; $i++ ) {
		$row      = ( isset( $raw_levels[ $i ] ) && is_array( $raw_levels[ $i ] ) ) ? $raw_levels[ $i ] : [];
		$sl_price = sniper_exe_extract_stage_price( $row, [ 'sl_price', 'sl', 'price' ] );
		$rule     = sanitize_text_field( $row['rule'] ?? '' );
		$stage_sls[] = is_numeric( $sl_price ) && $sl_price > 0 ? round( floatval( $sl_price ), $dp ) : round( floatval( $shared_sl ), $dp );
		$meta[] = [
			'stage'       => $stage_labels[ $i ],
			'sl_price'    => end( $stage_sls ),
			'rule'        => $rule ?: ( $default_rule ?: 'LEGACY_BUFFER' ),
			'level_label' => sanitize_text_field( $row['level_label'] ?? '' ),
			'level_price' => isset( $row['level_price'] ) && is_numeric( $row['level_price'] ) ? round( floatval( $row['level_price'] ), $dp ) : null,
		];
	}

	return [
		'stage_sls' => $stage_sls,
		'sl_levels' => $meta,
		'sl_rule'   => $default_rule ?: 'LEGACY_NEXT_LEVEL',
	];
}

// ═════════════════════════════════════════════════════════════════════════════
// RISK PROFILE — GET / SAVE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Read the user's risk profile.
 *
 * account_currency / usd_to_account_rate replace the old usc_zar_rate:
 *   account_currency    — ISO 4217 code of the account's base currency ("USD", "ZAR", "GBP", …)
 *   usd_to_account_rate — how many account-currency units equal 1 USD
 *                         (1.0 for USD, ~18.4 for ZAR, ~0.80 for GBP, …)
 *
 * balance is always pulled from the latest uploaded broker report (sn_act) so
 * it tracks live equity — never stale from a saved preference.
 *
 * instrument_overrides allows per-user contract_size / pip_size adjustments for
 * user_overrideable instruments (indices, crypto) to match broker specifications.
 */
function sniper_exe_get_risk_profile_data( $user_id ) {
	$stored = get_user_meta( $user_id, 'sn_risk_profile', true );
	$stored = is_array( $stored ) ? $stored : [];

	// Live equity from broker report upload — highest priority.
	$account = get_user_meta( $user_id, 'sn_act', true );
	$equity  = ( is_array( $account ) && isset( $account['equity'] ) )
		? floatval( $account['equity'] )
		: 0.0;

	$defaults = [
		'balance'              => $equity,
		'account_currency'     => 'USD',
		'usd_to_account_rate'  => 1.0,
		'risk_pct'             => 1.0,
		'max_drawdown_pct'     => 5.0,
		'margin_floor'         => 500,
		'max_open_trades'      => 3,
		'broker_leverage'      => 500,
		'instrument_overrides' => [],
	];

	$merged            = array_merge( $defaults, $stored );
	$merged['balance'] = $equity; // always override — live equity wins
	return $merged;
}

function sniper_exe_get_risk_profile( WP_REST_Request $request ) {
	return sniper_user_payload_response(
		'risk_profile',
		sniper_exe_get_risk_profile_data( get_current_user_id() )
	);
}

function sniper_exe_save_risk_profile( WP_REST_Request $request ) {
	$user_id = get_current_user_id();
	$body    = $request->get_json_params() ?: [];

	$overrides = [];
	if ( isset( $body['instrument_overrides'] ) && is_array( $body['instrument_overrides'] ) ) {
		foreach ( $body['instrument_overrides'] as $sym => $ov ) {
			$key = sniper_normalise_pair( (string) $sym );
			if ( '' === $key || ! is_array( $ov ) ) continue;
			$entry = [];
			if ( isset( $ov['contract_size'] ) && is_numeric( $ov['contract_size'] ) ) {
				$entry['contract_size'] = floatval( $ov['contract_size'] );
			}
			if ( isset( $ov['pip_size'] ) && is_numeric( $ov['pip_size'] ) ) {
				$entry['pip_size'] = floatval( $ov['pip_size'] );
			}
			if ( ! empty( $entry ) ) $overrides[ $key ] = $entry;
		}
	}

	$profile = [
		'account_currency'     => isset( $body['account_currency'] )    ? strtoupper( sanitize_text_field( $body['account_currency'] ) ) : 'USD',
		'usd_to_account_rate'  => isset( $body['usd_to_account_rate'] ) ? floatval( $body['usd_to_account_rate'] ) : 1.0,
		'risk_pct'             => isset( $body['risk_pct'] )            ? floatval( $body['risk_pct'] )            : 1.0,
		'max_drawdown_pct'     => isset( $body['max_drawdown_pct'] )    ? floatval( $body['max_drawdown_pct'] )    : 5.0,
		'margin_floor'         => isset( $body['margin_floor'] )        ? intval( $body['margin_floor'] )          : 500,
		'max_open_trades'      => isset( $body['max_open_trades'] )     ? intval( $body['max_open_trades'] )       : 3,
		'broker_leverage'      => isset( $body['broker_leverage'] )     ? intval( $body['broker_leverage'] )       : 500,
		'instrument_overrides' => $overrides,
	];

	update_user_meta( $user_id, 'sn_risk_profile', $profile );
	return sniper_user_payload_response(
		'risk_profile',
		sniper_exe_get_risk_profile_data( $user_id )
	);
}

// ═════════════════════════════════════════════════════════════════════════════
// TRADE QUEUE — GET / SAVE
// ═════════════════════════════════════════════════════════════════════════════

function sniper_exe_get_trade_queue( WP_REST_Request $request ) {
	$user_id = get_current_user_id();
	$queue   = get_user_meta( $user_id, 'sn_trade_queue', true );
	$queue   = is_array( $queue ) ? array_values( $queue ) : [];
	$watchlist_keys = function_exists( 'sniper_user_watchlist_key_map' )
		? sniper_user_watchlist_key_map( $user_id )
		: [];
	if ( ! empty( $watchlist_keys ) ) {
		$queue = array_values( array_filter( $queue, function( $item ) use ( $watchlist_keys ) {
			$pair = is_array( $item ) ? ( $item['pair'] ?? '' ) : '';
			$key  = function_exists( 'sniper_watchlist_symbol_key' )
				? sniper_watchlist_symbol_key( $pair )
				: strtoupper( preg_replace( '/[^A-Z0-9]/', '', (string) $pair ) );
			return isset( $watchlist_keys[ $key ] );
		} ) );
	}

	foreach ( $queue as &$item ) {
		if ( is_array( $item ) && isset( $item['zone_label'] ) ) {
			$item['zone_label'] = sniper_exe_normalize_zone_label( $item['zone_label'] );
		}
	}
	unset( $item );

	return sniper_user_payload_response( 'trade_queue', $queue );
}

function sniper_exe_save_trade_queue( WP_REST_Request $request ) {
	$user_id = get_current_user_id();
	$body    = $request->get_json_params() ?: [];
	$queue   = ( isset( $body['queue'] ) && is_array( $body['queue'] ) )
		? array_values( $body['queue'] )
		: [];
	$watchlist_keys = function_exists( 'sniper_user_watchlist_key_map' )
		? sniper_user_watchlist_key_map( $user_id )
		: [];
	if ( ! empty( $watchlist_keys ) ) {
		$queue = array_values( array_filter( $queue, function( $item ) use ( $watchlist_keys ) {
			$pair = is_array( $item ) ? ( $item['pair'] ?? '' ) : '';
			$key  = function_exists( 'sniper_watchlist_symbol_key' )
				? sniper_watchlist_symbol_key( $pair )
				: strtoupper( preg_replace( '/[^A-Z0-9]/', '', (string) $pair ) );
			return isset( $watchlist_keys[ $key ] );
		} ) );
	}

	if ( count( $queue ) > 100 ) {
		$queue = array_slice( $queue, -100 );
	}

	foreach ( $queue as &$item ) {
		if ( is_array( $item ) && isset( $item['zone_label'] ) ) {
			$item['zone_label'] = sniper_exe_normalize_zone_label( $item['zone_label'] );
		}
	}
	unset( $item );

	update_user_meta( $user_id, 'sn_trade_queue', $queue );
	return sniper_user_payload_response( 'trade_queue', $queue );
}

/**
 * Build a stable identity for execution blueprints so repeated runs update the
 * same setup instead of duplicating queue entries.
 *
 * @return array{signal_id:string,signal_hash:string}
 */
function sniper_exe_signal_identity( array $sig, $pair, $direction, $zone_price, $sl, $tp1, $tp2 ) {
	$normalized = sniper_normalise_pair( $pair );
	$is_jpy     = ( strpos( $normalized, 'JPY' ) !== false );
	$dp         = $is_jpy ? 2 : 5;

	$regime = strtoupper( sanitize_text_field( $sig['regime'] ?? '' ) );
	$parts  = [
		$normalized ?: strtoupper( sanitize_text_field( $pair ) ),
		$direction,
		is_numeric( $zone_price ) ? number_format( floatval( $zone_price ), $dp, '.', '' ) : '0',
		is_numeric( $sl ) ? number_format( floatval( $sl ), $dp, '.', '' ) : '0',
		is_numeric( $tp1 ) ? number_format( floatval( $tp1 ), $dp, '.', '' ) : '0',
		is_numeric( $tp2 ) ? number_format( floatval( $tp2 ), $dp, '.', '' ) : '0',
		preg_replace( '/\s+/', '_', $regime ?: 'UNSET' ),
	];

	$signal_hash = sanitize_text_field( $sig['signal_hash'] ?? implode( '|', $parts ) );
	$signal_id   = sanitize_text_field(
		$sig['signal_id'] ?? ( $parts[0] . '_' . $direction . '_' . str_replace( '.', '', $parts[2] ) )
	);

	return [
		'signal_id'   => $signal_id,
		'signal_hash' => $signal_hash,
	];
}

function sniper_exe_normalize_zone_label( $label ) {
	$text = sanitize_text_field( (string) $label );
	if ( $text === '' ) {
		return '';
	}

	$text = html_entity_decode( $text, ENT_QUOTES, 'UTF-8' );
	$text = str_replace(
		[ '&middot;', '&#183;', '•', '·', 'Â' ],
		[ ' | ', ' | ', ' | ', ' | ', ' ' ],
		$text
	);
	$text = preg_replace( '/(?:Ã.|â€¦|â€”|â€“|â€|Æ’|¢â€šÂ¬|ƒ)/u', ' ', $text );
	$text = preg_replace( '/\s*\|\s*\|\s*/', ' | ', $text );
	$text = preg_replace( '/\s{2,}/', ' ', $text );
	$text = trim( $text );

	if ( preg_match( '/[ÃâÂÆƒ]/u', $text ) ) {
		preg_match_all( '/EF\s*\d+%|EF\s*Range|Premium|Discount|Range/i', $text, $matches );
		if ( ! empty( $matches[0] ) ) {
			$text = implode( ' | ', array_values( array_unique( $matches[0] ) ) );
		} else {
			$text = preg_replace( '/[ÃâÂÆƒ][^\s|]*/u', '', $text );
			$text = trim( preg_replace( '/\s{2,}/', ' ', $text ) );
		}
	}

	return $text;
}

// ═════════════════════════════════════════════════════════════════════════════
// EXECUTE SIGNALS — MAIN ENDPOINT
// POST /sniper/v1/user/execute-signals
//
// Called by the JS dashboard after the signal engine completes a compute cycle.
// Receives the array of computed signals, applies the user's live risk profile,
// and returns execution-ready blueprints.
//
// Each blueprint contains:
//   - 3 ladder entry prices (spread around zone_price)
//   - Per-stage lot sizes (staggered 20/30/50)
//   - SL pips, risk USC + ZAR per stage
//   - R:R for shallow entry (gated: must be ≥ MIN_RR)
//   - DD impact warning
//   - Persisted to sn_trade_queue (merged by signal_id)
// ═════════════════════════════════════════════════════════════════════════════

function sniper_exe_signal_passes_bias_gate( array $sig, array $watchlist_keys, string $direction ) : bool {
	$pair = sanitize_text_field( $sig['pair'] ?? '' );
	if ( ! empty( $watchlist_keys ) ) {
		$pair_key = function_exists( 'sniper_watchlist_symbol_key' )
			? sniper_watchlist_symbol_key( $pair )
			: strtoupper( preg_replace( '/[^A-Z0-9]/', '', (string) $pair ) );
		if ( ! isset( $watchlist_keys[ $pair_key ] ) ) {
			return false;
		}
	}
	$signal_state = strtoupper( sanitize_text_field( $sig['signal_state'] ?? '' ) );
	if ( $signal_state && 'ACTIVE' !== $signal_state ) {
		return false;
	}
	$seq_status = sanitize_text_field( $sig['sequence_status'] ?? '' );
	if ( $seq_status && $seq_status !== 'READY' ) {
		return false;
	}
	$final_bias     = strtoupper( sanitize_text_field( $sig['final_bias'] ?? '' ) );
	$bullish_biases = [ 'BULL_EXP', 'BULL_PB' ];
	$bearish_biases = [ 'BEAR_EXP', 'BEAR_RALLY' ];
	$neutral_biases = [ 'TRANSITION', 'NEUTRAL', '' ];
	if ( in_array( $final_bias, $neutral_biases, true ) ) {
		return false;
	}
	if ( ! in_array( $final_bias, array_merge( $bullish_biases, $bearish_biases ), true ) ) {
		return false;
	}
	if ( 'BUY' === $direction && ! in_array( $final_bias, $bullish_biases, true ) ) {
		return false;
	}
	if ( 'SELL' === $direction && ! in_array( $final_bias, $bearish_biases, true ) ) {
		return false;
	}
	$pd_array = isset( $sig['pd_array'] ) && is_array( $sig['pd_array'] ) ? $sig['pd_array'] : [];
	$pd_dir   = intval( $pd_array['pd_array_dir'] ?? 0 );
	if ( 'BUY' === $direction && $pd_dir < 0 ) {
		return false;
	}
	if ( 'SELL' === $direction && $pd_dir > 0 ) {
		return false;
	}
	$matrix       = isset( $sig['matrix'] ) && is_array( $sig['matrix'] ) ? $sig['matrix'] : [];
	$matrix_state = strtoupper( sanitize_text_field( $matrix['matrix_state'] ?? '' ) );
	if ( 'BUY' === $direction && 'PREMIUM' === $matrix_state ) {
		return false;
	}
	if ( 'SELL' === $direction && 'DISCOUNT' === $matrix_state ) {
		return false;
	}
	return true;
}

/**
 * Returns true only when a real directional gate signal is present.
 * 'NONE' means no gate signal was received — treated as blocked (no trade).
 * Despite the "passes" name the NONE path intentionally returns false.
 */
function sniper_exe_signal_passes_chop_gate( array $sig ) : bool {
	$gate        = strtoupper( sanitize_text_field( $sig['gate'] ?? '' ) );
	$gate_reason = sanitize_text_field( $sig['gate_reason'] ?? '' );
	if ( 'NONE' === $gate ) {
		return false; // No gate signal received — hold off.
	}
	if ( 'IN_CHOP_BAND' === strtoupper( $gate_reason ) ) {
		return false;
	}
	return true;
}

function sniper_exe_signal_passes_rr_gate( array $final_stage_plan, float $rr_actual, float $min_rr, float $tp_dist ) : bool {
	if ( empty( $final_stage_plan['rr_validation_pass'] ) ) {
		return false;
	}
	if ( $rr_actual < $min_rr && $tp_dist > 0 ) {
		return false;
	}
	return true;
}

function sniper_exe_execute_signals( WP_REST_Request $request ) {
	$user_id     = get_current_user_id();
	$body        = $request->get_json_params() ?: [];
	$raw_signals = ( isset( $body['signals'] ) && is_array( $body['signals'] ) )
		? $body['signals']
		: [];
	$watchlist_keys = function_exists( 'sniper_user_watchlist_key_map' )
		? sniper_user_watchlist_key_map( $user_id )
		: [];

	if ( empty( $raw_signals ) ) {
		return new WP_REST_Response( [ 'error' => 'No signals provided' ], 400 );
	}

	// live_rates: normalised symbol → price, used for rate-dependent pip values (JPY, CAD, CHF, cross pairs).
	$live_rates           = ( isset( $body['live_rates'] ) && is_array( $body['live_rates'] ) ) ? $body['live_rates'] : [];
	$profile              = sniper_exe_get_risk_profile_data( $user_id );
	$active_fib_timeframe = sniper_exe_normalize_fib_timeframe( $body['fib_timeframe'] ?? get_user_meta( $user_id, 'sn_fib_tf', true ) ?? 'WEEKLY' );
	$active_tf_profile    = sniper_exe_timeframe_profile( $active_fib_timeframe );
	$profile['base_risk_pct'] = floatval( $profile['risk_pct'] ?? 1.0 );
	$profile['risk_pct']      = round( $profile['base_risk_pct'] * floatval( $active_tf_profile['riskMultiplier'] ?? 1.0 ), 2 );

	$blueprints = [];
	$skipped    = 0;

	foreach ( $raw_signals as $sig ) {
		if ( ! is_array( $sig ) ) { $skipped++; continue; }

		// ── Required fields ───────────────────────────────────────────────────
		$pair                   = sanitize_text_field( $sig['pair']              ?? '' );
		$direction              = strtoupper( sanitize_text_field( $sig['direction'] ?? '' ) );
		$zone_price             = isset( $sig['entry_zone_price'] ) ? floatval( $sig['entry_zone_price'] ) : null;
		$signal_state           = strtoupper( sanitize_text_field( $sig['signal_state'] ?? '' ) );
		$ef_tp_narrative_valid  = array_key_exists( 'ef_tp_narrative_valid', $sig ) ? sniper_boolish( $sig['ef_tp_narrative_valid'] ) : true;
		$fib_timeframe          = sniper_exe_normalize_fib_timeframe( $sig['fib_timeframe'] ?? $body['fib_timeframe'] ?? $sig['session_tf'] ?? $active_fib_timeframe );
		$timeframe_profile      = sniper_exe_timeframe_profile( $fib_timeframe );
		$execution_profile      = $profile;
		$execution_profile['risk_pct'] = round( $profile['base_risk_pct'] * floatval( $timeframe_profile['riskMultiplier'] ?? 1.0 ), 2 );
		$signal_valid_bars      = isset( $sig['signal_valid_bars'] ) ? max( 1, intval( $sig['signal_valid_bars'] ) ) : intval( $timeframe_profile['defaultValidityBars'] ?? 0 );
		$bar_duration_seconds   = isset( $sig['bar_duration_seconds'] ) ? max( 1, intval( $sig['bar_duration_seconds'] ) ) : intval( $timeframe_profile['barDurationSeconds'] ?? 0 );
		$signal_bar_timestamp   = isset( $sig['signal_bar_time'] ) ? intval( intval( $sig['signal_bar_time'] ) / 1000 ) : 0;

		if ( ! $pair || ! in_array( $direction, [ 'BUY', 'SELL' ], true ) || ! $zone_price ) {
			$skipped++; continue;
		}
		if ( ! sniper_exe_signal_passes_bias_gate( $sig, $watchlist_keys, $direction ) ) {
			$skipped++; continue;
		}

		// ── Chop gate ─────────────────────────────────────────────────────────
		$gate        = strtoupper( sanitize_text_field( $sig['gate'] ?? '' ) );
		$gate_reason = sanitize_text_field( $sig['gate_reason'] ?? '' );
		if ( ! sniper_exe_signal_passes_chop_gate( $sig ) ) {
			$skipped++; continue;
		}

		// ── Extract bias/matrix fields needed downstream ──────────────────────
		$final_bias   = strtoupper( sanitize_text_field( $sig['final_bias'] ?? '' ) );
		$seq_status   = sanitize_text_field( $sig['sequence_status'] ?? '' );
		$matrix       = isset( $sig['matrix'] ) && is_array( $sig['matrix'] ) ? $sig['matrix'] : [];
		$pd_array     = isset( $sig['pd_array'] ) && is_array( $sig['pd_array'] ) ? $sig['pd_array'] : [];
		$chop_band    = isset( $sig['chop_band'] ) && is_array( $sig['chop_band'] ) ? $sig['chop_band'] : [];

		// ── Pair metadata ─────────────────────────────────────────────────────
		$normalized = sniper_normalise_pair( $pair );
		$is_jpy     = ( strpos( $normalized, 'JPY' ) !== false );
		$dp         = $is_jpy ? 2 : 5;

		// ── 3-stage ladder entries ─────────────────────────────────────────────
		$entry_plan   = sniper_exe_resolve_stage_entries( $sig, $zone_price, $direction, $dp );
		$entries      = $entry_plan['entries'];
		$entry_levels = $entry_plan['entry_levels'];

		// ── Stop-loss ─────────────────────────────────────────────────────────
		// Prefer signal-provided stage SL metadata, else derive from the legacy buffer.
		$sl_buffer_base = $is_jpy ? 1.50 : 0.0040;
		$session_tf     = sanitize_text_field( $sig['session_tf'] ?? '' );
		if ( '' === $session_tf ) {
			$session_tf = $timeframe_profile['label'];
		}
		$htf_multiplier = floatval( $timeframe_profile['slBufferMultiplier'] ?? 1.0 );
		$sl_buf         = $sl_buffer_base * $htf_multiplier;
		$min_sl_dist = $is_jpy ? 0.40 : 0.0040;

		if ( isset( $sig['sl'] ) && floatval( $sig['sl'] ) > 0 ) {
			$shared_sl = floatval( $sig['sl'] );
		} else {
			$shared_sl = $direction === 'SELL'
				? round( $zone_price + $sl_buf, $dp )
				: round( $zone_price - $sl_buf, $dp );
		}

		// Enforce minimum SL distance (40 pips USD / 40 pips JPY)
		if ( abs( $shared_sl - $zone_price ) < $min_sl_dist ) {
			$shared_sl = $direction === 'SELL'
				? round( $zone_price + $min_sl_dist, $dp )
				: round( $zone_price - $min_sl_dist, $dp );
		}
		$stage_stop_plan = sniper_exe_resolve_stage_sls( $sig, $entries, $shared_sl, $dp );
		$stage_sls       = $stage_stop_plan['stage_sls'];
		$sl_levels       = $stage_stop_plan['sl_levels'];
		foreach ( $entries as $i => $entry_price ) {
			if ( ! is_numeric( $entry_price ) || ! isset( $stage_sls[ $i ] ) ) continue;
			if ( abs( floatval( $stage_sls[ $i ] ) - floatval( $entry_price ) ) < $min_sl_dist ) {
				$stage_sls[ $i ] = 'SELL' === $direction
					? round( floatval( $entry_price ) + $min_sl_dist, $dp )
					: round( floatval( $entry_price ) - $min_sl_dist, $dp );
			}
			$sl_levels[ $i ]['sl_price'] = $stage_sls[ $i ];
		}
		$sl = isset( $stage_sls[0] ) ? floatval( $stage_sls[0] ) : floatval( $shared_sl );

		// ── Take-profit levels ────────────────────────────────────────────────
		$tp1 = ( isset( $sig['tp1'] ) && floatval( $sig['tp1'] ) > 0 )
			? round( floatval( $sig['tp1'] ), $dp ) : null;
		$tp2 = ( isset( $sig['tp2'] ) && floatval( $sig['tp2'] ) > 0 )
			? round( floatval( $sig['tp2'] ), $dp ) : null;
		if ( ! $ef_tp_narrative_valid ) {
			$tp1 = null;
			$tp2 = null;
		}
		if ( 'SELL' === $direction ) {
			if ( null !== $tp1 && $tp1 >= $zone_price ) $tp1 = null;
			if ( null !== $tp2 && $tp2 >= $zone_price ) $tp2 = null;
		}
		if ( 'BUY' === $direction ) {
			if ( null !== $tp1 && $tp1 <= $zone_price ) $tp1 = null;
			if ( null !== $tp2 && $tp2 <= $zone_price ) $tp2 = null;
		}

		$has_stage_hints = ( ! empty( $sig['entry_levels'] ) && is_array( $sig['entry_levels'] ) ) || ( ! empty( $sig['sl_levels'] ) && is_array( $sig['sl_levels'] ) );
		$final_stage_plan = $has_stage_hints
			? sniper_exe_build_final_stages( $pair, $direction, $entries, $stage_sls, $tp1, $tp2 )
			: [
				'stages_final'        => [],
				'stage_tps'           => [],
				'monotonic_stop_pass' => true,
				'rr_validation_pass'  => true,
				'stop_floor_pips'     => sniper_exe_stop_floor_pips( $pair ),
				'legacy_fallback'     => true,
			];
		$final_stages = is_array( $final_stage_plan['stages_final'] ?? null ) ? $final_stage_plan['stages_final'] : [];
		if ( isset( $final_stages[0]['sl'] ) && is_numeric( $final_stages[0]['sl'] ) ) {
			$sl = floatval( $final_stages[0]['sl'] );
		}

		// ── R:R gate (shallow entry vs TP1) ──────────────────────────────────
		$sl_pips_e1 = ! empty( $final_stages ) && isset( $final_stages[0]['sl_pips'] )
			? floatval( $final_stages[0]['sl_pips'] )
			: sniper_exe_price_to_pips( $pair, $entries[0], $sl );
		$rr1        = null;
		$regime     = strtoupper( sanitize_text_field( $sig['regime'] ?? '' ) );
		$min_rr     = floatval( $timeframe_profile['minRr'] ?? 2.0 );
		if ( 'REVERSAL ZONE' === $regime ) {
			$min_rr = min( $min_rr, 1.5 );
		}
		$sl_dist    = abs( $zone_price - $sl );
		$tp_dist    = null !== $tp1 ? abs( $zone_price - $tp1 ) : 0;
		$rr_actual  = ! empty( $final_stages ) && is_numeric( $final_stages[0]['rr'] ?? null )
			? floatval( $final_stages[0]['rr'] )
			: ( $sl_dist > 0 ? $tp_dist / $sl_dist : 0 );
		if ( null !== $tp1 && $sl_pips_e1 > 0 ) {
			$tp_pips = sniper_exe_price_to_pips( $pair, $entries[0], $tp1 );
			$rr1     = round( $tp_pips / $sl_pips_e1, 2 );
		}
		if ( ! empty( $final_stages ) && is_numeric( $final_stages[0]['rr'] ?? null ) ) {
			$rr1 = floatval( $final_stages[0]['rr'] );
		}
		if ( ! sniper_exe_signal_passes_rr_gate( $final_stage_plan, $rr_actual, $min_rr, $tp_dist ) ) {
			$skipped++; continue;
		}

		// ── Risk breakdown ────────────────────────────────────────────────────
		$rb = sniper_exe_risk_breakdown( $pair, $entries, $sl, $execution_profile, $live_rates, $stage_sls, $final_stages );
		if ( empty( $rb['available'] ) || ! empty( $rb['dd_warning'] ) ) { $skipped++; continue; }

		// ── Blueprint ─────────────────────────────────────────────────────────
		$identity  = sniper_exe_signal_identity( $sig, $pair, $direction, $zone_price, $sl, $tp1, $tp2 );
		$signal_id = $identity['signal_id'];
		$signal_hash = $identity['signal_hash'];

		$blueprints[] = [
			'signal_id'        => $signal_id,
			'signal_hash'      => $signal_hash,
			'pair'             => $pair,
			'direction'        => $direction,
			'regime'           => $regime,
			'final_bias'       => $final_bias,
			'matrix'           => $matrix,
			'pd_array'         => $pd_array,
			'gate'             => $gate,
			'gate_reason'      => $gate_reason,
			'chop_band'        => $chop_band,
			'fib_timeframe'    => $fib_timeframe,
			'strategy_profile' => $timeframe_profile['label'] ?? null,
			'execution_horizon'=> $timeframe_profile['executionHorizon'] ?? null,
			'session_tf'       => $session_tf,
			'sequence_status'  => $seq_status,
			'signal_state'     => sanitize_text_field( $sig['signal_state']     ?? '' ),
			'ede_stars'        => isset( $sig['ede_stars'] )        ? intval( $sig['ede_stars'] )        : null,
			'confluence_score' => isset( $sig['confluence_score'] ) ? intval( $sig['confluence_score'] ) : null,
			'model_tag'        => sanitize_text_field( $sig['model_tag']        ?? '' ),
			'zone_price'       => $zone_price,
			'ef_tp_narrative_valid' => $ef_tp_narrative_valid,
			'zone_label'       => sniper_exe_normalize_zone_label( $sig['entry_zone_label'] ?? '' ),
			'market_price'     => isset( $sig['market_price'] ) ? floatval( $sig['market_price'] ) : null,
			'entry_source'     => $entry_plan['entry_source'],
			'fallback_reason'  => $entry_plan['fallback_reason'],
			'entry_levels'     => $entry_levels,
			'entries'          => $entries,
			'stage_sls'        => $stage_sls,
			'stages_final'     => $final_stages,
			'stage_tps'        => $final_stage_plan['stage_tps'] ?? [],
			'stage_lots'       => $rb['stage_lots'] ?? [],
			'monotonic_stop_pass' => ! empty( $final_stage_plan['monotonic_stop_pass'] ),
			'monotonic_lot_pass'  => ! empty( $rb['monotonic_lot_pass'] ),
			'stop_floor_pips'  => isset( $final_stage_plan['stop_floor_pips'] ) ? floatval( $final_stage_plan['stop_floor_pips'] ) : null,
			'rr_validation_pass' => ! empty( $final_stage_plan['rr_validation_pass'] ),
			'legacy_fallback'  => ! empty( $final_stage_plan['legacy_fallback'] ),
			'sl_levels'        => $sl_levels,
			'sl_rule'          => $stage_stop_plan['sl_rule'],
			'sl'               => $sl,
			'sl_pips_shallow'  => round( $sl_pips_e1, 1 ),
			'tp1'              => $tp1,
			'tp2'              => $tp2,
			'rr1'              => $rr1,
			'rr_actual'        => round( $rr_actual, 2 ),
			'status'           => 'READY',
			'setup_class'      => sanitize_text_field( $sig['setup_class'] ?? 'BLOCKED' ),
			'blocked_reason'   => sanitize_text_field( $sig['blocked_reason'] ?? '' ),
			'risk_breakdown'     => $rb,
			'total_risk_amount'  => $rb['total_risk_amount'] ?? null,
			'risk_currency'      => $rb['currency']           ?? 'USD',
			'dd_warning'         => $rb['dd_warning']         ?? false,
			'dd_warning_msg'     => $rb['dd_warning_msg']     ?? null,
			'validity_bars_remaining' => $signal_valid_bars,
			'bar_duration_seconds' => $bar_duration_seconds,
			'base_risk_pct'      => $profile['base_risk_pct'],
			'effective_risk_pct' => $execution_profile['risk_pct'],
			'equity_at_calc'     => $profile['balance'],
			'risk_pct_at_calc'   => $execution_profile['risk_pct'],
			'generated_at'     => current_time( 'c' ),
		];
		$last_idx = count( $blueprints ) - 1;
		if ( ! $ef_tp_narrative_valid ) {
			unset( $blueprints[ $last_idx ]['tp1'] );
			unset( $blueprints[ $last_idx ]['tp2'] );
		}
		if ( $signal_valid_bars > 0 && $bar_duration_seconds > 0 && $signal_bar_timestamp > 0 ) {
			if ( ( time() - $signal_bar_timestamp ) > ( $signal_valid_bars * $bar_duration_seconds ) ) {
				$blueprints[ $last_idx ]['status'] = 'EXPIRED';
				$blueprints[ $last_idx ]['validity_bars_remaining'] = 0;
			}
		}
	}

	// ── Persist to trade queue (upsert by signal_id) ──────────────────────────
	$existing  = get_user_meta( $user_id, 'sn_trade_queue', true );
	$existing  = is_array( $existing ) ? $existing : [];
	$queue_map = [];
	foreach ( $existing as $bp ) {
		if ( ! is_array( $bp ) ) continue;
		if ( ! empty( $watchlist_keys ) ) {
			$pair_key = function_exists( 'sniper_watchlist_symbol_key' )
				? sniper_watchlist_symbol_key( $bp['pair'] ?? '' )
				: strtoupper( preg_replace( '/[^A-Z0-9]/', '', (string) ( $bp['pair'] ?? '' ) ) );
			if ( ! isset( $watchlist_keys[ $pair_key ] ) ) {
				continue;
			}
		}
		$key = $bp['signal_hash'] ?? $bp['signal_id'] ?? null;
		if ( $key ) $queue_map[ $key ] = $bp;
	}
	$score_threshold = isset( $body['score_threshold'] ) ? floatval( $body['score_threshold'] ) : 70.0;
	foreach ( $blueprints as $bp ) {
		foreach ( $queue_map as $queue_key => $active_bp ) {
			$same_pair = ( strtoupper( sanitize_text_field( $active_bp['pair'] ?? '' ) ) === strtoupper( sanitize_text_field( $bp['pair'] ?? '' ) ) );
			$is_active = in_array( strtoupper( sanitize_text_field( $active_bp['status'] ?? 'READY' ) ), [ 'READY', 'ACTIVE' ], true );
			$is_opposing = strtoupper( sanitize_text_field( $active_bp['direction'] ?? '' ) ) !== strtoupper( sanitize_text_field( $bp['direction'] ?? '' ) );
			$new_score = isset( $bp['confluence_score'] ) ? floatval( $bp['confluence_score'] ) : 0;
			if ( $same_pair && $is_active && $is_opposing && $new_score >= $score_threshold ) {
				$queue_map[ $queue_key ]['status'] = 'INVALIDATED';
			}
		}
		$key = $bp['signal_hash'] ?? $bp['signal_id'] ?? null;
		if ( $key ) $queue_map[ $key ] = $bp;
	}
	$queue = array_values( $queue_map );
	if ( count( $queue ) > 100 ) $queue = array_slice( $queue, -100 );
	update_user_meta( $user_id, 'sn_trade_queue', $queue );

	return new WP_REST_Response( [
		'ok'            => true,
		'blueprints'    => $blueprints,
		'count'         => count( $blueprints ),
		'skipped'       => $skipped,
		'equity_used'   => $profile['balance'],
		'risk_pct_used' => $profile['risk_pct'],
		'fib_timeframe_used' => $active_fib_timeframe,
		'strategy_profile' => $active_tf_profile['label'] ?? null,
		'execution_horizon' => $active_tf_profile['executionHorizon'] ?? null,
		'generated_at'  => current_time( 'c' ),
	], 200 );
}
