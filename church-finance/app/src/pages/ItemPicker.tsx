import { DEPT_NAME } from "../domain/expenseCategories";
import type { ExpenseItem } from "../domain/types";

/** 지출 항목 고르기 — 부서별로 묶은 목록 */
export default function ItemPicker({ items, value, onChange }: { items: ExpenseItem[]; value: string; onChange: (code: string) => void }) {
  const depts = [...new Set(items.filter((i) => i.active).sort((a, b) => a.sort - b.sort).map((i) => i.dept))];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">항목 고르기</option>
      {depts.map((d) => (
        <optgroup key={d} label={DEPT_NAME[d] ?? d}>
          {items.filter((i) => i.dept === d && i.active).map((i) => <option key={i.code} value={i.code}>{i.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
