# Sestavení a vydání

Požadavky: Node 22, Claude Code nainstalovaný na cílovém stroji (aplikace používá jeho přihlášení a pluginy).

## Sestavení

| Cíl | Příkaz | Výstup v `dist/` |
| --- | --- | --- |
| macOS (Apple Silicon) | `npm run dist:mac` | `uu5Mock-Studio-<ver>-arm64.dmg` + `.zip` |
| macOS (Intel) | `npm run dist:mac:x64` | `…-x64.dmg` + `.zip` |
| Windows x64 | `npm run dist:win` | `…-x64.exe` (NSIS) |
| Linux x64 | `npm run dist:linux` | `…-x86_64.AppImage` |
| Jen rozbalená app (rychlé ověření) | `npm run pack` | `dist/<platforma>-unpacked` |

Bez podpisových údajů přidej `CSC_IDENTITY_AUTO_DISCOVERY=false`; výsledek je nepodepsaný.
Ikona se generuje z `build/icon.svg` příkazem `npm run icon`.

Z balíčku se záměrně vyřazují nativní binárky `@anthropic-ai/claude-agent-sdk-*` (~240 MB na platformu):
aplikace spouští vlastní Claude Code uživatele (`pathToClaudeCodeExecutable`).

## Podpis a notarizace (macOS)

Nepodepsanou (nenotarizovanou) aplikaci Gatekeeper zablokuje. Postup pro uživatele je jednorázově po přetažení do Aplikací spustit `xattr -dr com.apple.quarantine "/Applications/uu5Mock Studio.app"` (je uvedený v poznámkách k vydání). Aktualizace z aplikace už tento krok nepotřebují. Pro distribuci bez toho:

    CSC_LINK=<Developer ID .p12> CSC_KEY_PASSWORD=… \
    APPLE_ID=… APPLE_APP_SPECIFIC_PASSWORD=… APPLE_TEAM_ID=… npm run dist:mac

`APPLE_TEAM_ID` zapíná notarizaci (`electron-builder.config.cjs`). Entitlements jsou v `build/entitlements.mac.plist`.
Windows podpis: `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD`.

## Kontrola aktualizací proti GitHubu

*Check for Updates…* (menu aplikace / Help) a kontrola na pozadí (po startu, nejvýš jednou za 6 hodin, jen v zabalené aplikaci) se ptají na nejnovější **release na GitHubu** (`UnicornUniversity/uun_uu5mockstudio`, jiné repo přes `STUDIO_UPDATE_REPO`). Když je novější než běžící verze, nad chatem se objeví pruh *Version X available* s tlačítky **Download** (instalátor pro tento systém se otevře v prohlížeči), **Notes** (stránka release) a **Later** (odloží tuto verzi; ruční kontrola ji ukáže znovu). Nepotřebuje podpis ani soubory `latest*.yml`; instalace je ruční, protože nepodepsaná aplikace se na macOS sama aktualizovat nemůže. Otevírají se jen stránky a soubory repozitáře na github.com.

**Instalace aktualizace sama (macOS, nepodepsaná sestava):** v zabalené aplikaci na macOS, která leží ve složce zapisovatelné pro uživatele, tlačítko **Download** aplikaci aktualizuje samo. Stáhne `.zip` release (velikost a SHA-256 z GitHubu se kontrolují), rozbalí ho vedle aplikace, zkontroluje identifikátor, verzi a podpis, aplikace se ukončí a malý skript (`src/main/selfUpdate.mjs`) balíček vymění a spustí novou verzi (při chybě zůstane stará). Soubor stažený aplikací nemá příznak karantény, takže Gatekeeper nic neřeší. Jinde (Windows, Linux, složka bez práv zápisu) tlačítko otevře instalátor v prohlížeči. První verze s touto funkcí se musí nainstalovat ručně z DMG. Zkouška: `STUDIO_UPDATE_API` a `STUDIO_UPDATE_DOWNLOADS` míří na lokální server, `RELAUNCH` na skript místo `open`.

Sestavení s feedem (níže) nadále používá `electron-updater`. Pro zkoušku proti jinému API existuje `STUDIO_UPDATE_API`.

## Automatické aktualizace (feed, vyžaduje podpis na macOS)

Aktualizace jsou zapnuté jen v sestavě, která zná adresu feedu:

    UU5STUDIO_UPDATE_URL=https://example.com/uu5mock/ npm run dist:mac

Builder pak přibalí `app-update.yml` a vygeneruje `latest-mac.yml` / `latest.yml`. Na uvedenou URL nahraj celý obsah `dist/`
(instalátory, `.zip`, `.blockmap`, `latest*.yml`). Aplikace kontroluje 10 s po startu a v menu Help › Check for Updates….
Bez této proměnné menu hlásí, že aktualizace nejsou nastavené.

macOS aktualizuje ze `.zip` a vyžaduje **podepsanou** aplikaci; u nepodepsané sestavy aktualizace selže.

## Publikace na GitHub

Skript `scripts/publish-github.mjs` zveřejní aktuální verzi na veřejném GitHubu (`UnicornUniversity/uun_uu5mockstudio`): **jeden nový commit se zdrojáky** nad naposledy zveřejněným snímkem (nikdy vývojová historie) a **GitHub release** s instalátory z `dist/`. Zdrojový archiv release vzniká ze značky, kterou release vytvoří. Snímek je strom aktuálního commitu: `LICENSE`, `NOTICE` a `README.md` leží v kořeni repozitáře vedle složky aplikace, takže GitHub pozná licenci a zobrazí README (skript hlásí, když v kořeni chybí).

Postup:

1. Zvyš verzi v `package.json` (`npm version <verze> --no-git-tag-version`), napiš poznámky do `docs/release-notes/<verze>.md`, vše commitni.
2. Sestav instalátory (`npm run dist:mac` ...).
3. Jednou přihlas `gh` (`brew install gh`, `gh auth login`) a nastav autora veřejného commitu pro tento klon: `git config uu5studio.githubAuthor "Jméno <e-mail>"` (jinak se vezme `user.name` / `user.email`; **e-mail bude veřejný**).
4. Suchý běh (jen kontroly a výpis): `node scripts/publish-github.mjs`
5. Publikace: `node scripts/publish-github.mjs --yes`

Skript odmítne publikovat při neuložených změnách, bez instalátorů dané verze, při už existujícím release se stejnou značkou nebo když se zdrojáky neliší od posledního snímku. Volby: `--author`, `--notes`, `--remote`. S `--no-release` se zveřejní jen snímek zdrojů (například oprava README), bez release a bez instalátorů.

## Umístění dat

- Projekty: `~/Documents/uu5Mock Studio/<projekt>/` (dev: `./projects/<projekt>/`, přepsat lze `STUDIO_PROJECTS_DIR`). Projekt je složka a každá obrazovka je přímo `.html` soubor v ní (beze změny, žádná podsložka); skrytá `.studio/` drží chat, session a rozložení plátna. Starší `mockups/` podsložky se při startu automaticky vyplošťují; starý jediný projekt se při prvním startu přesune do „Výchozí projekt“.
- CDN cache: adresář uživatelských dat aplikace (`cdn-cache/`).
- Vlastní cesta ke Claude Code: `STUDIO_CLAUDE_BIN=/cesta/k/claude`.

## Stav ověření

Ověřeno na macOS arm64: sestavení, spuštění zabalené app, detekce Claude Code, vykreslení mockupu, volání agenta.
Windows a Linux se sestavují, ale nebyly spuštěny; detekce `claude.exe` / `.cmd` je zatím jen pokryta unit testy.
