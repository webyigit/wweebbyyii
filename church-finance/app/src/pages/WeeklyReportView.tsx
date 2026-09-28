import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import { FUND_NAME } from "../domain/categories";
import { yearOf } from "../domain/dates";
import { buildWeeklyReport, pct, won, type SummaryLine } from "../domain/weeklyReport";
import type { FundCode } from "../domain/types";
import SundayPicker from "./SundayPicker";

// 엑셀 `MM-DD_주일헌금현황` 과 같은 모양. 인쇄하면 A4 한 장(명세가 길면 이어짐).
export default function WeeklyReportView({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const offerings = useLiveQuery(() => db.offerings.where("date").between(`${yearOf(date)}-01-01`, date, true, true).toArray(), [date]);
  const budgets = useLiveQuery(() => db.budgets.where("year").equals(yearOf(date)).toArray(), [date]);
  if (!categories || !offerings || !budgets) return <p className="pad">불러오는 중…</p>;

  const r = buildWeeklyReport(date, categories, offerings, budgets);
  const y = yearOf(date);
  const funds: FundCode[] = ["G", "S", "M"];
  // 명단: 이름이 적힌 과목만 (주일헌금처럼 총액만 있는 과목은 요약표에만)
  const named = r.lines.flatMap((l) => l.categories.map((c) => ({ ...c, lineName: l.name })))
    .filter((c) => c.details.some((d) => d.donorText));

  return (
    <section className="pad report" data-page="report">
      <div className="row between no-print">
        <SundayPicker date={date} setDate={setDate} />
        <button className="primary" onClick={() => print()}>인쇄 / PDF</button>
      </div>

      <div className="paper">
        <div className="report-head">
          <div>
            <h1>주일 헌금 현황</h1>
            <p>{date} · 대한예수교장로회 남도교회</p>
          </div>
          <table className="sign">
            <tbody>
              <tr><th>기장회계</th><th>재정부장</th><th>당회장</th></tr>
              <tr><td /><td /><td /></tr>
            </tbody>
          </table>
        </div>

        <p className="headline">이번 주 헌금 (일반+특별) <b>{won(r.thisWeekGeneralAndSpecial)}</b>원</p>

        <div className="table-wrap"><table className="grid">
          <thead>
            <tr>
              <th>회계</th><th>구분</th><th>항목</th><th>{y} 예산 (A)</th><th>이번 주</th><th>지난주까지</th><th>총누계 (B)</th><th>진도율 (B/A)</th>
            </tr>
          </thead>
          <tbody>
            {funds.map((f) => {
              const ls = r.lines.filter((l) => l.fund === f);
              const t = r.funds[f];
              return [
                <tr key={f} className="sum">
                  <td>{FUND_NAME[f]}</td><td colSpan={2}>합계</td>
                  <td className="num">{won(t.budget)}</td><td className="num">{won(t.thisWeek)}</td>
                  <td className="num">{won(t.beforeThisWeek)}</td><td className="num">{won(t.total)}</td><td className="num">{pct(t.progress)}</td>
                </tr>,
                ...ls.map((l) => <Line key={l.line} l={l} />),
              ];
            })}
          </tbody>
        </table></div>

        {named.map((l) => (
          <div key={l.code} className="detail">
            <h3>{l.name}{l.name !== l.lineName && <small className="muted"> ({l.lineName})</small>} <span>{won(l.thisWeek)}</span>{l.thisWeekOnline > 0 && <small> (현금 {won(l.thisWeekCash)} / 온라인 {won(l.thisWeekOnline)})</small>}</h3>
            <div className="names">
              {l.details.map((d, i) => (
                <div key={i} className="name-cell">
                  <span>{d.donorText || <span className="muted">(명단 없는 총액)</span>}{d.donorText && d.note && <small> · {d.note}</small>}</span>
                  <span className="num">{won(d.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Line({ l }: { l: SummaryLine }) {
  return (
    <tr>
      <td /><td>{l.group}</td><td>{l.name}</td>
      <td className="num">{won(l.budget)}</td><td className="num">{won(l.thisWeek)}</td>
      <td className="num">{won(l.beforeThisWeek)}</td><td className="num">{won(l.total)}</td><td className="num">{pct(l.progress)}</td>
    </tr>
  );
}
