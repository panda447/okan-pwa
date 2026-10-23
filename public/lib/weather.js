/** 検索は国内に絞っているので、タイムゾーンは日本で固定する。 */
const JAPAN_TIMEZONE = 'Asia/Tokyo';
/**
 * 位置情報は使わず、設定画面で選んだ地点で取得する（設計書§19）。
 * 何も選んでいないユーザーはこの地点。
 */
export const DEFAULT_LOCATION = {
    name: '滋賀県近江八幡市',
    latitude: 35.1281,
    longitude: 136.098,
    timezone: JAPAN_TIMEZONE,
};
function isValidCoordinate(latitude, longitude) {
    return (typeof latitude === 'number' &&
        typeof longitude === 'number' &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180);
}
/** 保存値が無い・壊れているときは初期値。壊れた座標で天気APIを叩かない。 */
export function resolveLocation(saved) {
    if (!saved ||
        typeof saved.name !== 'string' ||
        saved.name.trim() === '' ||
        !isValidCoordinate(saved.latitude, saved.longitude)) {
        return DEFAULT_LOCATION;
    }
    return {
        name: saved.name,
        latitude: saved.latitude,
        longitude: saved.longitude,
        timezone: JAPAN_TIMEZONE,
    };
}
/**
 * 天気の取り直しが要るかどうかの判定用。表示名ではなく座標で比べる。
 * null は初期値として扱うので、「初期値に戻す」と「近江八幡市を選び直す」は区別される。
 */
export function isSameLocation(a, b) {
    const left = resolveLocation(a);
    const right = resolveLocation(b);
    return left.latitude === right.latitude && left.longitude === right.longitude;
}
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const SEARCH_LIMIT = 5;
const text = (value) => (typeof value === 'string' ? value.trim() : '');
/**
 * 「都道府県＋市区町村＋地名」を、重複を除いてつなぐ。
 * 例：近江八幡市/滋賀県/近江八幡市 → 滋賀県近江八幡市、新宿/東京都/新宿区 → 東京都新宿区。
 */
export function formatPlaceName(name, admin1, admin2) {
    const place = text(name);
    const prefecture = text(admin1);
    // ローマ字のまま返ってくる市区町村（Fukuoka-shi など）は、日本語の表示名に混ぜない
    const city = /^[\x20-\x7E]*$/.test(text(admin2)) ? '' : text(admin2);
    const parts = [];
    if (prefecture && !place.startsWith(prefecture))
        parts.push(prefecture);
    if (city && city !== place && city !== prefecture) {
        // 地名が市区町村名の頭と同じ（新宿/新宿区）なら、市区町村名だけで足りる
        if (city.startsWith(place))
            return [...parts, city].join('');
        parts.push(city);
    }
    parts.push(place);
    return parts.join('');
}
/**
 * Open-Meteo Geocoding API（無料・キー不要）で国内の地名を探す。
 * 該当なしのとき results キー自体が無い応答が返るので、空配列として扱う。
 * 通信・HTTPのエラーは呼び出し側で文言を出すため throw する。
 */
export async function searchPlaces(query, fetchImpl = (url) => fetch(url)) {
    const name = query.trim();
    if (name === '')
        return [];
    const params = new URLSearchParams({
        name,
        count: String(SEARCH_LIMIT),
        language: 'ja',
        countryCode: 'JP',
        format: 'json',
    });
    const response = await fetchImpl(`${GEOCODING_URL}?${params.toString()}`);
    if (!response.ok)
        throw new Error(`Geocoding responded with ${response.status}`);
    const body = (await response.json());
    const results = body && Array.isArray(body.results) ? body.results : [];
    const places = [];
    for (const result of results) {
        if (!result)
            continue;
        const placeName = text(result.name);
        if (placeName === '' || !isValidCoordinate(result.latitude, result.longitude))
            continue;
        const label = formatPlaceName(placeName, result.admin1, result.admin2);
        // 同じ表示名が並ぶと選びようがないので、先に来た方（Open-Meteoの関連度順）だけ残す
        if (places.some((place) => place.name === label))
            continue;
        places.push({
            name: label,
            latitude: result.latitude,
            longitude: result.longitude,
        });
    }
    return places;
}
/** WMO Weather interpretation code → 表示用ラベル */
const WEATHER_CODE_LABELS = {
    0: '快晴',
    1: '晴れ',
    2: '薄曇り',
    3: '曇り',
    45: '霧',
    48: '霧',
    51: '弱い霧雨',
    53: '霧雨',
    55: '強い霧雨',
    56: '着氷性の霧雨',
    57: '着氷性の霧雨',
    61: '弱い雨',
    63: '雨',
    65: '強い雨',
    66: '着氷性の雨',
    67: '着氷性の雨',
    71: '弱い雪',
    73: '雪',
    75: '強い雪',
    77: '霧雪',
    80: 'にわか雨',
    81: 'にわか雨',
    82: '激しいにわか雨',
    85: 'にわか雪',
    86: '強いにわか雪',
    95: '雷雨',
    96: '雷雨（ひょう）',
    99: '雷雨（ひょう）',
};
export function describeWeatherCode(code) {
    if (code === null || code === undefined)
        return null;
    return WEATHER_CODE_LABELS[code] ?? '不明';
}
