import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/connection';

const router = Router();

// Register a new user
router.post('/register', async (req, res) => {
  const { username, password, email } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  try {
    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (existingUser.rows.length > 0) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await query(
      'INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING id, username',
      [username, passwordHash, email || null]
    );

    const user = result.rows[0];

    // Create default settings
    await query(
      `INSERT INTO user_settings (user_id, refresh_interval_sec, stale_threshold_sec, signal_board_size) 
       VALUES ($1, 30, 300, 3)`,
      [user.id]
    );

    // Create default risk profile
    await query(
      `INSERT INTO user_risk_profiles (user_id, tier, max_concurrent_trades, per_trade_pct, daily_max_pct, dd_cap_pct, cooldown_min) 
       VALUES ($1, 'bronze', 3, 1.0, 3.0, 10.0, 15)`,
      [user.id]
    );

    res.status(201).json({
      ok: true,
      user: { id: user.id, username: user.username }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

export default router;
