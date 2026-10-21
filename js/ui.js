// 画面部品の共通ヘルパー。HTMLは文字列で組むので、値は必ず esc() を通す。
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function header({ eyebrow, title, sub = '', actions = '' }) {
  return `<header class="head"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</div><div class="actions">${actions}</div></header>`;
}

export function listOrEmpty(rowsHtml, emptyLines) {
  return rowsHtml
    ? `<div class="list">${rowsHtml}</div>`
    : `<div class="list"><div class="empty">${emptyLines.map(esc).join('<br>')}</div></div>`;
}

export function segmented(name, options, value) {
  return `<div class="seg" role="radiogroup">${options
    .map((o) => `<label><input type="radio" name="${esc(name)}" value="${esc(o.value)}" ${String(o.value) === String(value) ? 'checked' : ''}>${esc(o.label)}</label>`)
    .join('')}</div>`;
}

const sheet = document.getElementById('sheet');
const sheetForm = document.getElementById('sheetForm');

/**
 * ボトムシート風のフォームを開く。
 * onSubmit(values) がエラー文字列を返したら閉じずに表示する。何も返さなければ閉じる。
 */
export function openSheet({ title, bodyHtml, submitLabel = '保存する', onSubmit, onDelete, onOpen }) {
  sheetForm.innerHTML = `
    <div class="head-row"><h2>${esc(title)}</h2><button type="button" class="btn ghost icon-btn" data-close aria-label="閉じる">×</button></div>
    ${bodyHtml}
    <p class="err" id="sheetError" role="alert" hidden></p>
    <div class="form-actions">
      ${onDelete ? '<button type="button" class="btn danger" id="sheetDelete">削除</button>' : ''}
      <span class="grow"></span>
      <button type="button" class="btn" data-close>キャンセル</button>
      <button type="submit" class="btn primary">${esc(submitLabel)}</button>
    </div>`;
  const errEl = $('#sheetError', sheetForm);
  const fail = (msg) => { errEl.textContent = msg; errEl.hidden = false; };

  sheetForm.onsubmit = (ev) => {
    ev.preventDefault();
    const values = Object.fromEntries(new FormData(sheetForm));
    const result = onSubmit(values);
    if (typeof result === 'string') return fail(result);
    sheet.close();
  };
  $$('[data-close]', sheetForm).forEach((b) => b.addEventListener('click', () => sheet.close()));
  if (onDelete) $('#sheetDelete', sheetForm).addEventListener('click', onDelete);
  if (!sheet.open) sheet.showModal();
  if (onOpen) onOpen(sheetForm);
}
export const closeSheet = () => sheet.open && sheet.close();

const confirmDlg = document.getElementById('confirm');
const confirmForm = document.getElementById('confirmForm');

/** 確認ダイアログ。OKならtrue。 */
export function confirmDialog({ title, target, message = 'この操作は元に戻せません。', okLabel = '削除する' }) {
  return new Promise((resolve) => {
    confirmForm.innerHTML = `
      <h2>${esc(title)}</h2>
      ${target ? `<p><b>${esc(target)}</b></p>` : ''}
      <p class="muted">${esc(message)}</p>
      <div class="form-actions"><span class="grow"></span>
        <button type="button" class="btn" value="cancel">やめる</button>
        <button type="button" class="btn danger" value="ok">${esc(okLabel)}</button></div>`;
    const done = (v) => { confirmDlg.close(); resolve(v); };
    $$('button', confirmForm).forEach((b) => b.addEventListener('click', () => done(b.value === 'ok')));
    confirmDlg.oncancel = () => resolve(false);
    confirmDlg.showModal();
  });
}

export function toast(title, body) {
  const wrap = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<b>${esc(title)}</b>${esc(body)}`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 8000);
  el.addEventListener('click', () => el.remove());
}

export function badge(type, label) {
  return `<span class="badge ${esc(type)}">${esc(label)}</span>`;
}
