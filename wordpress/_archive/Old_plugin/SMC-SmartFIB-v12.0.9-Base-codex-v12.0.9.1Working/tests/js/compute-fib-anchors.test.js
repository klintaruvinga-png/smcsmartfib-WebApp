"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { bootstrapDataEngine } = require("../helpers/dashboard-sandbox");
const { loadAnchorFixtures } = require("../helpers/fixtures");

function assertFib(actual, expected, label) {
    assert.equal(actual.high, expected.high, label + " high");
    assert.equal(actual.low, expected.low, label + " low");
    assert.equal(actual.bull, expected.bull, label + " bull");
}

function normalize(value) {
    return JSON.parse(JSON.stringify(value));
}

function assertMeta(actual, expected, label) {
    assert.equal(Boolean(actual.sameDir), Boolean(expected.sameDir), label + " sameDir");
    assert.equal(actual.threshold, expected.threshold, label + " threshold");
    assert.ok(Math.abs(actual.swapRange - expected.swapRange) < 1e-9, label + " swapRange");
    assert.ok(Math.abs(actual.fullRange - expected.fullRange) < 1e-9, label + " fullRange");
    assert.equal(Boolean(actual.expanded), Boolean(expected.expanded), label + " expanded");
    assert.equal(actual.branch, expected.branch, label + " branch");
}

test("computeFibAnchors matches baseline anchor fixtures", () => {
    const harness = bootstrapDataEngine({ fixedDate: "2024-06-04T13:30:00Z" });
    const engine = harness.sandbox.SniperDashboardEngine;
    const fixtures = loadAnchorFixtures();

    fixtures.forEach((fixture) => {
        const result = engine.computeFibAnchors(fixture.candles, fixture.options);
        assert.equal(
            result._meta.sessionTf,
            fixture.expected.sessionTf,
            fixture.name + " sessionTf",
        );
        assert.equal(
            result._meta.s1.key,
            fixture.expected.sessions.s1.key,
            fixture.name + " s1 key",
        );
        assert.equal(
            result._meta.s2.key,
            fixture.expected.sessions.s2.key,
            fixture.name + " s2 key",
        );
        assertFib(result.f1, fixture.expected.f1, fixture.name + " F1");
        assertFib(result.f2, fixture.expected.f2, fixture.name + " F2");
        assertFib(result.f3, fixture.expected.f3, fixture.name + " F3");
        assert.equal(result.f2.name, fixture.expected.f2Name, fixture.name + " F2 name");
        assertMeta(normalize(result._meta.f2), fixture.expected.f2Meta, fixture.name + " F2 meta");
        assert.equal(
            Object.prototype.hasOwnProperty.call(fixture.expected, "ef"),
            true,
            fixture.name + " EF field declared",
        );
    });
});

test("computeInstrumentSnapshot exposes additive anchor metadata for Pine parity", () => {
    const harness = bootstrapDataEngine({ fixedDate: "2024-06-04T13:30:00Z" });
    const engine = harness.sandbox.SniperDashboardEngine;
    const fixture = loadAnchorFixtures().find((item) => item.name === "daily_usd_expanded");
    const snapshot = engine.computeInstrumentSnapshot(fixture.pair, fixture.candles, {
        tfSeconds: fixture.options.tfSeconds,
        pipType: fixture.options.pipType,
        lockedHigh: 105.0,
        lockedLow: 100.0,
    });

    assert.equal(snapshot.anchors_meta.session_tf, fixture.expected.sessionTf);
    assert.equal(snapshot.anchors_meta.completed_sessions.s1_key, fixture.expected.sessions.s1.key);
    assert.equal(snapshot.anchors_meta.completed_sessions.s2_key, fixture.expected.sessions.s2.key);
    assert.equal(snapshot.anchors_meta.fib_roles.f1, "OLDER_COMPLETED_SESSION");
    assert.equal(snapshot.anchors_meta.fib_roles.f3, "MOST_RECENT_COMPLETED_SESSION");
    assert.equal(snapshot.anchors_meta.f2_branch, fixture.expected.f2Meta.branch);
    assert.equal(snapshot.anchors_meta.f2_label, fixture.expected.f2Name);
});
