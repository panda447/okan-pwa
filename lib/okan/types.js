/** okan_settings の行が無いユーザーでも動かすための既定値。マイグレーションのdefaultと揃えてある。 */
export const DEFAULT_OKAN_SETTINGS = {
    tone: 'kansai',
    interferenceLevel: 3,
    sleepTime: '23:00',
    wakeTime: '07:00',
    notificationEnabled: true,
};
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
    };
}
export function toOkanSettingsValues(input) {
    return {
        tone: input.tone,
        interference_level: input.interferenceLevel,
        sleep_time: input.sleepTime,
        wake_time: input.wakeTime,
        notification_enabled: input.notificationEnabled,
    };
}
