// Creature + ring artwork. Each form is a distinct full-body SVG design (not hat swaps).
// Duck SVG viewBox is 0 0 200 230; the neck point (where a landed ring rests) is NECK.
const ART = (() => {
  let uidN = 0;
  const uid = (p) => `${p}${++uidN}`;

  const NECK = { x: 108, y: 112 };    // in viewBox units
  const VB = { w: 200, h: 230 };

  const PAL = {
    normal: { body: '#FFD43B', shade: '#F2B90F', beak: '#FF8C1A', foot: '#FF8C1A', eye: '#1E2333',
              navy: '#1F3A6B', white: '#FFFFFF', red: '#E23B3B', gold: '#F2C230', goldDark: '#B8860B', cheek: '#FF9E8A' },
    gold:   { body: '#F6C93A', shade: '#D9A11A', beak: '#E8941E', foot: '#E8941E', eye: '#5A3B00',
              navy: '#A87B12', white: '#FFF3C4', red: '#E0A526', gold: '#FFE680', goldDark: '#8A6100', cheek: '#FFC56B' },
  };

  function eyes(p) {
    return `
      <g class="eye-n"><circle cx="130" cy="62" r="5.5" fill="${p.eye}"/><circle cx="132" cy="60" r="1.8" fill="#fff"/></g>
      <g class="eye-s"><circle cx="130" cy="61" r="10" fill="#fff" stroke="${p.eye}" stroke-width="1.5"/><circle cx="131" cy="61" r="4.5" fill="${p.eye}"/></g>
      <g class="eye-h"><path d="M123 63 Q130 54 137 63" fill="none" stroke="${p.eye}" stroke-width="3" stroke-linecap="round"/></g>`;
  }

  function feet(p) {
    return `<g class="feet">
      <path d="M78 196 l-14 18 h30 z" fill="${p.foot}"/>
      <path d="M112 198 l-12 17 h30 z" fill="${p.foot}"/></g>`;
  }

  function headBase(p) {
    return `
      <circle cx="115" cy="72" r="40" fill="${p.body}"/>
      <path d="M146 66 Q186 70 184 80 Q170 92 146 86 Z" fill="${p.beak}"/>
      <path d="M148 78 Q166 82 182 80" stroke="${p.shade}" stroke-width="1.5" fill="none"/>
      <ellipse cx="128" cy="80" rx="7" ry="4" fill="${p.cheek}" opacity=".55"/>
      ${eyes(p)}`;
  }

  // Form 1 — Cruise Duck: plain sunny-yellow duck, no clothing.
  function cruise(p) {
    return `
      ${feet(p)}
      <path d="M32 132 L14 112 L44 122 Z" fill="${p.shade}"/>
      <ellipse cx="95" cy="150" rx="68" ry="52" fill="${p.body}"/>
      <ellipse cx="100" cy="168" rx="50" ry="28" fill="${p.shade}" opacity=".25"/>
      <g class="wing"><ellipse cx="82" cy="146" rx="36" ry="22" transform="rotate(-12 82 146)" fill="${p.shade}"/>
        <path d="M58 150 Q80 162 108 150" stroke="${p.body}" stroke-width="2" fill="none" opacity=".7"/></g>
      ${headBase(p)}`;
  }

  // Form 2 — Sailor Duck: white sailor cap, navy collar flap, red neckerchief, striped suit, saluting wing.
  function sailor(p) {
    const clip = uid('sb');
    let stripes = '';
    for (let y = 100; y < 205; y += 14) stripes += `<rect x="20" y="${y}" width="160" height="7" fill="${p.navy}"/>`;
    return `
      <defs><clipPath id="${clip}"><ellipse cx="95" cy="150" rx="68" ry="52"/></clipPath></defs>
      ${feet(p)}
      <path d="M32 132 L14 112 L44 122 Z" fill="${p.shade}"/>
      <g clip-path="url(#${clip})"><rect x="20" y="95" width="160" height="110" fill="${p.white}"/>${stripes}</g>
      <ellipse cx="95" cy="150" rx="68" ry="52" fill="none" stroke="${p.navy}" stroke-width="2"/>
      <!-- collar flap on the back -->
      <path d="M58 98 L108 104 L98 142 L50 134 Z" fill="${p.navy}"/>
      <path d="M62 104 L102 109 L94 136 L56 129 Z" fill="none" stroke="${p.white}" stroke-width="2.5"/>
      <!-- saluting arm: rises from the far shoulder behind the head -->
      <g class="wing salute">
        <path d="M70 118 Q72 70 120 40 L150 36 Q154 44 146 50 Q104 70 92 124 Z" fill="${p.white}" stroke="${p.navy}" stroke-width="2"/>
        <path d="M76 100 Q84 84 96 74 M82 112 Q88 96 100 84" stroke="${p.navy}" stroke-width="5" fill="none"/>
      </g>
      ${headBase(p)}
      <!-- neckerchief -->
      <path d="M112 106 L146 108 L130 140 Z" fill="${p.red}"/>
      <circle cx="128" cy="110" r="6" fill="${p.red}" stroke="#9e2222" stroke-width="1"/>
      <!-- white sailor cap (dixie cup) -->
      <path d="M86 40 Q114 10 142 40 Z" fill="${p.white}" stroke="#c9d3e3" stroke-width="1.5"/>
      <ellipse cx="114" cy="41" rx="32" ry="8" fill="${p.white}" stroke="#c9d3e3" stroke-width="1.5"/>
      <path d="M90 34 Q114 26 138 34" stroke="${p.navy}" stroke-width="3" fill="none"/>
      <!-- salute: wing tip touching the cap brim -->
      <ellipse cx="148" cy="44" rx="13" ry="7" transform="rotate(-25 148 44)" fill="${p.body}" stroke="${p.shade}" stroke-width="1.5"/>`;
  }

  // Form 3 — Captain Duck: navy jacket, gold buttons + epaulettes, medal on chain, white gold-trimmed hat with anchor.
  function captain(p) {
    const clip = uid('cb');
    let buttons = '';
    for (const y of [132, 150, 168]) buttons += `<circle cx="138" cy="${y}" r="3.6" fill="${p.gold}" stroke="${p.goldDark}" stroke-width="1"/><circle cx="152" cy="${y + 2}" r="3.6" fill="${p.gold}" stroke="${p.goldDark}" stroke-width="1"/>`;
    let fringe = '';
    for (let i = 0; i < 6; i++) fringe += `<line x1="${66 + i * 6}" y1="112" x2="${64 + i * 6}" y2="124" stroke="${p.gold}" stroke-width="2.5" stroke-linecap="round"/>`;
    return `
      <defs><clipPath id="${clip}"><ellipse cx="95" cy="150" rx="68" ry="52"/></clipPath></defs>
      <g class="aura">
        <path class="spark s1" d="M30 60 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z" fill="${p.gold}"/>
        <path class="spark s2" d="M176 120 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2 z" fill="${p.gold}"/>
        <path class="spark s3" d="M40 190 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2 z" fill="${p.gold}"/>
        <path class="spark s4" d="M170 20 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z" fill="${p.gold}"/>
      </g>
      ${feet(p)}
      <path d="M32 132 L14 112 L44 122 Z" fill="${p.shade}"/>
      <g clip-path="url(#${clip})">
        <rect x="20" y="95" width="160" height="110" fill="${p.navy}"/>
        <path d="M118 98 L134 98 L128 132 Z" fill="${p.white}"/>
        <rect x="20" y="190" width="160" height="4" fill="${p.gold}"/>
      </g>
      ${buttons}
      <!-- epaulette -->
      <ellipse cx="80" cy="108" rx="22" ry="8" fill="${p.gold}" stroke="${p.goldDark}" stroke-width="1.5"/>${fringe}
      <g class="wing"><path d="M60 140 Q84 126 112 140 Q108 166 76 166 Q58 160 60 140 Z" fill="${p.navy}" stroke="#0f2242" stroke-width="1.5"/>
        <path d="M100 146 L106 162 M94 148 L99 164" stroke="${p.gold}" stroke-width="3"/>
        <ellipse cx="114" cy="158" rx="9" ry="7" fill="${p.body}"/></g>
      ${headBase(p)}
      <!-- medal on a chain -->
      <path d="M102 110 L124 138 L142 108" fill="none" stroke="${p.gold}" stroke-width="2" stroke-dasharray="3 2"/>
      <path d="M118 136 L124 146 L130 136 Z" fill="${p.red}"/>
      <circle cx="124" cy="152" r="8" fill="${p.gold}" stroke="${p.goldDark}" stroke-width="1.5"/>
      <path d="M124 147 l1.6 3.4 3.6.4 -2.7 2.4.8 3.6 -3.3 -1.9 -3.3 1.9.8 -3.6 -2.7 -2.4 3.6 -.4 z" fill="${p.goldDark}"/>
      <!-- captain's hat -->
      <path d="M78 46 Q80 18 116 16 Q152 18 154 46 Z" fill="${p.white}" stroke="#c9d3e3" stroke-width="1.5"/>
      <rect x="80" y="40" width="72" height="11" rx="3" fill="${p.navy}"/>
      <rect x="80" y="38" width="72" height="3" fill="${p.gold}"/>
      <path d="M118 50 Q150 50 164 58 Q140 60 118 56 Z" fill="#14171f"/>
      <path d="M126 50 Q146 52 160 57" stroke="${p.gold}" stroke-width="1.5" fill="none"/>
      <g transform="translate(116 30)">
        <circle cx="0" cy="0" r="8" fill="${p.gold}" stroke="${p.goldDark}" stroke-width="1"/>
        <path d="M0 -5 v10 M-4 -2 h8 M-5 2 Q0 7 5 2" stroke="${p.navy}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      </g>`;
  }

  function duckSVG(form, gold, extraClass = '') {
    const p = gold ? PAL.gold : PAL.normal;
    const body = form === 3 ? captain(p) : form === 2 ? sailor(p) : cruise(p);
    return `<svg class="duck form${form} ${gold ? 'gold' : ''} ${extraClass}" viewBox="0 0 ${VB.w} ${VB.h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
  }

  const RING_COLORS = {
    life:    { base: '#FFFFFF', band: '#E4472F', edge: '#b9c3cf' },
    premium: { base: '#E7F0FF', band: '#2F6FDB', edge: '#8aa6d6' },
    golden:  { base: '#FFE58A', band: '#D19A12', edge: '#a87b12' },
  };

  function ringCore(type) {
    const c = RING_COLORS[type] || RING_COLORS.life;
    const circ = 2 * Math.PI * 38;               // r=38
    const seg = circ / 8;
    return `
      <circle cx="50" cy="50" r="38" fill="none" stroke="${c.edge}" stroke-width="20"/>
      <circle cx="50" cy="50" r="38" fill="none" stroke="${c.base}" stroke-width="17"/>
      <circle cx="50" cy="50" r="38" fill="none" stroke="${c.band}" stroke-width="17" stroke-dasharray="${seg} ${seg}"/>
      <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="3" transform="translate(-2 -3)"/>`;
  }

  // Round ring seen face-on (the one you throw).
  function ringSVG(type) {
    return `<svg class="ring-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${ringCore(type)}</svg>`;
  }

  // A ring split into back (top) and front (bottom) halves, so it can sit *around* the neck.
  function ringHalf(type, half) {
    const id = uid('rh');
    const y = half === 'back' ? 0 : 50;
    return `<svg class="ring-half" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><clipPath id="${id}"><rect x="-10" y="${y}" width="120" height="50"/></clipPath></defs>
      <g clip-path="url(#${id})">${ringCore(type)}</g></svg>`;
  }

  return { duckSVG, ringSVG, ringHalf, NECK, VB };
})();
