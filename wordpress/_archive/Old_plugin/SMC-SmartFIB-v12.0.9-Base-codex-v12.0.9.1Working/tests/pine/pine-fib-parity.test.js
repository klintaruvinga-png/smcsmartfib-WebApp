"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { bootstrapDataEngine } = require("../helpers/dashboard-sandbox");
const { loadAnchorFixtures } = require("../helpers/fixtures");
const {
    PINE_FILE,
    computePineFibAnchors,
    loadPineSource,
    pineFibLevel,
    renderFibLevels,
} = require("../helpers/pine-fib-harness");

function normalize(value) {
    return JSON.parse(JSON.stringify(value));
}

function assertFib(actual, expected, label) {
    assert.deepEqual(normalize(actual), normalize(expected), label);
}

function assertF2Meta(actual, expected, label) {
    assert.equal(Boolean(actual.sameDir), Boolean(expected.sameDir), label + " sameDir");
    assert.equal(actual.threshold, expected.threshold, label + " threshold");
    assert.equal(Boolean(actual.expanded), Boolean(expected.expanded), label + " expanded");
    assert.equal(actual.branch, expected.branch, label + " branch");
    assert.ok(Math.abs(actual.swapRange - expected.swapRange) < 1e-9, label + " swapRange");
    assert.ok(Math.abs(actual.fullRange - expected.fullRange) < 1e-9, label + " fullRange");
}

test("Pine source retains the audited F1/F2/F3 timeframe and draw wiring", () => {
    const source = loadPineSource();

    assert.match(
        source,
        /session_tf\s*=\s*session_tf_override_on\s*\?\s*session_tf_override\s*:\s*_auto_session_tf/,
    );
    assert.match(source, /_tf_secs_for_session\s*<=\s*3600\s*\?\s*"Daily"/);
    assert.match(source, /_tf_secs_for_session\s*<=\s*14400\s*\?\s*"Weekly"/);
    assert.match(source, /_tf_secs_for_session\s*<=\s*86400\s*\?\s*"Monthly"/);
    assert.match(
        source,
        /data_tf\s*=\s*session_tf\s*==\s*"Yearly"\s*\?\s*"D"\s*:\s*session_tf\s*==\s*"Monthly"\s*\?\s*"D"\s*:\s*session_tf\s*==\s*"Weekly"\s*\?\s*"60"\s*:\s*"15"/,
    );
    assert.match(
        source,
        /\\"session_tf\\":\\""\s*\+\s*session_tf\s*\+\s*"\\",\\"fib_timeframe\\":\\""\s*\+\s*session_tf/,
    );
    assert.match(source, /f1_high\s*:=\s*s2_high/);
    assert.match(source, /f1_low\s*:=\s*s2_low/);
    assert.match(source, /f3_high\s*:=\s*s1_high/);
    assert.match(source, /f3_low\s*:=\s*s1_low/);
    assert.match(source, /var bool\s+f2_expanded\s*=\s*false/);
    assert.match(
        source,
        /if\s+_same_dir\s+and\s+_full_rng\s*>\s*0\s+and\s+\(_swap_rng\s*\/\s*_full_rng\)\s*<\s*_f2_expand_thresh/,
    );
    assert.match(source, /f2_name\s*:=\s*f2_expanded\s*\?\s*"SWAP EXP"\s*:\s*"SWAP"/);
    assert.match(source, /f_lvl\(a,\s*b,\s*ratio\)\s*=>\s*a\s*-\s*\(a\s*-\s*b\)\s*\*\s*ratio/);
    assert.match(
        source,
        /lbl_text\s*=\s*fib_name\s*\+\s*" "\s*\+\s*level_pct\s*\+\s*" @ "\s*\+\s*str\.tostring\(price,\s*format\.mintick\)/,
    );
    assert.match(
        source,
        /draw_fib_bi\(_xb_f1_smart,\s*f1_high,\s*f1_low,\s*false,\s*f1_bull,\s*3,\s*f1_name,\s*_xbl_f1_smart\)/,
    );
    assert.match(
        source,
        /draw_fib_bi\(_xb_f2_smart,\s*f2_high,\s*f2_low,\s*true,\s*f2_is_bull,\s*2,\s*f2_name,\s*_xbl_f2_smart\)/,
    );
    assert.match(
        source,
        /draw_fib_bi\(_xb_f3_smart,\s*f3_high,\s*f3_low,\s*false,\s*f3_bull,\s*1,\s*f3_name,\s*_xbl_f3_smart\)/,
    );
});

test("Pine source tracks redraw objects for fib arrows, EF labels, and SF overlays", () => {
    const source = loadPineSource();

    assert.match(
        source,
        /draw_vert_arrow_bi[\s\S]*array\.push\(_fib_lines,\s*_shaft\)[\s\S]*array\.push\(_fib_lines,\s*_tip_l\)[\s\S]*array\.push\(_fib_lines,\s*_tip_r\)[\s\S]*array\.push\(_fib_lines,\s*_base\)/,
    );
    assert.match(source, /show_ef_ote_zone[\s\S]*array\.push\(_fib_boxes,\s*_ote_box\)/);
    assert.match(
        source,
        /show_labels and show_ef_labels[\s\S]*array\.push\(_fib_labels,\s*_l0\)[\s\S]*array\.push\(_fib_labels,\s*_l100\)/,
    );
    assert.match(
        source,
        /show_ef_targets and show_ext and _ef_tp_draw_ok[\s\S]*array\.push\(_fib_labels,\s*_lm1\)[\s\S]*array\.push\(_fib_labels,\s*_lm2\)/,
    );
    assert.match(source, /_sf_box = box\.new[\s\S]*array\.push\(_fib_boxes,\s*_sf_box\)/);
    assert.match(source, /_sf_label = label\.new[\s\S]*array\.push\(_fib_labels,\s*_sf_label\)/);
    assert.match(source, /_sf_arrow = label\.new[\s\S]*array\.push\(_fib_labels,\s*_sf_arrow\)/);
});

test("Pine parity harness matches fixtures and the dashboard anchor engine", () => {
    const fixedNow = Date.parse("2024-06-04T13:30:00Z");
    const harness = bootstrapDataEngine({ fixedDate: "2024-06-04T13:30:00Z" });
    const engine = harness.sandbox.SniperDashboardEngine;

    loadAnchorFixtures().forEach((fixture) => {
        const pine = computePineFibAnchors(
            fixture.candles,
            Object.assign({}, fixture.options, { nowMs: fixedNow }),
        );
        const dash = engine.computeFibAnchors(fixture.candles, fixture.options);

        assert.equal(pine._meta.sessionTf, fixture.expected.sessionTf, fixture.name + " sessionTf");
        assert.equal(pine._meta.s1.key, fixture.expected.sessions.s1.key, fixture.name + " s1 key");
        assert.equal(pine._meta.s2.key, fixture.expected.sessions.s2.key, fixture.name + " s2 key");
        assertFib(pine.f1, fixture.expected.f1, fixture.name + " F1");
        assertFib(
            { high: pine.f2.high, low: pine.f2.low, bull: pine.f2.bull },
            fixture.expected.f2,
            fixture.name + " F2",
        );
        assert.equal(pine.f2.name, fixture.expected.f2Name, fixture.name + " F2 name");
        assertFib(pine.f3, fixture.expected.f3, fixture.name + " F3");
        assertFib(pine.f1, dash.f1, fixture.name + " F1 parity");
        assertFib(
            { high: pine.f2.high, low: pine.f2.low, bull: pine.f2.bull, name: pine.f2.name },
            dash.f2,
            fixture.name + " F2 parity",
        );
        assertFib(pine.f3, dash.f3, fixture.name + " F3 parity");
        assertF2Meta(pine._meta.f2, fixture.expected.f2Meta, fixture.name + " F2 meta");
        assertF2Meta(pine._meta.f2, normalize(dash._meta.f2), fixture.name + " F2 meta parity");
    });
});

test("Pine fib level math produces plotted anchor endpoints and label prices", () => {
    const fixture = loadAnchorFixtures().find((item) => item.name === "daily_usd_expanded");
    const pine = computePineFibAnchors(
        fixture.candles,
        Object.assign({}, fixture.options, {
            nowMs: Date.parse("2024-06-04T13:30:00Z"),
        }),
    );
    const rendered = renderFibLevels(pine.f3, "F3");
    const level0 = rendered.find((item) => item.ratio === 0);
    const level50 = rendered.find((item) => item.ratio === 0.5);
    const level100 = rendered.find((item) => item.ratio === 1);

    assert.equal(level0.price, fixture.expected.f3.high);
    assert.equal(level100.price, fixture.expected.f3.low);
    assert.equal(level50.price, pineFibLevel(pine.f3.high, pine.f3.low, 0.5));
    assert.match(level0.text, /^F3 0% @ /);
    assert.match(level50.text, /^F3 50% @ /);
    assert.match(level100.text, /^F3 100% @ /);
});
