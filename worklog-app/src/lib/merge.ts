import type { SyncFileV2, Task } from '../types';

/**
 * 충돌 규칙: 같은 id 는 updatedAt(삭제면 deletedAt 중 늦은 값)이 더 늦은 쪽을 남긴다.
 * 시각이 같으면 삭제가 이기고, 그래도 같으면 내용 비교로 정해서
 * 어느 기기에서 합치든 결과가 같게 한다(합치는 순서와 무관).
 */
export function stamp(t: Pick<Task, 'updatedAt' | 'deletedAt'>): number {
  const u = Date.parse(t.updatedAt);
  const d = t.deletedAt ? Date.parse(t.deletedAt) : NaN;
  return Math.max(Number.isFinite(u) ? u : 0, Number.isFinite(d) ? d : 0);
}

function wins(a: Task, b: Task): boolean {
  const sa = stamp(a);
  const sb = stamp(b);
  if (sa !== sb) return sa > sb;
  if (!!a.deletedAt !== !!b.deletedAt) return !!a.deletedAt;
  return canonical(a) > canonical(b);
}

export function mergeTasks(a: Task[], b: Task[]): Task[] {
  const map = new Map<string, Task>();
  for (const t of [...a, ...b]) {
    const cur = map.get(t.id);
    if (!cur || wins(t, cur)) map.set(t.id, t);
  }
  return [...map.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

/** 키 순서와 상관없이 내용이 같으면 같은 문자열 */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const o = v as Record<string, unknown>;
  return (
    '{' +
    Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonical(o[k]))
      .join(',') +
    '}'
  );
}

export function sameTasks(a: Task[], b: Task[]): boolean {
  return canonical(mergeTasks(a, [])) === canonical(mergeTasks(b, []));
}

// ---- 원격 파일 검사 ----
// 저장소 파일은 다른 사람(또는 토큰 유출)이 고칠 수 있다고 보고, 모양이 맞는 항목만 받는다.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
/** 기기 시계 오차 허용 범위. 이보다 먼 미래 시각은 '항상 이기는' 조작으로 보고 버린다 */
const FUTURE_SLACK_MS = 24 * 3600 * 1000;
export const MAX_TASKS = 20000;
export const MAX_TEXT = 5000;

export class SyncFileError extends Error {}

const KNOWN = new Set([
  'id', 'title', 'date', 'done', 'doneAt', 'order', 'remindAt', 'originalDate', 'postponedCount', 'createdAt', 'updatedAt', 'deletedAt',
]);
const EXTRA_KEY_RE = /^[a-zA-Z][A-Za-z0-9_]{0,39}$/;

export function parseSyncFile(text: string, now = Date.now()): SyncFileV2 {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SyncFileError('저장소 파일이 올바른 JSON 이 아닙니다. 덮어쓰지 않고 멈췄습니다.');
  }
  if (data?.app === 'worklog' && data.version === 1) {
    throw new SyncFileError('예전 형식(v1) 파일입니다. 파일 경로를 새로 지정하세요. 예: worklog/tasks.json');
  }
  if (data?.app === 'worklog' && typeof data.version === 'number' && data.version > 2) {
    throw new SyncFileError('더 새 버전 앱이 저장한 파일입니다. 앱을 업데이트한 뒤 동기화하세요. 덮어쓰지 않고 멈췄습니다.');
  }
  if (!data || data.app !== 'worklog' || data.version !== 2 || !Array.isArray(data.tasks)) {
    throw new SyncFileError('업무 기록 앱 파일 형식이 아닙니다. 파일 경로를 확인하세요. 덮어쓰지 않고 멈췄습니다.');
  }
  if (data.tasks.length > MAX_TASKS) throw new SyncFileError('저장소 파일의 업무 수가 너무 많습니다.');
  const limit = now + FUTURE_SLACK_MS;
  const okTime = (t: unknown) => typeof t === 'string' && ISO_RE.test(t) && Date.parse(t) <= limit;
  const optTime = (t: unknown) => t === undefined || okTime(t);
  const ok = (t: any): boolean =>
    !!t && typeof t === 'object' &&
    typeof t.id === 'string' && ID_RE.test(t.id) &&
    typeof t.title === 'string' &&
    typeof t.date === 'string' && DAY_RE.test(t.date) &&
    typeof t.done === 'boolean' &&
    typeof t.order === 'number' && Number.isFinite(t.order) &&
    okTime(t.createdAt) && okTime(t.updatedAt) &&
    optTime(t.deletedAt) && optTime(t.doneAt) &&
    (t.remindAt === undefined || (typeof t.remindAt === 'string' && ISO_RE.test(t.remindAt))) &&
    (t.originalDate === undefined || (typeof t.originalDate === 'string' && DAY_RE.test(t.originalDate))) &&
    (t.postponedCount === undefined || (Number.isInteger(t.postponedCount) && t.postponedCount >= 0));
  const tasks: Task[] = data.tasks.filter(ok).map((t: Task) => {
    // 다른 기기의 새 앱이 추가한 필드는 잃지 않게 단순 값(글·숫자·참거짓)만 그대로 옮긴다.
    // 객체·배열·긴 글은 버린다(끼워 넣기 차단).
    const extra: Record<string, string | number | boolean> = {};
    let n = 0;
    for (const [k, v] of Object.entries(t as unknown as Record<string, unknown>)) {
      if (KNOWN.has(k) || !EXTRA_KEY_RE.test(k) || n >= 20) continue;
      if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= MAX_TEXT)) {
        extra[k] = v;
        n++;
      }
    }
    const out: Task = {
      ...(extra as object),
      id: t.id,
      title: t.title.slice(0, MAX_TEXT),
      date: t.date,
      done: t.done,
      order: t.order,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
    if (t.doneAt) out.doneAt = t.doneAt;
    if (t.remindAt) out.remindAt = t.remindAt;
    if (t.originalDate) out.originalDate = t.originalDate;
    if (t.postponedCount !== undefined) out.postponedCount = t.postponedCount;
    if (t.deletedAt) out.deletedAt = t.deletedAt;
    return out;
  });
  return { app: 'worklog', version: 2, exportedAt: String(data.exportedAt ?? ''), tasks };
}
