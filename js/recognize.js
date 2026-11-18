// "Look for ducks": the camera recognizes things around you (on-device, Google MediaPipe image
// classifier) and a matching duck line appears — e.g. stage/curtains → Showtime.
// Match strength picks the form: partial → Form 1, strong → Form 2, excellent → Form 3.
// Recognized ducks skip the encounter timer but have per-category cooldowns and a daily cap.
// Nothing leaves the phone: frames are classified in the browser and thrown away.
const Recognize = (() => {
  const $ = (id) => document.getElementById(id);
  const RC = () => CONFIG.recognize;
  let classifier = null, loading = null;
  let stream = null, timer = 0, gen = 0, running = false;
  let track = null;          // { cat, since, scores: [], misses }
  let lastResults = [];

  // ---------- limits ----------
  const today = () => new Date().toLocaleDateString('en-CA');      // YYYY-MM-DD, local
  function state() {
    const S = Store.get();
    if (!S.recog || S.recog.day !== today()) S.recog = { day: today(), count: 0, cooldowns: (S.recog && S.recog.cooldowns) || {} };
    return S.recog;
  }
  const cooldownLeft = (catId) => Math.max(0, (state().cooldowns[catId] || 0) + RC().cooldownMs - Date.now());
  const capLeft = () => Math.max(0, RC().dailyCap - state().count);

  // ---------- model ----------
  // Engine + model, fetched up front so we can show progress. The service worker keeps them
  // (cache-first), so the later MediaPipe fetches of the same files are instant and work offline.
  const FILES = [
    ['vendor/mediapipe/vision_bundle.mjs', 156062],
    ['vendor/mediapipe/wasm/vision_wasm_internal.js', 334128],
    ['vendor/mediapipe/wasm/vision_wasm_internal.wasm', 14603354],
    ['vendor/models/efficientnet_lite0.tflite', 5434517],
  ];
  const TOTAL_MB = 10;      // actual network transfer (GitHub Pages compresses the 14.6 MB engine to ~4.2 MB)
  let onProgress = null;
  async function prefetch(cb) {
    const total = FILES.reduce((a, f) => a + f[1], 0);
    let done = 0;
    for (const [path, size] of FILES) {
      const res = await fetch(path);
      if (!res.ok) throw new Error('download failed: ' + path);
      if (!res.body || !res.body.getReader) { await res.arrayBuffer(); done += size; cb && cb(done / total); continue; }
      const rd = res.body.getReader();
      let got = 0;
      for (;;) {
        const { done: end, value } = await rd.read();
        if (end) break;
        got += value.length;
        cb && cb(Math.min(1, (done + Math.min(got, size)) / total));
      }
      done += size;
    }
    cb && cb(1);
  }

  function load() {
    if (classifier) return Promise.resolve(classifier);
    if (loading) return loading;
    loading = (async () => {
      const base = new URL('vendor/mediapipe/', location.href).href;
      await prefetch(onProgress);         // download (or find cached) engine + model, with a progress %
      const vision = await import(base + 'vision_bundle.mjs');
      const fileset = await vision.FilesetResolver.forVisionTasks(base + 'wasm');
      classifier = await vision.ImageClassifier.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: new URL('vendor/models/efficientnet_lite0.tflite', location.href).href, delegate: 'CPU' },
        runningMode: 'VIDEO',
        maxResults: -1,          // all 1000 scores: the life-ring recognizer reads every one
        scoreThreshold: 0,
      });
      return classifier;
    })();
    loading.catch(() => { loading = null; });
    return loading;
  }

  // Life-ring recognizer (trained, js/lifering-model.js): logistic regression on all 1000 log-scores.
  const LIFERING = { id: 'lifering', name: 'Life ring', hint: 'That looks like a life ring!', refill: true };
  function ringProb(results) {
    if (typeof LIFERING_MODEL === 'undefined' || !results.length || results[0].index === undefined) return 0;
    const M = LIFERING_MODEL, v = new Float32Array(1000);
    for (const c of results) if (c.index >= 0 && c.index < 1000) v[c.index] = c.score;
    let z = M.b;
    for (let i = 0; i < 1000; i++) z += M.w[i] * Math.log(v[i] + M.eps);
    return 1 / (1 + Math.exp(-z));
  }
  const ringThreshold = () => (typeof LIFERING_MODEL === 'undefined' ? 2 : LIFERING_MODEL.threshold);
  const ringCooldownLeft = () => Math.max(0, (Store.get().lifeScanAt || 0) + CONFIG.lifeRings.scanCooldownMs - Date.now());
  let lastRing = 0;

  // Score each category for one frame: the best score among its labels.
  function scoreFrame(results) {
    // a real life ring takes priority (it restocks rings instead of starting an encounter)
    const rp = ringProb(results);
    lastRing = rp;
    if (rp >= ringThreshold()) return { cat: LIFERING, score: rp, label: 'life ring' };
    if (capLeft() <= 0) return null;   // no more hidden ducks today; life rings still count
    const byLabel = {};
    for (const c of results) byLabel[c.categoryName.toLowerCase()] = Math.max(byLabel[c.categoryName.toLowerCase()] || 0, c.score);
    let best = null;
    for (const cat of RECOGNIZE_CATEGORIES) {
      let s = 0, hit = '';
      for (const l of cat.labels) { const v = byLabel[l]; if (v > s) { s = v; hit = l; } }
      if (s > 0 && (!best || s > best.score)) best = { cat, score: s, label: hit };
    }
    return best;
  }

  function formFor(avg) {
    const t = RC().tiers;
    return avg >= t.excellent ? 3 : avg >= t.strong ? 2 : 1;
  }
  const tierName = (f) => ({ 1: 'Partial match', 2: 'Strong match', 3: 'Excellent match' }[f]);

  // ---------- one frame of matching (also used by tests with fake results) ----------
  // Returns { status, ... } describing what the UI should show.
  function step(results, now) {
    lastResults = results;
    const best = scoreFrame(results);
    const ok = best && best.score >= RC().minScore;
    if (!ok) {
      if (track && ++track.misses <= RC().graceFrames) return { status: 'holding', track };
      track = null;
      return { status: 'looking' };
    }
    const cd = best.cat.refill ? ringCooldownLeft() : cooldownLeft(best.cat.id);
    if (cd > 0) { track = null; return { status: 'cooldown', cat: best.cat, left: cd }; }
    if (!track || track.cat.id !== best.cat.id) track = { cat: best.cat, since: now, scores: [], misses: 0, label: best.label };
    track.misses = 0;
    track.scores.push(best.score);
    track.label = best.label;
    const held = now - track.since;
    if (held >= RC().holdMs) {
      const avg = track.scores.reduce((a, b) => a + b, 0) / track.scores.length;
      const res = { status: 'found', cat: track.cat, avg, form: formFor(avg), label: track.label };
      track = null;
      return res;
    }
    return { status: 'holding', track, progress: held / RC().holdMs };
  }

  // ---------- screen ----------
  function render(r) {
    const st = $('look-status'), bar = $('look-bar');
    if (r.status === 'looking') { st.textContent = 'Point your camera around… ducks hide near things they love.'; bar.style.width = '0%'; }
    if (r.status === 'holding' && r.track) { st.textContent = r.track.cat.hint + ' Hold steady…'; bar.style.width = Math.round((r.progress || 0) * 100) + '%'; }
    if (r.status === 'cooldown') {
      st.textContent = r.cat.refill ? `Life ring spotted — rings restock again in ${fmt(r.left)}.` : `${r.cat.name}: a duck was found here recently. Try again in ${fmt(r.left)}.`;
      bar.style.width = '0%';
    }
    if (r.status === 'looking' && capLeft() <= 0) st.textContent = 'No more hidden ducks today — but you can still spot life rings to restock.';
    if (RC().showReadout) {
      $('look-readout').hidden = false;
      $('look-readout').innerHTML = `<div class="${lastRing >= ringThreshold() ? 'hit' : ''}"><span>🛟 life ring (trained)</span><b>${Math.round(lastRing * 100)}%</b><i>Rings</i></div>` +
        lastResults.slice(0, 4).map((c) => {
        const cat = RECOGNIZE_CATEGORIES.find((k) => k.labels.includes(c.categoryName.toLowerCase()));
        return `<div class="${cat ? 'hit' : ''}"><span>${escHtml(c.categoryName)}</span><b>${Math.round(c.score * 100)}%</b>${cat ? `<i>${cat.name}</i>` : ''}</div>`;
      }).join('') || '<div><span>(nothing yet)</span></div>';
    }
    $('look-limit').textContent = `Hidden ducks found today: ${state().count} / ${RC().dailyCap} · 🛟 Life Rings ${Store.get().rings.life}/${Store.bagCap()}`;
  }
  const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function fmt(ms) { const s = Math.ceil(ms / 1000), m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s % 60).padStart(2, '0')}`; }

  // A real life ring: restock Life Rings and keep looking (no encounter).
  function ringFound() {
    const S = Store.get();
    const got = Store.addLifeRings(CONFIG.lifeRings.scanRefill);
    const st = $('look-status');
    if (got) {
      S.lifeScanAt = Date.now();
      const rs = S.recogStats || (S.recogStats = { found: 0, caught: 0, byCat: {}, byForm: {}, labels: {} });
      rs.rings = (rs.rings || 0) + 1;
      Store.save();
      if (navigator.vibrate) try { navigator.vibrate([30, 30, 30]); } catch (e) {}
      st.textContent = `🛟 +${got} Life Rings! (${S.rings.life}/${Store.bagCap()})`;
      App.toast(`🛟 +${got} Life Rings!`);
    } else {
      st.textContent = 'Life ring spotted — but your ring bag is full.';
    }
    $('look-bar').style.width = '0%';
    holdMsgUntil = performance.now() + 2500;
  }
  let holdMsgUntil = 0;

  function found(r) {
    if (r.cat.refill) return ringFound();
    stop();
    const st = state();
    st.count += 1;
    st.cooldowns[r.cat.id] = Date.now();
    // stats (on this phone only)
    const S = Store.get();
    const rs = S.recogStats || (S.recogStats = { found: 0, caught: 0, byCat: {}, byForm: {}, labels: {} });
    rs.found += 1;
    rs.byCat[r.cat.id] = (rs.byCat[r.cat.id] || 0) + 1;
    rs.byForm[r.form] = (rs.byForm[r.form] || 0) + 1;
    rs.labels[r.label] = (rs.labels[r.label] || 0) + 1;
    Store.save();
    if (navigator.vibrate) try { navigator.vibrate([40, 40, 80]); } catch (e) {}
    Catch.start({
      forceLine: r.cat.line,
      forceForm: r.form,
      spawnHere: true,
      provenance: `Found ${r.cat.where} (camera saw "${r.label}", ${tierName(r.form).toLowerCase()})`,
      label: `🔍 ${tierName(r.form)} · ${r.cat.name}`,
    });
  }

  async function start() {
    stop();
    const my = ++gen;
    running = true;
    track = null; lastResults = [];
    const st = $('look-status');
    $('look-readout').hidden = !RC().showReadout;
    $('look-bar').style.width = '0%';
    $('look-limit').textContent = `Hidden ducks found today: ${state().count} / ${RC().dailyCap}`;
    st.textContent = 'Starting camera…';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { st.textContent = 'This browser can’t use the camera.'; return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (my !== gen || !running) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      const v = $('look-video');
      v.srcObject = s;
      await v.play().catch(() => {});
    } catch (e) { st.textContent = 'Camera unavailable. Allow camera access to look for ducks.'; return; }
    if (!classifier) {
      st.textContent = `Getting the duck-spotter ready… (first time only, about ${TOTAL_MB} MB — best on good WiFi)`;
      onProgress = (f) => { if (my === gen) { $('look-bar').style.width = Math.round(f * 100) + '%';
        if (f > 0.02 && f < 1) st.textContent = `Downloading the duck-spotter… ${Math.round(f * 100)}% (first time only)`; } };
    }
    try { await load(); $('look-bar').style.width = '0%'; } catch (e) {
      if (my === gen) st.textContent = 'Couldn’t load the duck-spotter. Check your connection and try again.';
      return;
    }
    if (my !== gen || !running) return;
    render({ status: 'looking' });
    timer = setInterval(() => tick(my), RC().intervalMs);
  }

  function tick(my) {
    if (my !== gen || !running || !classifier) return;
    const v = $('look-video');
    if (!v.videoWidth) return;
    let results = [];
    try {
      const out = classifier.classifyForVideo(v, performance.now());
      results = (out.classifications[0] && out.classifications[0].categories) || [];
    } catch (e) { return; }
    const r = step(results, performance.now());
    if (r.status === 'found') return found(r);
    if (performance.now() < holdMsgUntil && r.status === 'looking') return;
    render(r);
  }

  function stop() {
    running = false;
    gen++;
    clearInterval(timer); timer = 0;
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    const v = $('look-video'); if (v) v.srcObject = null;
  }

  return { start, stop, step, load, state, cooldownLeft, capLeft, formFor, ringProb, ringCooldownLeft, _found: found, _render: render };
})();
