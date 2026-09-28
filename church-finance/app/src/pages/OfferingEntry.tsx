import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useRef, useState } from "react";
import { db } from "../data/db";
import { addOffering, createHouseholdFromText, deleteOffering } from "../data/actions";
import { parseAmount } from "../domain/amount";
import { previousRoster, searchDonors, type DonorHit } from "../domain/donors";
import { won } from "../domain/weeklyReport";
import type { PayMethod } from "../domain/types";
import SundayPicker from "./SundayPicker";

export default function OfferingEntry({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const categories = useLiveQuery(() => db.categories.orderBy("sort").filter((c) => c.active).toArray(), []) ?? [];
  const households = useLiveQuery(() => db.households.toArray(), []) ?? [];
  const members = useLiveQuery(() => db.members.toArray(), []) ?? [];
  const aliases = useLiveQuery(() => db.aliases.toArray(), []) ?? [];
  const offerings = useLiveQuery(() => db.offerings.toArray(), []) ?? [];

  const [code, setCode] = useState("G-TITHE");
  const cat = categories.find((c) => c.code === code) ?? categories[0];
  const [donor, setDonor] = useState("");
  const [picked, setPicked] = useState<DonorHit | null>(null);
  const [amountText, setAmountText] = useState("");
  const [method, setMethod] = useState<PayMethod>("cash");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const donorRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(
    () => (picked ? [] : searchDonors(donor, households, members, aliases, offerings)),
    [donor, picked, households, members, aliases, offerings],
  );
  const week = offerings.filter((o) => !o.deleted && o.date === date);
  const mine = week.filter((o) => o.categoryCode === cat?.code).sort((a, b) => a.createdAt - b.createdAt);
  const roster = cat?.named ? previousRoster(cat.code, date, offerings) : [];
  const amount = parseAmount(amountText);

  const pick = (h: DonorHit) => {
    setPicked(h);
    setDonor(h.label);
    amountRef.current?.focus();
  };

  const reset = () => {
    setDonor(""); setPicked(null); setAmountText(""); setNote("");
    (cat?.named ? donorRef : amountRef).current?.focus();
  };

  async function submit() {
    if (!cat) return;
    setMsg("");
    if (!amount) return setMsg("금액을 확인해 주세요. 예: 50000, 5만, 1만5천");
    let householdId: string | undefined;
    let donorText = "";
    if (cat.named) {
      const text = donor.trim();
      if (!text) return setMsg("헌금하신 분 이름을 넣어 주세요.");
      if (picked) {
        householdId = picked.householdId;
        donorText = picked.label;
      } else if (/^무명\d*$/.test(text)) {
        donorText = text; // 무명은 가정에 연결하지 않음 (영수증 대상 아님)
      } else {
        const top = hits[0];
        if (top && top.score >= 100) {
          householdId = top.householdId;
          donorText = top.label;
        } else {
          const h = await createHouseholdFromText(text);
          householdId = h.id;
          donorText = text;
          setMsg(`새 가정으로 등록했습니다: ${text} (교인·가정 화면에서 고칠 수 있어요)`);
        }
      }
    }
    await addOffering({ date, categoryCode: cat.code, householdId, donorText, amount, method, note: note.trim() || undefined });
    reset();
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (e.currentTarget === donorRef.current && hits.length && !picked) return pick(hits[0]);
    if (e.currentTarget === donorRef.current) return amountRef.current?.focus();
    submit();
  };

  const groups = [...new Set(categories.map((c) => c.group))];
  const weekTotal = (f: string) => week.filter((o) => categories.find((c) => c.code === o.categoryCode)?.fund === f).reduce((s, o) => s + o.amount, 0);

  return (
    <section className="pad" data-page="entry">
      <div className="row between">
        <SundayPicker date={date} setDate={setDate} />
        <div className="totals">
          이번 주 일반 <b>{won(weekTotal("G"))}</b> · 특별 <b>{won(weekTotal("S"))}</b> · 선교 <b>{won(weekTotal("M"))}</b>
        </div>
      </div>

      <div className="chips">
        {groups.map((g) => (
          <div key={g} className="chip-group">
            <span className="chip-label">{g}</span>
            {categories.filter((c) => c.group === g).map((c) => {
              const n = week.filter((o) => o.categoryCode === c.code).length;
              return (
                <button key={c.code} className={c.code === cat?.code ? "chip on" : "chip"} onClick={() => { setCode(c.code); setMsg(""); setPicked(null); setDonor(""); }}>
                  {c.name}{n > 0 && <small> {n}</small>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {cat && (
        <div className="entry card">
          {cat.named && (
            <div className="field donor">
              <label>이름</label>
              <input
                ref={donorRef} value={donor} autoFocus placeholder="이름 앞글자나 초성 (예: ㅎㄱㄷ)"
                onChange={(e) => { setDonor(e.target.value); setPicked(null); setMsg(""); }} onKeyDown={onKey}
              />
              {hits.length > 0 && (
                <ul className="suggest">
                  {hits.map((h) => (
                    <li key={h.householdId}><button onClick={() => pick(h)}>{h.label}</button></li>
                  ))}
                </ul>
              )}
              {donor && !picked && hits.length === 0 && !/^무명\d*$/.test(donor.trim()) && (
                <p className="hint">처음 보는 이름입니다. 추가하면 새 가정으로 등록됩니다. 부부는 쉼표로: 홍길동,김영희</p>
              )}
            </div>
          )}
          <div className="field amount">
            <label>금액</label>
            <input ref={amountRef} value={amountText} inputMode="numeric" placeholder="예: 50000, 5만" onChange={(e) => setAmountText(e.target.value)} onKeyDown={onKey} autoFocus={!cat.named} />
            <span className="preview">{amount ? `${won(amount)}원` : ""}</span>
          </div>
          {cat.needsNote && (
            <div className="field">
              <label>내용</label>
              <input value={note} placeholder="감사 제목 등" onChange={(e) => setNote(e.target.value)} onKeyDown={onKey} />
            </div>
          )}
          <div className="field method">
            <button className={method === "cash" ? "on" : ""} onClick={() => setMethod("cash")}>현금</button>
            <button className={method === "online" ? "on" : ""} onClick={() => setMethod("online")}>온라인</button>
          </div>
          <button className="primary" onClick={submit}>추가 (Enter)</button>
          {msg && <p className="msg">{msg}</p>}
        </div>
      )}

      <div className="two-col">
        <div className="card this-week">
          <h3>{cat?.name} — 이번 주 {mine.length ? `${mine.length}건 · ${won(mine.reduce((s, o) => s + o.amount, 0))}원` : "아직 없음"}</h3>
          <table className="list">
            <tbody>
              {mine.map((o, i) => (
                <tr key={o.id}>
                  <td className="num">{i + 1}</td>
                  <td>{o.donorText || "(총액)"}{o.note && <small className="muted"> · {o.note}</small>}</td>
                  <td className="num">{won(o.amount)}</td>
                  <td className="muted">{o.method === "online" ? "온라인" : ""}</td>
                  <td><button className="x" onClick={() => deleteOffering(o.id)} aria-label="삭제">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {roster.length > 0 && (
          <div className="card roster">
            <h3>지난 명단 ({roster[0].fromDate}) — 누르면 같은 금액으로 추가</h3>
            <table className="list">
              <tbody>
                {roster.map((r) => (
                  <tr key={r.householdId}>
                    <td>{r.donorText}</td>
                    <td className="num">{won(r.amount)}</td>
                    <td>
                      <button onClick={() => addOffering({ date, categoryCode: cat!.code, householdId: r.householdId, donorText: r.donorText, amount: r.amount, method: r.method })}>
                        추가
                      </button>
                      <button onClick={() => { pick({ householdId: r.householdId, label: r.donorText, score: 0 }); }}>금액 다름</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
