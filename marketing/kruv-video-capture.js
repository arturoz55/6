const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const dir = __dirname, mode = process.argv[2] || 'stills';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1080 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.join(dir, 'kruv.html')); await p.evaluate(() => window.ready);
  console.log('fonts:', await p.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight).join(', ')));
  if (mode === 'stills') {
    for (const t of [1.2, 2.8, 6.5, 8.3, 11.5, 16.5, 20, 23.5]) { await p.evaluate(t => render(t), t); await p.screenshot({ path: path.join(dir, `still-${t}.png`) }); }
  } else {
    fs.mkdirSync(path.join(dir, 'frames'), { recursive: true });
    const fps = 30, dur = 24;
    for (let i = 0; i < fps * dur; i++) { await p.evaluate(t => render(t), i / fps); await p.screenshot({ path: path.join(dir, 'frames', `f${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 }); }
  }
  console.log('errors', errs); await b.close();
})();
