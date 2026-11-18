# Duck, Duck, Sail!

A cruise-themed creature-collecting game: catch ducks with a flick-thrown life ring over your camera feed, reel them in, then power them up and promote them. Part of the All Ashore family. It's a plain static PWA with no build step and no framework.

- **Live:** https://colonelfeldman.github.io/duck-duck-sail/ (also linked from allashore.app/games)
- **Testing mode:** ON by default while `PLAYTEST = true` in `js/config.js` (set it false before a wider release). `?test=1` / `?test=0` force it per device. That gives encounters every 2 minutes, 60-second sign cooldowns, simulate-scan buttons and a TESTING badge. It's remembered on that device; `?test=0` turns it off.
- **Look-around mode (on for everyone):** with the camera on, the duck holds a direction in the room (from the phone's gyroscope) and you turn the phone to find it. An arrow says "Turn left/right" when it's off screen. 🧭 on the catch screen turns it on or off per device; iPhone asks once for motion access. Without motion data it falls back to the plain overlay. Settings are in `CONFIG.lookAround`.
- **Look for ducks (camera recognition):** on-device image classifier (Google MediaPipe, EfficientNet-Lite0, ImageNet labels) spots things around you and the matching duck line appears: stage/curtains → Showtime, food → Galley, sunscreen/towels → Pool, sea/shore → Explorer, sights → Tourist, ships → Crew (`RECOGNIZE_CATEGORIES`). Match strength sets the form (partial/strong/excellent → Form 1/2/3). Skips the encounter timer but has per-kind cooldowns and a daily cap (`CONFIG.recognize`). Swimwear and places of worship are deliberately excluded. First use downloads ~20 MB (engine + model), then it's cached for offline use.
- **Spec/handoff:** kept locally in `docs/` (not published)

## Files
| Path | What it is |
|---|---|
| `index.html` | All screens and overlays |
| `css/app.css` | Styles and animations (layering: level-up banner z 90, sheets/overlays z 95) |
| `js/config.js` | `VERSION`, testing flag, **every tuning number**, duck lines (`DUCK_LINES`), port ducks (`PORT_DUCKS`), where each line spawns, colour/accessory odds, sign database |
| `js/art.js` | All duck designs: 6 lines × 3 forms, port ducks (hand-drawn San Juan + generic flag-sash), rare colours, accessories, gold; life rings |
| `js/store.js` | Save/load with versioned migrations, economy rules |
| `js/catch.js` | Catch screen: flick + spin throw, landing judge, ring-around-the-neck, rescue reel |
| `js/app.js` | Deck, Crew, Detail (power up / promote animations), Passport, Sign Cards, scanner, feedback, updates |
| `vendor/mediapipe`, `vendor/models` | MediaPipe tasks-vision 1.2.2 (engine, ~14.6 MB wasm) and EfficientNet-Lite0 int8 classifier (5.4 MB), served locally |
| `vendor/` | qrcode-generator 1.4.4 (draws sign QRs) and jsQR 1.4.0 (reads them; works on Safari). Served locally, no external QR service |
| `sw.js` | **Network-first** service worker, so testers get new deploys on reload and the cache is only used offline |
| `supabase/` | SQL for the game's tables in the All Ashore Supabase project |
| `tests/smoke.py` | Phone-size browser walkthrough of every QA gate it can automate |
| `tests/recognize.py` | Look for ducks: logic with fake model output, real model loading, and (with `DDS_PHOTOS=<folder>`) real photos used as the camera |
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
