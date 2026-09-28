import { useEffect, useState } from "react";
import { db } from "../data/db";
import { applyAdjustments } from "../data/actions";
import { findManualCorrections, planAdjustments, readCashbookTotals, type AdjustmentPlan, type ManualCorrection, type WeekLineTotal } from "../domain/cashbook";
import { won } from "../domain/weeklyReport";

// 출납 파일(`기장` 시트)의 주별 총액을 기준으로 '명단 없는 총액'을 채운다.
export default function ImportCashbook({ grid, formulas, fileName }: { grid: unknown[][]; formulas: (string | null)[][]; fileName: string }) {
  const [state, setState] = useState<{ totals: WeekLineTotal[]; unknown: string[]; fixes: ManualCorrection[]; plan: AdjustmentPlan } | null>(null);
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const categories = await db.categories.toArray();
      const { totals, unknown } = readCashbookTotals(grid, categories);
      const fixes = findManualCorrections(grid, formulas, categories);
      const plan = planAdjustments(totals, await db.offerings.toArray(), categories);
      setState({ totals, unknown, fixes, plan });
    })();
  }, [grid, formulas]);
  if (!state) return <p className="muted">{fileName} 읽는 중…</p>;

  const { totals, unknown, fixes, plan } = state;
  const weeks = new Set(totals.map((t) => t.date)).size;
  const bookSum = totals.reduce((a, t) => a + t.amount, 0);
  const addSum = plan.adds.reduce((a, t) => a + t.amount, 0);
  const lineName = (l: string) => ({ "G-SUNDAY": "주일헌금" } as Record<string, string>)[l] ?? l;

  return (
    <div className="card">
      <h3>출납 기장 기준 주별 총액 — {fileName}</h3>
      <ul>
        <li>기장 시트에서 <b>{weeks}</b>주, 과목별 {totals.length}칸 · 합계 {won(bookSum)}원</li>
        <li>이미 들어온 명단과 <b>딱 맞는 칸 {plan.matched}</b>개</li>
        <li>명단이 모자란 칸 <b>{plan.adds.length}</b>개 → '명단 없는 총액'으로 {won(addSum)}원 채움
          <small className="muted"> (주일헌금처럼 원래 이름이 없는 헌금, 명단 파일이 없는 주)</small></li>
        {plan.removeIds.length > 0 && <li className="muted">예전에 채운 총액 {plan.removeIds.length}건은 지우고 다시 계산합니다</li>}
      </ul>
      {unknown.length > 0 && <p className="warn">읽지 못한 과목: {unknown.join(", ")}</p>}
      {plan.over.length > 0 && (
        <div className="warn">
          <b>명단 합계가 장부보다 큰 주 {plan.over.length}곳</b> — 채우지 않고 그대로 둡니다. 명단이나 장부 중 하나를 확인해 주세요.
          <ul>{plan.over.map((o) => <li key={o.date + o.line}>{o.date} {lineName(o.line)}: 명단 {won(o.named)} / 장부 {won(o.book)}</li>)}</ul>
        </div>
      )}
      {fixes.length > 0 && (
        <div className="warn">
          <b>엑셀 연 누계 수식 안에 손으로 넣은 보정이 있습니다</b> (주별 칸에는 없음):
          <ul>{fixes.map((f) => <li key={f.line}>{f.label}: {f.amount > 0 ? "+" : ""}{won(f.amount)}원</li>)}</ul>
          앱은 주별 칸 그대로 계산하므로 이 과목의 연 누계가 엑셀과 이만큼 다르게 나옵니다. 언제·왜 옮겼는지 알려 주시면 그 날짜로 '과목 이동' 기록을 넣겠습니다.
        </div>
      )}
      {done ? <p className="ok">✔ {done}</p> : (
        <button className="primary" disabled={busy || unknown.length > 0} onClick={async () => {
          setBusy(true);
          await applyAdjustments(plan);
          setDone(`명단 없는 총액 ${plan.adds.length}칸을 반영했습니다. 이제 주일헌금현황이 출납 장부와 같습니다${plan.over.length ? " (위 확인 필요한 주 제외)" : ""}.`);
          setBusy(false);
        }}>{busy ? "반영 중…" : `주별 총액 반영 (${plan.adds.length}칸)`}</button>
      )}
    </div>
  );
}
