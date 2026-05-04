# 10-Day Bali Trip — Test Data Verification Guide

## Scenario Overview

**Trip:** Bali, Indonesia — 10 days (2025-06-01 to 2025-06-10)
**Travelers:** Darren, Willy, Mac, Cristo
**Wallets:**
- Darren Cash MYR
- Willy Cash MYR
- Mac Cash MYR
- Cristo TNG MYR
- Pool (shared group wallet, MYR)

---

## Initial Setup (before Day 1)

### Wallet Top-ups
| Wallet | Top-up Amount |
|--------|--------------|
| Darren Cash | RM 5,000.00 |
| Willy Cash | RM 5,000.00 |
| Mac Cash | RM 5,000.00 |
| Cristo TNG | RM 3,000.00 |

### Pool Contributions (Pool Top-up from each person's wallet)
Each person contributes RM 500 to the Pool wallet.
| From | Amount |
|------|--------|
| Darren Cash → Pool | RM 500.00 |
| Willy Cash → Pool | RM 500.00 |
| Mac Cash → Pool | RM 500.00 |
| Cristo TNG → Pool | RM 500.00 |

### Initial Wallet Balances (after pool contributions)
| Wallet | Balance |
|--------|---------|
| Darren Cash | RM 4,500.00 |
| Willy Cash | RM 4,500.00 |
| Mac Cash | RM 4,500.00 |
| Cristo TNG | RM 2,500.00 |
| Pool | RM 2,000.00 |

---

## Day-by-Day Summary

### Settlement Rounds
| Round | After Day | Instructions |
|-------|-----------|-------------|
| Round 1 | Day 3 | Mac→Willy RM 125, Cristo→Darren RM 35, Cristo→Willy RM 150 |
| Round 2 | Day 6 | Darren→Willy RM 155, Mac→Willy RM 95, Cristo→Willy RM 175 |
| Round 3 | Day 9 | Mac→Darren RM 15, Mac→Willy RM 170, Cristo→Willy RM 125 |
| Round 4 | Day 10 | Darren→Mac RM 40, Willy→Mac RM 40 |

### Expected EOD Wallet Balances

| | Darren Cash | Willy Cash | Mac Cash | Cristo TNG | Pool |
|--|-------------|------------|----------|------------|------|
| **Setup** | 4,500.00 | 4,500.00 | 4,500.00 | 2,500.00 | 2,000.00 |
| **EOD Day 1** | 4,420.00 | 4,380.00 | 4,300.00 | 2,500.00 | 1,600.00 |
| **EOD Day 2** | 4,260.00 | 4,140.00 | 4,300.00 | 2,440.00 | 1,120.00 |
| **EOD Day 3** | 4,060.00 | 3,820.00 | 4,220.00 | 2,280.00 | 1,120.00 |
| **After R1** | 4,095.00 | 4,095.00 | 4,095.00 | 2,095.00 | 1,120.00 |
| **Day 4 pool top-up** | 3,595.00 | 3,595.00 | 3,595.00 | 1,595.00 | 3,120.00 |
| **EOD Day 4** | 3,495.00 | 3,475.00 | 3,395.00 | 1,595.00 | 2,520.00 |
| **EOD Day 5** | 3,375.00 | 3,195.00 | 3,395.00 | 1,515.00 | 1,720.00 |
| **EOD Day 6** | 3,375.00 | 2,795.00 | 3,315.00 | 1,395.00 | 1,080.00 |
| **After R2** | 3,220.00 | 3,220.00 | 3,220.00 | 1,220.00 | 1,080.00 |
| **EOD Day 7** | 3,140.00 | 2,820.00 | 3,100.00 | 1,220.00 | 720.00 |
| **EOD Day 8** | 2,820.00 | 2,660.00 | 3,100.00 | 1,160.00 | 320.00 |
| **Day 9 pool top-up** | 2,420.00 | 2,260.00 | 2,700.00 | 760.00 | 1,920.00 |
| **EOD Day 9** | 2,420.00 | 2,140.00 | 2,620.00 | 560.00 | 1,440.00 |
| **After R3** | 2,435.00 | 2,435.00 | 2,435.00 | 435.00 | 1,440.00 |
| **EOD Day 10** | 2,355.00 | 2,355.00 | 2,235.00 | 315.00 | 1,160.00 |
| **After R4 (FINAL)** | 2,315.00 | 2,315.00 | 2,315.00 | 315.00 | 1,160.00 |

### Final Verification
- Total initial cash: RM 18,000 (5000+5000+5000+3000)
- Total personal expenses: RM 5,140
- Total pool expenses: RM 4,440
- Total expenses: RM 9,580
- Final cash remaining: RM 18,000 − RM 9,580 = **RM 8,420**
- Sum of final balances: 2315+2315+2315+315+1160 = **RM 8,420** ✓

---

## Settlement Net Balances (check against settlement page)

### Before Round 1 (cumulative D1–D3)
| Traveler | Paid | Share | Net |
|----------|------|-------|-----|
| Darren | RM 440.00 | RM 405.00 | **+RM 35.00** |
| Willy | RM 680.00 | RM 405.00 | **+RM 275.00** |
| Mac | RM 280.00 | RM 405.00 | **−RM 125.00** |
| Cristo | RM 220.00 | RM 405.00 | **−RM 185.00** |

### Before Round 2 (cumulative D4–D6, fresh after R1)
| Traveler | Paid | Share | Net |
|----------|------|-------|-----|
| Darren | RM 220.00 | RM 375.00 | **−RM 155.00** |
| Willy | RM 800.00 | RM 375.00 | **+RM 425.00** |
| Mac | RM 280.00 | RM 375.00 | **−RM 95.00** |
| Cristo | RM 200.00 | RM 375.00 | **−RM 175.00** |

### Before Round 3 (cumulative D7–D9, fresh after R2)
| Traveler | Paid | Share | Net |
|----------|------|-------|-----|
| Darren | RM 400.00 | RM 385.00 | **+RM 15.00** |
| Willy | RM 680.00 | RM 385.00 | **+RM 295.00** |
| Mac | RM 200.00 | RM 385.00 | **−RM 185.00** |
| Cristo | RM 260.00 | RM 385.00 | **−RM 125.00** |

### Before Round 4 (cumulative D10, fresh after R3)
| Traveler | Paid | Share | Net |
|----------|------|-------|-----|
| Darren | RM 80.00 | RM 120.00 | **−RM 40.00** |
| Willy | RM 80.00 | RM 120.00 | **−RM 40.00** |
| Mac | RM 200.00 | RM 120.00 | **+RM 80.00** |
| Cristo | RM 120.00 | RM 120.00 | **RM 0.00** |

---

## How to Use This Test Data

1. **Initial Setup:** Create the trip, add 4 travelers, create 5 wallets (Darren Cash, Willy Cash, Mac Cash, Cristo TNG, Pool). Top up wallets as shown above. Add pool contributions via pool top-up.

2. **Import each day:** Enter expenses from `day-XX.json` files in order. After entering a day's expenses, check the wallet balances match the EOD table above.

3. **Settlement Rounds:** After Day 3, 6, 9, and 10, run "Settle All" and check:
   - Settlement page shows the correct instructions (table above)
   - All net balances reset to RM 0.00 after settling
   - Wallet balances match the "After RX" row in the table above

4. **Pool top-ups on Day 4 and Day 9:** Before entering that day's expenses, first record the pool top-up transaction from each person's wallet.

---

## Day-by-Day Expense Files

| File | Description |
|------|-------------|
| day-01.json | Arrival day — airport, lunch, groceries, welcome dinner (pool) |
| day-02.json | Sightseeing — breakfast, museum, lunch, activities (pool) |
| day-03.json | Beach day — breakfast, water sports, lunch, dinner |
| day-04.json | Temples — *pool top-up first*, temple entry, lunch, cultural show, cooking class (pool) |
| day-05.json | Shopping — breakfast, souvenirs, lunch, sunset cruise (pool) |
| day-06.json | Water park — breakfast, water park, lunch, dinner buffet (pool) |
| day-07.json | Spa & relax — breakfast, spa, lunch, group lunch (pool) |
| day-08.json | Day trip — breakfast, day trip, lunch, beach BBQ (pool) |
| day-09.json | Last full day — *pool top-up first*, breakfast, shopping, lunch, cooking class (pool) |
| day-10.json | Departure — breakfast, duty free, lunch, snacks, airport transfer (pool) |
