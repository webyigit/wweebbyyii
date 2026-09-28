import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "./categories";
import { buildCashbookWeek, buildCashbookYear } from "./cashbookReport";
import { DEFAULT_EXPENSE_ITEMS, DEPARTMENTS, DEPT_NAME, findExpenseItem } from "./expenseCategories";
import type { Expense, Offering } from "./types";

let n = 0;
const off = (date: string, categoryCode: string, amount: number): Offering => ({ id: `o${++n}`, updatedAt: 0, createdAt: n, date, categoryCode, donorText: "", amount, method: "cash" });
const exp = (date: string, itemCode: string, amount: number, description = "지출"): Expense => ({ id: `e${++n}`, updatedAt: 0, createdAt: n, date, itemCode, amount, description, source: "manual" });

const inp = {
  categories: DEFAULT_CATEGORIES,
  items: DEFAULT_EXPENSE_ITEMS,
  openings: [
    { year: 2026, key: "G", amount: -1000 },
    { year: 2026, key: "S-NEIGHBOR", amount: 5000 },
    { year: 2026, key: "M-MISSION", amount: 10000 },
  ],
  budgets: [{ year: 2026, code: "G-TITHE", amount: 100000 }, { year: 2026, code: "WORSHIP-1", amount: 3000 }],
  offerings: [
    off("2025-12-28", "G-TITHE", 99999), // 작년
    off("2026-09-20", "G-TITHE", 20000), off("2026-09-20", "S-NEIGHBOR", 1000),
    off("2026-09-27", "G-TITHE", 30000), off("2026-09-27", "G-SUNDAY", 5000),
    off("2026-09-27", "S-NEIGHBOR", 2000), off("2026-09-27", "M-MISSION", 700),
    off("2026-10-04", "G-TITHE", 1), // 다음 주
  ],
  expenses: [
    exp("2026-09-20", "WORSHIP-1", 4000),
    exp("2026-09-27", "FACILITY-8", 1500, "공공요금"),
    exp("2026-09-27", "X-S-NEIGHBOR", 1000, "노숙자 지원"),
    exp("2026-09-27", "X-M-MISSION", 300, "선교사 송금"),
  ],
};
const dn = (c: string) => DEPT_NAME[c] ?? c;

describe("주간 수입/지출 (MM-DD 시트)", () => {
  const w = buildCashbookWeek("2026-09-27", inp, dn);
  it("일반: 지난주 잔액 + 수입 − 지출 = 잔액", () => {
    expect(w.general).toEqual({ opening: 15000, income: 35000, expense: 1500, closing: 48500 });
    expect(w.general.closing).toBe(w.general.opening + 35000 - 1500);
  });
  it("특별: 헌금별 잔액과 합계", () => {
    const nb = w.specialPots.find((x) => x.line === "S-NEIGHBOR")!;
    expect(nb).toMatchObject({ opening: 6000, income: 2000, expense: 1000, closing: 7000 });
    expect(w.special.closing).toBe(7000);
  });
  it("해외선교는 일반·특별 합계와 따로", () => {
    expect(w.missionPots.find((x) => x.line === "M-MISSION")).toMatchObject({ opening: 10000, income: 700, expense: 300, closing: 10400 });
    expect(w.total.expense).toBe(2500);
  });
  it("지출 상세와 부서별 합계, 검산 통과", () => {
    expect(w.expenses.map((e) => [e.description, e.deptName, e.itemName])).toEqual([
      ["공공요금", "관리부", "공공요금"], ["노숙자 지원", "특별헌금", "이웃사랑헌금에서"], ["선교사 송금", "해외선교", "해외선교헌금에서 (선교사 송금 등)"],
    ]);
    expect(w.byDept).toEqual([{ dept: "FACILITY", name: "관리부", amount: 1500 }]);
    expect(w.checks.every((c) => c.ok)).toBe(true);
  });
});

describe("연 누계 (총 시트)", () => {
  const y = buildCashbookYear("2026-09-27", inp, dn, DEPARTMENTS.map((d) => d.code));
  it("전년이월 + 올해 헌금 − 지출 = 잔액, 예산 대비", () => {
    expect(y.general).toMatchObject({ opening: -1000, income: 55000, expense: 5500, closing: 48500, budget: 100000 });
    expect(y.incomeLines.find((l) => l.line === "G-TITHE")).toMatchObject({ budget: 100000, actual: 50000 });
    expect(y.depts.find((d) => d.dept === "WORSHIP")).toMatchObject({ budget: 3000, spent: 4000 });
    expect(y.specialPots.find((x) => x.line === "S-NEIGHBOR")).toMatchObject({ opening: 5000, income: 3000, expense: 1000, closing: 7000 });
  });
});

describe("엑셀 항목 이름 찾기", () => {
  it("부서 시트 이름 + 항목 이름 (띄어쓰기·쉼표 차이)", () => {
    expect(findExpenseItem("교회학교", "유치부전도사 사례비")?.code).toBe("SCHOOL-1");
    expect(findExpenseItem("장년교육부", "구역장,권찰수련회")?.code).toBe("ADULT-EDU-5");
    expect(findExpenseItem("차량관리", "차량정비,검사료")?.code).toBe("VEHICLE-2");
    expect(findExpenseItem("관리부", "공공요금")?.code).toBe("FACILITY-8");
    expect(findExpenseItem("재정부", "총회연금지원")?.code).toBe("FINANCE-4");
  });
});
