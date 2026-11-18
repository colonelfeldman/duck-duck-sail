// Save state + game rules that change it. localStorage is guarded: a storage failure never breaks play.
// SAVE DISCIPLINE: bump SAVE_VERSION when the shape changes and add a migration step. Never wipe a crew.
const SAVE_KEY = 'dds_save';
const SAVE_VERSION = 1;

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
      everHeld: {},          // 'duck-1': true … (promoting through a form still counts it)
      goldHeld: {},          // 'duck-1': true
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
    return Math.round(CONFIG.formBasePower[c.form] * CONFIG.levelFactor(c.level));
  }
  function formName(c) { return FAMILIES[0].forms[c.form].name; }
  function rarity(c) { return FAMILIES[0].forms[c.form].rarity; }

  // Roll a wild creature for an encounter.
  function rollWild(weights) {
    const form = Number(pickWeighted(weights || CONFIG.spawnWeights));
    return {
      species: 'duck',
      form,
      level: randInt(CONFIG.catchLevelRange[0], CONFIG.catchLevelRange[1]),
      size: pickWeighted(CONFIG.sizeWeights),
      gold: Math.random() < CONFIG.goldOdds,
    };
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
    S.everHeld[`${c.species}-${c.form}`] = true;
    if (c.gold) S.goldHeld[`${c.species}-${c.form}`] = true;
  }

  // Record a caught creature. Returns { creature, xp, levelUps }.
  function recordCatch(wild, { quality, curveball, provenance, xpMult = 1 }) {
    const c = {
      id: newId(),
      species: wild.species, form: wild.form, level: wild.level, size: wild.size, gold: wild.gold,
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
           canPowerUp, powerUp, canPromote, promote, release, pickWeighted, storageOk: () => storageOk };
})();
