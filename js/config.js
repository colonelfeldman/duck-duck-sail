// Duck, Duck, Sail! — every tuning number lives here (spec L8: starting values, re-tune after playtests).
// Bump VERSION on every deploy with: ./tools/bump-version.sh
const VERSION = '1.0.4';

// Testing mode = 20 s encounters, 60 s sign cooldowns, simulate-scan buttons, TESTING badge.
// PLAYTEST: while only a couple of people are testing, the normal link IS the testing build.
// Set PLAYTEST = false before a wider release → normal link gets the real 7-minute pace.
// Either way, ?test=1 / ?test=0 forces it on/off on that device (remembered).
const PLAYTEST = true;
const TESTING = (() => {
  const p = new URLSearchParams(location.search).get('test');
  try {
    if (p === '1') localStorage.setItem('dds_test', '1');
    if (p === '0') localStorage.setItem('dds_test', '0');
    const v = localStorage.getItem('dds_test');
    return v === null ? PLAYTEST : v === '1';
  } catch (e) {
    return p === null ? PLAYTEST : p === '1';
  }
})();

const MIN = 60 * 1000, HOUR = 60 * MIN;

const CONFIG = {
  // Encounters
  encounterCooldownMs: TESTING ? 20 * 1000 : 7 * MIN,
  encountersPerHourCap: TESTING ? 999 : 6,

  // Economy
  starter: { shells: 300, treats: 50 },        // labelled in How to Play
  startRings: { premium: 5, golden: 1 },
  catchReward: { shells: 100, treats: 3 },
  releaseTreats: 1,
  crewCap: 250,

  // XP
  xp: {
    catchBase: 100,
    quality: { Excellent: 50, Great: 25, Nice: 10 },
    curveball: 30,
    promote: 25,
    lifeRingStationMult: 1.5,                   // DDS-SIGN-LIFERING: +50% XP
  },
  voyagerMax: 30,
  xpToNext: (lvl) => 250 + 150 * (lvl - 1),    // XP needed to go from lvl to lvl+1
  levelUpRewards: { premium: 1 },

  // Creatures
  catchLevelRange: [1, 10],
  creatureLevelCap: 30,
  powerUpCap: (voyagerLevel) => Math.min(30, voyagerLevel + 10),
  powerUpCost: (lvl) => ({
    shells: 30 * (1 + Math.floor((lvl - 1) / 5)),
    treats: 2 + Math.floor((lvl - 1) / 10),
  }),
  promoteCost: { 1: 25, 2: 100 },              // Treats: Form 1→2, Form 2→3
  formBasePower: { 1: 100, 2: 180, 3: 300 },
  levelFactor: (lvl) => 0.6 + 0.04 * lvl,
  sizeWeights: { XS: 10, S: 20, M: 40, L: 20, XL: 10 },
  goldOdds: 1 / 128,
  spawnWeights: { 1: 70, 2: 25, 3: 5 },        // Cruise / Sailor / Captain

  // Throw
  curveballSpin: 2.5,
  maxSpin: 5,
  landing: { excellent: 0.35, great: 1.0, nice: 1.3 },  // × duck body radius
  flightMs: 750,
  rings: {
    life:    { name: 'Life Ring',    tol: 1.0,  pull: 1.0,  tension: 1.0 },
    premium: { name: 'Premium Ring', tol: 1.18, pull: 1.15, tension: 0.85 },
    golden:  { name: 'Golden Ring',  tol: 1.35, pull: 1.4,  tension: 0.6 },
  },
  buttonThrowSpread: 0.25,                     // × body radius, random within

  // Reel
  reel: {
    startBonus: { Excellent: 0.25, Great: 0.15, Nice: 0.05 },
    pullPerSec: 0.24,
    calmTensionPerSec: 0.12,
    struggleTensionPerSec: { 1: 0.45, 2: 0.85, 3: 1.25 },
    releaseTensionPerSec: 0.9,
    slipBackPerSec: { calm: 0.02, struggle: 0.07 },
    curveballTension: 0.85,
    pinnedMs: 600,
    struggleMs: 700,
    warnMs: 250,
    calmMs: { 1: [1100, 2000], 2: [900, 1600], 3: [700, 1300] },
  },

  // Look-around mode (gyroscope): the duck holds a direction in the room and you turn the phone to find it.
  // Only with the camera on. iPhone asks once for motion access. Falls back to the plain overlay if no motion data.
  lookAround: {
    enabled: true,             // on for everyone (Jeff, 2026-11-18); 🧭 lets a player turn it off
    defaultOn: true,           // per-device toggle (🧭 on the catch screen) remembers the player's choice
    fovDeg: 60,                // how many degrees of turning sweep across the screen width
    spawnYawDeg: [20, 45],     // the duck appears this far to the left or right of where you're facing
    smoothing: 14,             // higher = snappier, lower = steadier
    waitMs: 3000,              // how long to wait for camera + motion before falling back to the overlay
  },

  // Flee: chance after each failure = base × failure points (miss = 0.5 point, slip-off = 1)
  fleeBase: { 1: 0.06, 2: 0.10, 3: 0.15 },

  // Signs
  venueMs: 30 * MIN,
  signCooldownMs: TESTING ? 60 * 1000 : 24 * HOUR,

  // Post-catch auto return to Deck
  celebrateAutoMs: 8000,

  supabase: {
    url: 'https://fubiwzfddoboajjkvfph.supabase.co',
    // Public anon key (same one All Ashore's site ships). dds_feedback allows INSERT only.
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1Yml3emZkZG9ib2Fqamt2ZnBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MzQ2NDEsImV4cCI6MjA5NDExMDY0MX0.SmDyESh5V2EDmli2QhrSEIJFARIZbtDO7M154XEdLlI',
  },
};

// Families (L7). Only Duck is built; the others show as "coming soon" in the Passport.
const FAMILIES = [
  { id: 'duck',   name: 'Duck',         treat: 'Duck Treats', built: true,
    forms: { 1: { name: 'Cruise Duck', rarity: 'Common' }, 2: { name: 'Sailor Duck', rarity: 'Uncommon' }, 3: { name: 'Captain Duck', rarity: 'Rare' } } },
  { id: 'towel',  name: 'Towel Animal', built: false },
  { id: 'gull',   name: 'Seagull',      built: false },
  { id: 'crab',   name: 'Crab',         built: false },
  { id: 'octo',   name: 'Octopus',      built: false },
];

// Sign database (seed). Payloads are exact strings.
const SIGNS = [
  { id: 'DDS-SIGN-LIDO',     name: 'Lido Deck',           style: 'lido',
    weights: { 1: 45, 2: 45, 3: 10 }, blurb: 'Sailor Ducks love the pool deck.' },
  { id: 'DDS-SIGN-THEATER',  name: 'Grand Theater',       style: 'theater',
    weights: { 1: 35, 2: 35, 3: 30 }, blurb: 'Captains come out for the show.' },
  { id: 'DDS-SIGN-LIFERING', name: 'Life Ring Station',   style: 'lifering',
    weights: null, xpMult: CONFIG.xp.lifeRingStationMult, blurb: 'Catches here earn +50% XP.' },
  { id: 'DDS-SIGN-SANJUAN',  name: 'Welcome to San Juan', style: 'sanjuan', port: 'San Juan',
    weights: null, blurb: 'Port sign: stamps your Passport.' },
];
