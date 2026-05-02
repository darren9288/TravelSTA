# Test Data - Bangkok-Tokyo Adventure 2026

## Overview
This test dataset simulates a 10-day multi-country trip with 4 travelers testing all TravelSTA features:
- **Multi-currency support** (MYR, THB, JPY)
- **Wallet tracking** (Wise, TNG, Credit Card, Cash in multiple currencies)
- **Pool wallets** (shared expenses)
- **Settlement checkpoints** (Day 5 and Day 9)
- **Mixed split types** (even splits, custom splits, individual expenses)
- **Import/Export functionality**

## Trip Details
- **Route**: KLIA → Bangkok → Tokyo → Osaka → Kyoto → Bangkok → KLIA
- **Dates**: April 30 - May 9, 2026 (10 days)
- **Travelers**: Darren, Willy, Mac, Cristo
- **Total Expenses**: MYR 11,956 (≈ MYR 2,989 per person)

## Setup Instructions

### 1. Create the Trip
1. Go to "New Trip" in TravelSTA
2. Fill in trip details:
   - **Name**: Bangkok-Tokyo Adventure 2026
   - **Destination**: Bangkok → Tokyo → Kyoto
   - **Start Date**: 2026-04-30
   - **End Date**: 2026-05-09
   - **Foreign Currency 1**: THB (Thai Baht)
     - Cash Rate: 8.0
     - Wise Rate: 8.0
   - **Foreign Currency 2**: JPY (Japanese Yen)
     - Cash Rate: 30.0
     - Wise Rate: 30.0

### 2. Add Travelers
Add 4 travelers:
1. Darren
2. Willy
3. Mac
4. Cristo

### 3. Create Wallets

**Darren's Wallets:**
- Wise (MYR 2,000)
- Cash MYR (MYR 500)
- Cash THB (THB 0)
- Cash JPY (JPY 0)

**Willy's Wallets:**
- TNG (MYR 1,500)
- Credit Card (MYR 0)
- Cash MYR (MYR 300)
- Cash THB (THB 0)
- Cash JPY (JPY 0)

**Mac's Wallets:**
- Credit Card (MYR 0)
- TNG (MYR 120)
- Cash MYR (MYR 400)
- Cash THB (THB 0)
- Cash JPY (JPY 0)

**Cristo's Wallets:**
- Cash MYR (MYR 600)
- Cash THB (THB 0)
- Cash JPY (JPY 0)

**Pool Wallets:**
- Cash Pool MYR (MYR 0)
- Cash Pool THB (THB 0)
- Cash Pool JPY (JPY 0) - Will be used on Day 8

### 4. Import Transaction Data

Import the JSON files **in order** from Day 1 to Day 10:

1. `day01-apr30-bangkok-arrival.json` - 3 transactions
2. `day02-may01-bangkok.json` - 6 transactions
3. `day03-may02-bangkok-tokyo.json` - 5 transactions
4. `day04-may03-tokyo.json` - 6 transactions
5. `day05-may04-osaka-settlement.json` - 5 transactions + **SETTLEMENT CHECKPOINT**
6. `day06-may05-osaka.json` - 6 transactions (fresh start after settlement)
7. `day07-may06-kyoto.json` - 5 transactions
8. `day08-may07-kyoto.json` - 6 transactions (includes pool-funded activities)
9. `day09-may08-bangkok-settlement.json` - 5 transactions + **SETTLEMENT CHECKPOINT**
10. `day10-may09-final.json` - 6 transactions (final day)

**Import Steps:**
1. Go to trip page → Import/Export
2. Select "JSON" format
3. Upload each file
4. Review preview and click "Import"
5. Verify success message

## What to Test

### Day-by-Day Testing

**Day 1-2 (Bangkok):**
- ✅ THB currency transactions
- ✅ Multiple payment types (Wise, Credit Card, Cash)
- ✅ Even splits across all travelers
- ✅ Wallet balance tracking

**Day 3 (Bangkok → Tokyo):**
- ✅ Currency switch from THB to JPY
- ✅ Large expenses (flights, accommodation)
- ✅ Settlement status building up

**Day 4 (Tokyo):**
- ✅ Custom splits (Disney merchandise - Cristo opted out)
- ✅ Individual expenses
- ✅ Multiple transactions per day

**Day 5 (Tokyo → Osaka) - SETTLEMENT:**
- ✅ High-value transaction (Shinkansen tickets)
- ✅ **First settlement checkpoint**
- ✅ Test "Settle All" feature
- ✅ Verify wallet-to-wallet transfers
- ✅ Check settlement history
- ✅ Confirm splits are locked after settlement

**Day 6-7 (Osaka → Kyoto):**
- ✅ Fresh balances after settlement
- ✅ Mixed payment methods
- ✅ Custom splits (electronics, kimono shopping)

**Day 8 (Kyoto):**
- ✅ **Pool wallet usage** (Japan Fund pays for activities)
- ✅ Pool expenses auto-settled
- ✅ Verify pool balance tracking

**Day 9 (Kyoto → Bangkok) - SETTLEMENT:**
- ✅ Currency switch back to THB
- ✅ **Second settlement checkpoint**
- ✅ Test settlement with negative balances
- ✅ Verify all balances reset

**Day 10 (Bangkok → KLIA - Final):**
- ✅ MYR currency transactions (back home)
- ✅ Final expenses
- ✅ Trip summary statistics

### Feature Testing Checklist

#### Multi-Currency
- [ ] Expenses in MYR, THB, and JPY all display correctly
- [ ] Currency conversion uses correct rates (Cash vs Wise)
- [ ] Dashboard shows totals in MYR
- [ ] Export includes currency field

#### Wallets
- [ ] Each traveler's wallet balances update correctly
- [ ] Credit card shows negative balance (debt)
- [ ] Cash wallets decrease with spending
- [ ] Wise/TNG balances track correctly

#### Pool Wallets
- [ ] Pool-funded expenses (Day 8) split correctly
- [ ] Pool wallet balance shows in dashboard
- [ ] Pool expenses marked as auto-settled

#### Settlements
- [ ] Settlement page shows correct balances
- [ ] "Settle All" button works
- [ ] Wallet-to-wallet selection available
- [ ] Settlement history displays correctly
- [ ] Splits locked after settlement (cannot edit)
- [ ] Balances reset after settlement

#### Import/Export
- [ ] JSON import works for all 10 files
- [ ] Duplicate detection works (try re-importing)
- [ ] Export includes all fields (currency, wallet, etc.)
- [ ] CSV export/import also works

#### Dashboard
- [ ] Total spent shows MYR 11,956
- [ ] Per person share shows ≈ MYR 2,989
- [ ] Recent expenses display correctly
- [ ] Statistics accurate

## Expected Results

### Settlement Checkpoints

**Day 5 Settlement (After MYR 6,279 spent):**
- Darren: Paid MYR 1,800 | Share MYR 1,569.75 | **Owed MYR 230.25**
- Willy: Paid MYR 1,082 | Share MYR 1,569.75 | Owes MYR 487.75
- Mac: Paid MYR 1,161 | Share MYR 1,569.75 | Owes MYR 408.75
- Cristo: Paid MYR 1,160.75 | Share MYR 1,569.75 | **Owed MYR 409**

**Day 9 Settlement (After MYR 5,177 spent since Day 6):**
- Darren: Paid MYR 1,426 | Share MYR 1,294.25 | **Owed MYR 131.75**
- Willy: Paid MYR 1,212 | Share MYR 1,294.25 | Owes MYR 82.25
- Mac: Paid MYR 1,203 | Share MYR 1,294.25 | Owes MYR 91.25
- Cristo: Paid MYR 676 | Share MYR 1,294.25 | Owes MYR 618.25

### Final Statistics
- **Total Transactions**: 48
- **Total Spent**: MYR 11,956
- **Per Person**: MYR 2,989
- **Currencies Used**: 3 (MYR, THB, JPY)
- **Settlements**: 2 (Day 5, Day 9)
- **Pool Funded**: MYR 840 (Day 8)

## Troubleshooting

### Import Errors
- **"Traveler not found"**: Ensure all 4 travelers are added first
- **"Wallet not found"**: Create all wallets before importing
- **"Currency not allowed"**: Check trip has THB and JPY configured
- **Duplicate warnings**: Normal if re-importing same file

### Settlement Issues
- **Cannot edit splits**: Expected after settlement (locked)
- **Balances don't match**: Check if all transactions imported
- **Wallet selection missing**: Ensure wallets exist for both payer and payee

### Display Issues
- **Wrong currency symbol**: Check expense currency field
- **Incorrect totals**: Verify conversion rates match (THB: 8, JPY: 30)

## Notes
- All amounts are in the transaction's currency, with MYR equivalent calculated
- Pool expenses (Day 8) are automatically settled and don't affect individual balances
- Settlement locks all previous splits - they cannot be edited after settlement
- Wallet balances are tracked separately from settlement balances
- Credit card balances can go negative (representing debt)

## Support
If you encounter issues, check:
1. All travelers and wallets are created
2. Trip currencies are configured correctly (THB and JPY)
3. Files are imported in order (Day 1 → Day 10)
4. Database migrations 008 and 009 are applied
