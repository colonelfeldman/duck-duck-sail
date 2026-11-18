// Screens, navigation, overlays, signs, feedback, updates.
const App = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let current = 'deck';
  let detailId = null;
  let deckTick = 0;

  const fmtDur = (ms) => {
    ms = Math.max(0, ms);
    const s = Math.ceil(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // ================= navigation =================
  function go(name, arg) {
    if (current === 'catch' && name !== 'catch' && Catch.active()) Catch.cleanup();
    if (current === 'scan' && name !== 'scan') Scanner.stop();
    if (current === 'look' && name !== 'look') Recognize.stop();
    cancelFx();
    closeMenu();
    current = name;
    document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== 'scr-' + name; });
    document.body.dataset.screen = name;
    if (name === 'deck') renderDeck();
    if (name === 'crew') renderCrew();
    if (name === 'detail') { detailId = arg || detailId; renderDetail(); }
    if (name === 'passport') renderPassport();
    if (name === 'signs') renderSigns();
    if (name === 'scan') Scanner.start();
    if (name === 'look') { if (crewFull()) return go('deck'); Recognize.start(); }
    window.scrollTo(0, 0);
  }
  const screen = () => current;

  // ================= encounters =================
  function activeVenue() {
    const S = Store.get();
    if (S.venue && S.venue.until > Date.now()) return SIGNS.find((s) => s.id === S.venue.signId) || null;
    return null;
  }
  function venueOpts(sign) {
    if (!sign) return { provenance: 'Caught on board (ship mode)' };
    return {
      weights: sign.weights || CONFIG.spawnWeights,
      lines: sign.lines || null,
      port: sign.port || null,          // port day: that port's own duck can appear
      xpMult: sign.xpMult || 1,
      provenance: sign.port ? `Caught in ${sign.port} (port sign)` : `Caught at ${sign.name} (sign scan)`,
      label: sign.port ? `📍 ${sign.port}` : `📍 ${sign.name}`,
    };
  }
  function encounterWait() {
    const S = Store.get(), now = Date.now();
    S.encounterLog = (S.encounterLog || []).filter((t) => now - t < 3600 * 1000);
    let wait = Math.max(0, (S.nextEncounterAt || 0) - now);
    if (S.encounterLog.length >= CONFIG.encountersPerHourCap) {
      wait = Math.max(wait, S.encounterLog[0] + 3600 * 1000 - now);
    }
    return wait;
  }
  function crewFull() {
    if (Store.get().crew.length < CONFIG.crewCap) return false;
    openSheet({ html: `<h2>Your crew is full</h2><p>You have ${CONFIG.crewCap} creatures. Release some to the Harbormaster to make room.</p>
      <div class="row"><button class="btn primary" data-close>OK</button></div>` });
    return true;
  }
  function startTimedEncounter() {
    if (encounterWait() > 0 || crewFull()) return;
    const S = Store.get();
    S.nextEncounterAt = Date.now() + CONFIG.encounterCooldownMs;
    S.encounterLog.push(Date.now());
    Store.save();
    Catch.start(venueOpts(activeVenue()));
  }

  // ================= deck =================
  function renderDeck() {
    const S = Store.get();
    const need = CONFIG.xpToNext(S.level);
    const maxed = S.level >= CONFIG.voyagerMax;
    $('d-level').textContent = S.level;
    $('d-xp').textContent = maxed ? 'Max level' : `${S.xp} / ${need} XP`;
    $('d-xpbar').style.width = maxed ? '100%' : (100 * S.xp / need) + '%';
    $('d-shells').textContent = S.shells;
    $('d-treats').textContent = S.treats.duck || 0;
    $('d-crew').textContent = `${S.crew.length}`;
    $('d-life').textContent = S.rings.life || 0;
    $('d-lifecap').textContent = '/' + Store.bagCap();
    $('d-topup').hidden = !Store.canTopUp();
    $('d-premium').textContent = S.rings.premium;
    $('d-golden').textContent = S.rings.golden;
    tickDeck();
    if (!deckTick) deckTick = setInterval(() => { if (current === 'deck' && Store.get()) tickDeck(); }, 1000);
  }
  function tickDeck() {
    const v = activeVenue();
    const vb = $('d-venue');
    if (v) {
      vb.hidden = false;
      vb.innerHTML = `📍 <b>${esc(v.port || v.name)}</b> active · ${fmtDur(Store.get().venue.until - Date.now())} left<small>${esc(v.blurb)}</small>`;
    } else vb.hidden = true;
    const wait = encounterWait();
    const btn = $('d-encounter');
    if (wait > 0) {
      btn.disabled = true;
      btn.innerHTML = `<span class="big">🌊</span><span>Next duck in <b>${fmtDur(wait)}</b></span>`;
    } else {
      btn.disabled = false;
      btn.innerHTML = `<span class="big">🦆</span><span><b>A duck is nearby!</b> Tap to catch it</span>`;
    }
  }

  // ================= crew =================
  function renderCrew() {
    const S = Store.get();
    const sort = $('crew-sort').value;
    const list = [...S.crew];
    if (sort === 'power') list.sort((a, b) => Store.sailPower(b) - Store.sailPower(a));
    else if (sort === 'level') list.sort((a, b) => b.level - a.level);
    else if (sort === 'form') list.sort((a, b) => b.form - a.form || Store.sailPower(b) - Store.sailPower(a));
    $('crew-count').textContent = `${S.crew.length} / ${CONFIG.crewCap}`;
    $('crew-grid').innerHTML = list.length ? list.map((c) => `
      <button class="crew-card ${c.gold ? 'gold' : ''}" data-id="${c.id}">
        <div class="art">${ART.duckSVG(c)}</div>
        <div class="nm">${c.gold ? '✨ ' : ''}${esc(Store.displayName(c))}</div>
        <div class="sub">Lv ${c.level} · SP ${Store.sailPower(c)}</div>
      </button>`).join('')
      : `<p class="empty">No crew yet. Head back to the Deck and catch your first duck!</p>`;
  }

  // ================= detail =================
  function getDetail() { return Store.get().crew.find((c) => c.id === detailId); }

  function renderDetail() {
    const c = getDetail();
    if (!c) return go('crew');
    const S = Store.get();
    const pu = Store.canPowerUp(c), pr = Store.canPromote(c);
    const next = c.line !== 'port' && c.form < 3 ? DUCK_LINES[c.line || 'crew'].forms[c.form + 1] : null;
    const variant = [c.color && COLOR_NAMES[c.color] && !c.gold ? COLOR_NAMES[c.color] + ' colour' : '', c.acc ? ACCESSORY_NAMES[c.acc] : ''].filter(Boolean).join(' · ');
    $('detail-body').innerHTML = `
      <div class="detail-art ${c.gold ? 'gold' : ''}" id="detail-art">${ART.duckSVG(c)}</div>
      <h2>${c.gold ? '✨ ' : ''}${esc(Store.displayName(c))}</h2>
      <p class="rar">${esc(Store.rarity(c))} · ${c.line === 'port' ? esc(Store.lineName(c)) : `${esc(Store.lineName(c))} · Form ${c.form} of 3`}</p>
      ${variant ? `<p class="variant">${esc(variant)}</p>` : ''}
      <div class="statgrid">
        <div><small>Level</small><b id="dt-level">${c.level}</b></div>
        <div><small>Sail Power</small><b id="dt-sp">${Store.sailPower(c)}</b></div>
        <div><small>Size</small><b>${c.size}</b></div>
      </div>
      <div class="actions">
        <button class="btn primary" id="dt-power" ${pu.ok ? '' : 'disabled'}>
          ⚡ Power Up <small>${pu.cost.shells} Shells + ${pu.cost.treats} Treats${pu.ok ? '' : ' · ' + pu.why}</small></button>
        ${next ? `<button class="btn promo" id="dt-promote" ${pr.ok ? '' : 'disabled'}>
          ⭐ Promote to ${next} <small>${pr.cost} Duck Treats${pr.ok ? '' : ' · ' + pr.why}</small></button>`
          : `<p class="note">${c.line === 'port' ? 'Port ducks keep their special look — they can still power up.' : esc(Store.formName(c)) + ' is the final form.'}</p>`}
      </div>
      <p class="wallet">You have ${S.shells} Shells · ${S.treats.duck || 0} Duck Treats</p>
      <h3>Logbook</h3>
      <ul class="prov">
        <li>Caught ${new Date(c.caughtAt).toLocaleString()}</li>
        ${c.provenance.map((p) => `<li>${esc(p)}</li>`).join('')}
      </ul>
      <p class="cid">ID ${esc(c.id)}</p>
      <button class="btn danger" id="dt-release">Release to the Harbormaster (+${CONFIG.releaseTreats} Treat)</button>`;
    $('dt-power').onclick = () => doPowerUp(c);
    if ($('dt-promote')) $('dt-promote').onclick = () => doPromote(c);
    $('dt-release').onclick = () => doRelease(c);
  }

  // ---- FX (power-up / promotion) — tap to skip ----
  let fx = null;
  function cancelFx() {
    if (!fx) return;
    fx.timers.forEach(clearTimeout);
    cancelAnimationFrame(fx.raf);
    $('fx').hidden = true;
    $('fx').innerHTML = '';
    fx = null;
  }
  function fxLater(fn, ms) { const f = fx; const id = setTimeout(() => { if (fx === f) fn(); }, ms); fx.timers.push(id); }
  function particles(host, n, cls) {
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.className = 'pt ' + cls;
      const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 90;
      s.style.setProperty('--dx', Math.cos(a) * d + 'px');
      s.style.setProperty('--dy', Math.sin(a) * d - 40 + 'px');
      s.style.animationDelay = (Math.random() * 0.25) + 's';
      s.textContent = Math.random() < 0.5 ? '✦' : '★';
      host.appendChild(s);
    }
  }

  function doPowerUp(c) {
    const r = Store.powerUp(c);
    if (!r) return renderDetail();
    cancelFx();
    fx = { timers: [], raf: 0, finish: null };
    const host = $('fx');
    host.hidden = false;
    host.innerHTML = `<div class="fx-art glow hop">${ART.duckSVG(c, 'happy')}</div>
      <div class="fx-float">+1 LEVEL</div><div class="fx-sp">Sail Power <b id="fx-sp">${r.before}</b></div><small class="fx-skip">tap to skip</small>`;
    particles(host, 16, 'star');
    const t0 = performance.now();
    const tick = (now) => {
      if (!fx) return;
      const u = Math.min(1, (now - t0) / 800);
      const n = $('fx-sp'); if (n) n.textContent = Math.round(r.before + (r.after - r.before) * u);
      if (u < 1) fx.raf = requestAnimationFrame(tick);
    };
    fx.raf = requestAnimationFrame(tick);
    fx.finish = () => { cancelFx(); renderDetail(); };
    fxLater(() => fx.finish(), 1100);
  }

  function doPromote(c) {
    const before = { ...c };
    const r = Store.promote(c);
    if (!r) return renderDetail();
    cancelFx();
    fx = { timers: [], raf: 0, finish: null };
    const host = $('fx');
    host.hidden = false;
    host.innerHTML = `<div class="fx-art charging" id="fx-art">${ART.duckSVG(before)}</div>
      <div class="fx-flash" id="fx-flash"></div><div class="fx-burst" id="fx-burst"></div><small class="fx-skip">tap to skip</small>`;
    particles(host, 10, 'rise');
    fxLater(() => {
      $('fx-flash').classList.add('on');
      $('fx-burst').classList.add('on');
      const art = $('fx-art');
      art.className = 'fx-art emerge';
      art.innerHTML = ART.duckSVG(c, 'happy');
      particles(host, 18, 'star');
    }, 1000);
    fxLater(() => {
      const b = document.createElement('div');
      b.className = 'fx-banner';
      b.innerHTML = `PROMOTED!<small>${esc(r.oldName)} became ${esc(r.newName)}!</small>`;
      host.appendChild(b);
    }, 1250);
    fx.finish = () => { cancelFx(); renderDetail(); if (r.levelUps.length) levelUpBanner(r.levelUps); };
    fxLater(() => fx.finish(), 2600);
  }

  function doRelease(c) {
    const rareColor = c.color && c.color !== 'yellow';
    const special = c.form === 3 || c.gold || c.promoted || c.line === 'port' || rareColor;
    openSheet({
      html: `<h2>Release ${esc(Store.displayName(c))}?</h2>
        <p>Lv ${c.level} · SP ${Store.sailPower(c)}. The Harbormaster will look after it, and you'll get +${CONFIG.releaseTreats} Duck Treat.</p>
        <div class="row"><button class="btn" data-close>Keep it</button><button class="btn danger" data-act="yes">Release</button></div>`,
      onAct: (act) => {
        if (act !== 'yes') return;
        if (!special) return finish();
        const why = [c.form === 3 && 'Rare', c.line === 'port' && 'port-day', c.gold && 'Gold', rareColor && COLOR_NAMES[c.color], c.promoted && 'promoted'].filter(Boolean).join(', ');
        openSheet({
          html: `<h2>Are you really sure?</h2><p>This is a <b>${why}</b> duck. Releasing it can't be undone.</p>
            <div class="row"><button class="btn primary" data-close>Keep it</button><button class="btn danger" data-act="yes">Yes, release</button></div>`,
          onAct: (a2) => { if (a2 === 'yes') finish(); },
        });
      },
    });
    function finish() {
      Store.release(c);
      closeSheet();
      toast(`${Store.displayName(c)} went to the Harbormaster. +${CONFIG.releaseTreats} Duck Treat`);
      go('crew');
    }
  }

  // ================= passport =================
  function renderPassport() {
    const S = Store.get();
    let got = 0, total = 0;
    const slot = (c, held, label, k) => `<div class="slot ${held ? 'got' : 'unseen'}">${ART.duckSVG(c)}
        <small>${held ? esc(label) : '???'}</small>${S.goldHeld[k] ? '<i class="goldstar" title="Gold collected">✨</i>' : ''}</div>`;
    const lines = Object.entries(DUCK_LINES).map(([id, L]) => {
      const cells = [1, 2, 3].map((n) => {
        const k = `${id}-${n}`, held = !!S.everHeld[k];
        total++; if (held) got++;
        return slot({ line: id, form: n }, held, L.forms[n], k);
      }).join('');
      return `<div class="fam"><h3>${L.name} <small>line</small></h3><div class="forms">${cells}</div></div>`;
    }).join('');
    const ports = Object.entries(PORT_DUCKS);
    const portCells = ports.map(([port, info]) => {
      const k = `port:${port}`, held = !!S.everHeld[k];
      total++; if (held) got++;
      return slot({ line: 'port', port, form: 1 }, held, info.name, k);
    }).join('');
    const others = FAMILIES.filter((f) => !f.built).map((f) => `<div class="fam locked"><h3>${f.name}</h3><div class="forms">
        ${[1, 2, 3].map(() => `<div class="slot"><span>?</span></div>`).join('')}</div><small>Coming later</small></div>`).join('');
    const colors = Object.keys(COLOR_NAMES).map((k) => `<span class="chip ${S.colorsHeld[k] ? 'got' : ''}">${S.colorsHeld[k] ? COLOR_NAMES[k] : '?'}</span>`).join('')
      + `<span class="chip ${Object.keys(S.goldHeld).length ? 'got' : ''}">${Object.keys(S.goldHeld).length ? 'Gold' : '?'}</span>`;
    const accs = Object.keys(ACCESSORY_NAMES).map((k) => `<span class="chip ${S.accHeld[k] ? 'got' : ''}">${S.accHeld[k] ? ACCESSORY_NAMES[k] : '?'}</span>`).join('');
    $('passport-body').innerHTML = `
      <p class="pcount"><b>${got}</b> / ${total} ducks collected</p>
      ${lines}
      <div class="fam"><h3>Port Ducks <small>only on that port's day</small></h3><div class="forms">${portCells}</div></div>
      <div class="fam"><h3>Rare colours</h3><div class="chips">${colors}</div>
        <h3>Accessories</h3><div class="chips">${accs}</div></div>
      <h3 class="stamps-h">Port Stamps</h3>
      <div class="stamps">${Object.keys(S.stamps).length ? Object.entries(S.stamps).map(([p, t]) =>
        `<div class="stamp"><b>${esc(p)}</b><small>${new Date(t).toLocaleDateString()}</small></div>`).join('')
        : '<p class="empty">No stamps yet. Scan a port sign ashore to collect one.</p>'}</div>
      <h3>More creatures</h3>${others}`;
  }

  // ================= sign cards =================
  function qrSVG(text, cell = 6) {
    try {
      const q = qrcode(0, 'M');
      q.addData(text);
      q.make();
      return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
    } catch (e) { return `<p>QR unavailable</p>`; }
  }
  function renderSigns() {
    $('signs-grid').innerHTML = SIGNS.map((s) => `
      <button class="signcard sign-${s.style}" data-sign="${s.id}">
        <div class="sc-name">${esc(s.name)}</div>
        <div class="sc-qr">${qrSVG(s.id)}</div>
        <div class="sc-blurb">${esc(s.blurb)}</div>
        <small>Tap to show full screen</small>
      </button>`).join('');
  }
  function showSignFull(id) {
    const s = SIGNS.find((x) => x.id === id);
    if (!s) return;
    const o = $('signfull');
    o.className = 'overlay signfull sign-' + s.style;
    o.innerHTML = `<button class="x" data-close aria-label="Close">✕</button>
      <div class="sf-name">${esc(s.name)}</div><div class="sf-qr">${qrSVG(s.id, 10)}</div>
      <p>Scan this with another phone running Duck, Duck, Sail!</p>`;
    o.hidden = false;
  }

  // ================= sign scanning =================
  function handleSignPayload(text) {
    const sign = SIGNS.find((s) => s.id === String(text).trim());
    if (!sign) {
      openSheet({ html: `<h2>Not a game sign</h2><p>That code isn't a Duck, Duck, Sail! sign.</p>
        <div class="row"><button class="btn primary" data-close>OK</button></div>`, onClose: resumeScan });
      return;
    }
    const S = Store.get(), now = Date.now();
    const last = S.signCooldowns[sign.id];
    if (last && now - last < CONFIG.signCooldownMs) return cooldownSheet(sign);
    S.signCooldowns[sign.id] = now;
    // Port signs start that port's day (until midnight). Ship signs last CONFIG.venueMs.
    const midnight = new Date(); midnight.setHours(24, 0, 0, 0);
    S.venue = { signId: sign.id, until: sign.port ? midnight.getTime() : now + CONFIG.venueMs };
    let ringMsg = '';
    if (sign.lifeRefill) {
      const left = (S.lifeScanAt || 0) + CONFIG.lifeRings.scanCooldownMs - now;
      if (left > 0) ringMsg = `Life Rings restock again in ${fmtDur(left)}.`;
      else {
        const got = Store.addLifeRings(CONFIG.lifeRings.scanRefill);
        if (got) { S.lifeScanAt = now; ringMsg = `🛟 +${got} Life Rings (${S.rings.life}/${Store.bagCap()})`; }
        else ringMsg = 'Your ring bag is full.';
      }
    }
    let stampNew = false;
    if (sign.port) { stampNew = !S.stamps[sign.port]; S.stamps[sign.port] = S.stamps[sign.port] || now; }
    Store.save();
    openSheet({
      html: `<div class="sheet-sign sign-${sign.style}">${esc(sign.name)}</div>
        <h2>Sign spotted: ${esc(sign.name)}</h2>
        <p>${esc(sign.blurb)} ${sign.port ? `It's ${esc(sign.port)} port day until midnight.` : `This spot stays active for ${Math.round(CONFIG.venueMs / 60000)} minutes.`}</p>
        ${ringMsg ? `<p class="stampnote">${esc(ringMsg)}</p>` : ''}
        ${sign.port ? `<p class="stampnote">🛂 ${stampNew ? 'New Port Stamp' : 'Port Stamp'}: <b>${esc(sign.port)}</b> is in your Passport.</p>` : ''}
        <div class="row"><button class="btn" data-close>Later</button><button class="btn primary" data-act="start">Start Encounter</button></div>`,
      onAct: (act) => {
        if (act !== 'start') return;
        closeSheet(true);       // silent: don't restart the scanner on the way into the catch
        if (crewFull()) return;
        Catch.start(venueOpts(sign));     // bypasses the encounter timer
      },
      onClose: resumeScan,
    });
  }

  // §7.3: closing the sheet cancels its countdown; a tick only refreshes a sheet that is still open.
  function cooldownSheet(sign) {
    const left = () => Store.get().signCooldowns[sign.id] + CONFIG.signCooldownMs - Date.now();
    const body = () => `<h2>${esc(sign.name)}</h2><p>You've already scanned this sign. It recharges in <b>${fmtDur(left())}</b>.</p>
      <div class="row"><button class="btn primary" data-close>OK</button></div>`;
    openSheet({
      html: body(),
      tickMs: 1000,
      onTick: (sheetEl) => {
        if (left() <= 0) { sheetEl.querySelector('.sheet-body').innerHTML = `<h2>${esc(sign.name)}</h2><p>Recharged! Scan it again.</p>
          <div class="row"><button class="btn primary" data-close>OK</button></div>`; return false; }
        sheetEl.querySelector('.sheet-body').innerHTML = body();
        return true;
      },
      onClose: resumeScan,
    });
  }
  function resumeScan() { if (current === 'scan') Scanner.start(); }

  // ================= sheet (modal) =================
  let sheet = { open: false, token: 0, interval: 0, onClose: null, onAct: null };
  function openSheet({ html, onAct, onClose, onTick, tickMs }) {
    closeSheet(true);
    const el = $('sheet');
    sheet.token += 1;
    const myToken = sheet.token;
    sheet.open = true;
    sheet.onAct = onAct || null;
    sheet.onClose = onClose || null;
    el.querySelector('.sheet-body').innerHTML = html;
    el.hidden = false;
    if (onTick) {
      sheet.interval = setInterval(() => {
        if (!sheet.open || sheet.token !== myToken) return;   // never reopen/refresh a dismissed sheet
        if (onTick(el) === false) { clearInterval(sheet.interval); sheet.interval = 0; }
      }, tickMs || 1000);
    }
  }
  function closeSheet(silent) {
    if (sheet.interval) { clearInterval(sheet.interval); sheet.interval = 0; }
    const was = sheet.open;
    const cb = sheet.onClose;
    sheet.open = false;
    sheet.onClose = null;
    sheet.onAct = null;
    sheet.token += 1;
    $('sheet').hidden = true;
    if (was && !silent && cb) cb();
  }

  // ================= overlays: menu, how to, feedback, safety =================
  function openOverlay(id) { $(id).hidden = false; }
  function closeOverlay(id) { $(id).hidden = true; }
  function openMenu() { openOverlay('menu'); }
  function closeMenu() { closeOverlay('menu'); }

  function openFeedback() {
    closeMenu();
    $('fb-status').textContent = '';
    $('fb-status').className = 'fb-status';
    $('fb-send').disabled = false;
    openOverlay('feedback');
    setTimeout(() => $('fb-message').focus(), 50);
  }
  async function sendFeedback(ev) {
    ev.preventDefault();
    const msg = $('fb-message').value.trim();
    const st = $('fb-status');
    if (!msg) { st.textContent = 'Please write a message first.'; st.className = 'fb-status bad'; return; }
    $('fb-send').disabled = true;
    st.textContent = 'Sending…'; st.className = 'fb-status';
    const body = {
      message: msg.slice(0, 4000),
      name: $('fb-name').value.trim().slice(0, 100) || null,
      contact: $('fb-contact').value.trim().slice(0, 200) || null,
      app_version: VERSION + (TESTING ? '-test' : ''),
      screen: current,
      user_agent: navigator.userAgent.slice(0, 500),
    };
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 12000);
    try {
      const res = await fetch(`${CONFIG.supabase.url}/rest/v1/dds_feedback`, {
        method: 'POST',
        headers: {
          apikey: CONFIG.supabase.anonKey,
          Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      clearTimeout(to);
      if (!res.ok) throw new Error(`server said ${res.status}`);
      $('fb-message').value = '';
      st.textContent = 'Thanks! Your feedback was sent.';
      st.className = 'fb-status good';
    } catch (e) {
      clearTimeout(to);
      const why = e.name === 'AbortError' ? 'the connection timed out' : (navigator.onLine === false ? "you're offline" : (e.message || 'network error'));
      st.textContent = `Couldn't send — ${why}. Your message is still here; try again when you have a connection.`;
      st.className = 'fb-status bad';
    } finally {
      $('fb-send').disabled = false;
    }
  }

  // ================= stats (this phone only) =================
  function renderStats() {
    const S = Store.get();
    const rs = S.recogStats || { found: 0, caught: 0, byCat: {}, byForm: {}, labels: {} };
    // ducks caught before stats existed: count from the crew's logbooks
    const camCrew = S.crew.filter((c) => String(c.provenance[0] || '').includes('(camera')).length;
    const row = (k, v) => `<div class="srow"><span>${esc(k)}</span><b>${v}</b></div>`;
    const byLine = S.stats.byLine || {};
    const lines = Object.entries(DUCK_LINES).map(([id, L]) => row(L.name + ' line', byLine[id] || 0)).join('') + row('Port ducks', byLine.port || 0);
    const cats = RECOGNIZE_CATEGORIES.map((c) => row(c.name + ' → ' + DUCK_LINES[c.line].name, rs.byCat[c.id] || 0)).join('');
    const forms = [1, 2, 3].map((f) => row({ 1: 'Partial match (Form 1)', 2: 'Strong match (Form 2)', 3: 'Excellent match (Form 3)' }[f], rs.byForm[f] || 0)).join('');
    const labels = Object.entries(rs.labels).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => row(k, v)).join('') || '<p class="note">Nothing yet.</p>';
    $('stats-body').innerHTML = `
      <h3>Catching</h3>${row('Ducks caught', S.stats.catches)}${row('Rings thrown', S.stats.throws)}${row('In your crew now', S.crew.length)}
      <h3>By duck line</h3>${lines}
      <h3>Look for ducks (camera)</h3>
      ${row('Ducks found by the camera', rs.found)}${row('…of those, caught', Math.max(rs.caught, camCrew))}
      ${row('Found today', (S.recog && S.recog.day === new Date().toLocaleDateString('en-CA')) ? S.recog.count + ' / ' + CONFIG.recognize.dailyCap : '0 / ' + CONFIG.recognize.dailyCap)}
      <h3>What it found</h3>${cats}
      <h3>Match strength</h3>${forms}
      <h3>Things the camera recognized</h3>${labels}`;
  }

  // ================= banners / toasts =================
  let bannerTimer = 0;
  function levelUpBanner(levelUps) {
    const last = levelUps[levelUps.length - 1];
    const rewards = levelUps.flatMap((l) => l.rewards.slice(0, 1));
    rewards.push(last.rewards[1]);
    const b = $('lvl-banner');
    b.innerHTML = `<b>Voyager Level ${last.level}!</b><span>${rewards.map(esc).join(' · ')}</span>`;
    b.hidden = false;
    b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { b.hidden = true; }, 4500);
  }
  let toastTimer = 0;
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ================= updates =================
  async function checkVersion() {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (j.version && j.version !== VERSION) {
        const bar = $('update-bar');
        bar.dataset.v = j.version;
        // Already tried this exact version and still got the old files? The host is still publishing.
        const tried = new URLSearchParams(location.search).get('v') === j.version;
        bar.textContent = tried ? 'Update still arriving — tap to try again' : 'New version available — tap to refresh';
        bar.hidden = false;
      }
    } catch (e) {}
  }

  // ================= init =================
  function init() {
    Catch.init();
    Account.init();
    Scanner.init();
    $('ver').textContent = 'v' + VERSION;
    if (TESTING) document.body.classList.add('testing');
    if (!Store.storageOk()) toast("Heads up: this browser isn't saving progress.");

    // generic delegated actions
    document.addEventListener('click', (ev) => {
      const nav = ev.target.closest('[data-go]');
      if (nav) { ev.preventDefault(); go(nav.dataset.go); return; }
      const c = ev.target.closest('[data-close]');
      if (c) {
        const ov = c.closest('.overlay, .sheet');
        if (ov && ov.id === 'sheet') closeSheet();
        else if (ov) ov.hidden = true;
        return;
      }
      const act = ev.target.closest('#sheet [data-act]');
      if (act && sheet.onAct) { sheet.onAct(act.dataset.act); return; }
    });
    $('d-encounter').onclick = startTimedEncounter;
    $('d-topup').onclick = () => { const got = Store.claimTopUp(); toast(got ? `+${got} Life Rings — happy hunting!` : 'Your ring bag is full.'); renderDeck(); };
    $('menu-btn').onclick = openMenu;
    document.querySelectorAll('[data-feedback]').forEach((b) => (b.onclick = openFeedback));
    document.querySelectorAll('[data-howto]').forEach((b) => (b.onclick = () => { closeMenu(); openOverlay('howto'); }));
    document.querySelectorAll('[data-stats]').forEach((b) => (b.onclick = () => { closeMenu(); renderStats(); openOverlay('stats'); }));
    document.querySelectorAll('[data-safety]').forEach((b) => (b.onclick = () => { closeMenu(); openOverlay('safety'); }));
    $('fb-form').addEventListener('submit', sendFeedback);
    $('crew-sort').onchange = renderCrew;
    $('crew-grid').addEventListener('click', (ev) => { const b = ev.target.closest('[data-id]'); if (b) go('detail', b.dataset.id); });
    $('signs-grid').addEventListener('click', (ev) => { const b = ev.target.closest('[data-sign]'); if (b) showSignFull(b.dataset.sign); });
    $('fx').addEventListener('click', () => { if (fx && fx.finish) fx.finish(); });
    $('lvl-banner').onclick = () => { $('lvl-banner').hidden = true; };
    // Load the page at a brand-new address (?v=<new version>) so no browser or CDN cache can hand back old files.
    // Every file in index.html is also versioned (?v=…), so the new page pulls fresh scripts too.
    $('update-bar').onclick = () => {
      const u = new URL(location.href);
      u.searchParams.set('v', $('update-bar').dataset.v || Date.now());
      u.searchParams.set('r', Date.now().toString(36));
      $('update-bar').textContent = 'Updating…';
      location.replace(u.toString());
    };
    // After a successful update, tidy the address bar (keep ?test=… if present).
    try {
      const u = new URL(location.href);
      if (u.searchParams.get('v') === VERSION) {
        u.searchParams.delete('v'); u.searchParams.delete('r');
        history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash);
      }
    } catch (e) {}
    $('safety-ok').onclick = () => {
      const S = Store.get(); S.seen.safety = true; Store.save();
      closeOverlay('safety');
      if (!S.seen.howto) { S.seen.howto = true; Store.save(); openOverlay('howto'); }
    };
    $('howto-starter').textContent = `${CONFIG.starter.shells} Shells and ${CONFIG.starter.treats} Duck Treats`;
    $('howto-catch').textContent = `+${CONFIG.catchReward.shells} Shells, +${CONFIG.catchReward.treats} Duck Treats`;

    Account.boot();      // sign in → who's playing → enterGame()

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    checkVersion();
    setInterval(checkVersion, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkVersion(); if (current === 'deck' && Store.get()) tickDeck(); } });
  }

  // A profile's save is loaded: start playing.
  function enterGame() {
    go('deck');
    if (!Store.get().seen.safety) openOverlay('safety');
  }
  // Sync pulled new data: redraw whatever is showing.
  function refresh() {
    if (!Store.get()) return;
    if (current === 'deck') renderDeck();
    if (current === 'crew') renderCrew();
    if (current === 'passport') renderPassport();
    if (current === 'detail') renderDetail();
  }

  return { init, go, screen, enterGame, refresh, levelUpBanner, toast, openSheet, closeSheet, handleSignPayload, encounterWait, startTimedEncounter };
})();

// ================= QR scanner (on-device, jsQR; works on Safari) =================
const Scanner = (() => {
  const $ = (id) => document.getElementById(id);
  let stream = null, timer = 0, canvas = null, ctx = null, running = false, gen = 0;

  function init() {
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    const sim = $('scan-sim');
    if (TESTING) {
      sim.hidden = false;
      sim.innerHTML = '<p>Testing only — simulate a scan:</p>' + SIGNS.map((s) =>
        `<button class="btn small" data-sim="${s.id}">${s.name}</button>`).join('') +
        `<button class="btn small" data-sim="HELLO-WORLD">Unknown code</button>`;
      sim.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-sim]');
        if (b) { stop(); App.handleSignPayload(b.dataset.sim); }
      });
    }
  }

  async function start() {
    stop();
    const my = ++gen;
    running = true;
    const st = $('scan-status');
    st.textContent = 'Starting camera…';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      st.textContent = 'This browser can’t use the camera for scanning.';
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (my !== gen || !running) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      const v = $('scan-video');
      v.srcObject = s;
      await v.play().catch(() => {});
      st.textContent = 'Point at a Duck, Duck, Sail! sign';
      timer = setInterval(() => scanFrame(my), 220);
    } catch (e) {
      st.textContent = 'Camera unavailable. Allow camera access to scan signs.';
    }
  }

  function scanFrame(my) {
    if (my !== gen || !running) return;
    const v = $('scan-video');
    if (!v.videoWidth) return;
    const scale = Math.min(1, 640 / v.videoWidth);
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    if (code && code.data) {
      stop();
      if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) {}
      App.handleSignPayload(code.data);
    }
  }

  function stop() {
    running = false;
    gen++;
    clearInterval(timer); timer = 0;
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    const v = $('scan-video'); if (v) v.srcObject = null;
  }

  return { init, start, stop };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
