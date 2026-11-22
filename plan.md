# Implementační plán – Albion Refining Wizard & Calculator (MVP)

Zdroj pravdy pro chování a vzorce: [spec.md](spec.md) (v1.4). Tento soubor říká **v jakém pořadí a jak** se to postaví. Odložené nápady jsou v [docs/post_mvp_backlog.md](docs/post_mvp_backlog.md).

## Stav implementace (2026-11-21)
Fáze 0–7 dokončeny. Ověřeno: `npm test` (110 testů), `npm run lint`, `npm run build` zelené; ruční průchod v prohlížeči proti živému API (Europe i Americas, bez Focusu i s Focussem, desktop i mobilní šířka).

Dodatek po MVP: **váha a převoz** (G5: `data/carry.ts`, `engine/carry.ts`, panel Transport, 178 testů). **Gatherer** (fáze 8: engine `engine/gatherer.ts`, záložka, zásoby ve stacích po 999, 150 testů zelených, ověřeno na živých datech). Dále **varování před tenkými trhy** (`engine/warnings.ts`, značka ⚠, vysvětlení v plánu, filtr „Hide results with thin-market warnings"). 119 testů zelených, ověřeno na živých datech (2 z 18 řádků Wood označeny).

Odchylky od původního plánu:
- Ruční přepisy kalkulačky jsou lokální stav komponenty (`ui/calculator/model.ts`), takže `state/overrides.ts` nevznikl.
- API klient nemá automatický opakovaný pokus po throttlingu: ukáže cache/mock a čas obnovení, uživatel zvolí Refresh.
- Hook `useMarket` vrací `{ loading, result, error, refresh }`; stav offline/throttle je ve `result.warning`.
- Kalkulačka při ručním přepisu měst nuluje přepsané ceny, aby se nezobrazila cena z jiného města.

## Pracovní pravidla
1. **Živá dokumentace:** změní-li se logika, stack nebo architektura, nejdřív se upraví `spec.md` / `plan.md`, teprve potom kód.
2. **Před každou fází** se uživateli předloží krátký sumář (co a které soubory vzniknou) a čeká se na souhlas.
3. **Malé testovatelné kroky.** Fáze se uzavírá zelenými testy a ověřením akceptace dané fáze.
4. Nové nápady během kódování jdou rovnou do `docs/post_mvp_backlog.md`, ne do MVP.
5. Engine (`src/engine`) je čistý TypeScript bez Reactu a bez síťových volání.

## Stack
- Vite + React 18 + TypeScript (strict), Tailwind CSS (tmavé téma), Vitest (+ jsdom a Testing Library jen pro pár UI testů).
- Stav: React + malý store (`zustand`) s `persist` do `localStorage` pro nastavení.
- Cache trhu: IndexedDB (`idb-keyval`) s TTL, fallback na paměť, když IndexedDB není dostupná.
- Žádný backend (CORS potvrzen: `access-control-allow-origin: *`).

## Struktura projektu
```
src/
  data/       cities.ts, resources.ts (item ID), recipes.ts, rates.ts (RRR, daně), focusBase.ts, nutrition.ts
  engine/     focusEfficiency.ts, focusCost.ts, fees.ts, calc.ts, optimize.ts, types.ts
  api/        client.ts (hosty, dávky, throttle), cache.ts, parse.ts, mock.ts, useMarket.ts
  state/      settings.ts (server, Premium, preset spec, filtry), overrides.ts
  ui/         layout/, wizard/, calculator/, shared/ (odznak stáří, banner, inputy)
  App.tsx, main.tsx
```

## Klíčové typy (návrh)
```ts
type Resource = 'wood' | 'ore' | 'hide' | 'fiber' | 'stone';
type Server = 'europe' | 'americas' | 'asia';
type City = 'Bridgewatch' | 'Martlock' | 'Thetford' | 'Fort Sterling' | 'Lymhurst' | 'Brecilien';
interface Recipe { resource: Resource; tier: number; enchant: number;
  rawId: string; rawQty: number; refinedId: string; lowerRefinedId: string | null; }
interface PricePoint { price: number; date: string | null; }   // 0 / null = bez dat
interface CalcInput { recipe: Recipe; N: number; rawPrice: number; lowerPrice: number; sellPrice: number;
  rrr: number; premium: boolean; fee100: number; focusPerCraft: number | null; /* přepsatelné */ }
interface CalcResult { crafts: number; revenue: number; buyCost: number; stationCost: number; invested: number;
  netProfit: number; roi: number; focusTotal: number | null; spf: number | null; marginalSpf: number | null; breakEvenSell: number; }
```

---

## Fáze 0 – Kostra projektu
**Úkoly**
- [x] Vite `react-ts`, Tailwind, Vitest, ESLint; skripty `dev`, `build`, `test`, `lint`.
- [x] Aliasy cest, strict TS, tmavý základ (barvy jako tokeny), prázdný App s hlavičkou.
- [x] `README.md` s příkazy.

**Hotovo když:** `npm run dev` běží, `npm test` spustí prázdnou sadu, `npm run build` projde.

## Fáze 1 – Statická herní data (`src/data`)
**Úkoly**
- [x] `cities.ts`: 6 měst, bonusové město pro každou surovinu, **bez Caerleonu** (test: žádný export nesmí obsahovat „Caerleon").
- [x] `resources.ts`: builder item ID (`T5_WOOD_LEVEL2@2`, `T5_PLANKS_LEVEL2@2`, `T4_ROCK`, `T4_STONEBLOCK` …); enchanty `.1–.4` od T4, Stone jen `.0` v MVP.
- [x] `recipes.ts`: tabulka raw (1,2,2,3,4,5,5) a pravidlo nižšího rafinátu (T4.e → T3.0; T5+ → `T(n−1).e`; T2 bez nižšího).
- [x] `rates.ts`: RRR 36,7/53,9 % (bonus), Premium 4 % / 8 %, setup fee 2,5 %.
- [x] `focusBase.ts`: tabulky základní spotřeby Focusu (hlavní + Stone), `nutrition.ts`: `0,9·2^(tier−3+e)`, T2 = 0.

**Testy:** item ID, recepty (T4.1, T5.2, T8.4), počty receptů, nutrition proti vektorům ze spec.md (±1 po vynásobení `fee100`), žádný Caerleon.

**Hotovo když:** všechny testy dat zelené a data odpovídají `spec.md` §3–4.

## Fáze 2 – Výpočetní engine (`src/engine`)
**Úkoly**
- [x] `focusEfficiency(levels, tier)` = `250·L_T + 30·ΣL_k` (T2/T3: `L_T = 0`), `focusCost(base, E)` = `base·0.5^(E/10000)`.
- [x] `fees.ts`: `F = nutrition · fee100 / 100`, srážka při prodeji `1 − t − 0,025`.
- [x] `calc.ts`: `calculate(input)` podle `spec.md` §5 (crafts, revenue, buy, station, invested, net, ROI, SPF, bod zvratu, marginal SPF). Ošetřit `ρ=0`, `N=0`, nulové ceny, `invested=0` (ROI = null, ne NaN).
- [x] `optimize.ts`: pro recept vybere nezávisle nejlevnější raw město, nejlevnější město rafinátu a nejlepší prodejní město (cena = `sell_price_min − 1`); respektuje rozpočet (`N = floor(budget/u)`) a Focus pool (`C_max`). Vrací nejlepší trasu + alternativy (top 3 na každé noze).

**Testy:** syntetický příklad ze spec.md §5 (`C≈1579,78`, `NetProfit≈796 311`, `ROI≈149,8 %`, `FT≈7 321`), vektor Focusu (T4 leather, L4=7, L5=1 → 47), strop 40 000 a polovina při 10 000, hraniční případy, optimalizace na ručním datasetu (různá města u raw a rafinátu).

**Hotovo když:** engine pokrytý testy, žádná závislost na Reactu / síti.

## Fáze 3 – API klient, cache, mock (`src/api`)
**Úkoly**
- [x] `client.ts`: host podle serveru (`europe`/`west`/`east`), dávkování položek tak, aby URL ≤ 4096 znaků, parametr `locations` jen pro 6 měst, `AbortController`.
- [x] Fronta požadavků pod 180/min, detekce odpovědi „Throttled…" (nejde JSON) → čekání do reset času + jasná chyba pro UI.
- [x] `parse.ts`: výběr `sell_price_min` + `sell_price_min_date` po `item_id` × město; cena `0` = bez dat; stáří = `now − date`.
- [x] `cache.ts`: klíč `server + resource`, TTL 5 min (nastavitelné), refresh na vyžádání.
- [x] `mock.ts`: deterministická mock data pro všechny položky a města, `useMarket()` hook se stavy `loading | ok | stale | throttled | offline(mock)`.

**Testy:** dávkování (délka URL), throttle a zrušení, parsování nul, TTL cache, přechod na mock při chybě sítě (mockovaný `fetch`). Ruční smoke test proti živému API (1 typ suroviny, Europe).

**Hotovo když:** přepnutí serveru nebo suroviny vyvolá správný dotaz a při výpadku se aplikace přepne na mock s příznakem.

## Fáze 4 – Shell aplikace a stav
**Úkoly**
- [x] Horní lišta: server (Europe/Americas/Asia), Premium, režim Bez Focusu/S Focussem, stav dat (načítání, stáří, mock banner).
- [x] Navigace Wizard ↔ Calculator, nastavení perzistentní v `localStorage` (try/catch, funguje i bez něj).
- [x] Levely uzlů T4–T8 po surovině + globální preset 0/50/100 (`state/settings.ts`).

**Hotovo když:** změna serveru okamžitě spustí nový dotaz, nastavení přežije reload.

## Fáze 5 – Kalkulačka (Live Price Override)
(Před Wizardem, protože Wizard na ni odkazuje.)

**Úkoly**
- [x] Výběr receptu (surovina, tier, enchant) + města (raw, rafinát, prodej), předvyplnění z API.
- [x] Přepsatelná pole: cena raw, cena rafinátu, Fee per 100 nutrition (nebo přímo poplatek na craft), prodejní cena, RRR %, levely spec, `f`, počet nákupních sad `N`. U každého pole označení „API (stáří)" vs „ručně" + reset.
- [x] Výstupy v reálném čase: počet kusů, náklady, tržba, Net Profit, ROI, SPF, marginal SPF, bod zvratu.

**Testy:** UI test: změna ceny/RRR/fee přepočítá výstupy bez volání API; reset vrátí hodnotu z API.

**Hotovo když:** akceptace 4 ze `spec.md` §9.

## Fáze 6 – Wizard
**Úkoly**
- [x] Filtry: rozpočet, režim Focus, preset spec, typ suroviny (načítá jen ten typ), min. ROI %, max. stáří dat, Available Focus (výchozí 10 000, jen s Focussem), řazení ROI / SPF / Net Profit (výchozí ROI).
- [x] Tabulka/karty: řádek = recept + nejlepší trasa (`Raw-buy → Refined-buy → Refine → Sell`), Net Profit, ROI, SPF, marginal SPF, odznak stáří (nejstarší použitá cena).
- [x] Rozbalená karta „akční plán" (4 kroky ze `spec.md` §7.2) a tlačítko Otevřít v kalkulačce (předá recept, trasu a ceny).
- [x] Stavy: prázdné, načítání (skeleton), throttle (odpočet), chyba + mock banner, žádný výsledek.

**Testy:** filtr min. ROI / stáří / rozpočet / Focus pool, řazení, vynechání kombinací s cenou 0, žádný Caerleon v trasách.

**Hotovo když:** akceptace 1–3 ze `spec.md` §9.

## Fáze 7 – Dotažení a verifikace
- [x] Prahy odznaku stáří (výchozí: ≤ 1 h zelená, ≤ 6 h žlutá, jinak červená), výchozí max. stáří filtru 24 h.
- [x] Responzivita (mobil), klávesnice a kontrasty, prázdné/chybové stavy.
- [x] Kontrola celé akceptace (`spec.md` §9) v prohlížeči proti živému API i v mock režimu.
- [x] `README.md` (spuštění, testy, struktura, ověřená a neověřená data).

**Definice „Hotovo" (MVP):** všech 6 akceptačních kritérií ze `spec.md` §9 splněno, `npm test`, `npm run lint` a `npm run build` zelené, ruční průchod Wizardem a kalkulačkou na živých datech i na mocku.

## Fáze 8 – Gatherer (po MVP, hotovo)
Specifikace: [spec.md](spec.md) sekce 12.

**G1 – Engine (`src/engine/gatherer.ts`)**
- [x] `planGatherer({ resource, raw, stock, rrr, spec, focusMode })`: výpočet shora dolů (T8 → T2) podle 12.4: sady `N`, vyrobené kusy, poptávka (včetně sdíleného T3.0), nabídka, přebytek, chybějící raw po tierech, nepoužité raw, celkový Focus.
- [x] `sellPlan(rows, prices)`: město s nejvyšší cenou (−1) pro každý přebytek, alternativy top 3, stáří ceny, „no price data".
- [x] Testy: čtyři příklady ze spec.md 12.6 (včetně sdíleného T3.0 a vícenásobného řetězení), hranice (nulové zásoby, raw pod `q(T)`, vlastní stock pokrývá poptávku, `ρ = 0`), Stone jen `.0`, žádné město mimo 6 bezpečných.

**G2 – Stav**
- [x] Zásoby po surovině (`raw`, `stock`) v `state/settings.ts`, perzistentní; migrace přes existující `merge`.

**G3 – UI (`src/ui/gatherer/GathererView.tsx`)**
- [x] Výběr suroviny, mřížka raw tier × enchant, sbalitelná mřížka rafinovaných zásob.
- [x] Souhrn „Chybí: …", nepoužité raw, Focus celkem vs. Available Focus (jen s Focussem).
- [x] Tabulka rafinace po tierech a tabulka prodeje (množství, město, cena za kus, stáří, alternativy).
- [x] Stavy: načítání, offline mock, žádné zásoby, vše zpracováno.

**G4 – Zapojení a ověření**
- [x] Třetí záložka v `TopBar`/`App`, typ `View` rozšířit o `'gatherer'`.
- [x] UI testy (vyplnění zásob → souhrn chybějících, přepnutí Focusu mění Focus a RRR), `npm test`, `lint`, `build`, průchod v prohlížeči na živých datech.
- [x] README a plan.md aktualizovat.

**G5 – Váha a převoz (spec 12.7)**
- [x] `data/carry.ts` (nosnosti a váhy oxů, bagů, backpacků, váha kusu po tieru) a `engine/carry.ts` (použitelná nosnost, váha s backpackem, kontrola cesty) + testy.
- [x] Nastavení `carry` ve stavu (perzistentní), panel **Transport** v Gathereru.
- [x] Výsledek: kontrola cesty do rafinace a cesty k prodeji, UI testy a ověření v prohlížeči.

**Hotovo když:** příklady z 12.6 sedí v testech i v UI, souhrn „Chybí …" je správně zaokrouhlen nahoru (raw) a prodejní množství dolů, vše zelené.

## Rizika a otevřené detaily
- API ukazuje jen nejnižší sell order (bez hloubky trhu): výsledky nad rozpočtem mohou být optimistické. Poznámka v UI, hloubka trhu v backlogu.
- Throttling při rychlém přepínání: fronta + cache + zrušení nedokončených dotazů (Fáze 3).
- Další testovací vektory Focusu a poplatků pro vyšší tiery doplnit z hry, jakmile budou k dispozici.
