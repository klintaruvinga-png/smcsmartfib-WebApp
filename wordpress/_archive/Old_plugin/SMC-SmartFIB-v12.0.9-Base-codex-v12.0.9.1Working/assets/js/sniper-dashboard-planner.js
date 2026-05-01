(function (window) {
  'use strict';

  function canonicalState(signal) {
    var util = window.SniperSignalState;
    var validity = Number(signal && signal.validity_bars_remaining);
    var raw = signal && (signal.state || signal.signal_state);
    if (util && typeof util.canonicalize === 'function') {
      return util.canonicalize(raw, validity);
    }
    if (validity === 0) return 'EXPIRED';
    var normalized = String(raw || 'INVALID').trim().toUpperCase();
    if (['INVALID', 'WATCHLIST', 'READY', 'ACTIVE', 'EXPIRED'].indexOf(normalized) > -1) return normalized;
    return 'INVALID';
  }

  function getActionableBlueprints(signals, blueprints) {
    var allowedPairs = {};
    (signals || []).forEach(function(signal) {
      var state = canonicalState(signal);
      if (state === 'READY' || state === 'ACTIVE') {
        allowedPairs[String(signal && signal.pair || '').toUpperCase()] = true;
      }
    });
    if (!Array.isArray(blueprints)) return [];
    return blueprints.filter(function(blueprint) {
      var status = String(blueprint && blueprint.status || 'READY').toUpperCase();
      var pair = String(blueprint && blueprint.pair || '').toUpperCase();
      return allowedPairs[pair] && (status === 'READY' || status === 'ACTIVE');
    });
  }

  function scoreSignal(signal) {
    var setupQ = Number(signal && (signal.setup_quality != null ? signal.setup_quality : signal.setupQ));
    var execQ = Number(signal && (signal.execution_quality != null ? signal.execution_quality : signal.execQ));
    var bull = Number(signal && signal.bull_bias_score);
    var bear = Number(signal && signal.bear_bias_score);
    var sequence = String(signal && signal.sequence_status || '').toUpperCase();
    var gate = String(signal && signal.gate || '').toUpperCase();
    var chopBand = signal && signal.chop_band;
    var score = (isFinite(setupQ) ? setupQ : 0) + (isFinite(execQ) ? execQ : 0) * 0.6;
    score += (isFinite(bull) ? bull : 0) * 0.2;
    score += (isFinite(bear) ? bear : 0) * 0.2;
    if (sequence === 'READY') score += 20;
    if (gate === 'BUY' || gate === 'SELL' || gate === 'BOTH') score += 12;
    if (chopBand && chopBand.low != null && chopBand.high != null) score -= 4;
    return Math.round(score * 100) / 100;
  }

  function hasFibAnchor(anchor) {
    return !!(anchor && anchor.high != null && anchor.low != null);
  }

  function renderSignalValidationBadges(signal) {
    var anchors = signal && signal.anchors && typeof signal.anchors === 'object' ? signal.anchors : {};
    var entrySource = String(signal && signal.entry_source || '').toUpperCase();
    var fallbackReason = signal && signal.fallback_reason ? String(signal.fallback_reason) : '';
    var badges = [];
    badges.push('<span class="' + (entrySource === 'EF' ? 'pg2' : (fallbackReason ? 'pr2' : 'pgy')) + ' pill" title="Entry routing metadata. Execution authority remains backend-owned.">' + (entrySource === 'EF' ? 'EF OK' : (fallbackReason ? 'EF FALLBACK' : 'EF N/A')) + '</span>');
    [['f1', 'F1'], ['f2', 'F2'], ['f3', 'F3']].forEach(function (row) {
      badges.push('<span class="' + (hasFibAnchor(anchors[row[0]]) ? 'pg2' : 'pgy') + ' pill" title="Canonical audit metadata; not an execution gate.">' + row[1] + ' ' + (hasFibAnchor(anchors[row[0]]) ? 'OK' : 'PENDING') + '</span>');
    });
    return badges.join(' ');
  }

  function renderSignalMeta(signal) {
    var rows = [
      '<div class="kv"><span class="kvl">Entry Source</span><span class="kvv">' + String(signal && signal.entry_source || 'FIB') + '</span></div>',
      '<div class="kv"><span class="kvl">SL Rule</span><span class="kvv">' + String(signal && signal.sl_rule || 'LEGACY_NEXT_LEVEL') + '</span></div>'
    ];
    if (signal && signal.fallback_reason) {
      rows.push('<div class="kv"><span class="kvl">Fallback</span><span class="kvv wrn">' + String(signal.fallback_reason) + '</span></div>');
    }
    rows.push('<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' + renderSignalValidationBadges(signal) + '</div>');
    return rows.join('');
  }

  function renderFallbackPlan(signals, state) {
    var planOutput = document.getElementById('plan-output');
    var verdictEl = document.getElementById('plan-verdict');
    var laddersEl = document.getElementById('plan-ladders');
    var checklistEl = document.getElementById('plan-checklist');
    var riskEl = document.getElementById('plan-risk');
    var gatesEl = document.getElementById('plan-gates');
    if (!planOutput || !verdictEl || !laddersEl || !checklistEl || !riskEl || !gatesEl) {
      return false;
    }

    var actionable = [];
    var watchlist = [];
    var expired = [];

    var rankedSignals = signals.slice().sort(function (a, b) { return scoreSignal(b) - scoreSignal(a); });
    rankedSignals.forEach(function (signal) {
      var signalState = canonicalState(signal);
      if (signalState === 'INVALID') return;
      if (signalState === 'EXPIRED') {
        expired.push(signal);
        return;
      }
      if (signalState === 'WATCHLIST') {
        watchlist.push(signal);
        return;
      }
      actionable.push(signal);
    });

    planOutput.style.display = 'block';
    verdictEl.innerHTML =
      '<div class="verdict-box ' + (actionable.length ? 'ok' : 'warn') + '">' +
      '<div class="verdict-lbl" style="color:' + (actionable.length ? 'var(--gr)' : 'var(--am)') + '">' +
      (actionable.length ? 'ACTIONABLE SIGNALS READY' : 'WATCHLIST ONLY') +
      '</div>' +
      '<div class="verdict-body">' +
      actionable.length + ' actionable, ' + watchlist.length + ' watchlist, ' + expired.length + ' expired.' +
      '<br><span style="color:var(--ac)">Planner is using backend-enriched state.</span>' +
      '</div></div>';

    laddersEl.innerHTML = actionable.length
      ? actionable.map(function (signal) {
          var primaryTp = signal.tp1 != null ? signal.tp1 : '--';
          var entryPrice = signal.zone_price != null ? signal.zone_price : (signal.entry_zone_price != null ? signal.entry_zone_price : '--');
          var pill = typeof state.statePill === 'function' ? state.statePill(canonicalState(signal)) : canonicalState(signal);
          return '<div class="ladder-table"><div class="ladder-header">' +
            '<div><span class="ladder-title" style="color:var(--gr)">' + signal.pair + ' ' + signal.direction + '</span> ' +
            pill +
            '</div></div>' +
            '<div style="padding:14px;font-size:12px;color:var(--tx)">Entry zone: <span class="mn">' + entryPrice + '</span> ' +
            '&nbsp;|&nbsp; SL: <span class="mn">' + (signal.sl != null ? signal.sl : '--') + '</span>' +
            '&nbsp;|&nbsp; TP1: <span class="mn">' + primaryTp + '</span>' +
            '&nbsp;|&nbsp; Bias: <span class="mn">' + (signal.final_bias || '--') + '</span>' +
            '&nbsp;|&nbsp; Gate: <span class="mn">' + (signal.gate || '--') + '</span>' +
            '<div style="margin-top:10px">' + renderSignalMeta(signal) + '</div>' +
            '</div></div>';
        }).join('')
      : '<div class="card"><div class="smc-muted">No ladders rendered. WATCHLIST and EXPIRED signals are intentionally non-actionable.</div></div>';

    checklistEl.innerHTML =
      '<div class="card"><div class="clbl">Checklist</div>' +
      '<div class="kv"><span class="kvl">INVALID signals</span><span class="kvv">Excluded from planner output</span></div>' +
      '<div class="kv"><span class="kvl">WATCHLIST signals</span><span class="kvv">Shown without entry ladders</span></div>' +
      '<div class="kv"><span class="kvl">EXPIRED signals</span><span class="kvv">Forced non-actionable when validity is 0</span></div></div>';

    riskEl.innerHTML =
      '<div class="card"><div class="clbl">Actionable</div><div class="cval pos">' + actionable.length + '</div><div class="csub">READY or ACTIVE</div></div>' +
      '<div class="card"><div class="clbl">Watchlist</div><div class="cval wrn">' + watchlist.length + '</div><div class="csub">Visible but gated</div></div>' +
      '<div class="card"><div class="clbl">Expired</div><div class="cval neg">' + expired.length + '</div><div class="csub">Suppressed from execution</div></div>';

    gatesEl.innerHTML = signals.map(function (signal) {
      var signalState = canonicalState(signal);
      if (signalState === 'INVALID') return '';
      return '<div class="kv"><span class="kvl">' + signal.pair + '</span><span class="kvv">' + signalState + ' / ' + (signal.regime || 'NO REGIME') + ' / ' + (signal.gate || 'NO GATE') + '</span></div>';
    }).join('');

    return true;
  }

  function renderPlanFromState(state) {
    var signals = Array.isArray(state && state.signals) ? state.signals.slice() : [];
    if (!signals.length) {
      return false;
    }

    var blueprints = getActionableBlueprints(signals, state && state.blueprints);
    if (blueprints.length && state && typeof state.renderServerBlueprintPlan === 'function') {
      var blueprintPairs = {};
      blueprints.forEach(function (blueprint) {
        var pair = String(blueprint && blueprint.pair || '').toUpperCase();
        if (pair) blueprintPairs[pair] = true;
      });
      var filterPlanContextForBlueprints = function (planContext) {
        if (!planContext || !blueprintPairs || !Object.keys(blueprintPairs).length) return planContext;
        var nextContext = Object.assign({}, planContext);
        if (Array.isArray(planContext.gateResults)) {
          nextContext.gateResults = planContext.gateResults.filter(function (gate) {
            var pair = String(gate && gate.pair || '').toUpperCase();
            return !!blueprintPairs[pair];
          });
        }
        if (Array.isArray(planContext.checklist)) {
          nextContext.checklist = planContext.checklist.filter(function (item) {
            var pair = String(item && item.pair || '').toUpperCase();
            if (pair) return !!blueprintPairs[pair];
            return true;
          });
        }
        return nextContext;
      };
      var ctx = state.planContext && state.planContext.gateResults && state.planContext.gateResults.length
        ? filterPlanContextForBlueprints(state.planContext)
        : {
            staleHtml: '',
            verdictClass: 'ok',
            verdict: 'ACTIONABLE SIGNALS READY',
            verdictBody: blueprints.length + ' backend blueprints available from canonical state.',
            checklist: [],
            gateResults: [],
            ladders: [],
            equity: state.acct && state.acct.equity ? state.acct.equity : 0,
            day: 0,
            ts: new Date().toISOString(),
            prices: state.prices || {},
            regimes: state.regimes || {}
          };
      return !!state.renderServerBlueprintPlan(ctx, blueprints);
    }

    var planCtx = state && state.planContext;
    if (planCtx && planCtx.gateResults && planCtx.gateResults.length) {
      return false;
    }
    return renderFallbackPlan(signals, state || {});
  }

  function generatePlan(state) {
    var plannerState = state || {};
    var runtime = plannerState.runtime && typeof plannerState.runtime === 'object' ? plannerState.runtime : {};
    var synced = plannerState.synced && typeof plannerState.synced === 'object' ? plannerState.synced : {};
    var bridge = plannerState.bridge;
    var canonicalSignals = Array.isArray(plannerState.canonicalSignals)
      ? plannerState.canonicalSignals.slice()
      : (bridge && typeof bridge.getSignals === 'function' ? bridge.getSignals() : []);

    try {
      if (renderPlanFromState({
        signals: canonicalSignals,
        liveSignals: Array.isArray(runtime.liveSignals) ? runtime.liveSignals.slice() : [],
        blueprints: Array.isArray(runtime.tradeQueue) ? runtime.tradeQueue.slice() : [],
        acct: runtime.acct || null,
        prices: synced.prices && typeof synced.prices === 'object' ? Object.assign({}, synced.prices) : {},
        regimes: synced.regimes && typeof synced.regimes === 'object' ? Object.assign({}, synced.regimes) : {},
        computedSignals: runtime.computedSignals && typeof runtime.computedSignals === 'object' ? Object.assign({}, runtime.computedSignals) : {},
        fibTimeframe: runtime.FIB_TIMEFRAME || null,
        renderServerBlueprintPlan: plannerState.renderServerBlueprintPlan,
        statePill: plannerState.statePill,
        planContext: plannerState.planContext || null
      })) {
        return true;
      }
    } catch (err) {
      console.warn('SniperDashboardPlanner.renderPlanFromState failed:', err && err.message ? err.message : err);
    }

    if (typeof plannerState.legacyGeneratePlan === 'function') {
      return !!plannerState.legacyGeneratePlan();
    }
    return false;
  }

  window.SniperDashboardPlanner = {
    generatePlan: generatePlan,
    renderPlanFromState: renderPlanFromState,
    canonicalState: canonicalState
  };
}(window));
