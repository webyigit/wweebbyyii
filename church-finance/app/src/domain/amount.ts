// 금액 입력 — "50000", "50,000", "5만", "1만5천", "3.5만", "120만", "1억1천만", "2억5천만", "천만", "3천5백" 모두 받는다.

/** 만 아래 한 묶음: "1천5백30", "5천", "천", "3.5", "120" */
function group(s: string): number | null {
  if (!s) return 0;
  const m = s.match(/^(?:(\d+(?:\.\d+)?)?(천))?(?:(\d+(?:\.\d+)?)?(백))?(?:(\d+(?:\.\d+)?)?(십))?(\d+(?:\.\d+)?)?$/);
  if (!m || !m[0]) return null;
  const unit = (digits: string | undefined, mark: string | undefined, k: number) => (mark ? Number(digits ?? 1) * k : 0);
  return unit(m[1], m[2], 1000) + unit(m[3], m[4], 100) + unit(m[5], m[6], 10) + Number(m[7] ?? 0);
}

export function parseAmount(input: string): number | null {
  const s = input.replace(/[\s,원]/g, "");
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(?:(.*?)억)?(?:(.*?)만)?(.*)$/);
  if (!m) return null;
  const [, eokS, manS, restS] = m;
  // "만", "1억만"처럼 단위 앞이 비어 있으면 잘못 누른 것으로 봄 ("천만"은 앞에 '천'이 있어 괜찮음)
  const eok = eokS === undefined ? 0 : eokS === "" ? null : group(eokS);
  const man = manS === undefined ? 0 : manS === "" ? null : group(manS);
  const rest = group(restS);
  if (eok === null || man === null || rest === null) return null;
  const n = eok * 1e8 + man * 1e4 + rest;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
