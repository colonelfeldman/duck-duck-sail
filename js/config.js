// Duck, Duck, Sail! — every tuning number lives here (spec L8: starting values, re-tune after playtests).
// Bump VERSION on every deploy with: ./tools/bump-version.sh
const VERSION = '1.5.1';

// Testing mode = 2 min between encounters, 60 s sign cooldowns, simulate-scan buttons, TESTING badge.
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
  encounterCooldownMs: TESTING ? 2 * MIN : 7 * MIN,    // testing: 2 min (Jeff, 2026-11-18)
  encountersPerHourCap: TESTING ? 999 : 6,

  // Economy
  starter: { shells: 300, treats: 50 },        // labelled in How to Play
  startRings: { life: 30, premium: 5, golden: 1 },
  // Life Rings are limited (Jeff 2026-11-18): find real life rings on the ship with the camera to restock.
  lifeRings: {
    bagCap: (voyagerLevel) => 30 + 5 * (voyagerLevel - 1),   // max Life Rings you can carry (Lv1 30, Lv10 75, Lv30 175)
    scanRefill: 10,                                          // + per real life ring spotted
    scanCooldownMs: TESTING ? 2 * MIN : 15 * MIN,            // between life-ring refills
    levelUp: 10,                                             // + on each Voyager level-up
    dailyTopUp: { amount: 10, whenBelow: 10 },               // once a day, if you're running low
  },
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
  levelUpRewards: { premium: 1 },               // (+ CONFIG.lifeRings.levelUp Life Rings)

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
  spawnWeights: { 1: 70, 2: 25, 3: 5 },        // Form 1 / 2 / 3 (Common / Uncommon / Rare)

  // Which duck line turns up where (Jeff 2026-11-18: ducks first, more duck lines).
  lineWeights: {
    ship: { crew: 40, pool: 15, showtime: 12, galley: 18, explorer: 7, tourist: 8 },
    port: { tourist: 35, explorer: 30, crew: 15, pool: 10, galley: 10 },
  },
  // Port-day ducks: share of encounters on a port day that are that port's own special duck.
  portDuckShare: 0.25,

  // Rare colours (body feathers) — rolled after gold; gold overrides everything.
  colorOdds: { pink: 1 / 40, blue: 1 / 40, mint: 1 / 40, white: 1 / 80, rainbow: 1 / 300 },
  // Random accessories on any duck (skipped where the outfit already covers that spot).
  accessoryOdds: { sunglasses: 1 / 10, lei: 1 / 14 },

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
    // Calibration: degrees the phone camera sees along its LONG side (portrait = top-to-bottom).
    // Typical phone main cameras are ~65–72°. If the duck drifts WITH the phone when you turn, raise it;
    // if it races ahead of the room, lower it. Used with the real video size so the duck tracks the picture.
    cameraLongFovDeg: 68,
    fovDeg: 60,                // fallback only (before the video size is known): degrees across the screen width
    // Where the duck hides when the encounter starts (degrees from where the phone is pointing).
    spawn: {
      inViewChance: 0.3,                    // sometimes it's right there
      inView: { yaw: 8, pitch: 4 },         // ± small nudge when it's in view
      dirWeights: { left: 2, right: 2, up: 1, down: 1 },
      side: [40, 90],                       // left/right: how far you have to turn
      up: [35, 50],                         // above you
      down: [45, 60],                       // below you (toward the floor)
      jitter: 10,                           // ± on the other axis so it's never perfectly lined up
    },
    smoothing: 14,             // higher = snappier, lower = steadier
    waitMs: 3000,              // how long to wait for camera + motion before falling back to the overlay
  },

  // "Look for ducks": camera recognition (on-device). Recognized ducks skip the encounter timer.
  recognize: {
    enabled: true,
    intervalMs: 300,           // how often a camera frame is checked
    holdMs: 1200,              // the match must hold this long (steady) before a duck appears
    graceFrames: 2,            // a frame or two of no-match doesn't reset the hold
    minScore: 0.2,             // below this the model isn't sure enough to count
    tiers: { strong: 0.5, excellent: 0.85 },   // average score → Form 2 / Form 3 (below strong = Form 1); tuned on test photos 2026-11-18
    cooldownMs: TESTING ? 5 * MIN : 60 * MIN,  // per kind of thing (stage, food, …)
    dailyCap: TESTING ? 30 : 8,                // recognized ducks per day, all kinds together
    showReadout: TESTING,      // show what the phone thinks it sees (for tuning on the ship)
    spawnHere: false,          // false = after a match the duck hides nearby and you look around for it (Jeff 2026-11-18)
  },

  // Flee: chance after each failure = base × failure points (miss = 0.5 point, slip-off = 1)
  fleeBase: { 1: 0.06, 2: 0.10, 3: 0.15 },

  // Signs
  venueMs: 30 * MIN,
  signCooldownMs: TESTING ? 60 * 1000 : 24 * HOUR,

  // Post-catch auto return to Deck
  celebrateAutoMs: 8000,

  // Sign-in (shared with All Ashore). Google works because the game's address is in Supabase → Auth → Redirect URLs
  // (added by Jeff 2026-11-18: https://colonelfeldman.github.io/duck-duck-sail/**). A new address needs adding there too.
  auth: { google: true },
  // All Ashore's server: after sign-in the game checks in once (POST /api/user/sync, signup_source 'duck-duck-sail'),
  // which creates the All Ashore user record and sends the one-time Duck, Duck, Sail! welcome email for new accounts.
  allAshoreApi: 'https://allashore.app',

  supabase: {
    url: 'https://fubiwzfddoboajjkvfph.supabase.co',
    // Public anon key (same one All Ashore's site ships). dds_feedback allows INSERT only.
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1Yml3emZkZG9ib2Fqamt2ZnBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MzQ2NDEsImV4cCI6MjA5NDExMDY0MX0.SmDyESh5V2EDmli2QhrSEIJFARIZbtDO7M154XEdLlI',
  },
};

// Duck lines: each is its own 3-step promotion chain. All share Duck Treats.
const RARITY = { 1: 'Common', 2: 'Uncommon', 3: 'Rare' };
const DUCK_LINES = {
  crew:     { name: 'Crew',     forms: { 1: 'Cruise Duck',      2: 'Sailor Duck',      3: 'Captain Duck' } },
  pool:     { name: 'Pool',     forms: { 1: 'Floatie Duck',     2: 'Lifeguard Duck',   3: 'Swim Coach Duck' } },
  showtime: { name: 'Showtime', forms: { 1: 'Dancer Duck',      2: 'Star Duck',        3: 'Cruise Director Duck' } },
  galley:   { name: 'Galley',   forms: { 1: 'Snack Duck',       2: 'Line Cook Duck',   3: 'Head Chef Duck' } },
  explorer: { name: 'Explorer', forms: { 1: 'Snorkel Duck',     2: 'Scuba Duck',       3: 'Deep-Sea Duck' } },
  tourist:  { name: 'Tourist',  forms: { 1: 'Day-Tripper Duck', 2: 'Souvenir Duck',    3: 'Globetrotter Duck' } },
};
// Port ducks: one special duck per port, only on that port's day. Single form (can power up, not promote).
// `art` = a hand-drawn design in art.js; ports without one get the generic port duck (sash + flag colours).
const PORT_DUCKS = {
  'San Juan': { name: 'San Juan Duck', art: 'sanjuan', flag: ['#ED0000', '#FFFFFF', '#0050F0'],
                blurb: 'Straw pava hat, a coquí frog friend and a piragua to share.' },
};
const COLOR_NAMES = { pink: 'Pink', blue: 'Blue', mint: 'Mint', white: 'Snowy', rainbow: 'Rainbow' };
const ACCESSORY_NAMES = { sunglasses: 'Sunglasses', lei: 'Flower Lei' };

// Families (L7). Duck is built (with its lines); the others show as "coming soon" in the Passport.
const FAMILIES = [
  { id: 'duck',   name: 'Duck',         treat: 'Duck Treats', built: true },
  { id: 'towel',  name: 'Towel Animal', built: false },
  { id: 'gull',   name: 'Seagull',      built: false },
  { id: 'crab',   name: 'Crab',         built: false },
  { id: 'octo',   name: 'Octopus',      built: false },
];

// Sign database (seed). Payloads are exact strings.
const SIGNS = [
  { id: 'DDS-SIGN-LIDO',     name: 'Lido Deck',           style: 'lido',
    weights: { 1: 45, 2: 45, 3: 10 }, lines: { pool: 55, crew: 20, galley: 15, explorer: 10 },
    blurb: 'Pool Ducks love the Lido Deck.' },
  { id: 'DDS-SIGN-THEATER',  name: 'Grand Theater',       style: 'theater',
    weights: { 1: 35, 2: 35, 3: 30 }, lines: { showtime: 60, crew: 25, galley: 15 },
    blurb: 'Showtime Ducks come out for the show.' },
  { id: 'DDS-SIGN-LIFERING', name: 'Life Ring Station',   style: 'lifering',
    weights: null, lines: null, xpMult: CONFIG.xp.lifeRingStationMult, lifeRefill: true, blurb: 'Restocks Life Rings, and catches here earn +50% XP.' },
  { id: 'DDS-SIGN-SANJUAN',  name: 'Welcome to San Juan', style: 'sanjuan', port: 'San Juan',
    weights: null, lines: null, blurb: "Port day! San Juan's own duck is out today." },
];

// What the camera can recognize → which duck line appears. Labels are exact names from the model's list
// (ImageNet, via MediaPipe EfficientNet-Lite0). Deliberately NOT included: swimwear (would reward filming
// people at the pool), places of worship and sacred objects.
const RECOGNIZE_CATEGORIES = [
  { id: 'stage', line: 'showtime', name: 'Stage & show', where: 'by the stage', hint: "Something's stirring by the stage…",
    labels: ['theater curtain', 'stage', 'spotlight', 'microphone', 'grand piano', 'upright', 'electric guitar', 'acoustic guitar',
             'drum', 'sax', 'cornet', 'violin', 'accordion', 'maraca', 'cinema'] },
  { id: 'food', line: 'galley', name: 'Food & drink', where: 'near the food', hint: 'Something smells delicious…',
    labels: ['plate', 'pizza', 'ice cream', 'ice lolly', 'espresso', 'coffee mug', 'cup', 'cheeseburger', 'hotdog', 'bagel', 'french loaf',
             'pretzel', 'carbonara', 'guacamole', 'trifle', 'burrito', 'potpie', 'meat loaf', 'consomme', 'hot pot', 'chocolate sauce',
             'eggnog', 'red wine', 'wine bottle', 'beer glass', 'cocktail shaker', 'granny smith', 'banana', 'pineapple', 'strawberry',
             'orange', 'lemon', 'frying pan', 'wok', 'dining table', 'menu', 'restaurant'] },
  { id: 'poolside', line: 'pool', name: 'Poolside', where: 'poolside', hint: "Something's splashing nearby…",
    labels: ['sunscreen', 'lotion', 'bath towel', 'sunglasses', 'sunglass', 'umbrella', 'folding chair', 'water bottle'] },
  { id: 'sea', line: 'explorer', name: 'Sea & shore', where: 'by the water', hint: "Something's paddling out there…",
    labels: ['snorkel', 'coral reef', 'sandbar', 'seashore', 'lakeside', 'promontory', 'cliff', 'volcano', 'starfish', 'sea anemone',
             'jellyfish', 'conch', 'canoe', 'paddle', 'catamaran', 'trimaran', 'speedboat', 'breakwater'] },
  { id: 'sights', line: 'tourist', name: 'Sightseeing', where: 'sightseeing', hint: "Something's taking in the sights…",
    labels: ['backpack', 'reflex camera', 'polaroid camera', 'binoculars', 'street sign', 'palace', 'castle', 'triumphal arch', 'obelisk',
             'fountain', 'cab', 'trolleybus', 'streetcar', 'steel arch bridge', 'suspension bridge'] },
  { id: 'ship', line: 'crew', name: 'Ships & harbor', where: 'by the ships', hint: "Something's on deck…",
    labels: ['liner', 'container ship', 'lifeboat', 'pier', 'dock', 'schooner', 'yawl', 'fireboat', 'beacon', 'paddlewheel'] },
];
