/**
 * 위젯에 넘길 데이터 (순수 함수). iOS 위젯(Swift)은 이 JSON 만 읽습니다.
 * 날짜가 바뀌어도 앱을 열기 전까지 위젯이 맞게 보이도록, '오늘'을 고정하지 않고
 * 내일 것까지 넣어 두면 위젯이 자정에 스스로 다시 거릅니다.
 */
import type { Task } from '../types';
import { parseDayKey, toDayKey } from '../reminders/logic';

export const WIDGET_KEY = 'worklog.widget.v1';
/** 위젯이 가장 크게(대형) 보여 주는 줄 수보다 넉넉히 */
export const WIDGET_MAX_ITEMS = 30;

export interface WidgetItem {
  id: string;
  title: string;
  date: string;
  /** 알림 시각 ISO (있으면 위젯에 시각 표시) */
  remindAt?: string;
}

export interface WidgetSnapshot {
  version: 1;
  generatedAt: string;
  /** 미완료 업무: 지난날 밀린 것 + 오늘 + 내일 (날짜순, 같은 날은 화면 순서) */
  items: WidgetItem[];
  /** WIDGET_MAX_ITEMS 를 넘겨 잘린 수 */
  truncated: number;
}

export function buildWidgetSnapshot(tasks: Task[], now: Date = new Date()): WidgetSnapshot {
  const t = parseDayKey(toDayKey(now));
  const tomorrow = toDayKey(new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1));
  const open = tasks
    .filter((x) => !x.done && !x.deletedAt && x.date <= tomorrow)
    .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  const items = open.slice(0, WIDGET_MAX_ITEMS).map((x) => ({
    id: x.id,
    title: x.title,
    date: x.date,
    ...(x.remindAt ? { remindAt: x.remindAt } : {}),
  }));
  return { version: 1, generatedAt: now.toISOString(), items, truncated: Math.max(0, open.length - items.length) };
}
