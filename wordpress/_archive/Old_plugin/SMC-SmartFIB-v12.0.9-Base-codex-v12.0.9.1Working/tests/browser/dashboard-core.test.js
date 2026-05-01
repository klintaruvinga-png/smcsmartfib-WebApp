'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { bootstrapCore } = require('../helpers/dashboard-sandbox');
const { loadFixture } = require('../helpers/fixtures');

test('SniperDashboardCore __test__.getNextLevelSL keeps EF levels out of the current SL path', () => {
  const harness = bootstrapCore({ fixedDate: '2024-06-04T13:30:00Z' });
  const core = harness.sandbox.SniperDashboardCore;
  const nextLevel = core.__test__.getNextLevelSL(1.25, 'BUY', [
    { fib: 'EF 62.5%', price: 1.2498, side: 'DISCOUNT' },
    { fib: 'F3 62.5%', price: 1.2485, side: 'DISCOUNT' },
    { fib: 'F3 50%', price: 1.2475, side: 'DISCOUNT' }
  ], 5);

  assert.equal(nextLevel, 1.2483);
});

test('getStageStopData prefers the next EF level for EF-owned ladder stages', () => {
  const harness = bootstrapCore({ fixedDate: '2024-06-04T13:30:00Z' });
  const core = harness.sandbox.SniperDashboardCore;
  const stop = core.__test__.getStageStopData(1.215, 'BUY', [
    { fib: 'F3 Dynamic', pct: '62.5%', price: 1.2275, side: 'DISCOUNT' },
    { fib: 'EF Range', pct: '62.5%', price: 1.215, side: 'DISCOUNT' },
    { fib: 'EF Range', pct: '75%', price: 1.21, side: 'DISCOUNT' },
    { fib: 'EF Range', pct: '100%', price: 1.2, side: 'DISCOUNT' }
  ], 5, { preferEf: true, fallbackToAny: false });

  assert.equal(stop.rule, 'EF_NEXT_LEVEL');
  assert.equal(stop.level.pct, '75%');
  assert.equal(stop.price, 1.2098);
});

test('postEngineToBackend shapes the batch payload from live signal and snapshot data', async () => {
  const harness = bootstrapCore({ fixedDate: '2024-06-04T13:30:00Z' });
  const core = harness.sandbox.SniperDashboardCore;

  core.__test__.setState({
    PAIRS: ['GBP/USD'],
    savedPrices: { 'GBP/USD': 1.2501 }
  });

  let captured = null;
  harness.sandbox.fetch = async function(url, init) {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
      text: async () => ''
    };
  };

  await core.__test__.postEngineToBackend(
    {
      'GBP/USD': {
        bias_profile: 'SWING',
        regime: 'TREND UP',
        sequence_status: 'READY',
        signal_state: 'ACTIVE',
        direction: 'BUY',
        entry_zone_label: '62.5%',
        entry_zone_price: 1.25,
        sweep_confirmed: true,
        mss_confirmed: true,
        confluence_score: 4,
        ede_stars: 3,
        structure: { internal_shift: true },
        htf_dol: { htf_dol_label: 'BSL' },
        matrix: { matrix_state: 'DISCOUNT' },
        matrix_tf: 'Weekly',
        pd_array: { pd_array_dir: 1 },
        pd_tf: 'Daily',
        final_bias: 'BULL_EXP',
        bull_bias_score: 62,
        bear_bias_score: 12,
        bull_pressure: 0.68,
        bear_pressure: 0.32,
        pressure_bias: 'BULLISH',
        fib_disagreement_penalty: 0,
        chop_band: { low: 1.22, high: 1.23 },
        gate: 'BUY',
        gate_reason: 'BIAS_ALIGNED',
        levels: [{ label: '62.5%', price: 1.25 }],
        blockers: [],
        updated_at: '2024-06-04T13:30:00.000Z'
      }
    },
    { 'GBP/USD': 'TREND UP' },
    {
      'GBP/USD': {
        anchors: {
          f3: { high: 1.255, low: 1.245 }
        },
        levels: [{ label: '62.5%', price: 1.25 }]
      }
    }
  );

  assert.ok(captured);
  assert.match(captured.url, /user\/engine-batch$/);

  const payload = JSON.parse(captured.init.body);
  assert.equal(payload.signal_schema_version, '12.0.9.1');
  assert.equal(payload.pairs.GBPUSD.market_price, 1.2501);
  assert.equal(payload.pairs.GBPUSD.entry_zone_price, 1.25);
  assert.deepEqual(payload.pairs.GBPUSD.anchors.f3, { high: 1.255, low: 1.245 });
  assert.deepEqual(payload.pairs.GBPUSD.levels, [{ label: '62.5%', price: 1.25 }]);
});

test('postEngineToBackend preserves blocker metadata when only snapshot data exists', async () => {
  const harness = bootstrapCore({ fixedDate: '2024-06-04T13:30:00Z' });
  const core = harness.sandbox.SniperDashboardCore;

  core.__test__.setState({
    PAIRS: ['GBP/USD'],
    savedPrices: { 'GBP/USD': 1.2501 }
  });

  let captured = null;
  harness.sandbox.fetch = async function(url, init) {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
      text: async () => ''
    };
  };

  await core.__test__.postEngineToBackend(
    {},
    { 'GBP/USD': 'RANGING' },
    {
      'GBP/USD': {
        regime: 'RANGING',
        sequence_status: 'AWAIT SWEEP',
        final_bias: 'NEUTRAL',
        gate: 'NONE',
        gate_reason: 'IN_CHOP_BAND',
        chop_band: { low: 1.249, high: 1.251 },
        anchors: {
          f1: { high: 1.27, low: 1.22 },
          f2: { high: 1.265, low: 1.225 },
          f3: { high: 1.255, low: 1.245 }
        },
        levels: [{ label: 'F3 50%', price: 1.25 }],
        updated_at: '2024-06-04T13:30:00.000Z'
      }
    }
  );

  assert.ok(captured);
  const payload = JSON.parse(captured.init.body);
  const row = payload.pairs.GBPUSD;
  assert.equal(row.signal_state, 'INVALID');
  assert.equal(row.blocked_reason, 'IN_CHOP_BAND');
  assert.equal(row.gate, 'NONE');
  assert.equal(row.gate_reason, 'IN_CHOP_BAND');
  assert.deepEqual(row.blockers, ['IN_CHOP_BAND']);
  assert.deepEqual(row.chop_band, { low: 1.249, high: 1.251 });
  assert.deepEqual(row.anchors.f1, { high: 1.27, low: 1.22 });
  assert.deepEqual(row.anchors.f2, { high: 1.265, low: 1.225 });
  assert.deepEqual(row.anchors.f3, { high: 1.255, low: 1.245 });
  assert.deepEqual(row.levels, [{ label: 'F3 50%', price: 1.25 }]);
});

test('normalizeLiveSignal preserves backend-owned fib contract fields', () => {
  const harness = bootstrapCore({ fixedDate: '2024-06-04T13:30:00Z' });
  const core = harness.sandbox.SniperDashboardCore;

  const signal = core.__test__.normalizeLiveSignal({
    pair: 'GBP/USD',
    f1_high: '1.31',
    f1_low: '1.25',
    f2_high: '1.29',
    f2_low: '1.24',
    f3_high: '1.28',
    f3_low: '1.23',
    anchors: {
      f1: { high: 1.31, low: 1.25 },
      f2: { high: 1.29, low: 1.24 },
      f3: { high: 1.28, low: 1.23 }
    },
    final_bias: 'BULL_EXP',
    matrix: { matrix_state: 'DISCOUNT' },
    pd_array: { pd_array_dir: 1 }
  });

  assert.equal(signal.f1_high, 1.31);
  assert.equal(signal.f2_low, 1.24);
  assert.deepEqual(signal.anchors.f3, { high: 1.28, low: 1.23 });
  assert.deepEqual(signal.matrix, { matrix_state: 'DISCOUNT' });
  assert.deepEqual(signal.pd_array, { pd_array_dir: 1 });
});

test('getAuthoritySFAnchor keeps local composite source distinct from Pine HTF authority', () => {
  const harness = bootstrapCore({ fixedDate: '2024-06-04T13:30:00Z' });
  const core = harness.sandbox.SniperDashboardCore;

  core.__test__.setState({
    sflAnchors: {
      'GBP/USD': {
        authority: {
          fibHigh: 1.3,
          fibLow: 1.2,
          source: 'local_fib_composite',
          authority_equivalent: false
        }
      }
    }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(core.__test__.getAuthoritySFAnchor('GBP/USD'))), {
    fibHigh: 1.3,
    fibLow: 1.2,
    source: 'local_fib_composite'
  });
});

test('legacy execution payload is gated on authoritative backend contract fields', () => {
  const harness = bootstrapCore({ fixedDate: '2024-06-04T13:30:00Z' });
  const core = harness.sandbox.SniperDashboardCore;
  const ladder = {
    pair: 'GBP/USD',
    dir: 'BUY',
    regime: 'TREND UP',
    zone: { price: 1.25, pct: '62.5%', fib: 'F3' },
    mkt: 1.251,
    sl: 1.245,
    tp1: { price: 1.26 },
    tp2: { price: 1.27 },
    entries: [{ entry: 1.25, sl: 1.245, lots: 0.01 }]
  };

  assert.equal(core.__test__.legacyExecutionPayloadFromLadder(ladder, {
    runtimeTruth: { gate: 'BUY', final_bias: 'BULL_EXP' }
  }), null);

  const payload = core.__test__.legacyExecutionPayloadFromLadder(ladder, {
    runtimeTruth: {
      gate: 'BUY',
      gate_reason: 'BIAS_ALIGNED',
      sequence_status: 'READY',
      signal_state: 'ACTIVE',
      runtime_signal: {
        final_bias: 'BULL_EXP',
        matrix: { matrix_state: 'DISCOUNT' },
        pd_array: { pd_array_dir: 1 },
        fib_timeframe: 'WEEKLY'
      }
    }
  });

  assert.ok(payload);
  assert.equal(payload.gate, 'BUY');
  assert.equal(payload.final_bias, 'BULL_EXP');
  assert.deepEqual(payload.matrix, { matrix_state: 'DISCOUNT' });
  assert.deepEqual(payload.pd_array, { pd_array_dir: 1 });
  assert.equal(payload.fib_timeframe, 'WEEKLY');
});

test('buildSignalForPair prefers an EF-owned entry when EF is valid', () => {
  const harness = bootstrapCore({ fixedDate: '2024-06-04T13:30:00Z' });
  const core = harness.sandbox.SniperDashboardCore;
  const engine = harness.sandbox.SniperDashboardEngine;

  engine.computeInstrumentSnapshot = function() {
    return {
      regime: 'TREND UP',
      sequence_status: 'READY',
      final_bias: 'BULL_EXP',
      gate: 'BUY',
      gate_reason: 'BIAS_ALIGNED',
      chop_band: { low: 1.22, high: 1.23 },
      levels: [
        { label: 'F3 62.5%', price: 1.25001, zone: 'buy' },
        { label: 'EF 62.5%', price: 1.25012, zone: 'buy' },
        { label: 'EF 75%', price: 1.2499, zone: 'buy' },
        { label: 'EF 100%', price: 1.2496, zone: 'buy' },
        { label: 'F3 75%', price: 1.2498, zone: 'buy' }
      ],
      updated_at: '2024-06-04T13:30:00.000Z'
    };
  };

  engine.computeSweepMssSequence = function(candles) {
    const last = candles[candles.length - 1] || {};
    return {
      bars: [{
        sequenceStatus: 'READY',
        setup_class: 'A',
        blocked_reason: '',
        setup_quality: 80,
        execution_quality: 70,
        confirmed_sweep_up: true,
        confirmed_sweep_down: false,
        mss_bullish: true,
        mss_bearish: false,
        timeMs: Number(last.timeMs) || Date.now()
      }]
    };
  };

  const candles = [
    { timeMs: 1717502400000, close: 1.2495 },
    { timeMs: 1717506000000, close: 1.2502 }
  ];
  const signal = core.__test__.buildSignalForPair('GBP/USD', candles, 1.2502, 'TREND UP');

  assert.ok(signal);
  assert.equal(signal.direction, 'BUY');
  assert.equal(signal.entry_source, 'EF');
  assert.equal(signal.entry_zone_label, 'EF 62.5%');
  assert.equal(signal.entry_zone_price, 1.25012);
  assert.equal(signal.sl_rule, 'STAGE_EF_NEXT_LEVEL');
  assert.equal(signal.entry_levels[0].source, 'EF');
  assert.equal(signal.entry_levels[1].label, 'EF 75%');
  assert.equal(signal.sl_levels[0].rule, 'EF_NEXT_LEVEL');
  assert.equal(signal.sl_levels[0].level_label, 'EF 75%');
  assert.equal(signal.fallback_reason, null);
});

test('buildLegacyPlanContext uses EF ladder entries and stage-specific EF stops when EF is available', () => {
  const harness = bootstrapCore({
    fixedDate: '2024-06-04T13:30:00Z',
    localStorage: {
      sn_act: JSON.stringify({ equity: 5000 }),
      sn_start: JSON.stringify('2024-06-01')
    }
  });
  const core = harness.sandbox.SniperDashboardCore;

  core.__test__.setState({
    PAIRS: ['GBP/USD'],
    savedPrices: { 'GBP/USD': 1.221 },
    savedRegimes: { 'GBP/USD': 'TREND UP' },
    efLevels: {
      'GBP/USD': {
        mode: 'Range',
        fibHigh: 1.24,
        fibLow: 1.2,
        lastUpdate: '2024-06-04T13:30:00.000Z'
      }
    },
    sflAnchors: {
      'GBP/USD': {
        fibHigh: 1.34,
        fibLow: 1.16,
        source: 'test'
      }
    },
    fibTimeframe: 'Weekly'
  });
  harness.sandbox.document.getElementById('pr-GBPUSD').value = '1.221';
  harness.sandbox.document.getElementById('rg-GBPUSD').value = 'TREND UP';

  const context = core.__test__.buildLegacyPlanContext();
  assert.ok(context);
  assert.equal(context.ladders.length, 1);

  const ladder = context.ladders[0];
  assert.equal(ladder.entrySource, 'EF');
  assert.equal(ladder.slRule, 'STAGE_EF_NEXT_LEVEL');
  assert.equal(JSON.stringify(ladder.entries.map((entry) => entry.entry)), JSON.stringify([1.215, 1.21, 1.2]));
  assert.equal(ladder.entries[0].entry_source, 'EF');
  assert.equal(ladder.entries[0].sl_rule, 'EF_NEXT_LEVEL');
  assert.equal(ladder.entries[0].sl_level_label, 'EF 75%');
  assert.equal(ladder.entries[1].sl_rule, 'EF_NEXT_LEVEL');
  assert.equal(ladder.entries[1].sl_level_label, 'EF 100%');
  assert.equal(ladder.entries[2].sl_rule, 'LEGACY_BUFFER');
});

test('renderServerBlueprintPlan exposes entry metadata, stage SL metadata, and fib validation badges', () => {
  const harness = bootstrapCore({ fixedDate: '2024-06-04T13:30:00Z' });
  const core = harness.sandbox.SniperDashboardCore;
  ['plan-output', 'plan-verdict', 'plan-ladders', 'plan-checklist', 'plan-risk', 'plan-gates']
    .forEach((id) => harness.sandbox.document.getElementById(id));

  core.__test__.setState({
    computedSnapshots: {
      'GBP/USD': {
        anchors: {
          f1: { high: 1.31, low: 1.25 },
          f2: { high: 1.29, low: 1.24 },
          f3: { high: 1.255, low: 1.245 }
        }
      }
    }
  });

  const rendered = core.__test__.renderServerBlueprintPlan({
    staleHtml: '',
    verdictClass: 'ok',
    verdict: 'ACTIONABLE SIGNALS READY',
    verdictBody: '1 backend blueprint available.',
    checklist: [],
    gateResults: [],
    equity: 5000,
    day: 0,
    ts: '2024-06-04T13:30:00.000Z',
    prices: {},
    regimes: {}
  }, [{
    pair: 'GBP/USD',
    direction: 'BUY',
    regime: 'TREND UP',
    zone_label: 'EF 62.5%',
    zone_price: 1.215,
    market_price: 1.221,
    total_risk_usc: 31.4,
    rr1: 2.5,
    entry_source: 'EF',
    sl_rule: 'STAGE_EF_NEXT_LEVEL',
    fallback_reason: null,
    entries: [1.215, 1.21, 1.2],
    stage_sls: [1.2098, 1.1998, 1.196],
    entry_levels: [
      { label: 'EF 62.5%', source: 'EF' },
      { label: 'EF 75%', source: 'EF' },
      { label: 'EF 100%', source: 'EF' }
    ],
    sl_levels: [
      { rule: 'EF_NEXT_LEVEL', level_label: 'EF 75%' },
      { rule: 'EF_NEXT_LEVEL', level_label: 'EF 100%' },
      { rule: 'LEGACY_BUFFER', level_label: '' }
    ],
    sl: 1.2098,
    tp1: 1.228,
    tp2: 1.232,
    risk_breakdown: {
      available: true,
      total_risk_usc: 31.4,
      total_risk_zar: 5.24,
      dd_impact_pct: 0.63,
      dd_warning: false,
      stages: [
        { entry: 1.215, sl: 1.2098, lot: 0.01, sl_pips: 52, risk_usc: 5.2, risk_zar: 0.87 },
        { entry: 1.21, sl: 1.1998, lot: 0.01, sl_pips: 102, risk_usc: 10.2, risk_zar: 1.7 },
        { entry: 1.2, sl: 1.196, lot: 0.04, sl_pips: 40, risk_usc: 16.0, risk_zar: 2.67 }
      ]
    },
    provenance: 'BACKEND_BLUEPRINT',
    equity_at_calc: 5000
  }]);

  assert.equal(rendered, true);
  const laddersHtml = harness.sandbox.document.getElementById('plan-ladders').innerHTML;
  assert.match(laddersHtml, /Entry Source/);
  assert.match(laddersHtml, /STAGE_EF_NEXT_LEVEL/);
  assert.match(laddersHtml, /EF 75%/);
  assert.match(laddersHtml, /F1 OK/);
  assert.match(laddersHtml, /F2 OK/);
  assert.match(laddersHtml, /F3 OK/);
});

test('execution baseline fixture documents expected PHP-style ladder outputs', () => {
  const fixture = loadFixture('execution_buy_weekly');
  assert.deepEqual(fixture.expected.entries, [1.2003, 1.20015, 1.2]);
  assert.equal(fixture.expected.sl, 1.196);
  assert.equal(fixture.expected.rr1, 1.79);
});

test('fetchPrices allows a manual refresh immediately after a recent background refresh timestamp', async () => {
  const calls = [];
  const harness = bootstrapCore({
    fixedDate: '2024-06-04T13:30:00Z',
    fetch: async function(url) {
      calls.push(url);
      if (/kind=prices/.test(url)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ 'GBP/USD': { price: 1.2501 } }),
          text: async () => ''
        };
      }
      if (/kind=candles/.test(url)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ values: [{ open: '1.2450' }] }),
          text: async () => ''
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
        text: async () => ''
      };
    }
  });
  const core = harness.sandbox.SniperDashboardCore;
  harness.sandbox.setTimeout = function(fn) { fn(); return 1; };
  harness.sandbox.generatePlan = function() {};

  ['fetch-btn', 'price-status', 'price-status-plan', 'pr-GBPUSD']
    .forEach((id) => harness.sandbox.document.getElementById(id));

  core.__test__.setState({
    PAIRS: ['GBP/USD'],
    savedPrices: {},
    signalEngineStatus: 'LIVE',
    lastSignalEngineAttemptAt: 1,
    dataHydration: { engineRunAttempted: true }
  });

  core.__test__.fetchPrices._lastCall = new harness.sandbox.Date('2024-06-04T13:29:45Z');

  const result = await core.__test__.fetchPrices(true);

  assert.equal(result, true);
  assert.equal(harness.sandbox.document.getElementById('pr-GBPUSD').value, '1.25010');
  assert.ok(calls.some((url) => /kind=prices/.test(url)));
  assert.equal(core.__test__.fetchPrices._pending, null);
});

test('shouldReconcileLocalEngineState stays true after a failed startup attempt until local runtime gate data exists', () => {
  const harness = bootstrapCore({ fixedDate: '2024-06-04T13:30:00Z' });
  const core = harness.sandbox.SniperDashboardCore;

  core.__test__.setState({
    PAIRS: ['GBP/USD'],
    savedPrices: { 'GBP/USD': 1.2501 },
    signalEngineStatus: 'STALE',
    lastSignalEngineAttemptAt: 1717507800000,
    dataHydration: { engineRunAttempted: true }
  });

  assert.equal(core.__test__.hasRenderableLocalEngineState(['GBP/USD']), false);
  assert.equal(core.__test__.shouldReconcileLocalEngineState(['GBP/USD']), true);

  core.__test__.setState({
    computedSnapshots: {
      'GBP/USD': {
        regime: 'TREND UP',
        gate: 'BUY'
      }
    }
  });

  assert.equal(core.__test__.hasRenderableLocalEngineState(['GBP/USD']), true);
  assert.equal(core.__test__.shouldReconcileLocalEngineState(['GBP/USD']), false);
});

test('runSignalEngineNow schedules a fast retry when every candle fetch fails for priced pairs', async () => {
  const scheduled = [];
  const cleared = [];
  const harness = bootstrapCore({
    fixedDate: '2024-06-04T13:30:00Z',
    fetch: async function(url) {
      if (/kind=candles/.test(url)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'error', message: 'upstream unavailable' }),
          text: async () => ''
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
        text: async () => ''
      };
    }
  });
  const core = harness.sandbox.SniperDashboardCore;
  harness.sandbox.setTimeout = function(fn, delay) {
    scheduled.push(delay);
    return scheduled.length;
  };
  harness.sandbox.clearTimeout = function(id) {
    cleared.push(id);
  };

  core.__test__.setState({
    PAIRS: ['GBP/USD'],
    savedPrices: { 'GBP/USD': 1.2501 },
    signalEngineStatus: 'OFFLINE',
    dataHydration: { engineRunAttempted: false }
  });

  await core.__test__.runSignalEngineNow({ reason: 'test_candle_failure' });

  const state = core.__test__.getState();
  assert.equal(state.signalEngineStatus, 'STALE');
  assert.equal(core.__test__.hasRenderableLocalEngineState(['GBP/USD']), false);
  assert.equal(core.__test__.shouldReconcileLocalEngineState(['GBP/USD']), true);
  assert.ok(scheduled.includes(30000));
  assert.ok(scheduled.includes(15000));
  assert.ok(cleared.length >= 1);
});
