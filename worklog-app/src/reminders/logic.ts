/**
 * 알림 계산 (순수 함수, React Native 없이 테스트 가능)
 * 기기 알림 예약/취소는 notifications.ts 가 이 결과를 보고 실행합니다.
 */
import type { DayKey, Task } from '../types';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');

/** iOS 는 앱 하나당 예약 알림을 64개까지만 보관. 여유를 두고 가까운 순 60개만 예약 */
export const MAX_SCHEDULED = 60;
export const ID_PREFIX = 'task-reminder:';
export const SNOOZE_MINUTES = 10;

export function toDayKey(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDayKey(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 업무 날짜 + 시:분(로컬) → ISO */
export function remindAtFor(date: DayKey, hour: number, minute: number): string {
  const d = parseDayKey(date);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** '오전 9:00' */
export function fmtClock(d: Date): string {
  const h = d.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${pad(d.getMinutes())}`;
}

/** '오늘 오후 3:00' · '내일 오전 9:00' · '11월 28일 (토) 오전 9:00' (해가 다르면 연도 포함) */
export function fmtRemind(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const day = toDayKey(d);
  const today = toDayKey(now);
  const tomorrow = toDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  let head: string;
  if (day === today) head = '오늘';
  else if (day === tomorrow) head = '내일';
  else {
    const year = d.getFullYear() !== now.getFullYear() ? `${d.getFullYear()}년 ` : '';
    head = `${year}${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
  }
  return `${head} ${fmtClock(d)}`;
}

export interface Preset {
  key: string;
  label: string;
  remindAt: string;
}

/**
 * 시트에 보여 줄 빠른 선택지. 이미 지난 시각은 뺍니다.
 * - 업무 날이 오늘이면: 30분 뒤 · 1시간 뒤 · 오후 6시
 * - 미래(예약 업무)면: 그날 오전 9시 · 오후 1시 · 전날 오후 9시
 */
export function presetsFor(task: Pick<Task, 'date'>, now: Date = new Date()): Preset[] {
  const out: Preset[] = [];
  const today = toDayKey(now);
  const add = (key: string, label: string, d: Date) => {
    if (d.getTime() > now.getTime()) out.push({ key, label, remindAt: d.toISOString() });
  };
  if (task.date <= today) {
    // 오늘(또는 밀린) 업무: 지금 기준으로
    add('in30', '30분 뒤', new Date(now.getTime() + 30 * 60000));
    add('in60', '1시간 뒤', new Date(now.getTime() + 60 * 60000));
    const six = new Date(now); six.setHours(18, 0, 0, 0);
    add('pm6', '오늘 오후 6시', six);
    const tm = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
    add('tm9', '내일 오전 9시', tm);
  } else {
    const base = parseDayKey(task.date);
    const at = (h: number, m = 0) => { const d = new Date(base); d.setHours(h, m, 0, 0); return d; };
    add('d9', '그날 오전 9시', at(9));
    add('d13', '그날 오후 1시', at(13));
    const eve = new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1, 21, 0);
    add('eve', '전날 오후 9시', eve);
  }
  return out.slice(0, 3);
}

/** 직접 고르기의 기본 시각: 업무 날의 다음 정시(오늘이면 지금 이후, 미래면 오전 9시) */
export function defaultCustom(task: Pick<Task, 'date'>, now: Date = new Date()): { date: DayKey; hour: number; minute: number } {
  if (task.date > toDayKey(now)) return { date: task.date, hour: 9, minute: 0 };
  const next = new Date(now.getTime() + 60 * 60000);
  return { date: toDayKey(next), hour: next.getHours(), minute: 0 };
}

// ---------- 기기 예약과 맞추기 ----------

export interface ScheduledInfo {
  identifier: string;
  taskId: string;
  remindAt: string;
  /** 알림 내용이 바뀌었는지 비교용 */
  title: string;
}

export interface DesiredReminder {
  identifier: string;
  taskId: string;
  remindAt: string;
  title: string;
  date: DayKey;
}

export interface ReminderPlan {
  toCancel: string[];
  toSchedule: DesiredReminder[];
}

export const reminderId = (taskId: string) => `${ID_PREFIX}${taskId}`;

/** 예약해야 할 알림: 미완료 · 삭제 아님 · 알림 시각이 미래. 가까운 순 MAX_SCHEDULED 개 */
export function desiredReminders(tasks: Task[], now: Date = new Date()): DesiredReminder[] {
  const t0 = now.getTime();
  return tasks
    .filter((t) => !t.done && !t.deletedAt && t.remindAt && Date.parse(t.remindAt) > t0)
    .sort((a, b) => Date.parse(a.remindAt!) - Date.parse(b.remindAt!))
    .slice(0, MAX_SCHEDULED)
    .map((t) => ({ identifier: reminderId(t.id), taskId: t.id, remindAt: t.remindAt!, title: t.title, date: t.date }));
}

/** 지금 기기에 예약된 것과 원하는 것을 비교해 취소·예약 목록을 만듦 (바뀐 것만) */
export function planReminders(tasks: Task[], scheduled: ScheduledInfo[], now: Date = new Date()): ReminderPlan {
  const want = desiredReminders(tasks, now);
  const wantById = new Map(want.map((w) => [w.identifier, w]));
  const haveById = new Map(scheduled.map((s) => [s.identifier, s]));
  const toCancel: string[] = [];
  const toSchedule: DesiredReminder[] = [];
  for (const s of scheduled) {
    const w = wantById.get(s.identifier);
    if (!w || Date.parse(w.remindAt) !== Date.parse(s.remindAt) || w.title !== s.title) toCancel.push(s.identifier);
  }
  for (const w of want) {
    const s = haveById.get(w.identifier);
    if (!s || Date.parse(w.remindAt) !== Date.parse(s.remindAt) || w.title !== s.title) toSchedule.push(w);
  }
  return { toCancel, toSchedule };
}

/**
 * 업무를 다른 날로 미뤘을 때 알림도 같은 간격으로 따라가게(오늘 오후 3시 → 미룬 날 오후 3시).
 * - 날짜만 바뀌고 알림 시각은 그대로일 때만 옮깁니다. 날짜와 알림이 함께 바뀌어 들어온 경우
 *   (다른 기기에서 이미 옮긴 값이 동기화로 온 경우)는 두 번 옮기지 않습니다.
 * - 알림이 업무 날 당일~7일 전 사이에 걸려 있던 경우만 옮깁니다.
 * 반환값이 undefined 면 바꿀 필요 없음.
 */
export function shiftRemindAt(
  prev: Pick<Task, 'date' | 'remindAt'>,
  next: Pick<Task, 'date' | 'remindAt'>,
): string | undefined {
  if (!next.remindAt || prev.date === next.date || prev.remindAt !== next.remindAt) return undefined;
  const r = new Date(next.remindAt);
  const gap = Math.round((parseDayKey(toDayKey(r)).getTime() - parseDayKey(prev.date).getTime()) / 86400000);
  if (gap > 0 || gap < -7) return undefined;
  const diffDays = Math.round((parseDayKey(next.date).getTime() - parseDayKey(prev.date).getTime()) / 86400000);
  const moved = new Date(r.getFullYear(), r.getMonth(), r.getDate() + diffDays, r.getHours(), r.getMinutes(), 0, 0);
  return moved.toISOString();
}
