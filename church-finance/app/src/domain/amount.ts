// 금액 입력 — "50000", "50,000", "5만", "1만5천", "3.5만", "120만" 모두 받는다.
export function parseAmount(input: string): number | null {
  const s = input.replace(/[\s,원]/g, "");
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(?:(\d+(?:\.\d+)?)억)?(?:(\d+(?:\.\d+)?)만)?(?:(\d+(?:\.\d+)?)천)?(\d+)?$/);
  if (!m || !m[0]) return null;
  const [, eok, man, cheon, rest] = m;
  const n = Number(eok ?? 0) * 1e8 + Number(man ?? 0) * 1e4 + Number(cheon ?? 0) * 1e3 + Number(rest ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
