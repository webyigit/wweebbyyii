import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import { parseAmount } from "../domain/amount";
import { FUND_NAME } from "../domain/categories";
import { won } from "../domain/weeklyReport";

// 수입 예산 (주일헌금현황의 '예산(A)'). 지출 예산은 3단계에서 부서·항목별로 추가.
export default function Budgets({ year }: { year: number }) {
  const categories = useLiveQuery(() => db.categories.orderBy("sort").toArray(), []) ?? [];
  const budgets = useLiveQuery(() => db.budgets.where("year").equals(year).toArray(), [year]) ?? [];
  const of = (code: string) => budgets.find((b) => b.code === code)?.amount ?? 0;
  const total = categories.filter((c) => c.fund === "G").reduce((s, c) => s + of(c.code), 0);

  return (
    <section className="pad" data-page="budget">
      <h2>{year}년 수입 예산</h2>
      <p className="muted">일반회계 합계 {won(total)}원 · 특별회계·해외선교는 예산 없이 잔액만 관리합니다. 금액은 50000, 5만, 2억5천만 식으로 넣을 수 있어요.</p>
      <table className="list card">
        <thead><tr><th>회계</th><th>구분</th><th>항목</th><th className="num">예산</th></tr></thead>
        <tbody>
          {categories.filter((c) => c.fund === "G").map((c) => (
            <tr key={c.code}>
              <td>{FUND_NAME[c.fund]}</td><td>{c.group}</td><td>{c.name}</td>
              <td className="num">
                <input
                  key={`${year}-${c.code}-${of(c.code)}`}
                  className="num" defaultValue={of(c.code) ? won(of(c.code)) : ""} placeholder="0"
                  onBlur={async (e) => {
                    const v = e.target.value.trim() ? parseAmount(e.target.value) : 0;
                    if (v === null) { e.target.value = won(of(c.code)); return; }
                    await db.budgets.put({ year, code: c.code, amount: v });
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
