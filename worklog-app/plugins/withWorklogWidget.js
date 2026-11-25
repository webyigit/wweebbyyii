/**
 * 업무 기록 iOS 위젯 설정 (Expo config plugin)
 *
 * app.json → "plugins": ["expo-notifications", "./plugins/withWorklogWidget"]
 *
 * 하는 일
 * 1) 앱에 App Group(group.<bundleIdentifier>) 권한 추가 → 앱과 위젯이 같은 저장소를 씀
 * 2) @bacons/apple-targets 로 targets/widget 폴더를 위젯 확장(WidgetKit) 타깃으로 붙임
 *    (위젯 쪽 App Group 은 apple-targets 가 앱 설정을 그대로 따라감)
 *
 * ios/ 폴더는 손대지 않습니다. `npx expo prebuild` 가 매번 새로 만듭니다.
 * Android 위젯은 아직 없음 — src/widget/storage.android.ts 주석 참고.
 */
const withAppleTargets = require('@bacons/apple-targets/app.plugin');

function withAppGroup(config) {
  const bundleId = config.ios && config.ios.bundleIdentifier;
  if (!bundleId) throw new Error('[withWorklogWidget] app.json 에 ios.bundleIdentifier 가 필요합니다.');
  const group = `group.${bundleId}`;
  config.ios = config.ios || {};
  config.ios.entitlements = config.ios.entitlements || {};
  const key = 'com.apple.security.application-groups';
  const groups = new Set(config.ios.entitlements[key] || []);
  groups.add(group);
  config.ios.entitlements[key] = [...groups];
  return config;
}

module.exports = function withWorklogWidget(config, props = {}) {
  config = withAppGroup(config);
  return withAppleTargets(config, { root: props.root || './targets', match: props.match || 'widget' });
};
