import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "./categories";
import { planAdjustments } from "./cashbook";
import { balanceAt, listTransfers, loanBalance, makeTransfer, reconcile, type Account, type Loan } from "./status";

const acct = (p: Partial<Account>): Account => ({ id: p.name ?? "a", updatedAt: 0, name: "통장", kind: "bank", inBook: true, balances: [], sort: 0, ...p });

describe("통장 잔액 대사", () => {
  const txns = [
    { date: "2026-09-20", at: "2026-09-20 10:00:00", balance: 1_000 },
    { date: "2026-09-23", at: "2026-09-23 09:00:00", balance: 5_000 },
    { date: "2026-09-23", at: "2026-09-23 15:00:00", balance: 4_000 },
    { date: "2026-10-01", at: "2026-10-01 09:00:00", balance: 9_999 },
  ];
  it("통장 파일 계좌는 그날까지 마지막 거래의 잔액, 손으로 적은 계좌는 그날까지 마지막 기록", () => {
    expect(balanceAt(acct({ fromBankFile: true }), "2026-09-27", txns)).toEqual({ amount: 4_000, asOf: "2026-09-23", source: "file" });
    const cash = acct({ name: "현금", kind: "cash", balances: [{ date: "2026-09-01", amount: 300 }, { date: "2026-09-27", amount: 500 }, { date: "2026-10-04", amount: 1 }] });
    expect(balanceAt(cash, "2026-09-27", []).amount).toBe(500);
    expect(balanceAt(acct({}), "2026-09-27", []).source).toBe("none");
  });
  it("장부와 맞춰 보는 돈만 더하고, 차이·오래된 잔액을 알려 줌", () => {
    const r = reconcile("2026-09-27", [
      acct({ name: "농협", fromBankFile: true, sort: 1 }),
      acct({ name: "현금", kind: "cash", balances: [{ date: "2026-09-27", amount: 500 }], sort: 2 }),
      acct({ name: "적금", kind: "saving", inBook: false, balances: [{ date: "2026-09-27", amount: 99 }], sort: 3 }),
      acct({ name: "외화", kind: "fx", balances: [{ date: "2026-08-01", amount: 7 }], sort: 4 }),
    ], txns, 4_500);
    expect(r.accounts).toBe(4_507);
    expect(r.diff).toBe(7);
    expect(r.stale).toEqual(["외화"]);
  });
});

describe("차입", () => {
  it("빌린 돈 − 갚은 돈 (기준일까지)", () => {
    const l: Loan = { id: "l", updatedAt: 0, lender: "은행", internal: false, events: [
      { date: "2025-01-01", kind: "borrow", amount: 120 }, { date: "2026-01-10", kind: "repay", amount: 20 }, { date: "2026-12-01", kind: "repay", amount: 20 }] };
    expect(loanBalance(l, "2026-09-27")).toBe(100);
  });
});

describe("과목 이동", () => {
  it("보내는 과목 −, 받는 과목 + 두 줄로 남고, 목록으로 다시 읽힘", () => {
    const pair = makeTransfer({ date: "2026-01-04", fromLine: "G-THANKS", toLine: "S-BUILD", amount: 617, reason: "건축헌금으로 지정" }, DEFAULT_CATEGORIES, "t1", 1);
    expect(pair.map((o) => [o.categoryCode, o.amount])).toEqual([["G-THANKS-GEN", -617], ["S-BUILD", 617]]);
    expect(listTransfers(pair, DEFAULT_CATEGORIES)).toMatchObject([{ id: "t1", fromLine: "G-THANKS", toLine: "S-BUILD", amount: 617, reason: "건축헌금으로 지정" }]);
    expect(() => makeTransfer({ date: "2026-01-04", fromLine: "G-TITHE", toLine: "G-TITHE", amount: 1, reason: "x" }, DEFAULT_CATEGORIES, "t2")).toThrow();
    expect(() => makeTransfer({ date: "2026-01-04", fromLine: "G-TITHE", toLine: "S-BUILD", amount: 1, reason: " " }, DEFAULT_CATEGORIES, "t3")).toThrow();
  });
  it("과목 이동은 '명단 없는 총액' 계산에 끼지 않음 (장부 주별 칸과 따로)", () => {
    const pair = makeTransfer({ date: "2026-01-04", fromLine: "G-THANKS", toLine: "S-BUILD", amount: 617, reason: "지정" }, DEFAULT_CATEGORIES, "t1", 1);
    const plan = planAdjustments([{ date: "2026-01-04", line: "G-THANKS", amount: 1000 }], pair, DEFAULT_CATEGORIES);
    expect(plan.adds).toEqual([expect.objectContaining({ amount: 1000 })]);
  });
});
