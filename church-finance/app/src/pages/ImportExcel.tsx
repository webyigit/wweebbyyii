import { useState } from "react";
import { db } from "../data/db";
import { applyImport } from "../data/actions";
import { planImport, type ImportPlan } from "../domain/importOfferings";
import { readCashbookGrid, readOfferingWorkbook, type ReadResult } from "../domain/readWorkbook";
import ImportCashbook from "./ImportCashbook";
import { won } from "../domain/weeklyReport";

// 엑셀 '개인별 헌금집계' 가져오기. 파일은 이 기기 안에서만 읽고, 어디로도 보내지 않는다.
export default function ImportExcel() {
  const [fileName, setFileName] = useState("");
  const [read, setRead] = useState<ReadResult | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [err, setErr] = useState("");
  const [book, setBook] = useState<{ grid: unknown[][]; formulas: (string | null)[][] } | null>(null);

  async function onFile(f: File) {
    setErr(""); setDone(""); setPlan(null); setRead(null); setBook(null); setFileName(f.name);
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      // 출납 파일(기장 시트)이면 주별 총액 맞추기로
      const cb = readCashbookGrid(data);
      if (cb) { setBook(cb); return; }
      const r = readOfferingWorkbook(data);
      if (!r.sheets.length) throw new Error("'일자 · 구분 · 성명 · 금액' 머리글이 있는 시트도, 출납 '기장' 시트도 찾지 못했습니다.");
      const p = planImport(r.rows, {
        households: await db.households.toArray(), members: await db.members.toArray(),
        aliases: await db.aliases.toArray(), offerings: await db.offerings.toArray(),
      });
      setRead(r); setPlan(p);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    }
  }

  async function run() {
    if (!plan) return;
    setBusy(true);
    try {
      const r = await applyImport(plan);
      setDone(`헌금 ${r.offerings.toLocaleString()}건, 새 가정 ${r.households}개를 가져왔습니다.`);
      setPlan(null);
    } catch (e) {
      setErr("가져오지 못했습니다 (아무것도 저장되지 않음): " + String((e as Error).message ?? e));
    } finally { setBusy(false); }
  }

  const ok = plan && plan.unknownLabels.length === 0;
  const newH = plan?.households.filter((h) => !h.existingId) ?? [];
  const review = newH.filter((h) => h.needsReview);

  return (
    <section className="pad" data-page="import">
      <h2>엑셀 가져오기</h2>
      <p className="muted">
        ① 먼저 <b>'개인별 헌금집계'</b> 엑셀(월별 시트: 일자 · 구분 · 성명 · 금액)로 이름 있는 헌금을 넣고,
        ② 다음에 <b>출납 주간 파일</b>(<code>기장</code> 시트가 있는 파일)을 넣으면 주별 총액이 장부와 같아지도록 이름 없는 금액을 채웁니다.
        파일은 이 기기 안에서만 읽습니다. 같은 파일을 다시 넣어도 겹치지 않습니다.
      </p>
      <label className="file">
        <input type="file" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <span className="primary-like">엑셀 파일 고르기</span> {fileName}
      </label>
      {err && <p className="warn">{err}</p>}
      {done && <p className="ok">✔ {done}</p>}

      {book && <ImportCashbook key={fileName} grid={book.grid} formulas={book.formulas} fileName={fileName} />}

      {read && plan && (
        <>
          <div className="card">
            <h3>월별 대조 — 시트에 적힌 합계와 비교</h3>
            <table className="list">
              <thead><tr><th>시트</th><th className="num">건수</th><th className="num">읽은 합계</th><th className="num">시트 합계</th><th /></tr></thead>
              <tbody>
                {read.sheets.filter((s) => s.rows > 0 || s.headerTotal).map((s) => {
                  const sum = read.rows.filter((r) => r.sheet === s.name).reduce((a, r) => a + (Number.isFinite(r.amount) ? r.amount : 0), 0);
                  const same = s.headerTotal === undefined || s.headerTotal === sum;
                  return (
                    <tr key={s.name}>
                      <td>{s.name}</td><td className="num">{s.rows}</td><td className="num">{won(sum)}</td>
                      <td className="num">{s.headerTotal === undefined ? "-" : won(s.headerTotal)}</td>
                      <td className={same ? "ok" : "warn"}>{same ? "✔" : "✘ 다름"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>가져올 내용</h3>
            <ul>
              <li>헌금 <b>{plan.offerings.length.toLocaleString()}</b>건 · {won(plan.offerings.reduce((a, o) => a + o.src.amount, 0))}원</li>
              {plan.duplicates > 0 && <li>이미 들어와 있어 건너뜀 {plan.duplicates.toLocaleString()}건</li>}
              <li>새 가정 <b>{newH.length}</b>개 · 기존 가정에 연결 {plan.households.length - newH.length}개</li>
              <li>무명 등 가정 없는 헌금 {plan.offerings.filter((o) => !o.householdKey && o.donorText).length}건 (영수증 대상 아님)</li>
              {plan.badRows.length > 0 && <li className="warn">읽지 못한 행 {plan.badRows.length}개: {plan.badRows.slice(0, 5).map((b) => `${b.where}(${b.why})`).join(", ")}</li>}
            </ul>
            {plan.unknownLabels.length > 0 && (
              <p className="warn">
                모르는 구분이 있어 가져올 수 없습니다: {plan.unknownLabels.map((u) => `'${u.label}' ${u.count}건 (${u.rows.join(", ")})`).join(" · ")}
                <br />엑셀에서 구분을 고치거나 담당자에게 알려 주세요.
              </p>
            )}
            {review.length > 0 && (
              <details>
                <summary>확인이 필요한 가정 {review.length}개 — 가져온 뒤 '교인·가정' 화면에서 합치거나 고치세요</summary>
                <ul>{review.map((h) => <li key={h.key}>{[...h.texts].join(" / ")} — {h.needsReview}</li>)}</ul>
              </details>
            )}
            <button className="primary" disabled={!ok || busy || plan.offerings.length === 0} onClick={run}>
              {busy ? "가져오는 중…" : `${plan.offerings.length.toLocaleString()}건 가져오기`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
