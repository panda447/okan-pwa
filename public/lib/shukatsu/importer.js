// 選考データの取り込み。①走り書きメモ（1行1社）②NotionのデータベースをCSVで書き出したもの。
// どちらも「候補」を作るだけで、保存は画面で確認してから行う。
import { ENTRY_TYPES, INDUSTRIES, STAGES, dateKey, defaultFlowFor, isDateKey, standardFlowSteps } from './model.js';

const STAGE_RULES = [
  ['Webテスト不合格', /(Web|WEB|ウェブ|SPI|玉手箱|適性検査).*?(不合格|落ち|NG)/],
  ['ES不合格', /(ES|エントリーシート|書類).*?(不合格|落ち|NG)/],
  ['GD不合格', /(GD|グループディスカッション).*?(不合格|落ち|NG)/],
  ['面接不合格', /(面接|面談|一次|1次|二次|2次|最終).*?(不合格|落ち|NG)/],
  ['インターン不合格', /インターン[にのは]?(不合格|落ち)/],
  ['インターン合格', /インターン[にのは]?(合格|通過|参加決定)/],
  ['内定', /内々?定/],
  ['不採用', /不採用|お祈り/],
  ['辞退', /辞退/],
  ['結果待ち', /(結果|連絡|返事)待ち/],
  ['最終面接', /最終/],
  ['二次面接', /(二次|2次)/],
  ['一次面接', /(一次|1次)/],
  ['面接', /面接|面談/],
  ['GD', /GD|グループディスカッション/],
  ['Webテスト', /Webテスト|WEBテスト|ウェブテスト|SPI|玉手箱|適性検査/],
  ['ES提出済', /提出済|提出完了|ES済/],
  ['書類選考中', /書類|ES|エントリーシート/],
  ['気になる', /気になる|候補|検討/],
  ['応募予定', /応募/],
];
const INDUSTRY_RULES = [
  ['IT・通信', /(IT|通信|SIer|SaaS|システム|ソフトウェア|クラウド|DX)/i],
  ['金融', /(金融|銀行|証券|保険|信託|カード|リース)/],
  ['メーカー', /(メーカー|製造|自動車|電機|食品|化学|素材|機械|製薬)/],
  ['商社', /(商社|商事|物産)/],
  ['コンサル', /(コンサル|シンクタンク)/],
  ['広告・メディア', /(広告|メディア|出版|テレビ|新聞|放送)/],
  ['人材', /(人材|HR|求人)/],
  ['不動産・建設', /(不動産|建設|住宅|ゼネコン|デベロッパー)/],
  ['インフラ', /(インフラ|電力|ガス|鉄道|航空|物流)/],
  ['小売・サービス', /(小売|百貨店|EC|旅行|ホテル|外食)/],
  ['官公庁・団体', /(官公庁|自治体|団体|公務員)/],
  ['医療・ヘルスケア', /(医療|ヘルスケア|病院|介護)/],
  ['教育', /(教育|塾|学校)/],
];
// 会社名を取り出すために、意味のある語を消していく
const NOISE = [
  /20\d{2}[/.-]\d{1,2}[/.-]\d{1,2}/g, /\d{1,2}[/月]\d{1,2}日?/g,
  /OB[/・]?OG訪問|OB訪問|OG訪問|インターン|本選考|本選|説明会|サマー|冬|秋|夏/g,
  /締切|〆切|〆|まで|予定|候補|検討|選考中|選考|応募/g,
  /ES提出済|ES済|提出済|提出完了|エントリーシート|ES|書類/g,
  /Webテスト|WEBテスト|ウェブテスト|SPI|玉手箱|適性検査/g,
  /グループディスカッション|GD|一次面接|二次面接|最終面接|一次|1次|二次|2次|最終|面接|面談/g,
  /結果待ち|連絡待ち|返事待ち|不合格|合格|通過|落ち|NG|内々定|内定|不採用|お祈り|辞退/g,
  /[：:、,，／/|｜[\]【】()（）]/g,
];

export function guessStage(line) {
  const t = line.replace(/\s+/g, '');
  return STAGE_RULES.find(([, re]) => re.test(t))?.[0] || '応募予定';
}
export function guessType(line) {
  if (/OB[/・]?OG|OB訪問|OG訪問/.test(line)) return 'OB/OG訪問';
  if (/説明会/.test(line)) return '説明会';
  if (/本選考|本選|内々?定/.test(line)) return '本選考';
  return 'インターン';
}
export function guessSeason(line) {
  if (/サマー|夏|summer/i.test(line)) return 'サマー';
  if (/秋|autumn|fall/i.test(line)) return '秋';
  if (/冬|winter/i.test(line)) return '冬';
  return '未設定';
}
export const guessIndustry = (line) => INDUSTRY_RULES.find(([, re]) => re.test(line))?.[0] || '未設定';

/** "2026/11/5" や "11/5"・"11月5日" を日付にする。年が無い日付が1か月以上前なら来年とみなす。 */
export function guessDate(line, now = new Date()) {
  const full = line.match(/(20\d{2})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (full) return validDate(+full[1], +full[2], +full[3]);
  const md = line.match(/(?:^|[^\d])(\d{1,2})[/月](\d{1,2})日?/);
  if (!md) return '';
  let key = validDate(now.getFullYear(), +md[1], +md[2]);
  if (key && new Date(key) < new Date(now.getTime() - 30 * 86400000)) key = validDate(now.getFullYear() + 1, +md[1], +md[2]);
  return key;
}
function validDate(y, m, d) {
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 && date.getDate() === d ? dateKey(date) : '';
}
export function guessCompany(line) {
  let t = line;
  for (const re of NOISE) t = t.replace(re, ' ');
  return t.replace(/\s+/g, ' ').trim().split(' ')[0] || '';
}

/** メモ1行を候補にする。原文はメモ欄に残す（推測が外れても情報を失わない）。 */
export function parseMemoLine(line, now = new Date()) {
  const type = guessType(line);
  const stage = guessStage(line);
  return {
    company: guessCompany(line),
    type,
    internSeason: type === 'インターン' ? guessSeason(line) : '未設定',
    industry: guessIndustry(line),
    stage,
    deadline: guessDate(line, now),
    flowSteps: flowForImport(line, stage, type),
    memo: line,
  };
}
export function parseMemo(textValue, now = new Date()) {
  return String(textValue || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 200).map((l) => parseMemoLine(l, now));
}
/** 書かれている段階が流れに含まれるようにする（「GD通過」と書いたのにGDの無い流れにしない）。 */
function flowForImport(line, stage, type) {
  const text = `${line} ${stage}`;
  if (type === '説明会' || type === 'OB/OG訪問') return defaultFlowFor(type);
  return standardFlowSteps({
    es: true,
    webTest: /(Web|WEB|ウェブ|SPI|玉手箱|適性検査|テスト)/.test(text) || type === '本選考',
    gd: /(GD|グループディスカッション)/.test(text),
    interviews: type === '本選考' ? 3 : 1,
  });
}

// ---------- CSV ----------
/** RFC4180相当（ダブルクォート・改行入りセル）を読む。 */
export function parseCsv(textValue) {
  const src = String(textValue || '').replace(/^﻿/, '');
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const COLUMN_RULES = [
  ['company', /^(会社名|企業名|会社|企業|応募先|name|名前|title)$/i],
  ['type', /(種別|区分|選考種別|タイプ|type)/i],
  ['industry', /(業界|industry)/i],
  ['role', /(職種|コース|ポジション|role)/i],
  ['stage', /(選考状況|ステータス|status|進捗|フェーズ|段階|現在地)/i],
  ['deadline', /(締切|〆切|期限|deadline)/i],
  ['nextDate', /(次回|次の予定|日程|面接日|予定日|日時)/],
  ['portalUrl', /(URL|マイページ|リンク|url)/],
  ['memo', /(メモ|備考|note|memo)/i],
];
/** 見出しから、どの列が何かを当てる。当たらない列は memo に寄せる。 */
export function detectColumns(headers) {
  const mapping = {};
  headers.forEach((h, i) => {
    const name = String(h).trim();
    const hit = COLUMN_RULES.find(([key, re]) => !(key in mapping) && re.test(name));
    if (hit) mapping[hit[0]] = i;
  });
  if (!('company' in mapping) && headers.length) mapping.company = 0;
  return mapping;
}
/** Notionの日付（"2026年11月5日" "November 5, 2026" "2026/11/05 → 2026/11/06"）から最初の日付を取る。 */
export function parseLooseDate(value, now = new Date()) {
  const v = String(value || '');
  const jp = v.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);
  if (jp) return validDate(+jp[1], +jp[2], +jp[3]);
  const guessed = guessDate(v, now);
  if (guessed) return guessed;
  const t = Date.parse(v.split('→')[0]);
  return Number.isNaN(t) ? '' : dateKey(new Date(t));
}
export function csvToCandidates(textValue, now = new Date()) {
  const rows = parseCsv(textValue);
  if (rows.length < 2) throw new Error('データ行がありません。Notionのデータベースを「CSV」で書き出したファイルを選んでください。');
  const [headers, ...body] = rows;
  const map = detectColumns(headers);
  const get = (r, key) => (key in map ? String(r[map[key]] ?? '').trim() : '');
  const used = new Set(Object.values(map));
  return {
    mapping: Object.fromEntries(Object.entries(map).map(([k, i]) => [k, headers[i]])),
    candidates: body.slice(0, 500).map((r) => {
      const stageText = get(r, 'stage');
      const typeText = get(r, 'type');
      const type = ENTRY_TYPES.includes(typeText) ? typeText : guessType(`${typeText} ${stageText}`);
      const stage = STAGES.includes(stageText) ? stageText : guessStage(stageText || '応募予定');
      const extra = headers.map((h, i) => (!used.has(i) && String(r[i] ?? '').trim() ? `${h}: ${String(r[i]).trim()}` : '')).filter(Boolean);
      const industryText = get(r, 'industry');
      return {
        company: get(r, 'company'),
        type,
        internSeason: '未設定',
        industry: INDUSTRIES.includes(industryText) ? industryText : guessIndustry(industryText),
        role: get(r, 'role'),
        stage,
        deadline: parseLooseDate(get(r, 'deadline'), now),
        nextDate: parseLooseDate(get(r, 'nextDate'), now),
        portalUrl: /^https?:\/\//.test(get(r, 'portalUrl')) ? get(r, 'portalUrl') : '',
        flowSteps: flowForImport(stageText, stage, type),
        memo: [get(r, 'memo'), extra.length ? `Notionから取り込み\n${extra.join('\n')}` : ''].filter(Boolean).join('\n'),
      };
    }).filter((c) => c.company || c.memo),
  };
}
export const isUsableCandidate = (c) => Boolean(c.company && c.company.trim()) && (!c.deadline || isDateKey(c.deadline));
