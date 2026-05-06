# Settlement and Wallet Balance Issue

## Current Behavior

I have a travel expense tracking app with the following test scenario:

### Initial Setup
**Expenses (5 transactions, all unsettled):**
1. Flight Ticket KL <-> Bali - RM 2356.00 - Paid by Willy - Even split
2. Flight Add on Check In Bag - RM 526.50 - Paid by Darren - Even split
3. Klook Activities - RM 921.40 - Paid by Willy - Even split
4. Hotel Booking First Payment - RM 4338.00 - Paid by Willy - Even split
5. Insurance TNG - RM 292.00 - Paid by Darren - Even split

**Total expenses:** RM 8433.90
**Per person share:** RM 8433.90 ÷ 4 = RM 2108.48

**Initial Wallet Balances:**
- Darren Cash MYR: RM 5181.50 (after paying RM 818.50 in expenses from initial RM 6000)
- Willy Cash MYR: -RM 1615.40 (after paying RM 7615.40 in expenses from initial RM 6000)
- Mac Cash MYR: RM 6000.00 (paid nothing yet)
- Cristo Cash MYR: RM 6000.00 (paid nothing yet)

### Settlement Page Shows (Before Settle All)

**Who Pays Who:**
- Mac → Willy: RM 2108.48 (from Cash MYR to Cash MYR)
- Cristo → Willy: RM 2108.48 (from Cash MYR to Cash MYR)
- Darren → Willy: RM 1289.96 (from Cash MYR to Cash MYR)

**Net Balance (unsettled):**
- Darren: -RM 1289.96 (paid RM 613.89 · owes RM 1903.85)
- Willy: +RM 5506.92 (paid RM 5711.55 · owes RM 204.63)
- Mac: -RM 2108.48 (paid RM 0.00 · owes RM 2108.48)
- Cristo: -RM 2108.48 (paid RM 0.00 · owes RM 2108.48)

✅ **This calculation is CORRECT**

## Problem 1: Settlement Only Settles One Side

After pressing "Settle All — Everyone Pays Now", the settlement page shows NEW instructions instead of being cleared:

**Who Pays Who (After first Settle All):**
- Willy → Darren: RM 204.63
- Mac → Darren: RM 204.63
- Cristo → Darren: RM 204.63

**Net Balance (after first Settle All):**
- Darren: +RM 613.89 (paid RM 613.89 · owes RM 0.00)
- Willy: -RM 204.63 (paid RM 0.00 · owes RM 204.63)
- Mac: -RM 204.63 (paid RM 0.00 · owes RM 204.63)
- Cristo: -RM 204.63 (paid RM 0.00 · owes RM 204.63)

**Expenses Status:**
- Only Willy's expenses (Flight Ticket, Klook Activities, Hotel) show as settled
- Darren's expenses (Flight Add-on, Insurance) remain unsettled

❌ **Expected:** All expenses should be settled at once, net balances should all be zero

## Problem 2: Wallet Balances Don't Update Correctly

After pressing "Settle All" with wallet selections, the wallet balances become:

**Actual Result:**
- Darren Cash MYR: RM 3277.65
- Willy Cash MYR: RM 4505.41
- Mac Cash MYR: RM 3891.52 ✅
- Cristo Cash MYR: RM 3891.52 ✅

**Expected Result:**
All four travelers should have approximately RM 3891.52 (±RM 0.03 max for rounding)

### Darren's Wallet History (Incorrect):
```
Top-up: +RM 6000.00
Expense paid (Insurance TNG): -RM 292.00
Settlement out to Willy (Hotel): -RM 1084.50
Settlement out to Willy (Klook): -RM 230.35
Expense paid (Flight Add-on): -RM 526.50
Settlement out to Willy (Flight Ticket): -RM 589.00
Final: RM 3277.65
```

### Willy's Wallet History (Incorrect):
```
Top-up: +RM 6000.00
Settlement in from Mac (Insurance): +RM 73.00
Settlement in from Cristo (Insurance): +RM 73.00
Expense paid (Hotel): -RM 4338.00
Settlement in from Darren (Hotel): +RM 1084.50
Settlement in from Mac (Hotel): +RM 1084.50
Settlement in from Cristo (Hotel): +RM 1084.50
Expense paid (Klook): -RM 921.40
Settlement in from Mac (Klook): +RM 230.35
Settlement in from Cristo (Klook): +RM 230.35
Settlement in from Darren (Klook): +RM 230.35
Settlement in from Mac (Flight Add-on): +RM 131.63
Settlement in from Cristo (Flight Add-on): +RM 131.63
Expense paid (Flight Ticket): -RM 2356.00
Settlement in from Mac (Flight Ticket): +RM 589.00
Settlement in from Cristo (Flight Ticket): +RM 589.00
Settlement in from Darren (Flight Ticket): +RM 589.00
Final: RM 4505.41
```

❌ **Issue:** The wallet history shows individual split settlements instead of net transfers. Some settlements go to Willy instead of being balanced across all travelers.

## Expected Behavior

**My settlement idea:** When you press "Settle All — Everyone Pays Now", it should settle ALL expenses at once.

**Expected wallet balances after settlement:**
Since total expenses = RM 8433.90 and initial total = RM 24000 (4 × RM 6000):
- Remaining = RM 24000 - RM 8433.90 = RM 15566.10
- Per person = RM 15566.10 ÷ 4 = RM 3891.52 (approximately)

All four travelers should end up with nearly the same amount: **~RM 3891.52 ± RM 0.03**

## Technical Context

**Database Tables:**
- `expenses` - stores expenses with `paid_by_id`, `myr_amount`, `wallet_id`
- `expense_splits` - per-traveler shares with `is_settled`, `locked`, `from_wallet_id`, `to_wallet_id`
- `settlement_payments` - history of settlement rounds with `from_traveler_id`, `to_traveler_id`, `amount`, `from_wallet_id`, `to_wallet_id`
- `wallets` - individual currency wallets with `traveler_id`, `currency`
- `wallet_topups` - top-up history

**Key Files:**
- `lib/settlement.ts` - `calculateSettlement()` function
- `app/api/trips/[id]/settle-all/route.ts` - Settlement API endpoint
- `app/api/wallets/route.ts` - Wallet balance calculation
- `app/api/settlement/route.ts` - Get settlement instructions

## Questions to Investigate

1. Why does "Settle All" only settle expenses paid by the creditor (Willy) and not all expenses?
2. Why are wallet balances calculated using individual expense splits instead of net settlement transfers?
3. Should wallet balance calculation use `expense_splits` or `settlement_payments` table?
4. How should the settlement logic mark splits as settled while correctly updating wallet balances?
