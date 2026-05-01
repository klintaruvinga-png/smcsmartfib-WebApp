<?php
/**
 * Plugin Name: Sniper Webhook
 * Plugin URI:  https://trader.stokvelsociety.co.za
 * Description: SMC SuperFIB webhook receiver and REST API - v12.0.9.1.
 * Version:     12.0.9.1
 * Author:      Kudzanai Taruvinga
 *
 * Architecture:
 *  - Self-contained plugin (no child theme dependency)
 *  - Dashboard HTML served from: plugin/templates/dashboard-ui.html
 *  - Dashboard JS served from:   plugin/assets/js/sniper-dashboard.js
 *  - WP REST nonce + user context injected server-side on every page load
 *  - Live signal store uses WP options (persistent) not transients (volatile)
 *  - Execution engine in: plugin/sniper-execution-engine.php
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// ── PLUGIN PATH CONSTANTS ────────────────────────────────────────────────────
define( 'SNIPER_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'SNIPER_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'SNIPER_PLATFORM_VERSION', '12.0.9.1' );
define( 'SNIPER_TV_ALERT_MAX_BODY_BYTES', 65536 );
define( 'SNIPER_TV_ALERT_DEDUPE_TTL', 120 );
define( 'SNIPER_VALID_REGIMES', [ 'TREND DOWN', 'TREND UP', 'REVERSAL ZONE', 'RANGING' ] );

add_action( 'wp_enqueue_scripts', 'sniper_enqueue_frontend_assets' );

function sniper_enqueue_frontend_assets() {
	if ( is_admin() ) {
		return;
	}

	wp_enqueue_style(
		'sniper-superfib-fonts',
		'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap',
		[],
		null
	);

	wp_enqueue_style(
		'sniper-superfib-ui',
		esc_url( SNIPER_PLUGIN_URL . 'assets/css/style.css' ),
		[ 'sniper-superfib-fonts' ],
		SNIPER_PLATFORM_VERSION
	);
}


// ── CONFIGURATION HELPERS ────────────────────────────────────────────────────

function sniper_get_secret() {
	$secret = trim( (string) get_option( 'sniper_webhook_secret', '' ) );
	return $secret;
}

function sniper_get_backend_secret() {
	return get_option( 'sniper_backend_secret', '' );
}

/** Twelve Data API key — stored in WP admin options and used only by server-side proxy routes. */
function sniper_get_td_key() {
	return get_option( 'sniper_td_key', '' );
}

function sniper_get_allowed_origins() {
	$origins = get_option( 'sniper_allowed_origins', [
		'https://trader.stokvelsociety.co.za',
		'https://stokvelsociety.co.za',
		'http://localhost',
		'http://127.0.0.1',
		'null',
	] );
	return is_array( $origins ) ? $origins : [];
}

/**
 * Parse batch payload timestamps to Unix seconds.
 * Accepts ISO-8601 strings, epoch milliseconds, or epoch seconds.
 */
function sniper_parse_payload_timestamp_seconds( $raw_timestamp ) {
	if ( null === $raw_timestamp || '' === $raw_timestamp ) {
		return null;
	}

	if ( is_numeric( $raw_timestamp ) ) {
		$numeric_value = (float) $raw_timestamp;
		if ( $numeric_value > 9999999999 ) {
			return (int) floor( $numeric_value / 1000 );
		}
		return (int) floor( $numeric_value );
	}

	$parsed = strtotime( (string) $raw_timestamp );
	if ( false === $parsed ) {
		return null;
	}

	return (int) $parsed;
}

function sniper_tv_alert_payload_type( array $body ) {
	if ( ! empty( $body['signal_type'] ) ) {
		return 'signal';
	}
	if ( ! empty( $body['regime'] ) ) {
		return 'regime';
	}
	if ( ! empty( $body['snapshot_type'] ) ) {
		return 'snapshot';
	}
	return '';
}

function sniper_tv_alert_dedupe_hash( array $body, string $type ) {
	$instrument = sanitize_text_field( (string) ( $body['instrument_id'] ?? '' ) );
	$signal_key = sanitize_text_field( (string) ( $body['signal_type'] ?? $body['regime'] ?? $body['snapshot_type'] ?? '' ) );
	$ladder_id  = sanitize_text_field( (string) ( $body['ladder_id'] ?? '' ) );
	$level      = sanitize_text_field( (string) ( $body['level'] ?? '' ) );
	$status     = sanitize_text_field( (string) ( $body['status'] ?? '' ) );
	$timestamp  = sanitize_text_field( (string) ( $body['timestamp'] ?? $body['time'] ?? '' ) );
	$raw_key    = implode( '|', [ $type, $instrument, $signal_key, $ladder_id, $level, $status, $timestamp ] );
	return hash( 'sha256', $raw_key );
}

function sniper_tv_alert_is_duplicate( string $hash ) {
	$now   = time();
	$cache = get_option( 'sniper_tv_alert_dedupe_cache', [] );
	$cache = is_array( $cache ) ? $cache : [];

	foreach ( $cache as $key => $seen_at ) {
		if ( ! is_numeric( $seen_at ) || (int) $seen_at < ( $now - SNIPER_TV_ALERT_DEDUPE_TTL ) ) {
			unset( $cache[ $key ] );
		}
	}

	$is_duplicate = isset( $cache[ $hash ] );
	if ( count( $cache ) > 200 ) {
		$cache = array_slice( $cache, -200, null, true );
	}
	update_option( 'sniper_tv_alert_dedupe_cache', $cache, false );
	return $is_duplicate;
}

function sniper_tv_alert_mark_processed( string $hash ) {
	$now   = time();
	$cache = get_option( 'sniper_tv_alert_dedupe_cache', [] );
	$cache = is_array( $cache ) ? $cache : [];

	foreach ( $cache as $key => $seen_at ) {
		if ( ! is_numeric( $seen_at ) || (int) $seen_at < ( $now - SNIPER_TV_ALERT_DEDUPE_TTL ) ) {
			unset( $cache[ $key ] );
		}
	}

	$cache[ $hash ] = $now;
	if ( count( $cache ) > 200 ) {
		$cache = array_slice( $cache, -200, null, true );
	}
	update_option( 'sniper_tv_alert_dedupe_cache', $cache, false );
}

function sniper_store_tv_alert_debug_state( array $body, string $type, string $result, string $raw_payload ) {
	$compact = [
		'event_type'    => $body['event_type'] ?? null,
		'signal_type'   => $body['signal_type'] ?? null,
		'regime'        => $body['regime'] ?? null,
		'snapshot_type' => $body['snapshot_type'] ?? null,
		'instrument_id' => $body['instrument_id'] ?? null,
		'symbol'        => $body['symbol'] ?? null,
		'pair'          => $body['pair'] ?? null,
		'ladder_id'     => $body['ladder_id'] ?? null,
		'timestamp'     => $body['timestamp'] ?? ( $body['time'] ?? null ),
		'raw'           => substr( $raw_payload, 0, 8192 ),
	];

	update_option( 'sniper_last_tv_alert', wp_json_encode( $compact ), false );
	update_option( 'sniper_last_tv_alert_at', current_time( 'c' ), false );
	update_option( 'sniper_last_tv_alert_type', $type, false );
	update_option( 'sniper_last_tv_alert_symbol', sanitize_text_field( (string) ( $body['symbol'] ?? $body['pair'] ?? '' ) ), false );
	update_option( 'sniper_last_tv_alert_result', $result, false );
}

function sniper_receive_tv_alert( WP_REST_Request $request ) {
	$raw_body = (string) $request->get_body();
	if ( '' === trim( $raw_body ) ) {
		return new WP_REST_Response( [ 'error' => 'Empty payload' ], 400 );
	}

	if ( strlen( $raw_body ) > SNIPER_TV_ALERT_MAX_BODY_BYTES ) {
		return new WP_REST_Response( [ 'error' => 'Payload too large' ], 413 );
	}

	$content_type = (string) $request->get_header( 'content-type' );
	if ( false === stripos( $content_type, 'application/json' ) ) {
		return new WP_REST_Response( [ 'error' => 'Content-Type must be application/json' ], 400 );
	}

	$body = $request->get_json_params();
	$body = is_array( $body ) ? sniper_normalize_field_aliases( $body ) : [];
	if ( empty( $body ) ) {
		return new WP_REST_Response( [ 'error' => 'Malformed JSON payload' ], 400 );
	}

	$type = sniper_tv_alert_payload_type( $body );
	if ( '' === $type ) {
		sniper_store_tv_alert_debug_state( $body, 'unknown', 'rejected_unrecognized', $raw_body );
		return new WP_REST_Response( [ 'error' => 'Unrecognized TradingView payload shape' ], 400 );
	}

	$dedupe_hash = sniper_tv_alert_dedupe_hash( $body, $type );
	if ( sniper_tv_alert_is_duplicate( $dedupe_hash ) ) {
		sniper_store_tv_alert_debug_state( $body, $type, 'duplicate_ignored', $raw_body );
		return new WP_REST_Response( [
			'status'      => 'duplicate_ignored',
			'payload_type'=> $type,
		], 200 );
	}

	$delegated = new WP_REST_Request( 'POST', '/sniper/v1/' . $type );
	$delegated->set_body( wp_json_encode( $body ) );
	$delegated->set_header( 'content-type', 'application/json' );

	if ( 'signal' === $type ) {
		$response = sniper_handle_signal( $delegated );
	} elseif ( 'regime' === $type ) {
		$response = sniper_receive_regime( $delegated );
	} else {
		$response = sniper_receive_snapshot( $delegated );
	}

	$status_code = $response instanceof WP_REST_Response ? $response->get_status() : 200;
	$result      = $status_code >= 200 && $status_code < 300 ? 'routed_ok' : 'routed_error';
	if ( 'routed_ok' === $result ) {
		sniper_tv_alert_mark_processed( $dedupe_hash );
	}
	sniper_store_tv_alert_debug_state( $body, $type, $result, $raw_body );

	return $response;
}

// ── PERMISSION CALLBACKS ─────────────────────────────────────────────────────

/**
 * Validate webhook/engine secret.
 * Checks header first, then JSON body — supports both Pine Script alerts
 * (header only) and the JS engine (sends secret in body).
 */
function sniper_validate_secret( WP_REST_Request $request ) {
	$configured_secret = sniper_get_secret();
	if ( '' === $configured_secret ) {
		return new WP_Error(
			'sniper_secret_unconfigured',
			'Webhook secret is not configured. Set sniper_webhook_secret in plugin settings.',
			[ 'status' => 503 ]
		);
	}

	$provided = $request->get_header( 'X-Sniper-Secret' )
		?: $request->get_header( 'x-sniper-secret' );

	if ( ! $provided ) {
		$body     = $request->get_json_params();
		$provided = isset( $body['secret'] ) ? (string) $body['secret'] : '';
	}

	if ( empty( $provided ) || ! hash_equals( $configured_secret, $provided ) ) {
		return new WP_Error( 'unauthorized', 'Invalid or missing secret.', [ 'status' => 401 ] );
	}
	return true;
}

/**
 * Validate engine-batch secret — allows a separate backend secret if configured,
 * falls back to the main webhook secret.
 */
function sniper_validate_engine_secret( WP_REST_Request $request ) {
	$backend = sniper_get_backend_secret();
	if ( ! empty( $backend ) ) {
		$provided = $request->get_header( 'X-Sniper-Secret' )
			?: $request->get_header( 'x-sniper-secret' );
		if ( ! $provided ) {
			$body     = $request->get_json_params();
			$provided = isset( $body['secret'] ) ? (string) $body['secret'] : '';
		}
		if ( ! empty( $provided ) && hash_equals( $backend, $provided ) ) {
			return true;
		}
	}
	// Fall back to main secret
	return sniper_validate_secret( $request );
}

/** Require an authenticated WP session (cookie / nonce). */
function sniper_require_logged_in( WP_REST_Request $request ) {
	if ( ! is_user_logged_in() ) {
		return new WP_Error( 'rest_not_logged_in', 'You must be logged in.', [ 'status' => 401 ] );
	}
	return true;
}

// ── LIVE SIGNAL STORE ────────────────────────────────────────────────────────
// Uses WP options (persistent across requests) not transients (can be purged).
// Signals are stored keyed by instrument_id for O(1) upsert.

function sniper_get_live_store() {
	$store = get_option( 'sniper_live_signals', [] );
	$store = is_array( $store ) ? $store : [];
	return sniper_prune_stale_live_store( $store, true );
}

function sniper_save_live_store( array $store ) {
	update_option( 'sniper_live_signals', $store, false ); // false = do not autoload
}

function sniper_parse_iso_timestamp( $value ) {
	if ( empty( $value ) || ! is_string( $value ) ) {
		return null;
	}
	$ts = strtotime( $value );
	return false === $ts ? null : intval( $ts );
}

function sniper_prune_stale_live_store( array $store, $persist = false ) {
	$now = time();
	$ttl = 24 * HOUR_IN_SECONDS;
	$clean = [];
	$dirty = false;
	foreach ( $store as $instrument_id => $row ) {
		if ( ! is_array( $row ) ) {
			$dirty = true;
			continue;
		}
		$updated_at = $row['updated_at'] ?? ( $row['last_signal_at'] ?? null );
		$updated_ts = sniper_parse_iso_timestamp( $updated_at );
		if ( null !== $updated_ts && ( $now - $updated_ts ) > $ttl ) {
			$dirty = true;
			continue;
		}
		$clean[ $instrument_id ] = $row;
	}
	if ( $persist && $dirty ) {
		sniper_save_live_store( $clean );
	}
	return $clean;
}

/**
 * Upsert a single instrument into the live store.
 * Merges $patch over any existing record — preserves fields not included in patch.
 */
function sniper_upsert_live_signal( array $instrument, array $patch ) {
	$store         = sniper_get_live_store();
	$instrument_id = $instrument['instrument_id'];
	$existing      = isset( $store[ $instrument_id ] ) && is_array( $store[ $instrument_id ] )
		? $store[ $instrument_id ]
		: [];

	$defaults = [
		'instrument_id'      => $instrument_id,
		'symbol'             => $instrument['symbol'],
		'display_symbol'     => $instrument['display'],
		'pair'               => $instrument['pair'],
		'phase4a_pair'       => sniper_is_phase4a_pair( $instrument['pair'] ),
		'last_signal_type'   => null,
		'last_signal_at'     => null,
		'updated_at'         => current_time( 'c' ),
		'regime'             => null,
		'sequence_status'    => null,
		'signal_state'       => null,
		'market_price'       => null,
		'score'              => null,
		'confluence_score'   => null,
		'state'              => null,
		'entry_stage'        => null,
		'direction'          => null,
		'model_tag'          => null,
		'setup_class'        => null,
		'blocked_reason'     => null,
		'setup_quality'      => null,
		'execution_quality'  => null,
		'rank_score'         => null,
		'zone_price'         => null,
		'entry_zone_price'   => null,
		'session_tf'         => null,
		'ef_is_narrative'    => null,
		'ef_anchor_dir'      => null,
		'ef_tp_narrative_valid' => null,
		'sweep_tier'         => null,
		'mss_disp_score'     => null,
		'liquidity_type'     => null,
		'poi_freshness_bars' => null,
		'f1_high'            => null,
		'f1_low'             => null,
		'f2_high'            => null,
		'f2_low'             => null,
		'f3_high'            => null,
		'f3_low'             => null,
		'anchors'            => null,
		'sl'                 => null,
		'tp'                 => null,
		'rr_estimate'        => null,
		'entry_count'        => 0,
		'entries'            => [],
		'fills'              => [],
		'ef'                 => [],
		'pretrigger'         => [],
		'structure'          => [],
		'liquidity'          => [],
		'poi'                => [],
		'chop'               => [],
		'last_ladder_id'     => null,
		'last_authenticated' => true,
	];

	$merged = array_replace(
		$defaults,
		$existing,
		$patch,
		[
			// These fields always reflect the current call, never the old record.
			'instrument_id'  => $instrument_id,
			'symbol'         => $instrument['symbol'],
			'display_symbol' => $instrument['display'],
			'pair'           => $instrument['pair'],
			'phase4a_pair'   => sniper_is_phase4a_pair( $instrument['pair'] ),
			'updated_at'     => current_time( 'c' ),
		]
	);

	$store[ $instrument_id ] = $merged;
	sniper_save_live_store( $store );
	return $merged;
}

// ── INSTRUMENT NORMALISATION ─────────────────────────────────────────────────

/**
 * Normalise a raw pair/instrument string to a canonical uppercase key.
 *
 * Standard forex: strips non-alpha, requires exactly 6 chars (e.g. GBPUSD).
 * Non-forex (indices, metals, crypto): strips non-alphanumeric, accepts 3–8
 * chars so that US30, NAS100, XAUUSD (already 6-alpha), BTCUSD etc. pass
 * through. Anything shorter than 3 chars or longer than 8 is rejected → ''.
 */
function sniper_normalise_pair( $raw ) {
	$s = strtoupper( trim( (string) $raw ) );
	if ( strpos( $s, ':' ) !== false ) {
		$parts = explode( ':', $s );
		$s     = end( $parts );
	}
	$alpha_only = preg_replace( '/[^A-Z]/', '', $s );
	if ( strlen( $alpha_only ) === 6 ) {
		return $alpha_only; // Standard 6-char forex pair.
	}
	// Non-forex instruments may contain digits (US30, NAS100, BTC/USD).
	$alnum = preg_replace( '/[^A-Z0-9]/', '', $s );
	if ( strlen( $alnum ) >= 3 && strlen( $alnum ) <= 8 ) {
		return $alnum;
	}
	return '';
}

/** Build a slash-separated display symbol from raw input. */
function sniper_display_symbol( $instrument_id, $symbol = '' ) {
	$candidate = sniper_normalise_pair( $symbol ?: $instrument_id );
	if ( strlen( $candidate ) === 6 ) {
		return substr( $candidate, 0, 3 ) . '/' . substr( $candidate, 3, 3 );
	}
	$fallback = $symbol ?: $instrument_id;
	if ( strpos( $fallback, ':' ) !== false ) {
		$parts    = explode( ':', $fallback );
		$fallback = end( $parts );
	}
	return strtoupper( sanitize_text_field( $fallback ) );
}

/** Resolve instrument_id, symbol, pair, and display from any payload shape. */
function sniper_normalise_instrument( array $body ) {
	$instrument_id = sanitize_text_field(
		$body['instrument_id'] ?? $body['tickerid'] ?? $body['symbol_id']
		?? $body['pair'] ?? $body['symbol'] ?? ''
	);
	$symbol  = sanitize_text_field( $body['symbol'] ?? $body['pair'] ?? $instrument_id );
	$pair    = sniper_normalise_pair( $body['pair'] ?? $symbol ?? $instrument_id );
	// Fallback for non-forex instruments (indices, commodities, crypto) where
	// sniper_normalise_pair() strips digits and fails the 6-alpha check.
	if ( empty( $pair ) ) {
		$raw_pair = $body['pair'] ?? $symbol ?? $instrument_id;
		$pair     = strtoupper( preg_replace( '/[^A-Z0-9]/', '', strtoupper( trim( (string) $raw_pair ) ) ) );
	}
	$display = sanitize_text_field( $body['display_symbol'] ?? sniper_display_symbol( $instrument_id, $symbol ) );

	return [
		'instrument_id' => strtoupper( $instrument_id ),
		'symbol'        => strtoupper( $symbol ),
		'pair'          => $pair,
		'display'       => $display,
	];
}

/** True for any recognised instrument (no pair whitelist). */
function sniper_is_phase4a_pair( $pair ) {
	return ! empty( $pair );
}

// ── SIGNAL DATA EXTRACTION HELPERS ──────────────────────────────────────────

function sniper_float_or_null( $value ) {
	return is_numeric( $value ) ? floatval( $value ) : null;
}

function sniper_string_or_null( $value ) {
	$value = sanitize_text_field( (string) $value );
	$value = trim( $value );
	return '' === $value ? null : $value;
}

function sniper_boolish( $value ) {
	if ( is_bool( $value ) ) return $value;
	if ( is_numeric( $value ) ) return intval( $value ) !== 0;
	return in_array( strtolower( trim( (string) $value ) ), [ '1', 'true', 'yes', 'y' ], true );
}

function sniper_normalize_sequence_status( $value ) {
	$normalized = strtoupper( trim( str_replace( [ '_', '-' ], ' ', (string) $value ) ) );
	if ( '' === $normalized ) return null;
	if ( in_array( $normalized, [ 'READY', 'AWAIT MSS', 'AWAIT SWEEP', 'STALE' ], true ) ) {
		return $normalized;
	}
	return sniper_string_or_null( $normalized );
}

function sniper_normalize_signal_state( $value, $sequence_status = null ) {
	$normalized = strtoupper( trim( str_replace( [ '_', '-' ], ' ', (string) $value ) ) );
	if ( '' === $normalized ) {
		$normalized = '';
	}

	if ( 'PENDING' === $normalized || 'READY' === $normalized || 'AWAIT MSS' === $normalized || 'AWAIT SWEEP' === $normalized ) {
		$normalized = 'WATCHLIST';
	}
	if ( 'STALE' === $normalized || 'BLOCKED' === $normalized ) {
		$normalized = 'INVALID';
	}
	if ( in_array( $normalized, [ 'ACTIVE', 'WATCHLIST', 'INVALID', 'EXPIRED' ], true ) ) {
		return $normalized;
	}

	$sequence_status = sniper_normalize_sequence_status( $sequence_status );
	if ( 'READY' === $sequence_status ) {
		return 'WATCHLIST';
	}
	if ( in_array( $sequence_status, [ 'AWAIT MSS', 'AWAIT SWEEP' ], true ) ) {
		return 'WATCHLIST';
	}
	if ( 'STALE' === $sequence_status ) {
		return 'INVALID';
	}

	return null;
}

function sniper_derive_signal_state( $explicit_state, $sequence_status, array $chop = [] ) {
	if ( ! empty( $chop['active'] ) ) {
		return 'INVALID';
	}

	$normalized = sniper_normalize_signal_state( $explicit_state, $sequence_status );
	if ( $normalized ) {
		return $normalized;
	}

	$sequence_status = sniper_normalize_sequence_status( $sequence_status );
	if ( 'READY' === $sequence_status ) {
		return 'WATCHLIST';
	}
	if ( in_array( $sequence_status, [ 'AWAIT MSS', 'AWAIT SWEEP' ], true ) ) {
		return 'WATCHLIST';
	}

	return 'INVALID';
}


function sniper_normalize_field_aliases( array $payload ) {
	if ( isset( $payload['zone_price'] ) && ! isset( $payload['entry_zone_price'] ) ) {
		$payload['entry_zone_price'] = $payload['zone_price'];
	}
	if ( isset( $payload['state'] ) && ! isset( $payload['signal_state'] ) ) {
		$payload['signal_state'] = $payload['state'];
	}
	if ( isset( $payload['score'] ) && ! isset( $payload['confluence_score'] ) ) {
		$payload['confluence_score'] = $payload['score'];
	}
	return $payload;
}

function sniper_normalize_anchor_leg( $candidate ) {
	if ( ! is_array( $candidate ) ) {
		return null;
	}
	$high = sniper_float_or_null( $candidate['high'] ?? $candidate['fibHigh'] ?? null );
	$low  = sniper_float_or_null( $candidate['low'] ?? $candidate['fibLow'] ?? null );
	if ( null === $high || null === $low || $high === $low ) {
		return null;
	}
	return [
		'high' => max( $high, $low ),
		'low'  => min( $high, $low ),
	];
}

function sniper_normalize_anchor_contract( $anchors, array $legacy_scalars = [] ) {
	$normalized = [];
	$anchors = is_array( $anchors ) ? $anchors : [];
	foreach ( [ 'f1', 'f2', 'f3' ] as $leg ) {
		$value = null;
		if ( isset( $anchors[ $leg ] ) && is_array( $anchors[ $leg ] ) ) {
			$value = sniper_normalize_anchor_leg( $anchors[ $leg ] );
		}
		if ( ! $value ) {
			$value = sniper_normalize_anchor_leg( [
				'high' => $legacy_scalars[ $leg . '_high' ] ?? null,
				'low'  => $legacy_scalars[ $leg . '_low' ] ?? null,
			] );
		}
		if ( $value ) {
			$normalized[ $leg ] = $value;
		}
	}
	return $normalized;
}

function sniper_anchor_contract_scalar( array $anchors, $leg, $field ) {
	return isset( $anchors[ $leg ][ $field ] ) ? sniper_float_or_null( $anchors[ $leg ][ $field ] ) : null;
}

function sniper_anchor_contract_components( array $anchors ) {
	$components = [];
	foreach ( [ 'f3', 'f2', 'f1' ] as $leg ) {
		$fib_high = sniper_anchor_contract_scalar( $anchors, $leg, 'high' );
		$fib_low  = sniper_anchor_contract_scalar( $anchors, $leg, 'low' );
		$components[ $leg ] = [
			'fibHigh' => $fib_high,
			'fibLow'  => $fib_low,
			'valid'   => null !== $fib_high && null !== $fib_low,
		];
	}
	return $components;
}

function sniper_normalize_payload_anchor_contract( array $payload ) {
	return sniper_normalize_anchor_contract(
		isset( $payload['anchors'] ) && is_array( $payload['anchors'] ) ? $payload['anchors'] : [],
		[
			'f1_high' => $payload['f1_high'] ?? null,
			'f1_low'  => $payload['f1_low'] ?? null,
			'f2_high' => $payload['f2_high'] ?? null,
			'f2_low'  => $payload['f2_low'] ?? null,
			'f3_high' => $payload['f3_high'] ?? null,
			'f3_low'  => $payload['f3_low'] ?? null,
		]
	);
}

function sniper_anchor_contract_scalar_fields( array $anchors ) {
	return [
		'f1_high' => sniper_anchor_contract_scalar( $anchors, 'f1', 'high' ),
		'f1_low'  => sniper_anchor_contract_scalar( $anchors, 'f1', 'low' ),
		'f2_high' => sniper_anchor_contract_scalar( $anchors, 'f2', 'high' ),
		'f2_low'  => sniper_anchor_contract_scalar( $anchors, 'f2', 'low' ),
		'f3_high' => sniper_anchor_contract_scalar( $anchors, 'f3', 'high' ),
		'f3_low'  => sniper_anchor_contract_scalar( $anchors, 'f3', 'low' ),
	];
}

function sniper_build_anchor_authority_payload( array $anchors, $updated_at = null ) {
	$components = sniper_anchor_contract_components( $anchors );
	$legs = [];
	foreach ( [ 'f3', 'f2', 'f1' ] as $leg ) {
		if ( ! empty( $components[ $leg ]['valid'] ) ) {
			$legs[] = [
				'high' => (float) $components[ $leg ]['fibHigh'],
				'low'  => (float) $components[ $leg ]['fibLow'],
			];
		}
	}
	if ( empty( $legs ) ) {
		return null;
	}
	return [
		'fibHigh'    => array_sum( array_column( $legs, 'high' ) ) / count( $legs ),
		'fibLow'     => array_sum( array_column( $legs, 'low' ) ) / count( $legs ),
		'source'     => 'local_fib_composite',
		'authority_equivalent' => false,
		'bull'       => null,
		'updated_at' => $updated_at,
		'components' => $components,
	];
}

function sniper_logging_enabled() {
	return (bool) get_option( 'sniper_debug_logging', false );
}

function sniper_log_event( $message, array $context = [] ) {
	if ( ! sniper_logging_enabled() ) {
		return;
	}

	$payload = $context ? ' ' . wp_json_encode( $context ) : '';
	error_log( '[sniper-webhook] ' . $message . $payload );
}

function sniper_resolve_bar_duration_seconds( array $body ) {
	// candle_interval takes highest priority (explicit Pine signal header).
	$candle_interval_map = [
		'1h' => 3600, '4h' => 14400,
		'1day' => 86400, '1d' => 86400,
		'1week' => 604800, '1w' => 604800,
	];
	// Raw Pine timeframe string (e.g. "60", "D") as secondary fallback.
	$bar_duration_map = [ '1' => 60, '5' => 300, '15' => 900, '60' => 3600, '240' => 14400, 'D' => 86400 ];
	// Semantic fib-timeframe as final fallback (maps to the typical execution candle interval).
	$fib_tf_duration_map = [ 'DAILY' => 3600, 'WEEKLY' => 14400, 'MONTHLY' => 86400, 'YEARLY' => 604800 ];

	$ci = isset( $body['candle_interval'] ) ? strtolower( trim( (string) $body['candle_interval'] ) ) : null;
	$tf = isset( $body['timeframe'] )       ? sanitize_text_field( (string) $body['timeframe'] )      : null;
	$ft = isset( $body['fib_timeframe'] )   ? strtoupper( trim( (string) $body['fib_timeframe'] ) )   : null;

	if ( $ci && isset( $candle_interval_map[ $ci ] ) ) {
		return $candle_interval_map[ $ci ];
	}
	if ( $tf && isset( $bar_duration_map[ $tf ] ) ) {
		return $bar_duration_map[ $tf ];
	}
	if ( $ft && isset( $fib_tf_duration_map[ $ft ] ) ) {
		return $fib_tf_duration_map[ $ft ];
	}
	return 14400; // safe default = 4h (WEEKLY profile)
}

function sniper_is_supported_signal_schema_version( $version ) {
	$version = trim( (string) $version );
	return '1.0' === $version || preg_match( '/^12\.\d+\.\d+(?:\.\d+)?$/', $version );
}

function sniper_reject_stale_payload_response( array $body, $pair_for_log = 'unknown', $max_allowed_delta = null ) {
	$bar_duration = sniper_resolve_bar_duration_seconds( $body );
	$allowed_delta = $bar_duration * 2 + 30;
	if ( null !== $max_allowed_delta ) {
		$allowed_delta = min( $allowed_delta, (int) $max_allowed_delta );
	}
	$parsed_timestamp = sniper_parse_payload_timestamp_seconds( $body['timestamp'] ?? ( $body['time'] ?? null ) );
	$payload_age = null !== $parsed_timestamp ? time() - $parsed_timestamp : 0;

	if ( $payload_age > $allowed_delta ) {
		if ( sniper_logging_enabled() ) {
			error_log( '[SMC-REJECT] ' . sanitize_text_field( (string) $pair_for_log ) . ' stale_payload age=' . $payload_age . ' ' . time() );
		}
		return new WP_REST_Response( [ 'rejected' => true, 'reason' => 'stale_payload', 'age_seconds' => $payload_age ], 422 );
	}

	return null;
}

function sniper_extract_structure( array $body ) {
	$src = isset( $body['structure'] ) && is_array( $body['structure'] ) ? $body['structure'] : [];
	return [
		'major_bos'      => sniper_boolish( $src['major_bos'] ?? false ),
		'internal_shift' => sniper_boolish( $src['internal_shift'] ?? false ),
		'choch'          => sniper_boolish( $src['choch'] ?? false ),
		'htf_bias'       => isset( $src['htf_bias'] ) ? sanitize_text_field( $src['htf_bias'] ) : null,
		'session_tag'    => isset( $src['session_tag'] ) ? sanitize_text_field( $src['session_tag'] ) : null,
	];
}

function sniper_extract_liquidity( array $body ) {
	$src = isset( $body['liquidity'] ) && is_array( $body['liquidity'] ) ? $body['liquidity'] : [];
	return [
		'type'  => isset( $src['type'] ) ? sanitize_text_field( $src['type'] ) : null,
		'price' => sniper_float_or_null( $src['price'] ?? null ),
		'eqh'   => sniper_boolish( $src['eqh'] ?? false ),
		'eql'   => sniper_boolish( $src['eql'] ?? false ),
	];
}

function sniper_extract_poi( array $body ) {
	$src = isset( $body['poi'] ) && is_array( $body['poi'] ) ? $body['poi'] : [];
	return [
		'type'             => isset( $src['type'] ) ? sanitize_text_field( $src['type'] ) : null,
		'high'             => sniper_float_or_null( $src['high'] ?? null ),
		'low'              => sniper_float_or_null( $src['low'] ?? null ),
		'freshness_bars'   => isset( $src['freshness_bars'] ) ? intval( $src['freshness_bars'] ) : null,
		'has_adjacent_fvg' => sniper_boolish( $src['has_adjacent_fvg'] ?? false ),
	];
}

function sniper_extract_chop( array $body ) {
	$src = isset( $body['chop'] ) && is_array( $body['chop'] ) ? $body['chop'] : [];
	return [
		'active' => sniper_boolish( $src['active'] ?? false ),
		'low'    => sniper_float_or_null( $src['low'] ?? null ),
		'high'   => sniper_float_or_null( $src['high'] ?? null ),
		'source' => sniper_string_or_null( $src['source'] ?? null ),
	];
}

function sniper_extract_rank_meta( array $body, $rr_estimate = null ) {
	$setup_quality     = isset( $body['setup_quality'] ) ? intval( $body['setup_quality'] ) : null;
	$execution_quality = isset( $body['execution_quality'] ) ? intval( $body['execution_quality'] ) : null;
	$rank_score        = isset( $body['rank_score'] ) ? intval( $body['rank_score'] ) : null;

	if ( null === $rank_score && null !== $setup_quality && null !== $execution_quality ) {
		$rank_score = intval( round( $setup_quality * 0.7 + $execution_quality * 0.3 ) );
	}

	return [
		'setup_class'       => isset( $body['setup_class'] ) ? sanitize_text_field( $body['setup_class'] ) : null,
		'blocked_reason'    => isset( $body['blocked_reason'] ) ? sanitize_text_field( $body['blocked_reason'] ) : null,
		'setup_quality'     => $setup_quality,
		'execution_quality' => $execution_quality,
		'rank_score'        => $rank_score,
		'rr_estimate'       => sniper_float_or_null( $rr_estimate ),
	];
}

function sniper_compute_rr_estimate( array $entries, $sl, $tp ) {
	if ( empty( $entries ) || ! is_numeric( $sl ) || ! is_numeric( $tp ) ) {
		return null;
	}
	$entry = isset( $entries[0]['price'] ) ? floatval( $entries[0]['price'] ) : null;
	if ( ! is_numeric( $entry ) ) return null;
	$sl_dist = abs( $entry - floatval( $sl ) );
	$tp_dist = abs( $entry - floatval( $tp ) );
	return $sl_dist > 0 ? round( $tp_dist / $sl_dist, 2 ) : null;
}

// ── USER DATA HELPERS ────────────────────────────────────────────────────────

function sniper_get_user_meta_value( $user_id, $key, $default = null ) {
	$value = get_user_meta( $user_id, $key, true );
	return ( '' === $value || null === $value ) ? $default : $value;
}

function sniper_update_user_meta_value( $user_id, $key, $value ) {
	update_user_meta( $user_id, $key, $value );
}

// ── INSTRUMENT SPEC REGISTRY ─────────────────────────────────────────────────
// Single source of truth for pip sizes, contract sizes, and quote currencies.
// Both the REST /instrument-specs endpoint and the execution engine read here.
//
// pip_value_usd per pip per 1.0 standard lot:
//   USD-quoted : contract_size × pip_size                     (constant)
//   JPY-quoted : (contract_size × pip_size) / USDJPY_rate    (rate-dependent)
//   Other quote: (contract_size × pip_size) × quote_USD_rate (rate-dependent)
//
// user_overrideable=true instruments have sensible defaults but brokers vary —
// users can override contract_size/pip_size via instrument_overrides in their
// risk profile to match their specific broker's contract specification.

function sniper_instrument_specs() {
	static $specs = null;
	if ( null !== $specs ) return $specs;
	$specs = [
		// ── FOREX — USD quoted ───────────────────────────────────────────────
		'GBPUSD' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'USD', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'AUDUSD' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'USD', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'EURUSD' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'USD', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'NZDUSD' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'USD', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		// ── FOREX — JPY quoted ───────────────────────────────────────────────
		'USDJPY' => [ 'type' => 'forex', 'pip_size' => 0.01,   'contract_size' => 100000, 'quote' => 'JPY', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'AUDJPY' => [ 'type' => 'forex', 'pip_size' => 0.01,   'contract_size' => 100000, 'quote' => 'JPY', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'EURJPY' => [ 'type' => 'forex', 'pip_size' => 0.01,   'contract_size' => 100000, 'quote' => 'JPY', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'GBPJPY' => [ 'type' => 'forex', 'pip_size' => 0.01,   'contract_size' => 100000, 'quote' => 'JPY', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'NZDJPY' => [ 'type' => 'forex', 'pip_size' => 0.01,   'contract_size' => 100000, 'quote' => 'JPY', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'CADJPY' => [ 'type' => 'forex', 'pip_size' => 0.01,   'contract_size' => 100000, 'quote' => 'JPY', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'CHFJPY' => [ 'type' => 'forex', 'pip_size' => 0.01,   'contract_size' => 100000, 'quote' => 'JPY', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		// ── FOREX — USD-base, non-USD quote ─────────────────────────────────
		'USDCAD' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'CAD', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'USDCHF' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'CHF', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		// ── FOREX — cross pairs ──────────────────────────────────────────────
		'EURGBP' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'GBP', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'EURAUD' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'AUD', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'EURNZD' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'NZD', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'EURCHF' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'CHF', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'EURCAD' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'CAD', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'GBPAUD' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'AUD', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'GBPNZD' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'NZD', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'GBPCAD' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'CAD', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'GBPCHF' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'CHF', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'AUDNZD' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'NZD', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'AUDCAD' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'CAD', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'AUDCHF' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'CHF', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'NZDCAD' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'CAD', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'NZDCHF' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'CHF', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		'CADCHF' => [ 'type' => 'forex', 'pip_size' => 0.0001, 'contract_size' => 100000, 'quote' => 'CHF', 'min_stop_pips' => 20, 'user_overrideable' => false ],
		// ── METALS (MT4/MT5 standard contract sizes) ─────────────────────────
		// XAU/USD: 100 troy oz/lot, pip=$0.01 → pip_value_usd = 100×0.01 = $1/pip/lot
		'XAUUSD' => [ 'type' => 'metal',  'pip_size' => 0.01,  'contract_size' => 100,  'quote' => 'USD', 'min_stop_pips' => 50, 'user_overrideable' => false ],
		// XAG/USD: 5000 troy oz/lot, pip=$0.001 → pip_value_usd = 5000×0.001 = $5/pip/lot
		'XAGUSD' => [ 'type' => 'metal',  'pip_size' => 0.001, 'contract_size' => 5000, 'quote' => 'USD', 'min_stop_pips' => 50, 'user_overrideable' => false ],
		// ── INDICES — user_overrideable (broker contract sizes vary widely) ───
		// Default: 1 contract = $1/point — most common retail CFD convention.
		'US30'   => [ 'type' => 'index',  'pip_size' => 1.0,   'contract_size' => 1, 'quote' => 'USD', 'min_stop_pips' => 30, 'user_overrideable' => true ],
		'NAS100' => [ 'type' => 'index',  'pip_size' => 1.0,   'contract_size' => 1, 'quote' => 'USD', 'min_stop_pips' => 30, 'user_overrideable' => true ],
		// ── CRYPTO — user_overrideable (broker contract sizes vary) ──────────
		// Default: 1 coin/lot, $1/point — most common retail CFD convention.
		'BTCUSD' => [ 'type' => 'crypto', 'pip_size' => 1.0,   'contract_size' => 1, 'quote' => 'USD', 'min_stop_pips' => 50, 'user_overrideable' => true ],
		'ETHUSD' => [ 'type' => 'crypto', 'pip_size' => 1.0,   'contract_size' => 1, 'quote' => 'USD', 'min_stop_pips' => 50, 'user_overrideable' => true ],
	];
	return $specs;
}

/** Slashed display symbols derived from the instrument spec registry. */
function sniper_supported_watchlist_symbols() {
	$result = [];
	foreach ( array_keys( sniper_instrument_specs() ) as $key ) {
		if ( strlen( $key ) === 6 && preg_match( '/^[A-Z]{6}$/', $key ) ) {
			$result[] = substr( $key, 0, 3 ) . '/' . substr( $key, 3, 3 );
		} else {
			$result[] = $key;
		}
	}
	return $result;
}

/** GET /instrument-specs — public, no auth required. */
function sniper_get_instrument_specs_route( WP_REST_Request $request ) {
	return new WP_REST_Response( sniper_instrument_specs(), 200 );
}

/** Standard response envelope used by all /user/* endpoints. */
function sniper_user_payload_response( $bucket, array $payload ) {
	$user = wp_get_current_user();
	return new WP_REST_Response( [
		'bucket'        => $bucket,
		'authenticated' => true,
		'user_id'       => $user instanceof WP_User ? intval( $user->ID ) : 0,
		'saved_at'      => current_time( 'c' ),
		'data'          => $payload,
	], 200 );
}


function sniper_watchlist_defaults() {
	return [ 'GBP/USD', 'AUD/USD', 'USD/JPY', 'AUD/JPY', 'EUR/USD' ];
}

function sniper_watchlist_symbol_key( $symbol ) {
	return strtoupper( preg_replace( '/[^A-Z0-9]/', '', (string) $symbol ) );
}

function sniper_watchlist_normalize_symbol( $raw ) {
	$value = strtoupper( trim( (string) $raw ) );
	if ( '' === $value ) {
		return '';
	}
	if ( strpos( $value, ':' ) !== false ) {
		$parts = explode( ':', $value );
		$value = end( $parts );
	}
	$value = preg_replace( '/[^A-Z0-9\/]/', '', $value );
	if ( '' === $value ) {
		return '';
	}
	$compact = preg_replace( '/[^A-Z0-9]/', '', $value );
	if ( 6 === strlen( $compact ) && preg_match( '/^[A-Z]{6}$/', $compact ) ) {
		return substr( $compact, 0, 3 ) . '/' . substr( $compact, 3, 3 );
	}
	return $compact;
}

function sniper_watchlist_is_supported_symbol( $symbol ) {
	$needle = sniper_watchlist_symbol_key( sniper_watchlist_normalize_symbol( $symbol ) );
	if ( '' === $needle ) {
		return false;
	}
	foreach ( sniper_supported_watchlist_symbols() as $candidate ) {
		if ( sniper_watchlist_symbol_key( $candidate ) === $needle ) {
			return true;
		}
	}
	return false;
}

function sniper_watchlist_sanitize_list( $symbols ) {
	$clean = [];
	$seen  = [];
	if ( ! is_array( $symbols ) ) {
		$symbols = [];
	}
	foreach ( $symbols as $symbol ) {
		$normalized = sniper_watchlist_normalize_symbol( $symbol );
		if ( '' === $normalized || ! sniper_watchlist_is_supported_symbol( $normalized ) ) {
			continue;
		}
		$key = sniper_watchlist_symbol_key( $normalized );
		if ( isset( $seen[ $key ] ) ) {
			continue;
		}
		$seen[ $key ] = true;
		$clean[]      = $normalized;
	}
	return $clean;
}

function sniper_get_user_watchlist( $user_id ) {
	$user_id = intval( $user_id );
	if ( $user_id <= 0 ) {
		return sniper_watchlist_defaults();
	}

	$has_watchlist_meta = metadata_exists( 'user', $user_id, 'sn_watchlist' );
	$current            = get_user_meta( $user_id, 'sn_watchlist', true );

	// Seed exactly once for first-time users who have no saved record at all.
	if ( ! $has_watchlist_meta ) {
		$seed = sniper_watchlist_sanitize_list( sniper_watchlist_defaults() );
		update_user_meta( $user_id, 'sn_watchlist', $seed );
		return $seed;
	}

	// Existing saved record of [] is valid and must remain empty.
	if ( is_array( $current ) && empty( $current ) ) {
		return [];
	}

	$clean = sniper_watchlist_sanitize_list( is_array( $current ) ? $current : [] );
	if ( $clean !== $current ) {
		update_user_meta( $user_id, 'sn_watchlist', $clean );
	}
	return $clean;
}

function sniper_save_user_watchlist( $user_id, array $symbols ) {
	$user_id = intval( $user_id );
	if ( $user_id <= 0 ) {
		return [];
	}
	$clean = sniper_watchlist_sanitize_list( $symbols );
	update_user_meta( $user_id, 'sn_watchlist', $clean );
	return $clean;
}


function sniper_watchlist_authorized_symbol( $symbol, array $watchlist_keys ) {
	$normalized = sniper_watchlist_normalize_symbol( $symbol );
	$key        = sniper_watchlist_symbol_key( $normalized );
	if ( '' !== $key && isset( $watchlist_keys[ $key ] ) ) {
		return true;
	}

	$candidates = [];
	if ( '' !== $key ) {
		$candidates[] = $key;
	}
	if ( preg_match( '/^[A-Z]+:[A-Z0-9]+$/', strtoupper( trim( (string) $symbol ) ) ) ) {
		$parts = explode( ':', strtoupper( trim( (string) $symbol ) ) );
		$candidates[] = sniper_watchlist_symbol_key( end( $parts ) );
	}

	$alias_map = [
		'BTCUSDT' => 'BTCUSD',
		'ETHUSDT' => 'ETHUSD',
		'US30USD' => 'US30',
		'NDX'     => 'NAS100',
	];

	foreach ( $candidates as $candidate ) {
		if ( isset( $alias_map[ $candidate ] ) && isset( $watchlist_keys[ $alias_map[ $candidate ] ] ) ) {
			return true;
		}
	}

	return false;
}

function sniper_user_watchlist_key_map( $user_id ) {
	$map = [];
	foreach ( sniper_get_user_watchlist( $user_id ) as $symbol ) {
		$map[ sniper_watchlist_symbol_key( $symbol ) ] = true;
	}
	return $map;
}

function sniper_array_filter_by_watchlist_keys( array $input, array $watchlist_keys ) {
	$filtered = [];
	foreach ( $input as $key => $value ) {
		if ( isset( $watchlist_keys[ sniper_watchlist_symbol_key( $key ) ] ) ) {
			$filtered[ $key ] = $value;
		}
	}
	return $filtered;
}

function sniper_get_user_watchlist_route( WP_REST_Request $request ) {
	$user_id   = get_current_user_id();
	$watchlist = sniper_get_user_watchlist( $user_id );
	return sniper_user_payload_response( 'watchlist', [
		'watchlist'         => $watchlist,
		'supported_symbols' => sniper_supported_watchlist_symbols(),
	] );
}

function sniper_save_user_watchlist_route( WP_REST_Request $request ) {
	$user_id   = get_current_user_id();
	$body      = $request->get_json_params() ?: [];
	$symbols   = isset( $body['watchlist'] ) && is_array( $body['watchlist'] ) ? $body['watchlist'] : [];
	$watchlist = sniper_save_user_watchlist( $user_id, $symbols );
	return sniper_user_payload_response( 'watchlist', [ 'watchlist' => $watchlist ] );
}

function sniper_add_watchlist_symbol_route( WP_REST_Request $request ) {
	$user_id = get_current_user_id();
	$body    = $request->get_json_params() ?: [];
	$symbol  = sniper_watchlist_normalize_symbol( $body['symbol'] ?? '' );
	if ( '' === $symbol || ! sniper_watchlist_is_supported_symbol( $symbol ) ) {
		return new WP_REST_Response( [ 'error' => 'Unsupported symbol' ], 400 );
	}
	$watchlist = sniper_get_user_watchlist( $user_id );
	$keys      = sniper_user_watchlist_key_map( $user_id );
	$key       = sniper_watchlist_symbol_key( $symbol );
	if ( ! isset( $keys[ $key ] ) ) {
		$watchlist[] = $symbol;
		$watchlist   = sniper_save_user_watchlist( $user_id, $watchlist );
	}
	return sniper_user_payload_response( 'watchlist', [ 'watchlist' => $watchlist ] );
}

function sniper_remove_watchlist_symbol_route( WP_REST_Request $request ) {
	$user_id = get_current_user_id();
	$body    = $request->get_json_params() ?: [];
	$symbol  = sniper_watchlist_normalize_symbol( $body['symbol'] ?? '' );
	if ( '' === $symbol ) {
		return new WP_REST_Response( [ 'error' => 'Missing symbol' ], 400 );
	}
	$remove_key = sniper_watchlist_symbol_key( $symbol );
	$current    = sniper_get_user_watchlist( $user_id );
	$next       = array_values( array_filter( $current, function( $item ) use ( $remove_key ) {
		return sniper_watchlist_symbol_key( $item ) !== $remove_key;
	} ) );
	$watchlist = sniper_save_user_watchlist( $user_id, $next );
	return sniper_user_payload_response( 'watchlist', [ 'watchlist' => $watchlist ] );
}

// ── REST API REGISTRATION ────────────────────────────────────────────────────

add_action( 'rest_api_init', function () {

	// ── Instrument specs — public, no auth ───────────────────────────────────

	register_rest_route( 'sniper/v1', '/instrument-specs', [
		'methods'             => 'GET',
		'callback'            => 'sniper_get_instrument_specs_route',
		'permission_callback' => '__return_true',
	] );

	// ── Public signal ingestion endpoints ────────────────────────────────────

	register_rest_route( 'sniper/v1', '/regime', [
		'methods'             => 'POST',
		'callback'            => 'sniper_receive_regime',
		'permission_callback' => 'sniper_validate_secret',
	] );

	register_rest_route( 'sniper/v1', '/tv-alert', [
		'methods'             => 'POST',
		'callback'            => 'sniper_receive_tv_alert',
		'permission_callback' => 'sniper_validate_secret',
	] );

	register_rest_route( 'sniper/v1', '/regimes', [
		'methods'             => 'GET',
		'callback'            => 'sniper_get_regimes',
		'permission_callback' => 'sniper_require_logged_in',
	] );

	register_rest_route( 'sniper/v1', '/signal', [
		'methods'             => 'POST',
		'callback'            => 'sniper_handle_signal',
		'permission_callback' => 'sniper_validate_secret',
	] );

	register_rest_route( 'sniper/v1', '/snapshot', [
		[
			'methods'             => 'GET',
			'callback'            => 'sniper_get_snapshot',
			'permission_callback' => 'sniper_require_logged_in',
		],
		[
			'methods'             => 'POST',
			'callback'            => 'sniper_receive_snapshot',
			'permission_callback' => 'sniper_validate_secret',
		],
	] );

	register_rest_route( 'sniper/v1', '/live-signals', [
		'methods'             => 'GET',
		'callback'            => 'sniper_get_live_signals',
		'permission_callback' => 'sniper_require_logged_in',
	] );

	register_rest_route( 'sniper/v1', '/ladders', [
		'methods'             => 'GET',
		'callback'            => 'sniper_get_ladders',
		'permission_callback' => 'sniper_require_logged_in',
	] );

	register_rest_route( 'sniper/v1', '/session', [
		'methods'             => 'GET',
		'callback'            => 'sniper_session_check',
		'permission_callback' => '__return_true',
	] );

	// ── Engine batch (JS signal engine → backend) ─────────────────────────────

	register_rest_route( 'sniper/v1', '/engine-batch', [
		'methods'             => 'POST',
		'callback'            => 'sniper_receive_engine_batch',
		'permission_callback' => 'sniper_validate_engine_secret',
	] );

	// ── Price feed (future cron automation) ──────────────────────────────────

	register_rest_route( 'sniper/v1', '/prices', [
		'methods'             => 'POST',
		'callback'            => 'sniper_receive_prices',
		'permission_callback' => 'sniper_validate_engine_secret',
	] );

	// ── Authenticated user data endpoints ─────────────────────────────────────

	register_rest_route( 'sniper/v1', '/user/trades', [
		[ 'methods' => 'GET',  'callback' => 'sniper_get_user_trades',  'permission_callback' => 'sniper_require_logged_in' ],
		[ 'methods' => 'POST', 'callback' => 'sniper_save_user_trades', 'permission_callback' => 'sniper_require_logged_in' ],
	] );

	register_rest_route( 'sniper/v1', '/user/account', [
		[ 'methods' => 'GET',  'callback' => 'sniper_get_user_account',  'permission_callback' => 'sniper_require_logged_in' ],
		[ 'methods' => 'POST', 'callback' => 'sniper_save_user_account', 'permission_callback' => 'sniper_require_logged_in' ],
	] );

	register_rest_route( 'sniper/v1', '/user/settings', [
		[ 'methods' => 'GET',  'callback' => 'sniper_get_user_settings',  'permission_callback' => 'sniper_require_logged_in' ],
		[ 'methods' => 'POST', 'callback' => 'sniper_save_user_settings', 'permission_callback' => 'sniper_require_logged_in' ],
	] );

	register_rest_route( 'sniper/v1', '/user/watchlist', [
		[ 'methods' => 'GET',  'callback' => 'sniper_get_user_watchlist_route',  'permission_callback' => 'sniper_require_logged_in' ],
		[ 'methods' => 'POST', 'callback' => 'sniper_save_user_watchlist_route', 'permission_callback' => 'sniper_require_logged_in' ],
	] );

	register_rest_route( 'sniper/v1', '/user/watchlist/add', [
		'methods'             => 'POST',
		'callback'            => 'sniper_add_watchlist_symbol_route',
		'permission_callback' => 'sniper_require_logged_in',
	] );

	register_rest_route( 'sniper/v1', '/user/watchlist/remove', [
		'methods'             => 'POST',
		'callback'            => 'sniper_remove_watchlist_symbol_route',
		'permission_callback' => 'sniper_require_logged_in',
	] );

	// Execution engine endpoints — callbacks defined in sniper-execution-engine.php
	register_rest_route( 'sniper/v1', '/user/risk-profile', [
		[ 'methods' => 'GET',  'callback' => 'sniper_exe_get_risk_profile',  'permission_callback' => 'sniper_require_logged_in' ],
		[ 'methods' => 'POST', 'callback' => 'sniper_exe_save_risk_profile', 'permission_callback' => 'sniper_require_logged_in' ],
	] );

	register_rest_route( 'sniper/v1', '/user/trade-queue', [
		[ 'methods' => 'GET',  'callback' => 'sniper_exe_get_trade_queue',  'permission_callback' => 'sniper_require_logged_in' ],
		[ 'methods' => 'POST', 'callback' => 'sniper_exe_save_trade_queue', 'permission_callback' => 'sniper_require_logged_in' ],
	] );

	register_rest_route( 'sniper/v1', '/user/execute-signals', [
		'methods'             => 'POST',
		'callback'            => 'sniper_exe_execute_signals',
		'permission_callback' => 'sniper_require_logged_in',
	] );

	register_rest_route( 'sniper/v1', '/user/engine-batch', [
		'methods'             => 'POST',
		'callback'            => 'sniper_receive_engine_batch',
		'permission_callback' => 'sniper_require_logged_in',
	] );

	register_rest_route( 'sniper/v1', '/user/market-data', [
		'methods'             => 'GET',
		'callback'            => 'sniper_get_market_data',
		'permission_callback' => 'sniper_require_logged_in',
	] );

} );

// ── WEBHOOK REQUEST DEDUPE ───────────────────────────────────────────────────

function sniper_webhook_dedupe_ttl_seconds() {
	return 120;
}

function sniper_build_webhook_dedupe_key( WP_REST_Request $request, $scope ) {
	$raw_body = (string) $request->get_body();
	if ( '' === $raw_body ) {
		$raw_body = wp_json_encode( $request->get_json_params() ?: [] );
	}
	return hash( 'sha256', sanitize_key( (string) $scope ) . '|' . $raw_body );
}

function sniper_is_duplicate_webhook_request( $dedupe_key ) {
	$cache      = get_option( 'sniper_webhook_dedupe_cache', [] );
	$cache      = is_array( $cache ) ? $cache : [];
	$now        = time();
	$was_pruned = false;

	foreach ( $cache as $key => $expires_at ) {
		if ( ! is_numeric( $expires_at ) || intval( $expires_at ) <= $now ) {
			unset( $cache[ $key ] );
			$was_pruned = true;
		}
	}

	if ( $was_pruned ) {
		update_option( 'sniper_webhook_dedupe_cache', $cache, false );
	}

	return ! empty( $cache[ $dedupe_key ] );
}

function sniper_mark_webhook_request_processed( $dedupe_key ) {
	$cache = get_option( 'sniper_webhook_dedupe_cache', [] );
	$cache = is_array( $cache ) ? $cache : [];
	$cache[ $dedupe_key ] = time() + sniper_webhook_dedupe_ttl_seconds();
	update_option( 'sniper_webhook_dedupe_cache', $cache, false );
}

function sniper_should_persist_webhook_dedupe( WP_HTTP_Response $response ) {
	$status = method_exists( $response, 'get_status' ) ? intval( $response->get_status() ) : 200;
	if ( $status < 200 || $status >= 300 ) {
		return false;
	}

	$payload = method_exists( $response, 'get_data' ) ? $response->get_data() : null;
	if ( is_array( $payload ) ) {
		$warning = trim( (string) ( $payload['warning'] ?? '' ) );
		if ( '' !== $warning ) {
			return false;
		}
	}

	return true;
}

function sniper_run_deduped_webhook_handler( WP_REST_Request $request, $scope, $handler ) {
	$dedupe_key = sniper_build_webhook_dedupe_key( $request, $scope );
	if ( sniper_is_duplicate_webhook_request( $dedupe_key ) ) {
		return new WP_REST_Response( [
			'status' => 'duplicate_ignored',
		], 200 );
	}

	$response = call_user_func( $handler, $request );
	if ( is_wp_error( $response ) ) {
		return $response;
	}

	$normalized = rest_ensure_response( $response );
	if ( sniper_should_persist_webhook_dedupe( $normalized ) ) {
		sniper_mark_webhook_request_processed( $dedupe_key );
	}

	return $response;
}

// ── REGIME ENDPOINTS ─────────────────────────────────────────────────────────

function sniper_receive_regime( WP_REST_Request $request ) {
	return sniper_run_deduped_webhook_handler( $request, 'regime', 'sniper_receive_regime_core' );
}

function sniper_receive_regime_core( WP_REST_Request $request ) {
	$body = $request->get_json_params();
	$body = is_array( $body ) ? sniper_normalize_field_aliases( $body ) : $body;
	if ( empty( $body ) ) {
		return new WP_REST_Response( [ 'error' => 'Empty payload' ], 400 );
	}
	if ( ! empty( $body['signal_type'] ) ) {
		sniper_log_event( 'Rejected regime payload with signal_type', [
			'signal_type' => $body['signal_type'],
			'pair'        => $body['pair'] ?? null,
		] );
		return new WP_REST_Response( [ 'error' => 'Route mismatch: send signal_type payloads to /signal' ], 400 );
	}

	$instrument = sniper_normalise_instrument( $body );
	if ( empty( $instrument['instrument_id'] ) ) {
		return new WP_REST_Response( [ 'error' => 'Missing instrument_id' ], 400 );
	}
	$stale_response = sniper_reject_stale_payload_response( $body, $instrument['pair'] ?: $instrument['instrument_id'] );
	if ( $stale_response ) {
		return $stale_response;
	}

	$regime = strtoupper( trim( (string) ( $body['regime'] ?? '' ) ) );
	if ( ! in_array( $regime, SNIPER_VALID_REGIMES, true ) ) {
		return new WP_REST_Response( [ 'error' => 'Invalid regime: ' . $regime ], 400 );
	}

	$sequence_status = sniper_normalize_sequence_status( $body['sequence_status'] ?? null );
	$session_tf      = sniper_string_or_null( $body['session_tf'] ?? null );
	$zone_price      = sniper_float_or_null( $body['entry_zone_price'] ?? null );
	$anchors         = sniper_normalize_payload_anchor_contract( $body );
	$anchor_scalars  = sniper_anchor_contract_scalar_fields( $anchors );
	$f1_high         = $anchor_scalars['f1_high'];
	$f1_low          = $anchor_scalars['f1_low'];
	$f2_high         = $anchor_scalars['f2_high'];
	$f2_low          = $anchor_scalars['f2_low'];
	$f3_high         = $anchor_scalars['f3_high'];
	$f3_low          = $anchor_scalars['f3_low'];
	$chop            = sniper_extract_chop( $body );
	$signal_state    = sniper_derive_signal_state( $body['signal_state'] ?? null, $sequence_status, $chop );
	$blocked_reason  = sniper_string_or_null( $body['blocked_reason'] ?? null );
	if ( empty( $blocked_reason ) && ! empty( $chop['active'] ) ) {
		$blocked_reason = 'CHOP_BLOCK';
	}

	// Persist to regimes option store
	if ( ! empty( $instrument['pair'] ) ) {
		$regimes                        = get_option( 'sniper_regimes', [] );
		$regimes[ $instrument['pair'] ] = $regime;
		update_option( 'sniper_regimes', $regimes );

		$meta                          = get_option( 'sniper_regimes_meta', [] );
		$meta[ $instrument['pair'] ]   = [
			'updated_at'      => current_time( 'c' ),
			'price'           => isset( $body['price'] ) ? floatval( $body['price'] ) : null,
			'timeframe'       => isset( $body['timeframe'] ) ? sanitize_text_field( $body['timeframe'] ) : null,
			'tv_time'         => isset( $body['timestamp'] ) ? sanitize_text_field( $body['timestamp'] )
			                     : ( isset( $body['time'] ) ? sanitize_text_field( $body['time'] ) : null ),
			'source'          => isset( $body['source'] ) ? sanitize_text_field( $body['source'] ) : 'dynamic_store',
			'sequence_status' => $sequence_status,
			'instrument_id'   => $instrument['instrument_id'],
			'display_symbol'  => $instrument['display'],
			'session_tf'      => $session_tf,
			'zone_price'      => $zone_price,
			'f1_high'         => $f1_high,
			'f1_low'          => $f1_low,
			'f2_high'         => $f2_high,
			'f2_low'          => $f2_low,
			'f3_high'         => $f3_high,
			'f3_low'          => $f3_low,
			'anchors'         => ! empty( $anchors ) ? $anchors : null,
			'chop'            => $chop,
		];
		update_option( 'sniper_regimes_meta', $meta );
	}

	sniper_upsert_live_signal( $instrument, [
		'last_signal_type' => 'REGIME',
		'last_signal_at'   => current_time( 'c' ),
		'regime'           => $regime,
		'sequence_status'  => $sequence_status,
		'signal_state'     => $signal_state,
		'blocked_reason'   => $blocked_reason,
		'market_price'     => isset( $body['price'] ) ? floatval( $body['price'] ) : null,
		'zone_price'       => $zone_price,
		'entry_zone_price' => $zone_price,
		'session_tf'       => $session_tf,
		'f1_high'          => $f1_high,
		'f1_low'           => $f1_low,
		'f2_high'          => $f2_high,
		'f2_low'           => $f2_low,
		'f3_high'          => $f3_high,
		'f3_low'           => $f3_low,
		'anchors'          => ! empty( $anchors ) ? $anchors : null,
		'structure'        => sniper_extract_structure( $body ),
		'liquidity'        => sniper_extract_liquidity( $body ),
		'chop'             => $chop,
	] );

	return new WP_REST_Response( [
		'status'        => 'ok',
		'instrument_id' => $instrument['instrument_id'],
		'pair'          => $instrument['pair'],
		'regime'        => $regime,
	], 200 );
}

function sniper_get_regimes( WP_REST_Request $request ) {
	if ( sniper_logging_enabled() ) {
		error_log( '[ANCHOR_TRACE:BACKEND_ACTIVE] backend_diag_v2' );
	}

	$raw = get_option( 'sniper_regimes', [] );
	$now_ts = time();
	$meta_ttl = 24 * HOUR_IN_SECONDS;

	// Normalise keys
	$clean = [];
	foreach ( $raw as $key => $value ) {
		$normalized = sniper_normalise_pair( $key );
		if ( $normalized ) {
			$clean[ $normalized ] = strtoupper( sanitize_text_field( $value ) );
		}
	}
	update_option( 'sniper_regimes', $clean );

	$meta       = get_option( 'sniper_regimes_meta', [] );
	$meta_clean = [];
	$sequence   = [];
	$latest_meta_updated_at = null;
	foreach ( $meta as $key => $value ) {
		$normalized = sniper_normalise_pair( $key );
		if ( ! $normalized || ! is_array( $value ) ) continue;
		$meta_candidate_ts = sniper_parse_iso_timestamp( $value['updated_at'] ?? null );
		if ( null !== $meta_candidate_ts && ( null === $latest_meta_updated_at || $meta_candidate_ts > $latest_meta_updated_at ) ) {
			$latest_meta_updated_at = $meta_candidate_ts;
		}
		$meta_updated_ts = sniper_parse_iso_timestamp( $value['updated_at'] ?? null );
		if ( null !== $meta_updated_ts && ( $now_ts - $meta_updated_ts ) > $meta_ttl ) continue;
		$meta_clean[ $normalized ] = [
			'updated_at'      => $value['updated_at'] ?? null,
			'price_updated_at'=> $value['price_updated_at'] ?? null,
			'price'           => isset( $value['price'] ) ? floatval( $value['price'] ) : null,
			'timeframe'       => $value['timeframe'] ?? null,
			'tv_time'         => $value['tv_time'] ?? null,
			'source'          => sniper_string_or_null( $value['source'] ?? null ) ?: 'dynamic_store',
			'sequence_status' => $value['sequence_status'] ?? null,
			'instrument_id'   => $value['instrument_id'] ?? null,
			'display_symbol'  => $value['display_symbol'] ?? null,
			'session_tf'      => $value['session_tf'] ?? null,
			'zone_price'      => isset( $value['zone_price'] ) ? floatval( $value['zone_price'] ) : null,
			'f3_high'         => isset( $value['f3_high'] ) ? floatval( $value['f3_high'] ) : null,
			'f3_low'          => isset( $value['f3_low'] )  ? floatval( $value['f3_low'] )  : null,
			'f2_high'         => isset( $value['f2_high'] ) ? floatval( $value['f2_high'] ) : null,
			'f2_low'          => isset( $value['f2_low'] )  ? floatval( $value['f2_low'] )  : null,
			'f1_high'         => isset( $value['f1_high'] ) ? floatval( $value['f1_high'] ) : null,
			'f1_low'          => isset( $value['f1_low'] )  ? floatval( $value['f1_low'] )  : null,
			'daily_high'      => isset( $value['daily_high'] ) ? floatval( $value['daily_high'] ) : null,
			'daily_low'       => isset( $value['daily_low'] )  ? floatval( $value['daily_low'] )  : null,
			'weekly_high'     => isset( $value['weekly_high'] ) ? floatval( $value['weekly_high'] ) : null,
			'weekly_low'      => isset( $value['weekly_low'] )  ? floatval( $value['weekly_low'] )  : null,
			'monthly_high'    => isset( $value['monthly_high'] ) ? floatval( $value['monthly_high'] ) : null,
			'monthly_low'     => isset( $value['monthly_low'] )  ? floatval( $value['monthly_low'] )  : null,
			'h4_high'         => isset( $value['h4_high'] ) ? floatval( $value['h4_high'] ) : null,
			'h4_low'          => isset( $value['h4_low'] )  ? floatval( $value['h4_low'] )  : null,
			'h1_high'         => isset( $value['h1_high'] ) ? floatval( $value['h1_high'] ) : null,
			'h1_low'          => isset( $value['h1_low'] )  ? floatval( $value['h1_low'] )  : null,
			'bias_profile'    => sniper_string_or_null( $value['bias_profile'] ?? null ),
			'structure'       => isset( $value['structure'] ) && is_array( $value['structure'] ) ? $value['structure'] : null,
			'htf_dol'         => isset( $value['htf_dol'] ) && is_array( $value['htf_dol'] ) ? $value['htf_dol'] : null,
			'matrix'          => isset( $value['matrix'] ) && is_array( $value['matrix'] ) ? $value['matrix'] : null,
			'matrix_tf'       => sniper_string_or_null( $value['matrix_tf'] ?? null ),
			'pd_array'        => isset( $value['pd_array'] ) && is_array( $value['pd_array'] ) ? $value['pd_array'] : null,
			'pd_tf'           => sniper_string_or_null( $value['pd_tf'] ?? null ),
			'final_bias'      => sniper_string_or_null( $value['final_bias'] ?? null ),
			'bull_bias_score' => sniper_float_or_null( $value['bull_bias_score'] ?? null ),
			'bear_bias_score' => sniper_float_or_null( $value['bear_bias_score'] ?? null ),
			'bull_pressure'   => sniper_float_or_null( $value['bull_pressure'] ?? null ),
			'bear_pressure'   => sniper_float_or_null( $value['bear_pressure'] ?? null ),
			'pressure_bias'   => sniper_string_or_null( $value['pressure_bias'] ?? null ),
			'fib_disagreement_penalty' => sniper_float_or_null( $value['fib_disagreement_penalty'] ?? null ),
			'chop_band'       => isset( $value['chop_band'] ) && is_array( $value['chop_band'] ) ? $value['chop_band'] : null,
			'gate'            => sniper_string_or_null( $value['gate'] ?? null ),
			'gate_reason'     => sniper_string_or_null( $value['gate_reason'] ?? null ),
			'anchors'         => isset( $value['anchors'] ) && is_array( $value['anchors'] ) ? $value['anchors'] : null,
			'levels'          => isset( $value['levels'] ) && is_array( $value['levels'] ) ? $value['levels'] : null,
			'blockers'        => isset( $value['blockers'] ) && is_array( $value['blockers'] ) ? $value['blockers'] : null,
			'chop'            => isset( $value['chop'] ) && is_array( $value['chop'] ) ? [
				'active' => sniper_boolish( $value['chop']['active'] ?? false ),
				'low'    => sniper_float_or_null( $value['chop']['low'] ?? null ),
				'high'   => sniper_float_or_null( $value['chop']['high'] ?? null ),
				'source' => sniper_string_or_null( $value['chop']['source'] ?? null ),
			] : null,
		];
		if ( ! empty( $meta_clean[ $normalized ]['sequence_status'] ) ) {
			$sequence[ $normalized ] = $meta_clean[ $normalized ]['sequence_status'];
		}
	}

	// EF levels
	$ef_store = get_option( 'sniper_ef_levels', [] );
	$ef_map   = [];
	foreach ( $ef_store as $key => $value ) {
		$normalized = sniper_normalise_pair( $key );
		if ( ! $normalized || ! is_array( $value ) ) continue;
		$ef_map[ $normalized ] = [
			'mode'       => $value['mode'] ?? null,
			'fibHigh'    => isset( $value['fibHigh'] ) ? floatval( $value['fibHigh'] ) : null,
			'fibLow'     => isset( $value['fibLow'] )  ? floatval( $value['fibLow'] )  : null,
			'lastUpdate' => $value['lastUpdate'] ?? null,
			'pretrigger' => isset( $value['pretrigger'] ) && is_array( $value['pretrigger'] ) ? $value['pretrigger'] : null,
		];
	}

	// SFL anchors derived from regime meta f3 data
	$sfl_anchors = [];
	foreach ( $meta_clean as $pair => $m ) {
		$has_anchors_field = isset( $m['anchors'] ) && is_array( $m['anchors'] );
		$normalized_anchors = sniper_normalize_anchor_contract(
			$has_anchors_field ? $m['anchors'] : [],
			[
				'f1_high' => $m['f1_high'] ?? null,
				'f1_low'  => $m['f1_low'] ?? null,
				'f2_high' => $m['f2_high'] ?? null,
				'f2_low'  => $m['f2_low'] ?? null,
				'f3_high' => $m['f3_high'] ?? null,
				'f3_low'  => $m['f3_low'] ?? null,
			]
		);
		$authority_payload = sniper_build_anchor_authority_payload( $normalized_anchors, $m['updated_at'] ?? null );
		$preferred_leg = isset( $normalized_anchors['f3'] ) ? $normalized_anchors['f3'] : null;
		$emission_mode = null;
		if ( is_array( $preferred_leg ) ) {
			$emission_mode = 'f3_preferred';
		} elseif ( is_array( $authority_payload ) ) {
			$preferred_leg = [
				'high' => $authority_payload['fibHigh'],
				'low'  => $authority_payload['fibLow'],
			];
			$emission_mode = 'authority_only';
		}
		$will_emit_sfl = is_array( $preferred_leg );

		if ( $will_emit_sfl ) {
			$source = sniper_string_or_null( $m['source'] ?? null ) ?: 'dynamic_store';
			$sfl_anchors[ $pair ] = [
				'fibHigh'    => $preferred_leg['high'],
				'fibLow'     => $preferred_leg['low'],
				'updated_at' => $m['updated_at'],
				'source'     => 'authority_only' === $emission_mode ? 'local_fib_composite' : $source,
				'authority'  => $authority_payload,
				'timeframes' => [
					'D'   => isset( $m['daily_high'] ) && isset( $m['daily_low'] ) ? [ 'fibHigh' => $m['daily_high'], 'fibLow' => $m['daily_low'] ] : null,
					'W'   => isset( $m['weekly_high'] ) && isset( $m['weekly_low'] ) ? [ 'fibHigh' => $m['weekly_high'], 'fibLow' => $m['weekly_low'] ] : null,
					'M'   => isset( $m['monthly_high'] ) && isset( $m['monthly_low'] ) ? [ 'fibHigh' => $m['monthly_high'], 'fibLow' => $m['monthly_low'] ] : null,
					'240' => isset( $m['h4_high'] ) && isset( $m['h4_low'] ) ? [ 'fibHigh' => $m['h4_high'], 'fibLow' => $m['h4_low'] ] : null,
					'60'  => isset( $m['h1_high'] ) && isset( $m['h1_low'] ) ? [ 'fibHigh' => $m['h1_high'], 'fibLow' => $m['h1_low'] ] : null,
				],
			];
		}

		if ( sniper_logging_enabled() ) {
			error_log( '[ANCHOR_TRACE:REGIMES_OUT] ' . $pair . ' ' . wp_json_encode( [
				'meta_f3_high'      => $m['f3_high'] ?? null,
				'meta_f3_low'       => $m['f3_low'] ?? null,
				'has_f3_high'       => null !== ( $m['f3_high'] ?? null ),
				'has_f3_low'        => null !== ( $m['f3_low'] ?? null ),
				'has_anchors_field' => $has_anchors_field,
				'has_f3_in_anchors' => isset( $normalized_anchors['f3'] ) && is_array( $normalized_anchors['f3'] ),
				'will_emit_sfl'     => $will_emit_sfl,
				'sfl_anchor_emitted'=> isset( $sfl_anchors[ $pair ] ),
				'meta_source'       => $m['source'] ?? null,
				'meta_updated_at'   => $m['updated_at'] ?? null,
			] ) );
		}
	}

	$watchlist_keys = sniper_user_watchlist_key_map( get_current_user_id() );

	// Market prices: pull from regime meta, fall back to live signal store
	$global_prices = [];
	foreach ( $meta_clean as $pair => $m ) {
		if ( isset( $m['price'] ) && floatval( $m['price'] ) > 0 ) {
			$global_prices[ $pair ] = floatval( $m['price'] );
		}
	}
	foreach ( sniper_get_live_store() as $sig ) {
		if ( ! empty( $sig['pair'] ) && ! empty( $sig['market_price'] ) && floatval( $sig['market_price'] ) > 0 ) {
			// Only override if we don't already have a price from meta
			if ( ! isset( $global_prices[ $sig['pair'] ] ) ) {
				$global_prices[ $sig['pair'] ] = floatval( $sig['market_price'] );
			}
		}
	}

	$clean        = sniper_array_filter_by_watchlist_keys( $clean, $watchlist_keys );
	$meta_clean   = sniper_array_filter_by_watchlist_keys( $meta_clean, $watchlist_keys );
	$ef_map       = sniper_array_filter_by_watchlist_keys( $ef_map, $watchlist_keys );
	$sequence     = sniper_array_filter_by_watchlist_keys( $sequence, $watchlist_keys );
	$sfl_anchors  = sniper_array_filter_by_watchlist_keys( $sfl_anchors, $watchlist_keys );
	$global_prices= sniper_array_filter_by_watchlist_keys( $global_prices, $watchlist_keys );

	return new WP_REST_Response( [
		'watchlist'   => sniper_get_user_watchlist( get_current_user_id() ),
		'regimes'     => $clean,
		'meta'        => $meta_clean,
		'ef_levels'   => $ef_map,
		'sequence'    => $sequence,
		'sfl_anchors' => $sfl_anchors,
		'prices'      => $global_prices,
		'updated_at'  => null !== $latest_meta_updated_at ? gmdate( 'c', $latest_meta_updated_at ) : null,
		'source'      => 'plugin_store',
	], 200 );
}

// ── PRICE FEED ENDPOINT ──────────────────────────────────────────────────────

function sniper_receive_prices( WP_REST_Request $request ) {
	$body = $request->get_json_params();
	if ( empty( $body ) || ! is_array( $body ) ) {
		return new WP_REST_Response( [ 'error' => 'Empty payload' ], 400 );
	}

	$meta    = get_option( 'sniper_regimes_meta', [] );
	$updated = 0;

	foreach ( $body as $pair => $price ) {
		$normalized = sniper_normalise_pair( $pair );
		if ( $normalized && is_numeric( $price ) ) {
			if ( ! isset( $meta[ $normalized ] ) || ! is_array( $meta[ $normalized ] ) ) {
				$meta[ $normalized ] = [];
			}
			$meta[ $normalized ]['price']            = floatval( $price );
			$meta[ $normalized ]['price_updated_at'] = current_time( 'c' );
			$updated++;
		}
	}

	update_option( 'sniper_regimes_meta', $meta );

	return new WP_REST_Response( [
		'status'  => 'ok',
		'updated' => $updated,
		'time'    => current_time( 'c' ),
	], 200 );
}

function sniper_get_market_data( WP_REST_Request $request ) {
	$td_key = trim( (string) sniper_get_td_key() );
	if ( '' === $td_key ) {
		return new WP_REST_Response( [ 'error' => 'Twelve Data key is not configured' ], 503 );
	}

	$kind = sanitize_key( $request->get_param( 'kind' ) ?: 'prices' );
	if ( 'candles' === $kind ) {
		$symbol     = sanitize_text_field( (string) $request->get_param( 'symbol' ) );
		$interval   = sanitize_text_field( (string) $request->get_param( 'interval' ) );
		$outputsize = max( 1, min( 500, intval( $request->get_param( 'outputsize' ) ?: 140 ) ) );
		if ( '' === $symbol || '' === $interval ) {
			return new WP_REST_Response( [ 'error' => 'Missing symbol or interval' ], 400 );
		}
		$watchlist_keys = sniper_user_watchlist_key_map( get_current_user_id() );
		if ( ! sniper_watchlist_authorized_symbol( $symbol, $watchlist_keys ) ) {
			return new WP_REST_Response( [ 'error' => 'Symbol is not in the user watchlist' ], 403 );
		}

		$url = add_query_arg(
			[
				'symbol'     => $symbol,
				'interval'   => $interval,
				'outputsize' => $outputsize,
				'apikey'     => $td_key,
			],
			'https://api.twelvedata.com/time_series'
		);
	} else {
		$user_symbols = sniper_get_user_watchlist( get_current_user_id() );
		if ( empty( $user_symbols ) ) {
			return new WP_REST_Response( [ 'error' => 'Watchlist is empty' ], 400 );
		}
		$requested_param = $request->get_param( 'symbols' );
		$requested = [];
		if ( is_array( $requested_param ) ) {
			$requested = $requested_param;
		} elseif ( is_string( $requested_param ) && '' !== trim( $requested_param ) ) {
			$requested = array_map( 'trim', explode( ',', $requested_param ) );
		}
		if ( ! empty( $requested ) ) {
			$requested_clean = sniper_watchlist_sanitize_list( $requested );
			$watch_keys = [];
			foreach ( $user_symbols as $w ) { $watch_keys[ sniper_watchlist_symbol_key( $w ) ] = $w; }
			$intersected = [];
			foreach ( $requested_clean as $r ) {
				$k = sniper_watchlist_symbol_key( $r );
				if ( isset( $watch_keys[ $k ] ) ) {
					$intersected[] = $watch_keys[ $k ];
				}
			}
			if ( empty( $intersected ) ) {
				return new WP_REST_Response( [ 'error' => 'No requested symbols are in the user watchlist' ], 403 );
			}
			$user_symbols = array_values( array_unique( $intersected ) );
		}
		$symbols = implode( ',', $user_symbols );

		$url = add_query_arg(
			[
				'symbol' => $symbols,
				'apikey' => $td_key,
			],
			'https://api.twelvedata.com/price'
		);
	}

	$response = wp_remote_get(
		$url,
		[
			'timeout' => 20,
			'headers' => [
				'Accept' => 'application/json',
			],
		]
	);
	if ( is_wp_error( $response ) ) {
		return new WP_REST_Response( [ 'error' => $response->get_error_message() ], 502 );
	}

	$status = wp_remote_retrieve_response_code( $response );
	$body   = json_decode( wp_remote_retrieve_body( $response ), true );
	if ( ! is_array( $body ) ) {
		return new WP_REST_Response( [ 'error' => 'Invalid market data response' ], 502 );
	}

	return new WP_REST_Response( $body, $status > 0 ? $status : 200 );
}

// ── SNAPSHOT ENDPOINTS ───────────────────────────────────────────────────────

function sniper_get_snapshot( WP_REST_Request $request ) {
	$snapshot = get_option( 'sniper_snapshot', null );
	if ( ! $snapshot ) {
		return new WP_REST_Response( [ 'error' => 'No snapshot yet' ], 404 );
	}
	return new WP_REST_Response( $snapshot, 200 );
}

function sniper_receive_snapshot( WP_REST_Request $request ) {
	return sniper_run_deduped_webhook_handler( $request, 'snapshot', 'sniper_receive_snapshot_core' );
}

function sniper_receive_snapshot_core( WP_REST_Request $request ) {
	$body = $request->get_json_params();
	if ( empty( $body ) ) {
		return new WP_REST_Response( [ 'error' => 'Empty payload' ], 400 );
	}

	$snapshot = [
		'acct'      => $body['acct']      ?? null,
		'positions' => $body['positions'] ?? [],
		'orders'    => $body['orders']    ?? [],
		'baseline'  => $body['baseline']  ?? null,
		'signals'   => $body['signals']   ?? [],
		'saved_at'  => current_time( 'c' ),
		'source'    => isset( $body['fname'] ) ? sanitize_text_field( $body['fname'] ) : 'dashboard',
	];

	update_option( 'sniper_snapshot', $snapshot );

	return new WP_REST_Response( [
		'status'   => 'ok',
		'saved_at' => $snapshot['saved_at'],
	], 200 );
}

// ── LIVE SIGNALS ENDPOINT ────────────────────────────────────────────────────

function sniper_get_live_signals( WP_REST_Request $request ) {
	$store          = sniper_get_live_store();
	$watchlist_keys = sniper_user_watchlist_key_map( get_current_user_id() );
	$records        = array_values( array_filter( $store, function( $row ) use ( $watchlist_keys ) {
		$pair = isset( $row['pair'] ) ? $row['pair'] : '';
		return isset( $watchlist_keys[ sniper_watchlist_symbol_key( $pair ) ] );
	} ) );

	usort( $records, function ( $a, $b ) {
		$rank_diff = intval( $b['rank_score'] ?? -1 ) <=> intval( $a['rank_score'] ?? -1 );
		if ( 0 !== $rank_diff ) return $rank_diff;
		return strcmp( (string) ( $b['updated_at'] ?? '' ), (string) ( $a['updated_at'] ?? '' ) );
	} );

	return new WP_REST_Response( [
		'watchlist'    => sniper_get_user_watchlist( get_current_user_id() ),
		'live_signals' => $records,
		'count'        => count( $records ),
		'generated_at' => current_time( 'c' ),
	], 200 );
}

// ── SESSION CHECK ────────────────────────────────────────────────────────────

function sniper_session_check( WP_REST_Request $request ) {
	$user_id = wp_validate_auth_cookie( '', 'logged_in' );
	if ( ! $user_id ) {
		return new WP_REST_Response( [
			'logged_in' => false,
			'user_id'   => 0,
		], 200 );
	}
	$user = get_user_by( 'id', $user_id );
	if ( ! $user ) {
		return new WP_REST_Response( [
			'logged_in' => false,
			'user_id'   => 0,
		], 200 );
	}
	return new WP_REST_Response( [
		'logged_in'    => true,
		'user_id'      => (int) $user_id,
		'display_name' => $user->display_name,
		'email'        => $user->user_email,
		'logout_url'   => wp_logout_url( home_url( '/' ) ),
	], 200 );
}

// ── SIGNAL HANDLER (NEW_LADDER / LADDER_UPDATE / EF_PRE_TRIGGER) ─────────────

function sniper_handle_signal( WP_REST_Request $request ) {
	return sniper_run_deduped_webhook_handler( $request, 'signal', 'sniper_handle_signal_core' );
}

function sniper_handle_signal_core( WP_REST_Request $request ) {
	$body = $request->get_json_params();
	$body = is_array( $body ) ? sniper_normalize_field_aliases( $body ) : $body;
	if ( empty( $body ) ) {
		sniper_log_event( 'Rejected empty signal payload' );
		return new WP_REST_Response( [ 'error' => 'Empty payload' ], 400 );
	}

	// Keep last raw signal for debug inspection
	$raw = wp_json_encode( $body );
	if ( strlen( $raw ) <= 16384 ) {
		update_option( 'sniper_last_signal', $raw, false );
	}

	$signal_type = sanitize_text_field( $body['signal_type'] ?? $body['type'] ?? $body['signal'] ?? '' );
	if ( ! $signal_type ) {
		sniper_log_event( 'Rejected signal payload without signal_type', [
			'instrument_id' => $body['instrument_id'] ?? null,
			'pair'          => $body['pair'] ?? null,
		] );
		return new WP_REST_Response( [ 'error' => 'Missing signal_type' ], 400 );
	}

	if ( 'NEW_LADDER' === $signal_type )     return sniper_store_new_ladder( $body );
	if ( 'LADDER_UPDATE' === $signal_type )  return sniper_update_ladder( $body );
	if ( 'EF_PRE_TRIGGER' === $signal_type ) return sniper_store_ef_pretrigger( $body );

	return new WP_REST_Response( [ 'error' => 'Unknown signal_type: ' . $signal_type ], 400 );
}

function sniper_store_new_ladder( array $body ) {
	$body = sniper_normalize_field_aliases( $body );

	foreach ( [ 'instrument_id', 'ladder_id', 'direction', 'entries', 'sl', 'confluence_score', 'timestamp' ] as $required ) {
		if ( ! isset( $body[ $required ] ) ) {
			return new WP_REST_Response( [ 'error' => 'Missing field: ' . $required ], 400 );
		}
	}

	$instrument = sniper_normalise_instrument( $body );
	if ( empty( $instrument['instrument_id'] ) ) {
		return new WP_REST_Response( [ 'error' => 'Cannot resolve instrument_id' ], 400 );
	}
	$stale_response = sniper_reject_stale_payload_response( $body, $instrument['pair'] ?: $instrument['instrument_id'] );
	if ( $stale_response ) {
		return $stale_response;
	}

	$direction = strtoupper( sanitize_text_field( $body['direction'] ) );
	if ( ! in_array( $direction, [ 'BUY', 'SELL' ], true ) ) {
		return new WP_REST_Response( [ 'error' => 'direction must be BUY or SELL' ], 400 );
	}

	$entries = [];
	foreach ( (array) $body['entries'] as $entry ) {
		$entries[] = [
			'level'  => sanitize_text_field( $entry['level'] ?? '' ),
			'price'  => isset( $entry['price'] ) ? floatval( $entry['price'] ) : null,
			'status' => sanitize_text_field( $entry['status'] ?? 'PENDING' ),
		];
	}
	$anchors        = sniper_normalize_payload_anchor_contract( $body );
	$anchor_scalars = sniper_anchor_contract_scalar_fields( $anchors );

	$ladder = [
		'ladder_id'        => sanitize_text_field( $body['ladder_id'] ),
		'instrument_id'    => $instrument['instrument_id'],
		'symbol'           => $instrument['symbol'],
		'display_symbol'   => $instrument['display'],
		'pair'             => $instrument['pair'],
		'direction'        => $direction,
		'signal_state'     => sanitize_text_field( $body['signal_state'] ?? 'ACTIVE' ),
		'entry_stage'      => sanitize_text_field( $body['entry_stage'] ?? 'ACTIVE' ),
		'entries'          => $entries,
		'sl'               => floatval( $body['sl'] ),
		'tp'               => isset( $body['tp'] ) ? floatval( $body['tp'] ) : null,
		'confluence_score' => intval( $body['confluence_score'] ),
		'timestamp'        => sanitize_text_field( $body['timestamp'] ),
		'created_at'       => current_time( 'c' ),
		'market_price'     => isset( $body['market_price'] ) ? floatval( $body['market_price'] ) : null,
		'entry_zone_price' => isset( $body['entry_zone_price'] ) ? floatval( $body['entry_zone_price'] ) : null,
		'ef_is_narrative'  => isset( $body['ef_is_narrative'] ) ? sniper_boolish( $body['ef_is_narrative'] ) : null,
		'ef_anchor_dir'    => sniper_string_or_null( $body['ef_anchor_dir'] ?? null ),
		'ef_tp_narrative_valid' => isset( $body['ef_tp_narrative_valid'] ) ? sniper_boolish( $body['ef_tp_narrative_valid'] ) : null,
		'sweep_tier'       => sniper_string_or_null( $body['sweep_tier'] ?? null ),
		'mss_disp_score'   => isset( $body['mss_disp_score'] ) ? floatval( $body['mss_disp_score'] ) : null,
		'liquidity_type'   => sniper_string_or_null( $body['liquidity_type'] ?? null ),
		'poi_freshness_bars' => isset( $body['poi_freshness_bars'] ) ? intval( $body['poi_freshness_bars'] ) : null,
		'model_tag'        => isset( $body['model_tag'] ) ? sanitize_text_field( $body['model_tag'] ) : null,
		'setup_class'      => isset( $body['setup_class'] ) ? sanitize_text_field( $body['setup_class'] ) : null,
		'blocked_reason'   => isset( $body['blocked_reason'] ) ? sanitize_text_field( $body['blocked_reason'] ) : null,
		'setup_quality'    => isset( $body['setup_quality'] ) ? intval( $body['setup_quality'] ) : null,
		'execution_quality'=> isset( $body['execution_quality'] ) ? intval( $body['execution_quality'] ) : null,
		'rank_score'       => isset( $body['rank_score'] ) ? intval( $body['rank_score'] ) : null,
		'sequence_status'  => sniper_normalize_sequence_status( $body['sequence_status'] ?? null ),
		'signal_state'     => sniper_derive_signal_state(
			$body['signal_state'] ?? null,
			$body['sequence_status'] ?? null,
			sniper_extract_chop( $body )
		),
		'regime'           => isset( $body['regime'] ) ? sanitize_text_field( $body['regime'] ) : null,
		'session_tf'       => sniper_string_or_null( $body['session_tf'] ?? null ),
		'f1_high'          => $anchor_scalars['f1_high'],
		'f1_low'           => $anchor_scalars['f1_low'],
		'f2_high'          => $anchor_scalars['f2_high'],
		'f2_low'           => $anchor_scalars['f2_low'],
		'f3_high'          => $anchor_scalars['f3_high'],
		'f3_low'           => $anchor_scalars['f3_low'],
		'anchors'          => ! empty( $anchors ) ? $anchors : null,
		'structure'        => sniper_extract_structure( $body ),
		'liquidity'        => sniper_extract_liquidity( $body ),
		'poi'              => sniper_extract_poi( $body ),
		'chop'             => sniper_extract_chop( $body ),
		'fills'            => [],
	];
	$ladder['rr_estimate'] = sniper_compute_rr_estimate( $entries, $ladder['sl'], $ladder['tp'] );

	// Persist full F1/F2/F3 anchor contract to regime meta if included.
	if ( ! empty( $instrument['pair'] ) && ! empty( $ladder['anchors'] ) ) {
		$meta = get_option( 'sniper_regimes_meta', [] );
		if ( ! isset( $meta[ $instrument['pair'] ] ) || ! is_array( $meta[ $instrument['pair'] ] ) ) {
			$meta[ $instrument['pair'] ] = [];
		}
		$meta[ $instrument['pair'] ]['instrument_id'] = $instrument['instrument_id'];
		$meta[ $instrument['pair'] ]['display_symbol'] = $instrument['display'];
		$meta[ $instrument['pair'] ]['sequence_status'] = $ladder['sequence_status'];
		$meta[ $instrument['pair'] ]['zone_price']      = $ladder['entry_zone_price'];
		$meta[ $instrument['pair'] ]['session_tf']      = $ladder['session_tf'];
		$meta[ $instrument['pair'] ]['f1_high']    = $ladder['f1_high'];
		$meta[ $instrument['pair'] ]['f1_low']     = $ladder['f1_low'];
		$meta[ $instrument['pair'] ]['f2_high']    = $ladder['f2_high'];
		$meta[ $instrument['pair'] ]['f2_low']     = $ladder['f2_low'];
		$meta[ $instrument['pair'] ]['f3_high']    = $ladder['f3_high'];
		$meta[ $instrument['pair'] ]['f3_low']     = $ladder['f3_low'];
		$meta[ $instrument['pair'] ]['anchors']    = $ladder['anchors'];
		$meta[ $instrument['pair'] ]['chop']       = $ladder['chop'];
		$meta[ $instrument['pair'] ]['updated_at'] = current_time( 'c' );
		$meta[ $instrument['pair'] ]['source']     = $meta[ $instrument['pair'] ]['source'] ?? 'dynamic_store';
		update_option( 'sniper_regimes_meta', $meta );
	}

	// Append to ladder store (deduplicate by ladder_id)
	$ladders = get_option( 'sniper_ladders', [] );
	$ladders = array_values( array_filter( $ladders, function ( $row ) use ( $ladder ) {
		return ( $row['ladder_id'] ?? '' ) !== $ladder['ladder_id'];
	} ) );
	$ladders[] = $ladder;
	if ( count( $ladders ) > 300 ) {
		$ladders = array_slice( $ladders, -300 );
	}
	update_option( 'sniper_ladders', $ladders, false );

	sniper_upsert_live_signal( $instrument, [
		'last_signal_type'  => 'NEW_LADDER',
		'last_signal_at'    => current_time( 'c' ),
		'direction'         => $direction,
		'signal_state'      => sniper_derive_signal_state( $ladder['signal_state'], $ladder['sequence_status'], $ladder['chop'] ),
		'entry_stage'       => $ladder['entry_stage'],
		'entries'           => $entries,
		'entry_count'       => count( $entries ),
		'sl'                => $ladder['sl'],
		'tp'                => $ladder['tp'],
		'confluence_score'  => $ladder['confluence_score'],
		'setup_class'       => $ladder['setup_class'],
		'blocked_reason'    => $ladder['blocked_reason'],
		'setup_quality'     => $ladder['setup_quality'],
		'execution_quality' => $ladder['execution_quality'],
		'rank_score'        => $ladder['rank_score'],
		'market_price'      => $ladder['market_price'],
		'zone_price'        => $ladder['entry_zone_price'],
		'entry_zone_price'  => $ladder['entry_zone_price'],
		'ef_is_narrative'   => $ladder['ef_is_narrative'],
		'ef_anchor_dir'     => $ladder['ef_anchor_dir'],
		'ef_tp_narrative_valid' => $ladder['ef_tp_narrative_valid'],
		'sweep_tier'        => $ladder['sweep_tier'],
		'mss_disp_score'    => $ladder['mss_disp_score'],
		'liquidity_type'    => $ladder['liquidity_type'],
		'poi_freshness_bars'=> $ladder['poi_freshness_bars'],
		'session_tf'        => $ladder['session_tf'],
		'f1_high'           => $ladder['f1_high'],
		'f1_low'            => $ladder['f1_low'],
		'f2_high'           => $ladder['f2_high'],
		'f2_low'            => $ladder['f2_low'],
		'f3_high'           => $ladder['f3_high'],
		'f3_low'            => $ladder['f3_low'],
		'anchors'           => $ladder['anchors'],
		'model_tag'         => $ladder['model_tag'],
		'sequence_status'   => $ladder['sequence_status'],
		'regime'            => $ladder['regime'],
		'rr_estimate'       => $ladder['rr_estimate'],
		'structure'         => $ladder['structure'],
		'liquidity'         => $ladder['liquidity'],
		'poi'               => $ladder['poi'],
		'chop'              => $ladder['chop'],
		'fills'             => [],
		'last_ladder_id'    => $ladder['ladder_id'],
	] );

	return new WP_REST_Response( [
		'ok'            => true,
		'ladder_id'     => $ladder['ladder_id'],
		'instrument_id' => $instrument['instrument_id'],
		'signal_state'  => $ladder['signal_state'],
		'stored'        => current_time( 'c' ),
	], 200 );
}

function sniper_update_ladder( array $body ) {
	$body = sniper_normalize_field_aliases( $body );
	$ladder_id = sanitize_text_field( $body['ladder_id'] ?? '' );
	if ( empty( $ladder_id ) ) {
		return new WP_REST_Response( [ 'error' => 'Missing ladder_id' ], 400 );
	}
	$stale_response = sniper_reject_stale_payload_response( $body, $body['pair'] ?? $ladder_id );
	if ( $stale_response ) {
		return $stale_response;
	}

	$level  = sanitize_text_field( $body['level'] ?? '' );
	$status = sanitize_text_field( $body['status'] ?? 'FILLED' );

	$ladders = get_option( 'sniper_ladders', [] );
	$found   = null;

	foreach ( $ladders as &$ladder ) {
		if ( ( $ladder['ladder_id'] ?? '' ) !== $ladder_id ) continue;
		$ladder['fills'][] = [
			'level'     => $level,
			'status'    => $status,
			'filled_at' => current_time( 'c' ),
		];
		foreach ( $ladder['entries'] as &$entry ) {
			if ( strtolower( (string) ( $entry['level'] ?? '' ) ) === strtolower( $level ) ) {
				$entry['status'] = $status;
			}
		}
		unset( $entry );
		$found = $ladder;
		break;
	}
	unset( $ladder );

	if ( ! $found ) {
		return new WP_REST_Response( [ 'ok' => true, 'warning' => 'Ladder not found — may have expired' ], 200 );
	}

	update_option( 'sniper_ladders', $ladders, false );

	$instrument = sniper_normalise_instrument( [
		'instrument_id'  => $body['instrument_id'] ?? $found['instrument_id'] ?? '',
		'symbol'         => $body['symbol']         ?? $found['symbol'] ?? '',
		'display_symbol' => $body['display_symbol'] ?? $found['display_symbol'] ?? '',
		'pair'           => $body['pair']            ?? $found['pair'] ?? '',
	] );

	$rank_meta = sniper_extract_rank_meta( $body, $found['rr_estimate'] ?? null );
	sniper_upsert_live_signal( $instrument, [
		'last_signal_type'  => 'LADDER_UPDATE',
		'last_signal_at'    => current_time( 'c' ),
		'signal_state'      => sniper_derive_signal_state(
			$body['signal_state'] ?? ( $found['signal_state'] ?? null ),
			$body['sequence_status'] ?? ( $found['sequence_status'] ?? null ),
			sniper_extract_chop( $body )
		),
		'entry_stage'       => sanitize_text_field( $body['entry_stage'] ?? $found['entry_stage'] ?? 'ACTIVE' ),
		'setup_class'       => $rank_meta['setup_class']       ?? $found['setup_class'] ?? null,
		'blocked_reason'    => $rank_meta['blocked_reason']    ?? $found['blocked_reason'] ?? null,
		'setup_quality'     => $rank_meta['setup_quality']     ?? $found['setup_quality'] ?? null,
		'execution_quality' => $rank_meta['execution_quality'] ?? $found['execution_quality'] ?? null,
		'rank_score'        => $rank_meta['rank_score']        ?? $found['rank_score'] ?? null,
		'fills'             => $found['fills'] ?? [],
		'entries'           => $found['entries'] ?? [],
		'last_ladder_id'    => $ladder_id,
	] );

	return new WP_REST_Response( [
		'ok'        => true,
		'ladder_id' => $ladder_id,
		'level'     => $level,
		'status'    => $status,
	], 200 );
}

function sniper_store_ef_pretrigger( array $body ) {
	$instrument = sniper_normalise_instrument( $body );
	if ( empty( $instrument['instrument_id'] ) ) {
		return new WP_REST_Response( [ 'error' => 'Missing instrument_id' ], 400 );
	}
	$stale_response = sniper_reject_stale_payload_response( $body, $instrument['pair'] ?: $instrument['instrument_id'] );
	if ( $stale_response ) {
		return $stale_response;
	}

	if ( ! empty( $instrument['pair'] ) ) {
		$ef = get_option( 'sniper_ef_levels', [] );
		if ( ! isset( $ef[ $instrument['pair'] ] ) || ! is_array( $ef[ $instrument['pair'] ] ) ) {
			$ef[ $instrument['pair'] ] = [];
		}
		$ef[ $instrument['pair'] ]['pretrigger'] = [
			'level'      => isset( $body['level'] ) ? floatval( $body['level'] ) : null,
			'direction'  => isset( $body['direction'] ) ? sanitize_text_field( $body['direction'] ) : '',
			'updated_at' => current_time( 'c' ),
		];
		$ef[ $instrument['pair'] ]['mode']       = isset( $body['ef_mode'] ) ? sanitize_text_field( $body['ef_mode'] ) : null;
		$ef[ $instrument['pair'] ]['fibHigh']    = isset( $body['ef_high'] ) ? floatval( $body['ef_high'] ) : null;
		$ef[ $instrument['pair'] ]['fibLow']     = isset( $body['ef_low'] )  ? floatval( $body['ef_low'] )  : null;
		$ef[ $instrument['pair'] ]['lastUpdate'] = current_time( 'c' );
		update_option( 'sniper_ef_levels', $ef, false );
	}

	$rank_meta = sniper_extract_rank_meta( $body );
	$chop      = sniper_extract_chop( $body );
	$anchors   = sniper_normalize_payload_anchor_contract( $body );
	$anchor_scalars = sniper_anchor_contract_scalar_fields( $anchors );
	sniper_upsert_live_signal( $instrument, [
		'last_signal_type'  => 'EF_PRE_TRIGGER',
		'last_signal_at'    => current_time( 'c' ),
		'direction'         => isset( $body['direction'] ) ? sanitize_text_field( $body['direction'] ) : null,
		'market_price'      => isset( $body['market_price'] ) ? floatval( $body['market_price'] ) : null,
		'sequence_status'   => sniper_normalize_sequence_status( $body['sequence_status'] ?? null ),
		'signal_state'      => sniper_derive_signal_state( $body['signal_state'] ?? null, $body['sequence_status'] ?? null, $chop ),
		'regime'            => isset( $body['regime'] ) ? sanitize_text_field( $body['regime'] ) : null,
		'session_tf'        => sniper_string_or_null( $body['session_tf'] ?? null ),
		'f1_high'           => $anchor_scalars['f1_high'],
		'f1_low'            => $anchor_scalars['f1_low'],
		'f2_high'           => $anchor_scalars['f2_high'],
		'f2_low'            => $anchor_scalars['f2_low'],
		'f3_high'           => $anchor_scalars['f3_high'],
		'f3_low'            => $anchor_scalars['f3_low'],
		'anchors'           => ! empty( $anchors ) ? $anchors : null,
		'setup_class'       => $rank_meta['setup_class'],
		'blocked_reason'    => $rank_meta['blocked_reason'],
		'setup_quality'     => $rank_meta['setup_quality'],
		'execution_quality' => $rank_meta['execution_quality'],
		'rank_score'        => $rank_meta['rank_score'],
		'pretrigger' => [
			'level'        => isset( $body['level'] ) ? floatval( $body['level'] ) : null,
			'direction'    => isset( $body['direction'] ) ? sanitize_text_field( $body['direction'] ) : null,
			'triggered_at' => current_time( 'c' ),
		],
		'ef' => [
			'mode'       => isset( $body['ef_mode'] ) ? sanitize_text_field( $body['ef_mode'] ) : null,
			'fibHigh'    => isset( $body['ef_high'] ) ? floatval( $body['ef_high'] ) : null,
			'fibLow'     => isset( $body['ef_low'] )  ? floatval( $body['ef_low'] )  : null,
			'lastUpdate' => current_time( 'c' ),
		],
		'structure' => sniper_extract_structure( $body ),
		'liquidity' => sniper_extract_liquidity( $body ),
		'poi'       => sniper_extract_poi( $body ),
		'chop'      => $chop,
	] );

	return new WP_REST_Response( [
		'ok'            => true,
		'instrument_id' => $instrument['instrument_id'],
		'type'          => 'EF_PRE_TRIGGER',
	], 200 );
}

function sniper_get_ladders( WP_REST_Request $request ) {
	$ladders = get_option( 'sniper_ladders', [] );
	return new WP_REST_Response( [
		'ladders' => array_reverse( $ladders ),
		'count'   => count( $ladders ),
	], 200 );
}

// ── ENGINE BATCH ENDPOINT ────────────────────────────────────────────────────

function sniper_receive_engine_batch( WP_REST_Request $request ) {
	if ( sniper_logging_enabled() ) {
		error_log( '[ANCHOR_TRACE:ENGINE_BATCH_ACTIVE] backend_diag_v2' );
	}

	$body = $request->get_json_params();
	if ( empty( $body ) || ! is_array( $body ) ) {
		return new WP_REST_Response( [ 'error' => 'Empty payload' ], 400 );
	}

	$pair_for_log = 'unknown';
	if ( ! empty( $body['pair'] ) ) {
		$pair_for_log = sanitize_text_field( $body['pair'] );
	} elseif ( isset( $body['pairs'] ) && is_array( $body['pairs'] ) && ! empty( $body['pairs'] ) ) {
		foreach ( $body['pairs'] as $first_pair => $unused_pair_payload ) {
			$pair_for_log = sanitize_text_field( (string) $first_pair );
			break;
		}
	}

	if ( empty( $body['signal_schema_version'] ) ) {
		if ( sniper_logging_enabled() ) {
			error_log( '[SMC-REJECT] ' . $pair_for_log . ' missing_schema_version ' . time() );
		}
		return new WP_REST_Response( [ 'rejected' => true, 'reason' => 'missing_schema_version' ], 422 );
	}
	$_sv = (string) $body['signal_schema_version'];
	if ( ! sniper_is_supported_signal_schema_version( $_sv ) ) {
		if ( sniper_logging_enabled() ) {
			error_log( '[SMC-REJECT] ' . $pair_for_log . ' unsupported_schema_version ' . sanitize_text_field( $_sv ) . ' ' . time() );
		}
		return new WP_REST_Response( [ 'rejected' => true, 'reason' => 'unsupported_schema_version' ], 422 );
	}

	// Cap at 4 hours regardless of profile; YEARLY (weekly bars) would otherwise
	// allow ~14-day-old payloads via bar_duration * 2, enabling stale overwrites.
	$stale_response = sniper_reject_stale_payload_response( $body, $pair_for_log, 4 * HOUR_IN_SECONDS );
	if ( $stale_response ) {
		return $stale_response;
	}

	$pairs     = isset( $body['pairs'] ) && is_array( $body['pairs'] ) ? $body['pairs'] : [];
	$source    = isset( $body['source'] ) ? sanitize_text_field( $body['source'] ) : 'js_engine';
	$timestamp = isset( $body['timestamp'] ) ? sanitize_text_field( $body['timestamp'] ) : current_time( 'c' );

	if ( empty( $pairs ) ) {
		return new WP_REST_Response( [ 'error' => 'No pairs in payload' ], 400 );
	}

	$regimes       = get_option( 'sniper_regimes', [] );
	$meta          = get_option( 'sniper_regimes_meta', [] );
	$ef_store      = get_option( 'sniper_ef_levels', [] );
	$updated       = 0;
	$skipped_stale = 0;
	$skipped_pairs = [];
	$valid_regimes = SNIPER_VALID_REGIMES;

	foreach ( $pairs as $pair_key => $data ) {
		if ( ! is_array( $data ) ) continue;
		$data = sniper_normalize_field_aliases( $data );
		$pair = sniper_normalise_pair( $pair_key );
		if ( empty( $pair ) ) continue;

		$regime = isset( $data['regime'] ) ? strtoupper( sanitize_text_field( $data['regime'] ) ) : null;
		$fib_timeframe = isset( $data['fib_timeframe'] )
			? strtoupper( sanitize_text_field( $data['fib_timeframe'] ) )
			: ( isset( $body['fib_timeframe'] ) ? strtoupper( sanitize_text_field( $body['fib_timeframe'] ) ) : null );
		$seq_status    = sniper_normalize_sequence_status( $data['sequence_status'] ?? null );
		$market_price  = isset( $data['market_price'] ) ? floatval( $data['market_price'] ) : null;
		$zone_price     = sniper_float_or_null( $data['entry_zone_price'] ?? null );
		$signal_state   = sniper_derive_signal_state( $data['signal_state'] ?? null, $seq_status );
		$blocked_reason = sniper_string_or_null( $data['blocked_reason'] ?? null );
		$updated_at     = sniper_string_or_null( $data['updated_at'] ?? null ) ?: $timestamp;
		$pair_updated_ts = sniper_parse_payload_timestamp_seconds( $updated_at );
		if ( null !== $pair_updated_ts && ( time() - $pair_updated_ts ) > ( 4 * HOUR_IN_SECONDS ) ) {
			$skipped_stale++;
			$skipped_pairs[] = $pair;
			if ( sniper_logging_enabled() ) {
				error_log( '[SMC-SKIP] ' . $pair . ' stale_pair_payload age=' . ( time() - $pair_updated_ts ) . ' ' . time() );
			}
			continue;
		}
		if ( $regime && in_array( $regime, $valid_regimes, true ) ) {
			$regimes[ $pair ] = $regime;
		}

		$existing_meta = isset( $meta[ $pair ] ) && is_array( $meta[ $pair ] ) ? $meta[ $pair ] : [];
		$anchors = isset( $data['anchors'] ) && is_array( $data['anchors'] ) ? $data['anchors'] : [];
		$has_anchors_field = isset( $data['anchors'] ) && is_array( $data['anchors'] );
		$anchors_keys = $has_anchors_field ? array_keys( $data['anchors'] ) : [];
		$normalized_anchors = sniper_normalize_anchor_contract(
			$has_anchors_field ? $data['anchors'] : [],
			[
				'f1_high' => $data['f1_high'] ?? null,
				'f1_low'  => $data['f1_low'] ?? null,
				'f2_high' => $data['f2_high'] ?? null,
				'f2_low'  => $data['f2_low'] ?? null,
				'f3_high' => $data['f3_high'] ?? null,
				'f3_low'  => $data['f3_low'] ?? null,
			]
		);
		$f1_high = sniper_anchor_contract_scalar( $normalized_anchors, 'f1', 'high' );
		$f1_low  = sniper_anchor_contract_scalar( $normalized_anchors, 'f1', 'low' );
		$f2_high = sniper_anchor_contract_scalar( $normalized_anchors, 'f2', 'high' );
		$f2_low  = sniper_anchor_contract_scalar( $normalized_anchors, 'f2', 'low' );
		$f3_high = sniper_anchor_contract_scalar( $normalized_anchors, 'f3', 'high' );
		$f3_low  = sniper_anchor_contract_scalar( $normalized_anchors, 'f3', 'low' );
		$f3_raw = isset( $normalized_anchors['f3'] ) ? $normalized_anchors['f3'] : null;
		$f3_shape = isset( $normalized_anchors['f3'] ) ? 'high_low' : null;
		$has_f3_field = isset( $normalized_anchors['f3'] ) && is_array( $normalized_anchors['f3'] );
		$will_write_to_meta = null !== $f3_high && null !== $f3_low;
			$ef_fib_high = sniper_float_or_null( $data['ef_fib_high'] ?? $data['efAnchorHigh'] ?? null );
			$ef_fib_low  = sniper_float_or_null( $data['ef_fib_low'] ?? $data['efAnchorLow'] ?? null );
			$ef_mode = sniper_string_or_null( $data['ef_mode'] ?? null );
		if ( null === $ef_fib_high || null === $ef_fib_low ) {
			$anchors_f1 = isset( $anchors['f1'] ) && is_array( $anchors['f1'] ) ? $anchors['f1'] : null;
			$anchors_f2 = isset( $anchors['f2'] ) && is_array( $anchors['f2'] ) ? $anchors['f2'] : null;
			$anchors_f3 = isset( $anchors['f3'] ) && is_array( $anchors['f3'] ) ? $anchors['f3'] : null;
			$ef_anchor = $anchors_f1 ?: ( $anchors_f2 ?: $anchors_f3 );
			if ( is_array( $ef_anchor ) ) {
				$ef_fib_high = sniper_float_or_null( $ef_anchor['fibHigh'] ?? $ef_anchor['high'] ?? $ef_fib_high );
				$ef_fib_low  = sniper_float_or_null( $ef_anchor['fibLow'] ?? $ef_anchor['low'] ?? $ef_fib_low );
			}
		}
		$incoming_chop = isset( $data['chop'] ) && is_array( $data['chop'] )
			? sniper_extract_chop( $data )
			: null;
		$existing_chop = isset( $existing_meta['chop'] ) && is_array( $existing_meta['chop'] )
			? [
				'active' => sniper_boolish( $existing_meta['chop']['active'] ?? false ),
				'low'    => sniper_float_or_null( $existing_meta['chop']['low'] ?? null ),
				'high'   => sniper_float_or_null( $existing_meta['chop']['high'] ?? null ),
				'source' => sniper_string_or_null( $existing_meta['chop']['source'] ?? null ),
			]
			: null;
		$meta[ $pair ] = [
			'updated_at'      => $updated_at,
			'price'           => null !== $market_price ? $market_price : sniper_float_or_null( $existing_meta['price'] ?? null ),
			'price_updated_at'=> null !== $market_price ? $updated_at : ( $existing_meta['price_updated_at'] ?? null ),
			'timeframe'       => $fib_timeframe ?: ( $existing_meta['timeframe'] ?? null ),
			'fib_timeframe'   => $fib_timeframe ?: ( $existing_meta['fib_timeframe'] ?? null ),
			'tv_time'         => $existing_meta['tv_time'] ?? null,
			'source'          => $source,
			'sequence_status' => $seq_status ?? ( $existing_meta['sequence_status'] ?? null ),
			'instrument_id'   => $existing_meta['instrument_id'] ?? $pair,
			'display_symbol'  => isset( $data['display_symbol'] ) ? sanitize_text_field( $data['display_symbol'] ) : ( $existing_meta['display_symbol'] ?? null ),
			'session_tf'      => $existing_meta['session_tf'] ?? null,
			'zone_price'      => null !== $zone_price ? $zone_price : sniper_float_or_null( $existing_meta['zone_price'] ?? null ),
			'f3_high'         => null !== $f3_high ? $f3_high : sniper_float_or_null( $existing_meta['f3_high'] ?? null ),
			'f3_low'          => null !== $f3_low ? $f3_low : sniper_float_or_null( $existing_meta['f3_low'] ?? null ),
			'f2_high'         => null !== $f2_high ? $f2_high : sniper_float_or_null( $existing_meta['f2_high'] ?? null ),
			'f2_low'          => null !== $f2_low ? $f2_low : sniper_float_or_null( $existing_meta['f2_low'] ?? null ),
			'f1_high'         => null !== $f1_high ? $f1_high : sniper_float_or_null( $existing_meta['f1_high'] ?? null ),
			'f1_low'          => null !== $f1_low ? $f1_low : sniper_float_or_null( $existing_meta['f1_low'] ?? null ),
			'bias_profile'    => sniper_string_or_null( $data['bias_profile'] ?? ( $existing_meta['bias_profile'] ?? null ) ),
			'structure'       => isset( $data['structure'] ) && is_array( $data['structure'] ) ? $data['structure'] : ( $existing_meta['structure'] ?? null ),
			'htf_dol'         => isset( $data['htf_dol'] ) && is_array( $data['htf_dol'] ) ? $data['htf_dol'] : ( $existing_meta['htf_dol'] ?? null ),
			'matrix'          => isset( $data['matrix'] ) && is_array( $data['matrix'] ) ? $data['matrix'] : ( $existing_meta['matrix'] ?? null ),
			'matrix_tf'       => sniper_string_or_null( $data['matrix_tf'] ?? ( $existing_meta['matrix_tf'] ?? null ) ),
			'pd_array'        => isset( $data['pd_array'] ) && is_array( $data['pd_array'] ) ? $data['pd_array'] : ( $existing_meta['pd_array'] ?? null ),
			'pd_tf'           => sniper_string_or_null( $data['pd_tf'] ?? ( $existing_meta['pd_tf'] ?? null ) ),
			'final_bias'      => sniper_string_or_null( $data['final_bias'] ?? ( $existing_meta['final_bias'] ?? null ) ),
			'bull_bias_score' => isset( $data['bull_bias_score'] ) ? floatval( $data['bull_bias_score'] ) : sniper_float_or_null( $existing_meta['bull_bias_score'] ?? null ),
			'bear_bias_score' => isset( $data['bear_bias_score'] ) ? floatval( $data['bear_bias_score'] ) : sniper_float_or_null( $existing_meta['bear_bias_score'] ?? null ),
			'bull_pressure'   => isset( $data['bull_pressure'] ) ? floatval( $data['bull_pressure'] ) : sniper_float_or_null( $existing_meta['bull_pressure'] ?? null ),
			'bear_pressure'   => isset( $data['bear_pressure'] ) ? floatval( $data['bear_pressure'] ) : sniper_float_or_null( $existing_meta['bear_pressure'] ?? null ),
			'pressure_bias'   => sniper_string_or_null( $data['pressure_bias'] ?? ( $existing_meta['pressure_bias'] ?? null ) ),
			'fib_disagreement_penalty' => isset( $data['fib_disagreement_penalty'] ) ? floatval( $data['fib_disagreement_penalty'] ) : sniper_float_or_null( $existing_meta['fib_disagreement_penalty'] ?? null ),
			'chop_band'       => isset( $data['chop_band'] ) && is_array( $data['chop_band'] ) ? $data['chop_band'] : ( $existing_meta['chop_band'] ?? null ),
			'gate'            => sniper_string_or_null( $data['gate'] ?? ( $existing_meta['gate'] ?? null ) ),
			'gate_reason'     => sniper_string_or_null( $data['gate_reason'] ?? ( $existing_meta['gate_reason'] ?? null ) ),
			'anchors'         => ! empty( $normalized_anchors ) ? $normalized_anchors : ( isset( $data['anchors'] ) && is_array( $data['anchors'] ) ? $data['anchors'] : ( $existing_meta['anchors'] ?? null ) ),
			'levels'          => isset( $data['levels'] ) && is_array( $data['levels'] ) ? $data['levels'] : ( $existing_meta['levels'] ?? null ),
			'blockers'        => isset( $data['blockers'] ) && is_array( $data['blockers'] ) ? $data['blockers'] : ( $existing_meta['blockers'] ?? null ),
			'chop'            => null !== $incoming_chop ? $incoming_chop : $existing_chop,
		];
		if ( sniper_logging_enabled() ) {
			error_log( '[ANCHOR_TRACE:ENGINE_BATCH] ' . $pair . ' ' . wp_json_encode( [
				'pair_payload_key' => $pair_key,
				'pair_normalized'  => $pair,
				'has_anchors_field'=> $has_anchors_field,
				'anchors_keys'     => $anchors_keys,
				'has_f3_field'     => $has_f3_field,
				'f3_raw'           => $f3_raw,
				'f3_shape'         => $f3_shape,
				'f3_high_extracted'=> $f3_high,
				'f3_low_extracted' => $f3_low,
				'will_write_to_meta' => $will_write_to_meta,
				'existing_meta_f3h'  => sniper_float_or_null( $existing_meta['f3_high'] ?? null ),
				'existing_meta_f3l'  => sniper_float_or_null( $existing_meta['f3_low'] ?? null ),
				'regime'             => $regime,
				'gate'               => sniper_string_or_null( $data['gate'] ?? ( $existing_meta['gate'] ?? null ) ),
				'source'             => $source,
			] ) );
			if ( $has_anchors_field ) {
				error_log( '[ANCHOR_TRACE:ENGINE_BATCH:FULL_ANCHORS] ' . $pair . ' ' . wp_json_encode( $data['anchors'] ) );
			}
		}
		if ( null !== $ef_fib_high && null !== $ef_fib_low && $ef_fib_high !== $ef_fib_low ) {
			$ef_store[ $pair ] = [
				'mode'       => $ef_mode ?: 'Range',
				'fibHigh'    => max( $ef_fib_high, $ef_fib_low ),
				'fibLow'     => min( $ef_fib_high, $ef_fib_low ),
				'lastUpdate' => $updated_at,
			];
		}

		$display     = strlen( $pair ) === 6 ? substr( $pair, 0, 3 ) . '/' . substr( $pair, 3, 3 ) : $pair;
		$instrument  = [
			'instrument_id' => $pair,
			'symbol'        => $pair,
			'pair'          => $pair,
			'display'       => $display,
		];

			$incoming_structure = isset( $data['structure'] ) && is_array( $data['structure'] ) ? $data['structure'] : null;
			$fallback_structure = [
				'major_bos'      => isset( $data['mss_confirmed'] ) ? (bool) $data['mss_confirmed'] : false,
				'internal_shift' => isset( $data['sweep_confirmed'] ) ? (bool) $data['sweep_confirmed'] : false,
				'choch'          => false,
				'htf_bias'       => null,
				'session_tag'    => isset( $data['kz_label'] ) ? sanitize_text_field( $data['kz_label'] ) : null,
			];
			$structure_payload = $incoming_structure ?: $fallback_structure;

			sniper_upsert_live_signal( $instrument, array_filter( [
			'last_signal_type'  => 'JS_ENGINE',
			'last_signal_at'    => $timestamp,
			'regime'            => $regime,
			'sequence_status'   => $seq_status,
			'signal_state'      => $signal_state,
			'market_price'      => $market_price,
			'direction'         => isset( $data['direction'] ) ? sanitize_text_field( $data['direction'] ) : null,
			'confluence_score'  => isset( $data['confluence_score'] ) ? intval( $data['confluence_score'] ) : null,
			'zone_price'        => $zone_price,
			'entry_zone_price'  => $zone_price,
			'fib_timeframe'     => $fib_timeframe,
			'blocked_reason'    => $blocked_reason,
			'ef_is_narrative'   => isset( $data['ef_is_narrative'] ) ? sniper_boolish( $data['ef_is_narrative'] ) : null,
			'ef_anchor_dir'      => sniper_string_or_null( $data['ef_anchor_dir'] ?? null ),
			'ef_tp_narrative_valid' => isset( $data['ef_tp_narrative_valid'] ) ? sniper_boolish( $data['ef_tp_narrative_valid'] ) : null,
			'sweep_tier'         => sniper_string_or_null( $data['sweep_tier'] ?? null ),
			'mss_disp_score'     => isset( $data['mss_disp_score'] ) ? floatval( $data['mss_disp_score'] ) : null,
			'liquidity_type'     => sniper_string_or_null( $data['liquidity_type'] ?? null ),
			'poi_freshness_bars' => isset( $data['poi_freshness_bars'] ) ? intval( $data['poi_freshness_bars'] ) : null,
			'setup_class'        => sniper_string_or_null( $data['setup_class'] ?? null ),
			'rank_score'         => isset( $data['rank_score'] ) ? floatval( $data['rank_score'] ) : null,
			'bias_profile'       => sniper_string_or_null( $data['bias_profile'] ?? null ),
				'structure'          => $structure_payload,
			'htf_dol'            => isset( $data['htf_dol'] ) && is_array( $data['htf_dol'] ) ? $data['htf_dol'] : null,
			'matrix'             => isset( $data['matrix'] ) && is_array( $data['matrix'] ) ? $data['matrix'] : null,
			'matrix_tf'          => sniper_string_or_null( $data['matrix_tf'] ?? null ),
			'pd_array'           => isset( $data['pd_array'] ) && is_array( $data['pd_array'] ) ? $data['pd_array'] : null,
			'pd_tf'              => sniper_string_or_null( $data['pd_tf'] ?? null ),
			'final_bias'         => sniper_string_or_null( $data['final_bias'] ?? null ),
			'bull_bias_score'    => isset( $data['bull_bias_score'] ) ? floatval( $data['bull_bias_score'] ) : null,
			'bear_bias_score'    => isset( $data['bear_bias_score'] ) ? floatval( $data['bear_bias_score'] ) : null,
			'bull_pressure'      => isset( $data['bull_pressure'] ) ? floatval( $data['bull_pressure'] ) : null,
			'bear_pressure'      => isset( $data['bear_pressure'] ) ? floatval( $data['bear_pressure'] ) : null,
			'pressure_bias'      => sniper_string_or_null( $data['pressure_bias'] ?? null ),
			'fib_disagreement_penalty' => isset( $data['fib_disagreement_penalty'] ) ? floatval( $data['fib_disagreement_penalty'] ) : null,
			'chop_band'          => isset( $data['chop_band'] ) && is_array( $data['chop_band'] ) ? $data['chop_band'] : null,
			'gate'               => sniper_string_or_null( $data['gate'] ?? null ),
			'gate_reason'        => sniper_string_or_null( $data['gate_reason'] ?? null ),
			'anchors'            => ! empty( $normalized_anchors ) ? $normalized_anchors : ( isset( $data['anchors'] ) && is_array( $data['anchors'] ) ? $data['anchors'] : null ),
			'f1_high'            => null !== $f1_high ? $f1_high : null,
			'f1_low'             => null !== $f1_low ? $f1_low : null,
			'f2_high'            => null !== $f2_high ? $f2_high : null,
			'f2_low'             => null !== $f2_low ? $f2_low : null,
			'f3_high'            => null !== $f3_high ? $f3_high : null,
			'f3_low'             => null !== $f3_low ? $f3_low : null,
			'levels'             => isset( $data['levels'] ) && is_array( $data['levels'] ) ? $data['levels'] : null,
			'blockers'           => isset( $data['blockers'] ) && is_array( $data['blockers'] ) ? $data['blockers'] : null,
			'updated_at'         => $updated_at,

				'last_authenticated'=> true,
			], function ( $v ) { return null !== $v; } ) );

		$updated++;
	}

	update_option( 'sniper_regimes', $regimes );
	update_option( 'sniper_regimes_meta', $meta );
	update_option( 'sniper_ef_levels', $ef_store, false );

	return new WP_REST_Response( [
		'ok'        => true,
		'source'    => $source,
		'updated'   => $updated,
		'skipped_stale' => $skipped_stale,
		'skipped_pairs' => $skipped_pairs,
		'stored_at' => current_time( 'c' ),
	], 200 );
}

// ── USER DATA ENDPOINTS ──────────────────────────────────────────────────────

function sniper_get_user_trades( WP_REST_Request $request ) {
	$user_id = get_current_user_id();
	return sniper_user_payload_response( 'trades', [
		'signals'       => sniper_get_user_meta_value( $user_id, 'sn_sig',    [] ),
		'snapshots'     => sniper_get_user_meta_value( $user_id, 'sn_snap',   [] ),
		'closed_trades' => sniper_get_user_meta_value( $user_id, 'sn_closed', [] ),
	] );
}

function sniper_save_user_trades( WP_REST_Request $request ) {
	$user_id = get_current_user_id();
	$body    = $request->get_json_params() ?: [];
	$signals = isset( $body['signals'] )       && is_array( $body['signals'] )       ? array_values( $body['signals'] )       : [];
	$snaps   = isset( $body['snapshots'] )     && is_array( $body['snapshots'] )     ? array_values( $body['snapshots'] )     : [];
	$closed  = isset( $body['closed_trades'] ) && is_array( $body['closed_trades'] ) ? array_values( $body['closed_trades'] ) : [];

	// Safety cap — prevent unbounded growth
	if ( count( $signals ) > 500 ) $signals = array_slice( $signals, -500 );
	if ( count( $snaps )   > 60  ) $snaps   = array_slice( $snaps, -60 );

	sniper_update_user_meta_value( $user_id, 'sn_sig',    $signals );
	sniper_update_user_meta_value( $user_id, 'sn_snap',   $snaps );
	sniper_update_user_meta_value( $user_id, 'sn_closed', $closed );

	return sniper_user_payload_response( 'trades', [
		'signals'       => $signals,
		'snapshots'     => $snaps,
		'closed_trades' => $closed,
	] );
}

function sniper_get_user_account( WP_REST_Request $request ) {
	$user_id = get_current_user_id();
	return sniper_user_payload_response( 'account', [
		'account'      => sniper_get_user_meta_value( $user_id, 'sn_act',      null ),
		'account_info' => sniper_get_user_meta_value( $user_id, 'sn_acctinfo', [] ),
		'baseline'     => sniper_get_user_meta_value( $user_id, 'sn_baseline', null ),
		'positions'    => sniper_get_user_meta_value( $user_id, 'sn_pos',      [] ),
	] );
}

function sniper_save_user_account( WP_REST_Request $request ) {
	$user_id      = get_current_user_id();
	$body         = $request->get_json_params() ?: [];
	$account      = array_key_exists( 'account', $body )      ? $body['account']      : null;
	$account_info = isset( $body['account_info'] ) && is_array( $body['account_info'] ) ? $body['account_info'] : [];
	$baseline     = array_key_exists( 'baseline', $body )     ? $body['baseline']     : null;
	$positions    = isset( $body['positions'] ) && is_array( $body['positions'] )       ? array_values( $body['positions'] ) : [];

	sniper_update_user_meta_value( $user_id, 'sn_act',      $account );
	sniper_update_user_meta_value( $user_id, 'sn_acctinfo', $account_info );
	sniper_update_user_meta_value( $user_id, 'sn_baseline', $baseline );
	sniper_update_user_meta_value( $user_id, 'sn_pos',      $positions );

	return sniper_user_payload_response( 'account', compact( 'account', 'account_info', 'baseline', 'positions' ) );
}

function sniper_get_user_settings( WP_REST_Request $request ) {
	$user_id = get_current_user_id();
	return sniper_user_payload_response( 'settings', [
		'start_date'        => sniper_get_user_meta_value( $user_id, 'sn_start',  '' ),
		'fib_timeframe'     => sniper_get_user_meta_value( $user_id, 'sn_fib_tf', 'Yearly' ),
		'watchlist'         => sniper_get_user_watchlist( $user_id ),
		'supported_symbols' => sniper_supported_watchlist_symbols(),
	] );
}

function sniper_save_user_settings( WP_REST_Request $request ) {
	$user_id       = get_current_user_id();
	$body          = $request->get_json_params() ?: [];
	$start_date    = isset( $body['start_date'] )    ? sanitize_text_field( $body['start_date'] )    : '';
	$fib_timeframe = isset( $body['fib_timeframe'] ) ? sanitize_text_field( $body['fib_timeframe'] ) : sniper_get_user_meta_value( $user_id, 'sn_fib_tf', 'Yearly' );
	$watchlist     = isset( $body['watchlist'] ) && is_array( $body['watchlist'] )
		? sniper_save_user_watchlist( $user_id, $body['watchlist'] )
		: sniper_get_user_watchlist( $user_id );

	sniper_update_user_meta_value( $user_id, 'sn_start',  $start_date );
	sniper_update_user_meta_value( $user_id, 'sn_fib_tf', $fib_timeframe );

	return sniper_user_payload_response( 'settings', [
		'start_date'    => $start_date,
		'fib_timeframe' => $fib_timeframe,
		'watchlist'     => $watchlist,
	] );
}

function sniper_canonical_fib_timeframe_key( $raw ) {
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

// ── EXECUTION ENGINE (loaded from separate file) ─────────────────────────────
// Provides: sniper_exe_get_risk_profile, sniper_exe_save_risk_profile,
//           sniper_exe_get_trade_queue,  sniper_exe_save_trade_queue,
//           sniper_exe_execute_signals

if ( file_exists( SNIPER_PLUGIN_DIR . 'sniper-execution-engine.php' ) ) {
	require_once SNIPER_PLUGIN_DIR . 'sniper-execution-engine.php';
} else {
	// Named stubs so all 5 execution routes return 503 (not 500) when the engine file is absent.
	function sniper_exe_get_risk_profile() {
		return new WP_REST_Response( [ 'error' => 'Execution engine not installed', 'hint' => 'Upload sniper-execution-engine.php to the plugin directory.' ], 503 );
	}
	function sniper_exe_save_risk_profile() {
		return new WP_REST_Response( [ 'error' => 'Execution engine not installed', 'hint' => 'Upload sniper-execution-engine.php to the plugin directory.' ], 503 );
	}
	function sniper_exe_get_trade_queue() {
		return new WP_REST_Response( [ 'error' => 'Execution engine not installed', 'hint' => 'Upload sniper-execution-engine.php to the plugin directory.' ], 503 );
	}
	function sniper_exe_save_trade_queue() {
		return new WP_REST_Response( [ 'error' => 'Execution engine not installed', 'hint' => 'Upload sniper-execution-engine.php to the plugin directory.' ], 503 );
	}
	function sniper_exe_execute_signals() {
		return new WP_REST_Response( [ 'error' => 'Execution engine not installed', 'hint' => 'Upload sniper-execution-engine.php to the plugin directory.' ], 503 );
	}
}

// ── DASHBOARD SERVING ────────────────────────────────────────────────────────

add_action( 'template_redirect', 'sniper_serve_dashboard', 1 );

function sniper_serve_dashboard() {
	if ( ! is_page( 'dashboard' ) ) return;

	if ( ! is_user_logged_in() ) {
		wp_redirect( wp_login_url( get_permalink() ) );
		exit;
	}

	$file = SNIPER_PLUGIN_DIR . 'templates/dashboard-ui.html';
	$version_label = 'v' . SNIPER_PLATFORM_VERSION;

	if ( ! file_exists( $file ) ) {
		wp_die(
			'<div style="font-family:monospace;background:#080b10;color:#e8a020;padding:60px;text-align:center">'
			. '<h2 style="color:#e8a020;margin-bottom:16px">SMC SuperFIB ' . esc_html( $version_label ) . ' — Dashboard file not found</h2>'
			. '<p style="color:#8899b0;margin-bottom:12px">Upload <strong style="color:#dde4f0">dashboard-ui.html</strong> to the plugin templates folder:</p>'
			. '<code style="display:block;background:#111620;color:#dde4f0;padding:12px 18px;border-radius:4px;font-size:13px">'
			. esc_html( $file )
			. '</code>'
			. '</div>',
			'SMC Dashboard — Missing File',
			[ 'response' => 503 ]
		);
	}

	$nonce     = wp_create_nonce( 'wp_rest' );
	$user      = wp_get_current_user();
	$home      = home_url();
	$rest_root = get_rest_url( null, 'sniper/v1/' );
	$user_id   = (int) $user->ID;
	$fib_tf    = sniper_canonical_fib_timeframe_key(
		sniper_get_user_meta_value( $user_id, 'sn_fib_tf', 'Yearly' )
	);
	$user_account = [
		'id'           => $user_id,
		'display_name' => $user->display_name,
		'email'        => $user->user_email,
		'logout_url'   => wp_logout_url( home_url( '/dashboard/' ) ),
		'is_admin'     => in_array( 'administrator', (array) $user->roles, true ),
	];

	$styles  = "\n<!-- SMC SuperFIB {$version_label} - styles injected by plugin -->\n";
	$styles .= '<link rel="preconnect" href="https://fonts.googleapis.com">' . "\n";
	$styles .= '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' . "\n";
	$styles .= '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">' . "\n";
	$styles .= '<link rel="stylesheet" href="' . esc_url( SNIPER_PLUGIN_URL . 'assets/css/style.css?ver=' . rawurlencode( SNIPER_PLATFORM_VERSION ) ) . '">' . "\n";

	$asset_ver = file_exists( SNIPER_PLUGIN_DIR . 'assets/js/sniper-dashboard.js' )
		? (string) filemtime( SNIPER_PLUGIN_DIR . 'assets/js/sniper-dashboard.js' )
		: SNIPER_PLATFORM_VERSION;
	$core_asset_ver = file_exists( SNIPER_PLUGIN_DIR . 'assets/js/sniper-dashboard-core.js' )
		? (string) filemtime( SNIPER_PLUGIN_DIR . 'assets/js/sniper-dashboard-core.js' )
		: $asset_ver;
	$planner_asset_ver = file_exists( SNIPER_PLUGIN_DIR . 'assets/js/sniper-dashboard-planner.js' )
		? (string) filemtime( SNIPER_PLUGIN_DIR . 'assets/js/sniper-dashboard-planner.js' )
		: $asset_ver;
	$data_asset_ver = file_exists( SNIPER_PLUGIN_DIR . 'sniper-dashboard-data.js' )
		? (string) filemtime( SNIPER_PLUGIN_DIR . 'sniper-dashboard-data.js' )
		: $asset_ver;

	$inject  = "\n<script>\n";
	$inject .= "/* SMC SuperFIB {$version_label} - WP context injected server-side */\n";
	$inject .= 'window.SNIPER = ' . wp_json_encode( [
		'version'        => SNIPER_PLATFORM_VERSION,
		'rest_url'       => esc_url_raw( $rest_root ),
		'nonce'          => $nonce,
		'wp_base'        => esc_url_raw( $home ),
		'fib_timeframe'  => $fib_tf,
		'user_account'   => $user_account,
		'user'           => $user_account,
	] ) . ";\n";
	$inject .= 'window.wpApiSettings = { nonce: ' . wp_json_encode( $nonce ) . ', root: ' . wp_json_encode( $rest_root ) . " };\n";
	$inject .= "</script>\n";

	// JS dependencies injected before </body> so they load after the HTML structure
	$scripts  = "\n<!-- SMC SuperFIB {$version_label} - scripts injected by plugin -->\n";
	$scripts .= '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>' . "\n";
	$scripts .= '<script src="' . esc_url( SNIPER_PLUGIN_URL . 'sniper-dashboard-data.js?ver=' . rawurlencode( $data_asset_ver ) ) . '"></script>' . "\n";
	$scripts .= '<script src="' . esc_url( SNIPER_PLUGIN_URL . 'assets/js/sniper-dashboard-core.js?ver=' . rawurlencode( $core_asset_ver ) ) . '"></script>' . "\n";
	$scripts .= '<script src="' . esc_url( SNIPER_PLUGIN_URL . 'assets/js/sniper-dashboard-planner.js?ver=' . rawurlencode( $planner_asset_ver ) ) . '"></script>' . "\n";
	$scripts .= '<script src="' . esc_url( SNIPER_PLUGIN_URL . 'assets/js/sniper-dashboard.js?ver=' . rawurlencode( $asset_ver ) ) . '"></script>' . "\n";

	// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
	$html = file_get_contents( $file );
	$html = str_replace( '__SNIPER_VERSION__', esc_html( $version_label ), $html );
	$html = str_replace( '</head>', $styles . $inject . '</head>', $html );
	$html = str_replace( '</body>', $scripts . '</body>', $html );

	header( 'Content-Type: text/html; charset=utf-8' );
	header( 'X-Frame-Options: SAMEORIGIN' );
	header( 'Cache-Control: no-store, no-cache, must-revalidate' );
	header( 'Pragma: no-cache' );
	// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	echo $html;
	exit;
}

// ── SHORTCODES ───────────────────────────────────────────────────────────────

add_action( 'init', function () {
	add_shortcode( 'sniper_dashboard', 'sniper_sc_dashboard' );
	add_shortcode( 'sniper_home',      'sniper_sc_home' );
	add_shortcode( 'sniper_account',   'sniper_sc_account' );
	add_shortcode( 'sniper_login',     'sniper_sc_login' );
} );

function sniper_sc_dashboard() {
	if ( ! is_user_logged_in() ) {
		return '<section class="smc-site-shell"><p class="smc-site-kicker">Secure Access</p><h2 class="smc-site-title">Dashboard access requires an authenticated account.</h2><p class="smc-site-copy">Log in to open the live execution workspace, review your account context, and load the latest signal plan.</p><div class="smc-page-actions"><a class="smc-button" href="' . esc_url( wp_login_url( get_permalink() ) ) . '">Log In</a></div></section>';
	}

	ob_start();
	?>
	<section class="smc-site-shell">
		<p class="smc-site-kicker">Dashboard Ready</p>
		<h2 class="smc-site-title">Launch the production workspace.</h2>
		<p class="smc-site-copy">Open the redesigned dashboard to manage uploads, planning, live radar, and account analytics from one modular surface.</p>
		<div class="smc-page-actions">
			<a class="smc-button" href="<?php echo esc_url( home_url( '/dashboard/' ) ); ?>">Open Dashboard</a>
			<a class="smc-button smc-button--ghost" href="<?php echo esc_url( home_url( '/account/' ) ); ?>">View Account</a>
		</div>
	</section>
	<?php
	return ob_get_clean();
}

function sniper_sc_home() {
	$live_count   = count( sniper_get_live_store() );
	$regimes      = get_option( 'sniper_regimes', [] );
	$regime_count = count( array_filter( $regimes ) );
	$primary_url  = is_user_logged_in() ? home_url( '/dashboard/' ) : home_url( '/login/' );
	$primary_text = is_user_logged_in() ? 'Open Dashboard' : 'Secure Login';

	ob_start();
	?>
	<section class="smc-site-shell">
		<div class="smc-site-grid">
			<div>
				<p class="smc-site-kicker">Institutional Workflow</p>
				<h2 class="smc-site-title">A cleaner command center for SuperFIB execution.</h2>
				<p class="smc-site-copy">The platform now follows the same philosophy as the backend engine: modular components, mobile-first structure, and a calmer fintech surface for Home, Dashboard, Account, and Login.</p>
				<div class="smc-page-actions">
					<a class="smc-button" href="<?php echo esc_url( $primary_url ); ?>"><?php echo esc_html( $primary_text ); ?></a>
					<a class="smc-button smc-button--ghost" href="<?php echo esc_url( home_url( '/account/' ) ); ?>">Account</a>
				</div>
			</div>
			<div>
				<div class="smc-site-stats">
					<div class="smc-site-stat">
						<div class="clbl">Live Instruments</div>
						<strong><?php echo esc_html( $live_count ); ?></strong>
						<p class="csub">Authenticated markets currently tracked by the live store.</p>
					</div>
					<div class="smc-site-stat">
						<div class="clbl">Active Regimes</div>
						<strong><?php echo esc_html( $regime_count ); ?></strong>
						<p class="csub">Pairs with server-side regime state already saved.</p>
					</div>
				</div>
				<div class="smc-site-panel">
					<div class="clbl">Design Direction</div>
					<div class="smc-info-list">
						<div class="smc-info-row"><span>Typography</span><span>Inter + JetBrains Mono</span></div>
						<div class="smc-info-row"><span>Layout</span><span>Mobile-first dashboard shell</span></div>
						<div class="smc-info-row"><span>Components</span><span>Stat cards, info blocks, table standard</span></div>
					</div>
				</div>
			</div>
		</div>
	</section>
	<?php
	return ob_get_clean();
}

function sniper_sc_account() {
	if ( ! is_user_logged_in() ) {
		return '<section class="smc-site-shell"><p class="smc-site-kicker">Account</p><h2 class="smc-site-title">Log in to view your account space.</h2><p class="smc-site-copy">Your account page shares the same design system as the dashboard and is only available to authenticated users.</p><div class="smc-page-actions"><a class="smc-button" href="' . esc_url( wp_login_url( get_permalink() ) ) . '">Log In</a></div></section>';
	}

	$user = wp_get_current_user();
	ob_start();
	?>
	<section class="smc-site-shell">
		<div class="smc-site-grid">
			<div class="smc-page-card">
				<p class="smc-site-kicker">Account</p>
				<h2 class="smc-site-title">Personal workspace details.</h2>
				<p class="smc-site-copy">This page mirrors the dashboard language so account context, auth, and execution tooling feel like one product instead of separate screens.</p>
				<div class="smc-info-list">
					<div class="smc-info-row"><span>Name</span><span><?php echo esc_html( $user->display_name ); ?></span></div>
					<div class="smc-info-row"><span>Email</span><span><?php echo esc_html( $user->user_email ); ?></span></div>
					<div class="smc-info-row"><span>Role</span><span><?php echo esc_html( implode( ', ', (array) $user->roles ) ); ?></span></div>
				</div>
			</div>
			<div>
				<div class="smc-site-panel">
					<div class="clbl">Quick Actions</div>
					<div class="smc-page-actions">
						<a class="smc-button" href="<?php echo esc_url( home_url( '/dashboard/' ) ); ?>">Open Dashboard</a>
						<a class="smc-button smc-button--ghost" href="<?php echo esc_url( wp_logout_url( home_url( '/' ) ) ); ?>">Logout</a>
					</div>
				</div>
				<div class="smc-site-panel">
					<div class="clbl">Why This Matters</div>
					<p class="csub">Consistent UI primitives across account, login, home, and dashboard reduce context switching and make the product feel production-grade.</p>
				</div>
			</div>
		</div>
	</section>
	<?php
	return ob_get_clean();
}

function sniper_sc_login() {
	if ( is_user_logged_in() ) {
		wp_redirect( home_url( '/dashboard/' ) );
		exit;
	}

	$action_url   = esc_url( site_url( 'wp-login.php' ) );
	$redirect_url = esc_url( home_url( '/dashboard/' ) );
	$lost_pw_url  = esc_url( wp_lostpassword_url( home_url( '/login/' ) ) );
	$error        = isset( $_GET['login'] ) && $_GET['login'] === 'failed';

	ob_start();
	?>
	<section class="smc-auth-shell">
		<div class="smc-auth-layout">
			<div class="smc-auth-aside">
				<div>
					<p class="smc-auth-kicker">Secure Login</p>
					<h2 class="smc-auth-title">Sign in to the SuperFIB workspace.</h2>
					<p class="smc-auth-copy">The login page now follows the same institutional visual system as the dashboard, so authentication feels like part of the product instead of an unrelated template.</p>
				</div>
				<div class="smc-auth-points">
					<div class="smc-auth-point"><div class="clbl">Unified Design</div><p class="csub">Shared typography, spacing, and component treatment across the entire frontend.</p></div>
					<div class="smc-auth-point"><div class="clbl">Execution Ready</div><p class="csub">Login flows straight back into the dashboard so the workflow starts where the decisions happen.</p></div>
					<div class="smc-auth-point"><div class="clbl">Future App Ready</div><p class="csub">The layout is structured as reusable surfaces rather than one-off page styling.</p></div>
				</div>
			</div>
			<div class="smc-auth-card">
				<p class="smc-auth-kicker">Account Manager</p>
				<h3 style="margin:0 0 0.5rem">SMC <span style="color:var(--ac)">SuperFIB</span></h3>
				<p class="csub" style="margin-top:0">Sign in to continue to your dashboard.</p>
				<?php if ( $error ) : ?>
					<div class="smc-error">Incorrect username or password. Please try again.</div>
				<?php endif; ?>
				<form class="smc-auth-form" method="post" action="<?php echo $action_url; ?>">
					<input type="hidden" name="redirect_to" value="<?php echo $redirect_url; ?>">
					<input type="hidden" name="testcookie" value="1">
					<div class="smc-field">
						<label for="smc-login-user">Username or Email</label>
						<input id="smc-login-user" type="text" name="log" autocomplete="username" required>
					</div>
					<div class="smc-field">
						<label for="smc-login-password">Password</label>
						<input id="smc-login-password" type="password" name="pwd" autocomplete="current-password" required>
					</div>
					<div class="smc-auth-row">
						<label class="smc-auth-check"><input type="checkbox" name="rememberme" value="forever"> <span>Remember me</span></label>
						<a href="<?php echo $lost_pw_url; ?>">Forgot password?</a>
					</div>
					<button class="smc-button" type="submit" name="wp-submit">Log In</button>
				</form>
			</div>
		</div>
	</section>
	<?php
	return ob_get_clean();
}
// ── LOGIN FLOW HOOKS ─────────────────────────────────────────────────────────

// Redirect logged-in users away from /login/
add_action( 'template_redirect', function () {
	if ( is_page( 'login' ) && is_user_logged_in() ) {
		wp_redirect( home_url( '/dashboard/' ) );
		exit;
	}
} );

// Route front-end login attempts to /login/ (skip wp-admin flows)
add_filter( 'login_url', function ( $login_url, $redirect ) {
	if ( $redirect && strpos( $redirect, 'wp-admin' ) !== false ) return $login_url;
	return home_url( '/login/' ) . ( $redirect ? '?redirect_to=' . urlencode( $redirect ) : '' );
}, 10, 2 );

// On failed login bounce back to /login/
add_action( 'wp_login_failed', function ( $username, $error ) {
	$referrer = wp_get_referer();
	if ( $referrer && strpos( $referrer, 'wp-login.php' ) === false ) {
		wp_redirect( home_url( '/login/?login=failed' ) );
		exit;
	}
}, 10, 2 );

// ── ADMIN SETTINGS ───────────────────────────────────────────────────────────

add_action( 'admin_menu', 'sniper_add_admin_menu' );
add_action( 'admin_init', 'sniper_register_settings' );

function sniper_add_admin_menu() {
	add_options_page( 'SMC SuperFIB Settings', 'SMC SuperFIB', 'manage_options', 'sniper-settings', 'sniper_settings_page' );
}

function sniper_register_settings() {
	register_setting( 'sniper_settings_group', 'sniper_webhook_secret',  'sanitize_text_field' );
	register_setting( 'sniper_settings_group', 'sniper_backend_secret',  'sanitize_text_field' );
	register_setting( 'sniper_settings_group', 'sniper_td_key',          'sanitize_text_field' );
	register_setting( 'sniper_settings_group', 'sniper_allowed_origins', 'sniper_sanitize_allowed_origins' );
}

function sniper_sanitize_allowed_origins( $input ) {
	$origins = is_string( $input )
		? array_map( 'trim', explode( ',', $input ) )
		: ( is_array( $input ) ? $input : [] );
	return array_values( array_filter( $origins ) );
}

function sniper_settings_page() {
	?>
	<div class="wrap">
		<h1>SMC SuperFIB Settings</h1>
		<form method="post" action="options.php">
			<?php settings_fields( 'sniper_settings_group' ); ?>
			<table class="form-table">
				<tr>
					<th scope="row">Webhook Secret</th>
					<td>
						<input type="text" name="sniper_webhook_secret" class="regular-text"
							value="<?php echo esc_attr( sniper_get_secret() ); ?>">
						<p class="description">Authenticates incoming signals (header <code>X-Sniper-Secret</code> or JSON <code>secret</code> field).</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Backend Secret (JS Engine)</th>
					<td>
						<input type="text" name="sniper_backend_secret" class="regular-text"
							value="<?php echo esc_attr( sniper_get_backend_secret() ); ?>">
						<p class="description">Used by the frontend JS engine for <code>/user/engine-batch</code> and <code>/user/market-data</code>. Leave empty to use the webhook secret.</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Twelve Data API Key</th>
					<td>
						<input type="password" name="sniper_td_key" class="regular-text"
							value="<?php echo esc_attr( sniper_get_td_key() ); ?>">
						<p class="description">Live price feed for the dashboard price/signal engine. This is the only supported Twelve Data key entry point. Get your key at <a href="https://twelvedata.com" target="_blank">twelvedata.com</a>.</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Allowed Origins (CORS)</th>
					<td>
						<input type="text" name="sniper_allowed_origins" class="large-text"
							value="<?php echo esc_attr( implode( ', ', sniper_get_allowed_origins() ) ); ?>">
						<p class="description">Comma-separated list of origins allowed for cross-origin requests.</p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
		<hr>
		<h2>System Status</h2>
		<table class="form-table">
			<tr><th>Live Signals Stored</th><td><?php echo esc_html( count( sniper_get_live_store() ) ); ?> instruments</td></tr>
			<tr><th>Execution Engine</th><td><?php echo file_exists( SNIPER_PLUGIN_DIR . 'sniper-execution-engine.php' ) ? '✅ Loaded' : '⚠️ Not found — upload sniper-execution-engine.php'; ?></td></tr>
			<tr><th>Dashboard Template</th><td><?php echo file_exists( SNIPER_PLUGIN_DIR . 'templates/dashboard-ui.html' ) ? '✅ Found' : '⚠️ Not found — upload templates/dashboard-ui.html'; ?></td></tr>
			<tr><th>Dashboard JS</th><td><?php echo file_exists( SNIPER_PLUGIN_DIR . 'assets/js/sniper-dashboard.js' ) ? '✅ Found' : '⚠️ Not found — upload assets/js/sniper-dashboard.js'; ?></td></tr>
		</table>
		<hr>
		<h2>TradingView Webhook Diagnostics</h2>
		<table class="form-table">
			<tr><th>Last Alert At</th><td><code><?php echo esc_html( (string) get_option( 'sniper_last_tv_alert_at', '' ) ); ?></code></td></tr>
			<tr><th>Last Alert Type</th><td><code><?php echo esc_html( (string) get_option( 'sniper_last_tv_alert_type', '' ) ); ?></code></td></tr>
			<tr><th>Last Alert Symbol</th><td><code><?php echo esc_html( (string) get_option( 'sniper_last_tv_alert_symbol', '' ) ); ?></code></td></tr>
			<tr><th>Last Alert Result</th><td><code><?php echo esc_html( (string) get_option( 'sniper_last_tv_alert_result', '' ) ); ?></code></td></tr>
			<tr><th>Last Alert Payload</th><td><textarea readonly rows="8" cols="120" style="width:100%;"><?php echo esc_textarea( (string) get_option( 'sniper_last_tv_alert', '' ) ); ?></textarea></td></tr>
		</table>
	</div>
	<?php
}

// ── CORS MIDDLEWARE ───────────────────────────────────────────────────────────

add_action( 'rest_api_init', function () {
	remove_filter( 'rest_pre_serve_request', 'rest_send_cors_headers' );
	add_filter( 'rest_pre_serve_request', function ( $value ) {
		$origin  = isset( $_SERVER['HTTP_ORIGIN'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_ORIGIN'] ) ) : '';
		$allowed = sniper_get_allowed_origins();

		if ( 'null' === $origin ) {
			header( 'Access-Control-Allow-Origin: null' );
		} elseif ( in_array( $origin, $allowed, true ) ) {
			header( 'Access-Control-Allow-Origin: ' . esc_url_raw( $origin ) );
		}

		header( 'Access-Control-Allow-Methods: GET, POST, OPTIONS' );
		header( 'Access-Control-Allow-Headers: Content-Type, X-Sniper-Secret, X-WP-Nonce, Authorization' );
		header( 'Access-Control-Allow-Credentials: ' . ( in_array( $origin, $allowed, true ) && 'null' !== $origin ? 'true' : 'false' ) );
		return $value;
	} );
}, 15 );

// ── ACTIVATION HOOK ───────────────────────────────────────────────────────────

register_activation_hook( __FILE__, 'sniper_plugin_activate' );

function sniper_plugin_activate() {
	sniper_create_site_pages();
	flush_rewrite_rules();
}

function sniper_create_site_pages() {
	$pages = [
		[ 'title' => 'Home',       'slug' => 'home',      'content' => '[sniper_home]',      'front' => true ],
		[ 'title' => 'Dashboard',  'slug' => 'dashboard', 'content' => '[sniper_dashboard]'               ],
		[ 'title' => 'My Account', 'slug' => 'account',   'content' => '[sniper_account]'                 ],
		[ 'title' => 'Login',      'slug' => 'login',     'content' => '[sniper_login]'                   ],
	];

	foreach ( $pages as $page_data ) {
		if ( get_page_by_path( $page_data['slug'] ) ) continue;
		$id = wp_insert_post( [
			'post_title'   => $page_data['title'],
			'post_content' => $page_data['content'],
			'post_status'  => 'publish',
			'post_type'    => 'page',
			'post_name'    => $page_data['slug'],
		] );
		if ( ! is_wp_error( $id ) && ! empty( $page_data['front'] ) ) {
			update_option( 'show_on_front', 'page' );
			update_option( 'page_on_front', $id );
		}
	}
	sniper_setup_nav_menu();
}

function sniper_setup_nav_menu() {
	$menu_name = 'SMC SuperFIB Primary';
	if ( wp_get_nav_menu_object( $menu_name ) ) return;
	$menu_id = wp_create_nav_menu( $menu_name );
	if ( is_wp_error( $menu_id ) ) return;

	foreach ( [ 'Home' => '/', 'Dashboard' => '/dashboard/', 'My Account' => '/account/', 'Login' => '/login/' ] as $label => $path ) {
		wp_update_nav_menu_item( $menu_id, 0, [
			'menu-item-title'  => $label,
			'menu-item-url'    => home_url( $path ),
			'menu-item-status' => 'publish',
		] );
	}
	$locations = get_theme_mod( 'nav_menu_locations', [] );
	foreach ( array_keys( (array) get_registered_nav_menus() ) as $loc ) {
		$locations[ $loc ] = $menu_id;
	}
	set_theme_mod( 'nav_menu_locations', $locations );
}

add_filter( 'wp_nav_menu_objects', function ( $items ) {
	foreach ( $items as $item ) {
		if ( trim( wp_strip_all_tags( $item->title ) ) !== 'Login' ) {
			continue;
		}
		if ( is_user_logged_in() ) {
			$item->title = 'Logout';
			$item->url   = wp_logout_url( home_url( '/' ) );
		}
	}
	return $items;
} );
