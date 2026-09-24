/*!
 * NYC H+H Nursing Career Ladder - animated explainer
 * Pure JavaScript: Canvas 2D for the hand-drawn collage animation, Web Audio for the
 * music and sound effects. Narration is a pre-rendered neural TTS track (narration.mp3)
 * with word timings (narration.json) that drive the scene cues and the captions.
 *
 * Embed:   <div id="cl-explainer"></div><script src="explainer/explainer.js" defer></script>
 * Debug:   add ?clt=12.5 to the page URL to freeze the animation at 12.5 s (no audio).
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Setup / constants
  // ---------------------------------------------------------------------------
  var W = 1280, H = 720;
  var script = document.currentScript;
  var BASE = script && script.src ? script.src.replace(/[^\/]*$/, '') : 'explainer/';
  var MOUNT_ID = 'cl-explainer';
  var END_HOLD = 3.6;          // seconds of end card after the narration finishes
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var PAL = {
    kraft: '#E8DCC4', paper: '#FBF6EA', cream: '#FFF9EE', ink: '#1E2340',
    navy: '#1F3A7A', navyD: '#16295C', teal: '#2A9D8F', tealD: '#1E7A70',
    coral: '#EF6F5E', mustard: '#F2B544', sky: '#9CCBEA', pink: '#F5B3B0',
    mint: '#A7D9B8', lav: '#BCB1E3', red: '#D8483A', orange: '#F28C38',
    skin1: '#8D5A3B', skin2: '#C98E64', skin3: '#E7B892', hair: '#2A1C15', hair2: '#5A3A22'
  };
  var F_HEAD = '"Caveat Brush", "Patrick Hand", cursive';
  var F_HAND = '"Caveat", "Patrick Hand", cursive';
  var F_MARK = '"Permanent Marker", "Caveat Brush", cursive';
  var F_PRINT = '"Patrick Hand", "Caveat", cursive';

  // ---------------------------------------------------------------------------
  // Math / easing / randomness
  // ---------------------------------------------------------------------------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function prog(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function eOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function eInCubic(t) { return t * t * t; }
  function eInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function eOutBack(t) { var c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function eOutElastic(t) { if (t === 0 || t === 1) return t; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1; }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // "Boil": hand-drawn lines re-jitter ~10 times a second, like stop-motion.
  var BOIL = 0;
  function boilRng(id) { return mulberry(hash(id) + BOIL * 7919); }

  // Pop-in scale for an element that appears at time a
  function popS(t, a, d) { d = d || 0.5; if (t < a) return 0; return eOutBack(prog(t, a, a + d)); }
  function fadeA(t, a, d) { d = d || 0.3; return prog(t, a, a + d); }
  // Element that leaves at time b (returns 1 -> 0)
  function outA(t, b, d) { d = d || 0.35; return 1 - prog(t, b, b + d); }

  // ---------------------------------------------------------------------------
  // Narration timing helpers
  // ---------------------------------------------------------------------------
  var NARR = null;       // narration.json
  var LINES = {};        // id -> line
  var DUR = 58;
  function L(id) { return LINES[id] || { start: 0, end: 0, words: [] }; }
  // Time of the nth occurrence of a word (case-insensitive prefix match) within a line
  function WT(id, word, nth) {
    var line = L(id), n = nth || 1, w = word.toLowerCase();
    for (var i = 0; i < line.words.length; i++) {
      if (line.words[i].w.toLowerCase().replace(/[^a-z0-9'.-]/g, '').indexOf(w) === 0) { n--; if (!n) return line.words[i].t; }
    }
    return line.start;
  }

  // ---------------------------------------------------------------------------
  // Offscreen textures
  // ---------------------------------------------------------------------------
  var TEX = {};
  function makeCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function buildTextures() {
    // Paper fibre texture (tileable-ish), used as a multiply overlay on every paper piece
    var c = makeCanvas(256, 256), g = c.getContext('2d'), r = mulberry(11);
    g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
    var img = g.getImageData(0, 0, 256, 256), d = img.data;
    for (var i = 0; i < d.length; i += 4) { var v = 235 + r() * 20; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    g.globalAlpha = 0.08; g.strokeStyle = '#6b5a40'; g.lineWidth = 0.6;
    for (i = 0; i < 90; i++) { var x = r() * 256, y = r() * 256, a = r() * 6.28, l = 6 + r() * 20; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + r() * 4, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    TEX.fibre = c;

    // Kraft / cream background with stains, fibres and a faint dot grid
    var b = makeCanvas(W, H), bg = b.getContext('2d'); r = mulberry(5);
    var grd = bg.createRadialGradient(W * 0.5, H * 0.45, 100, W * 0.5, H * 0.5, W * 0.75);
    grd.addColorStop(0, '#F4EBD8'); grd.addColorStop(1, '#E4D4B6');
    bg.fillStyle = grd; bg.fillRect(0, 0, W, H);
    bg.globalAlpha = 0.5; bg.globalCompositeOperation = 'multiply';
    for (var tx = 0; tx < W; tx += 256) for (var ty = 0; ty < H; ty += 256) bg.drawImage(TEX.fibre, tx, ty);
    bg.globalCompositeOperation = 'source-over';
    for (i = 0; i < 14; i++) { // soft coffee-ish stains
      var sx = r() * W, sy = r() * H, sr = 40 + r() * 140; var sg = bg.createRadialGradient(sx, sy, 0, sx, sy, sr);
      sg.addColorStop(0, 'rgba(160,120,70,0.07)'); sg.addColorStop(1, 'rgba(160,120,70,0)'); bg.globalAlpha = 1; bg.fillStyle = sg; bg.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
    bg.globalAlpha = 0.18; bg.fillStyle = '#8a7658';
    for (var gx = 24; gx < W; gx += 32) for (var gy = 24; gy < H; gy += 32) { bg.beginPath(); bg.arc(gx + (r() - 0.5), gy + (r() - 0.5), 1.1, 0, 6.28); bg.fill(); }
    bg.globalAlpha = 1;
    TEX.bg = b;

    // Film grain frames (animated by picking a different frame each boil tick)
    TEX.grain = [];
    for (var f = 0; f < 4; f++) {
      var gc = makeCanvas(320, 180), gg = gc.getContext('2d'), gi = gg.createImageData(320, 180), gd = gi.data; r = mulberry(100 + f);
      for (i = 0; i < gd.length; i += 4) { var gv = r() * 255; gd[i] = gd[i + 1] = gd[i + 2] = gv; gd[i + 3] = r() < 0.5 ? 16 : 0; }
      gg.putImageData(gi, 0, 0); TEX.grain.push(gc);
    }
    // Vignette
    var vc = makeCanvas(W, H), vg = vc.getContext('2d');
    var vgrd = vg.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.72);
    vgrd.addColorStop(0, 'rgba(40,25,10,0)'); vgrd.addColorStop(1, 'rgba(40,25,10,0.28)');
    vg.fillStyle = vgrd; vg.fillRect(0, 0, W, H); TEX.vig = vc;
  }

  // ---------------------------------------------------------------------------
  // Drawing primitives (hand-drawn look)
  // ---------------------------------------------------------------------------
  var ctx; // main 2D context (logical 1280x720 space)
  var PAT = null;

  function subdivide(pts, closed, step) {
    var out = [], n = pts.length, segs = closed ? n : n - 1;
    for (var i = 0; i < segs; i++) {
      var a = pts[i], b = pts[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(len / step));
      for (var j = 0; j < k; j++) out.push([lerp(a[0], b[0], j / k), lerp(a[1], b[1], j / k)]);
    }
    out.push(closed ? [out[0][0], out[0][1]] : [pts[n - 1][0], pts[n - 1][1]]);
    return out;
  }
  // Rough, boiling ink stroke. o: {w, color, amt, closed, progress, passes, alpha, id}
  function rough(pts, o) {
    o = o || {};
    if (pts.length < 2) return;
    var amt = (o.amt == null ? 1.6 : o.amt) * (REDUCED ? 0.4 : 1);
    var sp = subdivide(pts, !!o.closed, o.step || 14);
    var passes = o.passes || 2, prg = o.progress == null ? 1 : o.progress;
    if (prg <= 0) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = o.color || PAL.ink; ctx.globalAlpha *= (o.alpha == null ? 1 : o.alpha);
    for (var p = 0; p < passes; p++) {
      var r = boilRng((o.id || 'r') + p + '|' + pts.length);
      // smooth random offsets
      var offs = [], i;
      for (i = 0; i < sp.length; i++) offs.push([(r() - 0.5) * 2 * amt, (r() - 0.5) * 2 * amt]);
      var q = [];
      for (i = 0; i < sp.length; i++) {
        var a = offs[Math.max(0, i - 1)], b = offs[i], c = offs[Math.min(sp.length - 1, i + 1)];
        q.push([sp[i][0] + (a[0] + b[0] * 2 + c[0]) / 4, sp[i][1] + (a[1] + b[1] * 2 + c[1]) / 4]);
      }
      if (o.closed && prg >= 1) q[q.length - 1] = q[0];
      // progress cut
      var total = 0, lens = [0];
      for (i = 1; i < q.length; i++) { total += Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]); lens.push(total); }
      var lim = total * prg, pts2 = [q[0]];
      for (i = 1; i < q.length; i++) {
        if (lens[i] <= lim) pts2.push(q[i]);
        else { var f = (lim - lens[i - 1]) / Math.max(0.001, lens[i] - lens[i - 1]); pts2.push([lerp(q[i - 1][0], q[i][0], f), lerp(q[i - 1][1], q[i][1], f)]); break; }
      }
      ctx.lineWidth = (o.w || 3) * (p === 0 ? 1 : 0.55);
      ctx.beginPath(); ctx.moveTo(pts2[0][0], pts2[0][1]);
      for (i = 1; i < pts2.length - 1; i++) { var mx = (pts2[i][0] + pts2[i + 1][0]) / 2, my = (pts2[i][1] + pts2[i + 1][1]) / 2; ctx.quadraticCurveTo(pts2[i][0], pts2[i][1], mx, my); }
      ctx.lineTo(pts2[pts2.length - 1][0], pts2[pts2.length - 1][1]);
      ctx.stroke();
    }
    ctx.restore();
  }
  function rectPts(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
  function ellPts(cx, cy, rx, ry, n, a0) { var p = []; n = n || 28; a0 = a0 || 0; for (var i = 0; i < n; i++) { var a = a0 + i / n * Math.PI * 2; p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return p; }
  function rrPts(x, y, w, h, r, n) { // rounded rect points
    var p = [], k = n || 5; r = Math.min(r, w / 2, h / 2);
    function arc(cx, cy, a0) { for (var i = 0; i <= k; i++) { var a = a0 + i / k * Math.PI / 2; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } }
    arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + h - r, 0); arc(x + r, y + h - r, Math.PI / 2); arc(x + r, y + r, Math.PI);
    return p;
  }
  // Torn-edge polygon from a base polygon (static per id: paper does not boil)
  var TORN = {};
  function torn(id, base, amt, step) {
    var key = id + '|' + base.length + '|' + (amt || 3);
    if (TORN[key]) return TORN[key];
    var r = mulberry(hash(id)), sp = subdivide(base, true, step || 9), out = [];
    for (var i = 0; i < sp.length - 1; i++) out.push([sp[i][0] + (r() - 0.5) * 2 * (amt || 3), sp[i][1] + (r() - 0.5) * 2 * (amt || 3)]);
    TORN[key] = out; return out;
  }
  function polyPath(p) { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (var i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); }
  // A piece of coloured paper with texture + soft drop shadow
  function paper(poly, color, o) {
    o = o || {};
    ctx.save();
    if (o.shadow !== false) {
      ctx.shadowColor = 'rgba(60,40,20,' + (o.shadowA || 0.28) + ')';
      ctx.shadowBlur = o.blur == null ? 10 : o.blur; ctx.shadowOffsetX = o.sx == null ? 3 : o.sx; ctx.shadowOffsetY = o.sy == null ? 6 : o.sy;
    }
    polyPath(poly); ctx.fillStyle = color; ctx.fill();
    ctx.shadowColor = 'transparent';
    if (PAT && o.tex !== false) { ctx.clip(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha *= (o.texA || 0.55); ctx.fillStyle = PAT; ctx.fill(); }
    ctx.restore();
    if (o.edge) { ctx.save(); ctx.globalAlpha *= 0.55; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.4; polyPath(poly); ctx.stroke(); ctx.restore(); }
  }
  function tornRect(id, x, y, w, h, color, o) { paper(torn(id, rectPts(x, y, w, h), (o && o.amt) || 3), color, o); }
  function tape(x, y, w, ang, id) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang || 0);
    var h = 30, p = torn('tape' + (id || x + y), rectPts(-w / 2, -h / 2, w, h), 2.2, 6);
    ctx.globalAlpha *= 0.82; paper(p, '#EFE3BF', { shadowA: 0.12, blur: 4, sx: 1, sy: 2, texA: 0.35 });
    ctx.restore();
  }
  function withT(x, y, s, rot, fn, alpha) {
    if (s <= 0.001 || alpha === 0) return;
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); if (s !== 1) ctx.scale(s, s);
    if (alpha != null) ctx.globalAlpha *= alpha;
    fn(); ctx.restore();
  }
  // Hand-lettered text with per-letter jitter and write-on reveal
  var WCACHE = {};
  function txt(str, x, y, o) {
    o = o || {};
    var size = o.size || 40, font = (o.weight ? o.weight + ' ' : '') + size + 'px ' + (o.font || F_HEAD);
    ctx.save(); ctx.font = font; ctx.textBaseline = 'alphabetic';
    var key = font + '|' + str, ws = WCACHE[key];
    if (!ws) { ws = []; for (var i = 0; i < str.length; i++) ws.push(ctx.measureText(str[i]).width); var tot = ctx.measureText(str).width; var sum = ws.reduce(function (a, b) { return a + b; }, 0); var k = tot / (sum || 1); ws = ws.map(function (v) { return v * k; }); WCACHE[key] = ws; }
    var total = ws.reduce(function (a, b) { return a + b; }, 0) + (o.track || 0) * (str.length - 1);
    var sx = o.align === 'left' ? x : o.align === 'right' ? x - total : x - total / 2;
    var reveal = o.reveal == null ? 1 : o.reveal, shown = reveal * str.length;
    var r = boilRng((o.id || str) + 'txt'), j = (o.jit == null ? 1 : o.jit) * (REDUCED ? 0.3 : 1);
    ctx.fillStyle = o.color || PAL.ink;
    if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.strokeW || 6; ctx.lineJoin = 'round'; }
    for (i = 0; i < str.length; i++) {
      var ra = r(), rb = r();
      if (i >= shown) break;
      var a = i + 1 > shown ? shown - i : 1;
      ctx.save(); ctx.globalAlpha *= a;
      ctx.translate(sx + ws[i] / 2, y + (rb - 0.5) * 2.2 * j);
      ctx.rotate((ra - 0.5) * 0.07 * j);
      if (o.stroke) ctx.strokeText(str[i], -ws[i] / 2, 0);
      ctx.fillText(str[i], -ws[i] / 2, 0);
      ctx.restore();
      sx += ws[i] + (o.track || 0);
    }
    ctx.restore();
    return total;
  }
  function textW(str, size, font) { ctx.save(); ctx.font = size + 'px ' + (font || F_HEAD); var w = ctx.measureText(str).width; ctx.restore(); return w; }

  // Rubber stamp slam
  function stamp(label, x, y, t, t0, o) {
    o = o || {};
    if (t < t0) return;
    var p = prog(t, t0, t0 + 0.2), s = lerp(2.4, 1, eInCubic(p));
    var shake = t - t0 < 0.35 ? Math.sin((t - t0) * 90) * (1 - prog(t, t0 + 0.2, t0 + 0.35)) * 3 : 0;
    var size = o.size || 54, col = o.color || PAL.red;
    withT(x + shake, y, s, o.rot == null ? -0.14 : o.rot, function () {
      ctx.globalAlpha *= clamp(p * 1.6, 0, 0.92);
      var tw = textW(label, size, F_MARK) + 36, th = size + 22;
      rough(rrPts(-tw / 2, -th / 2, tw, th, 8), { closed: true, color: col, w: 5, amt: 1.2, id: 'st' + label });
      rough(rrPts(-tw / 2 + 7, -th / 2 + 7, tw - 14, th - 14, 6), { closed: true, color: col, w: 2.2, amt: 1, id: 'st2' + label, passes: 1 });
      txt(label, 0, size * 0.36, { size: size, font: F_MARK, color: col, id: 'stt' + label, jit: 0.5 });
    });
  }
  function check(x, y, s, p, col, id) {
    if (p <= 0) return;
    rough([[x - 16 * s, y], [x - 4 * s, y + 13 * s], [x + 20 * s, y - 18 * s]], { w: 6 * s, color: col || PAL.teal, progress: p, id: id || ('ck' + x + y), amt: 0.8 });
  }
  function sparkle(x, y, s, t, id, col) {
    var tw = 0.75 + 0.25 * Math.sin(t * 6 + hash(id) % 10);
    withT(x, y, s * tw, t * 0.6, function () {
      ctx.fillStyle = col || PAL.mustard;
      ctx.beginPath();
      for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4, rr = i % 2 ? 5 : 16; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
    });
  }
  function heart(x, y, s, col, id) {
    withT(x, y, s, 0, function () {
      var p = [];
      for (var i = 0; i < 30; i++) { var a = i / 30 * Math.PI * 2; var hx = 16 * Math.pow(Math.sin(a), 3), hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)); p.push([hx * 1.4, hy * 1.4]); }
      paper(p, col || PAL.coral, { blur: 5, sx: 2, sy: 3 });
      rough(p, { closed: true, w: 2.5, id: id || 'hrt', amt: 0.8 });
    });
  }
  function arrow(pts, p, col, id, w) {
    rough(pts, { w: w || 5, color: col || PAL.ink, progress: p, id: id, amt: 1 });
    if (p >= 0.98) {
      var a = pts[pts.length - 2], b = pts[pts.length - 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      rough([[b[0] - Math.cos(ang - 0.5) * 22, b[1] - Math.sin(ang - 0.5) * 22], b, [b[0] - Math.cos(ang + 0.5) * 22, b[1] - Math.sin(ang + 0.5) * 22]], { w: w || 5, color: col || PAL.ink, id: id + 'h', amt: 0.8 });
    }
  }
  function curve(x0, y0, cx, cy, x1, y1, n) { var p = []; n = n || 16; for (var i = 0; i <= n; i++) { var u = i / n; p.push([(1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * x1, (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * y1]); } return p; }
  function numCircle(n, x, y, s, col) {
    withT(x, y, s, 0, function () {
      paper(torn('nc' + n, ellPts(0, 0, 30, 30, 24), 1.5, 6), col || PAL.navy, { blur: 5, sx: 2, sy: 3 });
      txt(String(n), 0, 14, { size: 42, font: F_MARK, color: '#fff', id: 'nc' + n });
    });
  }

  // ---------------------------------------------------------------------------
  // Characters & props (all drawn in code, cut-paper style)
  // ---------------------------------------------------------------------------
  // Nurse / PCA character. (x,y) = feet centre. o: {scrub, skin, hair, badge, steth, wave, t, id, look}
  function nurse(x, y, s, o) {
    o = o || {}; var t = o.t || 0, id = o.id || 'n';
    withT(x, y, s, o.rot || 0, function () {
      // ground shadow
      ctx.save(); ctx.fillStyle = 'rgba(60,40,20,0.18)'; ctx.beginPath(); ctx.ellipse(0, 4, 95, 14, 0, 0, 6.28); ctx.fill(); ctx.restore();
      var scrub = o.scrub || PAL.teal, skin = o.skin || PAL.skin1, bob = Math.sin(t * 3.2) * 3;
      // legs
      paper(torn(id + 'lg1', rrPts(-44, -130, 38, 128, 12), 1.5), o.pants || PAL.navyD, { blur: 6 });
      paper(torn(id + 'lg2', rrPts(6, -130, 38, 128, 12), 1.5), o.pants || PAL.navyD, { blur: 6 });
      paper(torn(id + 'sh1', ellPts(-26, -4, 30, 12), 1.2), '#FFFFFF', { blur: 3 });
      paper(torn(id + 'sh2', ellPts(26, -4, 30, 12), 1.2), '#FFFFFF', { blur: 3 });
      ctx.save(); ctx.translate(0, bob);
      // back arm
      var armA = o.wave ? -2.35 + Math.sin(t * 9) * 0.28 : 0.18;
      withT(78, -240, 1, armA, function () {
        paper(torn(id + 'a2', rrPts(-17, -4, 34, 118, 15), 1.3), scrub, { blur: 5 });
        paper(torn(id + 'h2', ellPts(0, 120, 17, 17), 1), skin, { blur: 3 });
      });
      // body
      var body = [[-80, -255], [80, -255], [70, -110], [-70, -110]];
      paper(torn(id + 'bd', body, 2.2, 8), scrub, { blur: 9 });
      rough(body.concat([]), { closed: true, w: 2.4, color: 'rgba(20,25,50,0.55)', id: id + 'bdo', amt: 1.2, passes: 1 });
      // v-neck + neck
      paper(torn(id + 'nk', rrPts(-18, -290, 36, 40, 8), 1), skin, { shadow: false });
      paper([[-26, -256], [26, -256], [0, -222]], skin, { shadow: false, texA: 0.3 });
      // pocket
      rough(rectPts(-58, -190, 38, 34), { closed: true, w: 2, color: 'rgba(20,25,50,0.45)', id: id + 'pk', passes: 1 });
      // badge
      if (o.badge) {
        paper(torn(id + 'bg', rrPts(18, -205, 50, 34, 5), 1), '#FFFFFF', { blur: 3, sx: 1, sy: 2 });
        txt(o.badge, 43, -180, { size: 22, font: F_MARK, color: PAL.navy, id: id + 'bgt', jit: 0.4 });
      }
      // stethoscope
      if (o.steth) {
        rough(curve(-30, -256, -44, -170, -6, -150, 12), { w: 4, color: '#2B2E45', id: id + 'st1', amt: 0.6, passes: 1 });
        rough(curve(30, -256, 44, -200, 10, -180, 12), { w: 4, color: '#2B2E45', id: id + 'st2', amt: 0.6, passes: 1 });
        paper(ellPts(-6, -146, 10, 10, 14), '#C9CCD6', { blur: 3, sx: 1, sy: 1 });
      }
      // front arm
      withT(-78, -240, 1, -0.18, function () {
        paper(torn(id + 'a1', rrPts(-17, -4, 34, 118, 15), 1.3), scrub, { blur: 5 });
        paper(torn(id + 'h1', ellPts(0, 120, 17, 17), 1), skin, { blur: 3 });
      });
      // head
      var hy = -335, look = o.look || 0;
      // hair back (puff)
      var hairC = o.hair || PAL.hair;
      paper(torn(id + 'hb', ellPts(0, hy - 18, 66, 58, 26), 4, 7), hairC, { blur: 6 });
      paper(torn(id + 'bun', ellPts(8, hy - 78, 30, 26, 18), 3, 6), hairC, { blur: 4 });
      paper(torn(id + 'hd', ellPts(0, hy + 6, 52, 56, 26), 1.2), skin, { blur: 6 });
      // fringe
      paper(torn(id + 'fr', [[-54, hy - 10], [-40, hy - 44], [-5, hy - 58], [34, hy - 52], [54, hy - 18], [30, hy - 30], [0, hy - 26], [-30, hy - 18]], 2.5, 6), hairC, { shadow: false, texA: 0.4 });
      rough(ellPts(0, hy + 6, 52, 56, 24), { closed: true, w: 2.2, color: 'rgba(30,20,20,0.45)', id: id + 'hdo', amt: 0.9, passes: 1 });
      // face
      var blink = (t % 3.3) > 3.18 ? 0.12 : 1;
      ctx.fillStyle = '#1C1410';
      ctx.beginPath(); ctx.ellipse(-18 + look, hy + 4, 5, 6.5 * blink, 0, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.ellipse(18 + look, hy + 4, 5, 6.5 * blink, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = 'rgba(240,120,110,0.45)';
      ctx.beginPath(); ctx.ellipse(-30, hy + 22, 9, 6, 0, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.ellipse(30, hy + 22, 9, 6, 0, 0, 6.28); ctx.fill();
      rough(curve(-14 + look, hy + 26, 0 + look, hy + 40, 14 + look, hy + 26, 8), { w: 3.2, color: '#3A1F18', id: id + 'sm', amt: 0.5, passes: 1 });
      ctx.restore();
    });
  }
  function ladder(x, yb, h, w, rungs, p, id, col) {
    // rails
    var pr = eOutCubic(clamp(p * 1.4, 0, 1));
    var top = yb - h * pr;
    paper(torn(id + 'rl', [[x - w / 2 - 12, top], [x - w / 2 + 6, top], [x - w / 2 + 6, yb], [x - w / 2 - 12, yb]], 1.5, 12), col || PAL.mustard, { blur: 7 });
    paper(torn(id + 'rr', [[x + w / 2 - 6, top], [x + w / 2 + 12, top], [x + w / 2 + 12, yb], [x + w / 2 - 6, yb]], 1.5, 12), col || PAL.mustard, { blur: 7 });
    rough([[x - w / 2 - 3, yb], [x - w / 2 - 3, top]], { w: 2.4, id: id + 'o1', color: 'rgba(60,40,20,0.6)', passes: 1 });
    rough([[x + w / 2 + 3, yb], [x + w / 2 + 3, top]], { w: 2.4, id: id + 'o2', color: 'rgba(60,40,20,0.6)', passes: 1 });
    for (var i = 0; i < rungs; i++) {
      var ry = yb - (i + 0.6) * (h / rungs), rp = clamp(p * (rungs + 2) - i - 1, 0, 1);
      if (ry < top || rp <= 0) continue;
      rough([[x - w / 2 + 4, ry], [x - w / 2 + 4 + (w - 8) * rp, ry]], { w: 8, color: '#C98A2E', id: id + 'rg' + i, amt: 0.9, passes: 1 });
      rough([[x - w / 2 + 4, ry + 1], [x - w / 2 + 4 + (w - 8) * rp, ry + 1]], { w: 2, color: 'rgba(60,40,20,0.6)', id: id + 'rgo' + i, amt: 0.9, passes: 1 });
    }
  }
  function cloud(x, y, w, h, p, id) {
    var pts = [], n = 11;
    for (var i = 0; i < 44; i++) { var a = i / 44 * Math.PI * 2, bump = 1 + 0.12 * Math.abs(Math.sin(a * n / 2)); pts.push([x + Math.cos(a) * w / 2 * bump, y + Math.sin(a) * h / 2 * bump]); }
    withT(x, y, eOutBack(p), 0, function () {
      ctx.translate(-x, -y);
      paper(pts, '#FFFFFF', { blur: 12, sy: 8 });
      rough(pts, { closed: true, w: 3, id: id, amt: 1.2 });
    });
  }
  function bill(x, y, s, id) {
    withT(x, y, s, -0.05, function () {
      var p = torn(id + 'b', rectPts(-150, -100, 300, 200), 2.5);
      paper(p, '#FFFDF6', { blur: 12 });
      txt('CUNY', -120, -52, { size: 40, font: F_MARK, color: PAL.navy, align: 'left', id: id + 't1' });
      txt('TUITION', -120, -14, { size: 30, font: F_PRINT, color: PAL.ink, align: 'left', id: id + 't2' });
      for (var i = 0; i < 3; i++) rough([[-120, 18 + i * 22], [60 - i * 30, 18 + i * 22]], { w: 2.5, id: id + 'ln' + i, color: 'rgba(30,35,64,0.45)', passes: 1 });
      txt('$ $ $', 98, 70, { size: 34, font: F_MARK, color: PAL.tealD, id: id + 't3' });
    });
  }
  function gradCap(x, y, s, id) {
    withT(x, y, s, -0.1, function () {
      paper(torn(id + 'cb', rrPts(-46, -8, 92, 44, 8), 1.2), PAL.navyD, { blur: 6 });
      var top = [[-95, -12], [0, -52], [95, -12], [0, 28]];
      paper(torn(id + 'ct', top, 1.5), PAL.navy, { blur: 8 });
      rough(top, { closed: true, w: 2.4, id: id + 'cto', color: 'rgba(10,10,30,.5)', passes: 1 });
      rough([[0, -12], [58, 4], [62, 52]], { w: 4, color: PAL.mustard, id: id + 'ts', passes: 1 });
      paper(ellPts(62, 60, 9, 12, 12), PAL.mustard, { blur: 3 });
    });
  }
  function badge(label, x, y, s, col, id, rot) {
    withT(x, y, s, rot || 0, function () {
      var w = textW(label, 44, F_MARK) + 50, h = 70;
      var p = torn(id, rrPts(-w / 2, -h / 2, w, h, 12), 1.6, 7);
      paper(p, col, { blur: 8 });
      ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(-w / 2 + 16, 0, 6, 0, 6.28); ctx.fill(); ctx.restore();
      txt(label, 10, 15, { size: 44, font: F_MARK, color: '#fff', id: id + 't', stroke: 'rgba(0,0,0,0.12)', strokeW: 4 });
    });
  }
  function calendar(x, y, s, top, big, small, id, col) {
    withT(x, y, s, 0.04, function () {
      paper(torn(id + 'pg', rectPts(-80, -70, 160, 170), 2), '#FFFDF6', { blur: 10 });
      paper(torn(id + 'hd', rectPts(-80, -70, 160, 48), 1.5), col || PAL.coral, { shadow: false });
      for (var i = -1; i <= 1; i += 2) { paper(ellPts(i * 40, -72, 8, 12, 10), '#8A8F9E', { blur: 3, sx: 1, sy: 2 }); }
      txt(top, 0, -35, { size: 30, font: F_MARK, color: '#fff', id: id + 'm' });
      txt(big, 0, 45, { size: 70, font: F_MARK, color: PAL.ink, id: id + 'd' });
      if (small) txt(small, 0, 86, { size: 28, font: F_PRINT, color: PAL.ink, id: id + 'y' });
    });
  }
  function laptop(x, y, s, t, id) {
    withT(x, y, s, 0, function () {
      paper(torn(id + 'sc', rrPts(-110, -130, 220, 140, 10), 1.3), '#2B2F48', { blur: 8 });
      paper(rectPts(-98, -118, 196, 116), PAL.sky, { shadow: false, texA: 0.3 });
      // video tiles with little faces
      var cols = [PAL.coral, PAL.mint, PAL.mustard, PAL.lav];
      for (var i = 0; i < 4; i++) {
        var tx = -92 + (i % 2) * 96, ty = -112 + Math.floor(i / 2) * 55;
        paper(rectPts(tx, ty, 88, 50), cols[i], { shadow: false, texA: 0.3 });
        var sk = [PAL.skin1, PAL.skin3, PAL.skin2, PAL.skin1][i];
        paper(ellPts(tx + 44, ty + 22 + Math.sin(t * 4 + i) * 1.5, 11, 12, 14), sk, { shadow: false });
        paper(ellPts(tx + 44, ty + 52, 22, 16, 14, Math.PI), '#FFFFFF', { shadow: false, texA: 0.2 });
      }
      paper(torn(id + 'bs', [[-140, 10], [140, 10], [120, 34], [-120, 34]], 1.2), '#8A8F9E', { blur: 6 });
    });
  }
  function hospital(x, y, s, id) {
    withT(x, y, s, 0, function () {
      paper(torn(id + 'b', rectPts(-90, -150, 180, 150), 1.8), '#FFFDF6', { blur: 10 });
      paper(torn(id + 'r', rectPts(-100, -168, 200, 24), 1.5), PAL.navy, { blur: 5 });
      paper(rectPts(-12, -128, 24, 56), PAL.red, { shadow: false }); paper(rectPts(-28, -112, 56, 24), PAL.red, { shadow: false });
      for (var i = 0; i < 3; i++) { paper(rectPts(-72 + i * 54, -60, 36, 28), PAL.sky, { shadow: false, texA: 0.3 }); }
      paper(rectPts(-18, -30, 36, 30), PAL.navyD, { shadow: false });
      rough(rectPts(-90, -150, 180, 150), { closed: true, w: 2.4, id: id + 'o', color: 'rgba(30,35,64,.5)', passes: 1 });
    });
  }
  function folder(x, y, s, id) {
    withT(x, y, s, -0.06, function () {
      paper(torn(id + 'bk', [[-110, -70], [-40, -70], [-26, -52], [110, -52], [110, 80], [-110, 80]], 1.5), '#E0A53A', { blur: 8 });
      // papers sticking out
      paper(torn(id + 'p1', rectPts(-86, -96, 150, 150), 1.5), '#FFFDF6', { blur: 5 });
      txt('TRANSCRIPT', -8, -60, { size: 22, font: F_MARK, color: PAL.navy, id: id + 'tt' });
      for (var i = 0; i < 3; i++) rough([[-70, -38 + i * 16], [40, -38 + i * 16]], { w: 2, color: 'rgba(30,35,64,.4)', id: id + 'l' + i, passes: 1 });
      txt('A  B  A', -12, 30, { size: 26, font: F_MARK, color: PAL.red, id: id + 'gr' });
      paper(torn(id + 'fr', [[-110, -30], [110, -30], [110, 80], [-110, 80]], 1.5), PAL.mustard, { blur: 6 });
    });
  }
  function envelope(x, y, s, id) {
    withT(x, y, s, 0.08, function () {
      var p = torn(id + 'e', rectPts(-90, -58, 180, 116), 1.5);
      paper(p, '#FFFFFF', { blur: 8 });
      rough([[-90, -58], [0, 8], [90, -58]], { w: 2.6, id: id + 'f', color: 'rgba(30,35,64,.55)' });
      heart(58, 26, 0.45, PAL.coral, id + 'h');
      txt('from my supervisor', -6, 44, { size: 20, font: F_HAND, color: PAL.ink, id: id + 't' });
    });
  }
  function books(x, y, s, id) {
    var cols = [PAL.coral, PAL.teal, PAL.lav, PAL.mustard], names = ['A&P II', 'MICRO', 'CHEM', 'ENG II'];
    withT(x, y, s, 0, function () {
      for (var i = 0; i < 4; i++) {
        var by = -i * 38, bw = 230 - i * 14, off = (i % 2 ? 10 : -8);
        paper(torn(id + 'b' + i, rectPts(-bw / 2 + off, by - 34, bw, 34), 1.2), cols[i], { blur: 5 });
        paper(rectPts(bw / 2 + off - 14, by - 30, 10, 26), '#FFFDF6', { shadow: false, texA: 0.3 });
        txt(names[i], off - 6, by - 8, { size: 22, font: F_MARK, color: '#fff', id: id + 'n' + i, jit: 0.4 });
      }
    });
  }
  function headHeart(x, y, s, id) { // Behavioral Health icon: profile head with a heart
    withT(x, y, s, 0, function () {
      var p = [[-40, 60], [-40, 30], [-58, 8], [-62, -30], [-40, -66], [0, -80], [40, -70], [58, -40], [56, -10], [70, 12], [54, 18], [54, 40], [30, 44], [26, 60]];
      paper(torn(id + 'hd', p, 2, 8), '#FFFDF6', { blur: 8 });
      rough(p, { closed: true, w: 3, id: id + 'ho' });
      heart(0, -18, 1, PAL.coral, id + 'ht');
    });
  }
  function medIcon(x, y, s, id) { // Med-Surg icon: medical cross + stethoscope
    withT(x, y, s, 0, function () {
      paper(torn(id + 'c', ellPts(0, 0, 70, 70, 26), 2), '#FFFDF6', { blur: 8 });
      paper(rectPts(-14, -44, 28, 88), PAL.red, { shadow: false }); paper(rectPts(-44, -14, 88, 28), PAL.red, { shadow: false });
      rough(curve(-50, -60, -90, 40, 0, 72, 14), { w: 5, color: '#2B2E45', id: id + 's1', passes: 1 });
      rough(curve(0, 72, 70, 80, 64, 30, 10), { w: 5, color: '#2B2E45', id: id + 's2', passes: 1 });
      paper(ellPts(64, 22, 14, 14, 14), '#C9CCD6', { blur: 3 });
    });
  }
  function clock(x, y, s, t, id) {
    withT(x, y, s, 0, function () {
      paper(torn(id + 'c', ellPts(0, 0, 52, 52, 26), 1.5), '#FFFDF6', { blur: 7 });
      rough(ellPts(0, 0, 52, 52, 26), { closed: true, w: 3, id: id + 'o' });
      var a1 = t * 1.2, a2 = t * 6;
      rough([[0, 0], [Math.sin(a1) * 26, -Math.cos(a1) * 26]], { w: 5, id: id + 'h', passes: 1 });
      rough([[0, 0], [Math.sin(a2) * 38, -Math.cos(a2) * 38]], { w: 3, id: id + 'm', color: PAL.coral, passes: 1 });
    });
  }
  function notebook(x, y, w, h, id) {
    var p = torn(id + 'pg', rectPts(x, y, w, h), 2.2);
    paper(p, '#FFFEF8', { blur: 14, sy: 9 });
    ctx.save(); polyPath(p); ctx.clip();
    ctx.strokeStyle = 'rgba(120,160,210,0.45)'; ctx.lineWidth = 1.5;
    for (var ly = y + 70; ly < y + h; ly += 44) { ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + w, ly); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(220,90,90,0.6)'; ctx.beginPath(); ctx.moveTo(x + 70, y); ctx.lineTo(x + 70, y + h); ctx.stroke();
    ctx.restore();
    for (var i = 0; i < 4; i++) { ctx.save(); ctx.fillStyle = 'rgba(80,60,40,0.18)'; ctx.beginPath(); ctx.arc(x + 32, y + 60 + i * (h - 120) / 3, 10, 0, 6.28); ctx.fill(); ctx.restore(); }
  }
  function ticket(x, y, s, label, id) {
    withT(x, y, s, -0.06, function () {
      var w = textW(label, 34, F_MARK) + 70, h = 64;
      var p = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, -12], [w / 2 - 12, 0], [w / 2, 12], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2, 12], [-w / 2 + 12, 0], [-w / 2, -12]];
      paper(p, PAL.mustard, { blur: 8 });
      rough([[-w / 2 + 30, -h / 2 + 8], [-w / 2 + 30, h / 2 - 8]], { w: 2, id: id + 'd', color: 'rgba(60,40,20,.5)', passes: 1 });
      txt(label, 14, 12, { size: 34, font: F_MARK, color: PAL.ink, id: id + 't' });
    });
  }
  function sticker(letter, x, y, s, col, id) {
    withT(x, y, s, (hash(id) % 20 - 10) / 60, function () {
      paper(torn(id, ellPts(0, 0, 30, 30, 22), 1.4, 6), col, { blur: 5, sx: 2, sy: 3 });
      txt(letter, 0, 15, { size: 42, font: F_MARK, color: '#fff', id: id + 't', jit: 0.4 });
    });
  }
  function confetti(t, t0, n, seed) {
    if (t < t0) return;
    var r = mulberry(seed || 9), cols = [PAL.coral, PAL.mustard, PAL.teal, PAL.sky, PAL.lav, PAL.pink];
    for (var i = 0; i < n; i++) {
      var x0 = r() * W, sp = 90 + r() * 140, dt = t - t0 - r() * 0.8; if (dt < 0) continue;
      var y = -30 + dt * sp, x = x0 + Math.sin(dt * 2 + i) * 30;
      if (y > H + 30) continue;
      withT(x, y, 1, dt * (2 + r() * 3), function () { ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(-7, -4, 14, 8); });
    }
  }
  // Paper wipe transition: a big torn sheet sweeps across (p: 0..1)
  function wipe(p, col, id) {
    if (p <= 0 || p >= 1) return;
    var x = lerp(-W * 1.25, W * 1.15, eInOut(p));
    ctx.save(); ctx.translate(x, 0); ctx.rotate(-0.05);
    var sheet = torn('wipe' + id, rectPts(0, -120, W * 1.1, H + 240), 12, 24);
    paper(sheet, col, { blur: 30, sx: 12, sy: 0, shadowA: 0.35, texA: 0.6 });
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Scenes
  // ---------------------------------------------------------------------------
  var SC = {}; // scene boundaries (computed after narration loads)
  function computeScenes() {
    SC.hook = [0, L('what').start - 0.05];
    SC.what = [SC.hook[1], L('tracks').start - 0.05];
    SC.tracks = [SC.what[1], L('titles').start - 0.1];
    SC.quals = [SC.tracks[1], L('prereq').start - 0.1];
    SC.prereq = [SC.quals[1], L('commit').start - 0.1];
    SC.commit = [SC.prereq[1], L('step1').start - 0.1];
    SC.steps = [SC.commit[1], L('end').start - 0.15];
    SC.end = [SC.steps[1], DUR + 1];
  }
  function inScene(t, k, pad) { pad = pad || 0.6; return t >= SC[k][0] - pad && t < SC[k][1] + pad; }
  // exit animation factor for elements near the end of a scene: 1 while on stage, flies up as scene ends
  function leave(t, k, delay) { return eInCubic(prog(t, SC[k][1] - 0.45 + (delay || 0), SC[k][1] + 0.05 + (delay || 0))); }

  function sceneHook(t) {
    var k = 'hook', lv = leave(t, k);
    // title tag
    var a = popS(t, 0.15, 0.6);
    withT(280, 110 - lv * 300, a, -0.05, function () {
      tornRect('hooktag', -215, -38, 430, 76, PAL.navy, {});
      txt('NYC Health + Hospitals', 0, 12, { size: 34, font: F_HEAD, color: '#fff', id: 'hooktag' });
      tape(-195, -34, 70, -0.5, 'ht1');
    });
    // nurse
    var ns = popS(t, 0.3, 0.7);
    withT(0, lv * 500, 1, 0, function () { nurse(430, 640, 1.02 * ns, { t: t, id: 'n1', scrub: PAL.teal, badge: 'PCA', look: 6 }); });
    // thought bubbles + cloud
    var c1 = popS(t, 0.9, 0.4), c2 = popS(t, 1.1, 0.4);
    withT(0, -lv * 600, 1, 0, function () {
      withT(560, 250, c1, 0, function () { paper(ellPts(0, 0, 14, 14, 16), '#fff', { blur: 6 }); rough(ellPts(0, 0, 14, 14, 16), { closed: true, w: 2.5, id: 'b1' }); });
      withT(610, 200, c2, 0, function () { paper(ellPts(0, 0, 22, 22, 18), '#fff', { blur: 6 }); rough(ellPts(0, 0, 22, 22, 18), { closed: true, w: 2.5, id: 'b2' }); });
      var cp = prog(t, 1.25, 1.85);
      if (cp > 0) {
        cloud(870, 230, 470, 300, cp, 'hookcloud');
        withT(870, 230, eOutBack(cp), 0, function () {
          var rn = popS(t, WT('hook', 'registered') - 0.1, 0.55);
          withT(0, -10, rn, -0.06, function () {
            paper(torn('rnb', rrPts(-120, -62, 240, 124, 18), 2), PAL.coral, { blur: 8 });
            txt('RN', 0, 30, { size: 96, font: F_MARK, color: '#fff', id: 'rnbig', stroke: 'rgba(0,0,0,0.12)', strokeW: 5 });
          });
          if (t > WT('hook', 'registered')) { sparkle(-150, -80, 1, t, 's1'); sparkle(160, -90, 0.8, t, 's2', PAL.coral); sparkle(170, 70, 0.7, t, 's3', PAL.teal); }
          if (t > WT('hook', 'nurse')) rough(curve(-110, 80, 0, 100, 110, 76, 10), { w: 5, color: PAL.navy, progress: prog(t, WT('hook', 'nurse'), WT('hook', 'nurse') + 0.4), id: 'ul1' });
        });
      }
    });
  }

  function sceneWhat(t) {
    var k = 'what', s0 = SC.what[0], lv = leave(t, k);
    // banner
    var bt = WT('what', 'nursing') - 0.15, bp = popS(t, bt, 0.6);
    withT(640, 96 - lv * 260, bp, -0.02, function () {
      tornRect('banner', -330, -58, 660, 116, PAL.navy, { amt: 4 });
      txt('Nursing Career Ladder', 0, 22, { size: 66, font: F_HEAD, color: '#fff', id: 'bannert' });
      tape(-300, -50, 90, -0.6, 'bt1'); tape(300, -50, 90, 0.6, 'bt2');
    });
    // ladder with small nurse at the bottom, left
    var lp = prog(t, s0 + 0.1, s0 + 1.6);
    withT(-lv * 500, 0, 1, 0, function () {
      ladder(200, 610, 420, 120, 7, lp, 'lad1');
      var climb = eInOut(prog(t, WT('what', 'become'), WT('what', 'become') + 1.4));
      nurse(200, 640 - climb * 120, 0.42 * popS(t, s0 + 0.4, 0.6), { t: t, id: 'n2', scrub: PAL.teal });
      withT(310, 190, popS(t, WT('what', 'become') + 0.2, 0.5), 0.1, function () { sparkle(0, 0, 1, t, 'lsp'); });
    });
    // tuition bill + PAID stamp
    var bill_t = WT('what', 'pays') - 0.1;
    withT(0, lv * 600, 1, 0, function () {
      var bs = popS(t, bill_t, 0.55);
      withT(620, 360, bs, 0, function () { bill(0, 0, 1, 'bill1'); });
      stamp('PAID', 660, 395, t, WT('what', 'tuition'), { size: 60 });
      var lb = popS(t, WT('what', 'tuition') + 0.35, 0.5);
      withT(640, 510, lb, 0.04, function () {
        tornRect('bylab', -120, -26, 240, 52, PAL.mustard, {});
        txt('by NYC H+H', 0, 12, { size: 34, font: F_HEAD, color: PAL.ink, id: 'bylab' });
      });
    });
    // RN badge + cap (right)
    var capT = WT('what', 'become');
    withT(lv * 500, 0, 1, 0, function () {
      withT(1010, 300, popS(t, capT, 0.6), 0, function () {
        badge('RN', 0, 40, 1.35, PAL.coral, 'rnbadge', 0.08);
        gradCap(0, -60, 0.95, 'cap1');
      });
      // keep working
      var kw = WT('what', 'keep') - 0.1;
      withT(1010, 500, popS(t, kw, 0.5), 0, function () {
        clock(-95, 0, 0.8, t, 'clk1');
        txt('+ keep', 20, -6, { size: 38, font: F_HEAD, color: PAL.ink, id: 'kw1', align: 'left', reveal: prog(t, kw, kw + 0.4) });
        txt('working!', 20, 34, { size: 38, font: F_HEAD, color: PAL.ink, id: 'kw2', align: 'left', reveal: prog(t, kw + 0.2, kw + 0.6) });
      });
    });
  }

  function sceneTracks(t) {
    var k = 'tracks', s0 = SC.tracks[0], lv = leave(t, k);
    withT(640, 110 - lv * 260, popS(t, s0 + 0.05, 0.5), -0.02, function () {
      tornRect('trk', -250, -46, 500, 92, PAL.mustard, {});
      txt('Pick your track', 0, 18, { size: 58, font: F_HEAD, color: PAL.ink, id: 'trkt' });
    });
    var a1 = WT('tracks', 'behavioral') - 0.1, a2 = WT('tracks', 'med') - 0.1;
    withT(-lv * 700, 0, 1, 0, function () {
      withT(390, 380, popS(t, a1, 0.6), -0.05, function () {
        tornRect('bhcard', -210, -170, 420, 340, PAL.coral, { amt: 3.5 });
        tape(0, -170, 110, 0.03, 'bht');
        headHeart(0, -40, 1.1, 'bhic');
        txt('Behavioral', 0, 88, { size: 50, font: F_HEAD, color: '#fff', id: 'bh1' });
        txt('Health', 0, 136, { size: 50, font: F_HEAD, color: '#fff', id: 'bh2' });
      });
    });
    withT(lv * 700, 0, 1, 0, function () {
      withT(890, 380, popS(t, a2, 0.6), 0.05, function () {
        tornRect('mscard', -210, -170, 420, 340, PAL.teal, { amt: 3.5 });
        tape(0, -170, 110, -0.03, 'mst');
        medIcon(0, -40, 1.05, 'msic');
        txt('Med-Surgical', 0, 112, { size: 52, font: F_HEAD, color: '#fff', id: 'ms1' });
      });
    });
    // "or" in the middle + note
    withT(640, 390, popS(t, a2 - 0.25, 0.4), 0, function () { txt('or', 0, 14, { size: 54, font: F_HEAD, color: PAL.ink, id: 'or' }); });
    var nt = WT('tracks', 'behavioral') + 0.3;
    withT(640, 604 + lv * 200, popS(t, nt, 0.5), -0.01, function () {
      txt('where do you want to work as a nurse?', 0, 0, { size: 36, font: F_HAND, color: PAL.navy, id: 'trknote', weight: 700, reveal: prog(t, nt, nt + 0.9) });
    });
  }

  function sceneQuals(t) {
    var k = 'quals', s0 = SC.quals[0], lv = leave(t, k);
    withT(0, lv * 760, 1, lv * 0.05, function () {
      withT(640, 330, popS(t, s0 + 0.05, 0.55), -0.012, function () {
        ctx.translate(-640, -330);
        notebook(150, 20, 980, 600, 'nb1');
        txt('Who qualifies?', 250, 92, { size: 62, font: F_HEAD, color: PAL.navy, align: 'left', id: 'wq', reveal: prog(t, s0 + 0.2, s0 + 0.8) });
        rough(curve(250, 108, 400, 120, 580, 104, 10), { w: 4, color: PAL.coral, progress: prog(t, s0 + 0.7, s0 + 1.1), id: 'wqu' });

        // Rows 1-2: full-time PCA, PCT, PSHT or BHA (one spoken list)
        var r1 = WT('titles', 'full') - 0.1;
        txt('Full-time', 250, 180, { size: 44, font: F_HAND, weight: 700, color: PAL.ink, align: 'left', id: 'ft', reveal: prog(t, r1, r1 + 0.4) });
        withT(520, 166, popS(t, WT('titles', 'p.c.a') - 0.05, 0.45), -0.05, function () { badge('PCA', 0, 0, 0.8, PAL.teal, 'bpca'); });
        withT(660, 166, popS(t, WT('titles', 'p.c.t') - 0.05, 0.45), 0.04, function () { badge('PCT', 0, 0, 0.8, PAL.teal, 'bpct'); });
        withT(530, 256, popS(t, WT('titles', 'p.s.h.t') - 0.05, 0.45), -0.04, function () { badge('PSHT', 0, 0, 0.8, PAL.coral, 'bpsht'); });
        withT(690, 256, popS(t, WT('titles', 'b.h.a') - 0.05, 0.45), 0.03, function () { badge('BHA', 0, 0, 0.8, PAL.coral, 'bbha'); });
        txt('or', 250, 270, { size: 44, font: F_HAND, weight: 700, color: PAL.ink, align: 'left', id: 'orr', reveal: prog(t, WT('titles', 'or'), WT('titles', 'or') + 0.3) });
        txt('Med-Surgical or', 770, 162, { size: 30, font: F_HAND, color: PAL.tealD, align: 'left', id: 'bt', weight: 700, reveal: prog(t, WT('titles', 'p.c.t') + 0.3, WT('titles', 'p.c.t') + 0.9) });
        txt('Behavioral Health', 770, 194, { size: 30, font: F_HAND, color: PAL.tealD, align: 'left', id: 'bt2', weight: 700, reveal: prog(t, WT('titles', 'p.c.t') + 0.5, WT('titles', 'p.c.t') + 1.1) });
        txt('Behavioral Health', 790, 268, { size: 30, font: F_HAND, weight: 700, color: PAL.red, align: 'left', id: 'fbh', reveal: prog(t, WT('titles', 'b.h.a') + 0.2, WT('titles', 'b.h.a') + 0.8) });
        check(215, 166, 1, prog(t, WT('titles', 'p.c.t') + 0.2, WT('titles', 'p.c.t') + 0.5), PAL.teal, 'c1');
        check(215, 256, 1, prog(t, WT('titles', 'b.h.a') + 0.3, WT('titles', 'b.h.a') + 0.6), PAL.teal, 'c2');

        // Row 3: 1 year of service by Dec 31
        var r3 = WT('tenure', 'one') - 0.1;
        withT(300, 372, popS(t, r3, 0.5), -0.05, function () { calendar(0, 0, 0.55, 'DEC', '31', '2026', 'cal1', PAL.coral); });
        txt('1 year of service', 380, 362, { size: 46, font: F_HAND, weight: 700, color: PAL.ink, align: 'left', id: 'yr', reveal: prog(t, r3, r3 + 0.6) });
        txt('by December 31, 2026', 380, 404, { size: 36, font: F_HAND, weight: 700, color: PAL.navy, align: 'left', id: 'yr2', reveal: prog(t, WT('tenure', 'december'), WT('tenure', 'december') + 0.7) });
        check(215, 372, 1, prog(t, WT('tenure', 'thirty'), WT('tenure', 'thirty') + 0.3), PAL.teal, 'c3');

        // Row 4: never been in a nursing program
        var r4 = WT('tenure', 'who') - 0.05;
        txt('New to nursing school', 380, 486, { size: 46, font: F_HAND, weight: 700, color: PAL.ink, align: 'left', id: 'nn', reveal: prog(t, r4, r4 + 0.7) });
        txt('never enrolled in a nursing program before', 380, 526, { size: 30, font: F_HAND, weight: 700, color: 'rgba(30,35,64,0.75)', align: 'left', id: 'nn2', reveal: prog(t, WT('tenure', 'never'), WT('tenure', 'program') + 0.3) });
        withT(300, 490, popS(t, r4, 0.5), 0.05, function () { gradCap(0, 0, 0.55, 'cap2'); sparkle(46, -30, 0.6, t, 'nsp'); });
        check(215, 492, 1, prog(t, WT('tenure', 'program'), WT('tenure', 'program') + 0.35), PAL.teal, 'c4');
      });
    });
  }

  function scenePrereq(t) {
    var k = 'prereq', s0 = SC.prereq[0], lv = leave(t, k);
    // clipboard with report card (left)
    withT(-lv * 800, 0, 1, 0, function () {
      withT(420, 360, popS(t, s0 + 0.05, 0.55), -0.03, function () {
        paper(torn('clip', rrPts(-250, -250, 500, 520, 18), 2), '#A87A4A', { blur: 14 });
        paper(torn('clpp', rectPts(-220, -215, 440, 470), 2), '#FFFEF8', { blur: 6 });
        paper(torn('clcl', rrPts(-70, -272, 140, 46, 10), 1.2), '#9AA0AE', { blur: 5 });
        txt('Prerequisites', 0, -160, { size: 48, font: F_HEAD, color: PAL.navy, id: 'prh' });
        var courses = ['English Comp I', 'Anatomy & Phys I', 'Intro Psychology', 'Statistics', 'Developmental Psych'];
        var grades = ['A', 'B', 'A', 'B', 'A'], gc = [PAL.teal, PAL.navy, PAL.teal, PAL.navy, PAL.teal];
        var t5 = WT('prereq', 'five') - 0.3;
        for (var i = 0; i < 5; i++) {
          var rt = t5 + i * 0.28, ry = -100 + i * 66;
          txt(courses[i], -190, ry + 12, { size: 34, font: F_HAND, weight: 700, color: PAL.ink, align: 'left', id: 'crs' + i, reveal: prog(t, rt - 0.1, rt + 0.35) });
          rough([[-190, ry + 26], [120, ry + 26]], { w: 1.6, color: 'rgba(30,35,64,.25)', id: 'crl' + i, passes: 1, progress: prog(t, rt - 0.1, rt + 0.3) });
          withT(165, ry, popS(t, WT('prereq', 'mostly') + i * 0.12, 0.4), 0, function () { sticker(grades[i], 0, 0, 0.95, gc[i], 'stk' + i); });
        }
      });
    });
    // "5+" circled note
    var fv = WT('prereq', 'five');
    withT(800 - lv * 900, 250, popS(t, fv, 0.5), 0.08, function () {
      txt('at least', 0, -34, { size: 36, font: F_HAND, weight: 700, color: PAL.ink, id: 'atl' });
      txt('5', 0, 58, { size: 120, font: F_MARK, color: PAL.coral, id: 'five' });
      rough(ellPts(0, 20, 78, 74, 26, -1.2), { closed: false, w: 4, color: PAL.coral, progress: prog(t, fv + 0.2, fv + 0.8), id: 'fvc' });
      txt("mostly A's & B's", 0, 150, { size: 32, font: F_HAND, weight: 700, color: PAL.navy, id: 'ab', reveal: prog(t, WT('prereq', 'mostly'), WT('prereq', 'mostly') + 0.7) });
    });
    // books "the rest" + PAID stamp (right)
    var th = WT('prereq', 'then') - 0.1;
    withT(1080 + lv * 600, 470, popS(t, th, 0.6), 0, function () {
      books(0, 90, 1.15, 'bk1');
      txt('the rest', 0, -150, { size: 42, font: F_HEAD, color: PAL.ink, id: 'rest', reveal: prog(t, WT('prereq', 'rest') - 0.2, WT('prereq', 'rest') + 0.3) });
    });
    if (lv < 1) stamp('PAID', 1090 + lv * 600, 470, t, WT('prereq', 'pays'), { size: 58, rot: 0.12 });
  }

  function sceneCommit(t) {
    var k = 'commit', s0 = SC.commit[0], lv = leave(t, k);
    withT(0, lv * 700, 1, 0, function () {
      hospital(930, 560, 1.5 * popS(t, s0 + 0.1, 0.6), 'hosp');
      withT(930, 330, popS(t, s0 + 0.35, 0.5), 0.03, function () {
        tornRect('hlab', -130, -30, 260, 60, PAL.navy, {});
        txt('NYC H+H', 0, 16, { size: 44, font: F_MARK, color: '#fff', id: 'hlab' });
      });
      nurse(470, 650, 1.0 * popS(t, s0 + 0.05, 0.6), { t: t, id: 'n3', scrub: PAL.navy, badge: 'RN', steth: true, wave: t > WT('commit', 'r.n') - 0.1, look: 4 });
      var ry = WT('commit', 'three') - 0.1;
      withT(700, 150, popS(t, ry, 0.5), -0.06, function () {
        tornRect('3y', -150, -60, 300, 120, PAL.mustard, {});
        txt('3 years', 0, 22, { size: 72, font: F_MARK, color: PAL.ink, id: 'thr' });
        tape(0, -58, 90, 0.05, '3yt');
      });
      for (var i = 0; i < 3; i++) withT(160 + i * 70, 180 + (i % 2) * 30, popS(t, ry + 0.2 + i * 0.12, 0.4), 0, function () { heart(0, 0, 0.9, [PAL.coral, PAL.pink, PAL.red][i], 'ch' + i); });
      if (t > WT('commit', 'r.n')) { sparkle(560, 380, 0.9, t, 'cs1'); sparkle(380, 300, 0.7, t, 'cs2', PAL.coral); }
    });
  }

  function sceneSteps(t) {
    var k = 'steps', s0 = SC.steps[0], lv = leave(t, k);
    withT(0, -lv * 700, 1, 0, function () {
      withT(640, 86, popS(t, s0 + 0.05, 0.5), -0.015, function () {
        tornRect('ns', -230, -48, 460, 96, PAL.navy, {});
        txt('Next steps', 0, 20, { size: 64, font: F_HEAD, color: '#fff', id: 'nst' });
        tape(-210, -40, 80, -0.5, 'nsa'); tape(210, -40, 80, 0.5, 'nsb');
      });
      var xs = [240, 640, 1040], rots = [-0.03, 0.015, 0.035];
      var starts = [WT('step1', 'one') - 0.1, WT('step2', 'two') - 0.1, WT('step3', 'three') - 0.1];
      var cols = ['#FFFEF8', '#FFFEF8', '#FFFEF8'];
      for (var i = 0; i < 3; i++) {
        (function (i) {
          var st = starts[i];
          withT(xs[i], 370, popS(t, st, 0.6), rots[i], function () {
            paper(torn('card' + i, rectPts(-180, -200, 360, 400), 2.4), cols[i], { blur: 14 });
            ctx.save(); ctx.strokeStyle = 'rgba(220,90,90,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-180, -128); ctx.lineTo(180, -128); ctx.stroke(); ctx.restore();
            tape(0, -200, 100, (i - 1) * 0.1, 'ct' + i);
            numCircle(i + 1, -130, -160, 1, [PAL.teal, PAL.coral, PAL.navy][i]);
            if (i === 0) {
              txt('Join an', 30, -168, { size: 38, font: F_HEAD, color: PAL.ink, id: 'j1' });
              txt('info session', 20, -134, { size: 40, font: F_HEAD, color: PAL.ink, id: 'j2' });
              laptop(-50, 30, 0.62, t, 'lap');
              withT(110, 20, popS(t, WT('step1', 'person') - 0.1, 0.5), 0, function () { hospital(0, 0, 0.5, 'hsm'); });
              txt('online', -70, 94, { size: 30, font: F_HAND, weight: 700, color: PAL.navy, id: 'onl', reveal: prog(t, WT('step1', 'online'), WT('step1', 'online') + 0.35) });
              txt('or in person', 92, 94, { size: 30, font: F_HAND, weight: 700, color: PAL.navy, id: 'inp', reveal: prog(t, WT('step1', 'person') - 0.1, WT('step1', 'person') + 0.35) });
              withT(0, 150, popS(t, WT('step1', 'application') - 0.25, 0.5), 0, function () { ticket(0, 0, 0.66, '= your application!', 'tk'); });
            } else if (i === 1) {
              txt('Gather your', 30, -168, { size: 38, font: F_HEAD, color: PAL.ink, id: 'g1' });
              txt('documents', 20, -134, { size: 40, font: F_HEAD, color: PAL.ink, id: 'g2' });
              withT(-40, 10, popS(t, WT('step2', 'transcripts') - 0.2, 0.5), 0, function () { folder(0, 0, 0.8, 'fold'); });
              withT(50, 120, popS(t, WT('step2', 'letter') - 0.15, 0.5), 0, function () { envelope(0, 0, 0.78, 'env'); });
            } else {
              txt('Apply by', 30, -168, { size: 38, font: F_HEAD, color: PAL.ink, id: 'a1' });
              txt('the deadline', 20, -134, { size: 40, font: F_HEAD, color: PAL.ink, id: 'a2' });
              withT(0, 20, popS(t, WT('step3', 'december') - 0.2, 0.5), 0, function () { calendar(0, 0, 1.05, 'DEC', '31', '2026', 'cal2', PAL.red); });
              rough(ellPts(0, 55, 118, 110, 28, -1.4), { w: 4.5, color: PAL.red, progress: prog(t, WT('step3', 'thirty'), WT('step3', 'thirty') + 0.6), id: 'calc' });
            }
          });
        })(i);
      }
      stamp('APPLY!', 1060, 610, t, L('step3').end - 0.35, { size: 44, rot: -0.1 });
    });
  }

  function sceneEnd(t) {
    var s0 = SC.end[0];
    // big ladder with nurse climbing to the top
    ladder(330, 700, 600, 150, 9, prog(t, s0, s0 + 1.1), 'lad2');
    var climb = eInOut(prog(t, s0 + 0.5, s0 + 2.6));
    var hop = Math.abs(Math.sin(climb * Math.PI * 4)) * 10;
    nurse(330, 690 - climb * 400 - hop, 0.48, { t: t, id: 'n4', scrub: PAL.navy, badge: climb > 0.95 ? 'RN' : null, steth: climb > 0.95, wave: climb > 0.95 });
    // flag at the top
    withT(418, 150, popS(t, s0 + 2.5, 0.5), 0, function () {
      rough([[0, 40], [0, -60]], { w: 5, id: 'flp' });
      paper(torn('flag', [[0, -60], [90, -44], [0, -24]], 1.5), PAL.coral, { blur: 5 });
      txt('RN', 32, -34, { size: 24, font: F_MARK, color: '#fff', id: 'flt' });
    });
    confetti(t, s0 + 2.55, 70, 42);
    if (t > s0 + 2.6) { sparkle(250, 80, 1, t, 'es1'); sparkle(420, 60, 0.8, t, 'es2', PAL.coral); sparkle(440, 150, 0.6, t, 'es3', PAL.teal); }
    // headline
    var hl = popS(t, s0 + 0.15, 0.6);
    withT(850, 230, hl, -0.02, function () {
      tornRect('endb', -360, -120, 720, 240, PAL.navy, { amt: 4 });
      txt('Your path to RN', 0, -18, { size: 76, font: F_HEAD, color: '#fff', id: 'e1' });
      txt('starts here.', 0, 70, { size: 76, font: F_HEAD, color: PAL.mustard, id: 'e2' });
      tape(-330, -110, 100, -0.5, 'et1'); tape(330, -110, 100, 0.5, 'et2');
    });
    var ul = popS(t, s0 + 1.4, 0.55);
    withT(850, 450, ul, 0.02, function () {
      tornRect('endu', -300, -44, 600, 88, '#FFFEF8', {});
      txt('tinyurl.com/hhcareerladder', 0, 14, { size: 44, font: F_HEAD, color: PAL.navy, id: 'eu' });
    });
    withT(850, 540, popS(t, s0 + 2.0, 0.5), -0.01, function () {
      txt('Everything you need is on this page', 0, 0, { size: 34, font: F_HAND, weight: 700, color: PAL.ink, id: 'ep', reveal: prog(t, s0 + 2.0, s0 + 2.9) });
    });
    withT(850, 594, popS(t, s0 + 2.6, 0.5), 0, function () {
      txt('Applications close December 31, 2026', 0, 0, { size: 30, font: F_HAND, weight: 700, color: PAL.red, id: 'ec' });
    });
  }

  // Faint hand-drawn doodles scattered on the background
  var DOODLES = null;
  function buildDoodles() {
    var r = mulberry(77), kinds = ['star', 'squiggle', 'heart', 'spiral', 'plus', 'dots'], cols = [PAL.navy, PAL.coral, PAL.teal, PAL.mustard];
    DOODLES = [];
    for (var i = 0; i < 22; i++) {
      var x = 40 + r() * (W - 80), y = 30 + r() * (H - 150);
      if (x > 260 && x < 1020 && y > 150 && y < 560) { i--; if (r() < 0.02) break; continue; } // keep the centre clear
      DOODLES.push({ x: x, y: y, k: kinds[Math.floor(r() * kinds.length)], c: cols[Math.floor(r() * cols.length)], s: 0.7 + r() * 0.7, a: r() * 6.28, id: 'dd' + i });
    }
  }
  function drawDoodles(t) {
    if (!DOODLES) buildDoodles();
    ctx.save(); ctx.globalAlpha = 0.22;
    DOODLES.forEach(function (d) {
      var fl = Math.sin(t * 0.8 + d.a) * 4;
      withT(d.x, d.y + fl, d.s, d.a * 0.2, function () {
        if (d.k === 'star') { var p = []; for (var i = 0; i < 10; i++) { var a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? 7 : 17; p.push([Math.cos(a) * rr, Math.sin(a) * rr]); } rough(p, { closed: true, w: 2.5, color: d.c, id: d.id, passes: 1 }); }
        else if (d.k === 'squiggle') rough([[-30, 0], [-18, -10], [-6, 0], [6, -10], [18, 0], [30, -10]], { w: 3, color: d.c, id: d.id, passes: 1 });
        else if (d.k === 'heart') { var h = []; for (var j = 0; j < 20; j++) { var b = j / 20 * Math.PI * 2; h.push([16 * Math.pow(Math.sin(b), 3) * 1.1, -(13 * Math.cos(b) - 5 * Math.cos(2 * b) - 2 * Math.cos(3 * b) - Math.cos(4 * b)) * 1.1]); } rough(h, { closed: true, w: 2.5, color: d.c, id: d.id, passes: 1 }); }
        else if (d.k === 'spiral') { var s = []; for (var k = 0; k < 30; k++) { var c = k * 0.5; s.push([Math.cos(c) * k * 0.8, Math.sin(c) * k * 0.8]); } rough(s, { w: 2.5, color: d.c, id: d.id, passes: 1 }); }
        else if (d.k === 'plus') { rough([[-12, 0], [12, 0]], { w: 3, color: d.c, id: d.id + 'a', passes: 1 }); rough([[0, -12], [0, 12]], { w: 3, color: d.c, id: d.id + 'b', passes: 1 }); }
        else { ctx.fillStyle = d.c; for (var m = 0; m < 3; m++) { ctx.beginPath(); ctx.arc(m * 14 - 14, 0, 3, 0, 6.28); ctx.fill(); } }
      });
    });
    ctx.restore();
  }

  // Captions: taped paper strip with word-by-word highlight
  var showCaptions = true, POSTER = false, CAPSIZE = 30;
  function captionLayout(line) {
    if (line._lay && line._lay.size === CAPSIZE) return line._lay;
    var size = CAPSIZE, maxW = size > 34 ? 1150 : 1040, font = '700 ' + size + 'px ' + F_HAND;
    ctx.save(); ctx.font = font;
    // map caption words to spoken word timings (captions use digits, e.g. "31" where TTS said "thirty-first")
    var capWords = line.caption.split(/\s+/), spoken = line.words, rows = [[]], rowW = [0], sp = ctx.measureText(' ').width;
    var n = capWords.length, m = spoken.length;
    capWords.forEach(function (w, i) {
      var ww = ctx.measureText(w).width, r = rows.length - 1;
      if (rowW[r] + ww > maxW && rows[r].length) { rows.push([]); rowW.push(0); r++; }
      var si = Math.min(m - 1, Math.floor(i * m / n));
      rows[r].push({ w: w, x: rowW[r], width: ww, t: spoken.length ? spoken[si].t : line.start });
      rowW[r] += ww + sp;
    });
    ctx.restore();
    line._lay = { rows: rows, rowW: rowW, size: size, font: font };
    return line._lay;
  }
  function drawCaptions(t) {
    if (!showCaptions || !NARR || POSTER) return;
    var cur = null;
    for (var i = 0; i < NARR.lines.length; i++) { var ln = NARR.lines[i]; if (t >= ln.start - 0.15 && t <= ln.end + 0.35) { cur = ln; break; } }
    if (!cur) return;
    var lay = captionLayout(cur), rows = lay.rows, lh = Math.round(CAPSIZE * 1.27), hh = rows.length * lh + 26, y0 = H - hh - 30;
    var maxRow = Math.max.apply(null, lay.rowW), bw = Math.min(1180, maxRow + 70);
    var a = Math.min(prog(t, cur.start - 0.15, cur.start + 0.05), 1 - prog(t, cur.end + 0.15, cur.end + 0.35));
    ctx.save(); ctx.globalAlpha = a;
    var p = torn('cap' + rows.length + '|' + Math.round(bw / 40), rectPts(W / 2 - bw / 2, y0, bw, hh), 2.2, 8);
    paper(p, 'rgba(255,253,244,0.94)', { blur: 10, sy: 4, shadowA: 0.25, texA: 0.35 });
    tape(W / 2 - bw / 2 + 20, y0 + 6, 70, -0.6, 'capt1'); tape(W / 2 + bw / 2 - 20, y0 + 6, 70, 0.6, 'capt2');
    ctx.font = lay.font; ctx.textBaseline = 'alphabetic';
    rows.forEach(function (row, ri) {
      var rw = lay.rowW[ri], x0 = W / 2 - rw / 2, y = y0 + 13 + lh * (ri + 1) - 8;
      row.forEach(function (wd) {
        var said = t >= wd.t - 0.02;
        ctx.fillStyle = said ? PAL.ink : 'rgba(30,35,64,0.38)';
        ctx.fillText(wd.w, x0 + wd.x, y);
      });
    });
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Master render
  // ---------------------------------------------------------------------------
  function render(t) {
    t = Math.max(0, t);
    BOIL = REDUCED ? 0 : Math.floor(t * 10);
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // camera drift
    var cx = Math.sin(t * 0.35) * 4, cy = Math.cos(t * 0.28) * 3;
    ctx.drawImage(TEX.bg, 0, 0, W, H);
    drawDoodles(t);
    ctx.save(); ctx.translate(cx, cy);
    if (inScene(t, 'hook')) sceneHook(t);
    if (inScene(t, 'what')) sceneWhat(t);
    if (inScene(t, 'tracks')) sceneTracks(t);
    if (inScene(t, 'quals')) sceneQuals(t);
    if (inScene(t, 'prereq')) scenePrereq(t);
    if (inScene(t, 'commit')) sceneCommit(t);
    if (inScene(t, 'steps')) sceneSteps(t);
    if (inScene(t, 'end', 0)) sceneEnd(t);
    ctx.restore();
    // paper-sheet wipes between some scenes
    wipe(prog(t, SC.tracks[1] - 0.35, SC.tracks[1] + 0.45), PAL.mustard, 'w1');
    wipe(prog(t, SC.commit[1] - 0.35, SC.commit[1] + 0.45), PAL.sky, 'w2');
    wipe(prog(t, SC.steps[1] - 0.35, SC.steps[1] + 0.45), PAL.coral, 'w3');
    drawCaptions(t);
    // grain + vignette
    ctx.save(); ctx.globalAlpha = 0.5; ctx.globalCompositeOperation = 'overlay';
    var g = TEX.grain[((BOIL % TEX.grain.length) + TEX.grain.length) % TEX.grain.length];
    ctx.drawImage(g, 0, 0, W, H);
    ctx.restore();
    ctx.drawImage(TEX.vig, 0, 0);
  }

  // ---------------------------------------------------------------------------
  // Audio: narration + generative music + synthesized SFX (Web Audio)
  // ---------------------------------------------------------------------------
  var AC = null, voiceBuf = null, master, musicBus, sfxBus, voiceBus, voiceSrc = null, T0 = 0, schedTimer = null, nextStep = 0, noiseBuf = null;
  var BPM = 100, STEP = 60 / BPM / 2; // eighth notes
  var CHORDS = [ // C  Am  F  G (MIDI)
    [48, [60, 64, 67, 72]], [45, [57, 60, 64, 69]], [41, [53, 57, 60, 65]], [43, [55, 59, 62, 67]]
  ];
  var MELODY = [76, null, 79, null, 77, 76, null, 74, 72, null, 74, 76, null, null, 79, null]; // 2-bar motif (glockenspiel)
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function audioInit() {
    if (AC) return;
    var C = window.AudioContext || window.webkitAudioContext; AC = new C();
    master = AC.createGain(); master.gain.value = 0.9;
    var comp = AC.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 3;
    master.connect(comp); comp.connect(AC.destination);
    musicBus = AC.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
    sfxBus = AC.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
    voiceBus = AC.createGain(); voiceBus.gain.value = 1.0; voiceBus.connect(master);
    // soft room reverb for music/sfx
    var rv = AC.createConvolver(), len = AC.sampleRate * 1.6, ir = AC.createBuffer(2, len, AC.sampleRate);
    for (var ch = 0; ch < 2; ch++) { var d = ir.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    rv.buffer = ir; var rvg = AC.createGain(); rvg.gain.value = 0.22; musicBus.connect(rv); sfxBus.connect(rv); rv.connect(rvg); rvg.connect(master);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); var nd = noiseBuf.getChannelData(0); for (i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }
  function env(g, at, a, peak, dec) { g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + a); g.gain.exponentialRampToValueAtTime(0.0001, at + a + dec); }
  function pluck(freq, at, vol, dec) {
    var o = AC.createOscillator(), o2 = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain();
    o.type = 'triangle'; o2.type = 'sawtooth'; o.frequency.value = freq; o2.frequency.value = freq * 1.003;
    var g2 = AC.createGain(); g2.gain.value = 0.25;
    f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 7, at); f.frequency.exponentialRampToValueAtTime(freq * 1.2, at + 0.25); f.Q.value = 2;
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(musicBus);
    env(g, at, 0.005, vol, dec || 0.4); o.start(at); o2.start(at); o.stop(at + (dec || 0.4) + 0.1); o2.stop(at + (dec || 0.4) + 0.1);
  }
  function bell(freq, at, vol) {
    [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(function (p) {
      var o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.value = freq * p[0];
      o.connect(g); g.connect(musicBus); env(g, at, 0.003, vol * p[1], 1.1 / p[0] + 0.3); o.start(at); o.stop(at + 1.6);
    });
  }
  function bass(freq, at, vol) {
    var o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.value = freq;
    o.connect(g); g.connect(musicBus); env(g, at, 0.01, vol, 0.5); o.start(at); o.stop(at + 0.7);
  }
  function shaker(at, vol) {
    var s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); s.buffer = noiseBuf;
    f.type = 'highpass'; f.frequency.value = 6500; s.connect(f); f.connect(g); g.connect(musicBus);
    env(g, at, 0.004, vol, 0.06); s.start(at, Math.random() * 0.5, 0.12);
  }
  function scheduleMusic(step, at) {
    var bar = Math.floor(step / 8), pos = step % 8, ch = CHORDS[bar % 4], ending = at - T0 > DUR - 3.4;
    var endStep = Math.floor((DUR - 2.2) / STEP);
    if (step > endStep) return;
    if (step === endStep) { // final chord + sparkle
      bass(mtof(36), at, 0.5); [60, 64, 67, 72, 76].forEach(function (m, i) { pluck(mtof(m), at + i * 0.03, 0.12, 1.8); });
      [84, 88, 91].forEach(function (m, i) { bell(mtof(m), at + 0.1 + i * 0.09, 0.08); }); return;
    }
    if (pos === 0 || pos === 4) bass(mtof(ch[0]), at, 0.42);
    var arp = [0, 2, 1, 3, 2, 1, 3, 2][pos];
    pluck(mtof(ch[1][arp]), at, pos % 2 ? 0.07 : 0.1, 0.35);
    if (pos % 2 === 1) shaker(at, 0.05);
    if (bar % 2 === 0 || ending) { var mi = (bar % 4 === 0 ? 0 : 8) + pos; var mn = MELODY[mi % 16]; if (mn && (bar % 4 === 0 || bar % 4 === 2 || ending)) bell(mtof(mn), at, 0.05); }
  }
  // SFX
  function sfxPop(at, pitch) {
    var o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(pitch || 900, at); o.frequency.exponentialRampToValueAtTime((pitch || 900) * 0.45, at + 0.09);
    o.connect(g); g.connect(sfxBus); env(g, at, 0.004, 0.35, 0.1); o.start(at); o.stop(at + 0.2);
  }
  function sfxSwoosh(at, dur) {
    var s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); s.buffer = noiseBuf; s.loop = true;
    f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(400, at); f.frequency.exponentialRampToValueAtTime(3000, at + dur * 0.6); f.frequency.exponentialRampToValueAtTime(900, at + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.35, at + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.start(at); s.stop(at + dur + 0.05);
  }
  function sfxStamp(at) {
    var o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(140, at); o.frequency.exponentialRampToValueAtTime(45, at + 0.18);
    o.connect(g); g.connect(sfxBus); env(g, at, 0.003, 0.9, 0.22); o.start(at); o.stop(at + 0.3);
    var s = AC.createBufferSource(), f = AC.createBiquadFilter(), g2 = AC.createGain(); s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = 1800;
    s.connect(f); f.connect(g2); g2.connect(sfxBus); env(g2, at, 0.002, 0.5, 0.08); s.start(at, 0.1, 0.12);
  }
  function sfxScribble(at, dur) {
    var s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), lfo = AC.createOscillator(), lg = AC.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 3;
    lfo.frequency.value = 11; lg.gain.value = 0.06; lfo.connect(lg); lg.connect(g.gain);
    s.connect(f); f.connect(g); g.connect(sfxBus); g.gain.setValueAtTime(0.07, at); g.gain.setValueAtTime(0.0001, at + dur);
    s.start(at); s.stop(at + dur); lfo.start(at); lfo.stop(at + dur);
  }
  function sfxChime(at) { [88, 91, 96].forEach(function (m, i) { bell(mtof(m), at + i * 0.07, 0.07); }); }
  var CUES = [];
  function buildCues() {
    var c = [];
    function add(t, fn, arg, arg2) { c.push({ t: t, fn: fn, a: arg, b: arg2 }); }
    add(0.15, 'pop', 700); add(0.3, 'pop', 520); add(0.9, 'pop', 1100); add(1.1, 'pop', 1250); add(1.3, 'swoosh', 0.45);
    add(WT('hook', 'registered') - 0.1, 'chime');
    add(WT('what', 'nursing') - 0.15, 'swoosh', 0.4); add(WT('what', 'pays') - 0.1, 'pop', 800); add(WT('what', 'tuition'), 'stamp');
    add(WT('what', 'become'), 'chime'); add(WT('what', 'keep') - 0.1, 'pop', 950);
    add(SC.tracks[0] + 0.05, 'swoosh', 0.35); add(WT('tracks', 'behavioral') - 0.1, 'pop', 660); add(WT('tracks', 'med') - 0.1, 'pop', 880);
    add(SC.tracks[1] - 0.3, 'swoosh', 0.7);
    add(SC.quals[0] + 0.05, 'pop', 600); add(SC.quals[0] + 0.2, 'scribble', 0.5);
    ['p.c.a', 'p.c.t', 'b.h.a', 'p.s.h.t'].forEach(function (w, i) { add(WT('titles', w) - 0.05, 'pop', 700 + i * 120); });
    add(WT('tenure', 'one') - 0.1, 'pop', 620); add(WT('tenure', 'thirty'), 'scribble', 0.25); add(WT('tenure', 'program'), 'scribble', 0.3);
    add(SC.prereq[0] + 0.05, 'swoosh', 0.35);
    for (var i = 0; i < 5; i++) add(WT('prereq', 'mostly') + i * 0.12, 'pop', 1000 + i * 90);
    add(WT('prereq', 'five') + 0.2, 'scribble', 0.5); add(WT('prereq', 'then') - 0.1, 'pop', 600); add(WT('prereq', 'pays'), 'stamp');
    add(SC.commit[0] + 0.1, 'pop', 520); add(WT('commit', 'three') - 0.1, 'pop', 900); add(WT('commit', 'r.n'), 'chime');
    add(SC.commit[1] - 0.3, 'swoosh', 0.7);
    add(WT('step1', 'one') - 0.1, 'pop', 700); add(WT('step1', 'application') - 0.25, 'chime');
    add(WT('step2', 'two') - 0.1, 'pop', 820); add(WT('step2', 'letter') - 0.15, 'pop', 1000);
    add(WT('step3', 'three') - 0.1, 'pop', 940); add(WT('step3', 'thirty'), 'scribble', 0.5); add(L('step3').end - 0.35, 'stamp');
    add(SC.steps[1] - 0.3, 'swoosh', 0.7); add(SC.end[0] + 0.15, 'pop', 600); add(SC.end[0] + 2.55, 'chime');
    c.sort(function (a, b) { return a.t - b.t; });
    CUES = c;
  }
  function playCue(c, at) {
    if (c.fn === 'pop') sfxPop(at, c.a); else if (c.fn === 'swoosh') sfxSwoosh(at, c.a); else if (c.fn === 'stamp') sfxStamp(at);
    else if (c.fn === 'scribble') sfxScribble(at, c.a); else if (c.fn === 'chime') sfxChime(at);
  }
  var cueIdx = 0;
  function scheduler() {
    var now = AC.currentTime, ahead = now + 0.25;
    while (T0 + nextStep * STEP < ahead) { var at = T0 + nextStep * STEP; if (at >= now - 0.01) scheduleMusic(nextStep, Math.max(at, now)); nextStep++; }
    while (cueIdx < CUES.length && T0 + CUES[cueIdx].t < ahead) { var ct = T0 + CUES[cueIdx].t; if (ct >= now - 0.02) playCue(CUES[cueIdx], Math.max(ct, now)); cueIdx++; }
  }
  function audioStart(offset) {
    audioInit();
    if (AC.state === 'suspended') AC.resume();
    audioStop();
    var start = AC.currentTime + 0.08;
    T0 = start - offset;
    if (voiceBuf && offset < voiceBuf.duration) { voiceSrc = AC.createBufferSource(); voiceSrc.buffer = voiceBuf; voiceSrc.connect(voiceBus); voiceSrc.start(start, offset); }
    // music level: gentle intro swell, sits low under narration, swells for the end card
    var mg = musicBus.gain; mg.cancelScheduledValues(0);
    var narrEnd = NARR ? L('end').end : DUR - END_HOLD;
    function mv(t) { return t < 0.4 ? 0.0001 : t < narrEnd + 0.2 ? 0.34 : 0.62; }
    mg.setValueAtTime(Math.max(0.0001, mv(offset) * (offset < 0.4 ? 0 : 1)), start);
    if (offset < 1.2) mg.linearRampToValueAtTime(0.34, T0 + 1.2);
    if (offset < narrEnd + 0.2) { mg.setValueAtTime(0.34, T0 + narrEnd); mg.linearRampToValueAtTime(0.62, T0 + narrEnd + 0.8); }
    mg.setValueAtTime(0.62, T0 + DUR - 0.8); mg.linearRampToValueAtTime(0.0001, T0 + DUR + 0.6);
    nextStep = Math.max(0, Math.ceil(offset / STEP));
    cueIdx = 0; while (cueIdx < CUES.length && CUES[cueIdx].t < offset) cueIdx++;
    schedTimer = setInterval(scheduler, 40); scheduler();
  }
  function audioStop() {
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
    if (voiceSrc) { try { voiceSrc.stop(); } catch (e) { } voiceSrc = null; }
    if (musicBus) { musicBus.gain.cancelScheduledValues(0); musicBus.gain.setValueAtTime(0.0001, AC.currentTime); }
  }
  function setMuted(m) { if (master) master.gain.setValueAtTime(m ? 0 : 0.9, AC.currentTime); }

  // ---------------------------------------------------------------------------
  // Player UI
  // ---------------------------------------------------------------------------
  var canvas, SCALE = 1, playing = false, pausedAt = 0, muted = false, freezeT = null, ui = {}, visible = true, rafId = 0, started = false, ended = false;
  function now() { return playing ? AC.currentTime - T0 : pausedAt; }
  function injectStyles() {
    if (document.getElementById('clx-style')) return;
    var css = '' +
      '.clx{position:relative;width:100%;max-width:960px;margin:0 auto 22px;border-radius:14px;overflow:hidden;background:#E8DCC4;box-shadow:0 10px 30px rgba(22,41,92,.22);aspect-ratio:16/9;font-family:Inter,system-ui,sans-serif;-webkit-tap-highlight-color:transparent}' +
      '.clx canvas{display:block;width:100%;height:100%}' +
      '.clx-big{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(22,41,92,.18);border:0;cursor:pointer;padding:0;width:100%}' +
      '.clx-big span{display:flex;align-items:center;gap:12px;background:#EF6F5E;color:#fff;font:700 clamp(15px,3.4vw,22px)/1 Inter,system-ui,sans-serif;padding:clamp(12px,2.4vw,18px) clamp(18px,3.6vw,28px);border-radius:999px;box-shadow:0 6px 0 #C4503F,0 10px 24px rgba(0,0,0,.25);transform:rotate(-2deg);transition:transform .15s}' +
      '.clx-big:hover span,.clx-big:focus-visible span{transform:rotate(-2deg) scale(1.06)}' +
      '.clx-big svg{width:1.1em;height:1.1em}' +
      '.clx-bar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:6px;padding:6px 8px;background:linear-gradient(transparent,rgba(12,20,45,.72));opacity:0;transition:opacity .25s}' +
      '.clx:hover .clx-bar,.clx.clx-paused .clx-bar,.clx:focus-within .clx-bar{opacity:1}.clx.clx-new .clx-bar{opacity:0!important;pointer-events:none}' +
      '.clx-btn{background:none;border:0;color:#fff;cursor:pointer;width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0;flex:none}' +
      '.clx-btn:hover,.clx-btn:focus-visible{background:rgba(255,255,255,.18);outline:none}' +
      '.clx-btn svg{width:20px;height:20px;fill:#fff}' +
      '.clx-btn.clx-cc{font:800 13px Inter,system-ui,sans-serif;border:2px solid rgba(255,255,255,.9);width:34px;height:24px;border-radius:5px}' +
      '.clx-btn.clx-cc.off{opacity:.5}' +
      '.clx-track{flex:1;height:20px;display:flex;align-items:center;cursor:pointer;touch-action:none}' +
      '.clx-rail{position:relative;flex:1;height:5px;background:rgba(255,255,255,.35);border-radius:3px}' +
      '.clx-fill{position:absolute;left:0;top:0;bottom:0;background:#F2B544;border-radius:3px}' +
      '.clx-time{color:#fff;font:600 12px Inter,system-ui,sans-serif;min-width:72px;text-align:center;flex:none}' +
      '.clx-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +
      '.clx-load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#16295C;font:600 15px Inter,system-ui,sans-serif}';
    var st = document.createElement('style'); st.id = 'clx-style'; st.textContent = css; document.head.appendChild(st);
    if (!document.querySelector('link[data-clx-fonts]')) {
      var lk = document.createElement('link'); lk.rel = 'stylesheet'; lk.setAttribute('data-clx-fonts', '1');
      lk.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Caveat+Brush&family=Patrick+Hand&family=Permanent+Marker&display=swap';
      document.head.appendChild(lk);
    }
  }
  var ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    replay: '<svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z"/></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8v8a4.5 4.5 0 002.5-4zM14 3.2v2.1a7 7 0 010 13.4v2.1a9 9 0 000-17.6z"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0014 8v2.2l2.5 2.5V12zM19 12c0 .9-.2 1.8-.5 2.6l1.5 1.5A8.8 8.8 0 0021 12a9 9 0 00-7-8.8v2.1a7 7 0 015 6.7zM4.3 3L3 4.3 7.7 9H3v6h4l5 5v-6.7l4.3 4.3c-.7.5-1.4.9-2.3 1.2v2.1a9 9 0 003.7-1.8l2 2 1.3-1.3L4.3 3zM12 4L9.9 6.1 12 8.2V4z"/></svg>'
  };
  function fmt(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function build(mount) {
    injectStyles();
    var box = document.createElement('div'); box.className = 'clx clx-paused clx-new';
    box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Animated video: what the Nursing Career Ladder is, who qualifies, and next steps');
    canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
    box.appendChild(canvas);
    var big = document.createElement('button'); big.className = 'clx-big'; big.type = 'button';
    big.innerHTML = '<span>' + ICON.play.replace('<svg', '<svg fill="#fff"') + ' Watch the 1-minute intro</span>';
    box.appendChild(big);
    var bar = document.createElement('div'); bar.className = 'clx-bar';
    bar.innerHTML = '<button type="button" class="clx-btn clx-pp" aria-label="Play">' + ICON.play + '</button>' +
      '<div class="clx-track" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="60" aria-valuenow="0"><div class="clx-rail"><div class="clx-fill"></div></div></div>' +
      '<span class="clx-time">0:00 / 1:00</span>' +
      '<button type="button" class="clx-btn clx-cc" aria-pressed="true" aria-label="Captions">CC</button>' +
      '<button type="button" class="clx-btn clx-mute" aria-label="Mute">' + ICON.vol + '</button>';
    box.appendChild(bar);
    var sr = document.createElement('div'); sr.className = 'clx-sr'; box.appendChild(sr);
    var load = document.createElement('div'); load.className = 'clx-load'; load.textContent = 'Loading...'; box.appendChild(load);
    mount.innerHTML = ''; mount.appendChild(box);
    ui = { box: box, big: big, bar: bar, pp: bar.querySelector('.clx-pp'), track: bar.querySelector('.clx-track'), fill: bar.querySelector('.clx-fill'), time: bar.querySelector('.clx-time'), cc: bar.querySelector('.clx-cc'), mute: bar.querySelector('.clx-mute'), sr: sr, load: load };
    big.addEventListener('click', function () { if (ended) seekTo(0); play(); });
    ui.pp.addEventListener('click', function () { if (ended) { seekTo(0); play(); } else if (playing) pause(); else play(); });
    ui.cc.addEventListener('click', function () { showCaptions = !showCaptions; ui.cc.classList.toggle('off', !showCaptions); ui.cc.setAttribute('aria-pressed', String(showCaptions)); if (!playing) draw(); });
    ui.mute.addEventListener('click', function () { muted = !muted; setMuted(muted); ui.mute.innerHTML = muted ? ICON.mute : ICON.vol; ui.mute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute'); });
    canvas.addEventListener('click', function () { if (!started) return; if (playing) pause(); else { if (ended) seekTo(0); play(); } });
    function seekFromEvent(e) { var r = ui.track.getBoundingClientRect(); var x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left; seekTo(clamp(x / r.width, 0, 1) * DUR); }
    var dragging = false;
    ui.track.addEventListener('pointerdown', function (e) { dragging = true; ui.track.setPointerCapture(e.pointerId); seekFromEvent(e); });
    ui.track.addEventListener('pointermove', function (e) { if (dragging) seekFromEvent(e); });
    ui.track.addEventListener('pointerup', function () { dragging = false; });
    ui.track.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') seekTo(Math.min(DUR, now() + 5)); if (e.key === 'ArrowLeft') seekTo(Math.max(0, now() - 5)); });
    box.addEventListener('keydown', function (e) { if (e.key === ' ' && e.target === box) { e.preventDefault(); ui.pp.click(); } });
    resize();
    window.addEventListener('resize', resize);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) loop(); else if (playing && !freezeT) pause(); }, { threshold: 0.15 }).observe(box);
    document.addEventListener('visibilitychange', function () { if (document.hidden && playing) pause(); });
  }
  function resize() {
    var r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = Math.max(320, Math.round(r.width * dpr)); var ch = Math.round(cw * 9 / 16);
    if (canvas.width !== cw) { canvas.width = cw; canvas.height = ch; }
    SCALE = cw / W;
    // keep captions at least ~13 CSS px tall on small screens
    CAPSIZE = Math.round(clamp(13 / (r.width / W), 30, 50));
    if (!playing) draw();
  }
  function draw() { if (!NARR || !ctx) return; var t = freezeT != null ? freezeT : (started ? now() : 10.7); POSTER = !started; render(Math.min(t, DUR)); updateBar(started ? t : 0); }
  function updateBar(t) {
    if (!ui.fill) return; ui.fill.style.width = (clamp(t / DUR, 0, 1) * 100) + '%';
    ui.time.textContent = fmt(started ? t : 0) + ' / ' + fmt(DUR);
    ui.track.setAttribute('aria-valuenow', String(Math.round(t)));
  }
  function loop() {
    cancelAnimationFrame(rafId);
    function f() {
      if (!visible && !playing) return;
      var t = now();
      if (playing && t >= DUR) { finish(); return; }
      try { draw(); } catch (err) { if (window.console) console.warn('clx frame error', err); }
      // captions for screen readers
      if (playing && NARR) { for (var i = 0; i < NARR.lines.length; i++) { var ln = NARR.lines[i]; if (t >= ln.start && t <= ln.end && ui.sr.textContent !== ln.caption) { ui.sr.textContent = ln.caption; } } }
      if (playing || !REDUCED) rafId = requestAnimationFrame(f);
    }
    rafId = requestAnimationFrame(f);
  }
  function play() {
    if (!NARR) return;
    started = true; ended = false; playing = true; ui.box.classList.remove('clx-new');
    audioStart(pausedAt); setMuted(muted);
    ui.box.classList.remove('clx-paused'); ui.big.style.display = 'none';
    ui.pp.innerHTML = ICON.pause; ui.pp.setAttribute('aria-label', 'Pause');
    loop();
  }
  function pause() {
    if (!playing) return;
    pausedAt = now(); playing = false; audioStop();
    ui.box.classList.add('clx-paused'); ui.pp.innerHTML = ICON.play; ui.pp.setAttribute('aria-label', 'Play');
    draw();
  }
  function finish() {
    playing = false; ended = true; pausedAt = DUR; audioStop();
    ui.box.classList.add('clx-paused'); ui.pp.innerHTML = ICON.replay; ui.pp.setAttribute('aria-label', 'Replay');
    ui.big.style.display = ''; ui.big.querySelector('span').innerHTML = ICON.replay.replace('<svg', '<svg fill="#fff"') + ' Watch again';
    render(DUR - 0.05); updateBar(DUR);
  }
  function seekTo(t) {
    started = true; ended = false;
    pausedAt = clamp(t, 0, DUR - 0.05);
    if (playing) { audioStart(pausedAt); setMuted(muted); } else { draw(); if (ui.big.style.display !== 'none' && t > 0) { ui.big.style.display = 'none'; } }
    if (!playing) { ui.pp.innerHTML = ICON.play; ui.pp.setAttribute('aria-label', 'Play'); }
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function fontsChanged() { WCACHE = {}; if (NARR) NARR.lines.forEach(function (l) { delete l._lay; }); if (!playing) draw(); }
  function loadFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', fontsChanged);
    var fams = ['40px "Caveat Brush"', '700 40px "Caveat"', '40px "Permanent Marker"', '40px "Patrick Hand"'];
    var link = document.querySelector('link[data-clx-fonts]') || document.querySelector('link[href*="Caveat"]');
    var sheet = new Promise(function (res) {
      if (!link) return res();
      try { if (link.sheet && link.sheet.cssRules && link.sheet.cssRules.length) return res(); } catch (e) { return res(); }
      link.addEventListener('load', res); link.addEventListener('error', res); setTimeout(res, 2500);
    });
    var faces = sheet.then(function () { return Promise.all(fams.map(function (f) { return document.fonts.load(f, 'AaBb12'); })); })
      .then(function () { return document.fonts.ready; });
    return Promise.race([faces, new Promise(function (r) { setTimeout(r, 4500); })]).then(fontsChanged);
  }
  function boot() {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) return;
    var q = /[?&]clt=([\d.]+)/.exec(location.search); if (q) freezeT = parseFloat(q[1]);
    build(mount);
    ctx = canvas.getContext('2d');
    buildTextures(); PAT = ctx.createPattern(TEX.fibre, 'repeat');
    var jsonP = fetch(BASE + 'narration.json').then(function (r) { return r.json(); });
    var audP = fetch(BASE + 'narration.mp3').then(function (r) { return r.arrayBuffer(); });
    Promise.all([jsonP, loadFonts()]).then(function (res) {
      NARR = res[0]; NARR.lines.forEach(function (l) { LINES[l.id] = l; });
      DUR = L('end').end + END_HOLD;
      computeScenes(); buildCues();
      ui.load.style.display = 'none';
      WCACHE = {};
      if (freezeT != null) { started = true; ui.big.style.display = 'none'; ui.bar.style.opacity = 0; }
      draw(); loop();
      var tr = document.createElement('div'); tr.className = 'clx-sr'; tr.textContent = 'Transcript: ' + NARR.lines.map(function (l) { return l.caption; }).join(' ');
      ui.box.appendChild(tr);
    }).catch(function () { ui.load.textContent = 'The video could not load. Everything it covers is on this page below.'; });
    // decode narration lazily on first play (needs an AudioContext; create it on the user gesture)
    var decoded = null;
    var origPlay = play;
    play = function () {
      audioInit();
      if (voiceBuf) return origPlay();
      if (!decoded) decoded = audP.then(function (ab) { return new Promise(function (res, rej) { AC.decodeAudioData(ab, res, rej); }); }).then(function (b) { voiceBuf = b; });
      if (AC.state === 'suspended') AC.resume();
      ui.big.querySelector('span').textContent = 'Loading...';
      decoded.then(function () { origPlay(); }, function () { origPlay(); });
    };
  }
  window.__clxDebug = function () { return { ac: AC && AC.state, voice: !!voiceBuf, t: now(), playing: playing, dur: DUR }; };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
