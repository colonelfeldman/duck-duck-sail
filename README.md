# Duck, Duck, Sail!

A cruise-themed creature-collecting game: catch ducks with a flick-thrown life ring over your camera feed, reel them in, then power them up and promote them. Part of the All Ashore family. It's a plain static PWA with no build step and no framework.

- **Live:** https://colonelfeldman.github.io/duck-duck-sail/ (also linked from allashore.app/games)
- **Testing mode:** add `?test=1` to the URL. That gives 20-second encounters, 60-second sign cooldowns, simulate-scan buttons and a TESTING badge. It's remembered on that device; `?test=0` turns it off.
- **Look-around mode (testing builds only for now):** with the camera on, the duck holds a direction in the room (from the phone's gyroscope) and you turn the phone to find it. An arrow says "Turn left/right" when it's off screen. 🧭 on the catch screen turns it on or off per device; iPhone asks once for motion access. Without motion data it falls back to the plain overlay. Settings are in `CONFIG.lookAround`; set `enabled: true` to give it to everyone.
- **Spec/handoff:** kept locally in `docs/` (not published)

## Files
| Path | What it is |
|---|---|
| `index.html` | All screens and overlays |
| `css/app.css` | Styles and animations (layering: level-up banner z 90, sheets/overlays z 95) |
| `js/config.js` | `VERSION`, testing flag, **every tuning number**, families, sign database |
| `js/art.js` | Duck forms (full-body SVGs, gold variant), life rings |
| `js/store.js` | Save/load with versioned migrations, economy rules |
| `js/catch.js` | Catch screen: flick + spin throw, landing judge, ring-around-the-neck, rescue reel |
| `js/app.js` | Deck, Crew, Detail (power up / promote animations), Passport, Sign Cards, scanner, feedback, updates |
| `vendor/` | qrcode-generator 1.4.4 (draws sign QRs) and jsQR 1.4.0 (reads them; works on Safari). Served locally, no external QR service |
| `sw.js` | **Network-first** service worker, so testers get new deploys on reload and the cache is only used offline |
| `supabase/` | SQL for the game's tables in the All Ashore Supabase project |
| `tests/smoke.py` | Phone-size browser walkthrough of every QA gate it can automate |
| `tests/look.py` | Look-around mode with a fake camera and simulated phone turning |
| `tools/` | `bump-version.sh`, `make_icons.py` |

## Deploying a change
1. `./tools/bump-version.sh` (updates `js/config.js` and `version.json` together)
2. `python3 -m http.server 8765 --bind 127.0.0.1` then `python3 tests/smoke.py` and `python3 tests/look.py`
3. Commit and push `main`. GitHub Pages publishes in about a minute. Open copies show "New version available, tap to refresh".

## Save discipline
Saves live in `localStorage` under `dds_save` with a version number `v`. If you change the save shape, bump `SAVE_VERSION` in `js/store.js` and add a migration step. Never wipe a tester's crew. Before migrating, the old save is copied to `dds_save_backup_v<n>`.

## Data rules
The game reads All Ashore data and never writes to it. Game tables are prefixed `dds_`. `dds_feedback` accepts inserts only, with no public reads. The camera is processed on the device and nothing is uploaded. No precise locations are stored.

## Stack note
Plain HTML/CSS/JS on purpose, matching the scoring app and Coyote Watch. All Ashore itself uses React/Vite, but the game iterates separately and doesn't need a build step.
