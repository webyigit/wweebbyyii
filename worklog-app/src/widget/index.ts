import type { Task } from '../types';
import { buildWidgetSnapshot, WIDGET_KEY } from './snapshot';
import { widgetStorage } from './storage';

let last = '';

/** 업무 목록이 바뀔 때마다 부름. 내용이 같으면 쓰지 않음(위젯 새로고침 횟수 절약) */
export function updateWidget(tasks: Task[], now: Date = new Date()): void {
  if (!widgetStorage.supported) return;
  const snap = buildWidgetSnapshot(tasks, now);
  const body = JSON.stringify(snap.items) + snap.truncated;
  if (body === last) return;
  last = body;
  widgetStorage.write(WIDGET_KEY, JSON.stringify(snap));
}

export { buildWidgetSnapshot, WIDGET_KEY } from './snapshot';
export type { WidgetSnapshot, WidgetItem } from './snapshot';
