# Post-MVP backlog

Nápady a okrajové případy mimo MVP. Do hlavního plánu se přesouvají jen po schválení.

## Herní logika
- Enchantovaný **Stone** `.1–.3` (2×/4×/8× více bloků a nižších bloků, viz wiki Refining).
- Rafinace i v **nebonusových městech** (RRR 15,3 % / 43,5 %).
- Ověřit, zda má **Brecilien** nějaký rafinační bonus nebo stanice.
- Denní produkční bonus, hideouty a ostrovy (jiné RRR).
- Nutrition pro Ore/Hide/Fiber ověřit měřením (zatím předpoklad, že vzorec platí pro všechny linie).
- Další testovací vektory Focus efficiency a poplatků pro vyšší tiery a enchanty.

## Obchod a data
- Přepínač **buy order / instant sell** a odpovídající poplatky.
- **Hloubka trhu** a množství v objednávkách (API v2 vrací jen nejnižší cenu).
- Historie cen a grafy, průměry místo okamžitých cen.
- Cestovní náklady a čas, rizika tras; Caerleon a Black Market.
- Volitelný backend (proxy + sdílená cache), pokud se objeví problémy s throttlingem.

## Nápady z vývoje MVP
- Přesnější detekce tenkých trhů (hotová je jen heuristika podle cen): použít objem z endpointu historie cen.
- Automatický opakovaný pokus po throttlingu (čekání do `resetAt`) a odpočet v banneru.
- Sbalitelný panel filtrů na mobilu a kartové zobrazení výsledků místo tabulky.
- Zobrazit i nákup za buy order a porovnat, nebo kombinace s cenou za dopravu mezi městy.
- Test s Playwrightem proti mock API pro celé průchody Wizard → Calculator.

## Gatherer
- Cena dokoupení chybějících kusů, odhad zisku a tip, kdy se víc vyplatí raw rovnou prodat (hráč chtěl zatím jen množství a místo prodeje).
- Chybějící nižší tier jako nákup hotového rafinátu nebo srovnání s dotěžením (zatím jen dotěžení).
- Enchantovaný Stone ve Gathereru (stejná omezení jako v kalkulačce).
- Rozdělení prodeje do více měst podle hloubky trhu.
- Rozdělení sdíleného T3.0 rafinátu podle priorit mezi T4 enchanty (zatím se sčítá celková poptávka).
- Váha a převoz je hotová (spec 12.7). Zbývá: ověřit ve hře předpoklady (váha oxe, bagu a backpacku se počítá do zátěže), další mounty než Transport Ox, doporučení, co vzít na první cestu, když se vše nevejde, a ověřit dostupnost T4 backpacku u Wood, Ore a Stone (wiki uvádí od T5).

## UI
- Filtr tierů a enchantů ve Wizardu (chips), uložené presety filtrů.
- Dvojjazyčné UI (EN + CS), i18n vrstva.
- Export výsledků (CSV), sdílení odkazu na nastavení kalkulačky.
- Upozornění na zastaralá data přímo v akčním plánu.
