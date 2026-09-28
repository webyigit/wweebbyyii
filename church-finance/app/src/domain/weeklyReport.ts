// 주일헌금현황 계산 — 엑셀 `MM-DD_주일헌금현황` 한 장과 같은 내용.
// 저장된 헌금 한 건 한 건에서 매번 계산한다 (누계를 옮겨 적지 않음).
import type { Budget, FundCode, IncomeCategory, Offering } from "./types";
import { yearOf } from "./dates";

export interface CategoryLine {
  code: string;
  fund: FundCode;
  group: string;
  name: string;
  budget: number;
  thisWeek: number;
  thisWeekCash: number;
  thisWeekOnline: number;
  beforeThisWeek: number; // 올해 1월 1일 ~ 지난주까지
  total: number; // 올해 누계
  progress: number | null; // total / budget (예산 없으면 null)
  details: { donorText: string; amount: number; note?: string; method: Offering["method"] }[];
}

export interface FundTotal {
  fund: FundCode;
  budget: number;
  thisWeek: number;
  beforeThisWeek: number;
  total: number;
  progress: number | null;
}

export interface WeeklyReport {
  date: string;
  lines: CategoryLine[];
  funds: Record<FundCode, FundTotal>;
  /** 이번 주 헌금 (일반+특별) — 엑셀 머리말의 '이번주헌금' */
  thisWeekGeneralAndSpecial: number;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export function buildWeeklyReport(
  date: string,
  categories: IncomeCategory[],
  offerings: Offering[],
  budgets: Budget[],
): WeeklyReport {
  const year = yearOf(date);
  const yearStart = `${year}-01-01`;
  const live = offerings.filter((o) => !o.deleted && o.date >= yearStart && o.date <= date);
  const budgetOf = new Map(budgets.filter((b) => b.year === year).map((b) => [b.code, b.amount]));

  const cats = categories.filter((c) => c.active || live.some((o) => o.categoryCode === c.code));
  cats.sort((a, b) => a.sort - b.sort);

  const lines: CategoryLine[] = cats.map((c) => {
    const mine = live.filter((o) => o.categoryCode === c.code);
    const week = mine.filter((o) => o.date === date).sort((a, b) => a.createdAt - b.createdAt);
    const sum = (xs: Offering[]) => xs.reduce((s, o) => s + o.amount, 0);
    const thisWeek = sum(week);
    const total = sum(mine);
    const budget = budgetOf.get(c.code) ?? 0;
    return {
      code: c.code, fund: c.fund, group: c.group, name: c.name, budget,
      thisWeek,
      thisWeekCash: sum(week.filter((o) => o.method === "cash")),
      thisWeekOnline: sum(week.filter((o) => o.method === "online")),
      beforeThisWeek: total - thisWeek,
      total,
      progress: ratio(total, budget),
      details: week.map((o) => ({ donorText: o.donorText, amount: o.amount, note: o.note, method: o.method })),
    };
  });

  const funds = {} as Record<FundCode, FundTotal>;
  for (const f of ["G", "S", "M"] as FundCode[]) {
    const ls = lines.filter((l) => l.fund === f);
    const add = (k: "budget" | "thisWeek" | "beforeThisWeek" | "total") => ls.reduce((s, l) => s + l[k], 0);
    const budget = add("budget"), total = add("total");
    funds[f] = { fund: f, budget, thisWeek: add("thisWeek"), beforeThisWeek: add("beforeThisWeek"), total, progress: ratio(total, budget) };
  }

  return { date, lines, funds, thisWeekGeneralAndSpecial: funds.G.thisWeek + funds.S.thisWeek };
}

export const won = (n: number) => (n === 0 ? "-" : n.toLocaleString("ko-KR"));
export const pct = (r: number | null) => (r === null ? "-" : (r * 100).toFixed(2));
