import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import { parseAmount } from "../domain/amount";
import { DEPARTMENTS } from "../domain/expenseCategories";
import { won } from "../domain/weeklyReport";

// 예산(수입 줄·지출 항목)과 전년 이월. 금액은 50000, 5만, 2억5천만 식으로 넣을 수 있다.
export default function Budgets({ year }: { year: number }) {
  const categories = useLiveQuery(() => db.categories.orderBy("sort").toArray(), []) ?? [];
  const items = useLiveQuery(() => db.expenseItems.orderBy("sort").toArray(), []) ?? [];
  const budgets = useLiveQuery(() => db.budgets.where("year").equals(year).toArray(), [year]) ?? [];
  const openings = useLiveQuery(() => db.openings.where("year").equals(year).toArray(), [year]) ?? [];
  const of = (code: string) => budgets.find((b) => b.code === code)?.amount ?? 0;
  const op = (key: string) => openings.find((o) => o.key === key)?.amount ?? 0;

  // 예산은 요약표 '줄' 단위 (감사헌금은 한 줄)
  const lines = categories.filter((c) => c.fund === "G").filter((c, i, a) => a.findIndex((x) => x.line === c.line) === i);
  const pots = categories.filter((c) => c.fund !== "G").filter((c, i, a) => a.findIndex((x) => x.line === c.line) === i);
  const incomeTotal = lines.reduce((s, c) => s + of(c.line), 0);
  const gItems = items.filter((i) => i.fund === "G" && (i.active || of(i.code))); // 지난 해에만 있던 항목은 예산이 있을 때만
  const spendTotal = gItems.reduce((s, i) => s + of(i.code), 0);

  const Amount = ({ value, save, allowNegative }: { value: number; save: (v: number) => Promise<unknown>; allowNegative?: boolean }) => (
    <input
      key={`${value}`} className="num" defaultValue={value ? (value < 0 ? "-" + won(-value) : won(value)) : ""} placeholder="0"
      onBlur={async (e) => {
        const raw = e.target.value.trim();
        const neg = allowNegative && raw.startsWith("-");
        const v = raw ? parseAmount(raw.replace(/^-/, "")) : 0;
        if (v === null) { e.target.value = value ? won(value) : ""; return; }
        await save(neg ? -v : v);
      }}
    />
  );
  const saveBudget = (code: string) => (v: number) => db.budgets.put({ year, code, amount: v });
  const saveOpening = (key: string) => (v: number) => db.openings.put({ year, key, amount: v });

  return (
    <section className="pad" data-page="budget">
      <h2>{year}년 예산 · 전년 이월</h2>
      <p className="muted">수입 예산 {won(incomeTotal)}원 · 지출 예산 {won(spendTotal)}원 {incomeTotal && spendTotal && incomeTotal !== spendTotal ? <span className="warn">(수입·지출 예산 차이 {won(Math.abs(incomeTotal - spendTotal))}원)</span> : null}</p>

      <div className="two-col">
        <div className="card">
          <h3>수입 예산 (일반회계)</h3>
          <table className="list"><tbody>
            {lines.map((c) => <tr key={c.line}><td>{c.group}</td><td>{c.lineName}</td><td className="num"><Amount value={of(c.line)} save={saveBudget(c.line)} /></td></tr>)}
          </tbody></table>
        </div>
        <div className="card">
          <h3>전년 이월 (1월 1일 시작 잔액)</h3>
          <table className="list"><tbody>
            <tr><td>일반회계</td><td className="num"><Amount value={op("G")} save={saveOpening("G")} allowNegative /></td></tr>
            {pots.map((c) => <tr key={c.line}><td>{c.lineName}</td><td className="num"><Amount value={op(c.line)} save={saveOpening(c.line)} allowNegative /></td></tr>)}
          </tbody></table>
          <p className="small muted">마이너스는 앞에 - 를 붙이세요. 특별헌금·해외선교는 헌금별로 잔액을 따로 관리합니다.</p>
        </div>
      </div>

      <div className="card">
        <h3>지출 예산 (부서 · 항목)</h3>
        {DEPARTMENTS.map((d) => {
          const its = gItems.filter((i) => i.dept === d.code);
          return (
            <details key={d.code}>
              <summary>{d.name} <span className="muted">{won(its.reduce((s, i) => s + of(i.code), 0))}원</span></summary>
              <table className="list"><tbody>
                {its.map((i) => <tr key={i.code}><td>{i.name}</td><td className="num"><Amount value={of(i.code)} save={saveBudget(i.code)} /></td></tr>)}
              </tbody></table>
            </details>
          );
        })}
      </div>
    </section>
  );
}
