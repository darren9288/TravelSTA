# TravelSTA — Agent Context

Next.js 14 + Supabase group travel expense tracker. Malaysian ringgit (MYR) base currency with dual foreign currency support (e.g. JPY).

## Dev Commands

```bash
npm run dev      # http://localhost:3000
npm run build
npm start
```

## Stack

- **Frontend**: Next.js 14 App Router, Tailwind CSS, Lucide icons
- **Backend**: Supabase (Postgres), Next.js API routes
- **Auth**: None — localStorage-based traveler identity per trip

## Database Schema

### Core tables

| Table | Purpose |
|---|---|
| `trips` | Trip metadata: `name`, `destination`, `foreign_currency`, `cash_rate`, `wise_rate`, `join_code` |
| `travelers` | Real people + virtual pools. `is_pool=true` = pool wallet. `pool_currency` for pool's currency |
| `expenses` | Payments: `paid_by_id`, `payment_type`, `myr_amount`, `foreign_amount`, `split_type`, `wallet_id` |
| `expense_splits` | Per-traveler share: `traveler_id`, `amount` (MYR), `is_settled`, `locked`, `from_wallet_id`, `to_wallet_id` |
| `wallets` | Individual currency wallets: `traveler_id`, `name`, `currency`, `trip_id` |
| `wallet_topups` | Top-up history for wallets: `wallet_id`, `amount`, `date` |
| `pool_topups` | Contributions to pool travelers: `pool_id`, `contributed_by_id`, `myr_amount`, `foreign_amount` |
| `settlement_payments` | Immutable history of past Settle All rounds: `from_traveler_id`, `to_traveler_id`, `amount`, `trip_id` |

### Critical column: `expense_splits.locked`
- `locked = true` means the split was batch-settled via "Settle All" button
- Locked splits cannot be manually toggled in the UI (shows lock icon)
- Set by `POST /api/trips/[id]/settle-all`
- SQL migration required if not present: `alter table expense_splits add column locked boolean not null default false;`

## Critical Rules

### Always use `serverDb()` in API routes
```typescript
import { serverDb } from "@/lib/supabase";
const db = serverDb(); // ✅ bypasses Supabase CDN cache
// NEVER use the exported `supabase` client in API routes — returns stale data
```

### All API routes must be dynamic
```typescript
export const dynamic = "force-dynamic"; // top of every route.ts
```

## Key Architecture Decisions

### Settlement system
- Net balance = unsettled splits only (`is_settled = false`, excluding pool-paid expenses)
- `lib/settlement.ts`: greedy algorithm minimises number of transactions
- Pool expenses (`paid_by_id` is a pool traveler) are **excluded** from settlement
- **Settle All** (single button) settles every outstanding split atomically — no per-person buttons
- Why: per-person settling breaks zero-sum invariant (settled payer's credits remain, creating phantom creditors)
- After Settle All: splits locked, instructions recorded to `settlement_payments` as history

### Pool travelers
- Pools are `travelers` with `is_pool = true`
- Pool expenses: payer is the pool entity, splits auto-settled (pool fund covers them)
- Pool wallets tracked separately in `wallets` table with `traveler_id = pool.id`

### Currency / exchange rates
- `cash_rate`: JPY→MYR for cash payments (÷33 typical)
- `wise_rate`: JPY→MYR for Wise/card payments (÷34 typical)
- Wise detected by wallet name containing "wise" (case-insensitive)
- Split tolerance: `> 0.05` MYR (JPY rounding drift)

### Identity
- `lib/identity.ts`: `getIdentity(tripId)` / `setIdentity(tripId, travelerId)`
- localStorage only, no server auth

## API Routes

| Route | Methods | Purpose |
|---|---|---|
| `/api/trips` | GET, POST | List / create trips |
| `/api/trips/[id]` | GET, PUT | Trip detail (includes `my_traveler_id`) |
| `/api/travelers` | GET, POST | List / create travelers (real + pool) |
| `/api/expenses` | GET, POST, PUT, DELETE | Expenses with splits |
| `/api/splits` | PUT (single toggle), POST (bulk settle one traveler — legacy, avoid) | Split settled status |
| `/api/wallets` | GET, POST, PUT, DELETE | Wallets + balance history |
| `/api/wallet-topups` | GET, POST, PUT, DELETE | Wallet top-up records |
| `/api/pool-topups` | GET, POST, PUT | Pool contributions |
| `/api/settlement` | GET | Calculate net balances + instructions |
| `/api/settlement-payments` | GET, POST, DELETE | Settlement history records |
| `/api/trips/[id]/settle-all` | POST | Batch settle all splits + record history |
| `/api/stats` | GET | Analytics data |
| `/api/join` | POST | Join trip by code |

## Frontend Pages

```
app/
  page.tsx                    — trip list + join
  trips/[id]/
    page.tsx                  — dashboard (recent expenses, stats, quick actions)
    add/page.tsx              — add expense (dual JPY+MYR split inputs)
    expenses/page.tsx         — full expense list + edit modal
    settlement/page.tsx       — settlement instructions + Settle All + history
    analytics/page.tsx        — charts and spending breakdown
    pool/page.tsx             — pool wallet management + top-ups
    wallets/page.tsx          — individual wallet management
    settings/page.tsx         — trip settings
  join/[code]/page.tsx        — join trip flow
```

## Components

| Component | Purpose |
|---|---|
| `ExpenseRow` | Expandable expense card with read-only split indicators (locked/auto-settled) and manual toggle for unsettled splits |
| `Nav` | Sidebar navigation |
| `TravelerBadge` | Colored dot + name pill |

## Common Patterns

### Fetching with no-store
```typescript
fetch(`/api/something`, { cache: "no-store" })
```

### Auto-payment type from wallet name
Wallet name containing "wise" → "Wise", "credit" → "Credit Card", "debit"/"card" → "Debit Card", "tng"/"touch" → "TNG", else → "Cash"

### isAutoSettled logic (ExpenseRow)
A split is non-toggleable if: `split.locked`, OR payer `is_pool`, OR split belongs to payer, OR `split_type=individual` and `amount=0`
