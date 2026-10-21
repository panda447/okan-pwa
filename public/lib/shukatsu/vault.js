// マイページのログイン情報を、保護パスワードで暗号化してブラウザ内に置く（AES-GCM、鍵はPBKDF2で作る）。
// 保護パスワードそのものはどこにも保存しない。忘れたら中身は復元できない。
const ITERATIONS = 250_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptJson(value, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
  return { v: 1, iterations: ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(data) };
}

/** パスワードが違えば例外（AES-GCMの認証で弾かれる）。 */
export async function decryptJson(box, password) {
  const key = await deriveKey(password, fromB64(box.salt), box.iterations || ITERATIONS);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.data));
    return JSON.parse(dec.decode(plain));
  } catch {
    throw new Error('保護パスワードが違います。');
  }
}

export const isVaultBox = (v) => Boolean(v && typeof v.salt === 'string' && typeof v.iv === 'string' && typeof v.data === 'string');
