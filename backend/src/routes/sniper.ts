import { Router } from 'express';
import { basicAuth, AuthRequest } from '../middleware/auth';
import { query } from '../db/connection';

const router = Router();

// Apply basic auth to all routes
router.use(basicAuth);

// Mock data for initial implementation
const mockPrices = [
  { symbol: 'EURUSD', bid: 1.0850, ask: 1.0852, mid: 1.0851, changePct1d: 0.15, state: 'live' },
  { symbol: 'GBPUSD', bid: 1.2650, ask: 1.2652, mid: 1.2651, changePct1d: -0.22, state: 'live' },
  { symbol: 'USDJPY', bid: 149.50, ask: 149.52, mid: 149.51, changePct1d: 0.45, state: 'live' },
];

const mockRegimes = {
  EURUSD: { regime: 'trending', strength: 0.75, timeframe: '4H' },
  GBPUSD: { regime: 'ranging', strength: 0.45, timeframe: '4H' },
  USDJPY: { regime: 'trending', strength: 0.68, timeframe: '4H' },
};

const mockGates = {
  EURUSD: { gate: 'open', confidence: 0.82 },
  GBPUSD: { gate: 'closed', confidence: 0.35 },
  USDJPY: { gate: 'open', confidence: 0.78 },
};

// Public endpoints (with auth)
router.get('/prices', (req: AuthRequest, res) => {
  res.json(mockPrices);
});

router.get('/regimes', (req: AuthRequest, res) => {
  res.json(mockRegimes);
});

router.get('/gates', (req: AuthRequest, res) => {
  res.json(mockGates);
});

router.get('/charts', (req: AuthRequest, res) => {
  const { symbol, timeframe } = req.query;
  res.json({
    symbol,
    timeframe,
    candles: [],
    fibLevels: [],
    updatedAt: new Date().toISOString(),
    state: 'stale',
  });
});

router.get('/live-signals', (req: AuthRequest, res) => {
  const boardSize = parseInt(req.query.board_size as string) || 3;
  res.json({
    signals: [],
    polledAt: new Date().toISOString(),
    meta: { boardSize, totalActive: 0 },
  });
});

router.get('/ladders', (req: AuthRequest, res) => {
  res.json([]);
});

router.get('/session', (req: AuthRequest, res) => {
  res.json({
    name: 'London-AM',
    openUtc: '07:00',
    closeUtc: '11:00',
    state: 'active',
  });
});

router.get('/health', (req: AuthRequest, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    engine: 'running',
    database: 'connected',
  });
});

router.get('/account-telemetry', (req: AuthRequest, res) => {
  res.json({
    accountId: 'demo-account',
    terminalId: 'demo-terminal',
    balance: 10000,
    equity: 10050,
    margin: 500,
    freeMargin: 9550,
    marginLevel: 2000,
    floatingPl: 50,
    currency: 'USD',
    leverage: 100,
    eaVersion: '1.0.0',
    lastSeenAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    state: 'active',
  });
});

router.get('/positions', (req: AuthRequest, res) => {
  res.json([]);
});

router.get('/orders', (req: AuthRequest, res) => {
  res.json([]);
});

// User settings endpoints
router.get('/user/account', async (req: AuthRequest, res) => {
  try {
    const result = await query(
      'SELECT username, email FROM users WHERE id = $1',
      [req.user!.id]
    );
    res.json({
      username: result.rows[0].username,
      email: result.rows[0].email,
      state: 'active',
    });
  } catch (error) {
    console.error('Error fetching user account:', error);
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

router.post('/user/account', async (req: AuthRequest, res) => {
  res.json({ ok: true });
});

router.get('/user/settings', async (req: AuthRequest, res) => {
  try {
    const result = await query(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [req.user!.id]
    );
    if (result.rows.length === 0) {
      res.json({
        backendUrl: '',
        apiKeyStatus: 'missing',
        refreshIntervalSec: 30,
        staleThresholdSec: 300,
        watchlist: [],
        riskAllocation: {},
        signalBoardSize: 3,
      });
    } else {
      const settings = result.rows[0];
      res.json({
        backendUrl: settings.backend_url || '',
        apiKeyStatus: settings.api_key_status || 'missing',
        refreshIntervalSec: settings.refresh_interval_sec || 30,
        staleThresholdSec: settings.stale_threshold_sec || 300,
        watchlist: settings.watchlist || [],
        riskAllocation: settings.risk_allocation || {},
        signalBoardSize: settings.signal_board_size || 3,
      });
    }
  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.post('/user/settings', async (req: AuthRequest, res) => {
  try {
    const { backendUrl, apiKeyStatus, refreshIntervalSec, staleThresholdSec, watchlist, riskAllocation, signalBoardSize } = req.body;
    
    await query(
      `UPDATE user_settings 
       SET backend_url = $1, api_key_status = $2, refresh_interval_sec = $3, stale_threshold_sec = $4, 
           watchlist = $5, risk_allocation = $6, signal_board_size = $7, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $8`,
      [backendUrl, apiKeyStatus, refreshIntervalSec, staleThresholdSec, JSON.stringify(watchlist), JSON.stringify(riskAllocation), signalBoardSize, req.user!.id]
    );
    
    res.json({ ok: true });
  } catch (error) {
    console.error('Error saving user settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

router.post('/user/twelve-data-key', async (req: AuthRequest, res) => {
  try {
    const { apiKey } = req.body;
    const status = apiKey ? 'ok' : 'missing';
    
    await query(
      `UPDATE twelve_data_keys 
       SET api_key = $1, status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $3`,
      [apiKey, status, req.user!.id]
    );
    
    res.json({ ok: true, status });
  } catch (error) {
    console.error('Error saving API key:', error);
    res.status(500).json({ error: 'Failed to save API key' });
  }
});

router.delete('/user/twelve-data-key', async (req: AuthRequest, res) => {
  try {
    await query(
      `UPDATE twelve_data_keys 
       SET api_key = NULL, status = 'missing', updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [req.user!.id]
    );
    
    res.json({ ok: true, status: 'missing' });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

router.get('/user/risk-profile', async (req: AuthRequest, res) => {
  try {
    const result = await query(
      'SELECT * FROM user_risk_profiles WHERE user_id = $1',
      [req.user!.id]
    );
    if (result.rows.length === 0) {
      res.json({
        tier: 'bronze',
        maxConcurrentTrades: 3,
        perTradePct: 1.0,
        dailyMaxPct: 3.0,
        ddCapPct: 10.0,
        cooldownMin: 15,
      });
    } else {
      const profile = result.rows[0];
      res.json({
        tier: profile.tier,
        maxConcurrentTrades: profile.max_concurrent_trades,
        perTradePct: parseFloat(profile.per_trade_pct),
        dailyMaxPct: parseFloat(profile.daily_max_pct),
        ddCapPct: parseFloat(profile.dd_cap_pct),
        cooldownMin: profile.cooldown_min,
      });
    }
  } catch (error) {
    console.error('Error fetching risk profile:', error);
    res.status(500).json({ error: 'Failed to fetch risk profile' });
  }
});

router.post('/user/risk-profile', async (req: AuthRequest, res) => {
  try {
    const { tier, maxConcurrentTrades, perTradePct, dailyMaxPct, ddCapPct, cooldownMin } = req.body;
    
    await query(
      `UPDATE user_risk_profiles 
       SET tier = $1, max_concurrent_trades = $2, per_trade_pct = $3, daily_max_pct = $4, 
           dd_cap_pct = $5, cooldown_min = $6, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $7`,
      [tier, maxConcurrentTrades, perTradePct, dailyMaxPct, ddCapPct, cooldownMin, req.user!.id]
    );
    
    res.json({ ok: true });
  } catch (error) {
    console.error('Error saving risk profile:', error);
    res.status(500).json({ error: 'Failed to save risk profile' });
  }
});

router.get('/user/progress', (req: AuthRequest, res) => {
  res.json({
    equityPulse: {
      equityUSC: 10050,
      todayPnlUSC: 50,
      state: 'LIVE',
    },
    streak: {
      currentStreakDays: 0,
      lastActiveDate: new Date().toISOString().split('T')[0],
      state: 'UNAVAILABLE',
    },
    milestones: {
      firstHeartbeat: true,
      firstMarketStream: true,
      firstTradeTelemetry: false,
      state: 'LIVE',
    },
    generatedAt: new Date().toISOString(),
  });
});

router.post('/user/execute-signals', (req: AuthRequest, res) => {
  const { signalIds } = req.body;
  res.json({ ok: true, queued: signalIds?.length || 0 });
});

router.post('/user/engine-batch', (req: AuthRequest, res) => {
  res.json({ ok: true, diagnostics: [] });
});

router.post('/user/watchlist/add', async (req: AuthRequest, res) => {
  try {
    const { symbol } = req.body;
    
    const result = await query(
      `UPDATE user_settings 
       SET watchlist = array_append(watchlist, $1), updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2
       RETURNING watchlist`,
      [symbol, req.user!.id]
    );
    
    res.json({ ok: true, watchlist: result.rows[0].watchlist });
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    res.status(500).json({ error: 'Failed to add to watchlist' });
  }
});

router.post('/user/watchlist/remove', async (req: AuthRequest, res) => {
  try {
    const { symbol } = req.body;
    
    const result = await query(
      `UPDATE user_settings 
       SET watchlist = array_remove(watchlist, $1), updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2
       RETURNING watchlist`,
      [symbol, req.user!.id]
    );
    
    res.json({ ok: true, watchlist: result.rows[0].watchlist });
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    res.status(500).json({ error: 'Failed to remove from watchlist' });
  }
});

// Admin endpoints
router.get('/admin/health', (req: AuthRequest, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    backend: 'smc-superfib-backend',
    database: 'connected',
  });
});

router.get('/admin/soak-report', (req: AuthRequest, res) => {
  res.json({
    report: 'Soak report not yet implemented',
    timestamp: new Date().toISOString(),
  });
});

router.post('/admin/soak-evidence', (req: AuthRequest, res) => {
  res.json({ ok: true });
});

router.post('/admin/soak-checkpoint', (req: AuthRequest, res) => {
  res.json({ ok: true });
});

export default router;
