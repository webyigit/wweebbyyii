import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, newId, softDelete, touch } from "../data/db";
import { parseAmount } from "../domain/amount";
import { buildCashbookYear } from "../domain/cashbookReport";
import { DEPARTMENTS, DEPT_NAME } from "../domain/expenseCategories";
import { listTransfers, loanBalance, makeTransfer, reconcile, type Account, type Loan } from "../domain/status";
import { won } from "../domain/weeklyReport";
import SundayPicker from "./SundayPicker";

// 재정 현황: 통장 잔액 대사 · 차입 현황 · 과목 이동 (엑셀 `총` 시트 오른쪽·아래, 수식 속 손 보정을 대신함)
const signed = (n: number) => (n < 0 ? `-${won(-n)}` : won(n));
const KIND = { bank: "통장", cash: "현금", saving: "적금", fx: "외화", other: "기타" } as const;

export default function FinanceStatus({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const y = Number(date.slice(0, 4));
  const data = useLiveQuery(async () => ({
    categories: await db.categories.toArray(),
    items: await db.expenseItems.toArray(),
    offerings: await db.offerings.where("date").between(`${y}-01-01`, date, true, true).toArray(),
    expenses: await db.expenses.where("date").between(`${y}-01-01`, date, true, true).toArray(),
    openings: await db.openings.where("year").equals(y).toArray(),
    budgets: await db.budgets.where("year").equals(y).toArray(),
    accounts: (await db.accounts.toArray()).filter((a) => !a.deleted),
    loans: (await db.loans.toArray()).filter((l) => !l.deleted),
    txns: await db.bankTxns.toArray(),
  }), [date]);
  if (!data) return <p className="pad">불러오는 중…</p>;

  const yr = buildCashbookYear(date, data, (c) => DEPT_NAME[c] ?? c, DEPARTMENTS.map((d) => d.code));
  const mission = yr.missionPots.reduce((s, p) => s + p.closing, 0);
  const book = yr.general.closing + yr.special.closing + mission;
  const r = reconcile(date, data.accounts, data.txns, book);

  return (
    <section className="pad" data-page="status">
      <div className="row between no-print">
        <div className="row"><span className="muted">기준일</span><SundayPicker date={date} setDate={setDate} /></div>
        <button className="primary" onClick={() => print()}>인쇄 / PDF</button>
      </div>

      <div className="card recon">
        <h3>통장 잔액 대사 — 장부와 실제 돈이 맞나</h3>
        <div className="two-col">
          <table className="list">
            <tbody>
              <tr><td>일반회계 잔액</td><td className="num">{signed(yr.general.closing)}</td></tr>
              <tr><td>특별회계 잔액</td><td className="num">{signed(yr.special.closing)}</td></tr>
              <tr><td>해외선교 잔액</td><td className="num">{signed(mission)}</td></tr>
              <tr className="sum"><td><b>장부 잔액</b></td><td className="num book-total"><b>{signed(book)}</b></td></tr>
            </tbody>
          </table>
          <table className="list">
            <tbody>
              {r.rows.filter((x) => x.account.inBook).map((x) => (
                <tr key={x.account.id}><td>{x.account.name} <span className="muted small">{x.source === "file" ? `통장 파일 ${x.asOf}` : x.asOf ? `${x.asOf} 기록` : "기록 없음"}</span></td><td className="num">{signed(x.amount)}</td></tr>
              ))}
              <tr className="sum"><td><b>실제 돈</b></td><td className="num"><b>{signed(r.accounts)}</b></td></tr>
            </tbody>
          </table>
        </div>
        <p className={`recon-result ${r.diff === 0 ? "ok" : "warn"}`}>
          {r.rows.some((x) => x.account.inBook)
            ? r.diff === 0 ? "✔ 장부와 실제 돈이 원 단위까지 같습니다" : `⚠ 차이 ${signed(r.diff)}원 (실제 돈 ${r.diff > 0 ? "많음" : "모자람"}) — 아직 장부에 안 넣은 헌금·지출, 입금 예정 현금 등을 확인하세요`
            : "아래에서 통장·현금을 등록하면 장부와 자동으로 맞춰 봅니다"}
        </p>
        {r.stale.length > 0 && <p className="small warn">기준일보다 2주 넘게 지난 잔액: {r.stale.join(", ")} — 새 잔액을 적어 주세요</p>}
        <AccountEditor accounts={data.accounts} rows={r.rows} date={date} />
      </div>

      <Loans loans={data.loans} date={date} />
      <Transfers year={y} date={date} />
    </section>
  );
}

function amountInput(value: number | undefined, save: (v: number) => void, placeholder = "0") {
  return (
    <input className="num rule-amt" key={value ?? "x"} defaultValue={value ? won(value) : ""} placeholder={placeholder}
      onBlur={(e) => { const raw = e.target.value.trim(); if (!raw) return; const neg = raw.startsWith("-"); const v = parseAmount(raw.replace(/^-/, "")); if (v !== null) save(neg ? -v : v); }} />
  );
}

function AccountEditor({ accounts, rows, date }: { accounts: Account[]; rows: ReturnType<typeof reconcile>["rows"]; date: string }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Account["kind"]>("bank");
  // 처음(아무것도 없을 때)엔 펼쳐 두고, 그 뒤로는 사용자가 접고 펴는 대로 (추가했다고 저절로 접히지 않게)
  const [open, setOpen] = useState(!accounts.length);
  const save = (a: Account, patch: Partial<Account>) => db.accounts.put(touch({ ...a, ...patch }));
  const setBalance = (a: Account, amount: number) => save(a, { balances: [...a.balances.filter((b) => b.date !== date), { date, amount }].sort((x, y) => x.date.localeCompare(y.date)) });
  return (
    <details className="accounts" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>통장·현금 관리 ({accounts.length})</summary>
      <table className="list">
        <thead><tr><th>이름</th><th>종류</th><th>장부와 맞춤</th><th>잔액 가져오기</th><th className="num">{date} 잔액</th><th /></tr></thead>
        <tbody>
          {rows.map(({ account: a, amount, source }) => (
            <tr key={a.id} data-account={a.name}>
              <td>{a.name}{a.number && <span className="muted small"> {a.number}</span>}</td>
              <td>{KIND[a.kind]}</td>
              <td><input type="checkbox" checked={a.inBook} onChange={(e) => save(a, { inBook: e.target.checked })} /></td>
              <td><label className="small"><input type="checkbox" checked={!!a.fromBankFile} onChange={(e) => save(a, { fromBankFile: e.target.checked })} /> 통장 파일에서</label></td>
              <td className="num">{source === "file" ? won(amount) : amountInput(a.balances.find((b) => b.date === date)?.amount, (v) => setBalance(a, v), amount ? won(amount) : "0")}</td>
              <td><button className="x" onClick={() => { if (confirm(`${a.name} 을(를) 지울까요?`)) softDelete(db.accounts as never, a.id); }}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <input placeholder="새 통장·현금 (예: 농협 일반통장, 현금, 입금 예정 현금)" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
        <select value={kind} onChange={(e) => setKind(e.target.value as Account["kind"])}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className="primary" disabled={!name.trim()} onClick={async () => {
          await db.accounts.put(touch<Account>({ id: newId(), updatedAt: 0, name: name.trim(), kind, inBook: kind !== "saving" && kind !== "fx", fromBankFile: /농협/.test(name), balances: [], sort: accounts.length }));
          setName("");
        }}>추가</button>
      </div>
      <p className="small muted">'장부와 맞춤'을 끈 적금·외화는 잔액만 보여 주고 대사에는 넣지 않습니다. 농협처럼 거래내역을 올리는 통장은 '통장 파일에서'를 켜면 잔액을 따로 적지 않아도 됩니다.</p>
    </details>
  );
}

function Loans({ loans, date }: { loans: Loan[]; date: string }) {
  const [lender, setLender] = useState("");
  const total = loans.reduce((s, l) => s + loanBalance(l, date), 0);
  const save = (l: Loan, patch: Partial<Loan>) => db.loans.put(touch({ ...l, ...patch }));
  return (
    <div className="card loans">
      <h3>차입 현황 <span className="muted small">· {date} 기준 남은 돈 합계 <b className="loan-total">{won(total)}</b>원</span></h3>
      {loans.map((l) => <LoanRow key={l.id} l={l} date={date} save={(p) => save(l, p)} />)}
      <div className="row">
        <input placeholder="빌린 곳 (예: ○○은행, 해외선교헌금)" value={lender} onChange={(e) => setLender(e.target.value)} />
        <button disabled={!lender.trim()} onClick={async () => { await db.loans.put(touch<Loan>({ id: newId(), updatedAt: 0, lender: lender.trim(), internal: /헌금|회계/.test(lender), events: [] })); setLender(""); }}>차입 추가</button>
      </div>
      <p className="small muted">이자는 지출(재정부 · 대출이자)로 입력합니다. 여기에는 빌린 돈과 갚은 돈(원금)만 적습니다.</p>
    </div>
  );
}

function LoanRow({ l, date, save }: { l: Loan; date: string; save: (p: Partial<Loan>) => void }) {
  const [ev, setEv] = useState<{ date: string; kind: "borrow" | "repay"; amount: string; note: string }>({ date, kind: "repay", amount: "", note: "" });
  const bal = loanBalance(l, date);
  return (
    <details className="loan" data-lender={l.lender}>
      <summary><b>{l.lender}</b>{l.internal && <span className="badge ok-badge">내부 차입</span>} — 남은 돈 <b className="loan-balance">{won(bal)}</b>원 {l.rate ? <span className="muted small">(연 {l.rate}%)</span> : null}</summary>
      <table className="list small"><tbody>
        {[...l.events].sort((a, b) => a.date.localeCompare(b.date)).map((e, i) => (
          <tr key={i}><td>{e.date}</td><td>{e.kind === "borrow" ? "빌림" : "갚음"}</td><td className="num">{won(e.amount)}</td><td>{e.note}</td>
            <td><button className="x" onClick={() => save({ events: l.events.filter((x) => x !== e) })}>×</button></td></tr>
        ))}
      </tbody></table>
      <div className="row">
        <input type="date" value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} />
        <select value={ev.kind} onChange={(e) => setEv({ ...ev, kind: e.target.value as "borrow" | "repay" })}><option value="borrow">빌림</option><option value="repay">갚음</option></select>
        <input className="rule-amt num" placeholder="금액 (예: 2천만)" value={ev.amount} onChange={(e) => setEv({ ...ev, amount: e.target.value })} />
        <input placeholder="메모" value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} />
        <button onClick={() => { const a = parseAmount(ev.amount); if (!a) return; save({ events: [...l.events, { date: ev.date, kind: ev.kind, amount: a, note: ev.note || undefined }] }); setEv({ ...ev, amount: "", note: "" }); }}>기록</button>
        <label className="small">이율 <input className="tag" defaultValue={l.rate ?? ""} onBlur={(e) => save({ rate: Number(e.target.value) || undefined })} />%</label>
      </div>
    </details>
  );
}

function Transfers({ year, date }: { year: number; date: string }) {
  const categories = useLiveQuery(() => db.categories.orderBy("sort").toArray(), []) ?? [];
  const offerings = useLiveQuery(() => db.offerings.where("date").between(`${year}-01-01`, `${year}-12-31`, true, true).toArray(), [year]) ?? [];
  const list = listTransfers(offerings, categories);
  const lines = categories.filter((c, i, a) => a.findIndex((x) => x.line === c.line) === i);
  const lineName = (l: string) => lines.find((c) => c.line === l)?.lineName ?? l;
  const [f, setF] = useState({ date, fromLine: "", toLine: "", amount: "", reason: "" });
  const [err, setErr] = useState("");
  return (
    <div className="card transfers">
      <h3>과목 이동 <span className="muted small">— 헌금을 다른 과목·회계로 옮김 (예: 감사헌금 → 건축헌금). 모든 보고서에 자동 반영</span></h3>
      <table className="list"><tbody>
        {list.map((t) => (
          <tr key={t.id}><td>{t.date}</td><td>{lineName(t.fromLine)} → {lineName(t.toLine)}</td><td className="num">{won(t.amount)}</td><td>{t.reason}</td>
            <td><button className="x" onClick={async () => { if (!confirm("이 과목 이동을 지울까요?")) return; await softDelete(db.offerings as never, t.fromId); await softDelete(db.offerings as never, t.toId); }}>×</button></td></tr>
        ))}
        {!list.length && <tr><td className="muted">{year}년 과목 이동 없음</td></tr>}
      </tbody></table>
      <div className="row">
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <select value={f.fromLine} onChange={(e) => setF({ ...f, fromLine: e.target.value })}><option value="">보내는 과목</option>{lines.map((c) => <option key={c.line} value={c.line}>{c.lineName}</option>)}</select>
        →
        <select value={f.toLine} onChange={(e) => setF({ ...f, toLine: e.target.value })}><option value="">받는 과목</option>{lines.map((c) => <option key={c.line} value={c.line}>{c.lineName}</option>)}</select>
        <input className="rule-amt num" placeholder="금액" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <input placeholder="이유 (예: 제직회 결의)" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} style={{ flex: 1 }} />
        <button className="primary" onClick={async () => {
          try {
            const pair = makeTransfer({ date: f.date, fromLine: f.fromLine, toLine: f.toLine, amount: parseAmount(f.amount) ?? 0, reason: f.reason }, categories, newId());
            if (!f.fromLine || !f.toLine) throw new Error("과목을 고르세요");
            await db.offerings.bulkPut(pair.map((o) => touch(o)));
            setF({ ...f, amount: "", reason: "" }); setErr("");
          } catch (e) { setErr((e as Error).message); }
        }}>옮기기</button>
      </div>
      {err && <p className="warn">{err}</p>}
    </div>
  );
}
