import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "./categories";
import { isAdjustment, planAdjustments, readCashbookTotals } from "./cashbook";
import type { Offering } from "./types";

// 출납 파일 `기장` 시트와 같은 모양의 작은 격자 (숫자는 가짜)
const D = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d));
const grid: unknown[][] = [
  [],
  [null, "2026년", "예 산", 370000000, "전년이월액", "2026년", "진행", D(1, 4), D(1, 11), "1月 누계"],
  ...Array.from({ length: 14 }, () => []),
  [null, "수입", null, "(헌금예산)", 370000000],
  [null, null, "합", "계", 370000000, null, null, 999, 999, 999],
  [null, null, "일반헌금", "십 일 조", 250000000, null, null, 100000, 50000, 150000],
  [null, "일", null, "주일헌금", 36000000, null, null, 700000, 600000, 1300000],
  [null, null, null, "감사헌금", 51500000, null, null, 30000, "-", 30000],
  [null, "반", "기타헌금", "기    관", 2000000, null, null, 0, 40000, 40000],
  [null, null, null, "맥  추 절", 5500000, null, null, null, null, 0],
  [null, null, "합", "계", 0, null, null, 1, 1, 1],
  [null, "별", null, "꽃 꽂 이", null, null, null, 100000, 0, 100000],
  [null, null, null, "건축헌금", null, null, null, 0, 0, 0],
  [null, "해외선교", null, "수입", null, null, null, 183000, 0, 183000],
  [null, null, null, "수입 - 네팔 헌금", null, null, null, 0, 300000, 300000],
  [null, null, null, "지출", null, null, null, 500000, 0, 500000],
  [null, null, null, "해외선교비", "수입", "지출"],
  [null, null, null, "1월", 788000, 500000],
];

describe("출납 기장 시트 읽기", () => {
  const { totals, unknown } = readCashbookTotals(grid, DEFAULT_CATEGORIES);
  const get = (date: string, line: string) => totals.find((t) => t.date === date && t.line === line)?.amount;
  it("주·줄별 총액 (띄어쓰기·'-'·빈칸 처리, 합계·지출·월 요약 줄은 건너뜀)", () => {
    expect(unknown).toEqual([]);
    expect(get("2026-01-04", "G-TITHE")).toBe(100000);
    expect(get("2026-01-11", "G-SUNDAY")).toBe(600000);
    expect(get("2026-01-04", "G-THANKS")).toBe(30000);
    expect(get("2026-01-11", "G-THANKS")).toBeUndefined();
    expect(get("2026-01-11", "G-DEPT")).toBe(40000);
    expect(get("2026-01-04", "S-FLOWER")).toBe(100000);
    expect(get("2026-01-04", "M-MISSION")).toBe(183000);
    expect(get("2026-01-11", "M-RELIEF")).toBe(300000);
    expect(totals.some((t) => t.amount === 999 || t.amount === 1 || t.amount === 500000 || t.amount === 788000)).toBe(false);
    expect(totals.some((t) => t.date.endsWith("누계"))).toBe(false);
  });
});

describe("명단 없는 총액 보정", () => {
  let n = 0;
  const off = (p: Partial<Offering>): Offering => ({ id: `o${++n}`, updatedAt: 0, createdAt: n, date: "2026-01-04", categoryCode: "G-TITHE", donorText: "홍길동", amount: 60000, method: "cash", ...p });
  const totals = [
    { date: "2026-01-04", line: "G-TITHE", amount: 100000 },
    { date: "2026-01-04", line: "G-SUNDAY", amount: 700000 },
    { date: "2026-01-04", line: "G-THANKS", amount: 30000 },
    { date: "2026-01-11", line: "G-TITHE", amount: 50000 },
  ];
  it("모자란 만큼만 채우고, 감사헌금은 '구분없음' 과목으로", () => {
    const p = planAdjustments(totals, [
      off({ amount: 60000 }),
      off({ categoryCode: "G-THANKS-BEOMSA", amount: 10000 }),
      off({ categoryCode: "G-THANKS-1000", amount: 20000 }),
      off({ date: "2026-01-11", amount: 70000 }), // 장부보다 많음
    ], DEFAULT_CATEGORIES);
    expect(p.adds).toEqual([
      { date: "2026-01-04", categoryCode: "G-TITHE", amount: 40000, importKey: "adj|2026-01-04|G-TITHE" },
      { date: "2026-01-04", categoryCode: "G-SUNDAY", amount: 700000, importKey: "adj|2026-01-04|G-SUNDAY" },
    ]);
    expect(p.matched).toBe(1); // 감사헌금 30000 = 10000 + 20000
    expect(p.over).toEqual([{ date: "2026-01-11", line: "G-TITHE", named: 70000, book: 50000 }]);
  });
  it("다시 계산할 때 예전 보정은 빼고 계산하고, 지울 목록에 올린다", () => {
    const old = off({ id: "adj1", donorText: "", amount: 40000, importKey: "adj|2026-01-04|G-TITHE" });
    expect(isAdjustment(old)).toBe(true);
    const p = planAdjustments(totals.slice(0, 1), [off({ amount: 60000 }), old], DEFAULT_CATEGORIES);
    expect(p.adds[0].amount).toBe(40000);
    expect(p.removeIds).toEqual(["adj1"]);
  });
});

describe("다른 해 장부를 넣어도 올해 것은 그대로", async () => {
  const { planAdjustments, mergeBookTotals } = await import("./cashbook");
  const { DEFAULT_CATEGORIES } = await import("./categories");
  it("2025 장부 반영이 2026 '명단 없는 총액'을 지우지 않음, 기억해 둔 총액도 해별로 합침", () => {
    const adj = (id: string, date: string) => ({ id, updatedAt: 0, createdAt: 0, date, categoryCode: "G-SUNDAY", donorText: "", amount: 1000, method: "cash" as const, importKey: `adj|${date}|G-SUNDAY` });
    const plan = planAdjustments([{ date: "2025-01-05", line: "G-SUNDAY", amount: 500 }], [adj("a25", "2025-01-05"), adj("a26", "2026-01-04")], DEFAULT_CATEGORIES);
    expect(plan.removeIds).toEqual(["a25"]);
    const merged = mergeBookTotals([{ date: "2026-01-04", line: "G-SUNDAY", amount: 1 }, { date: "2025-01-05", line: "G-SUNDAY", amount: 2 }], [{ date: "2025-01-05", line: "G-SUNDAY", amount: 3 }]);
    expect(merged).toEqual([{ date: "2026-01-04", line: "G-SUNDAY", amount: 1 }, { date: "2025-01-05", line: "G-SUNDAY", amount: 3 }]);
  });
});
