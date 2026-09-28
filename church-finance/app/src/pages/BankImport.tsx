import { useState } from "react";
import { db } from "../data/db";
import { applyBank } from "../data/bankActions";
import { planBank, readBankWorkbook, type BankTxn, type DepositPlan, type WithdrawPlan } from "../domain/bank";
import { householdLabel, searchDonors } from "../domain/donors";
import { won } from "../domain/weeklyReport";
import type { DonorAlias, ExpenseItem, Household, IncomeCategory, Member, Offering } from "../domain/types";
import ItemPicker from "./ItemPicker";

interface Ctx { households: Household[]; members: Member[]; aliases: DonorAlias[]; offerings: Offering[]; categories: IncomeCategory[]; items: ExpenseItem[] }
type DRow = DepositPlan & { use: boolean; householdId: string | null; categoryCode: string | null; donorText: string };
type WRow = WithdrawPlan & { use: boolean; itemCode?: string; description: string };

// 농협 거래내역 엑셀 올리기. 파일은 이 기기 안에서만 읽는다.
export default function BankImport() {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [dep, setDep] = useState<DRow[]>([]);
  const [wd, setWd] = useState<WRow[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function onFile(f: File) {
    setErr(""); setMsg("");
    const txns = readBankWorkbook(new Uint8Array(await f.arrayBuffer()));
    if (!txns) return setErr("'거래일시 · 출금금액 · 입금금액 · 거래내용' 머리글이 있는 시트를 찾지 못했습니다. 농협 인터넷뱅킹에서 받은 거래내역 엑셀을 골라 주세요.");
    const c: Ctx = {
      households: await db.households.toArray(), members: await db.members.toArray(), aliases: await db.aliases.toArray(),
      offerings: await db.offerings.toArray(), categories: await db.categories.toArray(), items: await db.expenseItems.toArray(),
    };
    const p = planBank(txns, { ...c, expenses: await db.expenses.toArray(), rules: await db.bankRules.toArray(), seenKeys: new Set(await db.bankTxns.toCollection().primaryKeys()) });
    const label = (hid: string | null, t: BankTxn) => {
      const h = hid ? c.households.find((x) => x.id === hid) : undefined;
      return h ? householdLabel(h, c.members, lastText(c.offerings, h.id)) : t.content;
    };
    setCtx(c); setSkipped(p.skipped);
    setDep(p.deposits.map((d) => ({ ...d, use: d.status !== "needs-choice", donorText: label(d.householdId, d.txn) })));
    setWd(p.withdrawals.map((w) => ({ ...w, use: w.status !== "needs-choice", itemCode: w.suggestedItem, description: w.txn.content })));
  }

  async function apply() {
    const ds = dep.filter((d) => d.use && (d.existingOfferingId || d.categoryCode));
    const ws = wd.filter((w) => w.use && (w.existingExpenseId || w.itemCode));
    const r = await applyBank(
      ds.map((d) => ({ txn: d.txn, existingOfferingId: d.existingOfferingId, householdId: d.householdId ?? undefined, donorText: d.donorText, categoryCode: d.categoryCode! })),
      ws.map((w) => ({ txn: w.txn, existingExpenseId: w.existingExpenseId, itemCode: w.itemCode, description: w.description })),
    );
    setMsg(`온라인 헌금 ${r.made}건 추가, 이미 있던 헌금 ${r.linked}건 온라인 표시, 지출 ${r.expenses}건 추가. 다음부터 같은 거래는 건너뜁니다.`);
    setDep([]); setWd([]);
  }

  const cats = ctx?.categories.filter((c) => c.active).sort((a, b) => a.sort - b.sort) ?? [];
  const n = dep.filter((d) => d.use).length + wd.filter((w) => w.use).length;

  return (
    <section className="pad" data-page="bank">
      <h2>통장 내역 올리기 (농협)</h2>
      <p className="muted">인터넷뱅킹 거래내역 엑셀을 고르면, 입금 메모(예: 홍길동십일조)로 헌금자·과목을 맞추고 출금은 지출과 대조합니다. 주중 거래는 다가오는 주일로 들어갑니다.</p>
      <label className="file">
        <input type="file" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <span className="primary-like">거래내역 엑셀 고르기</span>
      </label>
      {err && <p className="warn">{err}</p>}
      {msg && <p className="ok">✔ {msg}</p>}
      {skipped > 0 && <p className="muted">이미 올린 거래 {skipped}건은 건너뜀</p>}

      {ctx && dep.length > 0 && (
        <div className="card">
          <h3>입금 {dep.length}건 — 자동으로 맞춘 것 {dep.filter((d) => d.status !== "needs-choice").length}건</h3>
          <div className="table-wrap"><table className="list bank">
            <thead><tr><th /><th>주일</th><th className="num">금액</th><th>입금 메모</th><th>헌금자</th><th>과목</th><th>상태</th></tr></thead>
            <tbody>{dep.map((d, i) => {
              const set = (p: Partial<DRow>) => setDep(dep.map((x, j) => (j === i ? { ...x, ...p } : x)));
              return (
                <tr key={d.txn.key}>
                  <td><input type="checkbox" checked={d.use} onChange={(e) => set({ use: e.target.checked })} /></td>
                  <td className="small">{d.txn.sunday}</td>
                  <td className="num">{won(d.txn.deposit)}</td>
                  <td className="small">{d.txn.content}</td>
                  <td>{d.existingOfferingId ? d.donorText : <DonorInput ctx={ctx} value={d.donorText} onPick={(hid, text) => set({ householdId: hid, donorText: text })} />}</td>
                  <td>{d.existingOfferingId ? cats.find((c) => c.code === d.categoryCode)?.name : (
                    <select value={d.categoryCode ?? ""} onChange={(e) => set({ categoryCode: e.target.value || null, use: !!e.target.value })}>
                      <option value="">과목?</option>{cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>)}</td>
                  <td className={d.status === "needs-choice" && !(d.categoryCode && d.householdId) ? "warn small" : "ok small"}>
                    {d.status === "existing" ? "이미 있음 → 온라인 표시" : d.categoryCode && d.householdId ? "✔ 맞춤" : !d.householdId ? "헌금자 확인" : "과목 확인"}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </div>
      )}

      {ctx && wd.length > 0 && (
        <div className="card">
          <h3>출금 {wd.length}건 — 지출과 맞은 것 {wd.filter((w) => w.status === "reconciled").length}건</h3>
          <div className="table-wrap"><table className="list bank">
            <thead><tr><th /><th>주일</th><th className="num">금액</th><th>거래내용</th><th>지출 항목</th><th>상태</th></tr></thead>
            <tbody>{wd.map((w, i) => {
              const set = (p: Partial<WRow>) => setWd(wd.map((x, j) => (j === i ? { ...x, ...p } : x)));
              return (
                <tr key={w.txn.key}>
                  <td><input type="checkbox" checked={w.use} onChange={(e) => set({ use: e.target.checked })} /></td>
                  <td className="small">{w.txn.sunday}</td>
                  <td className="num">{won(w.txn.withdraw)}</td>
                  <td className="small">{w.txn.content}</td>
                  <td>{w.existingExpenseId ? <span className="muted">이미 입력된 지출</span> : <ItemPicker items={ctx.items} value={w.itemCode ?? ""} onChange={(c) => set({ itemCode: c || undefined, use: !!c })} />}</td>
                  <td className={w.status === "reconciled" || w.itemCode ? "ok small" : "warn small"}>{w.status === "reconciled" ? "✔ 대사" : w.itemCode ? (w.status === "suggested" ? "예전 분류대로" : "✔") : "항목 확인"}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </div>
      )}

      {(dep.length > 0 || wd.length > 0) && <button className="primary" disabled={n === 0} onClick={apply}>선택한 {n}건 반영</button>}
    </section>
  );
}

function lastText(offerings: Offering[], hid: string) {
  let best: Offering | undefined;
  for (const o of offerings) if (o.householdId === hid && !o.deleted && (!best || o.createdAt > best.createdAt)) best = o;
  return best?.donorText;
}

/** 헌금자 고르기: 이름·초성으로 찾아서 고름 */
function DonorInput({ ctx, value, onPick }: { ctx: Ctx; value: string; onPick: (hid: string | null, text: string) => void }) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const hits = open ? searchDonors(q, ctx.households, ctx.members, ctx.aliases, ctx.offerings, 6) : [];
  return (
    <div className="field donor mini">
      <input value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); onPick(null, e.target.value); }} />
      {hits.length > 0 && (
        <ul className="suggest">{hits.map((h) => <li key={h.householdId}><button onClick={() => { setQ(h.label); setOpen(false); onPick(h.householdId, h.label); }}>{h.label}</button></li>)}</ul>
      )}
    </div>
  );
}
