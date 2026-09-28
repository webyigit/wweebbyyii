import { useState } from "react";
import { db } from "../data/db";
import { applyImport } from "../data/actions";
import { planImport, type ImportPlan } from "../domain/importOfferings";
import { readCashbookGrid, readOfferingWorkbook, readWeeklyNames, type ReadResult, type WeeklyNamesResult } from "../domain/readWorkbook";
import { planAdjustments, type WeekLineTotal } from "../domain/cashbook";
import { applyAdjustments } from "../data/actions";
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
  const [book, setBook] = useState<{ grid: unknown[][]; formulas: (string | null)[][]; data: Uint8Array } | null>(null);
  const [weekly, setWeekly] = useState<WeeklyNamesResult[]>([]);
  const [kinds, setKinds] = useState<{ name: string; kind: string }[]>([]);

  // 여러 파일을 한 번에 골라도 됨: 파일마다 종류를 알아서 판단
  //  - 출납 파일(기장 시트) → 주별 총액 맞추기
  //  - 개인별 헌금집계(일자·구분·성명·금액) / 주간 주일헌금현황(과목별 명단) → 이름 있는 헌금
  async function onFiles(files: File[]) {
    setErr(""); setDone(""); setPlan(null); setRead(null); setBook(null); setWeekly([]); setKinds([]);
    const found: { name: string; kind: string }[] = [];
    setFileName(files.map((f) => f.name).join(", "));
    try {
      const all: ReadResult = { rows: [], sheets: [] };
      const weeks: WeeklyNamesResult[] = [];
      for (const f of files) {
        const data = new Uint8Array(await f.arrayBuffer());
        const cb = readCashbookGrid(data);
        if (cb) { setBook({ ...cb, data }); found.push({ name: f.name, kind: "출납 장부(기장)" }); continue; }
        const personal = readOfferingWorkbook(data);
        if (personal.sheets.length) {
          all.rows.push(...personal.rows); all.sheets.push(...personal.sheets);
          found.push({ name: f.name, kind: `개인별 헌금집계 ${personal.rows.length}건` }); continue;
        }
        const w = readWeeklyNames(data);
        if (w) {
          weeks.push(w); all.rows.push(...w.rows); all.sheets.push(...w.sheets);
          found.push({ name: f.name, kind: `주간 명단 ${w.date} ${w.rows.length}건` }); continue;
        }
        found.push({ name: f.name, kind: "알 수 없는 양식 — 건너뜀" });
      }
      setKinds(found);
      setWeekly(weeks.sort((a, b) => a.date.localeCompare(b.date)));
      if (!all.rows.length) return;
      const r = all;
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
      // 예전에 출납 장부를 넣었으면, 새 명단을 반영해 '명단 없는 총액'을 자동으로 다시 계산
      const saved = (await db.meta.get("bookTotals"))?.value as WeekLineTotal[] | undefined;
      let again = "";
      if (saved?.length) {
        const adj = planAdjustments(saved, await db.offerings.toArray(), await db.categories.toArray());
        await applyAdjustments(adj);
        again = ` 출납 장부 기준 총액도 다시 맞췄습니다${adj.over.length ? ` (명단이 장부보다 큰 곳 ${adj.over.length}개 — 확인 필요)` : ""}.`;
      }
      setDone(`헌금 ${r.offerings.toLocaleString()}건, 새 가정 ${r.households}개를 가져왔습니다.${again}`);
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
        <input type="file" accept=".xlsx,.xls" multiple onChange={(e) => e.target.files?.length && onFiles([...e.target.files])} />
        <span className="primary-like">엑셀 파일 고르기 (여러 개 가능)</span> {fileName}
      </label>
      {err && <p className="warn">{err}</p>}
      {done && <p className="ok">✔ {done}</p>}

      {book && <ImportCashbook key={fileName} grid={book.grid} formulas={book.formulas} data={book.data} fileName={fileName} />}

      {kinds.length > 1 && (
        <ul className="muted files">{kinds.map((k) => <li key={k.name}>{k.name} → <span className={k.kind.startsWith("알 수 없는") ? "warn" : ""}>{k.kind}</span></li>)}</ul>
      )}

      {weekly.length > 0 && (
        <div className="card">
          <h3>주간 명단 {weekly.length}주 — 과목별 제목 금액과 대조</h3>
          <table className="list">
            <thead><tr><th>주일</th><th className="num">명단</th><th className="num">읽은 합계</th><th /></tr></thead>
            <tbody>
              {weekly.map((w) => {
                const bad = w.sections.filter((s) => s.title !== null && s.title !== s.parsed);
                return (
                  <tr key={w.date}>
                    <td>{w.date}</td><td className="num">{w.rows.length}건</td>
                    <td className="num">{won(w.rows.reduce((a, r) => a + r.amount, 0))}</td>
                    <td className={bad.length ? "warn" : "ok"}>{bad.length ? `✘ ${bad.map((b) => `${b.label} 제목 ${won(b.title ?? 0)} / 읽음 ${won(b.parsed)}`).join(", ")}` : "✔"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {read && plan && (
        <>
          {read.sheets.some((s) => !weekly.some((w) => s.name.endsWith(w.date))) && <div className="card">
            <h3>월별 대조 — 시트에 적힌 합계와 비교</h3>
            <table className="list">
              <thead><tr><th>시트</th><th className="num">건수</th><th className="num">읽은 합계</th><th className="num">시트 합계</th><th /></tr></thead>
              <tbody>
                {read.sheets.filter((s) => (s.rows > 0 || s.headerTotal) && !weekly.some((w) => s.name.endsWith(w.date))).map((s) => {
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
          </div>}

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
