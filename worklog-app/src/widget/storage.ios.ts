/**
 * iOS: App Group 공용 UserDefaults 에 쓰고 WidgetKit 타임라인 새로고침.
 * App Group 이름은 plugins/withWorklogWidget.js 와 targets/widget 이 같은 규칙으로 만듭니다.
 */
import { APP_GROUP, WIDGET_KIND } from './config';
import type { WidgetStorage } from './storage';

type Native = {
  ExtensionStorage: { new (group: string): { set(k: string, v?: string): void }; reloadWidget(name?: string): void };
};

let native: Native | null | undefined;
function load(): Native | null {
  if (native !== undefined) return native;
  try {
    // 개발 빌드에만 들어 있는 네이티브 모듈. Expo Go 에서는 없어도 앱이 죽지 않게.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    native = require('@bacons/apple-targets') as Native;
  } catch {
    native = null;
  }
  return native;
}

export const widgetStorage: WidgetStorage = {
  get supported() {
    return !!load();
  },
  write(key, json) {
    const n = load();
    if (!n) return;
    try {
      new n.ExtensionStorage(APP_GROUP).set(key, json);
      n.ExtensionStorage.reloadWidget(WIDGET_KIND);
    } catch {
      // 위젯 갱신 실패가 앱 사용을 막지 않게 조용히 넘어감
    }
  },
};
