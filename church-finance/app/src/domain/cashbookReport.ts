// 출납 보고서 계산 — 엑셀 주간 파일의 `MM-DD` 시트(주간 수입/지출)와 `총` 시트(연 누계).
// 헌금·지출 한 건 한 건과 시작 잔액(전년 이월)만으로 매번 계산한다.
import { yearOf } from "./dates";
import type { Budget, Expense, ExpenseItem, FundCode, IncomeCategory, Offering, OpeningBalance } from "./types";

export interface Flow {
  opening: number; // 이번 기간 시작 잔액 (주간: 지난주 잔액, 연간: 전년 이월)
  income: number;
  expense: number;
  closing: number;
}
const flow = (opening: number, income: number, expense: number): Flow => ({ opening, income, expense, closing: opening + income - expense });

export interface CashbookInput {
  categories: IncomeCategory[];
  items: ExpenseItem[];
  offerings: Offering[];
  expenses: Expense[];
  openings: OpeningBalance[];
  budgets: Budget[];
}

/** 특별·선교 헌금 줄 목록 (잔액을 헌금별로 따로 관리) */
function potLines(categories: IncomeCategory[], fund: FundCode) {
  const seen = new Map<string, string>();
  for (const c of [...categories].sort((a, b) => a.sort - b.sort)) if (c.fund === fund && !seen.has(c.line)) seen.set(c.line, c.lineName);
  return [...seen.entries()].map(([line, name]) => ({ line, name }));
}

function prepare(date: string, inp: CashbookInput) {
  const year = yearOf(date);
  const from = `${year}-01-01`;
  const lineOf = new Map(inp.categories.map((c) => [c.code, c]));
  const itemOf = new Map(inp.items.map((i) => [i.code, i]));
  const offs = inp.offerings.filter((o) => !o.deleted && o.date >= from && o.date <= date);
  const exps = inp.expenses.filter((e) => !e.deleted && e.date >= from && e.date <= date);
  const opening = (key: string) => inp.openings.find((o) => o.year === year && o.key === key)?.amount ?? 0;
  const fundOfOff = (o: Offering) => lineOf.get(o.categoryCode)?.fund;
  const lineOfOff = (o: Offering) => lineOf.get(o.categoryCode)?.line;
  const fundOfExp = (e: Expense) => itemOf.get(e.itemCode)?.fund;
  const potOfExp = (e: Expense) => itemOf.get(e.itemCode)?.incomeLine;
  return { year, offs, exps, opening, fundOfOff, lineOfOff, fundOfExp, potOfExp, itemOf };
}

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

export interface CashbookWeek {
  date: string;
  general: Flow; // 일반 헌금
  special: Flow; // 특별 헌금 합계
  total: Flow;
  specialPots: ({ line: string; name: string } & Flow)[];
  missionPots: ({ line: string; name: string } & Flow)[];
  mission: Flow;
  expenses: { id: string; description: string; amount: number; deptName: string; itemName: string; fund: FundCode; payee?: string }[];
  byDept: { dept: string; name: string; amount: number }[];
  checks: { name: string; ok: boolean; detail: string }[]; // 엑셀의 ✔/❌ 검산을 자동으로
}

/** 주간 수입/지출 (엑셀 `MM-DD` 시트) */
export function buildCashbookWeek(date: string, inp: CashbookInput, deptName: (code: string) => string): CashbookWeek {
  const p = prepare(date, inp);
  const before = (d: string) => d < date;
  const fundFlow = (fund: FundCode, opening: number): Flow => {
    const incBefore = sum(p.offs.filter((o) => p.fundOfOff(o) === fund && before(o.date)), (o) => o.amount);
    const expBefore = sum(p.exps.filter((e) => p.fundOfExp(e) === fund && before(e.date)), (e) => e.amount);
    const inc = sum(p.offs.filter((o) => p.fundOfOff(o) === fund && o.date === date), (o) => o.amount);
    const exp = sum(p.exps.filter((e) => p.fundOfExp(e) === fund && e.date === date), (e) => e.amount);
    return flow(opening + incBefore - expBefore, inc, exp);
  };
  const potFlow = (line: string): Flow => {
    const incBefore = sum(p.offs.filter((o) => p.lineOfOff(o) === line && before(o.date)), (o) => o.amount);
    const expBefore = sum(p.exps.filter((e) => p.potOfExp(e) === line && before(e.date)), (e) => e.amount);
    const inc = sum(p.offs.filter((o) => p.lineOfOff(o) === line && o.date === date), (o) => o.amount);
    const exp = sum(p.exps.filter((e) => p.potOfExp(e) === line && e.date === date), (e) => e.amount);
    return flow(p.opening(line) + incBefore - expBefore, inc, exp);
  };

  const specialPots = potLines(inp.categories, "S").map((l) => ({ ...l, ...potFlow(l.line) }));
  const missionPots = potLines(inp.categories, "M").map((l) => ({ ...l, ...potFlow(l.line) }));
  const specialOpening = sum(specialPots, (x) => x.opening); // 특별 잔액 = 헌금별 잔액의 합
  const general = fundFlow("G", p.opening("G"));
  const special = flow(specialOpening, sum(specialPots, (x) => x.income), sum(specialPots, (x) => x.expense));
  const mission = flow(sum(missionPots, (x) => x.opening), sum(missionPots, (x) => x.income), sum(missionPots, (x) => x.expense));
  const total = flow(general.opening + special.opening, general.income + special.income, general.expense + special.expense);

  const week = p.exps.filter((e) => e.date === date).sort((a, b) => a.createdAt - b.createdAt);
  const expenses = week.map((e) => {
    const it = p.itemOf.get(e.itemCode);
    return { id: e.id, description: e.description, amount: e.amount, deptName: deptName(it?.dept ?? ""), itemName: it?.name ?? e.itemCode, fund: it?.fund ?? "G", payee: e.payee };
  });
  const deptMap = new Map<string, number>();
  for (const e of week) {
    const it = p.itemOf.get(e.itemCode);
    if (it?.fund === "G") deptMap.set(it.dept, (deptMap.get(it.dept) ?? 0) + e.amount);
  }
  const byDept = [...deptMap.entries()].map(([dept, amount]) => ({ dept, name: deptName(dept), amount }));

  // 엑셀에서 손으로 만들던 검산들 — 원본이 하나라 항상 맞아야 정상. 안 맞으면 과목 설정이 빠진 것.
  const orphanExp = week.filter((e) => !p.itemOf.get(e.itemCode));
  const specialFromPots = sum(specialPots, (x) => x.closing);
  const checks = [
    { name: "지출 상세 합계 = 일반+특별 지출", ok: sum(expenses.filter((e) => e.fund !== "M"), (e) => e.amount) === general.expense + special.expense, detail: `${sum(expenses.filter((e) => e.fund !== "M"), (e) => e.amount)} / ${general.expense + special.expense}` },
    { name: "특별헌금별 잔액 합 = 특별 잔액", ok: specialFromPots === special.closing, detail: `${specialFromPots} / ${special.closing}` },
    { name: "모든 지출에 과목이 있음", ok: orphanExp.length === 0, detail: orphanExp.map((e) => e.description).join(", ") },
  ];

  return { date, general, special, total, specialPots, missionPots, mission, expenses, byDept, checks };
}

export interface CashbookYear {
  date: string;
  general: Flow & { budget: number }; // opening=전년이월, income=올해 헌금, expense=올해 지출
  special: Flow;
  specialPots: ({ line: string; name: string } & Flow)[];
  missionPots: ({ line: string; name: string } & Flow)[];
  incomeLines: { line: string; name: string; group: string; budget: number; actual: number }[];
  depts: { dept: string; name: string; budget: number; spent: number }[];
}

/** 연 누계 (엑셀 `총` 시트) */
export function buildCashbookYear(date: string, inp: CashbookInput, deptName: (code: string) => string, deptOrder: string[]): CashbookYear {
  const p = prepare(date, inp);
  const budgetOf = (code: string) => inp.budgets.find((b) => b.year === p.year && b.code === code)?.amount ?? 0;
  const potFlow = (line: string) =>
    flow(p.opening(line), sum(p.offs.filter((o) => p.lineOfOff(o) === line), (o) => o.amount), sum(p.exps.filter((e) => p.potOfExp(e) === line), (e) => e.amount));

  const gLines = potLines(inp.categories, "G");
  const incomeLines = gLines.map((l) => ({
    line: l.line, name: l.name,
    group: inp.categories.find((c) => c.line === l.line)?.group ?? "",
    budget: budgetOf(l.line),
    actual: sum(p.offs.filter((o) => p.lineOfOff(o) === l.line), (o) => o.amount),
  }));
  const gIncome = sum(p.offs.filter((o) => p.fundOfOff(o) === "G"), (o) => o.amount);
  const gExpense = sum(p.exps.filter((e) => p.fundOfExp(e) === "G"), (e) => e.amount);
  const general = { ...flow(p.opening("G"), gIncome, gExpense), budget: sum(incomeLines, (l) => l.budget) };

  const specialPots = potLines(inp.categories, "S").map((l) => ({ ...l, ...potFlow(l.line) }));
  const missionPots = potLines(inp.categories, "M").map((l) => ({ ...l, ...potFlow(l.line) }));
  const special = flow(sum(specialPots, (x) => x.opening), sum(specialPots, (x) => x.income), sum(specialPots, (x) => x.expense));

  const depts = deptOrder.map((dept) => {
    const its = inp.items.filter((i) => i.dept === dept && i.fund === "G");
    const codes = new Set(its.map((i) => i.code));
    return {
      dept, name: deptName(dept),
      budget: sum(its, (i) => budgetOf(i.code)),
      spent: sum(p.exps.filter((e) => codes.has(e.itemCode)), (e) => e.amount),
    };
  });

  return { date, general, special, specialPots, missionPots, incomeLines, depts };
}
