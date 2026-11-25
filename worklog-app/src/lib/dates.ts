import type { Period } from '../types';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n: number) => String(n).padStart(2, '0');

/** 로컬 날짜 기준 YYYY-MM-DD (toISOString 은 UTC 라 한국 시간 새벽에 하루 밀림) */
export function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** ISO 8601 주: 월요일 시작, 그 주의 목요일이 속한 해가 주의 해 */
export function toWeekKey(d: Date): string {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (t.getDay() + 6) % 7; // 월=0 … 일=6
  t.setDate(t.getDate() - dow + 3); // 그 주 목요일
  const year = t.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const jan4dow = (jan4.getDay() + 6) % 7;
  const week1Thu = new Date(year, 0, 4 - jan4dow + 3);
  const week = 1 + Math.round((t.getTime() - week1Thu.getTime()) / (7 * 86400000));
  return `${year}-W${pad(week)}`;
}

export function keyFor(period: Period, d: Date): string {
  if (period === 'daily') return toDayKey(d);
  if (period === 'weekly') return toWeekKey(d);
  return toMonthKey(d);
}

/** 주의 월요일 */
export function weekStart(d: Date): Date {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  return t;
}

export function shift(period: Period, d: Date, step: number): Date {
  if (period === 'daily') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + step);
  if (period === 'weekly') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * step);
  // 월 이동: 31일 → 2월처럼 넘치지 않도록 1일로 맞춤
  return new Date(d.getFullYear(), d.getMonth() + step, 1);
}

/** 기간에 속한 날짜 키 목록 */
export function daysIn(period: Period, d: Date): string[] {
  if (period === 'daily') return [toDayKey(d)];
  const out: string[] = [];
  if (period === 'weekly') {
    const s = weekStart(d);
    for (let i = 0; i < 7; i++) out.push(toDayKey(new Date(s.getFullYear(), s.getMonth(), s.getDate() + i)));
    return out;
  }
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  for (let i = 1; i <= last; i++) out.push(toDayKey(new Date(d.getFullYear(), d.getMonth(), i)));
  return out;
}

export function fmtDay(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

export function label(period: Period, d: Date): string {
  if (period === 'daily') return fmtDay(d);
  if (period === 'monthly') return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  const s = weekStart(d);
  const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
  const wk = toWeekKey(d).split('-W')[1];
  return `${Number(wk)}주차 · ${s.getMonth() + 1}/${s.getDate()}~${e.getMonth() + 1}/${e.getDate()}`;
}

/** 키 → 그 기간 안의 대표 날짜 */
export function dateFromKey(period: Period, key: string): Date {
  if (period === 'daily') {
    const [y, m, dd] = key.split('-').map(Number);
    return new Date(y, m - 1, dd);
  }
  if (period === 'monthly') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1);
  }
  const [ys, ws] = key.split('-W');
  const y = Number(ys);
  const w = Number(ws);
  const jan4 = new Date(y, 0, 4);
  const mon1 = new Date(y, 0, 4 - ((jan4.getDay() + 6) % 7));
  return new Date(mon1.getFullYear(), mon1.getMonth(), mon1.getDate() + (w - 1) * 7);
}

export function labelFromKey(period: Period, key: string): string {
  return label(period, dateFromKey(period, key));
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
