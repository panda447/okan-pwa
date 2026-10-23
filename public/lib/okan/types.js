/** okan_settings の行が無いユーザーでも動かすための既定値。マイグレーションのdefaultと揃えてある。 */
export const DEFAULT_OKAN_SETTINGS = {
    tone: 'kansai',
    interferenceLevel: 3,
    sleepTime: '23:00',
    wakeTime: '07:00',
    notificationEnabled: true,
    weatherLocation: null,
};
/**
 * 地点の3列は「全部ある」ときだけ地点として扱う。1つでも欠けたら初期値。
 * 座標の範囲は DB の check 制約と resolveLocation が見るので、ここでは型だけ確かめる。
 */
function toSavedLocation(name, latitude, longitude) {
    if (typeof name !== 'string' || name.trim() === '')
        return null;
    if (typeof latitude !== 'number' || typeof longitude !== 'number')
        return null;
    return { name, latitude, longitude };
}
/** DBの行を判定・画面が扱う形にする。行が無ければ既定値。 */
export function toOkanSettingsInput(settings) {
    if (!settings)
        return DEFAULT_OKAN_SETTINGS;
    return {
        tone: settings.tone,
        interferenceLevel: settings.interference_level,
        // time型は "23:00:00" で返るので、入力欄に合わせて分までにする
        sleepTime: settings.sleep_time.slice(0, 5),
        wakeTime: settings.wake_time.slice(0, 5),
        notificationEnabled: settings.notification_enabled,
        // 列を足す前の行（Web版の古い保存データなど）はキー自体が無いので、初期値になる
        weatherLocation: toSavedLocation(settings.weather_location_name, settings.weather_latitude, settings.weather_longitude),
    };
}
export function toOkanSettingsValues(input) {
    return {
        tone: input.tone,
        interference_level: input.interferenceLevel,
        sleep_time: input.sleepTime,
        wake_time: input.wakeTime,
        notification_enabled: input.notificationEnabled,
        weather_location_name: input.weatherLocation?.name ?? null,
        weather_latitude: input.weatherLocation?.latitude ?? null,
        weather_longitude: input.weatherLocation?.longitude ?? null,
    };
}
