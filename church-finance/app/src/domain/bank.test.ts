import { describe, expect, it } from "vitest";
import { matchDepositor, nextSunday, parseDepositMemo, planBank, type BankTxn } from "./bank";
import type { Household, Member } from "./types";

// 가짜 이름만 사용
describe("입금 메모 풀기", () => {
  it.each([
    ["길동영희십일조", "길동영희", "G-TITHE"],
    ["홍길동김영희네팔구", "홍길동김영희", "M-RELIEF"],
    ["길동영희범사", "길동영희", "G-THANKS-BEOMSA"],
    ["길동영희일천", "길동영희", "G-THANKS-1000"],
    ["길동영희주일", "길동영희", "G-SUNDAY"],
    ["이몽룡감사헌금", "이몽룡", "G-THANKS-ETC"],
    ["이몽룡범사감사", "이몽룡", "G-THANKS-BEOMSA"],
    ["김주일십일조", "김주일", "G-TITHE"],
    ["성춘향해외선교", "성춘향", "M-MISSION"],
    ["성춘향", "성춘향", null],
  ])("%s → %s / %s", (memo, name, code) => expect(parseDepositMemo(memo)).toEqual({ namePart: name, categoryCode: code }));
});

describe("입금자 찾기", () => {
  const hs: Household[] = [{ id: "h1", updatedAt: 0, name: "홍길동 가정" }, { id: "h2", updatedAt: 0, name: "이몽룡 가정" }, { id: "h3", updatedAt: 0, name: "김철수 가정" }, { id: "h4", updatedAt: 0, name: "박철수 가정" }];
  const ms: Member[] = [
    { id: "m1", updatedAt: 0, householdId: "h1", name: "홍길동" }, { id: "m2", updatedAt: 0, householdId: "h1", name: "김영희" }, { id: "m5", updatedAt: 0, householdId: "h1", name: "홍아들" },
    { id: "m3", updatedAt: 0, householdId: "h2", name: "이몽룡" },
    { id: "m4", updatedAt: 0, householdId: "h3", name: "김철수" }, { id: "m6", updatedAt: 0, householdId: "h4", name: "박철수" },
  ];
  it("부부 이름만(성 없이), 순서 바뀌어도", () => {
    expect(matchDepositor("길동영희", hs, ms, []).householdId).toBe("h1");
    expect(matchDepositor("영희길동", hs, ms, []).householdId).toBe("h1");
  });
  it("전체 이름, 은행이 뒤를 자른 것", () => {
    expect(matchDepositor("홍길동김영희", hs, ms, []).householdId).toBe("h1");
    expect(matchDepositor("홍길동김영", hs, ms, []).householdId).toBe("h1");
    expect(matchDepositor("이몽룡", hs, ms, []).householdId).toBe("h2");
  });
  it("이름만(성 없이) 같은 두 가정은 고르지 않고 후보로", () => {
    const r = matchDepositor("철수", hs, ms, []);
    expect(r.householdId).toBeNull();
  });
});

describe("통장 내역 계획", () => {
  const t = (p: Partial<BankTxn>): BankTxn => ({ key: Math.random() + "", at: "2026-09-23 13:47:00", date: "2026-09-23", sunday: "2026-09-27", withdraw: 0, deposit: 0, balance: 0, content: "", note: "", ...p });
  const hs: Household[] = [{ id: "h1", updatedAt: 0, name: "홍길동 가정" }];
  const ms: Member[] = [{ id: "m1", updatedAt: 0, householdId: "h1", name: "홍길동" }, { id: "m2", updatedAt: 0, householdId: "h1", name: "김영희" }];
  it("주중 입금은 다가오는 주일로", () => {
    expect(nextSunday("2026-09-23")).toBe("2026-09-27");
    expect(nextSunday("2026-09-27")).toBe("2026-09-27");
  });
  it("이미 있는 헌금은 새로 만들지 않고 연결, 없는 건 새로, 모르면 선택 필요", () => {
    const p = planBank([
      t({ deposit: 50000, content: "길동영희십일조" }),
      t({ deposit: 10000, content: "길동영희주일" }),
      t({ deposit: 3000, content: "누군지모름" }),
      t({ withdraw: 23470, content: "가스202608" }),
      t({ withdraw: 7500, content: "이체수수료" }),
    ], {
      households: hs, members: ms, aliases: [],
      offerings: [{ id: "o1", updatedAt: 0, createdAt: 0, date: "2026-09-27", categoryCode: "G-TITHE", householdId: "h1", donorText: "홍길동,김영희", amount: 50000, method: "cash" }],
      expenses: [{ id: "e1", updatedAt: 0, createdAt: 0, date: "2026-09-27", itemCode: "FACILITY-8", amount: 23470, description: "가스", source: "manual" }],
      rules: [{ content: "이체수수료", itemCode: "FACILITY-8" }],
      seenKeys: new Set(),
    });
    expect(p.deposits.map((d) => d.status)).toEqual(["existing", "matched", "needs-choice"]);
    expect(p.deposits[0].existingOfferingId).toBe("o1");
    expect(p.withdrawals.map((w) => w.status)).toEqual(["reconciled", "suggested"]);
    expect(p.withdrawals[1].suggestedItem).toBe("FACILITY-8");
  });
});
