// Open-Meteo（APIキー不要）から今日・明日の天気を取る。繋がらなければ最後に取れた値で表示を続ける（設計書§26・§27）。
import { toDateInput } from '../lib/datetime.js';
import { state, notify, upsertWeatherCache } from './store.js';

/** MVPでは位置情報を使わず固定地点（設計書§19）。 */
export const DEFAULT_LOCATION = { name: '滋賀県近江八幡市', latitude: 35.1281, longitude: 136.098, timezone: 'Asia/Tokyo' };

const LABELS = {
  0: '快晴', 1: '晴れ', 2: '薄曇り', 3: '曇り', 45: '霧', 48: '霧',
  51: '弱い霧雨', 53: '霧雨', 55: '強い霧雨', 56: '着氷性の霧雨', 57: '着氷性の霧雨',
  61: '弱い雨', 63: '雨', 65: '強い雨', 66: '着氷性の雨', 67: '着氷性の雨',
  71: '弱い雪', 73: '雪', 75: '強い雪', 77: '霧雪', 80: 'にわか雨', 81: 'にわか雨', 82: '激しいにわか雨',
  85: 'にわか雪', 86: '強いにわか雪', 95: '雷雨', 96: '雷雨（ひょう）', 99: '雷雨（ひょう）',
};
export function describeWeatherCode(code) {
  if (code === null || code === undefined) return null;
  return LABELS[code] ?? '不明';
}

async function fetchForecast() {
  const params = new URLSearchParams({
    latitude: String(DEFAULT_LOCATION.latitude),
    longitude: String(DEFAULT_LOCATION.longitude),
    current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,precipitation_probability_max',
    timezone: DEFAULT_LOCATION.timezone,
    forecast_days: '2',
  });
  const res = await fetch('https://api.open-meteo.com/v1/forecast?' + params);
  if (!res.ok) throw new Error('Open-Meteo responded with ' + res.status);
  const body = await res.json();
  const days = (body.daily?.time ?? []).map((date, i) => ({
    date,
    condition: describeWeatherCode(body.daily?.weather_code?.[i]),
    temperature: body.daily?.temperature_2m_max?.[i] ?? null,
    rainProbability: body.daily?.precipitation_probability_max?.[i] ?? null,
  }));
  return {
    current: body.current ? { condition: describeWeatherCode(body.current.weather_code), temperature: body.current.temperature_2m ?? null } : null,
    today: days[0] ?? null,
    tomorrow: days[1] ?? null,
    isStale: false,
  };
}

function cachedForecast() {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const pick = (key) => {
    const row = state.db.weather_cache.find((c) => c.date === key);
    return row ? { date: row.date, condition: row.condition, temperature: row.temperature, rainProbability: row.rain_probability } : null;
  };
  const t = pick(toDateInput(today));
  const n = pick(toDateInput(tomorrow));
  return t || n ? { current: null, today: t, tomorrow: n, isStale: true } : null;
}

export async function refreshForecast() {
  state.forecast = { ...state.forecast, status: 'loading' };
  notify();
  try {
    const data = await fetchForecast();
    upsertWeatherCache([data.today, data.tomorrow].filter(Boolean));
    state.forecast = { status: 'ok', data, error: null };
  } catch (e) {
    const cached = cachedForecast();
    state.forecast = cached ? { status: 'ok', data: cached, error: null } : { status: 'error', data: null, error: e.message };
  }
  notify();
}
