# "Look for ducks" (camera recognition).
#   python3 -m http.server 8765 --bind 127.0.0.1    then    python3 tests/recognize.py
# Part A always runs (logic with fake model output). Part B runs the REAL model on photos used as the
# camera: set DDS_PHOTOS to a folder of .jpg files named after what they show (stage*, pizza*, coral*, ...).
import os, sys, glob, pathlib, shutil, tempfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get('DDS_BASE', 'http://127.0.0.1:8765/index.html')
ORIGIN = BASE.split('/index.html')[0] if 'index.html' in BASE else BASE.rstrip('/')
OUT = pathlib.Path(__file__).parent / 'out'; OUT.mkdir(exist_ok=True)
fails, errors = [], []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

def page(p, fake_file=None):
    args = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
    if fake_file: args.append(f'--use-file-for-fake-video-capture={fake_file}')
    b = p.chromium.launch(args=args)
    ctx = b.new_context(viewport={'width': 412, 'height': 860}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.grant_permissions(['camera'], origin=ORIGIN)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(BASE + '?test=1'); pg.wait_for_timeout(400)
    pg.evaluate("document.getElementById('safety').hidden = true; Store.get().seen.safety = true; Store.save()")
    return b, pg

with sync_playwright() as p:
    # ---------------- Part A: logic ----------------
    b, pg = page(p)
    check(pg.is_visible('.lookfor'), 'Deck has a "Look for ducks" button')
    fake = lambda label, score: [{'categoryName': label, 'score': score}]
    # partial / strong / excellent → form 1 / 2 / 3
    check(pg.evaluate("[Recognize.formFor(0.25), Recognize.formFor(0.6), Recognize.formFor(0.9)]") == [1, 2, 3], 'match strength → Form 1 / 2 / 3')
    r = pg.evaluate("""(() => { Store.get().recog = null;
        const out = []; let t = 0;
        for (let i = 0; i < 6; i++) { t += 300; out.push(Recognize.step([{categoryName:'theater curtain', score: 0.82}], t).status); }
        return out; })()""")
    check(r[:3] == ['holding'] * 3 and 'found' in r, f'a steady match is held, then found: {r}')
    r = pg.evaluate("""(() => { let t = 100000, s = [];
        s.push(Recognize.step([{categoryName:'pizza', score: 0.5}], t).status);
        s.push(Recognize.step([{categoryName:'zebra', score: 0.9}], t += 300).status);   // not a duck thing
        s.push(Recognize.step([{categoryName:'zebra', score: 0.9}], t += 300).status);
        s.push(Recognize.step([{categoryName:'zebra', score: 0.9}], t += 300).status);
        return s; })()""")
    check(r[-1] == 'looking', f'unrelated things reset the hold after a short grace: {r}')
    r = pg.evaluate("(() => Recognize.step([{categoryName:'pizza', score: 0.1}], 200000).status)()")
    check(r == 'looking', 'weak matches below minScore are ignored')
    # full flow: found → catch with forced line/form, provenance, timer untouched, cooldown + count set
    pg.evaluate("Store.get().nextEncounterAt = Date.now() + 999999; Store.save(); App.go('deck')")
    pg.evaluate("Recognize._found({cat: RECOGNIZE_CATEGORIES.find(c => c.id === 'stage'), avg: 0.82, form: 3, label: 'theater curtain'})")
    pg.wait_for_timeout(800)
    w = pg.evaluate("(() => { const E = Catch.debug(); return E && {line: E.wild.line, form: E.wild.form, prov: E.provenance, info: document.getElementById('c-info').innerText}; })()")
    check(w and w['line'] == 'showtime' and w['form'] == 3, f'stage match (excellent) → Showtime Form 3 (Cruise Director): {w}')
    check(w and w['prov'] == 'Found by the stage (camera saw "theater curtain", excellent match)', f"provenance records where + what + match: {w and w['prov']}")
    check(pg.evaluate("Catch.debug().look.spawnOffset") is False, 'recognized duck appears where you are pointing (no hiding offset)')
    check(pg.evaluate("Store.get().nextEncounterAt > Date.now() + 900000"), 'recognized duck skipped the encounter timer (timer untouched)')
    pg.screenshot(path=str(OUT / 'recog-01-cruise-director.png'))
    pg.evaluate("""Store.recordCatch(Catch.debug().wild, {quality:'Great', curveball:false, provenance: Catch.debug().provenance})""")
    pg.evaluate("Catch.exit('deck')"); pg.click('#menu-btn'); pg.click('[data-stats]'); pg.wait_for_timeout(200)
    txt = pg.inner_text('#stats-body')
    check('Ducks found by the camera\t1' in txt or 'Ducks found by the camera\n1' in txt, 'My stats shows camera finds')
    check('theater curtain' in txt and 'Excellent match (Form 3)' in txt, 'stats list what was recognized and match strength')
    pg.screenshot(path=str(OUT / 'recog-03-stats.png'))
    pg.click('#stats .x')
    pg.evaluate("Store.get().nextEncounterAt = Date.now() + 999999; Store.save()")
    pg.evaluate("Recognize._found({cat: RECOGNIZE_CATEGORIES.find(c => c.id === 'food'), avg: 0.6, form: 2, label: 'pizza'})"); pg.wait_for_timeout(500)
    pg.click('#c-x')
    check(pg.evaluate("Recognize.state().count") == 2 and pg.evaluate("Recognize.cooldownLeft('stage')") > 0, 'daily count + per-kind cooldown recorded')
    r = pg.evaluate("(() => Recognize.step([{categoryName:'stage', score: 0.9}], 300000))()")
    check(r['status'] == 'cooldown', 'same kind of thing again → cooldown message, no duck')
    r = pg.evaluate("(() => Recognize.step([{categoryName:'sunscreen', score: 0.9}], 400000).status)()")
    check(r == 'holding', 'a different kind of thing still works')
    pg.evaluate("Recognize.state().count = CONFIG.recognize.dailyCap; Store.save(); App.go('look')"); pg.wait_for_timeout(500)
    check('all the hidden ducks for today' in pg.inner_text('#look-status'), 'daily cap reached → friendly stop message')
    pg.evaluate("Recognize.state().count = 0; Store.save(); App.go('deck')")
    # real model loads in the browser (wasm + tflite) and classifies a camera frame
    pg.evaluate("App.go('look')")
    pg.wait_for_function("document.getElementById('look-readout').innerText.includes('%')", timeout=60000)
    check(True, 'real model loaded and is classifying the camera (readout shows scores)')
    pg.screenshot(path=str(OUT / 'recog-02-look-screen.png'))
    pg.evaluate("App.go('deck')"); pg.wait_for_timeout(300)
    check(pg.evaluate("!document.getElementById('look-video').srcObject"), 'leaving the screen stops the camera')
    b.close()

    # ---------------- Part B: real photos as the camera ----------------
    photos = os.environ.get('DDS_PHOTOS')
    if photos:
        expect = {'stage': 'showtime', 'pizza': 'galley', 'coral': 'explorer', 'ship': 'crew', 'sunscreen': 'pool'}
        tmp = tempfile.mkdtemp()
        for f in sorted(glob.glob(os.path.join(photos, '*.jpg'))):
            name = pathlib.Path(f).stem
            want = next((v for k, v in expect.items() if k in name.lower()), None)
            fake = os.path.join(tmp, name + '.mjpeg'); shutil.copy(f, fake)    # a single JPEG works as an MJPEG "camera"
            b, pg = page(p, fake)
            pg.evaluate("Store.get().recog = null; Store.save(); App.go('look')")
            got = None
            for _ in range(60):
                pg.wait_for_timeout(250)
                if pg.evaluate("document.body.dataset.screen") == 'catch':
                    got = pg.evaluate("(() => { const E = Catch.debug(); return {line: E.wild.line, form: E.wild.form, label: document.getElementById('c-info').innerText.replace(/\\n/g,' ')}; })()")
                    break
            readout = pg.inner_text('#look-readout').replace('\n', ' ') if not got else ''
            print(f'  {name}: expected {want} → got {got} {readout}')
            pg.screenshot(path=str(OUT / f'recog-photo-{name}.png'))
            check(got is not None and got['line'] == want, f'photo "{name}" → {want} duck')
            b.close()

for e in errors: print('PAGE ERROR:', e)
print(f'\n{len(fails)} failed, {len(errors)} page errors')
sys.exit(1 if fails or errors else 0)
