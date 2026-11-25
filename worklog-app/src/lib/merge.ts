import type { Entry, SyncFile } from '../types';

/** 같은 id 는 updatedAt(삭제면 deletedAt 포함) 이 더 늦은 쪽을 남긴다. */
export function stamp(e: Entry): string {
  return e.deletedAt && e.deletedAt > e.updatedAt ? e.deletedAt : e.updatedAt;
}

export function mergeEntries(a: Entry[], b: Entry[]): Entry[] {
  const map = new Map<string, Entry>();
  for (const e of [...a, ...b]) {
    const cur = map.get(e.id);
    if (!cur || stamp(e) > stamp(cur)) map.set(e.id, e);
  }
  return [...map.values()].sort((x, y) => (x.id < y.id ? -1 : 1));
}

export function isEmpty(e: Pick<Entry, 'done' | 'todo' | 'memo'>): boolean {
  return !e.done.trim() && !e.todo.trim() && !e.memo.trim();
}

const KEY_RE: Record<Entry['period'], RegExp> = {
  daily: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
  weekly: /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/,
  monthly: /^\d{4}-(0[1-9]|1[0-2])$/,
};
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
/** 기기 시계 오차 허용 범위. 이보다 먼 미래 시각은 '항상 이기는' 조작으로 보고 버린다 */
const FUTURE_SLACK_MS = 24 * 3600 * 1000;
export const MAX_ENTRIES = 20000;
export const MAX_TEXT = 20000;

/** 저장소에서 받은 JSON 을 검사. 모양이 다르면 예외. */
export function parseSyncFile(text: string): SyncFile {
  const data = JSON.parse(text);
  if (!data || data.app !== 'worklog' || !Array.isArray(data.entries)) {
    throw new Error('업무 기록 앱 파일 형식이 아닙니다. 파일 경로를 확인하세요.');
  }
  if (data.entries.length > MAX_ENTRIES) throw new Error('저장소 파일의 기록 수가 너무 많습니다.');
  const limit = Date.now() + FUTURE_SLACK_MS;
  const okTime = (t: unknown) => typeof t === 'string' && ISO_RE.test(t) && Date.parse(t) <= limit;
  const ok = (e: any): e is Entry =>
    !!e && typeof e === 'object' &&
    (e.period === 'daily' || e.period === 'weekly' || e.period === 'monthly') &&
    typeof e.key === 'string' && KEY_RE[e.period as Entry['period']].test(e.key) &&
    e.id === `${e.period}:${e.key}` &&
    okTime(e.updatedAt) && (e.deletedAt === undefined || okTime(e.deletedAt));
  const txt = (v: unknown) => String(v ?? '').slice(0, MAX_TEXT);
  return {
    app: 'worklog',
    version: 1,
    exportedAt: String(data.exportedAt ?? ''),
    entries: data.entries.filter(ok).map((e: Entry) => ({
      id: e.id,
      period: e.period,
      key: e.key,
      done: txt(e.done),
      todo: txt(e.todo),
      memo: txt(e.memo),
      updatedAt: e.updatedAt,
      ...(e.deletedAt ? { deletedAt: String(e.deletedAt) } : {}),
    })),
  };
}
