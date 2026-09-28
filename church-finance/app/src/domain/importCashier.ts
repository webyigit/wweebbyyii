// 출납 주간 파일(★ MM-DD_수입지출내역) → 지출·예산·고정지출 규칙·전년 이월.
// 부서 시트 12장의 지출 명세, 특별헌금 시트의 지출, 해외선교 시트의 월별 송금, 고정지출 시트, 총 시트의 이월을 읽는다.
import * as XLSX from "xlsx";
import { sundayOf } from "./dates";
import { DEFAULT_EXPENSE_ITEMS, DEPARTMENTS, findExpenseItem } from "./expenseCategories";
import type { ExpenseItem } from "./types";

type Grid = unknown[][]; // grid[행][열], 열 0 = A (시트 범위가 B열부터여도 절대 위치)

function absGrid(ws: XLSX.WorkSheet): Grid {
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const g: Grid = [];
  for (let r = 0; r <= range.e.r; r++) {
    const row: unknown[] = [];
    for (let c = 0; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      row.push(cell ? (cell.t === "d" ? cell.v : cell.v ?? null) : null);
    }
    g.push(row);
  }
  return g;
}
const s = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const ns = (v: unknown) => s(v).replace(/\s/g, "");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const ymd = (v: unknown): string => {
  if (!(v instanceof Date) || isNaN(v.getTime())) return "";
  const d = new Date(v.getTime() + 12 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

export interface CashierExpense {
  date: string; // 주일 (보고 주)
  spentOn: string; // 엑셀에 적힌 날짜
  itemCode: string;
  amount: number;
  description: string;
  payee?: string;
  where: string; // 엑셀 위치 (안내용)
}
export interface CashierRule { weekOfMonth: number; description: string; amount: number; itemCode: string; payee?: string }
export interface CashierImport {
  expenses: CashierExpense[];
  budgets: { code: string; amount: number }[];
  rules: CashierRule[];
  openings: { key: string; amount: number }[];
  /** 엑셀이 스스로 적어 둔 합계 (대조용): 부서별 지출, 특별헌금별 지출, 해외선교 지출 */
  sheetTotals: { key: string; label: string; amount: number }[];
  unknown: string[]; // 과목을 못 찾은 것
  notes: string[]; // 알아서 맞춘 것 (환입 등) — 화면에 알림
}

/** 해마다 시트 이름이 조금씩 다름 (2025 총계정원장: 관리·재정·장년교육·선교부) */
const SHEET_ALIASES: Record<string, string[]> = {
  "FACILITY": ["관리"], "FINANCE": ["재정"], "ADULT-EDU": ["장년교육"], "MISSION-DOM": ["선교부", "선교"],
};

export function readCashierWorkbook(data: ArrayBuffer | Uint8Array, items: ExpenseItem[] = DEFAULT_EXPENSE_ITEMS): CashierImport | null {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const sheet = (name: string) => {
    const k = wb.SheetNames.find((x) => ns(x) === ns(name));
    return k ? absGrid(wb.Sheets[k]) : null;
  };
  const book = sheet("기장");
  // 출납 파일(주간) 또는 한 해 묶음 파일(총계정원장): 기장 시트 + 고정지출이나 부서 시트
  const deptSheet = (d: (typeof DEPARTMENTS)[number]) => [d.sheet, ...(SHEET_ALIASES[d.code] ?? [])].map(sheet).find(Boolean) ?? null;
  if (!book || !(sheet("고정지출") || DEPARTMENTS.some((d) => deptSheet(d)))) return null;
  // 파일의 해(연도): 기장 시트 날짜 줄에서
  // "2026년" 같은 표시가 있으면 그것 (2025년 파일은 날짜 칸 속 해가 틀려 있었음), 없으면 첫 날짜의 해
  const yearLabel = book.slice(0, 5).flat().find((c) => typeof c === "string" && /^\s*\d{4}\s*년\s*$/.test(c)) as string | undefined;
  const firstDate = book.flat().find((c) => c instanceof Date) as Date | undefined;
  const year = yearLabel ? Number(yearLabel.replace(/\D/g, "")) : firstDate ? Number(ymd(firstDate).slice(0, 4)) : new Date().getFullYear();

  const out: CashierImport = { expenses: [], budgets: [], rules: [], openings: [], sheetTotals: [], unknown: [], notes: [] };
  // 날짜 칸: 날짜 값, 또는 2025년 파일처럼 "4월 13일" 글자
  const dateOf = (v: unknown): string => {
    const d = ymd(v);
    if (d) return d;
    const m = s(v).match(/^(\d{1,2})\s*월\s*(\d{1,2})\s*일$/);
    return m ? `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : "";
  };
  const isCol = (c: unknown, ...names: string[]) => names.includes(ns(c));

  // ── 부서 시트: 항목 블록 [번호 | 항목 | 예산 | 지출 | 잔액] → [일자 | 내용 | 지출 | 잔액 | 비고] …
  for (const dept of DEPARTMENTS) {
    const g = deptSheet(dept);
    if (!g) { out.unknown.push(`시트 없음: ${dept.sheet}`); continue; }
    // 부서 합계 (4행 근처: 예산 합, 지출 합)
    // 머리글: '구분'(2025년 파일은 '구'와 '분'이 두 줄로 나뉨) … '예산'
    const head = g.findIndex((r) => r.some((c) => ns(c) === "구분" || ns(c) === "구") && r.some((c) => ns(c).includes("예산")));
    let summaryEnd = 0; // 요약 표(항목별 예산) 끝 줄 — 명세 블록은 그 아래부터
    if (head >= 0) {
      const cBudget = g[head].findIndex((c) => ns(c).includes("예산"));
      const cSpent = g[head].findIndex((c) => isCol(c, "지출", "지출액"));
      out.sheetTotals.push({ key: `dept:${dept.code}`, label: dept.name, amount: n(g[head + 1]?.[cSpent]) });
      // 항목별 예산 (머리글 아래 번호 붙은 줄들)
      for (let r = head + 2; r < g.length; r++) {
        const row = g[r];
        const no = row.find((c) => typeof c === "number");
        const name = row.find((c, i) => i > 0 && typeof c === "string" && ns(c));
        if (typeof no !== "number" || !name) break;
        summaryEnd = r + 1;
        const it = findExpenseItem(dept.sheet, s(name), items);
        if (it) out.budgets.push({ code: it.code, amount: n(row[cBudget]) });
        else out.unknown.push(`${dept.name} 예산 항목: ${s(name)}`);
      }
    }
    // 명세 블록: [번호 | 항목 | 예산 …] 제목 줄 → (머리글 줄: 일자 | 내용 | 지출 | 잔액 | 비고 — 비어 있는 블록도 있음) → 날짜 줄들
    // 머리글이 없으면 표준 위치(B 일자, C 내용, D 지출, F 비고)를 쓴다. 실제 파일에 머리글 없는 블록이 4개 있었음.
    for (let r = Math.max(1, summaryEnd); r < g.length - 1; r++) {
      const t = g[r];
      const no = t[0], title = t[1];
      if (typeof no !== "number" || typeof title !== "string" || !ns(title)) continue;
      let first = r + 1;
      let [cDate, cDesc, cAmt, cNote] = [1, 2, 3, 5];
      const hdr = g[r + 1];
      if (hdr.some((c) => isCol(c, "일자", "날짜"))) {
        cDate = hdr.findIndex((c) => isCol(c, "일자", "날짜"));
        cDesc = hdr.findIndex((c) => isCol(c, "내용", "적요"));
        cAmt = hdr.findIndex((c) => isCol(c, "지출", "지출액"));
        cNote = hdr.findIndex((c) => isCol(c, "비고"));
        first = r + 2;
      } else {
        // 머리글 자리가 비어 있음 (오른쪽 먼 칸에 메모가 있을 수 있어 일자 칸만 본다): 날짜가 나올 때까지 최대 2줄 건너뜀
        while (first < r + 3 && !dateOf(g[first]?.[cDate]) && (g[first]?.[cDate] == null || g[first]?.[cDate] === "")) first++;
      }
      if (!dateOf(g[first]?.[cDate])) {
        // 명세가 한 줄도 없는 블록이거나 요약 표의 줄 — 요약에 지출이 있다고 적혀 있는데 명세가 없으면 알림
        if (n(t[3]) > 0 && r >= summaryEnd) out.unknown.push(`${dept.name} ${s(title)}: 요약에는 지출 ${n(t[3]).toLocaleString()}원인데 명세 줄을 못 찾음`);
        continue;
      }
      const it = findExpenseItem(dept.sheet, s(title), items);
      if (!it) { out.unknown.push(`${dept.name} 항목: ${s(title)}`); continue; }
      let lastDate = "";
      let refund: { date: string; desc: string; row: number } | null = null;
      const lines: CashierExpense[] = [];
      for (let k = first; k < g.length; k++) {
        const row = g[k];
        const amt = n(row[cAmt]);
        let d = dateOf(row[cDate]);
        // 날짜 칸이 빈 줄: 내용과 금액이 있으면 윗줄과 같은 날 (2025년 파일에 있었음), 아니면 블록 끝
        if (!d) {
          if (lastDate && s(row[cDesc]) && amt > 0) d = lastDate;
          else break;
        }
        lastDate = d;
        if (/환입|환급|반환/.test(s(row[cDesc]))) refund = { date: d, desc: s(row[cDesc]), row: k + 1 };
        if (amt === 0) continue;
        lines.push({ date: sundayOf(d), spentOn: d, itemCode: it.code, amount: amt, description: s(row[cDesc]) || it.name, payee: s(row[cNote]) || undefined, where: `${dept.sheet} ${k + 1}행` });
      }
      out.expenses.push(...lines);
      // 블록 제목 줄의 지출 합계가 기준. 명세 합과 다르면 (예: 수식에 '-934990' 처럼 환입을 직접 빼 둠) 차이를 한 줄로 넣어 맞춤
      const blockTotal = t[3];
      const diff = typeof blockTotal === "number" ? Math.round(blockTotal - lines.reduce((a, e) => a + e.amount, 0)) : 0;
      if (diff !== 0 && lastDate) {
        const at = refund ?? { date: lastDate, desc: "엑셀 합계와 차이", row: 0 };
        out.expenses.push({ date: sundayOf(at.date), spentOn: at.date, itemCode: it.code, amount: diff, description: diff < 0 ? `환입: ${at.desc}` : `합계 보정: ${at.desc}`, where: `${dept.sheet} ${at.row || r + 1}행` });
        out.notes.push(`${dept.name} ${s(title)}: 엑셀 합계가 명세보다 ${diff.toLocaleString()}원 → 그대로 반영${refund ? ` (${refund.desc})` : ""}`);
      }
    }
  }

  // ── 특별헌금 시트: 헌금별 블록, 지출 칸만 (수입은 헌금 기록으로 따로 들어옴)
  const sp = sheet("특별헌금");
  const potCode: Record<string, string> = { 이웃사랑헌금: "X-S-NEIGHBOR", 꽃꽃이헌금: "X-S-FLOWER", 꽃꽂이헌금: "X-S-FLOWER", "건축(E/V)헌금": "X-S-BUILD", 소원예물: "X-S-WISH", 보험금수령: "X-S-INSURANCE" };
  const potLine: Record<string, string> = { "X-S-NEIGHBOR": "S-NEIGHBOR", "X-S-FLOWER": "S-FLOWER", "X-S-BUILD": "S-BUILD", "X-S-WISH": "S-WISH", "X-S-INSURANCE": "S-INSURANCE" };
  if (sp) {
    for (let r = 1; r < sp.length; r++) {
      const hdr = sp[r];
      // 머리글: 2026 [일자 | 내용 | 지출 …], 2025 [날짜 | 적요 | 전년이월 | 수입액 | 지출액 | 잔액 | 비고] (수입·지출이 한 목록)
      const cDate = hdr.findIndex((c) => isCol(c, "일자", "날짜"));
      if (cDate < 0 || !hdr.some((c) => isCol(c, "지출", "지출액"))) continue;
      const cDesc = hdr.findIndex((c) => isCol(c, "내용", "적요"));
      const cOut = hdr.findIndex((c) => isCol(c, "지출", "지출액"));
      const cNote = hdr.findIndex((c) => isCol(c, "비고"));
      const title = ns(sp[r - 1].find((c, i) => i > 0 && typeof c === "string" && ns(c)));
      if (!title && !sp[r - 1].some((c, i) => i >= 2 && n(c) > 0)) continue; // 이름도 금액도 없는 빈 블록 (번호만 있음)
      const code = potCode[title] ?? (title.includes("건축") ? "X-S-BUILD" : title.includes("이웃사랑") ? "X-S-NEIGHBOR" : title.includes("꽃") ? "X-S-FLOWER" : undefined);
      if (!code) { out.unknown.push(`특별헌금 블록: ${title}`); continue; }
      let total = 0;
      for (let k = r + 1; k < sp.length; k++) {
        const d = dateOf(sp[k][cDate]);
        if (!d) break;
        const amt = n(sp[k][cOut]);
        if (amt === 0) continue;
        total += amt;
        out.expenses.push({ date: sundayOf(d), spentOn: d, itemCode: code, amount: amt, description: s(sp[k][cDesc]), payee: s(sp[k][cNote]) || undefined, where: `특별헌금 ${k + 1}행` });
      }
      out.sheetTotals.push({ key: `pot:${potLine[code]}`, label: title, amount: n(sp[r - 1][cOut]) || total });
    }
    // 전년 이월: 요약 줄 [번호 | 이름 | 전년이월 | 수입 | 지출 | 잔액]
    const h = sp.findIndex((r) => r.some((c) => ns(c) === "전년이월"));
    if (h >= 0) {
      const cOpen = sp[h].findIndex((c) => ns(c) === "전년이월");
      const cSpent = sp[h].findIndex((c) => isCol(c, "지출", "지출액"));
      for (let r = h + 2; r < h + 8 && r < sp.length; r++) {
        const title = ns(sp[r].find((c, i) => i > 0 && typeof c === "string" && ns(c)));
        const code = potCode[title] ?? (title.includes("건축") ? "X-S-BUILD" : undefined);
        if (!code) continue;
        if (!out.openings.some((o) => o.key === potLine[code])) out.openings.push({ key: potLine[code], amount: n(sp[r][cOpen]) });
        // 요약에는 지출이 있는데 명세가 없는 헌금 (2025 보험금수령: 일반회계로 옮김) → 한 줄로 넣어 합계를 맞춤
        const detail = out.expenses.filter((e) => e.itemCode === code).reduce((a, e) => a + e.amount, 0);
        const gap = cSpent >= 0 ? Math.round(n(sp[r][cSpent]) - detail) : 0;
        if (gap !== 0) {
          out.expenses.push({ date: sundayOf(`${year}-01-05`), spentOn: `${year}-01-05`, itemCode: code, amount: gap, description: `${title} 옮김 (요약표 기준, 명세 없음)`, where: `특별헌금 ${r + 1}행` });
          out.notes.push(`특별헌금 ${title}: 명세 없이 요약표에만 지출 ${gap.toLocaleString()}원 → 연초 한 줄로 넣음 (날짜 확인 필요)`);
        }
      }
    }
  }

  // ── 해외선교 (2025년 총계정원장처럼 해외선교 시트가 없는 파일): 기장 시트 아래 [적요 '해외선교비N월' | 금액 | 날짜] 목록
  if (!sheet("해외선교")) {
    for (const [r, row] of book.entries()) {
      const i = row.findIndex((c) => /^해외선교비/.test(ns(c)));
      if (i < 0) continue;
      const amt = n(row[i + 1]);
      const m = ns(row[i]).match(/(\d{1,2})월/);
      const raw = row[i + 2];
      // 날짜 칸: 날짜 값 또는 엑셀 일련번호(45690 등). 없으면 그 달 말일 무렵
      const d = dateOf(raw) || (typeof raw === "number" && raw > 40000 ? ymd(new Date(Date.UTC(1899, 11, 30) + raw * 86400000)) : "")
        || (m ? `${year}-${m[1].padStart(2, "0")}-28` : "");
      if (!amt || !d) continue;
      out.expenses.push({ date: sundayOf(d), spentOn: d, itemCode: "X-M-MISSION", amount: amt, description: s(row[i]), where: `기장 ${r + 1}행` });
      if (!/^해외선교비\d{1,2}월$/.test(ns(row[i]))) out.notes.push(`해외선교 송금 '${s(row[i])}' ${amt.toLocaleString()}원도 지출로 넣음 — 같은 달 송금과 겹치는지 확인 필요`);
    }
  }

  // ── 해외선교: 월별 선교사 송금 → 그 달에 실제로 나간 주 (검증 시트 '금주 지출' 칸의 날짜)
  const ms = sheet("해외선교");
  const check = sheet("검증");
  if (ms) {
    const hRow = ms.findIndex((r) => r.some((c) => /^\d+월$/.test(ns(c))));
    const months = hRow >= 0 ? ms[hRow].map((c, i) => [i, ns(c)] as const).filter(([, m]) => /^\d+월/.test(m)) : [];
    const payDate = new Map<number, string>(); // 월 → 송금 주일
    if (check) {
      const dRow = check.findIndex((r) => r.filter((c) => typeof c === "string" && /^\d{1,2}\/\d{1,2}$/.test(c)).length > 10);
      const outRow = check.findIndex((r) => r.some((c) => ns(c).startsWith("금주지출")));
      if (dRow >= 0 && outRow >= 0) check[dRow].forEach((c, i) => {
        if (typeof c === "string" && /^\d{1,2}\/\d{1,2}$/.test(c) && n(check[outRow][i]) > 0) {
          const [m, d] = c.split("/").map(Number);
          payDate.set(m, `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
        }
      });
    }
    const opening = ms.find((r) => r.some((c) => ns(c).includes("이월")));
    if (opening) out.openings.push({ key: "M-MISSION", amount: n(opening.find((c) => typeof c === "number")) });
    const start = ms.findIndex((r) => ns(r[1]) === "지출");
    const endRow = ms.findIndex((r, i) => i > start && r.some((c) => ns(c) === "지출합계"));
    for (let r = start; r >= 0 && r < endRow; r++) {
      const who = s(ms[r][2]).split("\n")[0];
      if (!who) continue;
      const relief = ns(who).includes("구호");
      for (const [c, label] of months) {
        const amt = n(ms[r][c]);
        if (!amt) continue;
        const m = Number(label.match(/^(\d+)/)![1]);
        const date = payDate.get(m) ?? "";
        if (!date) { out.unknown.push(`해외선교 ${label} 송금 주를 모름: ${who}`); continue; }
        out.expenses.push({ date: sundayOf(date), spentOn: date, itemCode: relief ? "X-M-RELIEF" : "X-M-MISSION", amount: amt, description: who, where: `해외선교 ${r + 1}행 ${label}` });
      }
    }
    if (endRow >= 0) out.sheetTotals.push({ key: "mission:out", label: "해외선교 지출", amount: n(ms[endRow].find((c) => typeof c === "number")) });
  }

  // ── 고정지출 규칙
  const fx = sheet("고정지출") ?? []; // 한 해 묶음 파일에는 없음
  const hFx = fx.findIndex((r) => r.some((c) => ns(c) === "구분") && r.some((c) => ns(c) === "내용"));
  if (hFx >= 0) {
    const col = (name: string) => fx[hFx].findIndex((c) => ns(c) === name);
    const [cWeek, cDesc, cAmt, cDept, cItem] = ["구분", "내용", "금액", "부서", "항목"].map(col);
    const cPayee = col("비고");
    let week = 0;
    for (let r = hFx + 1; r < fx.length; r++) {
      const row = fx[r];
      const wk = ns(row[cWeek]).match(/^(첫|둘|셋|넷|다섯)째주/);
      if (wk) week = ["첫", "둘", "셋", "넷", "다섯"].indexOf(wk[1]) + 1;
      const desc = s(row[cDesc]);
      if (ns(desc).includes("고정지출총액")) break;
      const amt = n(row[cAmt]);
      if (!desc || desc.startsWith("**") || !amt || !week) continue;
      const dept = ns(row[cDept]), itemName = s(row[cItem]);
      let code: string | undefined;
      if (dept === "특별헌금") code = potCode[ns(itemName)] ?? (ns(itemName).includes("이웃사랑") ? "X-S-NEIGHBOR" : undefined);
      else if (dept.includes("해외선교")) code = "X-M-MISSION";
      else code = findExpenseItem(dept, itemName, items)?.code;
      if (!code) { out.unknown.push(`고정지출: ${desc} (${dept} / ${itemName})`); continue; }
      out.rules.push({ weekOfMonth: week, description: desc, amount: amt, itemCode: code, payee: s(row[cPayee]) || undefined });
    }
  }

  // ── 전년 이월 (일반): 총 시트 '일반헌금' 줄의 '전년이월' 칸
  const tot = sheet("총");
  if (tot) {
    const h = tot.findIndex((r) => r.some((c) => ns(c) === "전년이월"));
    if (h >= 0) {
      const c = tot[h].findIndex((x) => ns(x) === "전년이월");
      const gRow = tot.slice(h + 1).find((r) => r.some((x) => ns(x) === "일반헌금"));
      if (gRow) out.openings.push({ key: "G", amount: n(gRow[c]) });
    }
    // 대조용: 일반 지출 합, 일반 잔액
    const cSpend = tot[h]?.findIndex((x) => ns(x) === "지출");
    const cBal = tot[h]?.findIndex((x) => ns(x) === "잔액");
    const gRow = tot.slice(h + 1).find((r) => r.some((x) => ns(x) === "일반헌금"));
    if (gRow && cSpend >= 0) out.sheetTotals.push({ key: "G:out", label: "일반 지출 (총 시트)", amount: n(gRow[cSpend]) });
    if (gRow && cBal >= 0) out.sheetTotals.push({ key: "G:balance", label: "일반 잔액 (총 시트)", amount: n(gRow[cBal]) });

    // 수입 예산 (일반헌금 줄별): '■ 일반헌금' 표 [구분 | 헌금 | 예산 | 수입 | 비율 | …]
    const ih = tot.findIndex((r) => r.some((c) => isCol(c, "수입", "수입항목")) && r.some((c) => ns(c) === "예산"));
    if (ih >= 0) {
      const cB = tot[ih].findIndex((c) => ns(c) === "예산");
      for (const r of tot.slice(ih + 1, ih + 20)) {
        const line = incomeLineOf(ns(r[cB - 1]));
        if (line && typeof r[cB] === "number" && !out.budgets.some((b) => b.code === line)) out.budgets.push({ code: line, amount: n(r[cB]) });
      }
    }
  }
  return out;
}

/** 총 시트의 헌금 이름 → 예산 줄 코드 (신년감사·추수감사처럼 '감사'가 든 이름을 먼저 가림) */
export function incomeLineOf(name: string): string | null {
  if (!name) return null;
  if (name.includes("십일조")) return "G-TITHE";
  if (name.includes("주일")) return "G-SUNDAY";
  if (name.includes("신년")) return "G-NEWYEAR";
  if (name.includes("맥추")) return "G-HARVEST1";
  if (name.includes("추수")) return "G-HARVEST2";
  if (name.includes("부활")) return "G-EASTER";
  if (name.includes("성탄")) return "G-XMAS";
  if (name.includes("기관")) return "G-DEPT";
  if (name.startsWith("감사")) return "G-THANKS";
  return null;
}

/** 같은 파일을 다시 넣어도 겹치지 않게: 내용 키 + 같은 내용 순번 */
export function expenseImportKeys(expenses: CashierExpense[]): string[] {
  const seen = new Map<string, number>();
  return expenses.map((e) => {
    const base = `x|${e.spentOn}|${e.itemCode}|${e.amount}|${e.description}`;
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    return `${base}|${k}`;
  });
}
