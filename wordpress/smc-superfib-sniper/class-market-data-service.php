<?php
/**
 * SMC SuperFib Market Data Service
 * 
 * Handles authoritative market data from MT5 EA.
 * Serves as the single source of truth for prices, candles, freshness, and sessions.
 * 
 * @version 2.0 - MT5 Authority
 */

class SMC_MarketData_Service
{
    private $wpdb;
    private $table_prefix;

    public function __construct()
    {
        global $wpdb;
        $this->wpdb = $wpdb;
        $this->table_prefix = $wpdb->prefix . 'smc_sf_';
    }

    /**
     * Store MT5 tick snapshot
     * 
     * @param int $user_id
     * @param string $symbol Normalized symbol
     * @param array $tick Tick data: bid, ask, spread, timestamp, volume
     * @return bool
     */
    public function store_tick_snapshot($user_id, $symbol, $tick)
    {
        if (!isset($tick['bid'], $tick['ask'], $tick['timestamp']))
            return false;

        $bid = (float) $tick['bid'];
        $ask = (float) $tick['ask'];
        $spread = isset($tick['spread']) ? (int) round((float) $tick['spread']) : (int) (($ask - $bid) * 100000);
        $mid = ($bid + $ask) / 2;
        $timestamp = $this->normalize_market_timestamp(
            isset($tick['timestamp']) ? $tick['timestamp'] : null,
            null
        );
        if ($timestamp === null) {
            return false;
        }
        $freshness = $this->normalize_freshness(isset($tick['freshness']) ? $tick['freshness'] : 'LIVE');
        $state = $freshness === 'CLOSED' || $freshness === 'DISCONNECTED'
            ? 'offline'
            : ($freshness === 'LIVE' ? 'live' : 'stale');

        return $this->wpdb->replace(
            $this->table_prefix . 'snapshots',
            array(
                'user_id' => $user_id,
                'symbol' => strtoupper(sanitize_text_field($symbol)),
                'bid' => $bid,
                'ask' => $ask,
                'mid' => $mid,
                'spread' => $spread,
                'change_pct_1d' => 0,
                'source' => 'mt5',
                'state' => $state,
                'updated_at' => $timestamp,
            ),
            array('%d', '%s', '%f', '%f', '%f', '%d', '%f', '%s', '%s', '%s')
        ) !== false;
    }

    /**
     * Store M1 canonical candle
     * 
     * @param int $user_id
     * @param string $symbol Normalized symbol
     * @param array $candle Candle data: open, high, low, close, volume, timestamp
     * @return bool
     */
    public function store_candle_m1($user_id, $symbol, $candle)
    {
        if (!isset($candle['open'], $candle['high'], $candle['low'], $candle['close'], $candle['timestamp']))
            return false;

        $open = (float) $candle['open'];
        $high = (float) $candle['high'];
        $low = (float) $candle['low'];
        $close = (float) $candle['close'];
        $volume = isset($candle['volume']) ? (int) $candle['volume'] : 0;
        $timestamp = $this->normalize_market_timestamp($candle['timestamp'], null, true);
        if ($timestamp === null) {
            return false;
        }

        return $this->wpdb->replace(
            $this->table_prefix . 'candles',
            array(
                'user_id' => $user_id,
                'symbol' => strtoupper(sanitize_text_field($symbol)),
                'timeframe' => '1min',
                'candle_time' => $timestamp,
                'open' => $open,
                'high' => $high,
                'low' => $low,
                'close' => $close,
                'volume' => (string) $volume,
                'source' => 'mt5',
                'created_at' => gmdate('Y-m-d H:i:s'),
            ),
            array('%d', '%s', '%s', '%s', '%f', '%f', '%f', '%f', '%s', '%s', '%s')
        ) !== false;
    }

    /**
     * Store freshness state
     * 
     * @param int $user_id
     * @param string $symbol
     * @param string $state LIVE|DELAYED|STALE|CLOSED|DISCONNECTED
     * @return bool
     */
    public function store_freshness($user_id, $symbol, $state)
    {
        $normalized = $this->normalize_freshness($state);

        if ($normalized === '')
            return false;

        $key = 'smc_sf_freshness_' . $user_id . '_' . strtoupper(sanitize_text_field($symbol));
        return set_transient($key, $normalized, 300) !== false;  // 5 min TTL
    }

    /**
     * Get current freshness state
     * 
     * @param int $user_id
     * @param string $symbol
     * @return string|false
     */
    public function get_freshness($user_id, $symbol)
    {
        $key = 'smc_sf_freshness_' . $user_id . '_' . strtoupper(sanitize_text_field($symbol));
        $state = get_transient($key);
        return $state !== false ? $state : 'DISCONNECTED';
    }

    /**
     * Store session state
     * 
     * @param int $user_id
     * @param string $symbol
     * @param string $session Sydney|Tokyo|London|New York|Overlap|Weekend|Closed
     * @return bool
     */
    public function store_session($user_id, $symbol, $session)
    {
        $normalized = $this->normalize_session($session);
        if ($normalized === '')
            return false;

        $key = 'smc_sf_session_' . $user_id . '_' . strtoupper(sanitize_text_field($symbol));
        return set_transient($key, $normalized, 300) !== false;
    }

    /**
     * Get current session
     * 
     * @param int $user_id
     * @param string $symbol
     * @return string
     */
    public function get_session($user_id, $symbol)
    {
        $key = 'smc_sf_session_' . $user_id . '_' . strtoupper(sanitize_text_field($symbol));
        $session = get_transient($key);
        return $session !== false ? $session : 'Unknown';
    }

    /**
     * Get latest price snapshot (authoritative MT5 data)
     * 
     * @param int $user_id
     * @param string $symbol
     * @return array|null
     */
    public function get_price_snapshot($user_id, $symbol)
    {
        $row = $this->wpdb->get_row($this->wpdb->prepare(
            "SELECT * FROM {$this->table_prefix}snapshots WHERE user_id = %d AND symbol = %s AND source = %s ORDER BY updated_at DESC LIMIT 1",
            $user_id,
            strtoupper(sanitize_text_field($symbol)),
            'mt5'
        ), ARRAY_A);

        if (!$row)
            return null;

        $freshness = $this->get_freshness($user_id, $row['symbol']);
        $state = (string) ($row['state'] ?? 'offline');
        if ($state === 'offline' && $freshness === 'CLOSED') {
            $reference_timestamp = $this->latest_mt5_broker_timestamp($user_id);
            if ($reference_timestamp !== null && $this->is_market_expected_open($row['symbol'], $reference_timestamp)) {
                $state = 'stale';
                error_log(sprintf(
                    '[SMC_MT5_REOPEN_OVERRIDE] symbol=%s freshness=%s stored_at=%s reference_at=%s',
                    $row['symbol'],
                    $freshness,
                    (string) $row['updated_at'],
                    $reference_timestamp
                ));
            }
        }

        return array(
            'symbol' => $row['symbol'],
            'bid' => (float) $row['bid'],
            'ask' => (float) $row['ask'],
            'mid' => (float) $row['mid'],
            'spread' => (int) $row['spread'],
            'freshness' => $freshness,
            'session' => $this->get_session($user_id, $row['symbol']),
            'state' => $state,
            'updated_at' => $this->to_iso($row['updated_at']),
        );
    }

    /**
     * Get M1 candles (MT5 authoritative)
     * 
     * @param int $user_id
     * @param string $symbol
     * @param int $count How many candles
     * @return array
     */
    public function get_candles_m1($user_id, $symbol, $count = 120)
    {
        $rows = $this->wpdb->get_results($this->wpdb->prepare(
            "SELECT * FROM {$this->table_prefix}candles WHERE user_id = %d AND symbol = %s AND timeframe = %s AND source = %s ORDER BY candle_time DESC LIMIT %d",
            $user_id,
            strtoupper(sanitize_text_field($symbol)),
            '1min',
            'mt5',
            $count
        ), ARRAY_A);

        if (!$rows)
            return array();

        $candles = array_map(function ($row) {
            return array(
                'time' => $this->to_iso($row['candle_time']),
                'open' => (float) $row['open'],
                'high' => (float) $row['high'],
                'low' => (float) $row['low'],
                'close' => (float) $row['close'],
                'volume' => (int) $row['volume'],
            );
        }, array_reverse($rows));

        return $candles;
    }

    /**
     * Get Phase 4 parity candles from MT5 only.
     *
     * Uses direct MT5 timeframe rows when present, otherwise aggregates
     * canonical MT5 M1 candles into UTC buckets. Never reads fallback candles.
     *
     * @param int $user_id
     * @param string $symbol
     * @param string $timeframe M15|H1|H4|D1
     * @param int $count Number of output candles
     * @return array
     */
    public function get_phase4_candles($user_id, $symbol, $timeframe, $count = 600)
    {
        $symbol = strtoupper(sanitize_text_field($symbol));
        $timeframe = strtoupper(sanitize_text_field($timeframe));
        $count = max(1, min(2000, (int) $count));

        $map = array(
            'M15' => array('db' => '15min', 'seconds' => 900),
            'H1' => array('db' => '1h', 'seconds' => 3600),
            'H4' => array('db' => '4h', 'seconds' => 14400),
            'D1' => array('db' => '1day', 'seconds' => 86400),
        );

        if (!isset($map[$timeframe])) {
            return array();
        }

        $direct = $this->get_mt5_candles_for_timeframe($user_id, $symbol, $map[$timeframe]['db'], $count);
        if (!empty($direct)) {
            return $direct;
        }

        return $this->aggregate_mt5_m1_candles($user_id, $symbol, (int) $map[$timeframe]['seconds'], $count);
    }

    private function get_mt5_candles_for_timeframe($user_id, $symbol, $timeframe, $count)
    {
        $rows = $this->wpdb->get_results($this->wpdb->prepare(
            "SELECT * FROM {$this->table_prefix}candles WHERE user_id = %d AND symbol = %s AND timeframe = %s AND source = %s ORDER BY candle_time DESC LIMIT %d",
            $user_id,
            $symbol,
            $timeframe,
            'mt5',
            $count
        ), ARRAY_A);

        if (empty($rows)) {
            return array();
        }

        return array_map(array($this, 'map_candle_row'), array_reverse($rows));
    }

    private function aggregate_mt5_m1_candles($user_id, $symbol, $bucket_seconds, $count)
    {
        $minutes_per_bucket = max(1, (int) floor($bucket_seconds / 60));
        $overfetch_buckets = max(2, min(10, (int) ceil($count * 0.1)));
        $m1_limit = max(1, ($count + $overfetch_buckets) * $minutes_per_bucket);
        $rows = $this->wpdb->get_results($this->wpdb->prepare(
            "SELECT * FROM {$this->table_prefix}candles WHERE user_id = %d AND symbol = %s AND timeframe = %s AND source = %s ORDER BY candle_time DESC LIMIT %d",
            $user_id,
            $symbol,
            '1min',
            'mt5',
            $m1_limit
        ), ARRAY_A);

        if (empty($rows)) {
            return array();
        }

        $buckets = array();
        $bucket_minutes = array();
        $now = time();
        foreach (array_reverse($rows) as $row) {
            $ts = strtotime((string) $row['candle_time'] . ' UTC');
            if ($ts === false) {
                continue;
            }

            $minute_start = (int) (floor($ts / 60) * 60);
            $bucket_start = (int) (floor($ts / $bucket_seconds) * $bucket_seconds);
            if (($bucket_start + $bucket_seconds) > $now) {
                continue;
            }

            if (!isset($bucket_minutes[$bucket_start])) {
                $bucket_minutes[$bucket_start] = array();
            }
            $bucket_minutes[$bucket_start][$minute_start] = true;

            if (!isset($buckets[$bucket_start])) {
                $buckets[$bucket_start] = array(
                    'time' => $this->to_utc_z($bucket_start),
                    'open' => (float) $row['open'],
                    'high' => (float) $row['high'],
                    'low' => (float) $row['low'],
                    'close' => (float) $row['close'],
                    'volume' => isset($row['volume']) ? (int) $row['volume'] : 0,
                );
                continue;
            }

            $buckets[$bucket_start]['high'] = max($buckets[$bucket_start]['high'], (float) $row['high']);
            $buckets[$bucket_start]['low'] = min($buckets[$bucket_start]['low'], (float) $row['low']);
            $buckets[$bucket_start]['close'] = (float) $row['close'];
            $buckets[$bucket_start]['volume'] += isset($row['volume']) ? (int) $row['volume'] : 0;
        }

        if (empty($buckets)) {
            return array();
        }

        foreach ($buckets as $bucket_start => $_bucket) {
            $minute_count = isset($bucket_minutes[$bucket_start]) ? count($bucket_minutes[$bucket_start]) : 0;
            if ($minute_count !== $minutes_per_bucket) {
                unset($buckets[$bucket_start]);
            }
        }

        if (empty($buckets)) {
            return array();
        }

        ksort($buckets);
        return array_slice(array_values($buckets), -1 * $count);
    }

    private function map_candle_row($row)
    {
        $ts = strtotime((string) $row['candle_time'] . ' UTC');
        return array(
            'time' => $ts !== false ? $this->to_utc_z($ts) : null,
            'open' => (float) $row['open'],
            'high' => (float) $row['high'],
            'low' => (float) $row['low'],
            'close' => (float) $row['close'],
            'volume' => isset($row['volume']) ? (int) $row['volume'] : 0,
        );
    }

    /**
     * Check if MT5 data is available (has received ticks)
     * 
     * @param int $user_id
     * @param string $symbol
     * @return bool
     */
    public function has_mt5_data($user_id, $symbol)
    {
        $count = $this->wpdb->get_var($this->wpdb->prepare(
            "SELECT COUNT(*) FROM {$this->table_prefix}candles WHERE user_id = %d AND symbol = %s AND source = %s",
            $user_id,
            strtoupper(sanitize_text_field($symbol)),
            'mt5'
        ));

        return (int) $count > 0;
    }

    /**
     * Get data source status for symbol (MT5 vs Twelve Data)
     * 
     * @param int $user_id
     * @param string $symbol
     * @return string mt5|twelve-data|unavailable
     */
    public function get_data_source($user_id, $symbol)
    {
        if ($this->has_mt5_data($user_id, $symbol))
            return 'mt5';

        // Check if Twelve Data has data
        $count = $this->wpdb->get_var($this->wpdb->prepare(
            "SELECT COUNT(*) FROM {$this->table_prefix}candles WHERE user_id = %d AND symbol = %s AND (source = 'twelve-data' OR source IS NULL OR source = '')",
            $user_id,
            strtoupper(sanitize_text_field($symbol))
        ));

        return (int) $count > 0 ? 'twelve-data' : 'unavailable';
    }

    /**
     * Get market data authority state (what is authoritative for this symbol)
     * 
     * @param int $user_id
     * @param string $symbol
     * @return array
     */
    public function get_authority_state($user_id, $symbol)
    {
        $source = $this->get_data_source($user_id, $symbol);
        $snapshot = $this->get_price_snapshot($user_id, $symbol);
        $freshness = $this->get_freshness($user_id, $symbol);
        $session = $this->get_session($user_id, $symbol);

        return array(
            'symbol' => strtoupper(sanitize_text_field($symbol)),
            'authority' => $source,  // mt5, twelve-data, or unavailable
            'freshness' => $freshness,
            'session' => $session,
            'price' => $snapshot ? array('bid' => $snapshot['bid'], 'ask' => $snapshot['ask']) : null,
            'is_live' => $freshness === 'LIVE' && $source === 'mt5',
            'last_update' => $snapshot ? $snapshot['updated_at'] : null,
        );
    }

    /**
     * Create database extensions if needed
     * 
     * @return bool
     */
    public function create_schema_extensions()
    {
        // Add source column to snapshots if not exists
        $this->wpdb->query("ALTER TABLE {$this->table_prefix}snapshots ADD COLUMN source VARCHAR(20) DEFAULT 'twelve-data' AFTER updated_at");
        
        // Add source column to candles if not exists
        $this->wpdb->query("ALTER TABLE {$this->table_prefix}candles ADD COLUMN source VARCHAR(20) DEFAULT 'twelve-data' AFTER volume");
        
        return true;
    }

    /**
     * Convert MySQL timestamp to ISO 8601
     * 
     * @param string $mysql_time
     * @return string|null
     */
    public function resolve_session_anchors(array $candles, int $chart_tf_seconds): array
    {
        $anchors = array(
            'F1' => array('high' => null, 'low' => null, 'valid' => false),
            'F2' => array('high' => null, 'low' => null, 'valid' => false),
            'F3' => array('high' => null, 'low' => null, 'valid' => false),
        );

        if (empty($candles)) {
            return $anchors;
        }

        $session_tf = $chart_tf_seconds <= 1800
            ? 'Daily'
            : ($chart_tf_seconds <= 3600
                ? 'Weekly'
                : ($chart_tf_seconds <= 14400
                    ? 'Monthly'
                    : ($chart_tf_seconds <= 86400 ? 'Quarterly' : 'Yearly')));

        $sessions = array();
        foreach ($candles as $candle) {
            $timestamp = isset($candle['time']) ? strtotime((string) $candle['time']) : false;
            if ($timestamp === false) {
                continue;
            }

            $year = (int) gmdate('Y', $timestamp);
            $month = (int) gmdate('n', $timestamp);
            $quarter = (int) floor(($month - 1) / 3) + 1;
            $week = (int) gmdate('W', $timestamp);
            $iso_week_year = (int) gmdate('o', $timestamp);
            $day = (int) gmdate('j', $timestamp);

            if ($session_tf === 'Yearly') {
                $session_key = $year;
            } elseif ($session_tf === 'Quarterly') {
                $session_key = ($year * 10) + $quarter;
            } elseif ($session_tf === 'Monthly') {
                $session_key = ($year * 100) + $month;
            } elseif ($session_tf === 'Weekly') {
                $session_key = ($iso_week_year * 100) + $week;
            } else {
                $session_key = ($year * 10000) + ($month * 100) + $day;
            }

            if (!isset($sessions[$session_key])) {
                $sessions[$session_key] = array(
                    'high' => (float) $candle['high'],
                    'low' => (float) $candle['low'],
                );
                continue;
            }

            $sessions[$session_key]['high'] = max($sessions[$session_key]['high'], (float) $candle['high']);
            $sessions[$session_key]['low'] = min($sessions[$session_key]['low'], (float) $candle['low']);
        }

        if (count($sessions) <= 1) {
            return $anchors;
        }

        $completed_sessions = array_slice(array_values($sessions), 0, -1);
        $recent_sessions = array_reverse($completed_sessions);
        $labels = array('F1', 'F2', 'F3');
        foreach ($labels as $index => $label) {
            if (!isset($recent_sessions[$index])) {
                continue;
            }

            $anchors[$label] = array(
                'high' => (float) $recent_sessions[$index]['high'],
                'low' => (float) $recent_sessions[$index]['low'],
                'valid' => true,
            );
        }

        return $anchors;
    }

    public function resolve_htf_authority_anchor(array $candles, int $chart_tf_seconds): array
    {
        $anchor = array('high' => null, 'low' => null, 'valid' => false);

        if (empty($candles)) {
            return $anchor;
        }

        $session_tf = $chart_tf_seconds <= 1800
            ? 'Daily'
            : ($chart_tf_seconds <= 3600
                ? 'Weekly'
                : ($chart_tf_seconds <= 14400
                    ? 'Monthly'
                    : ($chart_tf_seconds <= 86400 ? 'Quarterly' : 'Yearly')));

        $authority_tf = $session_tf === 'Daily'
            ? 'Weekly'
            : ($session_tf === 'Weekly'
                ? 'Monthly'
                : ($session_tf === 'Monthly'
                    ? 'Quarterly'
                    : 'Yearly'));

        $sessions = array();
        foreach ($candles as $candle) {
            $timestamp = isset($candle['time']) ? strtotime((string) $candle['time']) : false;
            if ($timestamp === false) {
                continue;
            }

            $year = (int) gmdate('Y', $timestamp);
            $month = (int) gmdate('n', $timestamp);
            $quarter = (int) floor(($month - 1) / 3) + 1;
            $week = (int) gmdate('W', $timestamp);
            $iso_week_year = (int) gmdate('o', $timestamp);

            if ($authority_tf === 'Yearly') {
                $session_key = $year;
            } elseif ($authority_tf === 'Quarterly') {
                $session_key = ($year * 10) + $quarter;
            } elseif ($authority_tf === 'Monthly') {
                $session_key = ($year * 100) + $month;
            } else {
                $session_key = ($iso_week_year * 100) + $week;
            }

            if (!isset($sessions[$session_key])) {
                $sessions[$session_key] = array(
                    'high' => (float) $candle['high'],
                    'low' => (float) $candle['low'],
                );
                continue;
            }

            $sessions[$session_key]['high'] = max($sessions[$session_key]['high'], (float) $candle['high']);
            $sessions[$session_key]['low'] = min($sessions[$session_key]['low'], (float) $candle['low']);
        }

        // Pine v13.1.3: HTF_AF = auth_f1 = most recent completed authority session.
        // Requires at least 1 completed session (count > 1).
        if (count($sessions) <= 1) {
            return $anchor;
        }

        $completed_sessions = array_slice(array_values($sessions), 0, -1);
        $recent_sessions = array_reverse($completed_sessions);
        if (!isset($recent_sessions[0])) {
            return $anchor;
        }

        return array(
            'high' => (float) $recent_sessions[0]['high'],
            'low' => (float) $recent_sessions[0]['low'],
            'valid' => true,
        );
    }

    private function to_iso($mysql_time)
    {
        if (!$mysql_time)
            return null;
        return gmdate('c', strtotime($mysql_time . ' UTC'));
    }

    private function to_utc_z($timestamp)
    {
        return gmdate('Y-m-d\TH:i:s\Z', (int) $timestamp);
    }

    private function normalize_market_timestamp($raw_time, $fallback = null, $round_to_minute = false)
    {
        $fallback_value = func_num_args() >= 2 ? $fallback : gmdate('Y-m-d H:i:s');
        if ($raw_time === null || $raw_time === '') {
            return $fallback_value;
        }

        $value = trim((string) $raw_time);
        $value = preg_replace('/^(\d{4})\.(\d{2})\.(\d{2})/', '$1-$2-$3', $value);

        $has_named_tz = preg_match('/\s+([A-Z]{2,5})\s*$/i', $value, $tz_match) === 1;
        if ($has_named_tz) {
            $tz_abbrev = strtoupper($tz_match[1]);
            if (in_array($tz_abbrev, array('UTC', 'GMT', 'UT', 'Z'), true)) {
                $value = preg_replace('/\s+([A-Z]{2,5})\s*$/i', '', $value);
                $has_named_tz = false;
            }
        }

        if (!$has_named_tz && !preg_match('/([+-]\d{2}:\d{2}|Z)\s*$/', $value)) {
            $value .= 'Z';
        }

        $ts = strtotime($value);
        if ($ts === false) {
            return $fallback_value;
        }
        // Round to nearest minute only for candle bar-open timestamps
        // (opt-in via $round_to_minute). Absorbs the ±1s broker jitter
        // from the TimeCurrent()-TimeGMT() race in EA TimeToIso8601().
        // Tick snapshot timestamps are NOT rounded to preserve second precision.
        if ($round_to_minute) {
            $ts = (int) (round($ts / 60) * 60);
        }
        return gmdate('Y-m-d H:i:s', $ts);
    }

    private function normalize_freshness($state)
    {
        $value = strtoupper(trim((string) $state));
        $allowed = array('LIVE', 'DELAYED', 'STALE', 'CLOSED', 'DISCONNECTED');
        return in_array($value, $allowed, true) ? $value : '';
    }

    private function normalize_session($session)
    {
        $value = strtoupper(str_replace(array('-', ' '), '_', trim((string) $session)));
        $map = array(
            'SYDNEY' => 'Sydney',
            'TOKYO' => 'Tokyo',
            'ASIAN' => 'Tokyo',
            'LONDON' => 'London',
            'NEW_YORK' => 'New York',
            'NEWYORK' => 'New York',
            'OVERLAP' => 'Overlap',
            'CLOSED' => 'Closed',
            'WEEKEND' => 'Closed',
        );

        return $map[$value] ?? '';
    }

    private function latest_mt5_broker_timestamp($user_id)
    {
        $latest = $this->wpdb->get_var($this->wpdb->prepare(
            "SELECT MAX(updated_at) FROM {$this->table_prefix}snapshots WHERE user_id = %d AND source = %s",
            $user_id,
            'mt5'
        ));

        return is_string($latest) && $latest !== '' ? $latest : null;
    }

    private function is_market_expected_open($symbol, $broker_timestamp)
    {
        $timestamp = strtotime((string) $broker_timestamp . ' UTC');
        if ($timestamp === false) {
            return false;
        }

        $upper = strtoupper(sanitize_text_field($symbol));
        if ($this->is_crypto_symbol($upper)) {
            return true;
        }

        if ($this->is_equity_index_symbol($upper)) {
            return $this->is_us_equity_session_open($timestamp);
        }

        $dow = (int) gmdate('w', $timestamp);
        $hour = (int) gmdate('G', $timestamp);

        if ($dow === 6) {
            return false;
        }

        if ($dow === 0) {
            return $hour >= 21;
        }

        if ($dow === 5 && $hour >= 21) {
            return false;
        }

        return true;
    }

    private function is_crypto_symbol($symbol)
    {
        foreach (array('BTC', 'ETH', 'LTC', 'XRP', 'BNB', 'SOL', 'ADA', 'DOGE') as $prefix) {
            if (strpos($symbol, $prefix) === 0) {
                return true;
            }
        }

        return false;
    }

    private function is_equity_index_symbol($symbol)
    {
        return strpos($symbol, 'NAS100') !== false || strpos($symbol, 'US30') !== false;
    }

    private function is_us_equity_session_open($timestamp)
    {
        $dow = (int) gmdate('w', $timestamp);
        if ($dow === 0 || $dow === 6) {
            return false;
        }

        $minutes_utc = ((int) gmdate('G', $timestamp) * 60) + (int) gmdate('i', $timestamp);
        if ($this->is_us_dst_active($timestamp)) {
            return $minutes_utc >= 810 && $minutes_utc < 1200;
        }

        return $minutes_utc >= 870 && $minutes_utc < 1260;
    }

    private function is_us_dst_active($timestamp)
    {
        $month = (int) gmdate('n', $timestamp);
        $day = (int) gmdate('j', $timestamp);
        $hour = (int) gmdate('G', $timestamp);
        $year = (int) gmdate('Y', $timestamp);

        if ($month < 3 || $month > 11) {
            return false;
        }
        if ($month > 3 && $month < 11) {
            return true;
        }

        $first_of_month = gmmktime(0, 0, 0, $month, 1, $year);
        $first_sunday = (int) gmdate('w', $first_of_month) === 0
            ? 1
            : 1 + (7 - (int) gmdate('w', $first_of_month));

        if ($month === 3) {
            $second_sunday = $first_sunday + 7;
            return $day > $second_sunday || ($day === $second_sunday && $hour >= 7);
        }

        return $day < $first_sunday || ($day === $first_sunday && $hour < 6);
    }
}
