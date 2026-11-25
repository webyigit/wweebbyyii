/**
 * 위젯 저장소 — 기본(웹·Expo Go 등): 아무것도 하지 않음.
 * 플랫폼별 구현: storage.ios.ts(App Group + WidgetKit), storage.android.ts(나중에 Glance 위젯 붙일 자리).
 * Metro 가 플랫폼 확장자를 골라 쓰고, 타입 검사는 이 파일 기준입니다.
 */
export interface WidgetStorage {
  /** 위젯용 JSON 저장 후 위젯 다시 그리기 요청 */
  write(key: string, json: string): void;
  readonly supported: boolean;
}

export const widgetStorage: WidgetStorage = {
  supported: false,
  write() {},
};
