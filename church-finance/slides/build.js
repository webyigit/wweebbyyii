// 프로젝트 히스토리 슬라이드 생성기
// 실행: cd church-finance/slides && npm i && node build.js  →  history.pptx
// 만든 파일은 구글 드라이브에 올려 Google Slides 로 변환합니다 (NEXT.md 참고).
// 규칙: HISTORY.md 에 항목이 늘면 이 발표자료도 같이 갱신합니다 (TIMELINE, 결정, 로드맵, 다음 할 일, 발표자 노트).
// 누구나 이 자료만 들고 발표할 수 있어야 하므로 슬라이드마다 발표자 노트(addNotes)를 꼭 채웁니다.
// 실제 교인 이름·금액·계좌번호는 넣지 않습니다.

const pptxgen = require("pptxgenjs");

const C = {
  ink: "1F3A34",      // 짙은 상록 (주색)
  inkSoft: "3E5C55",
  mist: "E6EFEB",     // 옅은 녹회색 (카드 배경)
  gold: "C8963E",     // 강조
  white: "FFFFFF",
  text: "22302C",
  muted: "5F6F6A",
  red: "B5483B",
};
const FONT = "Noto Sans KR";
const UPDATED = "2026-09-28";

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.title = "교회 재정관리 온라인 전환 — 프로젝트 히스토리";

const T = (o) => Object.assign({ fontFace: FONT, color: C.text, isTextBox: true, margin: 0 }, o);

function title(slide, text, sub) {
  slide.addText(text, T({ x: 0.5, y: 0.35, w: 9, h: 0.6, fontSize: 26, bold: true, color: C.ink }));
  if (sub) slide.addText(sub, T({ x: 0.5, y: 0.95, w: 9, h: 0.35, fontSize: 12, color: C.muted }));
}
function badge(slide, x, y, label, fill = C.ink, color = C.white, d = 0.42) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill } });
  slide.addText(String(label), T({ x, y, w: d, h: d, fontSize: 13, bold: true, color, align: "center", valign: "middle" }));
}
function card(slide, x, y, w, h, fill = C.mist) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { color: fill }, rectRadius: 0.08 });
}
function footer(slide, n) {
  slide.addText(`교회 재정관리 프로젝트 · ${n}`, T({ x: 0.5, y: 5.2, w: 9, h: 0.25, fontSize: 9, color: C.muted, align: "right" }));
}

// 1. 표지
{
  const s = pres.addSlide();
  s.background = { color: C.ink };
  badge(s, 0.6, 1.2, "✝", C.gold, C.ink, 0.6);
  s.addText("교회 재정관리\n온라인 전환 프로젝트", T({ x: 0.6, y: 1.95, w: 8.5, h: 1.4, fontSize: 36, bold: true, color: C.white }));
  s.addText("엑셀에서 웹·앱으로 — 진행 기록", T({ x: 0.6, y: 3.4, w: 8.5, h: 0.45, fontSize: 18, color: "CFE0D9" }));
  s.addNotes('안녕하세요. 오늘은 교회 재정관리를 엑셀에서 온라인 프로그램으로 옮기는 프로젝트가 어디까지 왔는지 말씀드리겠습니다. 이 자료는 작업할 때마다 갱신되는 진행 기록입니다.');
  s.addText(`최종 갱신 ${UPDATED}   ·   PM: Claude   ·   고객: 교회 재정부`, T({ x: 0.6, y: 4.6, w: 8.5, h: 0.35, fontSize: 11, color: "A9BFB7" }));
}

// 2. 목표
{
  const s = pres.addSlide();
  title(s, "무엇을 만드나", "고객 요구사항 7가지");
  s.addText("헌금은 한 번만 입력 →\n주간 집계·개인별 집계·기부금영수증·예결산이 자동으로", T({ x: 0.5, y: 1.45, w: 3.3, h: 1.6, fontSize: 17, bold: true, color: C.ink, valign: "top" }));
  s.addText("이 한 문장이 프로젝트의 기준입니다.", T({ x: 0.5, y: 3.15, w: 3.3, h: 0.4, fontSize: 12, color: C.muted }));
  const reqs = [
    ["100% 온라인", "엑셀 없이 1년 운영"],
    ["입력 최소화", "헌금 1건 = 입력 1번"],
    ["매주 집계", "지금 양식 그대로 출력"],
    ["기부금영수증", "연 1회 일괄 발행"],
    ["예결산", "예산 편성 → 결산서 자동"],
    ["웹 + 앱", "PC·휴대폰 모두"],
    ["동기화", "오프라인 입력 → 자동 맞춤"],
  ];
  reqs.forEach(([h, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 4.1 + col * 2.75, y = 1.35 + row * 0.95;
    card(s, x, y, 2.6, 0.8);
    badge(s, x + 0.15, y + 0.19, i + 1, C.ink, C.white, 0.42);
    s.addText(h, T({ x: x + 0.7, y: y + 0.1, w: 1.8, h: 0.32, fontSize: 13, bold: true, color: C.ink }));
    s.addText(d, T({ x: x + 0.7, y: y + 0.42, w: 1.8, h: 0.3, fontSize: 10.5, color: C.muted }));
  });
  footer(s, 2);
  s.addNotes('먼저 목표입니다. 핵심은 한 문장입니다. 헌금은 한 번만 입력하면 주간 집계, 개인별 집계, 기부금영수증, 예결산이 모두 자동으로 나오게 하는 것입니다. 오른쪽 일곱 가지가 재정부가 요청한 요구사항이고, 마지막에 이 일곱 가지가 모두 되어야 완료로 봅니다.');
}

// 3. 진행 타임라인
const TIMELINE = [
  ["09-28 ①", "프로젝트 시작", "드라이브 엑셀 분석, 계획·질문 작성, 기록 폴더 생성"],
  ["09-28 ②", "고객 답변 반영", "사용자 4명·권한 확정, 지출 쪽 분석, 가정 단위 영수증 결정"],
  ["09-28 ③", "실제 주간 파일 분석", "출납 파일 시트 27장 구조 파악, 제출물 2장 확인"],
  ["09-28 ④", "어디서든 이어서", "휴대폰에서 이어가기 안내(NEXT.md), 히스토리 슬라이드"],
];
{
  const s = pres.addSlide();
  title(s, "지금까지의 진행", "HISTORY.md 요약 — 새 항목은 아래로 이어집니다");
  const y0 = 1.55;
  s.addShape(pres.shapes.LINE, { x: 0.9, y: y0 + 0.2, w: 0, h: 0.95 * (TIMELINE.length - 1), line: { color: "B7CBC3", width: 2 } });
  TIMELINE.forEach(([when, head, desc], i) => {
    const y = y0 + i * 0.95;
    badge(s, 0.7, y, i + 1, i === TIMELINE.length - 1 ? C.gold : C.ink, C.white, 0.4);
    s.addText(when, T({ x: 1.3, y: y + 0.02, w: 1.2, h: 0.36, fontSize: 11, color: C.muted, valign: "middle" }));
    s.addText(head, T({ x: 2.5, y: y - 0.02, w: 6.8, h: 0.34, fontSize: 15, bold: true, color: C.ink }));
    s.addText(desc, T({ x: 2.5, y: y + 0.32, w: 6.8, h: 0.32, fontSize: 11.5, color: C.text }));
  });
  footer(s, 3);
  s.addNotes('지금까지의 진행입니다. 첫날 구글 드라이브의 실제 엑셀을 분석해서 계획을 세웠고, 재정부 답변을 받아 사용자와 권한을 확정했습니다. 이어서 출납회계가 매주 쓰는 실제 파일 27장을 모두 분석했고, 휴대폰에서도 이어서 작업할 수 있게 했습니다.');
}

// 4. 현황 분석 — 숫자
{
  const s = pres.addSlide();
  title(s, "지금 엑셀은 어떻게 돌아가나", "구글 드라이브 스프레드시트 분석 결과");
  const stats = [
    ["27장", "출납 파일 한 개의 시트 수\n(제출은 그중 2장)"],
    ["52번", "매년 파일 전체를 복사하는 횟수\n(매주 새 파일)"],
    ["2번", "같은 헌금을 입력하는 횟수\n(주간현황 + 개인별 집계)"],
    ["수십 개", "✔️/❌ 손으로 만든 검산 수식\n(정확성이 최우선)"],
  ];
  stats.forEach(([n, d], i) => {
    const x = 0.5 + i * 2.3;
    card(s, x, 1.5, 2.1, 2.3);
    s.addText(n, T({ x: x + 0.2, y: 1.7, w: 1.8, h: 0.9, fontSize: 34, bold: true, color: C.ink }));
    s.addText(d, T({ x: x + 0.2, y: 2.65, w: 1.8, h: 1.0, fontSize: 11, color: C.text, valign: "top" }));
  });
  s.addText("그 결과: 개인별 집계가 7월부터 밀려 있고, 이름 찾기 오류(#N/A)·깨진 수식(#REF!)이 생김", T({ x: 0.5, y: 4.2, w: 9, h: 0.45, fontSize: 13, bold: true, color: C.red }));
  footer(s, 4);
  s.addNotes('분석해 보니 이렇습니다. 출납 파일 하나에 시트가 27장이지만 실제로 제출하는 건 2장입니다. 매주 파일 전체를 복사해서 1년에 52번 새로 만들고, 같은 헌금을 두 곳에 두 번 입력합니다. 담당자분들이 정확성을 위해 검산 수식을 수십 개 만들어 두셨을 만큼 수고가 많습니다. 그 결과 개인별 집계가 밀리고 수식 오류가 생기고 있습니다.');
}

// 5. 매주 흐름 비교
{
  const s = pres.addSlide();
  title(s, "출납회계의 한 주 — 지금 vs 앞으로");
  const before = ["지난주 파일 통째로 복사", "금액 초기화, 지난주 잔액 확인", "고정지출 복사·붙여넣기", "농협 출금 묶음·상세 입력", "합계 검산, 부서 시트 확인", "두 장 출력해 제출"];
  const after = ["(없음) 주차는 날짜로 자동", "(없음) 잔액은 이어서 계산", "고정지출이 미리 채워짐 → 확인만", "거래내역 파일 올리면 자동 분류", "검산은 자동, 결과만 화면에 표시", "버튼 한 번으로 두 장 출력"];
  [["지금 (엑셀)", before, "FFFFFF", C.text, C.muted], ["앞으로 (새 프로그램)", after, C.ink, C.white, "CFE0D9"]].forEach(([h, list, fill, fg, sub], k) => {
    const x = 0.5 + k * 4.6;
    card(s, x, 1.2, 4.4, 3.85, k === 0 ? C.mist : fill);
    s.addText(h, T({ x: x + 0.3, y: 1.35, w: 3.8, h: 0.4, fontSize: 15, bold: true, color: k === 0 ? C.ink : C.gold }));
    list.forEach((t, i) => {
      s.addText(`${i + 1}`, T({ x: x + 0.3, y: 1.9 + i * 0.5, w: 0.3, h: 0.4, fontSize: 12, bold: true, color: sub, valign: "middle" }));
      s.addText(t, T({ x: x + 0.65, y: 1.9 + i * 0.5, w: 3.6, h: 0.4, fontSize: 12, color: k === 0 ? C.text : fg, valign: "middle" }));
    });
  });
  footer(s, 5);
  s.addNotes('출납회계의 한 주를 비교해 보겠습니다. 왼쪽이 지금, 오른쪽이 앞으로입니다. 파일 복사와 초기화는 아예 없어지고, 고정지출은 미리 채워져서 확인만 하면 됩니다. 은행 거래내역은 파일을 올리면 자동 분류되고, 검산도 자동입니다. 마지막엔 버튼 한 번으로 같은 모양의 두 장이 출력됩니다.');
}

// 6. 고객 확인 사항
{
  const s = pres.addSlide();
  title(s, "고객에게 확인한 것", "필요한 것만 물었습니다");
  const qa = [
    ["지출은 어디에?", "주간 파일의 날짜 시트. 고정 지출 + 출납회계가 추가로 입력하는 지출"],
    ["누가 쓰나?", "입력 2명(기장회계·출납회계), 열람 2명(재정부장·담임목사)"],
    ["영수증 개인정보는?", "이름·전화·주소·주민번호를 매년 종이 신청서로 받아 수동 발행"],
    ["가족 헌금 영수증은?", "가정마다 신청자 1명에게 가족 전원 헌금을 몰아서 발행"],
  ];
  qa.forEach(([q, a], i) => {
    const y = 1.45 + i * 0.9;
    badge(s, 0.5, y + 0.1, `Q${i + 1}`, C.ink, C.white, 0.5);
    s.addText(q, T({ x: 1.2, y, w: 2.6, h: 0.7, fontSize: 14, bold: true, color: C.ink, valign: "middle" }));
    card(s, 3.8, y, 5.7, 0.7);
    s.addText(a, T({ x: 4.0, y, w: 5.4, h: 0.7, fontSize: 12, color: C.text, valign: "middle" }));
  });
  footer(s, 6);
  s.addNotes('재정부에 확인한 네 가지입니다. 지출은 주간 파일에서 고정지출과 추가 지출로 관리하고, 사용자는 입력 두 분과 열람 두 분입니다. 기부금영수증은 매년 종이 신청서로 개인정보를 받고, 가족 헌금은 신청자 한 분에게 모아서 발행합니다. 질문은 꼭 필요한 것만 드렸습니다.');
}

// 7. 결정과 이유
{
  const s = pres.addSlide();
  title(s, "주요 결정과 그 이유");
  const dec = [
    ["웹·앱 한 벌로", "PWA 하나로 PC·휴대폰 모두. 스토어 심사 없이 설치"],
    ["클라우드 + 기기 사본", "Supabase + 기기 저장소. 와이파이 끊겨도 입력"],
    ["실데이터는 저장소에 없음", "공개 저장소라 교인 정보는 DB에만, 주민번호 암호화"],
    ["가정 단위 영수증", "가족을 묶고 신청자 1명 지정 → 자동 합산"],
    ["영수증 신청서 온라인화", "교인이 직접 입력. 작년 신청자는 확인만"],
    ["마감에서 거꾸로 일정", "영수증 1월·결산 공동의회가 못 미루는 마감"],
  ];
  dec.forEach(([h, d], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.5 + col * 3.05, y = 1.3 + row * 1.9;
    card(s, x, y, 2.85, 1.7);
    badge(s, x + 0.2, y + 0.2, "✓", C.gold, C.ink, 0.4);
    s.addText(h, T({ x: x + 0.2, y: y + 0.7, w: 2.5, h: 0.38, fontSize: 13.5, bold: true, color: C.ink }));
    s.addText(d, T({ x: x + 0.2, y: y + 1.08, w: 2.5, h: 0.55, fontSize: 10.5, color: C.text, valign: "top" }));
  });
  footer(s, 7);
  s.addNotes('주요 결정과 이유입니다. 웹과 앱을 한 벌로 만들어 비용을 줄이고, 인터넷이 끊겨도 입력되게 합니다. 교인 정보는 공개된 곳에 절대 두지 않고 주민번호는 암호화합니다. 영수증은 가정 단위로 자동 합산하고, 신청서도 온라인으로 받아 입력을 줄입니다. 일정은 영수증과 결산 마감에서 거꾸로 짰습니다.');
}

// 8. 로드맵
{
  const s = pres.addSlide();
  title(s, "단계별 로드맵", "각 단계 끝마다: 고객 확인 → 기록 → 다음 단계");
  const phases = [
    ["0", "분석·설계", "9월 말~10월 초", true],
    ["1", "헌금 입력 +\n주간현황", "10월", false],
    ["2", "과거 데이터\n이관", "10월 말~11월 초", false],
    ["3", "지출 +\n계좌 대사", "11월", false],
    ["4", "기부금\n영수증", "11월 말~12월", false],
    ["5", "예결산", "12월~1월", false],
    ["6", "앱 마무리 ·\n엑셀 중단", "1월", false],
  ];
  const w = 1.2;
  phases.forEach(([n, h, when, now], i) => {
    const x = 0.5 + i * (w + 0.1);
    card(s, x, 1.6, w, 2.6, now ? C.ink : C.mist);
    badge(s, x + (w - 0.46) / 2, 1.8, n, now ? C.gold : C.ink, now ? C.ink : C.white, 0.46);
    s.addText(h, T({ x: x + 0.08, y: 2.45, w: w - 0.16, h: 0.8, fontSize: 12, bold: true, align: "center", color: now ? C.white : C.ink }));
    s.addText(when, T({ x: x + 0.08, y: 3.35, w: w - 0.16, h: 0.6, fontSize: 9.5, align: "center", color: now ? "CFE0D9" : C.muted }));
  });
  s.addText("◀ 지금 여기", T({ x: 0.5, y: 4.35, w: 3, h: 0.35, fontSize: 12, bold: true, color: C.gold }));
  footer(s, 8);
  s.addNotes('로드맵입니다. 지금은 0단계 분석·설계를 마무리하는 중입니다. 10월에 헌금 입력과 주간현황부터 엑셀과 병행해서 실제로 쓰기 시작하고, 11월에 지출, 12월에 영수증, 1월에 예결산을 거쳐 엑셀을 완전히 중단하는 것이 목표입니다. 단계마다 재정부 확인을 받습니다.');
}

// 9. 다음 할 일
{
  const s = pres.addSlide();
  s.background = { color: C.ink };
  s.addText("다음 할 일", T({ x: 0.6, y: 0.5, w: 8.8, h: 0.7, fontSize: 30, bold: true, color: C.white }));
  const next = ["계정과목표 확정 — 헌금 항목, 회계 3종, 부서 13개와 항목", "데이터베이스 설계", "1단계 개발 시작 — 로그인, 교인·가정 명부, 헌금 입력, 주간 헌금현황"];
  next.forEach((t, i) => {
    badge(s, 0.6, 1.55 + i * 0.9, i + 1, C.gold, C.ink, 0.48);
    s.addText(t, T({ x: 1.3, y: 1.55 + i * 0.9, w: 8.1, h: 0.48, fontSize: 16, color: C.white, valign: "middle" }));
  });
  s.addNotes('다음 할 일은 세 가지입니다. 계정과목표를 확정하고, 데이터베이스를 설계한 뒤, 1단계 개발을 시작합니다. 모든 기록은 GitHub에 남아 있어서 누구나 과정을 확인할 수 있습니다. 감사합니다.');
  s.addText("기록 위치: GitHub webyigit/wweebbyyii › church-finance (HISTORY.md, PLAN.md, NEXT.md)", T({ x: 0.6, y: 4.6, w: 8.8, h: 0.35, fontSize: 11, color: "A9BFB7" }));
}

// 드라이브 업로드용: pptxgenjs 는 압축 없이 쓰므로 다시 압축(약 250KB → 43KB)
pres.writeFile({ fileName: "history.pptx" }).then((f) => {
  require("child_process").execFileSync("python3", ["-c", `
import zipfile
src = zipfile.ZipFile("history.pptx"); names = [n for n in src.namelist() if not n.endswith("/")]
data = {n: src.read(n) for n in names}; src.close()
out = zipfile.ZipFile("history.pptx", "w", zipfile.ZIP_DEFLATED, compresslevel=9)
for n in sorted(names, key=lambda n: n != "[Content_Types].xml"):
    out.writestr(zipfile.ZipInfo(n, (2026, 1, 1, 0, 0, 0)), data[n], zipfile.ZIP_DEFLATED, 9)
out.close()
`]);
  console.log("wrote", f);
});
