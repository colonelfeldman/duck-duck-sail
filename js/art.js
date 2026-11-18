// Creature + ring artwork. Every form is a distinct full-body SVG design (not hat swaps).
// Duck SVG viewBox is 0 0 200 230; the neck point (where a landed ring rests) is NECK.
// All colours come from a palette `p`, so gold versions recolour the whole outfit.
const ART = (() => {
  let uidN = 0;
  const uid = (p) => `${p}${++uidN}`;

  const NECK = { x: 108, y: 112 };
  const VB = { w: 200, h: 230 };

  const BASE = {
    body: '#FFD43B', shade: '#F2B90F', beak: '#FF8C1A', foot: '#FF8C1A', eye: '#1E2333', cheek: '#FF9E8A',
    navy: '#1F3A6B', white: '#FFFFFF', red: '#E23B3B', gold: '#F2C230', goldDark: '#B8860B',
    pink: '#FF6F9F', pinkLight: '#FFD1E0', purple: '#7B3FBF', teal: '#14A3A3', black: '#1B1F2A', grey: '#5B6472',
    silver: '#C9D3DD', green: '#2FA85A', blue: '#2F7DE0', sky: '#8FD0FF', khaki: '#C9A86A', brown: '#8B5A2B',
    cream: '#FFF4D6', tan: '#E2B77A', straw: '#E8C877', orange: '#FF8A1F', brass: '#C8962E', frog: '#7A8F3A',
    glass: 'rgba(170,225,255,.5)',
  };
  const BODY = {
    yellow: ['#FFD43B', '#F2B90F'], pink: ['#FFB3C7', '#F28AA8'], blue: ['#A6D8FF', '#6FB8EF'],
    mint: ['#A8F0C8', '#6FD39F'], white: ['#FFFFFF', '#D5DDE8'], rainbow: [null, '#F3A6D6'],
  };

  // Gold variant: every colour becomes one of three golds by brightness.
  function lum(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex); if (!m) return 0.5;
    const n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }
  function goldify(p) {
    const g = {};
    for (const [k, v] of Object.entries(p)) {
      if (k === 'glass') { g[k] = 'rgba(255,236,160,.45)'; continue; }
      const L = lum(v);
      g[k] = L > 0.8 ? '#FFF3C4' : L > 0.55 ? '#F2C230' : L > 0.3 ? '#C8962E' : '#8A6100';
    }
    g.body = '#F6C93A'; g.shade = '#D9A11A'; g.beak = '#E8941E'; g.foot = '#E8941E'; g.eye = '#5A3B00'; g.cheek = '#FFC56B';
    return g;
  }

  // ---------- shared parts ----------
  const eyes = (p) => `
      <g class="eye-n"><circle cx="130" cy="62" r="5.5" fill="${p.eye}"/><circle cx="132" cy="60" r="1.8" fill="#fff"/></g>
      <g class="eye-s"><circle cx="130" cy="61" r="10" fill="#fff" stroke="${p.eye}" stroke-width="1.5"/><circle cx="131" cy="61" r="4.5" fill="${p.eye}"/></g>
      <g class="eye-h"><path d="M123 63 Q130 54 137 63" fill="none" stroke="${p.eye}" stroke-width="3" stroke-linecap="round"/></g>`;
  const feet = (p, col) => `<g class="feet">
      <path d="M78 196 l-14 18 h30 z" fill="${col || p.foot}"/><path d="M112 198 l-12 17 h30 z" fill="${col || p.foot}"/></g>`;
  const flippers = (col) => `<g class="feet">
      <path d="M66 194 L46 222 Q70 228 94 222 L84 194 Z" fill="${col}"/><path d="M104 196 L90 224 Q114 230 138 222 L122 196 Z" fill="${col}"/></g>`;
  const tail = (p) => `<path d="M32 132 L14 112 L44 122 Z" fill="${p.shade}"/>`;
  const bodyEl = (p) => `<ellipse cx="95" cy="150" rx="68" ry="52" fill="${p.body}"/>`;
  const belly = (p) => `<ellipse cx="100" cy="168" rx="50" ry="28" fill="${p.shade}" opacity=".25"/>`;
  const wing = (p, fill) => `<g class="wing"><ellipse cx="82" cy="146" rx="36" ry="22" transform="rotate(-12 82 146)" fill="${fill || p.shade}"/>
        <path d="M58 150 Q80 162 108 150" stroke="${p.body}" stroke-width="2" fill="none" opacity=".7"/></g>`;
  const head = (p) => `
      <circle cx="115" cy="72" r="40" fill="${p.body}"/>
      <path d="M146 66 Q186 70 184 80 Q170 92 146 86 Z" fill="${p.beak}"/>
      <path d="M148 78 Q166 82 182 80" stroke="${p.shade}" stroke-width="1.5" fill="none"/>
      <ellipse cx="128" cy="80" rx="7" ry="4" fill="${p.cheek}" opacity=".55"/>
      ${eyes(p)}`;
  // Clip helper: draws `inner` only inside the body ellipse.
  function inBody(inner) {
    const id = uid('cb');
    return `<defs><clipPath id="${id}"><ellipse cx="95" cy="150" rx="68" ry="52"/></clipPath></defs><g clip-path="url(#${id})">${inner}</g>`;
  }
  const outline = (col) => `<ellipse cx="95" cy="150" rx="68" ry="52" fill="none" stroke="${col}" stroke-width="2"/>`;
  const star = (x, y, r, fill) => {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      d += (i ? 'L' : 'M') + (x + Math.cos(a) * rr).toFixed(1) + ' ' + (y + Math.sin(a) * rr).toFixed(1);
    }
    return `<path d="${d}Z" fill="${fill}"/>`;
  };
  const aura = (p) => `<g class="aura">
        <path class="spark s1" d="M30 60 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z" fill="${p.gold}"/>
        <path class="spark s2" d="M176 120 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2 z" fill="${p.gold}"/>
        <path class="spark s3" d="M40 190 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2 z" fill="${p.gold}"/>
        <path class="spark s4" d="M170 20 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z" fill="${p.gold}"/></g>`;
  const mask = (p) => `
      <path d="M152 58 Q150 40 115 40 Q80 42 76 60" fill="none" stroke="${p.black}" stroke-width="4"/>
      <rect x="116" y="47" width="40" height="28" rx="11" fill="${p.glass}" stroke="${p.blue}" stroke-width="4"/>`;

  // ================= CREW line =================
  const crew1 = (p) => `${feet(p)}${tail(p)}${bodyEl(p)}${belly(p)}${wing(p)}${head(p)}`;

  function crew2(p) {
    let stripes = '';
    for (let y = 100; y < 205; y += 14) stripes += `<rect x="20" y="${y}" width="160" height="7" fill="${p.navy}"/>`;
    return `${feet(p)}${tail(p)}
      ${inBody(`<rect x="20" y="95" width="160" height="110" fill="${p.white}"/>${stripes}`)}${outline(p.navy)}
      <path d="M58 98 L108 104 L98 142 L50 134 Z" fill="${p.navy}"/>
      <path d="M62 104 L102 109 L94 136 L56 129 Z" fill="none" stroke="${p.white}" stroke-width="2.5"/>
      <g class="wing salute">
        <path d="M70 118 Q72 70 120 40 L150 36 Q154 44 146 50 Q104 70 92 124 Z" fill="${p.white}" stroke="${p.navy}" stroke-width="2"/>
        <path d="M76 100 Q84 84 96 74 M82 112 Q88 96 100 84" stroke="${p.navy}" stroke-width="5" fill="none"/></g>
      ${head(p)}
      <path d="M112 106 L146 108 L130 140 Z" fill="${p.red}"/>
      <circle cx="128" cy="110" r="6" fill="${p.red}"/>
      <path d="M86 40 Q114 10 142 40 Z" fill="${p.white}" stroke="#c9d3e3" stroke-width="1.5"/>
      <ellipse cx="114" cy="41" rx="32" ry="8" fill="${p.white}" stroke="#c9d3e3" stroke-width="1.5"/>
      <path d="M90 34 Q114 26 138 34" stroke="${p.navy}" stroke-width="3" fill="none"/>
      <ellipse cx="148" cy="44" rx="13" ry="7" transform="rotate(-25 148 44)" fill="${p.body}" stroke="${p.shade}" stroke-width="1.5"/>`;
  }

  function crew3(p) {
    let buttons = '';
    for (const y of [132, 150, 168]) buttons += `<circle cx="138" cy="${y}" r="3.6" fill="${p.gold}" stroke="${p.goldDark}"/><circle cx="152" cy="${y + 2}" r="3.6" fill="${p.gold}" stroke="${p.goldDark}"/>`;
    let fringe = '';
    for (let i = 0; i < 6; i++) fringe += `<line x1="${66 + i * 6}" y1="112" x2="${64 + i * 6}" y2="124" stroke="${p.gold}" stroke-width="2.5" stroke-linecap="round"/>`;
    return `${aura(p)}${feet(p)}${tail(p)}
      ${inBody(`<rect x="20" y="95" width="160" height="110" fill="${p.navy}"/><path d="M118 98 L134 98 L128 132 Z" fill="${p.white}"/><rect x="20" y="190" width="160" height="4" fill="${p.gold}"/>`)}
      ${buttons}
      <ellipse cx="80" cy="108" rx="22" ry="8" fill="${p.gold}" stroke="${p.goldDark}" stroke-width="1.5"/>${fringe}
      <g class="wing"><path d="M60 140 Q84 126 112 140 Q108 166 76 166 Q58 160 60 140 Z" fill="${p.navy}"/>
        <path d="M100 146 L106 162 M94 148 L99 164" stroke="${p.gold}" stroke-width="3"/>
        <ellipse cx="114" cy="158" rx="9" ry="7" fill="${p.body}"/></g>
      ${head(p)}
      <path d="M102 110 L124 138 L142 108" fill="none" stroke="${p.gold}" stroke-width="2" stroke-dasharray="3 2"/>
      <path d="M118 136 L124 146 L130 136 Z" fill="${p.red}"/>
      <circle cx="124" cy="152" r="8" fill="${p.gold}" stroke="${p.goldDark}" stroke-width="1.5"/>
      ${star(124, 152, 4.5, p.goldDark)}
      <path d="M78 46 Q80 18 116 16 Q152 18 154 46 Z" fill="${p.white}" stroke="#c9d3e3" stroke-width="1.5"/>
      <rect x="80" y="40" width="72" height="11" rx="3" fill="${p.navy}"/>
      <rect x="80" y="38" width="72" height="3" fill="${p.gold}"/>
      <path d="M118 50 Q150 50 164 58 Q140 60 118 56 Z" fill="${p.black}"/>
      <g transform="translate(116 30)"><circle r="8" fill="${p.gold}" stroke="${p.goldDark}"/>
        <path d="M0 -5 v10 M-4 -2 h8 M-5 2 Q0 7 5 2" stroke="${p.navy}" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>`;
  }

  // ================= POOL line =================
  function pool1(p) {   // Floatie Duck: bobbing in a striped swim ring, arm floaty
    const arc = (sweep) => `<path d="M14 172 A82 24 0 0 ${sweep} 176 172" fill="none" stroke="${p.pink}" stroke-width="20"/>
      <path d="M14 172 A82 24 0 0 ${sweep} 176 172" fill="none" stroke="${p.white}" stroke-width="20" stroke-dasharray="20 22"/>`;
    return `<path d="M10 212 q15 -7 30 0 t30 0 t30 0 t30 0 t30 0 t30 0" stroke="${p.sky}" stroke-width="4" fill="none"/>
      ${arc(1)}${tail(p)}${bodyEl(p)}${belly(p)}${wing(p)}
      <rect x="50" y="138" width="22" height="18" rx="8" fill="${p.orange}" stroke="${p.white}" stroke-width="2"/>
      ${head(p)}${arc(0)}`;
  }
  function pool2(p) {   // Lifeguard Duck: red top, rescue tube, whistle, visor, zinc on the beak
    return `<rect x="16" y="112" width="26" height="78" rx="12" transform="rotate(-18 29 151)" fill="${p.red}" stroke="${p.white}" stroke-width="2"/>
      ${feet(p)}${tail(p)}
      ${inBody(`<rect x="20" y="95" width="160" height="110" fill="${p.body}"/><rect x="20" y="104" width="160" height="62" fill="${p.red}"/><rect x="20" y="116" width="160" height="5" fill="${p.white}"/>`)}
      <text x="136" y="150" font-family="Arial, sans-serif" font-weight="900" font-size="12" fill="${p.white}" text-anchor="middle">GUARD</text>
      ${wing(p)}${head(p)}
      <path d="M150 71 Q166 70 178 75" stroke="${p.white}" stroke-width="5" stroke-linecap="round" fill="none"/>
      <path d="M78 52 Q115 34 152 50" stroke="${p.green}" stroke-width="9" fill="none" stroke-linecap="round"/>
      <path d="M138 46 Q172 42 176 54 Q152 56 140 55 Z" fill="${p.green}"/>
      <path d="M96 108 Q112 134 130 110" stroke="${p.silver}" stroke-width="2" fill="none"/>
      <rect x="106" y="126" width="16" height="9" rx="3" fill="${p.silver}" stroke="${p.grey}"/>`;
  }
  function pool3(p) {   // Swim Coach Duck: tracksuit, swim cap + goggles, stopwatch, clipboard
    return `${aura(p)}${feet(p)}${tail(p)}
      <rect x="34" y="120" width="32" height="44" rx="3" fill="${p.brown}"/><rect x="38" y="126" width="24" height="34" fill="${p.white}"/>
      <path d="M42 134 h16 M42 141 h16 M42 148 h12" stroke="${p.grey}" stroke-width="2"/>
      ${inBody(`<rect x="20" y="95" width="160" height="110" fill="${p.teal}"/>
        <path d="M30 120 Q95 104 160 120 M30 128 Q95 112 160 128" stroke="${p.white}" stroke-width="4" fill="none"/>
        <rect x="132" y="98" width="4" height="110" fill="${p.white}"/>`)}
      <g class="wing"><ellipse cx="96" cy="150" rx="34" ry="20" transform="rotate(-20 96 150)" fill="${p.teal}" stroke="${p.white}" stroke-width="2"/>
        <ellipse cx="128" cy="140" rx="8" ry="7" fill="${p.body}"/></g>
      <circle cx="146" cy="136" r="12" fill="${p.silver}" stroke="${p.grey}" stroke-width="2"/><circle cx="146" cy="136" r="8" fill="${p.white}"/>
      <path d="M146 136 v-6 M146 136 l4 3" stroke="${p.black}" stroke-width="1.8"/><rect x="143" y="120" width="6" height="5" fill="${p.grey}"/>
      ${head(p)}
      <path d="M75 66 Q76 28 115 30 Q154 30 155 58 Q115 48 75 66 Z" fill="${p.navy}"/>
      <path d="M78 52 Q115 38 154 50" stroke="${p.black}" stroke-width="3" fill="none"/>
      <circle cx="120" cy="44" r="7" fill="${p.sky}" stroke="${p.black}" stroke-width="2"/><circle cx="139" cy="46" r="7" fill="${p.sky}" stroke="${p.black}" stroke-width="2"/>`;
  }

  // ================= SHOWTIME line =================
  function show1(p) {   // Dancer Duck: tutu, raised wing, bow
    return `${feet(p)}${tail(p)}
      <g class="wing"><path d="M74 116 Q46 66 90 24 Q100 20 102 28 Q72 66 92 118 Z" fill="${p.shade}"/></g>
      ${bodyEl(p)}${belly(p)}
      <path d="M28 166 L38 188 L50 170 L62 192 L74 172 L86 194 L98 174 L110 194 L122 174 L134 192 L146 172 L158 188 L164 164 Q95 146 28 166 Z" fill="${p.pinkLight}" stroke="${p.pink}" stroke-width="2"/>
      ${head(p)}
      <path d="M100 34 L84 24 L86 44 Z M100 34 L116 24 L114 44 Z" fill="${p.pink}"/><circle cx="100" cy="34" r="5" fill="${p.pink}"/>`;
  }
  function show2(p) {   // Star Duck: sequin jacket, gold star, microphone
    let seq = '';
    for (let i = 0; i < 26; i++) seq += `<circle cx="${30 + (i * 37) % 130}" cy="${104 + (i * 23) % 96}" r="2.2" fill="${p.gold}"/>`;
    return `${feet(p)}${tail(p)}
      ${inBody(`<rect x="20" y="95" width="160" height="110" fill="${p.purple}"/>${seq}`)}
      ${star(140, 140, 12, p.gold)}
      ${wing(p, p.purple)}
      ${head(p)}
      <path d="M150 118 L164 92" stroke="${p.black}" stroke-width="7" stroke-linecap="round"/>
      <circle cx="166" cy="88" r="9" fill="${p.silver}" stroke="${p.grey}" stroke-width="2"/>
      <path d="M160 85 h12 M159 89 h14 M160 93 h12" stroke="${p.grey}" stroke-width="1"/>
      <ellipse cx="150" cy="122" rx="9" ry="7" fill="${p.body}"/>
      ${star(98, 36, 9, p.gold)}`;
  }
  function show3(p) {   // Cruise Director Duck: tuxedo, top hat, bow tie, cane
    return `${aura(p)}${feet(p)}${tail(p)}
      ${inBody(`<rect x="20" y="95" width="160" height="110" fill="${p.black}"/><path d="M110 98 L148 98 L130 168 Z" fill="${p.white}"/>
        <circle cx="130" cy="130" r="2.5" fill="${p.black}"/><circle cx="130" cy="146" r="2.5" fill="${p.black}"/>`)}
      <path d="M118 108 L130 114 L118 120 Z M142 108 L130 114 L142 120 Z" fill="${p.red}"/><circle cx="130" cy="114" r="3" fill="${p.red}"/>
      <circle cx="104" cy="126" r="5" fill="${p.red}"/>
      <path d="M150 210 L160 130 Q162 118 172 122" stroke="${p.black}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <circle cx="172" cy="124" r="4" fill="${p.gold}"/>
      <g class="wing"><path d="M60 140 Q90 126 118 142 Q112 168 78 166 Q58 160 60 140 Z" fill="${p.black}"/>
        <ellipse cx="160" cy="140" rx="9" ry="7" fill="${p.body}"/></g>
      ${head(p)}
      <rect x="90" y="2" width="48" height="38" rx="3" fill="${p.black}"/><rect x="90" y="28" width="48" height="7" fill="${p.red}"/>
      <ellipse cx="114" cy="40" rx="36" ry="7" fill="${p.black}"/>`;
  }

  // ================= GALLEY line =================
  function galley1(p) {   // Snack Duck: checked bib, ice cream cone
    const id = uid('bib');
    let check = '';
    for (let i = 0; i < 6; i++) check += `<rect x="${100 + i * 8}" y="100" width="4" height="60" fill="${p.red}" opacity=".7"/><rect x="96" y="${104 + i * 8}" width="56" height="4" fill="${p.red}" opacity=".7"/>`;
    return `${feet(p)}${tail(p)}${bodyEl(p)}${belly(p)}${wing(p)}
      <defs><clipPath id="${id}"><path d="M98 104 L150 104 L124 154 Z"/></clipPath></defs>
      <path d="M98 104 L150 104 L124 154 Z" fill="${p.white}"/><g clip-path="url(#${id})">${check}</g>
      ${head(p)}
      <path d="M140 160 L160 160 L150 196 Z" fill="${p.tan}" stroke="${p.brown}" stroke-width="1.5"/>
      <path d="M143 166 L157 176 M157 166 L145 182" stroke="${p.brown}" stroke-width="1"/>
      <circle cx="150" cy="150" r="12" fill="${p.pinkLight}"/><circle cx="144" cy="138" r="9" fill="${p.brown}"/><circle cx="148" cy="128" r="3.5" fill="${p.red}"/>
      <ellipse cx="136" cy="166" rx="9" ry="7" fill="${p.body}"/>
      <circle cx="170" cy="88" r="1.6" fill="${p.tan}"/><circle cx="176" cy="92" r="1.3" fill="${p.tan}"/>`;
  }
  function galley2(p) {   // Line Cook Duck: short chef jacket, bandana, spatula
    let btn = '';
    for (const y of [122, 140, 158]) btn += `<circle cx="132" cy="${y}" r="3" fill="${p.black}"/><circle cx="148" cy="${y + 1}" r="3" fill="${p.black}"/>`;
    return `${feet(p)}${tail(p)}
      ${inBody(`<rect x="20" y="95" width="160" height="110" fill="${p.white}"/><rect x="20" y="182" width="160" height="30" fill="${p.body}"/>
        <path d="M120 100 L120 182" stroke="${p.silver}" stroke-width="2"/>`)}${outline(p.silver)}${btn}
      <path d="M150 182 L170 128" stroke="${p.black}" stroke-width="6" stroke-linecap="round"/>
      <rect x="160" y="96" width="22" height="34" rx="3" fill="${p.silver}" stroke="${p.grey}" stroke-width="1.5"/>
      <path d="M166 102 v20 M171 102 v20 M176 102 v20" stroke="${p.grey}" stroke-width="2"/>
      <g class="wing"><ellipse cx="96" cy="150" rx="34" ry="20" transform="rotate(-18 96 150)" fill="${p.white}" stroke="${p.silver}" stroke-width="2"/>
        <rect x="118" y="140" width="10" height="16" fill="${p.white}" stroke="${p.silver}"/><ellipse cx="148" cy="174" rx="9" ry="7" fill="${p.body}"/></g>
      ${head(p)}
      <path d="M76 62 Q78 30 116 32 Q152 32 154 58 Q116 48 76 62 Z" fill="${p.red}"/>
      <path d="M80 54 L64 48 L66 62 Z" fill="${p.red}"/><circle cx="96" cy="42" r="2" fill="${p.white}"/><circle cx="124" cy="38" r="2" fill="${p.white}"/><circle cx="140" cy="46" r="2" fill="${p.white}"/>`;
  }
  function galley3(p) {   // Head Chef Duck: tall toque, full chef coat, neckerchief, moustache, cloche platter
    let btn = '';
    for (const y of [128, 148, 168, 188]) btn += `<circle cx="134" cy="${y}" r="3" fill="${p.black}"/>`;
    return `${aura(p)}${feet(p)}${tail(p)}
      ${inBody(`<rect x="20" y="95" width="160" height="110" fill="${p.white}"/>`)}${outline(p.silver)}${btn}
      <g class="wing"><ellipse cx="90" cy="150" rx="34" ry="20" transform="rotate(-10 90 150)" fill="${p.white}" stroke="${p.silver}" stroke-width="2"/></g>
      <ellipse cx="150" cy="182" rx="38" ry="7" fill="${p.silver}" stroke="${p.grey}"/>
      <path d="M116 180 Q150 128 184 180 Z" fill="${p.silver}" stroke="${p.grey}" stroke-width="1.5"/>
      <path d="M130 170 Q140 150 156 146" stroke="${p.white}" stroke-width="3" fill="none" opacity=".8"/>
      <circle cx="150" cy="140" r="4" fill="${p.grey}"/><ellipse cx="114" cy="182" rx="9" ry="7" fill="${p.body}"/>
      ${head(p)}
      <path d="M110 106 L146 108 L128 128 Z" fill="${p.red}"/>
      <path d="M148 86 q8 9 16 1 q8 8 16 -1" stroke="${p.black}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <rect x="88" y="26" width="56" height="18" rx="4" fill="${p.white}" stroke="${p.silver}" stroke-width="1.5"/>
      <circle cx="98" cy="18" r="15" fill="${p.white}" stroke="${p.silver}" stroke-width="1.5"/>
      <circle cx="134" cy="18" r="15" fill="${p.white}" stroke="${p.silver}" stroke-width="1.5"/>
      <circle cx="116" cy="10" r="18" fill="${p.white}" stroke="${p.silver}" stroke-width="1.5"/>
      <rect x="90" y="22" width="52" height="16" fill="${p.white}"/>`;
  }

  // ================= EXPLORER line =================
  function explorer1(p) {   // Snorkel Duck: mask, snorkel, flippers
    return `${flippers(p.green)}${tail(p)}${bodyEl(p)}${belly(p)}${wing(p)}${head(p)}${mask(p)}
      <path d="M118 54 L104 54 L104 10 Q104 2 112 2" fill="none" stroke="${p.orange}" stroke-width="7" stroke-linecap="round"/>`;
  }
  function explorer2(p) {   // Scuba Duck: wetsuit, air tank, regulator, mask, flippers
    return `<rect x="18" y="88" width="28" height="84" rx="12" fill="${p.gold}" stroke="${p.goldDark}" stroke-width="2"/>
      <rect x="26" y="78" width="12" height="12" fill="${p.black}"/>
      ${flippers(p.teal)}${tail(p)}
      ${inBody(`<rect x="20" y="95" width="160" height="110" fill="${p.black}"/><path d="M40 112 Q95 160 150 112" stroke="${p.teal}" stroke-width="10" fill="none"/>`)}
      ${wing(p, p.black)}${head(p)}${mask(p)}
      <path d="M32 82 Q60 40 110 70 Q138 86 152 90" stroke="${p.black}" stroke-width="5" fill="none"/>
      <circle cx="154" cy="90" r="7" fill="${p.black}"/>`;
  }
  function explorer3(p) {   // Deep-Sea Duck: brass diving helmet with porthole, canvas suit, weighted boots, air hose
    let bolts = '';
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; bolts += `<circle cx="${(128 + Math.cos(a) * 31).toFixed(1)}" cy="${(68 + Math.sin(a) * 31).toFixed(1)}" r="2.6" fill="${p.goldDark}"/>`; }
    return `${aura(p)}
      <rect x="58" y="192" width="38" height="24" rx="5" fill="${p.grey}"/><rect x="98" y="194" width="38" height="24" rx="5" fill="${p.grey}"/>
      ${tail(p)}
      ${inBody(`<rect x="20" y="95" width="160" height="110" fill="${p.khaki}"/><rect x="20" y="170" width="160" height="10" fill="${p.brown}"/>
        <rect x="88" y="168" width="14" height="14" fill="${p.brass}"/>`)}
      <g class="wing"><ellipse cx="88" cy="148" rx="34" ry="20" transform="rotate(-12 88 148)" fill="${p.khaki}" stroke="${p.brown}" stroke-width="2"/>
        <rect x="114" y="144" width="12" height="14" rx="3" fill="${p.brass}"/></g>
      ${head(p)}
      <path fill-rule="evenodd" fill="${p.brass}" stroke="${p.goldDark}" stroke-width="2"
        d="M115 18 a52 52 0 1 0 0.1 0 Z M128 42 a26 26 0 1 1 -0.1 0 Z"/>
      <circle cx="128" cy="68" r="26" fill="${p.glass}" stroke="${p.goldDark}" stroke-width="5"/>${bolts}
      <ellipse cx="110" cy="120" rx="46" ry="10" fill="${p.brass}" stroke="${p.goldDark}" stroke-width="2"/>
      <path d="M66 74 Q30 90 40 140" stroke="${p.black}" stroke-width="6" fill="none"/>`;
  }

  // ================= TOURIST line =================
  function tourist1(p) {   // Day-Tripper Duck: backpack, map, baseball cap
    return `<rect x="18" y="98" width="38" height="58" rx="12" fill="${p.brown}"/><rect x="24" y="124" width="26" height="18" rx="5" fill="${p.tan}"/>
      ${feet(p)}${tail(p)}${bodyEl(p)}${belly(p)}
      <path d="M96 104 Q104 140 106 178 M80 106 Q76 140 74 176" stroke="${p.brown}" stroke-width="6" fill="none"/>
      ${wing(p)}
      <path d="M126 136 L152 130 L172 138 L170 166 L150 160 L126 166 Z" fill="${p.cream}" stroke="${p.tan}" stroke-width="1.5"/>
      <path d="M152 130 L150 160" stroke="${p.tan}" stroke-width="1.5"/>
      <path d="M132 158 Q144 140 160 150" stroke="${p.red}" stroke-width="2" stroke-dasharray="3 3" fill="none"/>
      <ellipse cx="128" cy="160" rx="9" ry="7" fill="${p.body}"/>
      ${head(p)}
      <path d="M76 60 Q76 30 114 30 Q150 30 152 54 Q114 46 76 60 Z" fill="${p.orange}"/>
      <path d="M140 48 Q174 44 180 56 Q158 60 142 56 Z" fill="${p.orange}"/><circle cx="114" cy="31" r="3" fill="${p.white}"/>`;
  }
  function tourist2(p) {   // Souvenir Duck: flower shirt, camera, straw sun hat, shopping bag
    let fl = '';
    for (const [x, y] of [[40, 130], [70, 112], [62, 170], [96, 140], [120, 176], [130, 120], [90, 190], [150, 150]])
      fl += `<circle cx="${x}" cy="${y}" r="7" fill="${p.pink}"/><circle cx="${x}" cy="${y}" r="2.5" fill="${p.white}"/>`;
    return `<path d="M18 150 h30 l-3 38 h-24 z" fill="${p.pinkLight}" stroke="${p.pink}" stroke-width="2"/>
      <path d="M26 150 q7 -12 14 0" stroke="${p.pink}" stroke-width="2" fill="none"/>
      ${feet(p)}${tail(p)}
      ${inBody(`<rect x="20" y="95" width="160" height="110" fill="${p.sky}"/>${fl}`)}
      ${wing(p, p.sky)}${head(p)}
      <path d="M100 106 Q124 130 146 106" stroke="${p.black}" stroke-width="2" fill="none"/>
      <rect x="112" y="124" width="32" height="22" rx="4" fill="${p.black}"/><circle cx="128" cy="135" r="7" fill="${p.silver}" stroke="${p.grey}" stroke-width="2"/>
      <rect x="136" y="120" width="6" height="4" fill="${p.grey}"/>
      <ellipse cx="112" cy="40" rx="50" ry="11" fill="${p.straw}" stroke="${p.tan}" stroke-width="1.5"/>
      <path d="M86 40 Q88 12 114 12 Q140 12 140 40 Z" fill="${p.straw}" stroke="${p.tan}" stroke-width="1.5"/>
      <rect x="86" y="32" width="54" height="6" fill="${p.red}"/>`;
  }
  function tourist3(p) {   // Globetrotter Duck: travel vest with patches, panama hat, suitcase with stickers, passport
    return `${aura(p)}
      <path d="M20 132 L20 104 L34 104 L34 132" stroke="${p.grey}" stroke-width="3" fill="none"/>
      <rect x="4" y="132" width="46" height="66" rx="7" fill="${p.brown}"/>
      <circle cx="16" cy="150" r="6" fill="${p.red}"/><rect x="28" y="160" width="14" height="10" fill="${p.blue}"/>${star(18, 178, 7, p.gold)}
      ${feet(p)}${tail(p)}
      ${inBody(`<rect x="20" y="95" width="160" height="110" fill="${p.khaki}"/><path d="M112 98 L150 98 L132 150 Z" fill="${p.white}"/>
        <rect x="56" y="122" width="22" height="18" rx="3" fill="${p.tan}" stroke="${p.brown}"/><rect x="96" y="150" width="22" height="18" rx="3" fill="${p.tan}" stroke="${p.brown}"/>
        <circle cx="66" cy="160" r="6" fill="${p.blue}"/><circle cx="140" cy="168" r="6" fill="${p.green}"/>${star(86, 116, 6, p.red)}`)}
      ${wing(p, p.khaki)}
      <rect x="140" y="146" width="20" height="26" rx="2" fill="${p.navy}"/><circle cx="150" cy="158" r="5" fill="none" stroke="${p.gold}" stroke-width="1.5"/>
      <ellipse cx="140" cy="172" rx="9" ry="7" fill="${p.body}"/>
      ${head(p)}
      <ellipse cx="114" cy="38" rx="44" ry="9" fill="${p.cream}" stroke="${p.tan}" stroke-width="1.5"/>
      <path d="M90 38 Q90 14 114 12 Q138 14 138 38 Z" fill="${p.cream}" stroke="${p.tan}" stroke-width="1.5"/>
      <rect x="90" y="28" width="48" height="7" fill="${p.black}"/>
      <path d="M98 30 Q90 14 98 6" stroke="${p.red}" stroke-width="3" fill="none"/>`;
  }

  // ================= PORT ducks =================
  // San Juan: straw pava hat, guayabera shirt, coquí frog friend, piragua shaved ice in the flag's red + blue.
  function portSanJuan(p, flag) {
    return `${aura(p)}${feet(p)}${tail(p)}
      ${inBody(`<rect x="20" y="95" width="160" height="110" fill="${p.white}"/>
        <path d="M60 104 V200 M74 104 V200 M126 104 V200 M140 104 V200" stroke="${p.silver}" stroke-width="2"/>`)}${outline(p.silver)}
      ${wing(p, p.white)}
      <path d="M140 150 L166 150 L153 194 Z" fill="${p.white}" stroke="${p.silver}" stroke-width="1.5"/>
      <path d="M138 150 Q141 128 153 126 Q166 128 168 150 Z" fill="${flag[0]}"/>
      <path d="M144 140 Q153 132 162 140" stroke="${flag[2]}" stroke-width="5" fill="none"/>
      <ellipse cx="140" cy="160" rx="9" ry="7" fill="${p.body}"/>
      ${head(p)}
      <ellipse cx="114" cy="38" rx="52" ry="10" fill="${p.straw}" stroke="${p.tan}" stroke-width="1.5"/>
      <path d="M84 38 Q88 14 114 12 Q140 14 144 38 Z" fill="${p.straw}" stroke="${p.tan}" stroke-width="1.5"/>
      <path d="M90 26 L138 26 M88 32 L140 32 M100 16 L96 38 M114 12 L114 38 M128 16 L132 38" stroke="${p.tan}" stroke-width="1"/>
      <rect x="86" y="32" width="56" height="5" fill="${p.brown}"/>
      <g transform="translate(70 100)">
        <ellipse cx="0" cy="0" rx="13" ry="9" fill="${p.frog}"/>
        <circle cx="-6" cy="-8" r="5" fill="${p.frog}"/><circle cx="6" cy="-8" r="5" fill="${p.frog}"/>
        <circle cx="-6" cy="-8" r="2.4" fill="${p.black}"/><circle cx="6" cy="-8" r="2.4" fill="${p.black}"/>
        <path d="M-5 2 Q0 6 5 2" stroke="${p.black}" stroke-width="1.2" fill="none"/></g>`;
  }
  // Any other port: sash in the country's flag colours with an anchor badge.
  function portGeneric(p, flag) {
    const id = uid('sash');
    const cols = flag && flag.length ? flag : [p.red, p.white, p.blue];
    const bands = cols.map((c, i) => `<path d="M${70 + i * 12} 96 L${150 + i * 12} 210" stroke="${c}" stroke-width="12"/>`).join('');
    return `${aura(p)}${feet(p)}${tail(p)}${bodyEl(p)}${belly(p)}
      <defs><clipPath id="${id}"><ellipse cx="95" cy="150" rx="68" ry="52"/></clipPath></defs><g clip-path="url(#${id})">${bands}</g>
      <circle cx="104" cy="150" r="11" fill="${p.gold}" stroke="${p.goldDark}" stroke-width="2"/>
      <path d="M104 143 v14 M99 147 h10 M98 152 Q104 159 110 152" stroke="${p.navy}" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${wing(p)}${head(p)}`;
  }

  // ================= accessories =================
  const ACC = {
    sunglasses: (p) => `<g class="acc-sunglasses">
      <path d="M118 58 L156 58" stroke="${p.black}" stroke-width="3"/>
      <rect x="120" y="54" width="22" height="15" rx="6" fill="${p.black}"/><rect x="142" y="55" width="13" height="13" rx="5" fill="${p.black}"/>
      <path d="M118 58 L84 54" stroke="${p.black}" stroke-width="3"/><path d="M124 58 l8 0" stroke="#ffffff" stroke-width="2" opacity=".5"/></g>`,
    lei: (p) => {
      let f = ''; const cols = [p.pink, p.orange, p.white, p.purple];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8, x = 84 + t * 64, y = 106 + Math.sin(t * Math.PI) * 18;
        f += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${cols[i % 4]}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${p.gold}"/>`;
      }
      return `<g class="acc-lei">${f}</g>`;
    },
  };
  // Where an accessory would clash with the outfit, skip it.
  function accessoryFits(c, acc) {
    if (acc === 'sunglasses') return !(c.line === 'explorer');
    if (acc === 'lei') return !(c.line === 'explorer' && c.form === 3) && !(c.line === 'crew' && c.form === 2) && !(c.line === 'galley' && c.form === 1);
    return true;
  }

  const FORMS = {
    crew: [crew1, crew2, crew3], pool: [pool1, pool2, pool3], showtime: [show1, show2, show3],
    galley: [galley1, galley2, galley3], explorer: [explorer1, explorer2, explorer3], tourist: [tourist1, tourist2, tourist3],
  };
  const PORT_ART = { sanjuan: portSanJuan };

  // duckSVG(creature, extraClass) — creature: { line, form, gold, color, acc, port }.
  // Old call style duckSVG(form, gold, extraClass) still works (Crew line).
  function duckSVG(c, gold, extraClass = '') {
    if (typeof c === 'number') c = { line: 'crew', form: c, gold: !!gold };
    else extraClass = typeof gold === 'string' ? gold : extraClass;
    let p = { ...BASE };
    let defs = '';
    if (!c.gold && c.color && BODY[c.color]) {
      const [b, s] = BODY[c.color];
      if (c.color === 'rainbow') {
        const id = uid('rb');
        defs = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#FF7A7A"/><stop offset=".25" stop-color="#FFD43B"/><stop offset=".5" stop-color="#6FE08A"/>
          <stop offset=".75" stop-color="#6FB8FF"/><stop offset="1" stop-color="#C07AFF"/></linearGradient></defs>`;
        p.body = `url(#${id})`;
      } else p.body = b;
      p.shade = s;
    }
    if (c.gold) p = goldify(p);
    let body;
    if (c.line === 'port') {
      const info = (typeof PORT_DUCKS !== 'undefined' && PORT_DUCKS[c.port]) || {};
      body = (PORT_ART[info.art] || portGeneric)(p, c.gold ? null : info.flag);
    } else {
      const fns = FORMS[c.line] || FORMS.crew;
      body = fns[Math.max(0, Math.min(2, (c.form || 1) - 1))](p);
    }
    const acc = c.acc && ACC[c.acc] ? ACC[c.acc](p) : '';
    const rare = c.line === 'port' || c.form === 3;
    return `<svg class="duck line-${c.line || 'crew'} form${c.form || 1} ${rare ? 'rare' : ''} ${c.gold ? 'gold' : ''} ${c.color === 'rainbow' ? 'rainbow' : ''} ${extraClass}" viewBox="0 0 ${VB.w} ${VB.h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs}${body}${acc}</svg>`;
  }

  const RING_COLORS = {
    life:    { base: '#FFFFFF', band: '#E4472F', edge: '#b9c3cf' },
    premium: { base: '#E7F0FF', band: '#2F6FDB', edge: '#8aa6d6' },
    golden:  { base: '#FFE58A', band: '#D19A12', edge: '#a87b12' },
  };
  function ringCore(type) {
    const c = RING_COLORS[type] || RING_COLORS.life;
    const seg = 2 * Math.PI * 38 / 8;
    return `
      <circle cx="50" cy="50" r="38" fill="none" stroke="${c.edge}" stroke-width="20"/>
      <circle cx="50" cy="50" r="38" fill="none" stroke="${c.base}" stroke-width="17"/>
      <circle cx="50" cy="50" r="38" fill="none" stroke="${c.band}" stroke-width="17" stroke-dasharray="${seg} ${seg}"/>
      <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="3" transform="translate(-2 -3)"/>`;
  }
  function ringSVG(type) {
    return `<svg class="ring-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${ringCore(type)}</svg>`;
  }
  function ringHalf(type, half) {
    const id = uid('rh');
    const y = half === 'back' ? 0 : 50;
    return `<svg class="ring-half" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><clipPath id="${id}"><rect x="-10" y="${y}" width="120" height="50"/></clipPath></defs>
      <g clip-path="url(#${id})">${ringCore(type)}</g></svg>`;
  }

  return { duckSVG, ringSVG, ringHalf, accessoryFits, NECK, VB };
})();
