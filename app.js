/* Sharecurve — a stock-paired bonding-curve launchpad, running on an in-browser demo ledger.
   MIT licensed. See LICENSE. */
(function () {
'use strict';

// ---------- small helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const now = () => Date.now();
function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function randAddr(r) { let s = '0x'; for (let i = 0; i < 40; i++) s += '0123456789abcdef'[Math.floor(r() * 16)]; return s; }
const short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';

// ---------- protocol constants ----------
const TOTAL = 1e9;            // fixed supply of every coin
const CURVE = 8e8;            // sold on the curve before graduation
const VT0 = 1.073e9;          // virtual token reserve at launch
const SEED_USD = 6000;        // virtual quote reserve at launch, in dollars of the paired stock
const FEE = 0.01;             // protocol fee on every curve trade
const MAX_TAX = 0.02;         // creator tax ceiling
const START_USD = 10000;      // demo wallet starting balance

// ---------- reference data ----------
const COMPANIES = [
  { sym: 'META', name: 'Meta Platforms', px: 712.4, c: '#3b6cf5', apps: ['Instagram', 'Facebook', 'WhatsApp', 'Threads', 'Messenger'] },
  { sym: 'GOOGL', name: 'Alphabet', px: 238.1, c: '#e0493b', apps: ['YouTube', 'Gmail', 'Google Maps', 'Chrome', 'Waze'] },
  { sym: 'NFLX', name: 'Netflix', px: 1188.5, c: '#d3262e', apps: ['Netflix'] },
  { sym: 'AAPL', name: 'Apple', px: 251.8, c: '#8e97a3', apps: ['Apple Music', 'iCloud', 'Apple TV', 'FaceTime'] },
  { sym: 'MSFT', name: 'Microsoft', px: 509.3, c: '#1f9be0', apps: ['LinkedIn', 'Xbox', 'Teams', 'Outlook', 'GitHub'] },
  { sym: 'AMZN', name: 'Amazon', px: 226.7, c: '#f29a1f', apps: ['Prime Video', 'Twitch', 'Audible', 'Kindle', 'Alexa'] },
  { sym: 'SPOT', name: 'Spotify', px: 702.2, c: '#1db954', apps: ['Spotify'] },
  { sym: 'UBER', name: 'Uber', px: 96.3, c: '#5a6270', apps: ['Uber', 'Uber Eats'] },
  { sym: 'ABNB', name: 'Airbnb', px: 131.9, c: '#ff5a5f', apps: ['Airbnb'] },
  { sym: 'SNAP', name: 'Snap', px: 8.1, c: '#e8d31a', apps: ['Snapchat', 'Bitmoji'] },
  { sym: 'PINS', name: 'Pinterest', px: 35.6, c: '#c8232c', apps: ['Pinterest'] },
  { sym: 'RDDT', name: 'Reddit', px: 221.4, c: '#ff4500', apps: ['Reddit'] },
  { sym: 'DUOL', name: 'Duolingo', px: 318.7, c: '#58cc02', apps: ['Duolingo'] },
  { sym: 'RBLX', name: 'Roblox', px: 134.2, c: '#6b7bd6', apps: ['Roblox'] },
  { sym: 'DASH', name: 'DoorDash', px: 262.5, c: '#ff3008', apps: ['DoorDash', 'Wolt'] },
  { sym: 'SHOP', name: 'Shopify', px: 148.9, c: '#5e8e3e', apps: ['Shop'] },
];
const CO = Object.fromEntries(COMPANIES.map(c => [c.sym, c]));
const APPS = COMPANIES.flatMap(c => c.apps.map(a => ({ app: a, co: c.sym })));
const appCo = name => (APPS.find(x => x.app.toLowerCase() === String(name).toLowerCase()) || {}).co;

const CCY = { USD: { r: 1, s: '$' }, EUR: { r: 0.92, s: '€' }, GBP: { r: 0.79, s: '£' }, JPY: { r: 149.2, s: '¥' }, SHARES: { r: 0, s: '' } };

// ---------- state ----------
const KEY = 'sc.state.v2';
let S = null;          // ledger: coins, stock feed, treasury
let W = null;          // wallet: address, usd, bal {coinId: tokens}, kind
let ui = { slip: store('sc.slip') || 0.01, ccy: store('sc.ccy') || 'USD', watch: store('sc.watch') || [], boardTab: store('sc.tab') || 'hot', boardQ: '' };
if (!CCY[ui.ccy]) ui.ccy = 'USD';

function freshLedger() {
  const r = mulberry(20260930);
  const stocks = {};
  const t0 = now();
  COMPANIES.forEach(c => {
    const hist = []; let p = c.px * (0.94 + r() * 0.05);
    for (let i = 72; i >= 0; i--) { p *= 1 + (r() - 0.49) * 0.012; hist.push({ t: t0 - i * 3600e3, p }); }
    stocks[c.sym] = { px: p, open: hist[hist.length - 25].p, hist };
  });
  const L = { v: 2, stocks, coins: {}, treasury: { usd: 0, trades: 0, graduations: 0 }, seq: 0 };
  const seeds = [
    ['Grid Gremlin', 'GRID', 'Instagram', 'Every post is a grid square. Every square is a vote.', 1.8],
    ['Shorts Maxi', 'SHRTS', 'YouTube', 'Fifteen seconds of conviction, priced in GOOGL.', 2.6],
    ['Skip Intro', 'SKIP', 'Netflix', 'For people who press the button every single time.', 6.5],
    ['Blue Ticks', 'TICKS', 'WhatsApp', 'Read receipts, on chain.', 1.1],
    ['Daily Streak', 'OWL', 'Duolingo', 'Do not break the streak. Do not sell the owl.', 7.5],
    ['Wrapped', 'WRAP', 'Spotify', 'Your year in listening, as a coin.', 2.2],
    ['Surge Pricing', 'SURGE', 'Uber', 'Up only when it rains.', 0.9],
    ['Upvote', 'UPVT', 'Reddit', 'The front page, paired with RDDT.', 1.6],
    ['Obby', 'OBBY', 'Roblox', 'Obstacle course energy.', 0.7],
    ['Endorsed', 'ENDRS', 'LinkedIn', 'Thrilled to announce this coin.', 0.5],
    ['Superhost', 'HOST', 'Airbnb', 'Five stars or nothing.', 0.4],
    ['Streamer', 'CHAT', 'Twitch', 'Chat decides the chart.', 1.3],
    ['Pin Board', 'BOARD', 'Pinterest', 'Mood boards with a bid.', 0.3],
    ['Streak Fire', 'SNAPS', 'Snapchat', 'Keep the fire going.', 0.8],
    ['Thread Guy', 'THRD', 'Threads', 'Posting through it, priced in META.', 0.6],
    ['Dasher', 'DASH', 'DoorDash', 'Delivered in 30 minutes or less.', 0.35],
  ];
  seeds.forEach((s, i) => {
    const co = appCo(s[2]);
    const age = (8 + i * 11 + r() * 30) * 3600e3;
    const coin = makeCoin(L, { name: s[0], sym: s[1], app: s[2], co, desc: s[3], tax: [0, 50, 100, 150, 200][i % 5] / 1e4, creator: randAddr(r), created: t0 - age });
    // replay a history of trades onto the curve
    const n = 140 + Math.floor(r() * 120);
    const heat = s[4];
    for (let k = 0; k < n; k++) {
      const t = coin.created + (age * k) / n + r() * 60e3;
      const px = stockAt(L, co, t);
      const buyBias = 0.53 + heat * 0.018;
      if (r() < buyBias || !coin.sold) {
        const usd = 8 + Math.pow(r(), 2.4) * 95 * heat;
        tradeBuy(L, coin, usd / px, randAddr(r), t, true);
      } else {
        const holders = Object.keys(coin.holders);
        const who = holders[Math.floor(r() * holders.length)];
        const amt = coin.holders[who] * (0.2 + r() * 0.8);
        if (amt > 1) tradeSell(L, coin, amt, who, t, true);
      }
      if (coin.graduated) break;
    }
  });
  return L;
}

function stockAt(L, sym, t) {
  const h = L.stocks[sym].hist;
  if (t >= h[h.length - 1].t) return L.stocks[sym].px;
  for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= t) return h[i].p;
  return h[0].p;
}

function makeCoin(L, o) {
  const id = (o.sym.toLowerCase().replace(/[^a-z0-9]/g, '') || 'coin') + '-' + (++L.seq).toString(36);
  const px = stockAt(L, o.co, o.created || now());
  const vq0 = SEED_USD / px; // virtual reserve, in shares of the paired stock
  const coin = {
    id, name: o.name, sym: o.sym.toUpperCase(), app: o.app, co: o.co, desc: o.desc || '', img: o.img || null,
    tax: clamp(o.tax || 0, 0, MAX_TAX), creator: o.creator, created: o.created || now(),
    vq0, vq: vq0, vt: VT0, sold: 0, raised: 0, graduated: false, gradAt: null, pxLaunchUsd: vq0 / VT0 * px,
    stockLaunch: px, holders: {}, trades: [], creatorEarned: 0,
  };
  L.coins[id] = coin;
  return coin;
}

// ---------- curve math (constant product on virtual reserves) ----------
const k = c => c.vq0 * VT0;
const priceShares = c => c.vq / c.vt;
const priceUsd = (c, L = S) => priceShares(c) * L.stocks[c.co].px;
const progress = c => clamp(c.sold / CURVE, 0, 1);
const mcapUsd = c => priceUsd(c) * TOTAL;

function quoteBuy(c, sharesIn) {
  if (c.graduated) return quotePool(c, sharesIn, true);
  const fee = sharesIn * FEE, tax = sharesIn * c.tax;
  let net = sharesIn - fee - tax;
  let out = c.vt - k(c) / (c.vq + net);
  const left = CURVE - c.sold;
  if (out > left) { // clip at the graduation line and refund the rest
    out = left;
    const need = k(c) / (c.vt - out) - c.vq;
    net = need;
  }
  const gross = net / (1 - FEE - c.tax);
  return { out, net, fee: gross * FEE, tax: gross * c.tax, refund: Math.max(0, sharesIn - gross), impact: priceAfter(c, net, out) / priceShares(c) - 1 };
}
function priceAfter(c, dq, dt) { return (c.vq + dq) / (c.vt - dt); }
function quoteSell(c, tokIn) {
  if (c.graduated) return quotePool(c, tokIn, false);
  const gross = c.vq - k(c) / (c.vt + tokIn);
  const fee = gross * FEE, tax = gross * c.tax;
  return { out: gross - fee - tax, gross, fee, tax, impact: ((c.vq - gross) / (c.vt + tokIn)) / priceShares(c) - 1 };
}
// after graduation the reserves move to a locked constant-product pool; same math, fee stays 1%, no creator tax
function quotePool(c, amt, isBuy) {
  const kk = c.vq * c.vt;
  if (isBuy) { const net = amt * (1 - FEE); const out = c.vt - kk / (c.vq + net); return { out, net, fee: amt * FEE, tax: 0, refund: 0, impact: ((c.vq + net) / (c.vt - out)) / priceShares(c) - 1 }; }
  const gross = c.vq - kk / (c.vt + amt); return { out: gross * (1 - FEE), gross, fee: gross * FEE, tax: 0, impact: ((c.vq - gross) / (c.vt + amt)) / priceShares(c) - 1 };
}

function tradeBuy(L, c, sharesIn, who, t = now(), silent) {
  const q = quoteBuy(c, sharesIn);
  if (!(q.out > 0)) return null;
  const px = stockAt(L, c.co, t);
  c.vq += q.net; c.vt -= q.out;
  if (!c.graduated) { c.sold += q.out; c.raised += q.net; }
  c.holders[who] = (c.holders[who] || 0) + q.out;
  L.treasury.usd += q.fee * px; L.treasury.trades++;
  c.creatorEarned += q.tax * px;
  const spent = sharesIn - q.refund;
  pushTrade(c, { t, side: 'buy', who, tok: q.out, shares: spent, usd: spent * px, p: priceShares(c) * px });
  if (!c.graduated && c.sold >= CURVE - 1) graduate(L, c, t, silent);
  return q;
}
function tradeSell(L, c, tokIn, who, t = now()) {
  tokIn = Math.min(tokIn, c.holders[who] || 0);
  if (!(tokIn > 0)) return null;
  const q = quoteSell(c, tokIn);
  const px = stockAt(L, c.co, t);
  c.vq -= q.gross; c.vt += tokIn;
  if (!c.graduated) { c.sold -= tokIn; c.raised -= q.gross; }
  c.holders[who] -= tokIn; if (c.holders[who] < 1e-6) delete c.holders[who];
  L.treasury.usd += q.fee * px; L.treasury.trades++;
  c.creatorEarned += q.tax * px;
  pushTrade(c, { t, side: 'sell', who, tok: tokIn, shares: q.out, usd: q.out * px, p: priceShares(c) * px });
  return q;
}
function pushTrade(c, tr) { c.trades.push(tr); if (c.trades.length > 600) c.trades.splice(0, c.trades.length - 600); }
function graduate(L, c, t, silent) {
  c.graduated = true; c.gradAt = t; L.treasury.graduations++;
  if (!silent) toast(`${c.sym} graduated. Its pool is now locked.`);
}

// ---------- persistence ----------
function save() {
  store(KEY, S);
  if (W) { const book = store('sc.wallets') || {}; book[W.addr] = W; store('sc.wallets', book); }
  store('sc.cur', W ? W.addr : null);
}
function load() {
  const s = store(KEY);
  S = s && s.v === 2 && s.coins ? s : freshLedger();
  const old = store('sc.wallet'); // single-wallet format from the first build
  if (old && old.addr) { const book = store('sc.wallets') || {}; old.kind = old.kind === 'injected' ? 'evm' : old.kind; old.name = old.name || (old.kind === 'demo' ? 'Demo wallet' : 'Browser wallet'); book[old.addr] = old; store('sc.wallets', book); store('sc.cur', old.addr); try { localStorage.removeItem('sc.wallet'); } catch (e) { /* storage blocked */ } }
  const cur = store('sc.cur');
  W = cur ? (store('sc.wallets') || {})[cur] || null : null;
}

// ---------- formatting ----------
const SUB = '₀₁₂₃₄₅₆₇₈₉';
function fmtTiny(v) {
  if (!isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a >= 1) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (a >= 0.01) return v.toFixed(4);
  if (a === 0) return '0';
  const e = Math.floor(-Math.log10(a)); // number of zeros after the decimal point
  const digits = Math.round(a * Math.pow(10, e + 3)).toString().slice(0, 3).replace(/0+$/, '');
  const zeros = e;
  return (v < 0 ? '-' : '') + '0.0' + String(zeros).split('').map(d => SUB[+d]).join('') + digits;
}
function money(usd, opt = {}) {
  const c = CCY[ui.ccy];
  if (ui.ccy === 'SHARES' && opt.co) return fmtTiny(usd / S.stocks[opt.co].px) + ' ' + opt.co;
  const cc = ui.ccy === 'SHARES' ? CCY.USD : c;
  const v = usd * cc.r;
  if (opt.compact && Math.abs(v) >= 1e3) return cc.s + compact(v);
  return cc.s + fmtTiny(v);
}
function compact(v) { const a = Math.abs(v); if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K'; return v.toFixed(2); }
const tok = v => compact(v).replace(/\.00$/, '');
const pct = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%';
const cls = v => v >= 0 ? 'up' : 'down';
function ago(t) { const s = Math.max(1, (now() - t) / 1000); if (s < 60) return Math.floor(s) + 's'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; return Math.floor(s / 86400) + 'd'; }
function change24(c) {
  const cut = now() - 86400e3; const tr = c.trades; let base = c.pxLaunchUsd;
  for (let i = tr.length - 1; i >= 0; i--) if (tr[i].t <= cut) { base = tr[i].p; break; }
  return priceUsd(c) / base - 1;
}
function vol24(c) { const cut = now() - 86400e3; let v = 0; for (let i = c.trades.length - 1; i >= 0 && c.trades[i].t > cut; i--) v += c.trades[i].usd; return v; }
function stockChg(sym) { const s = S.stocks[sym]; return s.px / s.open - 1; }

function logo(c, size = '') {
  if (c.img) return `<span class="logo ${size}"><img src="${esc(c.img)}" alt=""></span>`;
  const col = CO[c.co].c;
  return `<span class="logo ${size}" style="background:linear-gradient(135deg, ${col}, color-mix(in srgb, ${col} 55%, #000))" aria-hidden="true">${esc(c.sym.slice(0, 2))}</span>`;
}
function coLogo(sym, size = 'sm') { const c = CO[sym]; return `<span class="logo ${size}" style="background:${c.c}" aria-hidden="true">${esc(sym.slice(0, 2))}</span>`; }
const starSvg = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"/></svg>';
function starBtn(id) { const on = ui.watch.includes(id); return `<button class="starbtn ${on ? 'on' : ''}" data-star="${esc(id)}" aria-pressed="${on}" title="${on ? 'Remove from watchlist' : 'Add to watchlist'}" aria-label="Watch">${starSvg}</button>`; }

// ---------- toast ----------
let toastT;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600); }

// ---------- header ----------
const NAV = [['', 'Board'], ['pairs', 'Pairs'], ['unclaimed', 'Unclaimed'], ['beat', 'Scoreboard'], ['watch', 'Watchlist'], ['legs', 'Two legs'], ['launch', 'Launch'], ['account', 'Account'], ['docs', 'Docs']];
const TITLES = { treasury: 'Treasury', security: 'Security', coin: 'Coin' };
function renderNav() {
  const cur = routeParts()[0] || '';
  const html = NAV.map(([r, l]) => `<a href="#/${r}" class="${cur === r ? 'on' : ''}">${l}</a>`).join('');
  $('#nav').innerHTML = html;
  const m = $('.mobile-nav'); if (m) m.innerHTML = html;
}
function initHeader() {
  $('#themeBtn').onclick = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next); store('sc.theme', next); restyleChart();
  };
  const btn = $('#ccyBtn');
  $('#ccyCur').textContent = ui.ccy === 'SHARES' ? 'Shares' : ui.ccy;
  btn.onclick = e => {
    e.stopPropagation();
    let m = $('.ccy-menu'); if (m) { m.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
    m = document.createElement('div'); m.className = 'ccy-menu'; m.setAttribute('role', 'listbox');
    m.innerHTML = Object.keys(CCY).map(k2 => `<button role="option" data-c="${k2}" aria-selected="${k2 === ui.ccy}"><span>${k2 === 'SHARES' ? 'Stock shares' : k2}</span><span class="muted mono">${CCY[k2].s || '⇄'}</span></button>`).join('');
    $('#ccy').appendChild(m); btn.setAttribute('aria-expanded', 'true');
    m.onclick = ev => { const b = ev.target.closest('button'); if (!b) return; ui.ccy = b.dataset.c; store('sc.ccy', ui.ccy); $('#ccyCur').textContent = ui.ccy === 'SHARES' ? 'Shares' : ui.ccy; m.remove(); btn.setAttribute('aria-expanded', 'false'); render(); };
  };
  document.addEventListener('click', () => { const m = $('.ccy-menu'); if (m) { m.remove(); btn.setAttribute('aria-expanded', 'false'); } });
  $('#findBtn').onclick = openFind;
  $('#connectBtn').onclick = () => W ? openAccountMenu() : openConnect();
  $('#menuBtn').onclick = () => {
    let m = $('.mobile-nav');
    if (m) { m.remove(); $('#menuBtn').setAttribute('aria-expanded', 'false'); return; }
    m = document.createElement('nav'); m.className = 'mobile-nav'; m.setAttribute('aria-label', 'Menu');
    document.body.appendChild(m); renderNav(); $('#menuBtn').setAttribute('aria-expanded', 'true');
    m.onclick = e => { if (e.target.closest('a')) { m.remove(); $('#menuBtn').setAttribute('aria-expanded', 'false'); } };
  };
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); openFind(); }
    if (e.key === 'Escape') closeModal();
  });
  document.addEventListener('click', e => {
    const s = e.target.closest('[data-star]'); if (s) { e.preventDefault(); e.stopPropagation(); toggleWatch(s.dataset.star); return; }
    // a link to the page you are already on scrolls back to the top and refreshes it
    const same = e.target.closest('a[href^="#"]');
    if (same && !e.defaultPrevented) { const h = same.getAttribute('href'); const norm = x => (x || '').replace(/^#\/?/, '').replace(/\/$/, ''); if (norm(h) === norm(location.hash)) { e.preventDefault(); closeModal(); const m = $('.mobile-nav'); if (m) m.remove(); if (scrollY > 10) window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); render(); return; } }
    const md = e.target.closest('[data-modal]'); if (md) { md.dataset.modal === 'license' ? openLicense() : openStorage(); return; }
    const go = e.target.closest('[data-go]'); if (go && !e.target.closest('a,button:not([data-go])')) location.hash = go.dataset.go;
  });
  renderConnect();
}
function renderConnect() {
  const b = $('#connectBtn');
  if (W) { b.className = 'btn ghost connect'; b.innerHTML = `${W.icon ? wIcon(W.name, W.icon) : '<span class="dot"></span>'}<span class="mono">${short(W.addr)}</span>${W.kind === 'solana' ? '<span class="pill">SOL</span>' : ''}`; b.title = walletLabel(W); }
  else { b.className = 'btn primary connect'; b.textContent = 'Connect'; }
}
function toggleWatch(id) {
  const i = ui.watch.indexOf(id);
  if (i >= 0) ui.watch.splice(i, 1); else ui.watch.push(id);
  store('sc.watch', ui.watch);
  $$(`[data-star="${CSS.escape(id)}"]`).forEach(b => { const on = i < 0; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  toast(i >= 0 ? 'Removed from watchlist' : 'Added to watchlist');
  if (routeParts()[0] === 'watch') render();
}

// ---------- modals ----------
function openModal(title, body, opt = {}) {
  closeModal();
  const sc = document.createElement('div'); sc.className = 'scrim';
  sc.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">${opt.raw ? body : `<div class="mh"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div><div class="mb">${body}</div>`}</div>`;
  sc.addEventListener('click', e => { if (e.target === sc || e.target.closest('[data-close]')) closeModal(); });
  document.body.appendChild(sc);
  return sc;
}
function closeModal() { const m = $('.scrim'); if (m) m.remove(); }

const LICENSE = `MIT License

Copyright (c) 2026 Sharecurve contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
function openLicense() {
  openModal('MIT license', `<pre id="licTxt">${esc(LICENSE)}</pre><p class="hint" style="margin-top:12px">The MIT license covers the code. The background photo, <a href="https://commons.wikimedia.org/wiki/File:Singapore_Marina_Bay_Dusk_2018-02-27.jpg" target="_blank" rel="noopener noreferrer" style="text-decoration:underline">Singapore Marina Bay Dusk</a> by Benh LIEU SONG, is used under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" style="text-decoration:underline">CC BY-SA 4.0</a>, resized.</p><div class="bar" style="margin:14px 0 0"><button class="btn ghost" id="copyLic" type="button">Copy license</button></div>`);
  $('#copyLic').onclick = () => {
    const done = () => toast('License copied');
    try { navigator.clipboard.writeText(LICENSE).then(done, selectLic); } catch (e) { selectLic(); }
  };
  function selectLic() { const r = document.createRange(); r.selectNodeContents($('#licTxt')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Selected. Press Ctrl+C to copy.'); }
}
function openStorage() {
  openModal('What we store', `<div class="prose"><p>Everything stays in this browser's local storage. Nothing is sent to a server.</p><ul>
  <li><code>sc.state.v2</code>: the demo ledger (coins, curves, trades, treasury).</li>
  <li><code>sc.wallets</code>, <code>sc.cur</code>: the addresses you connected, their demo balances and which one is active. Private keys never reach this page.</li>
  <li><code>sc.watch</code>, <code>sc.theme</code>, <code>sc.ccy</code>: your watchlist, theme and display currency.</li></ul>
  <p>Clearing site data or pressing <strong>Reset demo</strong> on the Account page wipes all of it.</p></div>`);
}

// ---------- wallets: real browser wallets (EIP-6963 for EVM, Phantom/Solflare for Solana) plus a demo wallet ----------
// A real wallet signs you in with its address and can sign a message to prove you own it.
// Trades still settle on the demo ledger, so no transaction is ever sent to your wallet.
const evmFound = new Map();
let activeProvider = null;
const hooked = new WeakSet();
window.addEventListener('eip6963:announceProvider', e => {
  const d = e.detail; if (!d || !d.info || !d.provider) return;
  evmFound.set(d.info.rdns || d.info.uuid, d);
  if ($('#wm') && wmState.view === 'list') wmShow('list', true);
});
function askWallets() { try { window.dispatchEvent(new Event('eip6963:requestProvider')); } catch (e) { /* old browser */ } }
function legacyEvm() {
  const e = window.ethereum; if (!e) return [];
  const list = Array.isArray(e.providers) && e.providers.length ? e.providers : [e];
  return list.map(p => {
    const id = p.isPhantom ? 'app.phantom' : p.isRabby ? 'io.rabby' : p.isCoinbaseWallet ? 'com.coinbase.wallet' : p.isBraveWallet ? 'com.brave.wallet' : p.isMetaMask ? 'io.metamask' : 'injected';
    const name = { 'app.phantom': 'Phantom', 'io.rabby': 'Rabby', 'com.coinbase.wallet': 'Coinbase Wallet', 'com.brave.wallet': 'Brave Wallet', 'io.metamask': 'MetaMask', injected: 'Browser wallet' }[id];
    return { info: { rdns: id, name, icon: '' }, provider: p };
  });
}
function evmWallets() {
  const m = new Map(evmFound);
  legacyEvm().forEach(w => { if (!m.has(w.info.rdns) && ![...m.values()].some(x => x.provider === w.provider)) m.set(w.info.rdns, w); });
  return [...m.values()];
}
function solWallets() {
  const out = [];
  const ph = (window.phantom && window.phantom.solana) || (window.solana && window.solana.isPhantom ? window.solana : null);
  if (ph) out.push({ id: 'sol:phantom', name: 'Phantom', provider: ph });
  if (window.solflare && window.solflare.isSolflare) out.push({ id: 'sol:solflare', name: 'Solflare', provider: window.solflare });
  if (window.backpack && window.backpack.isBackpack) out.push({ id: 'sol:backpack', name: 'Backpack', provider: window.backpack });
  return out;
}
// Catalog of wallets we know how to talk to. Icons are our own abstract marks; when a wallet is
// installed we show the icon it announces about itself instead.
const KNOWN_WALLETS = [
  { key: 'metamask', name: 'MetaMask', ids: ['io.metamask'], chains: ['evm'], url: 'https://metamask.io/download/', c: ['#ff9a3c', '#e8590c'], net: 'Ethereum and EVM chains', deep: u => 'https://metamask.app.link/dapp/' + u.replace(/^https?:\/\//, '') },
  { key: 'phantom', name: 'Phantom', ids: ['app.phantom', 'sol:phantom'], chains: ['sol', 'evm'], url: 'https://phantom.com/download', c: ['#b9a8ff', '#6f5ce0'], net: 'Solana, Ethereum, Base', deep: u => 'https://phantom.app/ul/browse/' + encodeURIComponent(u) + '?ref=' + encodeURIComponent(location.origin) },
  { key: 'coinbase', name: 'Coinbase Wallet', ids: ['com.coinbase.wallet'], chains: ['evm'], url: 'https://www.coinbase.com/wallet/downloads', c: ['#4c8dff', '#0a3fd6'], net: 'Ethereum and EVM chains', deep: u => 'https://go.cb-w.com/dapp?cb_url=' + encodeURIComponent(u) },
  { key: 'rabby', name: 'Rabby', ids: ['io.rabby'], chains: ['evm'], url: 'https://rabby.io/', c: ['#9aa6ff', '#5363e6'], net: 'EVM chains, desktop' },
  { key: 'solflare', name: 'Solflare', ids: ['sol:solflare'], chains: ['sol'], url: 'https://solflare.com/download', c: ['#ffd25a', '#f26b1d'], net: 'Solana', deep: u => 'https://solflare.com/ul/v1/browse/' + encodeURIComponent(u) + '?ref=' + encodeURIComponent(location.origin) },
  { key: 'backpack', name: 'Backpack', ids: ['sol:backpack'], chains: ['sol'], url: 'https://backpack.app/download', c: ['#ff6b6b', '#c92a3a'], net: 'Solana' },
  { key: 'brave', name: 'Brave Wallet', ids: ['com.brave.wallet'], chains: ['evm', 'sol'], url: 'https://brave.com/wallet/', c: ['#ff8a50', '#d9480f'], net: 'Built into Brave' },
];
const CHAINS = { '0x1': ['Ethereum', 'ETH'], '0x2105': ['Base', 'ETH'], '0xa4b1': ['Arbitrum', 'ETH'], '0xa': ['Optimism', 'ETH'], '0x89': ['Polygon', 'POL'], '0x38': ['BNB Chain', 'BNB'], '0xa86a': ['Avalanche', 'AVAX'], '0xaa36a7': ['Sepolia', 'ETH'], '0x14a34': ['Base Sepolia', 'ETH'] };
const chainName = id => (CHAINS[id] || ['Chain ' + (id ? parseInt(id, 16) : '?'), 'ETH'])[0];
function walletLabel(w) { if (!w) return ''; if (w.kind === 'demo') return 'Demo wallet'; if (w.kind === 'solana') return (w.name || 'Wallet') + ' · Solana'; return (w.name || 'Wallet') + ' · ' + chainName(w.chainId); }

// drawn marks, one per wallet
const ART = {
  metamask: '<path d="M10 30 L16 12 L24 22 L32 12 L38 30" fill="none" stroke="#fff" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M16 12 L24 30 L32 12" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2" stroke-linejoin="round"/><circle cx="24" cy="35" r="2.2" fill="#fff"/>',
  phantom: '<path d="M30 11a13 13 0 1 0 7 22 10.5 10.5 0 1 1-7-22z" fill="#fff"/><path d="M33 14l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#fff" opacity=".85"/>',
  coinbase: '<ellipse cx="24" cy="30" rx="11" ry="4.5" fill="none" stroke="#fff" stroke-width="3"/><ellipse cx="24" cy="23" rx="11" ry="4.5" fill="none" stroke="#fff" stroke-width="3"/><ellipse cx="24" cy="16" rx="11" ry="4.5" fill="#fff"/>',
  rabby: '<rect x="15" y="9" width="6" height="15" rx="3" fill="#fff"/><rect x="27" y="9" width="6" height="15" rx="3" fill="#fff"/><ellipse cx="24" cy="29" rx="12" ry="9" fill="#fff"/><circle cx="20" cy="28" r="1.6" fill="#5363e6"/><circle cx="28" cy="28" r="1.6" fill="#5363e6"/>',
  solflare: '<circle cx="24" cy="24" r="6.5" fill="#fff"/><g stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M24 8v5M24 35v5M8 24h5M35 24h5M12.7 12.7l3.5 3.5M31.8 31.8l3.5 3.5M12.7 35.3l3.5-3.5M31.8 16.2l3.5-3.5"/></g>',
  backpack: '<rect x="13" y="15" width="22" height="22" rx="6" fill="#fff"/><path d="M19 15v-2a5 5 0 0 1 10 0v2" fill="none" stroke="#fff" stroke-width="3"/><rect x="18" y="24" width="12" height="6" rx="2" fill="#c92a3a"/>',
  brave: '<path d="M24 9c2 6 9 8 9 17a9 9 0 0 1-18 0c0-5 3-7 4-10 1 3 3 4 3 4 0-5 1-8 2-11z" fill="#fff"/>',
  demo: '<path d="M24 9 l3.4 9.6 L37 22 l-9.6 3.4 L24 35 l-3.4 -9.6 L11 22 l9.6 -3.4z" fill="#fff"/><circle cx="35" cy="35" r="3" fill="#fff" opacity=".8"/><circle cx="13" cy="12" r="2" fill="#fff" opacity=".7"/>',
  generic: '<rect x="11" y="15" width="26" height="19" rx="5" fill="none" stroke="#fff" stroke-width="3"/><rect x="27" y="21" width="10" height="7" rx="3" fill="#fff"/>',
};
function walletArt(key, size = 40, icon) {
  if (icon && /^data:image\//.test(icon)) return `<span class="wart" style="width:${size}px;height:${size}px"><img src="${esc(icon)}" alt=""></span>`;
  const k = KNOWN_WALLETS.find(x => x.key === key);
  const c = key === 'demo' ? ['#ffc48f', '#e8743b'] : k ? k.c : ['#7a86b8', '#3d4775'];
  const gid = 'wg-' + key + '-' + size;
  return `<span class="wart" style="width:${size}px;height:${size}px"><svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient></defs><rect width="48" height="48" rx="13" fill="url(#${gid})"/><rect x="1" y="1" width="46" height="46" rx="12" fill="none" stroke="rgba(255,255,255,.25)"/>${ART[key] || ART.generic}</svg></span>`;
}
function wIcon(name, icon, c) {
  const k = KNOWN_WALLETS.find(x => x.name === name);
  if (icon && /^data:image\//.test(icon)) return walletArt('', 20, icon).replace('class="wart"', 'class="wart sm"');
  return walletArt(k ? k.key : name === 'Demo wallet' ? 'demo' : 'generic', 20).replace('class="wart"', 'class="wart sm"');
}
function walletErr(e, name) {
  const code = e && (e.code || (e.error && e.error.code));
  if (code === 4001 || /reject|denied|cancel/i.test(e && e.message || '')) return `You declined the request in ${name}. Nothing was shared.`;
  if (code === -32002) return `${name} already has a request open. Click the ${name} icon in your browser's toolbar to finish it.`;
  if (e && e.message === 'timeout') return `${name} didn't answer. It may be locked or the popup may be hidden behind this window.`;
  return `${name} did not respond. Unlock it and try again.`;
}

// ---------- the connect dialog ----------
let connectThen = null, wmState = { q: '', chain: 'all', view: 'list', target: null, token: 0 };
function catalogRows() {
  const evm = evmWallets(), sol = solWallets();
  const rows = KNOWN_WALLETS.map(k => ({ k, evm: evm.find(w => k.ids.includes(w.info.rdns)), sol: sol.find(w => k.ids.includes(w.id)) }));
  // installed wallets we don't have in the catalog (EIP-6963 lets any wallet announce itself)
  evm.filter(w => !KNOWN_WALLETS.some(k => k.ids.includes(w.info.rdns))).forEach(w => rows.push({ k: { key: 'generic', name: w.info.name, ids: [w.info.rdns], chains: ['evm'], net: 'EVM', url: '' }, evm: w, icon: w.info.icon }));
  rows.forEach(r => { r.installed = !!(r.evm || r.sol); if (!r.icon && r.evm) r.icon = r.evm.info.icon; });
  return rows;
}
function openConnect(then) {
  askWallets();
  connectThen = then || null;
  wmState = { q: '', chain: store('sc.wmChain') || 'all', view: 'list', target: null, token: 0 };
  openModal('Connect a wallet', `<div class="wm" id="wm">
    <div class="mh"><div class="wm-title"><button class="icon-btn wm-back" id="wmBack" type="button" aria-label="Back" hidden>←</button><h3 id="wmH">Connect a wallet</h3></div><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="wm-body" id="wmBody"></div>
    <div class="wm-foot"><button class="foot-link" type="button" id="wmHelp">New to wallets?</button><span class="micro">Sharecurve never asks for your recovery phrase.</span></div>
  </div>`, { raw: true });
  $('#wmBack').onclick = () => wmShow('list');
  $('#wmHelp').onclick = () => wmShow('help');
  if (!openConnect.keys) openConnect.keys = true; document.addEventListener('keydown', e => {
    if (!$('#wm') || !/ArrowDown|ArrowUp/.test(e.key)) return;
    const rows = $$('#wm .wm-row'); const i = rows.indexOf(document.activeElement);
    const n = e.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1);
    if (rows[n]) { e.preventDefault(); rows[n].focus(); }
  });
  wmShow('list');
  setTimeout(() => { if (wmState.view === 'list' && $('#wm')) wmShow('list', true); }, 400); // wallets that announce late
}
function wmShow(view, quiet) {
  const body = $('#wmBody'); if (!body) return;
  wmState.view = view;
  $('#wmBack').hidden = view === 'list';
  $('#wmH').textContent = { list: 'Connect a wallet', connect: 'Connecting', install: 'Get ' + (wmState.target && wmState.target.k.name), help: 'What is a wallet?', chain: 'Choose a network' }[view] || 'Connect a wallet';
  if (view === 'list') return wmList(body, quiet);
  body.innerHTML = '';
  if (view === 'help') return wmHelp(body);
  if (view === 'install') return wmInstall(body, wmState.target);
  if (view === 'chain') return wmChain(body, wmState.target);
}
function wmList(body, quiet) {
  const rows = catalogRows();
  const last = store('sc.lastWallet');
  const q = wmState.q.toLowerCase();
  const match = r => (!q || r.k.name.toLowerCase().includes(q)) && (wmState.chain === 'all' || r.k.chains.includes(wmState.chain));
  const inst = rows.filter(r => r.installed && match(r)), rest = rows.filter(r => !r.installed && match(r));
  const framed = (() => { try { return window.top !== window.self; } catch (e) { return true; } })();
  const chip = c => `<span class="wm-chip ${c}">${c === 'sol' ? 'Solana' : 'EVM'}</span>`;
  const row = (r, i) => `<button type="button" class="wm-row ${r.installed ? 'is-in' : ''}" data-key="${esc(r.k.ids[0])}" style="animation-delay:${i * 35}ms">
      ${walletArt(r.k.key, 40, r.icon)}
      <span class="grow"><b>${esc(r.k.name)}</b>${last === r.k.ids[0] ? '<span class="wm-last">Last used</span>' : ''}<span class="micro">${esc(r.k.net)}</span></span>
      <span class="wm-chips">${r.k.chains.map(chip).join('')}</span>
      <span class="wm-go">${r.installed ? 'Connect' : 'Get'}<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    </button>`;
  let i = 0;
  body.innerHTML = `<div class="wm-tools"><div class="seg" id="wmChain" role="tablist">${[['all', 'All'], ['evm', 'Ethereum & EVM'], ['sol', 'Solana']].map(([k, l]) => `<button type="button" role="tab" data-c="${k}" class="${wmState.chain === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <input class="search" id="wmQ" placeholder="Search wallets" value="${esc(wmState.q)}" aria-label="Search wallets" autocomplete="off"></div>
    ${framed && !rows.some(r => r.installed) ? `<div class="wm-note"><b>Can't see your wallet?</b> This page is running inside a preview frame, and browser extensions often stay hidden there. Open Sharecurve in its own tab to use MetaMask, Phantom and the rest. <button class="btn ghost" type="button" id="wmCopyUrl">Copy page link</button></div>` : ''}
    <div class="wm-sec">${inst.length ? `<span class="eyebrow">Detected in this browser</span>${inst.map(r => row(r, i++)).join('')}` : ''}</div>
    <div class="wm-sec">${rest.length ? `<span class="eyebrow">${inst.length ? 'More wallets' : 'Popular wallets'}</span>${rest.map(r => row(r, i++)).join('')}` : ''}</div>
    ${!inst.length && !rest.length ? `<div class="empty">No wallet matches “${esc(wmState.q)}”.</div>` : ''}
    <div class="wm-sec"><span class="eyebrow">No extension?</span>
      <button type="button" class="wm-row wm-demo" id="wDemo" style="animation-delay:${i * 35}ms">${walletArt('demo', 40)}<span class="grow"><b>Demo wallet</b><span class="micro">New address with ${money(START_USD)} of test funds, ready in one click</span></span><span class="wm-go">Try it<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button></div>`;
  if (quiet) body.querySelectorAll('.wm-row').forEach(r => r.style.animation = 'none');
  $('#wmQ').oninput = e => { wmState.q = e.target.value; const pos = e.target.selectionStart; wmList(body, true); const qi = $('#wmQ'); qi.focus(); qi.setSelectionRange(pos, pos); };
  $('#wmChain').onclick = e => { const b = e.target.closest('button'); if (!b) return; wmState.chain = b.dataset.c; store('sc.wmChain', wmState.chain); wmList(body, true); };
  if ($('#wmCopyUrl')) $('#wmCopyUrl').onclick = () => copyText(location.href, 'Link copied. Paste it into a new tab.');
  body.onclick = e => {
    const b = e.target.closest('.wm-row'); if (!b) return;
    if (b.id === 'wDemo') return wmDemo(b);
    const r = catalogRows().find(x => x.k.ids[0] === b.dataset.key); if (!r) return;
    wmState.target = r;
    if (!r.installed) return wmShow('install');
    if (r.evm && r.sol) return wmShow('chain');
    wmConnect(r, r.sol ? 'sol' : 'evm');
  };
  const first = body.querySelector('.wm-row'); if (first && !quiet && !('ontouchstart' in window)) first.focus({ preventScroll: true });
}
function wmChain(body, r) {
  body.innerHTML = `<div class="wm-detail">${walletArt(r.k.key, 64, r.icon)}<p>${esc(r.k.name)} works on more than one network. Pick the one you want to sign in with.</p>
    <div class="wm-choices"><button type="button" class="wm-row" data-c="sol">${walletArt('solflare', 32)}<span class="grow"><b>Solana</b><span class="micro">Sign in with your Solana address</span></span></button>
    <button type="button" class="wm-row" data-c="evm">${walletArt('metamask', 32)}<span class="grow"><b>Ethereum, Base and other EVM chains</b><span class="micro">Sign in with your 0x address</span></span></button></div></div>`;
  body.onclick = e => { const b = e.target.closest('[data-c]'); if (b) wmConnect(r, b.dataset.c); };
}
function wmDemo(btn) {
  btn.classList.add('pressed');
  const addr = randAddr(mulberry((now() ^ (Math.random() * 1e9)) >>> 0));
  setWallet(addr, { kind: 'demo', name: 'Demo wallet', icon: '' }, true);
  store('sc.lastWallet', 'demo');
  wmSuccess({ k: { key: 'demo', name: 'Demo wallet' } }, addr);
}
async function wmConnect(r, chain) {
  const body = $('#wmBody'); if (!body) return;
  const token = ++wmState.token;
  wmState.view = 'connect'; $('#wmBack').hidden = false; $('#wmH').textContent = 'Connecting';
  body.innerHTML = `<div class="wm-detail"><div class="wm-ring">${walletArt(r.k.key, 64, r.icon)}</div>
    <h3>Approve in ${esc(r.k.name)}</h3><p id="wmMsg">A ${esc(r.k.name)} window should open. Check the request and press Connect there.</p>
    <div class="wm-steps"><span class="on">Request sent</span><span id="wmS2">Waiting for you</span><span id="wmS3">Signed in</span></div>
    <div class="bar" style="justify-content:center;margin:0"><button class="btn ghost" id="wmCancel" type="button">Cancel</button></div></div>`;
  $('#wmCancel').onclick = () => { wmState.token++; wmShow('list'); };
  const slow = setTimeout(() => { if (wmState.token === token && $('#wmMsg')) $('#wmMsg').textContent = `Still waiting. If no window opened, click the ${r.k.name} icon in your browser toolbar.`; }, 8000);
  try {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 60000));
    let addr;
    if (chain === 'sol') {
      const res = await Promise.race([r.sol.provider.connect(), timeout]);
      const pk = (res && res.publicKey) || r.sol.provider.publicKey; if (!pk) throw new Error('no key');
      if (token !== wmState.token) return;
      activeProvider = r.sol.provider; hookSol(r.sol);
      addr = pk.toString();
      setWallet(addr, { kind: 'solana', name: r.k.name, rdns: r.sol.id, icon: '' }, true);
    } else {
      const acc = await Promise.race([r.evm.provider.request({ method: 'eth_requestAccounts' }), timeout]);
      if (!acc || !acc[0]) throw new Error('no account');
      if (token !== wmState.token) return;
      const chainId = await r.evm.provider.request({ method: 'eth_chainId' }).catch(() => null);
      activeProvider = r.evm.provider; hookEvm(r.evm);
      addr = acc[0].toLowerCase();
      setWallet(addr, { kind: 'evm', name: r.k.name, rdns: r.evm.info.rdns, icon: /^data:image\//.test(r.evm.info.icon || '') ? r.evm.info.icon : '', chainId }, true);
      refreshNative();
    }
    clearTimeout(slow);
    store('sc.lastWallet', r.k.ids[0]);
    wmSuccess(r, addr);
  } catch (e) {
    clearTimeout(slow);
    if (token !== wmState.token || !$('#wmBody')) return;
    body.innerHTML = `<div class="wm-detail wm-fail"><div class="wm-ring off">${walletArt(r.k.key, 64, r.icon)}<span class="wm-badge bad">!</span></div>
      <h3>Not connected</h3><p>${esc(walletErr(e, r.k.name))}</p>
      <div class="bar" style="justify-content:center;margin:0"><button class="btn primary" id="wmRetry" type="button">Try again</button><button class="btn ghost" id="wmOther" type="button">Pick another wallet</button></div></div>`;
    $('#wmRetry').onclick = () => wmConnect(r, chain);
    $('#wmOther').onclick = () => wmShow('list');
  }
}
function wmSuccess(r, addr) {
  const body = $('#wmBody'); if (!body) return;
  $('#wmBack').hidden = true; $('#wmH').textContent = 'Connected';
  body.innerHTML = `<div class="wm-detail wm-ok"><div class="wm-ring done">${walletArt(r.k.key, 64, r.icon)}<span class="wm-badge"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div>
    <h3>You're in</h3><p class="mono">${esc(short(addr))}</p></div>`;
  burst(body.querySelector('.wm-ring'));
  setTimeout(() => { if (wmState.view !== 'list') { closeModal(); toast(`Connected with ${r.k.name}`); finishConnect(); } }, 1100);
  wmState.view = 'done';
}
function burst(el) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cols = ['var(--accent)', 'var(--teal)', 'var(--up)'];
  for (let i = 0; i < 14; i++) { const s = document.createElement('i'); s.className = 'spark'; const a = (i / 14) * Math.PI * 2; s.style.setProperty('--dx', Math.cos(a) * (46 + Math.random() * 20) + 'px'); s.style.setProperty('--dy', Math.sin(a) * (46 + Math.random() * 20) + 'px'); s.style.background = cols[i % 3]; el.appendChild(s); }
}
function wmInstall(body, r) {
  const link = location.href, canDeep = !!r.k.deep;
  body.innerHTML = `<div class="wm-detail">${walletArt(r.k.key, 64)}
    <p>${esc(r.k.name)} isn't installed in this browser yet.</p>
    <ol class="wm-howto"><li><a class="btn primary" href="${esc(r.k.url)}" target="_blank" rel="noopener noreferrer">Install ${esc(r.k.name)} ↗</a></li>
      <li>Create a wallet or import one, then come back to this tab.</li>
      <li><button class="btn ghost" type="button" id="wmRecheck">I installed it, check again</button></li></ol>
    ${canDeep ? `<div class="wm-qr"><div id="wmQr" class="wm-qrbox" aria-label="QR code"></div><div><b>On your phone?</b><p class="micro">Scan to open Sharecurve inside the ${esc(r.k.name)} app's browser, where it connects straight away.</p><div class="bar" style="margin:8px 0 0"><a class="btn ghost" href="${esc(r.k.deep(link))}" target="_blank" rel="noopener noreferrer">Open in app</a><button class="btn ghost" type="button" id="wmCopyDeep">Copy link</button></div></div></div>` : ''}
  </div>`;
  $('#wmRecheck').onclick = () => {
    const b = $('#wmRecheck'); b.textContent = 'Looking…'; askWallets();
    setTimeout(() => {
      const fresh = catalogRows().find(x => x.k.ids[0] === r.k.ids[0]);
      if (fresh && fresh.installed) { wmState.target = fresh; return fresh.evm && fresh.sol ? wmShow('chain') : wmConnect(fresh, fresh.sol ? 'sol' : 'evm'); }
      b.textContent = 'Still not found. Reload the page after installing.'; b.classList.add('shake'); setTimeout(() => b.classList.remove('shake'), 500);
    }, 500);
  };
  if (canDeep) {
    $('#wmCopyDeep').onclick = () => copyText(r.k.deep(link), 'App link copied');
    const box = $('#wmQr');
    if (window.QRCode) { try { new QRCode(box, { text: r.k.deep(link), width: 116, height: 116, colorDark: '#0b1124', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M }); } catch (e) { box.hidden = true; } }
    else box.hidden = true;
  }
}
function wmHelp(body) {
  body.innerHTML = `<div class="prose wm-help">
    <p>A wallet is an app or browser extension that holds your crypto address. Connecting one lets Sharecurve see your address. It can't move funds without your approval.</p>
    <details open><summary>Which one should I get?</summary><p><strong>Phantom</strong> if you want Solana and Ethereum in one app. <strong>MetaMask</strong> or <strong>Rabby</strong> for Ethereum and its networks. <strong>Coinbase Wallet</strong> if you already use Coinbase.</p></details>
    <details><summary>Is connecting safe?</summary><p>Connecting shares your public address. Signing in asks you to sign a free message, which does not send a transaction. Never type your recovery phrase into a website.</p></details>
    <details><summary>Do I need real money here?</summary><p>No. Trading on Sharecurve uses the demo ledger. Every address gets ${money(START_USD)} of test funds.</p></details>
    <div class="bar" style="margin:6px 0 0"><button class="btn primary" type="button" id="wmHelpDemo">Try the demo wallet</button><button class="btn ghost" type="button" id="wmHelpBack">See wallets</button></div></div>`;
  $('#wmHelpDemo').onclick = () => { wmShow('list'); const d = $('#wDemo'); if (d) wmDemo(d); };
  $('#wmHelpBack').onclick = () => wmShow('list');
}
function finishConnect() { const t = connectThen; connectThen = null; if (t) t(); }
function hookEvm(w) {
  const p = w.provider; if (hooked.has(p) || !p.on) return; hooked.add(p);
  p.on('accountsChanged', a => {
    if (!W || W.kind !== 'evm' || activeProvider !== p) return;
    if (!a || !a.length) return dropWallet(`${w.info.name} disconnected`);
    if (a[0].toLowerCase() !== W.addr) { setWallet(a[0].toLowerCase(), { kind: 'evm', name: W.name, rdns: W.rdns, icon: W.icon, chainId: W.chainId }, true); toast('Switched to ' + short(W.addr)); refreshNative(); }
  });
  p.on('chainChanged', id => { if (!W || activeProvider !== p) return; W.chainId = id; save(); refreshNative(); renderConnect(); toast('Network: ' + chainName(id)); });
}
function hookSol(w) {
  const p = w.provider; if (hooked.has(p) || !p.on) return; hooked.add(p);
  p.on('accountChanged', pk => { if (!W || activeProvider !== p) return; if (!pk) return dropWallet(`${w.name} disconnected`); setWallet(pk.toString(), { kind: 'solana', name: w.name, rdns: w.id }, true); toast('Switched to ' + short(W.addr)); });
  p.on('disconnect', () => { if (W && activeProvider === p) dropWallet(`${w.name} disconnected`); });
}
async function refreshNative() {
  if (!W || W.kind !== 'evm' || !activeProvider) return;
  try {
    const hex = await activeProvider.request({ method: 'eth_getBalance', params: [W.addr, 'latest'] });
    const wei = BigInt(hex);
    W.native = { v: Number(wei / 10n ** 12n) / 1e6, sym: (CHAINS[W.chainId] || [0, 'ETH'])[1] };
    save(); if (routeParts()[0] === 'account') render(); if ($('#natBal')) $('#natBal').textContent = fmtNative();
  } catch (e) { W.native = null; }
}
const fmtNative = () => W && W.native ? W.native.v.toLocaleString('en-US', { maximumFractionDigits: 5 }) + ' ' + W.native.sym : 'Unavailable';
async function signIn() {
  if (!W || W.kind === 'demo' || !activeProvider) return toast('Connect a real wallet to sign in.');
  const msg = `Sign in to Sharecurve (demo network)\n\nAddress: ${W.addr}\nNonce: ${Math.random().toString(36).slice(2, 10)}\nIssued: ${new Date().toISOString()}\n\nThis signature costs nothing and does not send a transaction.`;
  try {
    let sig;
    if (W.kind === 'evm') {
      const hex = '0x' + Array.from(new TextEncoder().encode(msg)).map(b => b.toString(16).padStart(2, '0')).join('');
      sig = await activeProvider.request({ method: 'personal_sign', params: [hex, W.addr] });
    } else {
      const r = await activeProvider.signMessage(new TextEncoder().encode(msg), 'utf8');
      const bytes = r && (r.signature || r);
      sig = Array.from(bytes || []).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    if (!sig) throw new Error('empty');
    W.signed = { at: now(), sig: String(sig).slice(0, 18) };
    save(); toast('Signed in with your wallet'); closeModal(); render(); renderConnect();
  } catch (e) { toast(walletErr(e, W.name || 'Your wallet')); }
}
function walletBook() { return store('sc.wallets') || {}; }
function setWallet(addr, meta, quiet) {
  const book = walletBook();
  W = Object.assign(book[addr] || { addr, usd: START_USD, launched: [] }, meta, { addr });
  if (W.kind === 'demo') activeProvider = null;
  save(); renderConnect();
  if (!quiet) { closeModal(); toast('Connected ' + short(addr)); }
  render();
}
async function dropWallet(msg) {
  const p = activeProvider, kind = W && W.kind;
  W = null; activeProvider = null; save(); renderConnect(); render();
  if (msg) toast(msg);
  try { if (p && kind === 'solana' && p.disconnect) await p.disconnect(); if (p && kind === 'evm') await p.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }); } catch (e) { /* not every wallet supports revoking */ }
}
function openAccountMenu() {
  const real = W.kind !== 'demo';
  openModal('Wallet', `<div class="row" style="display:flex;gap:10px;align-items:center;margin-bottom:8px">${wIcon(W.name, W.icon, W.kind === 'demo' ? 'var(--accent)' : '')}<div><b>${esc(W.name || 'Wallet')}</b><div class="micro mono" style="word-break:break-all">${esc(W.addr)}</div></div></div>
  <div class="kv"><span>Network</span><span>${esc(walletLabel(W))}</span></div>
  ${W.kind === 'evm' ? `<div class="kv"><span>On-chain balance</span><span id="natBal">${fmtNative()}</span></div>` : ''}
  <div class="kv"><span>Demo cash</span><span>${money(W.usd)}</span></div>
  ${real ? `<div class="kv"><span>Signed in</span><span>${W.signed ? 'Yes, ' + ago(W.signed.at) + ' ago' : 'Not yet'}</span></div>` : ''}
  <div class="bar" style="margin:14px 0 0">${real && activeProvider ? `<button class="btn primary" id="signBtn" type="button">${W.signed ? 'Sign again' : 'Sign in with wallet'}</button>` : ''}<button class="btn ghost" id="copyAddr" type="button">Copy address</button><a class="btn ghost" href="#/account" data-close>Open account</a><button class="btn ghost" id="discBtn" type="button">Disconnect</button></div>`);
  if ($('#signBtn')) $('#signBtn').onclick = signIn;
  $('#copyAddr').onclick = () => copyText(W.addr, 'Address copied');
  $('#discBtn').onclick = () => { closeModal(); dropWallet('Disconnected'); };
  if (W.kind === 'evm') refreshNative();
}
function copyText(t, ok) { try { navigator.clipboard.writeText(t).then(() => toast(ok), () => toast(t)); } catch (e) { toast(t); } }
// reconnect a real wallet after a reload, without opening a prompt
async function resumeWallet() {
  if (!W || W.kind === 'demo') return;
  askWallets();
  await new Promise(r => setTimeout(r, 400));
  try {
    if (W.kind === 'evm') {
      const w = evmWallets().find(x => x.info.rdns === W.rdns) || evmWallets()[0];
      if (!w) return dropWallet();
      const acc = await w.provider.request({ method: 'eth_accounts' });
      if (!acc || !acc.length) return dropWallet();
      activeProvider = w.provider; hookEvm(w);
      W.chainId = await w.provider.request({ method: 'eth_chainId' }).catch(() => W.chainId);
      if (acc[0].toLowerCase() !== W.addr) setWallet(acc[0].toLowerCase(), { kind: 'evm', name: W.name, rdns: W.rdns, icon: W.icon, chainId: W.chainId }, true);
      refreshNative(); renderConnect();
    } else if (W.kind === 'solana') {
      const w = solWallets().find(x => x.id === W.rdns); if (!w) return dropWallet();
      const r = await w.provider.connect({ onlyIfTrusted: true });
      const pk = ((r && r.publicKey) || w.provider.publicKey || '').toString();
      if (!pk) return dropWallet();
      activeProvider = w.provider; hookSol(w);
      if (pk !== W.addr) setWallet(pk, { kind: 'solana', name: W.name, rdns: W.rdns }, true);
    }
  } catch (e) { dropWallet(); }
}

// ---------- find ----------
function openFind() {
  const sc = openModal('Find', `<input class="find-in" id="findIn" placeholder="Search coins, apps or tickers" autocomplete="off" aria-label="Search"><div class="find-list" id="findList"></div>`, { raw: true });
  const inp = $('#findIn'); let sel = 0, rows = [];
  const paint = () => {
    const q = inp.value.trim().toLowerCase();
    const coins = Object.values(S.coins).filter(c => !q || (c.name + ' ' + c.sym + ' ' + c.app + ' ' + c.co).toLowerCase().includes(q)).sort((a, b) => vol24(b) - vol24(a)).slice(0, 8)
      .map(c => ({ go: '#/coin/' + c.id, html: `${logo(c, 'sm')}<span class="grow"><b>${esc(c.name)}</b> <span class="muted mono">${esc(c.sym)}</span><br><span class="micro">${esc(c.app)} · ${c.co}</span></span><span class="mono">${money(priceUsd(c), { co: c.co })}</span>` }));
    const cos = COMPANIES.filter(c => q && (c.sym + ' ' + c.name + ' ' + c.apps.join(' ')).toLowerCase().includes(q)).slice(0, 4)
      .map(c => ({ go: '#/pairs/' + c.sym, html: `${coLogo(c.sym)}<span class="grow"><b>${c.sym}</b> <span class="muted">${esc(c.name)}</span><br><span class="micro">${c.apps.length} apps</span></span><span class="pill">Company</span>` }));
    rows = coins.concat(cos); sel = clamp(sel, 0, Math.max(0, rows.length - 1));
    $('#findList').innerHTML = rows.length ? rows.map((r, i) => `<div class="find-row ${i === sel ? 'on' : ''}" data-i="${i}">${r.html}</div>`).join('') : `<div class="empty" style="margin:8px">No match. <a class="btn ghost" href="#/launch" data-close>Launch it</a></div>`;
  };
  inp.oninput = () => { sel = 0; paint(); };
  inp.onkeydown = e => {
    if (e.key === 'ArrowDown') { sel = Math.min(rows.length - 1, sel + 1); paint(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(); e.preventDefault(); }
    if (e.key === 'Enter' && rows[sel]) { location.hash = rows[sel].go; closeModal(); }
  };
  $('#findList').onclick = e => { const r = e.target.closest('.find-row'); if (r) { location.hash = rows[+r.dataset.i].go; closeModal(); } };
  paint(); inp.focus();
  return sc;
}

// ---------- tape ----------
function renderTape() {
  const items = COMPANIES.map(c => { const ch = stockChg(c.sym); return `<span class="tape-item"><b>${c.sym}</b>${money(S.stocks[c.sym].px)}<span class="${cls(ch)}">${pct(ch)}</span></span>`; })
    .concat(Object.values(S.coins).sort((a, b) => vol24(b) - vol24(a)).slice(0, 8).map(c => { const ch = change24(c); return `<a class="tape-item" href="#/coin/${c.id}"><b>${esc(c.sym)}</b><span class="muted">/${c.co}</span><span class="${cls(ch)}">${pct(ch)}</span></a>`; }))
    .join('');
  $('#tapeTrack').innerHTML = items + items;
}

// ---------- sparkline ----------
function spark(canvas, c) {
  const pts = c.trades.slice(-60).map(t => t.p);
  if (pts.length < 2) pts.unshift(c.pxLaunchUsd);
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth || 240, h = canvas.clientHeight || 46;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const x = canvas.getContext('2d'); x.scale(dpr, dpr);
  const mn = Math.min(...pts), mx = Math.max(...pts), rg = mx - mn || mx * 0.01 || 1;
  const up = pts[pts.length - 1] >= pts[0];
  const col = getComputedStyle(document.documentElement).getPropertyValue(up ? '--up' : '--down').trim();
  const X = i => (i / (pts.length - 1)) * (w - 4) + 2, Y = v => h - 4 - ((v - mn) / rg) * (h - 8);
  x.beginPath(); pts.forEach((v, i) => i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)));
  x.strokeStyle = col; x.lineWidth = 1.6; x.lineJoin = 'round'; x.stroke();
  x.lineTo(X(pts.length - 1), h); x.lineTo(X(0), h); x.closePath();
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, col + '33'); g.addColorStop(1, col + '00'); x.fillStyle = g; x.fill();
  x.beginPath(); x.arc(X(pts.length - 1), Y(pts[pts.length - 1]), 2.6, 0, 7); x.fillStyle = col; x.fill();
}
function drawSparks() { $$('canvas[data-spark]').forEach(cv => { const c = S.coins[cv.dataset.spark]; if (c) spark(cv, c); }); }

// ---------- cards ----------
function card(c) {
  const ch = change24(c);
  return `<article class="card" data-go="#/coin/${c.id}" data-coin="${c.id}" tabindex="0" role="link" aria-label="${esc(c.name)}">
    <div class="row">${logo(c)}<div class="nm"><h3>${esc(c.name)}</h3><div class="micro mono">${esc(c.sym)} · ${esc(c.app)}</div></div>${starBtn(c.id)}</div>
    <div class="row" style="justify-content:space-between"><span class="pairtag">${esc(c.sym)} / ${c.co}</span><div class="px"><div class="p" data-px>${money(priceUsd(c), { co: c.co })}</div><div class="micro mono ${cls(ch)}" data-ch>${pct(ch)}</div></div></div>
    <canvas data-spark="${c.id}" aria-hidden="true"></canvas>
    ${c.graduated ? `<div class="foot"><span class="pill grad">Graduated · pool locked</span><span>mcap ${money(mcapUsd(c), { compact: 1 })}</span></div>`
      : `<div><div class="prog"><i style="width:${(progress(c) * 100).toFixed(1)}%"></i></div><div class="foot" style="margin-top:7px"><span>${(progress(c) * 100).toFixed(1)}% to graduation</span><span>vol ${money(vol24(c), { compact: 1 })}</span></div></div>`}
  </article>`;
}

// ---------- routing ----------
function routeParts() { return (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean).map(decodeURIComponent); }
let chart = null, chartSeries = null, volSeries = null, chartCoin = null, chartTf = store('sc.tf') || 300;
function render() {
  destroyChart();
  coinPaint = null; lowTab = 'trades';
  const [p, a] = routeParts();
  renderNav();
  const view = $('#view');
  const pages = { '': home, pairs, unclaimed, beat, watch, legs, launch, account, treasury, docs, security, coin };
  const fn = pages[p || ''];
  view.innerHTML = '';
  if (!fn) { view.innerHTML = `<div class="empty"><h2>Nothing here</h2><p>That page does not exist.</p><a class="btn primary" href="#/">Back to the board</a></div>`; return; }
  fn(view, a);
  drawSparks();
  document.title = 'Sharecurve' + (p ? ' · ' + (p === 'coin' && S.coins[a] ? S.coins[a].sym : (NAV.find(n => n[0] === p) || [0, TITLES[p] || p])[1]) : '');
}
window.addEventListener('hashchange', () => { closeModal(); window.scrollTo(0, 0); render(); });

// ---------- pages ----------
function home(v) {
  const coins = Object.values(S.coins);
  const vol = coins.reduce((s, c) => s + vol24(c), 0);
  const grads = coins.filter(c => c.graduated).length;
  const held = coins.reduce((s, c) => s + Math.max(0, c.vq - c.vq0) * S.stocks[c.co].px, 0);
  const word = 'sharecurve';
  v.innerHTML = `<section class="dusk" aria-label="Sharecurve">
    <div class="dusk-top">
      <span class="eyebrow"><span class="live-dot"></span>Demo network · live</span>
      <p class="lede">Launch a coin priced in shares of the company behind the app. Instagram trades against <em>META</em>, YouTube against <em>GOOGL</em>, Netflix against <em>NFLX</em>. Every buy puts the stock itself into the curve.</p>
      <div class="dusk-pair" aria-hidden="true"><span class="pd" id="pd"><b>Instagram</b>→<i>META</i></span><span>the curve holds the stock</span></div>
      <div class="cta"><a class="btn white big" href="#/launch">Launch a coin</a><a class="btn glass big" href="#/docs/pairing">How pairing works</a></div>
    </div>
    <div class="dusk-word" aria-hidden="true">${word.split('').map((ch, i) => `<span style="animation-delay:${0.15 + i * 0.045}s">${ch}</span>`).join('')}</div>
    <a class="dusk-card" id="duskCard" href="#/"></a>
  </section>
  <div class="stats">
    <div class="stat"><div class="eyebrow">24h volume</div><div class="v" data-count="${vol}" data-fmt="money">${money(vol, { compact: 1 })}</div></div>
    <div class="stat"><div class="eyebrow">Coins live</div><div class="v" data-count="${coins.length}">${coins.length}</div></div>
    <div class="stat"><div class="eyebrow">Stock held by curves</div><div class="v" data-count="${held}" data-fmt="money">${money(held, { compact: 1 })}</div></div>
    <div class="stat"><div class="eyebrow">Graduated</div><div class="v" data-count="${grads}">${grads}</div></div>
  </div>
  <div class="feed" id="feed" aria-label="Latest trades"></div>
  <div class="bar"><div class="seg" role="tablist" id="boardTabs">${[['hot', 'Hot'], ['new', 'New'], ['near', 'Near graduation'], ['grad', 'Graduated'], ['beat', 'Beating stock']].map(([k2, l]) => `<button role="tab" data-t="${k2}" class="${ui.boardTab === k2 ? 'on' : ''}">${l}</button>`).join('')}</div>
  <input class="search" id="boardQ" placeholder="Filter by name, app or ticker" value="${esc(ui.boardQ)}" aria-label="Filter coins"></div>
  <div class="grid" id="board"></div>`;
  countUp(v);
  cyclePair();
  paintDuskCard();
  const recent = coins.flatMap(c => c.trades.slice(-3).map(t => ({ c, t }))).sort((a, b) => b.t.t - a.t.t).slice(0, 14);
  $('#feed').innerHTML = recent.map(x => feedItem(x.c, x.t)).join('');
  const paint = () => {
    const q = ui.boardQ.toLowerCase();
    let list = coins.filter(c => !q || (c.name + ' ' + c.sym + ' ' + c.app + ' ' + c.co).toLowerCase().includes(q));
    const t = ui.boardTab;
    if (t === 'hot') list.sort((a, b) => vol24(b) - vol24(a));
    if (t === 'new') list.sort((a, b) => b.created - a.created);
    if (t === 'near') list = list.filter(c => !c.graduated).sort((a, b) => progress(b) - progress(a));
    if (t === 'grad') list = list.filter(c => c.graduated);
    if (t === 'beat') list.sort((a, b) => excess(b) - excess(a));
    $('#board').innerHTML = list.length ? list.map(card).join('') : `<div class="empty" style="grid-column:1/-1">${t === 'grad' ? 'No coin has filled its curve yet. The closest ones are under Near graduation.' : 'No coins match.'} <a class="btn primary" href="#/launch">Launch one</a></div>`;
    drawSparks();
  };
  $('#boardTabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; ui.boardTab = b.dataset.t; store('sc.tab', ui.boardTab); $$('#boardTabs button').forEach(x => x.classList.toggle('on', x === b)); paint(); };
  $('#boardQ').oninput = e => { ui.boardQ = e.target.value; paint(); };
  paint();
}
function feedItem(c, t) {
  return `<a href="#/coin/${c.id}">${logo(c, 'sm')}<span class="${t.side === 'buy' ? 'up' : 'down'}">${t.side === 'buy' ? 'bought' : 'sold'}</span><b class="mono">${money(t.usd)}</b><span class="muted">of ${esc(c.sym)}</span></a>`;
}
function paintDuskCard() {
  const el = $('#duskCard'); if (!el) return;
  const c = Object.values(S.coins).sort((a, b) => change24(b) - change24(a))[0]; if (!c) return;
  const ch = change24(c);
  el.href = '#/coin/' + c.id;
  el.innerHTML = `<span class="lbl">Top mover · 24h</span>${logo(c, 'sm')}<span><b>${esc(c.name)}</b><span class="mono">${money(priceUsd(c), { co: c.co })} <span class="${cls(ch)}">${pct(ch)}</span></span></span><span class="go" aria-hidden="true">→</span>`;
}
let pdTimer;
function cyclePair() {
  clearInterval(pdTimer); let i = 0;
  const pairs = [['Instagram', 'META'], ['YouTube', 'GOOGL'], ['Netflix', 'NFLX'], ['Spotify', 'SPOT'], ['Duolingo', 'DUOL'], ['Twitch', 'AMZN']];
  pdTimer = setInterval(() => { const el = $('#pd'); if (!el) return clearInterval(pdTimer); i = (i + 1) % pairs.length; el.innerHTML = `<b>${pairs[i][0]}</b>→<i>${pairs[i][1]}</i>`; el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); }, 2200);
}

// ---------- page background photo: slow drift, plus parallax from the pointer and the scroll ----------
function bindPhoto(sec) {
  const img = sec && sec.querySelector('img'); if (!img) return;
  const done = () => sec.classList.add('loaded');
  if (img.complete && img.naturalWidth) done(); else { img.addEventListener('load', done); img.addEventListener('error', () => sec.classList.add('noimg')); }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
  const step = () => { x += (tx - x) * .08; y += (ty - y) * .08; img.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`; if (Math.abs(tx - x) + Math.abs(ty - y) > .05) raf = requestAnimationFrame(step); else raf = 0; };
  let px = 0, py = 0, sy = 0;
  const aim = () => { tx = px; ty = py - Math.min(28, sy * .03); if (!raf) raf = requestAnimationFrame(step); };
  window.addEventListener('pointermove', e => { px = -(e.clientX / innerWidth - .5) * 24; py = -(e.clientY / innerHeight - .5) * 16; aim(); }, { passive: true });
  window.addEventListener('scroll', () => { sy = scrollY; aim(); }, { passive: true });
}
function countUp(root) {
  $$('[data-count]', root).forEach(el => {
    const end = +el.dataset.count, fm = el.dataset.fmt, t0 = performance.now(), d = 900;
    const f = v => fm === 'money' ? money(v, { compact: 1 }) : Math.round(v).toString();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const step = t => { const k2 = clamp((t - t0) / d, 0, 1), e = 1 - Math.pow(1 - k2, 3); el.textContent = f(end * e); if (k2 < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
// coin return in shares of the stock since launch = how much it beat the stock
function excess(c) { return priceShares(c) / (c.vq0 / VT0) - 1; }

function pairs(v, sym) {
  if (sym && CO[sym]) return pairDetail(v, sym);
  const rows = COMPANIES.map(c => {
    const coins = Object.values(S.coins).filter(x => x.co === c.sym);
    const held = coins.reduce((s, x) => s + Math.max(0, x.vq - x.vq0), 0);
    return { c, coins, held };
  }).sort((a, b) => b.held - a.held);
  v.innerHTML = `<div class="page-head"><span class="eyebrow">Pairs</span><h1>Every company, every app</h1><p>A coin is paired to the company that owns its app. The curve's reserve is shares of that company, tokenized one to one, so buying the coin is also buying the stock.</p></div>
  <div class="tbl-wrap"><table><thead><tr><th>Company</th><th class="r">Share price</th><th class="r">Today</th><th>Apps</th><th class="r">Coins</th><th class="r">Shares in curves</th></tr></thead><tbody>
  ${rows.map(({ c, coins, held }) => { const ch = stockChg(c.sym); return `<tr class="link" data-go="#/pairs/${c.sym}"><td><div class="cell-co">${coLogo(c.sym)}<div><b>${c.sym}</b><div class="micro">${esc(c.name)}</div></div></div></td><td class="r mono">${money(S.stocks[c.sym].px)}</td><td class="r mono ${cls(ch)}">${pct(ch)}</td><td class="micro">${c.apps.map(esc).join(', ')}</td><td class="r mono">${coins.length}</td><td class="r mono">${held.toFixed(2)}</td></tr>`; }).join('')}
  </tbody></table></div>`;
}
function pairDetail(v, sym) {
  const c = CO[sym]; const coins = Object.values(S.coins).filter(x => x.co === sym);
  const claimed = new Set(coins.map(x => x.app));
  const ch = stockChg(sym);
  v.innerHTML = `<div class="coin-top">${coLogo(sym, 'lg')}<div class="t"><span class="eyebrow"><a href="#/pairs">Pairs</a> / ${sym}</span><h1 style="font-size:36px">${esc(c.name)}</h1></div><div class="price"><div class="p mono">${money(S.stocks[sym].px)}</div><div class="mono ${cls(ch)}">${pct(ch)} today</div></div></div>
  <div class="shead"><h2>Coins paired to ${sym}</h2><span class="micro">${coins.length} live</span></div>
  ${coins.length ? `<div class="grid">${coins.map(card).join('')}</div>` : `<div class="empty">No ${sym} coins yet.</div>`}
  <div class="shead"><h2>Apps</h2></div>
  <div class="tbl-wrap"><table><tbody>${c.apps.map(a => `<tr><td><b>${esc(a)}</b></td><td class="r">${claimed.has(a) ? '<span class="pill up">Claimed</span>' : `<a class="btn ghost" href="#/launch/${encodeURIComponent(a)}">Launch ${esc(a)}</a>`}</td></tr>`).join('')}</tbody></table></div>`;
}

function unclaimed(v) {
  const claimed = new Set(Object.values(S.coins).map(c => c.app));
  const open = APPS.filter(a => !claimed.has(a.app));
  v.innerHTML = `<div class="page-head"><span class="eyebrow">Unclaimed</span><h1>${open.length} apps with no coin yet</h1><p>The first coin launched for an app takes its slot on the board. Pick one and it arrives on the launch form with the pair filled in.</p></div>
  <div class="grid">${open.map(a => `<article class="card"><div class="row">${coLogo(a.co, '')}<div class="nm"><h3>${esc(a.app)}</h3><div class="micro mono">pairs with ${a.co}</div></div></div><div class="foot"><span>${money(S.stocks[a.co].px)} / share</span><a class="btn ghost" href="#/launch/${encodeURIComponent(a.app)}">Launch</a></div></article>`).join('')}</div>`;
}

function beat(v) {
  const list = Object.values(S.coins).map(c => ({ c, coinUsd: priceUsd(c) / c.pxLaunchUsd - 1, stock: S.stocks[c.co].px / c.stockLaunch - 1, ex: excess(c) })).sort((a, b) => b.ex - a.ex);
  const winners = list.filter(x => x.ex > 0).length;
  v.innerHTML = `<div class="page-head"><span class="eyebrow">Scoreboard</span><h1>${winners} of ${list.length} coins are beating their stock</h1><p>A coin's dollar return is its return in shares times the stock's return. The column that matters is the first one: how far the coin moved against the stock it is paired with.</p></div>
  <div class="tbl-wrap"><table><thead><tr><th>#</th><th>Coin</th><th class="r">vs stock</th><th class="r">Coin in ${ui.ccy === 'SHARES' ? 'USD' : ui.ccy}</th><th class="r">Stock since launch</th><th class="r">Age</th></tr></thead><tbody>
  ${list.map((x, i) => `<tr class="link" data-go="#/coin/${x.c.id}"><td class="mono muted">${i + 1}</td><td><div class="cell-co">${logo(x.c, 'sm')}<div><b>${esc(x.c.sym)}</b> <span class="micro">/ ${x.c.co}</span></div></div></td><td class="r mono ${cls(x.ex)}"><b>${pct(x.ex)}</b></td><td class="r mono ${cls(x.coinUsd)}">${pct(x.coinUsd)}</td><td class="r mono ${cls(x.stock)}">${pct(x.stock)}</td><td class="r mono muted">${ago(x.c.created)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function watch(v) {
  const list = ui.watch.map(id => S.coins[id]).filter(Boolean);
  v.innerHTML = `<div class="page-head"><span class="eyebrow">Watchlist</span><h1>Coins you are watching</h1><p>Star any coin to keep it here. The list lives in this browser only.</p></div>
  ${list.length ? `<div class="grid">${list.map(card).join('')}</div>` : `<div class="empty"><p>Nothing starred yet. Tap the star on any coin card.</p><a class="btn primary" href="#/">Browse the board</a></div>`}`;
}

function legs(v) {
  v.innerHTML = `<div class="page-head"><span class="eyebrow">Two legs</span><h1>One coin, two moves</h1><p>Holding a paired coin is two positions stacked. Leg one is the coin against its stock. Leg two is the stock against the dollar. Slide both to see what you actually take home.</p></div>
  <div class="two">
    <div class="panel"><div class="field"><label for="lgCoin"><span>Coin vs stock</span><b class="mono" id="lgCoinV"></b></label><input type="range" id="lgCoin" min="-90" max="400" value="60"></div>
      <div class="field"><label for="lgStock"><span>Stock vs dollar</span><b class="mono" id="lgStockV"></b></label><input type="range" id="lgStock" min="-50" max="80" value="-10"></div>
      <div class="field"><label for="lgIn"><span>Position size</span></label><div class="inp"><input id="lgIn" inputmode="decimal" value="1000"><span>USD</span></div></div></div>
    <div class="panel"><div class="eyebrow">Result</div><div class="mono" style="font-size:40px;font-weight:600;margin:10px 0" id="lgOut"></div>
      <div class="kv"><span>Coin leg only</span><span id="lgA"></span></div><div class="kv"><span>Stock leg only</span><span id="lgB"></span></div><div class="kv"><span>Formula</span><span>(1 + a) × (1 + b) − 1</span></div>
      <p class="hint" style="margin-top:10px">If the coin gains against the stock but the stock falls, you can still lose dollars. That is the trade.</p></div>
  </div>`;
  const upd = () => {
    const a = +$('#lgCoin').value / 100, b = +$('#lgStock').value / 100, n = parseFloat($('#lgIn').value) || 0;
    const r = (1 + a) * (1 + b) - 1;
    $('#lgCoinV').textContent = pct(a); $('#lgStockV').textContent = pct(b);
    $('#lgOut').innerHTML = `<span class="${cls(r)}">${pct(r)}</span>`;
    $('#lgA').textContent = money(n * (1 + a)); $('#lgB').textContent = money(n * (1 + b));
  };
  ['lgCoin', 'lgStock', 'lgIn'].forEach(id => $('#' + id).oninput = upd); upd();
}

function launch(v, preApp) {
  const draft = store('sc.draft') || {};
  const app = preApp || draft.app || 'Instagram';
  const claimed = new Set(Object.values(S.coins).map(c => c.app));
  v.innerHTML = `<div class="page-head"><span class="eyebrow">Launch</span><h1>Launch a paired coin</h1><p>Pick the app. The pair is set by who owns it. One billion coins exist, eight hundred million sit on the curve, and the pool locks when they are gone.</p></div>
  <div class="coin-grid">
  <form class="panel" id="lf" novalidate>
    <div class="two"><div class="field"><label for="lfName">Name</label><input class="tx" id="lfName" maxlength="32" placeholder="Grid Gremlin" value="${esc(draft.name || '')}"></div>
    <div class="field"><label for="lfSym">Ticker</label><input class="tx mono" id="lfSym" maxlength="8" placeholder="GRID" value="${esc(draft.sym || '')}" style="text-transform:uppercase"></div></div>
    <div class="field"><label for="lfApp"><span>App</span><span id="lfPair" class="pairtag"></span></label><select class="tx" id="lfApp">${COMPANIES.map(c => `<optgroup label="${c.sym} · ${esc(c.name)}">${c.apps.map(a => `<option value="${esc(a)}" ${a === app ? 'selected' : ''}>${esc(a)}${claimed.has(a) ? ' (has a coin)' : ''}</option>`).join('')}</optgroup>`).join('')}</select></div>
    <div class="field"><label for="lfDesc">Description</label><textarea class="ta" id="lfDesc" maxlength="200" placeholder="One line on why this coin exists">${esc(draft.desc || '')}</textarea></div>
    <div class="field"><label for="lfTax"><span>Creator tax</span><b class="mono" id="lfTaxV"></b></label><input type="range" id="lfTax" min="0" max="200" step="25" value="${draft.tax != null ? draft.tax : 50}"><span class="hint">Paid to you on every curve trade, on top of the 1% curve fee. Stops at graduation.</span></div>
    <div class="field"><label>Image</label><div class="drop" id="lfDrop" tabindex="0" role="button" aria-label="Upload image"><span id="lfImgPrev">${logo({ sym: 'IMG', co: appCo(app) || 'META' })}</span><span><b>Drop an image or click</b><br><span class="hint">PNG, JPG, GIF or WebP. Cropped square to 160px.</span></span></div><input type="file" id="lfFile" accept="image/*" hidden></div>
    <div class="field"><label for="lfBuy"><span>First buy (optional)</span><span id="lfBuyGet" class="mono"></span></label><div class="inp"><input id="lfBuy" inputmode="decimal" placeholder="0" value="${esc(draft.buy || '')}"><span>USD</span></div></div>
    <div class="err" id="lfErr"></div>
    <button class="btn primary big" type="submit" style="width:100%">Launch coin</button>
  </form>
  <div><div class="panel" id="lfPrev"></div><div class="panel"><div class="eyebrow">Launch terms</div>
    <div class="kv"><span>Total supply</span><span>1,000,000,000</span></div><div class="kv"><span>On the curve</span><span>800,000,000</span></div><div class="kv"><span>Into the locked pool</span><span>200,000,000</span></div><div class="kv"><span>Starting value</span><span id="lfStart"></span></div><div class="kv"><span>Launch cost</span><span>Free</span></div></div></div>
  </div>`;
  let img = draft.img || null;
  const f = $('#lf');
  const val = () => ({ name: $('#lfName').value.trim(), sym: $('#lfSym').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''), app: $('#lfApp').value, desc: $('#lfDesc').value.trim(), tax: +$('#lfTax').value, buy: $('#lfBuy').value.trim(), img });
  const prev = () => {
    const d = val(); const co = appCo(d.app);
    store('sc.draft', d);
    $('#lfPair').textContent = d.app + ' → ' + co;
    $('#lfTaxV').textContent = (d.tax / 100).toFixed(2) + '%';
    $('#lfStart').textContent = money(SEED_USD, { compact: 1 }) + ' in ' + co;
    const fake = { id: 'preview', name: d.name || 'Your coin', sym: d.sym || 'TICKER', app: d.app, co, img: d.img, trades: [], pxLaunchUsd: SEED_USD / VT0, vq: SEED_USD / S.stocks[co].px, vt: VT0, vq0: SEED_USD / S.stocks[co].px, sold: 0, graduated: false, tax: d.tax / 1e4 };
    const usd = parseFloat(d.buy) || 0;
    const q = usd > 0 ? quoteBuy(fake, usd / S.stocks[co].px) : null;
    $('#lfBuyGet').textContent = q ? '≈ ' + tok(q.out) + ' ' + (d.sym || 'coins') : '';
    $('#lfImgPrev').innerHTML = logo({ sym: d.sym || 'IMG', co, img: d.img });
    $('#lfPrev').innerHTML = `<div class="eyebrow" style="margin-bottom:10px">Preview</div>` + card(fake).replace('data-go="#/coin/preview"', '').replace(/<button class="starbtn[\s\S]*?<\/button>/, '');
    drawSparks();
  };
  f.oninput = prev; f.onchange = prev;
  const drop = $('#lfDrop'), file = $('#lfFile');
  drop.onclick = () => file.click();
  drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) readImg(e.dataTransfer.files[0]); };
  file.onchange = () => { if (file.files[0]) readImg(file.files[0]); };
  function readImg(fl) {
    if (!/^image\//.test(fl.type)) { $('#lfErr').textContent = 'That file is not an image. Use PNG, JPG, GIF or WebP.'; return; }
    if (fl.size > 8e6) { $('#lfErr').textContent = 'Image is over 8 MB. Pick a smaller one.'; return; }
    const r = new FileReader();
    r.onload = () => { const im = new Image(); im.onload = () => { const cv = document.createElement('canvas'); cv.width = cv.height = 160; const s = Math.min(im.width, im.height); cv.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 160, 160); img = cv.toDataURL('image/jpeg', 0.85); $('#lfErr').textContent = ''; prev(); }; im.onerror = () => { $('#lfErr').textContent = 'Could not read that image.'; }; im.src = r.result; };
    r.readAsDataURL(fl);
  }
  f.onsubmit = e => {
    e.preventDefault();
    const d = val(); const err = $('#lfErr');
    if (d.name.length < 2) return err.textContent = 'Give the coin a name of at least 2 characters.';
    if (d.sym.length < 2 || d.sym.length > 8) return err.textContent = 'Tickers are 2 to 8 letters or digits.';
    if (Object.values(S.coins).some(c => c.sym === d.sym && c.co === appCo(d.app))) return err.textContent = `${d.sym} is already paired with ${appCo(d.app)}. Pick another ticker.`;
    const usd = parseFloat(d.buy) || 0;
    if (usd < 0) return err.textContent = 'First buy cannot be negative.';
    if (!W) return openConnect(() => { const nf = $('#lf'); if (nf) nf.requestSubmit(); });
    if (usd > W.usd) return err.textContent = `First buy is more than your ${money(W.usd)} balance.`;
    const c = makeCoin(S, { name: d.name, sym: d.sym, app: d.app, co: appCo(d.app), desc: d.desc, tax: d.tax / 1e4, img: d.img, creator: W.addr });
    W.launched = (W.launched || []).concat(c.id);
    if (usd > 0) { const q = tradeBuy(S, c, usd / S.stocks[c.co].px, W.addr); if (q) W.usd -= usd - q.refund * S.stocks[c.co].px; }
    store('sc.draft', null); save(); toast(`${c.sym} is live, paired with ${c.co}`);
    location.hash = '#/coin/' + c.id;
  };
  prev();
}

function account(v) {
  if (!W) { v.innerHTML = `<div class="page-head"><span class="eyebrow">Account</span><h1>Connect to see your coins</h1></div><div class="empty"><p>Your balances, positions and launches show up here.</p><button class="btn primary" id="accConn" type="button">Connect</button></div>`; $('#accConn').onclick = () => openConnect(); return; }
  const pos = Object.values(S.coins).filter(c => (c.holders[W.addr] || 0) > 0).map(c => { const b = c.holders[W.addr]; const val2 = sellValueUsd(c, b); return { c, b, val: val2 }; });
  const total = pos.reduce((s, p) => s + p.val, 0);
  const mine = (W.launched || []).map(id => S.coins[id]).filter(Boolean);
  v.innerHTML = `<div class="page-head"><span class="eyebrow">Account · ${esc(walletLabel(W))}${W.signed ? ' · signed in' : ''}</span><h1 class="mono" style="font-size:clamp(22px,4vw,34px);word-break:break-all">${esc(W.addr)}</h1></div>
  <div class="stats" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:26px">
    <div class="stat"><div class="eyebrow">Cash</div><div class="v">${money(W.usd)}</div></div>
    <div class="stat"><div class="eyebrow">Positions (if sold now)</div><div class="v">${money(total)}</div></div>
    <div class="stat"><div class="eyebrow">Net vs start</div><div class="v ${cls(W.usd + total - START_USD)}">${money(W.usd + total - START_USD)}</div></div>
    ${W.kind === 'evm' ? `<div class="stat"><div class="eyebrow">On-chain · ${esc(chainName(W.chainId))}</div><div class="v">${fmtNative()}</div></div>` : ''}
  </div>
  <div class="bar" style="margin:-10px 0 24px">${W.kind !== 'demo' ? `<button class="btn primary" id="accSign" type="button">${W.signed ? 'Signed in · sign again' : 'Sign in with wallet'}</button>` : ''}<button class="btn ghost" id="accCopy" type="button">Copy address</button><button class="btn ghost" id="accDisc" type="button">Disconnect</button></div>
  <div class="shead"><h2>Positions</h2></div>
  ${pos.length ? `<div class="tbl-wrap"><table><thead><tr><th>Coin</th><th class="r">Balance</th><th class="r">Price</th><th class="r">Sell value</th></tr></thead><tbody>${pos.map(p => `<tr class="link" data-go="#/coin/${p.c.id}"><td><div class="cell-co">${logo(p.c, 'sm')}<b>${esc(p.c.sym)}</b><span class="micro">/ ${p.c.co}</span></div></td><td class="r mono">${tok(p.b)}</td><td class="r mono">${money(priceUsd(p.c), { co: p.c.co })}</td><td class="r mono">${money(p.val)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">No positions yet. <a class="btn ghost" href="#/">Find a coin</a></div>`}
  <div class="shead"><h2>Your launches</h2></div>
  ${mine.length ? `<div class="grid">${mine.map(card).join('')}</div>` : `<div class="empty">You have not launched anything. <a class="btn ghost" href="#/launch">Launch a coin</a></div>`}
  ${mine.length ? `<p class="micro" style="margin-top:10px">Creator tax earned: <b class="mono">${money(mine.reduce((s, c) => s + c.creatorEarned, 0))}</b></p>` : ''}
  <div class="shead"><h2>Demo controls</h2></div>
  <div class="panel"><p class="hint">Reset wipes the whole demo ledger and your wallet in this browser, then rebuilds the starting board.</p><div class="bar" style="margin:12px 0 0"><button class="btn ghost" id="rst1" type="button">Reset demo</button><span id="rstC" hidden><button class="btn primary" id="rst2" type="button" style="background:var(--down)">Yes, wipe everything</button></span></div></div>`;
  if ($('#accSign')) $('#accSign').onclick = () => activeProvider ? signIn() : resumeWallet().then(() => activeProvider ? signIn() : toast('Open your wallet extension and connect again.'));
  $('#accCopy').onclick = () => copyText(W.addr, 'Address copied');
  $('#accDisc').onclick = () => dropWallet('Disconnected');
  $('#rst1').onclick = () => { $('#rstC').hidden = false; $('#rst1').textContent = 'Keep my data'; $('#rst1').onclick = () => render(); };
  $('#rst2').onclick = () => { S = freshLedger(); W = null; activeProvider = null; ui.watch = []; store('sc.wallets', {}); store('sc.watch', []); save(); renderConnect(); toast('Demo reset'); location.hash = '#/'; render(); };
}
function sellValueUsd(c, b) { const q = quoteSell(c, b); return Math.max(0, q.out) * S.stocks[c.co].px; }

function treasury(v) {
  const t = S.treasury;
  const byCo = COMPANIES.map(c => ({ c, sh: Object.values(S.coins).filter(x => x.co === c.sym).reduce((s, x) => s + Math.max(0, x.vq - x.vq0), 0) })).filter(x => x.sh > 0).sort((a, b) => b.sh * S.stocks[b.c.sym].px - a.sh * S.stocks[a.c.sym].px);
  v.innerHTML = `<div class="page-head"><span class="eyebrow">Treasury</span><h1>Where the fees go</h1><p>The 1% curve fee is collected in the paired stock and swept to the treasury. These figures come straight from the demo ledger.</p></div>
  <div class="stats" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:26px">
    <div class="stat"><div class="eyebrow">Fees collected</div><div class="v">${money(t.usd)}</div></div>
    <div class="stat"><div class="eyebrow">Curve trades</div><div class="v">${t.trades.toLocaleString()}</div></div>
    <div class="stat"><div class="eyebrow">Graduations</div><div class="v">${t.graduations}</div></div>
  </div>
  <div class="shead"><h2>Stock held by curves and pools</h2></div>
  <div class="tbl-wrap"><table><thead><tr><th>Stock</th><th class="r">Shares</th><th class="r">Value</th></tr></thead><tbody>${byCo.map(x => `<tr><td><div class="cell-co">${coLogo(x.c.sym)}<b>${x.c.sym}</b></div></td><td class="r mono">${x.sh.toFixed(3)}</td><td class="r mono">${money(x.sh * S.stocks[x.c.sym].px)}</td></tr>`).join('')}</tbody></table></div>`;
}

const DOCS = {
  pairing: ['How pairing works', () => `<h1>How pairing works</h1>
    <p>Each coin is paired with one stock: the listed company that owns the app the coin is named for. Instagram, WhatsApp and Threads all pair with <strong>META</strong>. YouTube and Gmail pair with <strong>GOOGL</strong>. Apps are fixed to companies in a public table, so nobody picks their own pair.</p>
    <p>The curve does not hold dollars. It holds tokenized shares of the paired stock. When you buy a coin with dollars, the order goes through two legs: dollars buy the stock at the feed price, then the stock buys the coin on the curve. Selling runs the same path backwards.</p>
    <h2>Why pair to a stock</h2>
    <p>A dollar-quoted coin can rise just because the market rises. A stock-quoted coin only rises in shares if people prefer it to the company itself. The <a href="#/beat"><strong>Scoreboard</strong></a> ranks coins by that number.</p>
    <pre>coin in dollars = coin in shares × share price</pre>`],
  curve: ['Supply and curve', () => `<h1>Supply and curve</h1>
    <p>Every coin has a fixed supply of <strong>1,000,000,000</strong>. The curve sells <strong>800,000,000</strong>. The remaining 200,000,000 go into a pool with the curve's stock at graduation, and that pool's liquidity is locked.</p>
    <p>The curve is a constant product over virtual reserves. It starts with ${money(SEED_USD)} worth of the paired stock as a virtual reserve against 1,073,000,000 virtual coins.</p>
    <pre>k      = Q₀ × T₀
price  = Q / T            (in shares)
buy    : T' = k / (Q + dQ),   coins out = T − T'
sell   : Q' = k / (T + dT),   shares out = Q − Q'</pre>
    <div class="curve-fig"><canvas id="curveCv" aria-label="Price along the curve as supply sells"></canvas><p class="micro" style="margin-top:6px">Price in shares, as a multiple of the launch price, against coins sold. It ends near ${(Math.pow(VT0 / (VT0 - CURVE), 2)).toFixed(1)}× at graduation.</p></div>
    <p>A buy that would cross the 800,000,000 line is filled up to the line and the rest is refunded.</p>`],
  fees: ['Fees', () => `<h1>Fees</h1><ul>
    <li><strong>Curve fee: 1%</strong> of every buy and sell, taken in the paired stock and sent to the <a href="#/treasury">treasury</a>.</li>
    <li><strong>Creator tax: 0% to 2%</strong>, chosen at launch and fixed after. Paid to the creator's address on every curve trade.</li>
    <li><strong>After graduation:</strong> the pool charges 1% and the creator tax stops.</li>
    <li><strong>Launch:</strong> free. You only pay for the first buy if you make one.</li></ul>`],
  feed: ['Price feed', () => `<h1>Price feed</h1>
    <p>The dollar leg uses a price feed for each stock. On this demo network the feed is simulated: each stock takes a small random step every few seconds from a recent reference price. It is marked as simulated everywhere a stock price appears in dollars.</p>
    <p>Curve prices never read the feed. A coin's price in shares only moves when someone trades that coin. The feed only changes how that price reads in dollars.</p>
    <div class="tbl-wrap"><table><tbody>${COMPANIES.slice(0, 6).map(c => `<tr><td><b>${c.sym}</b></td><td class="r mono">${money(S.stocks[c.sym].px)}</td></tr>`).join('')}</tbody></table></div>`],
};
function docs(v, page) {
  page = DOCS[page] ? page : 'pairing';
  v.innerHTML = `<div class="docs"><aside>${Object.entries(DOCS).map(([k2, d]) => `<a href="#/docs/${k2}" class="${k2 === page ? 'on' : ''}">${d[0]}</a>`).join('')}</aside><article class="prose">${DOCS[page][1]()}</article></div>`;
  if (page === 'curve') drawCurve($('#curveCv'));
}
function drawCurve(cv) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr;
  const x = cv.getContext('2d'); x.scale(dpr, dpr);
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const pad = { l: 40, r: 12, t: 12, b: 24 }, top = Math.pow(VT0 / (VT0 - CURVE), 2);
  const X = s => pad.l + (s / CURVE) * (w - pad.l - pad.r), Y = m => h - pad.b - ((m - 1) / (top - 1)) * (h - pad.t - pad.b);
  x.font = '11px IBM Plex Mono, monospace'; x.fillStyle = css('--ink-3'); x.strokeStyle = css('--rule');
  [1, Math.round(top / 2), Math.floor(top)].forEach(m => { x.beginPath(); x.moveTo(pad.l, Y(m)); x.lineTo(w - pad.r, Y(m)); x.stroke(); x.fillText(m + '×', 6, Y(m) + 4); });
  ['0', '400M', '800M'].forEach((l, i) => x.fillText(l, X(i * 4e8) - (i === 2 ? 30 : i ? 14 : 0), h - 6));
  x.beginPath(); for (let i = 0; i <= 100; i++) { const s = CURVE * i / 100, T = VT0 - s, m = Math.pow(VT0 / T, 2); i ? x.lineTo(X(s), Y(m)) : x.moveTo(X(s), Y(m)); }
  x.strokeStyle = css('--accent'); x.lineWidth = 2; x.stroke();
}

function security(v) {
  v.innerHTML = `<div class="page-head"><span class="eyebrow">Security</span><h1>What can and cannot happen</h1></div>
  <div class="prose">
    <h2>Fixed at launch</h2><ul><li>Supply is minted once. Nobody can mint more.</li><li>The pair comes from the app table. The creator cannot choose a different stock.</li><li>Creator tax is capped at 2% and cannot be raised after launch.</li></ul>
    <h2>At graduation</h2><ul><li>The curve's stock and the last 200,000,000 coins form a pool.</li><li>Pool liquidity is locked. There is no withdraw path for anyone, including the team.</li></ul>
    <h2>This site</h2><ul><li>This build runs on a local demo ledger in your browser. No real assets move and no keys are requested.</li><li>A browser wallet is only used to read your address. It is never asked to sign a transaction.</li><li>The code is MIT licensed. <button class="foot-link" type="button" data-modal="license" style="color:var(--accent)">Read the license</button>.</li></ul>
  </div>`;
}

// ---------- coin page ----------
function coin(v, id) {
  const c = S.coins[id];
  if (!c) { v.innerHTML = `<div class="empty"><h2>Coin not found</h2><p>It may have been removed by a demo reset.</p><a class="btn primary" href="#/">Back to the board</a></div>`; return; }
  let side = 'buy';
  v.innerHTML = `<div class="coin-top">${logo(c, 'lg')}<div class="t"><div class="tags"><span class="pairtag">${esc(c.sym)} / ${c.co}</span><span class="pill">${esc(c.app)}</span>${c.graduated ? '<span class="pill grad">Graduated · pool locked</span>' : ''}${c.tax ? `<span class="pill">creator tax ${(c.tax * 100).toFixed(2)}%</span>` : ''}</div><h1 style="font-size:clamp(28px,4vw,40px)">${esc(c.name)}</h1></div>
    <div class="price"><div class="p" id="cPx">${money(priceUsd(c), { co: c.co })}</div><div class="mono micro" id="cCh"></div></div>${starBtn(c.id)}<button class="icon-btn share-btn" id="shareBtn" type="button" title="Copy link to this coin" aria-label="Copy link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg></button></div>
  <div class="coin-grid"><div>
    <div class="panel"><div class="tf"><div class="seg" id="tfSeg">${[[60, '1m'], [300, '5m'], [900, '15m'], [3600, '1h']].map(([s, l]) => `<button data-s="${s}" class="${chartTf === s ? 'on' : ''}">${l}</button>`).join('')}</div><span class="micro mono">price in ${ui.ccy === 'SHARES' ? c.co + ' shares' : ui.ccy}</span></div><div class="chart-box" id="chartBox"></div></div>
    <div class="panel"><div class="bar" style="justify-content:space-between;margin-bottom:10px"><div class="tabs" id="lowTabs" role="tablist"><button class="on" data-t="trades" role="tab">Trades</button><button data-t="holders" role="tab">Holders</button></div><span class="micro"><span class="live-dot"></span>live</span></div><div id="lowTrades" class="tbl-wrap" style="border:0;background:none"><table class="trades"><thead><tr><th>Side</th><th class="r">${esc(c.sym)}</th><th class="r">Value</th><th class="r">Price</th><th>Trader</th><th class="r">Age</th></tr></thead><tbody id="trBody"></tbody></table></div><div id="lowHolders" hidden></div></div>
  </div><div>
    <div class="panel trade"><div class="seg" id="sideSeg"><button class="on buy" data-side="buy" type="button">Buy</button><button class="sell" data-side="sell" type="button">Sell</button></div>
      <div class="field"><label for="amt"><span id="amtLbl">You pay</span><span id="balLbl" class="mono"></span></label><div class="inp"><input id="amt" inputmode="decimal" placeholder="0.00" autocomplete="off"><span id="amtUnit">USD</span></div><div class="quick" id="quick"></div></div>
      <div class="slip"><span>Max slippage</span><div class="seg" id="slipSeg">${[0.005, 0.01, 0.03].map(v2 => `<button type="button" data-v="${v2}" class="${ui.slip === v2 ? 'on' : ''}">${v2 * 100}%</button>`).join('')}</div></div><div class="quote" id="quote"></div><div class="err" id="tErr"></div>
      <button class="btn primary big" id="tradeBtn" type="button" style="width:100%">Buy ${esc(c.sym)}</button></div>
    <div class="panel"><div class="eyebrow" style="margin-bottom:8px">${c.graduated ? 'Graduated' : 'Bonding curve'}</div>${c.graduated ? `<p class="hint">Graduated ${ago(c.gradAt)} ago. Trades now route through the locked pool.</p>` : `<div class="prog"><i id="cProg" style="width:${progress(c) * 100}%"></i></div><div class="kv"><span>Sold</span><span id="cSold"></span></div>`}
      <div class="kv"><span>Market cap</span><span id="cMcap"></span></div><div class="kv"><span>Stock in curve</span><span id="cRes"></span></div><div class="kv"><span>vs ${c.co} since launch</span><span id="cEx"></span></div><div class="kv"><span>Holders</span><span id="cHold"></span></div><div class="kv"><span>Creator</span><span>${short(c.creator)}</span></div><div class="kv"><span>Launched</span><span>${ago(c.created)} ago</span></div>
      ${c.desc ? `<p class="hint" style="margin-top:10px">${esc(c.desc)}</p>` : ''}</div>
  </div></div>`;
  const amt = $('#amt');
  const setSide = s => { if (s === side && amt.value === '') { amt.focus(); return; } side = s; $$('#sideSeg button').forEach(b => { b.classList.toggle('on', b.dataset.side === s); }); $('#tradeBtn').textContent = (s === 'buy' ? 'Buy ' : 'Sell ') + c.sym; $('#amtUnit').textContent = s === 'buy' ? 'USD' : c.sym; $('#amtLbl').textContent = s === 'buy' ? 'You pay' : 'You sell'; amt.value = ''; paintTrade(); };
  $('#sideSeg').onclick = e => { const b = e.target.closest('button'); if (b) setSide(b.dataset.side); };
  $('#tfSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; chartTf = +b.dataset.s; store('sc.tf', chartTf); $$('#tfSeg button').forEach(x => x.classList.toggle('on', x === b)); feedChart(c, true); };
  $('#quick').onclick = e => { const b = e.target.closest('button'); if (!b) return; if (side === 'buy') amt.value = b.dataset.v; else { const hb = (W && c.holders[W.addr]) || 0; if (!W) return openConnect(); if (!hb) { $('#tErr').textContent = `You hold no ${c.sym} yet. Switch to Buy to get some.`; return; } amt.value = +b.dataset.v === 1 ? String(hb) : String(Math.floor(hb * +b.dataset.v)); } paintTrade(); };
  amt.oninput = () => paintTrade();
  $('#slipSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; ui.slip = +b.dataset.v; store('sc.slip', ui.slip); $$('#slipSeg button').forEach(x => x.classList.toggle('on', x === b)); paintTrade(); };
  $('#lowTabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; lowTab = b.dataset.t; $$('#lowTabs button').forEach(x => x.classList.toggle('on', x === b)); $('#lowTrades').hidden = lowTab !== 'trades'; $('#lowHolders').hidden = lowTab !== 'holders'; refreshCoin(c); };
  $('#shareBtn').onclick = () => { const url = location.href; try { navigator.clipboard.writeText(url).then(() => toast('Link copied'), () => toast(url)); } catch (e2) { toast(url); } };
  coinPaint = () => { if (document.activeElement !== $('#tradeBtn')) paintTrade(true); };
  let quickSide = null;
  let quoted = null;
  amt.onkeydown = e => { if (e.key === 'Enter') $('#tradeBtn').click(); };
  function paintTrade(tick) {
    const px = S.stocks[c.co].px;
    const bal = W ? (side === 'buy' ? W.usd : c.holders[W.addr] || 0) : 0;
    $('#balLbl').textContent = W ? 'Balance ' + (side === 'buy' ? money(bal) : tok(bal)) : '';
    if (quickSide !== side) $('#quick').innerHTML = side === 'buy' ? [25, 100, 500, 1000].map(n => `<button type="button" data-v="${n}">$${n}</button>`).join('') : [[0.25, '25%'], [0.5, '50%'], [1, 'Max']].map(([n, l]) => `<button type="button" data-v="${n}">${l}</button>`).join('');
    const n = parseFloat(amt.value) || 0;
    quickSide = side;
    const err = $('#tErr'); if (!tick) err.textContent = '';
    let q = null;
    if (n > 0) q = side === 'buy' ? quoteBuy(c, n / px) : quoteSell(c, n);
    quoted = q ? { side, n, out: q.out } : null;
    const btn = $('#tradeBtn');
    if (!W) { btn.textContent = 'Connect to trade'; btn.disabled = false; }
    else { btn.textContent = (side === 'buy' ? 'Buy ' : 'Sell ') + c.sym; btn.disabled = !(n > 0); }
    if (W && n > 0 && n > bal + 1e-9) { err.textContent = side === 'buy' ? `You have ${money(bal)}. Lower the amount.` : `You hold ${tok(bal)} ${c.sym}. Lower the amount.`; btn.disabled = true; }
    if (!q) { $('#quote').innerHTML = `<div class="kv"><span>Price</span><span>${money(priceUsd(c), { co: c.co })}</span></div><div class="kv"><span>Route</span><span>USD → ${c.co} → ${esc(c.sym)}</span></div>`; return; }
    if (side === 'buy') {
      $('#quote').innerHTML = `<div class="kv"><span>You get</span><span><b>${tok(q.out)} ${esc(c.sym)}</b></span></div>
        <div class="kv"><span>Leg 1 · USD → ${c.co}</span><span>${fmtTiny(n / px)} sh @ ${money(px)}</span></div>
        <div class="kv"><span>Leg 2 · ${c.co} → ${esc(c.sym)}</span><span>impact ${pct(q.impact)}</span></div>
        <div class="kv"><span>Fees</span><span>${money((q.fee + q.tax) * px)}</span></div>
        <div class="kv"><span>Min received</span><span>${tok(q.out * (1 - ui.slip))} ${esc(c.sym)}</span></div>
        ${q.refund > 1e-9 ? `<div class="kv"><span>Refund (curve full)</span><span>${money(q.refund * px)}</span></div>` : ''}`;
    } else {
      $('#quote').innerHTML = `<div class="kv"><span>You get</span><span><b>${money(q.out * px)}</b></span></div>
        <div class="kv"><span>Leg 1 · ${esc(c.sym)} → ${c.co}</span><span>${fmtTiny(q.out)} sh</span></div>
        <div class="kv"><span>Leg 2 · ${c.co} → USD</span><span>@ ${money(px)}</span></div>
        <div class="kv"><span>Impact</span><span>${pct(q.impact)}</span></div><div class="kv"><span>Fees</span><span>${money((q.fee + q.tax) * px)}</span></div><div class="kv"><span>Min received</span><span>${money(q.out * px * (1 - ui.slip))}</span></div>`;
    }
  }
  $('#tradeBtn').onclick = () => {
    if (!W) return openConnect(() => { location.hash = '#/coin/' + c.id; });
    const n = parseFloat(amt.value) || 0; if (!(n > 0)) return;
    const px = S.stocks[c.co].px;
    // slippage guard: the market keeps moving between the quote you read and the click
    const fresh = side === 'buy' ? quoteBuy(c, n / px) : quoteSell(c, n);
    if (quoted && quoted.side === side && quoted.n === n && fresh.out < quoted.out * (1 - ui.slip)) { paintTrade(); return $('#tErr').textContent = `Price moved more than ${ui.slip * 100}% since your quote. Check the new quote and try again.`; }
    if (side === 'buy') {
      if (n > W.usd + 1e-9) return;
      const q = tradeBuy(S, c, n / px, W.addr);
      if (!q) return $('#tErr').textContent = 'Nothing left to buy on the curve.';
      W.usd -= n - q.refund * px;
      toast(`Bought ${tok(q.out)} ${c.sym}`);
    } else {
      const q = tradeSell(S, c, n, W.addr);
      if (!q) return $('#tErr').textContent = 'You have none to sell.';
      W.usd += q.out * px;
      toast(`Sold ${tok(n)} ${c.sym} for ${money(q.out * px)}`);
    }
    save(); amt.value = ''; if (c.graduated && !$('.pill.grad')) return render(); refreshCoin(c); paintTrade();
  };
  paintTrade();
  refreshCoin(c);
  mountChart(c);
}
let lowTab = 'trades', coinPaint = null;
function holdersHtml(c) {
  const rows = Object.entries(c.holders).sort((a, b) => b[1] - a[1]);
  const inCurve = TOTAL - rows.reduce((s, r) => s + r[1], 0);
  const list = [[c.graduated ? 'Locked pool' : 'Bonding curve', inCurve]].concat(rows.slice(0, 12));
  const tag = a => a === 'Bonding curve' || a === 'Locked pool' ? `<b>${a}</b>` : (W && a === W.addr ? '<b>you</b>' : `<span class="mono">${short(a)}</span>`) + (a === c.creator ? ' <span class="pill">creator</span>' : '');
  return list.map(([a, b], i) => `<div class="hbar"><span class="mono muted">${i ? i : '◎'}</span><div><div>${tag(a)}</div><div class="track"><i style="width:${(b / TOTAL * 100).toFixed(2)}%"></i></div></div><span class="mono">${(b / TOTAL * 100).toFixed(2)}%</span></div>`).join('') + `<p class="hint" style="margin-top:8px">${rows.length} holders. Share of the 1B total supply.</p>`;
}
function refreshCoin(c) {
  if (!$('#cPx')) return;
  const ch = change24(c);
  $('#cPx').textContent = money(priceUsd(c), { co: c.co });
  $('#cCh').innerHTML = `<span class="${cls(ch)}">${pct(ch)}</span> 24h`;
  if ($('#cProg')) { $('#cProg').style.width = (progress(c) * 100) + '%'; $('#cSold').textContent = tok(c.sold) + ' / 800M · ' + (progress(c) * 100).toFixed(2) + '%'; }
  $('#cMcap').textContent = money(mcapUsd(c), { compact: 1 });
  $('#cRes').textContent = fmtTiny(Math.max(0, c.vq - c.vq0)) + ' ' + c.co;
  const ex = excess(c); $('#cEx').innerHTML = `<span class="${cls(ex)}">${pct(ex)}</span>`;
  $('#cHold').textContent = Object.keys(c.holders).length;
  const addrLbl = a => W && a === W.addr ? '<b>you</b>' : short(a);
  if (lowTab === 'holders' && $('#lowHolders')) $('#lowHolders').innerHTML = holdersHtml(c);
  if (coinPaint) coinPaint();
  $('#trBody').innerHTML = c.trades.slice(-30).reverse().map(t => `<tr><td class="${t.side === 'buy' ? 'up' : 'down'}">${t.side === 'buy' ? 'Buy' : 'Sell'}</td><td class="r mono">${tok(t.tok)}</td><td class="r mono">${money(t.usd)}</td><td class="r mono">${money(t.p)}</td><td class="mono micro">${addrLbl(t.who)}</td><td class="r mono muted">${ago(t.t)}</td></tr>`).join('');
  feedChart(c);
}

// ---------- chart ----------
function chartColors() { const g = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return { ink: g('--ink-3'), rule: g('--rule'), up: g('--up'), down: g('--down'), bg: g('--surface') }; }
function candles(c) {
  const tf = chartTf * 1000, out = [], vol = [];
  const conv = p => ui.ccy === 'SHARES' ? p / S.stocks[c.co].px : p * CCY[ui.ccy].r;
  let prev = conv(c.pxLaunchUsd);
  c.trades.forEach(t => {
    const b = Math.floor(t.t / tf) * tf / 1000, p = conv(t.p);
    let last = out[out.length - 1];
    if (!last || last.time !== b) { last = { time: b, open: prev, high: Math.max(prev, p), low: Math.min(prev, p), close: p }; out.push(last); vol.push({ time: b, value: 0 }); }
    last.high = Math.max(last.high, p); last.low = Math.min(last.low, p); last.close = p;
    const vv = vol[vol.length - 1]; vv.value += t.usd; vv.color = last.close >= last.open ? chartColors().up + '66' : chartColors().down + '66';
    prev = p;
  });
  return { out, vol };
}
function mountChart(c) {
  const box = $('#chartBox'); if (!box) return;
  chartCoin = c;
  if (!window.LightweightCharts) { box.innerHTML = '<canvas style="width:100%;height:100%" data-spark="' + c.id + '"></canvas>'; return; }
  const col = chartColors();
  chart = LightweightCharts.createChart(box, { autoSize: true, layout: { background: { type: 'solid', color: 'transparent' }, textColor: col.ink, fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }, grid: { vertLines: { color: col.rule }, horzLines: { color: col.rule } }, rightPriceScale: { borderColor: col.rule }, timeScale: { borderColor: col.rule, timeVisible: true, secondsVisible: false }, crosshair: { mode: 0 } });
  chartSeries = chart.addCandlestickSeries({ upColor: col.up, downColor: col.down, borderVisible: false, wickUpColor: col.up, wickDownColor: col.down, priceFormat: { type: 'custom', formatter: p => fmtTiny(p), minMove: 1e-12 } });
  volSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'v' });
  chart.priceScale('v').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  chartSeries.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });
  feedChart(c, true);
}
function feedChart(c, fit) {
  if (!chart || chartCoin !== c) return;
  const d = candles(c); chartSeries.setData(d.out); volSeries.setData(d.vol);
  if (fit) { const n = d.out.length; chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 90), to: n + 3 }); }
}
function restyleChart() {
  if (chart) { const col = chartColors(); chart.applyOptions({ layout: { textColor: col.ink }, grid: { vertLines: { color: col.rule }, horzLines: { color: col.rule } } }); chartSeries.applyOptions({ upColor: col.up, downColor: col.down, wickUpColor: col.up, wickDownColor: col.down }); feedChart(chartCoin); }
  drawSparks(); if ($('#curveCv')) drawCurve($('#curveCv'));
}
function destroyChart() { if (chart) { chart.remove(); chart = null; chartSeries = null; volSeries = null; chartCoin = null; } }

// ---------- live market ----------
const botR = mulberry((now() / 1000) | 0);
function tickStocks() {
  const t = now();
  Object.entries(S.stocks).forEach(([sym, s]) => {
    s.px *= 1 + (botR() - 0.5) * 0.0024;
    const last = s.hist[s.hist.length - 1];
    if (t - last.t > 3600e3) { s.hist.push({ t, p: s.px }); if (s.hist.length > 200) s.hist.shift(); }
  });
}
function tickBots() {
  const list = Object.values(S.coins); if (!list.length) return;
  const c = list[Math.floor(Math.pow(botR(), 1.6) * list.length)];
  const px = S.stocks[c.co].px; const before = priceUsd(c);
  const bots = Object.keys(c.holders).filter(a => !W || a !== W.addr);
  if (botR() < 0.56 || !bots.length) tradeBuy(S, c, (15 + Math.pow(botR(), 2.5) * 600) / px, randAddr(botR));
  else { const who = bots[Math.floor(botR() * bots.length)]; tradeSell(S, c, c.holders[who] * (0.15 + botR() * 0.6), who); }
  const up = priceUsd(c) >= before;
  const feed = $('#feed');
  if (feed && c.trades.length) { feed.insertAdjacentHTML('afterbegin', feedItem(c, c.trades[c.trades.length - 1])); while (feed.children.length > 14) feed.lastElementChild.remove(); }
  paintDuskCard();
  // update what is on screen without a full re-render
  const el = $(`.card[data-coin="${CSS.escape(c.id)}"]`);
  if (el) {
    const ch = change24(c);
    el.querySelector('[data-px]').textContent = money(priceUsd(c), { co: c.co });
    const chEl = el.querySelector('[data-ch]'); chEl.textContent = pct(ch); chEl.className = 'micro mono ' + cls(ch);
    const pr = el.querySelector('.prog i'); if (pr) pr.style.width = (progress(c) * 100).toFixed(1) + '%';
    el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth; el.classList.add(up ? 'flash-up' : 'flash-down');
    const cv = el.querySelector('canvas'); if (cv) spark(cv, c);
  }
  if (chartCoin === c || (routeParts()[0] === 'coin' && routeParts()[1] === c.id)) refreshCoin(c);
}
let ticks = 0;
function loop() {
  ticks++;
  tickBots();
  if (ticks % 2 === 0) { tickStocks(); const r0 = routeParts()[0]; if (r0 === 'coin') { const c = S.coins[routeParts()[1]]; if (c) refreshCoin(c); } }
  if (ticks % 10 === 0) { renderTape(); save(); }
}

// ---------- boot ----------
function boot() {
  load();
  initHeader();
  bindPhoto($('#pageBg'));
  renderTape();
  render();
  save();
  resumeWallet();
  setInterval(loop, 2200);
  window.addEventListener('resize', () => { clearTimeout(boot.rt); boot.rt = setTimeout(() => { drawSparks(); if ($('#curveCv')) drawCurve($('#curveCv')); }, 120); });
  document.addEventListener('keydown', e => { const cd = e.target.closest && e.target.closest('.card[data-go]'); if (cd && e.key === 'Enter') location.hash = cd.dataset.go; });
}
boot();
})();
