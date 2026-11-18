# Phone-sized browser walkthrough of the whole game. Needs a local server:
#   python3 -m http.server 8765 --bind 127.0.0.1     (from the repo root)
#   python3 tests/smoke.py
# Screenshots go to tests/out/. Exits non-zero on any failed check or page error.
import pathlib, sys, time
from playwright.sync_api import sync_playwright

import os
BASE = os.environ.get('DDS_BASE', 'http://127.0.0.1:8765/index.html')   # DDS_BASE=https://colonelfeldman.github.io/duck-duck-sail/ to test live
OUT = pathlib.Path(__file__).parent / 'out'
OUT.mkdir(exist_ok=True)
fails, errors = [], []

def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

def shot(pg, name): pg.screenshot(path=str(OUT / f'{name}.png'))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 412, 'height': 860}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    pg.goto(BASE + '?test=1')
    pg.wait_for_timeout(500)

    # ---- first run ----
    check(pg.is_visible('#safety'), 'safety reminder shows on first run')
    shot(pg, '01-safety')
    pg.click('#safety-ok')
    check(pg.is_visible('#howto'), 'How to Play follows the safety reminder')
    shot(pg, '02-howto')
    pg.click('#howto .x')
    shot(pg, '03-deck')
    check(pg.inner_text('#d-shells') == '300' and pg.inner_text('#d-treats') == '50', 'starter grant 300 Shells + 50 Treats')
    check('TESTING' in pg.inner_text('.foot') and pg.is_visible('.testbadge'), 'TESTING badge in footer')
    check(pg.inner_text('#ver') == pg.evaluate('"v" + VERSION'), 'version in footer')

    # ---- encounter + flick that misses (far left) ----
    pg.click('#d-encounter')
    pg.wait_for_timeout(700)
    check(pg.evaluate("document.body.dataset.screen") == 'catch', 'encounter opens catch screen')
    check(pg.is_visible('#sea'), 'sea backdrop when no camera')
    shot(pg, '04-catch-aim')
    r = pg.locator('#flyring').bounding_box()
    cx, cy = r['x'] + r['width'] / 2, r['y'] + r['height'] / 2
    # circle for spin then flick hard to the far left
    pg.mouse.move(cx, cy); pg.mouse.down()
    import math
    for i in range(40):
        a = i / 40 * 2 * math.pi * 1.5
        pg.mouse.move(cx + math.cos(a) * 40, cy + math.sin(a) * 40)
        pg.wait_for_timeout(8)
    spin = pg.evaluate('Catch.debug().spin')
    check(abs(spin) > 1.5, f'circling builds spin ({spin:.2f})')
    shot(pg, '05-spin')
    for i in range(6):
        pg.mouse.move(cx - 30 * i, cy - 40 * i); pg.wait_for_timeout(10)
    pg.mouse.up()
    pg.wait_for_timeout(300)
    check(pg.evaluate('Catch.debug().phase') == 'flight', 'flick launches the ring')
    pg.wait_for_timeout(600)
    shot(pg, '06-after-flick')
    ph = pg.evaluate('Catch.debug() && Catch.debug().phase')
    print('  phase after flick:', ph)

    # ---- land a throw: aim a perfect flick by teleporting the landing test via button throws ----
    def wait_aim():
        for _ in range(40):
            st = pg.evaluate('Catch.debug() && Catch.debug().phase')
            if st in ('aim', None, 'caught', 'fled'): return st
            pg.wait_for_timeout(100)
        return pg.evaluate('Catch.debug() && Catch.debug().phase')

    landed = False
    for attempt in range(12):
        st = wait_aim()
        if st != 'aim': break
        pg.evaluate("Catch.debug().duck.tx = 0; Catch.debug().duck.dx = 0; Catch.debug().duck.rate = 0.0001; Catch.debug().duck.nextWander = 1e9;")
        pg.evaluate("Math._r = Math.random; Math.random = () => 0.99")  # no dodge, tiny spread toward edge? use .99 => no dodge
        pg.click('#c-throw')
        pg.evaluate("Math.random = Math._r")
        pg.wait_for_timeout(900)
        if pg.evaluate("['settle','reel'].includes(Catch.debug().phase)"):
            landed = True; break
    check(landed, 'button throw can land on a still duck')
    pg.wait_for_timeout(400)
    shot(pg, '07-ring-on-neck')
    pg.wait_for_timeout(600)
    check(pg.evaluate("Catch.debug().phase") == 'reel', 'reel starts after ring settles')
    check(pg.is_visible('#c-reel'), 'reel meters visible')

    # hold, then ✕ mid-reel (§7.1/§7.5)
    rb = pg.locator('#c-reel-btn').bounding_box()
    pg.mouse.move(rb['x'] + 20, rb['y'] + 10); pg.mouse.down()
    pg.wait_for_timeout(700)
    p1 = pg.evaluate('Catch.debug().reel.p')
    shot(pg, '08-reeling')
    pg.mouse.up()
    check(p1 > 0.2, f'holding reels the duck in (progress {p1:.2f})')
    pg.click('#c-x')
    pg.wait_for_timeout(200)
    check(pg.evaluate("document.body.dataset.screen") == 'deck' and not pg.evaluate('Catch.active()'), '✕ mid-reel exits to Deck and cleans up')
    pg.wait_for_timeout(int(1000))
    check(pg.evaluate("document.body.dataset.screen") == 'deck', 'no stray timer navigates after exit')

    # ---- full catch with a scripted, rhythmic reel on a Common ----
    def force_encounter(form):
        pg.evaluate(f"Store._rw = Store.rollWild; Store.rollWild = () => ({{species:'duck', form:{form}, level:5, size:'M', gold:false}})")
        pg.evaluate("Store.get().nextEncounterAt = 0; Store.get().encounterLog = []; App.startTimedEncounter()")
        pg.evaluate("Store.rollWild = Store._rw")
        pg.wait_for_timeout(700)

    def land():
        for _ in range(12):
            if wait_aim() != 'aim': return False
            pg.evaluate("const d=Catch.debug().duck; d.tx=0; d.dx=0; d.rate=0.0001; d.nextWander=1e9;")
            pg.evaluate("Math._r = Math.random; Math.random = () => 0.99")
            pg.click('#c-throw')
            pg.evaluate("Math.random = Math._r")
            pg.wait_for_timeout(900)
            if pg.evaluate("['settle','reel'].includes(Catch.debug().phase)"):
                pg.wait_for_timeout(1000); return True
        return False

    def smart_reel(max_s=15):
        t0 = time.time()
        while time.time() - t0 < max_s:
            E = pg.evaluate("Catch.debug() && {ph: Catch.debug().phase, st: Catch.debug().reel && Catch.debug().reel.state, tau: Catch.debug().reel && Catch.debug().reel.tau}")
            if not E or E['ph'] != 'reel': return E and E['ph']
            hold = E['st'] == 'calm' and E['tau'] < 0.85
            pg.evaluate(f"Catch.debug().holding = {str(hold).lower()}")
            pg.wait_for_timeout(50)
        return 'timeout'

    def greedy_reel(max_s=15):
        t0 = time.time()
        while time.time() - t0 < max_s:
            ph = pg.evaluate("Catch.debug() && Catch.debug().phase")
            if ph != 'reel': return ph
            pg.evaluate("Catch.debug().holding = true")
            pg.wait_for_timeout(50)
        return 'timeout'

    before = pg.evaluate("({s: Store.get().shells, t: Store.get().treats.duck, n: Store.get().crew.length})")
    force_encounter(1)
    check(land(), 'landed on Common')
    res = smart_reel()
    pg.wait_for_timeout(900)
    shot(pg, '09-caught')
    check(res == 'caught', f'rhythmic reel catches a Common ({res})')
    after = pg.evaluate("({s: Store.get().shells, t: Store.get().treats.duck, n: Store.get().crew.length})")
    check(after['s'] == before['s'] + 100 and after['t'] == before['t'] + 3 and after['n'] == before['n'] + 1, f'catch rewards reconcile {before} -> {after}')
    # §7.2 auto-advance timer is cleared on manual exit
    pg.click('#c-celebrate [data-act="crew"]')
    pg.wait_for_timeout(200)
    check(pg.evaluate("document.body.dataset.screen") == 'detail', 'See it in Crew opens detail')
    shot(pg, '10-detail')

    # greedy holding: tally on many trials of each form
    def greedy_trials(form, n):
        wins = 0
        for _ in range(n):
            pg.evaluate("App.go('deck')")
            force_encounter(form)
            if not land(): continue
            pg.evaluate("Catch.debug().quality = 'Great'; Catch.debug().reel.p = 0.15")
            if greedy_reel() == 'caught': wins += 1
            pg.evaluate("Catch.active() && Catch.exit('deck')")
        return wins
    g1 = greedy_trials(1, 3); g3 = greedy_trials(3, 3)
    print(f'  greedy holding: Common {g1}/3, Captain {g3}/3')
    check(g3 < 2, 'greedy holding is punished on Captain')

    # ---- power up + promote ----
    pg.evaluate("App.go('crew')")
    pg.wait_for_timeout(200)
    shot(pg, '11-crew')
    pg.click('#crew-grid [data-id]')
    pg.wait_for_timeout(200)
    c0 = pg.evaluate("(() => { const c = Store.get().crew.find(x => x.form === 1); return c && {id: c.id, level: c.level}; })()")
    pg.evaluate(f"App.go('detail', '{c0['id']}')")
    s0 = pg.evaluate("({s: Store.get().shells, t: Store.get().treats.duck})")
    pg.click('#dt-power')
    pg.wait_for_timeout(450)
    shot(pg, '12-powerup')
    pg.wait_for_timeout(900)
    lv = pg.evaluate(f"Store.get().crew.find(x => x.id === '{c0['id']}').level")
    s1 = pg.evaluate("({s: Store.get().shells, t: Store.get().treats.duck})")
    check(lv == c0['level'] + 1, 'power up +1 level')
    cost = pg.evaluate(f"CONFIG.powerUpCost({c0['level']})")
    check(s1['s'] == s0['s'] - cost['shells'] and s1['t'] == s0['t'] - cost['treats'], 'power up costs reconcile')
    pg.click('#dt-promote')
    pg.wait_for_timeout(500); shot(pg, '13-promote-charge')
    pg.wait_for_timeout(900); shot(pg, '14-promote-banner')
    pg.wait_for_timeout(1500)
    c1 = pg.evaluate(f"Store.get().crew.find(x => x.id === '{c0['id']}')")
    check(c1['form'] == 2 and c1['level'] == lv and len(c1['provenance']) == 2, 'promotion keeps level, adds provenance')
    s2 = pg.evaluate("Store.get().treats.duck")
    check(s2 == s1['t'] - 25, 'promotion costs 25 Treats')
    check(pg.evaluate("Store.get().everHeld['crew-1'] && Store.get().everHeld['crew-2']"), 'Passport counts promoted-through forms')
    shot(pg, '15-detail-sailor')
    # tap-to-skip
    pg.evaluate("Store.get().treats.duck = 500; Store.save()")
    pg.evaluate(f"App.go('detail', '{c0['id']}')")
    pg.click('#dt-promote'); pg.wait_for_timeout(200); pg.click('#fx')
    check(pg.is_hidden('#fx'), 'promotion animation is skippable')
    shot(pg, '16-detail-captain')

    # ---- signs ----
    pg.evaluate("App.go('signs')"); pg.wait_for_timeout(200)
    shot(pg, '17-signs')
    decoded = pg.evaluate("""() => SIGNS.map(s => {
        const q = qrcode(0,'M'); q.addData(s.id); q.make();
        const n = q.getModuleCount(), cell = 8, m = 4 * cell, size = n * cell + 2 * m;
        const cv = document.createElement('canvas'); cv.width = cv.height = size;
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,size,size); g.fillStyle = '#000';
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r,c)) g.fillRect(m + c*cell, m + r*cell, cell, cell);
        const d = g.getImageData(0,0,size,size); const res = jsQR(d.data, size, size); return res && res.data; })""")
    check(decoded == ['DDS-SIGN-LIDO', 'DDS-SIGN-THEATER', 'DDS-SIGN-LIFERING', 'DDS-SIGN-SANJUAN'], f'all four sign QRs decode exactly: {decoded}')
    pg.click('[data-sign="DDS-SIGN-THEATER"]'); pg.wait_for_timeout(200); shot(pg, '18-sign-full'); pg.click('#signfull .x')

    pg.evaluate("App.go('scan')"); pg.wait_for_timeout(400)
    shot(pg, '19-scanner')
    check(pg.is_visible('#scan-sim'), 'simulate-scan buttons visible in testing mode')
    pg.click('[data-sim="HELLO-WORLD"]'); pg.wait_for_timeout(200)
    check('Not a game sign' in pg.inner_text('#sheet'), 'unknown payload → Not a game sign')
    pg.click('#sheet .x'); pg.wait_for_timeout(200)
    pg.click('[data-sim="DDS-SIGN-SANJUAN"]'); pg.wait_for_timeout(200)
    shot(pg, '20-sanjuan-sheet')
    check('Sign spotted' in pg.inner_text('#sheet'), 'San Juan sheet shows')
    check(pg.evaluate("!!Store.get().stamps['San Juan']"), 'San Juan stamped at scan time')
    pg.click('#sheet [data-act="start"]'); pg.wait_for_timeout(700)
    check(pg.evaluate("Catch.debug() && Catch.debug().provenance") == 'Caught in San Juan (port sign)', 'sign encounter has port provenance')
    check(pg.evaluate("document.body.dataset.screen") == 'catch', 'Start Encounter launches a catch')
    pg.click('#c-x'); pg.wait_for_timeout(200)
    check(not pg.is_visible('#sheet'), 'no sheet left over after ✕ (the X-won\'t-take-me-back bug)')
    shot(pg, '21-deck-venue')
    check(pg.is_visible('#d-venue') and 'San Juan' in pg.inner_text('#d-venue'), 'Deck shows active venue banner')
    # cooldown sheet + §7.3
    pg.evaluate("App.go('scan')"); pg.wait_for_timeout(300)
    pg.click('[data-sim="DDS-SIGN-SANJUAN"]'); pg.wait_for_timeout(200)
    check('recharges' in pg.inner_text('#sheet') and pg.locator('#sheet [data-act="start"]').count() == 0, 'cooldown refuses a re-scan')
    shot(pg, '22-cooldown')
    pg.click('#sheet .x'); pg.evaluate("App.go('passport')"); pg.wait_for_timeout(2200)
    check(not pg.is_visible('#sheet'), 'dismissed cooldown sheet never reopens (§7.3)')
    shot(pg, '23-passport')
    # timed encounter under the venue inherits provenance
    force_encounter(1)
    check(pg.evaluate("Catch.debug().provenance") == 'Caught in San Juan (port sign)', 'timed encounter inherits active venue')
    pg.click('#c-x')

    # ---- layering §7.4 ----
    pg.evaluate("App.levelUpBanner([{level: 2, rewards: ['+1 Premium Ring', 'Power-up cap → Lv 12']}])")
    pg.evaluate("App.openSheet({html: '<h2>Test</h2>'})")
    shot(pg, '24-banner-vs-sheet')
    zb = pg.evaluate("+getComputedStyle(document.getElementById('lvl-banner')).zIndex")
    zs = pg.evaluate("+getComputedStyle(document.getElementById('sheet')).zIndex")
    check(zs > zb, f'sheet ({zs}) above level-up banner ({zb})')
    pg.click('#sheet .x')

    # ---- feedback form honest failure ----
    pg.evaluate("CONFIG.supabase.url = 'https://127.0.0.1:9'")
    pg.click('.feedback-btn'); pg.fill('#fb-message', 'smoke test'); pg.click('#fb-send')
    pg.wait_for_selector('.fb-status.bad', timeout=15000)
    shot(pg, '25-feedback-fail')
    check("Couldn't send" in pg.inner_text('#fb-status') and pg.input_value('#fb-message') == 'smoke test', 'broken connection → honest failure, message kept')

    # ---- save migration ----
    pg.evaluate("""localStorage.setItem('dds_save', JSON.stringify({shells: 120, treats: 9, xp: 10, level: 2,
        crew: [{id:'old1', species:'duck', form:2, level:7, size:'L', gold:false, caughtAt: 1, provenance:['Caught on board']}]}))""")
    pg.reload(); pg.wait_for_timeout(500)
    S = pg.evaluate("Store.get()")
    check(S['v'] == 3 and len(S['crew']) == 1 and S['crew'][0]['id'] == 'old1' and S['crew'][0]['line'] == 'crew' and S['treats']['duck'] == 9 and S['rings']['premium'] == 5 and S['rings']['life'] == 35,
          'prototype-shaped save migrates (v0→v3) without losing the crew; Crew line; full Life Ring bag for its level')
    # v1 save (first distributed build) → v2
    pg.evaluate("""localStorage.setItem('dds_save', JSON.stringify({v: 1, shells: 50, treats: {duck: 4}, rings: {premium: 2, golden: 0}, xp: 0, level: 3,
        everHeld: {'duck-1': true, 'duck-3': true}, goldHeld: {'duck-3': true},
        crew: [{id:'v1a', species:'duck', form:3, level:9, size:'S', gold:true, caughtAt: 1, provenance:['x'], promoted:false}]}))""")
    pg.reload(); pg.wait_for_timeout(500)
    S = pg.evaluate("Store.get()")
    check(S['v'] == 3 and S['crew'][0]['line'] == 'crew' and S['everHeld'].get('crew-3') and S['goldHeld'].get('crew-3') and 'duck-1' not in S['everHeld'] and S['rings']['life'] == 40,
          'v1 save migrates to v3: crew kept, Passport keys moved, Life Rings = bag size for Voyager Lv 3')

    # ---- Life Ring economy ----
    pg.evaluate("document.getElementById('safety').hidden = true; document.getElementById('howto').hidden = true")
    pg.evaluate("(() => { const S = Store.get(); S.level = 1; S.xp = 0; S.rings = {life: 2, premium: 0, golden: 0}; S.lifeTopUpDay = null; S.nextEncounterAt = 0; S.encounterLog = []; Store.save(); App.go('deck'); })()")
    check(pg.inner_text('#d-life') == '2' and pg.inner_text('#d-lifecap') == '/30' and pg.is_visible('#d-topup'), 'Deck shows Life Rings 2/30 and the daily top-up offer')
    for _ in range(2):    # one throw per encounter (a landed throw starts the reel)
        pg.evaluate("Store.get().nextEncounterAt = 0; Store.get().encounterLog = []; App.startTimedEncounter()"); pg.wait_for_timeout(700)
        pg.click('#c-throw'); pg.wait_for_timeout(300)
        pg.evaluate("Catch.exit('deck')")
    check(pg.evaluate("Store.get().rings.life") == 0, 'each throw uses a Life Ring (2 → 0)')
    pg.evaluate("Store.get().nextEncounterAt = 0; Store.get().encounterLog = []; App.startTimedEncounter()"); pg.wait_for_timeout(700)
    check('Out of rings' in pg.inner_text('#c-hint') and pg.evaluate("Catch.debug().phase") == 'aim', 'out of rings → clear message')
    pg.click('#c-throw'); pg.wait_for_timeout(300)
    check(pg.evaluate("Catch.debug().phase") == 'aim' and pg.evaluate("Store.get().stats.throws") >= 0, 'cannot throw with no rings')
    shot(pg, '28-out-of-rings')
    pg.click('#c-x'); pg.wait_for_timeout(200)
    pg.click('#d-topup'); pg.wait_for_timeout(200)
    check(pg.evaluate("Store.get().rings.life") == 10 and not pg.is_visible('#d-topup'), 'daily top-up gives +10 once')
    check(pg.evaluate("Store.claimTopUp()") == 0, 'top-up can\'t be claimed twice in a day')
    pg.evaluate("Store.get().rings.life = 28; Store.save()")
    lv = pg.evaluate("Store.addXp(CONFIG.xpToNext(1))")
    check(pg.evaluate("Store.get().rings.life") == 35 and pg.evaluate("Store.bagCap()") == 35, f'level-up: +10 Life Rings but capped at the new bag size (28 → 35/35)')
    check(any('Life Rings' in r for r in lv[0]['rewards']), 'level-up banner mentions Life Rings')
    check(pg.evaluate("Store.addLifeRings(10)") == 0, 'a full bag takes no more rings')
    pg.evaluate("Store.get().rings.life = 5; Store.get().lifeScanAt = 0; Store.get().signCooldowns = {}; Store.save(); App.go('scan')"); pg.wait_for_timeout(300)
    pg.click('[data-sim="DDS-SIGN-LIFERING"]'); pg.wait_for_timeout(200)
    check('+10 Life Rings' in pg.inner_text('#sheet') and pg.evaluate("Store.get().rings.life") == 15, 'Life Ring Station sign restocks +10 Life Rings')
    pg.evaluate("App.closeSheet(); App.go('deck')")
    check(pg.evaluate("Store.displayName(Store.get().crew[0])") == 'Gold Captain Duck', 'migrated duck keeps its name')

    # ---- duck lines, location bias, port-day ducks, variants ----
    dist = pg.evaluate("""(() => { const n = 3000, out = {ship:{}, lido:{}, theater:{}, port:{}}, col = {}, acc = {};
        const lido = SIGNS.find(s => s.id === 'DDS-SIGN-LIDO'), th = SIGNS.find(s => s.id === 'DDS-SIGN-THEATER');
        for (let i = 0; i < n; i++) {
          const a = Store.rollWild(null, {}); out.ship[a.line] = (out.ship[a.line]||0) + 1;
          col[a.color] = (col[a.color]||0) + 1; if (a.acc) acc[a.acc] = (acc[a.acc]||0) + 1;
          const b = Store.rollWild(lido.weights, {lines: lido.lines}); out.lido[b.line] = (out.lido[b.line]||0) + 1;
          const c = Store.rollWild(th.weights, {lines: th.lines}); out.theater[c.line] = (out.theater[c.line]||0) + 1;
          const d = Store.rollWild(null, {port: 'San Juan'}); out.port[d.line] = (out.port[d.line]||0) + 1;
          if (d.line === 'port' && d.port !== 'San Juan') out.port.bad = 1;
          if (a.acc && !ART.accessoryFits(a, a.acc)) out.ship.badacc = 1;
        }
        return {out, col, acc}; })()""")
    o = dist['out']
    print('  ship lines:', o['ship']); print('  lido:', o['lido']); print('  theater:', o['theater']); print('  port day:', o['port'])
    print('  colours:', dist['col'], '| accessories:', dist['acc'])
    check(len([k for k in o['ship'] if k in ('crew','pool','showtime','galley','explorer','tourist')]) == 6 and 'port' not in o['ship'], 'all six duck lines appear on board, no port ducks without a port day')
    check(o['lido'].get('pool', 0) > 1400 and o['theater'].get('showtime', 0) > 1500, 'Lido favours Pool ducks, Theater favours Showtime ducks')
    check(600 < o['port'].get('port', 0) < 900 and not o['port'].get('bad'), 'on San Juan port day ~25% are the San Juan Duck')
    check(all(dist['col'].get(k, 0) > 0 for k in ('pink','blue','mint','white')) and not o['ship'].get('badacc'), 'rare colours and accessories roll, never on clashing outfits')
    allart = pg.evaluate("""(() => { let bad = []; for (const line of Object.keys(DUCK_LINES)) for (const f of [1,2,3]) for (const v of [{}, {gold:true}, {color:'rainbow'}, {acc:'sunglasses'}, {acc:'lei'}]) {
        const svg = ART.duckSVG({line, form: f, ...v}); if (!svg.includes('<svg') || svg.includes('undefined') || svg.includes('NaN')) bad.push(line+f+JSON.stringify(v)); }
      for (const port of ['San Juan', 'Funchal']) { const svg = ART.duckSVG({line:'port', port, form: 2}); if (svg.includes('undefined')) bad.push(port); }
      return bad; })()""")
    check(allart == [], f'every line/form/variant draws cleanly {allart}')
    # Port sign → port day until midnight, San Juan Duck can be caught, can't be promoted
    pg.evaluate("document.getElementById('safety').hidden = true; document.getElementById('howto').hidden = true")
    pg.evaluate("Store.get().signCooldowns = {}; Store.save()")
    pg.evaluate("App.handleSignPayload('DDS-SIGN-SANJUAN')"); pg.wait_for_timeout(200)
    until = pg.evaluate("Store.get().venue.until"); mid = pg.evaluate("(() => { const m = new Date(); m.setHours(24,0,0,0); return m.getTime(); })()")
    check(until == mid and 'port day until midnight' in pg.inner_text('#sheet'), 'port sign starts port day until midnight')
    pg.evaluate("App.closeSheet()")
    pg.evaluate("""(() => { const r = Store.recordCatch({species:'duck', line:'port', port:'San Juan', form:2, level:4, size:'M', gold:false, color:'yellow', acc:null},
        {quality:'Great', curveball:false, provenance:'Caught in San Juan (port sign)'}); window.__sj = r.creature.id; })()""")
    pg.evaluate("App.go('detail', window.__sj)"); pg.wait_for_timeout(300)
    shot(pg, '26-sanjuan-duck')
    check('San Juan Duck' in pg.inner_text('#detail-body') and pg.locator('#dt-promote').count() == 0 and pg.is_enabled('#dt-power'), 'San Juan Duck: detail shows, power up yes, promote no')
    pg.evaluate("App.go('passport')"); pg.wait_for_timeout(300)
    shot(pg, '27-passport-lines')
    check('San Juan Duck' in pg.inner_text('#passport-body') and '/ 19 ducks' in pg.inner_text('#passport-body'), 'Passport lists 6 lines + port ducks (19 total)')
    check(pg.evaluate("!!localStorage.getItem('dds_save_backup_v0')"), 'pre-migration backup kept')
    b.close()

errors = [e for e in errors if 'getUserMedia' not in e and 'NotSupported' not in e and 'Permission' not in e and 'ERR_' not in e and '127.0.0.1:9' not in e]
for e in errors: print('PAGE ERROR:', e)
print(f'\n{len(fails)} failed, {len(errors)} page errors')
sys.exit(1 if fails or errors else 0)
