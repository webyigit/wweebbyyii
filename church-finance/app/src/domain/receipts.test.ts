import { describe, expect, it } from "vitest";
import {
  householdTotals, mergeLedger, nextSerials, normalizeBizNo, normalizeRrn, maskRrn, planReceipts, readLedgerGrid,
  splitAmount, statusOf, suggestShares, summarizeLedgerSheets, wonKorean,
} from "./receipts";
import { createVault, unlockVault, sealText, openText, changeVaultPass } from "./vault";
import type { Household, Offering, Receipt } from "./types";

const off = (date: string, householdId: string | undefined, amount: number, deleted = false): Offering => ({
  id: Math.random().toString(36), updatedAt: 0, date, categoryCode: "G-TITHE", householdId, donorText: "", amount, method: "cash", createdAt: 0, deleted,
});
const hh = (id: string, shares?: Household["receiptShares"]): Household => ({ id, updatedAt: 0, name: id, receiptShares: shares });

describe("기부금영수증 금액", () => {
  const offerings = [
    off("2026-01-04", "h1", 100_000), off("2026-01-11", "h1", 50_000), off("2026-12-27", "h1", 30_000),
    off("2025-12-28", "h1", 999_999), // 작년 → 빠짐
    off("2026-03-01", "h1", 77_777, true), // 지운 기록 → 빠짐
    off("2026-02-01", undefined, 5_000), // 무명 → 빠짐
    off("2026-05-03", "h2", 1_000_001), off("2026-06-07", "h2", 333),
    off("2026-07-05", "h3", 20_000),
  ];

  it("가정별 월별 합계 (그 해 것만, 지운 것·무명 빼고)", () => {
    const t = householdTotals(2026, offerings);
    expect(t.get("h1")!.total).toBe(180_000);
    expect(t.get("h1")!.months[0]).toBe(150_000);
    expect(t.get("h1")!.months[11]).toBe(30_000);
    expect(t.has(undefined as never)).toBe(false);
  });

  it("비율로 나눠도 원 단위까지 합이 맞음 (끝수는 마지막 사람)", () => {
    expect(splitAmount(1_000_001, [60, 40])).toEqual([600_000, 400_001]);
    expect(splitAmount(100, [33, 33, 34])).toEqual([33, 33, 34]);
    const plan = planReceipts(2026, offerings, [
      hh("h1", [{ applicantId: "a1", pct: 100 }]),
      hh("h2", [{ applicantId: "a2", pct: 60 }, { applicantId: "a3", pct: 40 }]),
      hh("h3"),
    ]);
    const a2 = plan.byApplicant.get("a2")!, a3 = plan.byApplicant.get("a3")!;
    expect(a2.amount + a3.amount).toBe(1_000_334);
    expect(a2.months.reduce((s, v) => s + v, 0)).toBe(a2.amount);
    expect(plan.byApplicant.get("a1")!.amount).toBe(180_000);
    expect(plan.unassigned).toEqual([{ householdId: "h3", total: 20_000, reason: "none" }]);
  });

  it("한 사람이 두 가정 헌금을 받으면 합쳐짐, 비율 합이 100이 아니면 '확인 필요'", () => {
    const plan = planReceipts(2026, offerings, [
      hh("h1", [{ applicantId: "a1", pct: 100 }]),
      hh("h3", [{ applicantId: "a1", pct: 100 }]),
      hh("h2", [{ applicantId: "a2", pct: 60 }, { applicantId: "a3", pct: 30 }]),
    ]);
    expect(plan.byApplicant.get("a1")!.amount).toBe(200_000);
    expect(plan.byApplicant.get("a1")!.sources).toHaveLength(2);
    expect(plan.unassigned).toEqual([{ householdId: "h2", total: 1_000_334, reason: "badShares" }]);
  });

  it("일련번호: 다음 해-순번, 폐기한 번호도 건너뜀", () => {
    const r = (serial: string, status: Receipt["status"] = "issued") => ({ serial, status, year: 2026 }) as Receipt;
    expect(nextSerials(2026, [], 2)).toEqual(["2027-001", "2027-002"]);
    expect(nextSerials(2026, [r("2027-001"), r("2027-002", "void"), r("2026-050")], 1)).toEqual(["2027-003"]);
  });

  it("발급 후 헌금이 바뀌면 '금액 바뀜'", () => {
    const rs = [{ id: "r", updatedAt: 0, year: 2026, serial: "2027-001", applicantId: "a1", amount: 100, status: "issued" } as Receipt];
    expect(statusOf("a1", 100, 2026, rs).status).toBe("issued");
    expect(statusOf("a1", 120, 2026, rs).status).toBe("changed");
    expect(statusOf("a2", 100, 2026, rs).status).toBe("notIssued");
    expect(statusOf("a1", 100, 2026, [{ ...rs[0], status: "void" }]).status).toBe("notIssued");
  });
});

describe("번호 검사", () => {
  it("주민번호: 띄어쓰기·하이픈 달라도 같은 모양으로, 틀린 모양은 거절", () => {
    expect(normalizeRrn(" 900101 1234567 ")).toBe("900101-1234567");
    expect(normalizeRrn("9001011234567")).toBe("900101-1234567");
    expect(normalizeRrn("901301-1234567")).toBeNull(); // 13월
    expect(normalizeRrn("900101-123456")).toBeNull();
    expect(maskRrn("900101-1234567")).toBe("900101-1******");
  });
  it("사업자번호 검증숫자", () => {
    expect(normalizeBizNo("1248100998")).toBe("124-81-00998"); // 잘 알려진 공개 번호 형식 예
    expect(normalizeBizNo("124-81-00997")).toBeNull();
  });
  it("금액 한글", () => {
    expect(wonKorean(2_380_000)).toBe("이백삼십팔만");
    expect(wonKorean(100_010_001)).toBe("일억일만일");
  });
});

describe("예전 발급대장 읽기", () => {
  const grid = [
    ["2027년도 기부금 영수증 발급표"],
    ["NO", "구분", "일련번호", "이름", "생년월일", "주 소", "금액", "발급일자"],
    [1, "개인", "2027-001", "홍길동", "900101-1234567", "서울시 어딘가 1", "2,380,000", "2026년 12월 27일"],
    [2, "개인", "2027-002", "김영희", "", "서울시 어딘가 2", "", "2026년 12월 27일", "재발급으로 폐기처리"],
    [3, "법인", "2027-003", "주식회사 가나", "124-81-00998", "경기도 어딘가", 11_000_000, new Date(Date.UTC(2027, 0, 3))],
    [4, "개인", "2027-004", "", "", "", "", ""], // 빈 줄
    ["일련번호", "발급일자", "이름", "생년월일", "주 소", "발급금액", "확 인"], // 두 번째 표 (열 순서 다름)
    ["2027-005", "2027-01-10", "이철수", "800202 2345678", "서울시 3", 500_000, ""],
  ];
  it("머리글로 열을 찾고, 폐기·빈 줄을 구분", () => {
    const rows = readLedgerGrid("대장", grid);
    expect(rows.map((r) => r.serial)).toEqual(["2027-001", "2027-002", "2027-003", "2027-005"]);
    expect(rows[0]).toMatchObject({ kind: "person", amount: 2_380_000, issuedAt: "2026-12-27", void: false });
    expect(rows[1].void).toBe(true);
    expect(rows[2]).toMatchObject({ kind: "corp", amount: 11_000_000, issuedAt: "2027-01-03" });
    expect(rows[3]).toMatchObject({ name: "이철수", amount: 500_000, issuedAt: "2027-01-10" });
  });
  it("초안·백업 시트가 겹치면 건이 가장 많은 시트를 기본으로", () => {
    const a = readLedgerGrid("본", grid);
    const b = readLedgerGrid("백업", grid.slice(0, 3));
    const s = summarizeLedgerSheets([...a, ...b]);
    expect(s.find((x) => x.chosen)!.sheet).toBe("본");
    expect(mergeLedger([...b, ...a]).map((r) => r.serial)).toEqual(["2027-001", "2027-002", "2027-003", "2027-005"]);
  });
  it("신청자 → 가정 자동 연결 (한 가정 두 신청자는 지난 금액 비율로)", () => {
    const households = [hh("h1"), hh("h2")];
    const members = [
      { householdId: "h1", name: "홍길동" }, { householdId: "h1", name: "김영희" },
      { householdId: "h2", name: "이철수" }, { householdId: "h9", name: "이철수" }, // 동명이인 → 연결 안 함
    ];
    const { shares, unmatched } = suggestShares(
      [{ id: "a1", name: "홍길동" }, { id: "a2", name: "김영희" }, { id: "a3", name: "이철수" }, { id: "a4", name: "박자녀" }],
      new Map([["a1", 600], ["a2", 400]]), households, members,
    );
    expect(shares.get("h1")).toEqual([{ applicantId: "a1", pct: 60 }, { applicantId: "a2", pct: 40 }]);
    expect(unmatched).toEqual(["a3", "a4"]);
  });
});

describe("주민번호 금고", () => {
  it("공개 열쇠로 잠그고 비밀번호로만 열림, 틀린 비밀번호는 거절, 비밀번호 바꿔도 예전 것 열림", async () => {
    const v = await createVault("교회금고비번");
    const sealed = await sealText(v.pub, "900101-1234567");
    expect(sealed).not.toContain("900101");
    expect(await unlockVault(v, "틀린비번")).toBeNull();
    const key = await unlockVault(v, "교회금고비번");
    expect(await openText(key!, sealed)).toBe("900101-1234567");
    const v2 = (await changeVaultPass(v, "교회금고비번", "새비번"))!;
    expect(await unlockVault(v2, "교회금고비번")).toBeNull();
    expect(await openText((await unlockVault(v2, "새비번"))!, sealed)).toBe("900101-1234567");
  }, 30_000);
});
