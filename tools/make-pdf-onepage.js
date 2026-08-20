/**
 * ポートフォリオを「A4 1ページ」の PDF に書き出す（応募時の添付用）
 *
 * 8/16版の元PDF（黒田大介_ポートフォリオ.pdf）はこの形式だった：
 *   用紙 595x842pt（A4）× 1枚に、ページ全体を縮小して収めている。
 * 通常の make-pdf.js は A4 に分割してしまう（5ページになる）ので、
 * こちらは縮尺を計算して 1 ページに丸ごと入れる。
 *
 * 縮尺の考え方：
 *   printToPDF の scale=s のとき、レイアウト幅は (A4幅794px ÷ s) になる。
 *   このサイトは中身の最大幅が決まっているため、幅を広げても高さはほぼ変わらない。
 *   よって s = A4高(px) ÷ コンテンツ高(px) で一発で求まり、
 *   念のため出力後にページ数を数えて、1ページでなければ縮尺を下げて再試行する。
 *
 * 実行： node tools/make-pdf-onepage.js [出力先] [URL]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = process.argv[2] || path.join(os.homedir(), 'Desktop', '黒田大介_ポートフォリオ_1枚.pdf');
const URL = process.argv[3] || 'file:///C:/Users/kurod/projects/_portfolio/portfolio.html';
const PORT = 9334;

const A4_W_IN = 8.27, A4_H_IN = 11.69;          // A4（インチ）
const A4_W_PX = A4_W_IN * 96, A4_H_PX = A4_H_IN * 96; // Chrome は 96px/インチ

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('  ★Chrome も Edge も見つかりません'); process.exit(1); }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf1-'));
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

const countPages = buf =>
  (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });

  try {
    let target;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      try {
        const r = await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(URL), { method: 'PUT' });
        if (r.ok) { target = await r.json(); break; }
      } catch (e) { /* 起動待ち */ }
    }
    if (!target) throw new Error('Chrome に接続できませんでした');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });

    let id = 0;
    await send(ws, ++id, 'Page.enable');
    await send(ws, ++id, 'Page.navigate', { url: URL });
    await sleep(8000);

    /* 遅れて出る要素を出し切ってから、高さを測る */
    await send(ws, ++id, 'Runtime.evaluate', { expression: 'window.scrollTo(0, document.body.scrollHeight); void 0' });
    await sleep(2000);
    await send(ws, ++id, 'Runtime.evaluate', { expression: 'window.scrollTo(0, 0); void 0' });
    await sleep(800);

    const { result } = await send(ws, ++id, 'Runtime.evaluate', {
      expression: 'Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)',
      returnByValue: true,
    });
    const contentH = result.value;
    console.log('  コンテンツの高さ： ' + contentH + ' px');

    /* 1ページに収まる縮尺。収まらなければ 6% ずつ下げて再試行（下限 0.1） */
    let scale = Math.min(1, Math.max(0.1, (A4_H_PX * 0.995) / contentH));
    let pdfBuf = null;

    for (let attempt = 1; attempt <= 6; attempt++) {
      const r = await send(ws, ++id, 'Page.printToPDF', {
        printBackground: true,
        paperWidth: A4_W_IN, paperHeight: A4_H_IN,
        marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
        scale, displayHeaderFooter: false, preferCSSPageSize: false,
      });
      const buf = Buffer.from(r.data, 'base64');
      const pages = countPages(buf);
      console.log('  試行' + attempt + '： 縮尺 ' + scale.toFixed(3) + ' → ' + pages + ' ページ');
      if (pages === 1) { pdfBuf = buf; break; }
      scale = Math.max(0.1, scale * 0.94);
    }
    ws.close();

    if (!pdfBuf) throw new Error('1ページに収まりませんでした（内容が多すぎます）');
    fs.writeFileSync(OUT, pdfBuf);
    console.log('  書き出しました： ' + OUT);
    console.log('  サイズ： ' + Math.round(fs.statSync(OUT).size / 1024) + ' KB ／ A4 1ページ');
  } finally {
    chrome.kill();
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
})().catch(e => { console.error('  ★' + e.message); process.exit(1); });
