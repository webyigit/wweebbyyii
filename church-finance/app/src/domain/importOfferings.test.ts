import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { mapCategory, planImport, splitNames, type SheetRow } from "./importOfferings";
import { readOfferingWorkbook } from "./readWorkbook";

// 가짜 이름만 사용
const EMPTY = { households: [], members: [], aliases: [], offerings: [] };
let n = 0;
const row = (p: Partial<SheetRow>): SheetRow => ({ sheet: "1월", row: ++n, date: "2026-01-04", label: "십일조", name: "홍길동,김영희", amount: 10000, ...p });

describe("구분 표기 맞추기 (실제 엑셀에 있던 28가지 표기)", () => {
  const cases: [string, string][] = [
    ["십일조", "G-TITHE"], ["십일조헌금", "G-TITHE"], ["주일헌금", "G-SUNDAY"],
    ["범사감사", "G-THANKS-BEOMSA"], ["범사감사헌금", "G-THANKS-BEOMSA"], ["감사헌금-범사", "G-THANKS-BEOMSA"],
    ["기타감사", "G-THANKS-ETC"], ["기타감사헌금", "G-THANKS-ETC"], ["감사헌금-기타", "G-THANKS-ETC"],
    ["일천번제", "G-THANKS-1000"], ["감사헌금", "G-THANKS-GEN"], ["신년감사", "G-NEWYEAR"], ["기관헌금", "G-DEPT"],
    ["부활절", "G-EASTER"], ["맥추감사절", "G-HARVEST1"],
    ["이웃사랑", "S-NEIGHBOR"], ["이웃사랑헌금", "S-NEIGHBOR"], ["이웃사랑 헌금", "S-NEIGHBOR"],
    ["꽃꽃이", "S-FLOWER"], ["꽃꽃이헌금", "S-FLOWER"], ["꽃꽂이헌금", "S-FLOWER"], ["꽃꽂이 헌금", "S-FLOWER"],
    ["건축(E/V)헌금", "S-BUILD"], ["건축(E/V)헌금헌금", "S-BUILD"],
    ["해외선교", "M-MISSION"], ["해외선교헌금", "M-MISSION"], ["해외선교헌금헌금", "M-MISSION"], ["해외선선교", "M-MISSION"],
  ];
  it.each(cases)("%s → %s", (label, code) => expect(mapCategory(label)).toBe(code));
  it("모르는 표기는 null", () => expect(mapCategory("바자회")).toBeNull());
});

describe("이름 나누기", () => {
  it("쉼표·공백·점·괄호", () => {
    expect(splitNames("홍길동, 김영희")).toEqual(["홍길동", "김영희"]);
    expect(splitNames("홍길동.김영희")).toEqual(["홍길동", "김영희"]);
    expect(splitNames("홍길동(아들)")).toEqual(["홍길동"]);
    expect(splitNames("김철수A")).toEqual(["김철수A"]);
  });
});

describe("가져오기 계획", () => {
  it("순서·공백이 달라도 같은 부부는 한 가정", () => {
    const p = planImport([row({ name: "홍길동,김영희" }), row({ name: "김영희, 홍길동" }), row({ name: "홍길동" })], EMPTY);
    expect(p.households).toHaveLength(1);
    expect(new Set(p.offerings.map((o) => o.householdKey)).size).toBe(1);
  });
  it("자녀가 더해진 표기는 그 가정에 붙는다", () => {
    const p = planImport([row({ name: "홍길동,김영희,홍아들" }), row({ name: "홍길동,김영희" })], EMPTY);
    expect(p.households).toHaveLength(1);
    expect(p.households[0].names).toEqual(["홍길동", "김영희", "홍아들"]);
  });
  it("무명은 가정에 연결하지 않음", () => {
    const p = planImport([row({ name: "무명1" }), row({ name: "무명" })], EMPTY);
    expect(p.households).toHaveLength(0);
    expect(p.offerings.every((o) => !o.householdKey)).toBe(true);
  });
  it("한 이름이 여러 가정에 있으면 '확인 필요'", () => {
    const p = planImport([row({ name: "홍길동,김영희" }), row({ name: "홍길동,박순이" }), row({ name: "홍길동" })], EMPTY);
    expect(p.households.filter((h) => h.needsReview)).toHaveLength(1);
  });
  it("모르는 구분·잘못된 행은 따로 알려준다", () => {
    const p = planImport([row({ label: "바자회" }), row({ amount: NaN }), row({ date: "" })], EMPTY);
    expect(p.unknownLabels[0]).toMatchObject({ label: "바자회", count: 1 });
    expect(p.badRows).toHaveLength(2);
    expect(p.offerings).toHaveLength(0);
  });
  it("같은 파일을 두 번 넣어도 겹치지 않는다 (같은 내용 2건은 2건으로)", () => {
    const rows = [row({ amount: 5000 }), row({ amount: 5000 })];
    const first = planImport(rows, EMPTY);
    expect(first.offerings).toHaveLength(2);
    const stored = first.offerings.map((o, i) => ({ id: `o${i}`, updatedAt: 0, createdAt: i, date: o.src.date, categoryCode: o.categoryCode, donorText: o.donorText, amount: o.src.amount, method: "cash" as const, importKey: o.importKey }));
    const second = planImport(rows, { ...EMPTY, offerings: stored });
    expect(second.offerings).toHaveLength(0);
    expect(second.duplicates).toBe(2);
  });
});

describe("엑셀 파일 읽기", () => {
  it("머리글로 열을 찾고, 머리 위 합계를 읽는다", () => {
    const aoa = [
      [], [], [],
      [null, null, null, null, 15000],
      [null, "일자", "구분", "성명", "금액", "비고"],
      [null, new Date(Date.UTC(2026, 0, 4)), "십일조", "홍길동,김영희", 10000, null],
      [null, new Date(Date.UTC(2026, 0, 4)), "범사감사", "이몽룡", 5000, "감사"],
      [null, null, null, null, null, null],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), "1월");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["합계"]]), "합계");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const r = readOfferingWorkbook(buf);
    expect(r.sheets).toEqual([{ name: "1월", rows: 2, headerTotal: 15000 }]);
    expect(r.rows[0]).toMatchObject({ date: "2026-01-04", label: "십일조", name: "홍길동,김영희", amount: 10000 });
    expect(r.rows[1].note).toBe("감사");
  });
});
