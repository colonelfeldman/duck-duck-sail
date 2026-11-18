// Save state + game rules that change it. localStorage is guarded: a storage failure never breaks play.
// SAVE DISCIPLINE: bump SAVE_VERSION when the shape changes and add a migration step. Never wipe a crew.
const SAVE_KEY = 'dds_save';
const SAVE_VERSION = 2;

const Store = (() => {
  let S = null;
  let storageOk = true;

  function fresh() {
    return {
      v: SAVE_VERSION,
      createdAt: Date.now(),
      shells: CONFIG.starter.shells,
      treats: { duck: CONFIG.starter.treats },
      rings: { premium: CONFIG.startRings.premium, golden: CONFIG.startRings.golden },
      xp: 0,                 // XP toward next Voyager level
      level: 1,
      crew: [],
      everHeld: {},          // 'crew-1': true, 'port:San Juan': true … (promoting through a form still counts it)
      goldHeld: {},          // same keys, for gold ones
      colorsHeld: {},        // 'pink': true …
      accHeld: {},           // 'sunglasses': true …
      stamps: {},            // 'San Juan': timestamp
      nextEncounterAt: 0,
      encounterLog: [],      // timestamps of timed encounters, for the per-hour cap
      venue: null,           // { signId, until }
      signCooldowns: {},     // signId: timestamp of last scan
      seen: { safety: false, howto: false },
      stats: { catches: 0, throws: 0 },
    };
  }

  // Each step takes a save at version n and returns it at version n+1.
  // The prototype (Muse artifact, "v1" shape) had no ring inventory; fill defaults instead of wiping.
  const MIGRATIONS = {
    0: (s) => {
      const f = fresh();
      for (const k of Object.keys(f)) if (s[k] === undefined) s[k] = f[k];
      if (!s.rings) s.rings = { ...CONFIG.startRings };
      if (typeof s.treats === 'number') s.treats = { duck: s.treats };
      s.v = 1;
      return s;
    },
    // v1 → v2: duck lines. Every existing duck becomes the Crew line (Cruise/Sailor/Captain).
    1: (s) => {
      for (const c of s.crew || []) {
        if (!c.line) c.line = 'crew';
        if (!c.color) c.color = 'yellow';
        if (c.acc === undefined) c.acc = null;
      }
      const remap = (o) => { const n = {}; for (const [k, v] of Object.entries(o || {})) n[k.replace(/^duck-/, 'crew-')] = v; return n; };
      s.everHeld = remap(s.everHeld);
      s.goldHeld = remap(s.goldHeld);
      if (!s.colorsHeld) s.colorsHeld = {};
      if (!s.accHeld) s.accHeld = {};
      s.v = 2;
      return s;
    },
  };

  function migrate(s) {
    if (!s || typeof s !== 'object') return fresh();
    if (typeof s.v !== 'number') s.v = 0;
    while (s.v < SAVE_VERSION) {
      const step = MIGRATIONS[s.v];
      if (!step) break;
      s = step(s);
    }
    // Always backfill any missing top-level keys (forward-safe).
    const f = fresh();
    for (const k of Object.keys(f)) if (s[k] === undefined) s[k] = f[k];
    return s;
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { storageOk = false; }
    let parsed = null;
    if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
    if (parsed) {
      const before = typeof parsed.v === 'number' ? parsed.v : 0;
      S = migrate(parsed);
      if (before !== S.v) {
        try { localStorage.setItem(SAVE_KEY + '_backup_v' + before, raw); } catch (e) {}
      }
    } else {
      S = fresh();
    }
    save();
    return S;
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); storageOk = true; }
    catch (e) { storageOk = false; }
  }

  const get = () => S;

  // ---- helpers ----
  const pickWeighted = (weights) => {
    const entries = Object.entries(weights);
    const total = entries.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of entries) { if ((r -= w) < 0) return k; }
    return entries[entries.length - 1][0];
  };
  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const newId = () => {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  };

  function sailPower(c) {
    const base = c.line === 'port' ? CONFIG.formBasePower[2] : CONFIG.formBasePower[c.form];
    return Math.round(base * CONFIG.levelFactor(c.level));
  }
  // Base name, e.g. "Lifeguard Duck" or "San Juan Duck".
  function formName(c) {
    if (c.line === 'port') return (PORT_DUCKS[c.port] && PORT_DUCKS[c.port].name) || `${c.port} Duck`;
    const L = DUCK_LINES[c.line || 'crew'] || DUCK_LINES.crew;
    return L.forms[c.form];
  }
  // Full name with variant, e.g. "Gold Lifeguard Duck", "Pink Snack Duck".
  function displayName(c) {
    const pre = c.gold ? 'Gold ' : (c.color && COLOR_NAMES[c.color] ? COLOR_NAMES[c.color] + ' ' : '');
    return pre + formName(c);
  }
  function rarity(c) { return c.line === 'port' ? 'Port Special' : RARITY[c.form]; }
  function lineName(c) { return c.line === 'port' ? `${c.port} port duck` : `${(DUCK_LINES[c.line] || DUCK_LINES.crew).name} line`; }
  function heldKey(c) { return c.line === 'port' ? `port:${c.port}` : `${c.line || 'crew'}-${c.form}`; }

  // Roll a wild creature for an encounter.
  // opts: { weights: form weights, lines: line weights, port: name if it's that port's day }
  function rollWild(weights, opts = {}) {
    const base = {
      species: 'duck',
      level: randInt(CONFIG.catchLevelRange[0], CONFIG.catchLevelRange[1]),
      size: pickWeighted(CONFIG.sizeWeights),
      gold: Math.random() < CONFIG.goldOdds,
      color: 'yellow',
      acc: null,
    };
    if (opts.forceLine) {                     // camera recognition decides the line and form
      base.line = opts.forceLine;
      base.form = opts.forceForm || 1;
    } else if (opts.port && Math.random() < CONFIG.portDuckShare) {
      Object.assign(base, { line: 'port', port: opts.port, form: 2 });   // form 2 = Uncommon catch difficulty
    } else {
      base.line = pickWeighted(opts.lines || (opts.port ? CONFIG.lineWeights.port : CONFIG.lineWeights.ship));
      base.form = Number(pickWeighted(weights || CONFIG.spawnWeights));
    }
    if (!base.gold) {
      for (const [col, odds] of Object.entries(CONFIG.colorOdds)) { if (Math.random() < odds) { base.color = col; break; } }
    }
    for (const [acc, odds] of Object.entries(CONFIG.accessoryOdds)) {
      if (Math.random() < odds && ART.accessoryFits(base, acc)) { base.acc = acc; break; }
    }
    return base;
  }

  function addXp(amount) {
    // Returns list of { level, rewards } for each level gained.
    const gained = [];
    if (S.level >= CONFIG.voyagerMax) return gained;
    S.xp += Math.round(amount);
    while (S.level < CONFIG.voyagerMax && S.xp >= CONFIG.xpToNext(S.level)) {
      S.xp -= CONFIG.xpToNext(S.level);
      S.level += 1;
      S.rings.premium += CONFIG.levelUpRewards.premium;
      gained.push({ level: S.level, rewards: [`+${CONFIG.levelUpRewards.premium} Premium Ring`, `Power-up cap → Lv ${CONFIG.powerUpCap(S.level)}`] });
    }
    if (S.level >= CONFIG.voyagerMax) S.xp = 0;
    return gained;
  }

  function markHeld(c) {
    S.everHeld[heldKey(c)] = true;
    if (c.gold) S.goldHeld[heldKey(c)] = true;
    if (c.color && c.color !== 'yellow') S.colorsHeld[c.color] = true;
    if (c.acc) S.accHeld[c.acc] = true;
  }

  // Record a caught creature. Returns { creature, xp, levelUps }.
  function recordCatch(wild, { quality, curveball, provenance, xpMult = 1 }) {
    const c = {
      id: newId(),
      species: wild.species, line: wild.line || 'crew', port: wild.port, form: wild.form, level: wild.level, size: wild.size,
      gold: wild.gold, color: wild.color || 'yellow', acc: wild.acc || null,
      caughtAt: Date.now(),
      provenance: [provenance],
      promoted: false,
    };
    S.crew.unshift(c);
    markHeld(c);
    S.shells += CONFIG.catchReward.shells;
    S.treats.duck = (S.treats.duck || 0) + CONFIG.catchReward.treats;
    S.stats.catches += 1;
    let xp = CONFIG.xp.catchBase + (CONFIG.xp.quality[quality] || 0) + (curveball ? CONFIG.xp.curveball : 0);
    xp = Math.round(xp * xpMult);
    const levelUps = addXp(xp);
    save();
    return { creature: c, xp, levelUps };
  }

  function canPowerUp(c) {
    const cost = CONFIG.powerUpCost(c.level);
    const cap = Math.min(CONFIG.creatureLevelCap, CONFIG.powerUpCap(S.level));
    if (c.level >= cap) return { ok: false, why: c.level >= CONFIG.creatureLevelCap ? 'Max level' : `Reach Voyager Lv ${c.level - 9} to go higher`, cost };
    if (S.shells < cost.shells) return { ok: false, why: 'Not enough Shells', cost };
    if ((S.treats.duck || 0) < cost.treats) return { ok: false, why: 'Not enough Duck Treats', cost };
    return { ok: true, cost };
  }

  function powerUp(c) {
    const chk = canPowerUp(c);
    if (!chk.ok) return null;
    const before = sailPower(c);
    S.shells -= chk.cost.shells;
    S.treats.duck -= chk.cost.treats;
    c.level += 1;
    save();
    return { before, after: sailPower(c) };
  }

  function canPromote(c) {
    if (c.line === 'port') return { ok: false, why: 'Port ducks keep their look', cost: 0 };
    if (c.form >= 3) return { ok: false, why: 'Final form', cost: 0 };
    const cost = CONFIG.promoteCost[c.form];
    if ((S.treats.duck || 0) < cost) return { ok: false, why: 'Not enough Duck Treats', cost };
    return { ok: true, cost };
  }

  function promote(c) {
    const chk = canPromote(c);
    if (!chk.ok) return null;
    const oldName = formName(c);
    S.treats.duck -= chk.cost;
    c.form += 1;
    c.promoted = true;
    const newName = formName(c);
    c.provenance.push(`Promoted from ${oldName} to ${newName} · ${new Date().toLocaleDateString()}`);
    markHeld(c);
    const levelUps = addXp(CONFIG.xp.promote);
    save();
    return { oldName, newName, levelUps };
  }

  function release(c) {
    const i = S.crew.findIndex((x) => x.id === c.id);
    if (i < 0) return false;
    S.crew.splice(i, 1);
    S.treats.duck = (S.treats.duck || 0) + CONFIG.releaseTreats;
    save();
    return true;
  }

  return { load, save, get, fresh, migrate, rollWild, recordCatch, addXp, sailPower, formName, rarity,
           displayName, lineName, heldKey,
           canPowerUp, powerUp, canPromote, promote, release, pickWeighted, storageOk: () => storageOk };
})();
