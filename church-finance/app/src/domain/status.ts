// 재정 현황: 통장 잔액 대사, 차입 현황, 과목 이동 — 계산만.
// 엑셀 `총` 시트 오른쪽(통장 잔액)·왼쪽 아래(차입현황), 연 누계 수식 속 손 보정(과목 이동)을 대신한다.
import type { BankTxn } from "./bank";
import type { IncomeCategory, Offering, Row } from "./types";

// ── 통장·현금 ───────────────────────────────────────────

export interface Account extends Row {
  name: string; // 예: 농협 일반통장, 현금, 입금 예정 현금
  kind: "bank" | "cash" | "saving" | "fx" | "other";
  inBook: boolean; // 장부 잔액과 맞춰 볼 돈인가 (적금·외화처럼 장부 밖이면 false)
  fromBankFile?: boolean; // 잔액을 올린 통장 거래내역(거래후잔액)에서 자동으로
  number?: string; // 계좌번호 (기기·클라우드에만)
  balances: { date: string; amount: number }[]; // 손으로 넣은 잔액 기록
  note?: string;
  sort: number;
}

/** 기준일의 잔액: 통장 파일 계좌면 그날까지 마지막 거래의 거래후잔액, 아니면 그날까지 마지막으로 적은 값 */
export function balanceAt(a: Account, date: string, txns: Pick<BankTxn, "date" | "at" | "balance">[]): { amount: number; asOf: string | null; source: "file" | "manual" | "none" } {
  if (a.fromBankFile) {
    const last = txns.filter((t) => t.date <= date).sort((x, y) => x.at.localeCompare(y.at)).pop();
    if (last) return { amount: last.balance, asOf: last.date, source: "file" };
  }
  const m = [...a.balances].filter((b) => b.date <= date).sort((x, y) => x.date.localeCompare(y.date)).pop();
  return m ? { amount: m.amount, asOf: m.date, source: "manual" } : { amount: 0, asOf: null, source: "none" };
}

export interface Reconcile {
  rows: { account: Account; amount: number; asOf: string | null; source: string }[];
  accounts: number; // 장부와 맞춰 보는 돈의 합
  book: number; // 장부 잔액 (일반+특별+해외선교)
  diff: number; // 통장 − 장부 (0 이면 맞음)
  stale: string[]; // 기준일보다 한참(14일) 전 잔액인 계좌
}

export function reconcile(date: string, accounts: Account[], txns: Pick<BankTxn, "date" | "at" | "balance">[], book: number): Reconcile {
  const rows = accounts.filter((a) => !a.deleted).sort((a, b) => a.sort - b.sort).map((a) => ({ account: a, ...balanceAt(a, date, txns) }));
  const inBook = rows.filter((r) => r.account.inBook);
  const total = inBook.reduce((s, r) => s + r.amount, 0);
  const daysBefore = (d: string) => (Date.parse(date) - Date.parse(d)) / 86400000;
  const stale = inBook.filter((r) => !r.asOf || daysBefore(r.asOf) > 14).map((r) => r.account.name);
  return { rows, accounts: total, book, diff: total - book, stale };
}

// ── 차입 ────────────────────────────────────────────────

export interface Loan extends Row {
  lender: string; // 예: 수협은행, 해외선교헌금(내부 차입)
  internal: boolean; // 교회 안의 다른 회계에서 빌림
  rate?: number; // 연 이율 %
  events: { date: string; kind: "borrow" | "repay"; amount: number; note?: string }[];
  note?: string;
}

export function loanBalance(l: Loan, date: string): number {
  return l.events.filter((e) => e.date <= date).reduce((s, e) => s + (e.kind === "borrow" ? e.amount : -e.amount), 0);
}

// ── 과목 이동 ───────────────────────────────────────────
// 헌금을 다른 과목(다른 회계 포함)으로 옮김. 헌금 기록 두 줄(보내는 과목 −, 받는 과목 +)로 남겨서
// 모든 보고서(주간·연 누계·결산)가 따로 손대지 않아도 맞게 계산된다. 두 줄은 transferId 로 묶임.

export interface TransferInput { date: string; fromLine: string; toLine: string; amount: number; reason: string }
export interface Transfer extends TransferInput { id: string; fromId: string; toId: string }

/** 줄(예산표 한 줄) → 그 줄에 넣을 헌금 과목 (감사헌금 줄은 '구분없음' 과목) */
function categoryForLine(line: string, categories: IncomeCategory[]): string {
  const same = categories.filter((c) => c.line === line);
  return (same.find((c) => c.code === line) ?? same.find((c) => c.code.endsWith("-GEN")) ?? same[0])?.code ?? line;
}

export function makeTransfer(t: TransferInput, categories: IncomeCategory[], id: string, now = Date.now()): Offering[] {
  if (t.fromLine === t.toLine) throw new Error("보내는 과목과 받는 과목이 같습니다");
  if (!(t.amount > 0)) throw new Error("금액을 넣으세요");
  if (!t.reason.trim()) throw new Error("옮기는 이유를 적어 주세요 (감사·제직회 설명용)");
  const base = { updatedAt: 0, date: t.date, donorText: `과목 이동: ${t.reason.trim()}`, method: "cash" as const, note: t.reason.trim(), transferId: id, createdAt: now };
  return [
    { ...base, id: `${id}-from`, categoryCode: categoryForLine(t.fromLine, categories), amount: -t.amount, importKey: `xfer|${id}|from` },
    { ...base, id: `${id}-to`, categoryCode: categoryForLine(t.toLine, categories), amount: t.amount, importKey: `xfer|${id}|to` },
  ];
}

/** 헌금 기록에서 과목 이동 목록 복원 */
export function listTransfers(offerings: Offering[], categories: IncomeCategory[]): Transfer[] {
  const lineOf = new Map(categories.map((c) => [c.code, c.line]));
  const by = new Map<string, Offering[]>();
  for (const o of offerings) if (o.transferId && !o.deleted) by.set(o.transferId, [...(by.get(o.transferId) ?? []), o]);
  const out: Transfer[] = [];
  for (const [id, pair] of by) {
    const from = pair.find((o) => o.amount < 0), to = pair.find((o) => o.amount > 0);
    if (!from || !to) continue;
    out.push({ id, date: to.date, fromLine: lineOf.get(from.categoryCode) ?? from.categoryCode, toLine: lineOf.get(to.categoryCode) ?? to.categoryCode, amount: to.amount, reason: to.note ?? "", fromId: from.id, toId: to.id });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
