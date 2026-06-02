<?php
/**
 * Settings normalization helpers for SMC SuperFIB REST routes.
 */

if (!defined('ABSPATH')) {
    exit;
}

final class SMC_SuperFib_Settings_Service {
    public function sanitize_risk_allocation($payload, $fallback) {
        if (!is_array($payload)) {
            return $fallback;
        }

        return array(
            'perTradePct' => $this->float_between($payload, 'perTradePct', 0.1, 5.0, $fallback['perTradePct']),
            'dailyMaxPct' => $this->float_between($payload, 'dailyMaxPct', 0.1, 20.0, $fallback['dailyMaxPct']),
            'ddCapPct' => $this->float_between($payload, 'ddCapPct', 0.1, 50.0, $fallback['ddCapPct']),
        );
    }

    public function sanitize_signal_board_size($value): int {
        $size = (int) $value;
        if ($size <= 3) {
            return 3;
        }
        if ($size <= 5) {
            return 5;
        }
        return 10;
    }

    public function int_between($payload, $key, $min, $max, $fallback) {
        if (!is_array($payload) || !isset($payload[$key])) {
            return $fallback;
        }
        return max($min, min($max, (int) $payload[$key]));
    }

    public function float_between($payload, $key, $min, $max, $fallback) {
        if (!is_array($payload) || !isset($payload[$key])) {
            return $fallback;
        }
        return max($min, min($max, (float) $payload[$key]));
    }
}
