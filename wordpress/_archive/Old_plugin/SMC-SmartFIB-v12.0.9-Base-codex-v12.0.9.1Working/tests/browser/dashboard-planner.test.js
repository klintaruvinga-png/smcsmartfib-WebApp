"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { bootstrapPlanner } = require("../helpers/dashboard-sandbox");

function primePlannerDom(harness) {
    [
        "plan-output",
        "plan-verdict",
        "plan-ladders",
        "plan-checklist",
        "plan-risk",
        "plan-gates",
    ].forEach((id) => harness.sandbox.document.getElementById(id));
}

test("renderPlanFromState forwards only actionable blueprints to the server-plan renderer", () => {
    const harness = bootstrapPlanner({ fixedDate: "2024-06-04T13:30:00Z" });
    primePlannerDom(harness);

    const planner = harness.sandbox.SniperDashboardPlanner;
    let captured = null;

    const rendered = planner.renderPlanFromState({
        signals: [
            { pair: "GBP/USD", signal_state: "ACTIVE", regime: "TREND UP", gate: "BUY" },
            { pair: "EUR/USD", signal_state: "WATCHLIST", regime: "TREND UP", gate: "BUY" },
        ],
        blueprints: [
            { pair: "GBP/USD", status: "READY" },
            { pair: "EUR/USD", status: "READY" },
        ],
        acct: { equity: 5000 },
        prices: {},
        regimes: {},
        renderServerBlueprintPlan: function (ctx, blueprints) {
            captured = { ctx, blueprints };
            return true;
        },
        planContext: {
            gateResults: [{ pair: "GBP/USD" }, { pair: "EUR/USD" }],
            checklist: [{ pair: "GBP/USD" }, { pair: "EUR/USD" }],
        },
    });

    assert.equal(rendered, true);
    assert.ok(captured);
    assert.equal(captured.blueprints.length, 1);
    assert.equal(captured.blueprints[0].pair, "GBP/USD");
    assert.equal(captured.ctx.gateResults.length, 1);
    assert.equal(captured.ctx.checklist.length, 1);
});

test("canonicalState maps validity zero to EXPIRED", () => {
    const harness = bootstrapPlanner({ fixedDate: "2024-06-04T13:30:00Z" });
    const planner = harness.sandbox.SniperDashboardPlanner;

    assert.equal(
        planner.canonicalState({ signal_state: "ACTIVE", validity_bars_remaining: 0 }),
        "EXPIRED",
    );
});

test("renderPlanFromState fallback view exposes fib entry metadata and validation badges", () => {
    const harness = bootstrapPlanner({ fixedDate: "2024-06-04T13:30:00Z" });
    primePlannerDom(harness);

    const planner = harness.sandbox.SniperDashboardPlanner;
    const rendered = planner.renderPlanFromState({
        signals: [
            {
                pair: "GBP/USD",
                signal_state: "ACTIVE",
                regime: "TREND UP",
                gate: "BUY",
                entry_source: "EF",
                sl_rule: "STAGE_EF_NEXT_LEVEL",
                fallback_reason: null,
                anchors: {
                    f3: { high: 1.255, low: 1.245 },
                },
            },
        ],
        blueprints: [],
        acct: { equity: 5000 },
    });

    assert.equal(rendered, true);
    const laddersHtml = harness.sandbox.document.getElementById("plan-ladders").innerHTML;
    assert.match(laddersHtml, /Entry Source/);
    assert.match(laddersHtml, /STAGE_EF_NEXT_LEVEL/);
    assert.match(laddersHtml, /EF OK/);
    assert.match(laddersHtml, /F3 OK/);
    assert.match(laddersHtml, /F1 PENDING/);
});
