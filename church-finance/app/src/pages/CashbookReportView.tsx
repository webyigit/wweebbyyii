import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "../data/db";
import { buildCashbookWeek, buildCashbookYear, type Flow } from "../domain/cashbookReport";
import { yearOf, weekOfMonth } from "../domain/dates";
import { DEPARTMENTS, DEPT_NAME } from "../domain/expenseCategories";
import { pct, won } from "../domain/weeklyReport";
import SundayPicker from "./SundayPicker";

const CHURCH = "대한예수교장로회 남도교회 재정부";
const dn = (c: string) => DEPT_NAME[c] ?? c;
const signed = (n: number) => (n < 0 ? `-${won(-n)}` : won(n));

// 출납 보고서: 엑셀의 `MM-DD` 시트(주간)와 `총` 시트(연 누계). 둘 다 인쇄해서 제출.
export default function CashbookReportView({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const [mode, setMode] = useState<"week" | "year">("week");
  const y = yearOf(date);
  const data = useLiveQuery(async () => ({
    categories: await db.categories.toArray(),
    items: await db.expenseItems.toArray(),
    offerings: await db.offerings.where("date").between(`${y}-01-01`, date, true, true).toArray(),
    expenses: await db.expenses.where("date").between(`${y}-01-01`, date, true, true).toArray(),
    openings: await db.openings.where("year").equals(y).toArray(),
    budgets: await db.budgets.where("year").equals(y).toArray(),
  }), [date]);
  if (!data) return <p className="pad">불러오는 중…</p>;

  return (
    <section className="pad report" data-page="cashbook">
      <div className="row between no-print">
        <SundayPicker date={date} setDate={setDate} />
        <div className="row">
          <button className={mode === "week" ? "on" : ""} onClick={() => setMode("week")}>주간 수입/지출</button>
          <button className={mode === "year" ? "on" : ""} onClick={() => setMode("year")}>연 누계 보고서</button>
          <button className="primary" onClick={() => print()}>인쇄 / PDF</button>
        </div>
      </div>
      {mode === "week" ? <Week date={date} data={data} /> : <Year date={date} data={data} />}
    </section>
  );
}

type Data = Parameters<typeof buildCashbookWeek>[1];

function FlowRow({ name, f, cls }: { name: string; f: Flow; cls?: string }) {
  return <tr className={cls}><td>{name}</td><td className="num">{signed(f.opening)}</td><td className="num">{won(f.income)}</td><td className="num">{won(f.expense)}</td><td className="num">{signed(f.closing)}</td></tr>;
}

function Head({ title, date, signers }: { title: string; date: string; signers: string[] }) {
  return (
    <div className="report-head">
      <div><h1>{title}</h1><p>{CHURCH} · {date}</p></div>
      <table className="sign"><tbody><tr>{signers.map((s) => <th key={s}>{s}</th>)}</tr><tr>{signers.map((s) => <td key={s} />)}</tr></tbody></table>
    </div>
  );
}

function Week({ date, data }: { date: string; data: Data }) {
  const w = buildCashbookWeek(date, data, dn);
  const bad = w.checks.filter((c) => !c.ok);
  return (
    <div className="paper">
      <Head title="금주 수입/지출 내역" date={`${date} (${weekOfMonth(date)}째 주)`} signers={["출납회계", "재정부장", "당회장"]} />
      <p className={`no-print ${bad.length ? "warn" : "ok"}`}>{bad.length ? `✘ 검산 안 맞음: ${bad.map((b) => `${b.name} (${b.detail})`).join(", ")}` : "✔ 검산 이상 없음 (지출 합계 · 특별헌금 잔액 · 과목)"}</p>
      <h3>■ 수입/지출</h3>
      <div className="table-wrap"><table className="grid">
        <thead><tr><th>구분</th><th>지난주 잔액 (A)</th><th>수입 (B)</th><th>지출 (C)</th><th>잔액 (A+B−C)</th></tr></thead>
        <tbody>
          <FlowRow name="일반 헌금" f={w.general} />
          <FlowRow name="특별 헌금" f={w.special} />
          <FlowRow name="합계" f={w.total} cls="sum" />
        </tbody>
      </table></div>
      <h3>■ 특별헌금</h3>
      <div className="table-wrap"><table className="grid">
        <thead><tr><th>구분</th><th>지난주 잔액 (D)</th><th>수입 (E)</th><th>지출 (F)</th><th>잔액 (D+E−F)</th></tr></thead>
        <tbody>{w.specialPots.map((p) => <FlowRow key={p.line} name={p.name} f={p} />)}</tbody>
      </table></div>
      <h3>■ 지출 상세 <small className="muted">일반 {won(w.general.expense)} · 특별 {won(w.special.expense)}</small></h3>
      <div className="table-wrap"><table className="grid">
        <thead><tr><th>순번</th><th>내용</th><th>금액</th><th>부서</th><th>항목</th><th>비고</th></tr></thead>
        <tbody>
          {w.expenses.filter((e) => e.fund !== "M").map((e, i) => (
            <tr key={e.id}><td className="num">{i + 1}</td><td>{e.description}</td><td className="num">{won(e.amount)}</td><td>{e.deptName}</td><td>{e.itemName}</td><td className="small">{e.payee}</td></tr>
          ))}
        </tbody>
      </table></div>
      {w.byDept.length > 0 && <p className="small muted">부서별: {w.byDept.map((d) => `${d.name} ${won(d.amount)}`).join(" · ")}</p>}
      <h3>■ 해외선교</h3>
      <div className="table-wrap"><table className="grid">
        <thead><tr><th>구분</th><th>지난주 잔액</th><th>수입</th><th>지출</th><th>잔액</th></tr></thead>
        <tbody>
          {w.missionPots.map((p) => <FlowRow key={p.line} name={p.name} f={p} />)}
          <FlowRow name="합계" f={w.mission} cls="sum" />
        </tbody>
      </table></div>
      {w.expenses.some((e) => e.fund === "M") && (
        <ul className="small">{w.expenses.filter((e) => e.fund === "M").map((e) => <li key={e.id}>{e.description} {won(e.amount)} {e.payee && <span className="muted">· {e.payee}</span>}</li>)}</ul>
      )}
    </div>
  );
}

function Year({ date, data }: { date: string; data: Data }) {
  const y = buildCashbookYear(date, data, dn, DEPARTMENTS.map((d) => d.code));
  const gBudgetSpend = y.depts.reduce((a, d) => a + d.budget, 0);
  return (
    <div className="paper">
      <Head title="수입 지출 보고서" date={`${yearOf(date)}년 1월 1일 ~ ${date}`} signers={["재정부장", "출납회계", "기장회계"]} />
      <div className="table-wrap"><table className="grid">
        <thead><tr><th>구분</th><th>{yearOf(date)} 예산</th><th>전년 이월</th><th>올해 헌금</th><th>헌금 총합계</th><th>지출</th><th>잔액</th></tr></thead>
        <tbody>
          <tr><td>일반헌금</td><td className="num">{won(y.general.budget)}</td><td className="num">{signed(y.general.opening)}</td><td className="num">{won(y.general.income)}</td><td className="num">{signed(y.general.opening + y.general.income)}</td><td className="num">{won(y.general.expense)}</td><td className="num">{signed(y.general.closing)}</td></tr>
          <tr><td>특별헌금</td><td className="num">-</td><td className="num">{signed(y.special.opening)}</td><td className="num">{won(y.special.income)}</td><td className="num">{signed(y.special.opening + y.special.income)}</td><td className="num">{won(y.special.expense)}</td><td className="num">{signed(y.special.closing)}</td></tr>
          <tr className="sum"><td>총계</td><td className="num">{won(y.general.budget)}</td><td className="num">{signed(y.general.opening + y.special.opening)}</td><td className="num">{won(y.general.income + y.special.income)}</td><td className="num">{signed(y.general.opening + y.special.opening + y.general.income + y.special.income)}</td><td className="num">{won(y.general.expense + y.special.expense)}</td><td className="num">{signed(y.general.closing + y.special.closing)}</td></tr>
        </tbody>
      </table></div>
      <div className="two-col">
        <div>
          <h3>■ 일반헌금 수입</h3>
          <table className="grid"><thead><tr><th>항목</th><th>예산</th><th>수입</th><th>비율</th></tr></thead><tbody>
            {y.incomeLines.map((l) => <tr key={l.line}><td>{l.name}</td><td className="num">{won(l.budget)}</td><td className="num">{won(l.actual)}</td><td className="num">{pct(l.budget ? l.actual / l.budget : null)}</td></tr>)}
            <tr className="sum"><td>합계</td><td className="num">{won(y.general.budget)}</td><td className="num">{won(y.general.income)}</td><td className="num">{pct(y.general.budget ? y.general.income / y.general.budget : null)}</td></tr>
          </tbody></table>
        </div>
        <div>
          <h3>■ 부서별 지출</h3>
          <table className="grid"><thead><tr><th>부서</th><th>예산</th><th>지출</th><th>비율</th></tr></thead><tbody>
            {y.depts.map((d) => <tr key={d.dept}><td>{d.name}</td><td className="num">{won(d.budget)}</td><td className="num">{won(d.spent)}</td><td className="num">{pct(d.budget ? d.spent / d.budget : null)}</td></tr>)}
            <tr className="sum"><td>합계</td><td className="num">{won(gBudgetSpend)}</td><td className="num">{won(y.general.expense)}</td><td className="num">{pct(gBudgetSpend ? y.general.expense / gBudgetSpend : null)}</td></tr>
          </tbody></table>
        </div>
      </div>
      <div className="two-col">
        <div>
          <h3>■ 특별헌금</h3>
          <table className="grid"><thead><tr><th>구분</th><th>전년이월</th><th>수입</th><th>지출</th><th>잔액</th></tr></thead>
            <tbody>{y.specialPots.map((p) => <FlowRow key={p.line} name={p.name} f={p} />)}</tbody></table>
        </div>
        <div>
          <h3>■ 해외선교헌금</h3>
          <table className="grid"><thead><tr><th>구분</th><th>전년이월</th><th>수입</th><th>지출</th><th>잔액</th></tr></thead>
            <tbody>{y.missionPots.map((p) => <FlowRow key={p.line} name={p.name} f={p} />)}</tbody></table>
        </div>
      </div>
    </div>
  );
}
