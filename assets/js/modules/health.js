import { api } from '../api.js';

// ── static reference (exercise sets, session steps, dial template) ────────────
const DASH = '–', DOT = '·', MDASH = '—';
const WORKOUTS = {
  A: { name: 'Workout A', sub: 'Horizontal / Compound', items: [['Legs', 'Leg Press (heavy compound)'], ['Push', 'Flat Machine Press (mid-pec)'], ['Pull', 'Lat Pulldown (vertical pull)'], ['Core', 'Plank (isometric hold)']] },
  B: { name: 'Workout B', sub: 'Vertical / Isolation', items: [['Legs', 'Leg Ext / Curl'], ['Push', 'Incline Machine Press'], ['Pull', 'Cable Row'], ['Core', 'Cable Crunch']] },
};
const SESSION = [['Prep', '5 min', 'Treadmill walk + arm circles', '20'], ['Main Engine', '45 min', 'Machine-controlled lifting', '62'], ['Core & Cardio', '25 min', 'Planks + 20 min steady cardio', '88'], ['Mobility', '5 min', 'Static stretches', '100']];
const TYPE_COL = { sleep: '--steel', fuel: '--cyan', train: '--orange', family: '--family', work: '--work' };
const BLOCKS = [
  { s: 0, e: 630, name: 'Sleep Core', type: 'sleep' },
  { s: 630, e: 690, name: 'Morning Prep', type: 'fuel' },
  { s: 690, e: 780, name: 'Gym Window', type: 'train' },
  { s: 780, e: 870, name: 'Recovery Lunch', type: 'fuel' },
  { s: 870, e: 1110, name: 'Family Focus', type: 'family' },
  { s: 1110, e: 1260, name: 'Dinner + Wind-down', type: 'family' },
  { s: 1260, e: 1440, name: 'Night-Shift Block', type: 'work' },
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SVGNS = 'http://www.w3.org/2000/svg';
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmt = (m) => { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };

// ── module state ──────────────────────────────────────────────────────────────
let cfg, day, ctxRef, root, tickTimer = null;

export async function renderHealth(view, ctx) {
  ctxRef = ctx; root = view;
  cfg = normalizeHealthCfg(ctx.settings?.health);
  view.innerHTML = `<h1 class="view-title">Health</h1><div class="accent-rule"></div><div class="loading">Loading&hellip;</div>`;
  try { day = await api.getHealth(ymd()); }
  catch (e) { view.querySelector('.loading').outerHTML = `<div class="placeholder"><h3>Couldn't load</h3><p>${e.message}</p></div>`; return; }
  build();
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(tick, 15000);
  window.addEventListener('daybook:theme', onTheme, { once: true });
}
function onTheme() { if (root && root.querySelector('#dial')) { buildDial(); tick(); renderVitals(); } }

function normalizeHealthCfg(h) {
  h = h || {};
  return {
    workout: h.workout || { '1': 'A', '3': 'B', '5': 'A', '6': 'B' },
    mealTimes: h.mealTimes || { m1: '10:30', m2: '13:30', m3: '18:30', m4: '23:30' },
    mealNames: h.mealNames || { m1: 'Brain / Muscle Prep', m2: 'LDL Scrubber', m3: 'Protein Synthesis', m4: 'Shift Fuel' },
    hydrationTumblers: h.hydrationTumblers || 2,
    metrics: (h.metrics && h.metrics.length) ? h.metrics : ['weight', 'ldl'],
  };
}
const mealKeys = () => Object.keys(cfg.mealTimes);
const expectedTotal = () => mealKeys().length + cfg.hydrationTumblers * 4 + 1;   // meals + cups + session
const doneCount = (checkins = day.checkins) => Object.values(checkins).filter(Boolean).length;

// ── build view ────────────────────────────────────────────────────────────────
function build() {
  const dow = new Date().getDay();
  const wk = cfg.workout[String(dow)];
  root.innerHTML = `
    <h1 class="view-title">Health</h1><div class="accent-rule"></div>

    <div class="sec-eyebrow"><span class="num">01</span><h2>Status</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span>
      <div class="panel-hd"><h2>24-Hour Dial</h2><span class="fig">FIG. 2 ${DOT} DIAL</span></div>
      <div class="dialwrap">
        <svg id="dial" viewBox="0 0 300 300" role="img" aria-label="24-hour dial"></svg>
        <div>
          <div class="now-block">
            <div class="status-line">Now ${DOT} <span id="now-window">--:--</span></div>
            <div class="now-name" id="now-name">&mdash;</div>
            <div class="next-row"><span>Next: <b id="next-name">&mdash;</b></span><span id="next-in">in &mdash;</span></div>
          </div>
          <div class="compliance" id="compliance"></div>
        </div>
      </div>
    </div>

    <div class="sec-eyebrow"><span class="num">02</span><h2>Today's Orders</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span>
      <div class="panel-hd"><h2 id="orders-title">Session</h2><span class="fig">REF: FLOW</span></div>
      <div id="orders-body"></div>
      <button class="btn" style="width:100%;justify-content:center;margin-top:12px" id="sessBtn" type="button" aria-pressed="false">Mark Session Complete</button>
    </div>

    <div class="sec-eyebrow"><span class="num">03</span><h2>Momentum</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span>
      <div class="panel-hd"><h2>Streak &amp; History</h2><span class="fig">REF: ADHERENCE</span></div>
      <div id="momentum"></div>
    </div>

    <div class="sec-eyebrow"><span class="num">04</span><h2>Fuel</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span>
      <div class="panel-hd"><h2>Meals</h2><span class="fig">FIG. 4 ${DOT} MATRIX</span></div>
      <div class="checks" id="meals"></div>
    </div>

    <div class="sec-eyebrow"><span class="num">05</span><h2>Coolant</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span>
      <div class="panel-hd"><h2>Hydration</h2><span class="fig">REF: 2L ${DOT} ${cfg.hydrationTumblers}&times;</span></div>
      <div class="hyd" id="hyd"></div>
    </div>

    <div class="sec-eyebrow"><span class="num">06</span><h2>Vital Signs</h2><span class="line"></span></div>
    <div class="panel"><span class="bk"></span>
      <div class="panel-hd"><h2>Telemetry</h2><span class="fig">REF: METRICS</span></div>
      <div class="vitals" id="vitals"></div>
    </div>`;

  buildDial(); buildOrders(wk); buildMeals(); buildHyd();
  renderCompliance(); renderMomentum(); renderVitals();
  const sb = root.querySelector('#sessBtn');
  sb.setAttribute('aria-pressed', day.checkins['session'] ? 'true' : 'false');
  sb.addEventListener('click', () => toggleCheckin('session', sb));
  tick();
}

// ── dial ──────────────────────────────────────────────────────────────────────
function polar(cx, cy, r, a) { const t = (a - 90) * Math.PI / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; }
function arc(cx, cy, r, a0, a1) { const p0 = polar(cx, cy, r, a1), p1 = polar(cx, cy, r, a0), lg = (a1 - a0) <= 180 ? 0 : 1; return `M ${p0[0]} ${p0[1]} A ${r} ${r} 0 ${lg} 0 ${p1[0]} ${p1[1]}`; }
function buildDial() {
  const dial = root.querySelector('#dial'); if (!dial) return; dial.innerHTML = '';
  const cx = 150, cy = 150, R = 118, css = getComputedStyle(document.documentElement);
  const el = (t, a) => { const e = document.createElementNS(SVGNS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  dial.appendChild(el('circle', { cx, cy, r: R, fill: 'none', stroke: css.getPropertyValue('--panel-2'), 'stroke-width': 26 }));
  BLOCKS.forEach(b => { const a0 = b.s / 1440 * 360, a1 = b.e / 1440 * 360; if (a1 - a0 < .5) return;
    dial.appendChild(el('path', { d: arc(cx, cy, R, a0, a1), fill: 'none', stroke: (css.getPropertyValue(TYPE_COL[b.type]) || '#888').trim(), 'stroke-width': 26, opacity: .9 })); });
  for (let h = 0; h < 24; h++) { const o = polar(cx, cy, R + 15, h / 24 * 360), i = polar(cx, cy, R + (h % 6 === 0 ? 7 : 11), h / 24 * 360);
    dial.appendChild(el('line', { x1: i[0], y1: i[1], x2: o[0], y2: o[1], stroke: css.getPropertyValue('--ink-faint'), 'stroke-width': h % 6 === 0 ? 2 : 1 }));
    if (h % 6 === 0) { const lp = polar(cx, cy, R - 25, h / 24 * 360); const t = el('text', { x: lp[0], y: lp[1] + 4, 'text-anchor': 'middle', fill: css.getPropertyValue('--ink-soft'), 'font-size': 12, 'font-family': 'ui-monospace,Menlo,monospace' }); t.textContent = pad(h); dial.appendChild(t); } }
  dial.appendChild(el('circle', { cx, cy, r: 44, fill: css.getPropertyValue('--panel'), stroke: css.getPropertyValue('--edge'), 'stroke-width': 1.5 }));
  const t1 = el('text', { id: 'dialTime', x: cx, y: cy - 2, 'text-anchor': 'middle', fill: css.getPropertyValue('--ink'), 'font-size': 21, 'font-weight': 800, 'font-family': 'ui-monospace,Menlo,monospace' }); dial.appendChild(t1);
  const t2 = el('text', { id: 'dialDay', x: cx, y: cy + 15, 'text-anchor': 'middle', fill: css.getPropertyValue('--ink-faint'), 'font-size': 10, 'letter-spacing': 1.5, 'font-family': 'ui-monospace,Menlo,monospace' }); dial.appendChild(t2);
  dial.appendChild(el('line', { id: 'nowHand', x1: cx, y1: cy, stroke: css.getPropertyValue('--orange'), 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
  dial.appendChild(el('circle', { id: 'nowDot', r: 5, fill: css.getPropertyValue('--orange') }));
}
function tick() {
  if (!root || !root.querySelector('#dial')) return;
  const d = new Date(), m = d.getHours() * 60 + d.getMinutes();
  let idx = 0; for (let i = 0; i < BLOCKS.length; i++) if (m >= BLOCKS[i].s && m < BLOCKS[i].e) { idx = i; break; }
  const b = BLOCKS[idx], nb = BLOCKS[(idx + 1) % BLOCKS.length];
  const set = (id, v) => { const e = root.querySelector('#' + id); if (e) e.textContent = v; };
  set('now-window', fmt(b.s) + ' ' + DASH + ' ' + fmt(b.e === 1440 ? 0 : b.e));
  const nn = root.querySelector('#now-name'); if (nn) { nn.textContent = b.name; nn.style.color = (b.type === 'work' || b.type === 'sleep') ? 'var(--ink)' : `var(${TYPE_COL[b.type]})`; }
  set('next-name', nb.name);
  let mins = b.e - m; if (mins < 0) mins += 1440;
  set('next-in', 'in ' + (mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + 'm'));
  const ang = m / 1440 * 360, p = polar(150, 150, 104, ang);
  const hand = root.querySelector('#nowHand'), dot = root.querySelector('#nowDot');
  if (hand) { hand.setAttribute('x2', p[0]); hand.setAttribute('y2', p[1]); dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]); set('dialTime', pad(d.getHours()) + ':' + pad(d.getMinutes())); set('dialDay', DAYS[d.getDay()].toUpperCase()); }
}

// ── orders ────────────────────────────────────────────────────────────────────
function buildOrders(wk) {
  const body = root.querySelector('#orders-body'), title = root.querySelector('#orders-title');
  if (wk && WORKOUTS[wk]) {
    const w = WORKOUTS[wk];
    title.textContent = 'Training Session';
    body.innerHTML = `<div class="mode-banner" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <span class="chip orange">Training</span><b style="font-size:16px;text-transform:uppercase">${w.name}</b>
        <span class="muted">${w.sub}</span></div>
      <div class="exlist" style="grid-template-columns:1fr">
        ${SESSION.map(s => `<li><span class="k">${s[1]}</span><span><b style="text-transform:uppercase">${s[0]}</b> ${MDASH} ${s[2]}</span></li>`).join('')}</div>
      <ul class="exlist">${w.items.map(it => `<li><span class="k">${it[0]}</span><span>${it[1]}</span></li>`).join('')}</ul>`;
  } else {
    title.textContent = 'Active Recovery';
    body.innerHTML = `<div class="mode-banner" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
        <span class="chip family">Off-Day</span><b style="font-size:16px;text-transform:uppercase">Recovery</b></div>
      <ul class="exlist" style="grid-template-columns:1fr"><li><span class="k">Note</span><span>Repurpose the energy ${MDASH} active play or a light walk. Protect recovery; keep it easy.</span></li></ul>`;
  }
}

// ── meals ─────────────────────────────────────────────────────────────────────
function buildMeals() {
  const wrap = root.querySelector('#meals');
  wrap.innerHTML = mealKeys().map(k => {
    const key = 'meal:' + k, on = day.checkins[key] ? 'true' : 'false';
    return `<button class="ci" type="button" data-key="${key}" aria-pressed="${on}">
      <span class="box"><svg viewBox="0 0 20 20"><path d="M4 10.5 L8.5 15 L16 5.5"/></svg></span>
      <span class="main"><span class="time">${cfg.mealTimes[k] || ''}</span>
      <span class="fn">${cfg.mealNames[k] || k}</span></span></button>`;
  }).join('');
  wrap.querySelectorAll('.ci').forEach(b => b.addEventListener('click', () => toggleCheckin(b.dataset.key, b)));
}

// ── hydration ─────────────────────────────────────────────────────────────────
function buildHyd() {
  const wrap = root.querySelector('#hyd'); const names = ['Daytime / Family', 'Desk / Night-Shift', 'Extra', 'Extra'];
  let html = '';
  for (let t = 1; t <= cfg.hydrationTumblers; t++) {
    let n = 0; for (let i = 1; i <= 4; i++) if (day.checkins['hyd:' + t + '_' + i]) n++;
    html += `<div class="tumbler"><div class="hd"><span class="nm">${names[t - 1] || 'Tumbler ' + t}</span><span class="amt" id="hydamt${t}">${(n * .5).toFixed(1)} / 2.0 L</span></div>
      <div class="cups">${[1, 2, 3, 4].map(i => { const key = 'hyd:' + t + '_' + i; const on = day.checkins[key] ? 'true' : 'false'; return `<button class="cup" type="button" data-key="${key}" aria-pressed="${on}"><i></i><span>0.5L</span></button>`; }).join('')}</div></div>`;
  }
  wrap.innerHTML = html;
  wrap.querySelectorAll('.cup').forEach(b => b.addEventListener('click', () => toggleCheckin(b.dataset.key, b, updateHydAmts)));
}
function updateHydAmts() {
  for (let t = 1; t <= cfg.hydrationTumblers; t++) { let n = 0; for (let i = 1; i <= 4; i++) if (day.checkins['hyd:' + t + '_' + i]) n++; const e = root.querySelector('#hydamt' + t); if (e) e.textContent = (n * .5).toFixed(1) + ' / 2.0 L'; }
}

// ── compliance + momentum ─────────────────────────────────────────────────────
function renderCompliance() {
  const done = doneCount(), total = expectedTotal(), pct = Math.round(done / total * 100);
  const el = root.querySelector('#compliance');
  el.innerHTML = `<div class="comp-ring" style="--p:${pct}"><span>${pct}%</span></div>
    <div class="comp-txt">Today's compliance. <b>${done} of ${total}</b> logged. Hit <b>&ge;50%</b> to keep the streak.</div>`;
}
function historyMap() {
  const map = {}; (day.history || []).forEach(h => { map[h.date] = h.done; }); map[day.date] = doneCount(); return map;
}
function renderMomentum() {
  const total = expectedTotal(), map = historyMap();
  const counted = (k) => (map[k] != null) && (Math.round(map[k] / total * 100) >= 50);
  // current streak (today-in-progress grace)
  let dd = new Date(); if (!counted(ymd(dd))) dd.setDate(dd.getDate() - 1);
  let streak = 0; while (counted(ymd(dd))) { streak++; dd.setDate(dd.getDate() - 1); }
  // best streak
  const days = Object.keys(map).filter(counted).sort(); let best = 0, run = 0, prev = null;
  days.forEach(k => { const c = new Date(k + 'T00:00:00'); if (prev && Math.round((c - prev) / 86400000) === 1) run++; else run = 1; if (run > best) best = run; prev = c; });
  // 30d avg + heatmap
  let sum = 0, cnt = 0, cells = '';
  const bucket = (p) => p == null ? 0 : p >= 100 ? 4 : p >= 67 ? 3 : p >= 34 ? 2 : p > 0 ? 1 : 0;
  const start = new Date(); start.setDate(start.getDate() - 29);
  for (let i = 0; i < 30; i++) { const k = ymd(start); const raw = map[k]; const p = raw != null ? Math.round(raw / total * 100) : null; if (p != null) { sum += p; cnt++; } cells += `<div class="hm${bucket(p)}" title="${k}${p != null ? ' · ' + p + '%' : ''}"></div>`; start.setDate(start.getDate() + 1); }
  const todayPct = Math.round(doneCount() / total * 100);

  root.querySelector('#momentum').innerHTML = `
    <div class="stat-row">
      <div class="stat hot"><div class="v">${streak}<small> d</small></div><div class="k">Current Streak</div></div>
      <div class="stat"><div class="v">${best}<small> d</small></div><div class="k">Best Streak</div></div>
      <div class="stat"><div class="v">${cnt ? Math.round(sum / cnt) : 0}<small>%</small></div><div class="k">30-Day Avg</div></div>
      <div class="stat"><div class="v">${todayPct}<small>%</small></div><div class="k">Today</div></div>
    </div>
    <div class="heat">${cells}</div>`;
}

// ── vitals ────────────────────────────────────────────────────────────────────
function renderVitals() {
  const wrap = root.querySelector('#vitals'); const css = getComputedStyle(document.documentElement);
  const META = { weight: ['Bodyweight', 'kg', 'neutral', '--cyan'], ldl: ['LDL', 'mg/dL', 'lower', '--orange'] };
  wrap.innerHTML = cfg.metrics.map(m => {
    const meta = META[m] || [m.toUpperCase(), '', 'neutral', '--cyan'];
    return `<div class="spark-card"><div class="top"><span class="nm">${meta[0]}</span><span class="val" id="v-${m}">&mdash;<small> ${meta[1]}</small></span></div>
      <div class="subline"><span class="delta flat" id="d-${m}">&mdash;</span></div>
      <svg class="spark" id="sp-${m}" viewBox="0 0 240 58" preserveAspectRatio="none"></svg>
      <div class="metric-in"><input type="number" step="0.1" id="in-${m}" placeholder="${meta[1]}" aria-label="${meta[0]}"><button type="button" data-metric="${m}">Log</button></div></div>`;
  }).join('');
  cfg.metrics.forEach(m => {
    const meta = META[m] || [m, '', 'neutral', '--cyan'];
    const series = (day.series && day.series[m] || []).slice(-14);
    const valEl = root.querySelector('#v-' + m), dEl = root.querySelector('#d-' + m);
    if (series.length) {
      const latest = series[series.length - 1][1];
      valEl.innerHTML = (Number.isInteger(latest) ? latest : latest.toFixed(1)) + `<small> ${meta[1]}</small>`;
      if (series.length > 1) { const diff = latest - series[0][1]; const good = meta[2] === 'lower' ? diff < 0 : (meta[2] === 'higher' ? diff > 0 : null);
        dEl.textContent = (diff > 0 ? '+' : '') + (Number.isInteger(diff) ? diff : diff.toFixed(1)) + ' ' + meta[1] + ' · ' + series.length + 'd';
        dEl.className = 'delta ' + (Math.abs(diff) < 1e-6 ? 'flat' : good === null ? 'flat' : good ? 'down' : 'up'); }
      else { dEl.textContent = 'first entry'; dEl.className = 'delta flat'; }
      drawSpark('sp-' + m, series.map(s => s[1]), (css.getPropertyValue(meta[3]) || '#39f').trim(), css);
    } else { dEl.textContent = 'no data yet'; }
  });
  wrap.querySelectorAll('button[data-metric]').forEach(b => b.addEventListener('click', () => logMetric(b.dataset.metric)));
  wrap.querySelectorAll('input').forEach(inp => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const m = inp.id.slice(3); logMetric(m); } }));
}
function drawSpark(id, vals, color, css) {
  const svg = root.querySelector('#' + id); if (!svg) return; svg.innerHTML = '';
  const W = 240, H = 58, P = 6; if (!vals.length) return;
  const el = (t, a) => { const e = document.createElementNS(SVGNS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  if (vals.length === 1) { svg.appendChild(el('circle', { cx: W - P, cy: H / 2, r: 3.5, fill: color })); return; }
  let mn = Math.min(...vals), mx = Math.max(...vals); if (mx === mn) { mx += 1; mn -= 1; }
  const pts = vals.map((v, i) => [P + (W - 2 * P) * (i / (vals.length - 1)), P + (H - 2 * P) * (1 - (v - mn) / (mx - mn))]);
  let d = 'M ' + pts[0][0] + ' ' + pts[0][1]; for (let i = 1; i < pts.length; i++) d += ' L ' + pts[i][0] + ' ' + pts[i][1];
  svg.appendChild(el('path', { d: d + ` L ${pts[pts.length - 1][0]} ${H} L ${pts[0][0]} ${H} Z`, fill: color, opacity: .12 }));
  svg.appendChild(el('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  const e2 = pts[pts.length - 1]; svg.appendChild(el('circle', { cx: e2[0], cy: e2[1], r: 3.5, fill: color, stroke: css.getPropertyValue('--panel'), 'stroke-width': 1.5 }));
}

// ── mutations ─────────────────────────────────────────────────────────────────
async function toggleCheckin(key, btn, after) {
  const wasOn = !!day.checkins[key], next = !wasOn;
  day.checkins[key] = next; btn.setAttribute('aria-pressed', next ? 'true' : 'false');
  renderCompliance(); renderMomentum(); if (after) after();
  try { await api.setCheckin(key, next, day.date); }
  catch (e) { day.checkins[key] = wasOn; btn.setAttribute('aria-pressed', wasOn ? 'true' : 'false'); renderCompliance(); renderMomentum(); if (after) after(); ctxRef.toast(e.message, true); }
}
async function logMetric(m) {
  const inp = root.querySelector('#in-' + m); const v = parseFloat(inp.value); if (!Number.isFinite(v)) return;
  const val = m === 'ldl' ? Math.round(v) : Math.round(v * 10) / 10;
  try {
    await api.setMetric(m, val, day.date);
    day.metrics[m] = val; (day.series[m] ||= []); const arr = day.series[m];
    const last = arr[arr.length - 1]; if (last && last[0] === day.date) last[1] = val; else arr.push([day.date, val]);
    inp.value = ''; inp.blur(); renderVitals(); ctxRef.toast(`${m} logged`);
  } catch (e) { ctxRef.toast(e.message, true); }
}
