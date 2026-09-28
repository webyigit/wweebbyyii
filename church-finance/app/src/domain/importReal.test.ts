// 실제 엑셀로 가져오기를 검증 — 파일 경로를 환경변수로 줄 때만 돈다 (실데이터는 저장소에 두지 않음).
//   REAL_XLSX=/경로/2026개인별헌금집계.xlsx npx vitest run src/domain/importReal.test.ts
// 출력에는 이름을 찍지 않고 건수·금액만 찍는다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { cleanText, planImport } from "./importOfferings";
import { readOfferingWorkbook } from "./readWorkbook";

const FILE = process.env.REAL_XLSX;

describe.skipIf(!FILE)("실제 개인별 헌금집계 엑셀", () => {
  const buf = FILE ? readFileSync(FILE) : new Uint8Array();
  const read = FILE ? readOfferingWorkbook(buf) : { rows: [], sheets: [] };
  const plan = planImport(read.rows, { households: [], members: [], aliases: [], offerings: [] });

  it("월별 시트 합계가 시트에 적힌 합계와 원 단위까지 같다", () => {
    for (const s of read.sheets) {
      const sum = read.rows.filter((r) => r.sheet === s.name).reduce((a, r) => a + r.amount, 0);
      console.log(`${s.name}: ${s.rows}건 ${sum.toLocaleString()}원 (시트 합계 ${s.headerTotal?.toLocaleString() ?? "-"})`);
      if (s.headerTotal !== undefined) expect(sum).toBe(s.headerTotal);
    }
  });

  it("모든 행이 과목으로 들어가고 빠진 행이 없다", () => {
    console.log(`전체 ${read.rows.length}행 → 가져올 헌금 ${plan.offerings.length}건, 모르는 구분 ${plan.unknownLabels.length}종, 잘못된 행 ${plan.badRows.length}`);
    for (const u of plan.unknownLabels) console.log(`  모르는 구분 '${u.label}' ${u.count}건`);
    for (const b of plan.badRows.slice(0, 10)) console.log(`  잘못된 행 ${b.where}: ${b.why}`);
    expect(plan.unknownLabels).toEqual([]);
    expect(plan.offerings.length + plan.badRows.length).toBe(read.rows.length);
    const imported = plan.offerings.reduce((a, o) => a + o.src.amount, 0);
    const total = read.rows.reduce((a, r) => a + (Number.isFinite(r.amount) ? r.amount : 0), 0);
    expect(imported).toBe(total);
  });

  it("이름별 합계가 엑셀 '합계' 시트의 총액과 같다", () => {
    const wb = XLSX.read(buf, { type: "buffer" });
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["합계"], { header: 1, raw: true, defval: null });
    // '총액' 머리글 칸을 찾고, 그 왼쪽 칸이 성명 (시트 범위가 B열부터라 위치를 고정하지 않음)
    const h = grid.findIndex((r) => r?.some((c) => c === "총액"));
    expect(h).toBeGreaterThanOrEqual(0);
    const cAmt = grid[h].indexOf("총액"), cName = cAmt - 1;
    const expected = new Map<string, number>();
    for (const r of grid.slice(h + 1)) {
      const name = r?.[cName], amt = r?.[cAmt];
      if (typeof name === "string" && name.trim() && typeof amt === "number") expected.set(cleanText(name), (expected.get(cleanText(name)) ?? 0) + amt);
    }
    // 비교할 이름이 없으면 검사가 아무것도 안 한 것 — 통과시키지 않는다
    expect(expected.size).toBeGreaterThan(100);
    const actual = new Map<string, number>();
    for (const o of plan.offerings) actual.set(o.donorText, (actual.get(o.donorText) ?? 0) + o.src.amount);
    let same = 0; const diff: string[] = [];
    for (const [name, amt] of expected) {
      if (actual.get(name) === amt) same++;
      else diff.push(`${name.slice(0, 1)}… 엑셀 ${amt.toLocaleString()} / 가져오기 ${(actual.get(name) ?? 0).toLocaleString()}`);
    }
    console.log(`합계 시트 ${expected.size}명 중 일치 ${same}, 불일치 ${diff.length}`);
    for (const d of diff.slice(0, 15)) console.log("  " + d);
    expect(diff).toEqual([]);
  });

  it("가정 묶기 결과 (건수만)", () => {
    const review = plan.households.filter((h) => h.needsReview).length;
    const sizes = plan.households.reduce<Record<number, number>>((m, h) => ((m[h.names.length] = (m[h.names.length] ?? 0) + 1), m), {});
    console.log(`가정 ${plan.households.length}개 (구성원 수별 ${JSON.stringify(sizes)}), 확인 필요 ${review}개, 무명 등 가정 없는 헌금 ${plan.offerings.filter((o) => !o.householdKey).length}건`);
    expect(plan.households.length).toBeGreaterThan(0);
  });
});
