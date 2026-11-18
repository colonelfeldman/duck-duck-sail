// Accounts (Jeff 2026-11-18): real accounts only — the same login as All Ashore (shared Supabase project).
// One account (a parent, or anyone 13+) holds player profiles; kids play on profiles the parent adds
// (display name only — no email or other personal data for kids).
// Play is local-first: the phone keeps a copy so it works offline on ship WiFi; Sync uploads changes
// whenever there's a connection and downloads the profile on a new device.
const Account = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  let sb = null, session = null, profiles = [], profile = null, mode = 'signin';

  function client() {
    if (!sb) {
      if (typeof supabase === 'undefined') throw new Error('sign-in library missing');
      sb = supabase.createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'dds-auth', detectSessionInUrl: true },
      });
    }
    return sb;
  }
  const uid = () => session && session.user && session.user.id;
  const online = () => navigator.onLine !== false;

  // ---------- boot ----------
  // Never wait long on the network at startup (ship WiFi often "connects" but can't reach anything).
  const within = (promise, ms, fallback) => Promise.race([promise, new Promise((r) => setTimeout(() => r(fallback), ms))]);
  function storedSession() {
    const s = LS.get('dds-auth');
    return s && s.access_token && s.user ? s : null;
  }

  async function boot() {
    renderAuth();
    try {
      const res = await within(client().auth.getSession(), 2500, null);   // the session is stored on the phone
      session = (res && res.data && res.data.session) || storedSession();
      client().auth.onAuthStateChange((ev, s) => { if (s) session = s; if (ev === 'SIGNED_OUT') { session = null; profile = null; App.go('auth'); } });
    } catch (e) { session = storedSession(); }
    if (!session) return App.go('auth');
    profiles = LS.get('dds_profiles:' + uid()) || [];
    if (profiles.length) {
      choose();                                   // play right away from the phone's copy…
      loadProfiles().then(() => { if (!profile) renderProfiles(); });   // …and refresh the list in the background
    } else {
      await within(loadProfiles(), 8000);
      choose();
    }
  }

  async function loadProfiles() {
    profiles = LS.get('dds_profiles:' + uid()) || profiles;
    if (!online()) return;
    try {
      const { data, error } = await client().from('dds_profiles').select('id, display_name, is_kid, avatar, created_at')
        .is('archived_at', null).order('created_at');
      if (!error && data) { profiles = data; LS.set('dds_profiles:' + uid(), profiles); }
    } catch (e) {}
  }

  function choose() {
    const last = LS.get('dds_last_profile:' + uid());
    if (profiles.length === 1 && (!last || last === profiles[0].id)) return open(profiles[0]);
    renderProfiles();
    App.go('profiles');
  }

  // ---------- open a profile → play ----------
  function open(p) {
    profile = p;
    LS.set('dds_last_profile:' + uid(), p.id);
    Store.load(p.id);
    $('foot-player').textContent = p.display_name;
    App.enterGame();
    Sync.start(p.id);
    offerLegacyImport();
  }

  // The collection from before accounts existed (this phone only) can move into a profile, once.
  function offerLegacyImport() {
    const legacy = Store.legacySave();
    if (!legacy || LS.get('dds_legacy_done')) return;
    const n = (legacy.crew || []).length;
    App.openSheet({
      html: `<h2>Bring your ducks?</h2><p>This phone has ${n} duck${n === 1 ? '' : 's'} from before accounts. Move ${n === 1 ? 'it' : 'them'} (and your Shells, Treats and rings) into <b>${esc(profile.display_name)}</b>'s profile?</p>
        <p class="note">This can only be done once, into one profile.</p>
        <div class="row"><button class="btn" data-act="no">Not now</button><button class="btn primary" data-act="yes">Yes, move them</button></div>`,
      onAct: (a) => {
        App.closeSheet(true);
        if (a !== 'yes') return;
        Store.importLegacy();
        LS.set('dds_legacy_done', { into: profile.id, at: Date.now() });
        Sync.schedule(0);
        App.go('deck');
        App.toast(`Moved ${n} duck${n === 1 ? '' : 's'} into ${profile.display_name}'s profile.`);
      },
    });
  }

  // ---------- sign in / up ----------
  function renderAuth(msg = '', bad = false) {
    const signup = mode === 'signup', reset = mode === 'reset';
    $('auth-title').textContent = reset ? 'Reset your password' : signup ? 'Create your account' : 'Sign in to play';
    $('auth-pass-row').hidden = reset;
    $('auth-age-row').hidden = !signup;
    $('auth-submit').textContent = reset ? 'Send reset email' : signup ? 'Create account' : 'Sign in';
    $('auth-switch').innerHTML = reset ? '<button class="linkbtn" data-auth="signin">Back to sign in</button>'
      : signup ? 'Already have an account? <button class="linkbtn" data-auth="signin">Sign in</button>'
      : 'New here? <button class="linkbtn" data-auth="signup">Create an account</button> · <button class="linkbtn" data-auth="reset">Forgot password?</button>';
    $('auth-google').hidden = !CONFIG.auth.google || reset;
    $('auth-msg').textContent = msg;
    $('auth-msg').className = 'fb-status ' + (msg ? (bad ? 'bad' : 'good') : '');
  }

  async function submitAuth(ev) {
    ev.preventDefault();
    const email = $('auth-email').value.trim(), pass = $('auth-pass').value;
    if (!online()) return renderAuth('You need an internet connection to sign in (just the first time on this phone).', true);
    if (!email) return renderAuth('Enter your email.', true);
    $('auth-submit').disabled = true;
    try {
      if (mode === 'reset') {
        const { error } = await client().auth.resetPasswordForEmail(email);
        if (error) throw error;
        renderAuth('Check your email for a reset link. It opens All Ashore — set your new password there, then come back and sign in.');
      } else if (mode === 'signup') {
        if (!$('auth-age').checked) throw new Error("Please confirm you're 13 or older. Kids play on profiles you add after signing up.");
        if (pass.length < 8) throw new Error('Use at least 8 characters for your password.');
        const { data, error } = await client().auth.signUp({ email, password: pass });
        if (error) throw error;
        if (data.session) { session = data.session; await loadProfiles(); return choose(); }
        mode = 'signin';
        renderAuth('Account created! Check your email to confirm it, then sign in here.');
      } else {
        const { data, error } = await client().auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        session = data.session;
        $('auth-pass').value = '';
        await loadProfiles();
        choose();
      }
    } catch (e) {
      renderAuth(friendly(e), true);
    } finally {
      $('auth-submit').disabled = false;
    }
  }
  function friendly(e) {
    const m = (e && e.message) || String(e);
    if (/invalid login/i.test(m)) return 'That email and password don’t match. (It’s the same login as All Ashore.)';
    if (/not confirmed/i.test(m)) return 'Please confirm your email first — check your inbox for the link.';
    if (/already registered/i.test(m)) return 'There’s already an account with that email — sign in instead (same as All Ashore).';
    if (/fetch|network/i.test(m)) return 'Couldn’t reach the server. Check your connection and try again.';
    return m;
  }
  async function google() {
    try { await client().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } }); }
    catch (e) { renderAuth(friendly(e), true); }
  }

  // ---------- profiles ----------
  function renderProfiles(msg = '') {
    const cards = profiles.map((p) => `<button class="pcard" data-pid="${p.id}">
        <div class="pduck">${ART.duckSVG({ line: p.is_kid ? 'pool' : 'crew', form: p.is_kid ? 1 : 3 })}</div>
        <b>${esc(p.display_name)}</b>${p.is_kid ? '<small>Kid</small>' : ''}</button>`).join('');
    $('profiles-grid').innerHTML = cards || '<p class="empty">Create your first player to start.</p>';
    $('profiles-add').hidden = profiles.length >= 8;
    $('profiles-form').hidden = profiles.length > 0;
    $('pf-kid-row').hidden = profiles.length === 0;   // the first profile is the account holder's own
    $('profiles-msg').textContent = msg;
    $('profiles-email').textContent = (session && session.user && session.user.email) || '';
  }
  async function createProfile(ev) {
    ev.preventDefault();
    const name = $('pf-name').value.trim().slice(0, 20);
    const isKid = !$('pf-kid-row').hidden && $('pf-kid').checked;
    if (!name) return renderProfiles('Enter a name (first name or nickname).');
    if (!online()) return renderProfiles('You need a connection to add a player.');
    $('pf-submit').disabled = true;
    try {
      const { data, error } = await client().from('dds_profiles').insert({ account_id: uid(), display_name: name, is_kid: isKid })
        .select('id, display_name, is_kid, avatar, created_at').single();
      if (error) throw error;
      profiles.push(data);
      LS.set('dds_profiles:' + uid(), profiles);
      $('pf-name').value = ''; $('pf-kid').checked = false;
      if (profiles.length === 1) return open(data);
      renderProfiles(`Added ${data.display_name}.`);
    } catch (e) {
      renderProfiles(/limit/i.test(e.message || '') ? 'You can have up to 8 players.' : friendly(e));
    } finally { $('pf-submit').disabled = false; }
  }

  async function signOut() {
    await Sync.flush();
    Sync.stop();
    profile = null;
    try { await client().auth.signOut(); } catch (e) {}
    session = null;
    mode = 'signin'; renderAuth();
    App.go('auth');
  }
  function switchPlayer() {
    Sync.flush();
    renderProfiles();
    App.go('profiles');
  }

  function init() {
    $('auth-form').addEventListener('submit', submitAuth);
    $('auth-google').onclick = google;
    document.addEventListener('click', (ev) => {
      const a = ev.target.closest('[data-auth]');
      if (a) { mode = a.dataset.auth; renderAuth(); return; }
      const p = ev.target.closest('[data-pid]');
      if (p) { const pr = profiles.find((x) => x.id === p.dataset.pid); if (pr) open(pr); return; }
    });
    $('profiles-add').onclick = () => { $('profiles-form').hidden = false; $('pf-kid-row').hidden = false; $('pf-name').focus(); };
    $('profiles-form').addEventListener('submit', createProfile);
    document.querySelectorAll('[data-signout]').forEach((b) => (b.onclick = signOut));
    document.querySelectorAll('[data-switch]').forEach((b) => (b.onclick = switchPlayer));
  }

  return { init, boot, client, signOut, switchPlayer, current: () => profile, session: () => session, _profiles: () => profiles };
})();

// ---------------- Sync: phone ⇄ account ----------------
// Saves (everything but ducks) are one row per profile; each duck is its own row.
// Local copy is used for play; uploads are batched a few seconds after changes and retried when back online.
const Sync = (() => {
  let pid = null, timer = 0, busy = false, meta = null, retry = 0;
  const LS = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const key = () => 'dds_sync:' + pid;
  const saveMeta = () => LS.set(key(), meta);
  function hash(o) {
    const s = JSON.stringify(o); let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return h.toString(36);
  }
  function status(t, cls = '') { const el = document.getElementById('sync-status'); if (el) { el.textContent = t; el.className = 'sync ' + cls; } }

  async function start(profileId) {
    stop();
    pid = profileId;
    meta = LS.get(key()) || { rev: 0, hashes: {}, dirty: true, pulled: false };
    Store.onSave(() => schedule());
    await pull();
    schedule(500);
    retry = setInterval(() => { if (meta && meta.dirty) push(); }, 60 * 1000);
  }
  function stop() { clearTimeout(timer); clearInterval(retry); timer = 0; Store.onSave(null); pid = null; }
  function schedule(ms = 2500) {
    if (!pid) return;
    meta.dirty = true; saveMeta();
    status('Saving…');
    clearTimeout(timer);
    timer = setTimeout(push, ms);
  }

  async function pull() {
    if (navigator.onLine === false) return status('Offline — will sync', 'off');
    try {
      const sb = Account.client();
      const [{ data: save, error: e1 }, { data: rows, error: e2 }] = await Promise.all([
        sb.from('dds_saves').select('state, rev, updated_at').eq('profile_id', pid).maybeSingle(),
        sb.from('dds_creatures').select('id, data').eq('profile_id', pid).is('released_at', null),
      ]);
      if (e1 || e2) throw (e1 || e2);
      if (!save) { meta.pulled = true; saveMeta(); return; }            // brand-new profile: our copy goes up
      const S = Store.get();
      const serverCrew = (rows || []).map((r) => r.data);
      const localFresh = meta.rev === 0 && (S.stats.catches || 0) === 0 && S.crew.length === 0;
      if (localFresh || (!meta.dirty && save.rev >= meta.rev)) {
        // take the account's copy (new device, or another device played since)
        Store.replace({ ...save.state, crew: serverCrew });
      } else {
        // both changed: keep this phone's numbers, add any ducks that only exist on the account
        const have = new Set(S.crew.map((c) => c.id));
        const released = new Set(S.releasedIds || []);
        for (const c of serverCrew) if (!have.has(c.id) && !released.has(c.id)) S.crew.push(c);
        for (const k of ['everHeld', 'goldHeld', 'colorsHeld', 'accHeld', 'stamps'])
          S[k] = { ...((save.state || {})[k] || {}), ...(S[k] || {}) };
        Store.save(true);
      }
      meta.rev = Math.max(meta.rev, save.rev);
      meta.hashes = {};
      for (const c of serverCrew) meta.hashes[c.id] = hash(c);
      meta.pulled = true; saveMeta();
      App.refresh();
      status('Synced ✓', 'ok');
    } catch (e) { status('Offline — will sync', 'off'); }
  }

  async function push() {
    if (!pid || busy) return;
    if (navigator.onLine === false || !Account.session()) return status('Offline — will sync', 'off');
    busy = true;
    const myPid = pid;
    try {
      const sb = Account.client();
      const S = Store.get();
      const state = { ...S }; delete state.crew;
      const now = new Date().toISOString();
      const nextRev = meta.rev + 1;
      const changed = [];
      const newHashes = {};
      for (const c of S.crew) {
        const h = hash(c); newHashes[c.id] = h;
        if (meta.hashes[c.id] !== h) changed.push({ id: c.id, profile_id: myPid, data: c, updated_at: now });
      }
      for (let i = 0; i < changed.length; i += 200) {
        const { error } = await sb.from('dds_creatures').upsert(changed.slice(i, i + 200), { onConflict: 'id' });
        if (error) throw error;
      }
      const released = [...(S.releasedIds || [])];
      if (released.length) {
        const { error } = await sb.from('dds_creatures').update({ released_at: now, updated_at: now }).in('id', released);
        if (error) throw error;
      }
      const { error: e3 } = await sb.from('dds_saves').upsert({ profile_id: myPid, state, rev: nextRev, updated_at: now }, { onConflict: 'profile_id' });
      if (e3) throw e3;
      if (pid !== myPid) return;
      if (released.length) { S.releasedIds = (S.releasedIds || []).filter((id) => !released.includes(id)); Store.save(true); }
      meta.rev = nextRev; meta.hashes = newHashes; meta.dirty = false; saveMeta();
      status('Synced ✓', 'ok');
    } catch (e) {
      status('Offline — will sync', 'off');
    } finally { busy = false; }
  }
  async function flush() { clearTimeout(timer); if (meta && meta.dirty) await push(); }

  window.addEventListener('online', () => { if (pid && meta) (meta.pulled ? push() : pull().then(push)); });
  window.addEventListener('offline', () => { if (pid) status('Offline — will sync', 'off'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && pid) flush(); });

  return { start, stop, schedule, flush, push, pull, _meta: () => meta };
})();
