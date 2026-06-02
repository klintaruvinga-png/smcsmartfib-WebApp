<?php
namespace SMC\SuperFib\Service;

use WP_REST_Request;

final class FundamentalsService {
    private $legacy;

    public function __construct($legacy) {
        $this->legacy = $legacy;
    }

    public function post_fundamentals_refresh(WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $td_key = $this->get_twelve_key($user_id);
        if (is_wp_error($td_key)) {
            return $td_key;
        }

        if (!$td_key) {
            return new \WP_Error('no_td_key', 'Twelve Data API key required for fundamentals refresh', array('status' => 422));
        }

        $ingested = $this->ingest_economic_calendar($td_key);
        $biases = $this->recompute_fundamental_bias();

        error_log(sprintf('[SMC_SF] fundamentals/refresh ingested=%d currencies_updated=%d user_id=%d',
            $ingested, $biases, $user_id));

        return rest_ensure_response(array(
            'ok' => true,
            'events_ingested' => $ingested,
            'currencies_updated' => $biases,
        ));
    }

    public function get_fundamentals_bias(WP_REST_Request $request) {
        global $wpdb;

        $currency = sanitize_text_field(strtoupper((string) ($request->get_param('currency') ?? '')));
        $currency = preg_replace('/[^A-Z]/', '', $currency);
        $table = $wpdb->prefix . 'smc_sf_fundamental_bias';

        if ($currency !== '') {
            $row = $wpdb->get_row($wpdb->prepare(
                "SELECT currency, composite_score, category, event_count, computed_at, expires_at FROM {$table} WHERE currency = %s",
                $currency
            ), ARRAY_A);

            if (!$row) {
                return rest_ensure_response(array(
                    'ok' => true,
                    'currency' => $currency,
                    'bias' => null,
                    'note' => 'No fundamental data available. Run /fundamentals/refresh.',
                ));
            }

            return rest_ensure_response(array(
                'ok' => true,
                'bias' => $this->format_bias_row($row),
            ));
        }

        $rows = $wpdb->get_results("SELECT currency, composite_score, category, event_count, computed_at, expires_at FROM {$table} ORDER BY currency", ARRAY_A);
        $biases = array();

        foreach ((array) $rows as $row) {
            $biases[] = $this->format_bias_row($row);
        }

        return rest_ensure_response(array(
            'ok' => true,
            'biases' => $biases,
        ));
    }

    private function get_twelve_key($user_id) {
        global $wpdb;

        $encrypted = $wpdb->get_var($wpdb->prepare(
            "SELECT encrypted_secret FROM {$wpdb->prefix}smc_sf_integrations WHERE user_id = %d AND provider = %s AND key_status = 'ok'",
            $user_id,
            \SMC_SuperFib_Sniper_REST::TWELVE_PROVIDER
        ));

        if (!$encrypted) {
            return null;
        }

        $decrypted = $this->decrypt_secret($encrypted);
        if (is_wp_error($decrypted)) {
            return $decrypted;
        }

        return $decrypted;
    }

    private function decrypt_secret($payload) {
        if (!function_exists('openssl_decrypt')) {
            return new \WP_Error('smc_sf_crypto_missing', 'OpenSSL decryption is required.', array('status' => 500));
        }

        $decoded = json_decode(base64_decode($payload), true);
        if (!is_array($decoded) || empty($decoded['iv']) || empty($decoded['tag']) || empty($decoded['data'])) {
            return new \WP_Error('smc_sf_crypto_payload', 'Stored API key payload is invalid.', array('status' => 500));
        }

        $plain = openssl_decrypt(
            base64_decode($decoded['data']),
            'aes-256-gcm',
            $this->crypto_key(),
            OPENSSL_RAW_DATA,
            base64_decode($decoded['iv']),
            base64_decode($decoded['tag'])
        );

        if ($plain === false) {
            return new \WP_Error('smc_sf_crypto_decrypt_failed', 'Could not decrypt API key.', array('status' => 500));
        }

        return $plain;
    }

    private function crypto_key() {
        $salt = defined('AUTH_SALT') ? AUTH_SALT : wp_salt('auth');
        return hash('sha256', $salt . '|smc-superfib-sniper|' . (defined('SECURE_AUTH_SALT') ? SECURE_AUTH_SALT : ''), true);
    }

    private function ingest_economic_calendar($td_key) {
        global $wpdb;

        $start = gmdate('Y-m-d');
        $end = gmdate('Y-m-d', strtotime('+7 days'));
        $url = "https://api.twelvedata.com/economic_calendar?start_date={$start}&end_date={$end}&apikey={$td_key}";

        $response = wp_remote_get($url, array('timeout' => 15));
        if (is_wp_error($response)) {
            error_log('[SMC_SF] fundamentals: TD calendar fetch error: ' . $response->get_error_message());
            return 0;
        }

        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);

        if (!is_array($data) || empty($data['result']) || !is_array($data['result'])) {
            error_log('[SMC_SF] fundamentals: TD calendar unexpected response: ' . substr($body, 0, 200));
            return 0;
        }

        $table = $wpdb->prefix . 'smc_sf_fundamental_events';
        $written = 0;

        foreach ($data['result'] as $event) {
            if (!isset($event['currency'], $event['date'])) {
                continue;
            }

            $currency = preg_replace('/[^A-Z]/', '', strtoupper(sanitize_text_field((string) $event['currency'])));
            $event_date = sanitize_text_field((string) ($event['date'] ?? ''));
            $event_name = sanitize_text_field((string) ($event['event'] ?? 'Unknown'));
            $event_type = $this->classify_event_type($event_name);
            $actual = isset($event['actual']) && is_numeric($event['actual']) ? (float) $event['actual'] : null;
            $forecast = isset($event['estimate']) && is_numeric($event['estimate']) ? (float) $event['estimate'] : null;
            $previous = isset($event['previous']) && is_numeric($event['previous']) ? (float) $event['previous'] : null;
            $raw_score = $this->score_fundamental_event($event_type, $actual, $forecast, $previous);

            if (strlen($currency) < 2 || strlen($currency) > 8) {
                continue;
            }

            $result = $wpdb->replace(
                $table,
                array(
                    'currency' => $currency,
                    'event_type' => $event_type,
                    'event_name' => substr($event_name, 0, 128),
                    'event_date' => substr($event_date, 0, 10),
                    'actual' => $actual,
                    'forecast' => $forecast,
                    'previous' => $previous,
                    'raw_score' => $raw_score,
                    'source' => 'twelve_data',
                    'created_at' => gmdate('Y-m-d H:i:s'),
                ),
                array('%s', '%s', '%s', '%s',
                      $actual !== null ? '%f' : 'NULL',
                      $forecast !== null ? '%f' : 'NULL',
                      $previous !== null ? '%f' : 'NULL',
                      '%f', '%s', '%s')
            );

            if ($result !== false) {
                $written++;
            }
        }

        return $written;
    }

    private function format_bias_row(array $row) {
        return array(
            'currency' => $row['currency'],
            'compositeScore' => (float) $row['composite_score'],
            'category' => $row['category'],
            'eventCount' => (int) $row['event_count'],
            'computedAt' => $this->to_iso((string) $row['computed_at']),
            'expiresAt' => $this->to_iso((string) $row['expires_at']),
        );
    }

    private function classify_event_type($event_name) {
        $name = strtolower($event_name);
        if (strpos($name, 'cpi') !== false || strpos($name, 'inflation') !== false) return 'cpi';
        if (strpos($name, 'interest rate') !== false || strpos($name, 'rate decision') !== false) return 'rate_decision';
        if (strpos($name, 'nonfarm') !== false || strpos($name, 'non-farm') !== false || strpos($name, 'nfp') !== false) return 'nfp';
        if (strpos($name, 'gdp') !== false) return 'gdp';
        if (strpos($name, 'unemployment') !== false || strpos($name, 'jobless') !== false) return 'unemployment';
        if (strpos($name, 'pmi') !== false) return 'pmi';
        if (strpos($name, 'retail sales') !== false) return 'retail_sales';
        if (strpos($name, 'trade balance') !== false) return 'trade_balance';
        return 'other';
    }

    private function score_fundamental_event($event_type, $actual, $forecast, $previous) {
        if ($event_type === 'rate_decision') {
            if ($actual !== null && $previous !== null) {
                if ($actual > $previous) return 1.0;
                if ($actual < $previous) return -1.0;
            }
            return 0.0;
        }

        if ($actual === null || $forecast === null || abs($forecast) < 1e-9) {
            return 0.0;
        }

        $surprise = ($actual - $forecast) / abs($forecast);
        $polarity = ($event_type === 'unemployment') ? -1.0 : 1.0;
        $scored = $surprise * $polarity;

        if ($scored >= 0.10) return 2.0;
        if ($scored >= 0.03) return 1.0;
        if ($scored <= -0.10) return -2.0;
        if ($scored <= -0.03) return -1.0;
        return 0.0;
    }

    private function recompute_fundamental_bias() {
        global $wpdb;

        $events_table = $wpdb->prefix . 'smc_sf_fundamental_events';
        $bias_table = $wpdb->prefix . 'smc_sf_fundamental_bias';
        $cutoff_90d = gmdate('Y-m-d', strtotime('-90 days'));
        $cutoff_30d = gmdate('Y-m-d', strtotime('-30 days'));

        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT currency, event_date, raw_score FROM {$events_table} WHERE event_date >= %s ORDER BY currency, event_date DESC",
            $cutoff_90d
        ), ARRAY_A);

        $aggregated = array();
        foreach ((array) $rows as $row) {
            $cur = $row['currency'];
            $date = $row['event_date'];
            $score = (float) $row['raw_score'];
            $weight = ($date < $cutoff_30d) ? 0.25 : 1.0;

            if (!isset($aggregated[$cur])) {
                $aggregated[$cur] = array('sum' => 0.0, 'count' => 0);
            }

            $aggregated[$cur]['sum'] += $score * $weight;
            $aggregated[$cur]['count'] += 1;
        }

        $updated = 0;
        $now = gmdate('Y-m-d H:i:s');
        $expires = gmdate('Y-m-d H:i:s', strtotime('+30 minutes'));

        foreach ($aggregated as $currency => $data) {
            $composite = $data['count'] > 0 ? ($data['sum'] / $data['count']) : 0.0;
            $composite = max(-2.0, min(2.0, $composite));

            $category = 'NEUTRAL';
            if ($composite >= 0.5) $category = 'BULLISH';
            if ($composite <= -0.5) $category = 'BEARISH';

            $wpdb->replace(
                $bias_table,
                array(
                    'currency' => $currency,
                    'composite_score' => round($composite, 2),
                    'category' => $category,
                    'event_count' => $data['count'],
                    'computed_at' => $now,
                    'expires_at' => $expires,
                ),
                array('%s', '%f', '%s', '%d', '%s', '%s')
            );
            $updated++;
        }

        return $updated;
    }

    private function to_iso($mysql_time) {
        if (!$mysql_time) {
            return null;
        }
        return gmdate('c', strtotime($mysql_time . ' UTC'));
    }
}
