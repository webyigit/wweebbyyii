/**
 * 마곡 맛집 페이지 자체 검증.
 *
 *   node verify.mjs             # 10회
 *   node verify.mjs --runs=3    # 3회
 *   node verify.mjs --keep      # 실패해도 계속 (기본은 계속)
 *
 * 실제 브라우저로 페이지를 띄우고 사람이 하는 조작을 그대로 흉내 냅니다.
 * 별점·메뉴·좌표는 비어 있을 수 있으므로, 검증용으로 고정된 가짜 값을 주입한
 * 사본을 만들어 씁니다. 원본 파일은 건드리지 않습니다.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SRC = path.resolve("docs/magok-matjip/index.html");
const RUNS = Number((process.argv.find(a => a.startsWith("--runs=")) || "").split("=")[1] || 10);
const PAUSE = 420;   // 목록 리로딩 스켈레톤(230ms)보다 넉넉히

// ---------------------------------------------------------------- 고정 시드 난수
function rng(seed) {
  return () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

function buildFixture() {
  const raw = fs.readFileSync(SRC, "utf8");
  const RE = /(<script type="application\/json" id="places-data">\s*)([\s\S]*?)(\s*<\/script>)/;
  const m = raw.match(RE);
  if (!m) throw new Error("places-data 블록을 찾지 못했습니다");
  const data = JSON.parse(m[2]);

  const r = rng(20260918);
  const MENUS = [
    ["숙성 삼겹살 180g", 16000, 37], ["목살 180g", 16000, 21],
    ["항정살 150g", 19000, 12], ["된장찌개", 7000, 6], ["계란찜", 5000, 3],
  ];
  for (const p of data) {
    p.rating = Math.round((3.4 + r() * 1.5) * 10) / 10;
    p.reviews = Math.floor(20 + r() * 2500);
    p.src = "naver";
    p.menus = MENUS.map(([name, price, hits]) => ({ name, price, hits }));
    // 세 역 주변에 고르게 뿌린다. 한 역 근처에만 모으면 나머지 역이
    // 0곳이 되어 역 필터 검증이 무의미해진다.
    const HUBS = [[37.5670, 126.8243], [37.5602, 126.8254], [37.5586, 126.8372]];
    const hub = HUBS[Math.floor(r() * HUBS.length)];
    p.lat = hub[0] + (r() - 0.5) * 0.004;
    p.lng = hub[1] + (r() - 0.5) * 0.004;
  }

  const block = "[\n" + data.map(x => "  " + JSON.stringify(x)).join(",\n") + "\n]";
  const html =
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    raw.replace(RE, (_, a, __, c) => a + block + c);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "magok-verify-"));
  const file = path.join(dir, "index.html");
  fs.writeFileSync(file, html);
  for (const name of fs.readdirSync(path.join(path.dirname(SRC), "fonts"))) {
    fs.mkdirSync(path.join(dir, "fonts"), { recursive: true });
    fs.copyFileSync(path.join(path.dirname(SRC), "fonts", name), path.join(dir, "fonts", name));
  }
  return { url: "file://" + file, dir, count: data.length };
}

const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const text = (page, sel) => page.$eval(sel, el => el.textContent.trim());
const pressed = (page, sel) => page.$eval(sel, el => el.getAttribute("aria-pressed"));
const cards = page => page.$$eval(".card .name", els => els.map(e => e.textContent));

// ---------------------------------------------------------------- 검증 항목
const CHECKS = [
  ["01 페이지가 오류 없이 뜬다", async (p, ctx) => {
    ok(ctx.errors.length === 0, "JS 오류: " + ctx.errors.join(" / "));
    const n = await p.$$eval(".card", e => e.length);
    ok(n > 0, "카드가 하나도 없음");
  }],

  ["02 분류 11개가 모두 선택된다", async (p) => {
    const ids = await p.$$eval(".chip", els => els.map(e => e.dataset.cat));
    ok(ids.length === 11, `분류가 11개가 아니라 ${ids.length}개`);
    for (const id of ids) {
      await p.$eval(`.chip[data-cat="${id}"]`, el => el.scrollIntoView({ block: "center" }));
      await p.click(`.chip[data-cat="${id}"]`);
      await p.waitForTimeout(PAUSE);
      ok(await pressed(p, `.chip[data-cat="${id}"]`) === "true", `${id} 선택 표시 안 됨`);
      const on = await p.$$eval('.chip[aria-pressed="true"]', e => e.length);
      ok(on === 1, `${id}: 동시에 ${on}개가 선택됨`);
      const n = Number((await text(p, "#count")).match(/(\d+)곳/)[1]);
      const shown = (await cards(p)).length;
      ok(n === shown, `${id}: 머리글은 ${n}곳인데 카드는 ${shown}개`);
    }
  }],

  ["03 역 4개가 모두 선택되고 개수가 바뀐다", async (p) => {
    await p.click('.chip[data-cat="all"]'); await p.waitForTimeout(PAUSE);
    const seen = new Set();
    for (const st of ["narue", "magok", "balsan", "all"]) {
      await p.click(`.st-btn[data-st="${st}"]`);
      await p.waitForTimeout(PAUSE);
      ok(await pressed(p, `.st-btn[data-st="${st}"]`) === "true", `${st} 선택 안 됨`);
      const n = (await cards(p)).length;
      seen.add(n);
      ok(n > 0, `${st}: 결과가 0곳`);
    }
    ok(seen.size > 1, "역을 바꿔도 결과 수가 전혀 안 변함");
  }],

  ["04 역을 바꿔도 분류 선택이 유지된다", async (p) => {
    await p.click('.st-btn[data-st="all"]'); await p.waitForTimeout(PAUSE);
    await p.click('.chip[data-cat="bar"]'); await p.waitForTimeout(PAUSE);
    await p.click('.st-btn[data-st="narue"]'); await p.waitForTimeout(PAUSE);
    ok(await pressed(p, '.chip[data-cat="bar"]') === "true", "역 변경 후 분류가 풀림");
  }],

  ["05 정렬 3종이 목록 순서를 바꾼다", async (p) => {
    await p.click('.st-btn[data-st="all"]'); await p.waitForTimeout(PAUSE);
    await p.click('.chip[data-cat="all"]'); await p.waitForTimeout(PAUSE);
    const got = {};
    for (const s of ["dist", "rating", "name"]) {
      await p.click(`#sort-${s}`); await p.waitForTimeout(PAUSE);
      ok(await pressed(p, `#sort-${s}`) === "true", `${s} 선택 안 됨`);
      got[s] = (await cards(p)).join("|");
    }
    ok(got.rating !== got.name, "별점순과 가나다순 결과가 같음");
    const names = (await cards(p));
    const sorted = [...names].sort((a, b) => a.localeCompare(b, "ko"));
    ok(names.join("|") === sorted.join("|"), "가나다순이 실제로 정렬돼 있지 않음");
  }],

  ["06 별점순이 실제 점수 내림차순이다", async (p) => {
    await p.click("#sort-rating"); await p.waitForTimeout(PAUSE);
    const scores = await p.$$eval(".card .sc", els => els.map(e => Number(e.textContent)));
    for (let i = 1; i < scores.length; i++) {
      ok(scores[i - 1] >= scores[i], `별점 역전: ${scores[i - 1]} 다음에 ${scores[i]}`);
    }
  }],

  ["07 순위 딱지는 분류마다 5개 이하다", async (p) => {
    for (const cat of ["meat", "bar", "cafe"]) {
      await p.click('.st-btn[data-st="all"]'); await p.waitForTimeout(PAUSE);
      await p.click(`.chip[data-cat="${cat}"]`); await p.waitForTimeout(PAUSE);
      const ranks = await p.$$eval(".card .rank .r", els => els.map(e => Number(e.textContent)));
      ok(ranks.length <= 5, `${cat}: 순위 딱지가 ${ranks.length}개`);
      ok(new Set(ranks).size === ranks.length, `${cat}: 순위가 중복됨 ${ranks}`);
    }
  }],

  ["08 검색이 목록을 좁히고 빈 결과를 안내한다", async (p) => {
    await p.click('.st-btn[data-st="all"]'); await p.waitForTimeout(PAUSE);
    await p.click('.chip[data-cat="all"]'); await p.waitForTimeout(PAUSE);
    const before = (await cards(p)).length;
    await p.fill("#q", "삼겹");
    await p.waitForTimeout(PAUSE);
    const after = (await cards(p)).length;
    ok(after > 0 && after < before, `검색 결과 ${after} / 전체 ${before}`);
    await p.fill("#q", "절대없는가게이름zzz");
    await p.waitForTimeout(PAUSE);
    ok(await p.$(".empty") !== null, "빈 결과 안내가 안 뜸");
    await p.fill("#q", "");
    await p.waitForTimeout(PAUSE);
    ok((await cards(p)).length === before, "검색어를 지워도 원래대로 안 돌아옴");
  }],

  ["09 예약 가능 토글이 걸러낸다", async (p) => {
    await p.click('.st-btn[data-st="all"]'); await p.waitForTimeout(PAUSE);
    await p.click('.chip[data-cat="all"]'); await p.waitForTimeout(PAUSE);
    const before = (await cards(p)).length;
    await p.click("#only-resv"); await p.waitForTimeout(PAUSE);
    const after = (await cards(p)).length;
    ok(after > 0 && after < before, `예약 필터 결과 ${after} / ${before}`);
    const badges = await p.$$eval(".card .resv", e => e.length);
    ok(badges === after, `예약 딱지 ${badges}개인데 카드는 ${after}개`);
    await p.click("#only-resv"); await p.waitForTimeout(PAUSE);
    ok((await cards(p)).length === before, "토글을 풀어도 안 돌아옴");
  }],

  ["10 칩 줄이 끌기·휠·화살표로 움직인다", async (p) => {
    const left = () => p.$eval("#rail-scroll", el => el.scrollLeft);
    await p.$eval("#rail-scroll", el => { el.scrollLeft = 0; });
    await p.waitForTimeout(200);
    const box = await p.locator("#rail-scroll").boundingBox();
    const y = box.y + box.height / 2;

    await p.mouse.move(box.x + box.width - 40, y);
    await p.mouse.down();
    await p.mouse.move(box.x + 40, y, { steps: 12 });
    await p.mouse.up();
    await p.waitForTimeout(300);
    ok(await left() > 50, "마우스로 끌어도 안 움직임");

    const beforeWheel = await left();
    await p.mouse.move(box.x + box.width / 2, y);
    await p.mouse.wheel(0, 200);
    await p.waitForTimeout(300);
    ok(await left() > beforeWheel, "세로 휠이 가로로 안 넘어감");

    await p.$eval("#rail-scroll", el => { el.scrollLeft = 0; });
    await p.waitForTimeout(300);
    await p.click(".rail-nav.next");
    await p.waitForTimeout(500);
    ok(await left() > 50, "화살표 버튼이 안 먹음");
  }],

  ["11 끌어도 분류가 바뀌지 않는다", async (p) => {
    await p.click('.st-btn[data-st="all"]'); await p.waitForTimeout(PAUSE);
    await p.click('.chip[data-cat="all"]'); await p.waitForTimeout(PAUSE);
    const before = await text(p, "#count");
    const box = await p.locator("#rail-scroll").boundingBox();
    const y = box.y + box.height / 2;
    await p.mouse.move(box.x + box.width - 40, y);
    await p.mouse.down();
    await p.mouse.move(box.x + 50, y, { steps: 12 });
    await p.mouse.up();
    await p.waitForTimeout(PAUSE);
    ok(await text(p, "#count") === before, "끌었더니 분류가 바뀜");
  }],

  ["12 끈 직후에도 칩이 눌린다", async (p) => {
    const box = await p.locator("#rail-scroll").boundingBox();
    const y = box.y + box.height / 2;
    await p.mouse.move(box.x + box.width - 40, y);
    await p.mouse.down();
    await p.mouse.move(box.x + 60, y, { steps: 10 });
    await p.mouse.up();
    await p.waitForTimeout(300);
    await p.$eval("#rail-scroll", el => { el.scrollLeft = 0; });
    await p.waitForTimeout(300);
    await p.click('.chip[data-cat="meat"]');
    await p.waitForTimeout(PAUSE);
    ok(await pressed(p, '.chip[data-cat="meat"]') === "true", "끈 뒤 칩 선택이 죽음");
  }],

  ["13 가로로 밀려 있던 칩도 눌린다", async (p) => {
    await p.$eval("#rail-scroll", el => { el.scrollLeft = el.scrollWidth; });
    await p.waitForTimeout(400);
    await p.click('.chip[data-cat="bar"]');
    await p.waitForTimeout(PAUSE);
    ok(await pressed(p, '.chip[data-cat="bar"]') === "true", "끝쪽 칩이 안 눌림");
  }],

  ["14 새로고침해도 고른 분류·역이 남는다", async (p) => {
    await p.click('.st-btn[data-st="magok"]'); await p.waitForTimeout(PAUSE);
    await p.click('.chip[data-cat="korean"]'); await p.waitForTimeout(PAUSE);
    await p.reload();
    await p.waitForTimeout(1200);
    ok(await pressed(p, '.chip[data-cat="korean"]') === "true", "분류가 안 남음");
    ok(await pressed(p, '.st-btn[data-st="magok"]') === "true", "역이 안 남음");
  }],

  ["15 카드 내용과 링크가 온전하다", async (p) => {
    await p.click('.st-btn[data-st="all"]'); await p.waitForTimeout(PAUSE);
    await p.click('.chip[data-cat="all"]'); await p.waitForTimeout(PAUSE);
    const bad = await p.$$eval(".card", els => els.map(c => {
      const name = c.querySelector(".name")?.textContent?.trim();
      const links = [...c.querySelectorAll("a.btn")].map(a => a.href);
      const menus = c.querySelectorAll(".menu-row").length;
      if (!name) return "이름 없음";
      if (links.length !== 2) return name + ": 링크가 2개가 아님";
      if (!links[0].includes("map.naver.com")) return name + ": 네이버 링크 아님";
      if (!links[1].includes("catchtable.co.kr")) return name + ": 캐치테이블 링크 아님";
      if (menus > 5) return name + `: 메뉴가 ${menus}줄`;
      return null;
    }).filter(Boolean));
    ok(bad.length === 0, bad.slice(0, 3).join(" / "));
  }],

  ["16 아이콘 11종이 모두 그려진다", async (p) => {
    const missing = await p.evaluate(() => {
      const ids = ["all","meat","korean","snack","hoe","japanese","chinese","asian","western","cafe","bar"];
      return ids.filter(id => !document.getElementById("ic-" + id));
    });
    ok(missing.length === 0, "빠진 아이콘: " + missing.join(","));
    const drawn = await p.$$eval(".card .name-wrap .ic", e => e.length);
    const n = await p.$$eval(".card", e => e.length);
    ok(drawn === n, `카드 ${n}개 중 아이콘 ${drawn}개`);
  }],

  ["17 가로 스크롤이 생기지 않는다", async (p) => {
    const over = await p.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(over <= 1, `페이지가 가로로 ${over}px 넘침`);
  }],

  ["18 다크모드에서 배경과 글자가 뒤집히지 않는다", async (p, ctx) => {
    if (!ctx.dark) return;
    const c = await p.evaluate(() => {
      const lum = s => { const [r,g,b] = s.match(/\d+/g).map(Number); return (0.299*r+0.587*g+0.114*b); };
      return { bg: lum(getComputedStyle(document.body).backgroundColor),
               fg: lum(getComputedStyle(document.querySelector(".name")).color) };
    });
    ok(c.bg < 90, `다크인데 배경이 밝음 (${Math.round(c.bg)})`);
    ok(c.fg > 140, `다크인데 글자가 어두움 (${Math.round(c.fg)})`);
  }],
];

// ---------------------------------------------------------------- 실행
const VIEWS = [
  { name: "폰 390", width: 390, height: 820, dark: false },
  { name: "PC 1100", width: 1100, height: 900, dark: false },
  { name: "폰 다크", width: 390, height: 820, dark: true },
];

const fixture = buildFixture();
console.log(`대상: ${SRC}`);
console.log(`가게 ${fixture.count}곳 · 검증 ${CHECKS.length}항목 × 화면 ${VIEWS.length}종 × ${RUNS}회\n`);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium",
});

const failures = [];
let pass = 0, total = 0;

for (let run = 1; run <= RUNS; run++) {
  const runFails = [];
  for (const view of VIEWS) {
    const ctx = await browser.newContext({
      viewport: { width: view.width, height: view.height },
      colorScheme: view.dark ? "dark" : "light",
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(fixture.url);
    await page.waitForTimeout(900);

    for (const [name, fn] of CHECKS) {
      total++;
      try {
        await fn(page, { errors, dark: view.dark });
        pass++;
      } catch (e) {
        runFails.push(`${view.name} | ${name} | ${e.message}`);
      }
    }
    await ctx.close();
  }
  failures.push(...runFails);
  const mark = runFails.length ? `✗ ${runFails.length}건 실패` : "✓ 전부 통과";
  console.log(`${String(run).padStart(2)}회차  ${mark}`);
  for (const f of runFails) console.log(`        ${f}`);
}

await browser.close();
fs.rmSync(fixture.dir, { recursive: true, force: true });

console.log("\n" + "=".repeat(60));
console.log(`결과: ${pass}/${total} 통과 (${RUNS}회 × ${VIEWS.length}화면 × ${CHECKS.length}항목)`);
if (failures.length) {
  console.log(`실패 ${failures.length}건:`);
  const counted = {};
  for (const f of failures) counted[f] = (counted[f] || 0) + 1;
  for (const [f, n] of Object.entries(counted)) console.log(`  ${n}회  ${f}`);
  process.exitCode = 1;
} else {
  console.log("실패 없음.");
}
console.log("=".repeat(60));
