/**
 * ポートフォリオサイトを PDF に書き出す（応募時の添付用）
 *
 * なぜ専用のスクリプトが要るか：
 *   Chrome の `--print-to-pdf` は、CSS で print-color-adjust: exact を指定しても
 *   背景画像・背景色を出力しない（実測：3.4MB のはずが 190KB になる）。
 *   このサイトは実績の写真を背景画像で敷いているため、それでは文字だけのPDFになる。
 *   そこで開発者用の接続（CDP）から Page.printToPDF に printBackground: true を渡す。
 *
 * 実行： node tools/make-pdf.js [出力先のパス] [URL]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = process.argv[2] || path.join(os.homedir(), 'Desktop', '黒田大介_ポートフォリオ.pdf');
const URL = process.argv[3] || 'https://kuroda-daisuke-portfolio.vercel.app/';
const PORT = 9333;

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));

if (!CHROME) { console.error('  ★Chrome も Edge も見つかりません'); process.exit(1); }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-'));

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 開発者用の接続に1つ命令を送り、返事を待つ */
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
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    '--hide-scrollbars',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    /* 起動を待つ */
    let target;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      try {
        const r = await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(URL), { method: 'PUT' });
        if (r.ok) { target = await r.json(); break; }
      } catch (e) { /* まだ起動していない */ }
    }
    if (!target) throw new Error('Chrome に接続できませんでした');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });

    let id = 0;
    await send(ws, ++id, 'Page.enable');
    await send(ws, ++id, 'Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 1600, deviceScaleFactor: 2, mobile: false });
    await send(ws, ++id, 'Page.navigate', { url: URL });

    /* 読み込みと、遅れて出る要素の描画を待つ */
    await sleep(9000);

    /* 画面外の要素も出るように、いちばん下までスクロールしてから戻す */
    await send(ws, ++id, 'Runtime.evaluate', {
      expression: 'window.scrollTo(0, document.body.scrollHeight); void 0',
    });
    await sleep(2500);
    await send(ws, ++id, 'Runtime.evaluate', { expression: 'window.scrollTo(0, 0); void 0' });
    await sleep(1200);

    const pdf = await send(ws, ++id, 'Page.printToPDF', {
      printBackground: true,        // ← これが本題。背景画像と背景色を出す
      preferCSSPageSize: false,
      paperWidth: 8.27,             // A4（インチ）
      paperHeight: 11.69,
      marginTop: 0.2, marginBottom: 0.2, marginLeft: 0.2, marginRight: 0.2,
      scale: 0.7,                   // 1280px幅をA4に収める
      displayHeaderFooter: false,
    });

    fs.writeFileSync(OUT, Buffer.from(pdf.data, 'base64'));
    ws.close();

    const kb = Math.round(fs.statSync(OUT).size / 1024);
    console.log('  書き出しました： ' + OUT);
    console.log('  サイズ： ' + kb + ' KB');
    if (kb < 500) console.log('  ⚠ 背景が入っていない可能性があります（500KB未満）');
  } finally {
    chrome.kill();
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
})().catch(e => { console.error('  ★' + e.message); process.exit(1); });
