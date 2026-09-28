// 기부금영수증 저장 동작 (신청자·가정 연결·발급·폐기·예전 대장 가져오기·금고)
import { useEffect, useState } from "react";
import { db, newId, touch, type FinanceDB } from "./db";
import {
  applicantKey, isCorpName, maskRrn, nextSerials, normalizeBizNo, normalizeRrn, suggestShares,
  type ApplicantYear, type LedgerRow,
} from "../domain/receipts";
import { createVault, changeVaultPass, sealText, unlockVault, openText, type VaultParams } from "../domain/vault";
import type { Applicant, Household, Receipt, ReceiptShare } from "../domain/types";

// ── 교회 정보 (영수증의 '기부금 단체') ────────────────
export interface ChurchInfo {
  name: string; // 단체명
  regNo: string; // 고유번호(사업자등록번호)
  address: string; // 소재지
  receiver: string; // 기부금 수령인 (대표자)
  law: string; // 근거법령
  code: string; // 기부금 코드
}
export const DEFAULT_CHURCH: ChurchInfo = {
  name: "", regNo: "", address: "", receiver: "",
  law: "소득세법 시행령 제80조 제1항 제5호",
  code: "41",
};
export async function getChurch(d: FinanceDB = db): Promise<ChurchInfo> {
  return { ...DEFAULT_CHURCH, ...(((await d.settings.get("church"))?.value as Partial<ChurchInfo>) ?? {}) };
}
export const saveChurch = (c: ChurchInfo, d: FinanceDB = db) => d.settings.put({ key: "church", value: c });

// ── 주민번호 금고 ─────────────────────────────────────
export const getVault = async (d: FinanceDB = db) => (await d.settings.get("vault"))?.value as VaultParams | undefined;

let unlocked: CryptoKey | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

/** 금고가 열렸는지 (화면이 따라 바뀌게) */
export function useVaultOpen(): boolean {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  return unlocked !== null;
}
export function lockVault() { unlocked = null; notify(); }

export async function setupVault(pass: string, d: FinanceDB = db) {
  if (await getVault(d)) throw new Error("이미 비밀번호가 정해져 있습니다");
  if (pass.length < 6) throw new Error("비밀번호는 6자 이상으로 정하세요");
  const v = await createVault(pass);
  await d.settings.put({ key: "vault", value: v });
  unlocked = await unlockVault(v, pass);
  notify();
}
export async function openVault(pass: string, d: FinanceDB = db): Promise<boolean> {
  const v = await getVault(d);
  if (!v) return false;
  unlocked = await unlockVault(v, pass);
  notify();
  return unlocked !== null;
}
export async function changePass(oldPass: string, newPass: string, d: FinanceDB = db): Promise<boolean> {
  const v = await getVault(d);
  if (!v || newPass.length < 6) return false;
  const nv = await changeVaultPass(v, oldPass, newPass);
  if (!nv) return false;
  await d.settings.put({ key: "vault", value: nv });
  return true;
}
/** 잠긴 주민번호 보기 (금고가 열려 있을 때만) */
export async function revealId(sealed?: string): Promise<string | null> {
  if (!sealed || !unlocked) return null;
  return openText(unlocked, sealed);
}

// ── 신청자 ───────────────────────────────────────────
export interface ApplicantInput {
  kind: "person" | "corp";
  name: string;
  idText?: string; // 새로 넣거나 바꿀 때만 (비우면 그대로)
  phone?: string;
  address?: string;
  note?: string;
}

export async function saveApplicant(input: ApplicantInput, existing?: Applicant, d: FinanceDB = db): Promise<Applicant> {
  const name = input.name.trim();
  if (!name) throw new Error("이름을 넣으세요");
  const a: Applicant = existing ? { ...existing } : { id: newId(), updatedAt: 0, kind: input.kind, name };
  a.kind = input.kind;
  a.name = name;
  a.phone = input.phone?.trim() || undefined;
  a.address = input.address?.trim() || undefined;
  a.note = input.note?.trim() || undefined;
  const idText = input.idText?.trim();
  if (idText) {
    if (input.kind === "corp") {
      const b = normalizeBizNo(idText);
      if (!b) throw new Error("사업자등록번호가 맞지 않습니다 (10자리)");
      a.bizNo = b; a.idSealed = undefined; a.idMasked = undefined;
    } else {
      const r = normalizeRrn(idText);
      if (!r) throw new Error("주민등록번호가 맞지 않습니다 (13자리)");
      const v = await getVault(d);
      if (!v) throw new Error("먼저 '영수증 비밀번호'를 정하세요 (주민번호를 잠그는 데 씀)");
      a.idSealed = await sealText(v.pub, r);
      a.idMasked = maskRrn(r);
      a.bizNo = undefined;
    }
  }
  await d.applicants.put(touch(a));
  return a;
}

export async function setShares(household: Household, shares: ReceiptShare[], d: FinanceDB = db) {
  await d.households.put(touch({ ...household, receiptShares: shares.length ? shares : undefined }));
}

// ── 발급·폐기 ─────────────────────────────────────────
export async function issueReceipts(
  year: number, items: ApplicantYear[], issuedAt: string, householdName: (id: string) => string, d: FinanceDB = db,
): Promise<Receipt[]> {
  return d.transaction("rw", d.receipts, d.applicants, async () => {
    const all = await d.receipts.toArray();
    const serials = nextSerials(year, all, items.length);
    const made: Receipt[] = [];
    for (const [i, it] of items.entries()) {
      const a = await d.applicants.get(it.applicantId);
      if (!a || a.deleted) continue;
      const r: Receipt = touch({
        id: newId(), updatedAt: 0, year, serial: serials[i], applicantId: a.id,
        kind: a.kind, name: a.name, idSealed: a.idSealed, idMasked: a.idMasked, bizNo: a.bizNo, address: a.address,
        months: [...it.months], amount: it.amount, issuedAt, status: "issued",
        sources: it.sources.map((s) => `${householdName(s.householdId)}${s.pct !== 100 ? ` ${s.pct}%` : ""}`),
      });
      await d.receipts.put(r);
      made.push(r);
    }
    return made;
  });
}

export async function voidReceipt(r: Receipt, reason: string, d: FinanceDB = db) {
  await d.receipts.put(touch({ ...r, status: "void", voidReason: reason.trim() || "폐기" }));
}

// ── 예전 발급대장 가져오기 ─────────────────────────────
export interface LedgerImportResult { applicantsNew: number; applicantsKnown: number; receipts: number; skipped: number; linked: number; unmatched: string[] }

/**
 * 예전 발급대장 → 신청자(주민번호는 잠가서) + 발급 기록.
 * 같은 사람(이름+주민번호 앞자리)은 한 번만 만들고, 같은 일련번호는 두 번 넣지 않는다.
 * 가정에 아직 신청자가 없으면 이름으로 자동 연결 (가장 최근 해 금액 비율).
 */
export async function importLedger(rows: LedgerRow[], d: FinanceDB = db): Promise<LedgerImportResult> {
  const v = await getVault(d);
  if (!v) throw new Error("먼저 '영수증 비밀번호'를 정하세요 (주민번호를 잠그는 데 씀)");
  const existing = (await d.applicants.toArray()).filter((a) => !a.deleted);
  const keyOf = (a: { name: string; idMasked?: string; bizNo?: string }) => `${a.name.replace(/\s+/g, "")}|${(a.idMasked ?? a.bizNo ?? "").slice(0, 8)}`;
  const known = new Map(existing.map((a) => [keyOf(a), a]));
  const haveSerial = new Set((await d.receipts.toArray()).filter((r) => !r.deleted).map((r) => r.serial));
  const res: LedgerImportResult = { applicantsNew: 0, applicantsKnown: 0, receipts: 0, skipped: 0, linked: 0, unmatched: [] };
  const seen = new Map<string, Applicant>();
  const newApplicants: Applicant[] = [];
  const receipts: Receipt[] = [];
  const latest = Math.max(...rows.map((r) => Number(r.serial.slice(0, 4))));
  const lastAmount = new Map<string, number>();

  for (const row of rows) {
    const corp = row.kind === "corp" || isCorpName(row.name);
    const rrn = corp ? null : normalizeRrn(row.idText);
    const biz = corp ? normalizeBizNo(row.idText) ?? (row.idText.trim() || undefined) : undefined;
    const probe = { name: row.name, idMasked: rrn ? maskRrn(rrn) : undefined, bizNo: biz };
    const ak = applicantKey(row);
    let a = seen.get(ak) ?? known.get(keyOf(probe));
    if (!a) {
      a = {
        id: newId(), updatedAt: 0, kind: corp ? "corp" : "person", name: row.name.trim(),
        idSealed: rrn ? await sealText(v.pub, rrn) : undefined, idMasked: rrn ? maskRrn(rrn) : undefined,
        bizNo: biz, address: row.address || undefined,
        note: !corp && row.idText && !rrn ? `주민번호 확인 필요 (대장: 자리수 틀림)` : undefined,
      };
      newApplicants.push(a);
      res.applicantsNew++;
    } else if (!seen.has(ak) && existing.includes(a)) res.applicantsKnown++;
    seen.set(ak, a);
    if (row.address && !a.address) a.address = row.address;
    if (!row.void && Number(row.serial.slice(0, 4)) === latest) lastAmount.set(a.id, (lastAmount.get(a.id) ?? 0) + row.amount);

    if (haveSerial.has(row.serial)) { res.skipped++; continue; }
    haveSerial.add(row.serial);
    const months = Array(12).fill(0);
    receipts.push({
      id: newId(), updatedAt: 0, year: Number(row.serial.slice(0, 4)) - 1, serial: row.serial, applicantId: a.id,
      kind: a.kind, name: a.name, idSealed: a.idSealed, idMasked: a.idMasked, bizNo: a.bizNo, address: row.address || a.address,
      months, amount: row.amount, issuedAt: row.issuedAt || `${row.serial.slice(0, 4)}-01-01`,
      status: row.void ? "void" : "issued", voidReason: row.void ? row.note || "폐기" : undefined, imported: true,
    });
    res.receipts++;
  }

  const households = (await d.households.toArray()).filter((h) => !h.deleted);
  const members = await d.members.toArray();
  const all = [...existing, ...newApplicants];
  const { shares, unmatched } = suggestShares(all.filter((a) => lastAmount.has(a.id)), lastAmount, households, members);
  res.unmatched = unmatched.map((id) => all.find((a) => a.id === id)!.name);

  await d.transaction("rw", d.applicants, d.receipts, d.households, async () => {
    await d.applicants.bulkPut(newApplicants.map((a) => touch(a)));
    await d.receipts.bulkPut(receipts.map((r) => touch(r)));
    for (const h of households) {
      const s = shares.get(h.id);
      if (s && !h.receiptShares?.length) { await d.households.put(touch({ ...h, receiptShares: s })); res.linked++; }
    }
  });
  return res;
}
