// 실제 브라우저로 사람이 쓰듯이 눌러 보는 검사.
// 실행: npm run build && node e2e/smoke.mjs   (2회 돌려 간헐 오류도 잡음: node e2e/smoke.mjs 2)
// 가짜 이름만 사용.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as XLSX from "xlsx";

// 가져오기 검사용 가짜 엑셀 (실데이터 아님). 표기 흔들림(꽃꽃이, 공백, 감사헌금)을 일부러 섞음
const FIXTURE = join(tmpdir(), "cf-e2e-fixture.xlsx");
{
  const d = (day) => new Date(Date.UTC(2026, 0, day));
  const aoa = [[], [], [], [null, null, null, null, 175000],
    [null, "일자", "구분", "성명", "금액", "비고"],
    [null, d(4), "십일조", "박민수,최지영", 100000, null],
    [null, d(4), "꽃꽃이", "박민수", 50000, "감사"],
    [null, d(4), "감사헌금", "무명1", 10000, null],
    [null, d(11), "십일조 헌금", "최지영, 박민수", 15000, null]];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), "1월");
  writeFileSync(FIXTURE, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}
// 주간 주일헌금현황 흉내 (1/4 주): 십일조 명단 120,000 → 장부와 딱 맞게 됨
const WEEKLY = join(tmpdir(), "cf-e2e-weekly.xlsx");
{
  const aoa = [["주 일 헌 금 현 황"], [], [null, null, null, null, null, new Date(Date.UTC(2026, 0, 4))], [],
    ["십일조 헌금", 20000], ["성    명", "금  액", "성    명", "금  액"], ["정도령", 20000, null, null]];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), "주일헌금");
  writeFileSync(WEEKLY, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}
// 농협 거래내역 흉내 (가짜): 수요일 입금·출금 → 2/8 주일로
const NH = (rows) => {
  const aoa = [[], [null, "거래일시", "출금금액", "입금금액", "거래후잔액", null, "거래내용", "거래기록사항", "거래점"], ...rows];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "거래내역");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
};
const NH1 = join(tmpdir(), "cf-e2e-nh1.xlsx"), NH2 = join(tmpdir(), "cf-e2e-nh2.xlsx");
writeFileSync(NH1, NH([
  [null, "2026-02-04 09:30:01", 0, 30000, 1030000, null, "길동영희십일조", "신한 0267623", "PC신한은행"],
  [null, "2026-02-04 09:31:07", 0, 5000, 1035000, null, "민수지영주일", "카카오", "폰카카오"],
  [null, "2026-02-04 10:00:00", 0, 1000, 1036000, null, "모르는사람", "하나", "PC하나은행"],
  [null, "2026-02-05 12:00:00", 500, 0, 1035500, null, "이체수수료", "", "NH"],
]));
writeFileSync(NH2, NH([[null, "2026-02-12 12:00:00", 500, 0, 1035000, null, "이체수수료", "", "NH"]]));
// 출납 파일 흉내: 기장 시트 (1/4 십일조 120,000 = 명단 100,000 + 명단 없음 20,000, 주일헌금 500,000)
const BOOK = join(tmpdir(), "cf-e2e-book.xlsx");
{
  const d = (day) => new Date(Date.UTC(2026, 0, day));
  const aoa = [[], [null, "2026년", "예 산", 1, "전년이월액", "2026년", "진행", d(4), d(11), "1月 누계"],
    ...Array.from({ length: 14 }, () => []),
    [null, "수입", null, "(헌금예산)", 1],
    [null, null, "일반헌금", "십 일 조", 1, 135000, null, 120000, 15000, 135000],
    [null, "일", null, "주일헌금", 1, 500000, null, 500000, 0, 500000],
    [null, null, "특별", "꽃 꽂 이", null, 50000, null, 50000, 0, 50000],
    [null, null, null, "해외선교비", "수입", "지출"]];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), "기장");
  // 고정지출 · 부서 시트(관리부) · 총 시트 (가짜 값)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[], [], [],
    [null, "구 분", "내  용", " 금  액", "부  서", " 항  목", "비  고"],
    [null, "첫째주", "담임목사 사례비", 3000000, "재정부", " 담임목사사례비", "가짜 받는 분"],
    [null, null, "매월 고정지출 총액", 3000000]]), "고정지출");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[], [null, "관리부"],
    [null, "구분", "2026년도 예산", "지출", "잔액", "집행률(%)", "비고"],
    [null, null, 1000000, 53030, 946970],
    [1, "공공요금", 1000000, 53030, 946970],
    [], [],
    [1, "공공요금", 1000000, 53030, 946970],
    [null, "일자", "내  용", "지출", "잔액", "비   고"],
    [null, d(6), "전기요금", 53030, 946970, "자동출금"]], { cellDates: true }), "관리부");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[], [], [],
    [null, "구      분", null, "2026년예산", "전년이월", "2026년헌금", "헌금총합계", "지  출", "잔  액"],
    [null, "일반헌금", null, 1, 500000, 0, 0, 53030, 0]]), "총");
  writeFileSync(BOOK, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

// 예전 기부금영수증 발급대장 흉내 (가짜 이름·가짜 번호): 개인 1명(가정 명부에 있는 이름) + 법인 1곳(명부에 없음) + 폐기 1건
const LEDGER = join(tmpdir(), "cf-e2e-ledger.xlsx");
{
  const aoa = [["2026년도 기부금 영수증 발급표"], ["NO", "구분", "일련번호", "이름", "생년월일", "주 소", "금액", "발급일자"],
    [1, "개인", "2026-001", "정도령", "800202-1234567", "서울시 가짜로 1", "1,200,000", "2025년 12월 28일"],
    [2, "개인", "2026-002", "정도령", "800202-1234567", "서울시 가짜로 1", "", "2025년 12월 28일", "재발급으로 폐기처리"],
    [3, "법인", "2026-003", "주식회사 가나다", "124-81-00998", "경기도 가짜로 2", 3000000, "2026년 1월 4일"]];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "2026발행본");
  writeFileSync(LEDGER, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

const ROUNDS = Number(process.argv[2] ?? 1);
const PORT = 4179;
const URL = `http://127.0.0.1:${PORT}/`;
const VIEWPORTS = [
  { name: "PC", width: 1280, height: 800 },
  { name: "휴대폰", width: 375, height: 740 },
];

const server = spawn("node_modules/.bin/vite", ["preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { stdio: "pipe" });
await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error("preview 서버가 안 뜸")), 20000);
  server.stdout.on("data", (d) => String(d).includes(String(PORT)) && (clearTimeout(t), ok()));
});

const exe = ["/opt/pw-browsers/chromium/chrome-linux/chrome", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
let pass = 0, fail = 0;
const failures = [];

async function check(name, fn) {
  try { await fn(); pass++; console.log(`  ✔ ${name}`); }
  catch (e) { fail++; failures.push(name); console.log(`  ✘ ${name}\n      ${String(e.message ?? e).split("\n")[0]}`); }
}
const TAB = { account: "계정", entry: "헌금 입력", report: "주일헌금현황", expense: "지출 입력", cashbook: "수입지출 보고", bank: "통장 내역", people: "교인·가정", budget: "예산·이월", import: "엑셀 가져오기", receipt: "기부금영수증" };
const go = async (page, tab) => {
  await page.locator(".top nav a", { hasText: TAB[tab] }).click();
  await page.locator(`section[data-page="${tab}"]`).waitFor();
};
const gridRow = async (page, text) => {
  const row = page.locator("table.grid tr", { hasText: text });
  await row.first().waitFor();
  return row.first().locator("td").allInnerTexts();
};
// 실제 사용자는 한글 이름 파일을 고른다 → 파일 내용을 한글 이름으로 넘김 (경로로 넘기면 이 검사 도구가 한글 이름 파일을 빠뜨림)
const asFile = (path, name) => ({ name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: readFileSync(path) });
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: 기대 ${JSON.stringify(b)}, 실제 ${JSON.stringify(a)}`); };

for (let round = 1; round <= ROUNDS; round++) {
  for (const vp of VIEWPORTS) {
    console.log(`\n[${round}회차 · ${vp.name} ${vp.width}px]`);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("dialog", (d) => d.accept());
    await page.goto(URL + "#entry");
    const donor = page.getByPlaceholder("이름 앞글자나 초성 (예: ㅎㄱㄷ)");
    const amount = page.getByPlaceholder("예: 50000, 5만");

    await check("주일 날짜는 일요일", async () => {
      const v = await page.locator(".sunday input").inputValue();
      eq(new Date(v + "T12:00").getDay(), 0, "요일");
    });

    await check("처음 보는 부부 이름 → 새 가정으로 등록되며 헌금 추가", async () => {
      await donor.fill("홍길동,김영희");
      await donor.press("Enter");
      await amount.fill("5만");
      await amount.press("Enter");
      await page.getByText("새 가정으로 등록했습니다").waitFor({ timeout: 3000 });
      await page.locator(".this-week td", { hasText: "50,000" }).first().waitFor({ timeout: 3000 });
    });

    await check("초성 ㅎㄱㄷ 으로 같은 가정을 찾아 추가 (새 가정 안 생김)", async () => {
      await donor.fill("ㅎㄱㄷ");
      await page.locator(".suggest button", { hasText: "홍길동,김영희" }).waitFor({ timeout: 3000 });
      await donor.press("Enter");
      eq(await donor.inputValue(), "홍길동,김영희", "고른 이름");
      await amount.fill("30000");
      await amount.press("Enter");
      await page.locator(".this-week td", { hasText: "30,000" }).first().waitFor({ timeout: 3000 });
      eq(await page.getByText("새 가정으로 등록했습니다").count(), 0, "새 가정 메시지");
      await go(page, "people");
      await page.locator("table.list tbody tr").first().waitFor();
      eq(await page.locator("table.list tbody tr").count(), 1, "가정 수");
      await go(page, "entry");
    });

    await check("이름 없이 총액만 받는 주일헌금", async () => {
      await page.locator(".chip", { hasText: "주일헌금" }).click();
      eq(await donor.count(), 0, "이름 칸");
      await amount.fill("695000");
      await amount.press("Enter");
      await page.locator(".this-week td", { hasText: "695,000" }).first().waitFor({ timeout: 3000 });
    });

    await check("잘못된 금액은 막는다", async () => {
      await amount.fill("abc");
      await amount.press("Enter");
      await page.getByText("금액을 확인해 주세요").waitFor({ timeout: 3000 });
    });

    await check("예산 입력 (1억) 후 진도율 계산", async () => {
      await go(page, "budget");
      const input = page.locator("tr", { hasText: "십일조" }).locator("input");
      await input.fill("1억");
      await input.blur();
      await page.waitForTimeout(200);
      await go(page, "report");
      const cells = await gridRow(page, "십일조");
      eq(cells[3], "100,000,000", "예산");
      eq(cells[4], "80,000", "이번 주");
      eq(cells[7], "0.08", "진도율");
    });

    await check("주일헌금현황 머리말: 이번 주 (일반+특별)", async () => {
      const t = await page.locator(".headline b").innerText();
      eq(t, "775,000", "이번 주 헌금");
    });

    await check("명세에 이름과 금액이 입력 순서대로", async () => {
      const cells = await page.locator(".detail", { hasText: "십일조" }).locator(".name-cell").allInnerTexts();
      eq(cells.length, 2, "건수");
      if (!cells[0].includes("50,000") || !cells[1].includes("30,000")) throw new Error(cells.join(" / "));
    });

    await check("다음 주: 지난 명단(가정별 합계)에서 한 번에 추가, 누계가 이어짐", async () => {
      await go(page, "entry");
      await page.locator(".chip", { hasText: "십일조" }).click();
      await page.getByLabel("다음 주일").click();
      const btn = page.locator(".roster").getByRole("button", { name: "추가", exact: true }).first();
      eq(await page.locator(".roster tbody tr").count(), 1, "지난 명단 줄 수 (한 가정)");
      await btn.click();
      await page.locator(".this-week td", { hasText: "80,000" }).first().waitFor({ timeout: 3000 });
      await go(page, "report");
      const cells = await gridRow(page, "십일조");
      eq(cells[4], "80,000", "이번 주");
      eq(cells[5], "80,000", "지난주까지");
      eq(cells[6], "160,000", "총누계");
    });

    await check("새로고침해도 데이터가 남는다 (기기 저장)", async () => {
      await page.reload();
      const cells = await gridRow(page, "십일조");
      eq(cells[6], "160,000", "총누계");
    });

    await check("엑셀 가져오기: 월 합계 대조 ✔, 표기가 달라도 한 가정, 4건 저장", async () => {
      await go(page, "import");
      await page.locator('input[type="file"]').setInputFiles(asFile(FIXTURE, "2026년도 개인별 헌금집계.xlsx"));
      const row = page.locator("tr", { hasText: "1월" });
      await row.waitFor();
      if (!(await row.innerText()).includes("✔")) throw new Error("월 합계 대조 실패: " + (await row.innerText()));
      await page.getByText("새 가정 1개").waitFor();
      await page.getByRole("button", { name: "4건 가져오기" }).click();
      await page.getByText("헌금 4건, 새 가정 1개를 가져왔습니다").waitFor();
    });

    await check("같은 파일을 다시 넣으면 모두 건너뜀 (겹치지 않음)", async () => {
      await page.locator('input[type="file"]').setInputFiles([]);
      await page.locator('input[type="file"]').setInputFiles(asFile(FIXTURE, "2026년도 개인별 헌금집계.xlsx"));
      await page.getByText("이미 들어와 있어 건너뜀 4건").waitFor();
      if (await page.getByRole("button", { name: /건 가져오기/ }).isEnabled()) throw new Error("0건인데 가져오기 버튼이 눌림");
    });

    await check("가져온 1월 헌금이 주일헌금현황에 반영 (감사헌금은 한 줄)", async () => {
      await go(page, "report");
      await page.locator(".sunday input").fill("2026-01-11");
      const tithe = await gridRow(page, "십일조");
      eq(tithe[4], "15,000", "1/11 십일조");
      eq(tithe[5], "100,000", "지난주까지");
      await page.locator(".sunday input").fill("2026-01-04");
      const thanks = await gridRow(page, "감사헌금");
      eq(thanks[4], "10,000", "감사헌금");
      eq(await page.locator("table.grid tr", { hasText: "감사헌금" }).count(), 1, "감사헌금 줄 수");
      const flower = await gridRow(page, "꽃꽂이헌금");
      eq(flower[4], "50,000", "꽃꽂이");
    });

    await check("출납 기장 파일: 명단 없는 총액을 채워 장부와 같아짐, 다시 넣어도 그대로", async () => {
      for (let k = 0; k < 2; k++) {
        await go(page, "import");
        await page.locator('input[type="file"]').setInputFiles([]);
        await page.locator('input[type="file"]').setInputFiles(asFile(BOOK, "★ 01-04_수입지출내역.xlsx"));
        await page.getByText("딱 맞는 칸 2").waitFor(); // 1/11 십일조, 1/4 꽃꽂이
        await page.getByRole("button", { name: "주별 총액 반영 (2칸)" }).click();
        await page.getByText("명단 없는 총액 2칸을 반영했습니다").waitFor();
      }
      await go(page, "report");
      await page.locator(".sunday input").fill("2026-01-04");
      eq((await gridRow(page, "십일조"))[4], "120,000", "1/4 십일조 (장부)");
      eq((await gridRow(page, "주일헌금"))[4], "500,000", "1/4 주일헌금 (장부)");
      await page.locator(".detail", { hasText: "십일조" }).getByText("(명단 없는 총액)").waitFor();
    });

    await check("주간 명단을 더 넣으면 명단 없는 총액이 자동으로 줄어듦 (합계는 장부 그대로)", async () => {
      await go(page, "import");
      await page.locator('input[type="file"]').setInputFiles([]);
      await page.locator('input[type="file"]').setInputFiles(asFile(WEEKLY, "01-04_주일헌금현황.xlsx"));
      await page.locator("tr", { hasText: "2026-01-04" }).getByText("✔").waitFor();
      await page.getByRole("button", { name: "1건 가져오기" }).click();
      await page.getByText("출납 장부 기준 총액도 다시 맞췄습니다").waitFor();
      await go(page, "report");
      await page.locator(".sunday input").fill("2026-01-04");
      eq((await gridRow(page, "십일조"))[4], "120,000", "1/4 십일조 (장부 그대로)");
      const tithe = page.locator(".detail", { hasText: "십일조" });
      await tithe.getByText("정도령").waitFor();
      eq(await tithe.getByText("(명단 없는 총액)").count(), 0, "명단 없는 총액 (이제 없어야 함)");
    });

    await check("출납 파일에서 지출·고정지출 규칙·전년 이월 가져오기 (다시 넣어도 겹치지 않음)", async () => {
      for (let k = 0; k < 2; k++) {
        await go(page, "import");
        await page.locator('input[type="file"]').setInputFiles([]);
        await page.locator('input[type="file"]').setInputFiles(asFile(BOOK, "★ 01-04_수입지출내역.xlsx"));
        await page.getByRole("button", { name: /지출·예산·규칙 가져오기/ }).click();
        await page.getByText(k === 0 ? "지출 1건, 고정지출 규칙 1개" : "지출 0건 (이미 있던 1건 건너뜀), 고정지출 규칙 0개").waitFor();
      }
    });

    await check("수입지출 보고(주간): 전년 이월 + 수입 − 지출 = 잔액, 검산 ✔", async () => {
      await go(page, "cashbook");
      await page.locator(".sunday input").fill("2026-01-04");
      const row = page.locator("table.grid tr", { hasText: "일반 헌금" }).first();
      await row.waitFor();
      const c = await row.locator("td").allInnerTexts();
      eq(c.slice(1).join(" / "), "500,000 / 630,000 / 53,030 / 1,076,970", "일반 헌금 줄");
      await page.getByText("✔ 검산 이상 없음").waitFor();
      await page.locator("table.grid td", { hasText: "전기요금" }).waitFor();
    });

    await check("지출 입력: 첫째 주 고정지출이 미리 뜨고 한 번에 추가, 추가 지출 입력", async () => {
      await go(page, "expense");
      await page.locator(".sunday input").fill("2026-02-01");
      await page.getByText("1째 주 고정지출 — 1건 중 0건 추가됨").waitFor();
      await page.getByRole("button", { name: /남은 고정지출 1건 추가/ }).click();
      await page.locator(".this-week-exp td", { hasText: "3,000,000" }).waitFor();
      await page.getByPlaceholder("예: 주일식사비").fill("주일식사비");
      await page.getByPlaceholder("예: 53030, 5만").fill("100만");
      await page.locator(".entry select").selectOption({ label: "주일식사" });
      await page.getByRole("button", { name: "추가", exact: true }).click();
      await page.locator(".this-week-exp td", { hasText: "1,000,000" }).waitFor();
      await page.getByText("이번 주 지출 2건 — 일반 4,000,000").waitFor();
    });

    await check("통장 내역: 입금 메모로 헌금자·과목 자동, 모르는 건 체크 안 됨, 출금은 항목 골라 지출로", async () => {
      await go(page, "bank");
      await page.locator('input[type="file"]').setInputFiles(asFile(NH1, "농협 거래내역조회.xlsx"));
      await page.getByText("입금 3건 — 자동으로 맞춘 것 2건").waitFor();
      const rows = page.locator("table.bank").first().locator("tbody tr");
      eq(await rows.nth(0).locator('input[type="checkbox"]').isChecked(), true, "길동영희십일조 체크");
      eq(await rows.nth(2).locator('input[type="checkbox"]').isChecked(), false, "모르는사람 체크");
      const donor = await rows.nth(0).locator(".donor input").inputValue();
      if (!donor.includes("홍길동")) throw new Error("가정 이름이 안 나옴: " + donor);
      await page.locator("table.bank").nth(1).locator("select").selectOption({ label: "공공요금" });
      await page.getByRole("button", { name: /선택한 3건 반영/ }).click();
      await page.getByText("온라인 헌금 2건 추가").waitFor();
      await page.locator('input[type="file"]').setInputFiles([]);
      await page.locator('input[type="file"]').setInputFiles(asFile(NH1, "농협 거래내역조회.xlsx"));
      await page.getByText("이미 올린 거래 3건은 건너뜀").waitFor();
      await page.locator('input[type="file"]').setInputFiles([]);
      await page.locator('input[type="file"]').setInputFiles(asFile(NH2, "농협 거래내역조회(2).xlsx"));
      await page.getByText("예전 분류대로").waitFor();
    });

    await check("통장에서 들어온 온라인 헌금이 2/8 주일 입력 목록에 '온라인'으로", async () => {
      await go(page, "entry");
      await page.locator(".sunday input").fill("2026-02-08");
      await page.locator(".chip", { hasText: "십일조" }).click();
      const row = page.locator(".this-week tr", { hasText: "30,000" });
      await row.waitFor();
      if (!(await row.innerText()).includes("온라인")) throw new Error(await row.innerText());
    });

    // ── 기부금영수증 ──
    const sub = (name) => page.locator(".subtabs").getByRole("button", { name, exact: true }).click();
    let hhAmount = "";
    await check("기부금영수증: 비밀번호 정하고, 가정에 신청자를 정하면 영수증 금액 = 가정 헌금 합계", async () => {
      await go(page, "receipt");
      await page.getByPlaceholder("비밀번호 (6자 이상)").fill("test-pass-1");
      await page.getByPlaceholder("한 번 더").fill("test-pass-1");
      await page.getByRole("button", { name: "정하기", exact: true }).click();
      await page.locator(".vault-open", { hasText: "주민번호 열림" }).waitFor();
      const row = page.locator(".unassigned tr", { hasText: "박민수" }).first();
      hhAmount = (await row.locator("td.num").innerText()).trim();
      await row.getByRole("button", { name: "신청자 정하기" }).click();
      await page.locator(".share-editor button", { hasText: "+ 박민수" }).click();
      await page.locator(".share-editor .row", { hasText: "박민수" }).locator("input").first().waitFor();
      await page.locator(".share-editor").getByRole("button", { name: "저장" }).click();
      const got = (await page.locator('.receipt-list tr[data-name="박민수"] td.amount').innerText()).trim();
      eq(got, hhAmount, "영수증 금액");
      await page.locator(".totals", { hasText: "영수증 대상" }).waitFor();
      if ((await page.locator(".totals").first().innerText()).includes("맞지 않습니다")) throw new Error("합계 검산 실패");
    });

    await check("신청자 주민번호: 틀린 번호는 거절, 맞으면 앞자리만 보임", async () => {
      await sub("신청자");
      await page.locator("tr", { hasText: "박민수" }).getByRole("button", { name: "고치기" }).click();
      const form = page.locator(".applicant-form");
      await form.locator('input[name="idText"]').fill("900101-123456");
      await form.getByRole("button", { name: "저장" }).click();
      await form.locator(".warn", { hasText: "주민등록번호가 맞지 않습니다" }).waitFor();
      await form.locator('input[name="idText"]').fill("9001011234567");
      await form.locator('input[name="address"]').fill("서울시 가짜구 가짜로 3");
      await form.getByRole("button", { name: "저장" }).click();
      await page.locator("td", { hasText: "900101-1******" }).waitFor();
      if (await page.locator("text=9001011234567").count()) throw new Error("주민번호 원문이 화면에 보임");
    });

    await check("교회 정보 넣고 발급 → 일련번호 2027-001, 법정 서식에 주민번호 전체와 금액", async () => {
      await sub("설정·가져오기");
      await page.locator('input[name="churchName"]').fill("가짜교회");
      await page.locator('input[name="regNo"]').fill("124-81-00998");
      await page.locator('input[name="churchAddress"]').fill("서울시 가짜구 교회로 1");
      await page.locator(".church-form").getByRole("button", { name: "저장" }).click();
      await page.locator(".church-form .ok").waitFor();
      await sub("발급");
      await page.locator('.receipt-list tr[data-name="박민수"] input[type="checkbox"]').check();
      await page.getByRole("button", { name: /고른 1명 발급/ }).click();
      const form = page.locator('.receipt-page[data-serial="2027-001"]');
      await form.waitFor();
      eq((await form.locator(".donor-id").innerText()).trim(), "900101-1234567", "주민번호");
      eq((await form.locator(".receipt-amount").innerText()).trim(), hhAmount, "영수증 합계");
      if (!(await form.innerText()).includes("가짜교회")) throw new Error("교회 이름 없음");
      if (process.env.SHOT && vp.name === "PC") await form.screenshot({ path: process.env.SHOT }); // 서식 눈으로 확인용
      await page.getByRole("button", { name: "닫기" }).click();
      await page.locator('.receipt-list tr[data-name="박민수"] .status', { hasText: "발급 2027-001" }).waitFor();
    });

    await check("잠그면 주민번호가 가려져 인쇄, 폐기 후 다시 발급하면 새 번호 2027-002", async () => {
      await page.getByRole("button", { name: "잠그기" }).click();
      await sub("발급대장");
      const row = page.locator('tr[data-serial="2027-001"]');
      await row.getByRole("button", { name: "인쇄" }).click();
      eq((await page.locator('.receipt-page .donor-id').innerText()).trim(), "900101-1******", "잠긴 주민번호");
      await page.getByRole("button", { name: "닫기" }).click();
      await sub("발급대장");
      await page.locator('tr[data-serial="2027-001"]').getByRole("button", { name: "폐기" }).click();
      await page.getByPlaceholder(/폐기 사유/).fill("주소 변경");
      await page.locator("tr", { has: page.getByPlaceholder(/폐기 사유/) }).getByRole("button", { name: "폐기", exact: true }).click();
      await page.locator('tr.void[data-serial="2027-001"]').waitFor();
      await sub("발급");
      await page.locator('.receipt-list tr[data-name="박민수"] .status', { hasText: "발급 전" }).waitFor();
      await page.locator('.receipt-list tr[data-name="박민수"] input[type="checkbox"]').check();
      await page.getByRole("button", { name: /고른 1명 발급/ }).click();
      await page.locator('.receipt-page[data-serial="2027-002"]').waitFor();
      await page.getByRole("button", { name: "닫기" }).click();
    });

    await check("예전 발급대장 가져오기: 잠긴 채로도 됨, 신청자·기록·가정 자동 연결, 다시 넣으면 건너뜀", async () => {
      await sub("설정·가져오기");
      await page.locator('.ledger-import input[type="file"]').setInputFiles(asFile(LEDGER, "2027년도 발급 _ 기부금영수증 발급 현황표.xlsx"));
      await page.locator(".ledger-import", { hasText: "가져올 것: 3건 (폐기 1건) · 합계 4,200,000원" }).waitFor();
      await page.locator(".ledger-import").getByRole("button", { name: "가져오기" }).click();
      const res = await page.locator(".import-result").innerText();
      for (const t of ["신청자 새로 2명", "발급 기록 3건", "가정 자동 연결 1곳", "주식회사 가나다"]) if (!res.includes(t)) throw new Error(res);
      await page.locator('.ledger-import input[type="file"]').setInputFiles(asFile(LEDGER, "2027년도 발급 _ 기부금영수증 발급 현황표.xlsx"));
      await page.locator(".ledger-import").getByRole("button", { name: "가져오기" }).click();
      await page.locator(".import-result", { hasText: "겹쳐서 건너뜀 3" }).waitFor();
      await page.locator('section[data-page="receipt"] .row button', { hasText: "◀" }).click();
      await sub("발급대장");
      await page.locator(".ledger-totals", { hasText: "합계 2건 4,200,000원" }).waitFor();
      await page.locator('section[data-page="receipt"] .row button', { hasText: "▶" }).click();
    });

    await check("로그인 전: '이 기기에만 저장' 표시, 계정 화면에 로그인 칸", async () => {
      await page.locator(".top .sync", { hasText: "이 기기에만 저장" }).waitFor();
      await go(page, "account");
      await page.getByRole("button", { name: "로그인" }).waitFor();
      await page.getByRole("button", { name: "처음이면 가입" }).waitFor();
    });

    await check("가로 스크롤이 생기지 않는다", async () => {
      for (const tab of ["entry", "report", "expense", "cashbook", "bank", "people", "budget", "receipt", "import", "account"]) {
        await go(page, tab);
        await page.waitForTimeout(150);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 1) throw new Error(`${tab} 화면이 ${over}px 넘침`);
      }
    });

    await check("화면 오류(콘솔 에러) 없음", async () => {
      if (errors.length) throw new Error(errors.join(" | "));
    });

    await ctx.close();
  }
}

await browser.close();
server.kill();
console.log(`\n결과: 통과 ${pass} / 실패 ${fail}${failures.length ? "\n실패 항목: " + [...new Set(failures)].join(", ") : ""}`);
process.exit(fail ? 1 : 0);
