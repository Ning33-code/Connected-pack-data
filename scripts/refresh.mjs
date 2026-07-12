// 云端刷新脚本（GitHub Actions 里跑）：从腾讯文档拉数据 → 生成 internal/data.js + internal/index.html
// 令牌从环境变量 TENCENT_DOCS_TOKEN 读（GitHub Actions Secret，小号只读令牌）。逻辑与本地 _update-data.ps1 一致。
import fs from 'node:fs';

const TOKEN = process.env.TENCENT_DOCS_TOKEN;
if (!TOKEN) { console.error('缺少 TENCENT_DOCS_TOKEN 环境变量'); process.exit(1); }

const MCP = 'https://docs.qq.com/openapi/mcp';
const FILE = 'DTmFVdHJzRUtrdVBW';   // 腾讯文档在线表格 file_id
const DATA_SHEET = 'udqc99';        // 数据
const MAU_SHEET  = 'biq6tt';        // MAU
const LIST_SHEET = 'f9mtbf';        // Sheet1 活动清单

async function mcp(name, args) {
  const r = await fetch(MCP, {
    method: 'POST',
    headers: { 'Authorization': TOKEN, 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  });
  const j = await r.json();
  if (j.error) throw new Error('MCP error: ' + JSON.stringify(j.error));
  if (!j.result || !j.result.structuredContent) throw new Error('MCP 无数据: ' + name);
  return j.result.structuredContent;
}
const getCells = (sheet, sr, er, sc, ec) =>
  mcp('sheet.get_cell_data', { file_id: FILE, sheet_id: sheet, start_row: sr, end_row: er, start_col: sc, end_col: ec, return_csv: true });

function parseCSVLine(line) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else { if (c === ',') { out.push(cur); cur = ''; } else if (c === '"') inQ = true; else cur += c; }
  }
  out.push(cur); return out;
}
const rows = (csv) => (csv || '').split(/\r?\n/).filter(l => l.trim() !== '').map(parseCSVLine);
function toNum(v) { if (v == null) return null; const s = String(v).trim().replace(/,/g, ''); if (s === '') return null; const n = Number(s); return Number.isFinite(n) ? Math.round(n) : null; }
function parseDate(v) { const s = String(v == null ? '' : v).trim(); const m = s.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})/); return m ? `${m[1]}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}` : null; }
const MON = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
function parseMonth(v) { const s = String(v == null ? '' : v).trim(); let m = s.match(/^([A-Za-z]{3})[\-/ ]*(\d{2,4})/); if (m) { let y = m[2]; if (y.length === 2) y = '20' + y; const mm = MON[m[1].toLowerCase()]; if (mm) return `${y}-${mm}`; } m = s.match(/^(\d{4})[\-/](\d{1,2})/); return m ? `${m[1]}-${String(+m[2]).padStart(2,'0')}` : null; }

// 读仓库根 data.js（客户版）取 活动名->代码 + 旧元信息回退
let nameToCode = {}, codeToMeta = {};
try {
  const raw = fs.readFileSync('data.js', 'utf8');
  const prev = JSON.parse(raw.replace(/^\s*window\.__CP_DATA__\s*=\s*/, '').replace(/;\s*$/, ''));
  for (const a of (prev.activities || [])) { if (a.name) nameToCode[a.name] = a.code; codeToMeta[a.code] = a; }
} catch (e) { console.warn('读根 data.js 失败（首次或无文件），继续:', e.message); }

const warnings = [];

// Sheet1 活动清单 -> sku/周期
const sheet1Meta = {};
try {
  for (const r of rows((await getCells(LIST_SHEET, 0, 100, 0, 5)).csv_data)) {
    const nm = String(r[1] ?? '').trim();
    if (nm === '' || nm === '活动') continue;
    const rng = String(r[3] ?? '');
    let ps = '', pe = '';
    const md = rng.match(/(\d{4}[/\-]\d{1,2}[/\-]\d{1,2})/); if (md) ps = parseDate(md[1]) || '';
    const parts = rng.split(/[~～]/); if (parts.length >= 2) pe = parseDate(parts[1]) || '';
    sheet1Meta[nm] = { sku: String(r[2] ?? '').trim(), pstart: ps, pend: pe };
  }
} catch (e) { warnings.push('Sheet1 读取失败，sku/周期回退旧值: ' + e.message); }

// 数据页 -> periods + activities
const dataRows = rows((await getCells(DATA_SHEET, 0, 200, 0, 13)).csv_data);
const periodMap = new Map();   // period -> Map(code -> metrics)
const actCodes = []; const actMeta = {};
for (const r of dataRows) {
  const nm = String(r[1] ?? '').trim(); if (nm === '') continue;
  const pd = parseDate(r[0]); if (!pd) continue;
  let type = String(r[2] ?? '').trim().toLowerCase(); if (type !== 'utc') type = 'bottle';
  let code = nameToCode[nm];
  if (!code) { code = nm; if (!(nm in sheet1Meta)) warnings.push(`新活动『${nm}』首次出现，已收录；如需 sku/周期请在 Sheet1 补一行`); }
  if (!(code in actMeta)) {
    const s1 = sheet1Meta[nm], old = codeToMeta[code];
    actMeta[code] = {
      code, name: nm,
      sku: s1 ? s1.sku : (old ? (old.sku || '') : ''),
      type,
      pstart: (s1 && s1.pstart) ? s1.pstart : (old ? (old.pstart || '') : ''),
      pend: s1 ? s1.pend : (old ? (old.pend || '') : '')
    };
    actCodes.push(code);
  }
  if (!periodMap.has(pd)) periodMap.set(pd, new Map());
  const d = periodMap.get(pd);
  if (type === 'utc') d.set(code, { scan_cnt: toNum(r[11]), scan_ppl: toNum(r[12]) });
  else d.set(code, {
    hcp_pv: toNum(r[3]), hcp_uv: toNum(r[4]), hoth_pv: toNum(r[5]), hoth_uv: toNum(r[6]),
    kcp_pv: toNum(r[7]), kcp_uv: toNum(r[8]), koth_pv: toNum(r[9]), koth_uv: toNum(r[10])
  });
}
if (actCodes.length === 0) throw new Error('数据页没有解析到任何数据行');

const periodsArr = [...periodMap.keys()].sort().map(date => {
  const dObj = {}; for (const [code, m] of periodMap.get(date)) dObj[code] = m;
  return { date, d: dObj };
});
const activitiesArr = actCodes.map(c => actMeta[c]);

// MAU
let mauArr = [];
try {
  for (const r of rows((await getCells(MAU_SHEET, 0, 60, 0, 6)).csv_data)) {
    const mo = parseMonth(r[0]); if (!mo) continue;
    mauArr.push({ month: mo, wx_mau: toNum(r[1]), wx_label: toNum(r[2]), ali_mau: toNum(r[4]), ali_chunyue: toNum(r[5]) });
  }
} catch (e) { warnings.push('MAU 读取失败: ' + e.message); }

const state = { activities: activitiesArr, periods: periodsArr, mau: mauArr, cur: Math.max(0, periodsArr.length - 1) };

fs.mkdirSync('internal', { recursive: true });
fs.writeFileSync('internal/data.js', 'window.__CP_DATA__ = ' + JSON.stringify(state) + ';\n', 'utf8');
// 内部版看板与客户版同款；给 data.js 加版本号（防浏览器缓存旧数据）
const ver = Date.now();
const html = fs.readFileSync('index.html', 'utf8').replace(/src="data\.js"/g, `src="data.js?v=${ver}"`);
fs.writeFileSync('internal/index.html', html, 'utf8');

console.log(`[OK] internal 已生成：期数 ${periodsArr.length} · 活动 ${activitiesArr.length} · MAU ${mauArr.length} 月`);
for (const w of warnings) console.log('  [!] ' + w);
