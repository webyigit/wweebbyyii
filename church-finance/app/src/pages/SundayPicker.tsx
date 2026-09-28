import { addDays, sundayOf } from "../domain/dates";

/** 주일 고르기 — 어느 날을 골라도 그 주 주일로 맞춘다 */
export default function SundayPicker({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  return (
    <div className="sunday">
      <button onClick={() => setDate(addDays(date, -7))} aria-label="지난 주일">◀</button>
      <input type="date" value={date} onChange={(e) => e.target.value && setDate(sundayOf(e.target.value))} />
      <button onClick={() => setDate(addDays(date, 7))} aria-label="다음 주일">▶</button>
    </div>
  );
}
