import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { db, touch } from "../data/db";
import {
  changePass, getChurch, importLedger, issueReceipts, lockVault, openVault, revealId, saveApplicant, saveChurch, setShares,
  setupVault, useVaultOpen, voidReceipt, DEFAULT_CHURCH, type ChurchInfo, type LedgerImportResult,
} from "../data/receiptActions";
import {
  mergeLedger, planReceipts, readLedgerGrid, sharesOk, statusOf, summarizeLedgerSheets, serialPrefix, type LedgerRow,
} from "../domain/receipts";
import { toYmd } from "../domain/dates";
import { householdLabel } from "../domain/donors";
import { won } from "../domain/weeklyReport";
import type { Applicant, Household, Member, Receipt, ReceiptShare } from "../domain/types";
import { ReceiptForms } from "./ReceiptForm";

// 기부금영수증: 가정별 한 해 헌금 → 신청자에게 (비율로) 모아서 → 법정 서식 인쇄 + 발급대장.
// 주민번호는 '영수증 비밀번호'로 잠가 두고, 인쇄할 때만 풀어서 찍는다.
const SUBS = [
  { key: "issue", label: "발급" },
  { key: "people", label: "신청자" },
  { key: "ledger", label: "발급대장" },
  { key: "setup", label: "설정·가져오기" },
] as const;
type Sub = (typeof SUBS)[number]["key"];

const defaultYear = () => { const t = new Date(); return t.getMonth() <= 2 ? t.getFullYear() - 1 : t.getFullYear(); };

export default function Receipts() {
  const [year, setYear] = useState(defaultYear);
  const [sub, setSub] = useState<Sub>("issue");
  const [printing, setPrinting] = useState<Receipt[] | null>(null);
  const church = useLiveQuery(() => getChurch(), []) ?? DEFAULT_CHURCH;

  if (printing) return <ReceiptForms receipts={printing} church={church} onClose={() => setPrinting(null)} />;
  return (
    <section className="pad" data-page="receipt">
      <div className="row between">
        <div className="row">
          <button onClick={() => setYear(year - 1)}>◀</button>
          <h2 style={{ margin: 0 }}>{year}년 헌금 기부금영수증</h2>
          <button onClick={() => setYear(year + 1)}>▶</button>
          <span className="muted small">일련번호 {serialPrefix(year)}-000</span>
        </div>
        <VaultBar />
      </div>
      <div className="row subtabs" style={{ margin: "12px 0" }}>
        {SUBS.map((s) => <button key={s.key} className={sub === s.key ? "on" : ""} onClick={() => setSub(s.key)}>{s.label}</button>)}
      </div>
      {sub === "issue" && <IssueView year={year} onPrint={setPrinting} />}
      {sub === "people" && <ApplicantsView />}
      {sub === "ledger" && <LedgerView year={year} onPrint={setPrinting} />}
      {sub === "setup" && <SetupView church={church} />}
    </section>
  );
}

// ── 금고 (영수증 비밀번호) ───────────────────────────
function VaultBar() {
  const open = useVaultOpen();
  const vault = useLiveQuery(() => db.settings.get("vault"), []);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [msg, setMsg] = useState("");
  if (!vault) {
    return (
      <div className="vault card">
        <b>영수증 비밀번호 정하기</b>
        <p className="small muted">주민번호를 잠그는 비밀번호입니다. 잊으면 주민번호를 다시 받아야 하니 종이에 적어 교회 금고에 보관하세요.</p>
        <div className="row">
          <input type="password" placeholder="비밀번호 (6자 이상)" value={pass} onChange={(e) => setPass(e.target.value)} />
          <input type="password" placeholder="한 번 더" value={pass2} onChange={(e) => setPass2(e.target.value)} />
          <button className="primary" disabled={!pass || pass !== pass2} onClick={async () => {
            try { await setupVault(pass); setPass(""); setPass2(""); setMsg(""); } catch (e) { setMsg((e as Error).message); }
          }}>정하기</button>
        </div>
        {pass2 && pass !== pass2 && <p className="warn small">두 번 넣은 비밀번호가 다릅니다</p>}
        {msg && <p className="warn small">{msg}</p>}
      </div>
    );
  }
  if (open) return <div className="row vault-open"><span className="ok">🔓 주민번호 열림</span><button onClick={lockVault}>잠그기</button></div>;
  return (
    <form className="row" onSubmit={async (e) => { e.preventDefault(); const ok = await openVault(pass); setMsg(ok ? "" : "비밀번호가 틀렸습니다"); if (ok) setPass(""); }}>
      <span className="muted">🔒 주민번호 잠김</span>
      <input type="password" placeholder="영수증 비밀번호" value={pass} onChange={(e) => setPass(e.target.value)} />
      <button>열기</button>
      {msg && <span className="warn small">{msg}</span>}
    </form>
  );
}

// ── 공통 데이터 ───────────────────────────────────────
function useData() {
  const households = useLiveQuery(() => db.households.filter((h) => !h.deleted).toArray(), []) ?? [];
  const members = useLiveQuery(() => db.members.filter((m) => !m.deleted).toArray(), []) ?? [];
  const applicants = useLiveQuery(() => db.applicants.filter((a) => !a.deleted).toArray(), []) ?? [];
  const receipts = useLiveQuery(() => db.receipts.filter((r) => !r.deleted).toArray(), []) ?? [];
  return { households, members, applicants, receipts };
}

// ── 발급 ─────────────────────────────────────────────
function IssueView({ year, onPrint }: { year: number; onPrint: (r: Receipt[]) => void }) {
  const { households, members, applicants, receipts } = useData();
  const offerings = useLiveQuery(() => db.offerings.where("date").between(`${year}-01-01`, `${year}-12-31`, true, true).toArray(), [year]) ?? [];
  const plan = useMemo(() => planReceipts(year, offerings, households), [year, offerings, households]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [issuedAt, setIssuedAt] = useState(toYmd(new Date()));
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const hhName = (id: string) => { const h = households.find((x) => x.id === id); return h ? householdLabel(h, members) : "(지운 가정)"; };
  const aById = new Map(applicants.map((a) => [a.id, a]));

  const rows = [...plan.byApplicant.values()]
    .map((p) => ({ p, a: aById.get(p.applicantId), ...statusOf(p.applicantId, p.amount, year, receipts) }))
    .filter((r) => r.a)
    .sort((x, y) => x.a!.name.localeCompare(y.a!.name, "ko"));
  const totalOfferings = offerings.filter((o) => !o.deleted && o.householdId).reduce((s, o) => s + o.amount, 0);
  const assigned = rows.reduce((s, r) => s + r.p.amount, 0);
  const unassigned = plan.unassigned.reduce((s, u) => s + u.total, 0);
  const todo = rows.filter((r) => r.status !== "issued");

  async function issue() {
    const items = rows.filter((r) => picked.has(r.p.applicantId)).map((r) => r.p);
    const noId = items.map((p) => aById.get(p.applicantId)!).filter((a) => a.kind === "person" ? !a.idSealed : !a.bizNo);
    if (noId.length && !confirm(`번호가 없는 신청자가 ${noId.length}명 있습니다 (${noId.map((a) => a.name).join(", ")}). 그래도 발급할까요?`)) return;
    // 금액이 바뀐 사람은 예전 영수증을 폐기하고 새 번호로
    for (const r of rows.filter((x) => picked.has(x.p.applicantId) && x.status === "changed")) await voidReceipt(r.receipt!, "금액 변경으로 재발급");
    const made = await issueReceipts(year, items, issuedAt, hhName);
    setPicked(new Set());
    setMsg(`${made.length}장 발급: ${made[0]?.serial ?? ""}${made.length > 1 ? ` ~ ${made[made.length - 1].serial}` : ""}`);
    if (made.length) onPrint(made);
  }

  return (
    <div>
      <p className="totals">
        가정 이름 헌금 <b>{won(totalOfferings)}</b>원 = 영수증 대상 <b>{won(assigned)}</b>원 ({rows.length}명)
        {unassigned > 0 && <> + <span className="warn">신청자 없음 {won(unassigned)}원 ({plan.unassigned.length}가정)</span></>}
        {totalOfferings !== assigned + unassigned && <span className="warn"> ⚠ 합계가 맞지 않습니다</span>}
      </p>
      <div className="row card">
        <button onClick={() => setPicked(new Set(todo.map((r) => r.p.applicantId)))}>발급 안 된 {todo.length}명 모두 고르기</button>
        <label>발급일 <input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} /></label>
        <button className="primary" disabled={!picked.size} onClick={issue}>고른 {picked.size}명 발급·인쇄</button>
        {msg && <span className="ok issue-msg">{msg}</span>}
      </div>

      <table className="list card receipt-list">
        <thead><tr><th /><th>신청자</th><th>대상 가정</th><th className="num">금액</th><th>상태</th><th /></tr></thead>
        <tbody>
          {rows.map(({ p, a, status, receipt }) => (
            <tr key={p.applicantId} data-name={a!.name}>
              <td><input type="checkbox" checked={picked.has(p.applicantId)} onChange={(e) => { const s = new Set(picked); if (e.target.checked) s.add(p.applicantId); else s.delete(p.applicantId); setPicked(s); }} /></td>
              <td>{a!.name}{a!.kind === "corp" && <span className="badge ok-badge">법인</span>}{(a!.kind === "person" ? !a!.idSealed : !a!.bizNo) && <span className="badge">번호 없음</span>}</td>
              <td className="small">{p.sources.map((s) => `${hhName(s.householdId)}${s.pct !== 100 ? ` ${s.pct}%` : ""}`).join(", ")}</td>
              <td className="num amount">{won(p.amount)}</td>
              <td className="status">
                {status === "notIssued" && <span className="muted">발급 전</span>}
                {status === "issued" && <span className="ok">발급 {receipt!.serial}</span>}
                {status === "changed" && <span className="warn">금액 바뀜 (발급 {won(receipt!.amount)}원) → 다시 발급</span>}
              </td>
              <td>{receipt && <button onClick={() => onPrint([receipt])}>인쇄</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {plan.unassigned.length > 0 && (
        <div className="card unassigned">
          <h3>신청자가 없는 가정 ({plan.unassigned.length})</h3>
          <p className="small muted">영수증을 원하지 않는 가정은 그대로 두면 됩니다. 신청하면 여기서 신청자를 정하세요.</p>
          <table className="list"><tbody>
            {plan.unassigned.map((u) => {
              const h = households.find((x) => x.id === u.householdId);
              return [
                <tr key={u.householdId}>
                  <td>{hhName(u.householdId)}{u.reason === "badShares" && <span className="badge">비율 합이 100이 아님</span>}</td>
                  <td className="num">{won(u.total)}</td>
                  <td>{h && <button onClick={() => setEditing(editing === h.id ? null : h.id)}>{editing === h.id ? "닫기" : "신청자 정하기"}</button>}</td>
                </tr>,
                editing === u.householdId && h && <tr key={u.householdId + "-e"}><td colSpan={3}><ShareEditor household={h} members={members.filter((m) => m.householdId === h.id)} applicants={applicants} onDone={() => setEditing(null)} /></td></tr>,
              ];
            })}
          </tbody></table>
        </div>
      )}
    </div>
  );
}

/** 가정 헌금을 누구에게 보낼지 (여러 명이면 %) */
export function ShareEditor({ household, members, applicants, onDone }: { household: Household; members: Member[]; applicants: Applicant[]; onDone?: () => void }) {
  const [shares, setSharesState] = useState<ReceiptShare[]>(household.receiptShares ?? []);
  const [err, setErr] = useState("");
  const used = new Set(shares.map((s) => s.applicantId));
  const byName = (n: string) => applicants.find((a) => a.name === n);
  const add = (applicantId: string) => {
    const next = [...shares, { applicantId, pct: 0 }];
    if (next.length === 1) next[0].pct = 100;
    setSharesState(next);
  };
  return (
    <div className="edit share-editor">
      {shares.map((s, i) => (
        <div className="row" key={s.applicantId}>
          <span>{applicants.find((a) => a.id === s.applicantId)?.name ?? "(없는 신청자)"}</span>
          <input className="rule-amt num" type="number" min={1} max={100} value={s.pct} onChange={(e) => setSharesState(shares.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value) } : x)))} />%
          <button className="x" onClick={() => setSharesState(shares.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <div className="row">
        {members.filter((m) => !used.has(byName(m.name)?.id ?? "")).map((m) => (
          <button key={m.id} onClick={async () => {
            const a = byName(m.name) ?? (await saveApplicant({ kind: /㈜|\(주\)|주식회사/.test(m.name) ? "corp" : "person", name: m.name }));
            add(a.id);
          }}>+ {m.name}</button>
        ))}
        <select value="" onChange={(e) => e.target.value && add(e.target.value)}>
          <option value="">다른 신청자…</option>
          {applicants.filter((a) => !used.has(a.id)).sort((a, b) => a.name.localeCompare(b.name, "ko")).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div className="row">
        <button className="primary" onClick={async () => {
          if (shares.length && !sharesOk(shares)) { setErr("비율을 더해서 100이 되게 하세요"); return; }
          await setShares(household, shares); setErr(""); onDone?.();
        }}>저장</button>
        {err && <span className="warn">{err}</span>}
      </div>
      <p className="small muted">신청자의 주민번호·주소는 '신청자' 화면에서 넣습니다. 한 가정을 두 사람이 나눠 받으면 비율(예: 60 / 40)을 넣으세요.</p>
    </div>
  );
}

// ── 신청자 ───────────────────────────────────────────
function ApplicantsView() {
  const { households, members, applicants } = useData();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const linked = (id: string) => households.filter((h) => h.receiptShares?.some((s) => s.applicantId === id)).map((h) => householdLabel(h, members));
  const shown = applicants.filter((a) => !q || a.name.includes(q)).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return (
    <div>
      <div className="row">
        <input className="search" placeholder="이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="primary" onClick={() => setOpen("new")}>새 신청자</button>
      </div>
      {open === "new" && <ApplicantForm onDone={() => setOpen(null)} />}
      <table className="list card">
        <thead><tr><th>이름</th><th>번호</th><th>연락처</th><th>주소</th><th>연결된 가정</th><th /></tr></thead>
        <tbody>
          {shown.map((a) => [
            <tr key={a.id}>
              <td>{a.name}{a.kind === "corp" && <span className="badge ok-badge">법인</span>}</td>
              <td>{a.kind === "corp" ? a.bizNo : a.idMasked ?? <span className="warn">없음</span>}</td>
              <td>{a.phone}</td>
              <td className="small">{a.address}</td>
              <td className="small">{linked(a.id).join(", ") || <span className="warn">없음</span>}</td>
              <td><button onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? "닫기" : "고치기"}</button></td>
            </tr>,
            open === a.id && <tr key={a.id + "-e"}><td colSpan={6}><ApplicantForm a={a} onDone={() => setOpen(null)} /></td></tr>,
          ])}
        </tbody>
      </table>
      <p className="small muted">신청자 {applicants.length}명. 주민번호는 잠긴 채 저장되며 여기서는 앞자리만 보입니다.</p>
    </div>
  );
}

function ApplicantForm({ a, onDone }: { a?: Applicant; onDone: () => void }) {
  const [kind, setKind] = useState<Applicant["kind"]>(a?.kind ?? "person");
  const [f, setF] = useState({ name: a?.name ?? "", idText: "", phone: a?.phone ?? "", address: a?.address ?? "", note: a?.note ?? "" });
  const [err, setErr] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const open = useVaultOpen();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="edit applicant-form" onSubmit={async (e) => {
      e.preventDefault();
      try { await saveApplicant({ kind, ...f }, a); onDone(); } catch (x) { setErr((x as Error).message); }
    }}>
      <div className="row">
        <label><input type="radio" checked={kind === "person"} onChange={() => setKind("person")} /> 개인</label>
        <label><input type="radio" checked={kind === "corp"} onChange={() => setKind("corp")} /> 법인</label>
      </div>
      <div className="row">
        <input name="name" placeholder={kind === "corp" ? "법인명" : "성명"} value={f.name} onChange={set("name")} />
        <input name="idText" placeholder={kind === "corp" ? "사업자등록번호" : a?.idMasked ? `주민번호 (바꿀 때만: ${a.idMasked})` : "주민등록번호 13자리"} value={f.idText} onChange={set("idText")} autoComplete="off" />
        {a?.idSealed && open && <button type="button" onClick={async () => setShown(await revealId(a.idSealed))}>번호 보기</button>}
        {shown && <span className="mono">{shown}</span>}
      </div>
      <div className="row">
        <input name="phone" placeholder="휴대폰" value={f.phone} onChange={set("phone")} />
        <input name="address" style={{ flex: 1 }} placeholder={kind === "corp" ? "소재지" : "주소 (도로명)"} value={f.address} onChange={set("address")} />
      </div>
      <div className="row">
        <input name="note" style={{ flex: 1 }} placeholder="메모 (요청 사항 등)" value={f.note} onChange={set("note")} />
        <button className="primary">저장</button>
        {a && <button type="button" onClick={async () => { if (confirm(`${a.name} 신청자를 지울까요? (발급대장 기록은 남음)`)) { await db.applicants.put(touch({ ...a, deleted: true })); onDone(); } }}>지우기</button>}
      </div>
      {err && <p className="warn">{err}</p>}
    </form>
  );
}

// ── 발급대장 ─────────────────────────────────────────
function LedgerView({ year, onPrint }: { year: number; onPrint: (r: Receipt[]) => void }) {
  const receipts = useLiveQuery(() => db.receipts.where("year").equals(year).filter((r) => !r.deleted).sortBy("serial"), [year]) ?? [];
  const open = useVaultOpen();
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const ok = receipts.filter((r) => r.status === "issued");
  const sum = (k: Receipt["kind"]) => ok.filter((r) => r.kind === k);

  async function exportXlsx() {
    const rows: (string | number)[][] = [["NO", "구분", "일련번호", "이름", open ? "주민등록번호/사업자번호" : "생년월일(앞자리)", "주소", "금액", "발급일자", "비고"]];
    for (const [i, r] of receipts.entries()) {
      const id = r.kind === "corp" ? r.bizNo ?? "" : (open ? await revealId(r.idSealed) : null) ?? r.idMasked ?? "";
      rows.push([i + 1, r.kind === "corp" ? "법인" : "개인", r.serial, r.name, id, r.address ?? "", r.status === "void" ? 0 : r.amount, r.issuedAt, r.status === "void" ? `폐기: ${r.voidReason}` : ""]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${serialPrefix(year)}발행`);
    XLSX.writeFile(wb, `${serialPrefix(year)}년도 발급_기부금영수증 발급대장.xlsx`);
  }

  return (
    <div>
      <p className="totals ledger-totals">
        개인 <b>{sum("person").length}</b>건 {won(sum("person").reduce((s, r) => s + r.amount, 0))}원 · 법인 <b>{sum("corp").length}</b>건 {won(sum("corp").reduce((s, r) => s + r.amount, 0))}원 ·
        합계 <b>{ok.length}</b>건 <b>{won(ok.reduce((s, r) => s + r.amount, 0))}</b>원 {receipts.length > ok.length && <span className="muted">· 폐기 {receipts.length - ok.length}건</span>}
      </p>
      <div className="row no-print">
        <button onClick={() => print()}>대장 인쇄</button>
        <button onClick={exportXlsx}>엑셀로 내보내기</button>
        <button disabled={!ok.length} onClick={() => onPrint(ok)}>영수증 전부 다시 인쇄 ({ok.length}장)</button>
        {open && <span className="warn small">금고가 열려 있어 엑셀에 주민번호 전체가 들어갑니다. 파일 보관에 주의하세요.</span>}
      </div>
      <div className="table-wrap">
        <table className="grid ledger">
          <thead><tr><th>일련번호</th><th>구분</th><th>이름</th><th>번호</th><th>주소</th><th className="num">금액</th><th>발급일자</th><th>비고</th><th className="no-print" /></tr></thead>
          <tbody>
            {receipts.map((r) => [
              <tr key={r.id} className={r.status === "void" ? "void" : ""} data-serial={r.serial}>
                <td>{r.serial}</td><td>{r.kind === "corp" ? "법인" : "개인"}</td><td>{r.name}</td>
                <td>{r.kind === "corp" ? r.bizNo : r.idMasked}</td><td className="small">{r.address}</td>
                <td className="num">{r.status === "void" ? "" : won(r.amount)}</td><td>{r.issuedAt}</td>
                <td className="small">{r.status === "void" ? `폐기: ${r.voidReason}` : r.sources?.join(", ")}</td>
                <td className="no-print">
                  <button onClick={() => onPrint([r])}>인쇄</button>
                  {r.status === "issued" && <button onClick={() => { setVoiding(r.id); setReason(""); }}>폐기</button>}
                </td>
              </tr>,
              voiding === r.id && (
                <tr key={r.id + "-v"} className="no-print"><td colSpan={9}>
                  <div className="row">
                    <input placeholder="폐기 사유 (예: 주소 변경으로 재발급)" value={reason} onChange={(e) => setReason(e.target.value)} />
                    <button className="primary" onClick={async () => { await voidReceipt(r, reason); setVoiding(null); }}>폐기</button>
                    <button onClick={() => setVoiding(null)}>취소</button>
                    <span className="small muted">폐기한 번호는 비워 두고, 다시 발급하면 새 번호가 붙습니다.</span>
                  </div>
                </td></tr>
              ),
            ])}
          </tbody>
        </table>
      </div>
      {!receipts.length && <p className="muted">{year}년 헌금으로 발급한 영수증이 아직 없습니다.</p>}
    </div>
  );
}

// ── 설정·가져오기 ─────────────────────────────────────
function SetupView({ church }: { church: ChurchInfo }) {
  const [c, setC] = useState<ChurchInfo>(church);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof ChurchInfo) => (e: React.ChangeEvent<HTMLInputElement>) => { setC({ ...c, [k]: e.target.value }); setSaved(false); };
  return (
    <div className="two-col">
      <form className="card church-form" onSubmit={async (e) => { e.preventDefault(); await saveChurch(c); setSaved(true); }}>
        <h3>교회 정보 (영수증 ② 기부금 단체)</h3>
        <label className="field"><span>단체명</span><input name="churchName" value={c.name} onChange={set("name")} placeholder="대한예수교장로회 ○○교회" /></label>
        <label className="field"><span>고유번호 (사업자등록번호)</span><input name="regNo" value={c.regNo} onChange={set("regNo")} placeholder="000-00-00000" /></label>
        <label className="field"><span>소재지</span><input name="churchAddress" value={c.address} onChange={set("address")} /></label>
        <label className="field"><span>기부금 수령인 (대표자)</span><input name="receiver" value={c.receiver} onChange={set("receiver")} placeholder="담임목사 ○○○" /></label>
        <label className="field"><span>근거법령</span><input value={c.law} onChange={set("law")} /></label>
        <label className="field"><span>기부금 코드</span><input value={c.code} onChange={set("code")} /></label>
        <div className="row"><button className="primary">저장</button>{saved && <span className="ok">저장했습니다</span>}</div>
      </form>
      <div>
        <LedgerImport />
        <PassChange />
      </div>
    </div>
  );
}

function LedgerImport() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [res, setRes] = useState<LedgerImportResult | null>(null);
  const [err, setErr] = useState("");
  const sheets = useMemo(() => summarizeLedgerSheets(rows), [rows]);
  const picked = mergeLedger(rows.filter((r) => chosen.has(`${r.sheet}|${r.serial.slice(0, 4)}`)));
  return (
    <div className="card ledger-import">
      <h3>예전 발급대장 가져오기</h3>
      <p className="small muted">'기부금영수증 발급 현황표' 엑셀을 고르면 신청자(주민번호는 잠가서)와 발급 기록을 한 번에 넣고, 이름이 같은 가정에 신청자를 자동으로 연결합니다. 파일은 이 기기 안에서만 읽습니다.</p>
      <label className="file"><span className="primary-like">엑셀 고르기</span>
        <input type="file" accept=".xlsx,.xls" onChange={async (e) => {
          setErr(""); setRes(null);
          const f = e.target.files?.[0];
          if (!f) return;
          const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array", cellDates: true });
          const all = wb.SheetNames.flatMap((n) => readLedgerGrid(n, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: null })));
          if (!all.length) { setErr("발급대장 모양(일련번호·이름·금액 머리글)을 찾지 못했습니다"); return; }
          setRows(all);
          setChosen(new Set(summarizeLedgerSheets(all).filter((s) => s.chosen).map((s) => s.key)));
          e.target.value = "";
        }} />
      </label>
      {sheets.length > 0 && (
        <>
          <table className="list"><tbody>
            {sheets.map((s) => (
              <tr key={s.key}><td><label><input type="checkbox" checked={chosen.has(s.key)} onChange={(e) => { const n = new Set(chosen); if (e.target.checked) n.add(s.key); else n.delete(s.key); setChosen(n); }} /> {s.sheet}</label></td><td>{s.prefix}년 발급</td><td className="num">{s.count}건</td></tr>
            ))}
          </tbody></table>
          <p className="small">가져올 것: {picked.length}건 (폐기 {picked.filter((r) => r.void).length}건) · 합계 {won(picked.filter((r) => !r.void).reduce((s, r) => s + r.amount, 0))}원</p>
          <button className="primary" disabled={!picked.length} onClick={async () => {
            try { setRes(await importLedger(picked)); setRows([]); } catch (x) { setErr((x as Error).message); }
          }}>가져오기</button>
        </>
      )}
      {res && (
        <p className="ok import-result">
          신청자 새로 {res.applicantsNew}명(이미 있음 {res.applicantsKnown}) · 발급 기록 {res.receipts}건 (겹쳐서 건너뜀 {res.skipped}) · 가정 자동 연결 {res.linked}곳
          {res.unmatched.length > 0 && <span className="warn"><br />가정을 못 찾은 신청자 {res.unmatched.length}명: {res.unmatched.join(", ")} → '발급' 화면의 '신청자 없는 가정'에서 연결하세요</span>}
        </p>
      )}
      {err && <p className="warn">{err}</p>}
    </div>
  );
}

function PassChange() {
  const [o, setO] = useState(""); const [n, setN] = useState(""); const [msg, setMsg] = useState("");
  return (
    <form className="card" onSubmit={async (e) => { e.preventDefault(); setMsg((await changePass(o, n)) ? "바꿨습니다" : "지금 비밀번호가 틀렸거나 새 비밀번호가 6자보다 짧습니다"); setO(""); setN(""); }}>
      <h3>영수증 비밀번호 바꾸기</h3>
      <div className="row">
        <input type="password" placeholder="지금 비밀번호" value={o} onChange={(e) => setO(e.target.value)} />
        <input type="password" placeholder="새 비밀번호" value={n} onChange={(e) => setN(e.target.value)} />
        <button>바꾸기</button>
      </div>
      {msg && <p className="small">{msg}</p>}
      <p className="small muted">담당자가 바뀌면 비밀번호를 바꿔 넘기세요. 이미 저장된 주민번호는 새 비밀번호로 그대로 열립니다.</p>
    </form>
  );
}

