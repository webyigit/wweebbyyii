// 날짜는 모두 'YYYY-MM-DD' 문자열(현지 날짜)로 다룬다. 시간대 때문에 하루 밀리는 일을 막기 위해 Date 는 정오로 만든다.

export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

/** 그 날짜가 속한 주의 주일(일요일). 일요일이면 그날, 아니면 다가오는 일요일이 아니라 '지난' 일요일. */
export function sundayOf(ymd: string): string {
  const d = fromYmd(ymd);
  d.setDate(d.getDate() - d.getDay());
  return toYmd(d);
}

/** 오늘 기준 입력할 주일: 일요일이면 오늘, 평일이면 지난 주일 */
export function currentSunday(today = new Date()): string {
  return sundayOf(toYmd(today));
}

export function addDays(ymd: string, n: number): string {
  const d = fromYmd(ymd);
  d.setDate(d.getDate() + n);
  return toYmd(d);
}

/** 그 달의 몇째 주 주일인지 (1~5) — 고정지출 규칙에 사용 */
export function weekOfMonth(ymd: string): number {
  return Math.ceil(fromYmd(ymd).getDate() / 7);
}

export function yearOf(ymd: string): number {
  return Number(ymd.slice(0, 4));
}
