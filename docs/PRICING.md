# Pricing engine

All numbers below are the owner's settings in `config/main` as of Nov 2026. The app reads the live values, so check the Price book tab before relying on a number.

## The formula

```
price = (material + sub cost) / (1 − margin)  +  max(labor cost / (1 − margin), labor at customer rates)
```

This is `priceOf(c, m)`. **A&H prices by margin, not markup.** A 42% margin means dividing the cost by 0.58, which is a 72.4% markup.

| Setting | Key in `cfg` | Value |
|---|---|---|
| Target margin by division | `margin` | Remodel 42, Service 45, Installer programs 30 |
| Labor cost per billable hour | `rate` | $41 (`rateBasis` explains it) |
| Customer labor rates | `sell` | lead $120, helper $85, lead share 50% (blended $102.50) |
| Minimum job by division | `minJob` | Remodel $1,500; Service and Installer programs $350 |
| Senior approval flag | `bigJob` | $25,000 |
| Estimator self-approval limit | `selfLimit` | $5,000 (also requires target margin) |
| Sales tax on materials | `tax` | NV 8.375, UT 7.25, AZ 8.6, CA 7.25 |
| Labor factor by state | `labAdj` | UT 0.88, others 1 |
| Market range factor by state | `mktF` | Used only for the *Below/Above market* flags |
| Trade labor factors | `tradeF` | e.g. plumbing 1.6, electrical 1.6, paint 0.85 (`TRADE_F0`) |
| Sub ballpark with no history | `noHist` | in-house cost + 15% |
| Default payment split | `pay` | 30/40/30 (over the Nevada deposit cap; see WORKFLOWS.md) |
| Estimate valid for | `validDays` | 30 |
| Adjustment presets | `adjPresets` | second floor +10%, occupied home +10%, pre-1978 +10%, rush +15%, … |

## Price book lines (`cfg.book[code]`)

```
{ name, unit, mat: [good, better, best], hrs, waste, sub: [good, better, best]?, allow?: {...}, src }
```

- **`mat`** is material per unit, by tier. **`hrs`** is crew hours per unit. **`waste`** is a fraction, for example 0.12 for tile. **`sub`** is the sub's price per unit, for work A&H subs out.
- **`allow`** marks a *market allowance* line, priced from Las Vegas ranges until A&H has its own costs. `sampleCount()` counts them, and the app shows "Allowance prices: N of 165".
- **Per-estimate copies:** `sc.bk[code]` holds a per-estimate copy, frozen at approval.

## From measurements to lines

1. **Inputs to quantities.** `TYPES[type].lines(inputs, specs)` turns a scope's measurements into `[code, qty]` pairs. There are 28 work types, from refacing to steel.
2. **Quantities to cost.** `scopeLines(sc, tier)` prices each pair:
   - **Material:** qty × (1 + waste) × mat[tier] × spec multipliers × (1 + tax)
   - **Labor hours:** qty × hrs × spec and labor multipliers
   - **Labor cost:** hours × rate × trade factor × state labor factor
   - **Labor at customer rates:** hours × `sellRate()` × factors
   - **Tile:** `tileCalc` adjusts for tile size, pattern and source.
3. **Scope totals.** `scopeCost(sc)` sums the lines and picks the route (in-house, sub, or manufacturer quote for steel). `scopePrice` applies the scope's adjustments.
4. **Estimate totals.** `totals(e)` adds the scope prices and the extras (cost ÷ (1 − margin)). It applies the minimum job, then returns `{cost, price, raw, minAdj, gm, hrs, m}`.
5. **Margin used.** `marginOf(e)` is the estimate's own margin if set, otherwise `defMargin(e)`, the division target.

## Checks shown to people

- **Market flags.** `marketFlag(l, st, margin)` compares a line's unit price with Las Vegas ranges (`MARKET`). Below 97% of the low end shows *Below market*, which usually means a missing cost. Above 103% of the high end shows *Above market*.
- **Missing costs.** `allowMissing(e)` and `steelMissing(e)` block sending while anything still needs a cost or decision.

## Tested by

`tests/app-pricing.test.js` covers the formula, the labor rule, waste and tax, the minimum job, the live targets, and a price snapshot of the test estimate. If you change pricing on purpose, update the snapshot and say why in the pull request.
