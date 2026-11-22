# Albion Online Refining Wizard & Calculator – specifikace (MVP)

Stav: **v1.5**. Všechny otevřené body MVP uzavřeny; model Focus efficiency a nutrition ověřeny měřením ze hry. Sekce 12 (Gatherer) přidána po MVP a implementována.
Jazyk dokumentu: čeština. Jazyk UI: **angličtina** (názvy surovin, měst a pojmy RRR / Focus / SPF jako ve hře).

## 1. Cíl
Webová aplikace, která v Albion Online hledá nejvýhodnější příležitosti pro rafinaci surovin po **bezpečných trasách** (bez Caerleonu) a umožňuje ručně přepsat ceny pro okamžitý přepočet zisku.

Mimo rozsah MVP: Caerleon / Black Market, transport a jeho rizika, cestovní náklady, transmutace, crafting předmětů, historie cen a grafy, uživatelské účty.

## 2. Rozhodnutí (uzavřeno)
| Téma | Rozhodnutí |
|---|---|
| Typ obchodu | Nákup vstupů **okamžitě** za nejnižší sell order (`sell_price_min`) ve městě nákupu. Prodej výstupu **sell orderem** za `sell_price_min` cílového města **minus 1 silver**. Žádný přepínač buy order / instant sell. |
| Architektura | **Čistě klient** (React + TS + Vite + Tailwind), volání API z prohlížeče, cache v prohlížeči s TTL. Backend není. |
| Rafinace | **Jen v bonusovém městě** dané suroviny. Brecilien jen nákup / prodej. |
| Focus | **Přesný herní vzorec** (sekce 6), výměnný modul + testy. |
| Jazyk UI | Angličtina. |
| Načítání dat | Po **typu suroviny na vyžádání** (dávkově, s cache). Změna typu nebo serveru = nový dotaz. |
| Focus pool | Volitelné pole **Available Focus** (výchozí 10 000) omezuje počet rafinací ve Wizardu. |
| Ceny | Ověřeno: server přidává `access-control-allow-origin: *`, takže proxy není potřeba. |
| Station fee | Zadává se jako **Fee per 100 nutrition** (hodnota přímo viditelná na stanici). Poplatek na 1 craft = `nutrition(tier, enchant) · fee100 / 100`, viz sekce 4.6. |
| Stone | V MVP jen **Stone .0**; enchantovaný stone (násobné výstupy) po MVP. |
| Města nákupu | **Raw a nižší rafinát se nakupují každý v jiném městě**, pokud je to výhodné. Trasa = `Raw-buy city`, `Refined-buy city`, `Refine city`, `Sell city`. |
| Metriky Focusu | Vedle **SPF** i **marginal SPF** (sekce 5, bod 13). |

## 3. Datový zdroj: Albion Online Data Project
- Hosty podle serveru: Europe → `europe.albion-online-data.com`, Americas → `west.albion-online-data.com`, Asia → `east.albion-online-data.com` (zadání uvádělo `www`, to je potřeba opravit).
- Endpoint: `GET https://{host}/api/v2/stats/prices/{ITEM_IDS}.json?locations={CITY1,CITY2,...}` (položky odděleny čárkou).
- **Limity**: 180 požadavků / min, 300 / 5 min, URL max. 4096 znaků. API při překročení vrací text „Throttled…" (ne JSON) → klient musí poznat, počkat do resetu a nespadnout.
- Používat gzip (prohlížeč dělá automaticky). Požadavky dávkovat: jedna dávka = více položek × všechna města.
- Použitá pole odpovědi: `item_id`, `city`, `sell_price_min`, `sell_price_min_date`, `quality`. Hodnota `0` = žádná data.
- Lokace (přesné názvy pro API): `Bridgewatch`, `Martlock`, `Thetford`, `Fort Sterling`, `Lymhurst`, `Brecilien`. Caerleon se nikdy nedotazuje.
- Stáří dat = `now − sell_price_min_date`; zobrazuje se u každé ceny.
- Cache: klíč `server + typ suroviny`, TTL výchozí 5 min (nastavitelné), uložení v IndexedDB / localStorage. Při chybě API: záložní mock data + viditelný banner „Offline – mock data".
- Odhad objemu: jeden typ suroviny ≈ 54 item ID × ~22 znaků + 6 měst → 1–2 dotazy.

### Item ID
| Typ | Surovina | Rafinát |
|---|---|---|
| Wood | `T{n}_WOOD` | `T{n}_PLANKS` |
| Ore | `T{n}_ORE` | `T{n}_METALBAR` |
| Hide | `T{n}_HIDE` | `T{n}_LEATHER` |
| Fiber | `T{n}_FIBER` | `T{n}_CLOTH` |
| Stone | `T{n}_ROCK` | `T{n}_STONEBLOCK` |

Enchant: příponou `_LEVEL{e}@{e}`, např. `T5_WOOD_LEVEL2@2`, `T5_PLANKS_LEVEL2@2`. Enchanty `.1–.4` existují od T4 (T2, T3 jen `.0`). Stone nemá `.4`.

## 4. Statická herní data
Zdroj: Albion Online Wiki (Refining, Crafting Focus), ověřeno 2026-11-21.

### 4.1 Města a bonusy rafinace
| Surovina | Stanice | Bonusové město |
|---|---|---|
| Wood | Lumbermill | Fort Sterling |
| Ore | Smelter | Thetford |
| Hide | Tanner | Martlock |
| Fiber | Weaver | Lymhurst |
| Stone | Stonemason | Bridgewatch |

Brecilien: wiki u rafinace nic neuvádí → v aplikaci pouze nákup / prodej.

### 4.2 Recepty (suroviny před vrácením)
| Výstup | Raw | Rafinát nižšího tieru |
|---|---|---|
| T2 | 1 | – |
| T3 | 2 | 1 |
| T4 | 2 | 1 |
| T5 | 3 | 1 |
| T6 | 4 | 1 |
| T7 | 5 | 1 |
| T8 | 5 | 1 |

Pravidlo nižšího rafinátu u enchantů:
- T4 `.1–.4`: raw `T4.e` + **neočarovaný** T3 rafinát.
- T5–T8 `.1–.4`: raw `Tn.e` + rafinát `T(n−1).e` (stejný enchant).
- **Stone**: viz otevřený bod 11.3 (enchantovaný kámen má násobné výstupy).

### 4.3 Resource Return Rate (RRR)
| Město | Bez Focusu | S Focussem |
|---|---|---|
| Bonusové město suroviny | 36,7 % | 53,9 % |
| Ostatní královská města | 15,3 % | 43,5 % |

V MVP se používají jen řádky pro bonusové město. RRR lze ručně přepsat. Denní produkční bonus a hideout / ostrovy se nemodelují.

### 4.4 Tržní daně
- Premium: 4 % daň, bez Premia 8 %. K tomu **2,5 % setup fee** za sell order. Přepínač „Premium" v nastavení (výchozí zapnuto).
- Celkový srážkový faktor při prodeji = `1 − tax − 0,025`.

### 4.5 Základní spotřeba Focusu na 1 rafinaci (spec 0)
| Tier | .0 | .1 | .2 | .3 | .4 |
|---|---|---|---|---|---|
| T2 | 18 | – | – | – | – |
| T3 | 31 | – | – | – | – |
| T4 | 54 | 94 | 164 | 287 | 503 |
| T5 | 94 | 164 | 287 | 503 | 880 |
| T6 | 164 | 287 | 503 | 880 | 1 539 |
| T7 | 287 | 503 | 880 | 1 539 | 2 694 |
| T8 | 503 | 880 | 1 539 | 2 694 | 4 714 |

Stone (jiná tabulka, `.4` neexistuje):
| Tier | .0 | .1 | .2 | .3 |
|---|---|---|---|---|
| T2 | 18 | – | – | – |
| T3 | 31 | – | – | – |
| T4 | 54 | 108 | 216 | 432 |
| T5 | 94 | 188 | 376 | 752 |
| T6 | 164 | 328 | 656 | 1 312 |
| T7 | 287 | 574 | 1 148 | 2 296 |
| T8 | 503 | 1 006 | 2 012 | 4 024 |

### 4.6 Nutrition na 1 craft (pro poplatek stanice)
- Poplatek stanice = nutrition spotřebovaná craftem × `fee100` / 100. `fee100` zadává uživatel, nutrition je statická tabulka po tieru a enchantu.
- **Ověřeno ze hry (zadavatel, 1 craft):** nutrition se každým krokem tier/enchant zdvojnásobí. Vzorec pro T3 a výš:
  `nu(tier, e) = 0,9 · 2^(tier − 3 + e)`, tedy `T3 = 0,9`, `T4.0 = 1,8`, `T4.1 = T5.0 = 3,6` atd. (tier a enchant se zaměňují: stejný „krok" = stejná nutrition). **T2 nemá poplatek** (`nu = 0`).
- Platí stejně pro Wood, Stone i ostatní linie (Stone ověřen na T3, T4.0–T4.4, T5.4–T8.4). Rozdíl mezi linkami je jen v `fee100` zadaném uživatelem (Wood zadavatel měřil při 315, Stone při 970).
- Implementace: `data/nutrition.ts` s funkcí `nutrition(tier, enchant)`; hodnota `F = nu · fee100 / 100` se v engine nezaokrouhluje, v UI se zobrazuje zaokrouhleně (hra poplatek ukazuje jako celé číslo).

| Krok `tier−3+e` | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| `nu` | 0,9 | 1,8 | 3,6 | 7,2 | 14,4 | 28,8 | 57,6 | 115,2 | 230,4 | 460,8 |
| Příklad (T…) | T3.0 | T4.0 | T4.1, T5.0 | T4.2, T5.1, T6.0 | T4.3, T5.2, T6.1, T7.0 | T4.4, T5.3, T6.2, T7.1, T8.0 | T5.4, T6.3, T7.2, T8.1 | T6.4, T7.3, T8.2 | T7.4, T8.3 | T8.4 |

**Testovací vektory (poplatek na 1 craft ze hry, hra zobrazuje celé číslo → tolerance ±1):**
| Položka | fee100 | Očekávaný poplatek |
|---|---|---|
| Wood T2 | 315 | 0 |
| Wood T3.0 | 315 | 3 |
| Wood T4.0 / T4.1 / T4.2 / T4.3 / T4.4 | 315 | 6 / 11 / 23 / 45 / 91 |
| Wood T5.0 až T5.4 | 315 | 11 / 23 / 45 / 91 / 181 |
| Wood T6.0 až T6.4 | 315 | 23 / 45 / 91 / 181 / 363 |
| Wood T7.0 až T7.4 | 315 | 45 / 91 / 181 / 363 / 726 |
| Wood T8.0 až T8.4 | 315 | 91 / 181 / 363 / 726 / 1452 |
| Stone T3.0 | 970 | 9 |
| Stone T4.0 až T4.4 | 970 | 17 / 35 / 70 / 140 / 279 |
| Stone T5.4 / T6.4 / T7.4 / T8.4 | 970 | 559 / 1117 / 2235 / 4470 |

Pozn.: enchanty Stone `.1–.3` jsou v ověřovacích datech jen kvůli vzorci; v MVP se Stone počítá jen `.0` (viz sekce 2).

## 5. Výpočetní model (čisté funkce)
Označení: `r` = počet raw na 1 craft, `ρ` = RRR (0–<1), `Pr` = cena raw, `Pp` = cena nižšího rafinátu, `Ps` = prodejní cena (= nejnižší sell order cílového města − 1), `fee100` = Fee per 100 nutrition zadané uživatelem, `nu` = nutrition spotřebovaná 1 craftem (sekce 4.6), `F = nu · fee100 / 100` = poplatek stanice na 1 craft (silver), `t` = daň, `s` = 0,025.

1. **Cena vstupu na 1 craft před vracením:** `u = r·Pr + Pp`, kde `Pr` je nejnižší `sell_price_min` suroviny ve zvoleném `Raw-buy city` a `Pp` nejnižší `sell_price_min` nižšího rafinátu v `Refined-buy city`. Obě města se vybírají **nezávisle** (výběr je separabilní, minimum přes 6 měst), takže počet kombinací zůstává malý; Wizard ukazuje nejlepší trasu a volitelně další nejlepší alternativy.
2. **Počet nákupních sad `N`**: `N = floor(budget / u)` (nebo zadáno ručně v kalkulačce). Pokud jsou města nákupu různá, jde o dvě oddělené nákupní položky. T2 nemá nižší rafinát (`Pp=0`).
3. **Počet craftů** (geometrická řada vracení): `C = N / (1 − ρ)`.
4. **Výstup**: `C` kusů (1 kus na craft). UI zobrazuje očekávanou hodnotu na 1 desetinné místo a „guaranteed ≈ floor".
5. **Tržba**: `R = C · Ps · (1 − t − s)`.
6. **Náklady**: nákup `B = N · u`; stanice `S = C · F`; vložené celkem `I = B + S`.
7. **Net Profit** `= R − B − S`.
8. **ROI %** `= NetProfit / I · 100`.
9. **Focus** (jen režim s Focussem): `ρ = ρ_focus`, spotřeba na craft `f` (sekce 6), celkem `FT = C · f`.
10. **SPF** `= NetProfit / FT`.
11. **Bod zvratu**: prodejní cena `Ps_be`, při níž `NetProfit = 0` → `Ps_be = (B + S) / (C · (1 − t − s))`.
12. **Omezení Focusem (Wizard)**: `C_max = floor(FocusPool / f)`; skutečné `N` = `min(rozpočet, C_max·(1−ρ))`.
13. **Marginal SPF**: `(NetProfit_focus − NetProfit_bezFocusu) / FT`, kde oba zisky se počítají pro stejné `N` a stejné ceny, jen s `ρ_focus` vs `ρ_base`. Říká, kolik silveru navíc přinese 1 utracený Focus oproti rafinaci bez Focusu.

### Syntetický příklad pro jednotkové testy
T4 planks, bonusové město, bez Focusu: `ρ=0,367`, `r=2`, `Pr=100`, `Pp=300` (→ `u=500`), `N=1000`, nejnižší sell order 900 → `Ps=899`, Premium (`t=0,04`, `s=0,025`), `F=20`.
- `C ≈ 1 579,78`, `R ≈ 1 327 907`, `B = 500 000`, `S ≈ 31 596`, `I ≈ 531 596`
- `NetProfit ≈ 796 311`, `ROI ≈ 149,8 %`

S Focussem (`ρ=0,539`, spec max → `f = 54/16 = 3,375`): `C ≈ 2 169,2`, `FT ≈ 7 321`.
Testy mají tolerovat zaokrouhlení; ceny jsou umělé, ne reálné tržní.

## 6. Focus a specializace
- **Vzorec (z wiki):** `f = base(tier, enchant, typ) · 0.5^(E / 10000)`, kde `E` = součet Focus Cost Efficiency bodů ze všech relevantních uzlů Destiny Board. Každých 10 000 bodů = poloviční cena.
- **Strop:** po maxování všech relevantních uzlů je `E = 40 000` pro T4–T8 refining (→ 6,25 % základu).
- **Ověřeno z tooltipů ve hře (zadavatel):** každý tierový uzel rafinační větve (např. „T4 Adept Hide Tanner") dává za každý level **+30 Focus Cost Efficiency pro všechnu rafinaci dané suroviny** a **+250 pro rafinaci svého tieru**. Samostatný Mastery uzel se nepředpokládá.
- **Model:** pro rafinaci tieru `T` (T ≥ 4) a levely uzlů `L_k` (0–100) pro `k ∈ {T4…T8}`:
  `E(T) = 250 · L_T + 30 · Σ L_k` (součet přes všechny uzly větve včetně vlastního).
  Kontrola: všechny levely 100 → `E = 25 000 + 15 000 = 40 000` (strop z wiki). Jen vlastní tier na 100, ostatní 0 → `E = 28 000`.
- **Vstupy uživatele:** level každého tierového uzlu (T4–T8) po surovině, 0–100. Globální preset 0 / 50 / 100 nastaví všechny uzly najednou. Ruční přepis výsledné spotřeby `f` zůstává.
- **Globální preset** 0 / 50 / 100 plus detailní nastavení po surovině a tieru a ruční přepis výsledné spotřeby `f`.
- **Kontrolní měření ze hry (potvrzeno):** Hide T4.0 (leather), `L_T4 = 7`, `L_T5 = 1`, ostatní 0 → `E = 250·7 + 30·8 = 1 990` → `f = 54 · 0,5^0,199 ≈ 47,04`; stanice ukazuje **47**. Slouží jako testovací vektor (tolerance ±1, hra zobrazuje celé číslo).
- **T2 a T3:** rafinační uzly specializace pro T2 a T3 **neexistují**. Základní spotřeba Focusu T2 (18) a T3 (31) se tedy snižuje jen příspěvkem `30 · Σ L_k` z uzlů T4–T8 (tj. `L_T = 0`). Tato část není měřením ověřená (efekt je při reálných levelech malý, např. při `ΣL = 8` vychází 30,5 vs. základ 31); wiki tabulka max-level nákladů pro T2/T3 je nekonzistentní a nepoužívá se.
- Funkce `focusEfficiency(levels, tier)` v `engine/focusEfficiency.ts` je výměnná a pokrytá testy: strop 40 000 při všech uzlech na 100, `E = 28 000` při jen vlastním tieru na 100 a poloviční cena při `E = 10 000`.

## 7. UI
Tmavý vzhled, desktop-first, responzivní. Nastavení (server, Premium, preset spec, filtry) se pamatuje v `localStorage`.

### 7.1 Globální lišta
Přepínač serveru (Europe / Americas / Asia), Premium toggle, režim Bez Focusu / S Focussem, indikátor stavu dat (načítání, stáří, offline mock).

### 7.2 Wizard (hledání příležitostí)
- **Filtry:** server, rozpočet (výchozí 1 000 000), režim Focus, preset spec, typ suroviny (načte data jen pro něj), min. ROI %, max. stáří dat, Available Focus (jen s Focussem), třídění: ROI % / SPF / Net Profit.
- **Řádek výsledku:** surovina + tier + enchant, trasa `Raw-buy → Refined-buy → Refine → Sell` (shodná města se slučují, např. „Buy raw: Martlock, Buy leather: Thetford"), Net Profit, ROI %, SPF, marginal SPF (jen s Focussem), stáří nejstarší použité ceny (barevný odznak podle prahů).
- **Rozbalená karta (akční plán):** 1) co a kolik koupit a ve kterém městě (raw a rafinát zvlášť), 2) kde rafinovat a očekávaný počet kusů, 3) kde a za kolik prodat (sell order = nejnižší − 1), 4) zisk, ROI, SPF, marginal SPF.
- Města: nákup raw a nákup rafinátu ve všech 6 městech (nezávisle), rafinace v bonusovém městě, prodej ve všech 6 městech (kromě Caerleonu). Stejné město je povolené.
- **Varování před tenkými trhy** (API zná jen nejnižší cenu, ne objem): řádek dostane značku ⚠ a rozbalený plán seznam důvodů. Kritéria (`engine/warnings.ts`): (a) cena existuje jen v jednom městě, (b) nejlevnější vstup je o více než 25 % levnější než další město, (c) nejlepší prodejní cena je o více než 30 % vyšší než další město, (d) ROI nad 100 %. Filtr „Hide results with thin-market warnings" (výchozí vypnuto) takové řádky skryje. Je to heuristika, ne záruka.
- Stavy: prázdné, načítání (skeleton), throttle (odpočet), chyba + mock banner, žádné výsledky podle filtrů.

### 7.3 Kalkulačka (Live Price Override)
- Otevře se kliknutím na výsledek nebo ručním výběrem receptu (surovina, tier, enchant, města).
- Předvyplněno z API; každé pole ukazuje, zda je z API (se stářím) nebo ručně přepsané, s tlačítkem „reset to API".
- Přepsatelné: cena raw, cena nižšího rafinátu, Fee per 100 nutrition (nebo přímo poplatek na craft v silveru), `sellPrice`, RRR %, spec úrovně, spotřeba Focusu `f`, počet nákupních sad.
- Výstup v reálném čase (na klientu, bez čekání): počet kusů, náklady, tržba, Net Profit, ROI %, SPF, bod zvratu.

## 8. Technické požadavky
- Stack: React + TypeScript + Vite + Tailwind CSS, testy Vitest.
- Struktura modulů: `data/` (statické konstanty a recepty), `engine/` (čisté funkce, bez Reactu), `api/` (klient: dávkování, throttling, cache, přepínání serveru, mock fallback), `ui/` (komponenty), `state/`.
- Engine je plně pokrytý jednotkovými testy (příklad v sekci 5, hraniční případy: `ρ=0`, nulové ceny, `N=0`, Focus pool nižší než jedna rafinace).
- API klient: fronta požadavků s limitem pod 180/min, detekce odpovědi „Throttled", exponenciální čekání do resetu, `AbortController` při změně serveru / typu.
- Ceny `0` z API znamenají „bez dat" → kombinace se vynechá a nikdy se nepočítá s nulou.

## 9. Akceptační kritéria MVP
1. Přepnutí serveru načte nová data z odpovídajícího hostu a obnoví výsledky.
2. Žádný výsledek, trasa ani dotaz neobsahuje Caerleon.
3. Wizard seřadí výsledky podle ROI / SPF / Net Profit a respektuje rozpočet, min. ROI, max. stáří a Focus pool.
4. Ruční přepis kterékoli hodnoty v kalkulačce přepočítá všechny výstupy bez dotazu na API.
5. Při výpadku API aplikace zobrazí mock data s varováním, nespadne.
6. Testy enginu projdou na syntetickém příkladu ze sekce 5.

## 10. Rizika
- Řídká nebo zastaralá tržní data u vzácných kombinací (high tier .3/.4) → filtr stáří a odznak.
- Throttling API při rychlém přepínání typů → fronta + cache + zrušení nedokončených dotazů.
- Model Focus efficiency je ověřen na jednom měření (T4 leather) a stropu 40 000; u vyšších tierů a enchantů je vhodné doplnit další testovací vektory z hry.

## 11. Otevřené body (uzavřít před plan.md)
1. ~~Focus efficiency~~ → uzavřeno: model `E = 250·L_T + 30·ΣL_k` ověřen z tooltipů, ze stropu 40 000 i kontrolním měřením (T4 leather → 47). T2/T3 nemají vlastní uzly (`L_T = 0`). Ruční přepis `f` v kalkulačce zůstává vždy dostupný. Případný další testovací vektor (např. T3 nebo vyšší tier) lze kdykoli doplnit.
2. ~~Nutrition na 1 craft~~ → uzavřeno: ověřený vzorec `0,9 · 2^(tier − 3 + e)`, T2 bez poplatku (sekce 4.6).
3. ~~Enchantovaný Stone~~ → uzavřeno: v MVP jen `.0`. Poznámka pro po MVP: wiki uvádí, že `.1–.3` raw stone dává 2×/4×/8× více bloků.
4. ~~Města nákupu~~ → uzavřeno: raw a nižší rafinát nezávisle z libovolných měst.
5. ~~Marginal SPF~~ → uzavřeno: přidáno.

## 12. Gatherer (třetí pohled, přidáno po MVP)

### 12.1 Cíl
Hráč zadá, kolik surovin jedné linie nasbíral (po tieru a enchantu). Gatherer spočítá, kolik nižších tierů mu **chybí**, aby mohl přerafinovat téměř všechno v bonusovém městě dané suroviny, a kde prodat to, co zbude. Neřeší zisk ani náklady.

### 12.2 Rozhodnutí (uzavřeno)
| Téma | Rozhodnutí |
|---|---|
| Zásoby | Hlavní tabulka **raw** po tierech a enchantech. Druhá volitelná tabulka: **už rafinované kusy** v inventáři (kryjí chybějící nižší tier). |
| Chybějící kusy | Vyjadřují se jako **raw k dotěžení** po tierech (např. „Chybí 200 T2 a 30 T3 raw"), které se pak rafinují. Žádný nákup hotového rafinátu a žádné ceny dokoupení. |
| Rozsah výstupu | Jen **množství a místo prodeje**. Žádný zisk, ROI ani porovnání raw vs. rafinace. U místa prodeje se ukáže cena za kus, protože podle ní se město vybírá. |
| Focus | Podle přepínače v horní liště: s Focussem `ρ = 53,9 %` a spotřeba podle spec levelů, bez Focusu `ρ = 36,7 %`. Navíc se ukáže **celkový Focus** potřebný pro celou dávku vs. Available Focus. |
| Poplatky | Neřeší se (bez nákladů). |
| Stone | Jen `.0` (jako v MVP). |
| Rafinace | Vždy v bonusovém městě dané suroviny; Gatherer nehledá nejlevnější suroviny ani trasy. |

### 12.3 Vstupy
- Surovina (Wood / Ore / Hide / Fiber / Stone).
- `raw[T][e]`: počet raw pro T2 až T8, enchanty `.0–.4` (T2, T3 a Stone jen `.0`).
- `stock[T][e]`: počet už rafinovaných kusů (volitelné, výchozí 0).
- Ceny pro výběr místa prodeje: `sell_price_min` ze všech 6 měst pro zvolenou surovinu (stejný zdroj a cache jako Wizard).
- Hodnoty se pamatují po surovině (`localStorage`).
- **Stacky:** u každé položky (raw i rafinát) se zadává **počet stacků po 999 kusech** a **počet kusů navíc**; celkem = `stacky · 999 + kusy`. Příklad: 3 stacky + 45 kusů = **3 042**. UI ukáže spočítaný součet vedle polí. Obě pole jsou nezáporná celá čísla (desetinná čísla se zaokrouhlí dolů).
- **Nic se nedokupuje:** chybějící materiál se vždy dotěží (výstup „Chybí … raw k dotěžení"), Gatherer nikdy nepočítá s nákupem.

### 12.4 Model výpočtu (čistá funkce)
Označení: `ρ` = RRR, `q(T)` = počet raw na craft (tabulka 4.2), `N(T,e)` = počet nákupních sad = `floor(raw[T][e] / q(T))`, tedy kolik craftů se zaplatí z vlastního raw; `C(T,e) = N / (1 − ρ)` = očekávaný počet vyrobených kusů (vracení materiálu viz sekce 5).

Řetězení podle receptů (4.2): rafinát `T(e)` se spotřebuje v `T+1` stejného enchantu; výjimka: **T3.0 rafinát spotřebuje T4 každého enchantu** (T4.0 až T4.4 používají T3.0). T2 rafinát spotřebuje jen T3.

Počítá se **od nejvyššího tieru dolů** (T8 → T2):
1. `D(T,e)` = poptávka po rafinátu `(T,e)` = součet sad (vlastních plus dotěžených, viz bod 3) všech receptů, které ho spotřebují (T+1 stejného enchantu; u T3.0 součet přes T4.0–T4.4).
2. `S(T,e) = C(T,e) + stock[T][e]` = nabídka.
3. **Sady jsou celá čísla** (craft nejde zahájit s méně než `q(T)` raw). Potřebný počet sad je `R = ceil((D − stock) · (1 − ρ))` (0, pokud `D ≤ stock`); celkem `N_celkem = max(R, N)`. **Raw navíc** = `N_celkem · q(T) − raw` (využije i zbytek raw pod `q`). Sady `N_celkem` tvoří poptávku po rafinátu nižšího tieru (pokračuje se níže). Zadáním přesně hlášeného „Chybí“ tak už nic nechybí (test pevného bodu).
4. Pokud `S ≥ D`: **přebytek** `S − D` (zaokrouhleno dolů) se prodává.
5. `remainder(T,e) = raw mod q(T)`: raw, které nestačí na celý craft.
   - Pokud položku **nic dalšího nespotřebovává** (`D = 0`, tj. je to nejvyšší tier s raw v dané enchant větvi), **vždy se dorafinuje celá**: doplní se `q − remainder` raw (`topUpRaw`, započítá se do „Chybí“) a vznikne celý set. Ten přes `D` stáhne do plánu nižší tiery. Příklad: 5 raw T8 Wood → 1 craft T8 potřebuje 1 rafinovaný T7, ten 5 raw T7 a rafinovaný T6 atd.; chybí 1 × T2, 2 × T3, 2 × T4, 3 × T5, 4 × T6, 5 × T7 (jeden celý craft na každém tieru).
   - Pokud položku spotřebovává vyšší tier (`D > 0`), zbytek `remainder` zůstane nepoužitý (`unusedRaw`).
6. Focus (jen v Focus režimu): `Focus_celkem = Σ (počet craftů) · f(T,e)`, kde počet craftů = `(N + Nx) / (1 − ρ)` a `f` podle sekce 6.

Prodej: pro každý rafinát s přebytkem se vybere město s nejvyšší cenou (`sell_price_min` minus 1; shodně s Wizardem), s alternativami (top 3) a stářím ceny. Položka bez ceny v žádném městě se označí „no price data".

### 12.5 UI
- Nová záložka **Gatherer** vedle Wizardu a Kalkulačky (tmavé téma, stejný DataBanner, stejný server a Premium z horní lišty).
- Panel zásob: mřížka tier × enchant s číselnými poli (raw), pod ní sbalitelná mřížka rafinovaných zásob.
- Řádky **enchantů `.1–.4` u T4–T8 jsou ve výchozím stavu sbalené** pod řádkem `.0` (tlačítko ▸/▾ u názvu tieru, po jednom tieru). Tier, ve kterém je zadané jakékoli množství (raw nebo rafinát), zůstane rozbalený a zamčený, aby žádná zadaná hodnota nezůstala skrytá. T2, T3 a Stone (bez enchantů) se nesbalují.
- Souhrn nahoře: **„Chybí: 200 × T2, 30 × T3"** (raw k dotěžení po tierech) nebo „Máte dost materiálu"; počet nepoužitých raw; celkový Focus vs. Available Focus (jen s Focussem).
- Tabulka rafinace po tierech (od T2): raw, sady, vyrobeno, spotřebuje další tier, přebytek, chybí. Pod nadpisem **poznámka, kam jet rafinovat**: bonusové město a stanice dané suroviny (např. „Refine everything in Martlock (Tanner)").
- V Focus režimu pole **Available Focus** přímo v Gathereru (sdílená hodnota s Wizardem, výchozí 10 000); souhrn varuje, když celkový potřebný Focus pool převyšuje.
- Tabulka prodeje: položka, množství, město, cena za kus, stáří ceny, alternativy.

### 12.7 Váha a převoz (Transport)
Cíl: ověřit, že se materiál vejde na převoz podle nosnosti, kterou hráč nastaví.

**Vstupy (panel Transport nahoře v Gathereru, pamatují se):**
- **Ox:** žádný, nebo tier T3–T8; kvalita Normal / Good / Outstanding / Excellent / Masterpiece (výchozí Normal).
- **Bag:** žádný, nebo tier T2–T8; enchant `.0–.4` (od T4, T2/T3 jen `.0`); kvalita (výchozí Normal).
- **Base capacity (kg):** nosnost postavy bez bagu a oxe (výchozí **50 kg**, ověřeno hráčem ve hře; lze změnit).
- **Zaškrtávátko Backpack místo cape:** backpack dané suroviny (Wood Lumberjack, Ore Miner, Hide Skinner, Fiber Harvester, Stone Quarrier) a jeho tier T4–T8.
- Jinou výbavu než ox, bag a backpack se nepočítá.

**Data (wiki.albiononline.com a albiondatabase.com, ověřeno 2026-11-21; hodnoty jsou v `data/carry.ts`):**
- Nosnost oxe (kg, Normal / Good / Outstanding / Excellent / Masterpiece): T3 1503/1591/1682/1776/1978, T4 1655/1744/1837/1934/2139, T5 1901/1998/2099/2204/2426, T6 2237/2346/2459/2577/2828, T7 2667/2792/2923/3058/3347, T8 3200/3347/3499/3657/3993. Váha oxe: 15,8 / 23,6 / 35,4 / 53,2 / 79,7 / 119,6 kg (T3–T8).
- Nosnost bagu: tabulka tier × enchant × kvalita (T2.0 43 až T8.4 469 Normal, 577 Masterpiece); váha bagu T2–T8: 1,5 / 2,3 / 3,4 / 5,1 / 7,6 / 11,4 / 17,1 kg.
- Backpack: schopnost „Carrier" snižuje váhu **o 30 %** u surovin dané linie stejného nebo nižšího tieru, než je backpack (podle upřesnění hráče i u rafinátu). Váha backpacku T4–T8: 1,7 / 2,5 / 3,8 / 5,7 / 8,5 kg. Wiki uvádí T4 jen pro Hide a Fiber; aplikace nabízí T4–T8 pro všechny.
- Váha jednoho kusu (raw i rafinát, bez ohledu na enchant a linii): T2 0,23, T3 0,34, T4 0,51, T5 0,76, T6 1,14, T7 1,71, T8 2,56 kg.

**Výpočet:**
- Hrubá nosnost = `base + bag + ox`. Váha výbavy = `bag + backpack + ox` (hráč: „jinou výbavu než ox, bag a backpack nemám"). **Použitelná nosnost = hrubá − váha výbavy.**
- Váha kusu s backpackem: `w(T) · 0,7`, pokud `T ≤ tier backpacku`, jinak `w(T)`.
- **Cesta 1, do rafinace:** všechny raw, které máte, plus raw, které je ještě třeba dotěžit, a už rafinované zásoby (obojí se veze do města rafinace). Zobrazí se i váha jen toho, co už máte.
- **Cesta 2, k prodeji:** rafinát k prodeji (přebytek po rafinaci).
- Výsledek pro obě cesty: váha / použitelná nosnost, vejde se (s % zaplnění), nebo nevejde (o kolik kg a kolik cest je potřeba = `ceil(váha / použitelná nosnost)`).

**Předpoklad k ověření ve hře:** že se váha ox, bagu a backpacku počítá do zátěže (jinak je výsledek konzervativní). Základní nosnost postavy 50 kg hráč potvrdil.

### 12.6 Testovací příklady (ρ = 0,367, bez Focusu)
- **Dost materiálu:** raw T2 = 1000, T3 = 500, T4.0 = 50 → `N`: T2 1000, T3 250, T4.0 25; `C`: T2 ≈ 1579,8, T3 ≈ 394,9, T4.0 ≈ 39,5. Poptávka T2 = 250, T3 = 25 → nic nechybí, přebytek T2 ≈ 1329, T3 ≈ 369, T4.0 ≈ 39.
- **Chybí T2:** raw T2 = 100, T3 = 500 → nabídka T2 ≈ 157,98 < poptávka 250 → `M ≈ 92,02` → `Nx ≈ 58,25` → **chybí 59 raw T2**.
- **Sdílený T3.0:** T4.0 = 40 a T4.1 = 40 (`N` = 20 + 20) potřebují dohromady 40 rafinátu T3.0.
- **Chybí více tierů:** T5.0 = 30 (`N` = 10) při nulových zásobách T4.0 a T3 → chybí T4.0 rafinát 10 → raw T4.0 ≈ `ceil(10 · 0,633 · 2)` = 13 a navazující poptávka po T3.
