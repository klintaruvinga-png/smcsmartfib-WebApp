/**
 * SMC SuperFIB v12.0.9.1 — Dashboard Logic
 * sniper-dashboard.js
 *
 * Full monolith script adapted for split architecture.
 * Uses window.SNIPER injected by WordPress (rest_url, nonce, user, wp_base).
 *
 * v12.0.9.1 parity fixes:
 *  - fetchLiveSignals: guard lsSet('sn_prices') — only writes if merge changed prices
 *  - buildPriceInputs: priority order savedPrices > lsGet > 0, never shows zeros
 *  - runSignalEngine: always applies computed regimes (removed !savedRegimes[pair] guard)
 *  - runSignalEngine: lsSet('sn_regimes') after computing — persists across reloads
 *  - generatePlan RANGING gate: checks liveSignalMap with both 'GBP/USD' and 'GBPUSD' keys
 *  - fetchPrices: wakes signal engine on every successful price fetch
 *  - startAutoRefresh: clears _lastCall so interval is never blocked by manual fetch guard
 *  - init: removed duplicate 5s engine timeout; fallback kickstart extended to 8s
 *  - wallet-style section routing with synchronized desktop/mobile nav state
 *  - Twelve Data credits toast dedup with cooldown + success/manual reset
 */

'use strict';

const SIGNAL_SCHEMA = { version: "12.0.9.1", engine: "12.0.9.1" };

var DEBUG_TRACE = false;

// ── RUNTIME API CONFIG ────────────────────────────────────────────────────
const API = {
    BASE  : (window.SNIPER && window.SNIPER.rest_url)  || 'https://trader.stokvelsociety.co.za/wp-json/sniper/v1/',
    NONCE : (window.SNIPER && window.SNIPER.nonce)     || '',
    WP    : (window.SNIPER && window.SNIPER.wp_base)   || 'https://trader.stokvelsociety.co.za',
    USER  : (window.SNIPER && (window.SNIPER.user_account || window.SNIPER.user)) || null,
};
var PRIMARY_SECTION_PANEL_IDS = {
    plan: 'tab-plan',
    live: 'tab-live',
    charts: 'tab-charts',
    analytics: 'tab-analytics',
    book: 'tab-book',
    orders: 'tab-orders',
    progress: 'tab-progress'
};
var LEGACY_SECTION_PANEL_IDS = {
    signals: 'tab-signals'
};
var SECTION_DISPLAY_NAMES = {
    plan: 'Plan',
    live: 'Live Radar',
    charts: 'Charts',
    analytics: 'Analytics',
    book: 'Open Book',
    orders: 'Orders',
    progress: '4a Progress',
    signals: 'Level Log'
};
var SECTION_DEFAULT = 'plan';
var MOBILE_NAV_BREAKPOINT = 1060;
var TD_CREDITS_TOAST_COOLDOWN_MS = 10 * 60 * 1000;
var activeSectionId = SECTION_DEFAULT;
var tdCreditsToastState = { active: false, lastAt: 0 };

// Helper for authenticated API calls
function apiNonceHeader() {
    var nonce = API.NONCE;
    if (!nonce && window.wpApiSettings && window.wpApiSettings.nonce) {
        nonce = window.wpApiSettings.nonce;
    }
    return nonce;
}

function apiGetHeaders() {
    return {
        'Accept'      : 'application/json',
        'X-WP-Nonce'  : apiNonceHeader(),
    };
}

function apiPostHeaders() {
    return {
        'Accept'       : 'application/json',
        'Content-Type' : 'application/json',
        'X-WP-Nonce'   : apiNonceHeader(),
    };
}

function apiGet(path) {
    return fetch(API.BASE + path, {
        method      : 'GET',
        headers     : apiGetHeaders(),
        credentials : 'include',
    }).then(function(r){
        if (r.status === 401) throw new Error('login required');
        if (!r.ok) {
          return r.text().then(function(raw){
            var detail = '';
            if (raw) {
              try {
                var parsed = JSON.parse(raw);
                detail = parsed && (parsed.error || parsed.message || parsed.code) ? String(parsed.error || parsed.message || parsed.code) : '';
              } catch (_err) {
                detail = raw;
              }
            }
            throw new Error('HTTP ' + r.status + (detail ? ': ' + detail : ''));
          });
        }
        return r.json();
    });
}

function escapeHtmlAttr(value) {
    if (value == null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function apiPost(path, body) {
    return fetch(API.BASE + path, {
        method      : 'POST',
        headers     : apiPostHeaders(),
        credentials : 'include',
        body        : JSON.stringify(body),
    }).then(r => {
        if (r.status === 401) throw new Error('login required');
        if (!r.ok) {
          return r.text().then(function(raw){
            var detail = '';
            if (raw) {
              try {
                var parsed = JSON.parse(raw);
                detail = parsed && (parsed.reason || parsed.error || parsed.message || parsed.code)
                  ? String(parsed.reason || parsed.error || parsed.message || parsed.code)
                  : '';
              } catch (_err) {
                detail = raw;
              }
            }
            throw new Error('HTTP ' + r.status + (detail ? ': ' + detail : ''));
          });
        }
        return r.json();
    });
}

function normalizeSectionId(sectionId) {
    var raw = String(sectionId || '').replace(/^#/, '').trim().toLowerCase();
    if (PRIMARY_SECTION_PANEL_IDS[raw]) return raw;
    if (LEGACY_SECTION_PANEL_IDS[raw]) return raw;
    return SECTION_DEFAULT;
}

function getSectionPanelId(sectionId) {
    var normalized = normalizeSectionId(sectionId);
    return PRIMARY_SECTION_PANEL_IDS[normalized] || LEGACY_SECTION_PANEL_IDS[normalized] || PRIMARY_SECTION_PANEL_IDS[SECTION_DEFAULT];
}

function getSectionDisplayName(sectionId) {
    var normalized = normalizeSectionId(sectionId);
    return SECTION_DISPLAY_NAMES[normalized] || SECTION_DISPLAY_NAMES[SECTION_DEFAULT];
}

function resolveSectionFromHash(hashValue) {
    return normalizeSectionId(String(hashValue || window.location.hash || '').replace(/^#/, ''));
}

function isMobileSectionShell() {
    if (window.matchMedia) {
        return window.matchMedia('(max-width: ' + MOBILE_NAV_BREAKPOINT + 'px)').matches;
    }
    return (window.innerWidth || 0) <= MOBILE_NAV_BREAKPOINT;
}

function setToolbarSectionLabel(sectionId) {
    var label = document.querySelector('.smc-topbar__label');
    if (label) label.textContent = getSectionDisplayName(sectionId);
}

function updateSectionNavState(sectionId) {
    var normalized = normalizeSectionId(sectionId);
    document.querySelectorAll('[data-section]').forEach(function(el){
        var isActive = normalizeSectionId(el.getAttribute('data-section')) === normalized;
        el.classList.toggle('active', isActive);
        el.setAttribute('aria-selected', isActive ? 'true' : 'false');
        el.setAttribute('tabindex', '0');
        if (isActive) el.setAttribute('aria-current', 'page');
        else el.removeAttribute('aria-current');
    });
    setToolbarSectionLabel(normalized);
}

function setMobileNavOpen(open) {
    var sidebar = document.getElementById('smc-sidebar');
    var overlay = document.getElementById('smc-sidebar-overlay');
    var menuToggle = document.getElementById('smc-menu-toggle');
    var shouldOpen = !!open && isMobileSectionShell();
    if (sidebar) sidebar.classList.toggle('is-open', shouldOpen);
    if (overlay) {
        overlay.hidden = !shouldOpen;
        overlay.classList.toggle('is-visible', shouldOpen);
    }
    if (menuToggle) menuToggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    document.body.style.overflow = shouldOpen ? 'hidden' : '';
}

function closeMobileNav() {
    setMobileNavOpen(false);
}

function bindSectionNavigation() {
    if (bindSectionNavigation._bound) return;
    bindSectionNavigation._bound = true;

    document.addEventListener('click', function(event){
        var sectionTrigger = event.target.closest('[data-section]');
        if (sectionTrigger) {
            event.preventDefault();
            switchSection(sectionTrigger.getAttribute('data-section'));
            return;
        }

        var actionTrigger = event.target.closest('[data-nav-action]');
        if (actionTrigger) {
            event.preventDefault();
            var action = actionTrigger.getAttribute('data-nav-action');
            if (action === 'menu') setMobileNavOpen(true);
            else if (action === 'close-menu') closeMobileNav();
            return;
        }

        if (event.target && event.target.id === 'smc-sidebar-overlay') {
            closeMobileNav();
        }
    });

    window.addEventListener('hashchange', function(){
        var nextSection = resolveSectionFromHash(window.location.hash);
        switchSection(nextSection, { updateHash: window.location.hash !== ('#' + nextSection) });
    });

    window.addEventListener('resize', function(){
        if (!isMobileSectionShell()) closeMobileNav();
        if (activeSectionId === 'charts') ensureChartViewport();
    });

    document.addEventListener('keydown', function(event){
        if (event.key === 'Escape') closeMobileNav();
    });
}

function bindAccountTabs() {
  if (bindAccountTabs._bound) return;
  bindAccountTabs._bound = true;

  document.addEventListener('click', function(event){
    var tabBtn = event.target.closest('.tab-btn[data-tab]');
    if (!tabBtn) return;
    var tabKey = tabBtn.getAttribute('data-tab');
    if (!tabKey) return;

    document.querySelectorAll('.smc-account-tabs .tab-btn').forEach(function(btn){
      btn.classList.toggle('active', btn === tabBtn);
    });
    document.querySelectorAll('#tab-account-overview, #tab-risk-profile').forEach(function(panel){
      panel.style.display = 'none';
    });
    var panel = document.getElementById('tab-' + tabKey);
    if (panel) panel.style.display = 'block';
  });
}

function notifyTdCreditsExhausted(kind) {
    var now = Date.now();
    var msg;
    if (kind === 'rate_limited') {
        msg = '⚠ NOTICE Market data rate-limited — retrying shortly';
    } else if (kind === 'account_exhausted') {
        msg = '⚠ WARNING Twelve Data API credits exhausted for the day';
    } else {
        msg = '⚠ NOTICE Market data delayed — retrying with fallback symbol';
    }
    if (!tdCreditsToastState.active || (now - tdCreditsToastState.lastAt) >= TD_CREDITS_TOAST_COOLDOWN_MS) {
        xtoast(msg, 'warn');
    }
    tdCreditsToastState.active = true;
    tdCreditsToastState.lastAt = now;
}

function clearTdCreditsToastSuppression() {
    tdCreditsToastState.active = false;
    tdCreditsToastState.lastAt = 0;
}

// ──────────────────────────────────────────────────────────────────────────
// FROM HERE ON: THE COMPLETE MONOLITH SCRIPT (adapted)
// All original functions are present – generatePlan, renderAcct, fetchPrices,
// handleFile, exportReport, init, xtab, showChart, etc.
// ──────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS & UTILITIES (copied verbatim from monolith)
// ═══════════════════════════════════════════════════════════════════
var START = lsGet('sn_start') || new Date().toISOString().slice(0,10);
// Account currency — loaded from risk profile on init; persisted locally.
// USD_TO_ACCOUNT_RATE: how many account-currency units equal 1 USD (1.0 for USD accounts).
var ACCOUNT_CURRENCY     = lsGet('sn_account_currency')    || 'USD';
var USD_TO_ACCOUNT_RATE  = lsGet('sn_usd_to_account_rate') || 1.0;
var INSTRUMENT_OVERRIDES = lsGet('sn_instrument_overrides') || {};
function fmtAccountAmount(v, signed) {
  if (v == null || isNaN(v)) return '-';
  var sign = signed && v > 0 ? '+' : '';
  var sym = ACCOUNT_CURRENCY === 'USD' ? '$'
    : ACCOUNT_CURRENCY === 'GBP' ? '£'
    : ACCOUNT_CURRENCY === 'EUR' ? '€'
    : ACCOUNT_CURRENCY === 'ZAR' ? 'R'
    : ACCOUNT_CURRENCY + ' ';
  return sign + sym + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function plUSC(v){ return fmtAccountAmount(v, true); }
function plZAR(v){ return ''; } // deprecated — kept to avoid call-site errors; callers should use fmtAccountAmount
function plBoth(v,cls){if(v==null||isNaN(v))return '<span style="color:var(--mu)">-</span>';var col=v>=0?'var(--gr)':'var(--re)';var ec=cls?' '+cls:'';return '<span class="mn'+ec+'" style="color:'+col+'">'+fmtAccountAmount(v)+'</span>';}
function plBothText(v){return fmtAccountAmount(v);}
function toPairDisplay(raw){
  if(!raw) return '';
  var s=String(raw).trim().toUpperCase();
  if(s.indexOf(':')>-1) s=s.split(':').pop();
  s=s.replace(/[^A-Z]/g,'');
  return s.length===6?s.slice(0,3)+'/'+s.slice(3):String(raw).trim().toUpperCase();
}
function toPhase4aPair(raw){
  var p=toPairDisplay(raw);
  return p?p:'';
}
function isPhase4aPair(raw){return !!toPhase4aPair(raw);}
function isPairJPY(pair){return String(pair||'').indexOf('JPY')>-1;}
function regimeGateLabel(regime){return regime==='TREND DOWN'?'SELL':regime==='TREND UP'?'BUY':regime==='REVERSAL ZONE'?'BOTH':'NONE';}
function normalizeSequenceStatus(seq){
  var s=String(seq||'').trim().toUpperCase().replace(/[_-]+/g,' ');
  if(s==='READY') return 'READY';
  if(s==='AWAIT MSS') return 'AWAIT MSS';
  if(s==='AWAIT SWEEP') return 'AWAIT SWEEP';
  if(s==='STALE') return 'STALE';
  return s||'';
}
function normalizeSignalState(state, sequenceStatus){
  var util = window.SniperSignalState;
  var validityBars = null;
  if (String(state || '').trim().toUpperCase().replace(/[_-]+/g,' ') === 'EXPIRED') {
    validityBars = 0;
  }
  if (util && typeof util.canonicalize === 'function') {
    var fromRaw = util.canonicalize(state, validityBars);
    if (fromRaw === 'READY') {
      return 'WATCHLIST';
    }
    if (fromRaw === 'ACTIVE' || fromRaw === 'WATCHLIST' || fromRaw === 'INVALID' || fromRaw === 'EXPIRED') {
      return fromRaw;
    }
  }
  var seq=normalizeSequenceStatus(sequenceStatus);
  if(seq==='READY'||seq==='AWAIT MSS'||seq==='AWAIT SWEEP') return 'WATCHLIST';
  if(seq==='STALE') return 'INVALID';
  return 'INVALID';
}
function seqPill(seq){
  seq=normalizeSequenceStatus(seq);
  if(seq==='READY') return '<span class="pg2 pill">READY</span>';
  if(seq==='AWAIT MSS') return '<span class="pa2 pill">AWAIT MSS</span>';
  if(seq==='AWAIT SWEEP') return '<span class="pr2 pill">AWAIT SWEEP</span>';
  if(seq==='STALE') return '<span class="pgy pill">STALE</span>';
  return '<span class="pgy pill">NO DATA</span>';
}
function statePill(state){
  state=normalizeSignalState(state);
  if(state==='ACTIVE') return '<span class="pg2 pill">ACTIVE</span>';
  if(state==='WATCHLIST') return '<span class="pa2 pill">WATCHLIST</span>';
  if(state==='EXPIRED') return '<span class="pgy pill">EXPIRED</span>';
  return '<span class="pr2 pill">INVALID</span>';
}
function stalePill(mins){
  if(mins==null) return '';
  if(mins>120) return '<span class="pr2 pill">STALE</span>';
  if(mins>60) return '<span class="pa2 pill">'+mins.toFixed(0)+'m</span>';
  return '<span class="pgy pill">'+mins.toFixed(0)+'m</span>';
}
var savedSeqStatus={};
function seqBadge(pair){return seqPill(savedSeqStatus[pair]);}
var ZAR = lsGet('sn_zar') || 0.167035;
var DASHBOARD_STATE = {
  watchlist: [],
  pricesBySymbol: {},
  regimesBySymbol: {},
  signalsBySymbol: {},
  plannerBySymbol: {}
};
var STATIC_CHART_INSTRUMENTS = [
  { pair: 'GBP/USD', symbol: 'FX:GBPUSD' },
  { pair: 'AUD/USD', symbol: 'FX:AUDUSD' },
  { pair: 'USD/JPY', symbol: 'FX:USDJPY' },
  { pair: 'AUD/JPY', symbol: 'FX:AUDJPY' },
  { pair: 'EUR/USD', symbol: 'FX:EURUSD' },
  { pair: 'XAU/USD', symbol: 'OANDA:XAUUSD' },
  { pair: 'US30', symbol: 'OANDA:US30USD' },
  { pair: 'BTC.D', symbol: 'CRYPTOCAP:BTC.D' }
];
var PAIRS = [];
var WATCHLIST_MUTATION_CHAIN = Promise.resolve();
var WATCHLIST_MUTATION_DEPTH = 0;
var WATCHLIST_LAST_MUTATION_AT = 0;
var WATCHLIST_GUARD_MS = 5000;
function syncDashboardStateWatchlist(){ DASHBOARD_STATE.watchlist = PAIRS.slice(); }
function queueWatchlistMutation(task){
  WATCHLIST_MUTATION_DEPTH++;
  var wrapped = function(){
    return Promise.resolve()
      .then(task)
      .then(function(result){
        WATCHLIST_LAST_MUTATION_AT = Date.now();
        WATCHLIST_MUTATION_DEPTH--;
        return result;
      }, function(err){
        WATCHLIST_LAST_MUTATION_AT = Date.now();
        WATCHLIST_MUTATION_DEPTH--;
        throw err;
      });
  };
  WATCHLIST_MUTATION_CHAIN = WATCHLIST_MUTATION_CHAIN.then(wrapped, wrapped);
  return WATCHLIST_MUTATION_CHAIN;
}
function watchlistMutationInProgress(){
  if (WATCHLIST_MUTATION_DEPTH > 0) return true;
  return WATCHLIST_LAST_MUTATION_AT > 0 && (Date.now() - WATCHLIST_LAST_MUTATION_AT) < WATCHLIST_GUARD_MS;
}
function persistPairList(){
  syncDashboardStateWatchlist();
  if(!USER_SYNC || !USER_SYNC.authenticated) return;
  apiPost('user/watchlist', { watchlist: PAIRS.slice() }).catch(function(e){ console.warn('watchlist save failed:', e.message); });
}
function registerPair(raw){
  var dp=toPairDisplay(raw);
  if(!dp) return false;
  if(PAIRS.indexOf(dp)>-1) return false;
  PAIRS.push(dp);
  if(!PAIR_SYMBOLS[dp]) PAIR_SYMBOLS[dp]=dp;
  syncDashboardStateWatchlist();
  persistPairList();
  return true;
}
function applyWatchlist(nextWatchlist, source){
  if(!Array.isArray(nextWatchlist)) return false;
  if(source !== 'watchlist_mutation_confirmed' && watchlistMutationInProgress()){
    if (DEBUG_TRACE) console.log('[WATCHLIST_GUARD]', { skipped: true, source: source || 'unknown', depth: WATCHLIST_MUTATION_DEPTH });
    return false;
  }
  var prevPairs = Array.isArray(PAIRS) ? PAIRS.slice() : [];
  var incoming = nextWatchlist.map(toPairDisplay).filter(Boolean);
  var seen = {};
  incoming = incoming.filter(function(pair){ if(seen[pair]) return false; seen[pair]=true; return true; });
  PAIRS = incoming;
  syncDashboardStateWatchlist();
  PAIRS.forEach(function(pair){ if(!PAIR_SYMBOLS[pair]) PAIR_SYMBOLS[pair] = pair; });
  Object.keys(savedPrices).forEach(function(pair){ if(PAIRS.indexOf(pair)===-1) delete savedPrices[pair]; });
  Object.keys(savedRegimes).forEach(function(pair){ if(PAIRS.indexOf(pair)===-1) delete savedRegimes[pair]; });
  Object.keys(savedSeqStatus).forEach(function(pair){ if(PAIRS.indexOf(pair)===-1) delete savedSeqStatus[pair]; });
  Object.keys(computedSignals).forEach(function(pair){ if(PAIRS.indexOf(pair)===-1) delete computedSignals[pair]; });
  Object.keys(regimeMetaByPair).forEach(function(pair){ if(PAIRS.indexOf(pair)===-1) delete regimeMetaByPair[pair]; });
  Object.keys(lastSuccessfulMarketSymbolByPair).forEach(function(pair){ if(PAIRS.indexOf(pair)===-1) delete lastSuccessfulMarketSymbolByPair[pair]; });
  Object.keys(PAIR_SYMBOLS).forEach(function(pair){ if(PAIRS.indexOf(pair)===-1) delete PAIR_SYMBOLS[pair]; });
  liveSignals = (liveSignals||[]).filter(function(sig){ return sig && PAIRS.indexOf(sig.pair)>-1; });
  tradeQueue = (tradeQueue||[]).filter(function(bp){ return bp && PAIRS.indexOf(toPairDisplay(bp.pair))>-1; });
  rebuildLiveSignalMap();
  renderTickerStrip();
  var addedPairs = PAIRS.filter(function(pair){ return prevPairs.indexOf(pair) === -1; });
  if (addedPairs.length && MARKET_DATA_READY && signalEngineStatus !== 'COMPUTING') {
    setTimeout(function(){
      runSignalEngineNow({ manual: true, reason: 'watchlist_added_pairs', pairs: addedPairs.slice() });
    }, 250);
  }
  return true;
}
// Pip values are computed via getPipValueAccount(pair, warnOnFallback) — defined below near buildRiskBreakdown.
var TOL_USD = 40, TOL_JPY = 80, TARGET = 50, TDAYS = 90;
function buildFibRatios(){
  var base=[0.0,0.25,0.5,0.625,0.75,1.0];
  var ext=[0.25,0.625,1.0,1.625,2.0];
  var all=base.slice();
  ext.forEach(function(e){
    all.push(1.0+e);
    all.push(-e);
  });
  return Array.from(new Set(all)).sort(function(a,b){return a-b;});
}
// buildFibRatios() output:
// [-2,-1.625,-1,-0.625,-0.25,0,0.25,0.5,0.625,0.75,1,1.25,1.625,2,2.625,3]
const FIB_RATIOS = buildFibRatios();
function sfKey(hi, lo, ratio){ return hi - (hi - lo) * ratio; }
function edeTier(levelPrice, fibHigh, fibLow){
  if (fibHigh === fibLow) return 1;
  var pricePos = (levelPrice - fibLow) / (fibHigh - fibLow);
  var distance = Math.abs(pricePos - 0.5);
  return distance < 0.125 ? 0 : distance < 0.4 ? 1 : distance < 0.75 ? 2 : distance < 1.25 ? 3 : distance < 2.0 ? 4 : 5;
}
function pipMult(pipType){ return pipType === 'JPY' ? 0.01 : 0.0001; }
function bosThresh(pipType, minPips){ return minPips * pipMult(pipType); }

var EF_LEVELS = {};
function efLevel(pair,ratio){var ef=EF_LEVELS[pair];if(!ef||!ef.fibHigh||!ef.fibLow) return null;return +sfKey(ef.fibHigh,ef.fibLow,ratio).toFixed(pair.indexOf('JPY')>-1?2:5);}
function getEFLevels(pair){
  var ef = EF_LEVELS[pair];
  if (!ef) return [];
  var isJPY = pair.indexOf('JPY') > -1;
  var defaultSl = isJPY ? 1.0 : 0.0025;
  return [
    {pct:'EF 0%', price:efLevel(pair,0), side:'PREMIUM', fib:'EF '+ef.mode, slBuf:defaultSl},
    {pct:'EF 25%', price:efLevel(pair,0.25), side:'PREMIUM', fib:'EF '+ef.mode, slBuf:defaultSl},
    {pct:'EF 62.5%',price:efLevel(pair,0.625), side:'DISCOUNT', fib:'EF '+ef.mode, slBuf:defaultSl},
    {pct:'EF 75%', price:efLevel(pair,0.75), side:'DISCOUNT', fib:'EF '+ef.mode, slBuf:defaultSl},
    {pct:'EF 100%', price:efLevel(pair,1), side:'DISCOUNT', fib:'EF '+ef.mode, slBuf:defaultSl}
  ].filter(function(l){return l.price!=null;});
}
function updateEF(pair,mode,fibHigh,fibLow){
  var key=toPhase4aPair(pair);
  if(!key) return;
  EF_LEVELS[key]={mode:mode,fibHigh:fibHigh,fibLow:fibLow,lastUpdate:new Date().toISOString()};
}

function computeEDEStars(zonePrice, fibHigh, fibLow) {
  if (fibHigh == null || fibLow == null || fibHigh === fibLow) return null;
  return edeTier(zonePrice, fibHigh, fibLow);
}
function computeEDEDistance(zonePrice, fibHigh, fibLow) {
  if (fibHigh == null || fibLow == null || fibHigh === fibLow) return 0;
  var range = fibHigh - fibLow;
  var price_pos = (zonePrice - fibLow) / range;
  return Math.abs(price_pos - 0.5);
}
var SFL_ANCHORS = {};
function normalizeSflAnchorPayload(payload, fallbackHigh, fallbackLow, fallbackSource, fallbackUpdatedAt){
  var anchor = payload && typeof payload === 'object' ? payload : {};
  var out = {
    fibHigh: fallbackHigh != null ? parseFloat(fallbackHigh) : (anchor.fibHigh != null ? parseFloat(anchor.fibHigh) : null),
    fibLow: fallbackLow != null ? parseFloat(fallbackLow) : (anchor.fibLow != null ? parseFloat(anchor.fibLow) : null),
    updated_at: anchor.updated_at || fallbackUpdatedAt || null,
    source: anchor.source || fallbackSource || 'backend_dynamic',
    authority: null,
    timeframes: null
  };
  if(anchor.authority && typeof anchor.authority === 'object'){
    out.authority = {
      fibHigh: anchor.authority.fibHigh != null ? parseFloat(anchor.authority.fibHigh) : null,
      fibLow: anchor.authority.fibLow != null ? parseFloat(anchor.authority.fibLow) : null,
      source: anchor.authority.source || 'local_fib_composite',
      authority_equivalent: anchor.authority.authority_equivalent === true,
      bull: anchor.authority.bull != null ? anchor.authority.bull : null,
      updated_at: anchor.authority.updated_at || out.updated_at || null,
      components: anchor.authority.components || null
    };
  }
  if(anchor.timeframes && typeof anchor.timeframes === 'object'){
    out.timeframes = {};
    Object.keys(anchor.timeframes).forEach(function(tf){
      var tfAnchor = anchor.timeframes[tf];
      out.timeframes[tf] = tfAnchor && tfAnchor.fibHigh != null && tfAnchor.fibLow != null
        ? { fibHigh: parseFloat(tfAnchor.fibHigh), fibLow: parseFloat(tfAnchor.fibLow) }
        : null;
    });
  }
  return out;
}
function getAuthoritySFAnchor(pair) {
  var a = SFL_ANCHORS[pair];
  if (!a) return null;
  if (a.authority && a.authority.fibHigh != null && a.authority.fibLow != null) {
    return { fibHigh: a.authority.fibHigh, fibLow: a.authority.fibLow, source: a.authority.source || 'local_fib_composite' };
  }
  if (a.fibHigh != null && a.fibLow != null) {
    return { fibHigh: a.fibHigh, fibLow: a.fibLow, source: a.source || 'flat_legacy' };
  }
  return null;
}
function getTimeframeSFAnchor(pair, timeframe) {
  var a = SFL_ANCHORS[pair];
  var tfMap = { DAILY: 'D', DAY: 'D', D: 'D', WEEKLY: 'W', WEEK: 'W', W: 'W', MONTHLY: 'M', MONTH: 'M', M: 'M', H4: '240', '240': '240', H1: '60', '60': '60' };
  var tfKey = tfMap[String(timeframe || '').toUpperCase()] || timeframe;
  if (!a) return null;
  if (a.timeframes && tfKey && a.timeframes[tfKey] && a.timeframes[tfKey].fibHigh != null && a.timeframes[tfKey].fibLow != null) {
    return { fibHigh: a.timeframes[tfKey].fibHigh, fibLow: a.timeframes[tfKey].fibLow, source: tfKey };
  }
  return getAuthoritySFAnchor(pair);
}
function getSFLStars(pair, zonePrice) {
  var anchors = getAuthoritySFAnchor(pair);
  if (!anchors) return null;
  return computeEDEStars(zonePrice, anchors.fibHigh, anchors.fibLow);
}
function getEFStars(pair, zonePrice) {
  var ef = EF_LEVELS[pair];
  if (!ef || !ef.fibHigh || !ef.fibLow) return null;
  return computeEDEStars(zonePrice, ef.fibHigh, ef.fibLow);
}
function getStarsForLevel(pair, lv) {
  if (!lv || !lv.price) return 1;
  var isEF = lv.fib && lv.fib.indexOf('EF') === 0;
  return isEF ? getEFStars(pair, lv.price) : getSFLStars(pair, lv.price);
}
function normalizeRuntimeTimeframeValue(raw){
  var value=String(raw||'').trim().toUpperCase();
  if(['YEARLY','YEAR','Y','1Y','ANNUAL'].indexOf(value)>-1) return 'Yearly';
  if(['MONTHLY','MONTH','M','1M','H4'].indexOf(value)>-1) return 'Monthly';
  if(['WEEKLY','WEEK','W','1W'].indexOf(value)>-1) return 'Weekly';
  if(['DAILY','DAY','D','1D'].indexOf(value)>-1) return 'Daily';
  return '';
}
function resolveInitialFibTimeframe(){
  var bootTf = normalizeRuntimeTimeframeValue(window.SNIPER && window.SNIPER.fib_timeframe);
  if(bootTf) return bootTf;
  var storedTf = normalizeRuntimeTimeframeValue(lsGet('sn_fib_tf'));
  if(storedTf) return storedTf;
  return 'Yearly';
}
// v10 patch: respect server boot timeframe first, then local fallback.
var FIB_TIMEFRAME = resolveInitialFibTimeframe();
window.FIB_TIMEFRAME = FIB_TIMEFRAME;
if(window.SNIPER) window.SNIPER.fib_timeframe = FIB_TIMEFRAME;
var runtimeStateSnapshot = null;
function syncRuntimeTimeframe(tf){
  FIB_TIMEFRAME = normalizeRuntimeTimeframeValue(tf) || FIB_TIMEFRAME || 'Yearly';
  window.FIB_TIMEFRAME = FIB_TIMEFRAME;
  if(window.SNIPER) window.SNIPER.fib_timeframe = FIB_TIMEFRAME;
}
function publishRuntimeState(){
  DASHBOARD_STATE.watchlist = PAIRS.slice();
  DASHBOARD_STATE.pricesBySymbol = savedPrices && typeof savedPrices === 'object' ? Object.assign({}, savedPrices) : {};
  DASHBOARD_STATE.regimesBySymbol = savedRegimes && typeof savedRegimes === 'object' ? Object.assign({}, savedRegimes) : {};
  DASHBOARD_STATE.signalsBySymbol = computedSignals && typeof computedSignals === 'object' ? Object.assign({}, computedSignals) : {};
  DASHBOARD_STATE.plannerBySymbol = Array.isArray(tradeQueue) ? tradeQueue.reduce(function(map, row){ if(row && row.pair){ map[toPairDisplay(row.pair)] = row; } return map; }, {}) : {};
  runtimeStateSnapshot = {
    signals: Array.isArray(signals) ? signals.slice() : [],
    liveSignals: Array.isArray(liveSignals) ? liveSignals.slice() : [],
    tradeQueue: Array.isArray(tradeQueue) ? tradeQueue.slice() : [],
    savedPrices: savedPrices && typeof savedPrices === 'object' ? Object.assign({}, savedPrices) : {},
    savedRegimes: savedRegimes && typeof savedRegimes === 'object' ? Object.assign({}, savedRegimes) : {},
    regimeMetaByPair: regimeMetaByPair && typeof regimeMetaByPair === 'object' ? Object.assign({}, regimeMetaByPair) : {},
    computedSignals: computedSignals && typeof computedSignals === 'object' ? Object.assign({}, computedSignals) : {},
    acct: acct && typeof acct === 'object' ? Object.assign({}, acct) : acct,
    FIB_TIMEFRAME: FIB_TIMEFRAME,
    MARKET_DATA_READY: !!MARKET_DATA_READY,
    signalEngineStatus: signalEngineStatus || 'OFFLINE'
  };
  return runtimeStateSnapshot;
}
function getRuntimeState(){
  var snapshot = publishRuntimeState();
  return {
    watchlist: PAIRS.slice(),
    symbolsState: Object.assign({}, DASHBOARD_STATE),
    signals: snapshot.signals.slice(),
    liveSignals: snapshot.liveSignals.slice(),
    tradeQueue: snapshot.tradeQueue.slice(),
    savedPrices: Object.assign({}, snapshot.savedPrices),
    savedRegimes: Object.assign({}, snapshot.savedRegimes),
    regimeMetaByPair: Object.assign({}, snapshot.regimeMetaByPair || {}),
    computedSignals: Object.assign({}, snapshot.computedSignals),
    acct: snapshot.acct && typeof snapshot.acct === 'object' ? Object.assign({}, snapshot.acct) : snapshot.acct,
    FIB_TIMEFRAME: snapshot.FIB_TIMEFRAME,
    MARKET_DATA_READY: snapshot.MARKET_DATA_READY,
    signalEngineStatus: snapshot.signalEngineStatus
  };
}
function refreshRuntimeAfterTimeframeChange(){
  var hasPrices = Object.keys(savedPrices).some(function(k){return savedPrices[k]>0;});
  if(hasPrices && MARKET_DATA_READY){
    return runSignalEngineNow({ manual: true, reason: 'timeframe_change' }).finally(function(){
      generatePlan();
    });
  }
  if(!hasPrices && MARKET_DATA_READY){
    return fetchPrices(true);
  }
  generatePlan();
  return Promise.resolve();
}
function onTimeframeChange(tf){
  syncRuntimeTimeframe(tf);
  persistSettingsLocal();
  queueUserSync('settings');
  signalCandleCache = {};
  publishRuntimeState();
  return refreshRuntimeAfterTimeframeChange();
}
function getAnchorSet(pair, timeframe){
  var anchor=getTimeframeSFAnchor(pair, timeframe);
  if(!anchor||anchor.fibHigh==null||anchor.fibLow==null){
    if (DEBUG_TRACE) console.log('[ANCHOR_TRACE:GET_ANCHOR_SET_MISS]', pair, {
      requestedTimeframe: timeframe,
      rawAnchor: SFL_ANCHORS[pair] || null,
      hasFibHigh: !!(anchor && anchor.fibHigh != null),
      hasFibLow: !!(anchor && anchor.fibLow != null),
      source: anchor && anchor.source ? anchor.source : null
    });
    return null;
  }
  return {
    fibHigh: Math.max(anchor.fibHigh, anchor.fibLow),
    fibLow: Math.min(anchor.fibHigh, anchor.fibLow),
    source: anchor.source || 'backend_dynamic',
    updated_at: anchor.updated_at || null
  };
}
function levelsFromAnchor(pair, anchor, label){
  if(!anchor||anchor.fibHigh==null||anchor.fibLow==null) return [];
  var isJPY=pair.indexOf('JPY')>-1;
  var dp=isJPY?2:5;
  function lvl(r){return +sfKey(anchor.fibHigh,anchor.fibLow,r).toFixed(dp);}
  var defaultSl=isJPY?1.20:0.0030;
  return [
    {pct:'0%',price:lvl(0),side:'PREMIUM',fib:label,slBuf:defaultSl},
    {pct:'25%',price:lvl(0.25),side:'PREMIUM',fib:label,slBuf:defaultSl},
    {pct:'62.5%',price:lvl(0.625),side:'DISCOUNT',fib:label,slBuf:defaultSl},
    {pct:'75%',price:lvl(0.75),side:'DISCOUNT',fib:label,slBuf:defaultSl},
    {pct:'100%',price:lvl(1),side:'DISCOUNT',fib:label,slBuf:defaultSl}
  ];
}
function getChopBand(pair){
  var resolved = resolvePairRuntimeSignal(pair);
  if(resolved && resolved.chop_band && resolved.chop_band.low != null && resolved.chop_band.high != null){
    return {
      lo:+resolved.chop_band.low,
      hi:+resolved.chop_band.high,
      source:resolved.chop_band.source || resolved.source || 'runtime'
    };
  }
  return null;
}
function getAllLevels(pair) {
  var sfl = levelsFromAnchor(pair,getAnchorSet(pair,FIB_TIMEFRAME),'F3 Dynamic');
  var ef = getEFLevels(pair);
  var seen = {};
  return sfl.concat(ef).filter(function(level){
    if(!level || level.price == null) return false;
    var key = [level.fib || '', level.pct || '', Number(level.price).toFixed(pair.indexOf('JPY')>-1?2:5)].join('|');
    if(seen[key]) return false;
    seen[key] = true;
    return true;
  });
}
function primaryLivePrice(sig){
  if(sig&&sig.entries&&sig.entries.length&&sig.entries[0].price!=null) return sig.entries[0].price;
  if(sig&&sig.pretrigger&&sig.pretrigger.level!=null) return sig.pretrigger.level;
  if(sig&&sig.zone_price!=null) return sig.zone_price;
  return null;
}
function liveDistance(sig){
  var anchor=primaryLivePrice(sig);
  if(anchor==null||sig.market_price==null) return null;
  return Math.abs(sig.market_price-anchor)*(isPairJPY(sig.pair||'')?100:10000);
}
function minutesSince(ts){
  if(!ts) return null;
  var d=new Date(ts);
  if(isNaN(d.getTime())) return null;
  return (Date.now()-d.getTime())/60000;
}
function normalizeLiveSignal(raw){
  var pair=toPairDisplay(raw.pair||raw.display_symbol||raw.symbol||raw.instrument_id)||
           String(raw.pair||raw.display_symbol||raw.symbol||raw.instrument_id||'').trim().toUpperCase();
  var sequenceStatus=normalizeSequenceStatus(raw.sequence_status||'');
  var signalState=normalizeSignalState(raw.signal_state||raw.state||'',sequenceStatus);
  return {
    instrument_id: raw.instrument_id||raw.symbol||'',
    symbol: raw.symbol||raw.instrument_id||'',
    display_symbol: raw.display_symbol||raw.symbol||raw.instrument_id||'',
    pair: pair,
    phase4a_pair: false,
    direction: raw.direction||'',
    regime: raw.regime||'',
    sequence_status: sequenceStatus,
    score: raw.score!=null?parseFloat(raw.score):null,
    setup_class: raw.setup_class||raw.signal_grade||'',
    blocked_reason: raw.blocked_reason||'',
    setup_quality: raw.setup_quality!=null?parseFloat(raw.setup_quality):null,
    execution_quality: raw.execution_quality!=null?parseFloat(raw.execution_quality):null,
    rank_score: raw.rank_score!=null?parseFloat(raw.rank_score):null,
    state: raw.state||raw.signal_state||'',
    signal_state: signalState,
    entry_stage: raw.entry_stage||'',
    rr_estimate: raw.rr_estimate!=null?parseFloat(raw.rr_estimate):null,
    market_price: raw.market_price!=null?parseFloat(raw.market_price):null,
    zone_price: raw.zone_price!=null?parseFloat(raw.zone_price):null,
    session_tf: raw.session_tf||'',
    fib_timeframe: raw.fib_timeframe||'',
    f1_high: raw.f1_high!=null?parseFloat(raw.f1_high):null,
    f1_low: raw.f1_low!=null?parseFloat(raw.f1_low):null,
    f2_high: raw.f2_high!=null?parseFloat(raw.f2_high):null,
    f2_low: raw.f2_low!=null?parseFloat(raw.f2_low):null,
    f3_high: raw.f3_high!=null?parseFloat(raw.f3_high):null,
    f3_low: raw.f3_low!=null?parseFloat(raw.f3_low):null,
    anchors: raw.anchors && typeof raw.anchors === 'object' ? raw.anchors : null,
    levels: Array.isArray(raw.levels)?raw.levels:[],
    final_bias: raw.final_bias||null,
    matrix: raw.matrix&&typeof raw.matrix==='object'?raw.matrix:null,
    matrix_tf: raw.matrix_tf||null,
    pd_array: raw.pd_array&&typeof raw.pd_array==='object'?raw.pd_array:null,
    pd_tf: raw.pd_tf||null,
    model_tag: raw.model_tag||'',
    entries: Array.isArray(raw.entries)?raw.entries.map(function(en){return {level:en.level||'',price:en.price!=null?parseFloat(en.price):null,status:en.status||''};}):[],
    fills: Array.isArray(raw.fills)?raw.fills:[],
    ef: raw.ef||{},
    pretrigger: raw.pretrigger||{},
    structure: raw.structure||{},
    liquidity: raw.liquidity||{},
    poi: raw.poi||{},
    gate: raw.gate || null,
    gate_reason: raw.gate_reason || null,
    chop_band: raw.chop_band && typeof raw.chop_band === 'object' ? {
      low: raw.chop_band.low!=null?parseFloat(raw.chop_band.low):null,
      high: raw.chop_band.high!=null?parseFloat(raw.chop_band.high):null
    } : null,
    chop: raw.chop?{
      active: !!raw.chop.active,
      low: raw.chop.low!=null?parseFloat(raw.chop.low):null,
      high: raw.chop.high!=null?parseFloat(raw.chop.high):null,
      source: raw.chop.source||''
    }:{},
    updated_at: raw.updated_at||raw.last_signal_at||null,
    price_updated_at: raw.price_updated_at||null,
    last_signal_at: raw.last_signal_at||raw.updated_at||null,
    last_signal_type: raw.last_signal_type||'',
    last_ladder_id: raw.last_ladder_id||'',
    authenticated: raw.last_authenticated!==false
  };
}
function normalizeRegimeMetaRow(raw){
  if(!raw || typeof raw !== 'object') return null;
  var chopBand = raw.chop_band && raw.chop_band.low != null && raw.chop_band.high != null ? {
    low: parseFloat(raw.chop_band.low),
    high: parseFloat(raw.chop_band.high),
    source: raw.chop_band.source || 'backend_regime_meta'
  } : null;
  if(!chopBand && raw.chop && raw.chop.low != null && raw.chop.high != null){
    chopBand = {
      low: parseFloat(raw.chop.low),
      high: parseFloat(raw.chop.high),
      source: raw.chop.source || 'backend_regime_meta_chop'
    };
  }
  return {
    gate: raw.gate != null ? String(raw.gate).toUpperCase() : null,
    gate_reason: raw.gate_reason || null,
    chop_band: chopBand,
    chop: raw.chop && typeof raw.chop === 'object' ? Object.assign({}, raw.chop) : null,
    updated_at: raw.updated_at || null,
    final_bias: raw.final_bias || raw.bias || null,
    matrix: raw.matrix && typeof raw.matrix === 'object' ? raw.matrix : null,
    matrix_tf: raw.matrix_tf || null,
    pd_array: raw.pd_array && typeof raw.pd_array === 'object' ? raw.pd_array : null,
    pd_tf: raw.pd_tf || null,
    regime: raw.regime || null,
    structure: raw.structure || null
  };
}
function getBestLiveSignalForPair(pair, direction){
  var rows=liveSignals.filter(function(sig){
    if(!sig.pair||sig.pair!==pair) return false;
    if(direction&&sig.direction&&sig.direction!==direction) return false;
    return true;
  });
  rows.sort(function(a,b){
    var ar=(a.rank_score!=null?a.rank_score:a.rank)||0;
    var br=(b.rank_score!=null?b.rank_score:b.rank)||0;
    return br-ar;
  });
  return rows[0]||null;
}
function livePoiZone(sig){
  if(!sig||!sig.poi||sig.poi.high==null||sig.poi.low==null) return null;
  var price=(parseFloat(sig.poi.high)+parseFloat(sig.poi.low))/2;
  return {
    pct:'POI',
    price:price,
    side:sig.direction==='SELL'?'PREMIUM':'DISCOUNT',
    fib:'SMC '+(sig.poi.type||'POI'),
    slBuf:(sig.pair&&isPairJPY(sig.pair))?1.20:0.0030,
    poiType:sig.poi.type||'POI',
    setupClass:sig.setup_class||'',
    setupQuality:sig.setup_quality!=null?sig.setup_quality:null
  };
}
function plannerZoneScore(pair, lv, marketPrice){
  if(!lv||lv.price==null) return -9999;
  var stars=getStarsForLevel(pair,lv)||0;
  var efBonus=lv.fib&&lv.fib.indexOf('EF')===0?10:0;
  var dist=Math.abs(marketPrice-lv.price)*(isPairJPY(pair)?100:10000);
  return stars*25 + efBonus + Math.max(0,30-Math.min(dist,30));
}

function getLocalPriceAuthorityTs(){
  var latest = 0;
  if(lastFetchTime && !isNaN(lastFetchTime.getTime())) latest = lastFetchTime.getTime();
  var manualTs = parseInt(priceManualTs || 0, 10);
  if(!isNaN(manualTs) && manualTs > latest) latest = manualTs;
  return latest;
}

function shouldAcceptBackendPrice(remoteTs){
  var localTs = getLocalPriceAuthorityTs();
  if(!localTs) return true;
  if(!remoteTs) return false;
  var parsedRemoteTs = new Date(remoteTs).getTime();
  return !isNaN(parsedRemoteTs) && parsedRemoteTs >= localTs;
}

function mergePhase4aFromLiveSignal(sig){
  if(!sig.pair) return;
  if(PAIRS.indexOf(sig.pair)===-1) return;
  if(sig.instrument_id) PAIR_SYMBOLS[sig.pair] = sig.instrument_id;
  else if(sig.symbol) PAIR_SYMBOLS[sig.pair] = sig.symbol;

  // Normalize regime — never store null
  var regime = sig.regime || (sig.direction==='BUY' ? 'TREND UP' : sig.direction==='SELL' ? 'TREND DOWN' : null);
  if(regime) savedRegimes[sig.pair] = regime;

  if(sig.sequence_status) savedSeqStatus[sig.pair]=normalizeSequenceStatus(sig.sequence_status);

  // Only let backend prices win when they are fresher than the local price source.
  if(sig.market_price!=null && sig.market_price>0 && (!(savedPrices[sig.pair] > 0) || shouldAcceptBackendPrice(sig.updated_at || sig.last_signal_at))){
    savedPrices[sig.pair]=sig.market_price;
  }

  if(sig.ef&&sig.ef.fibHigh!=null&&sig.ef.fibLow!=null) updateEF(sig.pair,sig.ef.mode||'Range',sig.ef.fibHigh,sig.ef.fibLow);
  if(sig.f3_high!=null&&sig.f3_low!=null){
    SFL_ANCHORS[sig.pair]=normalizeSflAnchorPayload(
      sig.sfl_anchor || null,
      sig.f3_high,
      sig.f3_low,
      sig.session_tf||'backend',
      sig.updated_at||sig.last_signal_at||new Date().toISOString()
    );
  }
}

function rebuildLiveSignalMap(){
  liveSignalMap={};
  liveSignals.forEach(function(sig){liveSignalMap[sig.instrument_id]=sig;});
}
function computeLiveSignalRank(sig){
  var dist=liveDistance(sig);
  var staleMins=minutesSince(sig.last_signal_at||sig.updated_at);
  var signalState=normalizeSignalState(sig.signal_state||sig.state,sig.sequence_status);
  var blocked=!sig.authenticated||signalState==='INVALID';
  var ch=getChopBand(sig.pair);
  var inChop=!!(sig.market_price!=null&&ch&&sig.market_price>=ch.lo&&sig.market_price<=ch.hi);
  if(staleMins!=null&&staleMins>120) blocked=true;
  if(sig.regime==='TREND UP'   && sig.direction==='SELL') blocked=true;
  if(sig.regime==='TREND DOWN' && sig.direction==='BUY')  blocked=true;
  var rank=(sig.setup_quality||0)*0.7 + (sig.execution_quality||0)*0.3;
  if(rank<=0) rank=(sig.score||0)*20;
  if(signalState==='ACTIVE') rank+=12;
  else if(signalState==='WATCHLIST') rank+=4;
  if(sig.sequence_status==='READY') rank+=10;
  else if(sig.sequence_status==='AWAIT MSS') rank+=3;
  else if(sig.sequence_status==='AWAIT SWEEP') rank-=2;
  else if(sig.sequence_status==='STALE') rank-=8;
  if(sig.rr_estimate!=null) rank+=Math.min(Math.max(sig.rr_estimate,0),5)*4;
  if(dist!=null) rank+=Math.max(0,15-Math.min(dist,15));
  if(sig.setup_class==='BLOCKED') rank-=8;
  if(sig.structure&&sig.structure.internal_shift===false) rank-=4;
  if(sig.structure&&sig.structure.major_bos===false) rank-=4;
  if(sig.poi&&(!sig.poi.type||sig.poi.high==null||sig.poi.low==null)) rank-=6;
  if(sig.setup_quality!=null&&sig.setup_quality<4) rank-=5;
  if(sig.rr_estimate!=null&&sig.rr_estimate<1.8) rank-=6;
  if(sig.regime==='RANGING') rank-=10;
  if(sig.last_signal_type==='EF_PRE_TRIGGER') rank-=5;
  return {blocked:blocked,rank:+rank.toFixed(2),distance:dist,staleMins:staleMins,inChop:inChop,signalState:signalState};
}
function renderLiveSignals(){
  var countEl=document.getElementById('live-count');
  if(!countEl) return;
  rebuildLiveSignalMap();
  liveSignals=liveSignals.map(function(sig){
    var rankMeta=computeLiveSignalRank(sig);
    sig.rank=rankMeta.rank;
    sig.rankBlocked=rankMeta.blocked;
    sig.rankDistance=rankMeta.distance;
    sig.rankStaleMins=rankMeta.staleMins;
    sig.signal_state=rankMeta.signalState;
    sig.rankInChop=rankMeta.inChop;
    return sig;
  });
  var runtimeRows = PAIRS.map(function(pair){
    var resolved = resolvePairRuntimeSignal(pair);
    var fallbackLive = resolved.live_signal || _findLiveSigForPair(pair) || {};
    var seq = normalizeSequenceStatus(resolved.sequence_status || fallbackLive.sequence_status || savedSeqStatus[pair] || '');
    var state = normalizeSignalState(resolved.signal_state || fallbackLive.signal_state || fallbackLive.state || '', seq);
    var updatedTs = resolved.updated_at || fallbackLive.updated_at || fallbackLive.last_signal_at || null;
    var staleMins = minutesSince(updatedTs);
    var runtimeSig = resolved.runtime_signal || null;
    var score = runtimeSig && runtimeSig.confluence_score != null ? Number(runtimeSig.confluence_score) : (fallbackLive.score != null ? Number(fallbackLive.score) : null);
    var direction = resolved.direction || fallbackLive.direction || null;
    var rankBase = (resolved.setup_quality != null ? Number(resolved.setup_quality) : 0) * 0.7 + (resolved.execution_quality != null ? Number(resolved.execution_quality) : 0) * 0.3;
    if(score != null) rankBase += Math.max(0, Number(score));
    if(seq === 'READY') rankBase += 10;
    if(state === 'ACTIVE') rankBase += 8;
    if(resolved.rr_estimate != null) rankBase += Math.min(Math.max(Number(resolved.rr_estimate), 0), 5) * 4;
    var backendSeq = normalizeSequenceStatus(fallbackLive.sequence_status || '');
    var backendState = normalizeSignalState(fallbackLive.signal_state || fallbackLive.state || '', backendSeq);
    var backendAuthoritative = !!(fallbackLive && (backendState === 'ACTIVE' || backendSeq === 'READY'));
    var hasLocalState = !!(resolved.has_fresh_local_signal && (state === 'ACTIVE' || state === 'WATCHLIST') && !backendAuthoritative);
    return {
      pair: pair,
      display_symbol: pair,
      direction: direction || (resolved.final_bias && String(resolved.final_bias).indexOf('BULL') === 0 ? 'BUY' : resolved.final_bias && String(resolved.final_bias).indexOf('BEAR') === 0 ? 'SELL' : ''),
      regime: resolved.regime || fallbackLive.regime || savedRegimes[pair] || '',
      sequence_status: seq || '',
      signal_state: hasLocalState && state === 'ACTIVE' ? 'WATCHLIST' : (state || 'INVALID'),
      setup_class: resolved.setup_class || fallbackLive.setup_class || '',
      blocked_reason: resolved.blocked_reason || fallbackLive.blocked_reason || '',
      setup_quality: resolved.setup_quality != null ? Number(resolved.setup_quality) : (fallbackLive.setup_quality != null ? Number(fallbackLive.setup_quality) : null),
      execution_quality: resolved.execution_quality != null ? Number(resolved.execution_quality) : (fallbackLive.execution_quality != null ? Number(fallbackLive.execution_quality) : null),
      rr_estimate: resolved.rr_estimate != null ? Number(resolved.rr_estimate) : (fallbackLive.rr_estimate != null ? Number(fallbackLive.rr_estimate) : null),
      score: score,
      rank: Number(rankBase.toFixed(2)),
      rankStaleMins: staleMins,
      updated_at: updatedTs,
      instrument_id: fallbackLive.instrument_id || pair.replace('/',''),
      poi: fallbackLive.poi || {},
      model_tag: fallbackLive.model_tag || '',
      source: resolved.source || fallbackLive.source || 'runtime',
      backend_confirmed: !hasLocalState,
      provenance: hasLocalState ? 'JS_ENGINE_PENDING_SYNC' : (fallbackLive.provenance || fallbackLive.source || 'BACKEND')
    };
  });
  var ranked=runtimeRows.filter(function(sig){return !!sig.direction || sig.signal_state === 'ACTIVE' || sig.signal_state === 'WATCHLIST';}).sort(function(a,b){return b.rank-a.rank;});
  var readyCount=runtimeRows.filter(function(sig){
    return sig.backend_confirmed && sig.sequence_status==='READY'&&sig.signal_state==='ACTIVE';
  }).length;
  countEl.textContent=liveSignals.length;
  document.getElementById('live-ready').textContent=readyCount;
  var priceEngineMeta=getPriceEngineMeta();
  var liveSyncEl=document.getElementById('live-sync');
  var liveMetaEl=document.getElementById('live-meta');
  var sidebarSyncEl=document.getElementById('eng-live-sync-sb');
  if(liveSyncEl) liveSyncEl.textContent=priceEngineMeta&&priceEngineMeta.updated_at?formatSastTime(priceEngineMeta.updated_at):'--';
  if(liveMetaEl) liveMetaEl.textContent=priceEngineMeta&&priceEngineMeta.updated_at?('Last Update: '+formatSastDateTime(priceEngineMeta.updated_at)+' - Source: Price Engine'):'Waiting for Price Engine';
  if(sidebarSyncEl){
    sidebarSyncEl.textContent=priceEngineMeta&&priceEngineMeta.updated_at?formatSastSidebarStamp(priceEngineMeta.updated_at):'--';
    var isRecent=false;
    if(priceEngineMeta&&priceEngineMeta.updated_at){
      var syncTs=parseSyncDate(priceEngineMeta.updated_at);
      if(syncTs) isRecent=(Date.now()-syncTs.getTime())<=300000;
    }
    if(isRecent) sidebarSyncEl.classList.add('live-pulse-text');
    else sidebarSyncEl.classList.remove('live-pulse-text');
  }
  var topEl=document.getElementById('live-top10');
  if(!ranked.length){
topEl.innerHTML='<div style="text-align:center;color:var(--mu);padding:30px;font-family:var(--mo);font-size:11px">No rankable live candidates yet - waiting for backend context or a viable watchlist setup</div>';
  }else{
    topEl.innerHTML='<div class="g2">'+ranked.slice(0,10).map(function(sig){
      var dp=sig.pair&&isPairJPY(sig.pair)?2:5;
      var anchor=primaryLivePrice(sig);
      var rr=sig.rr_estimate!=null?'1:'+sig.rr_estimate.toFixed(2):'-';
      var dist=sig.rankDistance!=null?(sig.pair?sig.rankDistance.toFixed(0)+'p':sig.rankDistance.toFixed(2)):'-';
      var stale=stalePill(sig.rankStaleMins);
      var tag=sig.model_tag||sig.last_signal_type||'LIVE';
      var provenance = sig.provenance || sig.source || (tag === 'PINE_WEBHOOK' ? 'PINE_WEBHOOK' : 'JS_ENGINE_PENDING_SYNC');
      return '<div class="card gb"><div class="clbl">'+sig.display_symbol+'</div>'+
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px">'+
        '<div style="display:flex;gap:6px;align-items:center">'+provenanceTag(provenance)+'<div class="'+(sig.direction==='BUY'?'pg2':'pr2')+' pill">'+(sig.direction||'WATCH')+'</div></div>'+
        statePill(sig.signal_state)+
        '</div>'+
        '<div class="kv"><span class="kvl">Rank</span><span class="kvv" style="color:var(--ac)">'+sig.rank.toFixed(1)+'</span></div>'+
        '<div class="kv"><span class="kvl">Setup Grade</span><span class="kvv">'+(sig.setup_class||'WATCH')+'</span></div>'+
'<div class="kv"><span class="kvl">Regime / Seq</span><span class="kvv">'+(sig.regime||'-')+' / '+(sig.sequence_status||'-')+'</span></div>'+
'<div class="kv"><span class="kvl">Setup / Exec</span><span class="kvv">'+(sig.setup_quality!=null?sig.setup_quality:'-')+' / '+(sig.execution_quality!=null?sig.execution_quality:'-')+'</span></div>'+
'<div class="kv"><span class="kvl">Score / R:R</span><span class="kvv">'+(sig.score!=null?sig.score:'-')+' / '+rr+'</span></div>'+
'<div class="kv"><span class="kvl">Anchor</span><span class="kvv">'+(anchor!=null?(dp?anchor.toFixed(dp):anchor):'-')+'</span></div>'+
        '<div class="kv"><span class="kvl">Distance</span><span class="kvv">'+dist+'</span></div>'+
        '<div class="kv"><span class="kvl">Freshness</span><span class="kvv">'+(stale||'<span class="pgy pill live-pulse">LIVE</span>')+'</span></div>'+
'<div class="kv"><span class="kvl">POI / Tag</span><span class="kvv">'+((sig.poi&&sig.poi.type)||'-')+' - '+tag+'</span></div>'+
        ((sig.setup_class||'')==='BLOCKED'?'<div style="margin-top:8px;font-size:11px;color:var(--am)">Blocked: '+(sig.blocked_reason||'unknown reason')+'</div>':'')+
        '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btg bts" onclick="openLiveChart(\''+String(sig.pair || sig.display_symbol).replace(/'/g,'\\\'')+'\')">Open Chart</button></div></div>';
    }).join('')+'</div>';
  }
  var tableEl=document.getElementById('live-table');
  tableEl.innerHTML=runtimeRows.length?runtimeRows.slice().sort(function(a,b){return String(b.updated_at||'').localeCompare(String(a.updated_at||''));}).map(function(sig){
    var rr=sig.rr_estimate!=null?'1:'+sig.rr_estimate.toFixed(2):'-';
    var updated=sig.updated_at?new Date(sig.updated_at).toLocaleTimeString('en-ZA',{timeZone:'Africa/Johannesburg',hour:'2-digit',minute:'2-digit'}):'-';
    var stale=stalePill(sig.rankStaleMins);
    return '<tr><td class="mn"><button class="btn btg bts" type="button" onclick="openLiveChart(\''+String(sig.pair || sig.display_symbol).replace(/'/g,'\\\'')+'\')">'+sig.display_symbol+'</button></td><td>'+(sig.direction||'-')+'</td><td>'+(sig.regime||'-')+'</td><td>'+seqPill(sig.sequence_status)+'</td><td>'+statePill(sig.signal_state)+'</td><td class="mn">'+(sig.setup_class||'-')+'</td><td class="mn">'+(sig.setup_quality!=null?sig.setup_quality:'-')+'</td><td class="mn">'+rr+'</td><td class="mn">'+updated+(stale?'<div style="margin-top:4px">'+stale+'</div>':'')+'</td></tr>';
  }).join(''):'<tr><td colspan="9" style="text-align:center;color:var(--mu);padding:20px;font-family:var(--mo);font-size:11px">No live feed yet</td></tr>';
  renderChartContextPanel();
}
function beginRefreshAction(manual, buttonId, loadingLabel){
  if(!manual) return null;
  var btn=document.getElementById(buttonId);
  if(!btn) return null;
  if(!btn.dataset.baseLabel) btn.dataset.baseLabel=btn.textContent.trim();
  btn.classList.add('is-loading');
  btn.disabled=true;
  btn.textContent=loadingLabel||'Refreshing...';
  return { button: btn, startedAt: Date.now(), baseLabel: btn.dataset.baseLabel };
}
function finishRefreshAction(action, outcome){
  if(!action || !action.button) return Promise.resolve();
  var wait=Math.max(0, 450 - (Date.now() - action.startedAt));
  return new Promise(function(resolve){
    setTimeout(function(){
      action.button.classList.remove('is-loading');
      action.button.disabled=false;
      action.button.textContent=action.baseLabel;
      if(outcome && outcome.msg) xtoast(outcome.msg, outcome.type || 'info');
      resolve();
    }, wait);
  });
}
function fetchLiveSignals(manual){
  if(!API.BASE) return Promise.resolve(false);
  if(manual) clearTdCreditsToastSuppression();
  var refreshAction=beginRefreshAction(!!manual,'refresh-live-btn','Refreshing signals...');
  return fetch(API.BASE + 'live-signals', { method:'GET', headers: apiGetHeaders(), credentials:'include' })
    .then(function(r){
      if(!r.ok) return r.text().then(function(text){
        throw new Error('HTTP '+r.status+' '+(text?text.slice(0,140):''));
      });
      return r.json();
    })
    .then(function(data){
      var rows=(data&&data.live_signals)||[];
      DATA_HYDRATION.liveLoaded = true;
      if (Array.isArray(data.watchlist)) applyWatchlist(data.watchlist);
      liveSignals=rows.map(normalizeLiveSignal).filter(function(sig){ return sig && PAIRS.indexOf(sig.pair)>-1; });
      ingestPriceEngineMetaFromLive(data,liveSignals);
      var pricesBefore = JSON.stringify(savedPrices);
      liveSignals.forEach(mergePhase4aFromLiveSignal);
      var pricesAfter = JSON.stringify(savedPrices);
      if(pricesAfter !== pricesBefore){
      }
      lastLiveFetch=new Date();
      try {
        buildPriceInputs();
      } catch (eInputs) {
        console.warn('[SNIPER] buildPriceInputs failed after live signal fetch:', eInputs && eInputs.message ? eInputs.message : eInputs);
      }
      renderSeqCards();
      renderSessionBrief();
      renderLiveSignals();
      publishRuntimeState();
      try {
        generatePlan();
      } catch (ePlan) {
        console.warn('[SNIPER] generatePlan failed after live signal fetch:', ePlan && ePlan.message ? ePlan.message : ePlan);
      }
      if(!DATA_HYDRATION.firstHydrationComplete){
        if (DEBUG_TRACE) console.log('[HYDRATION]', {
          phase: 'live',
          pricesLoaded: DATA_HYDRATION.pricesLoaded,
          regimesLoaded: DATA_HYDRATION.regimesLoaded,
          liveLoaded: DATA_HYDRATION.liveLoaded,
          firstHydrationComplete: DATA_HYDRATION.firstHydrationComplete,
          engineRunAttempted: DATA_HYDRATION.engineRunAttempted
        });
      }
      return finishRefreshAction(refreshAction,{ msg:'Live feed refreshed - ' + rows.length + ' signal' + (rows.length===1?'':'s') + ' synced', type:'ok' }).then(function(){ return true; });
    })
    .catch(function(err){
      console.warn('Live signal fetch failed: '+err.message);
      var meta=document.getElementById('live-meta');
      if(meta) meta.textContent='Live fetch failed: '+err.message;
      return finishRefreshAction(refreshAction,{ msg:'Refresh Live failed - ' + err.message, type:'warn' }).then(function(){ return false; });
    });
}

// ═══ WORDPRESS USER SYNC (adapted) ═══════════════════════════════
var USER_SYNC = {authenticated:!!API.USER, enabled:!!API.USER, lastSavedAt:null, timers:{}, loading:false};
function setSyncStatus(state,msg){
  var el=document.getElementById('sync-status');
  var dot=document.getElementById('eng-dot-sync');
  if(!el) return;
  var color=state==='saved'?'var(--gr)':state==='saving'?'var(--am)':state==='offline'?'var(--re)':'var(--mu)';
  el.style.color=color;
  el.textContent=msg;
  if(dot){
    dot.classList.remove('on','warn','off');
    dot.classList.add(state==='saved'?'on':state==='saving'?'warn':'off');
  }
}
function persistTradesLocal(){
  if (signals.length > 500) { signals = signals.slice(signals.length - 500); }
  try { lsSet('sn_sig',signals); } catch(e) { xtoast('⚠ Storage limit reached — export data before continuing', 'err'); }
  lsSet('sn_snap',snaps);
  lsSet('sn_closed',closedTrades);
}
function persistAccountLocal(){
  lsSet('sn_act',acct);
  lsSet('sn_pos',curPos);
  lsSet('sn_baseline',baseline);
  lsSet('sn_acctinfo',acctInfo);
}
function persistSettingsLocal(){
  lsSet('sn_start',START);
  lsSet('sn_fib_tf',FIB_TIMEFRAME);
  lsSet('sn_account_currency',ACCOUNT_CURRENCY);
  lsSet('sn_usd_to_account_rate',USD_TO_ACCOUNT_RATE);
  lsSet('sn_instrument_overrides',INSTRUMENT_OVERRIDES);
}
function buildUserPayload(bucket){
  if(bucket==='trades') return {signals:signals,snapshots:snaps,closed_trades:closedTrades};
  if(bucket==='account') return {account:acct,account_info:acctInfo,baseline:baseline,positions:curPos};
  return {start_date:START,fib_timeframe:FIB_TIMEFRAME,watchlist:PAIRS.slice()};
}
function userFetch(bucket, method, payload){
  var resolvedMethod = String(method || 'GET').toUpperCase();
  return fetch(API.BASE + 'user/' + bucket, {
    method: resolvedMethod,
    headers: resolvedMethod === 'GET' ? apiGetHeaders() : apiPostHeaders(),
    credentials: 'include',
    body: resolvedMethod === 'GET' ? undefined : (payload ? JSON.stringify(payload) : undefined),
  }).then(function(r){
    if(r.status===401) throw new Error('login required');
    if(r.status===403) throw new Error('nonce required');
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  });
}
function queueUserSync(bucket, delay){
  if(!USER_SYNC.authenticated) return;
  clearTimeout(USER_SYNC.timers[bucket]);
  setSyncStatus('saving','Saving...');
  USER_SYNC.timers[bucket]=setTimeout(function(){
    userFetch(bucket,'POST',buildUserPayload(bucket)).then(function(data){
      USER_SYNC.lastSavedAt=data&&data.saved_at?data.saved_at:new Date().toISOString();
      setSyncStatus('saved','Saved');
    }).catch(function(err){
      USER_SYNC.authenticated=false;
      setSyncStatus('offline','Sync offline: '+err.message);
    });
  },delay==null?2000:delay);
}
function applyUserSettings(data){
  if(!data||typeof data!=='object') return;
  if(data.start_date) START=data.start_date;
  if(data.fib_timeframe) syncRuntimeTimeframe(data.fib_timeframe);
  if(Array.isArray(data.watchlist)) applyWatchlist(data.watchlist);
  persistSettingsLocal();
}
function applyRiskProfile(data){
  if(!data||typeof data!=='object') return;
  if(data.account_currency) ACCOUNT_CURRENCY=data.account_currency;
  if(data.usd_to_account_rate!=null&&!isNaN(parseFloat(data.usd_to_account_rate))) USD_TO_ACCOUNT_RATE=parseFloat(data.usd_to_account_rate);
  if(data.instrument_overrides&&typeof data.instrument_overrides==='object') INSTRUMENT_OVERRIDES=data.instrument_overrides;
  persistSettingsLocal();
}
function applyUserTrades(data){
  if(!data||typeof data!=='object') return;
  signals=Array.isArray(data.signals)?data.signals:[];
  snaps=Array.isArray(data.snapshots)?data.snapshots:[];
  closedTrades=Array.isArray(data.closed_trades)?data.closed_trades:[];
  persistTradesLocal();
}
function applyUserAccount(data){
  if(!data||typeof data!=='object') return;
  acct=data.account||null;
  acctInfo=data.account_info&&typeof data.account_info==='object'?data.account_info:{};
  baseline=data.baseline||null;
  curPos=Array.isArray(data.positions)?data.positions:[];
  persistAccountLocal();
}
function hydrateUserInputFields(){
  var fibTfEl=document.getElementById('fib-timeframe');
  if(fibTfEl&&FIB_TIMEFRAME) fibTfEl.value=FIB_TIMEFRAME;
}
function loadUserCloudState(){
  setSyncStatus('saving','Loading cloud data...');
  return Promise.all([
    userFetch('trades','GET'),
    userFetch('account','GET'),
    userFetch('settings','GET')
  ]).then(function(res){
    USER_SYNC.authenticated=true;
    USER_SYNC.enabled=true;
    applyUserTrades(res[0]&&res[0].data?res[0].data:{});
    applyUserAccount(res[1]&&res[1].data?res[1].data:{});
    applyUserSettings(res[2]&&res[2].data?res[2].data:{});
    hydrateUserInputFields();
    setSyncStatus('saved','Saved');
    return true;
  }).catch(function(err){
    USER_SYNC.authenticated=false;
    USER_SYNC.enabled=false;
    setSyncStatus('offline','Local only: '+err.message);
    return false;
  });
}
function refreshWpSession(){
  return apiGet('session').then(function(res){
    var data = res && res.data ? res.data : res;
    if(data && (data.user_id || data.logged_in)){
      var uid = Number(data.user_id || 0);
      API.USER = {
        id: uid,
        display_name: data.display_name || '',
        email: data.email || (API.USER && API.USER.email) || '',
        logout_url: data.logout_url || (API.USER && API.USER.logout_url) || '',
        is_admin: (API.USER && API.USER.is_admin) || false
      };
      USER_SYNC.authenticated = true;
      MARKET_DATA_READY = !!API.NONCE && USER_SYNC.authenticated;
      return true;
    }
    API.USER = null;
    USER_SYNC.authenticated = false;
    MARKET_DATA_READY = false;
    return false;
  }).catch(function(){
    API.USER = null;
    USER_SYNC.authenticated = false;
    MARKET_DATA_READY = false;
    return false;
  });
}
function smcLogout(){
  var url = API.USER && API.USER.logout_url ? API.USER.logout_url : API.WP + '/wp-login.php?action=logout';
  window.location.href = url;
}
function smcLogin(){
  window.location.href = API.WP + '/wp-login.php?redirect_to=' + encodeURIComponent(window.location.href);
}

// ── PRICE FETCH, SIGNAL ENGINE, ETC. (unchanged from monolith) ──
// Twelve Data key is supplied from WP admin settings only.
var MARKET_DATA_READY = !!API.NONCE && !!API.USER;
var MARKET_DATA_KEY_MISSING = false;
var DATA_HYDRATION = {
  pricesLoaded: false,
  regimesLoaded: false,
  liveLoaded: false,
  firstHydrationComplete: false,
  engineRunAttempted: false
};
var lastFetchTime = null;
var signalCandleCache = {};
var CANDLE_STALE_MIN_MS = 15 * 60 * 1000;
var CANDLE_STALE_MAX_MS = 30 * 60 * 1000;
var SWING_LOOKBACK = 10;
var VALID_SEQUENCE_WINDOW = 10;
var PAIR_SYMBOLS = (function(){
  var base={'GBP/USD':'GBP/USD','USD/JPY':'USD/JPY','AUD/USD':'AUD/USD','AUD/JPY':'AUD/JPY','EUR/USD':'EUR/USD'};
  PAIRS.forEach(function(p){if(!base[p]) base[p]=p;});
  return base;
}());
function getProfileBridge() {
  return window.SniperDashboardData && typeof window.SniperDashboardData.getProfile === 'function'
    ? window.SniperDashboardData
    : null;
}

function getRuntimeProfile() {
  var bridge = getProfileBridge();
  if (bridge) {
    var profile = bridge.getProfile();
    if (profile && typeof profile === 'object') return profile;
  }
  return {
    key: 'WEEKLY',
    fib_timeframe: 'WEEKLY',
    candleInterval: '4h',
    interval: '4h',
    historyDepth: 140,
    outputSize: 140,
    proximityThreshold: 20,
    strategyHorizon: '1 Week'
  };
}

function getRuntimeProfileSeconds() {
  var profile = getRuntimeProfile();
  var interval = String(profile.interval || profile.candleInterval || '4h').toLowerCase();
  var map = { '1h': 3600, '4h': 14400, '1day': 86400, '1d': 86400, '1week': 604800, '1w': 604800 };
  return map[interval] || 14400;
}

function pairPipDivisor(pair) {
  var normalized = String(pair || '').toUpperCase();
  if (normalized.indexOf('JPY') !== -1) return 100;
  if (normalized.indexOf('XAU') !== -1) return 10;
  if (normalized.indexOf('US30') !== -1 || normalized.indexOf('NAS100') !== -1) return 1;
  return 10000;
}

function buildMarketDataSymbolCandidates(pair, symbol) {
  var seen = {};
  var ordered = [];
  var normalizedPair = String(pair || '').trim().toUpperCase();
  var compactPair = normalizedPair.replace('/', '');
  function pushCandidate(value) {
    var next = String(value || '').trim();
    if (!next || seen[next]) return;
    seen[next] = true;
    ordered.push(next);
  }
  if (normalizedPair === 'GBP/USD' || normalizedPair === 'EUR/USD' || normalizedPair === 'AUD/USD' || normalizedPair === 'USD/JPY' || normalizedPair === 'AUD/JPY') {
    pushCandidate(normalizedPair);
  }
  pushCandidate(lastSuccessfulMarketSymbolByPair[normalizedPair]);
  pushCandidate(symbol);
  pushCandidate(pair);
  pushCandidate(compactPair);
  var aliases = [ 'FX:' + compactPair, compactPair ];
  if(normalizedPair === 'XAU/USD') aliases.push('OANDA:XAUUSD', 'XAUUSD');
  if(normalizedPair === 'BTC/USD') aliases.push('BINANCE:BTCUSDT', 'BITSTAMP:BTCUSD', 'BTC/USD', 'BTCUSD');
  if(normalizedPair === 'ETH/USD') aliases.push('BINANCE:ETHUSDT', 'BITSTAMP:ETHUSD', 'ETH/USD', 'ETHUSD');
  if(normalizedPair === 'US30') aliases.push('OANDA:US30USD', 'US30USD');
  if(normalizedPair === 'NAS100') aliases.push('OANDA:NAS100USD', 'NASDAQ:NDX');
  aliases.forEach(pushCandidate);
  var bridge = window.SniperDashboardData;
  if (bridge && typeof bridge.getCandidateSymbols === 'function') {
    bridge.getCandidateSymbols().forEach(function(candidate) {
      var raw = String(candidate || '').trim();
      var compact = raw.replace('/', '');
      if (raw === pair || compact === String(pair || '').replace('/', '')) {
        pushCandidate(raw);
        pushCandidate(compact);
      }
    });
  }
  return ordered;
}

function buildMarketDataQuery(params) {
  return Object.keys(params).filter(function(key) {
    return params[key] != null && params[key] !== '';
  }).map(function(key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(String(params[key]));
  }).join('&');
}

function marketDataGet(params) {
  return apiGet('user/market-data?' + buildMarketDataQuery(params));
}
function parseMarketDataErrorKind(err){
  var msg = String((err && err.message) || '').toLowerCase();
  if(/api key is not configured|missing api key|no api key|key is not configured/.test(msg)) return 'missing_key';
  if(/http 429|rate limit|retry_after|credits|throttle/.test(msg)) return 'rate_limited';
  if(/no candle|no price|empty response|unavailable symbol/.test(msg)) return 'no_data';
  if(/http 502|http 503|http 504|timeout|temporar|upstream|gateway/.test(msg)) return 'upstream_failure';
  return 'backend_error';
}

function extractRetryAfterSeconds(err){
  var msg = String((err && err.message) || '');
  var match = msg.match(/retry[_\s-]?after\s*=\s*(\d+)/i) || msg.match(/retry[_\s-]?after\s*[:\s]\s*(\d+)/i);
  if (match && match[1]) return Math.max(1, parseInt(match[1], 10) || 0);
  return 15;
}

function markTdProxyDeferred(retryAfterSeconds){
  var seconds = Math.max(1, parseInt(retryAfterSeconds, 10) || 15);
  tdProxyDeferUntilMs = Date.now() + (seconds * 1000);
}

function getTdProxyRemainingSeconds(){
  var remaining = tdProxyDeferUntilMs - Date.now();
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / 1000);
}

function isTdProxyDeferred(){
  return getTdProxyRemainingSeconds() > 0;
}

function resolveCandleStaleMs(interval){
  var raw = String(interval || '').toLowerCase();
  var map = { '1h': 3600000, '4h': 14400000, '1day': 86400000, '1d': 86400000, '1week': 604800000, '1w': 604800000 };
  var timeframeMs = map[raw] || 14400000;
  var derived = Math.floor(timeframeMs / 8);
  if (derived < CANDLE_STALE_MIN_MS) return CANDLE_STALE_MIN_MS;
  if (derived > CANDLE_STALE_MAX_MS) return CANDLE_STALE_MAX_MS;
  return derived;
}

function hasPricedPairs(pairs){
  var keys = Array.isArray(pairs) && pairs.length ? pairs : PAIRS;
  return keys.some(function(pair){
    return (savedPrices[pair] || 0) > 0;
  });
}

function hasRenderableLocalEngineState(pairs){
  var keys = Array.isArray(pairs) && pairs.length ? pairs : PAIRS;
  function isRenderableState(row){
    if(!row || !row.regime || row.gate == null) return false;
    var regime = String(row.regime || '').toUpperCase().trim();
    var gate = String(row.gate || '').toUpperCase().trim();
    if((regime === 'RANGING' || regime === 'STALE' || regime === 'UNKNOWN') && (gate === 'NONE' || gate === 'NO DATA' || gate === 'STALE')) return false;
    return true;
  }
  return keys.some(function(pair){
    var runtimeSig = computedSignals && computedSignals[pair] ? computedSignals[pair] : null;
    var runtimeSnap = computedSnapshots && computedSnapshots[pair] ? computedSnapshots[pair] : null;
    var sigReady = isRenderableState(runtimeSig);
    var snapReady = isRenderableState(runtimeSnap);
    return sigReady || snapReady;
  });
}

function shouldReconcileLocalEngineState(pairs){
  return !!(
    MARKET_DATA_READY &&
    signalEngineStatus !== 'COMPUTING' &&
    hasPricedPairs(pairs) &&
    !hasRenderableLocalEngineState(pairs)
  );
}

var pendingEngineRetryTimer = null;

function clearPendingEngineRetry(){
  if (pendingEngineRetryTimer) {
    clearTimeout(pendingEngineRetryTimer);
    pendingEngineRetryTimer = null;
  }
}

function scheduleEngineRetry(delayMs, reason, pairs){
  clearPendingEngineRetry();
  pendingEngineRetryTimer = setTimeout(function(){
    pendingEngineRetryTimer = null;
    if (shouldReconcileLocalEngineState(pairs)) {
      runSignalEngineNow({ reason: reason, pairs: pairs });
    }
  }, Math.max(0, Number(delayMs || 0)));
}

function isAnchorObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value) {
    if (value == null || value === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function normalizeF3Shape(candidate) {
    return normalizeAnchorShape(candidate);
}

function normalizeAnchorShape(candidate) {
    if (!isAnchorObject(candidate)) return null;
    var a = toFiniteNumber(candidate.high);
    var b = toFiniteNumber(candidate.low);
    if (a == null || b == null) {
        a = toFiniteNumber(candidate.fibHigh);
        b = toFiniteNumber(candidate.fibLow);
    }
    if (a == null || b == null) return null;
    var high = Math.max(a, b);
    var low = Math.min(a, b);
    if (!Number.isFinite(high) || !Number.isFinite(low) || high === low) return null;
    return { high: high, low: low };
}

function normalizeF3AnchorForPost(pairKey, sig, snapshot) {
    if (DEBUG_TRACE) console.log('[ANCHOR_TRACE:F3_SOURCES]', pairKey, {
        sigAnchors: sig && sig.anchors ? sig.anchors : null,
        snapshotAnchors: snapshot && snapshot.anchors ? snapshot.anchors : null,
        sigF3: sig && sig.f3 ? sig.f3 : null,
        snapshotF3: snapshot && snapshot.f3 ? snapshot.f3 : null,
        sigActiveFibF3: sig && sig.activeFib ? sig.activeFib.f3 || null : null,
        snapshotActiveFibF3: snapshot && snapshot.activeFib ? snapshot.activeFib.f3 || null : null,
        sigSfAnchor: sig && sig.sf_anchor ? sig.sf_anchor : null,
        snapshotSfAnchor: snapshot && snapshot.sf_anchor ? snapshot.sf_anchor : null,
        sigSf: sig && sig.sf ? sig.sf : null,
        snapshotSf: snapshot && snapshot.sf ? snapshot.sf : null
    });

    var normalizedAnchors = {};
    [['f1', 'f1'], ['f2', 'f2'], ['f3', 'f3']].forEach(function(row){
        var leg = row[0];
        var candidates = [
            sig && sig.anchors ? sig.anchors[leg] : null,
            snapshot && snapshot.anchors ? snapshot.anchors[leg] : null
        ];
        for (var ci = 0; ci < candidates.length; ci++) {
            var normalizedLeg = normalizeAnchorShape(candidates[ci]);
            if (normalizedLeg) {
                normalizedAnchors[leg] = normalizedLeg;
                return;
            }
        }
    });
    if (normalizedAnchors.f3) {
        if (DEBUG_TRACE) console.log('[ANCHOR_TRACE:F3_MATCH]', pairKey, {
            matchedSource: 'anchors_full',
            normalizedF3: normalizedAnchors.f3
        });
        return normalizedAnchors;
    }

    var sources = [
        { name: 'sig.anchors.f3', value: sig && sig.anchors ? sig.anchors.f3 : null },
        { name: 'snapshot.anchors.f3', value: snapshot && snapshot.anchors ? snapshot.anchors.f3 : null },
        { name: 'sig.f3', value: sig ? sig.f3 : null },
        { name: 'snapshot.f3', value: snapshot ? snapshot.f3 : null },
        { name: 'sig.activeFib.f3', value: sig && sig.activeFib ? sig.activeFib.f3 : null },
        { name: 'snapshot.activeFib.f3', value: snapshot && snapshot.activeFib ? snapshot.activeFib.f3 : null },
        { name: 'sig.sf_anchor', value: sig ? sig.sf_anchor : null },
        { name: 'snapshot.sf_anchor', value: snapshot ? snapshot.sf_anchor : null },
        { name: 'sig.sf', value: sig ? sig.sf : null },
        { name: 'snapshot.sf', value: snapshot ? snapshot.sf : null }
    ];

    for (var i = 0; i < sources.length; i++) {
        var source = sources[i];
        if (!source.value) continue;
        var normalizedF3 = normalizeF3Shape(source.value);
        if (normalizedF3) {
            var normalized = Object.assign({}, normalizedAnchors, { f3: normalizedF3 });
            if (DEBUG_TRACE) console.log('[ANCHOR_TRACE:F3_MATCH]', pairKey, {
                matchedSource: source.name,
                normalizedF3: normalized.f3
            });
            return normalized;
        }
    }

    if (DEBUG_TRACE) console.log('[ANCHOR_TRACE:F3_MATCH]', pairKey, {
        matchedSource: 'none',
        normalizedF3: null
    });
    return null;
}

function fieldFromSignalOrSnapshot(sig, snapshot, field, fallback) {
    if (sig && sig[field] != null) return sig[field];
    if (snapshot && snapshot[field] != null) return snapshot[field];
    return fallback;
}

function blockersFromSignalOrSnapshot(sig, snapshot) {
    if (sig && Array.isArray(sig.blockers)) return sig.blockers;
    if (snapshot && Array.isArray(snapshot.blockers)) return snapshot.blockers;
    var reason = snapshot && (snapshot.blocked_reason || snapshot.gate_reason);
    return reason ? [String(reason)] : null;
}

// BACKEND AUTHORITY: this function submits locally-computed signals to the backend for
// persistence and validation. The /live-signals endpoint is the sole display source of truth.
// Local computation here is a sync-producer bridge, not an override of backend signals.
async function postEngineToBackend(signalResults, computedRegimes, runSnapshots) {
    if (DEBUG_TRACE) console.log('[ENGINE_TRACE:POST_CALL]', {
        pairKeys: Object.keys(signalResults || {}),
        nonNullSignals: Object.keys(signalResults || {}).filter(function(k){ return !!signalResults[k]; }),
        snapshotKeys: Object.keys(runSnapshots || {})
    });
    var profile = getRuntimeProfile();
    var payload = {
        source: 'js_engine',
        candle_interval: profile.interval || profile.candleInterval || '4h',
        fib_timeframe: profile.fib_timeframe || profile.key || 'WEEKLY',
        timestamp: new Date().toISOString(),
        signal_schema_version: SIGNAL_SCHEMA.version,
        engine_version: SIGNAL_SCHEMA.engine,
        pairs: {}
    };
    PAIRS.forEach(function(pair) {
        var pairKey = pair.replace('/', '');
        var sig = signalResults[pair];
        var snapshot = runSnapshots && runSnapshots[pair] ? runSnapshots[pair] : null;
        if (!sig && !snapshot) {
            return;
        }
        var normalizedAnchors = normalizeF3AnchorForPost(pairKey, sig, snapshot);
        var levelsPayload = sig && sig.levels ? sig.levels : (snapshot && snapshot.levels ? snapshot.levels : null);
        var gateReason = fieldFromSignalOrSnapshot(sig, snapshot, 'gate_reason', null);
        var blockedReason = fieldFromSignalOrSnapshot(sig, snapshot, 'blocked_reason', null) || gateReason || 'NO_CANDIDATE';
        if (DEBUG_TRACE) console.log('[ANCHOR_TRACE:POST_FINAL]', pairKey, {
            hasAnchors: !!normalizedAnchors,
            anchors: normalizedAnchors,
            hasF3: !!(normalizedAnchors && normalizedAnchors.f3),
            f3High: normalizedAnchors && normalizedAnchors.f3 ? normalizedAnchors.f3.high : null,
            f3Low: normalizedAnchors && normalizedAnchors.f3 ? normalizedAnchors.f3.low : null
        });
        payload.pairs[pairKey] = {
            bias_profile: fieldFromSignalOrSnapshot(sig, snapshot, 'bias_profile', null),
            regime: computedRegimes[pair] || fieldFromSignalOrSnapshot(sig, snapshot, 'regime', null),
            market_price: savedPrices[pair] || 0,
            sequence_status: fieldFromSignalOrSnapshot(sig, snapshot, 'sequence_status', 'AWAIT SWEEP'),
            signal_state: fieldFromSignalOrSnapshot(sig, snapshot, 'signal_state', 'INVALID'),
            blocked_reason: blockedReason,
            direction: fieldFromSignalOrSnapshot(sig, snapshot, 'direction', null),
            entry_zone_label: fieldFromSignalOrSnapshot(sig, snapshot, 'entry_zone_label', null),
            entry_zone_price: fieldFromSignalOrSnapshot(sig, snapshot, 'entry_zone_price', null),
            sweep_confirmed: fieldFromSignalOrSnapshot(sig, snapshot, 'sweep_confirmed', false),
            mss_confirmed: fieldFromSignalOrSnapshot(sig, snapshot, 'mss_confirmed', false),
            confluence_score: fieldFromSignalOrSnapshot(sig, snapshot, 'confluence_score', 0),
            ede_stars: fieldFromSignalOrSnapshot(sig, snapshot, 'ede_stars', null),
            structure: fieldFromSignalOrSnapshot(sig, snapshot, 'structure', null),
            htf_dol: fieldFromSignalOrSnapshot(sig, snapshot, 'htf_dol', null),
            matrix: fieldFromSignalOrSnapshot(sig, snapshot, 'matrix', null),
            matrix_tf: fieldFromSignalOrSnapshot(sig, snapshot, 'matrix_tf', null),
            pd_array: fieldFromSignalOrSnapshot(sig, snapshot, 'pd_array', null),
            pd_tf: fieldFromSignalOrSnapshot(sig, snapshot, 'pd_tf', null),
            final_bias: fieldFromSignalOrSnapshot(sig, snapshot, 'final_bias', null),
            bull_bias_score: fieldFromSignalOrSnapshot(sig, snapshot, 'bull_bias_score', null),
            bear_bias_score: fieldFromSignalOrSnapshot(sig, snapshot, 'bear_bias_score', null),
            bull_pressure: fieldFromSignalOrSnapshot(sig, snapshot, 'bull_pressure', null),
            bear_pressure: fieldFromSignalOrSnapshot(sig, snapshot, 'bear_pressure', null),
            pressure_bias: fieldFromSignalOrSnapshot(sig, snapshot, 'pressure_bias', null),
            fib_disagreement_penalty: fieldFromSignalOrSnapshot(sig, snapshot, 'fib_disagreement_penalty', null),
            chop_band: fieldFromSignalOrSnapshot(sig, snapshot, 'chop_band', null),
            chop: fieldFromSignalOrSnapshot(sig, snapshot, 'chop', null),
            gate: fieldFromSignalOrSnapshot(sig, snapshot, 'gate', null),
            gate_reason: gateReason,
            anchors: normalizedAnchors,
            levels: levelsPayload,
            blockers: blockersFromSignalOrSnapshot(sig, snapshot),
            updated_at: fieldFromSignalOrSnapshot(sig, snapshot, 'updated_at', null)
        };
        if (DEBUG_TRACE) console.log('[ANCHOR_TRACE:POST]', pairKey, {
            pairDisplay: pair,
            pairNormalized: pairKey,
            regime: payload.pairs[pairKey].regime,
            gate: payload.pairs[pairKey].gate,
            hasAnchors: !!payload.pairs[pairKey].anchors,
            anchors: payload.pairs[pairKey].anchors || null,
            hasF3: !!(payload.pairs[pairKey].anchors && payload.pairs[pairKey].anchors.f3),
            entry_zone_price: payload.pairs[pairKey].entry_zone_price,
            updated_at: payload.pairs[pairKey].updated_at
        });
    });

    if (!payload.pairs || Object.keys(payload.pairs).length === 0) {
        if (DEBUG_TRACE) console.log('[ENGINE_TRACE:POST_SKIP]', { reason: 'no_pairs_payload' });
        return { ok: true, skipped: true, reason: 'no_pairs_payload' };
    }

    try {
        return await apiPost('user/engine-batch', payload);
    } catch (e) {
        if (DEBUG_TRACE) console.log('[ENGINE_TRACE:POST_SKIP]', { reason: 'post_engine_batch_failed', message: e && e.message ? e.message : String(e) });
        console.warn('postEngineToBackend failed:', e.message);
        return null;
    }
}
function fetchRegimes(manual){
  var refreshAction=beginRefreshAction(!!manual,'refresh-regimes-btn','Refreshing...');
  return fetch(API.BASE + 'regimes', { method:'GET', headers: apiGetHeaders(), credentials:'include' })
    .then(function(r){
      if(!r.ok) return r.text().then(function(text){
        throw new Error('HTTP '+r.status+' '+(text?text.slice(0,140):''));
      });
      return r.json();
    })
    .then(function(data){
      if(!data||typeof data!=='object') return false;
      DATA_HYDRATION.regimesLoaded = true;
      var updated=0;
      var priceChanged=false;
      var hasFreshMeta=false;
      var hasChopBand=false;
      if (Array.isArray(data.watchlist)) applyWatchlist(data.watchlist);
      var regimeData = data.regimes || data;
      var metaData = data.meta && typeof data.meta === 'object' ? data.meta : {};
      ingestPriceEngineMetaFromRegimes(data);
      var nextRegimeMetaByPair = {};
      Object.keys(metaData).forEach(function(wpPair){
        var dashPair = toPhase4aPair(wpPair);
        if(!dashPair) return;
        var normalizedMeta = normalizeRegimeMetaRow(metaData[wpPair]);
        if(normalizedMeta) {
          nextRegimeMetaByPair[dashPair] = normalizedMeta;
          if (normalizedMeta.updated_at) hasFreshMeta = true;
          if (normalizedMeta.chop_band && normalizedMeta.chop_band.low != null && normalizedMeta.chop_band.high != null) hasChopBand = true;
        }
      });
      regimeMetaByPair = nextRegimeMetaByPair;
      if(data.ef_levels) {
        Object.keys(data.ef_levels).forEach(function(pair){
          var ef=data.ef_levels[pair];
          if(ef&&ef.fibHigh&&ef.fibLow) updateEF(pair,ef.mode||'Range',ef.fibHigh,ef.fibLow);
        });
      }
      if(data.sfl_anchors && typeof data.sfl_anchors === 'object') {
        Object.keys(data.sfl_anchors).forEach(function(pair){
          var anchor = data.sfl_anchors[pair];
          var dp = toPhase4aPair(pair);
          if(dp && anchor) {
            SFL_ANCHORS[dp] = normalizeSflAnchorPayload(anchor);
          }
          if (DEBUG_TRACE) console.log('[ANCHOR_TRACE:FETCH_REGIMES]', pair, {
            normalizedPair: dp || null,
            incoming: anchor || null,
            stored: dp ? (SFL_ANCHORS[dp] || null) : null,
            hasStored: !!(dp && SFL_ANCHORS[dp] && Number.isFinite(SFL_ANCHORS[dp].fibHigh) && Number.isFinite(SFL_ANCHORS[dp].fibLow))
          });
        });
      }
      if(data.sequence){
        Object.keys(data.sequence).forEach(function(wp){
          var dp=toPhase4aPair(wp);
          if(dp) savedSeqStatus[dp]=data.sequence[wp];
        });
      }
      Object.keys(regimeData).forEach(function(wpPair){
        var dashPair = toPhase4aPair(wpPair);
        var nextRegime = regimeData[wpPair];
        if(!dashPair || !nextRegime) return;
        if(savedRegimes[dashPair] === nextRegime) return;
        savedRegimes[dashPair] = nextRegime;
        var pId = dashPair.replace('/','');
        var sel = document.getElementById('rg-'+pId);
        if(sel) sel.value = nextRegime;
        updated++;
      });
      if(data.prices){
        Object.keys(data.prices).forEach(function(wpPair){
          var dashPair = toPhase4aPair(wpPair);
          var nextPrice = parseFloat(data.prices[wpPair]);
          var metaRow = data.meta && data.meta[wpPair] ? data.meta[wpPair] : null;
          var remoteTs = metaRow && metaRow.updated_at ? metaRow.updated_at : (data.updated_at || null);
          if(!dashPair || !(nextPrice > 0)) return;
          if((savedPrices[dashPair] > 0) && !shouldAcceptBackendPrice(remoteTs)) return;
          if(savedPrices[dashPair] === nextPrice) return;
          savedPrices[dashPair] = nextPrice;
          priceChanged = true;
        });
      }
      renderSessionBrief();
      renderSeqCards();
      {
        var latestMeta=getPriceEngineMeta();
        lastRegimeFetch=latestMeta&&latestMeta.updated_at?parseSyncDate(latestMeta.updated_at):new Date();
        try {
          buildPriceInputs();
        } catch (eInputs) {
          console.warn('[SNIPER] buildPriceInputs failed after regime fetch:', eInputs && eInputs.message ? eInputs.message : eInputs);
        }
        renderLiveSignals();
        if(Object.keys(computedSignals).length) renderComputedSignalCards();
        publishRuntimeState();
        try {
          generatePlan();
        } catch (ePlan) {
          console.warn('[SNIPER] generatePlan failed after regime fetch:', ePlan && ePlan.message ? ePlan.message : ePlan);
        }
        if(!DATA_HYDRATION.firstHydrationComplete){
          if (DEBUG_TRACE) console.log('[HYDRATION]', {
            phase: 'regimes',
            pricesLoaded: DATA_HYDRATION.pricesLoaded,
            regimesLoaded: DATA_HYDRATION.regimesLoaded,
            liveLoaded: DATA_HYDRATION.liveLoaded,
            firstHydrationComplete: DATA_HYDRATION.firstHydrationComplete,
            engineRunAttempted: DATA_HYDRATION.engineRunAttempted
          });
        }
        if(updated>0 && !manual){
          var ts=lastRegimeFetch.toLocaleTimeString('en-ZA',{timeZone:'Africa/Johannesburg',hour:'2-digit',minute:'2-digit'});
          xtoast('Regimes auto-updated from indicator: '+updated+' pairs - '+ts,'ok');
        }
        var shouldRunFromRegimeHydration = hasFreshMeta || hasChopBand || priceChanged || signalEngineStatus === 'STALE' || signalEngineStatus === 'OFFLINE' || signalEngineStatus === 'NOT_READY';
        if (shouldRunFromRegimeHydration && shouldReconcileLocalEngineState(PAIRS)) {
          if (isTdProxyDeferred()) scheduleEngineRetry((getTdProxyRemainingSeconds() + 1) * 1000, 'regimes_reconcile_td_deferred', PAIRS);
          else runSignalEngineNow({ manual: true, reason: 'regimes_reconcile' });
        }
      }
      return finishRefreshAction(refreshAction,{ msg:'Regimes refreshed - ' + updated + ' pair' + (updated===1?'':'s') + ' updated', type:'ok' }).then(function(){ return true; });
    })
    .catch(function(err){
      console.warn('Regime fetch failed: ' + err.message);
      var metaEl = document.getElementById('regime-brief-meta');
      if(metaEl) metaEl.textContent = 'Last Update: Price Engine sync failed (' + err.message + ')';
      return finishRefreshAction(refreshAction,{ msg:'Refresh Regimes failed - ' + err.message, type:'warn' }).then(function(){ return false; });
    });
}
function saveApiKey(){
  xtoast('⚠ NOTICE Twelve Data API key is managed in WordPress admin settings only','info');
}
function getNyNow(){
  return new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'}));
}
function getSastNow(){
  return new Date(new Date().toLocaleString('en-US',{timeZone:'Africa/Johannesburg'}));
}
function getBrowserTimeZone(){
  try{
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  }catch(e){
    return null;
  }
}
function fmtLocalClockTime(ms){
  try{
    var tz=getBrowserTimeZone();
    if(!tz) throw new Error('No browser timezone');
    return new Intl.DateTimeFormat('en-ZA',{
      hour:'2-digit',
      minute:'2-digit',
      second:'2-digit',
      hour12:false,
      timeZone:tz
    }).format(new Date(ms));
  }catch(e){
    var sast=new Date(ms+2*3600000);
    return [sast.getUTCHours(),sast.getUTCMinutes(),sast.getUTCSeconds()].map(function(n){
      return String(n).padStart(2,'0');
    }).join(':');
  }
}
function fmtKzTime(ms){
  // Render KZ windows in browser-local timezone; fallback to SAST.
  try{
    var tz=getBrowserTimeZone();
    if(!tz) throw new Error('No browser timezone');
    var dateObj=new Date(ms);
    var timeStr=new Intl.DateTimeFormat('en-ZA',{
      hour:'2-digit',
      minute:'2-digit',
      hour12:false,
      timeZone:tz
    }).format(dateObj);
    var tzLabel=new Intl.DateTimeFormat('en-ZA',{
      timeZoneName:'short',
      timeZone:tz
    }).formatToParts(dateObj).find(function(p){return p.type==='timeZoneName';});
    return {timeStr:timeStr,tzLabel:(tzLabel&&tzLabel.value)||'SAST'};
  }catch(e){
    var sast=new Date(ms+2*3600000);
    var h=String(sast.getUTCHours()).padStart(2,'0');
    var m=String(sast.getUTCMinutes()).padStart(2,'0');
    return {timeStr:h+':'+m,tzLabel:'SAST'};
  }
}
function parseSyncDate(value){
  if(!value) return null;
  var d=new Date(value);
  return isNaN(d.getTime())?null:d;
}
function formatSastTime(value){
  var d=parseSyncDate(value);
  return d?d.toLocaleTimeString('en-ZA',{timeZone:'Africa/Johannesburg',hour:'2-digit',minute:'2-digit',hour12:false}):'--';
}
function formatSastDateTime(value){
  var d=parseSyncDate(value);
  return d?d.toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+' SAST':'--';
}
function formatSastSidebarStamp(value){
  var d=parseSyncDate(value);
  return d?d.toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false})+' SAST':'--';
}
function setPriceEngineMeta(updatedAt){
  var d=parseSyncDate(updatedAt);
  if(!d) return;
  var nextMeta={updated_at:d.toISOString(),source:'Price Engine'};
  var current=window._lastWpRegimeMeta&&window._lastWpRegimeMeta.updated_at?parseSyncDate(window._lastWpRegimeMeta.updated_at):null;
  if(!current||d>=current){
    window._lastWpRegimeMeta=nextMeta;
  }
}
function ingestPriceEngineMetaFromRegimes(data){
  var meta=data&&data.meta&&typeof data.meta==='object'?data.meta:{};
  var latest=null;
  Object.keys(meta).forEach(function(key){
    var candidate=meta[key]&&meta[key].updated_at?parseSyncDate(meta[key].updated_at):null;
    if(candidate&&(!latest||candidate>latest)) latest=candidate;
  });
  if(!latest&&data&&data.updated_at) latest=parseSyncDate(data.updated_at);
  if(latest) setPriceEngineMeta(latest.toISOString());
}
function ingestPriceEngineMetaFromLive(data, rows){
  var latest=null;
  (rows||[]).forEach(function(sig){
    var candidate=parseSyncDate(sig&&((sig.updated_at)||(sig.last_signal_at)));
    if(candidate&&(!latest||candidate>latest)) latest=candidate;
  });
  if(!latest&&data&&data.generated_at) latest=parseSyncDate(data.generated_at);
  if(latest) setPriceEngineMeta(latest.toISOString());
}
function getPriceEngineMeta(){ return window._lastWpRegimeMeta&&window._lastWpRegimeMeta.updated_at?window._lastWpRegimeMeta:null; }
function getKillZoneMeta(){
  var nyNow=getNyNow();
  var h=nyNow.getHours()+nyNow.getMinutes()/60;
  var active=(h>=2&&h<5)||(h>=8&&h<11)||(h>=13.5&&h<16);
  return {active:active, minutes:active?10:20};
}
function renderTickerStrip(){
  var wrap=document.getElementById('smc-ticker-items');
  if(!wrap) return;
  var baseRows=PAIRS.map(function(pair,idx){
    var key=pair.replace('/','');
    return '<div class="smc-ticker__item"><span class="smc-ticker__pair">'+pair+'</span><span class="smc-ticker__price" id="tick-'+key+'" data-tick-key="'+key+'">--</span><span class="smc-ticker__chg" data-chg-key="'+key+'">--</span></div>' +
           (idx < PAIRS.length - 1 ? '<div class="smc-ticker__sep"></div>' : '');
  }).join('');
  // Duplicate multiple times for seamless infinite scroll
  var duplicatedRows = baseRows + baseRows + baseRows + baseRows;
  wrap.innerHTML=duplicatedRows;
}


function updatePriceDisplays(){
  renderTickerStrip();
  PAIRS.forEach(function(pair){
    var key=pair.replace('/','');
    var els=document.querySelectorAll('[data-tick-key="'+key+'"]');
    if(!els.length) return;
    var price=savedPrices[pair]||0;
    if(price>0){
      var dp=pair.indexOf('JPY')>-1?3:5;
      var formatted=Number(price).toFixed(dp);
      els.forEach(function(el){
        el.textContent=formatted;
        el.style.color='var(--tx)';
      });
      // Update % change
      var chgEls = document.querySelectorAll('[data-chg-key="'+key+'"]');
      var dayOpen = savedDailyOpens[pair];
      if (dayOpen && dayOpen > 0) {
        var pctChange = ((price - dayOpen) / dayOpen) * 100;
        var pctFormatted = pctChange.toFixed(2);
        var sign = pctChange > 0 ? '+' : (pctChange < 0 ? '' : '');
        var pctText = sign + pctFormatted + '%';
        var cssClass = pctChange > 0 ? 'positive' : (pctChange < 0 ? 'negative' : 'neutral');
        chgEls.forEach(function(el){
          el.textContent = pctText;
          el.className = 'smc-ticker__chg ' + cssClass;
        });
      } else {
        chgEls.forEach(function(el){
          el.textContent = '--';
          el.className = 'smc-ticker__chg neutral';
        });
      }
    } else {
      els.forEach(function(el){
        el.textContent='--';
        el.style.color='var(--mu)';
      });
      var chgEls = document.querySelectorAll('[data-chg-key="'+key+'"]');
      chgEls.forEach(function(el){
        el.textContent = '--';
        el.className = 'smc-ticker__chg neutral';
      });
    }
  });

  var sidebarStatus=document.getElementById('price-status');
  var planStatus=document.getElementById('price-status-plan');
  var priceDot=document.getElementById('eng-dot-price');
  // Single source of truth: count from in-memory savedPrices (populated by API fetch,
  // live-signal merges, and manual entry). All three status displays draw from here.
  var liveCount=PAIRS.filter(function(pair){ return savedPrices[pair]&&savedPrices[pair]>0; }).length;
  var hasAnyPrice=liveCount>0;

  if(priceDot){
    priceDot.classList.remove('on','warn','off');
    priceDot.classList.add(hasAnyPrice?'on':'off');
  }

  var statusText, statusColor;
  if(hasAnyPrice){
    var ts=lastFetchTime
      ? lastFetchTime.toLocaleTimeString('en-ZA',{timeZone:'Africa/Johannesburg',hour:'2-digit',minute:'2-digit',second:'2-digit'})
      : null;
    statusText=liveCount+'/'+PAIRS.length+' live'+(ts?' - '+ts+' SAST':'');
    statusColor='var(--gr)';
  } else {
    statusText='Waiting';
    statusColor='var(--mu)';
  }

  // Block transient/error states set by fetchPrices so the countdown renderer cannot mask them.
  var BLOCK_STATES=['Refreshing...','Feed offline','Rate limited','No price data','Log in to enable authenticated market data'];
  [sidebarStatus, planStatus].forEach(function(el){
    if(!el) return;
    if(BLOCK_STATES.indexOf((el.textContent||'').trim())===-1){
      el.textContent=statusText;
      el.style.color=statusColor;
    }
  });

  if(PAIRS.length>0){
    var inlineEl=document.getElementById('live-price-status-inline');
    if(inlineEl){
      if(BLOCK_STATES.indexOf((inlineEl.textContent||'').trim())===-1){
        inlineEl.textContent=liveCount+'/'+PAIRS.length+' Live';
        inlineEl.style.color=hasAnyPrice?'var(--gr)':'var(--mu)';
      }
    }
  }

  updateLiveRefreshCountdown();
}

function updateLiveRefreshCountdown(){
  var sidebarStatus=document.getElementById('price-status');
  var planStatus=document.getElementById('price-status-plan');
  var inlineEl=document.getElementById('live-price-status-inline');
  var remaining=getTdProxyRemainingSeconds();
  if(remaining<=0){
    var queuedPattern=/^TD queued \(\d+s\)$/;
    var inlineQueuedPattern=/^Queued \(\d+s\)$/;
    var liveCount=PAIRS.filter(function(pair){ return savedPrices[pair]&&savedPrices[pair]>0; }).length;
    var hasAnyPrice=liveCount>0;
    var ts=lastFetchTime
      ? lastFetchTime.toLocaleTimeString('en-ZA',{timeZone:'Africa/Johannesburg',hour:'2-digit',minute:'2-digit',second:'2-digit'})
      : null;
    var restoredText=hasAnyPrice
      ? (liveCount+'/'+PAIRS.length+' live'+(ts?' - '+ts+' SAST':''))
      : 'Waiting';
    var restoredColor=hasAnyPrice?'var(--gr)':'var(--mu)';
    [sidebarStatus, planStatus].forEach(function(el){
      if(!el) return;
      var text=(el.textContent||'').trim();
      if(queuedPattern.test(text)){
        el.textContent=restoredText;
        el.style.color=restoredColor;
      }
    });
    if(inlineEl && inlineQueuedPattern.test((inlineEl.textContent||'').trim())){
      inlineEl.textContent=liveCount+'/'+PAIRS.length+' Live';
      inlineEl.style.color=hasAnyPrice?'var(--gr)':'var(--mu)';
    }
    return;
  }
  if(!isTdProxyDeferred()) return;
  var queued='TD queued ('+remaining+'s)';
  [sidebarStatus, planStatus].forEach(function(el){
    if(!el) return;
    el.textContent=queued;
    el.style.color='var(--am)';
  });
  if(inlineEl){
    inlineEl.textContent='Queued ('+remaining+'s)';
    inlineEl.style.color='var(--am)';
  }
}

function fetchPrices(manual){
  var refreshAction=beginRefreshAction(!!manual,'fetch-btn','Refreshing...');
  if(manual) clearTdCreditsToastSuppression();
  if(isTdProxyDeferred()){
    var remaining = getTdProxyRemainingSeconds();
    var deferMsg = 'TD proxy cooldown active (' + remaining + 's remaining)';
    if(manual) return finishRefreshAction(refreshAction,{ msg:deferMsg, type:'warn' }).then(function(){ return false; });
    return Promise.resolve(false);
  }
  if(!MARKET_DATA_READY){
    updatePriceDisplays();
    if(manual) return finishRefreshAction(refreshAction,{ msg:'Log in to use authenticated market data routes', type:'warn' }).then(function(){ return false; });
    showToastThrottled('⚠ WARNING Log in to use authenticated market data routes','warn','market_data_login_required',180000,'low');
    return Promise.resolve(false);
  }
  if(fetchPrices._pending){
    if(manual) return finishRefreshAction(refreshAction,{ msg:'Price refresh already in progress', type:'info' }).then(function(){ return fetchPrices._pending; });
    return fetchPrices._pending;
  }
  var now = new Date();
  if(!manual && fetchPrices._lastCall && (now - fetchPrices._lastCall) < 30000) {
    var wait = Math.ceil((30000-(now-fetchPrices._lastCall))/1000);
    showToastThrottled('⚠ WARNING Rate limit guard: wait '+wait+'s before refreshing again','warn','market_data_rate_guard',180000,'low');
    return Promise.resolve(false);
  }
  if(!manual) fetchPrices._lastCall = now;
  var btn=document.getElementById('fetch-btn');
  var status=document.getElementById('price-status');
  var planStatus=document.getElementById('price-status-plan');
  if(!manual && btn){ btn.classList.add('is-loading'); btn.textContent='Refreshing...'; btn.disabled=true; }
  if(status){ status.textContent='Refreshing...'; status.style.color='var(--am)'; }
  if(planStatus){ planStatus.textContent='Refreshing...'; planStatus.style.color='var(--am)'; }
  var inlineStatus=document.getElementById('live-price-status-inline');
  if(inlineStatus){ inlineStatus.textContent='Refreshing...'; inlineStatus.style.color='var(--am)'; }
  var symbols=PAIRS.join(',');
  var request = marketDataGet({ kind:'prices', symbols:symbols })
    .then(function(data){
      MARKET_DATA_KEY_MISSING = false;
      var updated=0;
      var errors=[];
      PAIRS.forEach(function(p){
        var val=null;
        if(data[p]&&data[p].price){
          val=parseFloat(data[p].price);
        } else if(data.price&&PAIRS.length===1){
          val=parseFloat(data.price);
        }
        if(val&&val>0){
          savedPrices[p]=val;
          var pId=p.replace('/','');
          var inp=document.getElementById('pr-'+pId);
          if(inp){
            var isJPY=p.indexOf('JPY')>-1;
            inp.value=val.toFixed(isJPY?3:5);
          }
          updated++;
        } else {
          if(data[p]&&data[p].code) errors.push(p+': '+data[p].message);
          else errors.push(p+': no price');
        }
      });
      // Detect per-pair rate-limit signals: TD returns HTTP 200 with per-symbol error objects
      // when credits are exhausted, so the HTTP-level catch never fires for this case.
      var hasDataRateLimit = errors.some(function(e){ return /credits|rate.limit|429|per minute/i.test(e); });
      if(hasDataRateLimit){
        var rlSeconds = 15;
        markTdProxyDeferred(rlSeconds);
        if(!manual && btn){ btn.classList.remove('is-loading'); btn.textContent='Refresh Prices'; btn.disabled=false; }
        if(status){ status.textContent='Rate limited'; status.style.color='var(--re)'; }
        if(planStatus){ planStatus.textContent='Rate limited'; planStatus.style.color='var(--re)'; }
        if(inlineStatus){ inlineStatus.textContent='Rate limited'; inlineStatus.style.color='var(--re)'; }
        return finishRefreshAction(refreshAction,{ msg:'Price refresh rate-limited — API credits exhausted. Cooldown: '+rlSeconds+'s', type:'warn' }).then(function(){ return false; });
      }
      lastFetchTime=new Date();
      if(updated>0) DATA_HYDRATION.pricesLoaded = true;
      var shouldKickstartEngine = updated>0 && shouldReconcileLocalEngineState(PAIRS);
      var ts=lastFetchTime.toLocaleTimeString('en-ZA',{timeZone:'Africa/Johannesburg',hour:'2-digit',minute:'2-digit',second:'2-digit'});
      if(!manual && btn){ btn.classList.remove('is-loading'); btn.textContent='Refresh Prices'; btn.disabled=false; }
      if(updated===PAIRS.length){
        var kzMeta=getKillZoneMeta();
        var nextMins=kzMeta.minutes;
        var okText=updated + ' live - ' + ts + ' SAST';
        if(status){ status.textContent=okText; status.style.color='var(--gr)'; }
        if(planStatus){ planStatus.textContent=okText; planStatus.style.color='var(--gr)'; }
        if(inlineStatus){ inlineStatus.textContent=updated+'/'+PAIRS.length+' Live'; inlineStatus.style.color='var(--gr)'; }
        updatePriceDisplays();
        // Delay daily-opens 30s so they don't compete with the first engine run at prices_kickstart.
        // fetchDailyOpens fires 7 TD calls; the engine fires 7 candle calls on the same tick —
        // the combined burst exceeds the 8/min TD limit, causing STALE → 15s retry on every cold load.
        setTimeout(function(){ fetchDailyOpens(); }, 30000);
        if(!manual) xtoast('Prices loaded: ' + PAIRS.map(function(p){var isJPY=p.indexOf('JPY')>-1;return p+' '+savedPrices[p].toFixed(isJPY?3:5);}).join(' - '),'ok');
        renderSessionBrief();
        if (typeof window.generatePlan === 'function') {
          try {
            window.generatePlan();
          } catch (ePlan) {
            console.warn('[SNIPER] generatePlan failed after price fetch:', ePlan && ePlan.message ? ePlan.message : ePlan);
          }
        }
        if(shouldKickstartEngine){
          if (isTdProxyDeferred()) {
            scheduleEngineRetry((getTdProxyRemainingSeconds() + 1) * 1000, 'prices_kickstart_td_deferred', PAIRS);
          } else {
            runSignalEngineNow({ manual: true, reason: 'prices_kickstart' });
          }
        }
        if(!DATA_HYDRATION.firstHydrationComplete){
          if (DEBUG_TRACE) console.log('[HYDRATION]', {
            phase: 'prices',
            pricesLoaded: DATA_HYDRATION.pricesLoaded,
            regimesLoaded: DATA_HYDRATION.regimesLoaded,
            liveLoaded: DATA_HYDRATION.liveLoaded,
            firstHydrationComplete: DATA_HYDRATION.firstHydrationComplete,
            engineRunAttempted: DATA_HYDRATION.engineRunAttempted
          });
        }
        return finishRefreshAction(refreshAction,{ msg:'Live prices refreshed for ' + updated + ' pairs', type:'ok' }).then(function(){ return true; });
      } else {
        var warnText=updated + '/' + PAIRS.length + ' live - ' + ts;
        if(status){ status.textContent=warnText; status.style.color='var(--am)'; }
        if(planStatus){ planStatus.textContent=warnText; planStatus.style.color='var(--am)'; }
        if(inlineStatus){ inlineStatus.textContent=updated+'/'+PAIRS.length+' Live'; inlineStatus.style.color='var(--am)'; }
        updatePriceDisplays();
        if(shouldKickstartEngine){
          if (isTdProxyDeferred()) {
            scheduleEngineRetry((getTdProxyRemainingSeconds() + 1) * 1000, 'prices_partial_kickstart_td_deferred', PAIRS);
          } else {
            runSignalEngineNow({ manual: true, reason: 'prices_partial_kickstart' });
          }
        }
        if(!manual && errors.length) showToastThrottled('⚠ WARNING Price fetch issues: '+errors.join(', '),'warn','market_data_price_issues',180000,'low');
        return finishRefreshAction(refreshAction,{ msg:'Price refresh completed with warnings', type:'warn' }).then(function(){ return false; });
      }
    })
    .catch(function(err){
      var errorKind = parseMarketDataErrorKind(err);
      if(errorKind === 'rate_limited'){
        markTdProxyDeferred(extractRetryAfterSeconds(err));
      }
      MARKET_DATA_KEY_MISSING = errorKind === 'missing_key';
      var errMsg = String((err && err.message) || '');
      MARKET_DATA_KEY_MISSING = MARKET_DATA_KEY_MISSING || /api key|no[_\\s-]?key|missing[_\\s-]?key/i.test(errMsg);
      if(!manual && btn){ btn.classList.remove('is-loading'); btn.textContent='Refresh Prices'; btn.disabled=false; }
      if(status){ status.textContent='Feed offline'; status.style.color='var(--re)'; }
      if(planStatus){ planStatus.textContent='Feed offline'; planStatus.style.color='var(--re)'; }
      var inlineStatusErr=document.getElementById('live-price-status-inline');
      if(inlineStatusErr){ inlineStatusErr.textContent='Feed offline'; inlineStatusErr.style.color='var(--re)'; }
      updatePriceDisplays();
      renderComputedSignalCards();
      if(!manual){
        var reasonText = errorKind==='missing_key'
          ? 'missing Twelve Data API key configuration'
          : (errorKind==='rate_limited'
            ? 'Twelve Data request limit reached'
          : (errorKind==='upstream_failure'
            ? 'transient upstream failure'
            : (errorKind==='no_data' ? 'no candle/price data returned' : 'general backend error')));
        showToastThrottled('⚠ WARNING Live price fetch failed (' + reasonText + '): ' + err.message + ' - enter prices manually','warn','market_data_live_fetch_failed_'+reasonText,120000,'fatal');
      }
      return finishRefreshAction(refreshAction,{ msg:'Refresh Prices failed - ' + err.message, type:'warn' }).then(function(){ return false; });
    });
  fetchPrices._pending = request;
  return request.then(function(result){
    if(fetchPrices._pending === request) fetchPrices._pending = null;
    return result;
  }, function(err){
    if(fetchPrices._pending === request) fetchPrices._pending = null;
    throw err;
  });
}
function startAutoRefresh(){
  if(!priceStatusTickerInterval){
    priceStatusTickerInterval = setInterval(updateLiveRefreshCountdown, 1000);
  }
  if(startAutoRefresh._priceInterval) return;
  startAutoRefresh._priceInterval = setInterval(function(){
    if(!MARKET_DATA_READY) return;
    var interval=getKillZoneMeta().minutes;
    var minsSince=lastFetchTime?((new Date()-lastFetchTime)/60000):99;
    if(minsSince>=interval){
      // Clear the rate-limit guard so the auto-refresh interval is never blocked by a
      // recent manual fetch — the interval itself is already rate-controlled by minsSince
      fetchPrices._lastCall = null;
      fetchPrices();
    }
  }, 60000);
}
// ── NEW calculateMA() helper ──
function calculateMA(candles, period) {
    var ma  = [];
    var sum = 0;
    for (var i = 0; i < candles.length; i++) {
        sum += candles[i].close;
        if (i >= period) {
            sum -= candles[i - period].close;
        }
        if (i >= period - 1) {
            ma.push(sum / period);
        } else {
            ma.push(null);
        }
    }
    return ma;
}
// REMOVED-SPRINT8: was local reimplementation, now calls data.js
function getDashboardDataBridge() {
    return window.SniperDashboardEngine || null;
}

var dataBridgeMissingNotified = false;

function estimateFallbackSequenceBar(candles) {
    var bars = Array.isArray(candles) ? candles : [];
    if (!bars.length) return null;
    var last = bars[bars.length - 1] || {};
    var lookback = Math.min(6, bars.length);
    var ref = bars[bars.length - lookback] || last;
    var lastClose = Number(last.close);
    var refClose = Number(ref.close);
    var hasTrend = isFinite(lastClose) && isFinite(refClose);
    var delta = hasTrend ? (lastClose - refClose) : 0;
    var mssBull = hasTrend && delta > 0;
    var mssBear = hasTrend && delta < 0;
    var sequenceStatus = (mssBull || mssBear) ? 'READY' : 'AWAIT MSS';
    var baseQuality = hasTrend ? Math.min(80, Math.max(45, Math.round(Math.abs(delta) * 10000))) : 50;
    return {
        sequenceStatus: sequenceStatus,
        setup_class: sequenceStatus === 'READY' ? 'B' : 'WATCH',
        blocked_reason: '',
        setup_quality: baseQuality,
        execution_quality: Math.max(40, baseQuality - 10),
        confirmed_sweep_up: false,
        confirmed_sweep_down: false,
        mss_bullish: mssBull,
        mss_bearish: mssBear,
        timeMs: Number(last.timeMs) || Date.now()
    };
}

function computeSequenceFromDataModule(pair, candles) {
    var dataBridge = getDashboardDataBridge();
    if (!dataBridge || typeof dataBridge.computeSweepMssSequence !== 'function') {
        if (!dataBridgeMissingNotified) {
            dataBridgeMissingNotified = true;
            console.warn('[SniperDashboard] Data bridge missing computeSweepMssSequence; falling back to local sequence estimate.');
            if (typeof xtoast === 'function') xtoast('⚠ WARNING Data bridge unavailable - using local signal fallback', 'warn');
        }
        return estimateFallbackSequenceBar(candles);
    }
    var pipType = pair.indexOf('JPY') > -1 ? 'JPY' : 'USD';
    var sequence = dataBridge.computeSweepMssSequence(candles || [], { pipType: pipType });
    if (!sequence || !sequence.bars || !sequence.bars.length) return estimateFallbackSequenceBar(candles);
    return sequence.bars[sequence.bars.length - 1];
}

function getActiveKillZone() {
    var now = new Date();
    var nyStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    var nyTime = new Date(nyStr);
    var h = nyTime.getHours();
    var m = nyTime.getMinutes();
    var t = h * 60 + m;
    var kzs = [
        { label: 'London Open', start: 2*60, end: 5*60 },
        { label: 'NY Open', start: 7*60, end: 10*60 },
        { label: 'London Close', start: 10*60, end: 12*60 },
        { label: 'NY PM', start: 13*60, end: 15*60 }
    ];
    for (var i = 0; i < kzs.length; i++) {
        if (t >= kzs[i].start && t < kzs[i].end) return kzs[i];
    }
    return null;
}
function isEfEntryLevel(level) {
    var label = level && level.fib != null ? String(level.fib) : '';
    return label.indexOf('EF') === 0;
}
function isDirectionalLevelAllowed(level, direction) {
    if (!level || !direction) return false;
    var zone = level.zone != null ? String(level.zone).toLowerCase() : '';
    if (!zone) return true;
    return direction === 'BUY' ? zone !== 'sell' : zone !== 'buy';
}
function isPredictiveLevelForDirection(level, direction, marketPrice) {
    if (!level || !direction || !isFinite(Number(level.price)) || !isFinite(Number(marketPrice))) return false;
    if (direction === 'SELL') return Number(level.price) > Number(marketPrice);
    if (direction === 'BUY') return Number(level.price) < Number(marketPrice);
    return false;
}
function sortStageLevels(levels, direction) {
    var ordered = (Array.isArray(levels) ? levels.slice() : []).sort(function (a, b) {
        return Number(a.price) - Number(b.price);
    });
    return direction === 'BUY' ? ordered.reverse() : ordered;
}
function pickNearestLevel(levels, currentPrice, proximityPrice) {
    var match = null;
    var minDist = Infinity;
    (Array.isArray(levels) ? levels : []).forEach(function (lv) {
        if (!lv || !isFinite(lv.price) || lv.price <= 0) return;
        var dist = Math.abs(lv.price - currentPrice);
        if (dist < proximityPrice && dist < minDist) {
            minDist = dist;
            match = lv;
        }
    });
    return match;
}
function buildLegacySpreadEntries(zonePrice, dir, dp) {
    var spread = (dp === 2) ? 0.15 : 0.00015;
    return [0, 1, 2].map(function (idx) {
        return dir === 'SELL'
            ? +(zonePrice - (2 - idx) * spread).toFixed(dp)
            : +(zonePrice + (2 - idx) * spread).toFixed(dp);
    });
}
function buildStageEntryFramework(zone, dir, levels, dp, marketPrice) {
    var legacyEntries = buildLegacySpreadEntries(Number(zone && zone.price), dir, dp);
    if (!zone || !isEfEntryLevel(zone)) {
        return {
            entrySource: 'FIB',
            fallbackReason: null,
            entries: legacyEntries.map(function (price, idx) {
                return {
                    stage: 'E' + (idx + 1),
                    entry: price,
                    source: 'LEGACY_SPREAD',
                    label: zone && zone.pct ? zone.pct : 'ZONE',
                    fib: zone && zone.fib ? zone.fib : null
                };
            })
        };
    }
    var efStages = sortStageLevels((levels || []).filter(function (lv) {
        return isEfEntryLevel(lv) &&
            lv.side !== 'CHOP' &&
            isDirectionalLevelAllowed(lv, dir) &&
            isPredictiveLevelForDirection(lv, dir, marketPrice);
    }), dir);
    var fallbackReason = null;
    var stageEntries = [];
    for (var i = 0; i < 3; i++) {
        var nextEf = efStages[i] || null;
        if (nextEf) {
            stageEntries.push({
                stage: 'E' + (i + 1),
                entry: +Number(nextEf.price).toFixed(dp),
                source: 'EF',
                label: nextEf.pct || nextEf.fib || ('EF ' + (i + 1)),
                fib: nextEf.fib || null
            });
            continue;
        }
        fallbackReason = fallbackReason || 'EF_STAGE_INCOMPLETE';
        stageEntries.push({
            stage: 'E' + (i + 1),
            entry: legacyEntries[i],
            source: 'LEGACY_SPREAD',
            label: zone && zone.pct ? zone.pct : 'ZONE',
            fib: zone && zone.fib ? zone.fib : null
        });
    }
    return {
        entrySource: 'EF',
        fallbackReason: fallbackReason,
        entries: stageEntries
    };
}
function getStageStopData(entryPrice, dir, levels, dp, options) {
    var opts = options || {};
    var sorted = (Array.isArray(levels) ? levels.slice() : []).sort(function (a, b) {
        return Number(a.price) - Number(b.price);
    });
    var directional = sorted.filter(function (lv) {
        if (!lv || lv.price == null || lv.side === 'CHOP') return false;
        if (dir === 'SELL') return Number(lv.price) > Number(entryPrice);
        return Number(lv.price) < Number(entryPrice);
    });
    if (opts.excludeEf) {
        directional = directional.filter(function (lv) { return !isEfEntryLevel(lv); });
    }
    if (opts.preferEf) {
        var efDirectional = directional.filter(function (lv) { return isEfEntryLevel(lv); });
        if (efDirectional.length) {
            directional = efDirectional;
        } else if (!opts.fallbackToAny) {
            return { price: null, level: null, rule: 'EF_UNAVAILABLE' };
        }
    }
    if (!directional.length && opts.preferEf && opts.fallbackToAny) {
        directional = sorted.filter(function (lv) {
            if (!lv || lv.price == null || lv.side === 'CHOP') return false;
            if (dir === 'SELL') return Number(lv.price) > Number(entryPrice);
            return Number(lv.price) < Number(entryPrice);
        });
    }
    var nextLv = null;
    if (dir === 'SELL') {
        nextLv = directional.length ? directional[0] : null;
    } else {
        nextLv = directional.length ? directional[directional.length - 1] : null;
    }
    if (!nextLv) return { price: null, level: null, rule: 'NO_NEXT_LEVEL' };
    var buf = (dp === 2) ? 0.20 : 0.00020;
    return {
        price: dir === 'SELL'
            ? +(Number(nextLv.price) + buf).toFixed(dp)
            : +(Number(nextLv.price) - buf).toFixed(dp),
        level: nextLv,
        rule: isEfEntryLevel(nextLv) ? 'EF_NEXT_LEVEL' : 'NEXT_LEVEL'
    };
}
function buildSignalForPair(pair, candles, currentPrice, providedRegime) {
    var dataBridge = getDashboardDataBridge();
    var snapshot = null;
    var hasSnapshot = false;
    if (dataBridge && typeof dataBridge.computeInstrumentSnapshot === 'function') {
        snapshot = dataBridge.computeInstrumentSnapshot(pair, candles, {
            tfSeconds: getRuntimeProfileSeconds(),
            pipType: pair.indexOf('JPY') > -1 ? 'JPY' : 'USD'
        });
        if (snapshot) {
            hasSnapshot = true;
            computedSnapshots[pair] = snapshot;
            if (snapshot.regime) savedRegimes[pair] = snapshot.regime;
        }
    }
    var sequenceBar = computeSequenceFromDataModule(pair, candles);
    if (!sequenceBar) return null;
    var profile = getRuntimeProfile();
    var regime = hasSnapshot ? ((snapshot && snapshot.regime) || null) : null;
    if (!hasSnapshot && !regime && providedRegime && providedRegime !== '') regime = providedRegime;
    if (!hasSnapshot && !regime && savedRegimes[pair]) regime = savedRegimes[pair];
    if (!regime) return null;
    var sequenceStatus = hasSnapshot
        ? normalizeSequenceStatus((snapshot && snapshot.sequence_status) || 'AWAIT SWEEP')
        : normalizeSequenceStatus(sequenceBar.sequenceStatus || sequenceBar.sequence_status || 'AWAIT SWEEP');
    var kz = getActiveKillZone();
    var levels = [];
    if (hasSnapshot && Array.isArray(snapshot.levels) && snapshot.levels.length) {
        levels = snapshot.levels.map(function (lv) {
            return {
                fib: lv && lv.label ? lv.label : (lv && lv.ratio != null ? String(lv.ratio) : 'SNAP'),
                price: Number(lv && lv.price),
                zone: lv && lv.zone ? String(lv.zone).toLowerCase() : null
            };
        }).filter(function (lv) {
            return isFinite(lv.price) && lv.price > 0;
        });
    }
    if (!levels.length) levels = getAllLevels(pair);
    var proximityPips = Number(profile && profile.proximityThreshold);
    if (!isFinite(proximityPips) || proximityPips <= 0) proximityPips = 20;
    var proximityPrice = proximityPips / pairPipDivisor(pair);
    var entryZone = null;
    var entrySource = null;
    var fallbackReason = null;
    var direction = null;
    if (hasSnapshot) {
        if (snapshot.final_bias === 'BULL_EXP' || snapshot.final_bias === 'BULL_PB') direction = 'BUY';
        else if (snapshot.final_bias === 'BEAR_EXP' || snapshot.final_bias === 'BEAR_RALLY') direction = 'SELL';
        if (!direction && snapshot.sequence_status === 'READY') {
            if (snapshot.gate === 'BUY') direction = 'BUY';
            else if (snapshot.gate === 'SELL') direction = 'SELL';
        }
        if (!direction && snapshot.gate === 'BUY') direction = 'BUY';
        if (!direction && snapshot.gate === 'SELL') direction = 'SELL';
    }
    if (!direction && !hasSnapshot) direction = sequenceBar.mss_bullish ? 'BUY' : (sequenceBar.mss_bearish ? 'SELL' : null);
    if (!direction && !hasSnapshot && regime === 'TREND UP') direction = 'BUY';
    if (!direction && !hasSnapshot && regime === 'TREND DOWN') direction = 'SELL';
    if (hasSnapshot && snapshot.gate === 'NONE') return null;
    if (direction && levels.length) {
        var eligibleLevels = levels.filter(function (lv) {
            return isDirectionalLevelAllowed(lv, direction);
        });
        var efCandidates = eligibleLevels.filter(function (lv) { return isEfEntryLevel(lv); });
        var nonEfCandidates = eligibleLevels.filter(function (lv) { return !isEfEntryLevel(lv); });
        entryZone = pickNearestLevel(efCandidates, currentPrice, proximityPrice);
        if (entryZone) {
            entrySource = 'EF';
        } else {
            entryZone = pickNearestLevel(nonEfCandidates, currentPrice, proximityPrice);
            if (entryZone) {
                entrySource = 'FIB';
                if (efCandidates.length) fallbackReason = 'EF_OUT_OF_RANGE';
                else fallbackReason = 'EF_UNAVAILABLE';
            }
        }
    }
    if (!direction || !entryZone) return null;
    var chop = hasSnapshot && snapshot.chop_band ? { lo: snapshot.chop_band.low, hi: snapshot.chop_band.high } : getChopBand(pair);
    var inChop = !!(chop && currentPrice != null && currentPrice >= chop.lo && currentPrice <= chop.hi);
    var blockedReason = '';
    var signalState = 'WATCHLIST';
    if (sequenceStatus === 'STALE') {
        signalState = 'INVALID';
        blockedReason = 'STALE_SEQUENCE';
    } else if (sequenceStatus === 'AWAIT SWEEP' || sequenceStatus === 'AWAIT MSS') {
        signalState = 'WATCHLIST';
        blockedReason = sequenceStatus || 'SEQUENCE_PENDING';
    } else if (!kz) {
        signalState = 'WATCHLIST';
        blockedReason = 'OUTSIDE_KILL_ZONE';
    } else {
        signalState = 'ACTIVE';
    }
    var setupClass = sequenceBar.setup_class || '';
    if (setupClass === 'BLOCKED') {
        signalState = 'INVALID';
        blockedReason = sequenceBar.blocked_reason || blockedReason || 'unknown reason';
    }
    function deepClonePayload(value) {
        if (value == null) return null;
        try { return JSON.parse(JSON.stringify(value)); } catch (e) { return null; }
    }
    var executionStagePlan = null;
    var executionSlLevels = [];
    var executionSlRule = null;
    if (direction && entryZone && levels.length) {
        var entryDp = pair.indexOf('JPY') > -1 ? 2 : 5;
        var slBufBase = entryDp === 2 ? 1.50 : 0.0040;
        var sharedSignalSl = getNextLevelSL(entryZone.price, direction, levels, entryDp);
        if (sharedSignalSl === null) {
            sharedSignalSl = direction === 'SELL'
                ? +(entryZone.price + (entryZone.slBuf || slBufBase)).toFixed(entryDp)
                : +(entryZone.price - (entryZone.slBuf || slBufBase)).toFixed(entryDp);
        }
        executionStagePlan = buildStageEntryFramework(entryZone, direction, levels, entryDp, currentPrice);
        executionSlLevels = executionStagePlan.entries.map(function (stageEntry) {
            var stageStop = isEfEntryLevel(entryZone)
                ? getStageStopData(stageEntry.entry, direction, levels, entryDp, { preferEf: true, fallbackToAny: false })
                : getStageStopData(stageEntry.entry, direction, levels, entryDp, { excludeEf: true });
            return {
                stage: stageEntry.stage,
                entry: stageEntry.entry,
                sl_price: stageStop.price !== null ? stageStop.price : sharedSignalSl,
                rule: stageStop.price !== null ? stageStop.rule : 'LEGACY_BUFFER',
                level_label: stageStop.level ? (stageStop.level.pct || stageStop.level.fib || null) : null,
                level_price: stageStop.level ? +Number(stageStop.level.price).toFixed(entryDp) : null
            };
        });
        executionSlRule = isEfEntryLevel(entryZone) ? 'STAGE_EF_NEXT_LEVEL' : 'LEGACY_NEXT_LEVEL';
        if (!fallbackReason && executionStagePlan.fallbackReason) fallbackReason = executionStagePlan.fallbackReason;
    }
    var normalizedAnchors = normalizeF3AnchorForPost(pair.replace('/', ''), null, snapshot || null);
    var resolvedChopBand = null;
    if (snapshot && isValidChopBand(snapshot.chop_band)) {
        resolvedChopBand = {
            low: Number(snapshot.chop_band.low),
            high: Number(snapshot.chop_band.high),
            source: snapshot.chop_band.source || 'js_snapshot'
        };
    }
    var resolvedChop = null;
    if (resolvedChopBand) {
        resolvedChop = {
            active: !!(currentPrice != null && currentPrice >= resolvedChopBand.low && currentPrice <= resolvedChopBand.high),
            low: resolvedChopBand.low,
            high: resolvedChopBand.high,
            source: resolvedChopBand.source || 'js_snapshot'
        };
    } else if (snapshot && snapshot.chop && snapshot.chop.low != null && snapshot.chop.high != null) {
        resolvedChop = deepClonePayload(snapshot.chop);
    }
    return {
        pair:              pair,
        direction:         direction,
        regime:            regime,
        regime_source:     hasSnapshot ? 'JS_CANDLE_PARITY' : (providedRegime ? 'WP_BACKEND' : 'JS_CANDLE'),
        entry_source:      entrySource,
        entry_zone_label:  entryZone ? entryZone.fib  : null,
        entry_zone_price:  entryZone ? entryZone.price : null,
        entry_levels:      executionStagePlan ? deepClonePayload(executionStagePlan.entries) : null,
        sl_levels:         executionSlLevels.length ? deepClonePayload(executionSlLevels) : null,
        sl_rule:           executionSlRule,
        ede_stars:         sequenceBar.setup_quality != null ? Math.max(1, Math.min(5, Math.round(Number(sequenceBar.setup_quality) / 20))) : null,
        confluence_score:  sequenceBar.execution_quality != null ? Math.max(0, Math.min(5, Math.round(Number(sequenceBar.execution_quality) / 20))) : 0,
        sweep_confirmed:   !!(sequenceBar.confirmed_sweep_up || sequenceBar.confirmed_sweep_down),
        kz_active:         !!kz,
        kz_label:          kz ? kz.label : null,
        mss_confirmed:     !!(sequenceBar.mss_bullish || sequenceBar.mss_bearish),
        mss_price:         null,
        bos_type:          (sequenceBar.mss_bullish || sequenceBar.mss_bearish) ? 'BOS' : null,
        sequence_status:   sequenceStatus,
        signal_state:      signalState,
        fib_timeframe:     profile.fib_timeframe || profile.key || 'WEEKLY',
        setup_class:       setupClass,
        blocked_reason:    blockedReason,
        setup_quality:     sequenceBar.setup_quality != null ? Number(sequenceBar.setup_quality) : null,
        execution_quality: sequenceBar.execution_quality != null ? Number(sequenceBar.execution_quality) : null,
        rr_estimate:       sequenceBar.rr_estimate != null ? Number(sequenceBar.rr_estimate) : null,
        final_bias:        snapshot ? snapshot.final_bias : null,
        bull_bias_score:   snapshot ? snapshot.bull_bias_score : null,
        bear_bias_score:   snapshot ? snapshot.bear_bias_score : null,
        bull_pressure:     snapshot ? snapshot.bull_pressure : null,
        bear_pressure:     snapshot ? snapshot.bear_pressure : null,
        bias_profile:      snapshot ? snapshot.bias_profile : null,
        matrix:            snapshot ? deepClonePayload(snapshot.matrix) : null,
        matrix_tf:         snapshot ? snapshot.matrix_tf : null,
        pd_array:          snapshot ? deepClonePayload(snapshot.pd_array) : null,
        pd_tf:             snapshot ? snapshot.pd_tf : null,
        gate:              snapshot ? snapshot.gate : null,
        gate_reason:       snapshot ? snapshot.gate_reason : null,
        chop_band:         resolvedChopBand || (snapshot ? deepClonePayload(snapshot.chop_band) : null),
        chop:              resolvedChop,
        structure:         snapshot ? deepClonePayload(snapshot.structure) : null,
        htf_dol:           snapshot ? deepClonePayload(snapshot.htf_dol) : null,
        pressure_bias:     snapshot ? snapshot.pressure_bias : null,
        fib_disagreement_penalty: snapshot ? snapshot.fib_disagreement_penalty : null,
        blockers:          snapshot ? deepClonePayload(snapshot.blockers) || [] : [],
        fallback_reason:   fallbackReason,
        anchors:           normalizedAnchors,
        levels:            snapshot ? deepClonePayload(snapshot.levels) : null,
        updated_at:        snapshot ? snapshot.updated_at : null,
        generated_at:      Date.now(),
        freshness_ts:      sequenceBar.timeMs || Date.now(),
        source:            'JS_ENGINE'
    };
}
var computedSignals = {};
var signalEngineStatus = 'OFFLINE';
// Phase 2: execution-ready blueprints returned by /user/execute-signals
var tradeQueue = [];
// ── REPLACED fetchCandles() (4h interval, 100 bars) ──
async function fetchCandles(symbol, pair, apiKey) {
    if (typeof isTdProxyDeferred === 'function' && isTdProxyDeferred()) {
        if (DEBUG_TRACE) console.log('[ENGINE_TRACE:CANDLES_DEFERRED]', pair);
        var deferredErr = new Error('TD_DEFERRED');
        deferredErr.code = 'TD_DEFERRED';
        deferredErr.retry_after_seconds = getTdProxyRemainingSeconds();
        throw deferredErr;
    }
    var profile = getRuntimeProfile();
    var interval = profile.interval || profile.candleInterval || '4h';
    var outputSize = Number(profile.outputSize || profile.historyDepth || 140);
    var cacheKey = interval + '|' + outputSize;
    var cache = signalCandleCache[pair];
    var staleMs = resolveCandleStaleMs(interval);
    if (cache && cache.profileKey === cacheKey && (Date.now() - cache.fetchedAt) < staleMs) {
        if (DEBUG_TRACE) console.log('[ENGINE_TRACE:CANDLES_CACHE_HIT]', pair, {
          age_ms: Date.now() - cache.fetchedAt,
          symbol: cache.symbol || null
        });
        return cache.candles;
    }
    try {
        var candidates = buildMarketDataSymbolCandidates(pair, symbol);
        var seenCreditError = false;
        for (var idx = 0; idx < candidates.length; idx++) {
            var startedAt = Date.now();
            var data = null;
            try {
              data = await marketDataGet({
                kind: 'candles',
                symbol: candidates[idx],
                interval: interval,
                outputsize: outputSize
              });
            } catch (err) {
              if (parseMarketDataErrorKind(err) === 'rate_limited') {
                markTdProxyDeferred(extractRetryAfterSeconds(err));
                var rateLimitDeferredErr = new Error('TD_DEFERRED');
                rateLimitDeferredErr.code = 'TD_DEFERRED';
                rateLimitDeferredErr.retry_after_seconds = getTdProxyRemainingSeconds();
                throw rateLimitDeferredErr;
              }
              continue;
            }
            var durationMs = Date.now() - startedAt;
            if (data.status === 'error' || !data.values) {
                if (data && data.message) {
                    var msgLower = String(data.message).toLowerCase();
                    if (msgLower.indexOf('credits') !== -1) {
                        if (msgLower.indexOf('minute') !== -1 || msgLower.indexOf('per minute') !== -1) {
                            seenCreditError = seenCreditError || 'rate_limited';
                        } else if (seenCreditError !== 'rate_limited') {
                            seenCreditError = 'account_exhausted';
                        }
                    }
                }
                if (DEBUG_TRACE) console.log('[ENGINE_TRACE:CANDLE_CANDIDATE_FAIL]', pair, {
                  candidate: candidates[idx],
                  duration_ms: durationMs,
                  reason: (data && (data.message || data.status)) || 'empty_response'
                });
                continue;
            }
            var candles = data.values.map(function(v) {
                return {
                    datetime: v.datetime,
                    open:     parseFloat(v.open),
                    high:     parseFloat(v.high),
                    low:      parseFloat(v.low),
                    close:    parseFloat(v.close)
                };
            }).reverse();
            signalCandleCache[pair] = {
                candles: candles,
                fetchedAt: Date.now(),
                profileKey: cacheKey,
                symbol: candidates[idx]
            };
            lastSuccessfulMarketSymbolByPair[pair] = candidates[idx];
            PAIR_SYMBOLS[pair] = candidates[idx];
            if (DEBUG_TRACE) console.log('[ENGINE_TRACE:CANDLE_CANDIDATE_OK]', pair, {
              candidate: candidates[idx],
              duration_ms: durationMs,
              candles: candles.length
            });
            clearTdCreditsToastSuppression();
            return candles;
        }
        if (DEBUG_TRACE) console.log('[ENGINE_TRACE:CANDLES_FAIL]', pair, { reason: 'all_candidates_failed', candidates: candidates });
        if (seenCreditError) notifyTdCreditsExhausted(seenCreditError);
        return null;
    } catch(e) {
        if (e && e.code === 'TD_DEFERRED') throw e;
        console.warn('fetchCandles error for ' + pair + ':', e.message);
        return null;
    }
}

async function fetchDailyOpen(pair, symbol) {
    try {
    var todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
    var meta = savedDailyOpenMeta && savedDailyOpenMeta[pair] ? savedDailyOpenMeta[pair] : null;
    if (meta && meta.day_key === todayKey && meta.symbol === symbol && savedDailyOpens[pair] != null) {
      return Number(savedDailyOpens[pair]);
    }
        var data = await marketDataGet({
            kind: 'candles',
            symbol: symbol,
            interval: '1day',
            outputsize: 2  // Get last 2 days to ensure we have today's open
        });
        if (data.status === 'error' || !data.values || data.values.length < 1) {
            if (DEBUG_TRACE) console.log('[DAILY_OPEN_FAIL]', pair, { symbol: symbol, reason: 'no_data' });
            return null;
        }
        var todayCandle = data.values[0];  // Most recent candle
        var openPrice = parseFloat(todayCandle.open);
        if (isNaN(openPrice)) {
            if (DEBUG_TRACE) console.log('[DAILY_OPEN_FAIL]', pair, { symbol: symbol, reason: 'invalid_open' });
            return null;
        }
        if (DEBUG_TRACE) console.log('[DAILY_OPEN_OK]', pair, { symbol: symbol, open: openPrice });
        savedDailyOpenMeta[pair] = { day_key: todayKey, symbol: symbol, updated_at: new Date().toISOString() };
        return openPrice;
    } catch(e) {
        if (parseMarketDataErrorKind(e) === 'rate_limited') {
          markTdProxyDeferred(extractRetryAfterSeconds(e));
        }
        console.warn('fetchDailyOpen error for ' + pair + ':', e.message);
        return null;
    }
}

async function fetchDailyOpens() {
    if (!PAIRS || PAIRS.length === 0) return;
    if (fetchDailyOpens._pending) return fetchDailyOpens._pending;
    fetchDailyOpens._pending = (async function() {
        try {
            for (var i = 0; i < PAIRS.length; i++) {
                if (isTdProxyDeferred()) break;
                var pair = PAIRS[i];
                var preferredSymbol = lastSuccessfulMarketSymbolByPair[pair] || null;
                var candidates = buildMarketDataSymbolCandidates(pair, preferredSymbol);
                var openPrice = null;
                for (var ci = 0; ci < candidates.length; ci++) {
                    openPrice = await fetchDailyOpen(pair, candidates[ci]);
                    if (openPrice !== null) break;
                }
                if (openPrice !== null) {
                    savedDailyOpens[pair] = openPrice;
                }
            }
            lsSet('sn_daily_opens', savedDailyOpens);
            lsSet('sn_daily_open_meta', savedDailyOpenMeta);
            updatePriceDisplays();
        } finally {
            fetchDailyOpens._pending = null;
        }
    })();
    return fetchDailyOpens._pending;
}

function updateSignalEngineUI() {
    var navLabel = document.getElementById('signal-engine-status');
    var sideLabel = document.getElementById('eng-status-label');
    var sideDot = document.getElementById('eng-dot-engine');
    var navDot = document.getElementById('nav-engine-dot');

    // Derive effective engine status: LIVE requires at least one row that is live or waiting on recoverable chop data.
    // Missing chop stays row-level WAIT and must not make backend/live sync look globally stale.
    var effectiveStatus = signalEngineStatus;
    if(signalEngineStatus === 'LIVE' && Array.isArray(PAIRS) && PAIRS.length > 0) {
      var hasAnyRunnableRow = PAIRS.some(function(pair){
        var ctx = buildPairStateContext(pair);
        return ctx.readiness_tier === 'LIVE' || ctx.readiness_tier === 'WAIT';
      });
      if(!hasAnyRunnableRow) effectiveStatus = 'NOT_READY';
    }

    var map = {
        'OFFLINE':   { text: 'OFFLINE',      color: 'var(--mu)', dotClass: 'off',  navClass: 'error' },
        'COMPUTING': { text: 'COMPUTING...', color: 'var(--am)', dotClass: 'warn', navClass: 'warn'  },
        'SYNCING':   { text: 'SYNCING...',   color: 'var(--am)', dotClass: 'warn', navClass: 'warn'  },
        'LIVE':      { text: 'LIVE',         color: 'var(--gr)', dotClass: 'live', navClass: 'live'  },
        'STALE':     { text: 'STALE',        color: 'var(--re)', dotClass: 'warn', navClass: 'error' },
        'NOT_READY': { text: 'NOT READY',    color: 'var(--am)', dotClass: 'warn', navClass: 'warn'  }
    };
    var state = map[effectiveStatus] || map['OFFLINE'];
    if (navLabel) {
        navLabel.textContent = state.text;
        navLabel.style.color = state.color;
        navLabel.classList.remove('live', 'warn', 'error');
        navLabel.classList.add(state.navClass);
    }
    if (sideLabel) {
        sideLabel.textContent = state.text;
        sideLabel.style.color = state.color;
        if (effectiveStatus === 'LIVE' || effectiveStatus === 'SYNCED') sideLabel.classList.add('live-pulse-text');
        else sideLabel.classList.remove('live-pulse-text');
    }
    if (sideDot) {
        sideDot.classList.remove('on', 'warn', 'off');
        sideDot.classList.add(state.dotClass === 'live' ? 'on' : state.dotClass);
    }
    if (navDot) {
        navDot.classList.remove('live', 'warn', 'off');
        navDot.classList.add(state.dotClass);
    }
}
function formatFreshnessAgo(ts) {
    if (!ts) return 'no update';
    var ms = Date.now() - Number(ts);
    if (!isFinite(ms) || ms < 0) ms = 0;
    var mins = Math.floor(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
}
function provenanceTag(source) {
    var src = String(source || 'JS_ENGINE').toUpperCase();
    var color = src === 'BACKEND_BLUEPRINT' ? 'var(--gr)' :
                src === 'HYBRID_RUNTIME'    ? 'var(--ac)' :
                src === 'JS_ONLY'           ? 'var(--am)' : 'var(--mu)';
    return '<span class="pgy pill" style="color:' + color + '">' + src.replace(/_/g,' ') + '</span>';
}
function renderComputedSignalCards() {
    var el = document.getElementById('computed-signal-cards');
    if (!el) return;
    var hasSigs = Object.keys(computedSignals).some(function(k){ return computedSignals[k] !== null; });
    if (!hasSigs) {
        var emptyMsg = MARKET_DATA_KEY_MISSING
          ? 'Market data unavailable: add or verify the Twelve Data API key in WordPress admin settings.'
          : 'No computed signals above threshold yet - waiting for candle data.';
        el.innerHTML = '<div style="color:var(--mu);font-family:var(--mo);font-size:11px;padding:12px">' + emptyMsg + '</div>';
        return;
    }
    var freshestTs = PAIRS.map(function(pair){ var sig = computedSignals[pair]; return sig ? (sig.freshness_ts || sig.generated_at) : null; }).filter(Boolean).sort(function(a,b){ return b-a; })[0] || Date.now();
    var metaLine = 'Updated: ' + formatFreshnessAgo(freshestTs);
    var cards = PAIRS.map(function(pair) {
        var sig = computedSignals[pair];
        if (!sig) return '<div class="card" style="opacity:.5"><div class="clbl">' + pair + '</div><div style="font-family:var(--mo);font-size:11px;color:var(--mu);margin-top:6px">No signal</div></div>';
        var dirClass = sig.direction === 'BUY' ? 'pg2' : 'pr2';
        var regClass = sig.regime === 'TREND UP' ? 'rup' : sig.regime === 'TREND DOWN' ? 'rdn' : sig.regime === 'REVERSAL ZONE' ? 'rrv' : 'rrg';
        var stateClass = sig.signal_state === 'ACTIVE' ? 'gb' : '';
        var freshness = formatFreshnessAgo(sig.freshness_ts || sig.generated_at);
        return '<div class="card ' + stateClass + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<div class="clbl" style="margin:0">' + pair + '</div>' +
          '<div style="display:flex;gap:6px;align-items:center">' + provenanceTag(sig.source || 'JS_ENGINE') + '<span class="' + dirClass + ' pill">' + sig.direction + '</span></div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">' +
          '<span class="' + regClass + '">' + sig.regime + '</span>' +
          (sig.kz_active ? '<span class="pac pill">' + sig.kz_label + '</span>' : '<span class="pgy pill">Outside KZ</span>') +
          '</div>' +
          '<div class="kv"><span class="kvl">Score</span><span class="kvv">' + sig.confluence_score + '/5</span></div>' +
          '<div class="kv"><span class="kvl">EDE Stars</span><span class="kvv">' + (sig.ede_stars !== null ? sig.ede_stars + '*' : '-') + '</span></div>' +
          '<div class="kv"><span class="kvl">Sweep</span><span class="kvv">' + (sig.sweep_confirmed ? 'OK' : '-') + '</span></div>' +
          '<div class="kv"><span class="kvl">Sequence</span><span class="kvv ' + (sig.sequence_status === 'READY' ? 'pos' : 'wrn') + '">' + (sig.sequence_status || '-') + '</span></div>' +
          '<div class="kv"><span class="kvl">State</span><span class="kvv ' + (sig.signal_state === 'ACTIVE' ? 'pos' : 'wrn') + '">' + sig.signal_state + '</span></div>' +
          (sig.setup_class === 'BLOCKED' ? '<div style="margin-top:8px;font-size:11px;color:var(--am)">Blocked: ' + (sig.blocked_reason || 'unknown reason') + '</div>' : '') +
          '<div style="margin-top:8px;font-size:10px;color:var(--mu)">Freshness: ' + freshness + '</div>' +
          '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">' +
            '<button class="btn btg bts" onclick="openComputedSignalChart(\'' + pair + '\')">Open Chart</button>' +
            (sig.sequence_status === 'READY'
              ? '<button class="btn bta bts" onclick="selectPairForPlan(\'' + pair + '\')">Generate Plan -></button>'
              : '<span style="font-family:var(--mo);font-size:10px;color:var(--mu)">' + sig.sequence_status + ' - awaiting confirmation</span>') +
          '</div>' +
          '</div>';
    }).join('');
    el.innerHTML = '<div style="font-size:10px;color:var(--mu);font-family:var(--mo);margin-bottom:8px">' + metaLine + '</div><div class="g3">' + cards + '</div>';
    renderChartContextPanel();
}
function selectPairForPlan(pair) {
    xtab('plan');
    var pId = pair.replace('/', '');
    var el = document.getElementById('ppb-' + pId);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.outline = '2px solid var(--ac)'; setTimeout(function(){ el.style.outline = ''; }, 2000); }
}

// ── PHASE 2: EXECUTION ENGINE INTEGRATION ────────────────────────────────────

/**
 * POST computed READY signals to /user/execute-signals.
 * The PHP execution engine applies the user's live equity/risk profile and
 * returns execution-ready blueprints with lot sizes, SL pips, and R:R.
 * Results are stored server-side in sn_trade_queue and rendered on-screen.
 */
function buildExecutionSignalIdentity(payload) {
    var pair = String(payload.pair || '').replace(/[^A-Z/]/g, '');
    var direction = String(payload.direction || '').toUpperCase();
    var zonePrice = payload.entry_zone_price != null ? Number(payload.entry_zone_price).toFixed(pair.indexOf('JPY') > -1 ? 2 : 5) : '0';
    var sl = payload.sl != null ? Number(payload.sl).toFixed(pair.indexOf('JPY') > -1 ? 2 : 5) : '0';
    var tp1 = payload.tp1 != null ? Number(payload.tp1).toFixed(pair.indexOf('JPY') > -1 ? 2 : 5) : '0';
    var tp2 = payload.tp2 != null ? Number(payload.tp2).toFixed(pair.indexOf('JPY') > -1 ? 2 : 5) : '0';
    var regime = String(payload.regime || '').toUpperCase().replace(/\s+/g, '_');
    var base = [pair, direction, zonePrice, sl, tp1, tp2, regime].join('|');
    return {
        signal_id: pair.replace('/', '') + '_' + direction + '_' + zonePrice.replace('.', ''),
        signal_hash: base
    };
}
function deepCloneSignalPayload(value) {
    if (value == null) return null;
    try { return JSON.parse(JSON.stringify(value)); } catch (e) { return null; }
}

async function postExecuteSignals(signalResults) {
    if (!USER_SYNC.authenticated) return;
    var profile = getRuntimeProfile();

    var signals = [];
    Object.keys(signalResults).forEach(function(pair) {
        var sig = signalResults[pair];
        if (!sig || sig.sequence_status !== 'READY') return;
        var payload = {
            pair:             pair,
            direction:        sig.direction,
            regime:           sig.regime || savedRegimes[pair] || null,
            sequence_status:  sig.sequence_status,
            signal_state:     sig.signal_state || 'PENDING',
            entry_source:     sig.entry_source || null,
            entry_zone_price: sig.entry_zone_price,
            entry_zone_label: sig.entry_zone_label || '',
            entry_levels:     Array.isArray(sig.entry_levels) ? deepCloneSignalPayload(sig.entry_levels) : null,
            sl_levels:        Array.isArray(sig.sl_levels) ? deepCloneSignalPayload(sig.sl_levels) : null,
            sl_rule:          sig.sl_rule || null,
            fallback_reason:  sig.fallback_reason || null,
            market_price:     savedPrices[pair] || 0,
            confluence_score: sig.confluence_score || 0,
            ede_stars:        sig.ede_stars != null ? sig.ede_stars : null,
            sweep_confirmed:  sig.sweep_confirmed || false,
            mss_confirmed:    sig.mss_confirmed || false,
            kz_active:        sig.kz_active || false,
            kz_label:         sig.kz_label || null,
            tp1: null,
            tp2: null,
            sl:  null,
            fib_timeframe:    profile.fib_timeframe || profile.key || 'WEEKLY',
            signal_schema_version: SIGNAL_SCHEMA.version,
            engine_version: SIGNAL_SCHEMA.engine,
            final_bias:       sig.final_bias || null,
            matrix:           sig.matrix || null,
            pd_array:         sig.pd_array || null,
            gate:             sig.gate || null,
            gate_reason:      sig.gate_reason || null,
            chop_band:        sig.chop_band || null,
            bull_bias_score:  sig.bull_bias_score != null ? sig.bull_bias_score : null,
            bear_bias_score:  sig.bear_bias_score != null ? sig.bear_bias_score : null
        };
        var identity = buildExecutionSignalIdentity(payload);
        payload.signal_id = identity.signal_id;
        payload.signal_hash = identity.signal_hash;
        signals.push(payload);
    });

    if (!signals.length) return;

    try {
        var resp = await fetch(API.BASE + 'user/execute-signals', {
            method:      'POST',
            headers:     apiPostHeaders(),
            credentials: 'include',
            body:        JSON.stringify({
                signals: signals,
                zar_rate: ZAR,
                fib_timeframe: profile.fib_timeframe || profile.key || 'WEEKLY'
            }),
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        if (data.blueprints && data.blueprints.length) {
            tradeQueue = data.blueprints;
            renderTradeQueue();
            xtoast('OK ' + data.blueprints.length + ' blueprint' + (data.blueprints.length > 1 ? 's' : '') + ' calculated - Trade Queue updated', 'ok');
        }
    } catch(e) {
        console.warn('postExecuteSignals failed:', e.message);
    }
}

function updateTradeQueueBadge() {
    var badge = document.getElementById('tab-plan-badge');
    if (!badge) return;
    var readyCount = (tradeQueue || []).filter(function(bp) {
        return bp && (!bp.status || bp.status === 'READY');
    }).length;
    if (readyCount > 0) {
        badge.textContent = readyCount;
        badge.style.display = '';
    } else {
        badge.textContent = '';
        badge.style.display = 'none';
    }
}

function cleanDisplayText(value) {
    if (value == null) return '--';
    var text = String(value);
    text = text.replace(/&middot;|&#183;/g, ' | ')
        .replace(/[•·]/g, ' | ')
        .replace(/[Â]+/g, ' ')
        .replace(/(?:Ã.|â€¦|â€”|â€“|â€|Æ’|¢â€šÂ¬|ƒ)/g, ' ')
        .replace(/\s*\|\s*\|\s*/g, ' | ')
        .replace(/\s{2,}/g, ' ')
        .trim();

    if (/[ÃâÂÆƒ]/.test(text)) {
        var efTokens = text.match(/EF\s*\d+%|EF\s*Range|Premium|Discount|Range/gi);
        if (efTokens && efTokens.length) {
            text = efTokens.filter(function(token, index, arr) {
                return arr.indexOf(token) === index;
            }).join(' | ');
        } else {
            text = text.replace(/[ÃâÂÆƒ][^\s|]*/g, '').replace(/\s{2,}/g, ' ').trim();
        }
    }

    return text || '--';
}

function riskNumOrNull(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
}
function riskFmtNum(v, dp, fallback) {
    var n = riskNumOrNull(v);
    return n == null ? (fallback == null ? '&mdash;' : fallback) : n.toFixed(dp);
}
function riskPickNum(obj, keys) {
    if (!obj || !keys || !keys.length) return null;
    for (var i = 0; i < keys.length; i++) {
        var n = riskNumOrNull(obj[keys[i]]);
        if (n != null) return n;
    }
    return null;
}

function renderServerBlueprintPlan(context, blueprints) {
    if (!blueprints || !blueprints.length) return false;

    var planOutput = document.getElementById('plan-output');
    var verdictEl = document.getElementById('plan-verdict');
    var checklistEl = document.getElementById('plan-checklist');
    var laddersEl = document.getElementById('plan-ladders');
    var riskEl = document.getElementById('plan-risk');
    var gatesEl = document.getElementById('plan-gates');
    if (!planOutput || !verdictEl || !checklistEl || !laddersEl || !riskEl) return false;

    var ddWarnings = blueprints.filter(function(bp) { return !!bp.dd_warning; });
    var totalRisk = blueprints.reduce(function(sum, bp) {
        return sum + (Number(bp.total_risk_usc) || 0);
    }, 0);
    var equity = blueprints[0] && blueprints[0].equity_at_calc ? Number(blueprints[0].equity_at_calc) : (context.equity || 0);
    var riskPct = equity > 0 ? ((totalRisk / equity) * 100).toFixed(1) : '--';
    var ddBanner = '';
    if (ddWarnings.length) {
        ddBanner = '<div class="alert ared" style="margin-bottom:10px"><div>!</div><div><strong>Drawdown warning.</strong> ' +
            ddWarnings.length + ' blueprint' + (ddWarnings.length > 1 ? 's carry' : ' carries') + ' backend DD warnings. Review before execution.</div></div>';
    }

    planOutput.style.display = 'block';
    verdictEl.innerHTML =
        (context.staleHtml || '') +
        ddBanner +
        '<div class="verdict-box ' + context.verdictClass + '">' +
        '<div class="verdict-lbl" style="color:' + (context.verdict.indexOf('EXECUTE') === 0 ? 'var(--gr)' : context.verdict.indexOf('NO') === 0 ? 'var(--re)' : 'var(--am)') + '">' + context.verdict + '</div>' +
        '<div class="verdict-body">' + context.verdictBody + '<br><span style="color:var(--ac)">' + provenanceTag('BACKEND_BLUEPRINT') + ' Live plan</span></div></div>';
    checklistEl.innerHTML = renderChecklist(context.checklist || []);

    laddersEl.innerHTML = blueprints.map(function(bp) {
        var pair = bp.pair || 'Unknown';
        var isJPY = pair.indexOf('JPY') > -1;
        var dp = isJPY ? 2 : 5;
        var dirColor = bp.direction === 'SELL' ? 'var(--re)' : 'var(--gr)';
        var dirCls = bp.direction === 'SELL' ? 'pr2' : 'pg2';
        var regCls = bp.regime === 'TREND DOWN' ? 'rdn' : bp.regime === 'TREND UP' ? 'rup' : bp.regime === 'REVERSAL ZONE' ? 'rrv' : 'rrg';
        var rb = bp.risk_breakdown || {};
        var zoneLabel = cleanDisplayText(bp.zone_label || 'SERVER');
        var stageLabels = ['E1', 'E2', 'E3'];
        var validationBadges = renderUiValidationBadges(pair, bp.entry_source, bp.fallback_reason, null);
        var metaSummary = renderUiMetaSummary(bp.entry_source, bp.sl_rule, bp.fallback_reason);
        var stageRows = '<div class="entry-row">' +
            '<div class="entry-head entry-cell">#</div>' +
            ['Entry','SL','TP1','TP2','Lots','SL Pips','Risk USC','Risk ZAR','R:R'].map(function(h){ return '<div class="entry-head entry-cell">' + h + '</div>'; }).join('') +
            '</div>';

        (bp.entries || []).forEach(function(entry, i) {
            var stage = rb.stages && rb.stages[i] ? rb.stages[i] : null;
            var stageRiskUsc = riskPickNum(stage, ['riskUsc','riskUSC','risk_usc','riskAmount','risk_amount']);
            var stageRiskZar = riskPickNum(stage, ['riskZar','riskZAR','risk_zar']);
            var stageMeta = getBlueprintStageMeta(bp, i);
            var stageSl = stage && stage.sl != null ? stage.sl : (bp.stage_sls && bp.stage_sls[i] != null ? bp.stage_sls[i] : bp.sl);
            var stageLabelBits = [];
            if (stageMeta.entryLabel) stageLabelBits.push(stageMeta.entryLabel);
            if (stageMeta.entrySource) stageLabelBits.push(stageMeta.entrySource);
            var stageSlBits = [];
            if (stageMeta.slRule) stageSlBits.push(stageMeta.slRule);
            if (stageMeta.slLabel) stageSlBits.push(stageMeta.slLabel);
            stageRows += '<div class="entry-row">' +
                '<div class="entry-cell" style="color:var(--mu)">' + (stageLabels[i] || (i + 1)) + '</div>' +
                '<div class="entry-cell mn">' + (entry != null ? Number(entry).toFixed(dp) : '--') + (stageLabelBits.length ? '<div style="font-size:10px;color:var(--mu)">' + cleanDisplayText(stageLabelBits.join(' · ')) + '</div>' : '') + '</div>' +
                '<div class="entry-cell mn neg">' + (stageSl != null ? Number(stageSl).toFixed(dp) : '--') + (stageSlBits.length ? '<div style="font-size:10px;color:var(--mu)">' + cleanDisplayText(stageSlBits.join(' · ')) + '</div>' : '') + '</div>' +
                '<div class="entry-cell mn pos">' + (bp.tp1 != null ? Number(bp.tp1).toFixed(dp) : '--') + '</div>' +
                '<div class="entry-cell mn">' + (bp.tp2 != null ? Number(bp.tp2).toFixed(dp) : '--') + '</div>' +
                '<div class="entry-cell mn">' + (stage ? (stage.lot === 0 ? 'TOO SMALL' : Number(stage.lot).toFixed(2)) : '--') + '</div>' +
                '<div class="entry-cell mn">' + (stage ? stage.sl_pips : '--') + '</div>' +
                '<div class="entry-cell mn wrn">' + (stageRiskUsc == null ? '--' : riskFmtNum(stageRiskUsc, 2, '--')) + '</div>' +
                '<div class="entry-cell mn">' + (stageRiskZar == null ? '--' : ('R' + riskFmtNum(stageRiskZar, 2, '--'))) + '</div>' +
                '<div class="entry-cell mn" style="color:' + ((bp.rr1 || 0) >= 2 ? 'var(--gr)' : (bp.rr1 || 0) >= 1.5 ? 'var(--am)' : 'var(--re)') + ';font-weight:700">' + (bp.rr1 != null ? ('1:' + Number(bp.rr1).toFixed(2)) : '--') + '</div>' +
            '</div>';
        });

        return '<div class="ladder-table">' +
            '<div class="ladder-header">' +
                '<div>' +
                    '<span class="ladder-title" style="color:' + dirColor + '">' + pair + ' ' + (bp.direction || 'UNKNOWN') + ' BLUEPRINT</span>' +
                    '&nbsp;&nbsp;' + provenanceTag(bp.provenance || bp.source || 'BACKEND_BLUEPRINT') +
                    '&nbsp;&nbsp;<span class="' + dirCls + ' pill">' + (bp.direction || 'UNKNOWN') + '</span>' +
                    '&nbsp;&nbsp;<span class="' + regCls + '">' + (bp.regime || '--') + '</span>' +
                    '&nbsp;&nbsp;<span class="pgy pill">' + zoneLabel + '</span>' +
                '</div>' +
                '<div class="ladder-meta">' +
                    'Zone: ' + (bp.zone_price != null ? Number(bp.zone_price).toFixed(dp) : '--') +
                    ' &nbsp;|&nbsp; Market: ' + (bp.market_price != null ? Number(bp.market_price).toFixed(dp) : '--') +
                    ' &nbsp;|&nbsp; Total risk: ' + (riskPickNum(bp, ['totalRiskUsc','totalRiskUSC','total_risk_usc','totalRiskAmount','total_risk_amount']) != null ? riskFmtNum(riskPickNum(bp, ['totalRiskUsc','totalRiskUSC','total_risk_usc','totalRiskAmount','total_risk_amount']), 2, '--') : '--') + ' USC' +
                    ' &nbsp;|&nbsp; R:R: ' + (bp.rr1 != null ? ('1:' + Number(bp.rr1).toFixed(2)) : '--') +
                    '</div>' +
                '</div>' +
                '<div style="padding:10px 14px 0">' + metaSummary + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' + validationBadges + '</div></div>' +
            stageRows +
            ((bp.setup_class || '') === 'BLOCKED' ? '<div style="margin:8px 14px 0;font-size:11px;color:var(--am)">Blocked: ' + (bp.blocked_reason || 'unknown reason') + '</div>' : '') +
            (rb.available ? '<div style="background:var(--bg3);border-top:1px solid var(--bd2);padding:12px 14px;font-family:var(--mo);font-size:12px">Total if all filled: <span style="color:var(--am)">' + riskFmtNum(riskPickNum(rb, ['totalRiskUsc','totalRiskUSC','total_risk_usc','totalRiskAmount','total_risk_amount']), 2, '--') + ' USC</span> / <span>' + (riskPickNum(rb, ['totalRiskZar','totalRiskZAR','total_risk_zar']) == null ? '--' : ('R' + riskFmtNum(riskPickNum(rb, ['totalRiskZar','totalRiskZAR','total_risk_zar']), 2, '--'))) + '</span> &nbsp;|&nbsp; DD Impact: <span style="color:' + (rb.dd_warning ? 'var(--re)' : 'var(--gr)') + '">' + riskFmtNum(riskPickNum(rb, ['ddImpactPct','ddImpact','dd_impact_pct']), 2, '--') + '%</span></div>' : '') +
            (bp.dd_warning ? '<div style="margin:10px 14px 14px;padding:8px 12px;background:rgba(245,65,79,.08);border:1px solid rgba(245,65,79,.3);border-radius:4px;font-size:12px;color:var(--re)">' + bp.dd_warning_msg + '</div>' : '') +
        '</div>';
    }).join('');

    riskEl.innerHTML =
        '<div class="card gb"><div class="clbl">Blueprints</div><div class="cval" style="color:var(--ac)">' + blueprints.length + '</div><div class="csub">Backend-authoritative plans</div></div>' +
        '<div class="card"><div class="clbl">Total Max Risk</div><div class="cval wrn">' + totalRisk.toFixed(2) + '</div><div class="csub">USC / R' + (totalRisk * ZAR).toFixed(2) + ' / ' + riskPct + '% equity</div></div>' +
        '<div class="card"><div class="clbl">Equity Used</div><div class="cval pos">' + (equity ? equity.toLocaleString() : '--') + '</div><div class="csub">USC at blueprint calc</div></div>' +
        '<div class="card"><div class="clbl">Queue Status</div><div class="cval" style="color:var(--bl)">' + ((tradeQueue || []).length) + '</div><div class="csub">Stored trade queue items</div></div>';

    if (gatesEl) {
      var gateRowsArr = context.gateResults || [];
      if (gateRowsArr.length) {
        gatesEl.innerHTML = gateRowsArr.map(function(gr) {
          var runtimeTruth = gr.runtimeTruth || resolvePairRuntimeSignal(gr.pair);
          var resolvedRegime = runtimeTruth.regime || gr.regime;
          var regCls = resolvedRegime === 'TREND DOWN' ? 'rdn' : resolvedRegime === 'TREND UP' ? 'rup' : resolvedRegime === 'REVERSAL ZONE' ? 'rrv' : 'rrg';
          var isJPY = gr.pair.indexOf('JPY') > -1;
          var dp = isJPY ? 2 : 5;
          var zoneStr = gr.bestZone ? (gr.bestZone.pct + ' @ ' + gr.bestZone.price.toFixed(dp)) : 'None';
          var distStr = gr.bestZone ? gr.bestDist.toFixed(0) + 'p' : '--';
          var ch = (runtimeTruth.chop_band && runtimeTruth.chop_band.low != null && runtimeTruth.chop_band.high != null)
            ? { lo: runtimeTruth.chop_band.low, hi: runtimeTruth.chop_band.high }
            : getChopBand(gr.pair);
          var chopStr = ch ? ((gr.mkt >= ch.lo && gr.mkt <= ch.hi) ? '<span class="pr2 pill">IN CHOP</span>' : '<span class="pg2 pill">Clear</span>') : '<span class="pgy pill">N/A</span>';
          var gateStateSrc = gr.gateState || (gr.gatePass ? 'OPEN' : 'BLOCKED');
          var qualReason = gr.qualificationReason || '';
          var qualState = gr.qualificationState || (gr.gatePass ? 'PASS' : 'FAIL');
          var gateStateColor = gateStateSrc === 'OPEN' ? 'var(--gr)' : gateStateSrc === 'BLOCKED' ? 'var(--re)' : 'var(--mu)';
          var gateStatePill = '<span class="pgy pill" style="color:' + gateStateColor + '">' + gateStateSrc + '</span>';
          var qualPill = '';
          if(qualState === 'PASS'){
            qualPill = ' <span class="pg2 pill">PASS</span>';
          } else if(qualReason){
            qualPill = ' <span class="pr2 pill">' + qualReason + '</span>';
          }
          var rowClass = qualState === 'PASS' ? 'rg' : (gateStateSrc === 'OPEN' ? '' : 'rr');
          return '<tr class="' + rowClass + '">' +
            '<td class="mn"><strong>' + gr.pair + '</strong></td>' +
            '<td><span class="' + regCls + '">' + (resolvedRegime || 'NO DATA') + '</span></td>' +
            '<td class="mn">' + (gr.mkt != null ? gr.mkt.toFixed(dp) : '--') + '</td>' +
            '<td class="mn" style="color:' + (gr.targetSide === 'PREMIUM' ? 'var(--re)' : 'var(--gr)') + '">' +
              gr.targetSide + (gr.storedGate ? ' <span class="pgy pill" style="font-size:9px">' + gr.storedGate + '</span>' : '') +
            '</td>' +
            '<td class="mn wrn">' + zoneStr + '</td>' +
            '<td class="mn">' + distStr + '</td>' +
            '<td>' + chopStr + '</td>' +
            '<td>' + gateStatePill + qualPill + '</td>' +
            '<td class="mn">' + (gr.zoneStars != null ? gr.zoneStars + ' star' : '--') + '</td>' +
            '<td class="mn" title="' + (gr.edeLabel || 'EDE (SF)') + '">' + (gr.edeDistance != null ? gr.edeDistance.toFixed(3) : '--') + '</td>' +
            '</tr>';
        }).join('');
      } else {
        gatesEl.innerHTML = '';
      }
    }

    window._lastPlan = {
        ladders: context.ladders || [],
        blueprints: blueprints,
        checklist: context.checklist || [],
        verdict: context.verdict,
        gateResults: context.gateResults || [],
        equity: equity,
        day: context.day,
        ts: context.ts,
        prices: context.prices || {},
        regimes: context.regimes || {},
        source: 'server_blueprints'
    };
    return true;
}

function renderChecklist(checklist) {
    return (checklist || []).map(function(ci) {
        var typeClass = {
            cancel: 'ci-cancel',
            add: 'ci-add',
            place: 'ci-place',
            tighten: 'ci-tighten',
            note: 'ci-note',
            review: 'ci-add',
            done: 'ci-done'
        }[ci.type] || 'ci-note';
        var icon = {
            cancel: '&times;',
            add: '+',
            place: '&#9658;',
            tighten: '&uarr;',
            note: '&bull;',
            review: '+',
            done: '&#10003;'
        }[ci.type] || '-';
        return '<div class="checklist-item ' + typeClass + '">' +
            '<div class="ci-num">' + icon + '</div>' +
            '<div class="ci-body"><strong>' + (ci.type === 'cancel' ? '<span style="color:var(--re)">' : ci.type === 'place' ? '<span style="color:var(--gr)">' : ci.type === 'add' || ci.type === 'review' ? '<span style="color:var(--am)">' : ci.type === 'done' ? '<span style="color:var(--bl)">' : '<span>') + ci.title + '</span></strong><span>' + ci.body + '</span></div></div>';
    }).join('');
}
function hasValidFibAnchor(anchor) {
    return !!(anchor && anchor.high != null && anchor.low != null && isFinite(Number(anchor.high)) && isFinite(Number(anchor.low)));
}
function getUiSnapshotForPair(pair) {
    if (!pair) return null;
    if (computedSnapshots && computedSnapshots[pair]) return computedSnapshots[pair];
    var compact = String(pair).replace('/', '');
    if (computedSnapshots && computedSnapshots[compact]) return computedSnapshots[compact];
    return null;
}
function renderUiValidationBadges(pair, entrySource, fallbackReason, anchorsOverride) {
    var snapshot = getUiSnapshotForPair(pair);
    var anchors = anchorsOverride || (snapshot && snapshot.anchors ? snapshot.anchors : null) || {};
    var badges = [];
    var efCls = entrySource === 'EF' ? 'pg2' : (fallbackReason ? 'pr2' : 'pgy');
    var efText = entrySource === 'EF' ? 'EF OK' : (fallbackReason ? 'EF FALLBACK' : 'EF N/A');
    badges.push('<span class="' + efCls + ' pill">' + efText + '</span>');
    [['f1', 'F1'], ['f2', 'F2'], ['f3', 'F3']].forEach(function(row) {
        var ok = hasValidFibAnchor(anchors[row[0]]);
        badges.push('<span class="' + (ok ? 'pg2' : 'pgy') + ' pill">' + row[1] + ' ' + (ok ? 'OK' : 'PENDING') + '</span>');
    });
    return badges.join(' ');
}
function renderUiMetaSummary(entrySource, slRule, fallbackReason) {
    var parts = [
        '<span class="kvl">Entry Source</span><span class="kvv">' + cleanDisplayText(entrySource || 'FIB') + '</span>',
        '<span class="kvl">SL Rule</span><span class="kvv">' + cleanDisplayText(slRule || 'LEGACY_NEXT_LEVEL') + '</span>'
    ];
    if (fallbackReason) {
        parts.push('<span class="kvl">Fallback</span><span class="kvv wrn">' + cleanDisplayText(fallbackReason) + '</span>');
    }
    var html = '';
    for (var i = 0; i < parts.length; i += 2) {
        html += '<div class="kv">' + parts[i] + parts[i + 1] + '</div>';
    }
    return html;
}
function getBlueprintStageMeta(bp, index) {
    var entryMeta = bp && Array.isArray(bp.entry_levels) ? bp.entry_levels[index] : null;
    var slMeta = bp && Array.isArray(bp.sl_levels) ? bp.sl_levels[index] : null;
    return {
        entryLabel: entryMeta && entryMeta.label ? entryMeta.label : null,
        entrySource: entryMeta && entryMeta.source ? entryMeta.source : null,
        slRule: slMeta && slMeta.rule ? slMeta.rule : (bp && bp.sl_rule ? bp.sl_rule : null),
        slLabel: slMeta && slMeta.level_label ? slMeta.level_label : null
    };
}

/**
 * Render the trade queue panel inside the Signal Plan tab.
 * Shows execution-ready blueprints with lot sizes, risk, and R:R — all
 * calculated by the PHP engine against the user's live account equity.
 */
function renderTradeQueue() {
    var el = document.getElementById('trade-queue-section');
    if (!el) return;
    updateTradeQueueBadge();

    if (!tradeQueue || !tradeQueue.length) {
        el.innerHTML = '<div style="color:var(--mu);font-family:var(--mo);font-size:11px;padding:14px">' +
            'No execution blueprints yet - signal engine will populate this when READY signals are detected.</div>';
        return;
    }

    var equity = acct && acct.equity ? acct.equity : null;
    var equityNote = equity
        ? '<span style="color:var(--ac)">Equity: ' + equity.toLocaleString() + ' USC</span>'
        : '<span style="color:var(--re)">Upload broker report to see lot sizes</span>';

    var cards = tradeQueue.map(function(bp) {
        var dirColor  = bp.direction === 'BUY' ? 'var(--gr)' : 'var(--re)';
        var dirCls    = bp.direction === 'BUY' ? 'pg2' : 'pr2';
        var regCls    = bp.regime === 'TREND UP' ? 'rup' : bp.regime === 'TREND DOWN' ? 'rdn' : bp.regime === 'REVERSAL ZONE' ? 'rrv' : 'rrg';
        var stateCls  = bp.signal_state === 'ACTIVE' ? 'gb ab' : '';
        var pair      = bp.pair || 'Unknown';
        var isJPY     = pair.indexOf('JPY') > -1;
        var dp        = isJPY ? 2 : 5;
        var rb        = bp.risk_breakdown || {};
        var zoneLabel = cleanDisplayText(bp.zone_label || '--');
        var stageLabels = ['E1 Shallow', 'E2 Mid', 'E3 Deep'];
        var validationBadges = renderUiValidationBadges(pair, bp.entry_source, bp.fallback_reason, null);
        var metaSummary = renderUiMetaSummary(bp.entry_source, bp.sl_rule, bp.fallback_reason);

        var stageRows = '';
        if (rb.available && rb.stages) {
            rb.stages.forEach(function(s, i) {
                if (!s.entry) return;
                var lot = riskPickNum(s, ['lot','lots']);
                var riskUsc = riskPickNum(s, ['riskUsc','riskUSC','risk_usc','riskAmount','risk_amount']);
                var lotColor = lot === 0 ? 'var(--re)' : 'var(--gr)';
                var stageMeta = getBlueprintStageMeta(bp, i);
                var stageDetail = [];
                if (stageMeta.entryLabel) stageDetail.push(stageMeta.entryLabel);
                if (stageMeta.slRule) stageDetail.push(stageMeta.slRule);
                if (stageMeta.slLabel) stageDetail.push(stageMeta.slLabel);
                stageRows += '<div class="kv">' +
                    '<span class="kvl">' + stageLabels[i] + ' @ ' + riskFmtNum(s.entry, dp, '--') + '</span>' +
                    '<span class="kvv"><span style="color:' + lotColor + '">' + (lot === 0 ? 'TOO SMALL' : riskFmtNum(lot, 2, '--') + ' lots') + '</span>' +
                    ' &middot; ' + s.sl_pips + 'p &middot; ' +
                    '<span style="color:var(--am)">' + (riskUsc == null ? '--' : riskFmtNum(riskUsc, 2, '--')) + ' USC</span>' +
                    (stageDetail.length ? ' &middot; <span style="color:var(--mu)">' + cleanDisplayText(stageDetail.join(' · ')) + '</span>' : '') +
                    '</span></div>';
            });
        } else {
            stageRows = '<div style="color:var(--mu);font-size:11px;padding:4px 0">' + (rb.reason || 'Upload broker report for lot sizing') + '</div>';
        }

        var rrStr  = bp.rr1 ? '1:' + bp.rr1.toFixed(2) : '--';
        var rrColor = bp.rr1 >= 2.5 ? 'var(--gr)' : bp.rr1 >= 2.0 ? 'var(--am)' : 'var(--re)';
        var genTime = bp.generated_at
            ? new Date(bp.generated_at).toLocaleTimeString('en-ZA', {timeZone:'Africa/Johannesburg',hour:'2-digit',minute:'2-digit'})
            : '--';
        var bpSource = bp.provenance || bp.source || 'BACKEND_BLUEPRINT';

        return '<div class="card ' + stateCls + '" style="border-left:4px solid ' + dirColor + '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
                '<div class="clbl" style="margin:0">' + pair + '</div>' +
                '<div style="display:flex;gap:6px">' +
                    provenanceTag(bpSource) +
                    '<span class="' + dirCls + ' pill">' + bp.direction + '</span>' +
                    '<span class="' + regCls + '">' + (bp.regime || '--') + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="kv"><span class="kvl">Zone</span><span class="kvv wrn">' + (bp.zone_price ? bp.zone_price.toFixed(dp) : '--') + ' &middot; ' + zoneLabel + '</span></div>' +
            '<div class="kv"><span class="kvl">SL</span><span class="kvv neg">' + (bp.sl ? bp.sl.toFixed(dp) : '--') + ' (' + (bp.sl_pips_shallow || '--') + 'p)</span></div>' +
            '<div class="kv"><span class="kvl">R:R (shallow)</span><span class="kvv" style="color:' + rrColor + '">' + rrStr + '</span></div>' +
            metaSummary +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 2px">' + validationBadges + '</div>' +
            stageRows +
            (rb.available ? '<div class="kv"><span class="kvl">Total risk</span><span class="kvv wrn">' + riskFmtNum(riskPickNum(rb, ['totalRiskUsc','totalRiskUSC','total_risk_usc','totalRiskAmount','total_risk_amount']), 2, '--') + ' USC / ' + (riskPickNum(rb, ['totalRiskZar','totalRiskZAR','total_risk_zar']) == null ? '--' : ('R' + riskFmtNum(riskPickNum(rb, ['totalRiskZar','totalRiskZAR','total_risk_zar']), 2, '--'))) + '</span></div>' : '') +
            (bp.dd_warning ? '<div style="background:rgba(245,65,79,.07);border:1px solid rgba(245,65,79,.25);border-radius:4px;padding:7px 10px;margin-top:8px;font-size:11px;color:var(--re)">' + bp.dd_warning_msg + '</div>' : '') +
            ((bp.setup_class || '') === 'BLOCKED' ? '<div style="margin-top:8px;font-size:11px;color:var(--am)">Blocked: ' + (bp.blocked_reason || 'unknown reason') + '</div>' : '') +
            '<div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
                '<span style="font-family:var(--mo);font-size:9px;color:var(--mu)">Freshness: ' + formatFreshnessAgo(bp.updated_at || bp.generated_at) + ' · ' + genTime + ' SAST / ' + (bp.equity_at_calc ? bp.equity_at_calc.toLocaleString() + ' USC equity' : 'no equity') + '</span>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btg bts" onclick="openTradeQueueChart(\'' + pair + '\')">Open Chart</button><button class="btn bta bts" onclick="selectPairForPlan(\'' + pair + '\')">Generate Plan &rarr;</button></div>' +
            '</div>' +
        '</div>';
    }).join('');

    el.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
            '<span style="font-family:var(--mo);font-size:10px;color:var(--mu)">' + tradeQueue.length + ' blueprint' + (tradeQueue.length !== 1 ? 's' : '') + ' / ' + equityNote + '</span>' +
            '<button class="btn btg bts" onclick="clearTradeQueue()">Clear Queue</button>' +
        '</div>' +
        '<div class="g3">' + cards + '</div>';
  renderChartContextPanel();
  updatePriceDisplays();
}

/** Remove all blueprints from the trade queue (client + server). */
function clearTradeQueue() {
    tradeQueue = [];
    renderTradeQueue();
    if (USER_SYNC.authenticated) {
        fetch(API.BASE + 'user/trade-queue', {
            method: 'POST', headers: apiPostHeaders(), credentials: 'include',
            body: JSON.stringify({ queue: [] }),
        }).catch(function(e){ console.warn('clearTradeQueue sync failed:', e.message); });
    }
}

/** Load trade queue from server on init. */
function loadTradeQueue() {
    if (!USER_SYNC.authenticated) return;
    fetch(API.BASE + 'user/trade-queue', { method: 'GET', headers: apiGetHeaders(), credentials: 'include' })
        .then(function(r){
            if (!r.ok) throw new Error('HTTP ' + r.status + ' while loading trade queue');
            return r.json();
        })
        .then(function(data) {
            var serverQueue = (data && data.data) ? data.data : [];
            tradeQueue = serverQueue;
            renderTradeQueue();
        })
        .catch(function(e){
            console.warn('loadTradeQueue failed:', e.message);
            xtoast('⚠ WARNING Trade queue sync failed: ' + e.message, 'warn');
        });
}
function saveZarRate(val){
  ZAR=parseFloat(val)||0.167035;
  persistSettingsLocal();
  queueUserSync('settings');
  renderSigs();
  renderAnalytics();
}
function buildPriceInputs(){
  var el=document.getElementById('priceinputs');
  if(!el) return;
  var regOpts=['TREND DOWN','TREND UP','REVERSAL ZONE','RANGING'];
  // In-memory state is authoritative for live prices.
  el.innerHTML=PAIRS.map(function(p){
    var isJPY=p.indexOf('JPY')>-1;
    var regime=savedRegimes[p]||'RANGING';
    var price=(savedPrices[p] && savedPrices[p] > 0) ? savedPrices[p] : 0;
    var blocked=regime==='RANGING';
    var pId=p.replace('/','');
    return '<div class="plan-pair-row' + (blocked ? ' blocked' : '') + '" id="ppb-' + pId + '">' +
      '<span class="ppr-pair">' + p + '</span>' +
      '<input class="ppr-price" type="number" step="' + (isJPY ? '0.01' : '0.00001') + '" id="pr-' + pId + '" value="' + price + '" onchange="onPriceChange(\'' + p + '\',this.value)">' +
      '<select class="ppr-regime" id="rg-' + pId + '" onchange="onRegimeChange(\'' + p + '\',this.value)">' +
      regOpts.map(function(r){ return '<option value="' + r + '"' + (r===regime ? ' selected' : '') + '>' + r + '</option>'; }).join('') +
      '</select>' +
      '<button class="btn btd bts ppr-remove" type="button" onclick="removeInstrument(\'' + p + '\')">Remove</button>' +
      '</div>';
  }).join('');
  renderChartPairButtons();
  updatePriceDisplays();
}
function onPriceChange(pair,val){
  savedPrices[pair]=parseFloat(val)||0;
  priceManualTs = Date.now();
  updatePriceDisplays();
}
function onRegimeChange(pair,val){
  savedRegimes[pair]=val;
  var pId=pair.replace('/','');
  var block=document.getElementById('ppb-'+pId);
  if(block){
    if(val==='RANGING') block.classList.add('blocked');
    else block.classList.remove('blocked');
  }
  renderSessionBrief();
}
function addInstrument(){
  var input=document.getElementById('add-pair-input');
  var value=input?input.value:'';
  var pair=toPairDisplay(value);
  if(!pair){ xtoast('⚠ WARNING Enter a valid pair, e.g. ETH/USD','warn'); return false; }
  if(PAIRS.indexOf(pair)>-1){ xtoast('⚠ WARNING '+pair + ' already in watchlist','warn'); return false; }
  if(!USER_SYNC.authenticated){ xtoast('⚠ WARNING Login required to update watchlist','warn'); return false; }
  return queueWatchlistMutation(function(){
    return apiPost('user/watchlist/add', { symbol: pair }).then(function(res){
      var payload = res && res.data ? res.data : res;
      if(payload && Array.isArray(payload.watchlist)){
        applyWatchlist(payload.watchlist, 'watchlist_mutation_confirmed');
        refreshTrackedInstrumentViews();
        fetchPrices(true);
        generatePlan();
        if(input) input.value='';
        xtoast(pair + ' added to watchlist','ok');
        return true;
      }
      xtoast('⚠ WARNING Failed to add ' + pair,'warn');
      return false;
    }).catch(function(e){
      xtoast('⚠ WARNING Add Pair failed: ' + e.message,'warn');
      return false;
    });
  });
}

function removeInstrument(raw){
  var pair = toPairDisplay(raw);
  if(!pair) return false;
  if(PAIRS.indexOf(pair) === -1) return false;
  if(!USER_SYNC.authenticated){ xtoast('⚠ WARNING Login required to update watchlist','warn'); return false; }

  return queueWatchlistMutation(function(){
    return apiPost('user/watchlist/remove', { symbol: pair }).then(function(res){
      var payload = res && res.data ? res.data : res;
      if(!(payload && Array.isArray(payload.watchlist))){
        xtoast('⚠ WARNING Failed to remove ' + pair,'warn');
        return false;
      }
      applyWatchlist(payload.watchlist, 'watchlist_mutation_confirmed');
      delete signalCandleCache[pair];
      if(SFL_ANCHORS && SFL_ANCHORS[pair]) delete SFL_ANCHORS[pair];
      if(EF_LEVELS && EF_LEVELS[pair]) delete EF_LEVELS[pair];

      fetch(API.BASE + 'user/trade-queue', {
        method: 'POST',
        headers: apiPostHeaders(),
        credentials: 'include',
        body: JSON.stringify({ queue: tradeQueue })
      }).catch(function(e){ console.warn('removeInstrument trade queue sync failed:', e.message); });

      var fallbackChart = STATIC_CHART_INSTRUMENTS[0];
      if(_tvCurrentSymbol === chartSymbolForPair(pair)){
        _tvCurrentSymbol = '';
        if(fallbackChart) showChart(fallbackChart.symbol, null);
      } else {
        renderChartPairButtons();
      }
      refreshTrackedInstrumentViews();
      xtoast(pair + ' removed from tracked instruments','ok');
      return true;
    }).catch(function(e){
      xtoast('⚠ WARNING Remove Pair failed: ' + e.message,'warn');
      return false;
    });
  });
}
function resolvePairFreshness(pair){
  var wpMeta=getPriceEngineMeta();
  var freshnessMinutes=null;
  var globalFreshnessMinutes=null;
  var pairFreshnessMinutes=null;
  var threshold=120;
  if(wpMeta&&wpMeta.updated_at){
    var d=new Date(wpMeta.updated_at);
    if(!isNaN(d.getTime())) globalFreshnessMinutes=(Date.now()-d.getTime())/60000;
  }
  var pairSig=_findLiveSigForPair(pair);
  if(pairSig&&(pairSig.last_signal_at||pairSig.updated_at)){
    var sigTs=new Date(pairSig.last_signal_at||pairSig.updated_at);
    if(!isNaN(sigTs.getTime())){
      pairFreshnessMinutes=(Date.now()-sigTs.getTime())/60000;
    }
  }
  // Pair-level signal timestamp is the source-of-truth for row freshness when available.
  // Fall back to global price-engine meta only when no pair-specific timestamp exists.
  freshnessMinutes=pairFreshnessMinutes!==null?pairFreshnessMinutes:globalFreshnessMinutes;
  return {
    freshness_minutes:freshnessMinutes,
    has_meta:freshnessMinutes!==null,
    is_fresh:freshnessMinutes!==null&&freshnessMinutes<=threshold,
    is_stale:freshnessMinutes!==null&&freshnessMinutes>threshold,
    has_no_meta:freshnessMinutes===null,
    freshness_source:pairFreshnessMinutes!==null?'pair_signal':(globalFreshnessMinutes!==null?'price_engine':'none')
  };
}
function _findLiveSigForPair(pair){
  if(!pair) return null;
  var noSlash=pair.replace('/','');
  for(var i=0;i<liveSignals.length;i++){
    var sig=liveSignals[i];
    if(!sig) continue;
    var sp=(sig.pair||'').replace('/','');
    var sd=(sig.display_symbol||'').replace('/','');
    var si=(sig.instrument_id||'').replace('/','');
    if(sp===noSlash||sd===noSlash||si===noSlash) return sig;
  }
  return null;
}
function isValidChopBand(band){
  return !!(band && band.low != null && band.high != null && isFinite(Number(band.low)) && isFinite(Number(band.high)));
}
function resolvePairRuntimeSignal(pair){
  var runtimeSig = computedSignals && computedSignals[pair] ? computedSignals[pair] : null;
  var runtimeSnap = computedSnapshots && computedSnapshots[pair] ? computedSnapshots[pair] : null;
  var liveSig = _findLiveSigForPair(pair);
  var regimeMeta = regimeMetaByPair && regimeMetaByPair[pair] ? regimeMetaByPair[pair] : null;
  var fallbackRegime = savedRegimes[pair] || null;
  var fallbackSeq = savedSeqStatus[pair] || null;
  var hasLocalSignal = !!(runtimeSig && (
    runtimeSig.gate != null ||
    runtimeSig.signal_state != null ||
    runtimeSig.sequence_status != null ||
    runtimeSig.direction != null
  ));
  var nowTs = Date.now();
  var localFreshTs = runtimeSig ? Number(runtimeSig.freshness_ts || runtimeSig.generated_at || runtimeSig.updated_at || 0) : 0;
  var localIsFresh = !!(hasLocalSignal && localFreshTs && isFinite(localFreshTs) && (nowTs - localFreshTs) <= (3 * 60 * 60 * 1000));
  var backendState = liveSig ? normalizeSignalState(liveSig.signal_state || liveSig.state, liveSig.sequence_status) : null;
  var runtimeState = runtimeSig ? normalizeSignalState(runtimeSig.signal_state || runtimeSig.state, runtimeSig.sequence_status) : null;
  var preferLocalState = !!(localIsFresh && runtimeState && backendState === 'EXPIRED');

  function pickFirst(){
    for(var i=0;i<arguments.length;i++){
      var v=arguments[i];
      if(v!=null) return v;
    }
    return null;
  }

  function pickFirstNonEmpty(){
    for(var i=0;i<arguments.length;i++){
      var v=arguments[i];
      if(v!=null && v!=='') return v;
    }
    return null;
  }

  var resolved = {
    regime: pickFirst(
      liveSig && liveSig.regime,
      regimeMeta && regimeMeta.regime,
      runtimeSig && runtimeSig.regime,
      runtimeSnap && runtimeSnap.regime,
      fallbackRegime
    ),
    gate: pickFirst(
      liveSig && liveSig.gate,
      regimeMeta && regimeMeta.gate,
      runtimeSig && runtimeSig.gate,
      runtimeSnap && runtimeSnap.gate
    ),
    gate_reason: pickFirst(
      liveSig && liveSig.gate_reason,
      regimeMeta && regimeMeta.gate_reason,
      runtimeSig && runtimeSig.gate_reason,
      runtimeSnap && runtimeSnap.gate_reason
    ),
    signal_state: preferLocalState ? runtimeState : (
      backendState || runtimeState || normalizeSignalState('', (runtimeSig && runtimeSig.sequence_status) || (runtimeSnap && runtimeSnap.sequence_status) || (liveSig && liveSig.sequence_status) || fallbackSeq)
    ),
    sequence_status: normalizeSequenceStatus(
      (liveSig && liveSig.sequence_status) ||
      (runtimeSig && runtimeSig.sequence_status) ||
      (runtimeSnap && runtimeSnap.sequence_status) ||
      fallbackSeq
    ) || null,
    direction: pickFirst(
      liveSig && liveSig.direction,
      runtimeSig && runtimeSig.direction,
      runtimeSnap && runtimeSnap.direction
    ),
    final_bias: pickFirst(
      liveSig && liveSig.final_bias,
      runtimeSig && runtimeSig.final_bias,
      runtimeSnap && runtimeSnap.final_bias
    ),
    chop_band:
      (runtimeSig && isValidChopBand(runtimeSig.chop_band)) ? {
        low: Number(runtimeSig.chop_band.low),
        high: Number(runtimeSig.chop_band.high),
        source: runtimeSig.chop_band.source || runtimeSig.source || 'js_signal'
      } : (runtimeSnap && isValidChopBand(runtimeSnap.chop_band)) ? {
        low: Number(runtimeSnap.chop_band.low),
        high: Number(runtimeSnap.chop_band.high),
        source: runtimeSnap.chop_band.source || 'js_snapshot'
      } : (liveSig && isValidChopBand(liveSig.chop_band)) ? {
        low: Number(liveSig.chop_band.low),
        high: Number(liveSig.chop_band.high),
        source: liveSig.chop_band.source || 'backend_chop_band'
      } : (liveSig && liveSig.chop && liveSig.chop.low != null && liveSig.chop.high != null) ? {
        low: Number(liveSig.chop.low),
        high: Number(liveSig.chop.high),
        source: liveSig.chop.source || 'backend_chop'
      } : (regimeMeta && isValidChopBand(regimeMeta.chop_band)) ? {
        low: Number(regimeMeta.chop_band.low),
        high: Number(regimeMeta.chop_band.high),
        source: regimeMeta.chop_band.source || 'backend_regime_meta'
      } : (regimeMeta && regimeMeta.chop && regimeMeta.chop.low != null && regimeMeta.chop.high != null) ? {
        low: Number(regimeMeta.chop.low),
        high: Number(regimeMeta.chop.high),
        source: regimeMeta.chop.source || 'backend_regime_meta_chop'
      } : null,
    setup_class: pickFirst(
      runtimeSig && runtimeSig.setup_class,
      liveSig && liveSig.setup_class
    ),
    blocked_reason: pickFirst(
      runtimeSig && runtimeSig.blocked_reason,
      liveSig && liveSig.blocked_reason
    ),
    setup_quality: runtimeSig && runtimeSig.setup_quality != null ? runtimeSig.setup_quality : (liveSig && liveSig.setup_quality != null ? liveSig.setup_quality : null),
    execution_quality: runtimeSig && runtimeSig.execution_quality != null ? runtimeSig.execution_quality : (liveSig && liveSig.execution_quality != null ? liveSig.execution_quality : null),
    rr_estimate: runtimeSig && runtimeSig.rr_estimate != null ? runtimeSig.rr_estimate : (liveSig && liveSig.rr_estimate != null ? liveSig.rr_estimate : null),
    updated_at: pickFirstNonEmpty(runtimeSig && runtimeSig.updated_at, runtimeSnap && runtimeSnap.updated_at) || (
      (liveSig && (liveSig.updated_at || liveSig.last_signal_at)) ? (liveSig.updated_at || liveSig.last_signal_at) : null
    ),
    source: runtimeSig ? 'computedSignals' : runtimeSnap ? 'computedSnapshots' : liveSig ? 'liveSignals' : regimeMeta ? 'regimes.meta' : 'fallback',
    has_fresh_local_signal: localIsFresh,
    local_signal_ts: localFreshTs || null,
    live_signal: liveSig || null,
    runtime_signal: runtimeSig || null,
    runtime_snapshot: runtimeSnap || null,
    regime_meta: regimeMeta || null
  };
  if (DEBUG_TRACE) console.log('[FIX_TRACE:RUNTIME_TRUTH]', pair, {
    regime: resolved.regime || null,
    gate: resolved.gate || null,
    gate_reason: resolved.gate_reason || null,
    signal_state: resolved.signal_state || null,
    sequence_status: resolved.sequence_status || null,
    direction: resolved.direction || null,
    has_chop_band: !!(resolved.chop_band && resolved.chop_band.low != null && resolved.chop_band.high != null),
    source: resolved.source || null
  });
  return resolved;
}
function resolvePairChopState(pair){
  var resolved = resolvePairRuntimeSignal(pair);
  if(resolved && resolved.chop_band && resolved.chop_band.low != null && resolved.chop_band.high != null){
    return {
      band:{lo:parseFloat(resolved.chop_band.low),hi:parseFloat(resolved.chop_band.high)},
      source:resolved.chop_band.source || (resolved.source || 'runtime'),
      has_chop:true
    };
  }
  return {band:null,source:'none',has_chop:false};
}
function buildPairStateContext(pair){
  var freshness=resolvePairFreshness(pair);
  var resolvedRuntime = resolvePairRuntimeSignal(pair);
  var pairSig=resolvedRuntime.live_signal || _findLiveSigForPair(pair);
  var chopState = (resolvedRuntime.chop_band && resolvedRuntime.chop_band.low != null && resolvedRuntime.chop_band.high != null)
    ? { band:{ lo:parseFloat(resolvedRuntime.chop_band.low), hi:parseFloat(resolvedRuntime.chop_band.high) }, source:resolvedRuntime.chop_band.source||resolvedRuntime.source||'runtime', has_chop:true }
    : { band:null, source:'none', has_chop:false };
  var mkt=savedPrices[pair]||0;
  var hasPrice=mkt>0;
  var storedRegime=savedRegimes[pair]||null;
  var liveRegime=resolvedRuntime.regime|| (pairSig?(pairSig.regime||null):null);
  var regimeValue=liveRegime||storedRegime||null;
  var hasRegime=!!regimeValue;
  var anchor=getAnchorSet(pair,FIB_TIMEFRAME);
  var hasAnchor=!!(anchor&&anchor.fibHigh!=null&&anchor.fibLow!=null);
  var anchorSource=hasAnchor?(anchor.source||FIB_TIMEFRAME):'none';
  var inChop=!!(chopState.has_chop&&hasPrice&&mkt>=chopState.band.lo&&mkt<=chopState.band.hi);
  var isHydrating=!DATA_HYDRATION.firstHydrationComplete;
  var hasAnyDynamicState=hasPrice||hasRegime||hasAnchor||chopState.has_chop||freshness.has_meta;
  var statusReason;
  if(isHydrating && !hasAnyDynamicState) statusReason='AWAITING_SYNC';
  else if(!freshness.has_meta&&!hasRegime){
    if(DATA_HYDRATION.firstHydrationComplete && (!DATA_HYDRATION.pricesLoaded || !DATA_HYDRATION.regimesLoaded || !DATA_HYDRATION.liveLoaded)) statusReason='HYDRATION_FAILED';
    else statusReason='NO_DATA';
  }
  else if(freshness.is_stale) statusReason='STALE_PRICE_ENGINE';
  else if(!hasRegime) statusReason='NO_REGIME_DATA';
  else if(!hasAnchor&&!chopState.has_chop) statusReason='NO_ANCHOR_DATA';
  else if(!hasPrice) statusReason='NO_PRICE_DATA';
  else if(regimeValue==='RANGING') statusReason='TRUE_RANGING';
  else statusReason='OK';

  var regimeDisplay;
  if(statusReason==='AWAITING_SYNC') regimeDisplay='LOADING';
  else if(statusReason==='NO_DATA'||statusReason==='NO_REGIME_DATA') regimeDisplay='NO DATA';
  else if(statusReason==='HYDRATION_FAILED') regimeDisplay='UNAVAILABLE';
  else if(statusReason==='STALE_PRICE_ENGINE') regimeDisplay='STALE';
  else regimeDisplay=regimeValue||'NO DATA';

  var storedGate=resolvedRuntime.gate!=null?String(resolvedRuntime.gate).toUpperCase():(pairSig&&pairSig.gate?String(pairSig.gate).toUpperCase():null);
  var gateDisplay = { value: 'UNAVAILABLE', mode: 'none', reason: resolvedRuntime.gate_reason || null };
  if(statusReason==='AWAITING_SYNC') gateDisplay.value='LOADING';
  else if(statusReason==='NO_DATA'||statusReason==='NO_REGIME_DATA') gateDisplay.value='NO DATA';
  else if(statusReason==='HYDRATION_FAILED') gateDisplay.value='UNAVAILABLE';
  else if(statusReason==='STALE_PRICE_ENGINE') gateDisplay.value='STALE';
  else if(storedGate==='SELL'||storedGate==='BUY'||storedGate==='BOTH'){ gateDisplay.value=storedGate; gateDisplay.mode='strict'; }
  else if((resolvedRuntime.gate_reason||'').toUpperCase()==='IN_CHOP_BAND'){ gateDisplay.value='CHOP'; gateDisplay.mode='strict_reason'; }
  else if((regimeValue||'').toUpperCase()==='RANGING'){ gateDisplay.value='RANGING'; gateDisplay.mode='strict_reason'; }
  else if((storedGate==='NONE'||!storedGate) && regimeValue==='TREND UP' && statusReason==='OK'){ gateDisplay.value='BUY'; gateDisplay.mode='display_fallback'; }
  else if((storedGate==='NONE'||!storedGate) && regimeValue==='TREND DOWN' && statusReason==='OK'){ gateDisplay.value='SELL'; gateDisplay.mode='display_fallback'; }
  else if(storedGate==='NONE'){ gateDisplay.value='NONE'; gateDisplay.mode='strict'; }

  var sigState;
  if(resolvedRuntime.signal_state){
    sigState=normalizeSignalState(resolvedRuntime.signal_state,resolvedRuntime.sequence_status||savedSeqStatus[pair]);
  } else if(pairSig){
    sigState=normalizeSignalState(pairSig.signal_state||pairSig.state,pairSig.sequence_status||savedSeqStatus[pair]);
  } else if(statusReason==='AWAITING_SYNC'){
    sigState='PENDING';
  } else if(statusReason==='STALE_PRICE_ENGINE'||statusReason==='NO_DATA'||statusReason==='NO_REGIME_DATA'||statusReason==='HYDRATION_FAILED'){
    sigState='INVALID';
  } else if(inChop||regimeValue==='RANGING'){
    sigState='INVALID';
  } else if(normalizeSequenceStatus(savedSeqStatus[pair])==='READY'){
    sigState='WATCHLIST';
  } else {
    sigState='INVALID';
  }

  if (DEBUG_TRACE) console.log('[REGIME_BRIEF] '+pair+' {'+
    ' regime='+regimeDisplay+
    ' gate='+gateDisplay.value+
    ' has_price='+hasPrice+
    ' has_regime='+hasRegime+
    ' has_anchor='+hasAnchor+
    ' has_chop='+chopState.has_chop+
    ' chop_src='+chopState.source+
    ' fresh_mins='+(freshness.freshness_minutes!==null?freshness.freshness_minutes.toFixed(1):'null')+
    ' reason='+statusReason+
    ' }');

// ── Canonical readiness contract (v12.0.9.1) ─────────────────────────────
  // LIVE requires: price + regime + anchor + a resolved gate (not UNAVAILABLE/null).
  // Any missing critical field downgrades to NOT_READY or PENDING.
  // This prevents the UI from ever showing LIVE alongside NO DATA / UNAVAILABLE.
  var gateIsResolved = (function(){
    var gv = gateDisplay.value;
    return gv === 'BUY' || gv === 'SELL' || gv === 'BOTH' || gv === 'NONE' ||
           gv === 'CHOP' || gv === 'RANGING';
  }());
  var chopIsPresent = chopState.has_chop;

  // Compute readiness tier: PENDING → NOT_READY → PARTIAL → LIVE
  var readinessTier;
  if(statusReason==='AWAITING_SYNC'){
    readinessTier = 'PENDING';
  } else if(statusReason==='HYDRATION_FAILED'){
    readinessTier = 'UNAVAILABLE';
  } else if(statusReason==='NO_DATA'||statusReason==='NO_REGIME_DATA'||statusReason==='STALE_PRICE_ENGINE'){
    readinessTier = 'NOT_READY';
  } else if(statusReason==='NO_ANCHOR_DATA'||statusReason==='NO_PRICE_DATA'){
    readinessTier = 'NOT_READY';
  } else if(!gateIsResolved){
    // Gate is UNAVAILABLE — core execution input missing
    readinessTier = 'NOT_READY';
  } else if(!chopIsPresent){
    // Chop band absent: row can wait for reconcile without making the whole engine look stale.
    readinessTier = 'WAIT';
  } else {
    readinessTier = 'LIVE';
  }

  // Diagnostic: surface the exact field that blocked LIVE so stale/NOT_READY is never silent.
  if (DEBUG_TRACE && (readinessTier === 'NOT_READY' || readinessTier === 'PENDING' || readinessTier === 'WAIT')) {
    var _blocker = statusReason !== 'OK' ? ('statusReason=' + statusReason)
      : !hasPrice   ? 'missing_price'
      : !hasRegime  ? 'missing_regime'
      : !gateIsResolved ? 'gate_unresolved(gate=' + gateDisplay.value + ')'
      : !chopIsPresent  ? 'chop_absent'
      : 'unknown';
    console.warn('[READINESS][' + pair + '] tier=' + readinessTier + ' blocker=' + _blocker);
  }

  // panelStatus maps readiness tier → display string
  var panelStatus;
  if(readinessTier==='PENDING')     panelStatus='PENDING';
  else if(readinessTier==='UNAVAILABLE') panelStatus='UNAVAILABLE';
  else if(readinessTier==='WAIT')        panelStatus='WAIT';
  else if(readinessTier==='NOT_READY')   panelStatus='NOT_READY';
  else if(readinessTier==='PARTIAL')     panelStatus='PARTIAL';
  else                                   panelStatus='LIVE';

  return {
    pair:pair,
    mkt:mkt,
    has_price:hasPrice,
    has_regime:hasRegime,
    regime_value:regimeValue,
    regime_display:regimeDisplay,
    gate_display:gateDisplay,
    has_live_chop:chopState.source!=='none',
    has_anchor:hasAnchor,
    anchor_source:anchorSource,
    chop_state:chopState,
    in_chop:inChop,
    freshness:freshness,
    status_reason:statusReason,
    sig_state:sigState,
    panel_status: panelStatus,
    readiness_tier: readinessTier,
    gate_is_resolved: gateIsResolved,
    chop_is_present: chopIsPresent,
    runtime_truth: resolvedRuntime,
    pairSig:pairSig,
    seq_status:(resolvedRuntime.sequence_status || (pairSig?(pairSig.sequence_status||savedSeqStatus[pair]):savedSeqStatus[pair]))
  };
}
function renderSessionBrief(){
  var grid=document.getElementById('regime-brief-table');
  if(!grid) return;
  if(grid.tagName==='TBODY'){
    var tbl=grid.closest('table');
    if(tbl&&tbl.parentNode){
      var replacement=document.createElement('div');
      replacement.id='regime-brief-table';
      replacement.className=(grid.className||'');
      tbl.parentNode.replaceChild(replacement,tbl);
      grid=replacement;
    }
  }
  grid.classList.add('regime-brief-grid');
  var briefWrapper = grid.closest ? grid.closest('.tw') : null;
  if (briefWrapper) {
    briefWrapper.style.overflowX = 'visible';
    briefWrapper.style.whiteSpace = 'normal';
  }
  var wpMeta=getPriceEngineMeta();
  var rowsHtml=PAIRS.map(function(pair){
    var ctx=buildPairStateContext(pair);
    var isJPY=pair.indexOf('JPY')>-1;
    var dp=isJPY?2:5;
    var regimeHtml;
    if(ctx.status_reason==='AWAITING_SYNC') regimeHtml='<span class="pgy pill">LOADING</span>';
    else if(ctx.status_reason==='STALE_PRICE_ENGINE') regimeHtml='<span class="pgy pill">STALE</span>';
    else if(ctx.status_reason==='HYDRATION_FAILED') regimeHtml='<span class="pgy pill">UNAVAILABLE</span>';
    else if(ctx.status_reason==='NO_DATA'||ctx.status_reason==='NO_REGIME_DATA') regimeHtml='<span class="pgy pill">NO DATA</span>';
    else {
      var regimeValue = ctx.regime_value || 'NO DATA';
      var regCls;
      if(regimeValue==='TREND DOWN') regCls='rdn';
      else if(regimeValue==='TREND UP') regCls='rup';
      else if(regimeValue==='REVERSAL ZONE') regCls='rrv';
      else if(regimeValue==='CHOP') regCls='rch';
      else regCls='rrg';
      
      var displayValue = regimeValue;
      if(regimeValue.indexOf('RANGE')===0) displayValue = 'RANGE ≐';
      else if(regimeValue==='TREND UP') displayValue = 'TREND+';
      else if(regimeValue==='TREND DOWN') displayValue = 'TREND-';
      
      regimeHtml='<span class="'+regCls+' pill">'+displayValue+'</span>';
    }

    var gateHtml;
    var gateValue = ctx.gate_display && ctx.gate_display.value ? ctx.gate_display.value : 'UNAVAILABLE';
    var gateMode = ctx.gate_display && ctx.gate_display.mode ? ctx.gate_display.mode : 'none';
    var gateReason = ctx.gate_display && ctx.gate_display.reason ? String(ctx.gate_display.reason) : '';
    var gateTitleText = gateReason ? (gateReason + ' · ' + gateMode) : gateMode;
    var gateTitle = ' title="' + escapeHtmlAttr(gateTitleText) + '"';
    if(gateValue==='SELL'){gateHtml='<span class="pr2 pill"'+gateTitle+'>SELL</span>';}
    else if(gateValue==='BUY'){gateHtml='<span class="pg2 pill"'+gateTitle+'>PASS</span>';}
    else if(gateValue==='BOTH'){gateHtml='<span class="pg2 pill"'+gateTitle+'>PASS</span>';}
    else if(gateValue==='UNAVAILABLE'){gateHtml='<span class="pgy pill">BLOCKED</span>';}
    else if(gateValue==='LOADING'){gateHtml='<span class="pgy pill">LOADING</span>';}
    else if(gateValue==='STALE'){gateHtml='<span class="pgy pill">STALE</span>';}
    else if(gateValue==='NO DATA'){gateHtml='<span class="pgy pill">BLOCKED</span>';}
    else if(gateValue==='PENDING'){gateHtml='<span class="pgy pill">PENDING</span>';}
    else if(gateValue==='NOT READY'){gateHtml='<span class="pa2 pill">NOT READY</span>';}
    else if(gateValue==='PARTIAL'){gateHtml='<span class="pa2 pill">PARTIAL</span>';}
    else if(gateValue==='CHOP'){gateHtml='<span class="pr2 pill"'+gateTitle+'>BLOCKED</span>';}
    else if(gateValue==='RANGING'){gateHtml='<span class="pgy pill"'+gateTitle+'>BLOCKED</span>';}
    else {gateHtml='<span class="pgy pill"'+gateTitle+'>'+escapeHtmlAttr(gateValue||'BLOCKED')+'</span>';}

    var chopHtml;
    if(!ctx.chop_state.has_chop){
      chopHtml='<span class="pgy pill" title="Awaiting chop block">AWAITING</span>';
    } else {
      var band=ctx.chop_state.band;
      var chopRange=band.lo.toFixed(dp)+'-'+band.hi.toFixed(dp);
      chopHtml='<span class="pr2 pill" title="Chop block levels">'+chopRange+'</span>';
    }

    // Status badge — ARMED only when canonical readiness is LIVE (which includes price availability).
    var statusHtml;
    var rt = ctx.readiness_tier;
    var allChecksPassed = rt==='LIVE' && ctx.has_price && ctx.has_regime && ctx.gate_is_resolved && ctx.chop_state.has_chop;
    
    if(!allChecksPassed) {
      if(rt==='PENDING' || !ctx.has_regime || !ctx.gate_is_resolved || !ctx.chop_state.has_chop){
        statusHtml='<span class="pa2 pill">WAIT</span>';
      } else if(rt==='UNAVAILABLE'){
        statusHtml='<span class="pgy pill">OFF</span>';
      } else if(rt==='NOT_READY'){
        statusHtml='<span class="pa2 pill">WAIT</span>';
      } else if(rt==='PARTIAL'){
        statusHtml='<span class="pa2 pill">WAIT</span>';
      } else {
        statusHtml='<span class="pa2 pill">WAIT</span>';
      }
    } else {
      statusHtml='<span class="pg2 pill live-pulse">ARMED</span>';
    }
    
    if(ctx.freshness.freshness_minutes!==null&&ctx.freshness.freshness_minutes>120){
      var staleMins=ctx.freshness.freshness_minutes;
      var staleLabel=staleMins>1440?Math.round(staleMins/60)+'h':Math.round(staleMins)+'m';
      statusHtml='<span class="pgy pill" title="last update '+staleLabel+' ago">OFF</span>';
    }

    return '<div class="rg-row">'+
      '<span class="rg-pair">'+pair+'</span>'+
      '<span class="rg-regime">'+regimeHtml+'</span>'+
      '<span class="rg-gate">'+gateHtml+'</span>'+
      '<span class="rg-chop">'+chopHtml+'</span>'+
      '<span class="rg-status">'+statusHtml+'</span>'+
    '</div>';
  }).join('');
  grid.innerHTML='<div class="rg-header-row">'+
    '<span>Pair</span>'+
    '<span>Regime</span>'+
    '<span>Gate</span>'+
    '<span>Chop Block</span>'+
    '<span>Status</span>'+
  '</div>'+rowsHtml;

  var metaEl=document.getElementById('regime-brief-meta');
  if(metaEl){
    if(wpMeta&&wpMeta.updated_at){
      var freshMins=(Date.now()-new Date(wpMeta.updated_at).getTime())/60000;
      var freshLabel=freshMins>120
        ? '<span style="color:var(--re)">STALE - '+formatSastDateTime(wpMeta.updated_at)+'</span>'
        : 'Last Update: '+formatSastDateTime(wpMeta.updated_at);
      metaEl.innerHTML=freshLabel+' - Source: Price Engine';
    } else {
      metaEl.textContent='Last Update: Awaiting Price Engine sync';
    }
  }
}
function renderSeqCards(){var el=document.getElementById('seq-status-cards');if(!el)return;el.innerHTML=PAIRS.map(function(pair){var s=normalizeSequenceStatus(savedSeqStatus[pair]),label,bg,tc;if(s==='READY'){label='READY';bg='rgba(31,219,122,0.10)';tc='var(--gr)';}else if(s==='AWAIT MSS'){label='AWAIT MSS';bg='rgba(245,166,35,0.10)';tc='var(--am)';}else if(s==='AWAIT SWEEP'){label='AWAIT SWEEP';bg='rgba(244,65,79,0.10)';tc='var(--re)';}else if(s==='STALE'){label='STALE';bg='rgba(136,153,176,0.08)';tc='var(--mu)';}else{label='NO DATA';bg='rgba(136,153,176,0.06)';tc='var(--mu)';}return '<div style="background:'+bg+';border:1px solid var(--bd);border-radius:6px;padding:10px 12px"><div style="font-family:var(--mo);font-size:9px;letter-spacing:1.5px;color:var(--mu);margin-bottom:4px">'+pair+'</div><div style="font-family:var(--mo);font-size:12px;font-weight:700;color:'+tc+'">'+label+'</div></div>';}).join('');}
function getOutcomeBadge(oc) {
    if (oc === 'WIN-TP' || oc === 'WIN-MANUAL') return '<span class="pg2 pill">PROFIT</span>';
    if (oc === 'LOSS-SL') return '<span class="pr2 pill">LOSS</span>';
    if (oc === 'BE') return '<span class="pa2 pill">BE</span>';
    if (oc === 'AWAIT_HISTORY') return '<span class="pb2 pill">AWAIT HISTORY</span>';
    if (oc === 'NO-FILL') return '<span class="pp2 pill">NO FILL</span>';
    return '<span class="pgy pill">' + oc + '</span>';
}
function markNoFill(posId) {
  var sig = signals.filter(function(s){return s.posId===posId;})[0];
  if (!sig) return;
  sig.outcome = 'NO-FILL';
  sig.noFillDate = new Date().toISOString().slice(0,10);
  persistTradesLocal();
  queueUserSync('trades');
  renderSigs();
  renderAnalytics();
  xtoast('⚠ WARNING Ladder '+posId+' marked NO FILL', 'warn');
}
function getTPs(ld) {
  var levels = getAllLevels(ld.pair);
  var dir = ld.dir;
  var zonePrice = ld.zone.price;
  var sorted = levels.slice().sort(function(a,b){return a.price-b.price;});
  var targets = [];
  if(dir === 'SELL') {
    targets = sorted.filter(function(lv){return lv.price < zonePrice-0.0001;})
                    .sort(function(a,b){return b.price-a.price;});
  } else {
    targets = sorted.filter(function(lv){return lv.price > zonePrice+0.0001;})
                    .sort(function(a,b){return a.price-b.price;});
  }
  var tp1 = targets[0] || null;
  var tp2 = targets[1] || null;
  var tp3 = targets[2] || tp2;
  return {tp1:tp1, tp2:tp2, tp3:tp3};
}
function assignTPs(ld) {
  var tps = getTPs(ld);
  return [
    {pos:'Shallow (P1)', fill:'1 of 3', tp:tps.tp3, label:'TP3 major counter zone (all fills)'},
    {pos:'Shallow (P1)', fill:'1 of 2', tp:tps.tp2, label:'TP2 (if only 2 fill)'},
    {pos:'Shallow (P1)', fill:'1 of 3', tp:tps.tp1, label:'TP1 balance bank (3 fill)'},
    {pos:'Mid (P2)',     fill:'2 of 2', tp:tps.tp3, label:'TP3 major counter zone'},
    {pos:'Mid (P2)',     fill:'2 of 3', tp:tps.tp2, label:'TP2'},
    {pos:'Deep (P3)',    fill:'3 of 3', tp:tps.tp3, label:'TP3 major counter zone'}
  ];
}
function buildTPManagement(ld) {
  var dp = ld.dp;
  var tps = getTPs(ld);
  if(!tps.tp1 && !tps.tp2 && !tps.tp3) return '';
  function tpStr(tp) {
    if(!tp) return '--';
    return tp.price.toFixed(dp) + ' (' + tp.pct + ')';
  }
  function pips(entry, tp) {
    if(!tp) return '--';
    var d = Math.abs(entry - tp.price) * ld.mult;
    return d.toFixed(0) + 'p';
  }
  function usc(entry, tp, lots) {
    if(!tp) return '--';
    var d = Math.abs(entry - tp.price) * ld.mult;
    return '+' + (d * (lots/0.01) * ld.pv).toFixed(0) + ' USC';
  }
  function rr(entry, tp, sl) {
    if(!tp) return '--';
    var tpD = Math.abs(entry - tp.price) * ld.mult;
    var slD = Math.abs(entry - sl) * ld.mult;
    return '1:' + (tpD/slD).toFixed(1);
  }
  var e1 = ld.entries[0].entry;
  var e2 = ld.entries[1] ? ld.entries[1].entry : e1;
  var e3 = ld.entries[2] ? ld.entries[2].entry : e2;
  var sl = ld.sl;
  var lots = ld.lotsPerEntry;
  var html = '<div style="background:var(--bg3);border-top:1px solid var(--bd2);padding:14px">';
  html += '<div style="font-family:var(--mo);font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--mu);margin-bottom:12px">TP Assignment - v7.3 Simplified - 1 Position = 1 TP - Broker Rule</div>';
  var scenarios = [
    {label:'IF 3 FILL', color:'var(--gr)', desc:'Full ladder',
     p1tp:tps.tp1, p2tp:tps.tp2, p3tp:tps.tp3},
    {label:'IF 2 FILL', color:'var(--am)', desc:'Shallow + Mid only',
     p1tp:tps.tp2, p2tp:tps.tp3, p3tp:null},
    {label:'IF 1 FILL', color:'var(--bl)', desc:'Shallow only',
     p1tp:tps.tp3, p2tp:null, p3tp:null},
  ];
  scenarios.forEach(function(sc) {
    html += '<div style="background:var(--bg2);border-radius:5px;padding:10px 12px;margin-bottom:8px;border-left:3px solid '+sc.color+'">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html += '<span style="font-family:var(--mo);font-size:11px;font-weight:700;color:'+sc.color+'">'+sc.label+'</span>';
    html += '<span style="font-family:var(--mo);font-size:10px;color:var(--mu)">'+sc.desc+'</span>';
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">';
    [[e1,sc.p1tp,'Shallow (P1)'],[e2,sc.p2tp,'Mid (P2)'],[e3,sc.p3tp,'Deep (P3)']].forEach(function(row){
      html += '<div style="background:var(--bg3);border-radius:3px;padding:6px 8px">';
      html += '<div style="font-family:var(--mo);font-size:9px;color:var(--mu);margin-bottom:2px">'+row[2]+'</div>';
      if(row[1]) {
        html += '<div style="font-family:var(--mo);font-size:10px;color:var(--gr);font-weight:700">'+tpStr(row[1])+'</div>';
        html += '<div style="font-family:var(--mo);font-size:9px;color:var(--dm)">'+pips(row[0],row[1])+' | '+rr(row[0],row[1],sl)+' | '+usc(row[0],row[1],lots)+'</div>';
      } else {
        html += '<div style="color:var(--mu);font-size:10px">--</div>';
      }
      html += '</div>';
    });
    html += '</div></div>';
  });
  var tp1str = tpStr(tps.tp1);
  html += '<div style="font-family:var(--mo);font-size:9px;color:var(--mu);margin-top:6px;line-height:1.6">';
  html += 'BE PROTECTION: When Shallow TP hit -> move Mid + Deep SL to entry immediately | ';
  html += 'When Mid TP hit -> move Deep SL to ' + tp1str + ' | Never widen SLs';
  html += '</div>';
  html += '</div>';
  return html;
}
function fetchPendingLimits() {
    xtoast('⚠ NOTICE Pending limits: check indicator alerts for proximity (EF levels within 15 pips).', 'info');
}
function getNextLevelSL(zonePrice, dir, levels, dp) {
  var stop = getStageStopData(zonePrice, dir, levels, dp, { excludeEf: true });
  if (!stop.level) return null;
  var minBuf = (dp === 2) ? 0.40 : 0.00040;
  var distToNextLv = Math.abs(stop.level.price - zonePrice);
  if (distToNextLv < minBuf) return null;
  return stop.price;
}
function _buildRiskSection(ld, rb) {
  if (!rb) return '';
  function _numOrNull(v){ var n = Number(v); return Number.isFinite(n) ? n : null; }
  function _fmtNum(v, dp, fallback){ var n = _numOrNull(v); return n==null ? (fallback==null?'&mdash;':fallback) : n.toFixed(dp); }
  function _pickNum(obj, keys){
    if(!obj || !keys || !keys.length) return null;
    for(var i=0;i<keys.length;i++){ var n=_numOrNull(obj[keys[i]]); if(n!=null) return n; }
    return null;
  }
  var html = '';
  if (rb.available) {
    html += '<div style="background:var(--bg3);border-top:1px solid var(--bd2);padding:14px">';
    html += '<div style="font-family:var(--mo);font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--mu);margin-bottom:10px">Risk Breakdown - Account Profile Sizing</div>';
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">';
    html += '<thead><tr><th style="background:var(--bg3);color:var(--mu);font-family:var(--mo);font-size:9px;letter-spacing:1px;text-transform:uppercase;padding:6px 10px;text-align:left;border-bottom:1px solid var(--bd2)">Stage</th><th style="background:var(--bg3);color:var(--mu);font-family:var(--mo);font-size:9px;letter-spacing:1px;text-transform:uppercase;padding:6px 10px;text-align:left;border-bottom:1px solid var(--bd2)">Entry</th><th style="background:var(--bg3);color:var(--mu);font-family:var(--mo);font-size:9px;letter-spacing:1px;text-transform:uppercase;padding:6px 10px;text-align:left;border-bottom:1px solid var(--bd2)">Lots</th><th style="background:var(--bg3);color:var(--mu);font-family:var(--mo);font-size:9px;letter-spacing:1px;text-transform:uppercase;padding:6px 10px;text-align:left;border-bottom:1px solid var(--bd2)">SL Pips</th><th style="background:var(--bg3);color:var(--mu);font-family:var(--mo);font-size:9px;letter-spacing:1px;text-transform:uppercase;padding:6px 10px;text-align:left;border-bottom:1px solid var(--bd2)">Risk USC</th><th style="background:var(--bg3);color:var(--mu);font-family:var(--mo);font-size:9px;letter-spacing:1px;text-transform:uppercase;padding:6px 10px;text-align:left;border-bottom:1px solid var(--bd2)">Risk ZAR</th></tr></thead><tbody>';
    var stageLabels = ['E1 Shallow','E2 Mid','E3 Deep'];
    rb.stages.forEach(function(s, i) {
      var entry = _pickNum(s, ['entry']);
      if (entry == null) return;
      var lot = _pickNum(s, ['lot','lots']);
      var slPips = _pickNum(s, ['slPips','sl_pips']);
      var riskUsc = _pickNum(s, ['riskUsc','riskUSC','risk_usc','riskAmount','risk_amount']);
      var riskZar = _pickNum(s, ['riskZar','riskZAR','risk_zar']);
      html += '<tr><td style="padding:6px 10px;font-family:var(--mo)">' + stageLabels[i] + '</td>';
      html += '<td style="padding:6px 10px;font-family:var(--mo)">' + _fmtNum(entry, entry > 10 ? 3 : 5, '&mdash;') + '</td>';
      html += '<td style="padding:6px 10px;font-family:var(--mo);color:' + (lot === 0 ? 'var(--re)' : 'var(--gr)') + '">' + (lot === 0 ? 'TOO SMALL' : _fmtNum(lot, 2, '&mdash;')) + '</td>';
      html += '<td style="padding:6px 10px;font-family:var(--mo)">' + (slPips==null?'&mdash;':slPips) + '</td>';
      html += '<td style="padding:6px 10px;font-family:var(--mo);color:var(--am)">' + (_numOrNull(riskUsc)==null?'&mdash;':(_fmtNum(riskUsc,2,'&mdash;') + ' USC')) + '</td>';
      html += '<td style="padding:6px 10px;font-family:var(--mo)">' + (_numOrNull(riskZar)==null?'&mdash;':('R' + _fmtNum(riskZar,2,'&mdash;'))) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    var totalRiskUsc = _pickNum(rb, ['totalRiskUsc','totalRiskUSC','total_risk_usc','totalRiskAmount','total_risk_amount']);
    var totalRiskZar = _pickNum(rb, ['totalRiskZar','totalRiskZAR','total_risk_zar']);
    var ddImpactPct = _pickNum(rb, ['ddImpactPct','ddImpact','dd_impact_pct']);
    html += '<div style="display:flex;gap:24px;margin-top:10px;font-family:var(--mo);font-size:12px">';
    html += '<span>Total if all filled: <b style="color:var(--am)">' + (_numOrNull(totalRiskUsc)==null?'&mdash;':(_fmtNum(totalRiskUsc,2,'&mdash;') + ' USC')) + '</b> / <b>' + (_numOrNull(totalRiskZar)==null?'&mdash;':('R'+_fmtNum(totalRiskZar,2,'&mdash;'))) + '</b></span>';
    html += '<span>DD Impact: <b style="color:' + (rb.ddWarning ? 'var(--re)' : 'var(--gr)') + '">' + (_numOrNull(ddImpactPct)==null?'&mdash;':(_fmtNum(ddImpactPct,2,'&mdash;') + '%')) + '</b></span>';
    html += '</div>';
    if (rb.ddWarning) {
      html += '<div style="margin-top:8px;padding:8px 12px;background:rgba(245,65,79,.08);border:1px solid rgba(245,65,79,.3);border-radius:4px;font-size:12px;color:var(--re)">' + rb.ddWarningMsg + '</div>';
    }
    html += '</div>';
  } else {
    html += '<div style="padding:10px 14px;background:rgba(74,85,104,.15);border-top:1px solid var(--bd2);font-size:12px;color:var(--dm);font-family:var(--mo)">Risk sizing unavailable: ' + rb.reason + ' - configure Account Profile above to enable lot sizing</div>';
  }
  return html;
}
function getActivePhpBlueprints(){
  if (!Array.isArray(tradeQueue) || !tradeQueue.length) return [];
  return tradeQueue.filter(function(bp){
    var status = String((bp && bp.status) || 'READY').toUpperCase();
    return status !== 'EXPIRED' && status !== 'INVALIDATED';
  });
}
function renderPlan(planPayload, source){
  if(source === 'BACKEND_BLUEPRINT'){
    return renderServerBlueprintPlan(planPayload.context, planPayload.blueprints || []);
  }
  return false;
}
function syncPlanInputsToRuntime(){
  var prices = {}, regimes = {};
  PAIRS.forEach(function(p){
    var pId = p.replace('/','');
    var prEl = document.getElementById('pr-' + pId);
    var rgEl = document.getElementById('rg-' + pId);
    prices[p] = prEl ? (parseFloat(prEl.value) || savedPrices[p] || 0) : (savedPrices[p] || 0);
    prices[p] = Number(prices[p]) || 0;
    regimes[p] = rgEl ? rgEl.value : savedRegimes[p] || 'RANGING';
    savedPrices[p] = prices[p];
    savedRegimes[p] = regimes[p];
  });
  publishRuntimeState();
  return { prices: prices, regimes: regimes };
}
function buildLegacyPlanContext(){
  var synced = syncPlanInputsToRuntime();
  var prices = synced.prices, regimes = synced.regimes;
  var plannerAcctProfile = buildAcctProfile();
  PAIRS.forEach(function(p){
    var pId=p.replace('/','');
    var prEl=document.getElementById('pr-'+pId);
    var rgEl=document.getElementById('rg-'+pId);
    prices[p]=prEl?( parseFloat(prEl.value)||savedPrices[p]||0 ):( savedPrices[p]||0 );
    prices[p]=Number(prices[p])||0;
    regimes[p]=rgEl?rgEl.value:savedRegimes[p]||'RANGING';
    savedPrices[p]=prices[p];
    savedRegimes[p]=regimes[p];
  });
  if (!acct || !acct.equity) return null;
  var equity=acct.equity;
  var riskPerLadder=equity*0.01;
  var day=Math.floor((new Date()-new Date(START))/86400000);
  var _now = new Date();
  var _regimeMins = lastRegimeFetch ? (_now - lastRegimeFetch) / 60000 : null;
  var _priceMins  = lastFetchTime   ? (_now - lastFetchTime)   / 60000 : null;
  var _staleHTML  = '';
  if (_regimeMins !== null && _regimeMins > 30) _staleHTML += '<div class="alert aw" style="margin-bottom:8px">WARN Regimes last updated ' + Math.floor(_regimeMins) + ' min ago - may be stale. Refresh before executing.</div>';
  if (_priceMins  !== null && _priceMins  > 25) _staleHTML += '<div class="alert aw" style="margin-bottom:8px">WARN Prices last fetched '  + Math.floor(_priceMins)  + ' min ago - refresh before executing.</div>';
  var _manualTs = priceManualTs || 0;
  var _manualStaleHrs = (Date.now() - _manualTs) / 3600000;
  if (_manualTs > 0 && _manualStaleHrs > 4 && !lastFetchTime) {
    _staleHTML += '<div class="alert aw" style="margin-bottom:8px">WARN Prices last manually set ' + Math.round(_manualStaleHrs) + 'h ago - verify before executing.</div>';
  }
  var ts=new Date().toLocaleString('en-GB',{timeZone:'Africa/Johannesburg',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  var gateResults=[];
  var validPairs=[];
  PAIRS.forEach(function(p){
    var mkt=prices[p];
    var regime=regimes[p];
    var isJPY=p.indexOf('JPY')>-1;
    var mult=isJPY?100:10000;
    var levels = getAllLevels(p);
    var blocked=false, blockReason='';
    if(regime==='RANGING'){
      var pNoSlash = p.replace('/','');
      var hasSMCOverride = (liveSignalMap[p] && liveSignalMap[p].sequence_status === 'READY') ||
                           (liveSignalMap[pNoSlash] && liveSignalMap[pNoSlash].sequence_status === 'READY') ||
                           savedSeqStatus[p] === 'READY';
      if(!hasSMCOverride){ blocked=true; blockReason='REGIME: RANGING - no entries'; }
    }
    var runtimeTruth = resolvePairRuntimeSignal(p);
    var pairSigState = runtimeTruth.live_signal || _findLiveSigForPair(p);
    var storedGate = runtimeTruth.gate ? String(runtimeTruth.gate).toUpperCase() : null;
    var storedGateReason = runtimeTruth.gate_reason ? String(runtimeTruth.gate_reason) : '';
    var allowedDir = null;
    if (storedGate === 'SELL' || storedGate === 'BUY' || storedGate === 'BOTH') {
      allowedDir = storedGate;
    } else if (regime === 'TREND DOWN') allowedDir = 'SELL';
    else if (regime === 'TREND UP') allowedDir = 'BUY';
    else if (regime === 'REVERSAL ZONE') allowedDir = 'BOTH';
    if (storedGate === 'NONE') {
      blocked = true;
      blockReason = storedGateReason || 'GATE_NONE';
    }
    if (!allowedDir && !blocked) {
      blocked = true;
      blockReason = storedGateReason || 'GATE_UNAVAILABLE';
    }
    var smcSig=runtimeTruth.runtime_signal || getBestLiveSignalForPair(p,allowedDir==='BOTH'?null:allowedDir) || pairSigState;
    var bestZone = null, bestDist = 99999, bestZoneScore = -9999;
    var smcZone = livePoiZone(smcSig);
    if(smcZone){
      var smcPredictive=(smcSig.direction==='SELL'&&smcZone.price>mkt)||(smcSig.direction==='BUY'&&smcZone.price<mkt);
      if(smcPredictive && (smcSig.setup_class==='A+'||smcSig.setup_class==='A'||smcSig.setup_class==='B')){
        bestZone=smcZone;
        bestDist=Math.abs(mkt-smcZone.price)*mult;
        bestZoneScore=((runtimeTruth.setup_quality!=null?runtimeTruth.setup_quality:smcSig.setup_quality)||0)+(((runtimeTruth.execution_quality!=null?runtimeTruth.execution_quality:smcSig.execution_quality)||0)*0.25);
      }
    }
    if(!bestZone){
      var directionalCandidates = levels.filter(function(lv) {
        if (!lv || lv.side === 'CHOP') return false;
        var dirMatch = false;
        if (allowedDir === 'SELL' && lv.side === 'PREMIUM') dirMatch = true;
        else if (allowedDir === 'BUY' && lv.side === 'DISCOUNT') dirMatch = true;
        else if (allowedDir === 'BOTH' && (lv.side === 'PREMIUM' || lv.side === 'DISCOUNT')) dirMatch = true;
        if (!dirMatch) return false;
        if (allowedDir === 'BOTH') {
          return (lv.side === 'PREMIUM' && lv.price > mkt) || (lv.side === 'DISCOUNT' && lv.price < mkt);
        }
        return isPredictiveLevelForDirection(lv, allowedDir, mkt);
      });
      var efDirectional = directionalCandidates.filter(function(lv) { return isEfEntryLevel(lv); });
      if (efDirectional.length) {
        bestZone = sortStageLevels(efDirectional, allowedDir === 'SELL' ? 'SELL' : 'BUY')[0] || null;
        if (bestZone) {
          bestDist = Math.abs(mkt - bestZone.price) * mult;
          bestZoneScore = plannerZoneScore(p, bestZone, mkt);
        }
      } else {
        directionalCandidates.forEach(function(lv) {
          var dist = Math.abs(mkt - lv.price) * mult;
          var candidateScore=plannerZoneScore(p,lv,mkt);
          if (candidateScore > bestZoneScore) {
            bestZoneScore = candidateScore;
            bestDist = dist;
            bestZone = lv;
          }
        });
      }
    }
    var smcReady = false;
    if(smcSig){
      smcReady = smcSig.authenticated!==false &&
        smcSig.sequence_status==='READY' &&
        smcSig.setup_class!=='BLOCKED' &&
        smcSig.structure &&
        smcSig.structure.internal_shift!==false &&
        smcSig.structure.major_bos!==false &&
        smcSig.poi &&
        smcSig.poi.type;
    } else {
      smcReady = savedSeqStatus[p]==='READY' && regime!=='RANGING';
    }
    var zoneStars = bestZone ? (getStarsForLevel(p, bestZone) || 0) : 0;
    var minStars = bestZone && isEfEntryLevel(bestZone) ? 0 : 1;
    if(bestZone) bestZone.stars = zoneStars;
    var qualifies = !blocked && bestZone && zoneStars >= minStars;

    var gateState;
    if (storedGate === 'BUY' || storedGate === 'SELL' || storedGate === 'BOTH') {
      gateState = 'OPEN';
    } else if (storedGate === 'NONE') {
      gateState = 'BLOCKED';
    } else if (blocked) {
      gateState = 'BLOCKED';
    } else {
      gateState = 'UNAVAILABLE';
    }

    var ch = getChopBand(p);
    var inChop = ch && mkt >= ch.lo && mkt <= ch.hi;
    var chopState = ch ? (inChop ? 'IN_CHOP' : 'CLEAR') : 'N_A';

    var zoneState = bestZone ? 'FOUND' : 'NOT_FOUND';

    var qualificationState, qualificationReason;
    if (qualifies) {
      qualificationState = 'PASS';
      qualificationReason = '';
    } else if (blocked && (storedGate === 'NONE' || !allowedDir)) {
      qualificationState = 'FAIL';
      qualificationReason = 'GATE_NONE';
    } else if (blocked && regime === 'RANGING') {
      qualificationState = 'FAIL';
      qualificationReason = 'RANGING_CONTEXT';
    } else if (inChop) {
      qualificationState = 'FAIL';
      qualificationReason = 'IN_CHOP';
    } else if (!bestZone) {
      qualificationState = 'FAIL';
      qualificationReason = 'NO_ZONE';
    } else if (zoneStars < minStars) {
      qualificationState = 'FAIL';
      qualificationReason = 'STAR_FAIL';
    } else {
      qualificationState = 'FAIL';
      qualificationReason = blockReason || 'BLOCKED';
    }

    var gatePass = qualificationState === 'PASS';

    gateResults.push({
      pair: p,
      regime: runtimeTruth.regime || regime,
      mkt: mkt,
      bestZone: bestZone,
      bestDist: bestDist,
      blocked: blocked,
      blockReason: blockReason,
      gatePass: gatePass,
      targetSide: allowedDir === 'SELL' ? 'PREMIUM' : allowedDir === 'BUY' ? 'DISCOUNT' : 'BOTH',
      smcSignal: smcSig,
      smcReady: smcReady,
      runtimeTruth: runtimeTruth,
      storedGate: storedGate,
      storedGateReason: storedGateReason,
      gateState: gateState,
      chopState: chopState,
      zoneState: zoneState,
      qualificationState: qualificationState,
      qualificationReason: qualificationReason
    });
    gateResults[gateResults.length-1].zoneStars = zoneStars;
    var _edeAnchor = getAuthoritySFAnchor(p);
    gateResults[gateResults.length-1].edeDistance = (bestZone && _edeAnchor)
      ? computeEDEDistance(bestZone.price, _edeAnchor.fibHigh, _edeAnchor.fibLow)
      : 0;
    gateResults[gateResults.length-1].edeLabel = (_edeAnchor && _edeAnchor.source === 'htf_authority_sf') ? 'EDE (HTF SF)' : 'EDE (SF)';
    if(gatePass) validPairs.push(p);
  });
  var ladders=[];
  gateResults.forEach(function(gr){
    if(!gr.gatePass) return;
    var p=gr.pair;
    var isJPY=p.indexOf('JPY')>-1;
    var mult=isJPY?100:10000;
    var dp=isJPY?2:5;
    var mkt=gr.mkt;
    var zone=gr.bestZone;
    var levels = getAllLevels(p);
    var dir = gr.targetSide === 'PREMIUM' ? 'SELL' :
              gr.targetSide === 'DISCOUNT' ? 'BUY' :
              zone.side === 'PREMIUM' ? 'SELL' : 'BUY';
    var pv=getPipValueAccount(p,true)||0.10;
    var pvPerLot=pv*100;
    var nextLevelSL = getNextLevelSL(zone.price, dir, levels, dp);
    var slBase = nextLevelSL !== null
      ? nextLevelSL
      : (dir === 'SELL'
          ? +(zone.price + zone.slBuf).toFixed(dp)
          : +(zone.price - zone.slBuf).toFixed(dp));
    var isJpy = isJPY;
    var minSlDist = isJpy ? 0.40 : 0.0040;
    if (Math.abs(slBase - zone.price) < minSlDist) {
        slBase = dir === 'SELL' ? +(zone.price + minSlDist).toFixed(dp) : +(zone.price - minSlDist).toFixed(dp);
    }
    var slStep = zone.slBuf * 0.5;
    var sortedLevels=levels.slice().sort(function(a,b){return a.price-b.price;});
    sortedLevels = sortedLevels.filter(function(lv){ return !lv.fib || lv.fib.indexOf('EF') === -1; });
    var tp1=null, tp2=null, tp3=null;
    if(dir==='SELL'){
      var below=sortedLevels.filter(function(lv){return lv.price<zone.price&&lv.side!=='CHOP';});
      below.sort(function(a,b){return b.price-a.price;});
      tp1=below[0]||null;
      tp2=below[1]||null;
      tp3=below[2]||tp2||null;
    } else {
      var above=sortedLevels.filter(function(lv){return lv.price>zone.price&&lv.side!=='CHOP';});
      above.sort(function(a,b){return a.price-b.price;});
      tp1=above[0]||null;
      tp2=above[1]||null;
      tp3=above[2]||tp2||null;
    }
    var useStaggered = (document.getElementById('adv-risk')||{}).value !== 'equal';
    var ALLOC = useStaggered ? [0.20, 0.30, 0.50] : [1/3, 1/3, 1/3];
    var entryFramework = buildStageEntryFramework(zone, dir, levels, dp, mkt);
    var entries=[];
    var lotsPerEntry = 0;
    for(var i=0;i<3;i++){
      var entryStage = entryFramework.entries[i];
      var entryPrice = entryStage ? entryStage.entry : buildLegacySpreadEntries(zone.price, dir, dp)[i];
      var stageStop = isEfEntryLevel(zone)
        ? getStageStopData(entryPrice, dir, levels, dp, { preferEf: true, fallbackToAny: false })
        : getStageStopData(entryPrice, dir, levels, dp, { excludeEf: true });
      var fallbackSl = dir==='SELL'
        ? +(slBase + (2-i)*slStep).toFixed(dp)
        : +(slBase - (2-i)*slStep).toFixed(dp);
      var sl_i = stageStop.price !== null ? stageStop.price : fallbackSl;
      if (Math.abs(entryPrice - sl_i) < minSlDist) {
        sl_i = dir === 'SELL' ? +(entryPrice + minSlDist).toFixed(dp) : +(entryPrice - minSlDist).toFixed(dp);
      }
      var slPips=Math.abs(entryPrice-sl_i)*mult;
      var riskForEntry = riskPerLadder * ALLOC[i];
      var entryLots = Math.max(Math.round((riskForEntry/(slPips*pvPerLot))/0.01)*0.01, 0.01);
      if(i===0) lotsPerEntry = entryLots;
      var tp1Pips=tp1?Math.abs(entryPrice-tp1.price)*mult:null;
      var tp2Pips=tp2?Math.abs(entryPrice-tp2.price)*mult:null;
      var rr1=tp1Pips&&slPips?+(tp1Pips/slPips).toFixed(1):null;
      var rr2=tp2Pips&&slPips?+(tp2Pips/slPips).toFixed(1):null;
      var riskUSC=+(slPips*(entryLots/0.01)*pv).toFixed(2);
      var riskZAR=+(riskUSC*ZAR).toFixed(2);
      var distFromMkt=+(Math.abs(entryPrice-mkt)*mult).toFixed(0);
      entries.push({
        entry:entryPrice,sl:sl_i,
        tp1:tp1?+tp1.price.toFixed(dp):null,
        tp2:tp2?+tp2.price.toFixed(dp):null,
        lots:entryLots,slPips:+slPips.toFixed(0),
        tp1Pips:tp1Pips?+tp1Pips.toFixed(0):null,
        tp2Pips:tp2Pips?+tp2Pips.toFixed(0):null,
        rr1:rr1,rr2:rr2,riskUSC:riskUSC,riskZAR:riskZAR,distFromMkt:distFromMkt,
        entry_source: entryStage ? entryStage.source : 'LEGACY_SPREAD',
        entry_label: entryStage ? entryStage.label : (zone.pct || 'ZONE'),
        sl_rule: stageStop.price !== null ? stageStop.rule : 'LEGACY_BUFFER',
        sl_level_label: stageStop.level ? (stageStop.level.pct || stageStop.level.fib || null) : null,
        sl_level_price: stageStop.level ? +Number(stageStop.level.price).toFixed(dp) : null
      });
    }
    var entryPriceArray = entries.map(function(en){ return en ? en.entry : null; });
    var stageSls = entries.map(function(en){ return en ? en.sl : null; });
    var finalStagePlan = buildLegacyStagesFinal(
      p,
      dir,
      entryPriceArray,
      stageSls,
      tp1 ? tp1.price : null,
      tp2 ? tp2.price : null,
      plannerAcctProfile
    );
    var finalStages = finalStagePlan && Array.isArray(finalStagePlan.stages_final) ? finalStagePlan.stages_final : [];
    var stageLots = finalStagePlan && Array.isArray(finalStagePlan.stage_lots) ? finalStagePlan.stage_lots : [];
    var stageRrTargets = [2, 3, 4];

    finalStages.forEach(function(stage, idx){
      if (!stage || !entries[idx]) return;
      var stageLot = stageLots[idx] != null ? Number(stageLots[idx]) : Number(entries[idx].lots || 0);
      var stageSlPips = Number(stage.sl_pips || entries[idx].slPips || 0);
      entries[idx].entry = stage.entry != null ? Number(stage.entry) : entries[idx].entry;
      entries[idx].sl = stage.sl != null ? Number(stage.sl) : entries[idx].sl;
      entries[idx].slPips = isFinite(stageSlPips) ? +stageSlPips.toFixed(1) : entries[idx].slPips;
      entries[idx].rr1 = stage.rr != null ? Number(stage.rr) : entries[idx].rr1;
      entries[idx].lots = isFinite(stageLot) ? stageLot : entries[idx].lots;
      entries[idx].riskUSC = +(entries[idx].slPips * (entries[idx].lots / 0.01) * pv).toFixed(2);
      entries[idx].riskZAR = +(entries[idx].riskUSC * ZAR).toFixed(2);
    });

    var rrFailures = [];
    finalStages.forEach(function(stage, idx){
      if (!stage || !isFinite(Number(stage.rr))) {
        rrFailures.push('E' + (idx + 1) + ' missing R:R');
        return;
      }
      var target = stageRrTargets[idx] || 2;
      if (Number(stage.rr) < target) {
        rrFailures.push('E' + (idx + 1) + ' 1:' + Number(stage.rr).toFixed(2) + ' < 1:' + target.toFixed(2));
      }
    });
    if (rrFailures.length || (finalStagePlan && finalStagePlan.rr_validation_pass === false)) {
      gateResults.forEach(function(gr2){
        if (gr2.pair === p) {
          gr2.gatePass = false;
          gr2.qualificationState = 'FAIL';
          gr2.qualificationReason = 'RR_STAGE_FAIL';
          gr2.blockReason = (gr2.blockReason ? gr2.blockReason + ' | ' : '') +
            'Stage R:R gate fail: ' + rrFailures.join(' | ');
        }
      });
      return;
    }
    var lotsTotal = +(entries.reduce(function(s,e){return s+e.lots;},0)).toFixed(2);
    var totalRisk = +(entries.reduce(function(s,e){return s+e.riskUSC;},0)).toFixed(2);
    ladders.push({
      pair:p,dir:dir,zone:zone,entries:entries,lotsPerEntry:lotsPerEntry,
      lotsTotal:lotsTotal,regime:gr.regime,
      tp1:tp1,tp2:tp2,tp3:tp3,sl:entries[0]?entries[0].sl:slBase,slPipsBase:Math.abs(entries[0].entry-entries[0].sl)*mult,
      totalRisk:totalRisk,
      stageSls: stageSls,
      stagesFinal: finalStages,
      stageTps: finalStagePlan ? finalStagePlan.stage_tps : [],
      stageLots: stageLots,
      monotonicLotPass: finalStagePlan ? !!finalStagePlan.monotonic_lot_pass : true,
      mkt:mkt,dp:dp,isJPY:isJPY,pv:pv,mult:mult,
      entrySource: entryFramework.entrySource,
      fallbackReason: entryFramework.fallbackReason || null,
      slRule: isEfEntryLevel(zone) ? 'STAGE_EF_NEXT_LEVEL' : 'LEGACY_NEXT_LEVEL'
    });
  });
  var checklist=[];
  var checkNum=1;
  var lastOrders=snaps.length?snaps[snaps.length-1].orders||[]:[];
  var scanOrders=lastOrders;
  var cancelOrders=[], noSlOrders=[];
  var addSlGroups = {};
  scanOrders.forEach(function(o){
    var ch=getChopBand(o.pair);
    if(ch&&o.entry>=ch.lo&&o.entry<=ch.hi) cancelOrders.push(o);
    if(!o.sl){
      noSlOrders.push(o);
      var groupKey = o.pair + '|' + (o.type || 'order');
      if(!addSlGroups[groupKey]) addSlGroups[groupKey] = { pair: o.pair, type: o.type, orders: [] };
      addSlGroups[groupKey].orders.push(o);
    }
  });
  if(cancelOrders.length){
    cancelOrders.forEach(function(o){
      checklist.push({type:'cancel',num:checkNum++,
        title:'CANCEL - '+o.pair+' '+o.type.toUpperCase()+' #'+o.id+' @ '+o.entry,
        body:'Entry '+o.entry+' sits inside F3 yearly chop zone (37.5%-62.5%). Hard block Phase 1. Cancel before session opens.'});
    });
  }
  if(noSlOrders.length){
    Object.values(addSlGroups).forEach(function(group){
      var orders = group.orders || [];
      var count = orders.length;
      if(!count) return;
      var shownOrders = orders.slice(0, 4);
      var parts = shownOrders.map(function(o){
        return (o.type || 'order') + ' #' + o.id + ' @ ' + o.entry;
      });
      var orderList = parts[0] || '';
      if(parts.length > 1){
        orderList = parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
      }
      if(count > 5){
        orderList += ' + ' + (count - 4) + ' more';
      }
      var title = count === 1
        ? 'ADD SL - ' + group.pair + ': ' + orderList
        : 'ADD SL - ' + group.pair + ' - ' + count + ' positions: ' + orderList;
      checklist.push({
        type:'add',
        num:checkNum++,
        title:title,
        body:'No stop-loss set. Compute SL using the next fib level beyond entry per the Next-Level SL Rule (IR-01). No order may exist without a stop-loss.'
      });
    });
  }
  ladders.forEach(function(ld){
    var isJPY=ld.pair.indexOf('JPY')>-1;
    var mult=isJPY?100:10000;
    var tol=isJPY?TOL_JPY:TOL_USD;
    var dp=ld.dp;
    var pv=ld.pv;
    var tp1str=ld.tp1?ld.tp1.price.toFixed(dp):'--';
    var tp2str=ld.tp2?ld.tp2.price.toFixed(dp):'--';
    var tp3str=ld.tp3?ld.tp3.price.toFixed(dp):'--';
    var dirType=ld.dir==='SELL'?'sell':'buy';
    var matchingOrders=scanOrders.filter(function(o){
      if(!o.pair||o.pair!==ld.pair) return false;
      if(o.type.indexOf(dirType)===-1) return false;
      var nearZone=ld.entries.some(function(en){
        return Math.abs(o.entry-en.entry)*mult <= tol*2;
      });
      var nearZonePrice=Math.abs(o.entry-ld.zone.price)*mult <= tol*3;
      return nearZone||nearZonePrice;
    });
    if(matchingOrders.length===0){
      checklist.push({type:'place',num:checkNum++,
        title:'PLACE - '+ld.pair+' '+ld.dir+' LADDER ('+ld.lotsTotal+' lots across 3 entries)',
        body:ld.zone.pct+' zone ('+ld.zone.price.toFixed(dp)+') | '+ld.zone.fib+' | '+ld.regime+' | SL: '+ld.sl.toFixed(dp)+' | TP1: '+tp1str+' | TP2: '+tp2str+' | TP3 (major): '+tp3str+' | Total risk: '+ld.totalRisk.toFixed(2)+' USC'});
    } else {
      var issues=[];
      var totalExistingLots=matchingOrders.reduce(function(s,o){return s+o.lots;},0);
      var expectedLots=ld.lotsTotal;
      if(Math.abs(totalExistingLots-expectedLots)>0.02){
        var riskActual=(matchingOrders[0]?(Math.abs(matchingOrders[0].entry-(matchingOrders[0].sl||ld.sl))*mult*(matchingOrders[0].lots/0.01)*pv).toFixed(2):0);
        issues.push('Lots: '+totalExistingLots.toFixed(2)+' placed vs '+expectedLots.toFixed(2)+' required by 1% rule ('+matchingOrders.length+' orders)');
      }
      matchingOrders.forEach(function(o){
        if(!o.sl) issues.push('Order #'+o.id+' has NO stop-loss');
        else {
          var slDist=Math.abs(o.entry-o.sl)*mult;
          if(slDist<5) issues.push('Order #'+o.id+' SL only '+slDist.toFixed(0)+'p - very tight');
        }
      });
      if(matchingOrders.length<3) issues.push('Only '+matchingOrders.length+'/3 ladder entries placed');
      if(issues.length>0){
        checklist.push({type:'review',num:checkNum++,
          title:'REVIEW - '+ld.pair+' '+ld.dir+' LADDER ('+matchingOrders.length+' orders placed)',
          body:issues.join(' | ')});
      } else {
        checklist.push({type:'done',num:checkNum++,
          title:'PLACED - '+ld.pair+' '+ld.dir+' LADDER ('+matchingOrders.length+'/3 orders active)',
          body:ld.zone.pct+' zone ('+ld.zone.price.toFixed(dp)+') | '+totalExistingLots.toFixed(2)+' lots | SL: '+ld.sl.toFixed(dp)+' | TP1: '+tp1str+' | TP2: '+tp2str+' | TP3: '+tp3str+' | Awaiting fill'});
      }
    }
  });
  var tightenPositions=curPos.filter(function(p){
    if(p.dir!=='SELL') return false;
    var slDist=Math.abs(p.entry-p.sl)*10000;
    var profit=p.profit>0;
    return slDist>300&&profit;
  });
  if(tightenPositions.length>5){
    checklist.push({type:'tighten',num:checkNum++,
      title:'TIGHTEN - '+tightenPositions.length+' open sell positions have SL > 300 pips from entry',
      body:'With 10% equity milestone locked, tighten Jan-Feb sell cluster SLs from 1.3950 to 1.3750. Protects 300+ pips of floating profit per position. NEVER widen - only move SLs toward entry.'});
  }
  var monitorBuckets = {
    CHOP_BLOCKED: [],
    RANGING: [],
    OPEN_GATE_NO_ZONE: [],
    OTHER: []
  };
  gateResults.filter(function(gr){ return !gr.gatePass; }).forEach(function(gr){
    var reason = String(gr.qualificationReason || gr.blockReason || gr.gateReason || '').toUpperCase();
    var regimeLabel = String(gr.regime || '').toUpperCase();
    var bucket = 'OTHER';
    if(reason.indexOf('CHOP') > -1 || reason.indexOf('IN_CHOP') > -1 || regimeLabel.indexOf('CHOP') > -1){
      bucket = 'CHOP_BLOCKED';
    } else if(reason.indexOf('RANG') > -1 || regimeLabel.indexOf('RANGING') > -1 || reason.indexOf('NO_TREND') > -1){
      bucket = 'RANGING';
    } else if((String(gr.gateState || '').toUpperCase() === 'OPEN' && reason.indexOf('NO_ZONE') > -1) || reason.indexOf('OPEN_GATE_NO_ZONE') > -1){
      bucket = 'OPEN_GATE_NO_ZONE';
    }
    if(monitorBuckets[bucket].indexOf(gr.pair) === -1) monitorBuckets[bucket].push(gr.pair);
  });
  if(monitorBuckets.CHOP_BLOCKED.length){
    checklist.push({type:'note',num:checkNum++,
      title:'MONITOR ONLY &mdash; CHOP BLOCKED: '+monitorBuckets.CHOP_BLOCKED.join(', '),
      body:'Pairs inside F3 yearly chop zone. No entries until price exits zone.'});
  }
  if(monitorBuckets.RANGING.length){
    checklist.push({type:'note',num:checkNum++,
      title:'MONITOR ONLY &mdash; RANGING: '+monitorBuckets.RANGING.join(', '),
      body:'Pairs ranging. No directional confirmation. Set price alerts at zone boundaries.'});
  }
  if(monitorBuckets.OPEN_GATE_NO_ZONE.length){
    checklist.push({type:'note',num:checkNum++,
      title:'MONITOR ONLY &mdash; OPEN GATE, NO ZONE: '+monitorBuckets.OPEN_GATE_NO_ZONE.join(', '),
      body:'Gate open but no execution zone qualified. Monitor for zone formation.'});
  }
  if(monitorBuckets.OTHER.length){
    checklist.push({type:'note',num:checkNum++,
      title:'MONITOR ONLY &mdash; OTHER: '+monitorBuckets.OTHER.join(', '),
      body:'Pairs are blocked by non-qualifying gate conditions. Monitor until constraints clear.'});
  }
  var h=new Date(new Date().toLocaleString('en-US',{timeZone:'Africa/Johannesburg'})).getHours();
  var hm=h+new Date(new Date().toLocaleString('en-US',{timeZone:'Africa/Johannesburg'})).getMinutes()/60;
  var inKZ=(hm>=8&&hm<11)||(hm>=14&&hm<17)||(hm>=19.5&&hm<22);
  var verdict, verdictClass, verdictBody;
  if(ladders.length===0){
    verdict='NO TRADE'; verdictClass='verdict-no';
    var _openButNoZone    = gateResults.filter(function(gr){ return gr.gateState==='OPEN' && gr.qualificationReason==='NO_ZONE'; }).length;
    var _openButStarFail  = gateResults.filter(function(gr){ return gr.gateState==='OPEN' && gr.qualificationReason==='STAR_FAIL'; }).length;
    var _openButRRFail    = gateResults.filter(function(gr){ return gr.gateState==='OPEN' && gr.qualificationReason==='RR_FAIL'; }).length;
    var _blockedInChop    = gateResults.filter(function(gr){ return gr.qualificationReason==='IN_CHOP'; }).length;
    var _blockedByGate    = gateResults.filter(function(gr){ return gr.qualificationReason==='GATE_NONE'; }).length;
    var _ranging          = gateResults.filter(function(gr){ return gr.qualificationReason==='RANGING_CONTEXT'; }).length;
    var _openTotal        = _openButNoZone + _openButStarFail + _openButRRFail;
    if(_openButRRFail > 0 && _openButRRFail >= _openTotal){
      verdict='NO ACTIONABLE LADDER'; verdictClass='verdict-no';
      verdictBody='Structural gates are open on '+(_openTotal)+' pair'+((_openTotal>1)?'s':'')+', but current candidate ladders fail the minimum 2:1 R:R gate. Wait for price to reach a deeper qualifying zone.';
    } else if(_openButNoZone > 0 || _openButStarFail > 0){
      verdict='NO TRADE YET'; verdictClass='verdict-no';
      verdictBody='Gates are open on '+_openTotal+' pair'+((_openTotal>1)?'s':'')+', but no qualifying SF zones are currently in play. Monitor and wait for price to approach a valid premium or discount zone.';
    } else if(_ranging > 0 || _blockedByGate > 0 || _blockedInChop > 0){
      verdictBody='All monitored pairs are currently blocked: '+_ranging+' ranging, '+_blockedByGate+' gate-blocked, '+_blockedInChop+' in chop. No entries until gate conditions change.';
    } else {
      verdictBody='No valid SF zones qualify for entry. Wait for price to reach a premium or discount zone outside the chop band.';
    }
  } else if(inKZ){
    verdict='EXECUTE - KILL ZONE ACTIVE'; verdictClass='verdict-exec';
    verdictBody='You are inside an active Kill Zone. '+ladders.length+' valid ladder'+(ladders.length>1?'s':'')+' identified. Place pending limit orders now. Orders sit at zones 440-2,340 pips from market - they will wait for price to reach them.';
  } else {
    verdict='PLACE ORDERS - AWAIT KILL ZONE'; verdictClass='verdict-wait';
    verdictBody=ladders.length+' valid ladder'+(ladders.length>1?'s':'')+' identified. Place pending limit orders now so they are ready when price reaches the zone during a Kill Zone window. Next KZ: '+nextKZ()+'.';
  }

  return {
    staleHtml: _staleHTML,
    verdict: verdict,
    verdictClass: verdictClass,
    verdictBody: verdictBody,
    checklist: checklist,
    gateResults: gateResults,
    ladders: ladders,
    equity: equity,
    riskPerLadder: riskPerLadder,
    day: day,
    ts: ts,
    prices: prices,
    regimes: regimes
  };
}

function generatePlan(){
  var synced = syncPlanInputsToRuntime();
  var runtime = getRuntimeState();
  var bridge = window.SniperDashboardData;
  var planner = window.SniperDashboardPlanner;
  var canonicalSignals = bridge && typeof bridge.getSignals === 'function'
    ? bridge.getSignals()
    : [];

  var planContext = null;
  try { planContext = buildLegacyPlanContext(); } catch(e) { /* non-fatal */ }

  if (planner && typeof planner.renderPlanFromState === 'function') {
    try {
      if (planner.renderPlanFromState({
        signals: Array.isArray(canonicalSignals) ? canonicalSignals.slice() : [],
        liveSignals: runtime.liveSignals.slice(),
        blueprints: runtime.tradeQueue.slice(),
        acct: runtime.acct,
        prices: Object.assign({}, synced.prices),
        regimes: Object.assign({}, synced.regimes),
        computedSignals: Object.assign({}, runtime.computedSignals),
        fibTimeframe: runtime.FIB_TIMEFRAME,
        renderServerBlueprintPlan: renderServerBlueprintPlan,
        statePill: statePill,
        planContext: planContext
      })) {
        return true;
      }
    } catch (err) {
      console.warn('SniperDashboardPlanner.renderPlanFromState failed:', err && err.message ? err.message : err);
    }
  }

  return legacyGeneratePlan();
}
// ── generatePlan() with updated thresholds (SCORE_THRESHOLD = 3, MIN_RR_THRESHOLD = 2.0, minStars = 1) ──
function sourceWithBackendExecutionContract(runtimeTruth){
  var candidates = runtimeTruth ? [
    runtimeTruth.live_signal,
    runtimeTruth.runtime_signal,
    runtimeTruth.runtime_snapshot,
    runtimeTruth.regime_meta
  ] : [];
  for(var i=0;i<candidates.length;i++){
    var src = candidates[i];
    if(!src || typeof src !== 'object') continue;
    if(src.final_bias && src.matrix && typeof src.matrix === 'object' && src.pd_array && typeof src.pd_array === 'object'){
      return src;
    }
  }
  return null;
}
function legacyExecutionPayloadFromLadder(ld, gateResult){
  var runtimeTruth = gateResult && gateResult.runtimeTruth ? gateResult.runtimeTruth : resolvePairRuntimeSignal(ld.pair);
  var contractSource = sourceWithBackendExecutionContract(runtimeTruth);
  var gate = runtimeTruth && runtimeTruth.gate ? String(runtimeTruth.gate).toUpperCase() : null;
  if(!contractSource || !gate || gate === 'NONE') return null;
  var payload = {
    pair      : ld.pair,
    direction : ld.dir,
    regime    : runtimeTruth.regime || ld.regime,
    sequence_status: runtimeTruth.sequence_status || 'READY',
    signal_state: runtimeTruth.signal_state || 'ACTIVE',
    entry_zone_price: ld.zone ? ld.zone.price : null,
    entry_zone_label: ld.zone ? ((ld.zone.pct || 'ZONE') + ' | ' + (ld.zone.fib || 'PLAN')) : '',
    market_price: ld.mkt,
    sl        : ld.sl,
    tp1       : ld.tp1 ? ld.tp1.price   : null,
    tp2       : ld.tp2 ? ld.tp2.price   : null,
    entries   : ld.entries,
    confluence_score: ld.score || null,
    ede_stars: ld.stars != null ? ld.stars : null,
    final_bias: contractSource.final_bias,
    matrix: contractSource.matrix,
    matrix_tf: contractSource.matrix_tf || null,
    pd_array: contractSource.pd_array,
    pd_tf: contractSource.pd_tf || null,
    gate: gate,
    gate_reason: runtimeTruth.gate_reason || contractSource.gate_reason || null,
    fib_timeframe: contractSource.fib_timeframe || FIB_TIMEFRAME,
    chop_band: runtimeTruth.chop_band || contractSource.chop_band || null,
    anchors: contractSource.anchors || null,
    levels: Array.isArray(contractSource.levels) ? contractSource.levels : [],
    model_tag: 'PLAN_GENERATOR',
    signal_schema_version: SIGNAL_SCHEMA.version,
    engine_version: SIGNAL_SCHEMA.engine
  };
  var identity = buildExecutionSignalIdentity(payload);
  payload.signal_id = identity.signal_id;
  payload.signal_hash = identity.signal_hash;
  return payload;
}
function legacyGeneratePlan(renderOnly){
  var ctx = buildLegacyPlanContext();
  if (!ctx) {
    document.getElementById('plan-output').style.display = 'block';
    document.getElementById('plan-verdict').innerHTML = '<div class="alert aw"><span style="font-size:18px">! </span><strong>Upload your IFX account report (.xlsx) to generate a signal plan.</strong> Equity is required to calculate lot sizes and risk.</div>';
    document.getElementById('plan-ladders').innerHTML   = '';
    document.getElementById('plan-checklist').innerHTML = '';
    document.getElementById('plan-risk').innerHTML      = '';
    document.getElementById('plan-gates').innerHTML     = '';
    return;
  }
  var _hasPrices = PAIRS.some(function(p){ return savedPrices[p] && savedPrices[p] > 0; });
  if (!_hasPrices) xtoast('⚠ WARNING No prices set - enter current prices or fetch via Twelve Data before generating a plan', 'warn');
  document.getElementById('plan-equity-note').textContent = 'Equity: ' + ctx.equity.toLocaleString() + ' USC - 1% risk = ' + ctx.riskPerLadder.toFixed(2) + ' USC per ladder';

  var gateResults = ctx.gateResults;
  var ladders = ctx.ladders;
  var checklist = ctx.checklist;
  var verdict = ctx.verdict;
  var verdictClass = ctx.verdictClass;
  var verdictBody = ctx.verdictBody;
  var _staleHTML = ctx.staleHtml;
  var equity = ctx.equity;
  var riskPerLadder = ctx.riskPerLadder;
  var day = ctx.day;
  var ts = ctx.ts;
  var prices = ctx.prices;
  var regimes = ctx.regimes;
  var _acctProfile = buildAcctProfile();
  var _riskBreakdowns = {};
  ladders.forEach(function(ld) {
    var entryPriceArray = [
      ld.entries[0] ? ld.entries[0].entry : null,
      ld.entries[1] ? ld.entries[1].entry : null,
      ld.entries[2] ? ld.entries[2].entry : null
    ];
    _riskBreakdowns[ld.pair + '_' + ld.dir] = buildRiskBreakdown(
      ld.pair,
      entryPriceArray,
      ld.sl,
      _acctProfile,
      ld.stageSls,
      ld.stagesFinal,
      ld.stageLots
    );
  });

  // ── Phase 4: Send to server-side execution engine ────────────────────────
  if (!renderOnly && _acctProfile && ladders.length > 0) {
    var gateByPair = {};
    gateResults.forEach(function(gr){ if(gr && gr.pair) gateByPair[gr.pair] = gr; });
    var _rawSignals = ladders.map(function(ld) {
      return legacyExecutionPayloadFromLadder(ld, gateByPair[ld.pair]);
    }).filter(Boolean);
    if (!_rawSignals.length) {
      if (typeof xtoast === 'function') xtoast('Backend execution skipped - missing authoritative gate context for legacy plan fallback', 'warn');
    }
    if (_rawSignals.length) {
      apiPost('user/execute-signals', {
        signals : _rawSignals,
        zar_rate: ZAR
      }).then(function(response) {
      if (response && response.blueprints && response.blueprints.length > 0) {
        tradeQueue = response.blueprints;
        renderTradeQueue();
        response.blueprints.forEach(function(bp) {
          var key = bp.pair + '_' + bp.direction;
          if (_riskBreakdowns[key]) {
            _riskBreakdowns[key]._engine_validated = true;
            _riskBreakdowns[key]._engine_bp = bp;
          }
        });
        renderServerBlueprintPlan({
          staleHtml: ctx.staleHtml,
          verdict: ctx.verdict,
          verdictClass: ctx.verdictClass,
          verdictBody: ctx.verdictBody,
          checklist: ctx.checklist,
          gateResults: ctx.gateResults,
          ladders: ctx.ladders,
          equity: ctx.equity,
          day: ctx.day,
          ts: ctx.ts,
          prices: ctx.prices,
          regimes: ctx.regimes
        }, response.blueprints);
      }
      }).catch(function(err) {
        console.warn('[SNIPER] execute-signals engine unavailable:', err.message);
      });
    }
  }
  var _activeBlueprints = getActivePhpBlueprints();
  if (_activeBlueprints.length) {
    renderPlan({context:{
      staleHtml:_staleHTML,verdict:verdict,verdictClass:verdictClass,verdictBody:verdictBody,
      checklist:checklist,gateResults:gateResults,ladders:ladders,equity:equity,day:day,ts:ts,prices:prices,regimes:regimes
    }, blueprints:_activeBlueprints}, 'BACKEND_BLUEPRINT');
    return;
  }
  var _provenanceFreshMins = lastRegimeFetch ? Math.floor((new Date() - lastRegimeFetch) / 60000) : null;
  var _provenanceRegimeLabel = _provenanceFreshMins === null ? 'unknown' : _provenanceFreshMins > 30 ? 'stale (' + _provenanceFreshMins + ' min ago)' : 'live';
  document.getElementById('plan-output').style.display='block';
  document.getElementById('plan-verdict').innerHTML=
    _staleHTML +
    '<div class="verdict-box '+verdictClass+'">' +
    '<div class="verdict-lbl" style="color:'+(verdict.indexOf('EXECUTE')===0?'var(--gr)':verdict.indexOf('NO')===0?'var(--re)':'var(--am)')+'">'+verdict+'</div>'+
    '<div class="verdict-body">'+verdictBody+'<br><span style="color:var(--ac)">'+provenanceTag(lastRegimeFetch ? 'HYBRID_RUNTIME' : 'JS_ONLY')+' '+(lastRegimeFetch ? 'Backend regime ' + _provenanceRegimeLabel + ' · local qualification' : 'Local engine only')+' </span></div></div>';
  document.getElementById('plan-checklist').innerHTML=renderChecklist(checklist);
  document.getElementById('plan-ladders').innerHTML=ladders.map(function(ld){
    var dirColor=ld.dir==='SELL'?'var(--re)':'var(--gr)';
    var starDisp=ld.zone.stars===null?'NO DATA':ld.zone.stars===3?'3-STAR':ld.zone.stars===2?'2-STAR':ld.zone.stars>=1?'1-STAR':'&mdash;';
    var starCls=ld.zone.stars===3?'s3':'s2';
    var regCls=ld.regime==='TREND DOWN'?'rdn':ld.regime==='TREND UP'?'rup':ld.regime==='REVERSAL ZONE'?'rrv':'rrg';
    var tp1str=ld.tp1?ld.entries[0].tp1+' ('+ld.tp1.pct+')':'&mdash;';
    var tp2str=ld.tp2?ld.entries[0].tp2+' ('+ld.tp2.pct+')':'&mdash;';
    var entriesHTML='<div class="entry-row">'+
      '<div class="entry-head entry-cell">#</div>'+
      ['Entry','SL','TP1','TP2','Lots','SL Pips','Risk USC','Risk ZAR','R:R'].map(function(h){return '<div class="entry-head entry-cell">'+h+'</div>';}).join('')+'</div>';
    ld.entries.forEach(function(en,i){
      var rr=en.rr1&&en.rr2?'1:'+en.rr1+' / 1:'+en.rr2:en.rr1?'1:'+en.rr1:'&mdash;';
      var rrColor = 'var(--dm)';
      if (en.rr1 !== null && en.rr1 !== undefined) {
        if (en.rr1 >= 2.0)       rrColor = 'var(--gr)';
        else if (en.rr1 >= 1.5)  rrColor = 'var(--am)';
        else                     rrColor = 'var(--re)';
      }
      entriesHTML+='<div class="entry-row">' +
        '<div class="entry-cell" style="color:var(--mu)">'+(i+1)+'</div>'+
        '<div class="entry-cell mn">'+en.entry.toFixed(ld.dp)+'</div>'+
        '<div class="entry-cell mn neg">'+en.sl.toFixed(ld.dp)+'</div>'+
        '<div class="entry-cell mn pos">'+(en.tp1?en.tp1.toFixed(ld.dp):'&mdash;')+'</div>'+
        '<div class="entry-cell mn" style="color:var(--dm)">'+(en.tp2?en.tp2.toFixed(ld.dp):'&mdash;')+'</div>'+
        '<div class="entry-cell mn">'+en.lots+'</div>'+
        '<div class="entry-cell mn">'+en.slPips+'p</div>'+
        '<div class="entry-cell mn wrn">'+en.riskUSC+'</div>'+
        '<div class="entry-cell mn">R'+en.riskZAR+'</div>'+
        '<div class="entry-cell mn" style="color:'+rrColor+';font-weight:700">'+rr+'</div></div>';
    });
    var totalRiskZAR=+(ld.totalRisk*ZAR).toFixed(2);
    return '<div class="ladder-table">' +
      '<div class="ladder-header">' +
        '<div>' +
          '<span class="ladder-title" style="color:'+dirColor+'">'+ld.pair+' '+ld.dir+' LADDER</span>' +
          '&nbsp;&nbsp;<span class="'+starCls+'" style="font-family:var(--mo);font-weight:700">'+starDisp+'</span>' +
          '&nbsp;&nbsp;<span class="'+regCls+'">'+ld.regime+'</span>' +
          '&nbsp;&nbsp;<span class="pgy pill">'+ld.zone.fib+'</span>'+
        '</div>'+
        '<div class="ladder-meta">'+
          'Zone: '+ld.zone.pct+' @ '+ld.zone.price.toFixed(ld.dp)+
          ' &nbsp;|&nbsp; Market: '+ld.mkt.toFixed(ld.dp)+
          ' &nbsp;|&nbsp; Total lots: '+ld.lotsTotal+
          ' &nbsp;|&nbsp; Total risk: '+ld.totalRisk+' USC (R'+totalRiskZAR+')'+
          ' &nbsp;|&nbsp; TP1: '+tp1str+' &nbsp;|&nbsp; TP2: '+tp2str+
        '</div>'+
      '</div>'+
      entriesHTML+buildTPManagement(ld)+_buildRiskSection(ld, _riskBreakdowns[ld.pair + '_' + ld.dir])+
    '</div>';
  }).join('');
  var totalMaxRisk=ladders.reduce(function(s,ld){return s+ld.totalRisk;},0);
  var riskPct=(totalMaxRisk/equity*100).toFixed(1);
  document.getElementById('plan-risk').innerHTML=
    '<div class="card gb"><div class="clbl">Ladders</div><div class="cval" style="color:var(--ac)">'+ladders.length+'</div><div class="csub">Valid signal plans</div></div>'+
    '<div class="card"><div class="clbl">Total Max Risk</div><div class="cval wrn">'+totalMaxRisk.toFixed(2)+'</div><div class="csub">USC &middot; R'+(totalMaxRisk*ZAR).toFixed(2)+' &middot; '+riskPct+'% equity</div></div>'+
    '<div class="card"><div class="clbl">Equity</div><div class="cval pos">'+equity.toLocaleString()+'</div><div class="csub">USC &middot; Phase 1 Recovery</div></div>'+
    '<div class="card"><div class="clbl">Real Correlated Risk</div><div class="cval pos">~'+(totalMaxRisk/3).toFixed(0)+'</div><div class="csub">USC (2-3 fills typical)</div></div>';
  document.getElementById('plan-gates').innerHTML=gateResults.map(function(gr){
    var runtimeTruth = gr.runtimeTruth || resolvePairRuntimeSignal(gr.pair);
    var resolvedRegime = runtimeTruth.regime || gr.regime;
    var regCls=resolvedRegime==='TREND DOWN'?'rdn':resolvedRegime==='TREND UP'?'rup':resolvedRegime==='REVERSAL ZONE'?'rrv':'rrg';
    var isJPY=gr.pair.indexOf('JPY')>-1;
    var dp=isJPY?2:5;
    var zoneStr=gr.bestZone?(gr.bestZone.pct+' @ '+gr.bestZone.price.toFixed(dp)):'None';
    var distStr=gr.bestZone?gr.bestDist.toFixed(0)+'p':'--';
    var ch=(runtimeTruth.chop_band&&runtimeTruth.chop_band.low!=null&&runtimeTruth.chop_band.high!=null)?{lo:runtimeTruth.chop_band.low,hi:runtimeTruth.chop_band.high}:getChopBand(gr.pair);
    var chopStr=ch?((gr.mkt>=ch.lo&&gr.mkt<=ch.hi)?'<span class="pr2 pill">IN CHOP</span>':'<span class="pg2 pill">Clear</span>'):'<span class="pgy pill">N/A</span>';
    var gateStateSrc = gr.gateState || (gr.gatePass ? 'OPEN' : 'BLOCKED');
    var qualReason = gr.qualificationReason || '';
    var qualState = gr.qualificationState || (gr.gatePass ? 'PASS' : 'FAIL');
    var gateStateColor = gateStateSrc === 'OPEN' ? 'var(--gr)' : gateStateSrc === 'BLOCKED' ? 'var(--re)' : 'var(--mu)';
    var gateStatePill = '<span class="pgy pill" style="color:' + gateStateColor + '">' + gateStateSrc + '</span>';
    var qualPill = '';
    if(qualState === 'PASS'){
      qualPill = ' <span class="pg2 pill">PASS</span>';
    } else if(qualReason){
      qualPill = ' <span class="pr2 pill">' + qualReason + '</span>';
    }
    var rowClass = qualState === 'PASS' ? 'rg' : (gateStateSrc === 'OPEN' ? '' : 'rr');
    return '<tr class="'+rowClass+'">' +
      '<td class="mn"><strong>'+gr.pair+'</strong>       </td>'+
      '<td><span class="'+regCls+'">'+(resolvedRegime||'NO DATA')+'</span></td>'+
      '<td class="mn">'+( gr.mkt != null ? gr.mkt.toFixed(dp) : '--' )+'</td>'+
      '<td class="mn" style="color:'+(gr.targetSide==='PREMIUM'?'var(--re)':'var(--gr)')+'">'+
        gr.targetSide + (gr.storedGate ? ' <span class="pgy pill" style="font-size:9px">' + gr.storedGate + '</span>' : '')+
      '</td>'+
      '<td class="mn wrn">'+zoneStr+'</td>'+
      '<td class="mn">'+distStr+'</td>'+
      '<td>'+chopStr+'</td>'+
      '<td>'+gateStatePill+qualPill+'</td>'+
      '<td class="mn">'+(gr.zoneStars != null ? gr.zoneStars + ' star' : '--')+'</td>'+
      '<td class="mn" title="'+(gr.edeLabel || 'EDE (SF)')+'">'+(gr.edeDistance != null ? gr.edeDistance.toFixed(3) : '--')+'</td>'+
    '</tr>';
  }).join('');
  window._lastPlan={ladders:ladders,checklist:checklist,verdict:verdict,gateResults:gateResults,equity:equity,riskPerLadder:riskPerLadder,day:day,ts:ts,prices:prices,regimes:regimes};
xtoast('Signal plan generated - '+ladders.length+' ladders, '+checklist.filter(function(c){return c.type==='place';}).length+' orders to place','ok');
}
function nextKZ(){
  var nyNow=new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'}));
  var nyH=nyNow.getHours()+nyNow.getMinutes()/60;
  if(nyH<2)    return 'London 02:00 NY (08:00-09:00 SAST, DST-dependent)';
  if(nyH<8)    return 'New York 08:00 NY (14:00-15:00 SAST, DST-dependent)';
  if(nyH<13.5) return 'NY PM 13:30 NY (19:30-20:30 SAST, DST-dependent)';
  return 'London 02:00 NY tomorrow';
}
function buildExportTPManagement(ld) {
  var dp = ld.dp;
  var levels = getAllLevels(ld.pair);
  var dir = ld.dir;
  var sorted = levels.slice().sort(function(a,b){return a.price-b.price;});
  var targets = dir==='SELL'
    ? sorted.filter(function(lv){return lv.price < ld.zone.price-0.0001;}).sort(function(a,b){return b.price-a.price;})
    : sorted.filter(function(lv){return lv.price > ld.zone.price+0.0001;}).sort(function(a,b){return a.price-b.price;});
  var tp1=targets[0]||null, tp2=targets[1]||null, tp3=targets[2]||tp2||null;
  function fmt(tp) { return tp ? tp.price.toFixed(dp)+' ('+tp.pct+')' : '--'; }
  function rr(e,tp,sl) {
    if(!tp) return '--';
    var tpDist = Math.abs(e - tp.price) * ld.mult;
    var slDist = Math.abs(e - sl) * ld.mult;
    if(slDist === 0) return '--';
    return '1:' + (tpDist / slDist).toFixed(1);
  }
  function usc(e,tp,lots) {
    if(!tp) return '--';
    return '+'+(Math.abs(e-tp.price)*ld.mult*(lots/0.01)*ld.pv).toFixed(0)+' USC';
  }
  var e1=ld.entries[0].entry, e2=ld.entries[1]?ld.entries[1].entry:e1, e3=ld.entries[2]?ld.entries[2].entry:e2;
  var sl=ld.sl, lots=ld.lotsPerEntry;
  var html='<div style="background:#1a1d2a;border-top:1px solid #28334a;padding:14px">';
  html+='<div style="font-family:monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#4a5568;margin-bottom:12px">TP Assignment - v7.3 Simplified - 1 Position = 1 TP - Broker Rule</div>';
  var scenarios=[
    {label:'IF 3 FILL',color:'#1fdb7a',desc:'Full ladder - all 3 positions open',p1:tp1,p2:tp2,p3:tp3},
    {label:'IF 2 FILL',color:'#f5a623',desc:'Shallow + Mid only',p1:tp2,p2:tp3,p3:null},
    {label:'IF 1 FILL',color:'#3d8ef5',desc:'Shallow only - run it all the way',p1:tp3,p2:null,p3:null}
  ];
  scenarios.forEach(function(sc){
    html+='<div style="background:#111620;border-radius:5px;padding:10px 12px;margin-bottom:8px;border-left:3px solid '+sc.color+'">';
    html+='<div style="display:flex;justify-content:space-between;margin-bottom:8px">';
    html+='<span style="font-family:monospace;font-size:11px;font-weight:700;color:'+sc.color+'">'+sc.label+'</span>';
    html+='<span style="font-family:monospace;font-size:10px;color:#4a5568">'+sc.desc+'</span></div>';
    html+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">';
    [[e1,sc.p1,'Shallow (P1)'],[e2,sc.p2,'Mid (P2)'],[e3,sc.p3,'Deep (P3)']].forEach(function(row){
      html+='<div style="background:#161d2a;border-radius:3px;padding:6px 8px">';
      html+='<div style="font-family:monospace;font-size:9px;color:#4a5568;margin-bottom:2px">'+row[2]+'</div>';
      if(row[1]) {
        html+='<div style="font-family:monospace;font-size:10px;color:#1fdb7a;font-weight:700">'+fmt(row[1])+'</div>';
        html+='<div style="font-family:monospace;font-size:9px;color:#8899b0">'+usc(row[0],row[1],lots)+' | '+rr(row[0],row[1],sl)+'</div>';
      } else {
        html+='<div style="color:#4a5568;font-size:10px">--</div>';
      }
      html+='</div>';
    });
    html+='</div></div>';
  });
  var tp1str=fmt(tp1);
  html+='<div style="font-family:monospace;font-size:9px;color:#4a5568;margin-top:6px;line-height:1.6">';
  html+='BE PROTECTION: Shallow TP hit -> move Mid+Deep SL to entry | Mid TP hit -> move Deep SL to '+tp1str+' | Never widen';
  html+='</div></div>';
  return html;
}
function exportPlanHTML(){
  if(!window._lastPlan){xtoast('⚠ WARNING Generate plan first','warn');return;}
  var P=window._lastPlan;
  var equity=P.equity;
  var day=P.day;
  var ts=P.ts;
  var laddersHTML=P.ladders.map(function(ld){
    var dirColor=ld.dir==='SELL'?'#f5414f':'#1fdb7a';
    var starDisp=ld.zone.stars===3?'⭐⭐⭐':ld.zone.stars===2?'⭐⭐':'⭐';
    var tp1str=ld.tp1?ld.entries[0].tp1+' ('+ld.tp1.pct+')':'—';
    var tp2str=ld.tp2?ld.entries[0].tp2+' ('+ld.tp2.pct+')':'—';
    var totalRiskZAR=+(ld.totalRisk*ZAR).toFixed(2);
    var rows=ld.entries.map(function(en,i){
      var rr=en.rr1&&en.rr2?'1:'+en.rr1+' / 1:'+en.rr2:en.rr1?'1:'+en.rr1:'—';
      return '<tr style="border-bottom:1px solid #1e2738">'+
        '<td style="padding:7px 10px;color:#4a5568;font-family:monospace">'+(i+1)+'</td>'+
        '<td style="padding:7px 10px;font-family:monospace">'+en.entry.toFixed(ld.dp)+'</td>'+
        '<td style="padding:7px 10px;font-family:monospace;color:#f5414f">'+en.sl.toFixed(ld.dp)+'</td>'+
        '<td style="padding:7px 10px;font-family:monospace;color:#1fdb7a">'+(en.tp1?en.tp1.toFixed(ld.dp):'—')+'</td>'+
        '<td style="padding:7px 10px;font-family:monospace;color:#8899b0">'+(en.tp2?en.tp2.toFixed(ld.dp):'—')+'</td>'+
        '<td style="padding:7px 10px;font-family:monospace">'+en.lots+'</td>'+
        '<td style="padding:7px 10px;font-family:monospace">'+en.slPips+'p</td>'+
        '<td style="padding:7px 10px;font-family:monospace;color:#f5a623">'+en.riskUSC+'</td>'+
        '<td style="padding:7px 10px;font-family:monospace;color:#f5a623">R'+en.riskZAR+'</td>'+
        '<td style="padding:7px 10px;font-family:monospace;color:#1fdb7a">'+rr+'</td>'+
      '</tr>';
    }).join('');
    return '<div style="background:#111620;border:1px solid #1e2738;border-radius:6px;margin-bottom:14px;overflow:hidden">'+
      '<div style="background:#161d2a;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;border-bottom:1px solid #1e2738">'+
      '<div><span style="font-family:monospace;font-size:13px;font-weight:700;color:'+dirColor+'">'+ld.pair+' '+ld.dir+' LADDER</span>'+
      '&nbsp;&nbsp;<span style="color:'+(ld.zone.stars===3?'#ff8c00':'#f5a623')+'">'+starDisp+'</span>'+
      '&nbsp;&nbsp;<span style="font-family:monospace;font-size:10px;background:rgba(74,85,104,.3);padding:2px 8px;border-radius:3px">'+ld.regime+'</span></div>'+
      '<div style="font-family:monospace;font-size:10px;color:#8899b0">Zone: '+ld.zone.pct+' @ '+ld.zone.price.toFixed(ld.dp)+' ('+ld.zone.fib+') &nbsp;|&nbsp; Market: '+ld.mkt.toFixed(ld.dp)+' &nbsp;|&nbsp; Lots: '+ld.lotsTotal+' &nbsp;|&nbsp; Total risk: '+ld.totalRisk+' USC &nbsp;|&nbsp; TP1: '+tp1str+'</div></div>'+
      '<div style="overflow-x:auto">'+
      '<table style="width:100%;border-collapse:collapse;font-size:11.5px">'+
      '<thead><tr style="background:#161d2a">'+
      ['#','Entry','SL','TP (3-fill)','TP (2-fill/Deep)','Lots','SL Pips','Risk USC','Risk ZAR','R:R'].map(function(h){return '<th style="padding:6px 10px;font-family:monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#4a5568;text-align:left;border-bottom:1px solid #28334a">'+h+'</th>';}).join('')+
      '</tr></thead><tbody>'+rows+'</tbody></table></div>'+buildExportTPManagement(ld)+'</div>';
  }).join('');
  var checklistHTML=P.checklist.map(function(ci,i){
    var col={cancel:'#f5414f',add:'#f5a623',place:'#1fdb7a',tighten:'#9b6dff',note:'#4a5568'}[ci.type]||'#4a5568';
    var icon={cancel:'🚨',add:'⚠️',place:'✅',tighten:'🔧',note:'📋'}[ci.type]||'•';
    return '<div style="display:flex;gap:12px;padding:10px 14px;border-bottom:1px solid #1e2738;align-items:flex-start">'+
      '<div style="font-size:16px;min-width:24px">'+icon+'</div>'+
      '<div><div style="font-weight:700;margin-bottom:2px;color:'+col+'">'+ci.title+'</div>'+
      '<div style="font-size:11px;color:#8899b0">'+ci.body+'</div></div></div>';
  }).join('');
  var verdictBg=P.verdict.indexOf('EXECUTE')===0?'rgba(31,219,122,.05)':P.verdict.indexOf('NO')===0?'rgba(245,65,79,.05)':'rgba(245,166,35,.05)';
  var verdictBorder=P.verdict.indexOf('EXECUTE')===0?'#1fdb7a':P.verdict.indexOf('NO')===0?'#f5414f':'#f5a623';
  var gateHTML=P.gateResults.map(function(gr){
    var isJPY=gr.pair.indexOf('JPY')>-1,dp=isJPY?2:5;
    var gateStr=gr.gatePass?'<span style="background:rgba(31,219,122,.12);color:#1fdb7a;padding:2px 8px;border-radius:3px;font-family:monospace;font-size:9px">EXECUTE</span>':'<span style="background:rgba(245,65,79,.12);color:#f5414f;padding:2px 8px;border-radius:3px;font-family:monospace;font-size:9px">BLOCKED</span>';
    var zoneStr=gr.bestZone?(gr.bestZone.pct+' @ '+gr.bestZone.price.toFixed(dp)):'None';
    return '<tr style="border-bottom:1px solid #1e2738">'+
      '<td style="padding:6px 10px;font-family:monospace;font-weight:700">'+gr.pair+'</td>'+
      '<td style="padding:6px 10px">'+gr.regime+'</td>'+
      '<td style="padding:6px 10px;font-family:monospace">'+( gr.mkt != null ? gr.mkt.toFixed(dp) : '—' )+'</td>'+
      '<td style="padding:6px 10px;color:#f5a623">'+zoneStr+'</td>'+
      '<td style="padding:6px 10px;font-family:monospace">'+(gr.bestZone?gr.bestDist.toFixed(0)+'p':'—')+'</td>'+
      '<td style="padding:6px 10px">'+gateStr+'</td>'+
    '</tr>';
  }).join('');
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8">'+
'<title>SMC SuperFIB Signal Plan - Day '+day+' - '+ts+'</title>'+
    '<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">'+
    '</head><body style="background:#080b10;color:#dde4f0;font-family:DM Sans,sans-serif;padding:24px;font-size:13px;max-width:1100px;margin:0 auto">'+
'<div style="font-family:monospace;font-size:9px;letter-spacing:3px;color:#e8a020;margin-bottom:5px">SMC SUPERFIB v12.0.9.1 - PHASE 4a - SIGNAL PLAN</div>'+
'<h1 style="font-family:monospace;font-size:20px;font-weight:700;margin-bottom:4px">SIGNAL PLAN - DAY '+day+'</h1>'+
'<div style="color:#8899b0;font-size:12px;margin-bottom:20px">Generated: '+ts+' SAST - Account: 1220086 - Kudzanai Lloyd Taruvinga - Phase 1 Recovery - 20p/50p tolerance</div>'+
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">'+
'<div style="background:#111620;border:1px solid #1e2738;border-radius:6px;padding:14px"><div style="font-family:monospace;font-size:9px;letter-spacing:2px;color:#4a5568;margin-bottom:6px">EQUITY</div><div style="font-family:monospace;font-size:22px;font-weight:700;color:#1fdb7a">'+equity.toLocaleString()+'</div><div style="font-size:11px;color:#8899b0">USC - R'+(equity*ZAR).toFixed(0)+'</div></div>'+
    '<div style="background:#111620;border:1px solid #1e2738;border-radius:6px;padding:14px"><div style="font-family:monospace;font-size:9px;letter-spacing:2px;color:#4a5568;margin-bottom:6px">1% RISK</div><div style="font-family:monospace;font-size:22px;font-weight:700;color:#f5a623">'+P.riskPerLadder.toFixed(2)+'</div><div style="font-size:11px;color:#8899b0">USC per ladder</div></div>'+
'<div style="background:#111620;border:1px solid #1e2738;border-radius:6px;padding:14px"><div style="font-family:monospace;font-size:9px;letter-spacing:2px;color:#4a5568;margin-bottom:6px">LADDERS</div><div style="font-family:monospace;font-size:22px;font-weight:700;color:#3d8ef5">'+P.ladders.length+'</div><div style="font-size:11px;color:#8899b0">Valid signal plans</div></div>'+
    '<div style="background:#111620;border:1px solid #1e2738;border-radius:6px;padding:14px"><div style="font-family:monospace;font-size:9px;letter-spacing:2px;color:#4a5568;margin-bottom:6px">COLLECTION</div><div style="font-family:monospace;font-size:22px;font-weight:700;color:#f5a623">DAY '+day+'</div><div style="font-size:11px;color:#8899b0">of 90 target</div></div>'+
    '</div>'+
    '<div style="border-radius:8px;padding:16px 20px;margin-bottom:20px;border:2px solid '+verdictBorder+';background:'+verdictBg+'">'+
    '<div style="font-family:monospace;font-size:18px;font-weight:700;letter-spacing:2px;color:'+verdictBorder+';margin-bottom:8px">'+P.verdict+'</div>'+
    '</div>'+
    '<div style="font-family:monospace;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#4a5568;margin:20px 0 10px">Action Checklist</div>'+
    '<div style="background:#111620;border:1px solid #1e2738;border-radius:6px;margin-bottom:20px;overflow:hidden">'+checklistHTML+'</div>'+
    '<div style="font-family:monospace;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#4a5568;margin:20px 0 10px">Signal Ladders</div>'+
    laddersHTML+
    '<div style="font-family:monospace;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#4a5568;margin:20px 0 10px">Regime Gate Check</div>'+
    '<div style="background:#111620;border:1px solid #1e2738;border-radius:6px;overflow:hidden;margin-bottom:20px">'+
    '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11.5px">'+
    '<thead><tr style="background:#161d2a">'+
    ['Pair','Regime','Market Price','Nearest Zone','Dist to Zone','Gate'].map(function(h){return '<th style="padding:7px 10px;font-family:monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#4a5568;text-align:left;border-bottom:1px solid #28334a">'+h+'</th>';}).join('')+
    '</tr></thead><tbody>'+gateHTML+'</tbody></table></div></div>'+
    '<div style="font-size:10px;color:#4a5568;font-family:monospace;margin-top:24px;border-top:1px solid #1e2738;padding-top:12px;letter-spacing:.5px;line-height:1.8">'+
    'SMC SUPERFIB v12.0.9.1 · Auto-generated from: account report + current prices + regime inputs · '+
    'Upload this report to chat for strategy review</div>'+
    '</body></html>';
  var a=document.createElement('a');
  a.href='data:text/html;charset=utf-8,'+encodeURIComponent(html);
  a.download='smc_superfib_signal_plan_day'+day+'_'+new Date().toISOString().slice(0,10)+'.html';
  a.click();
xtoast('Signal plan exported - upload to chat for review','ok');
}
function handleDrop(e){e.preventDefault();document.getElementById('upz').classList.remove('drag');if(e.dataTransfer.files[0])handleFile(e.dataTransfer.files[0]);}
function handleHistoryFile(f){
  if(!f||!f.name.match(/\.xlsx?$/i)){xtoast('⚠ WARNING Upload broker history as .xlsx', 'warn');return;}
  document.getElementById('hist-stat').textContent='Reading history '+f.name+'...';
  var r=new FileReader();
  r.onload=function(e){
    try{
      var wb=XLSX.read(e.target.result,{type:'array'});
      parseHistoryWorkbook(wb,f.name);
    }catch(err){
      document.getElementById('hist-stat').textContent='History parse failed: '+err.message;
      xtoast('History parse error: '+err.message,'err');
    }
  };
  r.readAsArrayBuffer(f);
}
function normalizeHeaderCell(v){return String(v==null?'':v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function buildHistoryHeaderMap(row){
  var map={};
  row.forEach(function(cell,idx){
    var h=normalizeHeaderCell(cell);
    if(!h) return;
    if(map.ticket==null&&(h==='ticket'||h==='position'||h==='position ticket'||h==='order')) map.ticket=idx;
    else if(map.symbol==null&&(h==='symbol'||h==='instrument'||h==='pair')) map.symbol=idx;
    else if(map.type==null&&(h==='type'||h==='side'||h==='direction')) map.type=idx;
    else if(map.lots==null&&(h==='lots'||h==='volume'||h==='size')) map.lots=idx;
    else if(map.openTime==null&&(h==='open time'||h==='time open'||h==='opened')) map.openTime=idx;
    else if(map.closeTime==null&&(h==='close time'||h==='time close'||h==='closed')) map.closeTime=idx;
    else if(map.openPrice==null&&(h==='open price'||h==='price open'||h==='entry')) map.openPrice=idx;
    else if(map.closePrice==null&&(h==='close price'||h==='price close'||h==='exit')) map.closePrice=idx;
    else if(map.sl==null&&(h==='s l'||h==='sl'||h==='stop loss')) map.sl=idx;
    else if(map.tp==null&&(h==='t p'||h==='tp'||h==='take profit')) map.tp=idx;
    else if(map.commission==null&&h==='commission') map.commission=idx;
    else if(map.swap==null&&h==='swap') map.swap=idx;
    else if(map.profit==null&&(h==='profit'||h==='p l'||h==='pl')) map.profit=idx;
  });
  return map.ticket!=null&&map.symbol!=null&&map.profit!=null&&(map.closeTime!=null||map.closePrice!=null)?map:null;
}
function parseHistoryWorkbook(wb,fname){
  var trades=[];
  wb.SheetNames.forEach(function(name){
    var rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:null});
    var header=null;
    rows.forEach(function(row){
      if(!row||!row.length) return;
      var maybe=buildHistoryHeaderMap(row);
      if(maybe){header=maybe;return;}
      if(!header) return;
      var ticket=header.ticket!=null?parseInt(row[header.ticket],10):NaN;
      var symbol=header.symbol!=null?row[header.symbol]:null;
      var profit=header.profit!=null?parseFloat(row[header.profit]):NaN;
      if(!symbol||isNaN(ticket)||isNaN(profit)) return;
      var pair=toPairDisplay(symbol);
      trades.push({
        ticket:ticket,
        pair:pair,
        dir:header.type!=null&&String(row[header.type]||'').toLowerCase().indexOf('buy')>-1?'BUY':'SELL',
        lots:header.lots!=null?parseFloat(row[header.lots])||0:0,
        openTime:header.openTime!=null?String(row[header.openTime]||''):null,
        closeTime:header.closeTime!=null?String(row[header.closeTime]||''):null,
        entry:header.openPrice!=null?parseFloat(row[header.openPrice])||0:0,
        closePrice:header.closePrice!=null?parseFloat(row[header.closePrice])||0:0,
        sl:header.sl!=null?parseFloat(row[header.sl])||0:0,
        tp:header.tp!=null?parseFloat(row[header.tp])||0:0,
        commission:header.commission!=null?parseFloat(row[header.commission])||0:0,
        swap:header.swap!=null?parseFloat(row[header.swap])||0:0,
        profit:profit
      });
    });
  });
  processHistoryTrades(trades,fname);
}
function classifyExactClose(sig,trade){
  var isJPY=trade.pair&&trade.pair.indexOf('JPY')>-1;
  var mult=isJPY?100:10000;
  var closePrice=trade.closePrice||trade.entry||sig.entry;
  var sl=trade.sl||sig.sl;
  var tp=trade.tp||sig.tp;
  var be=(sl&&Math.abs(sl-trade.entry)<(isJPY?0.02:0.00002))||Math.abs(trade.profit)<0.50;
  sig.closePL=trade.profit;
  sig.closeDate=(trade.closeTime||'').slice(0,10)||new Date().toISOString().slice(0,10);
  sig.closeTime=trade.closeTime||null;
  sig.closePrice=closePrice;
  sig.closePips=trade.dir==='SELL'?+((trade.entry-closePrice)*mult).toFixed(1):+((closePrice-trade.entry)*mult).toFixed(1);
  sig.awaitingHistory=false;
  if(be) sig.outcome='BE';
  else if(trade.profit>0&&tp&&Math.abs(closePrice-tp)*mult<10) sig.outcome='WIN-TP';
  else if(trade.profit<0&&sl&&Math.abs(closePrice-sl)*mult<10) sig.outcome='LOSS-SL';
  else if(trade.profit>0) sig.outcome='WIN-MANUAL';
  else sig.outcome='MANUAL-CLOSE';
}
function processHistoryTrades(trades,fname){
  if(!trades.length){
    document.getElementById('hist-stat').textContent='No closed trades found in '+fname;
    xtoast('⚠ WARNING No closed trades detected in history file','warn');
    return;
  }
  var tradeMap={};
  closedTrades.forEach(function(t){tradeMap[t.ticket]=t;});
  trades.forEach(function(t){tradeMap[t.ticket]=t;});
  closedTrades=Object.keys(tradeMap).map(function(k){return tradeMap[k];}).sort(function(a,b){return String(b.closeTime||'').localeCompare(String(a.closeTime||''));});
  persistTradesLocal();
  var matched=0;
  closedTrades.forEach(function(trade){
    var sig=signals.filter(function(s){return s.posId===trade.ticket;})[0];
    if(!sig) return;
    classifyExactClose(sig,trade);
    matched++;
  });
  persistTradesLocal();
  queueUserSync('trades');
  document.getElementById('hist-stat').textContent='History loaded: '+trades.length+' closed trades from '+fname+' · matched '+matched+' tracked signals';
  xtoast('History imported: '+matched+' tracked closes matched','ok');
  renderSigs();renderAnalytics();renderProgress();
}
function handleFile(f){
  if(!f||!f.name.match(/\.xlsx?$/i)){xtoast('Upload .xlsx from IFX Brokers','warn');return;}
  document.getElementById('upstat').textContent='Reading '+f.name+'...';
  var r=new FileReader();
  r.onload=function(e){
    try{
      var wb=XLSX.read(e.target.result,{type:'array'});
      parseRep(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:null}),f.name);
    }catch(err){xtoast('Parse error: '+err.message,'err');}
  };
  r.readAsArrayBuffer(f);
}
function parseRep(rows,fname){
  var snap={fname:fname,time:new Date().toISOString(),positions:[],orders:[],acct:{},info:{}};
  var mode=null;
  function np(sym){var s=sym.replace('.c','').replace('/','');var m={'GBPUSD':'GBP/USD','AUDUSD':'AUD/USD','USDJPY':'USD/JPY','EURJPY':'EUR/JPY','AUDJPY':'AUD/JPY','EURUSD':'EUR/USD'};return m[s]||s;}
  var info={};
  for(var i=0;i<rows.length;i++){
    var row=rows[i];
    if(!row||row.every(function(c){return c==null;})) continue;
    var r=row.map(function(c){return c==null?'':String(c).trim();});
    if(r[0]==='Positions'){mode='pos';continue;}
    if(r[0]==='Orders'){mode='ord';continue;}
    if(r[0]==='Symbol') continue;
    if(r[0]==='Name:')         info.name            =r[3]||'';
    if(r[0]==='Account:')      info.account         =(r[3]||'').split(' ')[0];
    if(r[0]==='Company:')      info.company         =r[3]||'';
    if(r[0]==='Date:')         info.reportDate      =r[3]||'';
    if(r[0]==='Balance:')      snap.acct.balance    =parseFloat(r[3])||0;
    if(r[0]==='Floating P/L:') snap.acct.floatingPL =parseFloat(r[3])||0;
    if(r[0]==='Equity:')       snap.acct.equity     =parseFloat(r[3])||0;
    if(r[6]==='Margin:')       snap.acct.margin     =parseFloat(r[9])||0;
    if(r[6]==='Free Margin:')  snap.acct.freeMargin =parseFloat(r[9])||0;
    if(r[6]==='Margin Level:') snap.acct.marginLevel=(parseFloat(r[9])||0)*100;
    if(mode==='pos'&&r[0]&&r[0].indexOf('.c')>-1&&r[1]&&!isNaN(r[1])){
      snap.positions.push({id:parseInt(r[1]),pair:np(r[0]),ot:r[2],dir:r[3]&&r[3].toLowerCase()==='buy'?'BUY':'SELL',lots:parseFloat(r[4])||0,entry:parseFloat(r[5])||0,sl:parseFloat(r[6])||0,tp:parseFloat(r[7])||0,mkt:parseFloat(r[8])||0,swap:parseFloat(r[9])||0,profit:parseFloat(r[10])||0});
    }
    if(mode==='ord'&&r[0]&&r[0].indexOf('.c')>-1&&r[1]&&!isNaN(r[1])){
      snap.orders.push({id:parseInt(r[1]),pair:np(r[0]),ot:r[2],type:r[3],lots:parseFloat(String(r[4]).split('/')[0])||0,entry:parseFloat(r[5])||0,sl:parseFloat(r[6])||0,tp:parseFloat(r[7])||0,mkt:parseFloat(r[8])||0,state:r[9]});
    }
  }
  snap.info=info;
  processSnap(snap,fname);
}
function processSnap(snap,fname){
  if(!baseline){
    baseline={positions:snap.positions.slice(),date:snap.time,fname:fname};
    persistAccountLocal();
    var d=new Date(snap.time);
    var ds=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    START=ds;
    persistSettingsLocal();
    xtoast('Baseline set from '+fname+' — '+snap.positions.length+' positions logged','ok');
  }
  var prev=snaps.length?snaps[snaps.length-1]:{positions:baseline?baseline.positions.slice():[],orders:[]};
  snaps.push(snap);
  if(snaps.length>60) snaps=snaps.slice(-60);
  if(snap.info&&snap.info.name){
    acctInfo=snap.info;
    persistAccountLocal();
    renderHeader();
  }
  var prevSet={};
  prev.positions.forEach(function(p){prevSet[p.id]=p;});
  var currSet={};
  snap.positions.forEach(function(p){currSet[p.id]=p;});
  var newPos=snap.positions.filter(function(p){return !prevSet[p.id];});
  var closedPos=prev.positions.filter(function(p){return !currSet[p.id];});
  var heldPos=snap.positions.filter(function(p){return !!prevSet[p.id];});
  if(snap.acct.equity) acct=snap.acct;
  curPos=snap.positions;
  newPos.forEach(function(p){if(!signals.filter(function(s){return s.posId===p.id;}).length) signals.push(buildSig(p));});
  closedPos.forEach(function(p){
    var sigs=signals.filter(function(s){return s.posId===p.id;});
    if(sigs.length&&sigs[0].outcome==='OPEN'){
      sigs[0].outcome='AWAIT_HISTORY';
      sigs[0].awaitingHistory=true;
      sigs[0].closePendingDate=snap.time.slice(0,10);
    }
  });
  var slm=[];
  heldPos.forEach(function(cur){var pp=prevSet[cur.id];if(pp&&Math.abs(pp.sl-cur.sl)>0.00001){slm.push(cur.pair+' #'+cur.id+': '+pp.sl+' to '+cur.sl);var sigs=signals.filter(function(s){return s.posId===cur.id;});if(sigs.length){sigs[0].currentSL=cur.sl;sigs[0].currentPL=cur.profit;}}});
  persistTradesLocal();
  persistAccountLocal();
  queueUserSync('trades');
  queueUserSync('account');
  queueUserSync('settings');
  var sess=new Date().getHours()<13?'AM':'PM';
  document.getElementById('upstat').textContent='OK '+fname+' '+sess+' upload '+snap.positions.length+'p '+newPos.length+' new '+closedPos.length+' closed';
  if(slm.length) xtoast('SL moves: '+slm.join(' | '),'info');
  xtoast(sess+' upload: '+newPos.length+' new signals, '+closedPos.length+' left open book · import history to confirm closes','ok');
  showDelta(snap,newPos,closedPos,heldPos,prev);
  renderAcct();renderBook();renderOrders(snap.orders);renderSigs();renderAnalytics();renderProgress();dayBadge();
if(acct&&acct.equity) document.getElementById('plan-equity-note').textContent='Equity: '+acct.equity.toLocaleString()+' USC - 1% risk = '+(acct.equity*0.01).toFixed(2)+' USC per ladder';
  var hasPrices = Object.keys(savedPrices).some(function(k){return savedPrices[k]>0;});
  if(hasPrices) {
    var staleMins = lastFetchTime ? (new Date()-lastFetchTime)/60000 : 99;
    if(staleMins > 5) {
      fetchPrices();
      xtoast('Prices refreshed + plan updated from upload','ok');
    } else {
      if (typeof window.generatePlan === 'function') window.generatePlan();
      xtab('plan');
      xtoast('Plan updated from upload — prices current','ok');
    }
  }
}
function buildSig(p){
  var isJPY=p.pair&&p.pair.indexOf('JPY')>-1;var mult=isJPY?100:10000;var tol=isJPY?TOL_JPY:TOL_USD;var dp=isJPY?2:5;
  var levels=getAllLevels(p.pair);
  var best=null,bestD=9999;
  for(var i=0;i<levels.length;i++){var lv=levels[i];var d=Math.abs(p.entry-lv.price)*mult;if(d<bestD){bestD=d;best=lv;}}
  var zm=best&&bestD<=tol;var ch=getChopBand(p.pair);var inChop=ch&&p.entry>=ch.lo&&p.entry<=ch.hi;
  var rg=savedRegimes[p.pair]||'UNKNOWN';
  var rgOk=rg!=='RANGING'&&((p.dir==='SELL'&&(rg==='TREND DOWN'||rg==='REVERSAL ZONE'))||(p.dir==='BUY'&&(rg==='TREND UP'||rg==='REVERSAL ZONE')));
  var liveSig=getBestLiveSignalForPair(p.pair,p.dir);
  var smcOk=!!(liveSig&&liveSig.setup_class&&liveSig.setup_class!=='BLOCKED'&&liveSig.structure&&liveSig.structure.internal_shift!==false&&liveSig.structure.major_bos!==false&&liveSig.poi&&liveSig.poi.type);
  var zoneStars=best?getStarsForLevel(p.pair,best):null;
  var slP=p.sl?+(Math.abs(p.entry-p.sl)*mult).toFixed(1):null;var tp1P=p.tp?+(Math.abs(p.tp-p.entry)*mult).toFixed(1):null;var rr1=slP&&tp1P?+(tp1P/slP).toFixed(2):null;
  var pv=getPipValueAccount(p.pair,true)||0.10;var riskUSC=slP?+(slP*(p.lots/0.01)*pv).toFixed(2):null;var riskZAR=riskUSC?+(riskUSC*ZAR).toFixed(2):null;
  var verdict=inChop?'CHOP BLOCK':!zm?'OFF ZONE':!rgOk?'REGIME BLOCK':!smcOk?'WAIT SMC':'VALID ENTRY';
  return {posId:p.id,pair:p.pair,dir:p.dir,openTime:p.ot,entry:p.entry,sl:p.sl,tp:p.tp,lots:p.lots,slPips:slP,tp1Pips:tp1P,rr1:rr1,riskUSC:riskUSC,riskZAR:riskZAR,zonePct:best?best.pct:null,zonePrice:best?best.price:null,zoneSide:best?best.side:null,zoneStars:zoneStars,zoneFib:best?best.fib:null,zoneDistPips:best?+bestD.toFixed(1):null,zoneMatch:zm,inChop:inChop,regimeGate:rg,regimeOk:rgOk,verdict:verdict,smcGrade:liveSig&&liveSig.setup_class?liveSig.setup_class:null,smcSetupQuality:liveSig&&liveSig.setup_quality!=null?liveSig.setup_quality:null,outcome:'OPEN',awaitingHistory:false,closePL:null,closePips:null,closeDate:null,currentSL:p.sl,currentPL:p.profit};
}
function classifyOC(sig,p,snap){
  sig.closeDate=snap.time.slice(0,10);var isJPY=p.pair&&p.pair.indexOf('JPY')>-1;var mult=isJPY?100:10000;
  var be=(p.sl&&Math.abs(p.sl-p.entry)<(isJPY?0.02:0.00002))||Math.abs(p.profit)<0.50;var pv=getPipValueAccount(p.pair,true)||0.10;var expLoss=sig.slPips?-(sig.slPips*(p.lots/0.01)*pv):null;
  sig.closePL=p.profit;sig.closePips=p.dir==='SELL'?+((p.entry-p.mkt)*mult).toFixed(1):+((p.mkt-p.entry)*mult).toFixed(1);
  if(be){sig.outcome='BE';}else if(p.profit>0&&p.tp&&Math.abs(p.mkt-p.tp)*mult<10){sig.outcome='WIN-TP';}
  else if(p.profit<0&&expLoss&&Math.abs(p.profit-expLoss)<5){sig.outcome='LOSS-SL';}
  else if(p.profit>0){sig.outcome='WIN-MANUAL';}else{sig.outcome='MANUAL-CLOSE';}
}
function mk(cls,title,body){
  var cardClass='card'+(cls?' '+cls:'');
  return '<div class="'+cardClass+'"><div class="clbl">'+title+'</div>'+body+'</div>';
}
function showDelta(snap,newPos,closedPos,heldPos,prev){
  document.getElementById('delpan').style.display='block';
  var heldPLnow  = heldPos.reduce(function(s,p){return s+(p.profit||0);},0);
  var heldPLprev = prev.positions
    .filter(function(p){return heldPos.some(function(h){return h.id===p.id;})})
    .reduce(function(s,p){return s+(p.profit||0);},0);
  var heldDiff   = heldPLnow - heldPLprev;
  var heldSign   = heldDiff>=0?'+':'';
  var heldCol    = heldDiff>0?'var(--gr)':heldDiff<0?'var(--re)':'var(--mu)';
  document.getElementById('delcards').innerHTML=
    mk('gb','NEW POSITIONS','<div class="cval '+(newPos.length>0?'pos':'')+'">'+newPos.length+'</div><div class="csub">Auto-matched to zones</div>')+
    mk('rb','LEFT OPEN BOOK','<div class="cval '+(closedPos.length>0?'neg':'')+'">'+closedPos.length+'</div><div class="csub">'+(closedPos.length?'Awaiting exact history confirmation':'No exits this upload')+'</div>')+
    mk('bb','HELD','<div class="cval" style="color:var(--bl)">'+heldPos.length+'</div><div class="csub" style="color:'+heldCol+'">'+(heldDiff!==0?heldSign+heldDiff.toFixed(2)+' USC on open book':'Book unchanged')+'</div>');
  if(newPos.length){
    var h='<div style="font-family:var(--mo);font-size:9px;letter-spacing:2px;color:var(--gr);text-transform:uppercase;margin-bottom:8px">New Entries</div>'+
      '<div class="tw"><table><thead><tr><th>Pos ID</th><th>Pair</th><th>Dir</th><th>Entry</th><th>Zone</th><th>Dist</th><th>Stars</th><th>Risk USC</th><th>R:R</th><th>Verdict</th></tr></thead><tbody>';
    newPos.forEach(function(p){
      var pair=p.pair||'GBPUSD';
      var sig=signals.filter(function(s){return s.posId===p.id;})[0];
      if(!sig){h+='<tr class="rg" style="opacity:.45"><td class="mn">'+p.id+'</td><td class="mn"><strong>'+pair+'</strong></td><td colspan="8" style="color:var(--mu);font-family:var(--mo);font-size:10px">NO SIGNAL MATCH — position not in signals log</td></tr>';return;}
      var isJPY=pair.indexOf('JPY')>-1,dp=isJPY?2:5;
      var vc=sig.verdict==='VALID ENTRY'?'pos':sig.verdict==='CHOP BLOCK'||sig.verdict==='REGIME BLOCK'?'neg':'wrn';
      var sd=sig.zoneStars===3?'3-star':sig.zoneStars===2?'2-star':sig.zoneStars===1?'1-star':'none';
      h+='<tr class="rg"><td class="mn">'+p.id+'</td><td class="mn"><strong>'+pair+'</strong></td>'+
         '<td>'+(p.dir==='BUY'?'<span class="pg2 pill">BUY</span>':'<span class="pr2 pill">SELL</span>')+'</td>'+
         '<td class="mn">'+p.entry.toFixed(dp)+'</td>'+
         '<td class="mn wrn">'+(sig.zonePct||'OFF ZONE')+'</td>'+
         '<td class="mn">'+(sig.zoneDistPips!=null?sig.zoneDistPips+'p':'-')+'</td>'+
         '<td>'+sd+'</td>'+
         '<td class="mn wrn">'+(sig.riskUSC||'-')+'</td>'+
         '<td class="mn">'+(sig.rr1?'1:'+sig.rr1:'-')+'</td>'+
         '<td class="mn '+vc+'">'+sig.verdict+'</td></tr>';
    });
    document.getElementById('delnew').innerHTML=h+'</tbody></table></div>';
  }
}
function renderHeader(){
  var user = API.USER || null;
  var isLoggedIn = !!(user && user.id);
  var nameEl=document.getElementById('hdr-name');
  var acctEl=document.getElementById('hdr-account');
  var navUser=document.getElementById('smc-nav-user');
  var navLoginEl=document.getElementById('smc-nav-login');
  var navLogoutEl=document.getElementById('smc-nav-logout');
  var sideLoginEl=document.getElementById('smc-sidebar-login');
  var sideLogoutEl=document.getElementById('smc-sidebar-logout');

  if(nameEl){
    if(acctInfo.name) nameEl.innerHTML='<div class="smc-sb-meta-row"><span class="smc-sb-meta-value">' + acctInfo.name + '</span></div>';
    else if(isLoggedIn && user.display_name) nameEl.innerHTML='<div class="smc-sb-meta-row"><span class="smc-sb-meta-value">' + user.display_name + '</span></div>';
    else nameEl.innerHTML='';
  }

  if(acctEl){
    if(acctInfo.account) acctEl.innerHTML=
      '<div class="smc-sb-meta-row"><span class="smc-sb-meta-label">Account:</span><span class="smc-sb-meta-value">' + acctInfo.account + '</span></div>' +
      '<div class="smc-sb-meta-row"><span class="smc-sb-meta-value">' + (acctInfo.company||'IFX Brokers') + '</span></div>' +
      '<div class="smc-sb-meta-row"><span class="smc-sb-meta-value">USC</span></div>';
    else if(isLoggedIn && user.email) acctEl.innerHTML=
      '<div class="smc-sb-meta-row"><span class="smc-sb-meta-label">User:</span><span class="smc-sb-meta-value">' + user.email + '</span></div>';
    else acctEl.innerHTML=isLoggedIn ? 'Upload report to begin' : 'Login to begin';
  }

  if(navUser) navUser.textContent = isLoggedIn && user.display_name ? user.display_name : 'Session';
  if(navLoginEl) navLoginEl.style.display = isLoggedIn ? 'none' : 'inline-flex';
  if(navLogoutEl) navLogoutEl.style.display = isLoggedIn ? 'inline-flex' : 'none';
  if(sideLoginEl) sideLoginEl.style.display = isLoggedIn ? 'none' : 'inline-flex';
  if(sideLogoutEl) sideLogoutEl.style.display = isLoggedIn ? 'inline-flex' : 'none';

  // Populate Risk Profile baseline mirrors
  var bl = baseline || {};
  var rpDate     = document.getElementById('rp-baseline-date');
  var rpPos      = document.getElementById('rp-baseline-positions');
  var rpFile     = document.getElementById('rp-baseline-file');
  if (rpDate)  rpDate.textContent  = bl.date || '—';
  if (rpPos) {
    var baselinePositions = Array.isArray(bl.positions) ? bl.positions.length : bl.positions;
    rpPos.textContent = baselinePositions != null ? baselinePositions : '—';
  }
  if (rpFile)  rpFile.textContent  = bl.fname || 'No baseline loaded';
  var engineMetaEl=document.getElementById('regime-brief-meta');
  if(engineMetaEl){
    var freshnessRef = lastLiveFetch || lastSignalEngineRunAt || Date.now();
    engineMetaEl.textContent = 'Updated: ' + formatFreshnessAgo(freshnessRef);
  }
}
function renderAcct(){
  var el=document.getElementById('acctcards');
  if(!acct){
    var emptySub = (API.USER && API.USER.id) ? 'Upload report to load broker data' : 'Login to load broker data';
    el.innerHTML=
      '<div class="card"><div class="clbl">Equity</div><div class="cval" style="color:var(--mu)">--</div><div class="csub">Upload report to begin</div></div>'+
      '<div class="card"><div class="clbl">Balance</div><div class="cval" style="color:var(--mu)">--</div><div class="csub">' + emptySub + '</div></div>'+
      '<div class="card"><div class="clbl">Floating P/L</div><div class="cval" style="color:var(--mu)">--</div><div class="csub">' + emptySub + '</div></div>'+
      '<div class="card"><div class="clbl">Margin Level</div><div class="cval" style="color:var(--mu)">--</div><div class="csub">' + emptySub + '</div></div>';
    return;
  }
  var a=acct, ml=a.marginLevel||0, eq=a.equity||0;
  var days=getElapsedDays();
  var prev=snaps.length>1?snaps[snaps.length-2]:null;
  var pa=prev?prev.acct:null;
  var ba=baseline&&snaps.length?snaps[0].acct:null;
  function chg(cur, old, isAbsolute) {
    if(!old||!cur) return '';
    var diff=cur-old;
    var pct=old!==0?(diff/Math.abs(old)*100):0;
    var col=diff>0?'var(--gr)':diff<0?'var(--re)':'var(--mu)';
    var sign=diff>=0?'+':'';
    if(isAbsolute) return '<span style="color:'+col+';font-size:10px;font-family:var(--mo)"> '+sign+diff.toFixed(2)+' vs last</span>';
    return '<span style="color:'+col+';font-size:10px;font-family:var(--mo)"> '+sign+pct.toFixed(1)+'% vs last</span>';
  }
  function chgBaseline(cur, base) {
    if(!base||!cur) return '';
    var diff=cur-base;
    var pct=base!==0?(diff/Math.abs(base)*100):0;
    var col=diff>0?'var(--gr)':diff<0?'var(--re)':'var(--mu)';
    var sign=diff>=0?'+':'';
    return '<span style="color:'+col+';font-size:10px;font-family:var(--mo)"> '+sign+pct.toFixed(1)+'% from base</span>';
  }
  var eqChg  = pa?chg(eq,pa.equity,false):'';
  var eqBase = ba?chgBaseline(eq,ba.equity):'';
  var eqBorder = pa?(eq>pa.equity?'gb':eq<pa.equity?'rb':''):'gb';
  var balChg = ba?chgBaseline(a.balance,ba.balance):'';
  var balBorder = ba&&a.balance>ba.balance?'gb':'bb';
  var flChg = pa?chg(a.floatingPL,pa.floatingPL,true):'';
  var flColor = (a.floatingPL||0)>=0?'var(--gr)':'var(--re)';
  var flBorder = pa?((a.floatingPL||0)>(pa.floatingPL||0)?'gb':'rb'):'';
  var mlChg = pa?chg(ml,pa.marginLevel,false):'';
  var mlBorder = ml>5000?'gb':ml>500?'':'rb';
  el.innerHTML=
    '<div class="card '+eqBorder+'">'+
      '<div class="clbl">Equity</div>'+
      '<div class="cval pos">'+eq.toLocaleString()+'</div>'+
      '<div class="csub">USC R'+(eq*ZAR).toFixed(0)+' Day '+days+eqChg+eqBase+'</div>'+
    '</div>'+
    '<div class="card '+balBorder+'">'+
      '<div class="clbl">Balance</div>'+
      '<div class="cval" style="color:var(--bl)">'+a.balance.toLocaleString()+'</div>'+
      '<div class="csub">1%='+(eq*0.01).toFixed(2)+' USC'+balChg+'</div>'+
    '</div>'+
    '<div class="card '+(flBorder||'')+'">'+
      '<div class="clbl">Floating P/L</div>'+
      '<div class="cval" style="color:'+flColor+'">'+(a.floatingPL>=0?'+':'')+a.floatingPL.toFixed(2)+'</div>'+
      '<div class="csub">USC'+flChg+'</div>'+
    '</div>'+
    '<div class="card '+mlBorder+'">'+
      '<div class="clbl">Margin Level</div>'+
      '<div class="cval '+(ml>500?'pos':'neg')+'">'+ml.toFixed(0)+'%</div>'+
      '<div class="csub">'+(ml>5000?'Strong':ml>500?'Floor OK':'EMERGENCY')+mlChg+'</div>'+
    '</div>';
}
function renderSigs(){
  var el=document.getElementById('siglist');
  var d0ids={};(baseline&&baseline.positions||[]).forEach(function(d){d0ids[d.id]=true;});
  var post=signals.filter(function(s){return !d0ids[s.posId];});
  if(!post.length){
    var sumEmpty=document.getElementById('sig-summary');
    if(sumEmpty) sumEmpty.style.display='none';
    el.innerHTML='<div style="text-align:center;color:var(--mu);padding:30px;font-family:var(--mo);font-size:11px">No signals yet - upload AM report - signals auto-generated - Day 0 legacy book excluded</div>';
    return;
  }
  var noFills=post.filter(function(s){return s.outcome==='NO-FILL';});
  var awaitingHistory=post.filter(function(s){return s.outcome==='AWAIT_HISTORY';});
  var openCount=post.filter(function(s){return s.outcome==='OPEN';}).length;
  var closed=post.filter(function(s){return s.outcome!=='OPEN'&&s.outcome!=='INVALID'&&s.outcome!=='NO-FILL'&&s.outcome!=='AWAIT_HISTORY';});
  var wins=closed.filter(function(s){return s.outcome.indexOf('WIN')===0;});
  var losses=closed.filter(function(s){return s.outcome==='LOSS-SL';});
  var be=closed.filter(function(s){return s.outcome==='BE';});
  var totalPL=closed.reduce(function(a,s){return a+(s.closePL||0);},0);
  var resolved=closed.length+noFills.length;
  var fillRate=resolved?(closed.length/resolved*100).toFixed(1)+'%':'—';
  var sumEl=document.getElementById('sig-summary');
  if(sumEl){
    sumEl.style.display='block';
    sumEl.innerHTML='<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 14px;background:var(--bg2);border:1px solid var(--bd);border-radius:6px;font-family:var(--mo);font-size:11px">'+
      '<span style="color:var(--mu)">Total: <strong style="color:var(--bl)">'+post.length+'</strong></span>'+
      '<span style="color:var(--mu)">·</span>'+
      '<span class="pg2 pill">W '+wins.length+'</span>'+
      '<span class="pr2 pill">L '+losses.length+'</span>'+
      '<span class="pa2 pill">BE '+be.length+'</span>'+
      '<span class="pb2 pill">AH '+awaitingHistory.length+'</span>'+
      '<span class="pp2 pill">NF '+noFills.length+'</span>'+
      '<span style="color:var(--mu)">·</span>'+
      '<span style="color:var(--mu)">Win Rate: <strong style="color:'+(closed.length&&wins.length/closed.length>=0.6?'var(--gr)':closed.length&&wins.length/closed.length>=0.45?'var(--am)':'var(--re)')+'">'+(closed.length?(wins.length/closed.length*100).toFixed(1)+'%':'—')+'</strong></span>'+
      '<span style="color:var(--mu)">·</span>'+
      '<span style="color:var(--mu)">Fill Rate: <strong style="color:'+(resolved&&closed.length/resolved>=0.7?'var(--gr)':resolved&&closed.length/resolved>=0.5?'var(--am)':'var(--re)')+'">'+fillRate+'</strong></span>'+
      '<span style="color:var(--mu)">·</span>'+
      '<span>Net P/L: <strong style="color:'+(totalPL>=0?'var(--gr)':'var(--re)')+'">'+(totalPL>=0?'+':'')+totalPL.toFixed(2)+' USC</strong> <span style="color:var(--dm);font-size:10px">'+plZAR(totalPL)+'</span></span>'+
    '</div>';
  }
  el.innerHTML=post.slice().reverse().map(function(sig,i){
    var isJPY=sig.pair&&sig.pair.indexOf('JPY')>-1,dp=isJPY?2:5;var oc=sig.outcome||'OPEN';
    var cls=oc==='OPEN'?'so':oc==='NO-FILL'?'snf':oc==='AWAIT_HISTORY'?'sb':oc.indexOf('WIN')===0?'sw':oc==='BE'?'sb':'sl';
    var ocCol=oc==='OPEN'||oc==='AWAIT_HISTORY'?'var(--bl)':oc.indexOf('WIN')===0?'var(--gr)':oc==='BE'?'var(--am)':'var(--re)';
    var sd=sig.zoneStars===3?'3-STAR':sig.zoneStars===2?'2-STAR':'1-STAR';var sdCls=sig.zoneStars===3?'s3':sig.zoneStars===2?'s2':'s1';
    var rg=sig.regimeGate;var rgCls=rg==='TREND DOWN'?'rdn':rg==='TREND UP'?'rup':rg==='REVERSAL ZONE'?'rrv':'rrg';
    var vc=sig.verdict==='VALID ENTRY'?'pos':sig.verdict==='CHOP BLOCK'||sig.verdict==='REGIME BLOCK'?'neg':'wrn';
    var num=post.length-i;
    return '<div class="sc '+cls+'"><div class="sh"><div><div class="st">#'+num+' '+sig.pair+' '+(sig.dir==='BUY'?'<span class="pg2 pill">BUY</span>':'<span class="pr2 pill">SELL</span>')+'</div><div style="font-family:var(--mo);font-size:10px;color:var(--mu);margin-top:3px">'+(sig.openTime||'')+'</div></div><div class="sb2"><span class="'+sdCls+'" style="font-family:var(--mo);font-weight:700">'+sd+'</span><span class="'+rgCls+'">'+rg+'</span>'+
    getOutcomeBadge(oc)+
    (sig.closePips!=null?'<span style="font-family:var(--mo);font-size:11px;color:'+(sig.closePips>0?'var(--gr)':'var(--re)')+'">'+( sig.closePips>0?'+':'')+sig.closePips+'p</span>':'')+'</div></div>'+
    '<div class="sg">'+sf('Zone',(sig.zonePct||'OFF ZONE'),(sig.zoneMatch?'pos':'neg'))+sf('Zone Price',sig.zonePrice?sig.zonePrice.toFixed(dp):'-','')+sf('Entry',sig.entry?sig.entry.toFixed(dp):'-','')+sf('SL',sig.sl?sig.sl.toFixed(dp):'-','neg')+sf('TP',sig.tp?sig.tp.toFixed(dp):'-','pos')+sf('Lots',sig.lots,'')+sf('SL Pips',sig.slPips?sig.slPips+'p':'-','')+sf('Risk USC',sig.riskUSC?sig.riskUSC+' USC':'-','wrn')+sf('Risk ZAR',sig.riskZAR?'R'+sig.riskZAR:'-','')+sf('R:R',sig.rr1?(function(){var rr=sig.rr1;var rrClass=rr>=2.0?'pos':rr>=1.5?'wrn':'neg';return '<span class="mn '+rrClass+'">1:'+rr.toFixed(1)+'</span>';})():'-','')+sf('Fib Source',sig.zoneFib||'-','')+sf('Dist to Zone',sig.zoneDistPips!=null?sig.zoneDistPips+'p':'-','')+sf('SMC Grade',sig.smcGrade||'-','')+sf('Verdict',sig.verdict,vc)+(sig.closePL!=null?sf('Close P/L',plBoth(sig.closePL),sig.closePL>=0?'pos':'neg'):'')+
    (sig.awaitingHistory?sf('Close Status','History Import Needed','wrn'):'')+
    (sig.noFillDate?sf('No Fill Date',sig.noFillDate,''):'')+
    '</div>'+
    '<div style="margin-top:10px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap"><button class="btn btg bts" onclick="openSignalLogChart(\''+String(sig.posId||'').replace(/'/g,'\\\'')+'\')">Open Chart</button>' +
    (oc==='OPEN'?'<button class="btn btp bts" onclick="markNoFill(\''+sig.posId+'\')">Mark No Fill</button>':'')+
    '</div>'+
    '</div>';
  }).join('');
  renderChartContextPanel();
}
function sf(label,val,cls){return '<div class="sf"><div class="sfl">'+label+'</div><div class="sfv '+(cls||'')+'">' +val+'</div></div>';}
function renderAnalytics(){
  var d0ids={};(baseline&&baseline.positions||[]).forEach(function(d){d0ids[d.id]=true;});
  var post=signals.filter(function(s){return !d0ids[s.posId];});
  var noFills=post.filter(function(s){return s.outcome==='NO-FILL';});
  var awaitingHistory=post.filter(function(s){return s.outcome==='AWAIT_HISTORY';});
  var closed=post.filter(function(s){return s.outcome!=='OPEN'&&s.outcome!=='INVALID'&&s.outcome!=='NO-FILL'&&s.outcome!=='AWAIT_HISTORY';});
  var wins=closed.filter(function(s){return s.outcome.indexOf('WIN')===0;});
  var losses=closed.filter(function(s){return s.outcome==='LOSS-SL';});
  var be=closed.filter(function(s){return s.outcome==='BE';});
  var hr=closed.length?(wins.length/closed.length*100).toFixed(0)+'%':'-';
  var pipArr=wins.filter(function(s){return s.closePips!=null;}).map(function(s){return s.closePips;});
  var avgP=pipArr.length?(pipArr.reduce(function(a,b){return a+b;},0)/pipArr.length).toFixed(0)+'p':'-';
  var totalPL_USC=closed.filter(function(s){return s.closePL!=null;}).reduce(function(a,s){return a+s.closePL;},0);
  var totalPL_ZAR=totalPL_USC*ZAR;
  document.getElementById('an-hr').textContent=hr;
  document.getElementById('an-tt').textContent=post.length;
  document.getElementById('an-ts').textContent=openCount+' open, '+awaitingHistory.length+' awaiting history, '+closed.length+' closed';
  document.getElementById('an-ap').textContent=avgP;
  document.getElementById('an-pl').innerHTML=
    '<div class="cval '+(totalPL_USC>=0?'pos':'neg')+'">'+(totalPL_USC>=0?'+':'')+totalPL_USC.toFixed(2)+' USC</div>'+
    '<div class="csub" style="color:'+(totalPL_USC>=0?'var(--gr)':'var(--re)')+'">' + plZAR(totalPL_USC) + '</div>';
  var statsDiv = document.getElementById('winloss-stats');
  if(statsDiv){
    statsDiv.style.display='block';
    var _resolved=closed.length+noFills.length;
    var _fillRate=_resolved?(_resolved>0?(closed.length/_resolved*100).toFixed(1)+'%':'—'):'—';
    statsDiv.innerHTML='<div class="clbl">Win/Loss Summary</div>'+
      '<div style="display:flex; flex-wrap:wrap; gap:12px; margin-top:8px">'+
      '<div><span class="pos">Wins:</span> <strong>'+wins.length+'</strong></div>'+
      '<div><span class="neg">Losses:</span> <strong>'+losses.length+'</strong></div>'+
      '<div><span class="wrn">BE:</span> <strong>'+be.length+'</strong></div>'+
      '<div><span style="color:var(--bl)">Awaiting History:</span> <strong>'+awaitingHistory.length+'</strong></div>'+
      '<div><span style="color:var(--pu)">No Fill:</span> <strong>'+noFills.length+'</strong></div>'+
      '<div>Win Rate: <strong>'+(closed.length?((wins.length/closed.length)*100).toFixed(1)+'%':'—')+'</strong></div>'+
      '<div>Fill Rate: <strong style="color:'+(_resolved&&closed.length/_resolved>=0.7?'var(--gr)':_resolved&&closed.length/_resolved>=0.5?'var(--am)':'var(--re)')+'">'+_fillRate+'</strong></div>'+
      '<div style="width:100%;margin-top:6px;padding-top:6px;border-top:1px solid var(--bd);font-family:var(--mo);font-size:11px">'+'Net P/L: <span style="color:'+(totalPL_USC>=0?'var(--gr)':'var(--re)')+'">' + plUSC(totalPL_USC) + '</span> &nbsp;·&nbsp; <span style="color:var(--dm)">' + plZAR(totalPL_USC) + '</span></div>'+
      '</div>';
  }
  var nt='<div style="color:var(--mu);font-size:12px;padding:8px 0">No closed tests yet</div>';
  function atbl(headers,rows){if(!rows) return nt;return '<table style="width:100%;font-size:12px"><thead>   th'+headers.map(function(h){return '<th style="padding:4px 8px;background:var(--bg3);color:var(--mu);font-family:var(--mo);font-size:9px;letter-spacing:1px">'+h+'</th>';}).join('')+'</thead><tbody>'+rows+'</tbody>数量';}
  if(!closed.length){['an-star','an-zone','an-regime','an-pair'].forEach(function(id){document.getElementById(id).innerHTML=nt;});return;}
  var sr='';[1,2,3,4,5].forEach(function(s){var sc=closed.filter(function(x){return x.zoneStars===s;});if(!sc.length) return;var sw=sc.filter(function(x){return x.outcome.indexOf('WIN')===0;});var wr=(sw.length/sc.length*100).toFixed(0);var ap=sw.filter(function(x){return x.closePips;}).map(function(x){return x.closePips;});var avg=ap.length?(ap.reduce(function(a,b){return a+b;},0)/ap.length).toFixed(0)+'p':'-';var c=wr>=60?'var(--gr)':wr>=45?'var(--am)':'var(--re)';sr+='<tr><td style="padding:5px 8px;border-bottom:1px solid var(--bd)">'+s+'-star</td><td style="padding:5px 8px;border-bottom:1px solid var(--bd)">'+sc.length+'</td><td style="padding:5px 8px;border-bottom:1px solid var(--bd);color:'+c+';font-weight:700">'+wr+'%</td><td style="padding:5px 8px;border-bottom:1px solid var(--bd)">'+avg+'</td></tr>';});document.getElementById('an-star').innerHTML=atbl(['Stars','Tests','Hold Rate','Avg Pips'],sr||null);
  var zm={};closed.forEach(function(x){if(x.zonePct){if(!zm[x.zonePct])zm[x.zonePct]=[];zm[x.zonePct].push(x);}});var zr='';Object.keys(zm).forEach(function(z){var zc=zm[z];var zw=zc.filter(function(x){return x.outcome.indexOf('WIN')===0;});var wr=(zw.length/zc.length*100).toFixed(0);var c=wr>=60?'var(--gr)':wr>=45?'var(--am)':'var(--re)';zr+='<tr><td style="padding:5px 8px;border-bottom:1px solid var(--bd)">'+z+'</td><td style="padding:5px 8px;border-bottom:1px solid var(--bd)">'+zc.length+'</td><td style="padding:5px 8px;border-bottom:1px solid var(--bd);color:'+c+';font-weight:700">'+wr+'%</td></tr>';});document.getElementById('an-zone').innerHTML=atbl(['Zone','Tests','Hold Rate'],zr||null);
  var rm={};closed.forEach(function(x){if(x.regimeGate){if(!rm[x.regimeGate])rm[x.regimeGate]=[];rm[x.regimeGate].push(x);}});var rr='';Object.keys(rm).forEach(function(rg){var rc=rm[rg];var rw=rc.filter(function(x){return x.outcome.indexOf('WIN')===0;});var wr=(rw.length/rc.length*100).toFixed(0);var c=wr>=60?'var(--gr)':wr>=45?'var(--am)':'var(--re)';rr+='<tr><td style="padding:5px 8px;border-bottom:1px solid var(--bd)">'+rg+'</td><td style="padding:5px 8px;border-bottom:1px solid var(--bd)">'+rc.length+'</td><td style="padding:5px 8px;border-bottom:1px solid var(--bd);color:'+c+';font-weight:700">'+wr+'%</td></tr>';});document.getElementById('an-regime').innerHTML=atbl(['Regime','Tests','Hold Rate'],rr||null);
  var pr='';PAIRS.forEach(function(p){var pc=closed.filter(function(x){return x.pair===p;});if(!pc.length) return;var pw=pc.filter(function(x){return x.outcome.indexOf('WIN')===0;});var wr=(pw.length/pc.length*100).toFixed(0);var pl=pc.filter(function(x){return x.closePL!=null;}).reduce(function(a,x){return a+x.closePL;},0).toFixed(2);var c=wr>=60?'var(--gr)':wr>=45?'var(--am)':'var(--re)';pr+='<tr><td style="padding:5px 8px;border-bottom:1px solid var(--bd)">'+p+'</td><td style="padding:5px 8px;border-bottom:1px solid var(--bd)">'+pc.length+'</td><td style="padding:5px 8px;border-bottom:1px solid var(--bd);color:'+c+';font-weight:700">'+wr+'%</td><td style="padding:5px 8px;border-bottom:1px solid var(--bd);color:'+(pl>=0?'var(--gr)':'var(--re)')+'">'+pl+' USC</td><td style="padding:5px 8px;border-bottom:1px solid var(--bd);color:var(--dm);font-size:11px">' + plZAR(parseFloat(pl)) + '</td></tr>';});document.getElementById('an-pair').innerHTML=atbl(['Pair','Tests','Hold Rate','P/L USC','P/L ZAR'],pr||null);
}
function renderBook(){
  var tb=document.getElementById('btbody');
  if(!curPos||!curPos.length){
    tb.innerHTML='<tr><td colspan="14" style="text-align:center;color:var(--mu);padding:20px;font-family:var(--mo);font-size:11px">No open positions - upload report to load book</td></tr>';
    return;
  }
  tb.innerHTML=curPos.map(function(p,i){var isJPY=p.pair&&p.pair.indexOf('JPY')>-1;var mult=isJPY?100:10000,dp=isJPY?2:5;var slP=p.sl?(Math.abs(p.entry-p.sl)*mult).toFixed(0):'-';var toSL=p.sl&&p.mkt?(p.dir==='SELL'?(p.sl-p.mkt)*mult:(p.mkt-p.sl)*mult).toFixed(0):'-';var be=p.sl&&Math.abs(p.sl-p.entry)<(isJPY?0.02:0.00002);var slSt=be?'BE OK':parseFloat(toSL)<100?'WATCH':'OK';var slC=be?'var(--gr)':parseFloat(toSL)<100?'var(--am)':'var(--mu)';return '<tr><td class="mn" style="color:var(--mu)">'+(i+1)+'</td><td class="mn" style="color:var(--mu);font-size:10px">'+p.id+'</td><td style="color:var(--mu);font-size:10px">'+(p.ot||'').slice(0,10)+'</td><td class="mn"><strong>'+(p.pair||'—')+'</strong></td><td>'+(p.dir==='BUY'?'<span class="pg2 pill">BUY</span>':'<span class="pr2 pill">SELL</span>')+'</td><td class="mn">'+p.lots+'</td><td class="mn">'+p.entry.toFixed(dp)+'</td><td class="mn neg">'+(p.sl?p.sl.toFixed(dp):'-')+'</td><td class="mn">'+p.mkt.toFixed(dp)+'</td><td class="mn">'+slP+'p</td><td class="mn" style="color:'+(parseFloat(toSL)<100?'var(--am)':'var(--mu)')+'">'+toSL+'p</td><td class="mn" style="color:var(--mu)">'+p.swap.toFixed(2)+'</td><td class="mn" style="color:'+(p.profit>=0?'var(--gr)':'var(--re)')+'">'+(p.profit>=0?'+':'')+p.profit.toFixed(2)+'</td><td style="color:'+slC+';font-weight:600;font-family:var(--mo);font-size:10px">'+slSt+'</td></tr>';}).join('');
}
function renderOrders(orders){
  var tb=document.getElementById('otbody');
  if(!orders||!orders.length){
    tb.innerHTML='<tr><td colspan="11" style="text-align:center;color:var(--mu);padding:20px;font-family:var(--mo);font-size:11px">No pending orders in this report</td></tr>';
    return;
  }
  tb.innerHTML=orders.map(function(o){var isJPY=o.pair&&o.pair.indexOf('JPY')>-1;var mult=isJPY?100:10000,dp=isJPY?2:5;var buy=o.type&&o.type.indexOf('buy')>-1;var dist=o.mkt?((buy?(o.mkt-o.entry):(o.entry-o.mkt))*mult).toFixed(0):'-';var slP=o.sl&&o.entry?Math.abs(o.entry-o.sl)*mult:null;var pv=getPipValueAccount(o.pair,true)||0.10;var risk=slP?(slP*(o.lots/0.01)*pv).toFixed(2):'-';var rr=slP&&o.tp?'1:'+(Math.abs(o.tp-o.entry)/Math.abs(o.entry-o.sl)).toFixed(1):'-';var ch=getChopBand(o.pair);var chopF=ch?(o.entry>=ch.lo&&o.entry<=ch.hi?'<span class="pr2 pill">CHOP</span>':'<span class="pg2 pill">Clear</span>'):'<span class="pgy pill">-</span>';var noSL=!o.sl?'<span class="pr2 pill">NO SL</span>':o.sl.toFixed(dp);var tstr=o.type?o.type.toUpperCase():'';return '<tr><td class="mn" style="color:var(--mu)">'+o.id+'</td><td class="mn"><strong>'+o.pair+'</strong></td><td>'+(buy?'<span class="pg2 pill">':'<span class="pr2 pill">')+tstr+'</span></td><td class="mn">'+o.lots+'</td><td class="mn">'+(o.entry?o.entry.toFixed(dp):'-')+'</td><td class="mn neg">'+noSL+'</td><td class="mn pos">'+(o.tp?o.tp.toFixed(dp):'-')+'</td><td class="mn" style="color:var(--dm)">'+dist+'p</td><td class="mn wrn">'+risk+' USC</td><td class="mn">'+rr+'</td><td>'+chopF+'</td></tr>';}).join('');
}
function renderProgress(){
  var d0ids={};(baseline&&baseline.positions||[]).forEach(function(d){d0ids[d.id]=true;});var post=signals.filter(function(s){return !d0ids[s.posId];});
  document.getElementById('pprog').innerHTML=PAIRS.map(function(p){var n=post.filter(function(s){return s.pair===p;}).length;var pct=Math.min(n/TARGET*100,100);var col=pct>=100?'pfg':pct>=60?'pfa':'pfb';return '<div class="prow"><div class="pnm">'+p+'</div><div style="flex:1"><div class="pr_b"><div class="pf '+col+'" style="width:'+pct+'%"></div></div></div><div style="font-family:var(--mo);font-size:11px;font-weight:700;width:36px;text-align:right;color:'+(pct>=100?'var(--gr)':'var(--dm)')+'">'+n+'</div><div style="font-family:var(--mo);font-size:9px;color:var(--mu);width:42px"> / '+TARGET+(pct>=100?' OK':'')+'</div></div>';}).join('');
  var days=getElapsedDays();var pct=Math.min(days/TDAYS*100,100);var col=pct>=100?'pfg':pct>=50?'pfa':'pfb';
  var csKv=document.getElementById('collection-start-kv');
  if(csKv){var startDate=lsGet('sn_start')||'—'; csKv.textContent=startDate;}
  document.getElementById('tprog').innerHTML='<div style="display:flex;justify-content:space-between;font-family:var(--mo);font-size:10px;margin-bottom:4px"><span style="color:var(--mu)">Days elapsed</span><span style="color:'+(pct>=100?'var(--gr)':'var(--dm)')+'">Day '+days+' / '+TDAYS+(pct>=100?' DONE':'')+'</span></div><div class="pr_b" style="height:8px"><div class="pf '+col+'" style="width:'+pct.toFixed(1)+'%"></div></div><div style="font-family:var(--mo);font-size:10px;color:var(--mu);margin-top:4px">'+Math.max(TDAYS-days,0)+' days remaining</div>';
}
function exportReportHtml(){
  var d0ids={};(baseline&&baseline.positions||[]).forEach(function(d){d0ids[d.id]=true;});
  var post=signals.filter(function(s){return !d0ids[s.posId];});
  if(!post.length){xtoast('No signals to export','warn');return;}
  var closed=post.filter(function(s){return s.outcome!=='OPEN'&&s.outcome!=='AWAIT_HISTORY';});
  var wins=closed.filter(function(s){return s.outcome.indexOf('WIN')===0;});
  var losses=closed.filter(function(s){return s.outcome==='LOSS-SL';});
  var be=closed.filter(function(s){return s.outcome==='BE';});
  var totalPL_USC = closed.reduce(function(s, sig) { return s + (sig.closePL || 0); }, 0);
  var winRate = closed.length ? (wins.length / closed.length * 100).toFixed(1) : 0;
  var days=getElapsedDays();
  var eq=(acct && acct.equity ? acct.equity : 0).toLocaleString();
  var sigRows=post.map(function(s,i){var isJPY=s.pair&&s.pair.indexOf('JPY')>-1,dp=isJPY?2:5;var oc=s.outcome||'OPEN';var ocC=oc.indexOf('WIN')===0?'color:#1fdb7a':oc==='BE'?'color:#f5a623':oc.indexOf('LOSS')===0?'color:#f5414f':'color:#3d8ef5';return '<tr style="border-bottom:1px solid #1e2738"><td style="padding:6px 9px;font-family:monospace">'+(i+1)+'</td><td style="padding:6px 9px;font-family:monospace">'+s.posId+'</td><td style="padding:6px 9px">'+(s.openTime||'').slice(0,10)+'</td><td style="padding:6px 9px;font-weight:700">'+s.pair+'</td><td style="padding:6px 9px;color:'+(s.dir==='BUY'?'#1fdb7a':'#f5414f')+'">'+s.dir+'</td><td style="padding:6px 9px;font-family:monospace">'+(s.entry?s.entry.toFixed(dp):'-')+'</td><td style="padding:6px 9px;font-family:monospace;color:#f5414f">'+(s.sl?s.sl.toFixed(dp):'-')+'</td><td style="padding:6px 9px;color:#f5a623">'+(s.zonePct||'OFF ZONE')+'</td><td style="padding:6px 9px">'+(s.zoneStars?s.zoneStars+'-star':'-')+'</td><td style="padding:6px 9px">'+(s.slPips?s.slPips+'p':'-')+'</td><td style="padding:6px 9px;color:#f5a623">'+(s.riskUSC?s.riskUSC+' USC':'-')+'</td><td style="padding:6px 9px">'+(s.rr1?'1:'+s.rr1:'-')+'</td><td style="padding:6px 9px">'+(s.regimeGate||'-')+'</td><td style="padding:6px 9px;font-weight:700;'+ocC+'">'+oc+'</td><td style="padding:6px 9px;font-family:monospace;color:'+(s.closePips>0?'#1fdb7a':s.closePips<0?'#f5414f':'#8899b0')+'">'+(s.closePips!=null?(s.closePips>0?'+':'')+s.closePips+'p':'-')+'</td><td style="padding:6px 9px;font-family:monospace;color:'+(s.closePL!=null?(s.closePL>=0?'#1fdb7a':'#f5414f'):'#8899b0')+'">'+(s.closePL!=null?plBothText(s.closePL):'-')+'</td></tr>';}).join('');
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Sniper 4a Report Day '+days+'</title></head><body style="background:#080b10;color:#dde4f0;font-family:DM Sans,sans-serif;padding:24px;font-size:13px"><div style="font-family:monospace;font-size:10px;letter-spacing:3px;color:#e8a020;margin-bottom:6px">SNIPER v12.0.9.1 PHASE 4a REPORT</div><h1 style="font-family:monospace;font-size:20px;margin-bottom:4px">Level Test Report Day '+days+'</h1><div style="color:#8899b0;font-size:12px;margin-bottom:20px">Account 1220086 - Kudzanai Lloyd Taruvinga - '+new Date().toISOString().slice(0,16).replace('T',' ')+' SAST</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px"><div style="background:#111620;border:1px solid #1e2738;border-radius:6px;padding:14px"><div style="font-family:monospace;font-size:9px;letter-spacing:2px;color:#4a5568;margin-bottom:6px">EQUITY</div><div style="font-family:monospace;font-size:22px;font-weight:700;color:#1fdb7a">'+eq+'</div><div style="font-size:11px;color:#8899b0">USC</div></div><div style="background:#111620;border:1px solid #1e2738;border-radius:6px;padding:14px"><div style="font-family:monospace;font-size:9px;letter-spacing:2px;color:#4a5568;margin-bottom:6px">SIGNALS</div><div style="font-family:monospace;font-size:22px;font-weight:700;color:#3d8ef5">'+post.length+'</div><div style="font-size:11px;color:#8899b0">'+closed.length+' closed</div></div><div style="background:#111620;border:1px solid #1e2738;border-radius:6px;padding:14px"><div style="font-family:monospace;font-size:9px;letter-spacing:2px;color:#4a5568;margin-bottom:6px">HOLD RATE</div><div style="font-family:monospace;font-size:22px;font-weight:700;color:#1fdb7a">'+(closed.length?(wins.length/closed.length*100).toFixed(1)+'%':'-')+'</div><div style="font-size:11px;color:#8899b0">'+wins.length+'W / '+closed.length+' closed</div></div><div style="background:#111620;border:1px solid #1e2738;border-radius:6px;padding:14px"><div style="font-family:monospace;font-size:9px;letter-spacing:2px;color:#4a5568;margin-bottom:6px">DAY</div><div style="font-family:monospace;font-size:22px;font-weight:700;color:#f5a623">'+days+'</div><div style="font-size:11px;color:#8899b0">of 90</div></div></div><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead><tr style="background:#161d2a">'+['Num','Pos ID','Date','Pair','Dir','Entry','SL','Zone','Stars','SL Pips','Risk USC','R:R','Regime','Outcome','Pips','P/L USC'].map(function(h){return '<th style="padding:7px 9px;font-family:monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#4a5568;text-align:left;border-bottom:1px solid #28334a">'+h+'</th>';}).join('')+'</thead><tbody>'+sigRows+'</tbody>'+
    '<tfoot><tr style="border-top:2px solid #28334a; background:#111620"><td colspan="14" style="text-align:right; font-weight:700">Totals:</td><td style="color:'+(totalPL_USC>=0?'#1fdb7a':'#f5414f')+'">'+(totalPL_USC>=0?'+':'')+totalPL_USC.toFixed(2)+' USC<br><span style="font-size:10px;color:#4a5568">' + plZAR(totalPL_USC) + '</span></td><td></td></tr>'+
    '<tr><td colspan="14" style="text-align:right">Wins: '+wins.length+' | Losses: '+losses.length+' | BE: '+be.length+' | Win Rate: '+winRate+'%</td><td colspan="2"></td></tr>'+
    '</tfoot></table></div></body></html>';
  var a=document.createElement('a');a.href='data:text/html;charset=utf-8,'+encodeURIComponent(html);a.download='sniper_4a_report_day'+days+'_'+new Date().toISOString().slice(0,10)+'.html';a.click();xtoast('Report exported','ok');
}
function exportReport(){
  var chooser=document.getElementById('export-chooser');
  if(!chooser) return;
  var isVisible=chooser.style.display!=='none';
  if(isVisible){
    hideExportChooser();
  } else {
    chooser.style.display='flex';
    setTimeout(function(){
      bindExportChooserDismiss();
    },0);
  }
}
var exportChooserDismissBound=false;
function bindExportChooserDismiss(){
  if(exportChooserDismissBound) return;
  document.addEventListener('click',hideExportChooserOnBlur);
  exportChooserDismissBound=true;
}
function unbindExportChooserDismiss(){
  if(!exportChooserDismissBound) return;
  document.removeEventListener('click',hideExportChooserOnBlur);
  exportChooserDismissBound=false;
}
function hideExportChooser(){
  var chooser=document.getElementById('export-chooser');
  if(chooser) chooser.style.display='none';
  unbindExportChooserDismiss();
}
function hideExportChooserOnBlur(e){
  var chooser=document.getElementById('export-chooser');
  if(!chooser){ unbindExportChooserDismiss(); return; }
  if(chooser.contains(e.target)) return;
  hideExportChooser();
}
function exportCSV(){
  var d0ids={};(baseline&&baseline.positions||[]).forEach(function(d){d0ids[d.id]=true;});var post=signals.filter(function(s){return !d0ids[s.posId];});if(!post.length){xtoast('No signals to export','warn');return;}
  var h=['Num','PosID','OpenTime','Pair','Dir','Entry','SL','TP','Lots','ZonePct','ZonePrice','ZoneStars','ZoneFib','ZoneDistPips','ZoneMatch','InChop','Regime','RegimeOk','Verdict','SlPips','RiskUSC','RiskZAR','RR1','Outcome','ClosePL','ClosePips','CloseDate'];
  var rows=post.map(function(s,i){return [i+1,s.posId,s.openTime,s.pair,s.dir,s.entry,s.sl,s.tp,s.lots,s.zonePct,s.zonePrice,s.zoneStars,s.zoneFib,s.zoneDistPips,s.zoneMatch,s.inChop,s.regimeGate,s.regimeOk,s.verdict,s.slPips,s.riskUSC,s.riskZAR,s.rr1,s.outcome,s.closePL,s.closePips,s.closeDate];});
  var closed=post.filter(function(s){return s.outcome!=='OPEN'&&s.outcome!=='AWAIT_HISTORY';});
  var wins=closed.filter(function(s){return s.outcome.indexOf('WIN')===0;});
  var losses=closed.filter(function(s){return s.outcome==='LOSS-SL';});
  var be=closed.filter(function(s){return s.outcome==='BE';});
  var totalPL_USC = closed.reduce(function(s, sig) { return s + (sig.closePL || 0); }, 0);
  var winRate = closed.length ? (wins.length / closed.length * 100).toFixed(1) : 0;
  var days=getElapsedDays();
  var csvContent = [h.join(',')].concat(rows.map(function(r){return r.map(function(v){return typeof v==='string'?'"'+v.replace(/"/g,'""')+'"':v;}).join(',');})).join('\n');
  csvContent += '\n\n"Net P/L (USC)","' + totalPL_USC.toFixed(2) + '"';
  csvContent += ',"Net P/L (ZAR)","' + (totalPL_USC * ZAR).toFixed(2) + '"';
  csvContent += '\n"Wins","' + wins.length + '","Losses","' + losses.length + '","BE","' + be.length + '","Win Rate","' + winRate + '%"';
  var a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csvContent);a.download='sniper_4a_day'+days+'_'+new Date().toISOString().slice(0,10)+'.csv';a.click();xtoast('CSV exported','ok');
}
function _testDaysRemaining(){
  var end=new Date(START);end.setDate(end.getDate()+90);
  return Math.ceil((end-new Date())/86400000);
}
function updateResetBtn(){
  var btn=document.getElementById('reset-btn');if(!btn)return;
  var rem=_testDaysRemaining();
  if(rem>0){
    btn.disabled=true;
    btn.title='Reset locked - Phase 4a test active ('+rem+' day'+(rem===1?'':'s')+' remaining)';
    btn.style.opacity='0.38';btn.style.cursor='not-allowed';
    btn.textContent='Reset (locked)';
  } else {
    btn.disabled=false;
    btn.title='Reset all dashboard data';
    btn.style.opacity='';btn.style.cursor='';
    btn.textContent='Reset';
  }
}
function resetAll(){
  var rem=_testDaysRemaining();
  if(rem>0){
    xtoast('Reset locked - Phase 4a test ends in '+rem+' day'+(rem===1?'':'s')+'. Data must be preserved for the full 90-day window.','warn');
    return;
  }
  if(!confirm('Phase 4a test is complete. Reset ALL data? This cannot be undone.')) return;
  ['sn_sig','sn_snap','sn_act','sn_pos','sn_baseline','sn_start','sn_acctinfo','sn_closed','sn_fib_tf'].forEach(function(k){lsDel(k);});
  signals=[];snaps=[];acct=null;acctInfo={};curPos=[];baseline=null;closedTrades=[];liveSignals=[];savedSeqStatus={};savedRegimes={};savedPrices={};lastLiveFetch=null;lastFetchTime=null;lastRegimeFetch=null;window._lastWpRegimeMeta=null;syncRuntimeTimeframe('Yearly');EF_LEVELS={};SFL_ANCHORS={};
  document.getElementById('delpan').style.display='none';
  document.getElementById('plan-output').style.display='none';
  document.getElementById('upstat').textContent='All data reset. Upload a report to establish new baseline.';
  document.getElementById('hist-stat').textContent='No history file loaded yet - exact close analytics stay pending until history is imported';
  document.getElementById('hdr-name').innerHTML='';
  document.getElementById('hdr-account').innerHTML='Upload report to begin';
  START=new Date().toISOString().slice(0,10);
  ZAR=0.167035;
  MARKET_DATA_READY=!!API.NONCE && USER_SYNC.authenticated;
  persistTradesLocal();
  persistAccountLocal();
  persistSettingsLocal();
  queueUserSync('trades',0);
  queueUserSync('account',0);
  queueUserSync('settings',0);
  hydrateUserInputFields();
  buildPriceInputs();renderSessionBrief();renderSeqCards();renderLiveSignals();renderAcct();renderBook();renderSigs();renderAnalytics();renderProgress();
  updateResetBtn();
  xtoast('Reset complete','warn');
}
function findScrollableDashboardContainer(node){
  var current = node && node.parentElement;
  while(current && current !== document.body){
    var style = window.getComputedStyle ? window.getComputedStyle(current) : null;
    var overflowY = style ? style.overflowY : '';
    var canScroll = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && current.scrollHeight > current.clientHeight;
    if(canScroll) return current;
    current = current.parentElement;
  }
  return null;
}

function focusActiveTabPanel(panel, options){
  options = options || {};
  if(!panel || options.focus === false) return;
  var scrollMode = options.scroll;
  var focusTarget = panel.querySelector('[data-tab-focus]') || panel;
  if(!focusTarget.getAttribute || !focusTarget.getAttribute('tabindex')) {
    try { focusTarget.setAttribute('tabindex','-1'); } catch(e) {}
  }
  var shouldScroll = scrollMode === true;
  if(scrollMode !== false && scrollMode !== true){
    var targetRect = focusTarget.getBoundingClientRect ? focusTarget.getBoundingClientRect() : null;
    var topbar = document.querySelector('.smc-topbar');
    var offset = (topbar && topbar.offsetHeight ? topbar.offsetHeight : 0) + 12;
    if(targetRect) shouldScroll = targetRect.top < offset || targetRect.bottom > (window.innerHeight || document.documentElement.clientHeight || 0);
  }
  var run = function(){
    try {
      if(typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll:true });
    } catch(e){
      try { if(typeof focusTarget.focus === 'function') focusTarget.focus(); } catch(_ignored){}
    }
    if(shouldScroll){
      var scrollContainer = findScrollableDashboardContainer(focusTarget);
      var topbar = document.querySelector('.smc-topbar');
      var offset = (topbar && topbar.offsetHeight ? topbar.offsetHeight : 0) + 12;
      try {
        if(scrollContainer){
          var focusRect = focusTarget.getBoundingClientRect();
          var containerRect = scrollContainer.getBoundingClientRect();
          var nextTop = scrollContainer.scrollTop + (focusRect.top - containerRect.top) - 8;
          scrollContainer.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
        } else if(typeof window.scrollTo === 'function'){
          var targetTop = (window.pageYOffset || document.documentElement.scrollTop || 0) + focusTarget.getBoundingClientRect().top - offset;
          window.scrollTo({ top: Math.max(0, targetTop), behavior:'smooth' });
        } else if(typeof focusTarget.scrollIntoView === 'function'){
          focusTarget.scrollIntoView({ behavior:'smooth', block:'start', inline:'nearest' });
        }
      } catch(e){
        if(typeof focusTarget.scrollIntoView === 'function') focusTarget.scrollIntoView(true);
      }
    }
  };
  if(typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run,0);
}

function switchSection(sectionId, options){
  options = Object.assign({ scroll: 'auto', focus: true }, options || {});
  var normalized = normalizeSectionId(sectionId);
  var targetPanel = document.getElementById(getSectionPanelId(normalized));
  if(!targetPanel) return SECTION_DEFAULT;

  document.querySelectorAll('.tp').forEach(function(panel){
    var isActive = panel === targetPanel;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    if(!isActive){
      panel.removeAttribute('tabindex');
      var staleFocusTarget = panel.querySelector('[data-tab-focus][tabindex="-1"]');
      if(staleFocusTarget) staleFocusTarget.removeAttribute('tabindex');
    }
  });

  activeSectionId = normalized;
  updateSectionNavState(normalized);

  if(options.updateHash !== false){
    var nextHash = '#' + normalized;
    if(window.location.hash !== nextHash){
      window.history.replaceState(null, '', nextHash);
    }
  }

  if(normalized === 'charts'){
    ensureChartViewport();
    showChart(_tvCurrentSymbol || 'FX:GBPUSD', null);
  }

  if(options.closeNav !== false) closeMobileNav();
  focusActiveTabPanel(targetPanel, options);
  return normalized;
}

function ensureChartViewport(){
  var panel = document.getElementById('tab-charts');
  var container = document.getElementById('tv-chart-container');
  var inner = document.getElementById('tv-chart-inner');
  var widgetWrap = container ? container.querySelector('.tradingview-widget-container') : null;
  var viewportHeight = window.innerHeight || 900;
  var chartMinHeight = Math.max(420, Math.min(680, viewportHeight - 220));
  var panelMinHeight = chartMinHeight + 120;
  if(panel){
    panel.style.minHeight = panelMinHeight + 'px';
    panel.style.width = '100%';
    panel.style.maxWidth = '100%';
    panel.style.display = 'block';
  }
  if(container){
    container.style.minHeight = chartMinHeight + 'px';
    container.style.height = chartMinHeight + 'px';
    container.style.width = '100%';
    container.style.maxWidth = '100%';
    container.style.display = 'block';
    container.style.boxSizing = 'border-box';
  }
  if(widgetWrap){
    widgetWrap.style.minHeight = chartMinHeight + 'px';
    widgetWrap.style.height = chartMinHeight + 'px';
    widgetWrap.style.width = '100%';
    widgetWrap.style.maxWidth = '100%';
    widgetWrap.style.display = 'block';
    widgetWrap.style.boxSizing = 'border-box';
  }
  if(inner){
    inner.style.minHeight = chartMinHeight + 'px';
    inner.style.height = chartMinHeight + 'px';
    inner.style.width = '100%';
    inner.style.maxWidth = '100%';
    inner.style.display = 'block';
    inner.style.boxSizing = 'border-box';
  }
}
function chartSymbolForPair(pair){
  var normalized = String(pair || '').trim().toUpperCase();
  var staticMatch = STATIC_CHART_INSTRUMENTS.filter(function(entry){
    return entry.pair.toUpperCase() === normalized;
  })[0];
  if(staticMatch) return staticMatch.symbol;
  if(PAIR_SYMBOLS[pair]) {
    var current = String(PAIR_SYMBOLS[pair]);
    if(current.indexOf(':') > -1) return current;
  }
  if(normalized === 'XAU/USD') return 'OANDA:XAUUSD';
  if(normalized === 'US30') return 'OANDA:US30USD';
  if(normalized === 'NAS100') return 'OANDA:NAS100USD';
  if(normalized === 'BTC.D') return 'CRYPTOCAP:BTC.D';
  if(normalized.indexOf('/') > -1) return 'FX:' + normalized.replace('/','');
  return String(PAIR_SYMBOLS[pair] || pair || '');
}
function renderChartPairButtons(){
  var wrap = document.getElementById('chart-pair-btns');
  if(!wrap) return;
  var seen = {};
  var entries = STATIC_CHART_INSTRUMENTS.slice();
  PAIRS.forEach(function(pair){
    if(!pair) return;
    if(entries.some(function(entry){ return entry.pair === pair; })) return;
    entries.push({ pair: pair, symbol: chartSymbolForPair(pair) });
  });
  wrap.innerHTML = entries.filter(function(entry){
    var key = String(entry.pair || '');
    if(!key || seen[key]) return false;
    seen[key] = true;
    return true;
  }).map(function(entry, idx){
    var active = entry.symbol === _tvCurrentSymbol || (!_tvCurrentSymbol && idx === 0);
    return '<button class="btn ' + (active ? 'bta' : 'btg') + ' bts" type="button" data-chart-symbol="' + String(entry.symbol).replace(/"/g,'&quot;') + '" onclick="showChart(\'' + String(entry.symbol).replace(/'/g,'\\\'') + '\',this)">' + entry.pair + '</button>';
  }).join('');
}
function refreshTrackedInstrumentViews(){
  buildPriceInputs();
  renderSessionBrief();
  renderSeqCards();
  renderLiveSignals();
  renderTradeQueue();
  renderComputedSignalCards();
  renderAnalytics();
  renderProgress();
  renderChartContextPanel();
  publishRuntimeState();
  generatePlan();
}
function xtab(t, options){
  return switchSection(t, options);
}
function firstNonEmptyText(values){
  var list = Array.isArray(values) ? values : Array.prototype.slice.call(arguments);
  for(var i=0;i<list.length;i++){
    var value = list[i];
    if(value == null) continue;
    if(typeof value === 'number' && !isNaN(value)) return String(value);
    if(String(value).trim() !== '') return String(value);
  }
  return '';
}
function firstFiniteNumber(values){
  var list = Array.isArray(values) ? values : Array.prototype.slice.call(arguments);
  for(var i=0;i<list.length;i++){
    var value = list[i];
    if(value == null || value === '') continue;
    var numeric = Number(value);
    if(!isNaN(numeric) && isFinite(numeric)) return numeric;
  }
  return null;
}
function chartPairFromSymbol(symbol){
  var target = String(symbol || '').trim().toUpperCase();
  if(!target) return '';
  for(var i=0;i<STATIC_CHART_INSTRUMENTS.length;i++){
    if(String(STATIC_CHART_INSTRUMENTS[i].symbol || '').toUpperCase() === target){
      return STATIC_CHART_INSTRUMENTS[i].pair;
    }
  }
  var pairMatch = Object.keys(PAIR_SYMBOLS).filter(function(pair){
    return String(PAIR_SYMBOLS[pair] || '').trim().toUpperCase() === target;
  })[0];
  if(pairMatch) return pairMatch;
  var displayPair = toPairDisplay(target);
  return displayPair && displayPair !== target ? displayPair : '';
}
function normalizeChartSymbol(symbol, fallbackPair){
  var raw = String(symbol || '').trim();
  var pair = toPairDisplay(fallbackPair || raw);
  if(pair) return chartSymbolForPair(pair);
  return raw.toUpperCase();
}
function chartSourceLabel(kind){
  if(kind === 'live') return 'Live Radar';
  if(kind === 'computed') return 'Signal Engine';
  if(kind === 'queue') return 'Trade Queue';
  if(kind === 'signals') return 'Level Log';
  return 'Charts';
}
function getTradeQueueItemForPair(pair, direction){
  var normalizedPair = toPairDisplay(pair);
  var rows = (tradeQueue || []).filter(function(bp){
    if(!bp || toPairDisplay(bp.pair) !== normalizedPair) return false;
    if(direction && bp.direction && bp.direction !== direction) return false;
    return true;
  });
  rows.sort(function(a,b){
    return new Date(b.updated_at || b.generated_at || 0) - new Date(a.updated_at || a.generated_at || 0);
  });
  return rows[0] || null;
}
function getSignalLogEntry(pair, posId){
  var normalizedPair = toPairDisplay(pair);
  var rows = (signals || []).filter(function(sig){
    if(!sig) return false;
    if(posId && String(sig.posId || '') !== String(posId)) return false;
    if(normalizedPair && toPairDisplay(sig.pair) !== normalizedPair) return false;
    return true;
  });
  rows.sort(function(a,b){
    return new Date(b.closeDate || b.openTime || 0) - new Date(a.closeDate || a.openTime || 0);
  });
  return rows[0] || null;
}
function collectChartEntryLevels(pair, seed, live, queue, computed, history){
  var levels = [];
  var seen = {};
  var dp = isPairJPY(pair) ? 2 : 5;
  function pushLevel(label, price, status){
    var numeric = firstFiniteNumber([price]);
    if(numeric == null) return;
    var key = [label || 'Entry', Number(numeric).toFixed(dp)].join('|');
    if(seen[key]) return;
    seen[key] = true;
    levels.push({
      label: label || 'Entry',
      price: numeric,
      status: status || ''
    });
  }
  if(seed && Array.isArray(seed.entry_levels)){
    seed.entry_levels.forEach(function(level, idx){
      if(level && typeof level === 'object') pushLevel(level.label || ('E' + (idx + 1)), level.price, level.status);
      else pushLevel('E' + (idx + 1), level, '');
    });
  }
  if(live && Array.isArray(live.entries)){
    live.entries.forEach(function(level, idx){
      pushLevel(level.level || ('E' + (idx + 1)), level.price, level.status);
    });
  }
  if(queue && queue.risk_breakdown && Array.isArray(queue.risk_breakdown.stages)){
    var stageLabels = ['E1 Shallow', 'E2 Mid', 'E3 Deep'];
    queue.risk_breakdown.stages.forEach(function(stage, idx){
      pushLevel(stageLabels[idx] || ('E' + (idx + 1)), stage.entry, stage.lot === 0 ? 'Too small' : '');
    });
  }
  if(history && history.entry != null) pushLevel('Entry', history.entry, history.outcome || '');
  if(!levels.length && computed && computed.entry_zone_price != null) pushLevel('Zone', computed.entry_zone_price, computed.sequence_status || '');
  return levels;
}
function buildChartContext(seed){
  seed = seed && typeof seed === 'object' ? seed : { pair: seed };
  var pair = toPairDisplay(seed.pair || seed.instrument_id || seed.symbol) ||
    chartPairFromSymbol(seed.symbol || seed.instrument_id) ||
    _tvCurrentPair ||
    chartPairFromSymbol(_tvCurrentSymbol);
  var live = pair ? getBestLiveSignalForPair(pair, seed.direction || null) : null;
  var queue = pair ? getTradeQueueItemForPair(pair, seed.direction || null) : null;
  var computed = pair && computedSignals ? computedSignals[pair] || null : null;
  var history = getSignalLogEntry(pair, seed.posId || null);
  var symbol = normalizeChartSymbol(
    seed.symbol || seed.instrument_id || (live && (live.instrument_id || live.symbol)) || '',
    pair
  );
  var entryLevels = collectChartEntryLevels(pair, seed, live, queue, computed, history);
  var sourceKind = seed.sourceKind || (queue ? 'queue' : live ? 'live' : computed ? 'computed' : history ? 'signals' : 'chart');
  return {
    pair: pair,
    symbol: symbol,
    sourceKind: sourceKind,
    direction: firstNonEmptyText([seed.direction, live && live.direction, queue && queue.direction, computed && computed.direction, history && history.dir]),
    regime: firstNonEmptyText([seed.regime, live && live.regime, queue && queue.regime, computed && computed.regime, history && history.regimeGate]),
    sequence_status: firstNonEmptyText([seed.sequence_status, live && live.sequence_status, computed && computed.sequence_status]),
    signal_state: firstNonEmptyText([seed.signal_state, live && live.signal_state, queue && queue.signal_state, computed && computed.signal_state]),
    setup_class: firstNonEmptyText([seed.setup_class, live && live.setup_class, queue && queue.setup_class, computed && computed.setup_class, history && history.smcGrade]),
    market_price: firstFiniteNumber([seed.market_price, live && live.market_price, queue && queue.market_price]),
    zone_price: firstFiniteNumber([seed.zone_price, seed.entry_zone_price, live && live.zone_price, queue && queue.zone_price, history && history.zonePrice, computed && computed.entry_zone_price]),
    sl: firstFiniteNumber([seed.sl, live && live.sl, queue && queue.sl, history && history.sl]),
    tp1: firstFiniteNumber([seed.tp1, queue && queue.tp1, live && live.tp1, computed && computed.tp1, history && history.tp]),
    tp2: firstFiniteNumber([seed.tp2, queue && queue.tp2, live && live.tp2, computed && computed.tp2]),
    tp: firstFiniteNumber([seed.tp, queue && queue.tp, live && live.tp, computed && computed.tp, history && history.tp]),
    updated_at: firstNonEmptyText([seed.updated_at, live && live.updated_at, queue && queue.updated_at, queue && queue.generated_at, history && history.closeDate, history && history.openTime, computed && (computed.freshness_ts || computed.generated_at)]),
    blocked_reason: firstNonEmptyText([seed.blocked_reason, live && live.blocked_reason, queue && queue.blocked_reason]),
    source_detail: firstNonEmptyText([seed.provenance, seed.source, live && (live.provenance || live.source), queue && (queue.provenance || queue.source), computed && computed.source]),
    posId: seed.posId || (history && history.posId) || '',
    entry_levels: entryLevels
  };
}
function renderChartContextPanel(){
  var el = document.getElementById('chart-context-panel');
  if(!el) return;
  var context = buildChartContext(CHART_CONTEXT || { pair: _tvCurrentPair || chartPairFromSymbol(_tvCurrentSymbol), symbol: _tvCurrentSymbol, sourceKind: 'chart' });
  CHART_CONTEXT = context;
  if(!context.pair){
    el.innerHTML =
      '<div class="sfx-card__hd"><div><div class="sfx-card__title">Chart Context</div><div class="sfx-card__meta">Waiting for tracked instrument data</div></div></div>' +
      '<div class="sfx-chart-context__empty">Open a chart from Live Radar, Signal Plan, Trade Queue, or Level Log to sync the active setup.</div>';
    return;
  }
  var regimeClass = context.regime === 'TREND UP' ? 'rup' : context.regime === 'TREND DOWN' ? 'rdn' : context.regime === 'REVERSAL ZONE' ? 'rrv' : 'rrg';
  var dirClass = context.direction === 'BUY' ? 'pg2' : 'pr2';
  var grid = [];
  function pushMetric(label, value, className){
    if(value == null || value === '') return;
    grid.push(
      '<div class="sfx-chart-context__kv"><span class="sfx-chart-context__label">' + escapeHtmlAttr(label) + '</span>' +
      '<span class="sfx-chart-context__value' + (className ? ' ' + className : '') + '">' + value + '</span></div>'
    );
  }
  if(context.market_price != null) pushMetric('Market', escapeHtmlAttr(context.market_price.toFixed(isPairJPY(context.pair) ? 2 : 5)), '');
  if(context.zone_price != null) pushMetric('Zone', escapeHtmlAttr(context.zone_price.toFixed(isPairJPY(context.pair) ? 2 : 5)), 'wrn');
  if(context.sl != null) pushMetric('SL', escapeHtmlAttr(context.sl.toFixed(isPairJPY(context.pair) ? 2 : 5)), 'neg');
  if(context.tp1 != null) pushMetric('TP1', escapeHtmlAttr(context.tp1.toFixed(isPairJPY(context.pair) ? 2 : 5)), 'pos');
  if(context.tp2 != null) pushMetric('TP2', escapeHtmlAttr(context.tp2.toFixed(isPairJPY(context.pair) ? 2 : 5)), 'pos');
  if(context.tp != null) pushMetric('Final TP', escapeHtmlAttr(context.tp.toFixed(isPairJPY(context.pair) ? 2 : 5)), 'pos');
  if(context.setup_class) pushMetric('Setup', escapeHtmlAttr(cleanDisplayText(context.setup_class)), '');
  if(context.updated_at) pushMetric('Updated', escapeHtmlAttr(formatSastDateTime(context.updated_at)), '');
  var meta = [];
  meta.push('<span class="pgy pill">' + escapeHtmlAttr(chartSourceLabel(context.sourceKind)) + '</span>');
  if(context.direction) meta.push('<span class="' + dirClass + ' pill">' + escapeHtmlAttr(context.direction) + '</span>');
  if(context.signal_state) meta.push(statePill(context.signal_state));
  if(context.sequence_status) meta.push(seqPill(context.sequence_status));
  if(context.regime) meta.push('<span class="' + regimeClass + '">' + escapeHtmlAttr(context.regime) + '</span>');
  var levelsHtml = context.entry_levels.length
    ? '<div class="sfx-chart-context__levels">' + context.entry_levels.map(function(level){
        var suffix = level.status ? '<div class="sfx-chart-context__foot" style="margin-top:6px;padding-top:0;border-top:none">' + escapeHtmlAttr(cleanDisplayText(level.status)) + '</div>' : '';
        return '<div class="sfx-chart-context__level"><strong>' + escapeHtmlAttr(level.label) + '</strong><span class="sfx-chart-context__value">' +
          escapeHtmlAttr(Number(level.price).toFixed(isPairJPY(context.pair) ? 2 : 5)) + '</span>' + suffix + '</div>';
      }).join('') + '</div>'
    : '<div class="sfx-chart-context__empty">No entry ladder is available for this pair from the current live, queue, or signal-log data.</div>';
  var foot = context.blocked_reason
    ? '<div class="sfx-chart-context__foot">Blocked reason: ' + escapeHtmlAttr(cleanDisplayText(context.blocked_reason)) + '</div>'
    : '<div class="sfx-chart-context__foot">Chart sync is using live dashboard data only. Trading logic and sizing remain unchanged.</div>';
  el.innerHTML =
    '<div class="sfx-card__hd"><div><div class="sfx-card__title">Chart Context</div><div class="sfx-card__meta">' + escapeHtmlAttr(context.symbol || chartSymbolForPair(context.pair)) + '</div></div></div>' +
    '<div class="sfx-chart-context__summary"><div class="sfx-chart-context__pair">' + escapeHtmlAttr(context.pair) + '</div></div>' +
    '<div class="sfx-chart-context__meta">' + meta.join('') + '</div>' +
    (grid.length ? '<div class="sfx-chart-context__grid">' + grid.join('') + '</div>' : '<div class="sfx-chart-context__empty">No live level values are available for this selection yet.</div>') +
    levelsHtml +
    foot;
}
function openChartSelection(seed, options){
  var context = buildChartContext(seed);
  if(!context.pair && !context.symbol) return;
  CHART_CONTEXT = {
    pair: context.pair,
    symbol: context.symbol,
    sourceKind: context.sourceKind,
    posId: context.posId || '',
    direction: context.direction,
    regime: context.regime,
    sequence_status: context.sequence_status,
    signal_state: context.signal_state
  };
  switchSection('charts', options);
  showChart(context.symbol || chartSymbolForPair(context.pair), null);
}
function openLiveChart(subject, options){
  var pair = toPairDisplay(subject) || chartPairFromSymbol(subject);
  openChartSelection({ pair: pair, symbol: subject, sourceKind: 'live' }, options);
}
function openComputedSignalChart(pair, options){
  openChartSelection({ pair: pair, sourceKind: 'computed' }, options);
}
function openTradeQueueChart(pair, options){
  openChartSelection({ pair: pair, sourceKind: 'queue' }, options);
}
function openSignalLogChart(posId, options){
  var history = getSignalLogEntry('', posId);
  openChartSelection({
    pair: history ? history.pair : '',
    posId: posId,
    sourceKind: 'signals'
  }, options);
}
var _tvCurrentSymbol='';
var _tvCurrentPair='';
var CHART_CONTEXT=null;
function showChart(symbol, btn) {
  if(!symbol) return;
  ensureChartViewport();
  var resolvedPair = chartPairFromSymbol(symbol) || _tvCurrentPair || toPairDisplay(symbol);
  symbol = normalizeChartSymbol(symbol, resolvedPair);
  var isSameSymbol = symbol===_tvCurrentSymbol && window._tvChartLoaded;
  _tvCurrentSymbol=symbol;
  _tvCurrentPair=resolvedPair || _tvCurrentPair;
  if(!CHART_CONTEXT || CHART_CONTEXT.symbol !== symbol || CHART_CONTEXT.pair !== _tvCurrentPair){
    CHART_CONTEXT = { pair: _tvCurrentPair, symbol: symbol, sourceKind: 'chart' };
  }
  renderChartPairButtons();
  document.querySelectorAll('#chart-pair-btns button').forEach(function(b){
    var isActive = btn ? b===btn : b.getAttribute('data-chart-symbol') === symbol;
    b.className=isActive?'btn bta bts':'btn btg bts';
  });
  renderChartContextPanel();
  if(isSameSymbol) return;
  var inner=document.getElementById('tv-chart-inner');
  var container=document.getElementById('tv-chart-container');
  if(!inner || !container) return;
  if(container) void container.offsetHeight;
  inner.innerHTML='';
  var script=document.createElement('script');
  script.type='text/javascript';
  script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  script.async=true;
  script.innerHTML=JSON.stringify({
    autosize: true,
    symbol: symbol,
    interval: 'D',
    timezone: 'Africa/Johannesburg',
    theme: 'dark',
    style: '1',
    locale: 'en',
    backgroundColor: 'rgba(8,11,16,1)',
    gridColor: 'rgba(30,39,56,0.5)',
    allow_symbol_change: true,
    calendar: false,
    support_host: 'https://www.tradingview.com'
  });
  inner.appendChild(script);
  window._tvChartLoaded=true;
}
function xtoast(msg,type){var el=document.getElementById('toast');if(!el)return;el.textContent=msg;el.style.borderColor = type==='ok' ? 'var(--gr)' : type==='warn' ? 'var(--am)' : type==='info' ? 'var(--bl)' : 'var(--re)';el.style.display='block';el.classList.add('show');clearTimeout(xtoast._t);xtoast._t=setTimeout(function(){el.classList.remove('show');el.style.display='none';},4500);}
function showToastThrottled(message, type, key, cooldownMs, priority){
  if(!message) return;
  var now=Date.now();
  var k=String(key || (type+':'+message));
  var cd=Math.max(250, Number(cooldownMs || 0) || 0);
  if(priority==='low' && cd < 120000) cd = 120000;
  if(priority==='fatal' && cd < 15000) cd = 15000;
  if(!showToastThrottled._state) showToastThrottled._state={};
  var last=showToastThrottled._state[k] || 0;
  if((now-last) < cd) return;
  showToastThrottled._state[k]=now;
  xtoast(message, type);
}
function getCollectionStartDate(){
  var candidates=[];
  var stored=lsGet('sn_start')||START;
  if(stored) candidates.push(stored);
  if(baseline && baseline.date) candidates.push(baseline.date);
  if(Array.isArray(signals)){
    signals.forEach(function(sig){
      if(sig && sig.openTime) candidates.push(sig.openTime);
    });
  }
  var valid=candidates.map(function(value){ return new Date(value); }).filter(function(date){ return !isNaN(date.getTime()); });
  if(!valid.length) return new Date();
  valid.sort(function(a,b){ return a - b; });
  return valid[0];
}
function getElapsedDays(){
  var start=getCollectionStartDate();
  return Math.max(1, Math.floor((new Date()-start)/86400000) + 1);
}
function dayBadge(){
  document.getElementById('dbadge').textContent='DAY '+getElapsedDays();
}
function tick(){
  var nowMs=Date.now();
  var t=fmtLocalClockTime(nowMs);
  var nyNow=getNyNow();
  var nyH=nyNow.getHours()+nyNow.getMinutes()/60;
  var kz='';
  var kzLabel='';
  if(nyH>=2&&nyH<5)  {kz='LONDON KZ ACTIVE';kzLabel='London Kill Zone';}
  if(nyH>=8&&nyH<11) {kz='NEW YORK KZ ACTIVE';kzLabel='New York Kill Zone';}
  if(nyH>=13.5&&nyH<16){kz='NY PM KZ ACTIVE';kzLabel='NY PM Kill Zone';}
  document.getElementById('clk').textContent=t;
  // KZ chip — single authoritative indicator
  var kzChip=document.getElementById('kz-status-chip');
  if(kzChip){
    if(kzLabel){
      kzChip.textContent='ACTIVE KZ · '+kzLabel.toUpperCase();
      kzChip.className='smc-ticker__kz-chip smc-ticker__kz-chip--active';
    } else {
      var kzSchedule=[
        { label:'London Kill Zone', start:2, end:5 },
        { label:'New York Kill Zone', start:8, end:11 },
        { label:'NY PM Kill Zone', start:13.5, end:16 }
      ];
      var nextKzObj=null;
      for(var ki=0;ki<kzSchedule.length;ki++){
        if(nyH<kzSchedule[ki].start){ nextKzObj=kzSchedule[ki]; break; }
      }
      if(!nextKzObj) nextKzObj=kzSchedule[0];
      var hoursUntil=nextKzObj.start-nyH;
      if(hoursUntil<0) hoursUntil+=24;
      var nextStartMs=nowMs+hoursUntil*3600000;
      var nextEndMs=nextStartMs+(nextKzObj.end-nextKzObj.start)*3600000;
      var kzStart=fmtKzTime(nextStartMs);
      var kzEnd=fmtKzTime(nextEndMs);
      kzChip.textContent='NEXT KZ · '+nextKzObj.label.toUpperCase()+' · '+kzStart.timeStr+'–'+kzEnd.timeStr+' '+kzStart.tzLabel;
      kzChip.className='smc-ticker__kz-chip';
    }
  }
  var kzStatusEl=document.getElementById('kz-status-chip');
  if(kzStatusEl) kzStatusEl.textContent=kzLabel||'Outside kill zones';
}
function buildAcctProfile() {
    if (!acct || !acct.equity) return null;
    return {
        balance: acct.equity,
        account_currency: ACCOUNT_CURRENCY || 'USD',
        usd_to_account_rate: USD_TO_ACCOUNT_RATE || 1.0,
        risk_pct: 1.0,
        max_drawdown_pct: 5.0,
        margin_floor: 500
    };
}
function priceToPips(pair, priceA, priceB) {
  var spec = getInstrumentSpec(pair);
  var pipSize = spec ? spec.pip_size : (pair.indexOf('JPY') !== -1 ? 0.01 : 0.0001);
  var diff = Math.abs(priceA - priceB);
  return pipSize > 0 ? diff / pipSize : 0;
}
function priceDeltaFromPips(pair, pips) {
  var spec = getInstrumentSpec(pair);
  var pipSize = spec ? spec.pip_size : (pair.indexOf('JPY') !== -1 ? 0.01 : 0.0001);
  return pips * pipSize;
}
function calcLotSize(pair, riskAccount, slPips) {
  var pipVal = getPipValueAccount(pair);
  if (!pipVal || slPips <= 0 || riskAccount <= 0) return 0;
  var rawLot = riskAccount / (slPips * pipVal * 100);
  var lot = Math.floor(rawLot * 100) / 100;
  return lot < 0.01 ? 0 : lot;
}
function computePlannerLotSize(pair, riskAccount, slPips) {
  return calcLotSize(pair, riskAccount, slPips);
}
function normalizeLegacyStageStops(pair, direction, entriesArr, stageSlsArr) {
  var spec = getInstrumentSpec(pair);
  var stopFloor = spec ? spec.min_stop_pips : 40;
  var out = [];
  for (var i = 0; i < 3; i++) {
    var entry = entriesArr && entriesArr[i] != null ? Number(entriesArr[i]) : null;
    var sl = stageSlsArr && stageSlsArr[i] != null ? Number(stageSlsArr[i]) : null;
    if (entry == null || sl == null || !isFinite(entry) || !isFinite(sl)) {
      out.push(sl);
      continue;
    }
    var slPips = priceToPips(pair, entry, sl);
    if (slPips < stopFloor) {
      var delta = priceDeltaFromPips(pair, stopFloor);
      sl = direction === 'SELL' ? entry + delta : entry - delta;
    }
    out.push(sl);
  }
  for (var j = 1; j < out.length; j++) {
    var prevEntry = entriesArr && entriesArr[j - 1] != null ? Number(entriesArr[j - 1]) : null;
    var currEntry = entriesArr && entriesArr[j] != null ? Number(entriesArr[j]) : null;
    var prevSl = out[j - 1] != null ? Number(out[j - 1]) : null;
    var currSl = out[j] != null ? Number(out[j]) : null;
    if (prevEntry == null || currEntry == null || prevSl == null || currSl == null) continue;
    var prevPips = priceToPips(pair, prevEntry, prevSl);
    var currPips = priceToPips(pair, currEntry, currSl);
    if (currPips > prevPips) {
      var fixDelta = priceDeltaFromPips(pair, prevPips);
      out[j] = direction === 'SELL' ? currEntry + fixDelta : currEntry - fixDelta;
    }
  }
  return out;
}
function computeAllStageTPs(pair, direction, entriesArr, stageSlsArr, tp1, tp2) {
  var targets = [];
  var rrTargets = [2, 3, 4];
  for (var i = 0; i < 3; i++) {
    var entry = entriesArr && entriesArr[i] != null ? Number(entriesArr[i]) : null;
    var sl = stageSlsArr && stageSlsArr[i] != null ? Number(stageSlsArr[i]) : null;
    if (entry == null || sl == null || !isFinite(entry) || !isFinite(sl)) {
      targets.push(null);
      continue;
    }
    var rr = rrTargets[i] || 2;
    var riskDist = Math.abs(entry - sl);
    var stageTp = direction === 'SELL' ? (entry - (riskDist * rr)) : (entry + (riskDist * rr));
    var hinted = (i === 2 ? tp2 : tp1);
    if (hinted != null && isFinite(Number(hinted))) {
      var hintedNum = Number(hinted);
      if (direction === 'SELL' && hintedNum < entry) stageTp = Math.min(stageTp, hintedNum);
      if (direction === 'BUY' && hintedNum > entry) stageTp = Math.max(stageTp, hintedNum);
    }
    targets.push(stageTp);
  }
  return targets;
}
function buildLegacyStagesFinal(pair, direction, entriesArr, stageSlsArr, tp1, tp2, acctProfile) {
  var normalizedSls = normalizeLegacyStageStops(pair, direction, entriesArr, stageSlsArr);
  var stageTps = computeAllStageTPs(pair, direction, entriesArr, normalizedSls, tp1, tp2);
  var rrTargets = [2, 3, 4];
  var stages = [];
  var monotonicStopPass = true;
  var rrValidationPass = true;
  for (var i = 0; i < 3; i++) {
    var entry = entriesArr && entriesArr[i] != null ? Number(entriesArr[i]) : null;
    var sl = normalizedSls && normalizedSls[i] != null ? Number(normalizedSls[i]) : null;
    var tp = stageTps && stageTps[i] != null ? Number(stageTps[i]) : null;
    if (entry == null || sl == null || !isFinite(entry) || !isFinite(sl)) {
      stages.push(null);
      continue;
    }
    var slPips = priceToPips(pair, entry, sl);
    if (i > 0 && stages[i - 1] && slPips > stages[i - 1].sl_pips) monotonicStopPass = false;
    var rr = null;
    if (tp != null && isFinite(tp)) {
      rr = slPips > 0 ? +(priceToPips(pair, entry, tp) / slPips).toFixed(2) : null;
      if (rr == null || rr < rrTargets[i]) rrValidationPass = false;
    } else {
      rrValidationPass = false;
    }
    stages.push({
      stage: 'E' + (i + 1),
      entry: entry,
      sl: sl,
      sl_pips: +slPips.toFixed(1),
      tp: tp,
      rr: rr,
      target_rr: rrTargets[i]
    });
  }
  var lots = [0, 0, 0];
  var acctBalance = acctProfile && (acctProfile.balance != null ? acctProfile.balance : acctProfile.balance_usc);
  if (acctProfile && acctBalance > 0) {
    var totalRisk = acctBalance * ((acctProfile.risk_pct || 1) / 100);
    var weights = [0.2, 0.3, 0.5];
    for (var j = 0; j < stages.length; j++) {
      if (!stages[j]) continue;
      lots[j] = computePlannerLotSize(pair, totalRisk * weights[j], stages[j].sl_pips);
    }
    for (var k = 1; k < lots.length; k++) {
      if (lots[k - 1] > lots[k]) lots[k - 1] = lots[k];
    }
  }
  var monotonicLotPass = !(lots[0] > lots[1] || lots[1] > lots[2]);
  return {
    stages_final: stages,
    stage_tps: stageTps,
    stage_lots: lots,
    monotonic_stop_pass: monotonicStopPass,
    monotonic_lot_pass: monotonicLotPass,
    stop_floor_pips: 40,
    rr_validation_pass: rrValidationPass
  };
}
function buildRiskBreakdown(pair, entriesArr, slPrice, acct_profile, stageSlsArr, stagesFinal, stageLotsOverride) {
  var balance = acct_profile && (acct_profile.balance != null ? acct_profile.balance : acct_profile.balance_usc);
  if (!acct_profile || !balance) {
    return { available: false, reason: 'Account balance not set — upload broker report first' };
  }
  var pipVal = getPipValueAccount(pair, true);
  if (pipVal == null) {
    return { available: false, reason: 'Risk calculation unavailable for unsupported pair ' + pair };
  }
  var currency = acct_profile.account_currency || 'USD';
  var totalRisk = balance * (acct_profile.risk_pct / 100);
  var maxDd = balance * (acct_profile.max_drawdown_pct / 100);
  var stageWeights = [0.20, 0.30, 0.50];
  var stages = [];
  var totalRiskIfAll = 0;
  entriesArr.forEach(function(entryPrice, i) {
    if (!entryPrice || isNaN(entryPrice)) {
      stages.push({ entry: null, lot: 0, riskAmount: 0, currency: currency, slPips: 0 });
      return;
    }
    var finalStage = Array.isArray(stagesFinal) && stagesFinal[i] ? stagesFinal[i] : null;
    var stageSl = finalStage && finalStage.sl != null
      ? Number(finalStage.sl)
      : (Array.isArray(stageSlsArr) && stageSlsArr[i] != null ? Number(stageSlsArr[i]) : Number(slPrice));
    var slPips = finalStage && finalStage.sl_pips != null
      ? Number(finalStage.sl_pips)
      : priceToPips(pair, entryPrice, stageSl);
    var stageRisk = totalRisk * stageWeights[i];
    var lot = Array.isArray(stageLotsOverride) && stageLotsOverride[i] != null
      ? Number(stageLotsOverride[i])
      : calcLotSize(pair, stageRisk, slPips);
    var actualRisk = lot > 0 ? lot * slPips * pipVal * 100 : 0;
    stages.push({
      entry: entryPrice,
      sl: stageSl,
      lot: lot,
      riskAmount: Math.round(actualRisk * 100) / 100,
      currency: currency,
      slPips: Math.round(slPips * 10) / 10
    });
    totalRiskIfAll += actualRisk;
  });
  var monotonicLotPass = true;
  for (var j = 1; j < stages.length; j++) {
    if (stages[j - 1].lot > stages[j].lot) {
      monotonicLotPass = false;
      stages[j - 1].lot = stages[j].lot;
      stages[j - 1].riskAmount = Math.round((stages[j - 1].lot * stages[j - 1].slPips * pipVal * 100) * 100) / 100;
    }
  }
  totalRiskIfAll = stages.reduce(function(sum, s) { return sum + (Number(s.riskAmount) || 0); }, 0);
  var ddImpactPct = (totalRiskIfAll / balance) * 100;
  var ddWarning = totalRiskIfAll > maxDd;
  return {
    available: true,
    currency: currency,
    stages: stages,
    stage_lots: stages.map(function(s) { return Number(s.lot) || 0; }),
    monotonic_lot_pass: monotonicLotPass,
    totalRiskAmount: Math.round(totalRiskIfAll * 100) / 100,
    ddImpactPct: Math.round(ddImpactPct * 100) / 100,
    ddWarning: ddWarning,
    ddWarningMsg: ddWarning
      ? '⚠ Total risk ' + currency + ' ' + Math.round(totalRiskIfAll) + ' exceeds max drawdown cap of ' + currency + ' ' + Math.round(maxDd)
      : null
  };
}
      // ── INSTRUMENT SPEC REGISTRY ─────────────────────────────────────────
      // Mirror of sniper_instrument_specs() in sniper-webhook.php.
      // pip_value_usd per pip per 1.0 standard lot:
      //   USD-quoted : contract_size × pip_size              (constant)
      //   Other quote: computed at runtime from savedPrices  (rate-dependent)
      // For user_overrideable instruments the defaults shown are broker-common
      // conventions; users adjust via instrument_overrides in their risk profile.
      var INSTRUMENT_SPECS = {
        // FOREX — USD quoted ($10/pip/lot for all)
        GBPUSD:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'USD', min_stop_pips:20 },
        AUDUSD:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'USD', min_stop_pips:20 },
        EURUSD:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'USD', min_stop_pips:20 },
        NZDUSD:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'USD', min_stop_pips:20 },
        // FOREX — JPY quoted (pip_value_usd = 1000 / USDJPY_rate)
        USDJPY:{ type:'forex', pip_size:0.01, contract_size:100000, quote:'JPY', min_stop_pips:20 },
        AUDJPY:{ type:'forex', pip_size:0.01, contract_size:100000, quote:'JPY', min_stop_pips:20 },
        EURJPY:{ type:'forex', pip_size:0.01, contract_size:100000, quote:'JPY', min_stop_pips:20 },
        GBPJPY:{ type:'forex', pip_size:0.01, contract_size:100000, quote:'JPY', min_stop_pips:20 },
        NZDJPY:{ type:'forex', pip_size:0.01, contract_size:100000, quote:'JPY', min_stop_pips:20 },
        CADJPY:{ type:'forex', pip_size:0.01, contract_size:100000, quote:'JPY', min_stop_pips:20 },
        CHFJPY:{ type:'forex', pip_size:0.01, contract_size:100000, quote:'JPY', min_stop_pips:20 },
        // FOREX — USD-base, non-USD quote
        USDCAD:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'CAD', min_stop_pips:20 },
        USDCHF:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'CHF', min_stop_pips:20 },
        // FOREX — cross pairs
        EURGBP:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'GBP', min_stop_pips:20 },
        EURAUD:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'AUD', min_stop_pips:20 },
        EURNZD:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'NZD', min_stop_pips:20 },
        EURCHF:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'CHF', min_stop_pips:20 },
        EURCAD:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'CAD', min_stop_pips:20 },
        GBPAUD:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'AUD', min_stop_pips:20 },
        GBPNZD:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'NZD', min_stop_pips:20 },
        GBPCAD:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'CAD', min_stop_pips:20 },
        GBPCHF:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'CHF', min_stop_pips:20 },
        AUDNZD:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'NZD', min_stop_pips:20 },
        AUDCAD:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'CAD', min_stop_pips:20 },
        AUDCHF:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'CHF', min_stop_pips:20 },
        NZDCAD:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'CAD', min_stop_pips:20 },
        NZDCHF:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'CHF', min_stop_pips:20 },
        CADCHF:{ type:'forex', pip_size:0.0001, contract_size:100000, quote:'CHF', min_stop_pips:20 },
        // METALS — MT4/MT5 standard contracts
        XAUUSD:{ type:'metal', pip_size:0.01, contract_size:100, quote:'USD', min_stop_pips:50 },   // $1/pip/lot
        XAGUSD:{ type:'metal', pip_size:0.001, contract_size:5000, quote:'USD', min_stop_pips:50 }, // $5/pip/lot
        // INDICES — user_overrideable ($1/pt default, common retail CFD)
        US30:  { type:'index',  pip_size:1.0, contract_size:1, quote:'USD', min_stop_pips:30, user_overrideable:true },
        NAS100:{ type:'index',  pip_size:1.0, contract_size:1, quote:'USD', min_stop_pips:30, user_overrideable:true },
        // CRYPTO — user_overrideable (1 coin/lot, $1/pt default)
        BTCUSD:{ type:'crypto', pip_size:1.0, contract_size:1, quote:'USD', min_stop_pips:50, user_overrideable:true },
        ETHUSD:{ type:'crypto', pip_size:1.0, contract_size:1, quote:'USD', min_stop_pips:50, user_overrideable:true }
      };

      function normalizePipPairKey(pair) {
        return String(pair || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      }

      function getInstrumentSpec(pair) {
        var key = normalizePipPairKey(pair);
        return INSTRUMENT_SPECS[key] || null;
      }

      // USD value per pip per 1.0 standard lot.
      // Uses savedPrices for rate-dependent pairs; falls back to approximate defaults.
      function getPipValueUsd(pair) {
        var key = normalizePipPairKey(pair);
        var spec = INSTRUMENT_SPECS[key];
        if (!spec) return null;
        var ps = spec.pip_size, cs = spec.contract_size, q = spec.quote;
        if (q === 'USD') return cs * ps;
        // Rate-dependent: get the cross rate from savedPrices
        var rate;
        if (q === 'JPY') {
          rate = savedPrices['USD/JPY'] || savedPrices['USDJPY'] || 155;
          return (cs * ps) / rate;
        }
        if (q === 'CAD') {
          rate = savedPrices['USD/CAD'] || savedPrices['USDCAD'] || 1.36;
          return (cs * ps) / rate;
        }
        if (q === 'CHF') {
          rate = savedPrices['USD/CHF'] || savedPrices['USDCHF'] || 0.90;
          return (cs * ps) / rate;
        }
        if (q === 'GBP') {
          rate = savedPrices['GBP/USD'] || savedPrices['GBPUSD'] || 1.27;
          return (cs * ps) * rate;
        }
        if (q === 'AUD') {
          rate = savedPrices['AUD/USD'] || savedPrices['AUDUSD'] || 0.65;
          return (cs * ps) * rate;
        }
        if (q === 'NZD') {
          rate = savedPrices['NZD/USD'] || savedPrices['NZDUSD'] || 0.60;
          return (cs * ps) * rate;
        }
        return cs * ps; // unknown quote — approximate
      }

      // Account-currency pip value = pip_value_usd × usd_to_account_rate / 100
      // (the /100 gives "pipVal" in the lot formula: lot = risk / (pips × pipVal × 100))
      var WARNED_UNSUPPORTED_RISK = {};
      function getPipValueAccount(pair, warnOnFallback) {
        var pipValueUsd = getPipValueUsd(pair);
        if (pipValueUsd == null) {
          if (warnOnFallback) {
            var wKey = normalizePipPairKey(pair) + '::risk_breakdown';
            if (!WARNED_UNSUPPORTED_RISK[wKey]) {
              WARNED_UNSUPPORTED_RISK[wKey] = true;
              console.warn('Risk calculation unavailable for pair:', pair);
            }
          }
          return null;
        }
        var usdRate = (typeof USD_TO_ACCOUNT_RATE !== 'undefined' ? USD_TO_ACCOUNT_RATE : 1.0);
        return (pipValueUsd * usdRate) / 100;
      }
function lsGet(k){try{var v=localStorage.getItem(k);return v?JSON.parse(v):null;}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function lsDel(k){try{localStorage.removeItem(k);}catch(e){}}
var signals      = lsGet('sn_sig')      || [];
var snaps        = lsGet('sn_snap')     || [];
var acct         = lsGet('sn_act')      || null;
var curPos       = lsGet('sn_pos')      || [];
var baseline     = lsGet('sn_baseline') || null;
var acctInfo     = lsGet('sn_acctinfo') || {};
var closedTrades = lsGet('sn_closed')   || [];
var savedRegimes = {};
var savedPrices  = {};
var savedDailyOpens = lsGet('sn_daily_opens') || {};
var savedDailyOpenMeta = lsGet('sn_daily_open_meta') || {};
var tdProxyDeferUntilMs = 0;
var liveSignals  = [];
var computedSnapshots = {};
var regimeMetaByPair = {};
var lastSuccessfulMarketSymbolByPair = {};
var priceManualTs = 0;
var liveSignalMap = {};
var lastLiveFetch = null;
window._lastWpRegimeMeta = null;
var lastRegimeFetch = null;
var lastSignalEngineRunAt = 0;
var lastSignalEngineFinishAt = 0;
var lastSignalEngineAttemptAt = 0;
var lastSignalEngineReason = '';
var priceStatusTickerInterval = null;
var openCount=0;
// ── NEW runSignalEngine() ──
async function runSignalEngine(runOptions, legacyForceRun, legacyManual) {
    var options = (runOptions && typeof runOptions === 'object' && !Array.isArray(runOptions))
      ? runOptions
      : { apiKey: runOptions, force: legacyForceRun, manual: legacyManual };
    var force = !!options.force;
    var manual = !!options.manual;
    var runReason = String(options.reason || '');
    if (DEBUG_TRACE) console.log('[ENGINE_TRACE:START]', {
        force: !!force,
        manual: !!manual,
        reason: runReason || null,
        MARKET_DATA_READY: !!MARKET_DATA_READY,
        pairCount: Array.isArray(PAIRS) ? PAIRS.length : 0,
        pricesLoaded: DATA_HYDRATION && DATA_HYDRATION.pricesLoaded,
        regimesLoaded: DATA_HYDRATION && DATA_HYDRATION.regimesLoaded,
        liveLoaded: DATA_HYDRATION && DATA_HYDRATION.liveLoaded
    });
    if (!MARKET_DATA_READY) {
        if (DEBUG_TRACE) console.log('[ENGINE_TRACE:EARLY_RETURN]', { reason: 'market_data_not_ready' });
        signalEngineStatus = 'OFFLINE';
        updateSignalEngineUI();
        return;
    }
    if (!Array.isArray(PAIRS) || !PAIRS.length) {
        if (DEBUG_TRACE) console.log('[ENGINE_TRACE:EARLY_RETURN]', { reason: 'no_pairs' });
        signalEngineStatus = 'OFFLINE';
        lastSignalEngineFinishAt = Date.now();
        lastSignalEngineRunAt = 0;
        clearPendingEngineRetry();
        updateSignalEngineUI();
        return;
    }
    if (signalEngineStatus === 'COMPUTING') {
        if (DEBUG_TRACE) console.log('[ENGINE_TRACE:EARLY_RETURN]', { reason: 'already_computing' });
        return;
    }
    var now = Date.now();
    var cooldownMs = 300000;
    if (runReason === 'silent_refresh_90s') cooldownMs = 90000;
    var canBypassCooldown = signalEngineStatus === 'STALE' || signalEngineStatus === 'OFFLINE';
    if (!force && !canBypassCooldown && lastSignalEngineRunAt && (now - lastSignalEngineRunAt) < cooldownMs) {
        if (DEBUG_TRACE) console.log('[ENGINE_TRACE:EARLY_RETURN]', { reason: 'cooldown_throttle_active' });
        return;
    }
    clearPendingEngineRetry();
    var results = {};
    var computedRegimes = {};
    var runSnapshots = {};
    var anySuccess = false;
    var deferredPairs = {};
    var hasProcessablePrice = false;
    var _engineTimeout = null;
    var hasPairFilter = Array.isArray(options.pairs);
    var requestedPairKeys = {};
    if (hasPairFilter) {
        options.pairs.forEach(function(pair){
            var key = String(pair || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (key) requestedPairKeys[key] = true;
        });
    }

    var eligiblePairs = PAIRS.filter(function(pair){
        var key = String(pair || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        return (savedPrices[pair] || 0) > 0 && (!hasPairFilter || !!requestedPairKeys[key]);
    });
    if (eligiblePairs.length) {
      hasProcessablePrice = true;
      DATA_HYDRATION.engineRunAttempted = true;
      lastSignalEngineAttemptAt = now;
      lastSignalEngineReason = runReason || 'unknown';
      lastSignalEngineRunAt = now;
      signalEngineStatus = 'COMPUTING';
      updateSignalEngineUI();
      _engineTimeout = setTimeout(function(){
          if(signalEngineStatus === 'COMPUTING'){
              signalEngineStatus = 'SYNCING';
              updateSignalEngineUI();
              if (DEBUG_TRACE) console.warn('Signal engine timed out after 30s');
          }
      }, 30000);
    }

    var MAX_ENGINE_CONCURRENCY = 2;
    for (var offset = 0; offset < eligiblePairs.length; offset += MAX_ENGINE_CONCURRENCY) {
      var batch = eligiblePairs.slice(offset, offset + MAX_ENGINE_CONCURRENCY);
      var settled = await Promise.allSettled(batch.map(async function(pair){
        var symbol = PAIR_SYMBOLS[pair];
        var currentPrice = savedPrices[pair] || 0;
        var startedAt = Date.now();
        var candles = await fetchCandles(symbol, pair, options.apiKey);
        var fetchMs = Date.now() - startedAt;
        if (!candles) {
          if (DEBUG_TRACE) console.log('[ENGINE_TRACE:CANDLES]', pair, { hasCandles:false, duration_ms: fetchMs, symbol: symbol || null });
          return null;
        }
        anySuccess = true;
        var wpRegime = savedRegimes[pair] || null;
        var signal = buildSignalForPair(pair, candles, currentPrice, wpRegime);
        if (signal) results[pair] = signal;
        var snapshot = computedSnapshots[pair] || signal || null;
        if (snapshot) runSnapshots[pair] = snapshot;
        var snapshotRegime = computedSnapshots[pair] && computedSnapshots[pair].regime;
        if (snapshotRegime) computedRegimes[pair] = snapshotRegime;
        else if (signal && signal.regime) computedRegimes[pair] = signal.regime;
        if (DEBUG_TRACE) console.log('[ENGINE_TRACE:PAIR]', pair, {
          hasCandles: true,
          candleCount: Array.isArray(candles) ? candles.length : 0,
          hasSignal: !!signal,
          hasSnapshot: !!computedSnapshots[pair],
          duration_ms: fetchMs
        });
        if (DEBUG_TRACE) console.log('[ANCHOR_TRACE:ENGINE]', pair, {
          hasSnapshot: !!snapshot,
          regime: snapshot ? (snapshot.regime || null) : null,
          gate: snapshot ? (snapshot.gate || null) : null,
          hasAnchors: !!(snapshot && snapshot.anchors),
          anchors: snapshot && snapshot.anchors ? snapshot.anchors : null,
          hasF3: !!(snapshot && snapshot.anchors && snapshot.anchors.f3),
          f3: snapshot && snapshot.anchors ? (snapshot.anchors.f3 || null) : null,
          levelsCount: snapshot && Array.isArray(snapshot.levels) ? snapshot.levels.length : 0
        });
        return true;
      }));
      settled.forEach(function(item, index){
        if (item.status === 'rejected') {
          var pairKey = batch[index];
          var code = item.reason && item.reason.code ? item.reason.code : '';
          if (code === 'TD_DEFERRED') {
            deferredPairs[pairKey] = true;
            if (DEBUG_TRACE) console.log('[ENGINE_TRACE:PAIR_DEFERRED]', pairKey, { retry_after_seconds: item.reason.retry_after_seconds || null });
            return;
          }
          console.warn('[ENGINE_TRACE:PAIR_ERROR]', pairKey, item.reason && item.reason.message ? item.reason.message : item.reason);
        }
      });
      // Pace between batches to avoid Twelve Data rate limits
      if (offset + MAX_ENGINE_CONCURRENCY < eligiblePairs.length) {
        await new Promise(function(r){ setTimeout(r, 600); });
      }
    }

    if (!hasProcessablePrice) {
        if (DEBUG_TRACE) console.log('[ENGINE_TRACE:EARLY_RETURN]', { reason: 'no_prices' });
        signalEngineStatus = 'OFFLINE';
        lastSignalEngineFinishAt = Date.now();
        lastSignalEngineRunAt = 0;
        clearPendingEngineRetry();
        updateSignalEngineUI();
        return;
    }

    if (!anySuccess && hasProcessablePrice) {
        var deferredOnly = Object.keys(deferredPairs).length > 0 && Object.keys(deferredPairs).length === eligiblePairs.length;
        if (DEBUG_TRACE) console.log('[ENGINE_TRACE:EARLY_RETURN]', { reason: 'all_candle_fetches_failed' });
        signalEngineStatus = deferredOnly ? 'SYNCING' : 'STALE';
        lastSignalEngineFinishAt = Date.now();
        if (_engineTimeout) clearTimeout(_engineTimeout);
        updateSignalEngineUI();
        var retrySeconds = deferredOnly ? Math.max(1, getTdProxyRemainingSeconds() + 1) : 15;
        scheduleEngineRetry(retrySeconds * 1000, deferredOnly ? 'candle_retry_td_deferred' : 'candle_fetch_retry_15s', eligiblePairs);
        return;
    }

    if (anySuccess) {
        clearPendingEngineRetry();
        signalEngineStatus = 'SYNCING';
        updateSignalEngineUI();
        if (DEBUG_TRACE) console.log('[ENGINE_TRACE:PRE_POST]', {
            pairKeys: Object.keys(results || {}),
            nonNullSignals: Object.keys(results || {}).filter(function(k){ return !!results[k]; }),
            snapshotKeys: Object.keys(runSnapshots || {})
        });
        var backendSyncOk = true;
        try {
          var engineResp = await postEngineToBackend(results, computedRegimes, runSnapshots);
          if (engineResp === null || (engineResp && engineResp.ok === false)) backendSyncOk = false;
          if (backendSyncOk) {
            await postExecuteSignals(results);
          }
        } catch (e) {
          backendSyncOk = false;
          if (DEBUG_TRACE) console.warn('[ENGINE_TRACE:POST_FAIL]', e);
        }
        if (backendSyncOk) {
            computedSignals = results;
            PAIRS.forEach(function(pair) {
                if (computedRegimes[pair]) {
                    savedRegimes[pair] = computedRegimes[pair];
                    var pId = pair.replace('/', '');
                    var sel = document.getElementById('rg-' + pId);
                    if (sel) sel.value = computedRegimes[pair];
                }
            });
        }
        lastSignalEngineFinishAt = Date.now();
        var liveOk = true;
        try {
          await fetchLiveSignals(true);
        } catch (e) {
          liveOk = false;
          if (DEBUG_TRACE) console.warn('[ENGINE_TRACE:LIVE_FAIL]', e);
        }
        signalEngineStatus = (backendSyncOk && liveOk) ? 'LIVE' : 'STALE';
        if (backendSyncOk && liveOk) {
          setPriceEngineMeta(new Date().toISOString());
          lastRegimeFetch = new Date();
        }
        renderSessionBrief();
        if (backendSyncOk && liveOk) {
          renderComputedSignalCards();
        }
        renderLiveSignals();
        if (backendSyncOk && liveOk) {
          try {
            generatePlan();
          } catch (ePlan) {
            console.warn('[SNIPER] generatePlan failed after signal engine run:', ePlan && ePlan.message ? ePlan.message : ePlan);
          }
        }
        try {
          buildPriceInputs();
        } catch (eInputs) {
          console.warn('[SNIPER] buildPriceInputs failed after signal engine run:', eInputs && eInputs.message ? eInputs.message : eInputs);
        }
    } else {
        if (DEBUG_TRACE) console.log('[ENGINE_TRACE:EARLY_RETURN]', { reason: 'no_candles_fetched' });
        if (DEBUG_TRACE) console.log('[ENGINE_TRACE:EARLY_RETURN]', { reason: 'no_signal_results' });
        signalEngineStatus = 'STALE';
        lastSignalEngineFinishAt = Date.now();
    }

    if (_engineTimeout) clearTimeout(_engineTimeout);
    updateSignalEngineUI();
}
function runSignalEngineNow(options){
  return runSignalEngine(Object.assign({ force: true }, options || {}));
}

function init(){
  syncDashboardStateWatchlist();
  renderTickerStrip();
  tick(); setInterval(tick,1000);
  dayBadge();
  updateResetBtn();
  hydrateUserInputFields();
  refreshWpSession().then(function(isLoggedIn){
    renderHeader();
    if(isLoggedIn) return loadUserCloudState();
    setSyncStatus('offline','Login required');
    return false;
  }).then(function(){
    buildPriceInputs();
    renderChartPairButtons();
    renderSessionBrief();
    renderSeqCards();
    renderLiveSignals();
    renderHeader();
    renderAcct();
    renderBook();
    renderSigs();
    renderAnalytics();
    renderProgress();
    bindAccountTabs();
    // Phase 2: load trade queue from server then render
    loadTradeQueue();
    renderTradeQueue();
    bindSectionNavigation();
    var initialSection = resolveSectionFromHash(window.location.hash);
    switchSection(initialSection, { updateHash: window.location.hash !== ('#' + initialSection), focus: false, scroll: false });
    if(MARKET_DATA_READY) {
      Promise.allSettled([
        fetchPrices(),
        fetchRegimes(),
        fetchLiveSignals()
      ]).then(function(){
        DATA_HYDRATION.firstHydrationComplete = true;
        if (shouldReconcileLocalEngineState(PAIRS)) {
          runSignalEngineNow({ manual: true, reason: 'hydration_reconcile' });
        }
        if (DEBUG_TRACE) console.log('[HYDRATION]', {
          phase: 'initial_settled',
          pricesLoaded: DATA_HYDRATION.pricesLoaded,
          regimesLoaded: DATA_HYDRATION.regimesLoaded,
          liveLoaded: DATA_HYDRATION.liveLoaded,
          firstHydrationComplete: DATA_HYDRATION.firstHydrationComplete,
          engineRunAttempted: DATA_HYDRATION.engineRunAttempted
        });
        renderSessionBrief();
        renderSeqCards();
        renderLiveSignals();
        renderComputedSignalCards();
      });
    } else {
      var priceStatus=document.getElementById('price-status');
      if(priceStatus) priceStatus.textContent='Log in to enable authenticated market data';
    }
    startAutoRefresh();
    if(!init._engineRefreshInterval){
      init._engineRefreshInterval = setInterval(function(){
        var isVisible = !document.hidden;
        var cadence = isVisible ? 90000 : 300000;
        var sinceLastRun = Date.now() - lastSignalEngineFinishAt;
        if(
          MARKET_DATA_READY &&
          signalEngineStatus !== 'COMPUTING' &&
          sinceLastRun >= cadence
        ) {
          runSignalEngine({ reason: isVisible ? 'silent_refresh_90s' : 'silent_refresh_hidden' });
        }
      }, 30000);
    }
    if(!init._regimeRefreshInterval) init._regimeRefreshInterval = setInterval(fetchRegimes, 5*60*1000);
    if(!init._liveRefreshInterval) init._liveRefreshInterval = setInterval(fetchLiveSignals, 60*1000);
    // Engine kickstart — fires 8s after init to ensure:
    // (a) fetchPrices has completed and prices are in savedPrices/localStorage
    // (b) cloud state has been applied (authenticated market-data access confirmed)
    // (c) engine only starts if still OFFLINE (not already triggered by fetchPrices success)
    setTimeout(function(){
      if (shouldReconcileLocalEngineState(PAIRS)) {
        runSignalEngineNow({ manual: true, reason: 'kickstart_reconcile_8s' });
      }
    }, 8000);
    // Phase 4: hydrate server-side risk profile on load
    apiGet('user/risk-profile').then(function(res) {
      var profile = res.data || res; // backend wraps in { bucket, data: {...} }
      if (profile) {
        applyRiskProfile(profile);
        var bal = profile.balance != null ? profile.balance : profile.balance_usc;
        if (bal && !acct) { acct = { equity: bal }; renderAcct(); }
      }
    }).catch(function() { /* no risk profile saved yet — ignore */ });
  });
}
var _lastFocusEngineWake = 0;
function _tryFocusEngineWake(reason) {
  var now = Date.now();
  var sinceLastRun = now - lastSignalEngineFinishAt;
  var sinceLastFocusWake = now - _lastFocusEngineWake;
  if (
    MARKET_DATA_READY &&
    signalEngineStatus !== 'COMPUTING' &&
    sinceLastRun > 30000 &&
    sinceLastFocusWake > 15000
  ) {
    _lastFocusEngineWake = now;
    runSignalEngineNow({ reason: reason || 'tab_focus_refresh' });
  }
}
window.addEventListener('focus', function() {
  _tryFocusEngineWake('window_focus');
});
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible') {
    _tryFocusEngineWake('visibility_visible');
  }
});
// ── EXPOSE PUBLIC API TO WINDOW (must be before init) ────────────────────
window.xtab               = xtab;
window.switchSection      = switchSection;
window.handleFile         = handleFile;
window.handleHistoryFile  = handleHistoryFile;
window.fetchLiveSignals   = fetchLiveSignals;
window.fetchRegimes       = fetchRegimes;
window.resetAll           = resetAll;
window.exportReport       = exportReport;
window.exportCSV          = exportCSV;
window.exportPlanHTML     = exportPlanHTML;
window.generatePlan       = generatePlan;
window.fetchPrices        = fetchPrices;
window.fetchPendingLimits = fetchPendingLimits;
window.showChart          = showChart;
window.openLiveChart      = openLiveChart;
window.selectPairForPlan  = selectPairForPlan;
window.onPriceChange      = onPriceChange;
window.onRegimeChange     = onRegimeChange;
window.addInstrument      = addInstrument;
window.removeInstrument   = removeInstrument;
window.removePair         = removeInstrument;
window.saveZarRate        = saveZarRate;
window.saveApiKey         = saveApiKey;
window.onTimeframeChange  = onTimeframeChange;
window.smcLogout          = smcLogout;
window.smcLogin           = smcLogin;
// Phase 2 — execution engine
window.clearTradeQueue    = clearTradeQueue;
window.renderTradeQueue   = renderTradeQueue;

window.SniperDashboardCore = Object.assign(window.SniperDashboardCore || {}, {
  init: init,
  getRuntimeState: getRuntimeState,
  __test__: {
    buildSignalForPair: buildSignalForPair,
    normalizeLiveSignal: normalizeLiveSignal,
    getAuthoritySFAnchor: getAuthoritySFAnchor,
    legacyExecutionPayloadFromLadder: legacyExecutionPayloadFromLadder,
    sourceWithBackendExecutionContract: sourceWithBackendExecutionContract,
    postEngineToBackend: postEngineToBackend,
    getNextLevelSL: getNextLevelSL,
    getStageStopData: getStageStopData,
    getAllLevels: getAllLevels,
    getAnchorSet: getAnchorSet,
    levelsFromAnchor: levelsFromAnchor,
    buildLegacyPlanContext: buildLegacyPlanContext,
    renderServerBlueprintPlan: renderServerBlueprintPlan,
    updateEF: updateEF,
    fetchPrices: fetchPrices,
    hasRenderableLocalEngineState: hasRenderableLocalEngineState,
    shouldReconcileLocalEngineState: shouldReconcileLocalEngineState,
    runSignalEngineNow: runSignalEngineNow,
    computePlannerLotSize: computePlannerLotSize,
    normalizeLegacyStageStops: normalizeLegacyStageStops,
    buildLegacyStagesFinal: buildLegacyStagesFinal,
    computeAllStageTPs: computeAllStageTPs,
    getPipValueUsd: getPipValueUsd,
    getPipValueAccount: getPipValueAccount,
    setState: function(state) {
      var next = state || {};
      if (Array.isArray(next.PAIRS)) PAIRS = next.PAIRS.slice();
      if (next.savedPrices && typeof next.savedPrices === 'object') savedPrices = Object.assign({}, next.savedPrices);
      if (next.savedRegimes && typeof next.savedRegimes === 'object') savedRegimes = Object.assign({}, next.savedRegimes);
      if (next.liveSignalMap && typeof next.liveSignalMap === 'object') liveSignalMap = Object.assign({}, next.liveSignalMap);
      if (next.efLevels && typeof next.efLevels === 'object') EF_LEVELS = Object.assign({}, next.efLevels);
      if (next.sflAnchors && typeof next.sflAnchors === 'object') SFL_ANCHORS = Object.assign({}, next.sflAnchors);
      if (next.computedSnapshots && typeof next.computedSnapshots === 'object') computedSnapshots = Object.assign({}, next.computedSnapshots);
      if (next.acct && typeof next.acct === 'object') acct = Object.assign({}, next.acct);
      if (Array.isArray(next.tradeQueue)) tradeQueue = next.tradeQueue.slice();
      if (typeof next.signalEngineStatus === 'string' && next.signalEngineStatus) signalEngineStatus = next.signalEngineStatus;
      if (typeof next.lastSignalEngineAttemptAt === 'number') lastSignalEngineAttemptAt = next.lastSignalEngineAttemptAt;
      if (next.dataHydration && typeof next.dataHydration === 'object') DATA_HYDRATION = Object.assign({}, DATA_HYDRATION, next.dataHydration);
      if (typeof next.fibTimeframe === 'string' && next.fibTimeframe) syncRuntimeTimeframe(next.fibTimeframe);
    },
    getState: function() {
      return {
        PAIRS: Array.isArray(PAIRS) ? PAIRS.slice() : [],
        savedPrices: Object.assign({}, savedPrices || {}),
        savedRegimes: Object.assign({}, savedRegimes || {}),
        liveSignalMap: Object.assign({}, liveSignalMap || {}),
        efLevels: Object.assign({}, EF_LEVELS || {}),
        sflAnchors: Object.assign({}, SFL_ANCHORS || {}),
        computedSnapshots: Object.assign({}, computedSnapshots || {}),
        acct: Object.assign({}, acct || {}),
        tradeQueue: Array.isArray(tradeQueue) ? tradeQueue.slice() : [],
        fibTimeframe: FIB_TIMEFRAME,
        signalEngineStatus: signalEngineStatus,
        lastSignalEngineAttemptAt: lastSignalEngineAttemptAt,
        dataHydration: Object.assign({}, DATA_HYDRATION || {})
      };
    },
    resetState: function() {
      PAIRS = [];
      savedPrices = {};
      savedRegimes = {};
      liveSignalMap = {};
      EF_LEVELS = {};
      SFL_ANCHORS = {};
      computedSnapshots = {};
      tradeQueue = [];
      acct = null;
      WARNED_UNSUPPORTED_RISK = {};
      syncRuntimeTimeframe('Yearly');
    }
  }
});
