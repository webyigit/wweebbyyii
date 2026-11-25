/**
 * Android: 아직 위젯 없음(이번 범위는 iOS). 나중에 붙일 때:
 * 1) modules/ 에 Expo 로컬 모듈을 만들어 SharedPreferences 에 json 저장 + AppWidgetManager 갱신
 * 2) Jetpack Glance 위젯이 같은 키(WIDGET_KEY)의 json 을 읽어 그림 — 데이터 모양은 src/widget/snapshot.ts 그대로
 * 3) 탭하면 worklog://today 로 앱 열기 (src/reminders/bridge.ts 의 openRequests 가 이미 처리)
 * 그 전까지는 no-op 이라 Android 빌드에도 영향 없음.
 */
import type { WidgetStorage } from './storage';

export const widgetStorage: WidgetStorage = {
  supported: false,
  write() {},
};
