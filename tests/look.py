# Look-around (gyroscope) mode with a fake camera and simulated phone turning.
#   python3 -m http.server 8765 --bind 127.0.0.1   then   python3 tests/look.py
import os, pathlib, sys, math
from playwright.sync_api import sync_playwright

BASE = os.environ.get('DDS_BASE', 'http://127.0.0.1:8765/index.html')
OUT = pathlib.Path(__file__).parent / 'out'; OUT.mkdir(exist_ok=True)
fails, errors = [], []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

# The page keeps "holding" the phone at this orientation (events every 50 ms, like a real phone).
ORIENT_JS = """(o) => { window.__o = o; if (!window.__oi) window.__oi = setInterval(() =>
  window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', {alpha: __o.a, beta: __o.b, gamma: __o.g})), 50); }"""

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'])
    ctx = b.new_context(viewport={'width': 412, 'height': 860}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.grant_permissions(['camera'], origin=BASE.split('/index')[0].rstrip('/') if 'index' in BASE else BASE.rstrip('/'))
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(BASE + ('&' if '?' in BASE else '?') + 'test=1'); pg.wait_for_timeout(400)
    pg.click('#safety-ok'); pg.click('#howto .x')
    pg.evaluate(ORIENT_JS, {'a': 0, 'b': 90, 'g': 0})       # phone upright, facing "north"

    pg.click('#d-encounter'); pg.wait_for_timeout(1500)
    E = lambda js: pg.evaluate(f'(() => {{ const E = Catch.debug(); return {js}; }})()')
    check(E('!!E.stream'), 'fake camera stream is running')
    check(pg.is_visible('#c-look') and 'on' in pg.get_attribute('#c-look', 'class'), '🧭 toggle visible and on in testing')
    check(E('E.look.anchored') and not E('E.look.pending'), 'duck anchored to a direction once motion data arrives')
    check(pg.evaluate("document.getElementById('duckwrap').style.visibility") == '', 'duck revealed')
    W = pg.evaluate('innerWidth')
    print('  spawned:', E('E.look.spawnDir'), '| yaw off', E('Math.round((E.look.duckYaw - E.look.cam.yaw) * 180 / Math.PI)'),
          '| pitch off', E('Math.round((E.look.duckPitch - E.look.cam.pitch) * 180 / Math.PI)'))
    ppr_deg = pg.evaluate("(() => { const v = document.getElementById('cam'); const s = Math.max(innerWidth / v.videoWidth, innerHeight / v.videoHeight); return Math.max(v.videoWidth, v.videoHeight) * s / CONFIG.lookAround.cameraLongFovDeg; })()")
    check(ppr_deg > 5, f'turning scale calibrated from the camera picture ({ppr_deg:.1f} px per degree)')
    pg.screenshot(path=str(OUT / 'look-01-spawn.png'))
    if E('E.duck.x < -E.S*0.25 || E.duck.x > E.W + E.S*0.25'):
        check(pg.is_visible('#c-find'), f"finder arrow shows: {pg.inner_text('#c-find')}")

    # Turn the phone to face the duck: heading = -alpha
    duck_yaw_deg = E('E.look.duckYaw * 180 / Math.PI')
    duck_pitch_deg = E('E.look.duckPitch * 180 / Math.PI')
    pg.evaluate(ORIENT_JS, {'a': -duck_yaw_deg, 'b': 90 + duck_pitch_deg, 'g': 0}); pg.wait_for_timeout(900)
    dx2 = E('E.duck.x') - W / 2
    check(abs(dx2) < W * 0.3, f'turning toward the duck brings it to the centre (dx={dx2:.0f}px; includes its own wandering)')
    check(not pg.is_visible('#c-find'), 'finder arrow hidden when the duck is on screen')
    pg.screenshot(path=str(OUT / 'look-02-facing.png'))

    # Tilt the phone up 15°: the duck should move down the screen
    y0 = E('E.look.proj.y')
    pg.evaluate(ORIENT_JS, {'a': -duck_yaw_deg, 'b': 90 + duck_pitch_deg + 15, 'g': 0}); pg.wait_for_timeout(700)
    y1 = E('E.look.proj.y')
    check(y1 - y0 > 60, f'tilting up moves the duck down ({y0:.0f} → {y1:.0f}px)')
    pg.evaluate(ORIENT_JS, {'a': -duck_yaw_deg, 'b': 90 + duck_pitch_deg, 'g': 0}); pg.wait_for_timeout(700)

    # Land + reel + catch in look mode
    caught = False
    for _ in range(12):
        if E('E.phase') != 'aim': pg.wait_for_timeout(300); continue
        pg.evaluate("(() => { const d = Catch.debug().duck; d.tx = 0; d.dx = 0; d.rate = 0.0001; d.nextWander = 1e9; })()")
        pg.evaluate("Math._r = Math.random; Math.random = () => 0.99"); pg.click('#c-throw'); pg.evaluate("Math.random = Math._r")
        pg.wait_for_timeout(1800)
        if E('E.phase') == 'reel':
            for _ in range(300):
                st = E('E && {ph: E.phase, s: E.reel && E.reel.state, t: E.reel && E.reel.tau}')
                if not st or st['ph'] != 'reel': break
                pg.evaluate(f"Catch.debug().holding = {'true' if st['s'] == 'calm' and st['t'] < 0.85 else 'false'}")
                pg.wait_for_timeout(50)
            caught = E('E && E.phase') == 'caught'
            if caught: break
    check(caught, 'land, reel and catch work in look-around mode')
    pg.wait_for_timeout(900); pg.screenshot(path=str(OUT / 'look-03-caught.png'))
    pg.click('#c-x'); pg.wait_for_timeout(200)
    check(pg.evaluate('Catch.lookState().raw') is None, 'leaving the encounter stops listening to motion')

    # Spawn spread over many encounters: in view, left, right, up, down all happen; finder says the right thing
    pg.evaluate(ORIENT_JS, {'a': 0, 'b': 90, 'g': 0})
    seen, finder_ok = {}, True
    for _ in range(30):
        pg.evaluate("Store.get().nextEncounterAt = 0; Store.get().encounterLog = []; App.startTimedEncounter()"); pg.wait_for_timeout(700)
        d = E('E.look.spawnDir'); seen[d] = seen.get(d, 0) + 1
        txt = pg.inner_text('#c-find') if pg.is_visible('#c-find') else ''
        want = {'left': 'left', 'right': 'right', 'up': 'up', 'down': 'down'}.get(d)
        if want and want not in txt.lower(): finder_ok = False; print('  finder mismatch:', d, repr(txt))
        if d == 'here' and txt: finder_ok = False; print('  in-view duck but finder shown:', repr(txt))
        if d in ('up', 'down') and not seen.get('shot_' + d):
            seen['shot_' + d] = 1; pg.screenshot(path=str(OUT / f'look-spawn-{d}.png'))
        pg.evaluate("Catch.exit('deck')")
    print('  spawn spread:', {k: v for k, v in seen.items() if not k.startswith('shot_')})
    check(all(seen.get(k) for k in ('here', 'left', 'right', 'up', 'down')), 'duck hides in every direction (and sometimes in view)')
    check(finder_ok, 'finder arrow always points the right way (Turn left/right, Look up/down), none when in view')

    # Toggle off mid-encounter → duck back to normal overlay
    pg.evaluate("Store.get().nextEncounterAt = 0; Store.get().encounterLog = []; App.startTimedEncounter()"); pg.wait_for_timeout(1200)
    pg.click('#c-look'); pg.wait_for_timeout(400)
    check(E('E.look.proj.x') == 0 and abs(E('E.duck.x') - W / 2) < W * 0.3, 'turning 🧭 off puts the duck back on screen')
    check(pg.evaluate("localStorage.getItem('dds_look')") == '0', 'choice remembered on this device')
    pg.click('#c-look'); pg.wait_for_timeout(500)
    check(E('E.look.anchored') and abs(E('E.look.duckYaw - E.look.cam.yaw')) < 0.05, 'turning it back on keeps the duck where it is')
    pg.click('#c-x')

    # Camera on but no motion data (e.g. desktop): falls back to the overlay after the wait
    pg.evaluate("clearInterval(window.__oi); window.__oi = null")
    pg.evaluate("Store.get().nextEncounterAt = 0; Store.get().encounterLog = []; App.startTimedEncounter()")
    pg.wait_for_timeout(500)
    check(pg.evaluate("document.getElementById('duckwrap').style.visibility") == 'hidden', 'duck hidden briefly while waiting for motion')
    pg.wait_for_timeout(3000)
    check(pg.evaluate("document.getElementById('duckwrap').style.visibility") == '' and not E('E.look.want'), 'no motion data → plain overlay after the wait')
    pg.click('#c-x')

    # Normal link (no ?test=1): look-around is offered too
    pg.evaluate("localStorage.removeItem('dds_look')")
    pg.evaluate(ORIENT_JS, {'a': 0, 'b': 90, 'g': 0})
    pg.goto(BASE + ('&' if '?' in BASE else '?') + 'test=0'); pg.wait_for_timeout(400)
    pg.evaluate(ORIENT_JS, {'a': 0, 'b': 90, 'g': 0})
    pg.evaluate("Store.get().nextEncounterAt = 0; Store.get().encounterLog = []; App.startTimedEncounter()"); pg.wait_for_timeout(1500)
    check(pg.is_visible('#c-look') and E('E.look.want') and E('E.look.anchored'), 'normal link: 🧭 shown and look-around active')
    b.close()

for e in errors: print('PAGE ERROR:', e)
print(f'\n{len(fails)} failed, {len(errors)} page errors')
sys.exit(1 if fails or errors else 0)
