// 농협 거래내역 엑셀 → 입금(온라인 헌금)·출금(지출) 자동 분류.
// 입금 메모는 '이름+헌금종류' 가 붙어 온다: "영찬아현십일조"(부부 이름만), "이용훈이선아네팔구"(은행이 글자 수에서 자름), "홍길동"(종류 없음).
import * as XLSX from "xlsx";
import { addDays, fromYmd } from "./dates";
import type { DonorAlias, Expense, Household, Member, Offering } from "./types";

export interface BankTxn {
  key: string; // 같은 거래를 두 번 넣지 않기 위한 키
  at: string; // YYYY-MM-DD HH:mm:ss
  date: string; // 거래 날짜
  sunday: string; // 보고할 주일 (그 날 이후 첫 주일, 일요일이면 그날)
  withdraw: number;
  deposit: number;
  balance: number;
  content: string; // 거래내용 (입금자 메모)
  note: string; // 거래기록사항
}

const ns = (v: unknown) => (typeof v === "string" ? v.replace(/\s/g, "") : "");
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[,\s원]/g, "")) || 0 : 0);

/** 그 날 이후 첫 주일 (일요일이면 그날). 주중 온라인 입금·자동출금은 다가오는 주일 보고에 들어간다. */
export function nextSunday(ymd: string): string {
  const d = fromYmd(ymd);
  return addDays(ymd, (7 - d.getDay()) % 7);
}

function atString(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // 은행 파일 시각은 현지 시각이 그대로 적혀 있음 → UTC 로 읽힌 값을 그대로 씀
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())} ${p(v.getUTCHours())}:${p(v.getUTCMinutes())}:${p(v.getUTCSeconds())}`;
  }
  const m = String(v ?? "").match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})\s*(\d{1,2}):?(\d{2})?:?(\d{2})?/);
  if (!m) return "";
  const p = (s?: string) => String(Number(s ?? 0)).padStart(2, "0");
  return `${m[1]}-${p(m[2])}-${p(m[3])} ${p(m[4])}:${p(m[5])}:${p(m[6])}`;
}

/** 거래일시 · 출금금액 · 입금금액 · 거래후잔액 · 거래내용 머리글이 있는 시트를 찾아 읽는다 */
export function readBankWorkbook(data: ArrayBuffer | Uint8Array): BankTxn[] | null {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const h = grid.findIndex((r) => r?.some((c) => ns(c) === "거래일시") && r.some((c) => ns(c) === "입금금액"));
    if (h < 0) continue;
    const col = (label: string) => grid[h].findIndex((c) => ns(c) === label);
    const [cAt, cOut, cIn, cBal, cContent, cNote] = ["거래일시", "출금금액", "입금금액", "거래후잔액", "거래내용", "거래기록사항"].map(col);
    const txns: BankTxn[] = [];
    for (const r of grid.slice(h + 1)) {
      const at = atString(r?.[cAt]);
      if (!at) continue;
      const withdraw = num(r[cOut]), deposit = num(r[cIn]), balance = num(r[cBal]);
      if (!withdraw && !deposit) continue;
      const date = at.slice(0, 10);
      txns.push({
        key: `${at}|${withdraw}|${deposit}|${balance}`, at, date, sunday: nextSunday(date),
        withdraw, deposit, balance,
        content: String(r[cContent] ?? "").trim(), note: cNote >= 0 ? String(r[cNote] ?? "").trim() : "",
      });
    }
    return txns;
  }
  return null;
}

// ── 입금 메모 풀기 ─────────────────────────────────────────────
// 은행이 메모를 자르므로 앞부분만 있어도 알아본다 ("네팔구" → 네팔 구호)
const KEYWORDS: [RegExp, string][] = [
  [/십일조?|십일/, "G-TITHE"],
  [/범사/, "G-THANKS-BEOMSA"],
  [/일천|천번/, "G-THANKS-1000"],
  [/주일/, "G-SUNDAY"],
  [/네팔|구호/, "M-RELIEF"],
  [/해외|선교/, "M-MISSION"],
  [/이웃/, "S-NEIGHBOR"],
  [/꽃/, "S-FLOWER"],
  [/건축/, "S-BUILD"],
  [/신년/, "G-NEWYEAR"],
  [/부활/, "G-EASTER"],
  [/맥추/, "G-HARVEST1"],
  [/추수/, "G-HARVEST2"],
  [/성탄/, "G-XMAS"],
  [/감사/, "G-THANKS-ETC"],
];

export function parseDepositMemo(text: string): { namePart: string; categoryCode: string | null } {
  const t = text.replace(/\s/g, "");
  // 종류는 메모 끝에 붙는다 → 가장 뒤에 나온 낱말을 고르되, 바로 앞에 붙은 낱말이 있으면(범사+감사, 맥추+감사) 그쪽이 종류
  const hits: { i: number; end: number; code: string }[] = [];
  for (const [re, code] of KEYWORDS) {
    const g = new RegExp(re.source, "g");
    for (const m of t.matchAll(g)) if (m.index! > 0) hits.push({ i: m.index!, end: m.index! + m[0].length, code });
  }
  if (!hits.length) return { namePart: t, categoryCode: null };
  hits.sort((a, b) => b.i - a.i);
  let pick = hits[0];
  // 바로 앞에 붙은 낱말을 흡수: 같은 종류(해외+선교) 이거나, '감사' 앞의 종류(범사감사·맥추감사·추수감사·신년감사)
  for (;;) {
    const before = hits.find((h) => h.end === pick.i && (h.code === pick.code || pick.code === "G-THANKS-ETC"));
    if (!before) break;
    pick = before;
  }
  return { namePart: t.slice(0, pick.i), categoryCode: pick.code };
}

/** 가정마다 메모에 나올 수 있는 이름 모양: 전체 이름을 이어 쓴 것(순서 무관), 이름(성 뺀 것)만 이어 쓴 것, 한 사람 이름 */
function nameForms(members: Member[]): string[] {
  const full = members.map((m) => m.name);
  const given = members.map((m) => (m.name.length >= 3 ? m.name.slice(1) : m.name));
  const perms = <T,>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
  const forms = new Set<string>();
  if (members.length <= 4) {
    for (const p of perms(full)) forms.add(p.join(""));
    for (const p of perms(given)) forms.add(p.join(""));
    // 부부 두 사람만 적는 경우 (자녀가 있는 가정)
    for (let i = 0; i < members.length; i++) for (let j = 0; j < members.length; j++) if (i !== j) {
      forms.add(full[i] + full[j]); forms.add(given[i] + given[j]);
    }
  }
  for (const f of full) forms.add(f);
  return [...forms].filter((f) => f.length >= 2);
}

export function matchDepositor(
  namePart: string,
  households: Household[],
  members: Member[],
  aliases: DonorAlias[],
): { householdId: string | null; candidates: string[] } {
  const q = namePart.replace(/[\s,·.]/g, "");
  if (q.length < 2) return { householdId: null, candidates: [] };
  const hits = new Set<string>();
  const exact = new Set<string>();
  for (const h of households) {
    if (h.deleted) continue;
    const ms = members.filter((m) => m.householdId === h.id && !m.deleted);
    const forms = [...nameForms(ms), ...aliases.filter((a) => a.householdId === h.id && !a.deleted).map((a) => a.text.replace(/[\s,·.]/g, ""))];
    for (const f of forms) {
      if (f === q) exact.add(h.id);
      else if (f.startsWith(q) && q.length >= 3) hits.add(h.id); // 은행이 뒤를 자른 경우
    }
  }
  const pick = exact.size ? exact : hits;
  return { householdId: pick.size === 1 ? [...pick][0] : null, candidates: [...pick] };
}

// ── 계획 ─────────────────────────────────────────────────────
export interface DepositPlan {
  txn: BankTxn;
  categoryCode: string | null;
  householdId: string | null;
  candidates: string[];
  namePart: string;
  /** 이미 같은 주·가정·과목·금액의 헌금이 있음 (손으로 넣었거나 명단으로 들어온 것) → 새로 만들지 않고 '온라인'으로 표시만 */
  existingOfferingId?: string;
  status: "matched" | "existing" | "needs-choice";
}
export interface WithdrawPlan {
  txn: BankTxn;
  existingExpenseId?: string; // 같은 주에 같은 금액 지출이 이미 있음 → 대사 완료
  suggestedItem?: string; // 예전에 같은 거래내용을 이 항목으로 분류했음
  status: "reconciled" | "suggested" | "needs-choice";
}

export function planBank(
  txns: BankTxn[],
  data: { households: Household[]; members: Member[]; aliases: DonorAlias[]; offerings: Offering[]; expenses: Expense[]; rules: { content: string; itemCode: string }[]; seenKeys: Set<string> },
) {
  const fresh = txns.filter((t) => !data.seenKeys.has(t.key));
  const usedOff = new Set<string>();
  const usedExp = new Set<string>();
  const deposits: DepositPlan[] = fresh.filter((t) => t.deposit > 0).map((txn) => {
    const { namePart, categoryCode } = parseDepositMemo(txn.content);
    const m = matchDepositor(namePart, data.households, data.members, data.aliases);
    let existingOfferingId: string | undefined;
    if (m.householdId && categoryCode) {
      const hit = data.offerings.find((o) => !o.deleted && !usedOff.has(o.id) && o.date === txn.sunday && o.householdId === m.householdId && o.categoryCode === categoryCode && o.amount === txn.deposit);
      if (hit) { existingOfferingId = hit.id; usedOff.add(hit.id); }
    }
    const status = existingOfferingId ? "existing" : m.householdId && categoryCode ? "matched" : "needs-choice";
    return { txn, categoryCode, householdId: m.householdId, candidates: m.candidates, namePart, existingOfferingId, status };
  });
  const ruleOf = new Map(data.rules.map((r) => [r.content.replace(/\s/g, ""), r.itemCode]));
  const withdrawals: WithdrawPlan[] = fresh.filter((t) => t.withdraw > 0).map((txn) => {
    const hit = data.expenses.find((e) => !e.deleted && !usedExp.has(e.id) && e.date === txn.sunday && e.amount === txn.withdraw);
    if (hit) { usedExp.add(hit.id); return { txn, existingExpenseId: hit.id, status: "reconciled" as const }; }
    const suggestedItem = ruleOf.get(txn.content.replace(/\s/g, ""));
    return { txn, suggestedItem, status: suggestedItem ? ("suggested" as const) : ("needs-choice" as const) };
  });
  return { deposits, withdrawals, skipped: txns.length - fresh.length };
}

