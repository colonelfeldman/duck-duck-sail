// 3D bath-duck PREVIEW for the catch screen (design playtest, not final).
// Duck3D.show(container, creature) draws a 3D duck into the encounter's art box once three.js has loaded;
// until then (or if WebGL / the download fails) the flat SVG duck already in the box stays.
// The ring halves, hop/squash/flee animations and hit judging all stay in catch.js — this only draws.
const Duck3D = (() => {
  const THREE_URL = new URL('vendor/three/0.160.0/three.module.min.js', document.baseURI).href;
  let THREE = null, loading = null, failed = false;
  let R = null;          // { renderer, scene, camera, root }
  let cur = null;        // { duck, head, lids, parts, box, raf, t0, nextBlink }
  let want = 0;          // bumps on every show/hide so late loads don't draw a stale duck

  // ---- per-line personality (from the design mockups) ----
  const FACE = {
    crew:     { eyes: 'cool',    brows: 'confident',  bill: 'long',     expr: 'smirk',  color: 'orange', nostrils: true,  outfit: 'sailor' },
    pool:     { eyes: 'sleepy',  brows: 'none',       bill: 'droopy',   expr: 'smile',  color: 'red',    nostrils: false, outfit: 'plain' },
    showtime: { eyes: 'lashes',  brows: 'arched',     bill: 'upturned', expr: 'smile',  color: 'pink',   nostrils: false, outfit: 'plain' },
    galley:   { eyes: 'sparkle', brows: 'bushy',      bill: 'wide',     expr: 'open',   color: 'orange', nostrils: false, outfit: 'chef' },
    explorer: { eyes: 'classic', brows: 'determined', bill: 'long',     expr: 'closed', color: 'coral',  nostrils: true,  outfit: 'plain' },
    tourist:  { eyes: 'sparkle', brows: 'worried',    bill: 'stubby',   expr: 'open',   color: 'gold',   nostrils: true,  outfit: 'plain' },
    port:     { eyes: 'classic', brows: 'straight',   bill: 'classic',  expr: 'smile',  color: 'orange', nostrils: false, outfit: 'plain' },
  };
  const BILL_COLORS = { orange: [0xff5a14, 0xe34408], coral: [0xff6f4f, 0xe0513a], red: [0xe8341c, 0xb8240f], pink: [0xff7fa8, 0xe25d8a], gold: [0xff9500, 0xd87400] };
  const BODY = { yellow: 0xffc400, pink: 0xffb3c7, blue: 0xa6d8ff, mint: 0xa8f0c8, white: 0xf4f7fb, rainbow: 0xd9b3ff };
  const SHAPES = {
    classic:  { w: 1,    l: 1.05, t: 0.52, rx: 0 },
    stubby:   { w: 1.02, l: 0.74, t: 0.58, rx: -0.04 },
    long:     { w: 0.86, l: 1.32, t: 0.48, rx: 0.02 },
    wide:     { w: 1.32, l: 1.0,  t: 0.42, rx: 0 },
    upturned: { w: 0.98, l: 1.06, t: 0.5,  rx: -0.2 },
    droopy:   { w: 0.98, l: 1.08, t: 0.52, rx: 0.16 },
  };

  function load() {
    if (THREE || failed) return Promise.resolve(THREE);
    if (!loading) loading = import(THREE_URL).then((m) => { THREE = m; return m; }).catch(() => { failed = true; return null; });
    return loading;
  }

  function setup() {
    if (R) return R;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cssText = `position:absolute;display:block;pointer-events:none;left:${-PAD.x * 100}%;top:${-PAD.y * 100}%;width:${(1 + 2 * PAD.x) * 100}%;height:${(1 + 2 * PAD.y) * 100}%`;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cfb8, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(3, 6, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.9); rim.position.set(-4, 3, -3); scene.add(rim);
    // Orthographic so the duck's neck lands exactly where the flat art's neck was (ART.NECK), keeping the ring right.
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
    camera.position.set(0, 1.6, 10); camera.lookAt(0, 1.6, 0);
    const root = new THREE.Group(); scene.add(root);
    R = { renderer, scene, camera, root };
    return R;
  }

  // ---------- model ----------
  function build(c) {
    const f = FACE[c.line] || FACE.crew;
    const rubber = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.5, ...extra });
    const bodyCol = c.gold ? 0xf6c93a : (BODY[c.color] || BODY.yellow);
    const M = {
      body: c.gold ? rubber(bodyCol, { roughness: 0.25, metalness: 0.35, clearcoat: 0.8 }) : rubber(bodyCol, { roughness: 0.42 }),
      white: rubber(0xffffff, { roughness: 0.3 }), black: rubber(0x0d0f14, { roughness: 0.15, clearcoat: 1 }),
      brow: rubber(0x4a2c00, { roughness: 0.6 }), mouth: rubber(0x6e1a08, { roughness: 0.7, clearcoat: 0 }),
      navy: rubber(0x1f3a6b), red: rubber(0xe23b3b), cloth: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }),
    };
    const [bt, bu] = c.gold ? [0xe8941e, 0xc8761a] : BILL_COLORS[f.color];
    const bm = { top: rubber(bt, { roughness: 0.45 }), under: rubber(bu, { roughness: 0.5 }) };
    const S = (r = 1) => new THREE.SphereGeometry(r, 40, 30);
    const add = (parent, geo, mat, pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0]) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot); parent.add(m); return m;
    };

    const duck = new THREE.Group();
    const parts = [];
    parts.push(add(duck, S(1), M.body, [0, 0.62, -0.1], [0.92, 0.6, 1.18]));
    parts.push(add(duck, S(0.62), M.body, [0, 0.78, 0.42], [1.05, 0.95, 0.95]));
    parts.push(add(duck, S(0.5), M.body, [0, 0.98, -0.92], [1.05, 0.95, 0.9], [-0.55, 0, 0]));
    parts.push(add(duck, S(0.32), M.body, [0, 1.32, -1.18], [0.95, 1.0, 0.75], [-0.9, 0, 0]));
    for (const s of [-1, 1]) add(duck, S(0.5), M.body, [0.74 * s, 0.82, -0.32], [0.22, 0.42, 0.8], [0.25, 0, 0.12 * s]);
    const head = new THREE.Group(); duck.add(head); head.position.set(0, 1.68, 0.42);
    add(head, S(0.66), M.body, [0, 0, 0], [1, 0.98, 1.02]);

    // eyes
    const lids = [];
    const glint = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyeBase = (s, ring = 0.105) => {
      const e = new THREE.Group(); head.add(e);
      e.position.set(0.36 * s, 0.16, 0.5); e.lookAt(new THREE.Vector3(1.4 * s, 0.5, 2.2).add(head.position));
      add(e, new THREE.CylinderGeometry(ring, ring, 0.04, 32), M.white, [0, 0, 0.02], [1, 1, 1], [Math.PI / 2, 0, 0]);
      const lid = add(e, S(ring + 0.006), M.body, [0, 0, 0.03], [1, 1, 0.45]); lid.visible = false; lids.push(lid);
      return e;
    };
    const pupil = (e, r = 0.072, y = 0, glints = 1) => {
      add(e, S(r), M.black, [0, y, 0.05], [1, 1, 0.5]);
      add(e, S(r * 0.28), glint, [r * 0.35, y + r * 0.42, 0.085]);
      if (glints > 1) add(e, S(r * 0.14), glint, [-r * 0.3, y - r * 0.3, 0.085]);
    };
    const topLid = (e, frac, tilt, r = 0.112) => add(e, new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI * frac), M.body, [0, 0, 0.03], [1, 1, 0.9], [0.1, 0, tilt]);
    const EYES = {
      classic: (s) => pupil(eyeBase(s)),
      cool: (s) => { const e = eyeBase(s); pupil(e, 0.07, -0.01); topLid(e, 0.4, -0.12 * s); },
      sparkle: (s) => pupil(eyeBase(s, 0.125), 0.092, 0, 2),
      lashes: (s) => { const e = eyeBase(s); pupil(e, 0.075, 0, 2);
        for (const [a, l] of [[-0.55, 0.07], [-0.15, 0.08], [0.3, 0.07]]) add(e, new THREE.CapsuleGeometry(0.012, l, 4, 8), M.black,
          [Math.sin(a) * 0.115 * -s, Math.cos(a) * 0.115, 0.03], [1, 1, 1], [0, 0, a * -s - 0.25 * s]); },
      sleepy: (s) => { const e = eyeBase(s); pupil(e, 0.06, -0.03); topLid(e, 0.56, 0.05 * s); },
    };
    // brows
    const brow = (s, tilt, y = 0.35, thick = 0.035, len = 0.17) =>
      add(head, new THREE.CapsuleGeometry(thick, len, 6, 12), M.brow, [0.37 * s, y, 0.5], [1, 1, 1], [0, 0.55 * s, Math.PI / 2 + tilt * s]);
    const BROWS = {
      none: () => {},
      straight: (s) => brow(s, 0, 0.36),
      confident: (s) => brow(s, s > 0 ? -0.45 : 0.3, s > 0 ? 0.385 : 0.34),
      determined: (s) => brow(s, 0.45, 0.35, 0.04),
      worried: (s) => brow(s, -0.45, 0.37, 0.032),
      arched: (s) => { const cv = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.27 * s, 0.33, 0.56), new THREE.Vector3(0.38 * s, 0.45, 0.52), new THREE.Vector3(0.5 * s, 0.34, 0.4));
        add(head, new THREE.TubeGeometry(cv, 20, 0.016, 8), M.brow); },
      bushy: (s) => { for (let i = 0; i < 6; i++) { const t = i / 5; add(head, S(0.055 + Math.sin(t * Math.PI) * 0.02), M.brow,
        [(0.27 + t * 0.2) * s, 0.36 + Math.sin(t * Math.PI) * 0.03, 0.55 - t * 0.12], [1, 0.8, 0.7]); } },
    };
    for (const s of [-1, 1]) { (EYES[f.eyes] || EYES.classic)(s); (BROWS[f.brows] || BROWS.none)(s); }

    // bill
    const lathe = (len, r, flare) => { const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20;
      pts.push(new THREE.Vector2(Math.max(0.001, r * Math.pow(Math.sin(Math.PI * t), 0.6) * (1 - flare + flare * 2 * t)), t * len)); } return new THREE.LatheGeometry(pts, 40); };
    const bill = new THREE.Group(); head.add(bill); bill.position.set(0, -0.1, 0.42);
    const sh = SHAPES[f.bill] || SHAPES.classic;
    const upper = (o = {}) => add(bill, lathe(0.78, 0.36, 0.22), bm.top, [0, 0.04, 0], [sh.w, sh.l, sh.t], [Math.PI / 2 - 0.1 + sh.rx + (o.rx || 0), 0, o.rz || 0]);
    const lower = (o = {}) => add(bill, lathe(0.62, 0.28, 0.18), bm.under, [0, -0.06 + (o.y || 0), 0.02], [sh.w * 0.92, sh.l * 0.95, sh.t * 0.8], [Math.PI / 2 + 0.06 + sh.rx * 0.6 + (o.rx || 0), 0, o.rz || 0]);
    let top;
    if (f.expr === 'smile') { top = upper({ rx: -0.03 }); lower(); }
    else if (f.expr === 'smirk') { top = upper({ rz: 0.05 }); lower({ rz: -0.1, rx: 0.04 }); }
    else if (f.expr === 'open') { top = upper({ rx: -0.05 }); lower({ rx: 0.16, y: -0.02 }); add(bill, S(0.2), M.mouth, [0, -0.03, 0.3], [0.85 * sh.w, 0.22, sh.l]); }
    else { top = upper(); lower(); }
    if (f.nostrils) {
      duck.updateMatrixWorld(true);
      const rc = new THREE.Raycaster();
      for (const s of [-1, 1]) {
        const o = bill.localToWorld(new THREE.Vector3(0.07 * s, 1, 0.52 * sh.l));
        rc.set(o, new THREE.Vector3(0, -1, 0)); const hit = rc.intersectObject(top)[0]; if (!hit) continue;
        const p = bill.worldToLocal(hit.point.clone()); add(bill, S(0.028), M.mouth, [p.x, p.y - 0.004, p.z], [0.7, 0.45, 1.3], [0, 0.25 * s, 0]);
      }
    }

    // outfits (only Crew and Galley have 3D outfits so far)
    if (f.outfit === 'sailor') {
      add(head, new THREE.CylinderGeometry(0.36, 0.42, 0.28, 40), M.white, [0, 0.66, -0.04], [1, 1, 1], [-0.12, 0, 0]);
      add(head, new THREE.TorusGeometry(0.43, 0.075, 14, 40), M.white, [0, 0.55, -0.02], [1, 1, 1], [Math.PI / 2 - 0.12, 0, 0]);
      add(head, new THREE.CylinderGeometry(0.365, 0.365, 0.06, 40), M.navy, [0, 0.68, -0.05], [1, 1, 1], [-0.12, 0, 0]);
      add(duck, new THREE.BoxGeometry(0.95, 0.5, 0.06), M.navy, [0, 1.18, 0.0], [1, 1, 1], [0.5, 0, 0]);
      add(duck, new THREE.ConeGeometry(0.2, 0.42, 3), M.red, [0, 1.02, 1.02], [1, 1, 0.4], [Math.PI + 0.3, 0, 0]);
      add(duck, S(0.09), M.red, [0, 1.2, 0.98]);
      if (!c.gold) {
        const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256; const g = cv.getContext('2d');
        for (let y = 0; y < 256; y += 32) { g.fillStyle = '#fff'; g.fillRect(0, y, 64, 16); g.fillStyle = '#1f3a6b'; g.fillRect(0, y + 16, 64, 16); }
        const tx = new THREE.CanvasTexture(cv); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(1, 4); tx.colorSpace = THREE.SRGBColorSpace;
        const sm = rubber(0xffffff, { map: tx }); parts[0].material = sm; parts[1].material = sm;
      }
    } else if (f.outfit === 'chef') {
      add(head, new THREE.CylinderGeometry(0.42, 0.44, 0.32, 40), M.cloth, [0, 0.66, -0.04]);
      for (const [x, y, z, r] of [[0, 1.05, -0.04, 0.34], [-0.28, 0.95, 0, 0.27], [0.28, 0.95, 0, 0.27], [0, 0.97, -0.3, 0.27], [0, 0.97, 0.22, 0.25]]) add(head, S(r), M.cloth, [x, y, z]);
      add(duck, S(0.6), M.cloth, [0, 0.68, 0.72], [1.05, 0.8, 0.42]);
      add(duck, new THREE.ConeGeometry(0.17, 0.32, 3), M.red, [0, 1.06, 1.02], [1, 1, 0.4], [Math.PI + 0.3, 0, 0]);
    }
    // faces the same way as the flat art (bill to the right), turned three-quarters toward the player
    duck.rotation.y = TURN;
    return { duck, head, lids, tall: f.outfit === 'chef' };
  }

  // Frame the ortho camera so the duck's neck sits on ART.NECK inside the 200×230 art box.
  // The canvas is bigger than the box (PAD on each side) so the tail and hats are never clipped.
  const PAD = { x: 0.35, y: 0.2 };
  const TURN = 0.7;
  function frame(box, tall) {
    const w = box.clientWidth || 200, h = box.clientHeight || 230;
    const W = w * (1 + 2 * PAD.x), H = h * (1 + 2 * PAD.y);
    R.renderer.setSize(W, H, false);
    const wpp = (tall ? 3.3 : 2.95) / h;                 // world units per CSS pixel
    const neckW = new THREE.Vector3(0, 1.22, 0.45).applyEuler(new THREE.Euler(0, TURN, 0));
    const nx = PAD.x * w + (ART.NECK.x / ART.VB.w) * w;   // neck position in canvas pixels
    const ny = PAD.y * h + (ART.NECK.y / ART.VB.h) * h;
    const cam = R.camera;
    cam.left = neckW.x - nx * wpp; cam.right = cam.left + W * wpp;
    cam.top = neckW.y + ny * wpp - 1.6; cam.bottom = cam.top - H * wpp;   // camera sits at y 1.6
    cam.updateProjectionMatrix();
    return { w, h };
  }

  function loop() {
    if (!cur) return;
    const box = cur.box;
    if (!box.isConnected) { stop(); return; }
    cur.raf = requestAnimationFrame(loop);
    if (box.offsetParent === null) return;            // screen hidden: skip drawing
    const t = (performance.now() - cur.t0) / 1000;
    if (box.clientWidth !== cur.w || box.clientHeight !== cur.h) { const s = frame(box, cur.tall); cur.w = s.w; cur.h = s.h; }
    const dk = box.closest('.dk');
    const struggling = dk && dk.classList.contains('struggle');
    cur.duck.position.y = Math.sin(t * 1.6) * 0.03;
    cur.duck.rotation.z = Math.sin(t * 1.2) * 0.025;
    cur.head.rotation.y = struggling ? Math.sin(t * 30) * 0.25 : Math.sin(t * 0.6) * 0.12;
    const blink = t > cur.nextBlink && t < cur.nextBlink + 0.13;
    if (t > cur.nextBlink + 0.13) cur.nextBlink = t + 2 + Math.random() * 3;
    for (const l of cur.lids) l.visible = blink;
    R.renderer.render(R.scene, R.camera);
  }

  function stop() {
    if (!cur) return;
    cancelAnimationFrame(cur.raf);
    R.root.remove(cur.duck);
    cur.duck.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    cur = null;
  }

  async function show(box, creature) {
    const my = ++want;
    stop();
    const T = await load();
    if (!T || my !== want || !box.isConnected) return false;
    try {
      setup();
      const m = build(creature);
      R.root.add(m.duck);
      box.innerHTML = '';
      box.appendChild(R.renderer.domElement);
      cur = { ...m, box, raf: 0, t0: performance.now(), nextBlink: 1.5, w: 0, h: 0 };
      loop();
      return true;
    } catch (e) {
      console.warn('3D duck failed, keeping the flat one', e);
      failed = true; stop();
      return false;
    }
  }
  function hide() { want++; stop(); }

  // fetch the engine quietly after start-up so the first catch already shows the 3D duck
  window.addEventListener('load', () => setTimeout(load, 1500));
  return { show, hide, preload: load };
})();
