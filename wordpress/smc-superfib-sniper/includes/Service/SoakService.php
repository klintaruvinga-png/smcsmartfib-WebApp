<?php
namespace SMC\SuperFib\Service;

use Throwable;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

final class SoakService {
    private $legacy;

    public function __construct($legacy) {
        $this->legacy = $legacy;
    }

    public function upsert_soak_evidence(WP_REST_Request $request) {
        $this->ensure_soak_tables();
        global $wpdb;

        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            $payload = array();
        }

        $evidence_key = sanitize_text_field($payload['evidence_key'] ?? '');
        $evidence_type = sanitize_text_field($payload['evidence_type'] ?? '');
        $evidence_value = function_exists('sanitize_textarea_field')
            ? sanitize_textarea_field($payload['evidence_value'] ?? '')
            : trim((string) ($payload['evidence_value'] ?? ''));
        $operator = sanitize_text_field($payload['operator'] ?? '');
        $allowed_types = array('baseline_metadata', 'signal_parity_confirm', 'feed_stable_window', 'engine_run_observation', 'manual_note');

        if ($evidence_key === '') {
            return new WP_Error('smc_sf_soak_evidence_key_required', 'evidence_key is required.', array('status' => 400));
        }
        if (!in_array($evidence_type, $allowed_types, true)) {
            return new WP_Error('smc_sf_soak_evidence_type_invalid', 'evidence_type is invalid.', array('status' => 400));
        }
        if ($evidence_value === '') {
            return new WP_Error('smc_sf_soak_evidence_value_required', 'evidence_value is required.', array('status' => 400));
        }
        if ($operator === '') {
            return new WP_Error('smc_sf_soak_operator_required', 'operator is required.', array('status' => 400));
        }

        $existing = $this->soak_get_row($wpdb->prepare(
            "SELECT * FROM {$this->table('soak_evidence')} WHERE evidence_key = %s",
            $evidence_key
        ));
        if ($existing['error'] !== null) {
            error_log('[PHASE0_SOAK] soak evidence lookup failed: ' . $existing['error']);
            return new WP_Error('smc_sf_soak_evidence_lookup_failed', 'Could not read soak evidence.', array('status' => 500));
        }

        $now = $this->now_mysql();
        if (is_array($existing['value'])) {
            $saved = $wpdb->update(
                $this->table('soak_evidence'),
                array(
                    'evidence_type' => $evidence_type,
                    'evidence_value' => $evidence_value,
                    'operator' => $operator,
                    'updated_at' => $now,
                ),
                array('evidence_key' => $evidence_key),
                array('%s', '%s', '%s', '%s'),
                array('%s')
            );
        } else {
            $saved = $wpdb->insert(
                $this->table('soak_evidence'),
                array(
                    'evidence_key' => $evidence_key,
                    'evidence_type' => $evidence_type,
                    'evidence_value' => $evidence_value,
                    'operator' => $operator,
                    'created_at' => $now,
                    'updated_at' => $now,
                ),
                array('%s', '%s', '%s', '%s', '%s', '%s')
            );
        }

        if ($saved === false) {
            error_log('[PHASE0_SOAK] soak evidence write failed: ' . $this->wpdb_last_error());
            return new WP_Error('smc_sf_soak_evidence_write_failed', 'Could not save soak evidence.', array('status' => 500));
        }

        $stored = $this->soak_get_row($wpdb->prepare(
            "SELECT * FROM {$this->table('soak_evidence')} WHERE evidence_key = %s",
            $evidence_key
        ));
        if ($stored['error'] !== null || !is_array($stored['value'])) {
            error_log('[PHASE0_SOAK] soak evidence reload failed: ' . ($stored['error'] ?? 'missing row'));
            return new WP_Error('smc_sf_soak_evidence_reload_failed', 'Soak evidence saved but could not be reloaded.', array('status' => 500));
        }

        return rest_ensure_response($this->map_soak_evidence_row($stored['value']));
    }

    public function create_soak_checkpoint(WP_REST_Request $request) {
        $this->ensure_soak_tables();
        global $wpdb;

        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            $payload = array();
        }

        $operator_notes = function_exists('sanitize_textarea_field')
            ? sanitize_textarea_field($payload['operator_notes'] ?? '')
            : trim((string) ($payload['operator_notes'] ?? ''));
        $requested_checkpoint_type = sanitize_text_field($payload['checkpoint_type'] ?? 'checkpoint');
        if (!in_array($requested_checkpoint_type, array('baseline', 'checkpoint'), true)) {
            return new WP_Error('smc_sf_soak_checkpoint_type_invalid', 'checkpoint_type is invalid.', array('status' => 400));
        }

        $baseline_count = $this->soak_get_var(
            "SELECT COUNT(*) FROM {$this->table('soak_checkpoints')} WHERE checkpoint_type = 'baseline'"
        );
        if ($baseline_count['error'] !== null) {
            return new WP_Error('smc_sf_soak_checkpoint_lookup_failed', 'Could not inspect baseline checkpoint state.', array('status' => 500));
        }
        $has_baseline = ((int) $baseline_count['value']) > 0;
        if ($requested_checkpoint_type === 'baseline' && $has_baseline) {
            return new WP_Error('smc_sf_soak_baseline_exists', 'Baseline snapshot already exists for this soak.', array('status' => 409));
        }

        $checkpoint_type = $has_baseline ? 'checkpoint' : 'baseline';
        $report_response = $this->get_soak_report();
        if ($report_response instanceof WP_Error) {
            return $report_response;
        }
        if ($report_response instanceof WP_REST_Response) {
            $status_code = $this->rest_response_status_code($report_response);
            if ($status_code < 200 || $status_code >= 300) {
                return new WP_Error(
                    'smc_sf_soak_checkpoint_report_failed',
                    'Could not generate soak report snapshot.',
                    array(
                        'status' => 500,
                        'report_error' => $report_response->get_data(),
                        'report_status' => $status_code,
                    )
                );
            }
        }

        $report = ($report_response instanceof WP_REST_Response)
            ? (array) $report_response->get_data()
            : (array) $report_response;

        $snapshot_report = $report;
        unset($snapshot_report['baseline_checkpoint']);
        unset($snapshot_report['checkpoints']);

        $created_at = $this->now_mysql();
        $snapshot_data = wp_json_encode($snapshot_report);
        $active_soak_type = $this->infer_soak_type_from_evidence_rows($snapshot_report['manual_evidence'] ?? array());
        $cutoff = gmdate('Y-m-d H:i:s', strtotime('-72 hours'));

        $wpdb->query('START TRANSACTION');
        $inserted = $wpdb->insert(
            $this->table('soak_checkpoints'),
            array(
                'checkpoint_type' => $checkpoint_type,
                'snapshot_data' => $snapshot_data,
                'operator_notes' => $operator_notes !== '' ? $operator_notes : null,
                'created_at' => $created_at,
            ),
            array('%s', '%s', '%s', '%s')
        );
        if ($inserted === false) {
            $wpdb->query('ROLLBACK');
            return new WP_Error('smc_sf_soak_checkpoint_insert_failed', 'Could not create soak checkpoint.', array('status' => 500));
        }

        $pruned = 0;
        if ($active_soak_type !== 'PHASE_4_30_DAY') {
            $pruned = $wpdb->query($wpdb->prepare(
                "DELETE FROM {$this->table('soak_checkpoints')} WHERE checkpoint_type <> 'baseline' AND created_at < %s",
                $cutoff
            ));
            if ($pruned === false) {
                $wpdb->query('ROLLBACK');
                return new WP_Error('smc_sf_soak_checkpoint_prune_failed', 'Could not prune old soak checkpoints.', array('status' => 500));
            }
        }

        $wpdb->query('COMMIT');

        return rest_ensure_response(array(
            'id' => isset($wpdb->insert_id) ? (int) $wpdb->insert_id : 0,
            'checkpoint_type' => $checkpoint_type,
            'snapshot_data' => $snapshot_report,
            'operator_notes' => $operator_notes !== '' ? $operator_notes : null,
            'created_at' => $this->to_iso($created_at),
        ));
    }

    public function get_soak_report() {
        $this->ensure_soak_tables();
        global $wpdb;

        try {
            $user_id = get_current_user_id();
            $since_24h = gmdate('Y-m-d H:i:s', strtotime('-24 hours'));
            $since_72h = gmdate('Y-m-d H:i:s', strtotime('-72 hours'));
            $settings = $this->legacy->get_health_payload_for_user($user_id);

            $report = array(
                'health' => $settings,
                'watchlist_count' => is_array($settings['watchlist'] ?? null) ? count($settings['watchlist']) : 0,
                'snapshots_24h' => 0,
                'candles_24h' => 0,
                'engine_runs_summary' => array(
                    'total_24h' => 0,
                    'success_24h' => 0,
                    'error_24h' => 0,
                    'last_run_at' => null,
                ),
                'audit_events_summary' => array(
                    'total_24h' => 0,
                    'error_count_24h' => 0,
                    'warning_count_24h' => 0,
                ),
                'manual_evidence' => array(),
                'baseline_checkpoint' => null,
                'checkpoints' => array(),
                'generated_at' => gmdate('c'),
                'seeded' => false,
            );

            $snapshots_count = $this->soak_get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$this->table('snapshots')} WHERE user_id = %d AND updated_at >= %s",
                $user_id,
                $since_24h
            ));
            if ($snapshots_count['error'] !== null) {
                $report['snapshots_24h'] = null;
                $report['snapshots_24h_error'] = $snapshots_count['error'];
            } else {
                $report['snapshots_24h'] = (int) $snapshots_count['value'];
            }

            $candles_count = $this->soak_get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$this->table('candles')} WHERE user_id = %d AND created_at >= %s",
                $user_id,
                $since_24h
            ));
            if ($candles_count['error'] !== null) {
                $report['candles_24h'] = null;
                $report['candles_24h_error'] = $candles_count['error'];
            } else {
                $report['candles_24h'] = (int) $candles_count['value'];
            }

            $engine_runs_summary = $this->soak_get_row($wpdb->prepare(
                "SELECT COUNT(*) AS total_24h,
                    SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) AS success_24h,
                    SUM(CASE WHEN status NOT IN ('complete', 'heartbeat') THEN 1 ELSE 0 END) AS error_24h,
                    MAX(created_at) AS last_run_at
                 FROM {$this->table('engine_runs')}
                 WHERE user_id = %d AND created_at >= %s",
                $user_id,
                $since_24h
            ));
            if ($engine_runs_summary['error'] !== null) {
                $report['engine_runs_summary_error'] = $engine_runs_summary['error'];
            } elseif (is_array($engine_runs_summary['value'])) {
                $report['engine_runs_summary'] = array(
                    'total_24h' => (int) ($engine_runs_summary['value']['total_24h'] ?? 0),
                    'success_24h' => (int) ($engine_runs_summary['value']['success_24h'] ?? 0),
                    'error_24h' => (int) ($engine_runs_summary['value']['error_24h'] ?? 0),
                    'last_run_at' => $this->to_iso($engine_runs_summary['value']['last_run_at'] ?? null),
                );
            }

            $audit_events_summary = $this->soak_get_row($wpdb->prepare(
                "SELECT COUNT(*) AS total_24h,
                    SUM(CASE
                        WHEN event_type LIKE '%%error%%'
                          OR event_type LIKE '%%invalid%%'
                          OR event_type LIKE '%%failed%%'
                          OR event_type LIKE '%%rejected%%'
                        THEN 1 ELSE 0 END) AS error_count_24h,
                    SUM(CASE
                        WHEN event_type LIKE '%%warn%%'
                          OR event_type LIKE '%%stale%%'
                          OR event_type LIKE '%%rate_limit%%'
                        THEN 1 ELSE 0 END) AS warning_count_24h
                 FROM {$this->table('audit_events')}
                 WHERE user_id = %d AND created_at >= %s",
                $user_id,
                $since_24h
            ));
            if ($audit_events_summary['error'] !== null) {
                $report['audit_events_summary_error'] = $audit_events_summary['error'];
            } elseif (is_array($audit_events_summary['value'])) {
                $report['audit_events_summary'] = array(
                    'total_24h' => (int) ($audit_events_summary['value']['total_24h'] ?? 0),
                    'error_count_24h' => (int) ($audit_events_summary['value']['error_count_24h'] ?? 0),
                    'warning_count_24h' => (int) ($audit_events_summary['value']['warning_count_24h'] ?? 0),
                );
            }

            $manual_evidence_rows = $this->soak_get_results(
                "SELECT * FROM {$this->table('soak_evidence')} ORDER BY updated_at DESC"
            );
            if ($manual_evidence_rows['error'] !== null) {
                $report['manual_evidence_error'] = $manual_evidence_rows['error'];
            } else {
                $report['manual_evidence'] = array_map(array($this, 'map_soak_evidence_row'), $manual_evidence_rows['value']);
            }

            $baseline_checkpoint_query = "SELECT * FROM {$this->table('soak_checkpoints')} WHERE checkpoint_type = 'baseline' ORDER BY created_at ASC LIMIT 1";
            $baseline_checkpoint_row = $this->soak_get_row($baseline_checkpoint_query);
            if ($baseline_checkpoint_row['error'] !== null) {
                return new WP_REST_Response(array(
                    'error' => 'baseline_checkpoint_lookup_failed',
                    'detail' => $baseline_checkpoint_row['error'],
                ), 500);
            }

            if (!is_array($baseline_checkpoint_row['value'])) {
                $seed_result = $this->seed_baseline_checkpoint();
                if ($seed_result['error'] !== null) {
                    return new WP_REST_Response(array(
                        'error' => 'baseline_checkpoint_seed_failed',
                        'detail' => $seed_result['error'],
                    ), 500);
                }
                $report['seeded'] = (bool) $seed_result['seeded'];

                $baseline_checkpoint_row = $this->soak_get_row($baseline_checkpoint_query);
                if ($baseline_checkpoint_row['error'] !== null) {
                    return new WP_REST_Response(array(
                        'error' => 'baseline_checkpoint_lookup_failed',
                        'detail' => $baseline_checkpoint_row['error'],
                    ), 500);
                }
            }

            if (!is_array($baseline_checkpoint_row['value'])) {
                return new WP_REST_Response(array(
                    'error' => 'baseline_checkpoint_missing',
                    'detail' => 'Could not load or seed the baseline checkpoint.',
                ), 500);
            }

            $report['baseline_checkpoint'] = $this->map_soak_checkpoint_row($baseline_checkpoint_row['value']);

            $active_soak_type = $this->infer_soak_type_from_evidence_rows($report['manual_evidence']);
            if ($active_soak_type === 'PHASE_4_30_DAY') {
                $checkpoints_rows = $this->soak_get_results(
                    "SELECT * FROM {$this->table('soak_checkpoints')} WHERE checkpoint_type <> 'baseline' ORDER BY created_at DESC"
                );
            } else {
                $checkpoints_rows = $this->soak_get_results($wpdb->prepare(
                    "SELECT * FROM {$this->table('soak_checkpoints')} WHERE checkpoint_type <> 'baseline' AND created_at >= %s ORDER BY created_at DESC",
                    $since_72h
                ));
            }
            if ($checkpoints_rows['error'] !== null) {
                $report['checkpoints_error'] = $checkpoints_rows['error'];
            } else {
                $report['checkpoints'] = array_map(array($this, 'map_soak_checkpoint_row'), $checkpoints_rows['value']);
            }

            error_log(sprintf(
                'soak_report_served baseline_checkpoint_id=%d seeded=%s',
                isset($report['baseline_checkpoint']['id']) ? (int) $report['baseline_checkpoint']['id'] : 0,
                $report['seeded'] ? 'true' : 'false'
            ));

            return new WP_REST_Response($report, 200);
        } catch (Throwable $throwable) {
            error_log('soak_report_handler_exception message=' . $throwable->getMessage());
            return new WP_REST_Response(array(
                'error' => 'soak_report_handler_exception',
                'detail' => $throwable->getMessage(),
            ), 500);
        }
    }

    public function reset_soak(WP_REST_Request $request) {
        $this->ensure_soak_tables();
        global $wpdb;

        $wpdb->query('START TRANSACTION');

        $deleted_checkpoints = $wpdb->query("DELETE FROM {$this->table('soak_checkpoints')}");
        if ($deleted_checkpoints === false) {
            $wpdb->query('ROLLBACK');
            return new WP_Error('smc_sf_soak_reset_checkpoints_failed', 'Could not clear soak checkpoints.', array('status' => 500));
        }

        $deleted_evidence = $wpdb->query("DELETE FROM {$this->table('soak_evidence')}");
        if ($deleted_evidence === false) {
            $wpdb->query('ROLLBACK');
            return new WP_Error('smc_sf_soak_reset_evidence_failed', 'Could not clear soak evidence.', array('status' => 500));
        }

        $wpdb->query('COMMIT');

        return rest_ensure_response(array(
            'reset' => true,
            'deleted_checkpoints' => (int) $deleted_checkpoints,
            'deleted_evidence' => (int) $deleted_evidence,
        ));
    }

    private function ensure_soak_tables(): bool {
        return \SMC\SuperFib\Database\Schema::ensure_soak_tables();
    }

    private function table(string $name): string {
        global $wpdb;
        return $wpdb->prefix . 'smc_sf_' . $name;
    }

    private function now_mysql(): string {
        return gmdate('Y-m-d H:i:s');
    }

    private function soak_get_var(string $query): array {
        global $wpdb;
        $this->reset_wpdb_error();
        $value = $wpdb->get_var($query);
        return array(
            'value' => $value,
            'error' => $this->wpdb_last_error(),
        );
    }

    private function soak_get_row(string $query): array {
        global $wpdb;
        $this->reset_wpdb_error();
        $value = $wpdb->get_row($query, ARRAY_A);
        return array(
            'value' => $value,
            'error' => $this->wpdb_last_error(),
        );
    }

    private function soak_get_results(string $query): array {
        global $wpdb;
        $this->reset_wpdb_error();
        $value = $wpdb->get_results($query, ARRAY_A);
        return array(
            'value' => is_array($value) ? $value : array(),
            'error' => $this->wpdb_last_error(),
        );
    }

    private function infer_soak_type_from_evidence_rows($rows) {
        if (!is_array($rows)) {
            return null;
        }

        $accepted_keys = array('baseline.soak_type', 'soak.type', 'soak_type');
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $evidence_key = (string) ($row['evidence_key'] ?? '');
            if (!in_array($evidence_key, $accepted_keys, true)) {
                continue;
            }

            $soak_type = strtoupper(trim((string) ($row['evidence_value'] ?? '')));
            if (in_array($soak_type, array('PHASE_0_RESTART_72H', 'PHASE_3_STABILITY_72H', 'PHASE_4_30_DAY'), true)) {
                return $soak_type;
            }
        }

        return null;
    }

    private function map_soak_evidence_row($row) {
        return array(
            'id' => isset($row['id']) ? (int) $row['id'] : 0,
            'evidence_key' => (string) ($row['evidence_key'] ?? ''),
            'evidence_type' => (string) ($row['evidence_type'] ?? ''),
            'evidence_value' => (string) ($row['evidence_value'] ?? ''),
            'operator' => (string) ($row['operator'] ?? ''),
            'created_at' => $this->to_iso($row['created_at'] ?? null),
            'updated_at' => $this->to_iso($row['updated_at'] ?? null),
        );
    }

    private function map_soak_checkpoint_row($row) {
        $snapshot = json_decode((string) ($row['snapshot_data'] ?? ''), true);

        return array(
            'id' => isset($row['id']) ? (int) $row['id'] : 0,
            'checkpoint_type' => isset($row['checkpoint_type']) && $row['checkpoint_type'] === 'baseline' ? 'baseline' : 'checkpoint',
            'snapshot_data' => is_array($snapshot) ? $snapshot : array(),
            'operator_notes' => isset($row['operator_notes']) && $row['operator_notes'] !== '' ? (string) $row['operator_notes'] : null,
            'created_at' => $this->to_iso($row['created_at'] ?? null),
        );
    }

    private function reset_wpdb_error(): void {
        global $wpdb;
        if (is_object($wpdb) && property_exists($wpdb, 'last_error')) {
            $wpdb->last_error = '';
        }
    }

    private function wpdb_last_error() {
        global $wpdb;
        if (is_object($wpdb) && property_exists($wpdb, 'last_error') && $wpdb->last_error !== '') {
            return (string) $wpdb->last_error;
        }
        return null;
    }

    private function rest_response_status_code($response) {
        if (!($response instanceof WP_REST_Response)) {
            return 200;
        }

        if (method_exists($response, 'get_status')) {
            return (int) $response->get_status();
        }

        if (property_exists($response, 'status')) {
            return (int) $response->status;
        }

        return 200;
    }

    private function to_iso($mysql_time) {
        if (!$mysql_time) {
            return null;
        }
        return gmdate('c', strtotime($mysql_time . ' UTC'));
    }
}
