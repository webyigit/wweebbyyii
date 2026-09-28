// 실제 브라우저로 사람이 쓰듯이 눌러 보는 검사.
// 실행: npm run build && node e2e/smoke.mjs   (2회 돌려 간헐 오류도 잡음: node e2e/smoke.mjs 2)
// 가짜 이름만 사용.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
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
const TAB = { entry: "헌금 입력", report: "주일헌금현황", people: "교인·가정", budget: "예산", import: "엑셀 가져오기" };
const go = async (page, tab) => {
  await page.locator(".top nav a", { hasText: TAB[tab] }).click();
  await page.locator(`section[data-page="${tab}"]`).waitFor();
};
const gridRow = async (page, text) => {
  const row = page.locator("table.grid tr", { hasText: text });
  await row.first().waitFor();
  return row.first().locator("td").allInnerTexts();
};
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: 기대 ${JSON.stringify(b)}, 실제 ${JSON.stringify(a)}`); };

for (let round = 1; round <= ROUNDS; round++) {
  for (const vp of VIEWPORTS) {
    console.log(`\n[${round}회차 · ${vp.name} ${vp.width}px]`);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
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
      await page.locator('input[type="file"]').setInputFiles(FIXTURE);
      const row = page.locator("tr", { hasText: "1월" });
      await row.waitFor();
      if (!(await row.innerText()).includes("✔")) throw new Error("월 합계 대조 실패: " + (await row.innerText()));
      await page.getByText("새 가정 1개").waitFor();
      await page.getByRole("button", { name: "4건 가져오기" }).click();
      await page.getByText("헌금 4건, 새 가정 1개를 가져왔습니다").waitFor();
    });

    await check("같은 파일을 다시 넣으면 모두 건너뜀 (겹치지 않음)", async () => {
      await page.locator('input[type="file"]').setInputFiles([]);
      await page.locator('input[type="file"]').setInputFiles(FIXTURE);
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

    await check("가로 스크롤이 생기지 않는다", async () => {
      for (const tab of ["entry", "report", "people", "budget", "import"]) {
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
