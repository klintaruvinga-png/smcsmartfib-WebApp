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
        $spread = isset($tick['spread']) ? (int) $tick['spread'] : (int) (($ask - $bid) * 100000);
        $mid = ($bid + $ask) / 2;
        $timestamp = isset($tick['timestamp']) ? sanitize_text_field($tick['timestamp']) : gmdate('c');

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
                // HARDENING: explicitly mark MT5-sourced ticks as 'live' so get_cached_price()
                // does not return state='offline' (the column DEFAULT) for fresh MT5 data.
                'state' => 'live',
                'updated_at' => gmdate('Y-m-d H:i:s'),
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
        if (!isset($candle['open'], $candle['high'], $candle['low'], $candle['close']))
            return false;

        $open = (float) $candle['open'];
        $high = (float) $candle['high'];
        $low = (float) $candle['low'];
        $close = (float) $candle['close'];
        $volume = isset($candle['volume']) ? (int) $candle['volume'] : 0;
        $timestamp = isset($candle['timestamp']) ? sanitize_text_field($candle['timestamp']) : gmdate('Y-m-d H:i:s');

        // Parse ISO timestamp to MySQL format
        if (preg_match('/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/', $timestamp)) {
            $timestamp = gmdate('Y-m-d H:i:s', strtotime($timestamp));
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
        $allowed_states = array('LIVE', 'DELAYED', 'STALE', 'CLOSED', 'DISCONNECTED');
        
        if (!in_array($state, $allowed_states, true))
            return false;

        $key = 'smc_sf_freshness_' . $user_id . '_' . strtoupper(sanitize_text_field($symbol));
        return set_transient($key, $state, 300) !== false;  // 5 min TTL
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
        $key = 'smc_sf_session_' . $user_id . '_' . strtoupper(sanitize_text_field($symbol));
        return set_transient($key, $session, 300) !== false;
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

        return array(
            'symbol' => $row['symbol'],
            'bid' => (float) $row['bid'],
            'ask' => (float) $row['ask'],
            'mid' => (float) $row['mid'],
            'spread' => (int) $row['spread'],
            'freshness' => $this->get_freshness($user_id, $row['symbol']),
            'session' => $this->get_session($user_id, $row['symbol']),
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

        if (count($sessions) <= 3) {
            return $anchor;
        }

        $completed_sessions = array_slice(array_values($sessions), 0, -1);
        $recent_sessions = array_reverse($completed_sessions);
        if (!isset($recent_sessions[2])) {
            return $anchor;
        }

        return array(
            'high' => (float) $recent_sessions[2]['high'],
            'low' => (float) $recent_sessions[2]['low'],
            'valid' => true,
        );
    }

    private function to_iso($mysql_time)
    {
        if (!$mysql_time)
            return null;
        return gmdate('c', strtotime($mysql_time . ' UTC'));
    }
}
