// 就活の選考データ（エントリ）の判定・集計。DOMに触らない純粋関数だけを置く。
// 項目と画面構成は NEXTROUND2 を参考にしたが、コードは新規に書いている。

export const STAGES = [
  '気になる', '応募予定', '書類選考中', 'ES提出済', 'Webテスト', 'GD',
  '面接', '一次面接', '二次面接', '最終面接', '結果待ち',
  'ES不合格', 'Webテスト不合格', 'GD不合格', '面接不合格',
  'インターン合格', 'インターン不合格', '内定', '辞退', '不採用',
];
export const ENTRY_TYPES = ['インターン', '本選考', '説明会', 'OB/OG訪問'];
export const INTERN_SEASONS = ['未設定', 'サマー', '秋', '冬'];
export const INDUSTRIES = [
  '未設定', 'IT・通信', '金融', 'メーカー', '商社', 'コンサル', '広告・メディア', '人材',
  '不動産・建設', 'インフラ', '小売・サービス', '官公庁・団体', '医療・ヘルスケア', '教育', 'その他',
];
export const COMBINED_TAG = 'ES+Webテスト同時提出';
export const SELECTION_TAGS = [COMBINED_TAG, '動画選考', 'AI面接', '適性検査', 'ケース面接', '面談', 'その他'];
export const OFFER_DECISIONS = ['検討中', '承諾', '辞退'];

export const WIN_STAGES = new Set(['インターン合格', '内定']);
export const FAIL_STAGES = new Set(['ES不合格', 'Webテスト不合格', 'GD不合格', '面接不合格', 'インターン不合格', '不採用']);
export const DONE_STAGES = new Set([...WIN_STAGES, ...FAIL_STAGES, '辞退']);

/** 締切の近さ。critical=今日・明日、soon=7日以内。 */
export const DEADLINE_CRITICAL_DAYS = 1;
export const DEADLINE_SOON_DAYS = 7;

// ---------- 日付 ----------
const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const isDateKey = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && dateKey(parseDateKey(v)) === v;
export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
/** 今日から何日後か。日付が無ければ null。時刻は見ない（ローカルの日付で数える）。 */
export function daysLeft(key, now = new Date()) {
  if (!isDateKey(key)) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((parseDateKey(key) - today) / 86400000);
}
export function datesBetween(from, to) {
  if (!isDateKey(from) || !isDateKey(to) || from > to) return [];
  const out = [];
  for (let d = parseDateKey(from); dateKey(d) <= to && out.length < 120; d.setDate(d.getDate() + 1)) out.push(dateKey(d));
  return out;
}

// ---------- 選考フロー ----------
/** ステージ名から、どの選考段階に当たるか。独自ステップ（「人事面談」など）も拾う。 */
export function phaseOf(stage) {
  const s = String(stage || '');
  if (/(ES|エントリーシート|書類)/.test(s)) return 'es';
  if (/(Web|WEB|ウェブ|SPI|玉手箱|適性検査|テスト)/i.test(s)) return 'webTest';
  if (/(GD|グループディスカッション)/i.test(s)) return 'gd';
  if (/(面接|面談)/.test(s)) return 'interview';
  return null;
}
const PHASE_ORDER = { es: 1, webTest: 2, gd: 3, interview: 4 };
export const PHASES = [
  { key: 'es', label: 'ES', fail: 'ES不合格' },
  { key: 'webTest', label: 'Webテスト', fail: 'Webテスト不合格' },
  { key: 'gd', label: 'GD', fail: 'GD不合格' },
  { key: 'interview', label: '面接', fail: '面接不合格' },
];

const INTERVIEWS_BY_COUNT = { 0: [], 1: ['面接'], 2: ['一次面接', '最終面接'], 3: ['一次面接', '二次面接', '最終面接'] };

/** チェック（ES/Webテスト/GD）と面接回数から、標準の選考ステップを作る。 */
export function standardFlowSteps({ es = true, webTest = true, gd = false, interviews = 3 } = {}) {
  return [
    '気になる', '応募予定',
    ...(es ? ['書類選考中', 'ES提出済'] : []),
    ...(webTest ? ['Webテスト'] : []),
    ...(gd ? ['GD'] : []),
    ...(INTERVIEWS_BY_COUNT[Math.min(3, Math.max(0, Number(interviews) || 0))]),
    '結果待ち',
  ];
}
export function defaultFlowFor(type) {
  if (type === '本選考') return standardFlowSteps({ es: true, webTest: true, gd: false, interviews: 3 });
  if (type === 'インターン') return standardFlowSteps({ es: true, webTest: true, gd: false, interviews: 1 });
  return ['気になる', '応募予定', '結果待ち'];
}
/** 保存されたステップを整える。結果（合否）は流れに入れず、「結果待ち」を必ず最後に置く。 */
export function normalizeFlowSteps(steps, type = 'インターン') {
  const cleaned = (Array.isArray(steps) ? steps : [])
    .map((s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 30))
    .filter((s) => s && !DONE_STAGES.has(s) && s !== '結果待ち');
  const base = cleaned.length ? [...new Set(cleaned)] : defaultFlowFor(type).filter((s) => s !== '結果待ち');
  return [...base, '結果待ち'];
}
/** いま進める順番。ESとWebテストを同時に出す選考は、Webテストを独立した段にしない。 */
export function activeSequence(entry) {
  const steps = normalizeFlowSteps(entry.flowSteps, entry.type);
  return (entry.selectionTags || []).includes(COMBINED_TAG) ? steps.filter((s) => s !== 'Webテスト') : steps;
}
export function flowSummary(steps) {
  const text = steps.join(' ');
  return {
    es: /(ES|エントリーシート|書類)/.test(text),
    webTest: /(Web|WEB|ウェブ|SPI|玉手箱|適性検査|テスト)/i.test(text),
    gd: /(GD|グループディスカッション)/i.test(text),
    interviews: Math.min(3, steps.filter((s) => /(面接|面談)/.test(s)).length),
  };
}
/** フォームで選べるステージ。流れのステップ＋結果系。 */
export function stageOptions(entry) {
  return [...new Set([...activeSequence(entry), ...STAGES.filter((s) => DONE_STAGES.has(s))])];
}

// ---------- 進める・戻す ----------
const winStageFor = (entry) => (entry.type === 'インターン' ? 'インターン合格' : '内定');
const loseStageFor = (entry) => (entry.type === 'インターン' ? 'インターン不合格' : '不採用');

export function nextStage(entry) {
  if (DONE_STAGES.has(entry.stage)) return entry.stage;
  if (entry.stage === '結果待ち') return winStageFor(entry);
  const seq = activeSequence(entry);
  const i = seq.indexOf(entry.stage);
  return i >= 0 ? seq[Math.min(i + 1, seq.length - 1)] : seq[0];
}
export function failStage(entry) {
  const phase = phaseOf(entry.stage);
  if (phase) return PHASES.find((p) => p.key === phase).fail;
  return loseStageFor(entry);
}
export function resultStages(entry) {
  return { win: winStageFor(entry), lose: loseStageFor(entry) };
}
/** 1つ前に戻す先。履歴があれば履歴を優先する（独自ステップでも正しく戻れる）。 */
export function previousStage(entry) {
  const history = entry.history || [];
  const last = history[history.length - 1];
  if (last && last.to === entry.stage && last.from) return last.from;
  const seq = activeSequence(entry);
  const i = seq.indexOf(entry.stage);
  if (i > 0) return seq[i - 1];
  if (DONE_STAGES.has(entry.stage)) return '結果待ち';
  return seq[0];
}

/** ステージを変えた新しいエントリを返す。戻すときは履歴の最後を取り消す。 */
export function moveStage(entry, to, action, now = new Date()) {
  if (to === entry.stage) return entry;
  const history = [...(entry.history || [])];
  if (action === 'back') {
    const last = history[history.length - 1];
    if (last && last.to === entry.stage) history.pop();
  } else {
    history.push({ from: entry.stage, to, action, at: now.toISOString() });
  }
  const declined = WIN_STAGES.has(to) ? Boolean(entry.declinedAfterWin) : false;
  return {
    ...entry,
    stage: to,
    declinedAfterWin: declined,
    offerDecision: to === '内定' ? (entry.offerDecision || '検討中') : entry.offerDecision,
    history: history.slice(-80),
    updated_at: now.toISOString(),
  };
}

/**
 * 途中の段階から登録したエントリに、そこまでの道のりを履歴として補う（分析で通過済みと数えるため）。
 * 不合格ならその段階まで、合格・辞退なら最後まで通ったことにする。
 */
export function seedHistory(entry, now = new Date()) {
  const seq = activeSequence(entry);
  const i = seq.indexOf(entry.stage);
  let path;
  if (i >= 0) path = seq.slice(0, i + 1);
  else if (FAIL_STAGES.has(entry.stage) && phaseOf(entry.stage)) {
    const j = seq.findIndex((s) => phaseOf(s) === phaseOf(entry.stage));
    path = [...seq.slice(0, j >= 0 ? j + 1 : 2), entry.stage];
  } else if (DONE_STAGES.has(entry.stage)) path = [...seq, entry.stage];
  else path = [entry.stage];
  const at = now.toISOString();
  return path.slice(1).map((to, k) => ({ from: path[k], to, action: 'import', at }));
}

export function progressPercent(entry) {
  if (DONE_STAGES.has(entry.stage)) return 100;
  const seq = activeSequence(entry);
  const i = seq.indexOf(entry.stage);
  if (i < 0) return 0;
  return Math.round((i / Math.max(1, seq.length - 1)) * 100);
}
export const isActive = (entry) => !DONE_STAGES.has(entry.stage);
export const isPostWinDeclined = (entry) => WIN_STAGES.has(entry.stage) && Boolean(entry.declinedAfterWin);

/** 画面の色分け用。 */
export function stageTone(stage) {
  if (WIN_STAGES.has(stage)) return 'ok';
  if (FAIL_STAGES.has(stage)) return 'danger';
  if (stage === '辞退' || stage === '気になる') return 'muted';
  if (stage === '結果待ち' || phaseOf(stage) === 'gd') return 'warn';
  if (phaseOf(stage) === 'webTest') return 'violet';
  if (phaseOf(stage) === 'interview') return 'ok';
  return 'accent';
}

// ---------- 締切 ----------
export function deadlineLevel(entry, now = new Date()) {
  const left = daysLeft(entry.deadline, now);
  if (left === null || left < 0 || !isActive(entry)) return '';
  if (left <= DEADLINE_CRITICAL_DAYS) return 'critical';
  if (left <= DEADLINE_SOON_DAYS) return 'soon';
  return '';
}
export function deadlineText(key, now = new Date(), none = '締切なし') {
  const left = daysLeft(key, now);
  if (left === null) return none;
  if (left < 0) return `${-left}日超過`;
  if (left === 0) return '今日まで';
  if (left === 1) return '明日まで';
  return `あと${left}日`;
}
/** 締切が近いものを先頭、超過・締切なしは後ろに並べるための順位。 */
export function deadlineRank(entry, now = new Date()) {
  const left = daysLeft(entry.deadline, now);
  if (left === null) return 9999;
  if (!isActive(entry)) return 8000 + Math.abs(left);
  if (left < 0) return 9000 - left;
  return left;
}
/** 締切が近い順。完了済み・超過は除く。 */
export function upcomingDeadlines(entries, now = new Date(), days = DEADLINE_SOON_DAYS) {
  return entries
    .filter((e) => isActive(e))
    .map((e) => ({ entry: e, left: daysLeft(e.deadline, now) }))
    .filter((x) => x.left !== null && x.left >= 0 && x.left <= days)
    .sort((a, b) => a.left - b.left || a.entry.company.localeCompare(b.entry.company, 'ja'));
}
/** 期日を過ぎたのに締切対象の段階に残っているもの（提出したか未報告＝未完了として扱う）。 */
export function overdueDeadlines(entries, now = new Date()) {
  return entries
    .filter((e) => isActive(e) && ['気になる', '応募予定', '書類選考中'].includes(e.stage))
    .map((e) => ({ entry: e, left: daysLeft(e.deadline, now) }))
    .filter((x) => x.left !== null && x.left < 0)
    .sort((a, b) => b.left - a.left);
}

// ---------- カレンダー ----------
/** エントリから、カレンダーに載せる出来事を作る。 */
export function entryEvents(entry) {
  const events = [];
  const add = (date, kind, label) => { if (isDateKey(date)) events.push({ date, kind, label, entry }); };
  if (isActive(entry)) add(entry.deadline, 'deadline', `締切：${entry.stage}`);
  add(entry.nextDate, 'next', `${entry.nextPlan || entry.stage}${entry.nextTime ? ` ${entry.nextTime}` : ''}`);
  if (entry.stage === '内定' && entry.offerDecision === '検討中') add(entry.offerResponseDeadline, 'offer', '内定の回答期限');
  for (const d of internDates(entry)) add(d, 'intern', 'インターン参加');
  return events;
}
export function internDates(entry) {
  if (entry.type !== 'インターン') return [];
  if (entry.internMode === 'range') return datesBetween(entry.internStart, entry.internEnd);
  if (entry.internMode === 'custom') return (entry.internDates || []).filter(isDateKey);
  return isDateKey(entry.internStart) ? [entry.internStart] : [];
}
export function eventsByDate(entries) {
  const map = new Map();
  for (const ev of entries.flatMap(entryEvents)) {
    if (!map.has(ev.date)) map.set(ev.date, []);
    map.get(ev.date).push(ev);
  }
  return map;
}

// ---------- 絞り込み ----------
export const FILTERS = [
  { key: 'all', label: 'すべて' },
  { key: 'active', label: '進行中' },
  { key: 'deadline', label: '締切あり' },
  { key: 'インターン', label: 'インターン' },
  { key: '本選考', label: '本選考' },
  { key: 'interview', label: '面接' },
  { key: '結果待ち', label: '結果待ち' },
  { key: 'win', label: '合格・内定' },
  { key: 'fail', label: '不合格' },
];
export function matchesFilter(entry, key) {
  switch (key) {
    case 'all': return true;
    case 'active': return isActive(entry);
    case 'deadline': return isDateKey(entry.deadline) && isActive(entry);
    case 'interview': return phaseOf(entry.stage) === 'interview' && isActive(entry);
    case 'win': return WIN_STAGES.has(entry.stage);
    case 'fail': return FAIL_STAGES.has(entry.stage);
    case '結果待ち': return entry.stage === '結果待ち';
    default: return entry.type === key;
  }
}
export function searchText(entry) {
  return [entry.company, entry.role, entry.industry, entry.stage, entry.memo, entry.nextPlan, entry.offerRole, entry.offerMemo, ...(entry.selectionTags || [])]
    .join(' ').toLowerCase();
}
export function sortEntries(list, order, now = new Date()) {
  const byCompany = (a, b) => a.company.localeCompare(b.company, 'ja');
  const copy = [...list];
  if (order === 'updated') return copy.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  if (order === 'company') return copy.sort(byCompany);
  if (order === 'next') {
    const k = (e) => (isDateKey(e.nextDate) ? e.nextDate : '9999');
    return copy.sort((a, b) => k(a).localeCompare(k(b)) || byCompany(a, b));
  }
  return copy.sort((a, b) => deadlineRank(a, now) - deadlineRank(b, now) || byCompany(a, b));
}

// ---------- パイプライン ----------
export const PIPELINE_COLUMNS = [
  { key: 'before', label: '応募前' },
  { key: 'es', label: '書類' },
  { key: 'webTest', label: 'Webテスト' },
  { key: 'gd', label: 'GD' },
  { key: 'interview', label: '面接' },
  { key: 'waiting', label: '結果待ち' },
  { key: 'win', label: '合格・内定' },
  { key: 'closed', label: '終了' },
];
export function pipelineColumn(entry) {
  if (WIN_STAGES.has(entry.stage)) return 'win';
  if (DONE_STAGES.has(entry.stage)) return 'closed';
  if (entry.stage === '結果待ち') return 'waiting';
  return phaseOf(entry.stage) || 'before';
}

// ---------- 分析 ----------
/** そのエントリが通った（訪れた）ステージ。履歴が無い古いデータは現在地だけ。 */
export function visitedStages(entry) {
  return [...new Set([...(entry.history || []).flatMap((h) => [h.from, h.to]), entry.stage].filter(Boolean))];
}
export const hasStarted = (entry) => visitedStages(entry).some((s) => !['気になる', '応募予定'].includes(s));

/** ある段階の結果。到達していなければ null、通過/不通過/結果待ちのどれか。 */
export function phaseOutcome(entry, phaseKey) {
  const visited = visitedStages(entry);
  const phase = PHASES.find((p) => p.key === phaseKey);
  const reached = visited.some((s) => phaseOf(s) === phaseKey);
  if (!reached) return null;
  if (entry.stage === phase.fail) return 'fail';
  const passed = visited.some((s) => {
    if (WIN_STAGES.has(s) || s === '結果待ち') return true;
    if (FAIL_STAGES.has(s)) return false;
    const p = phaseOf(s);
    return p && PHASE_ORDER[p] > PHASE_ORDER[phaseKey];
  });
  if (passed) return 'pass';
  return visited.includes(phase.fail) ? 'fail' : 'pending';
}

export function analyze(entries, type) {
  const scoped = entries.filter((e) => e.type === type);
  const started = scoped.filter(hasStarted);
  const decided = scoped.filter((e) => WIN_STAGES.has(e.stage) || FAIL_STAGES.has(e.stage));
  const wins = decided.filter((e) => WIN_STAGES.has(e.stage)).length;
  const phases = PHASES.map((p) => {
    const outcomes = started.map((e) => phaseOutcome(e, p.key)).filter((o) => o === 'pass' || o === 'fail');
    const passed = outcomes.filter((o) => o === 'pass').length;
    return { key: p.key, label: p.label, total: outcomes.length, passed, rate: outcomes.length ? Math.round((passed / outcomes.length) * 100) : null };
  });
  const funnelCount = (key) => started.filter((e) => phaseOutcome(e, key) === 'pass').length;
  const funnel = [
    { label: '選考開始', count: started.length },
    ...PHASES.map((p) => ({ label: `${p.label}通過`, count: funnelCount(p.key) })),
    { label: type === 'インターン' ? 'インターン合格' : '内定', count: started.filter((e) => WIN_STAGES.has(e.stage)).length },
  ].map((f) => ({ ...f, rate: started.length ? Math.round((f.count / started.length) * 100) : 0 }));
  const byIndustry = new Map();
  for (const e of decided) {
    const k = e.industry && e.industry !== '未設定' ? e.industry : '業界未設定';
    const row = byIndustry.get(k) || { label: k, total: 0, passed: 0 };
    row.total += 1;
    if (WIN_STAGES.has(e.stage)) row.passed += 1;
    byIndustry.set(k, row);
  }
  const industries = [...byIndustry.values()]
    .map((r) => ({ ...r, rate: Math.round((r.passed / r.total) * 100) }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total);
  return {
    total: scoped.length,
    started: started.length,
    decided: decided.length,
    wins,
    winRate: decided.length ? Math.round((wins / decided.length) * 100) : null,
    phases,
    funnel,
    industries,
  };
}

// ---------- 内定 ----------
export function offerSummary(entries, now = new Date()) {
  const offers = entries.filter((e) => e.stage === '内定');
  const holding = offers.filter((e) => e.offerDecision !== '辞退');
  const urgent = holding.filter((e) => e.offerDecision === '検討中' && (() => { const l = daysLeft(e.offerResponseDeadline, now); return l !== null && l >= 0 && l <= 7; })());
  const sorted = [...offers].sort((a, b) => (a.offerResponseDeadline || '9999').localeCompare(b.offerResponseDeadline || '9999') || a.company.localeCompare(b.company, 'ja'));
  return { offers: sorted, holding: holding.length, accepted: offers.filter((e) => e.offerDecision === '承諾').length, urgent: urgent.length };
}

// ---------- 正規化（読み込み・取り込み用） ----------
const text = (v, max) => String(v ?? '').trim().slice(0, max);
export function normalizeEntry(raw = {}, now = new Date()) {
  const type = ENTRY_TYPES.includes(raw.type) ? raw.type : 'インターン';
  const flowSteps = normalizeFlowSteps(raw.flowSteps, type);
  const stage = STAGES.includes(raw.stage) || flowSteps.includes(raw.stage) ? raw.stage : '応募予定';
  const iso = now.toISOString();
  return {
    id: text(raw.id, 80) || crypto.randomUUID(),
    company: text(raw.company, 160),
    type,
    internSeason: type === 'インターン' && INTERN_SEASONS.includes(raw.internSeason) ? raw.internSeason : '未設定',
    industry: INDUSTRIES.includes(raw.industry) ? raw.industry : '未設定',
    role: text(raw.role, 160),
    stage,
    flowSteps,
    selectionTags: (Array.isArray(raw.selectionTags) ? raw.selectionTags : []).filter((t) => SELECTION_TAGS.includes(t)),
    deadline: isDateKey(raw.deadline) ? raw.deadline : '',
    nextDate: isDateKey(raw.nextDate) ? raw.nextDate : '',
    nextTime: /^\d{2}:\d{2}$/.test(raw.nextTime || '') ? raw.nextTime : '',
    nextPlan: text(raw.nextPlan, 160),
    internMode: ['single', 'range', 'custom'].includes(raw.internMode) ? raw.internMode : 'single',
    internStart: isDateKey(raw.internStart) ? raw.internStart : '',
    internEnd: isDateKey(raw.internEnd) ? raw.internEnd : '',
    internDates: (Array.isArray(raw.internDates) ? raw.internDates : []).filter(isDateKey).slice(0, 60),
    portalUrl: /^https?:\/\//i.test(raw.portalUrl || '') ? text(raw.portalUrl, 500) : '',
    memo: text(raw.memo, 20000),
    offerResponseDeadline: isDateKey(raw.offerResponseDeadline) ? raw.offerResponseDeadline : '',
    offerDecision: OFFER_DECISIONS.includes(raw.offerDecision) ? raw.offerDecision : '検討中',
    offerRole: text(raw.offerRole, 80),
    offerMemo: text(raw.offerMemo, 10000),
    declinedAfterWin: WIN_STAGES.has(stage) && Boolean(raw.declinedAfterWin),
    history: (Array.isArray(raw.history) ? raw.history : [])
      .filter((h) => h && typeof h.to === 'string' && !Number.isNaN(Date.parse(h.at)))
      .map((h) => ({ from: String(h.from || ''), to: h.to, action: String(h.action || 'advance'), at: h.at }))
      .slice(-80),
    created_at: Number.isNaN(Date.parse(raw.created_at)) ? iso : raw.created_at,
    updated_at: Number.isNaN(Date.parse(raw.updated_at)) ? iso : raw.updated_at,
  };
}
