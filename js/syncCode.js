// 同期コード：全データをgzipで縮めてBase64にした文字列。端末間をクリップボードで運ぶ用。
// 送信はしない（コピーと貼り付けだけ）。天気のキャッシュは持ち運ばない。
const PREFIX = 'OKAN1:';
const MAX_CODE = 8 * 1024 * 1024;

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function encodeSyncCode(db) {
  if (typeof CompressionStream === 'undefined') throw new Error('このブラウザは同期コードに対応していません。JSONの書き出しを使ってください。');
  const json = JSON.stringify({ ...db, weather_cache: [] });
  return PREFIX + toB64(await pipe(new TextEncoder().encode(json), new CompressionStream('gzip')));
}

export async function decodeSyncCode(code) {
  const text = String(code || '').trim();
  if (!text.startsWith(PREFIX)) throw new Error('同期コードではありません（OKAN1: で始まる文字列を貼り付けてください）。');
  if (text.length > MAX_CODE) throw new Error('同期コードが大きすぎます。');
  if (typeof DecompressionStream === 'undefined') throw new Error('このブラウザは同期コードに対応していません。JSONの読み込みを使ってください。');
  const bytes = Uint8Array.from(atob(text.slice(PREFIX.length).replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(await pipe(bytes, new DecompressionStream('gzip'))));
}
