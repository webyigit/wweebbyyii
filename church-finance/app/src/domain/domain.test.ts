import { describe, expect, it } from "vitest";
import { parseAmount } from "./amount";
import { DEFAULT_CATEGORIES } from "./categories";
import { currentSunday, sundayOf, weekOfMonth } from "./dates";
import { chosung, previousRoster, searchDonors } from "./donors";
import type { Household, Member, Offering } from "./types";
import { buildWeeklyReport } from "./weeklyReport";

// 테스트 데이터는 가짜 이름만 사용 (CLAUDE.md)
let seq = 0;
const off = (p: Partial<Offering>): Offering => ({
  id: `o${++seq}`, updatedAt: 0, createdAt: seq, date: "2026-09-27", categoryCode: "G-TITHE",
  donorText: "홍길동,김영희", amount: 100000, method: "cash", ...p,
});

describe("dates", () => {
  it("평일은 지난 주일로, 주일은 그날로", () => {
    expect(sundayOf("2026-09-27")).toBe("2026-09-27");
    expect(sundayOf("2026-09-30")).toBe("2026-09-27");
    expect(currentSunday(new Date(2026, 9, 3, 9))).toBe("2026-09-27");
  });
  it("몇째 주", () => {
    expect(weekOfMonth("2026-09-06")).toBe(1);
    expect(weekOfMonth("2026-09-27")).toBe(4);
  });
});

describe("주일헌금현황", () => {
  const offerings = [
    off({ date: "2025-12-28", amount: 999 }), // 작년 — 누계에서 빠져야 함
    off({ date: "2026-09-20", amount: 300000 }),
    off({ date: "2026-09-27", amount: 200000, method: "cash" }),
    off({ date: "2026-09-27", amount: 50000, method: "online", donorText: "이몽룡" }),
    off({ date: "2026-09-27", categoryCode: "G-SUNDAY", donorText: "", amount: 695000 }),
    off({ date: "2026-09-27", categoryCode: "S-NEIGHBOR", amount: 10000 }),
    off({ date: "2026-09-27", categoryCode: "M-MISSION", amount: 7000 }),
    off({ date: "2026-10-04", amount: 123 }), // 다음 주 — 빠져야 함
    off({ date: "2026-09-27", amount: 77777, deleted: true }), // 지운 것 — 빠져야 함
  ];
  const r = buildWeeklyReport("2026-09-27", DEFAULT_CATEGORIES, offerings, [
    { year: 2026, code: "G-TITHE", amount: 1_000_000 },
    { year: 2026, code: "G-SUNDAY", amount: 1_000_000 },
  ]);
  const tithe = r.lines.find((l) => l.line === "G-TITHE")!;

  it("이번 주 / 지난주까지 / 누계 / 진도율", () => {
    expect(tithe.thisWeek).toBe(250000);
    expect(tithe.beforeThisWeek).toBe(300000);
    expect(tithe.total).toBe(550000);
    expect(tithe.progress).toBeCloseTo(0.55);
  });
  it("현금·온라인 구분", () => {
    expect(tithe.thisWeekCash).toBe(200000);
    expect(tithe.thisWeekOnline).toBe(50000);
  });
  it("명세는 입력 순서대로", () => {
    expect(tithe.categories[0].details.map((d) => d.donorText)).toEqual(["홍길동,김영희", "이몽룡"]);
  });
  it("회계별 합계, 이번주헌금(일반+특별)은 해외선교 제외", () => {
    expect(r.funds.G.thisWeek).toBe(945000);
    expect(r.funds.G.budget).toBe(2_000_000);
    expect(r.funds.S.thisWeek).toBe(10000);
    expect(r.funds.M.thisWeek).toBe(7000);
    expect(r.thisWeekGeneralAndSpecial).toBe(955000);
  });
  it("예산 없는 과목은 진도율 없음", () => {
    expect(r.lines.find((l) => l.line === "S-NEIGHBOR")!.progress).toBeNull();
  });
  it("감사헌금은 예산 한 줄, 명단은 범사·기타·일천번제 따로", () => {
    const r2 = buildWeeklyReport("2026-09-27", DEFAULT_CATEGORIES, [
      off({ categoryCode: "G-THANKS-BEOMSA", amount: 10000 }),
      off({ categoryCode: "G-THANKS-1000", amount: 5000 }),
      off({ categoryCode: "G-THANKS-GEN", date: "2026-02-01", amount: 3000 }), // 구분 없는 예전 기록
    ], [{ year: 2026, code: "G-THANKS", amount: 100000 }]);
    const thanks = r2.lines.filter((l) => l.name === "감사헌금");
    expect(thanks).toHaveLength(1);
    expect(thanks[0].thisWeek).toBe(15000);
    expect(thanks[0].total).toBe(18000);
    expect(thanks[0].progress).toBeCloseTo(0.18);
    expect(thanks[0].categories.map((c) => c.name)).toEqual(["범사감사", "기타감사", "일천번제", "감사헌금(구분없음)"]);
  });
  it("쓰지 않는 예전 과목은 올해 기록이 없으면 안 나온다", () => {
    expect(r.lines.find((l) => l.line === "G-THANKS")!.categories.map((c) => c.code)).not.toContain("G-THANKS-GEN");
  });
});

describe("헌금자 찾기", () => {
  const hs: Household[] = [
    { id: "h1", updatedAt: 0, name: "홍길동 가정" },
    { id: "h2", updatedAt: 0, name: "김철수 가정" },
    { id: "h3", updatedAt: 0, name: "김철수 가정" },
  ];
  const ms: Member[] = [
    { id: "m1", updatedAt: 0, householdId: "h1", name: "홍길동" },
    { id: "m2", updatedAt: 0, householdId: "h1", name: "김영희" },
    { id: "m3", updatedAt: 0, householdId: "h2", name: "김철수", tag: "A" },
    { id: "m4", updatedAt: 0, householdId: "h3", name: "김철수", tag: "B" },
  ];
  it("초성으로 찾는다", () => {
    expect(chosung("홍길동")).toBe("ㅎㄱㄷ");
    expect(searchDonors("ㅎㄱㄷ", hs, ms, [], [])[0].householdId).toBe("h1");
  });
  it("아내 이름으로도 그 가정이 나온다", () => {
    expect(searchDonors("김영", hs, ms, [], [])[0].householdId).toBe("h1");
  });
  it("동명이인은 꼬리표로 구분된다", () => {
    const hits = searchDonors("김철수", hs, ms, [], []);
    expect(hits.map((h) => h.label).sort()).toEqual(["김철수A", "김철수B"]);
  });
  it("예전 표기(별칭)로 찾는다", () => {
    const hits = searchDonors("길동영희", hs, ms, [{ id: "a", updatedAt: 0, text: "길동·영희", householdId: "h1" }], []);
    expect(hits[0].householdId).toBe("h1");
  });
});

describe("금액 입력", () => {
  it("여러 표기를 받는다", () => {
    expect(parseAmount("50000")).toBe(50000);
    expect(parseAmount("50,000원")).toBe(50000);
    expect(parseAmount("5만")).toBe(50000);
    expect(parseAmount("1만5천")).toBe(15000);
    expect(parseAmount("3.5만")).toBe(35000);
    expect(parseAmount("120만")).toBe(1200000);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("만")).toBeNull();
    // 예산처럼 큰 금액을 말하듯이
    expect(parseAmount("1억1천만")).toBe(110_000_000);
    expect(parseAmount("2억5천만")).toBe(250_000_000);
    expect(parseAmount("3억7천만원")).toBe(370_000_000);
    expect(parseAmount("천만")).toBe(10_000_000);
    expect(parseAmount("1억")).toBe(100_000_000);
    expect(parseAmount("3천5백")).toBe(3500);
    expect(parseAmount("2만3천5백")).toBe(23500);
    expect(parseAmount("1억2345만6789")).toBe(123_456_789);
    expect(parseAmount("5천만5천")).toBe(50_005_000);
    expect(parseAmount("1억만")).toBeNull();
  });
});

describe("지난 명단 불러오기", () => {
  const os = [
    off({ date: "2026-09-13", householdId: "h1", donorText: "홍길동,김영희", amount: 1 }),
    off({ date: "2026-09-20", householdId: "h1", donorText: "홍길동,김영희", amount: 200000 }),
    off({ date: "2026-09-20", householdId: "h2", donorText: "김철수A", amount: 50000 }),
    off({ date: "2026-09-27", householdId: "h2", donorText: "김철수A", amount: 50000 }),
  ];
  it("가장 최근 주일 명단, 이번 주 이미 입력한 가정은 뺀다", () => {
    const r = previousRoster("G-TITHE", "2026-09-27", os);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ householdId: "h1", amount: 200000, fromDate: "2026-09-20" });
  });
  it("같은 가정이 두 번 냈으면 한 줄로 합친다", () => {
    const r = previousRoster("G-TITHE", "2026-09-27", [...os, off({ date: "2026-09-20", householdId: "h1", donorText: "홍길동,김영희", amount: 5000 })]);
    expect(r).toHaveLength(1);
    expect(r[0].amount).toBe(205000);
  });
});
