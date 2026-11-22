# Albion Refining Wizard & Calculator

Web app that finds profitable refining opportunities in Albion Online along safe routes
(Bridgewatch, Martlock, Thetford, Fort Sterling, Lymhurst, Brecilien; Caerleon is never used)
and lets you override live prices to recalculate profit instantly.

- **Wizard:** loads one resource type from the [Albion Data Project](https://www.albion-online-data.com/api-site/api.html),
  ranks recipes by ROI / SPF / net profit and shows a step-by-step action plan.
- **Calculator:** prefilled from API prices; every price, fee, RRR, Focus value and spec level can be overridden.
- **Gatherer:** enter what you gathered per tier and enchant (stacks of 999 plus loose pieces). It computes how much
  raw you still have to gather so everything can be refined (nothing is bought) and where to sell what is left.
  A Transport panel (ox, bag, optional gatherer backpack) checks that the material fits on the way to the refining
  city and that the refined items fit on the way to sell them.
- Pure client-side app (React + TypeScript + Vite + Tailwind). Prices are cached in the browser; if the API is
  unreachable the app falls back to cached data or clearly labelled mock data.

## Commands

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest (data, engine, API client, UI)
npm run lint
npm run build
```

## Structure

```
src/data/    static game data: cities, item IDs, recipes, RRR, taxes, Focus base costs, nutrition
src/engine/  pure calculation: Focus efficiency, fees, profit, route optimiser, filters (no React, no network)
src/api/     Albion Data API client (batching, throttle queue, cache), mock data, useMarket hook
src/state/   persisted settings (zustand + localStorage)
src/ui/      Wizard, Calculator, shared components
```

Behaviour and formulas are specified in [spec.md](spec.md); the implementation plan is [plan.md](plan.md);
deferred ideas are in [docs/post_mvp_backlog.md](docs/post_mvp_backlog.md).

## Data confidence

- **Verified in game by the product owner:** station fee per craft (nutrition `0.9 · 2^(tier − 3 + enchant)`),
  Focus cost (`base · 0.5^(E/10000)`, `E = 250·own tier level + 30·sum of tier node levels`; one reference
  measurement T4 leather → 47 Focus).
- **Taken from the Albion wiki:** recipes, RRR (36.7 % / 53.9 % in the bonus city), base Focus costs.
- **Assumptions:** the nutrition formula is applied to every refining line (measured on Wood and Stone), and
  T2/T3 benefit only from the +30 per node part of Focus efficiency.
- Prices are lowest sell orders only; market depth is unknown, so large budgets may not fill at the shown price.
