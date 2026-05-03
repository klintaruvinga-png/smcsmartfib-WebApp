"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { bootstrapDataEngine } = require("../helpers/dashboard-sandbox");

function normalize(value) {
    return JSON.parse(JSON.stringify(value));
}

test("getSessionTf maps runtime horizons to expected session groups", () => {
    const harness = bootstrapDataEngine({ fixedDate: "2024-01-02T10:00:00Z" });
    const engine = harness.sandbox.SniperDashboardEngine;

    assert.equal(engine.getSessionTf(3600), "Daily");
    assert.equal(engine.getSessionTf(14400), "Weekly");
    assert.equal(engine.getSessionTf(86400), "Monthly");
    assert.equal(engine.getSessionTf(86401), "Yearly");
});

test("buildCompletedSessions excludes the current in-progress daily session", () => {
    const harness = bootstrapDataEngine({ fixedDate: "2024-01-02T10:00:00Z" });
    const internal = harness.sandbox.SniperDashboardEngine._internal;

    const sessions = internal.buildCompletedSessions(
        [
            { time: "2024-01-01T00:00:00Z", open: 1.1, high: 1.12, low: 1.09, close: 1.11 },
            { time: "2024-01-01T12:00:00Z", open: 1.11, high: 1.13, low: 1.1, close: 1.12 },
            { time: "2024-01-02T00:00:00Z", open: 1.12, high: 1.14, low: 1.11, close: 1.13 },
            { time: "2024-01-02T06:00:00Z", open: 1.13, high: 1.15, low: 1.12, close: 1.14 },
        ],
        "Daily",
    );

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].key, "2024-01-01");
});

test("buildCompletedSessions retains fully historical daily sessions", () => {
    const harness = bootstrapDataEngine({ fixedDate: "2024-01-10T10:00:00Z" });
    const internal = harness.sandbox.SniperDashboardEngine._internal;

    const sessions = internal.buildCompletedSessions(
        [
            { time: "2024-01-01T00:00:00Z", open: 1.1, high: 1.12, low: 1.09, close: 1.11 },
            { time: "2024-01-01T12:00:00Z", open: 1.11, high: 1.13, low: 1.1, close: 1.12 },
            { time: "2024-01-02T00:00:00Z", open: 1.12, high: 1.14, low: 1.11, close: 1.13 },
            { time: "2024-01-02T12:00:00Z", open: 1.13, high: 1.15, low: 1.12, close: 1.14 },
        ],
        "Daily",
    );

    assert.equal(sessions.length, 2);
    assert.equal(sessions[1].key, "2024-01-02");
});

test("computeF2FromSwap uses the wider JPY expansion threshold", () => {
    const harness = bootstrapDataEngine({ fixedDate: "2024-03-15T10:00:00Z" });
    const internal = harness.sandbox.SniperDashboardEngine._internal;

    const s2 = { high: 150.2, low: 150.0 };
    const s1 = { high: 151.5, low: 150.15 };
    const result = internal.computeF2FromSwap(s1, s2, "JPY", true, true);

    assert.deepEqual(normalize(result), {
        high: 151.5,
        low: 150.0,
        bull: true,
        name: "SWAP EXP",
        _meta: {
            sameDir: true,
            swapRange: 0.04999999999998295,
            fullRange: 1.5,
            threshold: 0.35,
            expanded: true,
            branch: "EXPANDED",
        },
    });
});

test("canonicalSignal preserves scoring and gate metadata at top-level for planner ranking", () => {
    const harness = bootstrapDataEngine({ fixedDate: "2024-03-15T10:00:00Z" });
    const bridge = harness.sandbox.SniperDashboardData;
    harness.sandbox.liveSignals = [
        {
            pair: "GBP/USD",
            signal_state: "ACTIVE",
            sequence_status: "READY",
            setup_quality: 87,
            execution_quality: 74,
            gate: "BUY",
            gate_reason: "BIAS_ALIGNED",
            chop_band: { low: 1.24, high: 1.25 },
            anchors: {
                f1: { high: 1.31, low: 1.25 },
                f2: { high: 1.29, low: 1.24 },
                f3: { high: 1.28, low: 1.23 },
            },
            f1_high: 1.31,
            f1_low: 1.25,
            f2_high: 1.29,
            f2_low: 1.24,
            f3_high: 1.28,
            f3_low: 1.23,
            final_bias: "BULL_EXP",
            matrix: { matrix_state: "DISCOUNT" },
            pd_array: { pd_array_dir: 1 },
        },
    ];

    const [signal] = bridge.getSignals();
    assert.ok(signal);
    assert.equal(signal.sequence_status, "READY");
    assert.equal(signal.setup_quality, 87);
    assert.equal(signal.execution_quality, 74);
    assert.equal(signal.gate, "BUY");
    assert.equal(signal.gate_reason, "BIAS_ALIGNED");
    assert.deepEqual(normalize(signal.chop_band), { low: 1.24, high: 1.25 });
    assert.deepEqual(normalize(signal.anchors.f3), { high: 1.28, low: 1.23 });
    assert.equal(signal.f1_high, 1.31);
    assert.equal(signal.f2_low, 1.24);
    assert.equal(signal.final_bias, "BULL_EXP");
    assert.deepEqual(normalize(signal.matrix), { matrix_state: "DISCOUNT" });
    assert.deepEqual(normalize(signal.pd_array), { pd_array_dir: 1 });
    assert.equal(signal.enrichment_meta.sequence_status, "READY");
    assert.equal(signal.enrichment_meta.setup_quality, 87);
    assert.equal(signal.enrichment_meta.execution_quality, 74);
});
