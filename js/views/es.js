// ESタブ。①添削（ルールによる機械チェック＋Claudeに貼る依頼文）②ESアーカイブ（書いたESの保管）。
import { buildReviewPrompt, countChars, reviewEs } from '../../lib/shukatsu/esReview.js';
import { deleteEsItem, saveEsItem, state } from '../store.js';
import { $, $$, closeSheet, confirmDialog, esc, header, openSheet, segmented, toast } from '../ui.js';

export const ES_LABELS = ['ガクチカ', '自己PR', '志望動機', '研究内容', '長所・短所', '挫折経験', '将来像', '企業理解', 'その他'];

const ui = { view: 'review', label: 'all' };
// 入力途中の文章は画面を描き直しても消さない（端末にも控える）
const DRAFT_KEY = 'okan-es-draft-v1';
let draft = (() => { try { return { company: '', question: '', limit: '', essay: '', ...JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') }; } catch { return { company: '', question: '', limit: '', essay: '' }; } })();
let result = null;
const keepDraft = () => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* 控えられなくても動く */ } };

const companies = () => [...new Set([...state.db.entries.map((e) => e.company), ...state.db.es_items.map((x) => x.company)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));

function counter(chars, limit) {
  const lim = Number(limit) || 0;
  return `${chars}${lim ? ` / ${lim}` : ''}字`;
}

function resultHtml(r) {
  const tone = r.total >= 80 ? 'ok' : r.total >= 60 ? 'warn' : 'danger';
  return `
    <section class="card">
      <div class="eyebrow">RESULT</div>
      <div class="score-row"><div class="score ${tone}">${r.total}<small>/100</small></div>
        <div class="muted">${r.stats.chars}字・${r.stats.sentences}文（1文平均${r.stats.avgSentence}字、最長${r.stats.longestSentence}字）・数字${r.stats.numbers}個</div></div>
      <p class="faint">決まったルールで数えた機械チェックです（AIではありません）。中身の良し悪しや企業との合い方までは見ていないので、下の「Claudeに添削を頼む」と組み合わせてください。</p>
      ${r.criteria.map((c) => `<div class="stat"><div class="top"><span>${esc(c.label)}</span><b>${c.score} / 20</b></div><div class="bar"><i style="width:${c.score * 5}%"></i></div>
        <div class="faint">${c.hits.length ? `見つかった言葉：${esc(c.hits.slice(0, 8).join('、'))}` : '手がかりになる言葉が見つかりません'}</div></div>`).join('')}
    </section>
    ${r.deductions.length ? `<section class="card"><div class="eyebrow">DEDUCTIONS</div><h2>減点</h2><ul>${r.deductions.map((d) => `<li><b>-${d.points} ${esc(d.label)}</b><br><span class="muted">${esc(d.detail)}</span></li>`).join('')}</ul></section>` : ''}
    ${r.improvements.length ? `<section class="card"><div class="eyebrow">TO 90+</div><h2>点を上げるには（効く順）</h2><ol>${r.improvements.slice(0, 5).map((t) => `<li>${esc(t)}</li>`).join('')}</ol></section>` : '<section class="card"><p>ルール上の指摘はありません。</p></section>'}`;
}

function reviewView() {
  const chars = countChars(draft.essay);
  const over = Number(draft.limit) > 0 && chars > Number(draft.limit);
  return `
    <form class="card" id="esForm" novalidate>
      <div class="eyebrow">INPUT</div><h2>添削するES</h2>
      <label class="field">企業名（任意）<input name="company" list="esCompanies" value="${esc(draft.company)}" autocomplete="off"><datalist id="esCompanies">${companies().map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <label class="field">設問（任意）<input name="question" value="${esc(draft.question)}" placeholder="学生時代に力を入れたことを教えてください"></label>
      <label class="field">文字数の上限（任意）<input name="limit" inputmode="numeric" value="${esc(draft.limit)}" placeholder="400"></label>
      <label class="field">本文<textarea name="essay" rows="9" placeholder="私が学生時代に力を入れたことは…">${esc(draft.essay)}</textarea></label>
      <p class="${over ? 'err' : 'faint'}" id="esCount">${counter(chars, draft.limit)}${over ? '（上限を超えています）' : ''}</p>
      <div class="goal-actions">
        <button type="submit" class="btn primary">チェックする</button>
        <button type="button" class="btn" id="copyPrompt">Claudeに添削を頼む（依頼文をコピー）</button>
        <button type="button" class="btn" id="toArchive">アーカイブに保存</button>
        <button type="button" class="btn ghost" id="clearEs">クリア</button>
      </div>
      <p class="faint">チェックは端末の中だけで行い、どこにも送りません。依頼文は claude.ai などに貼り付けて使います（書き直し案と企業に合わせた指摘はそちらで）。</p>
    </form>
    ${result ? resultHtml(result) : ''}`;
}

function archiveView() {
  const items = state.db.es_items.filter((x) => ui.label === 'all' || x.label === ui.label);
  return `
    <div class="chips">${['all', ...ES_LABELS].map((l) => `<button class="chip ${ui.label === l ? 'on' : ''}" data-label="${esc(l)}">${l === 'all' ? 'すべて' : esc(l)}<small>${l === 'all' ? state.db.es_items.length : state.db.es_items.filter((x) => x.label === l).length}</small></button>`).join('')}</div>
    <div class="list">${items.length ? items.map((x) => {
      const chars = countChars(x.body);
      const over = Number(x.limit) > 0 && chars > Number(x.limit);
      return `<div class="row click" data-item="${esc(x.id)}"><div class="main"><div class="faint">${esc(x.label)}${x.company ? `・${esc(x.company)}` : ''}</div><b>${esc(x.title || x.question || '（無題）')}</b>
        <span class="${over ? 'err' : 'faint'}">${counter(chars, x.limit)}${over ? '・上限超過' : ''}・${esc(new Date(x.updated_at).toLocaleDateString('ja-JP'))}</span></div><span class="chev">›</span></div>`;
    }).join('') : '<div class="empty">保存したESはまだありません。右上の＋か、添削画面の「アーカイブに保存」から追加できます。</div>'}</div>`;
}

function openItem(id, preset = {}) {
  const item = id ? state.db.es_items.find((x) => x.id === id) : null;
  const v = { label: 'ガクチカ', title: '', company: '', question: '', limit: '', body: '', ...preset, ...(item ?? {}) };
  openSheet({
    title: item ? 'ESを編集' : 'ESを保存',
    bodyHtml: `
      <div class="two"><label class="field">種類<select name="label">${ES_LABELS.map((l) => `<option ${l === v.label ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <label class="field">企業名（任意）<input name="company" list="esCompanies2" value="${esc(v.company)}"><datalist id="esCompanies2">${companies().map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label></div>
      <label class="field">タイトル（任意）<input name="title" value="${esc(v.title)}" placeholder="ガクチカ400字・サークル版"></label>
      <label class="field">設問<input name="question" value="${esc(v.question)}"></label>
      <label class="field">文字数の上限（任意）<input name="limit" inputmode="numeric" value="${esc(v.limit)}"></label>
      <label class="field">本文<textarea name="body" rows="9">${esc(v.body)}</textarea></label>
      <p class="faint" id="itemCount">${counter(countChars(v.body), v.limit)}</p>
      ${item ? '<button type="button" class="btn small" id="sendReview">この文章を添削する</button>' : ''}`,
    onOpen(form) {
      const update = () => { $('#itemCount', form).textContent = counter(countChars($('[name=body]', form).value), $('[name=limit]', form).value); };
      $('[name=body]', form).addEventListener('input', update);
      $('[name=limit]', form).addEventListener('input', update);
      $('#sendReview', form)?.addEventListener('click', () => {
        const fd = new FormData(form);
        draft = { company: fd.get('company'), question: fd.get('question'), limit: fd.get('limit'), essay: fd.get('body') };
        keepDraft();
        result = reviewEs(draft);
        ui.view = 'review';
        closeSheet();
        location.hash = '#/es';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
    },
    onSubmit(f) {
      if (!f.body.trim()) return '本文を入力してください。';
      if (f.limit && !/^\d+$/.test(f.limit.trim())) return '文字数の上限は数字で入力してください。';
      saveEsItem({ label: f.label, company: f.company.trim(), title: f.title.trim(), question: f.question.trim(), limit: f.limit.trim(), body: f.body }, item?.id);
    },
    onDelete: item ? async () => {
      if (await confirmDialog({ title: 'ESを削除しますか？', target: item.title || item.question || item.label })) { deleteEsItem(item.id); closeSheet(); }
    } : null,
  });
}

export function renderEs(root) {
  root.innerHTML = `
    ${header({ eyebrow: 'ENTRY SHEET', title: 'ES', sub: '添削とアーカイブ', actions: ui.view === 'archive' ? '<button class="btn primary icon-btn" id="addItem" aria-label="ESを追加">＋</button>' : '' })}
    <div class="viewseg">${segmented('esview', [{ value: 'review', label: '添削' }, { value: 'archive', label: `アーカイブ（${state.db.es_items.length}）` }], ui.view)}</div>
    <div id="esSub">${ui.view === 'review' ? reviewView() : archiveView()}</div>`;
  $$('[name=esview]', root).forEach((r) => r.addEventListener('change', () => { ui.view = r.value; renderEs(root); }));
  $('#addItem', root)?.addEventListener('click', () => openItem(null));
  $$('[data-label]', root).forEach((b) => b.addEventListener('click', () => { ui.label = b.dataset.label; renderEs(root); }));
  $$('[data-item]', root).forEach((r) => r.addEventListener('click', () => openItem(r.dataset.item)));

  const form = $('#esForm', root);
  if (!form) return;
  form.addEventListener('input', () => {
    const fd = new FormData(form);
    draft = { company: fd.get('company'), question: fd.get('question'), limit: String(fd.get('limit')).replace(/[^\d]/g, ''), essay: fd.get('essay') };
    keepDraft();
    const chars = countChars(draft.essay);
    const over = Number(draft.limit) > 0 && chars > Number(draft.limit);
    const el = $('#esCount', root);
    el.textContent = `${counter(chars, draft.limit)}${over ? '（上限を超えています）' : ''}`;
    el.className = over ? 'err' : 'faint';
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!draft.essay.trim()) return toast('ES添削', '本文を入力してください。');
    result = reviewEs(draft);
    renderEs(root);
    $('.score-row', root)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('#copyPrompt', root).addEventListener('click', () => {
    if (!draft.essay.trim()) return toast('ES添削', '本文を入力してください。');
    navigator.clipboard?.writeText(buildReviewPrompt(draft))
      .then(() => toast('コピーしました', 'claude.ai などに貼り付けて送ってください。'))
      .catch(() => toast('コピーできませんでした', 'このブラウザではクリップボードを使えません。'));
  });
  $('#toArchive', root).addEventListener('click', () => {
    if (!draft.essay.trim()) return toast('ES添削', '本文を入力してください。');
    openItem(null, { company: draft.company, question: draft.question, limit: draft.limit, body: draft.essay });
  });
  $('#clearEs', root).addEventListener('click', () => { draft = { company: '', question: '', limit: '', essay: '' }; result = null; keepDraft(); renderEs(root); });
}
