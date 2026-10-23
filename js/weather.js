// Open-Meteo（APIキー不要）から今日・明日の天気を取る。繋がらなければ最後に取れた値で表示を続ける（設計書§26・§27）。
// 地点・天気コードの表示名は okan-app の lib/weather.ts を移植したもの（public/lib/weather.js）を使う。
import { toDateInput } from '../lib/datetime.js';
import { describeWeatherCode, resolveLocation } from '../lib/weather.js';
import { okanSettings } from './okan.js';
import { state, notify, upsertWeatherCache } from './store.js';

/** 設定で選んだ地点。未設定・古い保存データ（地点のキーが無い）なら近江八幡市。 */
export const currentLocation = () => resolveLocation(okanSettings().weatherLocation);

async function fetchForecast(location) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,precipitation_probability_max',
    timezone: location.timezone,
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
    locationName: location.name,
  };
}

function cachedForecast(location) {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const pick = (key) => {
    const row = state.db.weather_cache.find((c) => c.date === key);
    return row ? { date: row.date, condition: row.condition, temperature: row.temperature, rainProbability: row.rain_probability } : null;
  };
  const t = pick(toDateInput(today));
  const n = pick(toDateInput(tomorrow));
  return t || n ? { current: null, today: t, tomorrow: n, isStale: true, locationName: location.name } : null;
}

/** 地点を変えた直後に前の地点の取得が遅れて返ってきても、上書きさせないための番号。 */
let latestRequest = 0;

export async function refreshForecast() {
  // 取得中に地点が変わっても、頼んだ地点の名前で表示する（取った天気と名前をずらさない）
  const location = currentLocation();
  const request = ++latestRequest;
  state.forecast = { ...state.forecast, status: 'loading' };
  notify();
  try {
    const data = await fetchForecast(location);
    if (request !== latestRequest) return;
    upsertWeatherCache([data.today, data.tomorrow].filter(Boolean));
    state.forecast = { status: 'ok', data, error: null };
  } catch (e) {
    if (request !== latestRequest) return;
    const cached = cachedForecast(location);
    state.forecast = cached ? { status: 'ok', data: cached, error: null } : { status: 'error', data: null, error: e.message };
  }
  notify();
}
