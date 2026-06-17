<?php
/**
 * Canonical Market Resolver
 *
 * Provides deterministic selection of the freshest valid shared feed for a given
 * normalized symbol (and optional timeframe). It is used by price, candle and
 * regime fetchers to guarantee a single source of truth across all users.
 */
class CanonicalMarketResolver {
    /**
     * Resolve the best feed_key for a symbol.
     *
     * @param string $normalized_symbol Normalized symbol (e.g. "BTCUSDT").
     * @param string $user_feed_key     Feed key currently stored in the user meta.
     * @param int    $stale_threshold_sec  Max age (seconds) a quote may be considered fresh.
     *
     * @return array|null ["feed_key"=>string, "rotation_reason"=>string] or null if none.
     */
    public function resolve_canonical_feed_key(string $normalized_symbol, string $user_feed_key, int $stale_threshold_sec): ?array {
        global $wpdb;
        $table = $this->table('market_quotes_latest');
        // 1. If the user's feed_key has a fresh row, prefer it.
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT feed_key, updated_at FROM {$table} WHERE feed_key = %s AND normalized_symbol = %s LIMIT 1",
            $user_feed_key,
            $normalized_symbol
        ), ARRAY_A);
        if ($row) {
            $age = $this->iso_age_sec($this->to_iso($row['updated_at']));
            if ($age <= $stale_threshold_sec) {
                return [
                    'feed_key' => $user_feed_key,
                    'rotation_reason' => 'user_feed_fresh',
                ];
            }
        }
        // 2. Find the freshest row across all feed_keys for this symbol.
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT feed_key, updated_at FROM {$table} WHERE normalized_symbol = %s",
                $normalized_symbol
            ),
            ARRAY_A
        );
        $best = null;
        $best_age = PHP_INT_MAX;
        foreach ($rows as $r) {
            $age = $this->iso_age_sec($this->to_iso($r['updated_at']));
            if ($best === null || $age < $best_age) {
                $best_age = $age;
                $best = $r;
            }
        }
        if ($best && $best_age <= $stale_threshold_sec) {
            return [
                'feed_key' => $best['feed_key'],
                'rotation_reason' => 'global_fresh',
            ];
        }
        // 3. No fresh rows – return the least‑stale row if any.
        if ($best) {
            return [
                'feed_key' => $best['feed_key'],
                'rotation_reason' => 'fallback_stale',
            ];
        }
        // 4. Nothing found.
        return null;
    }

    /**
     * Resolve a canonical quote for a symbol, computing the proper state.
     *
     * @param string $normalized_symbol
     * @param int    $stale_threshold_sec
     * @return array|null Quote payload (same shape as fetch_shared_market_quote) or null.
     */
    public function resolve_canonical_quote(string $normalized_symbol, int $stale_threshold_sec): ?array {
        // Resolve feed_key first – we reuse the same logic as above but without a user feed_key.
        $resolver = $this;
        $candidate = $resolver->resolve_canonical_feed_key($normalized_symbol, '', $stale_threshold_sec);
        if (!$candidate) {
            return null;
        }
        $feed_key = $candidate['feed_key'];
        // Pull the row for the chosen feed_key.
        global $wpdb;
        $table = $this->table('market_quotes_latest');
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT bid, ask, mid, updated_at, source_count FROM {$table} WHERE feed_key = %s AND normalized_symbol = %s LIMIT 1",
            $feed_key,
            $normalized_symbol
        ), ARRAY_A);
        if (!$row) {
            return null;
        }
        $updated_at_iso = $this->to_iso($row['updated_at'] ?? '');
        $age_sec = $this->is_valid_datetime($updated_at_iso) ? $this->iso_age_sec($updated_at_iso) : PHP_INT_MAX;
        // Compute state based on age.
        $state = ($age_sec <= $stale_threshold_sec) ? 'live' : 'stale';
        $bid = isset($row['bid']) ? (float) $row['bid'] : 0.0;
        $ask = isset($row['ask']) ? (float) $row['ask'] : 0.0;
        return [
            'symbol'       => $normalized_symbol,
            'bid'          => $bid,
            'ask'          => $ask,
            'mid'          => isset($row['mid']) ? (float) $row['mid'] : $this->calculate_mid($bid, $ask),
            'changePct1d'  => null,
            'source'       => 'mt5',
            'sourceDetail' => 'canonical_resolver',
            'updatedAt'    => $updated_at_iso,
            'state'        => $state,
            'age_sec'      => (int) $age_sec,
            'feed_key'     => $feed_key,
            'source_count' => isset($row['source_count']) ? (int) $row['source_count'] : 1,
        ];
    }

    private function is_valid_datetime(string $datetime): bool {
        return $datetime !== '' && strtotime($datetime) !== false;
    }

    private function calculate_mid(float $bid, float $ask): ?float {
        if ($bid <= 0.0 && $ask <= 0.0) {
            return null;
        }
        if ($bid <= 0.0) {
            return $ask;
        }
        if ($ask <= 0.0) {
            return $bid;
        }
        return ($bid + $ask) / 2;
    }

    // Helper proxies – expected to exist on the main plugin class. We delegate to the global plugin instance.
    private function table(string $name): string {
        // The main plugin class defines a static helper; we approximate via the global.
        if (function_exists('smc_sf_table')) {
            return smc_sf_table($name);
        }
        // Fallback – assume typical WP table prefix.
        global $wpdb;
        return $wpdb->prefix . $name;
    }
    private function to_iso(string $datetime): string {
        if (function_exists('smc_sf_to_iso')) {
            return smc_sf_to_iso($datetime);
        }
        $timestamp = strtotime($datetime);
        if ($timestamp === false) {
            return '';
        }
        return gmdate('c', $timestamp);
    }
    private function iso_age_sec(string $iso): int {
        if (function_exists('smc_sf_iso_age_sec')) {
            return smc_sf_iso_age_sec($iso);
        }
        $timestamp = strtotime($iso);
        if ($timestamp === false) {
            return PHP_INT_MAX;
        }
        return max(0, time() - $timestamp);
    }
}
?>
