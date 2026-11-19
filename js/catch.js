// The catch screen: flick throw (with spin/curveball) → landing judged on the duck's live position →
// ring settles around the neck → rescue reel. One shared cleanup path (do-not-regress §7.5).
const Catch = (() => {
  let E = null;              // current encounter; null when none
  let token = 0;             // bumps every encounter so stale callbacks do nothing
  const $ = (id) => document.getElementById(id);

  const el = {};
  function grab() {
    for (const id of ['scr-catch', 'cam', 'sea', 'stage', 'duckwrap', 'flyring', 'rope', 'splash', 'c-info', 'c-msg',
      'c-spin', 'c-spin-fill', 'c-spin-label', 'c-reel', 'c-prog', 'c-tens', 'c-reel-btn', 'c-cue', 'c-bottom',
      'c-rings', 'c-throw', 'c-leave', 'c-x', 'c-cam', 'c-celebrate', 'c-hint', 'c-look', 'c-find']) el[id] = $(id);
    el.rb = el.duckwrap.querySelector('.rb');
    el.dk = el.duckwrap.querySelector('.dk');     // moves as one: ring halves + art (classes go here)
    el.art = el.duckwrap.querySelector('.art');
    el.rf = el.duckwrap.querySelector('.rf');
    el.ropeLine = el.rope.querySelector('line');
  }

  // ---------- tracked timers (§7.2: nothing untracked may navigate) ----------
  function later(fn, ms) {
    if (!E) return null;
    const t = token;
    const id = setTimeout(() => { if (E) E.timers.delete(id); if (t === token && E) fn(); }, ms);
    E.timers.add(id);
    return id;
  }
  function clearLater(id) { if (E && id) { clearTimeout(id); E.timers.delete(id); } }

  // ---------- camera / sea backdrop ----------
  function camPref() { try { return localStorage.getItem('dds_cam') !== '0'; } catch (e) { return true; } }
  function setCamPref(on) { try { localStorage.setItem('dds_cam', on ? '1' : '0'); } catch (e) {} }

  async function startCamera() {
    stopCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return showSea();
    const t = token;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (t !== token || !E) { stream.getTracks().forEach((tr) => tr.stop()); return; }
      E.stream = stream;
      el.cam.srcObject = stream;
      el.cam.hidden = false;
      el.sea.hidden = true;
      el['c-cam'].textContent = '🌊';
      el['c-cam'].title = 'Use sea backdrop';
      await el.cam.play().catch(() => {});
    } catch (e) {
      showSea();
    }
  }
  function stopCamera() {
    if (E && E.stream) { E.stream.getTracks().forEach((tr) => tr.stop()); E.stream = null; }
    if (el.cam) { el.cam.srcObject = null; el.cam.hidden = true; }
  }
  function showSea() {
    stopCamera();
    if (E && E.look.pending) { E.look.pending = false; revealDuck(); }   // no camera → plain overlay now
    el.sea.hidden = false;
    el['c-cam'].textContent = '📷';
    el['c-cam'].title = 'Use camera';
  }

  // ---------- look-around (gyroscope) ----------
  // The phone reports its orientation; we turn that into the direction the back camera points
  // (yaw = left/right, pitch = up/down). The duck gets its own yaw/pitch in the room, and its screen
  // position is the difference. Works on Android Chrome and iPhone Safari (after one permission tap).
  const LOOK = { perm: null, raw: null, lastEvt: 0 };
  const LA = () => CONFIG.lookAround;
  function lookPref() {
    try { const v = localStorage.getItem('dds_look'); return v === null ? LA().defaultOn : v === '1'; }
    catch (e) { return LA().defaultOn; }
  }
  function setLookPref(on) { try { localStorage.setItem('dds_look', on ? '1' : '0'); } catch (e) {} }

  // Must be called synchronously inside a tap (iPhone only shows the prompt from a user gesture).
  function requestMotion() {
    const D = window.DeviceOrientationEvent;
    if (!D) return Promise.resolve(false);
    if (typeof D.requestPermission === 'function') {
      if (LOOK.perm === 'granted') return Promise.resolve(true);
      return D.requestPermission().then((r) => { LOOK.perm = r; return r === 'granted'; }).catch(() => false);
    }
    return Promise.resolve(true);
  }

  function onOrient(ev) {
    if (ev.alpha == null || ev.beta == null || ev.gamma == null) return;
    const d = Math.PI / 180;
    const cA = Math.cos(ev.alpha * d), sA = Math.sin(ev.alpha * d);
    const cB = Math.cos(ev.beta * d), sB = Math.sin(ev.beta * d);
    const cG = Math.cos(ev.gamma * d), sG = Math.sin(ev.gamma * d);
    // back-camera direction in world space = -(3rd column of Rz(α)·Rx(β)·Ry(γ))
    const fx = -cA * sG - sA * sB * cG;
    const fy = -sA * sG + cA * sB * cG;
    const fz = -cB * cG;
    LOOK.raw = { yaw: Math.atan2(fx, fy), pitch: Math.asin(Math.max(-1, Math.min(1, fz))) };
    LOOK.lastEvt = performance.now();
  }
  const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  function lookLive() {
    return !!(E && E.look.want && E.stream && LOOK.raw && performance.now() - LOOK.lastEvt < 1000);
  }

  function stepLook(dt) {
    const L = E.look;
    if (!lookLive()) {
      L.proj.x = 0; L.proj.y = 0;
      if (L.pending && E.t * 1000 > LA().waitMs) {        // no camera or no motion data: plain overlay
        L.pending = false;
        L.want = false;
        revealDuck();
        updateLookBtn();
      }
      return;
    }
    const k = 1 - Math.exp(-dt * LA().smoothing);
    if (L.cam === null) { L.cam = { ...LOOK.raw }; }
    L.cam.yaw = wrapPi(L.cam.yaw + wrapPi(LOOK.raw.yaw - L.cam.yaw) * k);
    L.cam.pitch += (LOOK.raw.pitch - L.cam.pitch) * k;
    if (!L.anchored) {
      // first live frame: decide where the duck hides (in view, or left/right/up/down of the player)
      const off = L.spawnOffset ? spawnOffset() : { yaw: 0, pitch: 0, dir: 'here' };
      const deg = Math.PI / 180, lim = 80 * deg;
      L.spawnDir = off.dir;
      L.duckYaw = wrapPi(L.cam.yaw + off.yaw * deg);
      L.duckPitch = Math.max(-lim, Math.min(lim, L.cam.pitch + off.pitch * deg));
      L.anchored = true;
      if (L.pending) { L.pending = false; revealDuck(); }
    }
    const ppr = pxPerRad();
    L.proj.x = wrapPi(L.duckYaw - L.cam.yaw) * ppr;
    L.proj.y = -(L.duckPitch - L.cam.pitch) * ppr;
  }

  // Pixels per radian of turning, matched to the camera picture so the duck moves with the room.
  // The video is shown with object-fit: cover, so the camera's long side fills `long * scale` pixels.
  function pxPerRad() {
    const v = el.cam, vw = v && v.videoWidth, vh = v && v.videoHeight;
    if (vw && vh) {
      const scale = Math.max(E.W / vw, E.H / vh);
      return (Math.max(vw, vh) * scale) / (LA().cameraLongFovDeg * Math.PI / 180);
    }
    return E.W / (LA().fovDeg * Math.PI / 180);
  }

  // Degrees from where the phone points when the duck appears. Sometimes in view, otherwise hidden
  // to the left/right/up/down (CONFIG.lookAround.spawn).
  function spawnOffset() {
    const sp = LA().spawn;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pm = (n) => rnd(-n, n);
    if (Math.random() < sp.inViewChance) return { yaw: pm(sp.inView.yaw), pitch: pm(sp.inView.pitch), dir: 'here' };
    const dir = Store.pickWeighted(sp.dirWeights);
    if (dir === 'left') return { yaw: -rnd(...sp.side), pitch: pm(sp.jitter / 2), dir };
    if (dir === 'right') return { yaw: rnd(...sp.side), pitch: pm(sp.jitter / 2), dir };
    if (dir === 'up') return { yaw: pm(sp.jitter), pitch: rnd(...sp.up), dir };
    return { yaw: pm(sp.jitter), pitch: -rnd(...sp.down), dir };
  }

  function revealDuck() {
    if (!E) return;
    el.duckwrap.style.visibility = '';
    el.dk.classList.remove('appear'); void el.dk.offsetWidth; el.dk.classList.add('appear');
    later(() => el.dk.classList.remove('appear'), 600);
  }

  function updateFinder() {
    const f = el['c-find'];
    const live = lookLive() && E.look.anchored && (E.phase === 'aim' || E.phase === 'flight' || E.phase === 'reel');
    const d = E.duck, m = E.S * 0.25;
    const off = live && (d.x < -m || d.x > E.W + m || d.y < -m || d.y > E.H + m);
    f.hidden = !off;
    if (!off) return;
    const ang = Math.atan2(d.y - E.H / 2, d.x - E.W / 2);
    const left = d.x < E.W / 2;
    const vert = Math.abs(d.y - E.H / 2) > Math.abs(d.x - E.W / 2) * 1.2;
    f.innerHTML = `<i style="transform:rotate(${ang}rad)">➤</i><span>${vert ? (d.y < E.H / 2 ? 'Look up' : 'Look down') : (left ? 'Turn left' : 'Turn right')}</span>`;
    f.className = 'c-find ' + (vert ? (d.y < E.H / 2 ? 'top' : 'bottom') : (left ? 'left' : 'right'));
  }

  function updateLookBtn() {
    const b = el['c-look'];
    b.hidden = !LA().enabled;
    if (!E) return;
    b.classList.toggle('on', !!E.look.want);
    b.title = E.look.want ? 'Look-around on: turn the phone to find the duck' : 'Look-around off: the duck stays on screen';
  }

  // ---------- geometry ----------
  function measure() {
    const r = el.stage.getBoundingClientRect();
    E.W = r.width; E.H = r.height; E.left = r.left; E.top = r.top;
    E.S = Math.min(E.W * 0.52, E.H * 0.3, 240);       // duck width px
    E.Hd = E.S * ART.VB.h / ART.VB.w;                // duck height px
    E.R = E.S * 0.33;                                 // body radius for landing
    E.homeY = E.H * 0.36;
    E.anchor = { x: E.W / 2, y: E.H - Math.max(110, E.H * 0.16) };
    E.ringPx = Math.min(96, E.W * 0.22);
    const rs = E.S * 0.5;
    for (const h of [el.rb, el.rf]) {
      h.style.width = h.style.height = rs + 'px';
      h.style.left = (E.S * ART.NECK.x / ART.VB.w - rs / 2) + 'px';
      h.style.top = (E.Hd * ART.NECK.y / ART.VB.h - rs / 2) + 'px';
    }
    el.duckwrap.style.width = E.S + 'px';
    el.duckwrap.style.height = E.Hd + 'px';
    el.flyring.style.width = el.flyring.style.height = E.ringPx + 'px';
    el.rope.setAttribute('viewBox', `0 0 ${E.W} ${E.H}`);
  }
  const duckCenter = () => ({ x: E.duck.x, y: E.duck.y });
  const hitCenter = () => ({ x: E.duck.x, y: E.duck.y + E.Hd * 0.06 * E.duck.sc });
  const neckPoint = () => ({
    x: E.duck.x + (E.S * ART.NECK.x / ART.VB.w - E.S / 2) * E.duck.sc,
    y: E.duck.y + (E.Hd * ART.NECK.y / ART.VB.h - E.Hd / 2) * E.duck.sc,
  });

  // ---------- start / exit ----------
  // opts: { weights, provenance, xpMult, label }
  function start(opts = {}) {
    if (E) cleanup();
    token += 1;
    grab();
    const S = Store.get();
    E = {
      timers: new Set(),
      wild: Store.rollWild(opts.weights, { lines: opts.lines, port: opts.port, forceLine: opts.forceLine, forceForm: opts.forceForm }),
      provenance: opts.provenance || 'Caught on board (ship mode)',
      xpMult: opts.xpMult || 1,
      label: opts.label || '',
      phase: 'aim',
      failures: 0,
      ringType: 'life',
      spin: 0, ringRot: 0,
      drag: null,
      duck: { x: 0, y: 0, dx: 0, tx: 0, rate: 1.5, nextWander: 0, sc: 1, shake: 0 },
      reel: null,
      raf: 0, last: 0, t: 0,
      stream: null,
      holding: false,
      look: { want: false, pending: false, anchored: false, spawnOffset: !opts.spawnHere,   // recognized ducks appear where you're pointing
              cam: null, duckYaw: 0, duckPitch: 0, proj: { x: 0, y: 0 } },
    };
    // Look-around: ask for motion access now, while we're still inside the player's tap.
    if (LA().enabled && camPref() && lookPref()) {
      E.look.want = true;
      E.look.pending = true;
      const t = token;
      requestMotion().then((ok) => {
        if (t !== token || !E || ok) return;
        E.look.want = false;
        App.toast('Motion access is off, so the duck stays on screen.');
        if (E.look.pending) { E.look.pending = false; revealDuck(); }
        updateLookBtn();
      });
    }
    App.go('catch');
    measure();
    E.duck.y = E.homeY;
    E.duck.x = E.W / 2;

    el.art.innerHTML = ART.duckSVG(E.wild);
    if (typeof Duck3D !== 'undefined') Duck3D.show(el.art, E.wild);   // 3D preview replaces the flat duck once loaded
    el.dk.className = 'dk appear';
    el.duckwrap.style.visibility = E.look.pending ? 'hidden' : '';
    el['c-find'].hidden = true;
    updateLookBtn();
    el.rb.innerHTML = ''; el.rf.innerHTML = '';
    el.rb.style.opacity = el.rf.style.opacity = 0;
    el.splash.className = '';
    el['c-celebrate'].hidden = true;
    el['c-celebrate'].innerHTML = '';
    el['c-reel'].hidden = true;
    el['c-bottom'].hidden = false;
    el['c-bottom'].classList.remove('busy');    // a previous encounter may have been left mid-throw
    el.rope.style.opacity = 0;
    el['c-cue'].classList.remove('on');
    el['c-info'].innerHTML = `<b>${E.wild.gold ? '✨ ' : ''}${Store.displayName(E.wild)}</b> <span>Lv ${E.wild.level} · ${Store.rarity(E.wild)}</span>` +
      (E.label ? `<small>${E.label}</small>` : '');
    setMsg('');
    hint(E.look.want ? 'Look around for the duck, then flick the ring at it.' : 'Flick the ring up at the duck. Circle it first to add spin.');
    renderRings();
    resetRing();
    if (camPref()) startCamera(); else showSea();
    later(() => el.dk.classList.remove('appear'), 600);

    E.last = performance.now();
    E.raf = requestAnimationFrame(loop);
    window.addEventListener('pointerup', onWinUp);
    window.addEventListener('pointercancel', onWinUp);
    window.addEventListener('resize', onResize);
    window.addEventListener('deviceorientation', onOrient);
  }

  function onResize() { if (E) { measure(); if (E.phase === 'aim' && !E.drag) resetRing(); } }

  // The one shared cleanup path: timers, camera, reel state, listeners.
  function cleanup() {
    if (!E) return;
    if (typeof Duck3D !== 'undefined') Duck3D.hide();
    for (const id of E.timers) clearTimeout(id);
    E.timers.clear();
    cancelAnimationFrame(E.raf);
    stopCamera();
    E.reel = null;
    E.holding = false;
    E.drag = null;
    window.removeEventListener('pointerup', onWinUp);
    window.removeEventListener('pointercancel', onWinUp);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('deviceorientation', onOrient);
    LOOK.raw = null;
    if (el.duckwrap) el.duckwrap.style.visibility = '';
    if (el['c-find']) el['c-find'].hidden = true;
    el['c-cue'] && el['c-cue'].classList.remove('on');
    E = null;
    token += 1;
  }

  function exit(to = 'deck', arg) {
    cleanup();
    App.go(to, arg);
  }

  // ---------- UI bits ----------
  function setMsg(text, cls = '') {
    el['c-msg'].textContent = text;
    el['c-msg'].className = 'c-msg' + (text ? ' on ' + cls : '');
  }
  function hint(text) { el['c-hint'].textContent = text || ''; el['c-hint'].hidden = !text; }

  function renderRings() {
    const S = Store.get();
    const counts = { life: S.rings.life || 0, premium: S.rings.premium, golden: S.rings.golden };
    if (!(S.rings[E.ringType] > 0)) E.ringType = ['life', 'premium', 'golden'].find((k) => S.rings[k] > 0) || 'life';
    const out = Store.totalRings() <= 0;
    el['scr-catch'].classList.toggle('no-rings', out);
    if (out && E.phase === 'aim') hint('Out of rings! Leave and use 🔍 Look for ducks to spot a real life ring on deck — or claim your daily top-up.');
    el['c-rings'].innerHTML = ['life', 'premium', 'golden'].map((k) => {
      const dis = !(S.rings[k] > 0);
      return `<button class="ringbtn ${E.ringType === k ? 'sel' : ''}" data-ring="${k}" ${dis ? 'disabled' : ''}>
        <span class="mini">${ART.ringSVG(k)}</span><span>${CONFIG.rings[k].name.replace(' Ring', '')}</span><b>×${counts[k]}</b></button>`;
    }).join('');
    el.flyring.innerHTML = ART.ringSVG(E.ringType);
  }

  function placeRing(x, y, scale = 1, rot = 0, opacity = 1) {
    const s = E.ringPx;
    el.flyring.style.transform = `translate3d(${x - s / 2}px, ${y - s / 2}px, 0) rotate(${rot}deg) scale(${scale})`;
    el.flyring.style.opacity = opacity;
  }
  function resetRing() {
    E.spin = 0;
    E.ring = { x: E.anchor.x, y: E.anchor.y };
    el.flyring.hidden = false;
    placeRing(E.anchor.x, E.anchor.y, 1, E.ringRot);
    updateSpinMeter();
  }

  function updateSpinMeter() {
    el['c-spin'].hidden = !(E.phase === 'aim' || E.phase === 'flight');
    const s = E.spin, m = CONFIG.maxSpin;
    const pct = Math.min(1, Math.abs(s) / m) * 50;
    el['c-spin-fill'].style.left = s >= 0 ? '50%' : (50 - pct) + '%';
    el['c-spin-fill'].style.width = pct + '%';
    el['c-spin'].classList.toggle('curve', Math.abs(s) >= CONFIG.curveballSpin);
    el['c-spin'].classList.toggle('on', Math.abs(s) > 0.15);
    el['c-spin-label'].textContent = Math.abs(s) < 0.15 ? 'Spin' :
      `${s > 0 ? '↻ Right' : '↺ Left'} ${Math.abs(s).toFixed(1)}${Math.abs(s) >= CONFIG.curveballSpin ? ' · Curveball!' : ''}`;
  }

  // ---------- main loop ----------
  function loop(now) {
    if (!E) return;
    const dt = Math.min(0.05, (now - E.last) / 1000);
    E.last = now;
    E.t += dt;
    stepLook(dt);
    stepDuck(dt);
    if (E.phase === 'aim') stepAim(dt);
    if (E.phase === 'flight') stepFlight(now);
    if (E.phase === 'reel') stepReel(dt);
    drawDuck();
    updateFinder();
    if (E && E.raf !== -1) E.raf = requestAnimationFrame(loop);
  }

  function stepDuck(dt) {
    const d = E.duck;
    if (E.phase === 'aim' || E.phase === 'flight') {
      if (E.t > d.nextWander && E.phase === 'aim') {
        d.tx = (Math.random() * 2 - 1) * E.W * 0.26;
        d.rate = 1.2 + E.wild.form * 0.3;
        d.nextWander = E.t + 1.1 + Math.random() * 1.4;
      }
      d.dx += (d.tx - d.dx) * (1 - Math.exp(-dt * d.rate));
      d.x = E.W / 2 + d.dx + E.look.proj.x;
      d.y = E.homeY + Math.sin(E.t * 2.3) * 8 + E.look.proj.y;
      d.sc = 1;
    } else if (E.phase === 'reel' && E.reel) {
      const p = E.reel.p;
      const shake = E.reel.state === 'calm' ? 0 : Math.sin(E.t * 50) * (E.reel.state === 'burst' ? 9 : 4);
      d.dx += (0 - d.dx) * (1 - Math.exp(-dt * 2));
      d.x = E.W / 2 + d.dx + shake + E.look.proj.x;
      d.y = E.homeY + (E.H * 0.6 - E.homeY) * p + Math.sin(E.t * 2.3) * 4 + E.look.proj.y;
      d.sc = 1 + 0.3 * p;
    }
  }

  function drawDuck() {
    const d = E.duck;
    el.duckwrap.style.transform = `translate3d(${d.x - E.S / 2}px, ${d.y - E.Hd / 2}px, 0) scale(${d.sc})`;
    if (E.phase === 'reel' || E.phase === 'settle') {
      const n = neckPoint();
      el.ropeLine.setAttribute('x1', E.W / 2); el.ropeLine.setAttribute('y1', E.H + 20);
      el.ropeLine.setAttribute('x2', n.x); el.ropeLine.setAttribute('y2', n.y + E.S * 0.06 * d.sc);
    }
  }

  // ---------- aiming (flick + spin) ----------
  function localPt(ev) { return { x: ev.clientX - E.left, y: ev.clientY - E.top }; }

  function onRingDown(ev) {
    if (!E || E.phase !== 'aim') return;
    ev.preventDefault();
    ev.stopPropagation();
    if (!(Store.get().rings[E.ringType] > 0)) { renderRings(); return; }   // out of rings
    try { el.flyring.setPointerCapture(ev.pointerId); } catch (e) {}
    const p = localPt(ev);
    E.drag = { id: ev.pointerId, samples: [{ ...p, t: performance.now() }], lastAng: null, moved: 0, lastP: p };
    hint('');
  }
  function onRingMove(ev) {
    if (!E || !E.drag || ev.pointerId !== E.drag.id) return;
    const p = localPt(ev);
    const now = performance.now();
    const D = E.drag;
    D.samples.push({ ...p, t: now });
    while (D.samples.length > 2 && now - D.samples[0].t > 120) D.samples.shift();
    // ring follows the finger, kept in the lower part of the screen
    E.ring.x = Math.max(E.ringPx / 2, Math.min(E.W - E.ringPx / 2, p.x));
    E.ring.y = Math.max(E.H * 0.55, Math.min(E.H - E.ringPx / 2, p.y));
    // spin: angle swept around the anchor
    const ax = p.x - E.anchor.x, ay = p.y - E.anchor.y;
    if (Math.hypot(ax, ay) > 10) {
      const ang = Math.atan2(ay, ax);
      if (D.lastAng !== null) {
        let da = ang - D.lastAng;
        if (da > Math.PI) da -= 2 * Math.PI;
        if (da < -Math.PI) da += 2 * Math.PI;
        E.spin = Math.max(-CONFIG.maxSpin, Math.min(CONFIG.maxSpin, E.spin + da * 0.35));
      }
      D.lastAng = ang;
    } else D.lastAng = null;
    D.moved += Math.hypot(p.x - D.lastP.x, p.y - D.lastP.y);
    D.lastP = p;
  }
  function stepAim(dt) {
    if (E.drag) {
      // spin decays if the pointer is held still
      if (E.drag.moved < 1.5) E.spin *= Math.exp(-dt * 1.2);
      E.drag.moved = 0;
    } else {
      E.spin *= Math.exp(-dt * 3);
    }
    E.ringRot += E.spin * dt * 220;
    placeRing(E.ring.x, E.ring.y, 1, E.ringRot);
    updateSpinMeter();
  }
  function onRingUp(ev) {
    if (!E || !E.drag || ev.pointerId !== E.drag.id) return;
    const D = E.drag;
    E.drag = null;
    const now = performance.now();
    const recent = D.samples.filter((s) => now - s.t < 100);
    const a = recent[0] || D.samples[0], b = D.samples[D.samples.length - 1];
    const dtms = Math.max(8, b.t - a.t);
    const vx = (b.x - a.x) / dtms, vy = (b.y - a.y) / dtms;
    const speed = Math.hypot(vx, vy);
    if (speed < 0.35 || vy > -0.2 || now - b.t > 120) {
      hint('Flick upward and let go while moving to throw.');
      E.ring = { x: E.anchor.x, y: E.anchor.y };
      return;
    }
    const dir = { x: vx / speed, y: vy / speed };
    const power = Math.min(speed, 4.5);
    const dist = power * E.H * 0.3;
    const from = { x: E.ring.x, y: E.ring.y };
    throwRing(from, { x: from.x + dir.x * dist, y: from.y + dir.y * dist }, dir, E.spin, false);
  }

  function onThrowButton(ev) {
    ev.stopPropagation();
    if (!E || E.phase !== 'aim') return;
    if (!(Store.get().rings[E.ringType] > 0)) { renderRings(); return; }
    const h = hitCenter();
    const a = Math.random() * Math.PI * 2, r = Math.random() * CONFIG.buttonThrowSpread * E.R;
    const to = { x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r };
    const from = { ...E.anchor };
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    throwRing(from, to, { x: (to.x - from.x) / len, y: (to.y - from.y) / len }, 0, true);
  }

  // ---------- flight ----------
  function throwRing(from, to, dir, spin, viaButton) {
    const S = Store.get();
    const type = E.ringType;
    S.rings[type] = Math.max(0, (S.rings[type] || 0) - 1);                     // every ring is used up, hit or miss
    S.stats.throws += 1;
    Store.save();
    const perp = { x: -dir.y, y: dir.x };
    const curve = spin * 22;
    E.flight = { from, to, perp, curve, spin, viaButton, type, t0: performance.now(), rot: E.ringRot };
    E.phase = 'flight';
    el['c-bottom'].classList.add('busy');
    hint('');
    // the duck dodges during flight — aim must lead it
    const dodgeChance = { 1: 0.45, 2: 0.6, 3: 0.75 }[E.wild.form];
    if (Math.random() < dodgeChance) {
      const side = Math.random() < 0.5 ? -1 : 1;
      E.duck.tx = Math.max(-E.W * 0.3, Math.min(E.W * 0.3, E.duck.dx + side * E.R * (0.9 + Math.random() * 0.8)));
      E.duck.rate = 3 + E.wild.form;
    }
  }

  function stepFlight(now) {
    const F = E.flight;
    const u = Math.min(1, (now - F.t0) / CONFIG.flightMs);
    const ue = 1 - Math.pow(1 - u, 1.6);
    const lat = F.curve * u * u;
    const x = F.from.x + (F.to.x - F.from.x) * ue + F.perp.x * lat;
    const y = F.from.y + (F.to.y - F.from.y) * ue + F.perp.y * lat - Math.sin(Math.PI * u) * E.H * 0.08;
    F.rot += (F.spin || 0.4) * 9;
    placeRing(x, y, 1 - 0.5 * u, F.rot);
    if (u >= 1) {
      const land = { x: F.to.x + F.perp.x * F.curve, y: F.to.y + F.perp.y * F.curve };
      judge(land);
    }
  }

  function judge(land) {
    const F = E.flight;
    const h = hitCenter();
    const d = Math.hypot(land.x - h.x, land.y - h.y);
    const tol = CONFIG.rings[F.type].tol;
    const L = CONFIG.landing;
    let q = null;
    if (d <= L.excellent * E.R * tol) q = 'Excellent';
    else if (d <= L.great * E.R * tol) q = 'Great';
    else if (d <= L.nice * E.R * tol) q = 'Nice';
    if (q === 'Excellent' && F.viaButton) q = 'Great';     // fallback can't out-score a skilled flick
    E.duck.tx = E.duck.dx; E.duck.rate = 1.5;
    renderRings();
    if (!q) return miss(land);
    landed(q, Math.abs(F.spin) >= CONFIG.curveballSpin && !F.viaButton);
  }

  function miss(land) {
    E.phase = 'missed';
    el.flyring.hidden = true;
    el.splash.style.transform = `translate3d(${land.x}px, ${land.y}px, 0)`;
    el.splash.className = '';
    void el.splash.offsetWidth;
    el.splash.className = 'on';
    setMsg('Missed!', 'bad');
    E.failures += 0.5;
    later(() => { if (!fleeCheck()) backToAim(); }, 900);
  }

  function fleeCheck() {
    const chance = CONFIG.fleeBase[E.wild.form] * E.failures;
    if (Math.random() < chance) { flee(); return true; }
    return false;
  }

  function backToAim() {
    E.phase = 'aim';
    el['c-bottom'].classList.remove('busy');
    el['c-bottom'].hidden = false;
    el['c-reel'].hidden = true;
    el.rope.style.opacity = 0;
    el.splash.className = '';
    el.dk.className = 'dk';
    setMsg('');
    renderRings();
    resetRing();
    E.duck.nextWander = 0;
  }

  // ---------- landed: ring settles around the neck ----------
  function landed(q, curveball) {
    E.phase = 'settle';
    E.quality = q; E.curveball = curveball;
    el.flyring.hidden = true;
    el['c-bottom'].hidden = true;
    el['c-spin'].hidden = true;
    setMsg(q + '!' + (curveball ? ' Curveball!' : ''), 'good q-' + q.toLowerCase());
    const type = E.flight.type;
    el.rb.innerHTML = ART.ringHalf(type, 'back');
    el.rf.innerHTML = ART.ringHalf(type, 'front');
    const tilt = { Excellent: 0, Great: 7, Nice: 17 }[q] * (Math.random() < 0.5 ? -1 : 1);
    E.tilt = tilt;
    const end = `translateY(0) rotate(${tilt}deg) scale(1, 0.38)`;
    const frames = [
      { transform: 'translateY(-95%) rotate(0deg) scale(0.9, 0.9)', opacity: 0.2 },
      { transform: 'translateY(-55%) rotate(0deg) scale(1, 0.75)', opacity: 1, offset: 0.45 },
    ];
    if (q === 'Nice') {
      frames.push({ transform: `translateY(4%) rotate(${-tilt}deg) scale(1, 0.38)`, opacity: 1, offset: 0.75 });
      frames.push({ transform: `translateY(-2%) rotate(${tilt * 1.3}deg) scale(1, 0.38)`, opacity: 1, offset: 0.88 });
    }
    frames.push({ transform: end, opacity: 1 });
    for (const h of [el.rb, el.rf]) {
      h.style.opacity = 1;
      h.style.transform = end;
      try { h.animate(frames, { duration: q === 'Nice' ? 900 : 600, easing: 'ease-out' }); } catch (e) {}
    }
    el.dk.className = 'dk surprised squash';
    el.rope.style.opacity = 1;
    later(() => { el.dk.classList.remove('squash'); }, 500);
    later(() => { el.dk.classList.remove('surprised'); startReel(); }, q === 'Nice' ? 950 : 700);
  }

  // ---------- rescue reel ----------
  function startReel() {
    const R = CONFIG.reel;
    E.phase = 'reel';
    E.reel = { p: R.startBonus[E.quality] || 0, tau: 0, pinned: 0, state: 'calm', stateUntil: E.t + calmFor() };
    el['c-reel'].hidden = false;
    setMsg('');
    hint('Hold to reel in. Ease off when it struggles!');
    drawReel();
  }
  function calmFor() {
    const [a, b] = CONFIG.reel.calmMs[E.wild.form];
    return (a + Math.random() * (b - a)) / 1000;
  }

  function stepReel(dt) {
    const R = CONFIG.reel, r = E.reel, f = E.wild.form;
    if (E.t >= r.stateUntil) {
      if (r.state === 'calm') { r.state = 'warn'; r.stateUntil = E.t + R.warnMs / 1000; }
      else if (r.state === 'warn') { r.state = 'burst'; r.stateUntil = E.t + R.struggleMs / 1000; }
      else { r.state = 'calm'; r.stateUntil = E.t + calmFor(); }
      const struggling = r.state !== 'calm';
      el['c-cue'].classList.toggle('on', struggling);
      el.dk.classList.toggle('struggle', struggling);
    }
    const ring = CONFIG.rings[E.flight.type];
    const tMult = ring.tension * (E.curveball ? R.curveballTension : 1);
    const burst = r.state === 'burst';
    if (E.holding) {
      r.p += R.pullPerSec * ring.pull * dt * (burst ? 0.4 : 1);
      r.tau += (burst ? R.struggleTensionPerSec[f] : R.calmTensionPerSec) * tMult * dt;
    } else {
      r.tau -= R.releaseTensionPerSec * dt;
      r.p -= (burst ? R.slipBackPerSec.struggle : R.slipBackPerSec.calm) * dt;
    }
    r.p = Math.max(0, Math.min(1, r.p));
    r.tau = Math.max(0, Math.min(1, r.tau));
    if (r.tau >= 1) r.pinned += dt * 1000; else r.pinned = 0;
    drawReel();
    if (r.pinned >= R.pinnedMs) return slipOff();
    if (r.p >= 1) return caught();
  }

  function drawReel() {
    const r = E.reel;
    el['c-prog'].style.width = (r.p * 100) + '%';
    el['c-tens'].style.width = (r.tau * 100) + '%';
    el['c-tens'].parentElement.classList.toggle('hot', r.tau > 0.8);
    el['c-tens'].parentElement.classList.toggle('pinned', r.pinned > 0);
    el['c-reel-btn'].classList.toggle('held', E.holding);
  }

  function setHolding(on) {
    if (!E) return;
    E.holding = !!on && E.phase === 'reel';
    if (E.phase === 'reel') el['c-reel-btn'].classList.toggle('held', E.holding);
  }
  function onStageDown(ev) {
    if (!E) return;
    if (E.phase === 'reel') { ev.preventDefault(); setHolding(true); hint(''); }
  }
  function onWinUp() { if (E && E.holding) setHolding(false); }

  function slipOff() {
    hint('');
    E.phase = 'slipped';
    E.holding = false;
    el['c-cue'].classList.remove('on');
    el.dk.className = 'dk struggle';
    for (const h of [el.rb, el.rf]) {
      try {
        h.animate([
          { transform: h.style.transform, opacity: 1 },
          { transform: `translateY(-140%) rotate(${E.tilt * 2}deg) scale(0.9, 0.9)`, opacity: 0 },
        ], { duration: 500, easing: 'ease-in', fill: 'forwards' });
      } catch (e) { h.style.opacity = 0; }
    }
    el.rope.style.opacity = 0;
    el['c-reel'].hidden = true;
    setMsg('The ring slipped off!', 'bad');
    E.failures += 1;
    later(() => {
      for (const h of [el.rb, el.rf]) { h.getAnimations && h.getAnimations().forEach((a) => a.cancel()); h.style.opacity = 0; }
      E.reel = null;
      if (!fleeCheck()) backToAim();
    }, 1100);
  }

  function flee() {
    hint('');
    E.phase = 'fled';
    el['c-spin'].hidden = true;
    el['c-bottom'].hidden = true;
    el['c-reel'].hidden = true;
    el.dk.className = 'dk flee';
    setMsg('The duck paddled away!', 'bad');
    later(() => {
      showPanel(`<h2>It got away!</h2><p>That ${Store.displayName(E.wild)} swam off. Another one will turn up soon.</p>
        <div class="row"><button class="btn primary" data-act="deck">Back to Deck</button></div>`);
    }, 900);
    E.autoTimer = later(() => exit('deck'), CONFIG.celebrateAutoMs);
  }

  function caught() {
    hint('');
    E.phase = 'caught';
    E.holding = false;
    el['c-cue'].classList.remove('on');
    el['c-reel'].hidden = true;
    el.rope.style.opacity = 0;
    el.dk.className = 'dk happy';
    // ring stays on — straightens up for the celebration
    for (const h of [el.rb, el.rf]) h.style.transform = 'translateY(0) rotate(0deg) scale(1, 0.38)';
    const res = Store.recordCatch(E.wild, { quality: E.quality, curveball: E.curveball, provenance: E.provenance, xpMult: E.xpMult });
    E.caughtId = res.creature.id;
    setMsg('Caught!', 'good');
    const c = res.creature;
    later(() => {
      showPanel(`
        <h2>${c.gold ? '✨ ' : ''}${Store.displayName(c)} rescued!</h2>
        ${c.acc ? `<p class="quality">Wearing: ${ACCESSORY_NAMES[c.acc]}</p>` : ''}
        <p class="stats">Lv ${c.level} · Sail Power <b>${Store.sailPower(c)}</b> · Size ${c.size} · ${Store.rarity(c)}</p>
        <p class="quality">${E.quality} landing${E.curveball ? ' · Curveball' : ''}</p>
        <ul class="rewards">
          <li>+${CONFIG.catchReward.shells} Shells</li>
          <li>+${CONFIG.catchReward.treats} Duck Treats</li>
          <li>+${res.xp} XP${E.xpMult > 1 ? ' (Life Ring Station bonus)' : ''}</li>
        </ul>
        <div class="row">
          <button class="btn" data-act="crew">See it in Crew</button>
          <button class="btn primary" data-act="deck">Back to Deck</button>
        </div>`);
      if (res.levelUps.length) App.levelUpBanner(res.levelUps);
    }, 700);
    E.autoTimer = later(() => exit('deck'), CONFIG.celebrateAutoMs);
  }

  function showPanel(html) {
    const p = el['c-celebrate'];
    p.innerHTML = html;
    p.hidden = false;
  }

  function onPanelClick(ev) {
    const b = ev.target.closest('[data-act]');
    if (!b || !E) return;
    clearLater(E.autoTimer);
    const act = b.dataset.act;
    const id = E.caughtId;
    if (act === 'crew') exit('detail', id);
    else exit('deck');
  }

  // ---------- wire up once ----------
  function init() {
    grab();
    const stopAll = (ev) => { ev.stopPropagation(); };
    // §7.1: the ✕ exits from ANY phase and never starts a drag or reel-hold
    el['c-x'].addEventListener('pointerdown', stopAll);
    el['c-x'].addEventListener('pointerup', stopAll);
    el['c-x'].addEventListener('click', (ev) => { ev.stopPropagation(); exit('deck'); });

    for (const id of ['c-leave', 'c-throw', 'c-cam', 'c-look', 'c-rings', 'c-celebrate']) {
      el[id].addEventListener('pointerdown', stopAll);
      el[id].addEventListener('pointerup', stopAll);
    }
    el['c-leave'].addEventListener('click', (ev) => { ev.stopPropagation(); exit('deck'); });
    el['c-throw'].addEventListener('click', onThrowButton);
    el['c-cam'].addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!E) return;
      if (E.stream) { setCamPref(false); showSea(); } else { setCamPref(true); startCamera(); }
    });
    el['c-look'].addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!E) return;
      const on = !E.look.want;
      setLookPref(on);
      E.look.want = on;
      if (on) {
        // turning it on mid-encounter keeps the duck where it is on screen (no spawn offset)
        E.look.anchored = false; E.look.spawnOffset = false; E.look.cam = null;
        if (!E.stream) { setCamPref(true); startCamera(); }
        requestMotion().then((ok) => {
          if (!ok && E) { E.look.want = false; App.toast('Motion access is off, so the duck stays on screen.'); updateLookBtn(); }
        });
      } else if (E.look.pending) { E.look.pending = false; revealDuck(); }
      updateLookBtn();
    });
    el['c-rings'].addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-ring]');
      if (!b || b.disabled || !E || E.phase !== 'aim') return;
      E.ringType = b.dataset.ring;
      renderRings();
    });
    el['c-celebrate'].addEventListener('click', onPanelClick);

    el.flyring.addEventListener('pointerdown', onRingDown);
    el.flyring.addEventListener('pointermove', onRingMove);
    el.flyring.addEventListener('pointerup', onRingUp);
    el.flyring.addEventListener('pointercancel', onRingUp);

    el.stage.addEventListener('pointerdown', onStageDown);
    el['c-reel-btn'].addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); setHolding(true); hint(''); });
    el['c-reel-btn'].addEventListener('pointerup', (ev) => { ev.stopPropagation(); setHolding(false); });
    el['c-reel-btn'].addEventListener('contextmenu', (ev) => ev.preventDefault());
    el['scr-catch'].addEventListener('contextmenu', (ev) => ev.preventDefault());

    // Desktop: hold Space to reel
    window.addEventListener('keydown', (ev) => { if (ev.code === 'Space' && E && E.phase === 'reel') { ev.preventDefault(); setHolding(true); } });
    window.addEventListener('keyup', (ev) => { if (ev.code === 'Space') setHolding(false); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) setHolding(false); });
  }

  const active = () => !!E;
  const debug = () => E;   // for tests
  const lookState = () => LOOK;
  return { init, start, exit, cleanup, active, debug, lookState };
})();
