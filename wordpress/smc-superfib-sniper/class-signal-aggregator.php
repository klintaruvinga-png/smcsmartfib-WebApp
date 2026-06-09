<?php
/**
 * SMC SuperFIB Signal Aggregator
 *
 * Pure dedupe/source-priority helper. Contains no WP REST logic.
 * Called by SMC_SuperFib_Sniper_REST::get_unified_snapshot() only.
 *
 * Freshness rank (highest wins):
 *   live=5  closed_session=4  stale=3  unavailable=2  offline=1  blocked=0  unknown=-1
 *
 * Deduplication order:
 *   1. Normalise symbol via caller-supplied $normalize_fn.
 *   2. Rank by freshness state.
 *   3. On rank tie, prefer the entry with the more recent updatedAt ISO string.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

final class SMC_SF_Signal_Aggregator {

    /** @var array<string,int> */
    private static $freshness_rank = array(
        'live'           => 5,
        'closed_session' => 4,
        'stale'          => 3,
        'unavailable'    => 2,
        'pending-sync'   => 2,
        'offline'        => 1,
        'blocked'        => 0,
        'mock'           => -1,
    );

    /**
     * Deduplicate a prices array to one entry per canonical symbol.
     *
     * @param  array    $prices       Raw prices array from ensure_engine_snapshot().
     * @param  callable $normalize_fn Maps a raw broker symbol string to its canonical form.
     * @return array                  Re-indexed prices array, one entry per canonical symbol.
     */
    public function dedupe_by_canonical_symbol( array $prices, callable $normalize_fn ): array {
        $winners = array(); // canonical_symbol => price entry

        foreach ( $prices as $price ) {
            if ( ! is_array( $price ) ) {
                continue;
            }

            $raw_symbol       = isset( $price['symbol'] ) ? (string) $price['symbol'] : '';
            $canonical_symbol = call_user_func( $normalize_fn, $raw_symbol );

            if ( $canonical_symbol === '' ) {
                continue;
            }

            // Stamp the canonical symbol back so downstream consumers get the clean form.
            $price['symbol'] = $canonical_symbol;

            if ( ! isset( $winners[ $canonical_symbol ] ) ) {
                $winners[ $canonical_symbol ] = $price;
                continue;
            }

            $incumbent = $winners[ $canonical_symbol ];
            $challenger_rank = $this->rank( $price['state'] ?? '' );
            $incumbent_rank  = $this->rank( $incumbent['state'] ?? '' );

            if ( $challenger_rank > $incumbent_rank ) {
                $winners[ $canonical_symbol ] = $price;
                continue;
            }

            if ( $challenger_rank === $incumbent_rank ) {
                // Tie-break by updatedAt — more recent wins.
                $challenger_ts = $this->iso_to_ts( $price['updatedAt'] ?? '' );
                $incumbent_ts  = $this->iso_to_ts( $incumbent['updatedAt'] ?? '' );
                if ( $challenger_ts > $incumbent_ts ) {
                    $winners[ $canonical_symbol ] = $price;
                }
            }
            // Challenger ranks lower — keep incumbent. No action.
        }

        return array_values( $winners );
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private function rank( string $state ): int {
        $s = strtolower( $state );
        return isset( self::$freshness_rank[ $s ] ) ? self::$freshness_rank[ $s ] : -1;
    }

    private function iso_to_ts( string $iso ): int {
        if ( $iso === '' ) {
            return 0;
        }
        $ts = strtotime( $iso );
        return ( $ts !== false ) ? $ts : 0;
    }
}
