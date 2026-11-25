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

/** 저장소에서 받은 JSON 을 검사. 모양이 다르면 예외. */
export function parseSyncFile(text: string): SyncFile {
  const data = JSON.parse(text);
  if (!data || data.app !== 'worklog' || !Array.isArray(data.entries)) {
    throw new Error('업무 기록 앱 파일 형식이 아닙니다. 파일 경로를 확인하세요.');
  }
  const ok = (e: any): e is Entry =>
    e && typeof e.id === 'string' && ['daily', 'weekly', 'monthly'].includes(e.period) &&
    typeof e.key === 'string' && typeof e.updatedAt === 'string';
  return {
    app: 'worklog',
    version: 1,
    exportedAt: String(data.exportedAt ?? ''),
    entries: data.entries.filter(ok).map((e: Entry) => ({
      id: e.id,
      period: e.period,
      key: e.key,
      done: String(e.done ?? ''),
      todo: String(e.todo ?? ''),
      memo: String(e.memo ?? ''),
      updatedAt: e.updatedAt,
      ...(e.deletedAt ? { deletedAt: String(e.deletedAt) } : {}),
    })),
  };
}
