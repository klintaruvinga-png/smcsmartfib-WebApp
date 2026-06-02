<?php
namespace SMC\SuperFib\Service;

use WP_REST_Request;

final class MarketDataService {
    private $legacy;

    public function __construct($legacy) {
        $this->legacy = $legacy;
    }

    public function get_market_data_authority(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $symbol = strtoupper(sanitize_text_field((string) ($request->get_param('symbol') ?? '')));
        $svc = new \SMC_MarketData_Service();

        if ($symbol !== '') {
            return rest_ensure_response($svc->get_authority_state($user_id, $symbol));
        }

        $watched = $this->legacy->get_settings($user_id)['watchlist'];
        if (empty($watched)) {
            $snapshot = $this->legacy->ensure_engine_snapshot($user_id);
            $watched = $snapshot['meta']['watchlist'] ?? array_column($snapshot['prices'] ?? array(), 'symbol');
        }

        $watched = array_values(array_unique(array_filter(array_map('strval', is_array($watched) ? $watched : array()))));
        $result = array();

        foreach ($watched as $sym) {
            $result[$sym] = $svc->get_authority_state($user_id, $sym);
        }

        return rest_ensure_response($result);
    }

    public function get_authority_diagnostics(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $symbol = strtoupper(sanitize_text_field((string) ($request->get_param('symbol') ?? '')));

        if ($symbol === '') {
            return new \WP_REST_Response(array('error' => 'symbol required'), 400);
        }

        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT source, updated_at FROM {$wpdb->prefix}smc_sf_snapshots WHERE user_id = %d AND symbol = %s",
            $user_id,
            $symbol
        ));

        if (!$row) {
            return rest_ensure_response(array(
                'symbol' => $symbol,
                'authority' => 'unavailable',
                'authorityAgeSec' => null,
                'lastUpdateTime' => null,
            ));
        }

        $now_ts = strtotime(gmdate('Y-m-d H:i:s'));
        $update_ts = strtotime($row->updated_at);
        $age_sec = max(0, $now_ts - $update_ts);

        return rest_ensure_response(array(
            'symbol' => $symbol,
            'authority' => $row->source,
            'authorityAgeSec' => $age_sec,
            'lastUpdateTime' => $this->to_iso((string) $row->updated_at),
            'authorityStale' => ($row->source === 'mt5' && $age_sec >= 60),
            'willFallbackToTD' => ($row->source === 'mt5' && $age_sec >= 60),
        ));
    }

    public function get_market_data_fib_levels(WP_REST_Request $request) {
        global $wpdb;

        $user_id = get_current_user_id();
        $symbol = preg_replace('/[^A-Z0-9]/', '', strtoupper(sanitize_text_field((string) $request->get_param('symbol'))));

        if ($symbol === '') {
            return new \WP_Error('missing_symbol', 'symbol query parameter is required', array('status' => 400));
        }

        $timeframe = $request->get_param('timeframe');
        $family = $request->get_param('family');
        $table = $wpdb->prefix . 'smc_sf_fib_levels';

        $where = 'WHERE user_id = %d AND symbol = %s';
        $values = array($user_id, $symbol);

        if (!empty($timeframe)) {
            $where .= ' AND timeframe = %s';
            $values[] = strtoupper(sanitize_text_field((string) $timeframe));
        }

        if (!empty($family)) {
            $where .= ' AND family = %s';
            $values[] = strtoupper(sanitize_text_field((string) $family));
        }

        $sql = $wpdb->prepare("SELECT timeframe, family, ratio, price, calculated_at FROM {$table} {$where} ORDER BY timeframe, family, ratio", ...$values);
        $rows = $wpdb->get_results($sql, ARRAY_A);

        $result = array();
        foreach ((array) $rows as $row) {
            $tf = (string) $row['timeframe'];
            $fam = (string) $row['family'];

            if (!isset($result[$tf])) {
                $result[$tf] = array();
            }
            if (!isset($result[$tf][$fam])) {
                $result[$tf][$fam] = array();
            }

            $result[$tf][$fam][] = array(
                'ratio' => (float) $row['ratio'],
                'price' => (float) $row['price'],
                'calculated_at' => $this->to_iso((string) $row['calculated_at']),
            );
        }

        return $this->no_cache_response(array(
            'ok' => true,
            'symbol' => $symbol,
            'fibs' => $result,
        ));
    }

    public function get_market_data_regime(WP_REST_Request $request) {
        global $wpdb;

        $user_id = get_current_user_id();
        $symbol = sanitize_text_field((string) ($request->get_param('symbol') ?? ''));
        $symbol = preg_replace('/[^A-Z0-9]/', '', strtoupper($symbol));

        $table = $wpdb->prefix . 'smc_sf_regime_snapshots';
        $where = 'WHERE user_id = %d';
        $values = array($user_id);

        if ($symbol !== '') {
            $where .= ' AND symbol = %s';
            $values[] = $symbol;
        }

        $sql = $wpdb->prepare("SELECT symbol, htf_bias, ltf_regime, chop_score, ema20_d1, atr14_h1, htf_bias_high, htf_bias_low, calculated_at FROM {$table} {$where} ORDER BY symbol", ...$values);
        $rows = $wpdb->get_results($sql, ARRAY_A);

        $regimes = array();
        foreach ((array) $rows as $row) {
            $regimes[] = array(
                'symbol' => $row['symbol'],
                'htfBias' => $row['htf_bias'],
                'ltfRegime' => $row['ltf_regime'],
                'chopScore' => (float) $row['chop_score'],
                'ema20D1' => $row['ema20_d1'] !== null ? (float) $row['ema20_d1'] : null,
                'atr14H1' => $row['atr14_h1'] !== null ? (float) $row['atr14_h1'] : null,
                'htfBiasHigh' => isset($row['htf_bias_high']) && $row['htf_bias_high'] !== null ? (float) $row['htf_bias_high'] : null,
                'htfBiasLow' => isset($row['htf_bias_low']) && $row['htf_bias_low'] !== null ? (float) $row['htf_bias_low'] : null,
                'calculatedAt' => $this->to_iso((string) $row['calculated_at']),
                'source' => 'mt5',
            );
        }

        return $this->no_cache_response(array(
            'ok' => true,
            'regimes' => $regimes,
        ));
    }

    private function no_cache_response($payload) {
        $response = rest_ensure_response($payload);
        if ($response instanceof \WP_REST_Response && method_exists($response, 'header')) {
            $response->header('Cache-Control', 'no-store, no-cache, must-revalidate');
            $response->header('Pragma', 'no-cache');
        }
        return $response;
    }

    private function to_iso($mysql_time) {
        if (!$mysql_time) {
            return null;
        }
        return gmdate('c', strtotime($mysql_time . ' UTC'));
    }
}
