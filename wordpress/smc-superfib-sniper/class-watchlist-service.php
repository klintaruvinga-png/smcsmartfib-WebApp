<?php
/**
 * Watchlist symbol normalization helpers for SMC SuperFIB REST routes.
 */

if (!defined('ABSPATH')) {
    exit;
}

final class SMC_SuperFib_Watchlist_Service {
    public function is_supported_symbol($symbol, array $instrument_specs) {
        return isset($instrument_specs[$symbol]);
    }

    public function validate_watchlist_symbols($symbols, callable $sanitize_symbols, callable $is_supported_symbol) {
        $out = array();
        foreach ($sanitize_symbols($symbols) as $sym) {
            if ($is_supported_symbol($sym)) {
                $out[] = $sym;
            }
        }
        return $out;
    }

    public function sanitize_symbols($symbols, callable $map_symbol_aliases) {
        if (!is_array($symbols)) {
            return array();
        }

        $out = array();
        foreach ($symbols as $symbol) {
            $clean = $map_symbol_aliases($symbol);
            // Reject empty strings and suspiciously long tokens (longest real symbol is ~10 chars).
            if ($clean === '' || strlen($clean) > 12) {
                continue;
            }
            if (!in_array($clean, $out, true)) {
                $out[] = $clean;
            }
        }
        return array_slice($out, 0, 24);
    }
}
