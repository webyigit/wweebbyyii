// 기부금영수증 계산 — 화면·저장과 무관한 순수 계산만.
//
// 원칙
// - 영수증 금액 = 그 해 그 가정 이름으로 들어온 헌금 전부 (과목 구분 없이)
// - 가정 헌금은 신청자에게 비율대로 나눔 (1명이면 100%). 월별로 나누고 1원 단위 끝수는 마지막 사람에게
//   → 나눈 금액을 더하면 언제나 가정 합계와 원 단위까지 같다
// - 일련번호 = (기부 연도 + 1)-순번. 예) 2026년 헌금 → "2027-001"
import type { Applicant, Household, Offering, Receipt, ReceiptShare } from "./types";

export const CODE_RELIGIOUS = "41"; // 기부금 코드: 종교단체 기부금

export interface HouseholdYear { householdId: string; months: number[]; total: number }

/** 가정별 그 해 월별 헌금 */
export function householdTotals(year: number, offerings: Offering[]): Map<string, HouseholdYear> {
  const out = new Map<string, HouseholdYear>();
  const y = String(year);
  for (const o of offerings) {
    if (o.deleted || !o.householdId || !o.date.startsWith(y)) continue;
    let h = out.get(o.householdId);
    if (!h) out.set(o.householdId, (h = { householdId: o.householdId, months: Array(12).fill(0), total: 0 }));
    h.months[Number(o.date.slice(5, 7)) - 1] += o.amount;
    h.total += o.amount;
  }
  return out;
}

/** 비율 검사: 합이 100 이어야 함 */
export function sharesOk(shares: ReceiptShare[] | undefined): boolean {
  if (!shares?.length) return false;
  return Math.abs(shares.reduce((s, x) => s + x.pct, 0) - 100) < 1e-9 && shares.every((x) => x.pct > 0);
}

/** 한 금액을 비율대로 나누되 합이 정확히 맞게 (끝수는 마지막 사람) */
export function splitAmount(amount: number, pcts: number[]): number[] {
  const out = pcts.map((p) => Math.floor((amount * p) / 100));
  out[out.length - 1] += amount - out.reduce((s, v) => s + v, 0);
  return out;
}

export interface ApplicantYear {
  applicantId: string;
  months: number[];
  amount: number;
  sources: { householdId: string; pct: number; amount: number }[];
}

export interface ReceiptPlan {
  byApplicant: Map<string, ApplicantYear>;
  /** 헌금은 있는데 신청자가 없거나 비율이 틀린 가정 */
  unassigned: { householdId: string; total: number; reason: "none" | "badShares" }[];
}

export function planReceipts(year: number, offerings: Offering[], households: Household[]): ReceiptPlan {
  const totals = householdTotals(year, offerings);
  const byId = new Map(households.filter((h) => !h.deleted).map((h) => [h.id, h]));
  const byApplicant = new Map<string, ApplicantYear>();
  const unassigned: ReceiptPlan["unassigned"] = [];
  for (const t of totals.values()) {
    if (t.total === 0) continue;
    const h = byId.get(t.householdId);
    const shares = h?.receiptShares;
    if (!shares?.length) { unassigned.push({ householdId: t.householdId, total: t.total, reason: "none" }); continue; }
    if (!sharesOk(shares)) { unassigned.push({ householdId: t.householdId, total: t.total, reason: "badShares" }); continue; }
    const perMonth = t.months.map((m) => splitAmount(m, shares.map((s) => s.pct)));
    shares.forEach((s, i) => {
      let a = byApplicant.get(s.applicantId);
      if (!a) byApplicant.set(s.applicantId, (a = { applicantId: s.applicantId, months: Array(12).fill(0), amount: 0, sources: [] }));
      let sum = 0;
      perMonth.forEach((parts, m) => { a!.months[m] += parts[i]; sum += parts[i]; });
      a.amount += sum;
      a.sources.push({ householdId: t.householdId, pct: s.pct, amount: sum });
    });
  }
  unassigned.sort((a, b) => b.total - a.total);
  return { byApplicant, unassigned };
}

export const serialPrefix = (year: number) => String(year + 1);

/** 다음 일련번호. 폐기한 번호도 건너뛴다 (대장에 번호가 비지 않게) */
export function nextSerials(year: number, receipts: Receipt[], count: number): string[] {
  const p = serialPrefix(year) + "-";
  let max = 0;
  for (const r of receipts) if (!r.deleted && r.serial.startsWith(p)) max = Math.max(max, Number(r.serial.slice(p.length)) || 0);
  return Array.from({ length: count }, (_, i) => p + String(max + 1 + i).padStart(3, "0"));
}

export type ReceiptStatus = "notIssued" | "issued" | "changed";

/** 신청자별 상태: 아직 / 발급됨 / 발급 후 금액이 바뀜(헌금이 뒤늦게 들어오거나 고쳐짐) */
export function statusOf(applicantId: string, amount: number, year: number, receipts: Receipt[]): { status: ReceiptStatus; receipt?: Receipt } {
  const r = receipts.filter((x) => !x.deleted && x.year === year && x.applicantId === applicantId && x.status === "issued").sort((a, b) => b.serial.localeCompare(a.serial))[0];
  if (!r) return { status: "notIssued" };
  return { status: r.amount === amount ? "issued" : "changed", receipt: r };
}

// ── 번호 검사 ─────────────────────────────────────────

/** 주민등록번호: 숫자 13자리 (띄어쓰기·하이픈 무시). 형식만 봄 (2020년 이후 번호는 검증숫자가 없음) */
export function normalizeRrn(s: string): string | null {
  const d = s.replace(/[^0-9]/g, "");
  if (d.length !== 13) return null;
  const mm = Number(d.slice(2, 4)), dd = Number(d.slice(4, 6)), g = Number(d[6]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || g < 1 || g > 8) return null;
  return `${d.slice(0, 6)}-${d.slice(6)}`;
}
export const maskRrn = (rrn: string) => rrn.slice(0, 8) + "******";

/** 사업자등록번호: 10자리 + 검증숫자 */
export function normalizeBizNo(s: string): string | null {
  const d = s.replace(/[^0-9]/g, "");
  if (d.length !== 10) return null;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * w[i];
  sum += Math.floor((Number(d[8]) * 5) / 10);
  if ((10 - (sum % 10)) % 10 !== Number(d[9])) return null;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

export const isCorpName = (name: string) => /㈜|\(주\)|주식회사|법인|재단|유한회사|사단/.test(name);

// ── 예전 발급대장(엑셀) 읽기 ───────────────────────────

export interface LedgerRow {
  sheet: string;
  kind: "person" | "corp";
  serial: string;
  name: string;
  idText: string; // 주민번호 또는 사업자번호 (원문 — 화면에만, 저장 전에 금고로 잠금)
  address: string;
  amount: number;
  issuedAt: string;
  note: string;
  void: boolean;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
function ymd(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}
const amt = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[,\s원]/g, "")) || 0);

/**
 * 시트 격자(2차원 배열)에서 발급대장 줄을 찾는다. 머리글(일련번호·이름·금액)로 열을 찾으므로 열 순서가 달라도 읽힘.
 * 한 시트에 표가 여러 개(인쇄용 페이지마다 머리글 반복)여도 됨.
 */
export function readLedgerGrid(sheet: string, grid: unknown[][]): LedgerRow[] {
  const out: LedgerRow[] = [];
  let col: Record<string, number> | null = null;
  for (const row of grid) {
    const cells = row.map((c) => String(c ?? "").replace(/\s+/g, ""));
    const iSerial = cells.indexOf("일련번호");
    if (iSerial >= 0 && cells.some((c) => c === "이름" || c === "성명")) {
      const find = (...names: string[]) => cells.findIndex((c) => names.includes(c));
      col = {
        serial: iSerial,
        name: find("이름", "성명"),
        kind: find("구분", "개인/법인구분"),
        id: find("생년월일", "주민등록번호", "주민번호"),
        address: find("주소"),
        amount: find("금액", "발급금액"),
        issuedAt: find("발급일자", "발급일"),
        note: find("비고", "확인"),
      };
      continue;
    }
    if (!col) continue;
    const get = (k: string) => (col![k] >= 0 ? row[col![k]] : undefined);
    const serial = String(get("serial") ?? "").trim();
    const name = String(get("name") ?? "").trim();
    if (!/^\d{4}-\d{1,4}$/.test(serial) || !name) continue;
    // 비고는 표 오른쪽 바깥 칸에 적힌 경우도 있어 줄 끝까지 모음
    const noteParts = [String(get("note") ?? "")];
    for (let i = Math.max(...Object.values(col)) + 1; i < row.length; i++) if (row[i] != null && row[i] !== "") noteParts.push(String(row[i]));
    const note = noteParts.map((s) => s.trim()).filter(Boolean).join(" / ");
    const kindText = String(get("kind") ?? "");
    const amount = amt(get("amount"));
    out.push({
      sheet, serial, name,
      kind: kindText.includes("법인") || isCorpName(name) ? "corp" : "person",
      idText: String(get("id") ?? "").trim(),
      address: String(get("address") ?? "").trim(),
      amount,
      issuedAt: ymd(get("issuedAt")),
      note,
      void: /폐기|삭제|취소/.test(note) || amount === 0,
    });
  }
  return out;
}

/** 고른 시트들의 줄을 일련번호 기준으로 합침 (같은 번호가 두 번 나오면 금액·날짜가 채워진 쪽) */
export function mergeLedger(rows: LedgerRow[]): LedgerRow[] {
  const by = new Map<string, LedgerRow>();
  const score = (r: LedgerRow) => (r.amount ? 2 : 0) + (r.issuedAt ? 1 : 0) + (r.void ? 0 : 1);
  for (const r of rows) {
    const old = by.get(r.serial);
    if (!old || score(r) > score(old)) by.set(r.serial, r);
  }
  return [...by.values()].sort((a, b) => a.serial.localeCompare(b.serial));
}

/**
 * 시트마다 요약 (일련번호 앞자리별 건수). 같은 해 대장이 초안·백업 시트에 겹쳐 있는 경우가 많아
 * 발급 연도마다 '제대로 된 건이 가장 많은 시트' 하나를 기본으로 고른다.
 */
export function summarizeLedgerSheets(rows: LedgerRow[]) {
  const sheets = new Map<string, { sheet: string; prefix: string; count: number; valid: number }>();
  for (const r of rows) {
    const prefix = r.serial.slice(0, 4);
    const k = `${r.sheet}|${prefix}`;
    const s = sheets.get(k) ?? { sheet: r.sheet, prefix, count: 0, valid: 0 };
    s.count++;
    if (!r.void && r.issuedAt) s.valid++;
    sheets.set(k, s);
  }
  const list = [...sheets.values()];
  const best = new Map<string, string>();
  for (const s of list) {
    const cur = list.find((x) => x.prefix === s.prefix && `${x.sheet}|${x.prefix}` === best.get(s.prefix));
    if (!cur || s.valid > cur.valid) best.set(s.prefix, `${s.sheet}|${s.prefix}`);
  }
  return list.map((s) => ({ ...s, key: `${s.sheet}|${s.prefix}`, chosen: best.get(s.prefix) === `${s.sheet}|${s.prefix}` }));
}

/** 발급대장 줄 → 신청자 후보 (같은 이름+같은 번호는 한 사람) */
export function applicantKey(r: { name: string; idText: string }) {
  return `${r.name.replace(/\s+/g, "")}|${r.idText.replace(/[^0-9]/g, "")}`;
}

/**
 * 신청자 → 가정 자동 연결 제안.
 *  - 신청자 이름이 한 가정의 구성원 이름과 같으면 그 가정
 *  - 한 가정에 신청자가 여럿이면 최근 발급 금액 비율로 나눔 (예: 60% / 40%)
 *  - 이름이 가정 명단에 없거나 여러 가정에 있으면 연결하지 않고 '확인 필요'
 */
export function suggestShares(
  applicants: (Pick<Applicant, "id" | "name">)[],
  lastAmount: Map<string, number>,
  households: Household[],
  members: { householdId: string; name: string; deleted?: boolean }[],
): { shares: Map<string, ReceiptShare[]>; unmatched: string[] } {
  const hhOf = new Map<string, Set<string>>();
  for (const m of members) if (!m.deleted) {
    const set = hhOf.get(m.name) ?? new Set();
    set.add(m.householdId);
    hhOf.set(m.name, set);
  }
  for (const h of households) if (!h.deleted && !hhOf.has(h.name)) hhOf.set(h.name, new Set([h.id]));
  const perHh = new Map<string, string[]>();
  const unmatched: string[] = [];
  for (const a of applicants) {
    const set = hhOf.get(a.name.replace(/\s+/g, ""));
    if (!set || set.size !== 1) { unmatched.push(a.id); continue; }
    const hid = [...set][0];
    perHh.set(hid, [...(perHh.get(hid) ?? []), a.id]);
  }
  const shares = new Map<string, ReceiptShare[]>();
  for (const [hid, ids] of perHh) {
    if (ids.length === 1) { shares.set(hid, [{ applicantId: ids[0], pct: 100 }]); continue; }
    const amounts = ids.map((id) => lastAmount.get(id) ?? 0);
    const total = amounts.reduce((s, v) => s + v, 0);
    const pcts = total > 0 ? amounts.map((v) => Math.round((v * 100) / total)) : ids.map(() => Math.floor(100 / ids.length));
    pcts[pcts.length - 1] += 100 - pcts.reduce((s, v) => s + v, 0);
    shares.set(hid, ids.map((id, i) => ({ applicantId: id, pct: pcts[i] })).filter((s) => s.pct > 0));
  }
  return { shares, unmatched };
}

// ── 금액을 한글로 (영수증에 쓰는 경우) ────────────────
export function wonKorean(n: number): string {
  if (n === 0) return "영";
  const digits = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
  const small = ["", "십", "백", "천"];
  const big = ["", "만", "억", "조"];
  let out = "";
  let group = 0;
  while (n > 0) {
    const part = n % 10000;
    if (part) {
      let s = "";
      let p = part;
      for (let i = 0; i < 4 && p > 0; i++, p = Math.floor(p / 10)) {
        const d = p % 10;
        if (d) s = digits[d] + small[i] + s;
      }
      out = s + big[group] + out;
    }
    n = Math.floor(n / 10000);
    group++;
  }
  return out;
}
