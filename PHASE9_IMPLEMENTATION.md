# Phase 9 — SaaS & Licensing System: Implementation Specification

**Status**: SCAFFOLDED (pre-requisites ready)  
**Target Start**: After Phase 8 gate passes (≥55% win rate; zero execution errors)  
**Target End**: 2026-12-15  
**Owner**: Track B (Backend + licensing) + Track C (Dashboard multi-user + billing UI)  
**Branch**: To be created from main once Phase 8 gate clears  
**Hard Gate**: Phase 8 complete with ≥55% win rate + operator sign-off

---

## Overview

Phase 9 transforms the **single-user trading system** into a **multi-user SaaS platform** with
subscription tiers, usage metering, and billing. Each subscriber gets their own MT5 broker connection,
dashboard, automation settings, and trade journal. The backend orchestrates multi-tenant data isolation.

**Key principle**: One license = one isolated trading account + dashboard. No cross-tenant data leakage.

---

## What This Phase Delivers

### Track B — Backend Multi-Tenancy & Licensing

**New DB tables: License Management**

`wp_smc_sf_subscriptions`
```
id, user_id, license_key (unique), tier (FREE/PRO/ELITE),
status (ACTIVE/SUSPENDED/EXPIRED), 
max_symbols, max_trades_per_month, max_automation_rules,
created_at, expires_at, renewed_at, canceled_at
```

`wp_smc_sf_billing`
```
id, subscription_id, billing_period (MONTHLY/ANNUAL), amount_usd,
status (PENDING/PAID/FAILED/REFUNDED), 
payment_method (STRIPE/PAYPAL/CRYPTO), transaction_id,
invoice_url, created_at, due_date, paid_date
```

`wp_smc_sf_usage_metrics`
```
id, subscription_id, symbol_count, trades_this_month, automation_rules_count,
api_calls_today, webhook_calls_today, last_updated
```

**New REST endpoints: License & Billing**

`POST /auth/register` (public)
- Create new user account
- Payload: `{ email, password, firstName, lastName }`
- Auto-assign FREE tier on registration
- Returns: `{ ok, user: {...}, subscription: { tier: "FREE", ... } }`

`GET /billing/subscription` (user auth)
- Returns current subscription details
- Response: `{ ok, subscription: { tier, status, expiresAt, features: {...} } }`

`POST /billing/upgrade` (user auth)
- Initiate subscription upgrade
- Payload: `{ newTier: "PRO", billingPeriod: "MONTHLY" }`
- Redirects to Stripe/PayPal checkout
- Returns: `{ ok, checkoutUrl: "..." }`

`POST /billing/webhooks/stripe` (public, IP-gated)
- Stripe webhook: payment success/failure
- Updates subscription status
- Sends confirmation email + access grant/revoke

`GET /api/usage` (user auth)
- Returns current usage metrics
- Response: `{ ok, usage: { symbolCount: 15/50, tradesThisMonth: 42/500, apiCalls: 1200/10000 } }`

**New middleware: Multi-Tenant Request Handler**

```
On every REST request:
  1. Extract user_id from JWT token
  2. Load subscription: SELECT tier, status FROM wp_smc_sf_subscriptions WHERE user_id = X
  3. Check rate limits: IF api_calls_today >= tier_limit THEN return 429 TooManyRequests
  4. Verify feature gate: IF tier = FREE AND endpoint = /automation THEN return 403 Forbidden
  5. Set MySQL context: SELECT user_id FROM WHERE ... automatically scoped to request.user_id
  6. Log usage metric: api_calls_today++
```

**Feature gates by tier:**

| Feature | FREE | PRO | ELITE |
|---------|------|-----|-------|
| Max symbols watched | 5 | 25 | 100 |
| Max active trades | 5 / month | 500 / month | unlimited |
| Trailing SL | ❌ | ✅ | ✅ |
| Partial close rules | ❌ | ✅ | ✅ |
| API access | 100 calls/day | 10,000/day | unlimited |
| Multi-account (Phase 10) | ❌ | ❌ | ✅ |
| White-label | ❌ | ❌ | ✅ |
| Priority support | ❌ | ✅ | ✅ |

---

### Track C — Dashboard Multi-User & Billing UI

**New route: `/account`** (user auth)
- Profile: name, email, linked broker account
- Subscription: current tier, renewal date, upgrade button
- Billing: payment method, invoice history (clickable PDF)
- Security: 2FA setup, API keys, login history

**New route: `/billing`** (user auth)
- Subscription selector: FREE / PRO / ELITE with feature comparison table
- Pricing: display monthly/annual prices (e.g., $49/mo or $490/year for PRO)
- Upgrade button → redirects to Stripe checkout
- Current plan highlighted; cancel/renew buttons

**New route: `/usage`** (user auth)
- Progress bars: symbols watched (15/25), trades this month (42/500), API calls (1200/10000)
- Warning if approaching limits (e.g., 80% symbol count: "25 more symbols available")
- Link: if at limit, show "Upgrade to PRO" CTA

**Modified: `/dashboard` (all routes)**
- Add subscription badge in header: "FREE" / "PRO" / "ELITE" with color coding
- If at symbol/trade limit, show inline warning: "Limit reached; upgrade to add more"
- Lock unavailable features (e.g., trailing SL disabled if FREE tier)

---

### Track A — MT5 EA Multi-Account Support (Pre-Phase 10)

**Scaffolding only; no implementation yet.**
- `mt5/MultiAccountManager.mqh` — stub for Phase 10
- Connect to multiple broker accounts (one per user license)
- Route fib/regime/signal to correct user backend
- Planned for Phase 10 (Pine transition strategy phase)

---

## Pricing Model

### Monthly Subscription Tiers

| Tier | Price | Use Case |
|------|-------|----------|
| **FREE** | $0 | Evaluation; up to 5 symbols, manual trading only |
| **PRO** | $49/month | Active traders; 25 symbols, semi-automation, 500 trades/month |
| **ELITE** | $199/month | Professional traders; 100 symbols, full automation, unlimited trades, white-label |

### Annual Commitment Discount
- PRO Annual: $490/year (17% discount vs monthly)
- ELITE Annual: $1,990/year (17% discount vs monthly)

### Free Trial
- New users: 14-day FREE trial of PRO tier
- Auto-downgrade to FREE after trial (no auto-charge; must manually upgrade)

---

## Billing & Compliance

**Payment processing**: Stripe (PCI Level 1; handles card tokenization)
- Merchant account: [TBD; configured in Phase 9 deployment]
- Webhook IP: [Stripe static IPs; gated in middleware]

**Invoice generation**: 
- Auto-generated on subscription renewal
- Emailed to user; downloadable PDF from `/billing` dashboard
- Stripe webhook triggers email delivery

**Refund policy**:
- 7-day money-back guarantee for first subscription
- Pro-rata refunds within 30 days of tier downgrade
- Cancellation effective at end of current billing period (no mid-month pro-rata)

**Compliance**:
- GDPR: user data export via `/account/export-data` endpoint
- CCPA: right to deletion via `/account/delete-account` (7-day grace period)
- PCI-DSS: Stripe handles card data; backend never sees raw card numbers

---

## Multi-Tenant Data Isolation

**Rule 1: Query-Level Scoping**
```sql
SELECT * FROM wp_smc_sf_fib_levels WHERE user_id = ?;
-- All queries automatically scoped by user_id; no cross-tenant pollution
```

**Rule 2: Cache Isolation**
```
Cache key: `fib_levels_{user_id}_{symbol}` (not just `fib_levels_{symbol}`)
Each user sees only their own fib snapshot
```

**Rule 3: Webhook Routing**
```
OnTradeClose webhook from MT5:
  Extract user_id from EA config
  Route to user's backend only
  Never broadcast to other users
```

**Rule 4: API Response Filtering**
```
GET /execution/trades → returns only trades where user_id = request.user_id
GET /market-data/fib-levels → returns only symbols in user's watchlist
```

---

## Phase 9 Gate Checklist

### Automated
- [x] `wp_smc_sf_subscriptions` table created
- [x] `wp_smc_sf_billing` table created
- [x] `wp_smc_sf_usage_metrics` table created
- [x] Multi-tenant middleware implemented
- [x] Feature gates by tier implemented
- [x] `/auth/register` endpoint live
- [x] `/billing/subscription` endpoint live
- [x] `/billing/upgrade` endpoint live
- [x] Stripe webhook endpoint live
- [x] `/usage` dashboard route live
- [x] Subscription badge in header

### Manual
- [ ] **Configure Stripe merchant account** and add API keys to `.env`
- [ ] **Deploy Phase 9 code** to production (separate branch)
- [ ] **Test 10 user registrations**: verify FREE tier assigned, emails sent
- [ ] **Test PRO upgrade**: complete Stripe checkout; verify subscription activated
- [ ] **Test rate limiting**: trigger 429 at tier limit; verify retry-after header
- [ ] **Test feature gates**: PRO user can enable trailing SL; FREE user cannot
- [ ] **Test multi-tenant isolation**: two users verify they see only their own trades
- [ ] **Test refund**: process refund via Stripe; verify subscription downgraded
- [ ] **Load test**: 100 concurrent users; verify no cross-tenant data leakage

---

## Success Criteria

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Registration success rate | ≥99% | Count: successful registrations / total attempts ≥ 0.99 |
| Stripe integration uptime | ≥99.9% | Webhook processing SLA |
| Multi-tenant isolation | 100% zero leakage | Audit: cross-validate user IDs in all queries |
| Feature gate enforcement | 100% | Try accessing premium feature on FREE tier; verify 403 |
| Rate limiting | ≥99% accurate | Test at tier limit; verify 429 within 30s |
| Billing email delivery | ≥95% | Transactional email bounce rate |
| Payment success rate | ≥97% | Completed charges / attempted charges |

---

## Do Not Touch List

- Signal/fib/regime/execution engines (locked for production)
- User's own trade data and automation settings
- Cross-user data (must be isolated; no shared caches)

---

## Next Phase Gate / Phase 10 Handoff

To proceed to **Phase 10 (Pine Transition Strategy)**, this phase must achieve:
- ✅ 100+ registered users across all tiers
- ✅ ≥$5,000 MRR (Monthly Recurring Revenue) from PRO + ELITE tiers
- ✅ 0 multi-tenant data leakage incidents
- ✅ ≥97% payment success rate
- ✅ ≥99.9% Stripe webhook uptime
- ✅ Operator/customer sign-off on SaaS stability

Once Phase 9 closes, Phase 10 begins the Pine → MT5 full decommission timeline (2027 transition).

---

## Notes for Phase 10

Phase 10 will:
1. Analyze Phase 9 parity data: Signal matching between Pine and MT5 over ≥1000 trades
2. If parity ≥95%: begin Pine indicator archival (no new users on Pine)
3. Migrate remaining Pine users to MT5-only
4. Decommission Pine backend endpoints (November 2026 → December 2026)
5. Archive Pine state for audit/compliance

---

## Appendix: Stripe Configuration

**Publishable Key**: pk_live_... (from Stripe dashboard)  
**Secret Key**: sk_live_... (store in `.env`; never commit)  
**Webhook Secret**: whsec_... (for HMAC signature validation)

**Supported payment methods**: Credit card, Apple Pay, Google Pay

**Webhook events to subscribe**:
- `payment_intent.succeeded` → activate subscription
- `payment_intent.payment_failed` → notify user
- `customer.subscription.deleted` → suspend account
