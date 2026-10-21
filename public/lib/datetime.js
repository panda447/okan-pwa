const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;
const FULL_WIDTH_SEPARATORS = {
    '－': '-',
    'ー': '-',
    '−': '-',
    '‐': '-',
    '：': ':',
    '／': '/',
};
/** iOSの日本語キーボードだと全角で入ってくることがあるので半角に寄せる。 */
export function toHalfWidth(text) {
    return text
        .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
        .replace(/[－ー−‐：／]/g, (char) => FULL_WIDTH_SEPARATORS[char] ?? char);
}
function digitsOf(text, max) {
    return toHalfWidth(text).replace(/[^0-9]/g, '').slice(0, max);
}
/** 入力中の時刻に区切りを補う。"0000" と打てば "00:00" になる。 */
export function formatTimeInput(text) {
    const digits = digitsOf(text, 4);
    return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
/** 入力中の日付に区切りを補う。"20260924" と打てば "2026-09-24" になる。 */
export function formatDateInput(text) {
    const digits = digitsOf(text, 8);
    if (digits.length <= 4)
        return digits;
    if (digits.length <= 6)
        return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}
function pad(value) {
    return String(value).padStart(2, '0');
}
export function toDateInput(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function toTimeInput(date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
/** "2026-09-18" + "10:00" をローカル時刻のDateにする。書式・実在しない日付なら null。 */
export function parseLocalDateTime(dateText, timeText) {
    const dateMatch = DATE_PATTERN.exec(toHalfWidth(dateText).trim());
    const timeMatch = TIME_PATTERN.exec(toHalfWidth(timeText).trim());
    if (!dateMatch || !timeMatch)
        return null;
    const [, year, month, day] = dateMatch.map(Number);
    const [, hour, minute] = timeMatch.map(Number);
    if (hour > 23 || minute > 59)
        return null;
    const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);
    // 2026-02-30 のような存在しない日付は繰り上がってしまうので突き合わせて弾く
    if (parsed.getMonth() !== month - 1 || parsed.getDate() !== day)
        return null;
    return parsed;
}
/** "2026-12-31" のような日付のみの値をローカル日付のDateにする。書式が不正なら null。 */
export function parseDateOnly(dateText) {
    return parseLocalDateTime(dateText, '00:00');
}
/** date型の値（"2026-12-31"）を表示用に整形する。Date経由だとUTC解釈で1日ずれるので使わない。 */
export function formatDateOnly(dateText) {
    const parsed = parseDateOnly(dateText);
    return parsed ? `${parsed.getMonth() + 1}月${parsed.getDate()}日` : dateText;
}
export function startOfToday() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
}
/** 月曜0:00。週次目標の集計期間の開始。 */
export function startOfWeek() {
    const date = startOfToday();
    const daysSinceMonday = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - daysSinceMonday);
    return date;
}
export function formatDateHeading(iso) {
    return new Date(iso).toLocaleDateString('ja-JP', {
        month: 'long',
        day: 'numeric',
        weekday: 'short',
    });
}
export function formatTime(iso) {
    return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}
export function formatTimeRange(startIso, endIso) {
    return endIso ? `${formatTime(startIso)} - ${formatTime(endIso)}` : formatTime(startIso);
}
/** 日付ごとのグルーピングに使うローカル日付キー */
export function localDateKey(iso) {
    return toDateInput(new Date(iso));
}
/** 日付順に並んで届く前提で、同じ日付が続く間だけ1セクションにまとめる。 */
export function groupByLocalDate(items, getIso) {
    const sections = [];
    for (const item of items) {
        const iso = getIso(item);
        const key = localDateKey(iso);
        const last = sections[sections.length - 1];
        if (last && last.key === key) {
            last.data.push(item);
        }
        else {
            sections.push({ key, title: formatDateHeading(iso), data: [item] });
        }
    }
    return sections;
}
