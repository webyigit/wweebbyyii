// 주일헌금현황 계산 — 엑셀 `MM-DD_주일헌금현황` 한 장과 같은 내용.
// 저장된 헌금 한 건 한 건에서 매번 계산한다 (누계를 옮겨 적지 않음).
// 요약표는 '줄'(예산 단위: 십일조, 감사헌금 …), 명단은 '과목'(범사감사, 기타감사, 일천번제 …) 단위.
import type { Budget, FundCode, IncomeCategory, Offering } from "./types";
import { yearOf } from "./dates";

interface Sums {
  thisWeek: number;
  thisWeekCash: number;
  thisWeekOnline: number;
  beforeThisWeek: number; // 올해 1월 1일 ~ 지난주까지
  total: number; // 올해 누계
}

export interface CategoryDetail extends Sums {
  code: string;
  name: string;
  details: { donorText: string; amount: number; note?: string; method: Offering["method"] }[];
}

export interface SummaryLine extends Sums {
  line: string;
  fund: FundCode;
  group: string;
  name: string;
  budget: number;
  progress: number | null; // total / budget (예산 없으면 null)
  categories: CategoryDetail[];
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
  lines: SummaryLine[];
  funds: Record<FundCode, FundTotal>;
  /** 이번 주 헌금 (일반+특별) — 엑셀 머리말의 '이번주헌금' */
  thisWeekGeneralAndSpecial: number;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const sum = (xs: Offering[]) => xs.reduce((s, o) => s + o.amount, 0);

function sums(all: Offering[], date: string): Sums {
  const week = all.filter((o) => o.date === date);
  const total = sum(all), thisWeek = sum(week);
  return {
    thisWeek,
    thisWeekCash: sum(week.filter((o) => o.method === "cash")),
    thisWeekOnline: sum(week.filter((o) => o.method === "online")),
    beforeThisWeek: total - thisWeek,
    total,
  };
}

export function buildWeeklyReport(
  date: string,
  categories: IncomeCategory[],
  offerings: Offering[],
  budgets: Budget[],
): WeeklyReport {
  const year = yearOf(date);
  const live = offerings.filter((o) => !o.deleted && o.date >= `${year}-01-01` && o.date <= date);
  const budgetOf = new Map(budgets.filter((b) => b.year === year).map((b) => [b.code, b.amount]));

  // 사용 중이거나 올해 기록이 있는 과목만
  const cats = categories
    .filter((c) => c.active || live.some((o) => o.categoryCode === c.code))
    .sort((a, b) => a.sort - b.sort);

  const lines: SummaryLine[] = [];
  for (const c of cats) {
    let line = lines.find((l) => l.line === c.line);
    if (!line) {
      line = {
        line: c.line, fund: c.fund, group: c.group, name: c.lineName,
        budget: budgetOf.get(c.line) ?? 0, progress: null, categories: [],
        thisWeek: 0, thisWeekCash: 0, thisWeekOnline: 0, beforeThisWeek: 0, total: 0,
      };
      lines.push(line);
    }
    const mine = live.filter((o) => o.categoryCode === c.code);
    const s = sums(mine, date);
    line.categories.push({
      code: c.code, name: c.name, ...s,
      details: mine
        .filter((o) => o.date === date)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((o) => ({ donorText: o.donorText, amount: o.amount, note: o.note, method: o.method })),
    });
    for (const k of ["thisWeek", "thisWeekCash", "thisWeekOnline", "beforeThisWeek", "total"] as const) line[k] += s[k];
  }
  for (const l of lines) l.progress = ratio(l.total, l.budget);

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
