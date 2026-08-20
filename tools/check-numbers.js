/**
 * ポートフォリオの数字が実測値と合っているか確かめる
 *
 * なぜ要るか：
 *   実績カードの数字は <span class="fig-big">62<span> ページ</span></span> のように
 *   タグで分断されている。タグを取り除いてから探すと「62」と「ページ」が別の行になり、
 *   単純な検索では見落とす。2026-08-20 に実際に見落とした。
 *
 * 実行： node tools/check-numbers.js
 */
const fs = require('fs');
const path = require('path');

/* 実測値（2026-08-19 コードで数えた値） */
const TRUTH = {
  '美容皮膚科 LA REINE': { pages: 60, hours: 25 },
  '洋菓子店 結-YUI-':    { pages: 25, hours: 20 },
  '不動産 Nexus':        { pages: 22, hours: 15 },
};
const TOTAL_PAGES = 107;
const TOTAL_HOURS = 60;
const WP_HOURS = 9;
const WP_PAGES = 22;

const FILES = [
  'C:/Users/kurod/projects/portfolio-site/index.html',
  'C:/Users/kurod/projects/_portfolio/portfolio.html',
];

/* 1枚もの（PDFの元。書式が違うので専用の検査を後段で行う） */
const ONESHEET = 'C:/Users/kurod/projects/_proposals/ポートフォリオ1枚.html';

let ng = 0;

for (const f of FILES) {
  if (!fs.existsSync(f)) { console.log('  ★ ファイルが無い: ' + f); ng++; continue; }
  const h = fs.readFileSync(f, 'utf8');
  console.log('■ ' + path.basename(path.dirname(f)) + '/' + path.basename(f));

  /* 大きな数字と、その下の実稼働時間を対にして取り出す */
  const pairs = [...h.matchAll(
    /<span class="fig-big">(\d+)<span[^>]*>\s*(ページ|時間)<\/span><\/span>\s*<span class="fig-sub">([^<]*)<b>([^<]*)<\/b>/g
  )].map(m => ({ n: Number(m[1]), unit: m[2], subLabel: m[3].trim(), sub: m[4] }));

  if (!pairs.length) { console.log('   ★ 実績カードの数字が見つかりません'); ng++; continue; }

  const expected = [
    { n: TRUTH['美容皮膚科 LA REINE'].pages, unit: 'ページ', sub: '約25時間' },
    { n: TRUTH['洋菓子店 結-YUI-'].pages,    unit: 'ページ', sub: '約20時間' },
    { n: TRUTH['不動産 Nexus'].pages,        unit: 'ページ', sub: '約15時間' },
    { n: WP_HOURS,                            unit: '時間',   sub: null },
  ];

  expected.forEach((e, i) => {
    const got = pairs[i];
    if (!got) { console.log('   ★ ' + (i + 1) + '件目が見つかりません'); ng++; return; }
    const okN = got.n === e.n && got.unit === e.unit;
    const okS = e.sub === null ? true : got.sub === e.sub;
    console.log('   ' + (okN && okS ? '○' : '★') + ' ' + (i + 1) + '件目： '
      + got.n + got.unit + ' / ' + got.subLabel + got.sub
      + (okN && okS ? '' : '  ← 正しくは ' + e.n + e.unit + (e.sub ? ' / ' + e.sub : '')));
    if (!okN || !okS) ng++;
  });

  /* 合計の記述 */
  const t = h.replace(/<[^>]+>/g, '');
  for (const [label, want] of [['合計ページ', TOTAL_PAGES], ['合計時間', TOTAL_HOURS]]) {
    const wrong = label === '合計ページ'
      ? /全1(10|09|08)\s*ページ|全1(10|09|08)P/.exec(t)
      : null;
    if (wrong) { console.log('   ★ ' + label + 'が古い表記です： ' + wrong[0] + '  ← 正しくは ' + want); ng++; }
  }

  /* WordPress の移行ページ数 */
  if (h.includes('WordPress') && !h.includes('全' + WP_PAGES + 'ページ') && !h.includes(WP_PAGES + 'ページ')) {
    console.log('   ★ WordPress移行の「' + WP_PAGES + 'ページ」が見当たりません'); ng++;
  }
  console.log('');
}

/* ---- 1枚もの（ポートフォリオ1枚.html）の検査 ---- */
if (fs.existsSync(ONESHEET)) {
  const h = fs.readFileSync(ONESHEET, 'utf8');
  console.log('■ _proposals/ポートフォリオ1枚.html（PDFの元）');
  const want = [
    ['<b>107</b>', '合計107ページ'],
    ['全60ページ ／ 実稼働 約25時間', 'LA REINE 60P'],
    ['全25ページ ／ 実稼働 約20時間', '結-YUI- 25P'],
    ['全22ページ ／ 実稼働 約15時間', 'Nexus 22P'],
    ['全22ページを移行 ／ 実稼働 約9時間', 'WordPress移行 22P/9h'],
    ['nexus-am.rf.gd', 'WordPress版の公開URL'],
  ];
  for (const [needle, label] of want) {
    const ok = h.includes(needle);
    if (!ok) ng++;
    console.log('   ' + (ok ? '○' : '★') + ' ' + label + (ok ? '' : '  ← 見つかりません: ' + needle));
  }
  for (const bad of ['全62ページ', '全24ページ', '<b>110</b>', '33<small']) {
    if (h.includes(bad)) { ng++; console.log('   ★ 古い表記が残っています: ' + bad); }
  }
  console.log('');
}

console.log(ng === 0 ? '数字はすべて実測値と一致しています' : '★ ' + ng + ' 件、実測値と食い違っています');
process.exit(ng === 0 ? 0 : 1);
