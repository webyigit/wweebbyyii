/**
 * 앱 열기 요청 주소 (위젯 탭·알림 탭 공통). 순수 함수.
 *   worklog://today
 *   worklog://day/2026-11-25
 *   worklog://day/2026-11-25?task=<id>
 */
import { toDayKey } from './logic';

export interface OpenRequest {
  /** 열어 줄 날짜 'YYYY-MM-DD' */
  date: string;
  /** 강조할 업무 (있으면) */
  taskId?: string;
  source: 'widget' | 'notification' | 'link';
}

export function parseOpenUrl(url: string | null | undefined, now: Date = new Date()): OpenRequest | null {
  if (!url) return null;
  const m = /^worklog:\/\/([^?#]*)(?:\?([^#]*))?/.exec(url);
  if (!m) return null;
  const path = m[1].replace(/^\/+|\/+$/g, '');
  const q = new URLSearchParams(m[2] ?? '');
  const source = q.get('from') === 'widget' ? 'widget' : 'link';
  const taskId = q.get('task') ?? undefined;
  if (path === 'today' || path === '') return { date: toDayKey(now), source, ...(taskId ? { taskId } : {}) };
  const d = /^day\/(\d{4}-\d{2}-\d{2})$/.exec(path);
  if (d) return { date: d[1], source, ...(taskId ? { taskId } : {}) };
  return null;
}
