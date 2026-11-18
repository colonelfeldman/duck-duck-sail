# Accounts: sign in (All Ashore login), parent + kid profiles, cloud sync across devices, offline, legacy import.
#   python3 -m http.server 8765 --bind 127.0.0.1    then    python3 tests/accounts.py
import os, sys, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from playwright.sync_api import sync_playwright
from mock_supabase import MockSupabase, login

BASE = os.environ.get('DDS_BASE', 'http://127.0.0.1:8765/index.html')
OUT = pathlib.Path(__file__).parent / 'out'; OUT.mkdir(exist_ok=True)
fails, errors = [], []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

mock = MockSupabase()
with sync_playwright() as p:
    b = p.chromium.launch()
    def device(name):
        ctx = b.new_context(viewport={'width': 412, 'height': 860}, device_scale_factor=2, is_mobile=True, has_touch=True)
        mock.install(ctx)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(f'[{name}] {e}'))
        return ctx, pg

    # ---------- phone 1 ----------
    ctx1, pg = device('phone1')
    # an old (pre-accounts) collection on this phone
    pg.goto(BASE + '?test=1'); pg.wait_for_timeout(300)
    pg.evaluate("""localStorage.setItem('dds_save', JSON.stringify({v: 3, shells: 777, treats: {duck: 12}, rings: {life: 20, premium: 1, golden: 0}, xp: 5, level: 4,
        crew: [{id: '11111111-1111-4111-8111-111111111111', species: 'duck', line: 'crew', form: 2, level: 8, size: 'M', gold: false, color: 'yellow', acc: null,
                caughtAt: 1, provenance: ['Caught on board (ship mode)'], promoted: false}],
        everHeld: {'crew-2': true}, goldHeld: {}, colorsHeld: {}, accHeld: {}, stamps: {}, seen: {safety: true, howto: true}, stats: {catches: 1, throws: 3}}))""")
    pg.reload(); pg.wait_for_timeout(500)
    check(pg.is_visible('#scr-auth') and not pg.is_visible('#scr-deck'), 'no guests: the game opens on Sign in')
    check('All Ashore' in pg.inner_text('#scr-auth'), 'sign-in says it is the All Ashore login')
    pg.screenshot(path=str(OUT / 'acct-01-signin.png'))

    # Google button → Supabase Google sign-in that returns to the game's own address
    check(pg.is_visible('#auth-google'), 'Continue with Google is shown')
    seen = []
    pg.route('**/auth/v1/authorize*', lambda route, req: (seen.append(req.url), route.fulfill(status=200, body='ok')))
    pg.click('#auth-google'); pg.wait_for_timeout(1000)
    import urllib.parse as up
    rt = up.parse_qs(up.urlparse(seen[0]).query) if seen else {}
    check(seen and rt.get('provider') == ['google'] and rt.get('redirect_to', [''])[0].startswith(BASE.split('/index.html')[0]),
          f"Google sign-in goes to Supabase and asks to come back to the game: {rt.get('redirect_to')}")
    pg.goto(BASE + '?test=1'); pg.wait_for_selector('#scr-auth:not([hidden])')

    # sign-up needs the 13+ confirmation
    pg.click('[data-auth="signup"]'); pg.fill('#auth-email', 'new@example.com'); pg.fill('#auth-pass', 'longenough1'); pg.click('#auth-submit'); pg.wait_for_timeout(300)
    check('13 or older' in pg.inner_text('#auth-msg'), 'sign-up refuses without the 13+ confirmation')
    pg.check('#auth-age'); pg.click('#auth-submit'); pg.wait_for_timeout(500)
    check('Check your email' in pg.inner_text('#auth-msg'), 'sign-up → "check your email to confirm"')
    su = [c for c in mock.calls if c[1] == '/auth/v1/signup']
    check(su and 'redirect_to=' in su[-1][2] and 'index.html' in up.unquote(su[-1][2]) if 'up' in dir() else True, 'sign-up confirmation link returns to the game')
    # wrong password → friendly
    pg.fill('#auth-email', 'tester@example.com'); pg.fill('#auth-pass', 'nope'); pg.click('#auth-submit'); pg.wait_for_timeout(500)
    check('same login as All Ashore' in pg.inner_text('#auth-msg'), 'wrong password → friendly message')
    # sign in → first profile (the account holder's own, no kid box)
    pg.fill('#auth-pass', 'duckduck123'); pg.click('#auth-submit')
    pg.wait_for_selector('#scr-profiles:not([hidden])', timeout=10000)
    check(pg.is_visible('#profiles-form') and not pg.is_visible('#pf-kid-row'), 'first sign-in → create your own player (no kid box)')
    pg.screenshot(path=str(OUT / 'acct-02-first-profile.png'))
    pg.fill('#pf-name', 'Jeff'); pg.click('#pf-submit'); pg.wait_for_timeout(300)
    check('13 or older' in pg.inner_text('#profiles-msg'), 'first player needs the 13+ confirmation (covers Google sign-ups)')
    pg.check('#pf-age'); pg.click('#pf-submit')
    pg.wait_for_selector('#scr-deck:not([hidden])', timeout=10000)
    check(True, 'creating the first player goes straight into the game')
    # legacy import offer
    pg.wait_for_timeout(400)
    check('Bring your ducks' in pg.inner_text('#sheet'), 'offers to move the pre-accounts ducks into the profile')
    pg.screenshot(path=str(OUT / 'acct-03-import.png'))
    pg.click('#sheet [data-act="yes"]'); pg.wait_for_timeout(300)
    if pg.is_visible('#safety'): pg.click('#safety-ok')
    if pg.is_visible('#howto'): pg.click('#howto .x')
    check(pg.evaluate("Store.get().shells") == 777 and len(pg.evaluate("Store.get().crew")) == 1, 'old collection moved into Jeff (777 Shells, 1 duck)')
    check(pg.evaluate("localStorage.getItem('dds_save')") is None and pg.evaluate("!!localStorage.getItem('dds_save_imported')"), 'old save kept as a backup, not offered again')
    pg.wait_for_timeout(3500)
    check(len(mock.creatures()) == 1 and mock.tables['dds_saves'] and mock.tables['dds_saves'][0]['state']['shells'] == 777, 'synced to the account: 1 duck + save')
    check('Synced' in pg.inner_text('#sync-status'), f"footer shows sync status: {pg.inner_text('#sync-status')}")
    check(pg.inner_text('#foot-player') == 'Jeff', 'footer shows who is playing')

    # All Ashore check-in (creates the All Ashore user + sends the game welcome for new accounts)
    check(len(mock.aa_syncs) == 1 and mock.aa_syncs[0]['body'] == {'signup_source': 'duck-duck-sail', 'first_name': 'Jeff'}
          and mock.aa_syncs[0]['auth'].startswith('Bearer tok-'), f'checks in with All Ashore once, as Duck, Duck, Sail!, with the player name: {mock.aa_syncs}')

    # catch a duck → syncs
    pg.evaluate("Store.recordCatch({species:'duck', line:'pool', form:1, level:3, size:'S', gold:false, color:'pink', acc:null}, {quality:'Great', curveball:false, provenance:'Caught on board (ship mode)'})")
    pg.wait_for_timeout(3500)
    check(len(mock.creatures()) == 2, 'a new catch uploads')

    # offline: catch while offline → waits → uploads when back online
    ctx1.set_offline(True)
    pg.evaluate("window.dispatchEvent(new Event('offline'))")
    pg.evaluate("Store.recordCatch({species:'duck', line:'galley', form:1, level:2, size:'M', gold:false, color:'yellow', acc:null}, {quality:'Nice', curveball:false, provenance:'x'})")
    pg.wait_for_timeout(3500)
    check(len(mock.creatures()) == 2 and 'Offline' in pg.inner_text('#sync-status'), 'offline: keeps playing, shows "Offline — will sync"')
    ctx1.set_offline(False)
    pg.evaluate("window.dispatchEvent(new Event('online'))"); pg.wait_for_timeout(2500)
    check(len(mock.creatures()) == 3, 'back online → the offline catch uploads')

    # release → marked released on the server
    pg.evaluate("Store.release(Store.get().crew.find(c => c.line === 'galley'))"); pg.wait_for_timeout(3500)
    check(len(mock.creatures()) == 2 and len(mock.creatures(alive=False)) == 3, 'release → marked released in the account')

    # kid profile
    pg.click('#menu-btn'); pg.click('#menu [data-switch]'); pg.wait_for_selector('#scr-profiles:not([hidden])')
    pg.click('#profiles-add'); pg.fill('#pf-name', 'Mia'); pg.check('#pf-kid'); pg.click('#pf-submit'); pg.wait_for_timeout(500)
    pg.screenshot(path=str(OUT / 'acct-04-profiles.png'))
    kid = [p for p in mock.tables['dds_profiles'] if p['display_name'] == 'Mia']
    check(kid and kid[0]['is_kid'] is True and set(kid[0].keys()) <= {'id', 'account_id', 'display_name', 'is_kid', 'avatar', 'created_at', 'archived_at'}, 'kid profile = name + kid flag only (no email or other personal data)')
    pg.locator('.pcard', has_text='Mia').click(); pg.wait_for_selector('#scr-deck:not([hidden])')
    pg.wait_for_timeout(300)
    check(pg.is_visible('#safety'), "Mia (new player) sees the safety reminder first")
    pg.click('#safety-ok')
    if pg.is_visible('#howto'): pg.click('#howto .x')
    check(len(pg.evaluate("Store.get().crew")) == 0 and pg.inner_text('#foot-player') == 'Mia', "Mia has her own empty collection")
    check('Bring your ducks' not in (pg.inner_text('#sheet') if pg.is_visible('#sheet') else ''), 'import is not offered twice')
    pg.evaluate("Store.recordCatch({species:'duck', line:'crew', form:1, level:1, size:'M', gold:false, color:'yellow', acc:null}, {quality:'Nice', curveball:false, provenance:'x'})")
    pg.wait_for_timeout(3500)
    mia_id = kid[0]['id']
    check(len([c for c in mock.creatures() if c['profile_id'] == mia_id]) == 1, "Mia's catch syncs to Mia's profile")
    # switch back: Jeff's ducks are still Jeff's
    pg.click('#menu-btn'); pg.click('#menu [data-switch]'); pg.locator('.pcard', has_text='Jeff').click(); pg.wait_for_selector('#scr-deck:not([hidden])')
    check(len(pg.evaluate("Store.get().crew")) == 2, "back to Jeff: Jeff's 2 ducks")
    check(len(mock.aa_syncs) == 1, 'switching players does not check in again')

    # ---------- phone 2 (same account, new device) ----------
    ctx2, pg2 = device('phone2')
    pg2.goto(BASE + '?test=1')
    login(pg2, profile='Jeff')
    pg2.wait_for_timeout(1500)
    crew2 = pg2.evaluate("Store.get().crew.map(c => c.line).sort()")
    check(crew2 == ['crew', 'pool'] and pg2.evaluate("Store.get().shells") >= 777, f'new phone: signs in, picks Jeff, gets the collection from the account {crew2}')
    pg2.screenshot(path=str(OUT / 'acct-05-phone2.png'))
    # phone 2 catches; phone 1 picks it up on next open
    pg2.evaluate("Store.recordCatch({species:'duck', line:'tourist', form:1, level:5, size:'L', gold:false, color:'yellow', acc:null}, {quality:'Great', curveball:false, provenance:'y'})")
    pg2.wait_for_timeout(3500)
    pg.reload(); pg.wait_for_selector('#scr-deck:not([hidden]), #scr-profiles:not([hidden])', timeout=10000)
    if pg.is_visible('#scr-profiles'): pg.locator('.pcard', has_text='Jeff').click()
    pg.wait_for_timeout(2500)
    check(sorted(pg.evaluate("Store.get().crew.map(c => c.line)")) == ['crew', 'pool', 'tourist'], "phone 1 gets phone 2's new catch")

    # sign out → back to sign in, no game access
    pg.click('#menu-btn'); pg.click('#menu [data-signout]'); pg.wait_for_timeout(800)
    check(pg.is_visible('#scr-auth') and not pg.is_visible('#scr-deck'), 'sign out → sign-in screen')
    pg.reload(); pg.wait_for_timeout(800)
    check(pg.is_visible('#scr-auth'), 'still signed out after reload')
    b.close()

for e in errors: print('PAGE ERROR:', e)
print(f'\n{len(fails)} failed, {len(errors)} page errors')
sys.exit(1 if fails or errors else 0)
