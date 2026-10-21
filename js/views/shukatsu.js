// 就活タブ。選考の一覧・パイプライン・内定管理・企業フィット、締切、分析、取り込み、マイページ情報。
import {
  FILTERS, PIPELINE_COLUMNS, WIN_STAGES, OFFER_DECISIONS, analyze, daysLeft, deadlineLevel, deadlineText, failStage, isActive,
  isPostWinDeclined, matchesFilter, moveStage, nextStage, normalizeEntry, offerSummary, overdueDeadlines, pipelineColumn,
  previousStage, progressPercent, resultStages, searchText, seedHistory, sortEntries, stageTone, upcomingDeadlines,
} from '../../lib/shukatsu/model.js';
import { csvToCandidates, isUsableCandidate, parseMemo } from '../../lib/shukatsu/importer.js';
import { decryptJson, encryptJson, isVaultBox } from '../../lib/shukatsu/vault.js';
import { addEntries, replaceEntry, setVault, state, updateEntry } from '../store.js';
import { openEntryForm } from './entryForm.js';
import { renderFit } from './fit.js';
import { $, $$, closeSheet, confirmDialog, esc, header, openSheet, segmented, toast } from '../ui.js';

const ui = { view: 'list', filter: 'active', query: '', sort: 'deadline', analysisType: '本選考' };

const fmtDate = (key) => (key ? key.slice(5).replace('-', '/') : '');
const stagePill = (stage) => `<span class="pill ${stageTone(stage)}">${esc(stage)}</span>`;

// ---------- カード ----------
function card(e) {
  const level = deadlineLevel(e);
  const done = !isActive(e);
  const next = nextStage(e);
  const pct = progressPercent(e);
  const meta = [e.type === 'インターン' && e.internSeason !== '未設定' ? `${e.internSeason}インターン` : e.type, e.industry !== '未設定' ? e.industry : '', e.role].filter(Boolean).join(' ・ ');
  const actions = done
    ? [
      WIN_STAGES.has(e.stage) ? `<button class="btn small" data-act="decline">${isPostWinDeclined(e) ? '辞退を取り消す' : '辞退として記録'}</button>` : '',
      e.stage === '内定' ? '<button class="btn small" data-act="offer">内定を管理</button>' : '',
      '<button class="btn small ghost" data-act="back">‹ 戻す</button>',
    ]
    : e.stage === '結果待ち'
      ? ['<button class="btn small primary" data-act="result">結果を入力</button>', '<button class="btn small ghost" data-act="back">‹ 戻す</button>']
      : [
        `<button class="btn small primary" data-act="next">次へ：${esc(next)}</button>`,
        `<button class="btn small danger" data-act="fail">${esc(failStage(e))}</button>`,
        e.history?.length ? '<button class="btn small ghost" data-act="back">‹ 戻す</button>' : '',
      ];
  return `
    <article class="entry ${level ? `dl-${level}` : ''} ${isPostWinDeclined(e) ? 'declined' : ''}" data-id="${esc(e.id)}">
      <div class="entry-top">
        <div class="main"><div class="faint">${esc(meta)}</div><h3>${esc(e.company)}</h3></div>
        ${stagePill(isPostWinDeclined(e) ? `${e.stage}（辞退）` : e.stage)}
      </div>
      <div class="entry-meta">
        ${e.deadline ? `<span class="${level ? `dl ${level}` : ''}">締切 ${esc(fmtDate(e.deadline))}・${esc(deadlineText(e.deadline))}</span>` : '<span class="faint">締切なし</span>'}
        ${e.nextDate ? `<span>次：${esc(fmtDate(e.nextDate))}${e.nextTime ? ` ${esc(e.nextTime)}` : ''} ${esc(e.nextPlan)}</span>` : ''}
        ${e.stage === '内定' ? `<span class="${e.offerDecision === '検討中' && daysLeft(e.offerResponseDeadline) !== null && daysLeft(e.offerResponseDeadline) <= 7 ? 'dl soon' : ''}">内定：${esc(e.offerDecision)}${e.offerResponseDeadline ? `・回答 ${esc(deadlineText(e.offerResponseDeadline))}` : ''}</span>` : ''}
      </div>
      <div class="bar ${pct === 100 && WIN_STAGES.has(e.stage) ? 'done' : ''}"><i style="width:${pct}%"></i></div>
      ${e.selectionTags?.length ? `<div class="tags">${e.selectionTags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="entry-actions">
        ${actions.join('')}
        <span class="grow"></span>
        ${e.portalUrl ? `<a class="btn small ghost" href="${esc(e.portalUrl)}" target="_blank" rel="noopener noreferrer">マイページ</a>` : ''}
        <button class="btn small ghost" data-act="login" title="ログイン情報">ID</button>
        <button class="btn small ghost" data-act="timeline">履歴</button>
        <button class="btn small ghost" data-act="edit">編集</button>
      </div>
    </article>`;
}

function bindCards(root) {
  $$('.entry', root).forEach((el) => {
    const entry = () => state.db.entries.find((x) => x.id === el.dataset.id);
    $$('[data-act]', el).forEach((b) => b.addEventListener('click', () => {
      const e = entry();
      if (!e) return;
      const act = b.dataset.act;
      if (act === 'next') replaceEntry(moveStage(e, nextStage(e), 'advance'));
      else if (act === 'fail') replaceEntry(moveStage(e, failStage(e), 'fail'));
      else if (act === 'back') replaceEntry(moveStage(e, previousStage(e), 'back'));
      else if (act === 'result') openResult(e);
      else if (act === 'decline') toggleDecline(e);
      else if (act === 'offer') openOffer(e);
      else if (act === 'timeline') openTimeline(e);
      else if (act === 'login') openCredentials(e);
      else if (act === 'edit') openEntryForm(e.id);
    }));
  });
}

// ---------- 結果・辞退・内定 ----------
function openResult(e) {
  const { win, lose } = resultStages(e);
  openSheet({
    title: `${e.company} の結果`,
    bodyHtml: `<p class="muted">結果が届いたら記録します。あとから「戻す」で取り消せます。</p>
      ${segmented('result', [{ value: 'win', label: win }, { value: 'lose', label: lose }], 'win')}
      <div data-win-only style="margin-top:12px">
        ${e.type === 'インターン'
          ? `<label class="field">参加日（任意）<input name="internStart" inputmode="numeric" value="${esc(e.internStart)}" placeholder="2026-12-09"></label>`
          : `<label class="field">内定の回答期限（任意）<input name="offerResponseDeadline" inputmode="numeric" value="${esc(e.offerResponseDeadline)}" placeholder="2026-12-01"></label>`}
      </div>`,
    submitLabel: '記録する',
    onOpen(form) {
      form.addEventListener('change', () => { $('[data-win-only]', form).hidden = new FormData(form).get('result') !== 'win'; });
    },
    onSubmit(v) {
      const isWin = v.result === 'win';
      const extra = {};
      const date = String(v.internStart ?? v.offerResponseDeadline ?? '').trim();
      if (isWin && date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '日付は YYYY-MM-DD の形式で入力してください。';
        if (e.type === 'インターン') Object.assign(extra, { internMode: 'single', internStart: date });
        else extra.offerResponseDeadline = date;
      }
      replaceEntry(moveStage({ ...e, ...extra, offerDecision: '検討中' }, isWin ? win : lose, isWin ? 'result' : 'fail'));
    },
  });
}

async function toggleDecline(e) {
  const declining = !isPostWinDeclined(e);
  if (declining) {
    const label = e.type === 'インターン' ? '合格後の辞退' : '内定辞退';
    const ok = await confirmDialog({ title: `「${label}」として記録しますか？`, target: e.company, message: '合格・内定の記録は残り、分析では合格として数えます。', okLabel: '記録する' });
    if (!ok) return;
  }
  updateEntry(e.id, { declinedAfterWin: declining, offerDecision: e.stage === '内定' ? (declining ? '辞退' : '検討中') : e.offerDecision });
}

function openOffer(e) {
  openSheet({
    title: `${e.company} の内定`,
    bodyHtml: `
      <label class="field">回答期限<input name="offerResponseDeadline" inputmode="numeric" value="${esc(e.offerResponseDeadline)}" placeholder="2026-12-01"></label>
      <p class="muted" style="margin:0 0 6px">判断</p>
      ${segmented('offerDecision', OFFER_DECISIONS.map((d) => ({ value: d, label: d })), e.offerDecision)}
      <label class="field" style="margin-top:12px">職種・配属<input name="offerRole" value="${esc(e.offerRole || e.role)}"></label>
      <label class="field">条件・迷っている点など<textarea name="offerMemo" rows="4">${esc(e.offerMemo)}</textarea></label>`,
    onSubmit(v) {
      const d = String(v.offerResponseDeadline).trim();
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return '回答期限は YYYY-MM-DD の形式で入力してください。';
      updateEntry(e.id, { offerResponseDeadline: d, offerDecision: v.offerDecision, offerRole: v.offerRole.trim(), offerMemo: v.offerMemo.trim(), declinedAfterWin: v.offerDecision === '辞退' });
    },
  });
}

const ACTION_LABELS = { advance: '進めた', fail: '不合格', result: '結果', edit: '編集で変更', import: '登録時', back: '戻した' };
function openTimeline(e) {
  const rows = [...(e.history || [])].reverse().map((h) => `
    <div class="row"><span class="time" style="width:auto;min-width:92px">${esc(new Date(h.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</span>
      <div class="main"><b>${esc(h.from || '—')} → ${esc(h.to)}</b><span class="faint">${esc(ACTION_LABELS[h.action] ?? h.action)}</span></div></div>`).join('');
  openSheet({
    title: `${e.company} の選考履歴`,
    bodyHtml: `<p class="muted">登録 ${esc(new Date(e.created_at).toLocaleDateString('ja-JP'))}・いま ${esc(e.stage)}</p>
      <div class="list">${rows || '<div class="empty">まだ履歴はありません。「次へ」などで段階を動かすと残ります。</div>'}</div>
      ${e.memo ? `<div class="eyebrow">MEMO</div><p style="white-space:pre-wrap">${esc(e.memo)}</p>` : ''}`,
    submitLabel: '閉じる',
    onSubmit() {},
  });
}

// ---------- マイページのログイン情報（暗号化） ----------
const UNLOCK_MS = 30 * 60_000;
let vaultSession = null; // { password, data, until }
const unlocked = () => (vaultSession && vaultSession.until > Date.now() ? vaultSession : (vaultSession = null));

async function writeVault(data, password) {
  setVault(await encryptJson(data, password));
  vaultSession = { password, data, until: Date.now() + UNLOCK_MS };
}

function openCredentials(e) {
  const box = state.db.vault;
  const session = unlocked();
  if (!isVaultBox(box)) {
    openSheet({
      title: 'ログイン情報の保護パスワードを決める',
      bodyHtml: `<p class="muted">マイページのIDやパスワードは、ここで決める保護パスワードで暗号化してこのブラウザ内にだけ保存します。保護パスワードはどこにも保存しないので、<b>忘れると中身は戻せません</b>。</p>
        <label class="field">保護パスワード（8文字以上）<input name="p1" type="password" autocomplete="new-password"></label>
        <label class="field">もう一度<input name="p2" type="password" autocomplete="new-password"></label>`,
      submitLabel: '決める',
      onSubmit(v) {
        if (v.p1.length < 8) return '8文字以上にしてください。';
        if (v.p1 !== v.p2) return '2回の入力が一致しません。';
        writeVault({}, v.p1).then(() => openCredentials(e)).catch((err) => toast('保存できませんでした', err.message));
        return '暗号化しています…';
      },
    });
    return;
  }
  if (!session) {
    openSheet({
      title: 'ログイン情報を開く',
      bodyHtml: '<label class="field">保護パスワード<input name="p" type="password" autocomplete="current-password"></label><p class="faint">開いてから30分間は入れ直さなくて済みます。</p>',
      submitLabel: '開く',
      onSubmit(v) {
        decryptJson(box, v.p)
          .then((data) => { vaultSession = { password: v.p, data, until: Date.now() + UNLOCK_MS }; openCredentials(e); })
          .catch((err) => { const el = $('#sheetError'); el.textContent = err.message; el.hidden = false; });
        return '確認しています…';
      },
    });
    return;
  }
  const cur = session.data[e.id] || { loginId: '', password: '' };
  openSheet({
    title: `${e.company} のログイン情報`,
    bodyHtml: `
      ${e.portalUrl ? `<p><a href="${esc(e.portalUrl)}" target="_blank" rel="noopener noreferrer">${esc(e.portalUrl)}</a></p>` : '<p class="faint">マイページURLは「編集」から登録できます。</p>'}
      <label class="field">ログインID<input name="loginId" value="${esc(cur.loginId)}" autocomplete="off"></label>
      <label class="field">パスワード<input name="password" type="password" value="${esc(cur.password)}" autocomplete="off"></label>
      <div class="goal-actions"><button type="button" class="btn small" id="showPw">表示</button><button type="button" class="btn small" id="copyId">IDをコピー</button><button type="button" class="btn small" id="copyPw">パスワードをコピー</button><button type="button" class="btn small ghost" id="lockNow">いま閉じる</button></div>
      <p class="faint">暗号化してこのブラウザ内に保存。JSONの書き出しには暗号文のまま入ります。</p>`,
    onOpen(form) {
      const pw = $('[name=password]', form);
      $('#showPw', form).addEventListener('click', () => { pw.type = pw.type === 'password' ? 'text' : 'password'; });
      const copy = (v) => navigator.clipboard?.writeText(v).then(() => toast('コピー', 'クリップボードに入れました。')).catch(() => toast('コピーできませんでした', 'このブラウザでは使えません。'));
      $('#copyId', form).addEventListener('click', () => copy($('[name=loginId]', form).value));
      $('#copyPw', form).addEventListener('click', () => copy(pw.value));
      $('#lockNow', form).addEventListener('click', () => { vaultSession = null; closeSheet(); });
    },
    onSubmit(v) {
      const data = { ...session.data };
      if (v.loginId.trim() || v.password) data[e.id] = { loginId: v.loginId.trim(), password: v.password };
      else delete data[e.id];
      writeVault(data, session.password).then(() => toast('ログイン情報', '暗号化して保存しました。')).catch((err) => toast('保存できませんでした', err.message));
    },
  });
}

// ---------- 分析 ----------
function analyticsBody() {
  const a = analyze(state.db.entries, ui.analysisType);
  const rate = (r) => (r === null ? '—' : `${r}%`);
  const barRow = (label, value, detail, pct) => `<div class="stat"><div class="top"><span>${esc(label)}</span><b>${esc(value)}</b></div><div class="bar"><i style="width:${pct ?? 0}%"></i></div>${detail ? `<div class="faint">${esc(detail)}</div>` : ''}</div>`;
  return `
    ${segmented('atype', [{ value: 'インターン', label: 'インターン' }, { value: '本選考', label: '本選考' }], ui.analysisType)}
    <div class="metrics" style="margin-top:12px">
      <div><span>登録</span><strong>${a.total}</strong></div><div><span>選考開始</span><strong>${a.started}</strong></div>
      <div><span>${ui.analysisType === 'インターン' ? '合格' : '内定'}率</span><strong>${rate(a.winRate)}</strong></div>
    </div>
    <p class="faint">合格率は結果が出た${a.decided}件のうち${a.wins}件。</p>
    <div class="eyebrow" style="margin-top:14px">FUNNEL</div><h3 class="h3">選考の進み方（選考開始＝100%）</h3>
    ${a.funnel.map((f) => barRow(f.label, `${f.count}件`, '', f.rate)).join('')}
    <div class="eyebrow" style="margin-top:14px">PHASE</div><h3 class="h3">段階ごとの通過率</h3>
    ${a.phases.map((p) => barRow(p.label, rate(p.rate), p.total ? `結果が出た${p.total}件中${p.passed}件通過` : 'まだ結果が出た選考がありません', p.rate)).join('')}
    <div class="eyebrow" style="margin-top:14px">INDUSTRY</div><h3 class="h3">業界別の${ui.analysisType === 'インターン' ? '合格' : '内定'}率</h3>
    ${a.industries.length ? a.industries.map((r) => barRow(r.label, `${r.rate}%`, `${r.total}件中${r.passed}件`, r.rate)).join('') : '<p class="muted">業界と最終結果が入ると出ます。</p>'}`;
}
function openAnalytics() {
  openSheet({
    title: '選考の分析',
    bodyHtml: analyticsBody(),
    submitLabel: '閉じる',
    onSubmit() {},
    onOpen(form) {
      form.addEventListener('change', (ev) => { if (ev.target.name === 'atype') { ui.analysisType = ev.target.value; openAnalytics(); } });
    },
  });
}

// ---------- 取り込み ----------
let importCandidates = [];
let importMemo = ''; // 読み取ったあとも、元のメモを入力欄に残す
function candidateRows() {
  return importCandidates.map((c, i) => `
    <div class="row cand">
      <input type="checkbox" data-pick="${i}" ${isUsableCandidate(c) ? 'checked' : ''} aria-label="取り込む">
      <div class="main">
        <input class="inline" data-company="${i}" value="${esc(c.company)}" placeholder="企業名を入力">
        <div class="faint">${esc(c.type)} ・ ${esc(c.stage)}${c.deadline ? ` ・ 締切 ${esc(c.deadline)}` : ''}${c.industry !== '未設定' ? ` ・ ${esc(c.industry)}` : ''}</div>
      </div>
    </div>`).join('');
}
function openImport(mode = 'memo', message = '') {
  openSheet({
    title: '選考をまとめて取り込む',
    bodyHtml: `
      ${segmented('mode', [{ value: 'memo', label: 'メモから' }, { value: 'csv', label: 'Notion（CSV）' }], mode)}
      <div style="margin-top:12px">${mode === 'memo'
        ? `<label class="field">1行に1社。企業名・種別・段階・締切を書けば読み取ります<textarea name="memo" rows="5" placeholder="〇〇システムズ 本選考 ES 11/5締切&#10;△△銀行 インターン 一次面接&#10;□□商事 説明会 11月20日">${esc(importMemo)}</textarea></label>
          <button type="button" class="btn" id="parseMemo">読み取る</button>`
        : `<p class="muted">Notionのデータベースで「…」→「エクスポート」→「Markdown & CSV」で書き出したCSVを選んでください。会社名・ステータス・締切などの列を自動で当てます。</p>
          <input type="file" id="csvFile" accept=".csv,text/csv">`}
      </div>
      ${message ? `<p class="muted" style="margin-top:10px">${esc(message)}</p>` : ''}
      ${importCandidates.length ? `<div class="eyebrow" style="margin-top:14px">PREVIEW</div><p class="faint">チェックした行を取り込みます。企業名はここで直せます。段階や締切は取り込んだあと「編集」で直せます。</p><div class="list">${candidateRows()}</div>` : ''}`,
    submitLabel: importCandidates.length ? `取り込む` : '閉じる',
    onOpen(form) {
      form.addEventListener('change', (ev) => {
        if (ev.target.name === 'mode') { importCandidates = []; openImport(ev.target.value); }
      });
      $$('[data-company]', form).forEach((el) => el.addEventListener('input', () => { importCandidates[el.dataset.company].company = el.value; }));
      $('#parseMemo', form)?.addEventListener('click', () => {
        importMemo = $('[name=memo]', form).value;
        importCandidates = parseMemo(importMemo);
        openImport('memo', importCandidates.length ? `${importCandidates.length}行を読み取りました。` : 'メモが空です。');
      });
      $('#csvFile', form)?.addEventListener('change', async (ev) => {
        const file = ev.target.files[0];
        if (!file) return;
        try {
          if (file.size > 5 * 1024 * 1024) throw new Error('5MBを超えるファイルは読み込めません。');
          const r = csvToCandidates(await file.text());
          importCandidates = r.candidates;
          const mapped = Object.entries(r.mapping).map(([k, h]) => `${h}→${({ company: '企業名', type: '種別', industry: '業界', role: '職種', stage: '段階', deadline: '締切', nextDate: '次の予定', portalUrl: 'URL', memo: 'メモ' })[k]}`).join('、');
          openImport('csv', `${r.candidates.length}件を読み取りました（${mapped}）。当たらなかった列はメモに入れます。`);
        } catch (err) {
          importCandidates = [];
          openImport('csv', `読み込めませんでした：${err.message}`);
        }
      });
    },
    onSubmit() {
      if (!importCandidates.length) return;
      const picked = $$('[data-pick]', document.getElementById('sheetForm')).filter((c) => c.checked).map((c) => importCandidates[c.dataset.pick]);
      const usable = picked.filter(isUsableCandidate);
      if (!usable.length) return '取り込む行を選んでください（企業名が空の行は取り込めません）。';
      addEntries(usable.map((c) => { const e = normalizeEntry(c); return { ...e, history: seedHistory(e) }; }));
      toast('取り込み', `${usable.length}件を追加しました。`);
      importCandidates = [];
      importMemo = '';
    },
  });
}

// ---------- 一覧・パイプライン・内定 ----------
function listView() {
  const word = ui.query.trim().toLowerCase();
  const items = sortEntries(state.db.entries.filter((e) => matchesFilter(e, ui.filter) && (!word || searchText(e).includes(word))), ui.sort);
  return `
    <div class="toolbar">
      <input type="search" id="q" placeholder="企業名・メモで検索" value="${esc(ui.query)}">
      <select id="sort" aria-label="並び順">
        ${[['deadline', '締切が近い順'], ['next', '次の予定順'], ['updated', '更新順'], ['company', '企業名順']].map(([v, l]) => `<option value="${v}" ${ui.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </div>
    <div class="chips">${FILTERS.map((f) => `<button class="chip ${ui.filter === f.key ? 'on' : ''}" data-filter="${f.key}">${esc(f.label)}<small>${state.db.entries.filter((e) => matchesFilter(e, f.key)).length}</small></button>`).join('')}</div>
    <div id="cards">${items.length ? items.map(card).join('') : `<div class="list"><div class="empty">${state.db.entries.length ? '条件に合う選考はありません。' : 'まだ選考がありません。右上の＋から追加するか、「取り込み」でメモやNotionからまとめて入れられます。'}</div></div>`}</div>`;
}

function pipelineView() {
  const cols = PIPELINE_COLUMNS.map((c) => ({ ...c, items: state.db.entries.filter((e) => pipelineColumn(e) === c.key) }));
  return `<div class="pipeline">${cols.map((c) => `
    <section class="lane"><header><b>${esc(c.label)}</b><span>${c.items.length}</span></header>
      ${c.items.map((e) => `<button class="lane-card" data-open="${esc(e.id)}"><b>${esc(e.company)}</b><span>${esc(e.stage)}</span>${e.deadline && isActive(e) ? `<em class="${deadlineLevel(e) ? `dl ${deadlineLevel(e)}` : ''}">${esc(deadlineText(e.deadline))}</em>` : ''}</button>`).join('') || '<p class="faint">なし</p>'}
    </section>`).join('')}</div>
    <p class="faint">カードを押すと編集できます。横にスクロールできます。</p>`;
}

function offersView() {
  const o = offerSummary(state.db.entries);
  return `
    <div class="metrics"><div><span>保有内定</span><strong>${o.holding}</strong></div><div><span>承諾</span><strong>${o.accepted}</strong></div><div class="${o.urgent ? 'hot' : ''}"><span>回答期限7日以内</span><strong>${o.urgent}</strong></div></div>
    ${o.offers.length ? o.offers.map((e) => `
      <article class="card offer ${e.offerDecision === '承諾' ? 'accepted' : e.offerDecision === '辞退' ? 'declined' : ''}">
        <div class="entry-top"><div class="main"><div class="faint">${esc(e.industry !== '未設定' ? e.industry : '業界未設定')}</div><h3>${esc(e.company)}</h3><div class="muted">${esc(e.offerRole || e.role || '職種・配属未設定')}</div></div>${stagePill(e.offerDecision)}</div>
        <p>回答期限：<b>${esc(e.offerResponseDeadline || '未設定')}</b>${e.offerResponseDeadline ? `（${esc(deadlineText(e.offerResponseDeadline))}）` : ''}</p>
        ${e.offerMemo ? `<p class="muted" style="white-space:pre-wrap">${esc(e.offerMemo)}</p>` : ''}
        <button class="btn small" data-offer="${esc(e.id)}">内定情報を編集</button>
      </article>`).join('') : '<div class="list"><div class="empty">内定はまだありません。本選考を「内定」にすると、ここに出ます。</div></div>'}`;
}

function summaryBlock() {
  const entries = state.db.entries;
  const near = upcomingDeadlines(entries);
  const overdue = overdueDeadlines(entries);
  return `
    <div class="metrics">
      <div><span>進行中</span><strong>${entries.filter(isActive).length}</strong></div>
      <div class="${near.length ? 'hot' : ''}"><span>締切7日以内</span><strong>${near.length}</strong></div>
      <div><span>合格・内定</span><strong>${entries.filter((e) => WIN_STAGES.has(e.stage)).length}</strong></div>
    </div>
    ${near.length || overdue.length ? `<div class="strip">
      ${near.slice(0, 4).map(({ entry, left }) => `<button class="dl-card ${left <= 1 ? 'critical' : 'soon'}" data-open="${esc(entry.id)}"><b>${esc(entry.company)}</b><span>${esc(entry.stage)}・${esc(deadlineText(entry.deadline))}</span></button>`).join('')}
      ${overdue.slice(0, 3).map(({ entry }) => `<button class="dl-card over" data-open="${esc(entry.id)}"><b>${esc(entry.company)}</b><span>${esc(deadlineText(entry.deadline))}・提出したら段階を進める</span></button>`).join('')}
    </div>` : ''}`;
}

export function renderShukatsu(root) {
  const views = { list: listView, pipeline: pipelineView, offers: offersView, fit: null };
  root.innerHTML = `
    ${header({ eyebrow: 'SELECTION', title: '就活', sub: '選考と締切の管理', actions: '<button class="btn" id="importBtn">取り込み</button><button class="btn" id="analyticsBtn">分析</button><button class="btn primary icon-btn" id="addEntry" aria-label="選考を追加">＋</button>' })}
    ${summaryBlock()}
    <div class="viewseg">${segmented('view', [{ value: 'list', label: '一覧' }, { value: 'pipeline', label: 'パイプライン' }, { value: 'offers', label: '内定' }, { value: 'fit', label: 'フィット' }], ui.view)}</div>
    <div id="subview">${views[ui.view] ? views[ui.view]() : ''}</div>`;
  if (ui.view === 'fit') renderFit($('#subview', root));

  $('#addEntry', root).addEventListener('click', () => openEntryForm(null));
  $('#importBtn', root).addEventListener('click', () => { importCandidates = []; openImport('memo'); });
  $('#analyticsBtn', root).addEventListener('click', openAnalytics);
  $$('[name=view]', root).forEach((r) => r.addEventListener('change', () => { ui.view = r.value; renderShukatsu(root); }));
  $$('[data-open]', root).forEach((b) => b.addEventListener('click', () => openEntryForm(b.dataset.open)));
  $$('[data-offer]', root).forEach((b) => b.addEventListener('click', () => openOffer(state.db.entries.find((e) => e.id === b.dataset.offer))));
  $$('[data-filter]', root).forEach((b) => b.addEventListener('click', () => { ui.filter = b.dataset.filter; renderShukatsu(root); }));
  $('#sort', root)?.addEventListener('change', (ev) => { ui.sort = ev.target.value; renderShukatsu(root); });
  // 検索は入力中にフォーカスを失わないよう、カード部分だけ描き直す
  $('#q', root)?.addEventListener('input', (ev) => {
    ui.query = ev.target.value;
    const tmp = document.createElement('div');
    tmp.innerHTML = listView();
    $('#cards', root).replaceWith($('#cards', tmp));
    bindCards(root);
  });
  bindCards(root);
}
