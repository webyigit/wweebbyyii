// 출납 파일 `기장` 시트의 주별 헌금 총액을 기준으로 삼는다.
// 이름이 있는 헌금(개인별 집계·주간 명단)을 먼저 넣고, 주·줄별로 모자란 만큼을 '명단 없는 총액'으로 채운다.
// → 주일헌금(원래 이름 없음)과 명단이 없는 주(예: 7월)도 주간 보고서 숫자가 출납 장부와 같아진다.
import { mapCategory } from "./importOfferings";
import type { IncomeCategory, Offering } from "./types";

export interface WeekLineTotal {
  date: string; // 주일 YYYY-MM-DD
  line: string; // 요약표 줄 코드
  amount: number;
}

const ADJ = "adj|";
export const isAdjustment = (o: Pick<Offering, "importKey">) => !!o.importKey?.startsWith(ADJ);
export const ADJ_NOTE = "명단 없는 총액 (출납 기장 기준)";

const ymd = (v: unknown): string | null => {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return null;
};
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * `기장` 시트 격자 → 주·줄별 총액.
 * 찾는 것: 날짜가 가로로 늘어선 줄(주일 열), '(헌금예산)' 이 적힌 칸(과목 이름 열), 그 두 칸 왼쪽의 구역 표시(해외선교 등).
 */
export function readCashbookTotals(grid: unknown[][], categories: IncomeCategory[]): { totals: WeekLineTotal[]; unknown: string[] } {
  const dateRow = grid.findIndex((r) => (r ?? []).filter((c) => ymd(c)).length >= 2);
  const start = grid.findIndex((r) => (r ?? []).some((c) => typeof c === "string" && c.replace(/\s/g, "") === "(헌금예산)"));
  if (dateRow < 0 || start < 0) return { totals: [], unknown: [] };
  const labelCol = grid[start].findIndex((c) => typeof c === "string" && c.replace(/\s/g, "") === "(헌금예산)");
  const sectionCol = Math.max(0, labelCol - 2);
  // 2025년 파일은 날짜 칸의 '해'가 틀려 있었음(보이는 건 "1월 5일"인데 속은 2024·2023년) → 시트의 "2025년" 표시를 따름
  const yearCell = grid.slice(0, dateRow + 1).flat().find((c) => typeof c === "string" && /^\s*\d{4}\s*년\s*$/.test(c)) as string | undefined;
  const sheetYear = yearCell ? yearCell.replace(/\D/g, "") : null;
  const dateCols = (grid[dateRow] ?? []).map((c, i) => [i, ymd(c)] as const).filter(([, d]) => d)
    .map(([i, d]) => [i, sheetYear ? sheetYear + d!.slice(4) : d]) as [number, string][];
  const lineOf = new Map(categories.map((c) => [c.code, c.line]));

  const totals: WeekLineTotal[] = [];
  const unknown: string[] = [];
  let section = "";
  for (let r = start + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const sec = String(row[sectionCol] ?? "").replace(/\s/g, "");
    if (sec === "해외선교") section = "M";
    const label = String(row[labelCol] ?? "").replace(/\s/g, "");
    if (!label || label === "계" || label === "합") continue;
    if (label === "해외선교비") break; // 그 아래는 월별 해외선교 요약표
    if (section === "M" && label === "지출") continue;
    let code: string | null;
    if (section === "M") code = label === "수입" ? "M-MISSION" : label.includes("네팔") || label.includes("구호") ? "M-RELIEF" : null;
    else code = mapCategory(label);
    const line = code ? lineOf.get(code) : undefined;
    if (!line) { unknown.push(label); continue; }
    for (const [c, date] of dateCols) {
      const amount = num(row[c]);
      if (amount > 0) totals.push({ date, line, amount });
    }
  }
  return { totals, unknown };
}

export interface AdjustmentPlan {
  adds: { date: string; categoryCode: string; amount: number; importKey: string }[];
  removeIds: string[]; // 예전에 넣은 보정 기록 (다시 계산하므로 지움)
  over: { date: string; line: string; named: number; book: number }[]; // 명단 합계가 장부보다 큰 주 (확인 필요)
  matched: number; // 명단 합계와 장부가 딱 맞는 주·줄 수
}

/** 줄마다 보정 기록을 넣을 과목: 줄과 코드가 같은 과목, 없으면 그 줄의 숨김 과목(감사헌금(구분없음)) */
function adjustmentCategory(line: string, categories: IncomeCategory[]): string {
  const same = categories.find((c) => c.code === line);
  if (same) return same.code;
  const inLine = categories.filter((c) => c.line === line);
  return (inLine.find((c) => !c.active) ?? inLine[0]).code;
}

export function planAdjustments(totals: WeekLineTotal[], offerings: Offering[], categories: IncomeCategory[]): AdjustmentPlan {
  const years = new Set(totals.map((t) => t.date.slice(0, 4)));
  const lineOf = new Map(categories.map((c) => [c.code, c.line]));
  const named = new Map<string, number>();
  for (const o of offerings) {
    if (o.deleted || isAdjustment(o) || o.transferId) continue; // 과목 이동은 장부 주별 칸과 따로 (연 누계에서만 옮겨짐)
    const k = `${o.date}|${lineOf.get(o.categoryCode)}`;
    named.set(k, (named.get(k) ?? 0) + o.amount);
  }
  const plan: AdjustmentPlan = {
    adds: [],
    // 이 장부가 다루는 해의 것만 다시 계산 (작년 파일을 넣어도 올해 것은 그대로)
    removeIds: offerings.filter((o) => !o.deleted && isAdjustment(o) && years.has(o.date.slice(0, 4))).map((o) => o.id),
    over: [],
    matched: 0,
  };
  for (const t of totals) {
    const have = named.get(`${t.date}|${t.line}`) ?? 0;
    const diff = t.amount - have;
    if (diff > 0) plan.adds.push({ date: t.date, categoryCode: adjustmentCategory(t.line, categories), amount: diff, importKey: `${ADJ}${t.date}|${t.line}` });
    else if (diff < 0) plan.over.push({ date: t.date, line: t.line, named: have, book: t.amount });
    else plan.matched++;
  }
  return plan;
}

export interface ManualCorrection {
  line: string;
  label: string;
  amount: number; // 연 누계 수식에 손으로 더하거나 뺀 금액 (+/-)
  formula: string;
}

/**
 * 연 누계 칸(과목 이름 두 칸 오른쪽) 수식에 손으로 넣은 숫자 찾기. 예: =SUM(L21+…)-617000
 * 주별 칸에는 없는 금액이라, 그대로 두면 앱 합계와 엑셀 합계가 달라진다 → 화면에 알리고 고객에게 확인.
 */
export function findManualCorrections(grid: unknown[][], formulas: (string | null)[][], categories: IncomeCategory[]): ManualCorrection[] {
  const start = grid.findIndex((r) => (r ?? []).some((c) => typeof c === "string" && c.replace(/\s/g, "") === "(헌금예산)"));
  if (start < 0) return [];
  const labelCol = grid[start].findIndex((c) => typeof c === "string" && c.replace(/\s/g, "") === "(헌금예산)");
  const lineOf = new Map(categories.map((c) => [c.code, c.line]));
  const out: ManualCorrection[] = [];
  for (let r = start + 1; r < grid.length; r++) {
    const label = String(grid[r]?.[labelCol] ?? "").replace(/\s/g, "");
    if (label === "해외선교비") break;
    const f = formulas[r]?.[labelCol + 2];
    const m = f?.match(/\)\s*([-+])\s*(\d+(?:\.\d+)?)\s*$/);
    if (!m) continue;
    const code = mapCategory(label);
    out.push({ line: (code && lineOf.get(code)) || label, label, amount: (m[1] === "-" ? -1 : 1) * Number(m[2]), formula: f! });
  }
  return out;
}

/** 기억해 둔 장부 총액에 새 파일의 총액을 합침: 새 파일이 다루는 해는 바꾸고, 다른 해는 그대로 */
export function mergeBookTotals(saved: WeekLineTotal[] | undefined, fresh: WeekLineTotal[]): WeekLineTotal[] {
  const years = new Set(fresh.map((t) => t.date.slice(0, 4)));
  return [...(saved ?? []).filter((t) => !years.has(t.date.slice(0, 4))), ...fresh];
}
