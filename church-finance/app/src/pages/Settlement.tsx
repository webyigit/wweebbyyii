import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import * as XLSX from "xlsx";
import { db } from "../data/db";
import { parseAmount } from "../domain/amount";
import { DEPARTMENTS } from "../domain/expenseCategories";
import { wonKorean } from "../domain/receipts";
import {
  PERIODS, adjustHints, buildDeptDetail, buildMissionReport, buildSettlement, buildSummary, change, periodOf, rate,
  type PeriodKey, type SettleInput, type SettleLine,
} from "../domain/settlement";
import { won } from "../domain/weeklyReport";
import SundayPicker from "./SundayPicker";

// 예결산·제직회 보고 — 엑셀 `결산예산`, `제직회`, `제직회_요약`, `재직회_상세`, `재직_해외선교보고` 시트.
// 기준일(주일)까지의 헌금·지출로 매번 계산. 내년 예산(안)은 여기서 바로 넣는다.
const CHURCH = "대한예수교장로회 남도교회 재정부";
const MODES = [
  { key: "settle", label: "결산·예산(안)" },
  { key: "spend", label: "지출 현황" },
  { key: "summary", label: "요약 보고" },
  { key: "detail", label: "부서별 상세" },
  { key: "mission", label: "해외선교" },
] as const;
type Mode = (typeof MODES)[number]["key"];
const depts = DEPARTMENTS.map((d) => ({ code: d.code, name: d.name }));
const signed = (n: number) => (n < 0 ? `-${won(-n)}` : won(n));
const pr = (r: number | null) => (r === null ? "-" : `${(r * 100).toFixed(2)}%`);
const chg = (r: number | null) => (r === null ? "-" : `${r > 0 ? "+" : ""}${(r * 100).toFixed(2)}%`);

export default function Settlement({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const [mode, setMode] = useState<Mode>("settle");
  const [pk, setPk] = useState<PeriodKey>("ytd");
  const [showPayee, setShowPayee] = useState(false);
  const year = Number(date.slice(0, 4));
  const inp = useLiveQuery(async (): Promise<SettleInput> => ({
    categories: await db.categories.toArray(),
    items: await db.expenseItems.toArray(),
    // 작년 같은 기간 비교를 위해 작년 것까지
    offerings: await db.offerings.where("date").between(`${year - 1}-01-01`, `${year}-12-31`, true, true).toArray(),
    expenses: await db.expenses.where("date").between(`${year - 1}-01-01`, `${year}-12-31`, true, true).toArray(),
    budgets: await db.budgets.where("year").anyOf(year, year + 1).toArray(),
    openings: await db.openings.where("year").equals(year).toArray(),
  }), [year]);
  if (!inp) return <p className="pad">불러오는 중…</p>;
  const period = periodOf(pk, year, date);

  return (
    <section className="pad report" data-page="settle">
      <div className="row between no-print">
        <div className="row"><span className="muted">기준일</span><SundayPicker date={date} setDate={setDate} /></div>
        <button className="primary" onClick={() => print()}>인쇄 / PDF</button>
      </div>
      <div className="row no-print modes" style={{ margin: "8px 0" }}>
        {MODES.map((m) => <button key={m.key} className={mode === m.key ? "on" : ""} onClick={() => setMode(m.key)}>{m.label}</button>)}
      </div>
      {mode !== "mission" && (
        <div className="row no-print periods">
          {PERIODS.map((p) => <button key={p.key} className={pk === p.key ? "on" : ""} onClick={() => setPk(p.key)}>{p.label}</button>)}
          <span className="muted small">{period.from} ~ {period.to}</span>
          {mode === "detail" && <label className="small"><input type="checkbox" checked={showPayee} onChange={(e) => setShowPayee(e.target.checked)} /> 받는 사람·비고 표시</label>}
        </div>
      )}
      {mode === "settle" && <SettleView year={year} inp={inp} period={period} />}
      {mode === "spend" && <SpendView year={year} inp={inp} period={period} />}
      {mode === "summary" && <SummaryView year={year} inp={inp} period={period} />}
      {mode === "detail" && <DetailView year={year} inp={inp} period={period} showPayee={showPayee} />}
      {mode === "mission" && <MissionView year={year} inp={inp} until={date} />}
    </section>
  );
}

type ViewProps = { year: number; inp: SettleInput; period: { from: string; to: string } };

function Head({ title, sub }: { title: string; sub: string }) {
  return <div className="report-head"><div><h1>{title}</h1><p>{CHURCH} · {sub}</p></div></div>;
}

/** 내년 예산(안) 칸: 50000, 5만, 2억5천만 식으로 넣으면 바로 저장 */
function NextInput({ year, code, value }: { year: number; code: string; value: number }) {
  return (
    <input
      key={value} className="num next-budget" data-code={code} defaultValue={value ? won(value) : ""} placeholder="0"
      onBlur={async (e) => {
        const raw = e.target.value.trim();
        const v = raw ? parseAmount(raw) : 0;
        if (v === null) { e.target.value = value ? won(value) : ""; return; }
        if (v !== value) await db.budgets.put({ year: year + 1, code, amount: v });
      }}
    />
  );
}

// ── 결산·예산(안) ─────────────────────────────────────
function SettleView({ year, inp, period }: ViewProps) {
  const s = buildSettlement(year, period, inp, depts);
  const gap = s.incomeTotal.next - s.expenseTotal.next;
  const final = period.to >= `${year}-12-31`;
  const row = (l: SettleLine, label: [string, string], cls = "") => (
    <tr key={l.code} className={cls}>
      <td>{label[0]}</td><td>{label[1]}</td>
      <td className="num">{won(l.budget)}</td><td className="num">{won(l.actual)}</td><td className="num">{pr(rate(l.actual, l.budget))}</td>
      <td className="num no-print-input">{cls === "sum" ? won(l.next) : <NextInput year={year} code={l.code} value={l.next} />}</td>
      <td className="num">{chg(change(l.next, l.budget))}</td>
    </tr>
  );
  function exportXlsx() {
    const aoa: (string | number)[][] = [[`${year}년도 수입 및 지출 ${final ? "결산" : "중간 결산"}과 ${year + 1}년도 예산(안)`], [`기준일 ${period.to}`], [],
      ["수입", "항목", `${year} 예산`, `${year} 헌금액`, "달성률", `${year + 1} 예산(안)`, "증감률"],
      ["합계", "", s.incomeTotal.budget, s.incomeTotal.actual, rate(s.incomeTotal.actual, s.incomeTotal.budget) ?? "", s.incomeTotal.next, change(s.incomeTotal.next, s.incomeTotal.budget) ?? ""],
      ...s.income.map((l) => [l.group ?? "", l.name, l.budget, l.actual, rate(l.actual, l.budget) ?? "", l.next, change(l.next, l.budget) ?? ""]),
      [], ["지출", "항목", `${year} 예산`, "지출", "집행률", `${year + 1} 예산(안)`, "증감률"],
      ["합계", "", s.expenseTotal.budget, s.expenseTotal.actual, rate(s.expenseTotal.actual, s.expenseTotal.budget) ?? "", s.expenseTotal.next, change(s.expenseTotal.next, s.expenseTotal.budget) ?? ""]];
    for (const d of s.depts) {
      aoa.push([d.name, "소계", d.budget, d.actual, rate(d.actual, d.budget) ?? "", d.next, change(d.next, d.budget) ?? ""]);
      for (const i of d.items) aoa.push(["", i.name, i.budget, i.actual, rate(i.actual, i.budget) ?? "", i.next, change(i.next, i.budget) ?? ""]);
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "결산예산");
    XLSX.writeFile(wb, `${year}년 결산_${year + 1}년 예산(안).xlsx`);
  }
  return (
    <div className="paper settle">
      <Head title={`${year}년도 ${final ? "결산" : "중간 결산"} · ${year + 1}년도 예산(안)`} sub={`기준일 ${period.to}`} />
      <p className={`no-print budget-balance ${gap === 0 ? "ok" : "warn"}`}>
        {year + 1}년 예산(안): 수입 {won(s.incomeTotal.next)}원 · 지출 {won(s.expenseTotal.next)}원 ·{" "}
        {gap === 0 ? (s.incomeTotal.next ? "수입과 지출이 맞습니다 ✔" : "아직 비어 있습니다") : `차이 ${signed(gap)}원 (수입 ${gap > 0 ? "많음" : "모자람"})`}
        {" "}<button onClick={exportXlsx}>엑셀로 내보내기</button>
      </p>
      <AdjustList s={s} />
      <h3>수입 (일반회계)</h3>
      <div className="table-wrap"><table className="grid settle-income">
        <thead><tr><th colSpan={2}>항목</th><th>{year} 예산(A)</th><th>{year} 헌금액(B)</th><th>달성률</th><th>{year + 1} 예산(안)</th><th>증감률</th></tr></thead>
        <tbody>
          {row({ code: "income-total", name: "합계", ...s.incomeTotal }, ["합 계", ""], "sum")}
          {s.income.map((l) => row(l, [l.group ?? "", l.name]))}
        </tbody>
      </table></div>
      <h3>지출</h3>
      <div className="table-wrap"><table className="grid settle-expense">
        <thead><tr><th colSpan={2}>항목</th><th>{year} 예산(A)</th><th>지출(B)</th><th>집행률</th><th>{year + 1} 예산(안)</th><th>증감률</th></tr></thead>
        <tbody>
          {row({ code: "expense-total", name: "합계", ...s.expenseTotal }, ["합 계", ""], "sum")}
          {s.depts.map((d) => [
            row({ code: `dept-${d.dept}`, name: d.name, budget: d.budget, actual: d.actual, next: d.next }, [d.name, "소 계"], "sum"),
            ...d.items.map((i) => row(i, ["", i.name])),
          ])}
        </tbody>
      </table></div>
    </div>
  );
}

/** 내년 예산(안) 짤 때 볼 항목 (엑셀 '예산 조정 검토' 목록을 자동으로) */
function AdjustList({ s }: { s: ReturnType<typeof buildSettlement> }) {
  const hints = adjustHints(s);
  if (!hints.length) return null;
  const why = { over: "예산 초과", pace: "이 속도면 연말 초과", noBudget: "예산 없이 지출" };
  return (
    <details className="card adjust-hints" open>
      <summary><b>예산 조정 검토 {hints.length}건</b> <span className="muted small">— 내년 예산(안)을 정할 때 참고</span></summary>
      <table className="list"><thead><tr><th>부서</th><th>항목</th><th>까닭</th><th className="num">예산</th><th className="num">지출</th><th className="num">연말 예상</th></tr></thead>
        <tbody>{hints.map((h) => (
          <tr key={h.code} data-kind={h.kind}><td>{h.dept}</td><td>{h.name}</td><td className={h.kind === "pace" ? "" : "warn"}>{why[h.kind]}</td><td className="num">{won(h.budget)}</td><td className="num">{won(h.actual)}</td><td className="num">{won(h.projected)}</td></tr>
        ))}</tbody>
      </table>
    </details>
  );
}

// ── 제직회 지출 현황 ───────────────────────────────────
function SpendView({ year, inp, period }: ViewProps) {
  const s = buildSettlement(year, period, inp, depts);
  const r = (name: [string, string], b: number, a: number, cls = "") => (
    <tr className={cls} key={name.join("|")}><td>{name[0]}</td><td>{name[1]}</td><td className="num">{won(b)}</td><td className="num">{won(a)}</td><td className="num">{pr(rate(a, b))}</td><td className="num">{signed(b - a)}</td></tr>
  );
  return (
    <div className="paper">
      <Head title={`${year}년도 지출 현황`} sub={`${period.from} ~ ${period.to}`} />
      <div className="table-wrap"><table className="grid spend">
        <thead><tr><th colSpan={2}>구분</th><th>예산액(A)</th><th>지출액(B)</th><th>진행률(B/A)</th><th>잔액</th></tr></thead>
        <tbody>
          {r(["합 계", ""], s.expenseTotal.budget, s.expenseTotal.actual, "sum")}
          {s.depts.map((d) => [r([d.name, "소 계"], d.budget, d.actual, "sum"), ...d.items.map((i) => r(["", i.name], i.budget, i.actual))])}
        </tbody>
      </table></div>
    </div>
  );
}

// ── 요약 보고 ─────────────────────────────────────────
function SummaryView({ year, inp, period }: ViewProps) {
  const s = buildSummary(year, period, inp);
  const pctOf = (a: number, b: number) => pr(rate(a, b));
  return (
    <div className="paper summary">
      <Head title={`${year}년도 재정 보고 (요약)`} sub={`${period.from} ~ ${period.to}`} />
      <table className="grid">
        <thead><tr><th /><th>금액</th><th>한글</th><th>1년 예산 대비</th>{s.prev.hasData && <th>작년 같은 기간</th>}{s.prev.hasData && <th>증감</th>}</tr></thead>
        <tbody>
          {([["수입", s.income, s.budgetIncome, s.prev.income], ["지출", s.expense, s.budgetExpense || s.budgetIncome, s.prev.expense]] as const).map(([k, v, b, p]) => (
            <tr key={k} className={`summary-${k === "수입" ? "income" : "expense"}`}>
              <td>{k}</td><td className="num amount">{won(v)}</td><td className="small">{wonKorean(v)}원</td><td className="num">{pctOf(v, b)}</td>
              {s.prev.hasData && <td className="num">{won(p)}</td>}
              {s.prev.hasData && <td className="num">{chg(change(v, p))} ({signed(v - p)})</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <h3>결론</h3>
      <ul className="conclusion">{s.sentences.map((x) => <li key={x}>{x}</li>)}</ul>
      {!s.prev.hasData && <p className="muted small no-print">작년 같은 기간 자료가 앱에 없어 비교는 빠졌습니다. 작년 엑셀을 가져오면 자동으로 비교합니다.</p>}
    </div>
  );
}

// ── 부서별 상세 ───────────────────────────────────────
function DetailView({ year, inp, period, showPayee }: ViewProps & { showPayee: boolean }) {
  const d = buildDeptDetail(year, period, inp, depts);
  return (
    <div className="paper detail-report">
      <Head title={`${year}년도 부서별 지출 상세`} sub={`${period.from} ~ ${period.to}`} />
      {d.map((dept) => (
        <div key={dept.dept} className="dept-block">
          <h3>{dept.name} <span className="muted small">예산 {won(dept.budget)} · 지출 {won(dept.spent)} · 잔액 {signed(dept.budget - dept.spent)} · {pr(rate(dept.spent, dept.budget))}</span></h3>
          <table className="grid">
            <tbody>
              {dept.items.map((it) => [
                <tr key={it.code} className="sum"><td colSpan={2}>{it.name}</td><td className="num">{won(it.budget)}</td><td className="num">{won(it.spent)}</td><td className="num">{signed(it.budget - it.spent)}</td>{showPayee && <td>{pr(rate(it.spent, it.budget))}</td>}</tr>,
                ...it.lines.map((l, i) => (
                  <tr key={it.code + i}><td>{l.date.slice(5)}</td><td>{l.description}</td><td /><td className="num">{won(l.amount)}</td><td className="num">{signed(l.remaining)}</td>{showPayee && <td className="small">{l.payee}</td>}</tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ── 해외선교 현황 ─────────────────────────────────────
function MissionView({ year, inp, until }: { year: number; inp: SettleInput; until: string }) {
  const m = buildMissionReport(year, until, inp);
  return (
    <div className="paper mission">
      <Head title={`${year}년도 해외선교 현황보고`} sub={`작성일 ${until}`} />
      <table className="grid mission-top">
        <thead><tr><th>{year - 1}년도 이월금 (A)</th><th>금년도 총 수입 (B)</th><th>합계 (A+B)</th><th>금년도 총 지출 (D)</th><th>현재 잔액</th></tr></thead>
        <tbody><tr><td className="num">{won(m.opening)}</td><td className="num">{won(m.income)}</td><td className="num">{won(m.opening + m.income)}</td><td className="num">{won(m.expense)}</td><td className="num mission-balance">{signed(m.balance)}</td></tr></tbody>
      </table>
      <h3>상세내역</h3>
      <table className="grid">
        <thead><tr><th>일자</th><th>내용</th><th>수입</th><th>지출</th><th>잔액</th></tr></thead>
        <tbody>
          {m.rows.map((r, i) => (
            <tr key={i} className={r.kind === "month" ? "sum" : ""}>
              <td>{r.kind === "month" ? "" : r.date.slice(5)}</td><td>{r.description}</td>
              <td className="num">{won(r.income)}</td><td className="num">{won(r.expense)}</td><td className="num">{r.kind === "month" ? "" : signed(r.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
