/**
 * 아이폰 홈·잠금화면 위젯 타깃 (@bacons/apple-targets 가 읽음)
 * App Group 은 앱(app.json → plugins/withWorklogWidget.js)과 같은 값을 씁니다.
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'widget',
  name: 'WorklogWidget',
  displayName: '오늘 할 일',
  bundleIdentifier: '.widget',
  // containerBackground · 잠금화면 위젯 API 를 쓰려고 17.0 (그보다 낮은 기기에는 위젯만 안 보임)
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
  colors: {
    $accent: '#3182F6',
    $widgetBackground: '#FFFFFF',
  },
  entitlements: {
    'com.apple.security.application-groups': [`group.${config.ios.bundleIdentifier}`],
  },
});
