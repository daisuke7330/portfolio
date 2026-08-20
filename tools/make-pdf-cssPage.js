/**
 * @page 指定を持つHTMLを、そのままの縮尺でPDFにする
 * （ポートフォリオ1枚.html 用。A4・余白9mm/10mmはHTML側の@pageが決める）
 *
 * 実行： node tools/make-pdf-cssPage.js <出力先> <URL>
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = process.argv[2];
const URL = process.argv[3];
const PORT = 9337;

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfc-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function send(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const onMsg = ev => {
      const m = JSON.parse(ev.data);
      if (m.id !== id) return;
      ws.removeEventListener('message', onMsg);
      m.error ? reject(new Error(method + ': ' + m.error.message)) : resolve(m.result);
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

(async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  try {
    let target;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      try {
        const r = await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(URL), { method: 'PUT' });
        if (r.ok) { target = await r.json(); break; }
      } catch (e) {}
    }
    if (!target) throw new Error('Chrome に接続できません');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
    let id = 0;
    await send(ws, ++id, 'Page.enable');
    await send(ws, ++id, 'Page.navigate', { url: URL });
    await sleep(6000);
    const pdf = await send(ws, ++id, 'Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,   // HTML側の @page（A4・余白）に従う
      scale: 1,
      displayHeaderFooter: false,
    });
    const buf = Buffer.from(pdf.data, 'base64');
    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    fs.writeFileSync(OUT, buf);
    console.log('  書き出しました： ' + OUT);
    console.log('  ' + pages + ' ページ ／ ' + Math.round(buf.length / 1024) + ' KB');
    ws.close();
    process.exitCode = pages === 1 ? 0 : 2;   // 1ページでなければ 2 を返す
  } finally {
    chrome.kill(); await sleep(400);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
})().catch(e => { console.error('  ★' + e.message); process.exit(1); });
