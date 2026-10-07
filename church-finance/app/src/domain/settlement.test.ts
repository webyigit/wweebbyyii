import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "./categories";
import { DEFAULT_EXPENSE_ITEMS, DEPARTMENTS } from "./expenseCategories";
import { buildDeptDetail, buildMissionReport, buildSettlement, buildSummary, change, periodOf, rate, shiftYear, type SettleInput } from "./settlement";
import type { Expense, Offering } from "./types";

let n = 0;
const off = (date: string, categoryCode: string, amount: number, deleted = false): Offering => ({ id: `o${n++}`, updatedAt: 0, date, categoryCode, donorText: "홍길동", amount, method: "cash", createdAt: n, deleted });
const exp = (date: string, itemCode: string, amount: number, description = "지출"): Expense => ({ id: `e${n++}`, updatedAt: 0, date, itemCode, amount, description, source: "manual", createdAt: n });
const depts = DEPARTMENTS.map((d) => ({ code: d.code, name: d.name }));

const inp: SettleInput = {
  categories: DEFAULT_CATEGORIES,
  items: DEFAULT_EXPENSE_ITEMS,
  offerings: [
    off("2026-01-04", "G-TITHE", 1_000_000), off("2026-03-01", "G-THANKS-BEOMSA", 200_000), off("2026-03-01", "G-THANKS-1000", 50_000),
    off("2026-08-02", "G-TITHE", 500_000), off("2026-02-01", "G-TITHE", 999, true),
    off("2026-01-04", "S-NEIGHBOR", 30_000), // 특별 → 일반 결산에 안 들어감
    off("2025-01-05", "G-TITHE", 2_000_000), off("2025-07-06", "G-TITHE", 100_000),
    off("2026-01-04", "M-MISSION", 180_000), off("2026-01-11", "M-MISSION", 20_000), off("2026-01-11", "M-MISSION", 5_000), off("2026-02-01", "M-MISSION", 100_000),
  ],
  expenses: [
    exp("2026-03-29", "WORSHIP-1", 255_000, "부활절 계란"), exp("2026-04-05", "WORSHIP-1", 245_000, "전도 물품"),
    exp("2026-07-05", "SERVICE-2", 1_000_000, "주일식사비"), exp("2025-03-01", "WORSHIP-1", 900_000),
    exp("2026-01-25", "X-M-MISSION", 200_000, "가 선교사"), exp("2026-01-25", "X-M-MISSION", 100_000, "나 선교회"),
  ],
  budgets: [
    { year: 2026, code: "G-TITHE", amount: 2_000_000 }, { year: 2026, code: "G-THANKS", amount: 500_000 },
    { year: 2027, code: "G-TITHE", amount: 2_200_000 },
    { year: 2026, code: "WORSHIP-1", amount: 500_000 }, { year: 2026, code: "SERVICE-2", amount: 2_000_000 },
    { year: 2027, code: "WORSHIP-1", amount: 600_000 },
  ],
  openings: [{ year: 2026, key: "M-MISSION", amount: 1_000_000 }, { year: 2026, key: "G", amount: 5 }],
};

describe("기간", () => {
  it("상반기·하반기·1월~기준일, 작년 같은 기간", () => {
    expect(periodOf("h1", 2026, "2026-09-27")).toEqual({ from: "2026-01-01", to: "2026-06-30" });
    expect(periodOf("h2", 2026, "2026-09-27")).toEqual({ from: "2026-07-01", to: "2026-09-27" });
    expect(periodOf("ytd", 2026, "2026-09-27")).toEqual({ from: "2026-01-01", to: "2026-09-27" });
    expect(periodOf("ytd", 2025, "2026-09-27").to).toBe("2025-12-31");
    expect(shiftYear({ from: "2026-01-01", to: "2026-06-30" }, -1)).toEqual({ from: "2025-01-01", to: "2025-06-30" });
    expect(rate(1, 0)).toBeNull();
    expect(change(110, 100)).toBeCloseTo(0.1);
  });
});

describe("결산·예산(안)", () => {
  const s = buildSettlement(2026, periodOf("ytd", 2026, "2026-09-27"), inp, depts);
  it("수입: 줄(감사헌금 3종은 한 줄)별 예산·실적·내년 예산안, 특별·지운 것 제외", () => {
    const tithe = s.income.find((l) => l.code === "G-TITHE")!;
    expect(tithe).toMatchObject({ budget: 2_000_000, actual: 1_500_000, next: 2_200_000 });
    expect(s.income.find((l) => l.code === "G-THANKS")!.actual).toBe(250_000);
    expect(s.incomeTotal).toEqual({ budget: 2_500_000, actual: 1_750_000, next: 2_200_000 });
    expect(s.income.some((l) => l.code === "S-NEIGHBOR")).toBe(false);
  });
  it("지출: 부서 소계 = 항목 합, 작년·선교 지출 제외", () => {
    const w = s.depts.find((d) => d.dept === "WORSHIP")!;
    expect(w).toMatchObject({ budget: 500_000, actual: 500_000, next: 600_000 });
    expect(w.items.find((i) => i.code === "WORSHIP-1")!.actual).toBe(500_000);
    expect(s.expenseTotal).toEqual({ budget: 2_500_000, actual: 1_500_000, next: 600_000 });
    expect(s.depts.every((d) => d.actual === d.items.reduce((a, i) => a + i.actual, 0))).toBe(true);
  });
  it("상반기만 보면 7월 이후는 빠짐", () => {
    const h1 = buildSettlement(2026, periodOf("h1", 2026, "2026-09-27"), inp, depts);
    expect(h1.incomeTotal.actual).toBe(1_250_000);
    expect(h1.expenseTotal.actual).toBe(500_000);
  });
});

describe("제직회 요약", () => {
  it("작년 같은 기간과 비교, 결론 문장", () => {
    const s = buildSummary(2026, periodOf("h1", 2026, "2026-09-27"), inp);
    expect(s).toMatchObject({ income: 1_250_000, expense: 500_000, budgetIncome: 2_500_000, budgetExpense: 2_500_000 });
    expect(s.prev).toEqual({ income: 2_000_000, expense: 900_000, hasData: true });
    expect(s.sentences[0]).toBe("수입은 1년 예산의 50.00%, 지출은 20.00%입니다.");
    expect(s.sentences[1]).toBe("작년 같은 기간보다 수입은 37.50% 줄었고, 지출은 44.44% 줄었습니다.");
    expect(s.sentences[2]).toBe("수입에서 지출을 뺀 금액은 750,000원으로 작년보다 350,000원 적습니다.");
    expect(s.sentences[3]).toBe("수입이 줄어 남는 금액도 줄었습니다. 지출 관리가 필요합니다.");
  });
  it("작년 자료가 없으면 비교 문장 없음", () => {
    const s = buildSummary(2026, periodOf("h1", 2026, "2026-09-27"), { ...inp, offerings: inp.offerings.filter((o) => o.date >= "2026"), expenses: inp.expenses.filter((e) => e.date >= "2026") });
    expect(s.prev.hasData).toBe(false);
    expect(s.sentences.some((x) => x.includes("작년"))).toBe(false);
  });
});

describe("부서별 상세", () => {
  it("항목마다 지출 한 건씩, 남은 예산이 줄어듦", () => {
    const d = buildDeptDetail(2026, periodOf("h1", 2026, "2026-09-27"), inp, depts);
    const easter = d.find((x) => x.dept === "WORSHIP")!.items.find((i) => i.code === "WORSHIP-1")!;
    expect(easter.lines.map((l) => [l.description, l.remaining])).toEqual([["부활절 계란", 245_000], ["전도 물품", 0]]);
    const meal = d.find((x) => x.dept === "SERVICE")!.items.find((i) => i.code === "SERVICE-2")!;
    expect(meal.lines).toHaveLength(0); // 7월 지출은 상반기에 없음
  });
});

describe("해외선교 현황", () => {
  it("이월 + 주일별 헌금 한 줄 + 송금 한 건씩 + 월 합계, 잔액 흐름", () => {
    const m = buildMissionReport(2026, "2026-09-27", inp);
    expect(m).toMatchObject({ opening: 1_000_000, income: 305_000, expense: 300_000, balance: 1_005_000 });
    expect(m.rows.map((r) => [r.kind, r.description, r.balance])).toEqual([
      ["opening", "2025년도 이월금", 1_000_000],
      ["income", "헌금수입", 1_180_000],
      ["income", "헌금수입", 1_205_000],
      ["expense", "가 선교사", 1_005_000],
      ["expense", "나 선교회", 905_000],
      ["month", "1월 합계", 905_000],
      ["income", "헌금수입", 1_005_000],
      ["month", "2월 합계", 1_005_000],
    ]);
    expect(m.rows.find((r) => r.description === "1월 합계")).toMatchObject({ income: 205_000, expense: 300_000 });
  });
});

describe("예산 조정 근거", async () => {
  const { adjustHints } = await import("./settlement");
  it("넘은 항목, 예산 없이 쓴 항목, 이 속도면 넘을 항목", () => {
    const more = { ...inp, expenses: [...inp.expenses, exp("2026-02-01", "FACILITY-8", 300_000), exp("2026-03-01", "WORSHIP-2", 10_000)],
      budgets: [...inp.budgets, { year: 2026, code: "FACILITY-8", amount: 1_000_000 }, { year: 2026, code: "WORSHIP-2", amount: 5_000 }] };
    const s = buildSettlement(2026, periodOf("ytd", 2026, "2026-03-31"), more, depts);
    const h = adjustHints(s);
    expect(h.map((x) => [x.name, x.kind])).toEqual([
      ["어린이주일행사", "over"], // 5천 예산에 1만 씀
      ["부활절행사", "pace"], // 3/31까지 25.5만 → 연말 예상 100만 > 50만 (4월 지출은 기간 밖)
      ["공공요금", "pace"], // 3개월에 30만 → 연 120만 > 100만
    ]);
  });
});

describe("12월 말 예상 결산", async () => {
  const { projectYearEnd } = await import("./settlement");
  it("수입: 작년 남은 기간 × 올해 증가율, 지출: 매달 나가면 월평균, 아니면 작년 남은 기간", () => {
    const monthly = Array.from({ length: 9 }, (_, m) => exp(`2026-${String(m + 1).padStart(2, "0")}-05`, "FINANCE-2", 100_000));
    const p = projectYearEnd(2026, "2026-09-30", {
      ...inp,
      offerings: [off("2026-03-01", "G-TITHE", 1_200), off("2025-03-02", "G-TITHE", 1_000), off("2025-11-16", "G-HARVEST2", 500), off("2025-12-07", "G-TITHE", 100)],
      expenses: [...monthly, exp("2025-11-16", "SERVICE-3", 700), exp("2026-03-01", "SERVICE-3", 0)],
    }, depts);
    expect(p.incomeRatio).toBeCloseTo(1.2);
    expect(p.income.find((l) => l.code === "G-HARVEST2")!.projected).toBe(600); // 추수감사: 올해 0 + 작년 500 × 1.2
    expect(p.income.find((l) => l.code === "G-TITHE")!.projected).toBe(1_320);
    const fin = p.depts.find((d) => d.dept === "FINANCE")!.items.find((i) => i.code === "FINANCE-2")!;
    expect(fin.method).toBe("monthly");
    expect(fin.projected).toBe(1_200_000); // 1~9월 매달 10만 → 10~12월 30만 더해 120만
    const kimjang = p.depts.find((d) => d.dept === "SERVICE")!.items.find((i) => i.code === "SERVICE-3")!;
    expect(kimjang).toMatchObject({ method: "none", projected: 0 }); // 작년 700 이지만 올해 예산이 없으면 0 (남은 예산과 작은 쪽)
    // 매달 조금씩 + 한 달에 큰 일회성(공사) → 매달 항목으로 보지 않음
    const lumpy = [...Array.from({ length: 9 }, (_, m) => exp(`2026-${String(m + 1).padStart(2, "0")}-05`, "FINANCE-7", 10_000)), exp("2026-08-09", "FINANCE-7", 5_000_000)];
    const q = projectYearEnd(2026, "2026-09-30", { ...inp, expenses: [...lumpy, exp("2025-11-02", "FINANCE-7", 30_000)], budgets: [...inp.budgets, { year: 2026, code: "FINANCE-7", amount: 9_000_000 }] }, depts);
    expect(q.depts.find((d) => d.dept === "FINANCE")!.items.find((i) => i.code === "FINANCE-7")).toMatchObject({ method: "lastYear", projected: 5_090_000 + 30_000 });
  });
});
