// 지출 과목 — docs/04-계정과목표.md §3. 출납 파일의 부서 시트 12장 + 특별헌금·해외선교에서 쓰는 지출.
// 예산 금액은 저장소에 두지 않는다 (엑셀 가져오기로 DB 에만).
import type { ExpenseItem } from "./types";

// [부서코드, 부서 이름, 엑셀 시트 이름, 항목들]
const DEPTS: [string, string, string, string[]][] = [
  ["WORSHIP", "예배부", "예배", ["부활절행사", "어린이주일행사", "어버이주일행사", "추수감사절행사", "성탄절행사", "임직및은퇴식행사", "오후예배행사"]],
  ["SERVICE", "봉사부", "봉사", ["일반접대", "주일식사", "교회김장"]],
  ["ADULT-EDU", "장년교육부", "장년교육부", ["교역자훈련비", "제직회수련회", "항존직수련회", "평신도훈련비", "구역장·권찰수련회", "남선교회연합회 체육대회"]],
  ["SCHOOL", "교회학교부", "교회학교", ["유치부전도사 사례비", "아동부전도사 사례비", "중고등부전도사 사례비", "교사대학", "유치부교육비", "아동부교육비", "중고등부교육비", "다드림청년공동체 교육비", "각부 공과금", "교회학교운영"]],
  ["EVANGEL", "전도부", "전도", ["부교역자사례비", "심방비", "전도비"]],
  ["MISSION-DOM", "선교부", "이웃사랑", ["국내선교비"]],
  ["FACILITY", "관리부", "관리부", ["주보발행비", "인쇄비", "광고비", "사무용품비", "소모품비", "비품수리비", "교회당유지비", "공공요금"]],
  ["VEHICLE", "차량관리부", "차량관리", ["차량보험료", "차량정비·검사료", "자동차세등", "유류비"]],
  ["WELFARE", "사회복지부", "사회복지", ["경로잔치", "전교인신년친목회", "경조비"]],
  ["MUSIC", "음악부", "음악", ["지휘자사례비", "반주자사례비", "남성중창단", "임마누엘찬양대", "음악부운영비", "악기구입비", "챔버팀운영"]],
  ["FINANCE", "재정부", "재정부", ["원로목사사례비", "담임목사사례비", "목양비", "총회연금지원금", "노회상회비", "대출이자", "예비비"]],
  ["SPECIAL-MIN", "특별사역팀", "특별사역", ["새신자양육팀", "주일예배찬양팀", "성찬팀", "홈페이지운영"]],
];

// [부서코드, 이름, 다른 표기] — 2025년 총계정원장에만 있는 항목. 순서를 바꾸지 말 것 (코드가 순서로 정해짐)
const PAST_ITEMS: [string, string, string[]?][] = [
  ["SERVICE", "남선교회연합회 행사", ["남선교회연합 총회"]],
  ["ADULT-EDU", "장년부교육비"],
  ["ADULT-EDU", "전교인야외예배"],
  ["SCHOOL", "성탄축하발표회"],
  ["SPECIAL-MIN", "남도전도대"],
  ["SPECIAL-MIN", "미디어운영팀"],
  ["SPECIAL-MIN", "성전사랑팀"],
  ["SPECIAL-MIN", "중보기도팀"],
];

export const DEPARTMENTS = DEPTS.map(([code, name, sheet], i) => ({ code, name, sheet, sort: i }));

export const DEFAULT_EXPENSE_ITEMS: ExpenseItem[] = [
  ...DEPTS.flatMap(([dept, , , items], d) =>
    items.map((name, i) => ({ code: `${dept}-${i + 1}`, fund: "G" as const, dept, name, active: true, sort: d * 100 + i })),
  ),
  // 지난 해에만 있던 항목 (지난 자료를 가져올 때 쓰고, 입력 화면에는 안 나옴)
  ...PAST_ITEMS.map(([dept, name, aliases], i) => ({
    code: `${dept}-P${i + 1}`, fund: "G" as const, dept, name, active: false, aliases,
    sort: DEPTS.findIndex((d) => d[0] === dept) * 100 + 50 + i,
  })),
  // 특별회계·해외선교 지출: '어느 헌금에서 나갔는지'만 고르면 됨
  { code: "X-S-NEIGHBOR", fund: "S", dept: "SPECIAL", name: "이웃사랑헌금에서", active: true, sort: 2000, incomeLine: "S-NEIGHBOR" },
  { code: "X-S-FLOWER", fund: "S", dept: "SPECIAL", name: "꽃꽂이헌금에서", active: true, sort: 2001, incomeLine: "S-FLOWER" },
  { code: "X-S-BUILD", fund: "S", dept: "SPECIAL", name: "건축(E/V)헌금에서", active: true, sort: 2002, incomeLine: "S-BUILD" },
  { code: "X-S-WISH", fund: "S", dept: "SPECIAL", name: "소원예물에서 (2025년)", active: false, sort: 2003, incomeLine: "S-WISH" },
  { code: "X-S-INSURANCE", fund: "S", dept: "SPECIAL", name: "보험금수령에서 (2025년)", active: false, sort: 2004, incomeLine: "S-INSURANCE" },
  { code: "X-M-MISSION", fund: "M", dept: "MISSION", name: "해외선교헌금에서 (선교사 송금 등)", active: true, sort: 3000, incomeLine: "M-MISSION" },
  { code: "X-M-RELIEF", fund: "M", dept: "MISSION", name: "긴급구호헌금에서", active: true, sort: 3001, incomeLine: "M-RELIEF" },
];

export const DEPT_NAME: Record<string, string> = {
  ...Object.fromEntries(DEPARTMENTS.map((d) => [d.code, d.name])),
  SPECIAL: "특별헌금",
  MISSION: "해외선교",
};

/** 엑셀 표기 → 항목 코드 (띄어쓰기·쉼표/가운뎃점·'사례비' 앞 띄어쓰기 차이 흡수) */
const norm = (s: string) => s.replace(/[\s,·.]/g, "").replace(/례비$/, "례비");
export function findExpenseItem(deptSheetOrName: string, itemName: string, items = DEFAULT_EXPENSE_ITEMS): ExpenseItem | undefined {
  const d = DEPARTMENTS.find((x) => norm(x.sheet) === norm(deptSheetOrName) || norm(x.name) === norm(deptSheetOrName) || norm(x.name).startsWith(norm(deptSheetOrName)));
  const n = norm(itemName);
  const pool = items.filter((i) => (d ? i.dept === d.code : true));
  return pool.find((i) => norm(i.name) === n || i.aliases?.some((a) => norm(a) === n))
    ?? pool.find((i) => norm(i.name).includes(n) || n.includes(norm(i.name)));
}
