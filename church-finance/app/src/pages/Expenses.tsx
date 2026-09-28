import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "../data/db";
import { addExpense, addFixedForWeek, deleteExpense, deleteRule, saveRule } from "../data/expenseActions";
import { parseAmount } from "../domain/amount";
import { weekOfMonth } from "../domain/dates";
import { DEPT_NAME } from "../domain/expenseCategories";
import { won } from "../domain/weeklyReport";
import type { FixedRule } from "../domain/types";
import ItemPicker from "./ItemPicker";
import SundayPicker from "./SundayPicker";

// 지출 입력 (출납회계). 고정지출은 규칙으로 미리 채워지고, 추가 지출만 입력한다.
export default function Expenses({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const items = useLiveQuery(() => db.expenseItems.orderBy("sort").toArray(), []) ?? [];
  const rules = useLiveQuery(() => db.fixedRules.filter((r) => !r.deleted).toArray(), []) ?? [];
  const week = useLiveQuery(() => db.expenses.where("date").equals(date).filter((e) => !e.deleted).toArray(), [date]) ?? [];
  const [tab, setTab] = useState<"entry" | "rules">("entry");
  const [desc, setDesc] = useState("");
  const [amountText, setAmountText] = useState("");
  const [item, setItem] = useState("");
  const [payee, setPayee] = useState("");
  const [msg, setMsg] = useState("");

  const wom = weekOfMonth(date);
  const done = new Set(week.map((e) => e.fixedRuleId).filter(Boolean));
  const dueRules = rules.filter((r) => r.active && r.weekOfMonth === wom).sort((a, b) => a.sort - b.sort);
  const pending = dueRules.filter((r) => !done.has(r.id));
  const itemOf = new Map(items.map((i) => [i.code, i]));
  const list = [...week].sort((a, b) => a.createdAt - b.createdAt);
  const total = (f: string) => list.filter((e) => itemOf.get(e.itemCode)?.fund === f).reduce((a, e) => a + e.amount, 0);
  const amount = parseAmount(amountText);

  async function add() {
    setMsg("");
    if (!desc.trim()) return setMsg("내용을 넣어 주세요.");
    if (!amount) return setMsg("금액을 확인해 주세요.");
    if (!item) return setMsg("항목을 골라 주세요.");
    await addExpense({ date, itemCode: item, amount, description: desc.trim(), payee: payee.trim() || undefined, source: "manual" });
    setDesc(""); setAmountText(""); setPayee("");
  }

  return (
    <section className="pad" data-page="expense">
      <div className="row between">
        <SundayPicker date={date} setDate={setDate} />
        <div className="row">
          <button className={tab === "entry" ? "on" : ""} onClick={() => setTab("entry")}>이번 주 지출</button>
          <button className={tab === "rules" ? "on" : ""} onClick={() => setTab("rules")}>고정지출 규칙</button>
        </div>
      </div>

      {tab === "entry" ? (
        <>
          <div className="card fixed-due">
            <h3>{wom}째 주 고정지출 — {dueRules.length}건 중 {dueRules.length - pending.length}건 추가됨</h3>
            {dueRules.length === 0 ? <p className="muted">이 주에 해당하는 고정지출 규칙이 없습니다. '고정지출 규칙'에서 등록하세요.</p> : (
              <>
                <table className="list"><tbody>
                  {dueRules.map((r) => (
                    <tr key={r.id} className={done.has(r.id) ? "muted" : ""}>
                      <td>{r.description}</td><td className="muted">{DEPT_NAME[itemOf.get(r.itemCode)?.dept ?? ""]} · {itemOf.get(r.itemCode)?.name}</td>
                      <td className="num">{won(r.amount)}</td><td>{done.has(r.id) ? "✔" : ""}</td>
                    </tr>
                  ))}
                </tbody></table>
                {pending.length > 0 && <button className="primary" onClick={() => addFixedForWeek(date, pending)}>남은 고정지출 {pending.length}건 추가 ({won(pending.reduce((a, r) => a + r.amount, 0))}원)</button>}
              </>
            )}
          </div>

          <div className="card entry">
            <div className="field" style={{ flex: "2 1 200px" }}><label>내용</label><input value={desc} placeholder="예: 주일식사비" onChange={(e) => setDesc(e.target.value)} /></div>
            <div className="field amount"><label>금액</label><input value={amountText} inputMode="numeric" placeholder="예: 53030, 5만" onChange={(e) => setAmountText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && add()} />
              <span className="preview">{amount ? `${won(amount)}원` : ""}</span></div>
            <div className="field"><label>항목</label><ItemPicker items={items} value={item} onChange={setItem} /></div>
            <div className="field" style={{ flex: "1 1 160px" }}><label>받는 사람 · 비고</label><input value={payee} placeholder="예: 담당자 / 자동출금" onChange={(e) => setPayee(e.target.value)} /></div>
            <button className="primary" onClick={add}>추가</button>
            {msg && <p className="msg warn">{msg}</p>}
          </div>

          <div className="card this-week-exp">
            <h3>이번 주 지출 {list.length}건 — 일반 {won(total("G"))} · 특별 {won(total("S"))} · 선교 {won(total("M"))}</h3>
            <table className="list"><tbody>
              {list.map((e, i) => (
                <tr key={e.id}>
                  <td className="num">{i + 1}</td>
                  <td>{e.description}{e.source === "fixed" && <span className="badge ok-badge">고정</span>}</td>
                  <td className="muted">{DEPT_NAME[itemOf.get(e.itemCode)?.dept ?? ""] ?? "?"} · {itemOf.get(e.itemCode)?.name ?? e.itemCode}</td>
                  <td className="num">{won(e.amount)}</td>
                  <td className="muted small">{e.payee}</td>
                  <td><button className="x" onClick={() => deleteExpense(e.id)} aria-label="삭제">×</button></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </>
      ) : (
        <Rules rules={rules} items={items} />
      )}
    </section>
  );
}

function Rules({ rules, items }: { rules: FixedRule[]; items: import("../domain/types").ExpenseItem[] }) {
  const [draft, setDraft] = useState({ weekOfMonth: 1, description: "", amount: "", itemCode: "", payee: "" });
  const [msg, setMsg] = useState("");
  const itemOf = new Map(items.map((i) => [i.code, i]));
  const sorted = [...rules].sort((a, b) => a.weekOfMonth - b.weekOfMonth || a.sort - b.sort);
  return (
    <div className="card">
      <h3>고정지출 규칙 — 매월 몇째 주에 나가는 지출</h3>
      <p className="muted">금액이 바뀌면 여기서 고치세요. 다음 해당 주부터 바뀐 금액으로 채워집니다. 이미 추가된 지출은 그대로입니다.</p>
      <table className="list">
        <thead><tr><th>주</th><th>내용</th><th>항목</th><th className="num">금액</th><th>받는 사람</th><th /></tr></thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className={r.active ? "" : "muted"}>
              <td>{r.weekOfMonth}째</td><td>{r.description}</td>
              <td className="muted">{DEPT_NAME[itemOf.get(r.itemCode)?.dept ?? ""]} · {itemOf.get(r.itemCode)?.name}</td>
              <td className="num"><input className="num rule-amt" defaultValue={won(r.amount)} key={r.amount} onBlur={(e) => { const v = parseAmount(e.target.value); if (v && v !== r.amount) saveRule({ ...r, amount: v }); }} /></td>
              <td className="muted small">{r.payee}</td>
              <td>
                <button onClick={() => saveRule({ ...r, active: !r.active })}>{r.active ? "멈춤" : "다시 사용"}</button>
                <button className="x" onClick={() => deleteRule(r.id)} aria-label="삭제">×</button>
              </td>
            </tr>
          ))}
          <tr>
            <td><select value={draft.weekOfMonth} onChange={(e) => setDraft({ ...draft, weekOfMonth: +e.target.value })}>{[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>{w}째</option>)}</select></td>
            <td><input placeholder="내용" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></td>
            <td><ItemPicker items={items} value={draft.itemCode} onChange={(c) => setDraft({ ...draft, itemCode: c })} /></td>
            <td><input className="num" placeholder="금액" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} /></td>
            <td><input placeholder="받는 사람" value={draft.payee} onChange={(e) => setDraft({ ...draft, payee: e.target.value })} /></td>
            <td><button className="primary" onClick={async () => {
              const amount = parseAmount(draft.amount);
              if (!draft.description.trim() || !amount || !draft.itemCode) return setMsg("주·내용·항목·금액을 모두 넣어 주세요.");
              await saveRule({ weekOfMonth: draft.weekOfMonth, description: draft.description.trim(), amount, itemCode: draft.itemCode, payee: draft.payee.trim() || undefined });
              setDraft({ ...draft, description: "", amount: "", payee: "" }); setMsg("");
            }}>규칙 추가</button></td>
          </tr>
        </tbody>
      </table>
      {msg && <p className="warn">{msg}</p>}
    </div>
  );
}
