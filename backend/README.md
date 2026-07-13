# SMC SuperFIB Backend Service

Node.js + TypeScript backend service for the SMC SuperFIB trading dashboard.

## Tech Stack

- Node.js + TypeScript
- Express.js
- PostgreSQL
- bcryptjs for password hashing

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your database URL and other settings
```

3. Run database migrations:
```bash
# Run the SQL in src/db/migrations/001_initial.sql against your PostgreSQL database
```

4. Build and run:
```bash
npm run build
npm start
```

Or for development:
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /auth/register` - Register a new user

### Sniper API (Basic Auth Required)
All endpoints under `/sniper/v1/*` require Basic authentication.

#### Public Data
- `GET /sniper/v1/prices` - Get current prices
- `GET /sniper/v1/regimes` - Get market regimes
- `GET /sniper/v1/gates` - Get gate states
- `GET /sniper/v1/charts` - Get chart data
- `GET /sniper/v1/live-signals` - Get live signals
- `GET /sniper/v1/ladders` - Get trade plans
- `GET /sniper/v1/session` - Get trading session info
- `GET /sniper/v1/health` - Get engine health
- `GET /sniper/v1/account-telemetry` - Get account telemetry
- `GET /sniper/v1/positions` - Get current positions
- `GET /sniper/v1/orders` - Get pending orders

#### User Settings
- `GET /sniper/v1/user/account` - Get user account info
- `POST /sniper/v1/user/account` - Update user account
- `GET /sniper/v1/user/settings` - Get user settings
- `POST /sniper/v1/user/settings` - Update user settings
- `POST /sniper/v1/user/twelve-data-key` - Save Twelve Data API key
- `DELETE /sniper/v1/user/twelve-data-key` - Delete Twelve Data API key
- `GET /sniper/v1/user/risk-profile` - Get risk profile
- `POST /sniper/v1/user/risk-profile` - Update risk profile
- `GET /sniper/v1/user/progress` - Get user progress
- `POST /sniper/v1/user/execute-signals` - Execute signals
- `POST /sniper/v1/user/engine-batch` - Trigger engine batch
- `POST /sniper/v1/user/watchlist/add` - Add symbol to watchlist
- `POST /sniper/v1/user/watchlist/remove` - Remove symbol from watchlist

#### Admin
- `GET /sniper/v1/admin/health` - Admin health check
- `GET /sniper/v1/admin/soak-report` - Get soak report
- `POST /sniper/v1/admin/soak-evidence` - Submit soak evidence
- `POST /sniper/v1/admin/soak-checkpoint` - Create soak checkpoint

## Database Schema

See `src/db/migrations/001_initial.sql` for the complete database schema.

## Deployment

This backend is designed to be deployed on Railway or Render with PostgreSQL.

### Railway
1. Create a new PostgreSQL database
2. Create a new Node.js service
3. Set environment variables:
   - `DATABASE_URL` (from Railway PostgreSQL)
   - `PORT=3000`
   - `CORS_ORIGIN` (your frontend URL)
4. Deploy

### Render
1. Create a new PostgreSQL database
2. Create a new Web Service
3. Set environment variables
4. Deploy
