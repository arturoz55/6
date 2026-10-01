const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
 const errs = []; p.on('pageerror', e => errs.push(e.message));
 await p.goto('file://' + path.join(__dirname, 'cards.html')); await p.evaluate(() => window.ready);
 const n = await p.evaluate(() => window.count);
 for (let i = 0; i < n; i++) { await p.evaluate(i => draw(i), i); await p.screenshot({ path: path.join(__dirname, `card-${i + 1}.png`) }); }
 console.log(n, 'cards; errors', errs); await b.close(); })();
