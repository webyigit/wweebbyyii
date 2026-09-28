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

let realInp: import("./settlement").SettleInput | null = null; // 올해 실제 자료 (아래 테스트끼리 넘겨 씀)

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
    realInp = inp;
  });

  // 5단계: 결산예산·제직회·제직회_요약·해외선교 시트와 원 단위 비교
  it("결산·예산(안) / 제직회 지출 현황 / 요약 / 해외선교가 엑셀과 같음", async () => {
    const { buildSettlement, buildSummary, buildMissionReport, periodOf } = await import("./settlement");
    expect(realInp).not.toBeNull();
    const inp = realInp!;
    const x = XLSX.read(bookBuf, { type: "buffer", cellDates: true });
    // 시트가 B열부터 시작하면 열 번호가 밀리므로 A열부터로 맞춤
    const grid = (sh: string) => {
      const ws = x.Sheets[sh];
      const pad = XLSX.utils.decode_range(ws["!ref"]!).s.c;
      return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null }).map((r) => [...Array(pad).fill(null), ...r]);
    };
    const norm = (v: unknown) => String(v ?? "").replace(/[\s,·()]/g, "");
    const num = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[,\s]/g, "")) || 0);
    const results: boolean[] = [];
    const cmp = (label: string, app: number, excel: number) => { const ok = app === excel; if (!ok) console.log(`  ✘ ${label}: 앱 ${app.toLocaleString()} / 엑셀 ${excel.toLocaleString()}`); results.push(ok); };
    const depts = DEPARTMENTS.map((d) => ({ code: d.code, name: d.name }));

    // 결산예산 시트: 기준일 9/27
    const s = buildSettlement(2026, periodOf("ytd", 2026, "2026-09-27"), inp, depts);
    const g = grid("결산예산");
    const EXCEL_INCOME: Record<string, string> = { "G-TITHE": "십일조헌금", "G-SUNDAY": "주일헌금", "G-THANKS": "감사헌금", "G-EASTER": "부활절헌금", "G-HARVEST1": "맥추절헌금", "G-HARVEST2": "추수감사헌금", "G-XMAS": "성탄절헌금", "G-NEWYEAR": "신년감사헌금", "G-DEPT": "기관헌금" };
    for (const l of s.income) {
      if (!EXCEL_INCOME[l.code] && !l.actual && !l.budget) continue; // 올해 엑셀에 없는 줄(기타수입)
      const row = g.slice(0, 20).find((r) => norm(r[2]) === EXCEL_INCOME[l.code]);
      expect(row, l.code).toBeTruthy();
      cmp(`수입 ${l.name} 예산`, l.budget, num(row![3]));
      cmp(`수입 ${l.name} 실적`, l.actual, num(row![4]));
    }
    cmp("수입 합계", s.incomeTotal.actual, num(g[4][4]));
    const expRows = g.slice(22);
    let items = 0;
    for (const d of s.depts) for (const it of d.items) {
      if (!it.actual && !it.budget) continue; // 지난 해에만 있던 항목
      const row = expRows.find((r) => norm(r[2]) === norm(it.name));
      if (!row) { console.log("  결산예산에 없는 항목: " + it.name); continue; }
      items++;
      cmp(`${d.name} ${it.name} 예산`, it.budget, num(row[3]));
      cmp(`${d.name} ${it.name} 지출`, it.actual, num(row[4]));
    }
    cmp("지출 합계", s.expenseTotal.actual, num(expRows.find((r) => norm(r[1]) === "합계")![4]));
    console.log(`  결산예산: 수입 ${s.income.length}줄, 지출 ${items}항목 비교`);
    expect(items).toBeGreaterThan(55);

    // 제직회 시트 (같은 기준일): 부서 소계
    const j = grid("제직회");
    for (const d of s.depts) {
      const i = j.findIndex((r) => norm(r[1]) === norm(d.name));
      if (i < 1) continue;
      cmp(`제직회 ${d.name} 소계`, d.actual, num(j[i - 1][4]));
    }

    // 제직회_요약 (상반기)
    const sum = buildSummary(2026, periodOf("h1", 2026, "2026-06-14"), inp); // 요약 시트 작성일 6/14 (6/21·6/28 미포함이라고 적혀 있음)
    const y = grid("제직회_요약");
    const val = (label: string) => num(y.find((r) => norm(r[1]).startsWith(label))![2]);
    cmp("상반기 수입", sum.income, val("수입은"));
    cmp("상반기 지출", sum.expense, val("지출은"));

    // 해외선교 현황 (작성일 6/28)
    const m = buildMissionReport(2026, "2026-06-28", inp);
    const mg = grid("재직_해외선교보고");
    const top = mg.findIndex((r) => norm(r[1]).startsWith("25년도이월금"));
    cmp("선교 이월", m.opening, num(mg[top + 1][1]));
    cmp("선교 수입", m.income, num(mg[top + 1][2]));
    cmp("선교 지출", m.expense, num(mg[top + 1][4]));
    cmp("선교 잔액", m.balance, num(mg[top + 1][5]));

    console.log(`  5단계 비교 ${results.length}건, 틀림 ${results.filter((r) => !r).length}건`);
    expect(results.filter((r) => !r).length).toBe(0);
  });
});

// 2025년 총계정원장 (한 해 묶음 파일) → 작년 자료. 결산예산·총 시트와, 올해 요약의 '작년 같은 기간' 숫자와 비교
//   REAL_XLSX=... REAL_CASHBOOK=... REAL_LEDGER_2025=/경로/총계정원장_2025.xlsx npx vitest run src/domain/importReal.test.ts
const LEDGER25 = process.env.REAL_LEDGER_2025;
describe.skipIf(!LEDGER25 || !BOOK || !FILE)("실제 2025년 총계정원장", async () => {
  const { readCashierWorkbook } = await import("./importCashier");
  const { readCashbookTotals, planAdjustments } = await import("./cashbook");
  const { readCashbookGrid } = await import("./readWorkbook");
  const { DEFAULT_CATEGORIES } = await import("./categories");
  const { DEFAULT_EXPENSE_ITEMS, DEPARTMENTS } = await import("./expenseCategories");
  const { buildSettlement, buildSummary, buildMissionReport, periodOf } = await import("./settlement");
  const buf = LEDGER25 ? readFileSync(LEDGER25) : new Uint8Array();

  it("수입(기장)·지출(부서 시트)·선교 송금을 읽고, 2025 결산·총 시트와 원 단위로 같음", () => {
    const ci = readCashierWorkbook(buf)!;
    expect(ci).not.toBeNull();
    for (const u of ci.unknown) console.log("  못 찾음: " + u);
    for (const x of ci.notes) console.log("  알림: " + x);
    expect(ci.unknown).toEqual([]);
    const { totals, unknown } = readCashbookTotals(readCashbookGrid(buf)!.grid, DEFAULT_CATEGORIES);
    console.log("  기장에서 못 읽은 줄: " + unknown.join(", "));
    const adds = planAdjustments(totals, [], DEFAULT_CATEGORIES).adds;
    const offerings = adds.map((a, i) => ({ id: `a${i}`, updatedAt: 0, createdAt: i, date: a.date, categoryCode: a.categoryCode, donorText: "", amount: a.amount, method: "cash" as const, importKey: a.importKey }));
    const expenses = ci.expenses.map((e, i) => ({ id: `e${i}`, updatedAt: 0, createdAt: i, date: e.date, itemCode: e.itemCode, amount: e.amount, description: e.description, source: "import" as const }));
    const inp = { categories: DEFAULT_CATEGORIES, items: DEFAULT_EXPENSE_ITEMS, offerings, expenses, budgets: ci.budgets.map((b) => ({ year: 2025, ...b })), openings: ci.openings.map((o) => ({ year: 2025, ...o })) };
    last2025 = inp;
    const depts = DEPARTMENTS.map((d) => ({ code: d.code, name: d.name }));
    const s = buildSettlement(2025, periodOf("year", 2025, "2025-12-31"), inp, depts);
    const x = XLSX.read(buf, { type: "buffer", cellDates: true });
    const g = XLSX.utils.sheet_to_json<unknown[]>(x.Sheets["결산예산"], { header: 1, raw: true, defval: null });
    const norm = (v: unknown) => String(v ?? "").replace(/[\s,·()]/g, "");
    const num = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[,\s]/g, "")) || 0);
    const results: boolean[] = [];
    const cmp = (label: string, app: number, excel: number) => { const ok = app === excel; if (!ok) console.log(`  ✘ ${label}: 앱 ${app.toLocaleString()} / 엑셀 ${excel.toLocaleString()}`); results.push(ok); };
    const EXCEL: Record<string, string> = { "G-TITHE": "십일조헌금", "G-SUNDAY": "주일헌금", "G-THANKS": "감사헌금", "G-EASTER": "부활절헌금", "G-HARVEST1": "맥추절헌금", "G-HARVEST2": "추수감사헌금", "G-XMAS": "성탄절헌금", "G-NEWYEAR": "신년감사헌금", "G-DEPT": "기관헌금", "G-OTHER": "보험금수령" };
    for (const l of s.income) {
      const row = g.slice(0, 20).find((r) => norm(r[1]) === EXCEL[l.code]);
      expect(row, l.code).toBeTruthy();
      cmp(`수입 ${l.name} 예산`, l.budget, num(row![2]));
      cmp(`수입 ${l.name} 실적`, l.actual, num(row![3]));
    }
    cmp("수입 합계", s.incomeTotal.actual, num(g.find((r) => norm(r[1]) === "합계")![3]));
    const expRows = g.slice(22);
    let items = 0;
    for (const d of s.depts) for (const it of d.items) {
      if (!it.actual && !it.budget) continue;
      const row = expRows.find((r) => norm(r[1]) === norm(it.name) || (DEFAULT_EXPENSE_ITEMS.find((e) => e.code === it.code)?.aliases ?? []).some((a) => norm(a) === norm(r[1])));
      if (!row) { console.log("  결산예산에 없는 항목: " + d.name + " " + it.name); continue; }
      items++;
      cmp(`${d.name} ${it.name} 지출`, it.actual, num(row[3]));
    }
    cmp("지출 합계", s.expenseTotal.actual, num(expRows.find((r) => norm(r[1]) === "합계")![3]));
    const m = buildMissionReport(2025, "2025-12-31", inp);
    console.log(`  2025 해외선교: 수입 ${m.income.toLocaleString()}, 송금 ${m.expense.toLocaleString()} (엑셀에 선교 이월이 없어 잔액 비교는 생략)`);
    console.log(`  2025 비교 ${results.length}건 (지출 ${items}항목), 틀림 ${results.filter((r) => !r).length}건`);
    expect(items).toBeGreaterThan(55);
    expect(results.filter((r) => !r).length).toBe(0);
  });

  let last2025: import("./settlement").SettleInput | null = null;
  it("올해 요약 보고의 '작년 같은 기간'이 엑셀 제직회_요약과 같음 (2025 상반기 수입·지출)", () => {
    expect(last2025).not.toBeNull();
    expect(realInp).not.toBeNull();
    const both = { ...realInp!, offerings: [...realInp!.offerings, ...last2025!.offerings], expenses: [...realInp!.expenses, ...last2025!.expenses], budgets: [...realInp!.budgets, ...last2025!.budgets] };
    const sum = buildSummary(2026, periodOf("h1", 2026, "2026-06-14"), both);
    const x = XLSX.read(readFileSync(BOOK!), { type: "buffer" });
    const y = XLSX.utils.sheet_to_json<unknown[]>(x.Sheets["제직회_요약"], { header: 1, raw: true, defval: null });
    const val = (label: string) => { const r = y.find((row) => row.some((c) => String(c ?? "").replace(/\s/g, "") === label))!; return r.find((c) => typeof c === "number") as number; };
    console.log(`  앱의 작년 같은 기간(일반, 1/1~6/14): 수입 ${sum.prev.income.toLocaleString()} 지출 ${sum.prev.expense.toLocaleString()} (올해 ${val("수입은").toLocaleString()} / ${val("지출은").toLocaleString()})`);
    console.log("  결론: " + sum.sentences.join(" / "));
    { // 엑셀 '작년' 숫자가 어떤 기간·범위인지 찾기 (조사용)
      const inp = last2025!;
      const cat = new Map(inp.categories.map((c) => [c.code, c.fund]));
      const itf = new Map(inp.items.map((i) => [i.code, i.fund]));
      for (const to of ["2025-06-15", "2025-06-22", "2025-06-29", "2025-06-30"]) {
        const g = inp.offerings.filter((o) => o.date <= to && cat.get(o.categoryCode) === "G").reduce((a, o) => a + o.amount, 0);
        const gs = inp.offerings.filter((o) => o.date <= to && cat.get(o.categoryCode) !== "M").reduce((a, o) => a + o.amount, 0);
        const all = inp.offerings.filter((o) => o.date <= to).reduce((a, o) => a + o.amount, 0);
        const eg = inp.expenses.filter((e) => e.date <= to && itf.get(e.itemCode) === "G").reduce((a, e) => a + e.amount, 0);
        const egs = inp.expenses.filter((e) => e.date <= to && itf.get(e.itemCode) !== "M").reduce((a, e) => a + e.amount, 0);
        console.log(`  ~${to}: 수입 일반 ${g.toLocaleString()} 일반+특별 ${gs.toLocaleString()} 전체 ${all.toLocaleString()} / 지출 일반 ${eg.toLocaleString()} 일반+특별 ${egs.toLocaleString()}`);
      }
    }
    // 엑셀의 '작년' 숫자는 2025 상반기 전체(6/29까지)의 일반+특별 → 같은 방식으로 계산하면 같아야 함 (올해는 일반만·6/14까지와 비교하고 있었음: Q18)
    const cat = new Map(last2025!.categories.map((c) => [c.code, c.fund]));
    const itf = new Map(last2025!.items.map((i) => [i.code, i.fund]));
    const h1In = last2025!.offerings.filter((o) => o.date <= "2025-06-30" && cat.get(o.categoryCode) !== "M").reduce((a, o) => a + o.amount, 0);
    const h1Out = last2025!.expenses.filter((e) => e.date <= "2025-06-30" && itf.get(e.itemCode) !== "M").reduce((a, e) => a + e.amount, 0);
    console.log(`  엑셀 방식(2025 상반기 전체, 일반+특별): 수입 ${h1In.toLocaleString()} 지출 ${h1Out.toLocaleString()}`);
    expect(h1In).toBe(182462700);
    expect(h1Out).toBe(172500394);
  });
});
