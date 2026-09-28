// 예결산·제직회 보고 계산 — 엑셀 주간 파일의 `결산예산`, `제직회`, `제직회_요약`, `재직회_상세`, `재직_해외선교보고` 시트.
// 모두 헌금·지출 한 건 한 건과 예산·이월에서 매번 계산한다 (따로 적어 두는 누계 없음).
import type { Budget, Expense, ExpenseItem, IncomeCategory, Offering, OpeningBalance } from "./types";

export interface SettleInput {
  categories: IncomeCategory[];
  items: ExpenseItem[];
  offerings: Offering[];
  expenses: Expense[];
  budgets: Budget[];
  openings: OpeningBalance[];
}

export interface Period { from: string; to: string }
export const PERIODS = [
  { key: "ytd", label: "1월~기준일" },
  { key: "h1", label: "상반기 (1~6월)" },
  { key: "h2", label: "하반기 (7~12월)" },
  { key: "year", label: "1년" },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];

export function periodOf(key: PeriodKey, year: number, until: string): Period {
  const y = String(year);
  const clampTo = (to: string) => (until < to && until.startsWith(y) ? until : to);
  switch (key) {
    case "h1": return { from: `${y}-01-01`, to: clampTo(`${y}-06-30`) };
    case "h2": return { from: `${y}-07-01`, to: clampTo(`${y}-12-31`) };
    case "year": return { from: `${y}-01-01`, to: `${y}-12-31` };
    default: return { from: `${y}-01-01`, to: until.startsWith(y) ? until : `${y}-12-31` };
  }
}

/** 작년 같은 기간 */
export const shiftYear = (p: Period, n: number): Period => ({
  from: `${Number(p.from.slice(0, 4)) + n}${p.from.slice(4)}`,
  to: `${Number(p.to.slice(0, 4)) + n}${p.to.slice(4)}`,
});

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const within = (d: string, p: Period) => d >= p.from && d <= p.to;
export const rate = (a: number, b: number) => (b ? a / b : null); // 달성률·집행률
export const change = (next: number, prev: number) => (prev ? (next - prev) / prev : null); // 증감률

function ctx(inp: SettleInput) {
  const cat = new Map(inp.categories.map((c) => [c.code, c]));
  const item = new Map(inp.items.map((i) => [i.code, i]));
  const offs = inp.offerings.filter((o) => !o.deleted);
  const exps = inp.expenses.filter((e) => !e.deleted);
  const budget = (year: number, code: string) => inp.budgets.find((b) => b.year === year && b.code === code)?.amount ?? 0;
  return { cat, item, offs, exps, budget };
}

/** 일반회계 수입 줄 (예산표 한 줄 = 감사헌금 3종은 한 줄) */
function incomeLinesOf(categories: IncomeCategory[]) {
  const seen = new Map<string, { line: string; name: string; group: string }>();
  for (const c of [...categories].sort((a, b) => a.sort - b.sort)) if (c.fund === "G" && !seen.has(c.line)) seen.set(c.line, { line: c.line, name: c.lineName, group: c.group });
  return [...seen.values()];
}

// ── 결산·예산(안) / 제직회 지출 현황 ─────────────────────

export interface SettleLine { code: string; name: string; group?: string; budget: number; actual: number; next: number }
export interface SettleDept { dept: string; name: string; budget: number; actual: number; next: number; items: SettleLine[] }
export interface Settlement {
  year: number;
  period: Period;
  income: SettleLine[];
  incomeTotal: { budget: number; actual: number; next: number };
  depts: SettleDept[];
  expenseTotal: { budget: number; actual: number; next: number };
}

/**
 * 올해 예산 대비 실적 + 내년 예산(안).
 * 내년 예산(안)은 예산 표의 (올해+1)년 값 — 여기서 넣으면 1월에 그대로 새해 예산이 된다.
 */
export function buildSettlement(year: number, period: Period, inp: SettleInput, depts: { code: string; name: string }[]): Settlement {
  const c = ctx(inp);
  const offs = c.offs.filter((o) => within(o.date, period));
  const exps = c.exps.filter((e) => within(e.date, period));
  const income = incomeLinesOf(inp.categories).map((l) => ({
    code: l.line, name: l.name, group: l.group,
    budget: c.budget(year, l.line), next: c.budget(year + 1, l.line),
    actual: sum(offs.filter((o) => c.cat.get(o.categoryCode)?.line === l.line), (o) => o.amount),
  }));
  const gItems = [...inp.items].filter((i) => i.fund === "G").sort((a, b) => a.sort - b.sort);
  const spentOf = new Map<string, number>();
  for (const e of exps) spentOf.set(e.itemCode, (spentOf.get(e.itemCode) ?? 0) + e.amount);
  const deptList = depts.map((d) => {
    const items = gItems.filter((i) => i.dept === d.code).map((i) => ({
      code: i.code, name: i.name, budget: c.budget(year, i.code), next: c.budget(year + 1, i.code), actual: spentOf.get(i.code) ?? 0,
    }));
    return { dept: d.code, name: d.name, items, budget: sum(items, (i) => i.budget), actual: sum(items, (i) => i.actual), next: sum(items, (i) => i.next) };
  }).filter((d) => d.items.length);
  const tot = <T extends { budget: number; actual: number; next: number }>(xs: T[]) => ({ budget: sum(xs, (x) => x.budget), actual: sum(xs, (x) => x.actual), next: sum(xs, (x) => x.next) });
  return { year, period, income, incomeTotal: tot(income), depts: deptList, expenseTotal: tot(deptList) };
}

// ── 제직회 요약 ─────────────────────────────────────────

export interface Summary {
  period: Period;
  income: number; expense: number;
  budgetIncome: number; budgetExpense: number; // 올해 1년 예산
  prev: { income: number; expense: number; hasData: boolean };
  sentences: string[]; // 결론 문장
}

export function buildSummary(year: number, period: Period, inp: SettleInput): Summary {
  const c = ctx(inp);
  const gOff = (p: Period) => sum(c.offs.filter((o) => within(o.date, p) && c.cat.get(o.categoryCode)?.fund === "G"), (o) => o.amount);
  const gExp = (p: Period) => sum(c.exps.filter((e) => within(e.date, p) && c.item.get(e.itemCode)?.fund === "G"), (e) => e.amount);
  const prevP = shiftYear(period, -1);
  const hasPrev = c.offs.some((o) => within(o.date, prevP)) || c.exps.some((e) => within(e.date, prevP));
  const income = gOff(period), expense = gExp(period);
  const prev = { income: gOff(prevP), expense: gExp(prevP), hasData: hasPrev };
  const budgetIncome = sum(incomeLinesOf(inp.categories), (l) => c.budget(year, l.line));
  const budgetExpense = sum(inp.items.filter((i) => i.fund === "G"), (i) => c.budget(year, i.code));

  const sentences: string[] = [];
  const pctTxt = (r: number | null) => (r === null ? "-" : `${(r * 100).toFixed(2)}%`);
  if (budgetIncome) sentences.push(`수입은 1년 예산의 ${pctTxt(rate(income, budgetIncome))}, 지출은 ${pctTxt(rate(expense, budgetExpense || budgetIncome))}입니다.`);
  if (prev.hasData) {
    const ci = change(income, prev.income), ce = change(expense, prev.expense);
    const moved = (r: number | null) => (r === null ? "비교할 수 없" : r < 0 ? `${pctTxt(-r)} 줄었` : `${pctTxt(r)} 늘었`);
    sentences.push(`작년 같은 기간보다 수입은 ${moved(ci)}고, 지출은 ${moved(ce)}습니다.`);
    const net = income - expense, prevNet = prev.income - prev.expense, d = net - prevNet;
    sentences.push(`수입에서 지출을 뺀 금액은 ${net.toLocaleString("ko-KR")}원으로 작년보다 ${Math.abs(d).toLocaleString("ko-KR")}원 ${d >= 0 ? "많습니다" : "적습니다"}.`);
    // 결론은 '남는 금액(수입−지출)'이 늘었는지로 판단 (비율만 보면 거꾸로 말할 수 있음)
    const down = ci !== null && ci < 0;
    if (down && d >= 0) sentences.push("수입은 줄었지만 지출을 더 많이 아껴 남는 금액은 오히려 늘었습니다.");
    else if (down) sentences.push("수입이 줄어 남는 금액도 줄었습니다. 지출 관리가 필요합니다.");
    else if (d >= 0) sentences.push("수입이 늘고 남는 금액도 늘어 재정이 안정적입니다.");
    else sentences.push("수입은 늘었지만 지출이 더 많이 늘어 남는 금액이 줄었습니다. 지출 관리가 필요합니다.");
  }
  sentences.push(income >= expense ? `이 기간 수입이 지출보다 ${(income - expense).toLocaleString("ko-KR")}원 많습니다.` : `이 기간 지출이 수입보다 ${(expense - income).toLocaleString("ko-KR")}원 많습니다.`);
  return { period, income, expense, budgetIncome, budgetExpense, prev, sentences };
}

// ── 부서별 상세 (재직회_상세) ───────────────────────────

export interface DetailItem {
  code: string; name: string; budget: number; spent: number;
  lines: { date: string; description: string; amount: number; remaining: number; payee?: string }[];
}
export interface DetailDept { dept: string; name: string; budget: number; spent: number; items: DetailItem[] }

/** 항목마다 지출 한 건씩, 남은 예산이 줄어드는 흐름 (1월 1일부터 누적) */
export function buildDeptDetail(year: number, period: Period, inp: SettleInput, depts: { code: string; name: string }[]): DetailDept[] {
  const c = ctx(inp);
  const exps = c.exps.filter((e) => e.date >= `${year}-01-01` && e.date <= period.to).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const gItems = [...inp.items].filter((i) => i.fund === "G").sort((a, b) => a.sort - b.sort);
  return depts.map((d) => {
    const items = gItems.filter((i) => i.dept === d.code).map((i) => {
      const budget = c.budget(year, i.code);
      let left = budget;
      const lines = exps.filter((e) => e.itemCode === i.code).map((e) => {
        left -= e.amount;
        return { date: e.date, description: e.description, amount: e.amount, remaining: left, payee: e.payee };
      });
      return { code: i.code, name: i.name, budget, spent: sum(lines, (l) => l.amount), lines: lines.filter((l) => l.date >= period.from) };
    });
    return { dept: d.code, name: d.name, budget: sum(items, (i) => i.budget), spent: sum(items, (i) => i.spent), items };
  }).filter((d) => d.items.length);
}

// ── 해외선교 현황 ───────────────────────────────────────

export interface MissionRow { kind: "opening" | "income" | "expense" | "month"; date: string; description: string; income: number; expense: number; balance: number }
export interface MissionReport { opening: number; income: number; expense: number; balance: number; rows: MissionRow[] }

/** 해외선교(M) 회계: 주일마다 헌금 합계 한 줄, 송금은 한 건씩, 달마다 합계 줄 */
export function buildMissionReport(year: number, until: string, inp: SettleInput): MissionReport {
  const c = ctx(inp);
  const from = `${year}-01-01`;
  const lines = new Set(inp.categories.filter((x) => x.fund === "M").map((x) => x.line));
  const opening = sum(inp.openings.filter((o) => o.year === year && lines.has(o.key)), (o) => o.amount);
  const incomeBy = new Map<string, number>();
  for (const o of c.offs) if (o.date >= from && o.date <= until && c.cat.get(o.categoryCode)?.fund === "M") incomeBy.set(o.date, (incomeBy.get(o.date) ?? 0) + o.amount);
  const outs = c.exps.filter((e) => e.date >= from && e.date <= until && c.item.get(e.itemCode)?.fund === "M").sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  type Ev = { date: string; description: string; income: number; expense: number; order: number };
  const evs: Ev[] = [
    ...[...incomeBy.entries()].map(([date, amount]) => ({ date, description: "헌금수입", income: amount, expense: 0, order: 0 })),
    ...outs.map((e, i) => ({ date: e.date, description: e.description, income: 0, expense: e.amount, order: 1 + i })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  const rows: MissionRow[] = [{ kind: "opening", date: from, description: `${year - 1}년도 이월금`, income: opening, expense: 0, balance: opening }];
  let bal = opening, mIn = 0, mOut = 0;
  for (const [i, e] of evs.entries()) {
    bal += e.income - e.expense; mIn += e.income; mOut += e.expense;
    rows.push({ kind: e.income ? "income" : "expense", date: e.date, description: e.description, income: e.income, expense: e.expense, balance: bal });
    const next = evs[i + 1];
    if (!next || next.date.slice(0, 7) !== e.date.slice(0, 7)) {
      rows.push({ kind: "month", date: e.date, description: `${Number(e.date.slice(5, 7))}월 합계`, income: mIn, expense: mOut, balance: bal });
      mIn = 0; mOut = 0;
    }
  }
  const income = sum(evs, (e) => e.income), expense = sum(evs, (e) => e.expense);
  return { opening, income, expense, balance: opening + income - expense, rows };
}

// ── 예산 조정 근거 ──────────────────────────────────────

export interface AdjustHint { dept: string; code: string; name: string; budget: number; actual: number; projected: number; kind: "over" | "pace" | "noBudget" }

/**
 * 내년 예산(안)을 짤 때 볼 항목: 이미 예산을 넘은 것 / 지금 속도면 연말에 넘을 것 / 예산 없이 쓴 것.
 * 연말 예상 = 지금까지 지출 ÷ 지난 날 비율 (1월 1일~기준일)
 */
export function adjustHints(s: Settlement): AdjustHint[] {
  const start = Date.UTC(s.year, 0, 1), end = Date.UTC(s.year + 1, 0, 1);
  const [y, m, d] = s.period.to.split("-").map(Number);
  const elapsed = Math.min(1, Math.max(1 / 365, (Date.UTC(y, m - 1, d) + 86400000 - start) / (end - start)));
  const out: AdjustHint[] = [];
  for (const dept of s.depts) for (const i of dept.items) {
    if (!i.actual) continue;
    const projected = Math.round(i.actual / elapsed);
    const kind = !i.budget ? "noBudget" : i.actual > i.budget ? "over" : projected > i.budget * 1.1 ? "pace" : null;
    if (kind) out.push({ dept: dept.name, code: i.code, name: i.name, budget: i.budget, actual: i.actual, projected, kind });
  }
  const order = { over: 0, noBudget: 1, pace: 2 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || (b.actual - b.budget) - (a.actual - a.budget));
}
