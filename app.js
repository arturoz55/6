/* Kruv — a stock-paired bonding-curve launchpad, running on an in-browser demo ledger.
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
let ui = { slip: store('sc.slip') || 0.01, ccy: store('sc.ccy') || 'USD', watch: store('sc.watch') || [], boardTab: store('sc.tab2') || 'live', boardQ: '' };
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

// ---------- drawn coin art ----------
// Every demo coin gets an original illustration of its theme. Any coin without a picture
// (one you launch, or a live token with no icon) gets a little mascot generated from its ticker.
const W_ = '#fff', INK = '#141a33';
const COIN_ART = {
  GRID: `<g transform="translate(14 14)"><rect width="36" height="36" rx="8" fill="${W_}"/><path d="M12 0v36M24 0v36M0 12h36M0 24h36" stroke="#cfd6ff" stroke-width="2"/><circle cx="12" cy="15" r="4" fill="${INK}"/><circle cx="24" cy="15" r="4" fill="${INK}"/><circle cx="13" cy="14" r="1.3" fill="${W_}"/><circle cx="25" cy="14" r="1.3" fill="${W_}"/><path d="M11 26q7 5 14 0" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M4 0l-5-7M32 0l5-7" stroke="${W_}" stroke-width="3" stroke-linecap="round"/></g>`,
  SHRTS: `<path d="M16 18h32l4 28h-14l-6-14-6 14H12z" fill="${W_}"/><path d="M16 22h32" stroke="#ffd2a8" stroke-width="3"/><path d="M29 27l8 5-8 5z" fill="#e0493b"/>`,
  SKIP: `<rect x="10" y="14" width="44" height="30" rx="6" fill="${W_}"/><rect x="14" y="18" width="36" height="22" rx="3" fill="${INK}"/><path d="M24 23l8 6-8 6zM32 23l8 6-8 6z" fill="${W_}"/><rect x="41" y="23" width="3" height="12" rx="1" fill="${W_}"/><path d="M26 50h12" stroke="${W_}" stroke-width="3" stroke-linecap="round"/>`,
  TICKS: `<path d="M12 16h40a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H26l-10 8v-8h-4a4 4 0 0 1-4-4V20a4 4 0 0 1 4-4z" fill="${W_}"/><path d="M18 30l5 5 9-10M28 35l1 0 9-10" stroke="#3b82f6" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  OWL: `<rect x="12" y="16" width="40" height="36" rx="6" fill="${W_}"/><rect x="12" y="16" width="40" height="10" rx="5" fill="#ffd2a8"/><path d="M22 12v8M42 12v8" stroke="${W_}" stroke-width="4" stroke-linecap="round"/><path d="M32 30c3 4 7 6 7 12a7 7 0 0 1-14 0c0-3 2-5 3-7 1 2 2 3 2 3 0-3 1-6 2-8z" fill="#ff7a1a"/>`,
  WRAP: `<rect x="12" y="26" width="40" height="26" rx="4" fill="${W_}"/><rect x="10" y="20" width="44" height="9" rx="3" fill="#ffd2a8"/><path d="M32 20v32" stroke="#1db954" stroke-width="5"/><path d="M32 20c-6-10-14-6-10-1 2 2 6 1 10 1zM32 20c6-10 14-6 10-1-2 2-6 1-10 1z" fill="#1db954"/><path d="M40 34v10a3 3 0 1 1-2-2.8V34l6-1.5" stroke="${INK}" stroke-width="2.2" fill="none"/>`,
  SURGE: `<path d="M18 20a9 9 0 0 1 17-3 7 7 0 0 1 11 6H18z" fill="${W_}"/><path d="M33 24l-5 9h6l-4 9 10-12h-6l4-6z" fill="#ffd25a"/><rect x="12" y="40" width="40" height="10" rx="4" fill="${W_}"/><path d="M18 40l4-6h20l4 6" fill="${W_}"/><circle cx="20" cy="50" r="4" fill="${INK}"/><circle cx="44" cy="50" r="4" fill="${INK}"/>`,
  UPVT: `<path d="M32 10l18 20H40v20H24V30H14z" fill="${W_}"/><path d="M32 18l10 11h-6v15h-8V29h-6z" fill="#ff7a3c"/><path d="M50 12l1.5 3.5L55 17l-3.5 1.5L50 22l-1.5-3.5L45 17l3.5-1.5z" fill="${W_}"/>`,
  OBBY: `<rect x="10" y="40" width="14" height="14" rx="2" fill="${W_}"/><rect x="25" y="30" width="14" height="24" rx="2" fill="#ffd2a8"/><rect x="40" y="20" width="14" height="34" rx="2" fill="${W_}"/><circle cx="17" cy="31" r="5" fill="#ffd25a"/><path d="M20 27q10-14 22-9" stroke="${W_}" stroke-width="2" stroke-dasharray="3 3" fill="none"/>`,
  ENDRS: `<path d="M24 38l-6 16 8-4 6 6 4-16zM40 38l6 16-8-4-6 6-4-16z" fill="#ffd2a8"/><circle cx="32" cy="28" r="16" fill="${W_}"/><circle cx="32" cy="28" r="11" fill="#1f9be0"/><path d="M32 20l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="${W_}"/>`,
  HOST: `<path d="M10 32L32 13l22 19" stroke="${W_}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 30v22h32V30L32 17z" fill="${W_}"/><rect x="28" y="40" width="8" height="12" rx="1" fill="#ff5a5f"/><path d="M32 23l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z" fill="#ffd25a"/>`,
  CHAT: `<path d="M10 14h34a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H24l-8 7v-7h-6a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4z" fill="${W_}"/><path d="M23 21l11 6-11 6z" fill="#9146ff"/><path d="M50 26h4a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4h-2v6l-7-6H36a4 4 0 0 1-4-4v-2" fill="#ffd2a8"/>`,
  BOARD: `<rect x="8" y="12" width="48" height="40" rx="4" fill="#e6b980"/><rect x="8" y="12" width="48" height="40" rx="4" fill="none" stroke="${W_}" stroke-width="3"/><rect x="14" y="20" width="14" height="14" fill="${W_}" transform="rotate(-6 21 27)"/><rect x="34" y="18" width="16" height="12" fill="#ffd2a8" transform="rotate(5 42 24)"/><rect x="28" y="34" width="16" height="13" fill="${W_}" transform="rotate(-3 36 40)"/><circle cx="21" cy="21" r="2.6" fill="#c8232c"/><circle cx="42" cy="19" r="2.6" fill="#c8232c"/><circle cx="36" cy="35" r="2.6" fill="#c8232c"/>`,
  SNAPS: `<path d="M32 8c5 8 15 12 15 26a15 15 0 0 1-30 0c0-7 4-11 6-15 2 4 4 6 4 6 0-7 2-12 5-17z" fill="${W_}"/><path d="M32 30c3 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7l2 3c0-3 0-5 1-7z" fill="#ff8a00"/><text x="32" y="58" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-weight="700" font-size="9" fill="${W_}">365</text>`,
  THRD: `<rect x="20" y="12" width="24" height="6" rx="2" fill="${W_}"/><rect x="20" y="46" width="24" height="6" rx="2" fill="${W_}"/><rect x="23" y="18" width="18" height="28" fill="#ffd2a8"/><path d="M23 22l18 4M23 28l18 4M23 34l18 4M23 40l18 4" stroke="#c86a1c" stroke-width="1.8"/><path d="M41 30q14 2 12 16" stroke="${W_}" stroke-width="2" fill="none"/><path d="M50 40l6 14" stroke="${W_}" stroke-width="2.4" stroke-linecap="round"/>`,
  DASH: `<path d="M22 20h26l-3 30H25z" fill="${W_}"/><path d="M28 20a7 7 0 0 1 14 0" stroke="${W_}" stroke-width="3.4" fill="none"/><path d="M29 32h12" stroke="#ff3008" stroke-width="3.4" stroke-linecap="round"/><path d="M6 26h12M9 33h10M6 40h12" stroke="${W_}" stroke-width="3" stroke-linecap="round" opacity=".75"/>`,
};
function mascot(seed) {
  const h = hashStr(seed || 'x'), r = mulberry(h), pick = a => a[Math.floor(r() * a.length)];
  const hue = h % 360, body = `hsl(${hue} 80% 70%)`, shade = `hsl(${hue} 70% 55%)`;
  const shape = pick([
    `<circle cx="32" cy="36" r="20" fill="${body}"/>`,
    `<rect x="12" y="16" width="40" height="40" rx="14" fill="${body}"/>`,
    `<path d="M32 10c14 14 20 22 20 30a20 20 0 0 1-40 0c0-8 6-16 20-30z" fill="${body}"/>`,
    `<path d="M14 54V30a18 18 0 0 1 36 0v24l-6-4-6 4-6-4-6 4-6-4z" fill="${body}"/>`,
  ]);
  const extra = pick([
    `<path d="M32 16V8" stroke="${shade}" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="7" r="3.5" fill="#ffd25a"/>`,
    `<path d="M20 20l-4-10 10 6M44 20l4-10-10 6" fill="${shade}"/>`,
    `<path d="M32 16c-2-6 4-10 8-8-2 4-4 6-8 8z" fill="#5ee0a6"/>`,
    `<path d="M22 18h20l-3-8-4 5-3-6-3 6-4-5z" fill="#ffd25a"/>`, '',
  ]);
  const eyes = pick([
    `<circle cx="25" cy="34" r="4" fill="${INK}"/><circle cx="39" cy="34" r="4" fill="${INK}"/><circle cx="26.3" cy="32.8" r="1.4" fill="#fff"/><circle cx="40.3" cy="32.8" r="1.4" fill="#fff"/>`,
    `<path d="M21 34q4-4 8 0M35 34q4-4 8 0" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    `<ellipse cx="25" cy="34" rx="3" ry="5" fill="${INK}"/><ellipse cx="39" cy="34" rx="3" ry="5" fill="${INK}"/>`,
    `<circle cx="32" cy="32" r="7" fill="#fff"/><circle cx="33" cy="33" r="3.6" fill="${INK}"/>`,
  ]);
  const mouth = pick([`<path d="M26 43q6 5 12 0" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`, `<ellipse cx="32" cy="44" rx="3" ry="3.6" fill="${INK}"/>`, `<path d="M27 44h10" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`, `<path d="M26 42q6 7 12 0z" fill="${INK}"/>`]);
  const cheeks = r() < .6 ? `<circle cx="20" cy="41" r="3" fill="#ff8fa3" opacity=".7"/><circle cx="44" cy="41" r="3" fill="#ff8fa3" opacity=".7"/>` : '';
  return extra + shape + eyes + mouth + cheeks;
}
function coinSvg(c) {
  const col = (CO[c.co] && CO[c.co].c) || `hsl(${hashStr(c.sym || 'x') % 360} 55% 45%)`;
  const id = 'cg' + hashStr((c.id || '') + c.sym + col).toString(36);
  const inner = COIN_ART[c.sym] && !c.custom ? COIN_ART[c.sym] : mascot(c.sym + (c.id || ''));
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${col}"/><stop offset="1" stop-color="color-mix(in srgb, ${col} 45%, #0b1124)"/></linearGradient></defs><rect width="64" height="64" fill="url(#${id})"/><circle cx="54" cy="8" r="18" fill="#fff" opacity=".08"/>${inner}</svg>`;
}
function logo(c, size = '') {
  if (c.img) return `<span class="logo ${size}"><img src="${esc(c.img)}" alt=""></span>`;
  return `<span class="logo art ${size}" aria-hidden="true">${coinSvg(c)}</span>`;
}
function coLogo(sym, size = 'sm') { const c = CO[sym]; return `<span class="logo ${size}" style="background:${c.c}" aria-hidden="true">${esc(sym.slice(0, 2))}</span>`; }
const starSvg = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"/></svg>';
function starBtn(id) { const on = ui.watch.includes(id); return `<button class="starbtn ${on ? 'on' : ''}" data-star="${esc(id)}" aria-pressed="${on}" title="${on ? 'Remove from watchlist' : 'Add to watchlist'}" aria-label="Watch">${starSvg}</button>`; }

// ---------- toast ----------
let toastT;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600); }

// ---------- header ----------
const NAV = [['', 'Board'], ['zcash', 'Zcash'], ['pairs', 'Pairs'], ['unclaimed', 'Unclaimed'], ['beat', 'Scoreboard'], ['watch', 'Watchlist'], ['legs', 'Two legs'], ['launch', 'Launch'], ['account', 'Account'], ['docs', 'Docs']];
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
    const xr = e.target.closest('[data-expand]');
    if (xr && !e.target.closest('a,button')) { const d = xr.nextElementSibling; const open = !d.classList.contains('open'); $$('.xdetail.open').forEach(o => { o.classList.remove('open'); o.previousElementSibling.setAttribute('aria-expanded', 'false'); }); d.classList.toggle('open', open); xr.setAttribute('aria-expanded', open); return; }
    const fl = e.target.closest('.flip');
    if (fl && (!e.target.closest('a,button') || e.target.closest('[data-unflip]'))) { const on = !fl.classList.contains('flipped'); fl.classList.toggle('flipped', on); fl.setAttribute('aria-pressed', on); return; }
    const pk = e.target.closest('[data-peek]'); const ctl = e.target.closest('a,button'); if (pk && (!ctl || ctl === pk)) { openPeek(pk.dataset.peek, pk); return; }
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

Copyright (c) 2026 Kruv contributors

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
// Official wallet logos from @web3icons/core (MIT, see CREDITS.md), used to identify each wallet.
const WALLET_LOGOS = {"metamask": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" fill=\"none\" viewBox=\"0 0 24 24\"><path fill=\"#FF5C16\" d=\"m19.821 19.918-3.877-1.131-2.924 1.712h-2.04l-2.926-1.712-3.875 1.13L3 16.02l1.179-4.327L3 8.034 4.179 3.5l6.056 3.544h3.53L19.821 3.5 21 8.034l-1.179 3.658L21 16.02z\"/><path fill=\"#FF5C16\" d=\"m4.18 3.5 6.055 3.547-.24 2.434zm3.875 12.52 2.665 1.99-2.665.777zm2.452-3.286-.512-3.251-3.278 2.21h-.002v.001l.01 2.275 1.33-1.235zM19.82 3.5l-6.056 3.547.24 2.434zm-3.875 12.52-2.665 1.99 2.665.777zm1.339-4.326v-.002zl-3.279-2.21-.512 3.25h2.451l1.33 1.236z\"/><path fill=\"#E34807\" d=\"m8.054 18.787-3.875 1.13L3 16.022h5.054zm2.452-6.054.74 4.7-1.026-2.614-3.497-.85 1.33-1.236zm5.44 6.054 3.875 1.13L21 16.022h-5.055zm-2.452-6.054-.74 4.7 1.026-2.614 3.497-.85-1.331-1.236z\"/><path fill=\"#FF8D5D\" d=\"m3 16.02 1.179-4.328h2.535l.01 2.276 3.496.85 1.026 2.613-.527.576-2.665-1.989H3zm18 0-1.179-4.328h-2.535l-.01 2.276-3.496.85-1.026 2.613.527.576 2.665-1.989H21zm-7.235-8.976h-3.53l-.24 2.435 1.251 7.95h1.508l1.252-7.95z\"/><path fill=\"#661800\" d=\"M4.179 3.5 3 8.034l1.179 3.658h2.535l3.28-2.211zm5.594 10.177H8.625l-.626.6 2.222.54zM19.821 3.5 21 8.034l-1.179 3.658h-2.535l-3.28-2.211zm-5.593 10.177h1.15l.626.6-2.224.541zm-1.209 5.271.262-.94-.527-.575h-1.509l-.527.575.262.94\"/><path fill=\"#C0C4CD\" d=\"M13.02 18.948V20.5h-2.04v-1.552z\"/><path fill=\"#E7EBF6\" d=\"m8.055 18.785 2.927 1.714v-1.552l-.262-.94zm7.89 0L13.02 20.5v-1.552l.262-.94z\"/></svg>", "phantom": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" fill=\"none\" viewBox=\"0 0 24 24\"><path fill=\"#AB9FF2\" d=\"M5.13 19.2c2.297 0 4.023-1.92 5.053-3.436a2.9 2.9 0 0 0-.195.994c0 .885.53 1.516 1.574 1.516 1.433 0 2.965-1.208 3.758-2.51a2 2 0 0 0-.083.524c0 .617.362 1.006 1.1 1.006 2.324 0 4.663-3.959 4.663-7.421C21 7.175 19.58 4.8 16.016 4.8 9.752 4.8 3 12.154 3 16.905 3 18.771 4.044 19.2 5.13 19.2m8.729-9.622c0-.671.39-1.141.96-1.141.557 0 .947.47.947 1.14 0 .672-.39 1.155-.947 1.155-.57 0-.96-.483-.96-1.154m2.979 0c0-.671.39-1.141.96-1.141.557 0 .947.47.947 1.14 0 .672-.39 1.155-.947 1.155-.57 0-.96-.483-.96-1.154\"/></svg>", "coinbase": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" fill=\"none\" viewBox=\"0 0 24 24\"><path fill=\"#0E5BFF\" d=\"M3 12a9 9 0 1 1 18 0 9 9 0 0 1-18 0\"/><path fill=\"#fff\" fill-rule=\"evenodd\" d=\"M12 18.375a6.375 6.375 0 1 0 0-12.75 6.375 6.375 0 0 0 0 12.75m-.75-8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h1.5c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125z\" clip-rule=\"evenodd\"/></svg>", "rabby": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" fill=\"none\" viewBox=\"0 0 24 24\"><path fill=\"url(#rabby__a)\" d=\"M20.908 13.17c.707-1.644-2.788-6.235-6.127-8.148-2.105-1.482-4.298-1.279-4.742-.628-.975 1.428 3.228 2.638 6.038 4.05a3.25 3.25 0 0 0-1.508 1.39c-1.048-1.19-3.347-2.216-6.046-1.39-1.819.556-3.33 1.868-3.914 3.85a1.1 1.1 0 0 0-.464-.103c-.632 0-1.145.533-1.145 1.191s.513 1.191 1.145 1.191c.117 0 .483-.081.483-.081l5.855.044c-2.341 3.865-4.192 4.43-4.192 5.1s1.77.488 2.436.238c3.182-1.195 6.6-4.919 7.187-5.99 2.463.32 4.533.357 4.994-.715\"/><path fill=\"url(#rabby__b)\" fill-rule=\"evenodd\" d=\"M16.077 8.444c.13-.053.11-.253.074-.41-.082-.362-1.5-1.82-2.833-2.473-1.815-.89-3.152-.843-3.35-.433.37.788 2.085 1.529 3.875 2.302.764.33 1.541.666 2.234 1.014\" clip-rule=\"evenodd\"/><path fill=\"url(#rabby__c)\" fill-rule=\"evenodd\" d=\"M13.774 16.38c-.367-.145-.782-.28-1.254-.4.503-.937.609-2.322.134-3.199-.666-1.229-1.503-1.883-3.446-1.883-1.07 0-3.947.374-3.998 2.874q-.009.393.018.724l5.255.04a18.7 18.7 0 0 1-1.953 2.696c.698.186 1.273.342 1.802.486.501.136.96.26 1.44.388a22 22 0 0 0 2.002-1.726\" clip-rule=\"evenodd\"/><path fill=\"url(#rabby__d)\" d=\"M4.539 14.24c.215 1.898 1.252 2.642 3.371 2.863 2.12.22 3.335.072 4.954.225 1.352.128 2.559.845 3.006.598.403-.223.178-1.029-.361-1.546-.7-.67-1.667-1.135-3.369-1.3.34-.967.244-2.322-.282-3.06-.762-1.065-2.168-1.547-3.948-1.337-1.859.22-3.64 1.173-3.371 3.556\"/><defs><linearGradient id=\"rabby__a\" x1=\"8.311\" x2=\"20.827\" y1=\"11.714\" y2=\"15.125\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#8697FF\"/><stop offset=\"1\" stop-color=\"#ABB7FF\"/></linearGradient><linearGradient id=\"rabby__b\" x1=\"18.66\" x2=\"9.323\" y1=\"11.468\" y2=\"2.473\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#8697FF\"/><stop offset=\"1\" stop-color=\"#5156D8\" stop-opacity=\"0\"/></linearGradient><linearGradient id=\"rabby__c\" x1=\"14.023\" x2=\"5.231\" y1=\"16.707\" y2=\"11.849\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#465EED\"/><stop offset=\"1\" stop-color=\"#8697FF\" stop-opacity=\"0\"/></linearGradient><linearGradient id=\"rabby__d\" x1=\"9.054\" x2=\"15.173\" y1=\"11.617\" y2=\"19.089\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#8898FF\"/><stop offset=\".984\" stop-color=\"#6277F1\"/></linearGradient></defs></svg>", "solflare": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" fill=\"none\" viewBox=\"0 0 24 24\"><path fill=\"#FFEF46\" d=\"m12.063 12.715 1.245-1.199 2.32.757c1.518.505 2.278 1.43 2.278 2.734 0 .988-.38 1.64-1.14 2.481l-.231.253.084-.59c.337-2.144-.295-3.07-2.383-3.742zM8.942 5.376l6.327 2.103-1.37 1.304-3.291-1.094c-1.139-.378-1.519-.988-1.666-2.27zm-.38 10.682 1.434-1.367 2.7.884c1.413.462 1.898 1.072 1.75 2.607zM6.748 9.96c0-.4.211-.778.57-1.093.38.547 1.033 1.03 2.067 1.367l2.235.736-1.244 1.198-2.194-.715c-1.012-.336-1.434-.84-1.434-1.493M13.371 21c4.64-3.07 7.129-5.152 7.129-7.717 0-1.704-1.012-2.65-3.248-3.386l-1.687-.568 4.619-4.415-.928-.989-1.371 1.199L11.409 3c-2.003.652-4.534 2.565-4.534 4.479 0 .21.02.42.084.652-1.666.946-2.341 1.83-2.341 2.923 0 1.03.548 2.06 2.299 2.628l1.392.463L3.5 18.75l.928.988 1.498-1.366z\"/></svg>", "backpack": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" fill=\"none\" viewBox=\"0 0 24 24\"><path fill=\"#E33E3F\" fill-rule=\"evenodd\" d=\"M13.194 4.415c.666 0 1.29.088 1.87.25C14.496 3.37 13.32 3 12.011 3c-1.312 0-2.49.37-3.055 1.673a6.6 6.6 0 0 1 1.86-.258zm-2.529 1.302c-3.163 0-4.965 2.444-4.965 5.459v3.097c0 .301.256.54.573.54h11.454c.317 0 .573-.239.573-.54v-3.097c0-3.015-2.096-5.459-5.259-5.459zm1.33 5.486c1.108 0 2.005-.882 2.005-1.97 0-1.087-.897-1.968-2.005-1.968-1.106 0-2.004.881-2.004 1.969 0 1.087.898 1.969 2.005 1.969M5.7 16.633a.56.56 0 0 1 .573-.546h11.454a.56.56 0 0 1 .573.546v3.275c0 .603-.513 1.092-1.145 1.092H6.845c-.632 0-1.145-.489-1.145-1.092z\" clip-rule=\"evenodd\"/></svg>"};
function walletArt(key, size = 40, icon) {
  if (!(icon && /^data:image\//.test(icon)) && WALLET_LOGOS[key]) return `<span class="wart wlogo" style="width:${size}px;height:${size}px">${WALLET_LOGOS[key]}</span>`;
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
    <div class="wm-foot"><button class="foot-link" type="button" id="wmHelp">New to wallets?</button><span class="micro">Kruv never asks for your recovery phrase.</span></div>
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
    ${framed && !rows.some(r => r.installed) ? `<div class="wm-note"><b>Can't see your wallet?</b> This page is running inside a preview frame, and browser extensions often stay hidden there. Open Kruv in its own tab to use MetaMask, Phantom and the rest. <button class="btn ghost" type="button" id="wmCopyUrl">Copy page link</button></div>` : ''}
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
    ${canDeep ? `<div class="wm-qr"><div id="wmQr" class="wm-qrbox" aria-label="QR code"></div><div><b>On your phone?</b><p class="micro">Scan to open Kruv inside the ${esc(r.k.name)} app's browser, where it connects straight away.</p><div class="bar" style="margin:8px 0 0"><a class="btn ghost" href="${esc(r.k.deep(link))}" target="_blank" rel="noopener noreferrer">Open in app</a><button class="btn ghost" type="button" id="wmCopyDeep">Copy link</button></div></div></div>` : ''}
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
    <p>A wallet is an app or browser extension that holds your crypto address. Connecting one lets Kruv see your address. It can't move funds without your approval.</p>
    <details open><summary>Which one should I get?</summary><p><strong>Phantom</strong> if you want Solana and Ethereum in one app. <strong>MetaMask</strong> or <strong>Rabby</strong> for Ethereum and its networks. <strong>Coinbase Wallet</strong> if you already use Coinbase.</p></details>
    <details><summary>Is connecting safe?</summary><p>Connecting shares your public address. Signing in asks you to sign a free message, which does not send a transaction. Never type your recovery phrase into a website.</p></details>
    <details><summary>Do I need real money here?</summary><p>No. Trading on Kruv uses the demo ledger. Every address gets ${money(START_USD)} of test funds.</p></details>
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
  const msg = `Sign in to Kruv (demo network)\n\nAddress: ${W.addr}\nNonce: ${Math.random().toString(36).slice(2, 10)}\nIssued: ${new Date().toISOString()}\n\nThis signature costs nothing and does not send a transaction.`;
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
    const lv = liveSorted(liveAll()).filter(p => !q || (p.baseToken.name + ' ' + p.baseToken.symbol + ' ' + p.baseToken.address).toLowerCase().includes(q)).slice(0, q ? 8 : 5)
      .map(p => ({ go: '#/live/' + p.baseToken.address, html: `${liveImg(p, 'sm')}<span class="grow"><b>${esc(p.baseToken.name)}</b> <span class="muted mono">${esc(p.baseToken.symbol)}</span><br><span class="micro">Solana · ${LIVE.source === 'live' ? 'live' : 'snapshot'} · MC ${usdC(lmc(p))}</span></span><span class="mono ${cls(lchg(p))}">${pct(lchg(p))}</span>` }));
    const cos = COMPANIES.filter(c => q && (c.sym + ' ' + c.name + ' ' + c.apps.join(' ')).toLowerCase().includes(q)).slice(0, 4)
      .map(c => ({ go: '#/pairs/' + c.sym, html: `${coLogo(c.sym)}<span class="grow"><b>${c.sym}</b> <span class="muted">${esc(c.name)}</span><br><span class="micro">${c.apps.length} apps</span></span><span class="pill">Company</span>` }));
    const zrow = !q || /^(z|ze|zec|zc|zca|zcas|zcash|privacy)/.test(q) ? [{ go: '#/zcash', html: `${zecLogo(28)}<span class="grow"><b>Zcash</b> <span class="muted mono">ZEC</span><br><span class="micro">Privacy coin · ${ZEC.source === 'live' ? 'live' : 'snapshot'}</span></span><span class="mono ${cls(zecChg())}">${ZEC.price ? money(ZEC.price) : ''}</span>` }] : [];
    rows = zrow.concat(lv, coins, cos); sel = clamp(sel, 0, Math.max(0, rows.length - 1));
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
  const zec = ZEC.price ? `<a class="tape-item" href="#/zcash"><b>ZEC</b>${money(ZEC.price)}<span class="${cls(zecChg())}">${pct(zecChg())}</span></a>` : '';
  const items = zec + liveSorted(liveAll()).slice(0, 10).map(p => { const ch = lchg(p); return `<a class="tape-item" href="#/live/${esc(p.baseToken.address)}"><b>${esc(p.baseToken.symbol)}</b>${money(lp(p))}<span class="${cls(ch)}">${pct(ch)}</span></a>`; }).concat(COMPANIES.map(c => { const ch = stockChg(c.sym); return `<span class="tape-item"><b>${c.sym}</b>${money(S.stocks[c.sym].px)}<span class="${cls(ch)}">${pct(ch)}</span></span>`; })
    .concat(Object.values(S.coins).sort((a, b) => vol24(b) - vol24(a)).slice(0, 8).map(c => { const ch = change24(c); return `<a class="tape-item" href="#/coin/${c.id}"><b>${esc(c.sym)}</b><span class="muted">/${c.co}</span><span class="${cls(ch)}">${pct(ch)}</span></a>`; })))
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
function drawSparks() { $$('canvas[data-spark]').forEach(cv => { const c = S.coins[cv.dataset.spark]; if (c) spark(cv, c); }); $$('canvas[data-lspark]').forEach(cv => { const p = LIVE.pairs.get(cv.dataset.lspark); if (p) drawSparkTP(cv, livePts(p)); }); }

// ---------- cards ----------
function card(c) {
  const ch = change24(c);
  return `<article class="card" data-peek="coin:${c.id}" data-coin="${c.id}" tabindex="0" role="link" aria-label="${esc(c.name)}">
    <div class="row">${logo(c)}<div class="nm"><h3>${esc(c.name)}</h3><div class="micro mono">${esc(c.sym)} · ${esc(c.app)}</div></div>${starBtn(c.id)}</div>
    <div class="row" style="justify-content:space-between"><span class="pairtag">${esc(c.sym)} / ${c.co}</span><div class="px"><div class="p" data-px>${money(priceUsd(c), { co: c.co })}</div><div class="micro mono ${cls(ch)}" data-ch>${pct(ch)}</div></div></div>
    <canvas data-spark="${c.id}" aria-hidden="true"></canvas>
    ${c.graduated ? `<div class="foot"><span class="pill grad">Graduated · pool locked</span><span>mcap ${money(mcapUsd(c), { compact: 1 })}</span></div>`
      : `<div><div class="prog"><i style="width:${(progress(c) * 100).toFixed(1)}%"></i></div><div class="foot" style="margin-top:7px"><span>${(progress(c) * 100).toFixed(1)}% to graduation</span><span>vol ${money(vol24(c), { compact: 1 })}</span></div></div>`}
  </article>`;
}

// ---------- live Solana tokens (DexScreener public API, GeckoTerminal candles) ----------
// These are real tokens trading right now. Prices refresh every 15 s. When the page can't reach
// the APIs (for example inside a sandboxed preview) it falls back to live-snapshot.json, a real
// capture shipped next to the page, and says so on screen.
const DS = 'https://api.dexscreener.com';
const GT = 'https://api.geckoterminal.com/api/v2/networks/solana';
const LIVE = { pairs: new Map(), boosted: [], fresh: [], hist: {}, updated: 0, source: 'none', at: 0, listAt: 0, busy: false, sort: store('sc.liveSort') || 'trending', snapImgs: {} };
async function getJSON(url, ms = 12000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); }
}
function absorbPairs(list, at) {
  const best = {};
  (list || []).forEach(p => { if (!p || !p.baseToken || p.chainId !== 'solana') return; const a = p.baseToken.address; if (!best[a] || (p.liquidity && p.liquidity.usd || 0) > (best[a].liquidity && best[a].liquidity.usd || 0)) best[a] = p; });
  Object.values(best).forEach(p => {
    const a = p.baseToken.address, prev = LIVE.pairs.get(a);
    p._prev = prev ? +prev.priceUsd : null;
    LIVE.pairs.set(a, p);
    const h = LIVE.hist[a] = LIVE.hist[a] || [];
    const px = +p.priceUsd; if (px > 0 && (!h.length || h[h.length - 1].p !== px)) { h.push({ t: at, p: px }); if (h.length > 240) h.shift(); }
  });
}
async function liveList() {
  const [boosts, profiles] = await Promise.all([getJSON(DS + '/token-boosts/top/v1'), getJSON(DS + '/token-profiles/latest/v1').catch(() => [])]);
  const sol = x => x && x.chainId === 'solana' && x.tokenAddress;
  LIVE.boosted = [...new Set(boosts.filter(sol).map(x => x.tokenAddress))].slice(0, 30);
  LIVE.fresh = [...new Set(profiles.filter(sol).map(x => x.tokenAddress))].filter(a => !LIVE.boosted.includes(a)).slice(0, 30);
  LIVE.listAt = now();
}
async function liveRefresh(force) {
  if (LIVE.busy || (document.hidden && !force)) return;
  LIVE.busy = true;
  try {
    if (!LIVE.boosted.length || now() - LIVE.listAt > 90e3) await liveList();
    const extra = [...ui.watch, ...Object.keys((W && W.paper) || {})].filter(id => id.startsWith('live:')).map(id => id.slice(5));
    const route = routeParts(); if (route[0] === 'live' && route[1]) extra.push(route[1]);
    const addrs = [...new Set([...LIVE.boosted, ...LIVE.fresh, ...extra])];
    const chunks = []; for (let i = 0; i < addrs.length; i += 30) chunks.push(addrs.slice(i, i + 30));
    const res = await Promise.all(chunks.map(c => getJSON(`${DS}/tokens/v1/solana/${c.join(',')}`)));
    absorbPairs(res.flat(), now());
    LIVE.updated = now(); LIVE.source = 'live';
  } catch (e) {
    if (LIVE.source !== 'live' && LIVE.source !== 'snapshot') await liveSnapshot();
  } finally { LIVE.busy = false; livePaint(); }
}
async function liveSnapshot() {
  try {
    const s = await getJSON('live-snapshot.json', 8000);
    LIVE.boosted = s.boosted || []; LIVE.fresh = s.fresh || []; LIVE.snapImgs = s.images || {};
    absorbPairs(s.pairs, s.at); LIVE.at = s.at; LIVE.updated = s.at; LIVE.source = 'snapshot';
  } catch (e) { LIVE.source = 'down'; }
}
function liveAll() { return [...LIVE.pairs.values()]; }
const lp = p => +p.priceUsd || 0;
const lchg = (p, k = 'h24') => (p.priceChange && p.priceChange[k] != null ? p.priceChange[k] / 100 : 0);
const lvol = (p, k = 'h24') => (p.volume && p.volume[k]) || 0;
const ltx = (p, k = 'h24') => (p.txns && p.txns[k]) || { buys: 0, sells: 0 };
const lmc = p => p.marketCap || p.fdv || 0;
const lliq = p => (p.liquidity && p.liquidity.usd) || 0;
function liveSorted(list) {
  const s = LIVE.sort, b = LIVE.boosted;
  if (s === 'trending') return list.filter(p => b.includes(p.baseToken.address)).sort((x, y) => b.indexOf(x.baseToken.address) - b.indexOf(y.baseToken.address)).concat(list.filter(p => !b.includes(p.baseToken.address)).sort((x, y) => lvol(y) - lvol(x)));
  if (s === 'gainers') return list.slice().sort((x, y) => lchg(y) - lchg(x));
  if (s === 'volume') return list.slice().sort((x, y) => lvol(y) - lvol(x));
  if (s === 'new') return list.slice().sort((x, y) => (y.pairCreatedAt || 0) - (x.pairCreatedAt || 0));
  if (s === 'liquidity') return list.slice().sort((x, y) => lliq(y) - lliq(x));
  return list;
}
function liveImg(p, size = '') {
  const a = p.baseToken.address, src = LIVE.source === 'snapshot' ? LIVE.snapImgs[a] : (p.info && p.info.imageUrl);
  const sym = (p.baseToken.symbol || '?').slice(0, 2).toUpperCase();
  const hue = hashStr(a) % 360;
  // initials sit underneath; the token's own image covers them once it loads and removes itself if it fails
  return `<span class="logo art ${size}" style="background:hsl(${hue} 40% 30%)">${coinSvg({ sym: sym + a.slice(0, 6), co: '', custom: true })}${src ? `<img class="tok-img" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;
}
function livePts(p) {
  const n = LIVE.updated || now(), px = lp(p); if (!px) return [];
  const pts = [['h24', 864e5], ['h6', 216e5], ['h1', 36e5], ['m5', 3e5]].map(([k, ms]) => ({ t: n - ms, p: px / (1 + lchg(p, k)) })).filter(x => isFinite(x.p) && x.p > 0);
  return pts.concat((LIVE.hist[p.baseToken.address] || []).filter(x => x.t > n - 864e5)).sort((a, b) => a.t - b.t);
}
function drawSparkTP(canvas, pts) {
  if (!canvas || pts.length < 2) return;
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth || 240, h = canvas.clientHeight || 46;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const x = canvas.getContext('2d'); x.scale(dpr, dpr);
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1, ps = pts.map(q => q.p), mn = Math.min(...ps), mx = Math.max(...ps), rg = mx - mn || mx * .01 || 1;
  const up = ps[ps.length - 1] >= ps[0];
  const col = getComputedStyle(document.documentElement).getPropertyValue(up ? '--up' : '--down').trim();
  const X = t => 2 + ((t - t0) / (t1 - t0 || 1)) * (w - 4), Y = v => h - 4 - ((v - mn) / rg) * (h - 8);
  x.beginPath(); pts.forEach((q, i) => i ? x.lineTo(X(q.t), Y(q.p)) : x.moveTo(X(q.t), Y(q.p)));
  x.strokeStyle = col; x.lineWidth = 1.6; x.lineJoin = 'round'; x.stroke();
  x.lineTo(X(t1), h); x.lineTo(X(t0), h); x.closePath();
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, col + '33'); g.addColorStop(1, col + '00'); x.fillStyle = g; x.fill();
  x.beginPath(); x.arc(X(t1), Y(ps[ps.length - 1]), 2.6, 0, 7); x.fillStyle = col; x.fill();
}
const usdC = v => money(v, { compact: 1 });
function liveCard(p) {
  const a = p.baseToken.address, ch = lchg(p), tx = ltx(p), tot = tx.buys + tx.sells || 1;
  const boosted = LIVE.boosted.includes(a);
  return `<article class="card live-card" data-peek="live:${esc(a)}" data-live="${esc(a)}" tabindex="0" role="link" aria-label="${esc(p.baseToken.name)}">
    <div class="row">${liveImg(p)}<div class="nm"><h3>${esc(p.baseToken.name)}</h3><div class="micro mono">${esc(p.baseToken.symbol)} · ${esc(p.dexId)}${boosted ? ' · <span class="hot">trending</span>' : ''}</div></div>${starBtn('live:' + a)}</div>
    <div class="row" style="justify-content:space-between"><span class="pairtag">${esc(p.baseToken.symbol)} / ${esc(p.quoteToken.symbol)}</span><div class="px"><div class="p" data-px>${money(lp(p))}</div><div class="micro mono ${cls(ch)}" data-ch>${pct(ch)}</div></div></div>
    <canvas data-lspark="${esc(a)}" aria-hidden="true"></canvas>
    <div class="lstats"><span><i>MC</i>${usdC(lmc(p))}</span><span><i>Liq</i>${usdC(lliq(p))}</span><span><i>Vol</i>${usdC(lvol(p))}</span><span><i>Age</i>${p.pairCreatedAt ? ago(p.pairCreatedAt) : '—'}</span></div>
    <div><div class="bsbar" title="24h buys vs sells"><i style="width:${(tx.buys / tot * 100).toFixed(1)}%"></i></div><div class="foot" style="margin-top:7px"><span class="up">${compact(tx.buys).replace('.00', '')} buys</span><span class="down">${compact(tx.sells).replace('.00', '')} sells</span></div></div>
  </article>`;
}
function liveStatus() {
  if (LIVE.source === 'live') return `<span class="live-dot"></span>Live from DexScreener · updated <b data-upd>${ago(LIVE.updated)}</b> ago`;
  if (LIVE.source === 'snapshot') return `<span class="snap-dot"></span>Real snapshot from ${new Date(LIVE.at).toLocaleString()} · this preview can't reach live APIs. Host the site on its own domain for prices that update every 15 s.`;
  if (LIVE.source === 'down') return `Live data didn't load. Check your connection and try again. <button class="btn ghost" type="button" data-live-retry>Retry</button>`;
  return `<span class="live-dot"></span>Loading live Solana tokens…`;
}
function liveBoard(box) {
  const q = ui.boardQ.toLowerCase();
  const list = liveSorted(liveAll().filter(p => !q || (p.baseToken.name + ' ' + p.baseToken.symbol + ' ' + p.baseToken.address).toLowerCase().includes(q)));
  box.innerHTML = `<div class="live-head" style="grid-column:1/-1"><div class="seg" id="liveSort">${[['trending', 'Trending'], ['gainers', '24h gainers'], ['volume', 'Volume'], ['new', 'New pairs'], ['liquidity', 'Liquidity']].map(([k, l]) => `<button type="button" data-s="${k}" class="${LIVE.sort === k ? 'on' : ''}">${l}</button>`).join('')}</div><span class="micro live-status" id="liveStatus">${liveStatus()}</span></div>
    ${list.length ? list.map(liveCard).join('') : LIVE.source === 'none' ? Array.from({ length: 8 }, () => '<div class="card skel"></div>').join('') : `<div class="empty" style="grid-column:1/-1">No live token matches “${esc(ui.boardQ)}”.</div>`}`;
  $$('canvas[data-lspark]', box).forEach(cv => { const p = LIVE.pairs.get(cv.dataset.lspark); if (p) drawSparkTP(cv, livePts(p)); });
  $('#liveSort').onclick = e => { const b = e.target.closest('button'); if (!b) return; LIVE.sort = b.dataset.s; store('sc.liveSort', LIVE.sort); liveBoard(box); };
}
// repaint whatever live content is on screen, in place where possible
function livePaint() {
  const st = $('#liveStatus'); if (st) st.innerHTML = liveStatus();
  const board = $('#board');
  if (board && ui.boardTab === 'live') {
    const cards = $$('.live-card', board);
    if (!cards.length || cards.length !== Math.min(liveAll().length, cards.length) || $('.skel', board)) liveBoard(board);
    else cards.forEach(el => {
      const p = LIVE.pairs.get(el.dataset.live); if (!p) return;
      const ch = lchg(p), px = lp(p);
      el.querySelector('[data-px]').textContent = money(px);
      const c = el.querySelector('[data-ch]'); c.textContent = pct(ch); c.className = 'micro mono ' + cls(ch);
      if (p._prev && p._prev !== px) { el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth; el.classList.add(px > p._prev ? 'flash-up' : 'flash-down'); }
      drawSparkTP(el.querySelector('canvas'), livePts(p));
    });
  }
  if (routeParts()[0] === 'live') liveRefreshPage();
  refreshPeek();
  if (routeParts()[0] === 'watch' && $('#liveWatch')) $('#liveWatch').innerHTML = liveWatchHtml();
  renderTape();
}
setInterval(() => { const u = $('[data-upd]'); if (u && LIVE.updated) u.textContent = ago(LIVE.updated); }, 1000);
document.addEventListener('click', e => { if (e.target.closest('[data-live-retry]')) { LIVE.source = 'none'; livePaint(); liveRefresh(true); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && now() - LIVE.updated > 15e3) liveRefresh(); });

// ---------- one live token ----------
let liveChart = null, liveSeries = null, liveVol = null, liveTf = store('sc.liveTf') || '5m', liveCandlesAt = 0;
const TF = { '1m': ['minute', 1], '5m': ['minute', 5], '15m': ['minute', 15], '1h': ['hour', 1] };
function liveTokenPage(v, addr) {
  const p = LIVE.pairs.get(addr);
  if (!p) {
    v.innerHTML = `<div class="empty">${LIVE.source === 'none' || LIVE.busy ? '<span class="live-dot"></span>Loading token…' : `<h2>Token not found</h2><p class="mono" style="word-break:break-all">${esc(addr)}</p><a class="btn ghost" href="https://gmgn.ai/sol/token/${esc(addr)}" target="_blank" rel="noopener noreferrer">Look it up on GMGN ↗</a>`}<a class="btn primary" href="#/">Back to the board</a></div>`;
    if (LIVE.source !== 'snapshot') liveRefresh(true);
    return;
  }
  const sym = esc(p.baseToken.symbol), links = [];
  links.push(`<a class="btn primary" href="https://gmgn.ai/sol/token/${esc(addr)}" target="_blank" rel="noopener noreferrer">Trade on GMGN ↗</a>`);
  links.push(`<a class="btn ghost" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">DexScreener ↗</a>`);
  links.push(`<a class="btn ghost" href="https://solscan.io/token/${esc(addr)}" target="_blank" rel="noopener noreferrer">Solscan ↗</a>`);
  ((p.info && p.info.websites) || []).slice(0, 2).forEach(w => /^https:\/\//.test(w.url) && links.push(`<a class="btn ghost" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">${esc(w.label || 'Website')} ↗</a>`));
  ((p.info && p.info.socials) || []).slice(0, 3).forEach(s => /^https:\/\//.test(s.url) && links.push(`<a class="btn ghost" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.type === 'twitter' ? 'X' : s.type)} ↗</a>`));
  v.innerHTML = `<div class="coin-top"><span class="vt-logo">${liveImg(p, 'lg')}</span><div class="t"><div class="tags"><span class="pairtag">${sym} / ${esc(p.quoteToken.symbol)}</span><span class="pill">${esc(p.dexId)}</span><span class="pill">Solana</span>${LIVE.boosted.includes(addr) ? '<span class="pill grad">Trending</span>' : ''}<span class="pill" id="lvSrc">${LIVE.source === 'live' ? 'live' : 'snapshot'}</span></div><h1 style="font-size:clamp(28px,4vw,40px)">${esc(p.baseToken.name)}</h1>
      <button class="addr-chip mono" id="lvCopy" type="button" title="Copy token address">${esc(short(addr))} <span aria-hidden="true">⧉</span></button></div>
    <div class="price"><div class="p" id="lvPx">${money(lp(p))}</div><div class="mono micro" id="lvCh"></div></div>${starBtn('live:' + addr)}</div>
  <div class="coin-grid"><div>
    <div class="panel"><div class="tf"><div class="seg" id="lvTf">${Object.keys(TF).map(k => `<button type="button" data-tf="${k}" class="${liveTf === k ? 'on' : ''}">${k}</button>`).join('')}</div><span class="micro mono" id="lvChartSrc">loading chart…</span></div><div class="chart-box" id="lvChart"></div></div>
    <div class="panel"><h3 style="margin-bottom:10px">Activity</h3><div class="tbl-wrap" style="border:0;background:none"><table><thead><tr><th></th><th class="r">Change</th><th class="r">Volume</th><th class="r">Buys</th><th class="r">Sells</th><th>Pressure</th></tr></thead><tbody id="lvAct"></tbody></table></div></div>
  </div><div>
    <div class="panel trade"><div class="eyebrow" style="margin-bottom:10px">Paper trade at the live price</div>
      <div class="seg" id="lvSide"><button class="on buy" data-side="buy" type="button">Buy</button><button class="sell" data-side="sell" type="button">Sell</button></div>
      <div class="field"><label for="lvAmt"><span id="lvLbl">You pay</span><span id="lvBal" class="mono"></span></label><div class="inp"><input id="lvAmt" inputmode="decimal" placeholder="0.00" autocomplete="off"><span id="lvUnit">USD</span></div><div class="quick" id="lvQuick"></div></div>
      <div class="quote" id="lvQuote"></div><div class="err" id="lvErr"></div>
      <button class="btn primary big" id="lvGo" type="button" style="width:100%">Paper buy ${sym}</button>
      <p class="hint" style="margin-top:10px">Uses your demo cash so you can practise against real prices. Real orders go through GMGN or another Solana DEX.</p></div>
    <div class="panel"><div class="eyebrow" style="margin-bottom:8px">Token</div><div id="lvStats"></div><div class="bar" style="margin:12px 0 0;flex-wrap:wrap">${links.join('')}</div></div>
  </div></div>`;
  $('#lvCopy').onclick = () => copyText(addr, 'Token address copied');
  $('#lvTf').onclick = e => { const b = e.target.closest('button'); if (!b) return; liveTf = b.dataset.tf; store('sc.liveTf', liveTf); $$('#lvTf button').forEach(x => x.classList.toggle('on', x === b)); liveCandles(addr, true); };
  let side = 'buy';
  const amt = $('#lvAmt');
  const pos = () => (W && W.paper && W.paper['live:' + addr]) || { qty: 0, cost: 0 };
  const paint = () => {
    const P = LIVE.pairs.get(addr); if (!P) return; const px = lp(P), n = parseFloat(amt.value) || 0, ps = pos();
    $('#lvBal').textContent = W ? (side === 'buy' ? 'Cash ' + money(W.usd) : 'Holding ' + tok(ps.qty)) : '';
    if (!$('#lvQuick').dataset.side || $('#lvQuick').dataset.side !== side) { $('#lvQuick').dataset.side = side; $('#lvQuick').innerHTML = side === 'buy' ? [25, 100, 500, 1000].map(x => `<button type="button" data-v="${x}">$${x}</button>`).join('') : [[.25, '25%'], [.5, '50%'], [1, 'Max']].map(([x, l]) => `<button type="button" data-v="${x}">${l}</button>`).join(''); }
    const btn = $('#lvGo'); btn.textContent = W ? (side === 'buy' ? 'Paper buy ' : 'Paper sell ') + P.baseToken.symbol : 'Connect to paper trade'; btn.disabled = W ? !(n > 0) : false;
    const err = $('#lvErr'); err.textContent = '';
    if (W && n > 0 && (side === 'buy' ? n > W.usd + 1e-9 : n > ps.qty + 1e-9)) { err.textContent = side === 'buy' ? `You have ${money(W.usd)} of demo cash.` : `You hold ${tok(ps.qty)} ${P.baseToken.symbol}.`; btn.disabled = true; }
    const fee = .005, val = ps.qty * px, pnl = val - ps.cost;
    $('#lvQuote').innerHTML = (n > 0 ? (side === 'buy' ? `<div class="kv"><span>You get</span><span><b>${tok(n * (1 - fee) / px)} ${esc(P.baseToken.symbol)}</b></span></div>` : `<div class="kv"><span>You get</span><span><b>${money(n * px * (1 - fee))}</b></span></div>`) + `<div class="kv"><span>Sim fee</span><span>0.5%</span></div>` : `<div class="kv"><span>${LIVE.source === 'live' ? 'Live price' : 'Snapshot price'}</span><span>${money(px)}</span></div>`)
      + (ps.qty > 0 ? `<div class="kv"><span>Your position</span><span>${tok(ps.qty)} · ${money(val)}</span></div><div class="kv"><span>P&amp;L</span><span class="${cls(pnl)}">${money(pnl)} (${pct(ps.cost ? pnl / ps.cost : 0)})</span></div>` : '');
  };
  liveTradePaint = paint;
  $('#lvSide').onclick = e => { const b = e.target.closest('button'); if (!b) return; side = b.dataset.side; $$('#lvSide button').forEach(x => x.classList.toggle('on', x === b)); $('#lvUnit').textContent = side === 'buy' ? 'USD' : p.baseToken.symbol; $('#lvLbl').textContent = side === 'buy' ? 'You pay' : 'You sell'; amt.value = ''; paint(); };
  $('#lvQuick').onclick = e => { const b = e.target.closest('button'); if (!b) return; if (!W) return openConnect(); if (side === 'buy') amt.value = b.dataset.v; else { const q = pos().qty; if (!q) { $('#lvErr').textContent = `You hold no ${p.baseToken.symbol} yet.`; return; } amt.value = +b.dataset.v === 1 ? String(q) : String(q * +b.dataset.v); } paint(); };
  amt.oninput = paint; amt.onkeydown = e => { if (e.key === 'Enter') $('#lvGo').click(); };
  $('#lvGo').onclick = () => {
    if (!W) return openConnect(() => { location.hash = '#/live/' + addr; });
    const P = LIVE.pairs.get(addr), px = lp(P), n = parseFloat(amt.value) || 0; if (!(n > 0) || !px) return;
    W.paper = W.paper || {}; const k = 'live:' + addr; const ps = W.paper[k] || { qty: 0, cost: 0, sym: P.baseToken.symbol, name: P.baseToken.name };
    if (side === 'buy') { if (n > W.usd + 1e-9) return; const q = n * .995 / px; ps.qty += q; ps.cost += n; W.usd -= n; toast(`Paper bought ${tok(q)} ${P.baseToken.symbol}`); }
    else { if (n > ps.qty + 1e-9) return; const out = n * px * .995; ps.cost *= 1 - n / ps.qty; ps.qty -= n; W.usd += out; toast(`Paper sold for ${money(out)}`); }
    if (ps.qty < 1e-9) delete W.paper[k]; else W.paper[k] = ps;
    save(); amt.value = ''; paint();
  };
  paint(); liveRefreshPage(); liveCandles(addr, true);
}
let liveTradePaint = null;
function liveRefreshPage() {
  const addr = routeParts()[1], p = LIVE.pairs.get(addr); if (!p || !$('#lvPx')) { if (p && !$('#lvPx') && routeParts()[0] === 'live') render(); return; }
  const ch = lchg(p);
  $('#lvPx').textContent = money(lp(p)); $('#lvCh').innerHTML = `<span class="${cls(ch)}">${pct(ch)}</span> 24h`;
  $('#lvSrc').textContent = LIVE.source === 'live' ? 'live · ' + ago(LIVE.updated) : 'snapshot';
  $('#lvAct').innerHTML = [['m5', '5m'], ['h1', '1h'], ['h6', '6h'], ['h24', '24h']].map(([k, l]) => { const c = lchg(p, k), t = ltx(p, k), s = t.buys + t.sells || 1; return `<tr><td class="mono muted">${l}</td><td class="r mono ${cls(c)}">${pct(c)}</td><td class="r mono">${usdC(lvol(p, k))}</td><td class="r mono up">${t.buys.toLocaleString()}</td><td class="r mono down">${t.sells.toLocaleString()}</td><td style="min-width:90px"><div class="bsbar"><i style="width:${(t.buys / s * 100).toFixed(1)}%"></i></div></td></tr>`; }).join('');
  $('#lvStats').innerHTML = `<div class="kv"><span>Market cap</span><span>${usdC(lmc(p))}</span></div><div class="kv"><span>FDV</span><span>${usdC(p.fdv || 0)}</span></div><div class="kv"><span>Liquidity</span><span>${usdC(lliq(p))}${p.liquidity && p.liquidity.quote ? ' · ' + fmtTiny(p.liquidity.quote) + ' ' + esc(p.quoteToken.symbol) : ''}</span></div><div class="kv"><span>Price in ${esc(p.quoteToken.symbol)}</span><span>${fmtTiny(+p.priceNative)}</span></div><div class="kv"><span>Pair created</span><span>${p.pairCreatedAt ? ago(p.pairCreatedAt) + ' ago' : '—'}</span></div><div class="kv"><span>Token</span><span class="mono">${esc(short(p.baseToken.address))}</span></div>`;
  if (liveTradePaint) liveTradePaint();
  if (liveSeries && LIVE.source === 'live' && now() - liveCandlesAt > 60e3) liveCandles(addr);
  else if (liveSeries && liveSeries._line) liveLineFallback(p);
}
async function liveCandles(addr, reset) {
  const box = $('#lvChart'); if (!box) return;
  const p = LIVE.pairs.get(addr); if (!p) return;
  if (reset || !liveChart) { destroyLiveChart(); if (!window.LightweightCharts) { box.innerHTML = `<canvas style="width:100%;height:100%" id="lvSpark"></canvas>`; drawSparkTP($('#lvSpark'), livePts(p)); if ($('#lvChartSrc')) $('#lvChartSrc').textContent = 'price line (chart library unavailable)'; return; } const col = chartColors();
    liveChart = LightweightCharts.createChart(box, { autoSize: true, layout: { background: { type: 'solid', color: 'transparent' }, textColor: col.ink, fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }, grid: { vertLines: { color: col.rule }, horzLines: { color: col.rule } }, rightPriceScale: { borderColor: col.rule }, timeScale: { borderColor: col.rule, timeVisible: true, secondsVisible: false }, localization: { locale: 'en-US' } });
    liveVol = liveChart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'v' }); liveChart.priceScale('v').applyOptions({ scaleMargins: { top: .82, bottom: 0 } }); }
  liveCandlesAt = now();
  try {
    if (LIVE.source !== 'live') throw new Error('offline');
    const [unit, agg] = TF[liveTf];
    const d = await getJSON(`${GT}/pools/${encodeURIComponent(p.pairAddress)}/ohlcv/${unit}?aggregate=${agg}&limit=240&currency=usd`);
    const raw = ((d.data && d.data.attributes && d.data.attributes.ohlcv_list) || []).slice().reverse();
    const rows = cleanCandles(raw, livePts(p));
    if (rows.length < Math.min(12, raw.length * .3)) throw new Error('inconsistent');
    if (!liveChart) return;
    if (!liveSeries || liveSeries._line) { if (liveSeries) liveChart.removeSeries(liveSeries); const col = chartColors(); liveSeries = liveChart.addCandlestickSeries({ upColor: col.up, downColor: col.down, borderVisible: false, wickUpColor: col.up, wickDownColor: col.down, priceFormat: { type: 'custom', formatter: v => fmtTiny(v), minMove: 1e-12 } }); liveSeries.priceScale().applyOptions({ scaleMargins: { top: .08, bottom: .22 } }); }
    liveSeries.setData(rows.map(r => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4] })));
    liveVol.setData(rows.map(r => ({ time: r[0], value: +r[5], color: (+r[4] >= +r[1] ? chartColors().up : chartColors().down) + '66' })));
    if (reset) liveChart.timeScale().fitContent();
    if ($('#lvChartSrc')) $('#lvChartSrc').textContent = 'candles from GeckoTerminal';
  } catch (e) { liveLineFallback(p, e); }
}
// GeckoTerminal sometimes mixes in prices that are far off the real market (dust trades, or a second
// price regime for the same pool). DexScreener's price history is the reference: a candle survives only
// if it sits within 3x of where DexScreener says the price was at that moment.
function cleanCandles(rows, ref) {
  const at = t => { if (!ref.length) return 0; if (t <= ref[0].t) return ref[0].p; for (let i = 1; i < ref.length; i++) if (t <= ref[i].t) { const a = ref[i - 1], b = ref[i], k = (t - a.t) / (b.t - a.t || 1); return Math.exp(Math.log(a.p) + k * (Math.log(b.p) - Math.log(a.p))); } return ref[ref.length - 1].p; };
  const ok = (v, m) => v > 0 && m > 0 && v / m < 3 && m / v < 3;
  return rows.filter(r => { const m = at(r[0] * 1000); return ok(+r[4], m) && ok(+r[1], m); })
    .map(r => { const hi = Math.max(+r[1], +r[4]), lo = Math.min(+r[1], +r[4]); return [r[0], +r[1], Math.min(+r[2], hi * 1.2), Math.max(+r[3], lo / 1.2), +r[4], +r[5]]; });
}
function liveLineFallback(p, e) {
  if (!liveChart) return;
  if (!liveSeries || !liveSeries._line) { if (liveSeries) liveChart.removeSeries(liveSeries); const col = chartColors(); liveSeries = liveChart.addAreaSeries({ lineColor: col.up, topColor: col.up + '44', bottomColor: col.up + '00', lineWidth: 2, priceFormat: { type: 'custom', formatter: v => fmtTiny(v), minMove: 1e-12 } }); liveSeries._line = true; liveVol.setData([]); }
  const seen = new Set(); const data = livePts(p).map(q => ({ time: Math.floor(q.t / 1000), value: q.p })).filter(q => !seen.has(q.time) && seen.add(q.time));
  liveSeries.setData(data); liveChart.timeScale().fitContent();
  if ($('#lvChartSrc')) $('#lvChartSrc').textContent = e && /429/.test(e.message) ? 'candle API busy, showing live price line' : e && e.message === 'inconsistent' ? 'candle data disagrees with the live price, showing the price line' : LIVE.source === 'live' ? 'price line from live updates' : 'price line from snapshot data';
}
function destroyLiveChart() { if (liveChart) { liveChart.remove(); liveChart = null; liveSeries = null; liveVol = null; } }
function liveWatchHtml() {
  const list = ui.watch.filter(id => id.startsWith('live:')).map(id => LIVE.pairs.get(id.slice(5))).filter(Boolean);
  return list.length ? list.map(liveCard).join('') : '';
}

// ---------- quick view: tap a card, a sheet slides in ----------
let peek = null; // { kind, id, list, el }
function peekList() { return $$('#view [data-peek]').map(e => e.dataset.peek).filter((v, i, a) => a.indexOf(v) === i); }
function openPeek(key, from) {
  const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  if (kind === 'coin' && !S.coins[id]) return;
  if (kind === 'live' && !LIVE.pairs.get(id)) return;
  const list = peekList();
  if (!peek) {
    const sc = document.createElement('div'); sc.className = 'peek-scrim';
    sc.innerHTML = `<aside class="peek" role="dialog" aria-modal="true" aria-label="Quick view"><div class="peek-grab" aria-hidden="true"></div><div class="peek-body"></div></aside>`;
    document.body.appendChild(sc);
    sc.addEventListener('click', e => { if (e.target === sc) closePeek(); });
    peek = { el: sc, key, list, origin: from || document.activeElement };
    requestAnimationFrame(() => requestAnimationFrame(() => sc.classList.add('open')));
    dragToClose(sc.querySelector('.peek'));
    document.body.classList.add('peeking');
  } else { peek.list = list.length ? list : peek.list; }
  const dir = peek.key && peek.list.indexOf(key) < peek.list.indexOf(peek.key) ? -1 : 1;
  const changed = peek.key !== key || !peek.el.querySelector('.peek-in');
  peek.key = key;
  paintPeek(changed ? dir : 0);
}
function closePeek(instant) {
  if (!peek) return;
  const { el, origin } = peek; peek = null; document.body.classList.remove('peeking');
  if (instant) { el.remove(); return; }
  el.classList.remove('open'); el.classList.add('closing');
  setTimeout(() => el.remove(), 320);
  if (origin && origin.focus && document.contains(origin)) origin.focus({ preventScroll: true });
}
function stepPeek(d) { if (!peek) return; const l = peek.list, i = l.indexOf(peek.key); const n = l[(i + d + l.length) % l.length]; if (n && n !== peek.key) openPeek(n); }
function paintPeek(dir) {
  if (!peek) return;
  const body = peek.el.querySelector('.peek-body');
  const [kind, id] = [peek.key.slice(0, peek.key.indexOf(':')), peek.key.slice(peek.key.indexOf(':') + 1)];
  const i = peek.list.indexOf(peek.key), n = peek.list.length;
  const isLive = kind === 'live', c = isLive ? null : S.coins[id], p = isLive ? LIVE.pairs.get(id) : null;
  if (!c && !p) return closePeek();
  const name = isLive ? p.baseToken.name : c.name, sym = isLive ? p.baseToken.symbol : c.sym;
  const px = isLive ? lp(p) : priceUsd(c), ch = isLive ? lchg(p) : change24(c);
  const full = isLive ? '#/live/' + id : '#/coin/' + id;
  const pos = W ? (isLive ? ((W.paper || {})['live:' + id] || {}).qty || 0 : c.holders[W.addr] || 0) : 0;
  const stats = isLive
    ? [['Market cap', usdC(lmc(p))], ['Liquidity', usdC(lliq(p))], ['Volume 24h', usdC(lvol(p))], ['Pair age', p.pairCreatedAt ? ago(p.pairCreatedAt) : '—'], ['1h', `<span class="${cls(lchg(p, 'h1'))}">${pct(lchg(p, 'h1'))}</span>`], ['5m', `<span class="${cls(lchg(p, 'm5'))}">${pct(lchg(p, 'm5'))}</span>`]]
    : [['Market cap', usdC(mcapUsd(c))], ['Volume 24h', usdC(vol24(c))], ['vs ' + c.co, `<span class="${cls(excess(c))}">${pct(excess(c))}</span>`], ['Holders', Object.keys(c.holders).length], ['Creator tax', (c.tax * 100).toFixed(2) + '%'], ['Launched', ago(c.created) + ' ago']];
  const tx = isLive ? ltx(p) : null;
  const html = `<div class="peek-in ${dir > 0 ? 'from-r' : dir < 0 ? 'from-l' : ''}">
    <div class="peek-top">
      <button class="icon-btn" type="button" data-peek-step="-1" aria-label="Previous" ${n < 2 ? 'disabled' : ''}>‹</button>
      <span class="micro mono">${i + 1} / ${n || 1}</span>
      <button class="icon-btn" type="button" data-peek-step="1" aria-label="Next" ${n < 2 ? 'disabled' : ''}>›</button>
      <span class="spacer"></span>${starBtn(isLive ? 'live:' + id : id)}
      <button class="icon-btn" type="button" data-peek-close aria-label="Close">✕</button>
    </div>
    <div class="peek-hero">
      <div class="peek-logo">${isLive ? liveImg(p, 'xl') : logo(c, 'xl')}</div>
      <div class="peek-name"><div class="tags"><span class="pairtag">${esc(sym)} / ${isLive ? esc(p.quoteToken.symbol) : c.co}</span>${isLive ? `<span class="pill">${esc(p.dexId)}</span>` : `<span class="pill">${esc(c.app)}</span>`}${isLive && LIVE.boosted.includes(id) ? '<span class="pill grad">Trending</span>' : ''}${!isLive && c.graduated ? '<span class="pill grad">Graduated</span>' : ''}</div><h2>${esc(name)}</h2></div>
      <div class="peek-px"><div class="p mono" data-peek-px>${money(px, isLive ? {} : { co: c.co })}</div><div class="mono micro ${cls(ch)}" data-peek-ch>${pct(ch)} 24h</div></div>
    </div>
    <canvas class="peek-spark" data-peek-spark aria-hidden="true"></canvas>
    ${isLive ? `<div class="bsbar"><i style="width:${(tx.buys / ((tx.buys + tx.sells) || 1) * 100).toFixed(1)}%"></i></div><div class="foot micro" style="display:flex;justify-content:space-between;margin-top:6px"><span class="up">${tx.buys.toLocaleString()} buys</span><span class="down">${tx.sells.toLocaleString()} sells</span></div>`
      : c.graduated ? '' : `<div class="prog"><i style="width:${(progress(c) * 100).toFixed(1)}%"></i></div><div class="micro" style="margin-top:6px">${(progress(c) * 100).toFixed(1)}% of the curve sold</div>`}
    <div class="peek-stats">${stats.map(([k, v2]) => `<div><span>${k}</span><b class="mono">${v2}</b></div>`).join('')}</div>
    ${!isLive && c.desc ? `<p class="peek-desc">${esc(c.desc)}</p>` : ''}
    <div class="peek-buy">
      <div class="eyebrow">${isLive ? 'Quick paper buy' : 'Quick buy'}${pos > 0 ? ` · you hold <b class="mono">${tok(pos)}</b>` : ''}</div>
      <div class="peek-chips">${[25, 100, 500].map(v2 => `<button type="button" class="chip" data-amt="${v2}">$${v2}</button>`).join('')}</div>
      <button class="btn primary big peek-go" type="button" data-peek-buy disabled>Pick an amount</button>
    </div>
    <div class="peek-actions"><a class="btn ghost" href="${full}" data-peek-open>Open full page →</a>${isLive ? `<a class="btn ghost" href="https://gmgn.ai/sol/token/${esc(id)}" target="_blank" rel="noopener noreferrer">GMGN ↗</a>` : ''}</div>
  </div>`;
  body.innerHTML = html;
  const spark = body.querySelector('[data-peek-spark]');
  requestAnimationFrame(() => { if (isLive) drawSparkTP(spark, livePts(p)); else drawSparkTP(spark, c.trades.slice(-120).map(t => ({ t: t.t, p: t.p }))); });
  let amt = 0;
  body.onclick = e => {
    const st = e.target.closest('[data-peek-step]'); if (st) return stepPeek(+st.dataset.peekStep);
    if (e.target.closest('[data-peek-close]')) return closePeek();
    const chip = e.target.closest('[data-amt]');
    if (chip) { amt = +chip.dataset.amt; $$('.chip', body).forEach(x => x.classList.toggle('on', x === chip)); const b = body.querySelector('[data-peek-buy]'); b.disabled = false; b.textContent = W ? `${isLive ? 'Paper buy' : 'Buy'} $${amt} of ${sym}` : 'Connect to buy'; b.classList.remove('done'); return; }
    if (e.target.closest('[data-peek-buy]')) {
      if (!W) return openConnect(() => paintPeek(0));
      if (amt > W.usd) return toast(`You have ${money(W.usd)} of demo cash.`);
      let got = 0;
      if (isLive) { const P = LIVE.pairs.get(id); W.paper = W.paper || {}; const k = 'live:' + id; const ps = W.paper[k] || { qty: 0, cost: 0, sym: P.baseToken.symbol, name: P.baseToken.name }; got = amt * .995 / lp(P); ps.qty += got; ps.cost += amt; W.paper[k] = ps; W.usd -= amt; }
      else { const q = tradeBuy(S, c, amt / S.stocks[c.co].px, W.addr); if (!q) return toast('Nothing left to buy on this curve.'); got = q.out; W.usd -= amt - q.refund * S.stocks[c.co].px; }
      save();
      const b = e.target.closest('[data-peek-buy]'); b.classList.add('done'); b.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg> Got ${tok(got)} ${esc(sym)}`;
      burst(b); toast(`${isLive ? 'Paper bought' : 'Bought'} ${tok(got)} ${sym}`);
      setTimeout(() => { if (peek && peek.key === (isLive ? 'live:' : 'coin:') + id) paintPeek(0); }, 1400);
      return;
    }
    const open = e.target.closest('[data-peek-open]');
    if (open) { e.preventDefault(); const lg = body.querySelector('.peek-logo'); if (lg) lg.style.viewTransitionName = 'hero-logo'; closePeek(true); go(open.getAttribute('href')); }
  };
}
function refreshPeek() {
  if (!peek) return;
  const body = peek.el.querySelector('.peek-body'), [kind, id] = [peek.key.slice(0, peek.key.indexOf(':')), peek.key.slice(peek.key.indexOf(':') + 1)];
  const isLive = kind === 'live', c = S.coins[id], p = LIVE.pairs.get(id);
  const pxEl = body.querySelector('[data-peek-px]'); if (!pxEl) return;
  if (isLive && p) { pxEl.textContent = money(lp(p)); const ch = lchg(p); const ce = body.querySelector('[data-peek-ch]'); ce.textContent = pct(ch) + ' 24h'; ce.className = 'mono micro ' + cls(ch); drawSparkTP(body.querySelector('[data-peek-spark]'), livePts(p)); }
  if (!isLive && c) { pxEl.textContent = money(priceUsd(c), { co: c.co }); const ch = change24(c); const ce = body.querySelector('[data-peek-ch]'); ce.textContent = pct(ch) + ' 24h'; ce.className = 'mono micro ' + cls(ch); drawSparkTP(body.querySelector('[data-peek-spark]'), c.trades.slice(-120).map(t => ({ t: t.t, p: t.p }))); const pr = body.querySelector('.prog i'); if (pr) pr.style.width = (progress(c) * 100).toFixed(1) + '%'; }
}
function dragToClose(sheet) {
  // the drag only starts after the finger moves, so taps on the buttons in the header still work
  let y0 = null, dy = 0, dragging = false;
  const down = e => { if (innerWidth > 700 || !e.target.closest('.peek-grab, .peek-top')) return; y0 = e.clientY; dy = 0; dragging = false; };
  const move = e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); if (!dragging && dy > 8) { dragging = true; sheet.style.transition = 'none'; try { sheet.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ } } if (dragging) sheet.style.transform = `translateY(${dy}px)`; };
  const up = () => { if (y0 == null) return; y0 = null; if (!dragging) return; dragging = false; sheet.style.transition = ''; sheet.style.transform = ''; if (dy > 110) closePeek(); };
  sheet.addEventListener('pointerdown', down); sheet.addEventListener('pointermove', move); sheet.addEventListener('pointerup', up); sheet.addEventListener('pointercancel', up);
}
document.addEventListener('keydown', e => {
  if (!peek) return;
  if (e.key === 'Escape') { e.stopPropagation(); closePeek(); }
  if (e.key === 'ArrowRight' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) stepPeek(1);
  if (e.key === 'ArrowLeft' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) stepPeek(-1);
}, true);

// ---------- page transitions ----------
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function transition(fn) {
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    try { return document.startViewTransition(fn); } catch (e) { /* fall through */ }
  }
  fn();
}

// ---------- how it works: tap a step, the scene changes ----------
const STEPS = [
  ['Pick an app', 'Every app belongs to a listed company. Instagram is META, YouTube is GOOGL. That company becomes your pair.'],
  ['Launch the coin', 'One billion coins are minted once. Eight hundred million go on the bonding curve, and you can set a creator tax of up to 2%.'],
  ['Buyers fill the curve', 'Each buy puts shares of the paired stock into the curve and moves the price up the curve. Sells move it back down.'],
  ['Graduate and lock', 'When the curve sells out, its stock and the last 200 million coins form a pool. That liquidity is locked for good.'],
];
const SCENES = [
  `<g class="sc-a"><rect x="40" y="50" width="70" height="70" rx="18" fill="var(--teal)"/><circle cx="75" cy="85" r="14" fill="none" stroke="#fff" stroke-width="5"/><circle cx="96" cy="64" r="4" fill="#fff"/></g><path class="sc-arrow" d="M125 85h50" stroke="var(--ink-3)" stroke-width="3" stroke-dasharray="6 6"/><path d="M170 77l10 8-10 8" fill="none" stroke="var(--ink-3)" stroke-width="3"/><g class="sc-b"><rect x="190" y="58" width="96" height="54" rx="12" fill="var(--surface-3)" stroke="var(--rule-2)"/><text x="238" y="92" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="20" font-weight="700" fill="var(--ink)">META</text></g>`,
  `<g class="sc-coin"><circle cx="160" cy="85" r="44" fill="var(--accent)"/><circle cx="160" cy="85" r="34" fill="none" stroke="#fff" stroke-width="3" opacity=".6"/><text x="160" y="94" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="24" font-weight="700" fill="var(--accent-ink)">1B</text></g><g class="sc-sparks" fill="var(--accent)"><circle cx="92" cy="50" r="5"/><circle cx="232" cy="46" r="4"/><circle cx="236" cy="128" r="6"/><circle cx="86" cy="124" r="4"/></g>`,
  `<path d="M40 140 H290 M40 140 V20" stroke="var(--rule-2)" stroke-width="2"/><path class="sc-curve" d="M40 135 C140 132 200 110 290 30" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round"/><circle class="sc-dot" r="8" fill="var(--teal)"><animateMotion dur="3.2s" repeatCount="indefinite" path="M40 135 C140 132 200 110 290 30"/></circle><text x="292" y="150" text-anchor="end" font-family="IBM Plex Mono,monospace" font-size="11" fill="var(--ink-3)">coins sold →</text>`,
  `<g class="sc-pool"><ellipse cx="160" cy="118" rx="96" ry="22" fill="var(--teal)" opacity=".35"/><ellipse cx="160" cy="112" rx="96" ry="22" fill="var(--teal)" opacity=".6"/></g><g class="sc-lock"><rect x="130" y="60" width="60" height="48" rx="10" fill="var(--accent)"/><path d="M142 60V48a18 18 0 0 1 36 0v12" fill="none" stroke="var(--accent)" stroke-width="8"/><circle cx="160" cy="82" r="6" fill="var(--accent-ink)"/><rect x="157" y="84" width="6" height="12" rx="2" fill="var(--accent-ink)"/></g>`,
];
function howItWorks() {
  return `<section class="how" id="how" aria-label="How it works">
    <div class="shead"><h2>How a coin is born</h2><span class="micro">tap a step</span></div>
    <div class="how-grid"><div class="how-steps" role="tablist">${STEPS.map((s2, i) => `<button type="button" role="tab" class="how-step ${i === 0 ? 'on' : ''}" data-step="${i}" aria-selected="${i === 0}"><span class="how-n mono">${i + 1}</span><span class="grow"><b>${s2[0]}</b><span class="how-txt">${s2[1]}</span></span><i class="how-bar"><i></i></i></button>`).join('')}</div>
    <div class="how-stage panel"><svg viewBox="0 0 320 170" id="howSvg" aria-hidden="true">${SCENES[0]}</svg><a class="btn primary" href="#/launch">Launch a coin</a></div></div></section>`;
}
let howTimer = null;
function bindHow() {
  const root = $('#how'); if (!root) return;
  let i = 0, paused = false;
  const show = n => {
    i = n; $$('.how-step', root).forEach((b, k) => { b.classList.toggle('on', k === n); b.setAttribute('aria-selected', k === n); const bar = b.querySelector('.how-bar i'); bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; });
    const svg = $('#howSvg'); svg.classList.remove('swap'); void svg.getBoundingClientRect(); svg.innerHTML = SCENES[n]; svg.classList.add('swap');
  };
  root.querySelector('.how-steps').onclick = e => { const b = e.target.closest('.how-step'); if (b) { show(+b.dataset.step); paused = true; root.classList.add('paused'); } };
  root.addEventListener('mouseenter', () => root.classList.add('hover')); root.addEventListener('mouseleave', () => root.classList.remove('hover'));
  clearInterval(howTimer);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) howTimer = setInterval(() => { if (!$('#how')) return clearInterval(howTimer); if (!paused && !root.classList.contains('hover')) show((i + 1) % STEPS.length); }, 5000);
}

// ---------- Zcash (ZEC) ----------
// Price, 24h stats and candles from Coinbase Exchange (Binance as a fallback), block height from
// Blockchair. All three are public and allow browser requests. When none can be reached, the page
// uses the zec block in live-snapshot.json and says so.
const ZEC_LOGO = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path fill="#ECB244" d="M11.19 15.316h5.547v3.316H13.42V21h-2.844v-2.368H7.263v-3.01l5.521-6.938h-5.52V5.368h3.313V3h2.844v2.368h3.316v3.01z"/></svg>';
const ZEC = { price: 0, open: 0, high: 0, low: 0, vol: 0, height: 0, at: 0, heightAt: 0, source: 'none', candles: {}, busy: false, tf: store('sc.zecTf') || '7d' };
const ZTF = { '1d': [300, 864e5], '7d': [3600, 7 * 864e5], '30d': [21600, 30 * 864e5], '1y': [86400, 300 * 864e5] };
const BLOSSOM = 653600, H1 = 1046400, H2 = 2726400, HALVING = 1680000;
// ZEC issued up to a block height: slow start, 12.5 ZEC per 150 s block until Blossom,
// then 75 s blocks at half the reward, halving every 1,680,000 blocks.
function zecIssued(h) {
  if (!h) return 0;
  let s = 125000 + Math.max(0, Math.min(h, BLOSSOM - 1) - 20000) * 12.5;
  if (h >= BLOSSOM) s += (Math.min(h, H1 - 1) - BLOSSOM + 1) * 6.25;
  let start = H1, reward = 3.125;
  while (h >= start) { s += (Math.min(h, start + HALVING - 1) - start + 1) * reward; start += HALVING; reward /= 2; }
  return s;
}
const zecReward = h => { if (h < BLOSSOM) return 12.5; if (h < H1) return 6.25; return 3.125 / Math.pow(2, Math.floor((h - H1) / HALVING)); };
const zecNextHalving = h => h < H1 ? H1 : H1 + (Math.floor((h - H1) / HALVING) + 1) * HALVING;
function zecHeightNow() { return ZEC.height ? ZEC.height + Math.floor((now() - ZEC.heightAt) / 75000) : 0; }
const zecChg = () => ZEC.open ? ZEC.price / ZEC.open - 1 : 0;
async function zecRefresh(force) {
  if (ZEC.busy || (document.hidden && !force)) return;
  ZEC.busy = true;
  try {
    try {
      const [t, s2] = await Promise.all([getJSON('https://api.exchange.coinbase.com/products/ZEC-USD/ticker'), getJSON('https://api.exchange.coinbase.com/products/ZEC-USD/stats')]);
      Object.assign(ZEC, { price: +t.price, open: +s2.open, high: +s2.high, low: +s2.low, vol: +s2.volume });
    } catch (e) {
      const b = await getJSON('https://data-api.binance.vision/api/v3/ticker/24hr?symbol=ZECUSDT');
      Object.assign(ZEC, { price: +b.lastPrice, open: +b.openPrice, high: +b.highPrice, low: +b.lowPrice, vol: +b.volume });
    }
    ZEC.prev = ZEC.last; ZEC.last = ZEC.price;
    ZEC.at = now(); ZEC.source = 'live';
    if (now() - ZEC.heightAt > 60e3) getJSON('https://api.blockchair.com/zcash/stats').then(d => { ZEC.height = d.data.best_block_height; ZEC.heightAt = now(); zecPaint(); }).catch(() => {});
  } catch (e) {
    if (ZEC.source !== 'live') await zecSnapshot();
  } finally { ZEC.busy = false; zecPaint(); }
}
async function zecSnapshot() {
  try { const s = await getJSON('live-snapshot.json', 8000); const z = s.zec; if (!z) throw new Error('no zec');
    const cs = {}; Object.entries(z.candles || {}).forEach(([tf, rows]) => { cs[tf] = rows.filter(r => r[0] * 1000 >= z.at - ZTF[tf][1]); });
    Object.assign(ZEC, { price: z.price, open: z.open, high: z.high, low: z.low, vol: z.vol, height: z.height, heightAt: z.at, at: z.at, candles: cs, source: 'snapshot' });
  } catch (e) { ZEC.source = 'down'; }
}
async function zecCandles(tf) {
  if (ZEC.source !== 'live' && ZEC.candles[tf]) return ZEC.candles[tf];
  const [g, span] = ZTF[tf];
  try {
    const rows = await getJSON(`https://api.exchange.coinbase.com/products/ZEC-USD/candles?granularity=${g}&start=${new Date(now() - span).toISOString()}&end=${new Date().toISOString()}`);
    ZEC.candles[tf] = rows.map(r => [r[0], r[3], r[2], r[1], r[4], r[5]]).sort((a, b) => a[0] - b[0]); // [t, o, h, l, c, v]
  } catch (e) {
    try { const iv = { 300: '5m', 3600: '1h', 21600: '6h', 86400: '1d' }[g];
      const k = await getJSON(`https://data-api.binance.vision/api/v3/klines?symbol=ZECUSDT&interval=${iv}&limit=${Math.min(1000, Math.ceil(span / g / 1000))}`);
      ZEC.candles[tf] = k.map(r => [r[0] / 1000, +r[1], +r[2], +r[3], +r[4], +r[5]]);
    } catch (e2) { /* keep whatever we had */ }
  }
  return ZEC.candles[tf] || [];
}
function zecLogo(size = 40) { return `<span class="zlogo" style="width:${size}px;height:${size}px">${ZEC_LOGO}</span>`; }
function zecStatus() {
  if (ZEC.source === 'live') return `<span class="live-dot"></span>Live from Coinbase · updated <b data-zupd>${ago(ZEC.at)}</b> ago`;
  if (ZEC.source === 'snapshot') return `<span class="snap-dot"></span>Snapshot from ${new Date(ZEC.at).toLocaleString()}. This preview can't reach live APIs.`;
  if (ZEC.source === 'down') return 'Zcash prices did not load. <button class="btn ghost" type="button" data-zec-retry>Retry</button>';
  return '<span class="live-dot"></span>Loading Zcash…';
}
// home banner
function zecBanner() {
  return `<a class="zban" href="#/zcash" id="zban"><span class="zban-glow" aria-hidden="true"></span>${zecLogo(46)}
    <span class="zban-t"><span class="eyebrow">Spotlight</span><b>Zcash <span class="muted mono">ZEC</span></b><span class="micro">Private payments with zero-knowledge proofs</span></span>
    <canvas class="zban-spark" id="zbanSpark" aria-hidden="true"></canvas>
    <span class="zban-px"><b class="mono" data-zpx>${ZEC.price ? money(ZEC.price) : '—'}</b><span class="mono micro ${cls(zecChg())}" data-zch>${ZEC.price ? pct(zecChg()) : ''}</span></span>
    <span class="zban-go">Explore →</span></a>`;
}
async function paintZecBanner() {
  const cv = $('#zbanSpark'); if (!cv) return;
  const rows = await zecCandles('1d'); if (!$('#zbanSpark')) return;
  drawSparkTP($('#zbanSpark'), rows.map(r => ({ t: r[0] * 1000, p: r[4] })));
}
function zecPaint() {
  $$('[data-zpx]').forEach(e => { const old = e.textContent; e.textContent = ZEC.price ? money(ZEC.price) : '—'; if (old !== e.textContent && ZEC.prev) { const c = e.closest('.zban, .ztop'); if (c) { c.classList.remove('flash-up', 'flash-down'); void c.offsetWidth; c.classList.add(ZEC.price >= ZEC.prev ? 'flash-up' : 'flash-down'); } } });
  $$('[data-zch]').forEach(e => { e.textContent = ZEC.price ? pct(zecChg()) : ''; e.className = 'mono micro ' + cls(zecChg()); });
  const st = $('#zecStatus'); if (st) st.innerHTML = zecStatus();
  if (routeParts()[0] === 'zcash') zecPagePaint();
  renderTape();
}
setInterval(() => { const u = $('[data-zupd]'); if (u && ZEC.at) u.textContent = ago(ZEC.at); const hb = $('[data-zheight]'); if (hb && ZEC.height) hb.textContent = zecHeightNow().toLocaleString(); }, 1000);
document.addEventListener('click', e => { if (e.target.closest('[data-zec-retry]')) { ZEC.source = 'none'; zecPaint(); zecRefresh(true); } });

// what the chain sees: the same payment, transparent vs shielded
const ZTX = [
  ['From', 't1Qx7…Hd3vK', 'The sender. On a transparent address anyone can see it and follow every past payment from it.'],
  ['To', 't1RmA…9pLwe', 'The recipient. Shielded, the chain stores only an encrypted note that the recipient can find with their viewing key.'],
  ['Amount', '12.5 ZEC', 'How much moved. Shielded amounts are hidden; a zero-knowledge proof shows that no ZEC was created out of thin air.'],
  ['Memo', 'Rent for October', 'A 512-byte encrypted memo. It only exists on shielded payments and only the recipient can read it.'],
];
const ZPOOLS = [
  ['Sprout', '2016', 'The original shielded pool. Legacy now; funds can only move out of it.'],
  ['Sapling', '2018', 'Made shielded payments fast enough for phones. Addresses start with zs1.'],
  ['Orchard', '2022', 'Uses Halo 2 proofs, which need no trusted setup. Reached through unified addresses that start with u1.'],
];
function scramble(el, text, done) {
  const glyphs = '0123456789abcdef#%&*';
  let f = 0; const max = 14;
  const tick = () => { f++; el.textContent = text.split('').map((ch, i) => ch === ' ' ? ' ' : (f < max * (i / text.length) + 4 ? glyphs[Math.floor(Math.random() * glyphs.length)] : ch)).join(''); if (f < max + 4) requestAnimationFrame(tick); else { el.textContent = text; if (done) done(); } };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = text; return done && done(); }
  tick();
}
// address checker
function zecAddrType(a) {
  a = a.trim();
  if (!a) return null;
  const b58 = /^[1-9A-HJ-NP-Za-km-z]+$/, b32 = /^[02-9ac-hj-np-z]+$/;
  if (/^t1/.test(a) && a.length === 35 && b58.test(a)) return ['Transparent (P2PKH)', 'transparent', 'Works like a Bitcoin address. Balance and history are public on the chain.'];
  if (/^t3/.test(a) && a.length === 35 && b58.test(a)) return ['Transparent (P2SH, multisig or script)', 'transparent', 'A script address. Public, like any transparent address.'];
  if (/^tex1/.test(a) && b32.test(a.slice(4))) return ['TEX address (ZIP 320)', 'transparent', 'A transparent address that only accepts funds coming from transparent sources, used by some exchanges.'];
  if (/^zs1/.test(a) && a.length === 78 && b32.test(a.slice(3))) return ['Sapling shielded', 'shielded', 'Payments to this address hide the sender, the receiver, the amount and the memo.'];
  if (/^u1/.test(a) && a.length >= 100 && b32.test(a.slice(2))) return ['Unified address', 'shielded', 'Bundles several receivers (Orchard, Sapling, transparent) in one string. Wallets pick the most private one both sides support.'];
  if (/^zc/.test(a) && a.length === 95 && b58.test(a)) return ['Sprout shielded (legacy)', 'legacy', 'The original 2016 shielded format. Most wallets no longer send to it.'];
  if (/^(zs1|u1|t1|t3|tex1|zc)/.test(a)) return ['Looks like Zcash, but the length or characters are off', 'bad', 'Check that the whole address was copied. A single missing character changes it.'];
  return ['Not a Zcash address', 'bad', 'Zcash addresses start with t1, t3, tex1, zs1, u1 or (very old) zc.'];
}
const ZEC_EXAMPLES = [['t1 transparent', 't1' + 'Rq2yWvLxN8a3mKpT6uYbZcD4eF5gHjJk1'.slice(0, 33)], ['zs1 Sapling', 'zs1' + 'qw3e5r7t9y0u2i4o6p8a3s5d7f9g0h2j4k6l8z3x5c7v9b0n2m4q6w8e3r5t7y9u0i2o4p6a8s3d5'.slice(0, 75).replace(/[1bio]/g, 'x')], ['u1 unified', 'u1' + 'a'.repeat(4) + 'q3w5e7r9t0y2u4i6o8p3a5s7d9f0g2h4j6k8l3z5x7c9v0b2n4m6q8w3e5r7t9y0u2i4o6p8a3s5d7f9g0h2j4k6l8z3x5c7v9b0n2m4'.replace(/[1bio]/g, 'x').slice(0, 104)]];

function zcashPage(v) {
  const h = zecHeightNow();
  v.innerHTML = `<div class="coin-top ztop"><span class="vt-logo">${zecLogo(58)}</span><div class="t"><div class="tags"><span class="pairtag">ZEC / USD</span><span class="pill">Proof of work</span><span class="pill grad">Privacy</span><span class="pill" id="zSrc">${ZEC.source === 'live' ? 'live' : ZEC.source}</span></div><h1 style="font-size:clamp(28px,4vw,40px)">Zcash</h1><span class="micro live-status" id="zecStatus">${zecStatus()}</span></div>
    <div class="price"><div class="p" data-zpx>${ZEC.price ? money(ZEC.price) : '—'}</div><div class="mono micro ${cls(zecChg())}" data-zch>${pct(zecChg())}</div></div>${starBtn('zec')}</div>
  <div class="stats zstats" id="zStats"></div>
  <div class="coin-grid" style="margin-top:18px"><div>
    <div class="panel"><div class="tf"><div class="seg" id="zTf">${Object.keys(ZTF).map(k => `<button type="button" data-tf="${k}" class="${ZEC.tf === k ? 'on' : ''}">${k.toUpperCase()}</button>`).join('')}</div><span class="micro mono" id="zChartSrc">loading chart…</span></div><div class="chart-box" id="zChart"></div></div>

    <div class="panel zsee"><div class="bar" style="justify-content:space-between;margin-bottom:12px"><h3>What the chain sees</h3><div class="seg" id="zMode"><button type="button" data-m="t" class="on">Transparent</button><button type="button" data-m="z">Shielded</button></div></div>
      <div class="ztx" id="zTx">${ZTX.map((r, i) => `<button type="button" class="zrow" data-i="${i}"><span class="zk">${r[0]}</span><span class="zv mono" data-v="${i}">${esc(r[1])}</span><span class="zlock" aria-hidden="true">🔒</span></button>`).join('')}</div>
      <div class="zexplain" id="zExplain"><b>Tap a field</b> to see what it reveals. Then switch to Shielded and watch it disappear from public view.</div>
      <div class="zproof" id="zProof" hidden><svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true"><path d="M20 4l13 5v10c0 9-6 15-13 17C13 34 7 28 7 19V9z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M14 20l4.5 4.5L27 16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" class="zcheck"/></svg><span><b>Valid, and private.</b> A zk-SNARK proves the inputs equal the outputs and the sender owns the funds, without revealing any of them.</span></div>
    </div>

    <div class="panel"><h3 style="margin-bottom:10px">Shielded pools</h3><div class="zpools">${ZPOOLS.map((p, i) => `<button type="button" class="zpool" data-p="${i}" aria-expanded="false"><span class="zpool-h"><b>${p[0]}</b><span class="mono micro">${p[1]}</span><span class="zpool-arrow" aria-hidden="true">›</span></span><span class="zpool-b"><span>${p[2]}</span></span></button>`).join('')}</div></div>
  </div><div>
    <div class="panel trade"><div class="eyebrow" style="margin-bottom:10px">Paper trade ZEC at the live price</div>
      <div class="seg" id="zSide"><button class="on buy" data-side="buy" type="button">Buy</button><button class="sell" data-side="sell" type="button">Sell</button></div>
      <div class="field"><label for="zAmt"><span id="zLbl">You pay</span><span id="zBal" class="mono"></span></label><div class="inp"><input id="zAmt" inputmode="decimal" placeholder="0.00" autocomplete="off"><span id="zUnit">USD</span></div><div class="quick" id="zQuick"></div></div>
      <div class="quote" id="zQuote"></div><div class="err" id="zErr"></div>
      <button class="btn primary big" id="zGo" type="button" style="width:100%">Paper buy ZEC</button>
      <p class="hint" style="margin-top:10px">Uses your demo cash. To hold real ZEC, use a Zcash wallet such as Zashi or YWallet and send to a shielded address.</p></div>

    <div class="panel"><h3 style="margin-bottom:8px">Check a Zcash address</h3><div class="inp"><input id="zAddr" placeholder="Paste t1…, zs1…, u1…" autocomplete="off" spellcheck="false" aria-label="Zcash address"></div>
      <div class="quick" id="zEx">${ZEC_EXAMPLES.map(([l], i) => `<button type="button" data-ex="${i}">${l}</button>`).join('')}</div>
      <div class="zaddr" id="zAddrOut"><span class="micro">Checks the format only. It can't tell whether the address exists or holds funds.</span></div></div>

    <div class="panel"><h3 style="margin-bottom:10px">Supply and halvings</h3><div id="zSupply"></div></div>
    <div class="panel"><div class="bar" style="margin:0;flex-wrap:wrap"><a class="btn ghost" href="https://z.cash/" target="_blank" rel="noopener noreferrer">z.cash ↗</a><a class="btn ghost" href="https://blockchair.com/zcash" target="_blank" rel="noopener noreferrer">Explorer ↗</a><a class="btn ghost" href="https://www.coinbase.com/price/zcash" target="_blank" rel="noopener noreferrer">Coinbase ↗</a></div></div>
  </div></div>`;
  // chart
  const loadChart = async () => {
    const box = $('#zChart'); if (!box) return;
    const rows = await zecCandles(ZEC.tf); if (!$('#zChart')) return;
    destroyLiveChart();
    if (!window.LightweightCharts || !rows.length) { box.innerHTML = '<canvas id="zSpark" style="width:100%;height:100%"></canvas>'; drawSparkTP($('#zSpark'), rows.map(r => ({ t: r[0] * 1000, p: r[4] }))); $('#zChartSrc').textContent = rows.length ? 'price line' : 'no chart data'; return; }
    box.innerHTML = ''; const col = chartColors();
    liveChart = LightweightCharts.createChart(box, { autoSize: true, layout: { background: { type: 'solid', color: 'transparent' }, textColor: col.ink, fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }, grid: { vertLines: { color: col.rule }, horzLines: { color: col.rule } }, rightPriceScale: { borderColor: col.rule }, timeScale: { borderColor: col.rule, timeVisible: ZEC.tf === '1d' || ZEC.tf === '7d', secondsVisible: false }, localization: { locale: 'en-US' } });
    liveSeries = liveChart.addCandlestickSeries({ upColor: col.up, downColor: col.down, borderVisible: false, wickUpColor: col.up, wickDownColor: col.down });
    liveSeries.priceScale().applyOptions({ scaleMargins: { top: .08, bottom: .22 } });
    liveVol = liveChart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'v' }); liveChart.priceScale('v').applyOptions({ scaleMargins: { top: .82, bottom: 0 } });
    liveSeries.setData(rows.map(r => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4] })));
    liveVol.setData(rows.map(r => ({ time: r[0], value: r[5], color: (r[4] >= r[1] ? col.up : col.down) + '66' })));
    liveChart.timeScale().fitContent();
    $('#zChartSrc').textContent = ZEC.source === 'live' ? 'candles from Coinbase' : 'candles from snapshot';
  };
  $('#zTf').onclick = e => { const b = e.target.closest('button'); if (!b) return; ZEC.tf = b.dataset.tf; store('sc.zecTf', ZEC.tf); $$('#zTf button').forEach(x => x.classList.toggle('on', x === b)); loadChart(); };
  loadChart();
  // transparent vs shielded
  let mode = 't', sel = -1;
  const explain = () => { const ex = $('#zExplain'); if (sel < 0) return; ex.classList.remove('pop'); void ex.offsetWidth; ex.classList.add('pop'); ex.innerHTML = `<b>${ZTX[sel][0]}</b> · ${mode === 't' ? '<span class="down">public</span>' : '<span class="up">hidden</span>'}<br>${ZTX[sel][2]}`; };
  $('#zMode').onclick = e => {
    const b = e.target.closest('button'); if (!b || b.dataset.m === mode) return; mode = b.dataset.m;
    $$('#zMode button').forEach(x => x.classList.toggle('on', x === b));
    $('#zTx').classList.toggle('shielded', mode === 'z');
    $$('#zTx .zv').forEach((el, i) => scramble(el, mode === 'z' ? Array.from({ length: Math.max(10, ZTX[i][1].length) }, () => '•').join('') : ZTX[i][1]));
    const pr = $('#zProof'); pr.hidden = mode !== 'z'; if (mode === 'z') { pr.classList.remove('in'); void pr.offsetWidth; pr.classList.add('in'); }
    explain();
  };
  $('#zTx').onclick = e => { const r = e.target.closest('.zrow'); if (!r) return; sel = +r.dataset.i; $$('#zTx .zrow').forEach(x => x.classList.toggle('on', x === r)); explain(); };
  // pools accordion
  $('.zpools').onclick = e => { const p = e.target.closest('.zpool'); if (!p) return; const open = p.getAttribute('aria-expanded') !== 'true'; $$('.zpool').forEach(x => x.setAttribute('aria-expanded', 'false')); p.setAttribute('aria-expanded', open); };
  // address checker
  const check = () => {
    const out = $('#zAddrOut'), r = zecAddrType($('#zAddr').value);
    if (!r) { out.innerHTML = '<span class="micro">Checks the format only. It can\'t tell whether the address exists or holds funds.</span>'; return; }
    out.innerHTML = `<div class="zres ${r[1]}"><span class="zres-ic" aria-hidden="true">${r[1] === 'shielded' ? '🛡' : r[1] === 'bad' ? '✕' : r[1] === 'legacy' ? '⌛' : '👁'}</span><span><b>${esc(r[0])}</b><br><span class="micro">${esc(r[2])}</span></span></div>`;
  };
  $('#zAddr').oninput = check;
  $('#zEx').onclick = e => { const b = e.target.closest('button'); if (!b) return; $('#zAddr').value = ZEC_EXAMPLES[+b.dataset.ex][1]; check(); };
  // paper trade
  let side = 'buy'; const amt = $('#zAmt');
  const pos = () => (W && W.paper && W.paper.zec) || { qty: 0, cost: 0 };
  const paint = () => {
    const px = ZEC.price, n = parseFloat(amt.value) || 0, ps = pos();
    $('#zBal').textContent = W ? (side === 'buy' ? 'Cash ' + money(W.usd) : 'Holding ' + fmtTiny(ps.qty) + ' ZEC') : '';
    if ($('#zQuick').dataset.side !== side) { $('#zQuick').dataset.side = side; $('#zQuick').innerHTML = side === 'buy' ? [25, 100, 500, 1000].map(x => `<button type="button" data-v="${x}">$${x}</button>`).join('') : [[.25, '25%'], [.5, '50%'], [1, 'Max']].map(([x, l]) => `<button type="button" data-v="${x}">${l}</button>`).join(''); }
    const btn = $('#zGo'); btn.textContent = W ? (side === 'buy' ? 'Paper buy ZEC' : 'Paper sell ZEC') : 'Connect to paper trade'; btn.disabled = W ? !(n > 0 && px) : false;
    const err = $('#zErr'); err.textContent = '';
    if (W && n > 0 && (side === 'buy' ? n > W.usd + 1e-9 : n > ps.qty + 1e-12)) { err.textContent = side === 'buy' ? `You have ${money(W.usd)} of demo cash.` : `You hold ${fmtTiny(ps.qty)} ZEC.`; btn.disabled = true; }
    const val = ps.qty * px, pnl = val - ps.cost;
    $('#zQuote').innerHTML = (n > 0 && px ? (side === 'buy' ? `<div class="kv"><span>You get</span><span><b>${fmtTiny(n * .995 / px)} ZEC</b></span></div>` : `<div class="kv"><span>You get</span><span><b>${money(n * px * .995)}</b></span></div>`) + '<div class="kv"><span>Sim fee</span><span>0.5%</span></div>' : `<div class="kv"><span>${ZEC.source === 'live' ? 'Live price' : 'Price'}</span><span>${px ? money(px) : '—'}</span></div>`)
      + (ps.qty > 0 ? `<div class="kv"><span>Your ZEC</span><span>${fmtTiny(ps.qty)} · ${money(val)}</span></div><div class="kv"><span>P&amp;L</span><span class="${cls(pnl)}">${money(pnl)} (${pct(ps.cost ? pnl / ps.cost : 0)})</span></div>` : '');
  };
  zecTradePaint = paint;
  $('#zSide').onclick = e => { const b = e.target.closest('button'); if (!b) return; side = b.dataset.side; $$('#zSide button').forEach(x => x.classList.toggle('on', x === b)); $('#zUnit').textContent = side === 'buy' ? 'USD' : 'ZEC'; $('#zLbl').textContent = side === 'buy' ? 'You pay' : 'You sell'; amt.value = ''; paint(); };
  $('#zQuick').onclick = e => { const b = e.target.closest('button'); if (!b) return; if (!W) return openConnect(); if (side === 'buy') amt.value = b.dataset.v; else { const q = pos().qty; if (!q) { $('#zErr').textContent = 'You hold no ZEC yet. Switch to Buy.'; return; } amt.value = +b.dataset.v === 1 ? String(q) : String(q * +b.dataset.v); } paint(); };
  amt.oninput = paint; amt.onkeydown = e => { if (e.key === 'Enter') $('#zGo').click(); };
  $('#zGo').onclick = () => {
    if (!W) return openConnect(() => { location.hash = '#/zcash'; });
    const n = parseFloat(amt.value) || 0, px = ZEC.price; if (!(n > 0) || !px) return;
    W.paper = W.paper || {}; const ps = W.paper.zec || { qty: 0, cost: 0, sym: 'ZEC', name: 'Zcash' };
    if (side === 'buy') { if (n > W.usd + 1e-9) return; const q = n * .995 / px; ps.qty += q; ps.cost += n; W.usd -= n; toast(`Paper bought ${fmtTiny(q)} ZEC`); }
    else { if (n > ps.qty + 1e-12) return; const out = n * px * .995; ps.cost *= 1 - n / ps.qty; ps.qty -= n; W.usd += out; toast(`Paper sold ${fmtTiny(n)} ZEC for ${money(out)}`); }
    if (ps.qty < 1e-12) delete W.paper.zec; else W.paper.zec = ps;
    save(); amt.value = ''; paint();
  };
  paint(); zecPagePaint();
}
let zecTradePaint = null;
function zecPagePaint() {
  const st = $('#zStats'); if (!st) return;
  const h = zecHeightNow(), issued = zecIssued(h), next = zecNextHalving(h), left = Math.max(0, next - h), days = left * 75 / 86400;
  $('#zSrc').textContent = ZEC.source === 'live' ? 'live' : ZEC.source;
  st.innerHTML = [
    ['24h range', ZEC.price ? `${money(ZEC.low)} – ${money(ZEC.high)}` : '—'],
    ['24h volume', ZEC.vol ? compact(ZEC.vol) + ' ZEC' : '—'],
    ['Market cap (est.)', ZEC.price && issued ? usdC(issued * ZEC.price) : '—'],
    ['Block height', h ? `<span data-zheight>${h.toLocaleString()}</span>` : '—'],
  ].map(([k, v2]) => `<div class="stat"><div class="eyebrow">${k}</div><div class="v" style="font-size:18px">${v2}</div></div>`).join('');
  const sup = $('#zSupply');
  if (sup) {
    const ms = [[0, 'Launch', '2016', 12.5], [H1, '1st halving', '2020', 3.125], [H2, '2nd halving', '2024', 1.5625], [H2 + HALVING, '3rd halving', '≈2028', .78125]];
    const maxH = H2 + HALVING, pos2 = h ? Math.min(1, h / maxH) : 0;
    sup.innerHTML = h ? `<div class="kv"><span>Issued so far (est.)</span><span>${Math.round(issued).toLocaleString()} ZEC</span></div>
      <div class="prog zsup"><i style="width:${(issued / 21e6 * 100).toFixed(2)}%"></i></div><div class="kv"><span>Hard cap</span><span>21,000,000 ZEC · ${(issued / 21e6 * 100).toFixed(1)}% issued</span></div>
      <div class="kv"><span>Block reward now</span><span>${zecReward(h)} ZEC every 75 s</span></div>
      <div class="ztl"><i class="ztl-now" style="left:${(pos2 * 100).toFixed(2)}%" title="Now"></i>${ms.map(([bh, l, y, r]) => `<span class="ztl-m ${h >= bh ? 'past' : ''}" style="left:${(bh / maxH * 100).toFixed(2)}%"><b>${y}</b><span>${l}<br>${r} ZEC</span></span>`).join('')}</div>
      <div class="kv"><span>Next halving</span><span>block ${next.toLocaleString()} · ${left.toLocaleString()} blocks · ≈${Math.round(days)} days</span></div>
      <p class="hint">Issued supply is computed from the block height and the emission schedule. Market cap uses that estimate.</p>` : '<span class="micro">Waiting for the block height…</span>';
  }
  if (zecTradePaint) zecTradePaint();
}

// ---------- routing ----------
function routeParts() { return (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean).map(decodeURIComponent); }
let chart = null, chartSeries = null, volSeries = null, chartCoin = null, chartTf = store('sc.tf') || 300;
function render() {
  destroyChart();
  destroyLiveChart(); liveTradePaint = null; zecTradePaint = null;
  coinPaint = null; lowTab = 'trades';
  const [p, a] = routeParts();
  renderNav();
  const view = $('#view');
  const pages = { '': home, pairs, unclaimed, beat, watch, legs, launch, account, treasury, docs, security, coin, live: liveTokenPage, zcash: zcashPage };
  const fn = pages[p || ''];
  view.innerHTML = '';
  if (!fn) { view.innerHTML = `<div class="empty"><h2>Nothing here</h2><p>That page does not exist.</p><a class="btn primary" href="#/">Back to the board</a></div>`; return; }
  fn(view, a);
  drawSparks();
  document.title = 'Kruv' + (p ? ' · ' + (p === 'coin' && S.coins[a] ? S.coins[a].sym : p === 'live' && LIVE.pairs.get(a) ? LIVE.pairs.get(a).baseToken.symbol : (NAV.find(n => n[0] === p) || [0, TITLES[p] || p])[1]) : '');
}
window.addEventListener('hashchange', () => { closeModal(); closePeek(true); transition(() => { window.scrollTo(0, 0); render(); }); });

// ---------- pages ----------
function home(v) {
  const coins = Object.values(S.coins);
  const vol = coins.reduce((s, c) => s + vol24(c), 0);
  const grads = coins.filter(c => c.graduated).length;
  const held = coins.reduce((s, c) => s + Math.max(0, c.vq - c.vq0) * S.stocks[c.co].px, 0);
  const word = 'kruv';
  v.innerHTML = `<section class="dusk" aria-label="Kruv">
    <div class="dusk-top">
      <span class="eyebrow"><span class="live-dot"></span>Demo network · live</span>
      <p class="lede">Launch a coin priced in shares of the company behind the app. Instagram trades against <em>META</em>, YouTube against <em>GOOGL</em>, Netflix against <em>NFLX</em>. Every buy puts the stock itself into the curve.</p>
      <div class="dusk-pair" aria-hidden="true"><span class="pd" id="pd"><b>Instagram</b>→<i>META</i></span><span>the curve holds the stock</span></div>
      <div class="cta"><a class="btn white big" href="#/launch">Launch a coin</a><a class="btn glass big" href="#/docs/pairing">How pairing works</a></div>
    </div>
    <div class="dusk-word" aria-hidden="true"><span class="dusk-mark"></span><span>${word.split('').map((ch, i) => `<span style="animation-delay:${0.25 + i * 0.07}s">${ch}</span>`).join('')}</span></div>
    <a class="dusk-card" id="duskCard" href="#/"></a>
  </section>
  <div class="stats">
    <div class="stat"><div class="eyebrow">24h volume</div><div class="v" data-count="${vol}" data-fmt="money">${money(vol, { compact: 1 })}</div></div>
    <div class="stat"><div class="eyebrow">Coins live</div><div class="v" data-count="${coins.length}">${coins.length}</div></div>
    <div class="stat"><div class="eyebrow">Stock held by curves</div><div class="v" data-count="${held}" data-fmt="money">${money(held, { compact: 1 })}</div></div>
    <div class="stat"><div class="eyebrow">Graduated</div><div class="v" data-count="${grads}">${grads}</div></div>
  </div>
  ${zecBanner()}
  <div class="feed" id="feed" aria-label="Latest trades"></div>
  <div class="bar"><div class="seg" role="tablist" id="boardTabs">${[['live', 'Live · Solana'], ['hot', 'Hot'], ['new', 'New'], ['near', 'Near graduation'], ['grad', 'Graduated'], ['beat', 'Beating stock']].map(([k2, l]) => `<button role="tab" data-t="${k2}" class="${ui.boardTab === k2 ? 'on' : ''}">${l}</button>`).join('')}</div>
  <input class="search" id="boardQ" placeholder="Filter by name, ticker or address" value="${esc(ui.boardQ)}" aria-label="Filter coins"></div>
  <div class="grid" id="board"></div>
  ${howItWorks()}`;
  countUp(v);
  bindHow();
  paintZecBanner();
  cyclePair();
  paintDuskCard();
  const recent = coins.flatMap(c => c.trades.slice(-3).map(t => ({ c, t }))).sort((a, b) => b.t.t - a.t.t).slice(0, 14);
  $('#feed').innerHTML = recent.map(x => feedItem(x.c, x.t)).join('');
  const paint = () => {
    if (ui.boardTab === 'live') return liveBoard($('#board'));
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
  $('#boardTabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; ui.boardTab = b.dataset.t; store('sc.tab2', ui.boardTab); $$('#boardTabs button').forEach(x => x.classList.toggle('on', x === b)); paint(); };
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
  ${rows.map(({ c, coins, held }) => { const ch = stockChg(c.sym); return `<tr class="link xrow" data-expand="${c.sym}" aria-expanded="false" tabindex="0"><td><div class="cell-co">${coLogo(c.sym)}<div><b>${c.sym}</b><div class="micro">${esc(c.name)}</div></div></div></td><td class="r mono">${money(S.stocks[c.sym].px)}</td><td class="r mono ${cls(ch)}">${pct(ch)}</td><td class="micro">${c.apps.map(esc).join(', ')}</td><td class="r mono">${coins.length}</td><td class="r mono">${held.toFixed(2)}</td></tr>${pairExpand(c, coins)}`; }).join('')}
  </tbody></table></div>`;
}
function pairExpand(c, coins) {
  const claimed = new Map(coins.map(x => [x.app, x]));
  return `<tr class="xdetail" data-for="${c.sym}"><td colspan="6"><div class="xwrap"><div class="xin">
    <div class="xcol"><span class="eyebrow">Apps</span><div class="xapps">${c.apps.map(a2 => claimed.has(a2) ? `<button type="button" class="chip on" data-peek="coin:${claimed.get(a2).id}">${esc(a2)} · ${esc(claimed.get(a2).sym)}</button>` : `<a class="chip" href="#/launch/${encodeURIComponent(a2)}">${esc(a2)} · launch</a>`).join('')}</div></div>
    <div class="xcol"><span class="eyebrow">Coins</span>${coins.length ? coins.slice(0, 4).map(x => `<button type="button" class="xcoin" data-peek="coin:${x.id}">${logo(x, 'sm')}<b>${esc(x.sym)}</b><span class="mono">${money(priceUsd(x), { co: x.co })}</span><span class="mono ${cls(change24(x))}">${pct(change24(x))}</span></button>`).join('') : '<span class="micro">No coins yet. Be the first.</span>'}</div>
    <div class="xcol xgo"><a class="btn primary" href="#/pairs/${c.sym}">Open ${c.sym} →</a></div>
  </div></div></td></tr>`;
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
  <div class="grid">${open.map(a => { const n = Object.values(S.coins).filter(x => x.co === a.co).length; return `<article class="flip" tabindex="0" role="button" aria-pressed="false" aria-label="${esc(a.app)}, tap to see launch details"><div class="flip-in">
    <div class="face front card"><div class="row">${coLogo(a.co, '')}<div class="nm"><h3>${esc(a.app)}</h3><div class="micro mono">pairs with ${a.co}</div></div><span class="flip-hint" aria-hidden="true">↻</span></div><div class="flip-art">${logo({ sym: a.app.replace(/[^A-Za-z]/g, '').slice(0, 5).toUpperCase(), co: a.co, custom: true, id: a.app }, 'xl')}</div><div class="foot"><span>${money(S.stocks[a.co].px)} / share</span><span>tap to flip</span></div></div>
    <div class="face back card"><span class="eyebrow">${esc(a.app)} → ${a.co}</span><p>The first coin for ${esc(a.app)} trades against ${esc(CO[a.co].name)} shares. ${n ? `${n} other ${a.co} coin${n > 1 ? 's are' : ' is'} live.` : `No ${a.co} coin is live yet.`}</p><div class="bar" style="margin:0"><a class="btn primary" href="#/launch/${encodeURIComponent(a.app)}">Launch ${esc(a.app)}</a><button class="btn ghost" type="button" data-unflip>Back</button></div></div>
  </div></article>`; }).join('')}</div>`;
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
  const liveN = ui.watch.filter(id => id.startsWith('live:')).length;
  v.innerHTML = `<div class="page-head"><span class="eyebrow">Watchlist</span><h1>Coins you are watching</h1><p>Star any coin, live or demo, to keep it here. The list lives in this browser only.</p></div>
  ${ui.watch.includes('zec') ? `<div class="shead"><h2>Zcash</h2>${starBtn('zec')}</div>${zecBanner()}` : ''}
  ${liveN ? `<div class="shead"><h2>Live Solana tokens</h2><span class="micro">${liveN} starred</span></div><div class="grid" id="liveWatch">${liveWatchHtml() || '<div class="card skel"></div>'}</div>` : ''}
  ${list.length ? `<div class="shead"><h2>Demo coins</h2></div><div class="grid">${list.map(card).join('')}</div>` : ''}
  ${!list.length && !liveN && !ui.watch.includes('zec') ? `<div class="empty"><p>Nothing starred yet. Tap the star on any coin card.</p><a class="btn primary" href="#/">Browse the board</a></div>` : ''}`;
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
    <div class="field"><label>Image</label><div class="drop" id="lfDrop" tabindex="0" role="button" aria-label="Upload image"><span id="lfImgPrev">${logo({ sym: 'IMG', co: appCo(app) || 'META', custom: true })}</span><span><b>Drop an image or click</b><br><span class="hint">PNG, JPG, GIF or WebP. Cropped square to 160px.</span></span></div><input type="file" id="lfFile" accept="image/*" hidden></div>
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
    const fake = { id: 'preview', custom: true, name: d.name || 'Your coin', sym: d.sym || 'TICKER', app: d.app, co, img: d.img, trades: [], pxLaunchUsd: SEED_USD / VT0, vq: SEED_USD / S.stocks[co].px, vt: VT0, vq0: SEED_USD / S.stocks[co].px, sold: 0, graduated: false, tax: d.tax / 1e4 };
    const usd = parseFloat(d.buy) || 0;
    const q = usd > 0 ? quoteBuy(fake, usd / S.stocks[co].px) : null;
    $('#lfBuyGet').textContent = q ? '≈ ' + tok(q.out) + ' ' + (d.sym || 'coins') : '';
    $('#lfImgPrev').innerHTML = logo({ sym: d.sym || 'IMG', co, img: d.img, custom: true });
    $('#lfPrev').innerHTML = `<div class="eyebrow" style="margin-bottom:10px">Preview</div>` + card(fake).replace('data-peek="coin:preview"', '').replace(/<button class="starbtn[\s\S]*?<\/button>/, '');
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
    c.custom = true;
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
  const paperVal = Object.entries(W.paper || {}).reduce((s2, [k, ps]) => { if (k === 'zec') return s2 + ps.qty * ZEC.price; const lpair = LIVE.pairs.get(k.slice(5)); return s2 + (lpair ? ps.qty * lp(lpair) : 0); }, 0);
  const mine = (W.launched || []).map(id => S.coins[id]).filter(Boolean);
  v.innerHTML = `<div class="page-head"><span class="eyebrow">Account · ${esc(walletLabel(W))}${W.signed ? ' · signed in' : ''}</span><h1 class="mono" style="font-size:clamp(22px,4vw,34px);word-break:break-all">${esc(W.addr)}</h1></div>
  <div class="stats" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:26px">
    <div class="stat"><div class="eyebrow">Cash</div><div class="v">${money(W.usd)}</div></div>
    <div class="stat"><div class="eyebrow">Positions (if sold now)</div><div class="v">${money(total)}</div></div>
    <div class="stat"><div class="eyebrow">Net vs start</div><div class="v ${cls(W.usd + total + paperVal - START_USD)}">${money(W.usd + total + paperVal - START_USD)}</div></div>
    ${W.kind === 'evm' ? `<div class="stat"><div class="eyebrow">On-chain · ${esc(chainName(W.chainId))}</div><div class="v">${fmtNative()}</div></div>` : ''}
  </div>
  <div class="bar" style="margin:-10px 0 24px">${W.kind !== 'demo' ? `<button class="btn primary" id="accSign" type="button">${W.signed ? 'Signed in · sign again' : 'Sign in with wallet'}</button>` : ''}<button class="btn ghost" id="accCopy" type="button">Copy address</button><button class="btn ghost" id="accDisc" type="button">Disconnect</button></div>
  <div class="shead"><h2>Positions</h2></div>
  ${pos.length ? `<div class="tbl-wrap"><table><thead><tr><th>Coin</th><th class="r">Balance</th><th class="r">Price</th><th class="r">Sell value</th></tr></thead><tbody>${pos.map(p => `<tr class="link" data-go="#/coin/${p.c.id}"><td><div class="cell-co">${logo(p.c, 'sm')}<b>${esc(p.c.sym)}</b><span class="micro">/ ${p.c.co}</span></div></td><td class="r mono">${tok(p.b)}</td><td class="r mono">${money(priceUsd(p.c), { co: p.c.co })}</td><td class="r mono">${money(p.val)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">No positions yet. <a class="btn ghost" href="#/">Find a coin</a></div>`}
  ${paperHtml()}
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
function paperHtml() {
  const rows = Object.entries((W && W.paper) || {}).map(([k, ps]) => ({ k, ps, p: k === 'zec' ? { zec: true } : LIVE.pairs.get(k.slice(5)) }));
  if (!rows.length) return '';
  return `<div class="shead"><h2>Paper trades</h2><span class="micro">${LIVE.source === 'live' ? 'valued at live prices' : 'valued at snapshot prices'}</span></div><div class="tbl-wrap"><table><thead><tr><th>Token</th><th class="r">Amount</th><th class="r">Cost</th><th class="r">Value</th><th class="r">P&amp;L</th></tr></thead><tbody>${rows.map(({ k, ps, p }) => { const val = p ? ps.qty * (p.zec ? ZEC.price : lp(p)) : 0, pnl = val - ps.cost; return `<tr class="link" data-go="${k === 'zec' ? '#/zcash' : '#/live/' + esc(k.slice(5))}"><td><div class="cell-co">${p ? (p.zec ? zecLogo(28) : liveImg(p, 'sm')) : ''}<b>${esc(ps.sym)}</b><span class="micro">${esc(ps.name)}</span></div></td><td class="r mono">${k === 'zec' ? fmtTiny(ps.qty) : tok(ps.qty)}</td><td class="r mono">${money(ps.cost)}</td><td class="r mono">${p ? money(val) : '—'}</td><td class="r mono ${cls(pnl)}">${p ? money(pnl) + ' · ' + pct(ps.cost ? pnl / ps.cost : 0) : '—'}</td></tr>`; }).join('')}</tbody></table></div>`;
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
  v.innerHTML = `<div class="coin-top"><span class="vt-logo">${logo(c, 'lg')}</span><div class="t"><div class="tags"><span class="pairtag">${esc(c.sym)} / ${c.co}</span><span class="pill">${esc(c.app)}</span>${c.graduated ? '<span class="pill grad">Graduated · pool locked</span>' : ''}${c.tax ? `<span class="pill">creator tax ${(c.tax * 100).toFixed(2)}%</span>` : ''}</div><h1 style="font-size:clamp(28px,4vw,40px)">${esc(c.name)}</h1></div>
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
  chart = LightweightCharts.createChart(box, { autoSize: true, layout: { background: { type: 'solid', color: 'transparent' }, textColor: col.ink, fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }, grid: { vertLines: { color: col.rule }, horzLines: { color: col.rule } }, rightPriceScale: { borderColor: col.rule }, timeScale: { borderColor: col.rule, timeVisible: true, secondsVisible: false }, localization: { locale: 'en-US' }, crosshair: { mode: 0 } });
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
  refreshPeek();
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
  liveRefresh(true);
  setInterval(() => liveRefresh(), 15000);
  zecRefresh(true);
  setInterval(() => zecRefresh(), 20000);
  window.addEventListener('resize', () => { clearTimeout(boot.rt); boot.rt = setTimeout(() => { drawSparks(); if ($('#curveCv')) drawCurve($('#curveCv')); }, 120); });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-expand], .flip')) { e.preventDefault(); e.target.click(); return; } });
  document.addEventListener('keydown', e => { const cd = e.target.closest && e.target.closest('.card[data-peek]'); if (cd && (e.key === 'Enter' || e.key === ' ') && e.target === cd) { e.preventDefault(); openPeek(cd.dataset.peek, cd); } });
}
boot();
})();
