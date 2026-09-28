// 실제 엑셀로 가져오기를 검증 — 파일 경로를 환경변수로 줄 때만 돈다 (실데이터는 저장소에 두지 않음).
//   REAL_XLSX=/경로/2026개인별헌금집계.xlsx npx vitest run src/domain/importReal.test.ts
// 출력에는 이름을 찍지 않고 건수·금액만 찍는다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { cleanText, planImport } from "./importOfferings";
import { readOfferingWorkbook } from "./readWorkbook";

const FILE = process.env.REAL_XLSX;

const buf = FILE ? readFileSync(FILE) : new Uint8Array();
const read = FILE ? readOfferingWorkbook(buf) : { rows: [], sheets: [] };
const plan = planImport(read.rows, { households: [], members: [], aliases: [], offerings: [] });

describe.skipIf(!FILE)("실제 개인별 헌금집계 엑셀", () => {

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

// 출납 파일(`기장` 시트)까지 주면: 주별 총액 읽기 + 개인별 명단과 대조
//   REAL_XLSX=... REAL_CASHBOOK=/경로/주간수입지출.xlsx npx vitest run src/domain/importReal.test.ts
const BOOK = process.env.REAL_CASHBOOK;
describe.skipIf(!FILE || !BOOK)("실제 출납 파일 기장 시트", async () => {
  const { DEFAULT_CATEGORIES } = await import("./categories");
  const { readCashbookTotals, planAdjustments, findManualCorrections } = await import("./cashbook");
  const { readCashbookGrid } = await import("./readWorkbook");
  const cb = BOOK ? readCashbookGrid(readFileSync(BOOK))! : { grid: [], formulas: [] };
  const grid = cb.grid;
  const { totals, unknown } = readCashbookTotals(grid, DEFAULT_CATEGORIES);
  const fixes = findManualCorrections(grid, cb.formulas, DEFAULT_CATEGORIES);

  it("주별 합 + 수식 속 수동 보정 = 기장 시트의 연 누계", () => {
    for (const f of fixes) console.log(`수동 보정: ${f.label}(${f.line}) ${f.amount.toLocaleString()} ← ${f.formula}`);
    expect(unknown).toEqual([]);
    const byLine = new Map<string, number>();
    for (const t of totals) byLine.set(t.line, (byLine.get(t.line) ?? 0) + t.amount);
    // 시트의 연 누계 칸: '(헌금예산)' 칸 오른쪽 두 번째 열
    const start = grid.findIndex((r) => r?.some((c) => typeof c === "string" && c.replace(/\s/g, "") === "(헌금예산)"));
    const labelCol = grid[start].findIndex((c) => typeof c === "string" && c.replace(/\s/g, "") === "(헌금예산)");
    const sheetTotals = new Map<string, number>();
    const want: [string, string][] = [["십일조", "G-TITHE"], ["주일헌금", "G-SUNDAY"], ["감사헌금", "G-THANKS"], ["신년감사", "G-NEWYEAR"], ["기관", "G-DEPT"], ["부활절", "G-EASTER"], ["맥추절", "G-HARVEST1"], ["이웃사랑", "S-NEIGHBOR"], ["꽃꽂이", "S-FLOWER"], ["건축헌금", "S-BUILD"]];
    for (const r of grid.slice(start)) {
      const l = String(r?.[labelCol] ?? "").replace(/\s/g, "");
      const hit = want.find(([w]) => w === l);
      if (hit && typeof r[labelCol + 2] === "number") sheetTotals.set(hit[1], r[labelCol + 2] as number);
    }
    expect(sheetTotals.size).toBe(want.length);
    for (const [line, amt] of sheetTotals) {
      const fix = fixes.filter((f) => f.line === line).reduce((a, f) => a + f.amount, 0);
      console.log(`${line}: 주별 합 ${(byLine.get(line) ?? 0).toLocaleString()} + 보정 ${fix.toLocaleString()} / 시트 누계 ${amt.toLocaleString()}`);
      expect((byLine.get(line) ?? 0) + fix).toBe(amt);
    }
    console.log(`주 ${new Set(totals.map((t) => t.date)).size}개, 주·줄 ${totals.length}칸`);
  });

  it("개인별 명단 + 명단 없는 총액 = 장부 (명단이 장부보다 큰 주는 따로 보고)", () => {
    const stored = plan.offerings.map((o, i) => ({ id: `o${i}`, updatedAt: 0, createdAt: i, date: o.src.date, categoryCode: o.categoryCode, donorText: o.donorText, amount: o.src.amount, method: "cash" as const, importKey: o.importKey }));
    const adj = planAdjustments(totals, stored, DEFAULT_CATEGORIES);
    const lineOf = new Map(DEFAULT_CATEGORIES.map((c) => [c.code, c.line]));
    const sumBy = new Map<string, number>();
    for (const o of [...stored, ...adj.adds]) {
      const k = `${o.date}|${lineOf.get(o.categoryCode)}`;
      sumBy.set(k, (sumBy.get(k) ?? 0) + o.amount);
    }
    const overKeys = new Set(adj.over.map((o) => `${o.date}|${o.line}`));
    let ok = 0;
    for (const t of totals) {
      const k = `${t.date}|${t.line}`;
      if (overKeys.has(k)) continue;
      expect(sumBy.get(k)).toBe(t.amount);
      ok++;
    }
    const adjSum = adj.adds.reduce((a, x) => a + x.amount, 0);
    console.log(`주·줄 ${totals.length}칸: 딱 맞음 ${adj.matched}, 명단 없는 총액으로 채움 ${adj.adds.length}칸(${adjSum.toLocaleString()}원), 명단이 장부보다 큼 ${adj.over.length}칸`);
    for (const o of adj.over.slice(0, 20)) console.log(`  ${o.date} ${o.line}: 명단 ${o.named.toLocaleString()} / 장부 ${o.book.toLocaleString()}`);
    const byMonth = new Map<string, number>();
    for (const a of adj.adds) byMonth.set(a.date.slice(0, 7) + " " + a.categoryCode, (byMonth.get(a.date.slice(0, 7) + " " + a.categoryCode) ?? 0) + a.amount);
    console.log([...byMonth.entries()].filter(([k]) => !k.includes("SUNDAY")).slice(0, 40).map(([k, v]) => `${k}:${v.toLocaleString()}`).join("  "));
    expect(ok).toBeGreaterThan(100);
  });
});

// 주간 명단 파일 폴더까지 주면: 과목별 제목 금액 대조 + 장부(기장)와 주별 대조
//   REAL_WEEKLY_DIR=/경로/폴더
const WDIR = process.env.REAL_WEEKLY_DIR;
describe.skipIf(!WDIR || !BOOK)("실제 주간 주일헌금현황 파일", async () => {
  const { readdirSync } = await import("node:fs");
  const { readWeeklyNames, readCashbookGrid } = await import("./readWorkbook");
  const { readCashbookTotals } = await import("./cashbook");
  const { DEFAULT_CATEGORIES } = await import("./categories");
  const { mapCategory } = await import("./importOfferings");
  const files = WDIR ? readdirSync(WDIR).filter((f) => f.endsWith(".xlsx")) : [];
  const weeks = files.map((f) => readWeeklyNames(readFileSync(`${WDIR}/${f}`))!);
  const book = BOOK ? readCashbookTotals(readCashbookGrid(readFileSync(BOOK))!.grid, DEFAULT_CATEGORIES).totals : [];
  const lineOf = new Map(DEFAULT_CATEGORIES.map((c) => [c.code, c.line]));

  it("모든 파일에서 날짜를 찾고, 과목마다 제목 금액 = 읽은 합계", () => {
    expect(weeks.every(Boolean)).toBe(true);
    for (const w of weeks) {
      const bad = w.sections.filter((s) => s.title !== null && s.title !== s.parsed);
      console.log(`${w.date}: ${w.rows.length}명 ${w.sections.length}과목, 제목과 다른 과목 ${bad.length}` + bad.map((b) => ` [${b.label} 제목 ${b.title} / 읽음 ${b.parsed}]`).join(""));
      expect(bad).toEqual([]);
      expect(w.rows.every((r) => mapCategory(r.label))).toBe(true);
    }
  });

  it("주간 명단 합계 vs 장부(기장) — 주일헌금 제외 과목별", () => {
    let same = 0, diff = 0;
    for (const w of weeks) {
      const by = new Map<string, number>();
      for (const r of w.rows) { const l = lineOf.get(mapCategory(r.label)!)!; by.set(l, (by.get(l) ?? 0) + r.amount); }
      for (const t of book.filter((b) => b.date === w.date && b.line !== "G-SUNDAY")) {
        const have = by.get(t.line) ?? 0;
        if (have === t.amount) same++; else { diff++; console.log(`  ${w.date} ${t.line}: 명단 ${have.toLocaleString()} / 장부 ${t.amount.toLocaleString()}`); }
      }
    }
    console.log(`주·과목 대조: 같음 ${same}, 다름 ${diff}`);
    expect(same).toBeGreaterThan(0);
  });
});

// 출납 파일 → 지출·예산·규칙·이월, 그리고 앱이 계산한 보고서가 엑셀 '총'·'09-27' 시트와 같은지
describe.skipIf(!BOOK || !FILE)("실제 출납 파일: 지출과 보고서", async () => {
  const { readCashierWorkbook } = await import("./importCashier");
  const { DEFAULT_CATEGORIES } = await import("./categories");
  const { DEFAULT_EXPENSE_ITEMS, DEPARTMENTS, DEPT_NAME } = await import("./expenseCategories");
  const { buildCashbookWeek, buildCashbookYear } = await import("./cashbookReport");
  const { readCashbookTotals, planAdjustments } = await import("./cashbook");
  const { readCashbookGrid } = await import("./readWorkbook");
  const bookBuf = BOOK ? readFileSync(BOOK) : new Uint8Array();
  const ci = BOOK ? readCashierWorkbook(bookBuf)! : null;

  it("모든 지출·규칙이 과목을 찾음, 부서·특별헌금·해외선교 합계가 엑셀과 같음", () => {
    expect(ci).not.toBeNull();
    console.log(`지출 ${ci!.expenses.length}건, 예산 ${ci!.budgets.length}항목, 고정지출 규칙 ${ci!.rules.length}개, 이월 ${ci!.openings.map((o) => `${o.key}=${o.amount.toLocaleString()}`).join(" ")}`);
    for (const u of ci!.unknown) console.log("  못 찾음: " + u);
    expect(ci!.unknown).toEqual([]);
    const itemOf = new Map(DEFAULT_EXPENSE_ITEMS.map((i) => [i.code, i]));
    let compared = 0;
    for (const t of ci!.sheetTotals) {
      let mine: number | null = null;
      if (t.key.startsWith("dept:")) mine = ci!.expenses.filter((e) => itemOf.get(e.itemCode)?.dept === t.key.slice(5)).reduce((a, e) => a + e.amount, 0);
      if (t.key.startsWith("pot:")) mine = ci!.expenses.filter((e) => itemOf.get(e.itemCode)?.incomeLine === t.key.slice(4)).reduce((a, e) => a + e.amount, 0);
      if (t.key === "mission:out") mine = ci!.expenses.filter((e) => itemOf.get(e.itemCode)?.fund === "M").reduce((a, e) => a + e.amount, 0);
      if (t.key === "G:out") mine = ci!.expenses.filter((e) => itemOf.get(e.itemCode)?.fund === "G").reduce((a, e) => a + e.amount, 0);
      if (mine === null) continue;
      compared++;
      console.log(`  ${t.label}: 엑셀 ${t.amount.toLocaleString()} / 읽음 ${mine.toLocaleString()} ${mine === t.amount ? "✔" : "✘"}`);
      expect(mine).toBe(t.amount);
    }
    expect(compared).toBeGreaterThan(12);
  });

  it("앱이 계산한 9/27 주간 보고서·연 누계가 엑셀과 같음", () => {
    const grid = readCashbookGrid(bookBuf)!.grid;
    const { totals } = readCashbookTotals(grid, DEFAULT_CATEGORIES);
    const offerings = plan.offerings.map((o, i) => ({ id: `o${i}`, updatedAt: 0, createdAt: i, date: o.src.date, categoryCode: o.categoryCode, donorText: o.donorText, amount: o.src.amount, method: "cash" as const, importKey: o.importKey }));
    const adj = planAdjustments(totals, offerings, DEFAULT_CATEGORIES);
    const allOff = [...offerings, ...adj.adds.map((a, i) => ({ id: `a${i}`, updatedAt: 0, createdAt: 1e6 + i, date: a.date, categoryCode: a.categoryCode, donorText: "", amount: a.amount, method: "cash" as const, importKey: a.importKey }))];
    // 명단이 장부보다 큰 주(2/22)는 비교를 위해 장부 기준으로 맞춤 (실제 앱에서는 '확인 필요'로 보여 줌)
    for (const o of adj.over) allOff.push({ id: `v${o.date}`, updatedAt: 0, createdAt: 2e6, date: o.date, categoryCode: "G-THANKS-GEN", donorText: "", amount: o.book - o.named, method: "cash" as const, importKey: "test" });
    // 엑셀 수식 속 수동 보정(Q10: 감사헌금 −617,000 → 건축헌금 +617,000)을 엑셀과 같게 반영해서 비교. 날짜는 아직 모름(연초로 둠)
    allOff.push({ id: "q10a", updatedAt: 0, createdAt: 3e6, date: "2026-01-04", categoryCode: "G-THANKS-GEN", donorText: "", amount: -617000, method: "cash" as const, importKey: "test" });
    allOff.push({ id: "q10b", updatedAt: 0, createdAt: 3e6, date: "2026-01-04", categoryCode: "S-BUILD", donorText: "", amount: 617000, method: "cash" as const, importKey: "test" });
    const expenses = ci!.expenses.map((e, i) => ({ id: `e${i}`, updatedAt: 0, createdAt: i, date: e.date, itemCode: e.itemCode, amount: e.amount, description: e.description, source: "import" as const }));
    const inp = { categories: DEFAULT_CATEGORIES, items: DEFAULT_EXPENSE_ITEMS, offerings: allOff, expenses, openings: ci!.openings.map((o) => ({ year: 2026, ...o })), budgets: ci!.budgets.map((b) => ({ year: 2026, ...b })) };
    const dn = (c: string) => DEPT_NAME[c] ?? c;
    const w = buildCashbookWeek("2026-09-27", inp, dn);
    const y = buildCashbookYear("2026-09-27", inp, dn, DEPARTMENTS.map((d) => d.code));
    const x = XLSX.read(bookBuf, { type: "buffer", cellDates: true });
    const cell = (sh: string, a: string) => x.Sheets[sh][a]?.v as number;
    const cmp = (label: string, app: number, excel: number) => { console.log(`  ${label}: 앱 ${app.toLocaleString()} / 엑셀 ${Number(excel).toLocaleString()} ${app === excel ? "✔" : "✘ 차이 " + (app - excel).toLocaleString()}`); return app === excel; };
    const results = [
      cmp("9/27 일반 지난주 잔액", w.general.opening, cell("09-27", "D8")),
      cmp("9/27 일반 수입", w.general.income, cell("09-27", "E8")),
      cmp("9/27 일반 지출", w.general.expense, cell("09-27", "F8")),
      cmp("9/27 일반 잔액", w.general.closing, cell("09-27", "G8")),
      cmp("9/27 특별 지출", w.special.expense, cell("09-27", "F9")),
      cmp("연 일반 지출", y.general.expense, cell("총", "H5")),
      cmp("연 일반 잔액", y.general.closing, cell("총", "I5")),
      cmp("연 특별 지출", y.special.expense, cell("총", "H6")),
      cmp("해외선교 잔액", y.missionPots.reduce((a, p) => a + p.closing, 0), cell("총", "J34")),
    ];
    for (const d of y.depts) {
      const row = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].find((r) => String(cell("총", `G${r}`)).replace(/\s/g, "") === d.name.replace(/\s/g, ""));
      if (row) results.push(cmp(`부서 ${d.name} 지출`, d.spent, cell("총", `I${row}`)));
    }
    expect(results.length).toBeGreaterThan(15);
    expect(results.filter((r) => !r).length).toBe(0);
  });
});
