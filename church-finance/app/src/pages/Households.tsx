import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, newId, softDelete, touch } from "../data/db";
import { createHouseholdFromText } from "../data/actions";
import { chosung } from "../domain/donors";
import { won } from "../domain/weeklyReport";
import type { Applicant, Household, Member } from "../domain/types";
import { ShareEditor } from "./Receipts";

// 교인·가정 명부. 가정마다 '영수증 신청자'를 정하면 가족 헌금이 그 사람 영수증으로 합산된다 (여럿이면 비율로).
export default function Households() {
  const households = useLiveQuery(() => db.households.filter((h) => !h.deleted).toArray(), []) ?? [];
  const members = useLiveQuery(() => db.members.filter((m) => !m.deleted).toArray(), []) ?? [];
  const offerings = useLiveQuery(() => db.offerings.filter((o) => !o.deleted).toArray(), []) ?? [];
  const applicants = useLiveQuery(() => db.applicants.filter((a) => !a.deleted).toArray(), []) ?? [];
  const [q, setQ] = useState("");
  const [newText, setNewText] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [onlyReview, setOnlyReview] = useState(false);

  const year = new Date().getFullYear();
  const yearSum = (hid: string) => offerings.filter((o) => o.householdId === hid && o.date.startsWith(String(year))).reduce((s, o) => s + o.amount, 0);
  const reviewCount = households.filter((h) => h.needsReview).length;
  const shown = households
    .filter((h) => !onlyReview || h.needsReview)
    .filter((h) => {
      if (!q) return true;
      const text = [h.name, ...members.filter((m) => m.householdId === h.id).map((m) => m.name)].join(" ");
      return text.includes(q) || chosung(text).includes(q);
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  return (
    <section className="pad" data-page="people">
      <div className="row between">
        <input className="search" placeholder="이름·초성 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="row">
          <input placeholder="새 가정: 홍길동,김영희" value={newText} onChange={(e) => setNewText(e.target.value)} />
          <button className="primary" disabled={!newText.trim()} onClick={async () => { await createHouseholdFromText(newText.trim()); setNewText(""); }}>등록</button>
        </div>
      </div>
      <p className="muted">
        가정 {households.length} · 교인 {members.length}명 · {year}년 헌금은 가정 단위로 합산됩니다.
        {reviewCount > 0 && (
          <label className="warn"> <input type="checkbox" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} /> 확인 필요 {reviewCount}개만 보기</label>
        )}
      </p>

      <table className="list card">
        <thead><tr><th>가정</th><th>구성원</th><th>영수증 신청자</th><th className="num">{year}년 헌금</th><th /></tr></thead>
        <tbody>
          {shown.map((h) => {
            const ms = members.filter((m) => m.householdId === h.id);
            const shares = (h.receiptShares ?? []).map((x) => `${applicants.find((a) => a.id === x.applicantId)?.name ?? "?"}${x.pct !== 100 ? ` ${x.pct}%` : ""}`);
            return [
              <tr key={h.id}>
                <td>{h.name}{h.needsReview && <span className="badge" title={h.needsReview}>확인 필요</span>}</td>
                <td>{ms.map((m) => m.name + (m.tag ?? "")).join(", ")}</td>
                <td>{shares.length ? shares.join(", ") : <span className="muted">없음</span>}</td>
                <td className="num">{won(yearSum(h.id))}</td>
                <td><button onClick={() => setOpen(open === h.id ? null : h.id)}>{open === h.id ? "닫기" : "고치기"}</button></td>
              </tr>,
              open === h.id && <tr key={h.id + "-edit"}><td colSpan={5}><EditHousehold h={h} ms={ms} applicants={applicants} /></td></tr>,
            ];
          })}
        </tbody>
      </table>
    </section>
  );
}

function EditHousehold({ h, ms, applicants }: { h: Household; ms: Member[]; applicants: Applicant[] }) {
  const [name, setName] = useState("");
  const saveH = (patch: Partial<Household>) => db.households.put(touch({ ...h, ...patch }));
  const saveM = (m: Member, patch: Partial<Member>) => db.members.put(touch({ ...m, ...patch }));
  return (
    <div className="edit">
      {h.needsReview && (
        <p className="warn">
          {h.needsReview} <button onClick={() => saveH({ needsReview: undefined })}>확인했음</button>
        </p>
      )}
      <label>가정 이름 <input defaultValue={h.name} onBlur={(e) => e.target.value !== h.name && saveH({ name: e.target.value })} /></label>
      <table className="list">
        <tbody>
          {ms.map((m) => (
            <tr key={m.id}>
              <td><input defaultValue={m.name} onBlur={(e) => e.target.value !== m.name && saveM(m, { name: e.target.value })} /></td>
              <td><input className="tag" placeholder="구분(A)" defaultValue={m.tag} onBlur={(e) => saveM(m, { tag: e.target.value || undefined })} /></td>
              <td><button className="x" onClick={() => softDelete(db.members as never, m.id)}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <input placeholder="가족 추가" value={name} onChange={(e) => setName(e.target.value)} />
        <button disabled={!name.trim()} onClick={async () => { await db.members.put(touch({ id: newId(), updatedAt: 0, householdId: h.id, name: name.trim() })); setName(""); }}>추가</button>
      </div>
      <h3 style={{ marginTop: 12 }}>기부금영수증 신청자</h3>
      <ShareEditor key={JSON.stringify(h.receiptShares ?? [])} household={h} members={ms} applicants={applicants} />
    </div>
  );
}
