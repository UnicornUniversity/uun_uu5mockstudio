# uu5Mock Studio – scénář krátkého demo videa

Cíl: za **~3 minuty** ukázat, že z jedné věty vznikne živá uu5 obrazovka, že aplikace zná kontext projektu (git, pravidla, popisy) a že se výsledek dá ručně doladit a předat. Marketingový tón: krátké úderné titulky, žádný komentář, jedno běžící zadání agentovi.

Video je **tiché, anglicky** (titulky přes `--lang cs` česky). Natáčí ho skript `scripts/demo/record.mjs`, tento dokument je jeho osa v textu.

---

## 1. Časová osa

| Čas | Co se ukáže | Titulek (EN) |
|---|---|---|
| 0:00 | Prázdná aplikace | Design uu5 / uuGDS apps with AI |
| 0:03 | Nový projekt `Demo` | One folder per project. One HTML file per screen. |
| 0:08 | Klik na pruh nad plátnem, napíše se **popis projektu** | Give the project context |
| 0:16 | Projekty → **Link git repository…**, lišta s repem a větví, rozbalené větve | Link your git repository. Claude reads it, never writes. |
| 0:28 | Do chatu se **vloží screenshot (náčrt obrazovky)**, pak zadání jednou větou (včetně business pravidel a odkazu na repo), Claude pracuje (zrychleno) | Paste or drop a screenshot or a sketch into the request / Describe the screen in plain words / Claude builds it (sped up) |
| 0:55 | Hotová obrazovka, **Add room**: prázdný formulář ukáže validaci, pak se vyplní všechna pole a záznam se **přidá do tabulky**; potom se **smaže** (koš a potvrzení) | A live, interactive uu5 page / Validation first, then fill the form: the record appears in the table / Delete a record, with confirmation |
| 1:15 | Odznak s počtem pravidel na ikoně, **dialog pravidel**: úprava pravidla přímo v textu, přepnutí ikonou `</>` na Markdown a zpět | Business rules are captured as you talk / Edit in place, or switch to Markdown |
| 1:30 | Menu ⋯ obrazovky → **Description…** (popis se objeví pod obrazovkou) a **Add rule…** (pravidlo patří k obrazovce) | Describe any screen and add its rules |
| 1:50 | **Druhá obrazovka** zadaná přes `@` odkaz na první (druhý běh agenta, zrychleno), pak **Arrange screens** | More screens side by side: @ links to the first one / Arrange screens in one click |
| 2:15 | **Fullscreen** obrazovky, **poznámka** k obrazovce, po zavření zůstane na plátně vedle obrazovky | Try it fullscreen and pin a note to the screen / Notes stay with the screen, right on the canvas |
| 2:35 | **Inspektor**: tlačítko, změna `colorScheme` (obrazovka se hned přepíše), výběr ikony z katalogu uuGDS | Inspect real uu5 components, tweak props, pick icons / Change a prop: the screen rewrites itself / Icons straight from the uuGDS catalog |
| 3:00 | **Share ▾**: obrázek, HTML, celý projekt jako ZIP | Export or share a screen, or the whole project as ZIP |
| 3:05 | ⋯ → **Claude Code & plugins…**, přehled a **Check for plugin updates** | Plugins stay current: check any time, update on your terms |
| 3:15 | Závěr | uu5Mock Studio · Marek Beránek, Unicorn University |

Skutečný záznam je delší, protože čekání na agenta se zrychluje (výchozí 8×).

## 2. Příprava před natáčením

- [ ] Claude Code je nainstalovaný a **přihlášený**, pluginy `uu5-mockup`, `uugds`, `uu5-development` jsou nainstalované (průvodce se při startu neobjeví).
- [ ] Jsi **online**: uu5 stránky se načítají z CDN. Pro jistotu jednou `⋯` → *Warm up CDN cache*.
- [ ] Zavři ostatní aplikace a vypni notifikace (Nerušit); skript startuje vlastní okno s čistým profilem, **tvoje projekty ani nastavení se nedotknou**.
- [ ] Skript si sám vytvoří **demo git repozitář** (dvě větve) v dočasné složce; tvoje skutečné repozitáře nepoužívá.
- Okno se nahrává, nesahej při natáčení na myš ani klávesnici.

## 3. Natáčení

```bash
# zkouška bez Clauda a bez tokenů: místo generování se zkopíruje hotová obrazovka (.html) a odešle se nic
node scripts/demo/record.mjs --prepared ./hotove-obrazovky --out demo-output/rehearsal.mp4

# ostré natáčení: Claude opravdu vygeneruje obě obrazovky (DVA běhy agenta, minuty a tokeny)
node scripts/demo/record.mjs --out demo-output/uu5mock-demo.mp4
```

| Volba | Význam |
|---|---|
| `--out soubor.mp4` | kam uložit video (výchozí `demo-output/uu5mock-demo.mp4`) |
| `--lang en\|cs` | jazyk zadání a titulků (výchozí `en`) |
| `--prepared složka` | zkouška bez Clauda; první `.html` ve složce (podle abecedy) je první obrazovka, druhý druhá. Pravidla, která by jinak zapsal agent, skript zapíše sám |
| `--packaged "/cesta/uu5Mock Studio.app"` | natočit nainstalovanou aplikaci místo vývojové verze |
| `--speed 8` | kolikrát se zrychlí čekání na agenta |
| `--port 9460` | port pro ovládání (změň, když běží jiná instance) |
| `--keep-frames` | ponechat snímky v dočasné složce (ladění) |

Co je dobré vědět:
- **Ostrý běh stojí tokeny** (dva běhy agenta: první a druhá obrazovka) a trvá několik minut plus kódování MP4 v reálném čase. Nejdřív proto vždy zkouška přes `--prepared`.
- Zkouška bez vygenerované obrazovky s tlačítkem, které má `colorScheme` a ikonu, **přeskočí inspektor** (`! inspector skipped`). Ostrý běh si takové tlačítko vyžádá v zadání, nech tu větu v promptu.
- Zadání výslovně žádá obrazovku, kde formulář opravdu přidá řádek (běžná textová a číselná pole) a každý řádek má tlačítko s koškem a potvrzení. Skript vyplní všechna viditelná pole (text, číslo, první možnost nativního výběru) a vypíše `rows: 2 -> 3` a `rows after delete: 2`; vlastní rozbalovací seznamy uu5 přeskočí.
- Náčrt obrazovky si skript nakreslí sám a vloží ho do chatu událostí vložení (stejná cesta jako skutečné vložení ze schránky), takže se nepoužije nativní dialog. Agent ho otevře nástrojem Read.
- Pravidla zapisuje agent sám podle zadání. Když je nezapíše, skript je přidá ručně přes dialog, aby ukázka nebyla prázdná.
- Skript nikde neklikne na nativní okna (výběr složky, systémové sdílení, nativní menu): repozitář se napojí přes proměnnou `STUDIO_PICK_REPO`, sdílení se jen ukáže v menu.
- **Soukromí:** e-mail přihlášeného účtu se v okně pluginů zobrazí neutrálně (`you@university.example`).
- Když se některý krok nepovede, skript ho přeskočí a vypíše `! … skipped`; video se dokončí i tak.
- Hotové video je tiché. Hudbu přidej dodatečně (QuickTime, iMovie).

## 4. Kontrola před zveřejněním
- [ ] Žádné osobní údaje v ukázkových datech ani ve snímcích (e-mail účtu je zakrytý).
- [ ] Délka kolem 2,5 minuty, titulky jsou čitelné a nepřekrývají důležitou část obrazovky.
- [ ] Na konci autoři: Marek Beránek, Unicorn University.
