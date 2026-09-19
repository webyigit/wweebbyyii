/**
 * 마곡 맛집 페이지 자체 검증.
 *
 *   node verify.mjs             # 2회
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
const RUNS = Number((process.argv.find(a => a.startsWith("--runs=")) || "").split("=")[1] || 2);
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
  // 파일을 있는 그대로 쓴다. viewport 를 덧붙이던 예전 방식은 GitHub Pages 가
  // 내보내는 것과 다른 문서를 검사하게 만들어, doctype 누락 같은 문제를 가렸다.
  const html = raw.replace(RE, (_, a, __, c) => a + block + c);

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
const cards = page => page.$$eval(".places tbody tr .name", els => els.map(e => e.textContent));

// ---------------------------------------------------------------- 검증 항목
const CHECKS = [
  ["01 페이지가 오류 없이 뜬다", async (p, ctx) => {
    ok(ctx.errors.length === 0, "JS 오류: " + ctx.errors.join(" / "));
    const n = await p.$$eval(".places tbody tr", e => e.length);
    ok(n > 0, "행이 하나도 없음");
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
      ok(n === shown, `${id}: 머리글은 ${n}곳인데 행은 ${shown}개`);
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
    const scores = await p.$$eval(".places tbody tr .sc", els => els.map(e => Number(e.textContent)));
    for (let i = 1; i < scores.length; i++) {
      ok(scores[i - 1] >= scores[i], `별점 역전: ${scores[i - 1]} 다음에 ${scores[i]}`);
    }
  }],

  ["07 순위 딱지는 분류마다 5개 이하다", async (p) => {
    for (const cat of ["meat", "bar", "cafe"]) {
      await p.click('.st-btn[data-st="all"]'); await p.waitForTimeout(PAUSE);
      await p.click(`.chip[data-cat="${cat}"]`); await p.waitForTimeout(PAUSE);
      const ranks = await p.$$eval(".places tbody tr .c-num .top", els => els.map(e => Number(e.textContent)));
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
    const badges = await p.$$eval(".places tbody tr .resv", e => e.length);
    ok(badges === after, `예약 딱지 ${badges}개인데 행은 ${after}개`);
    await p.click("#only-resv"); await p.waitForTimeout(PAUSE);
    ok((await cards(p)).length === before, "토글을 풀어도 안 돌아옴");
  }],

  ["10 칩 줄이 끌기·휠·화살표로 움직인다", async (p) => {
    const left = () => p.$eval("#rail-scroll", el => el.scrollLeft);
    await p.$eval("#rail-scroll", el => { el.scrollLeft = 0; });
    await p.waitForTimeout(200);

    // 화면이 넓으면 칩이 다 들어가서 넘칠 게 없다. 그때는 움직이지 않는 게 맞고,
    // 대신 화살표와 그라데이션이 스스로 사라져야 한다.
    const over = await p.$eval("#rail-scroll", el => el.scrollWidth - el.clientWidth);
    if (over <= 0) {
      const nav = await p.$eval(".rail-nav.next", el => getComputedStyle(el).display);
      ok(nav === "none", "넘치지도 않는데 화살표가 보임");
      const cls = await p.$eval("#rail-wrap", el => el.className);
      ok(!/more-(left|right)/.test(cls), "넘치지도 않는데 더보기 표시가 켜짐");
      return;
    }

    const box = await p.locator("#rail-scroll").boundingBox();
    const y = box.y + box.height / 2;

    await p.mouse.move(box.x + box.width - 40, y);
    await p.mouse.down();
    await p.mouse.move(box.x + 40, y, { steps: 12 });
    await p.mouse.up();
    await p.waitForTimeout(300);
    ok(await left() > 50, "마우스로 끌어도 안 움직임");

    // 앞의 끌기가 이미 끝까지 밀어 놨으면 휠은 페이지에 양보하는 게 맞다.
    // 휠만 따로 보려면 처음으로 되돌리고 시작해야 한다.
    await p.$eval("#rail-scroll", el => { el.scrollLeft = 0; });
    await p.waitForTimeout(350);
    const beforeWheel = await left();
    await p.mouse.move(box.x + box.width / 2, y);
    await p.mouse.wheel(0, 200);
    await p.waitForTimeout(400);
    ok(await left() > beforeWheel, `세로 휠이 가로로 안 넘어감 (${beforeWheel} -> ${await left()})`);

    // 끝에 닿으면 휠을 페이지에 넘겨야 한다 (칩 줄이 스크롤을 붙잡으면 안 됨)
    const maxLeft = await p.$eval("#rail-scroll", el => el.scrollWidth - el.clientWidth);
    await p.$eval("#rail-scroll", el => { el.scrollLeft = el.scrollWidth; });
    await p.waitForTimeout(350);
    await p.mouse.wheel(0, 200);
    await p.waitForTimeout(350);
    ok(await left() <= maxLeft + 1, "끝을 넘어서 더 밀림");

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
    const bad = await p.$$eval(".places tbody tr", els => els.map(c => {
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
    const drawn = await p.$$eval(".places tbody tr .name-wrap .ic", e => e.length);
    const n = await p.$$eval(".places tbody tr", e => e.length);
    ok(drawn === n, `행 ${n}개 중 아이콘 ${drawn}개`);
  }],

  ["17 목록에서 누르면 상세가 열리고 목록으로 돌아온다", async (p) => {
    await p.click('.st-btn[data-st="all"]'); await p.waitForTimeout(PAUSE);
    await p.click('.chip[data-cat="all"]'); await p.waitForTimeout(PAUSE);
    const before = (await cards(p)).length;
    const first = await p.$eval(".places tbody tr .name", e => e.textContent.trim());

    await p.click(".places tbody tr .name-btn");
    await p.waitForTimeout(400);
    ok(await p.$eval("#detail", e => !e.hidden), "상세가 안 열림");
    ok(await text(p, ".d-name") === first, `상세 이름이 다름: ${await text(p, ".d-name")} ≠ ${first}`);
    ok(await p.$eval(".table-wrap", e => getComputedStyle(e).display) === "none", "목록이 안 숨겨짐");
    ok(decodeURIComponent(await p.evaluate(() => location.hash)) === "#place/" + first,
       "주소에 해시가 안 남음");

    // 지도·예약 링크는 상세를 열지 않아야 한다
    await p.click("#back"); await p.waitForTimeout(400);
    ok(await p.$eval("#detail", e => e.hidden), "목록으로 안 돌아옴");
    ok((await cards(p)).length === before, "돌아왔더니 목록이 달라짐");
    ok(await p.evaluate(() => location.hash) === "", "해시가 안 지워짐");
  }],

  ["18 상세에 별점·메뉴·정보가 다 들어간다", async (p) => {
    await p.click(".places tbody tr .name-btn");
    await p.waitForTimeout(400);
    const d = await p.evaluate(() => ({
      score: document.querySelector(".d-score .big")?.textContent || "",
      secs: [...document.querySelectorAll(".d-sec h3")].map(h => h.textContent.split(" ·")[0]),
      menus: document.querySelectorAll(".d-menu .menu-row").length,
      links: [...document.querySelectorAll(".d-actions a")].map(a => a.href),
      walk: document.querySelectorAll(".d-walk span").length,
      map: !!document.querySelector(".minimap"),
      sites: [...document.querySelectorAll(".sites .site")].map(a => ({
        id: a.dataset.site, href: a.href, label: a.textContent.trim() })),
    }));
    ok(/^[0-5]\.[0-9]$/.test(d.score), `별점 표시가 이상함: ${d.score}`);
    ["정보", "인기 메뉴", "소개", "주변 역"].forEach(t =>
      ok(d.secs.includes(t), `상세에 '${t}' 항목이 없음 (${d.secs.join(",")})`));
    ok(d.menus >= 1 && d.menus <= 8, `메뉴 줄 ${d.menus}개`);
    ok(d.links.length >= 2, "상세 버튼이 2개 미만");
    ok(d.links[0].includes("map.naver.com") && d.links[1].includes("catchtable.co.kr"),
       "상세 링크 주소가 틀림");
    ok(d.walk === 3, `역 거리 칩이 3개가 아니라 ${d.walk}개`);
    ok(d.map, "주변 역 그림이 없음");

    ok(d.sites.length === 10, `검색 사이트가 10곳이 아니라 ${d.sites.length}곳`);
    const HOSTS = {
      naver: "map.naver.com", nblog: "search.naver.com", nimg: "search.naver.com",
      kakao: "map.kakao.com", ct: "catchtable.co.kr", dining: "diningcode.com",
      siksin: "siksinhot.com", gmap: "google.com/maps", yt: "youtube.com",
      insta: "instagram.com",
    };
    Object.keys(HOSTS).forEach(id => {
      const hit = d.sites.filter(x => x.id === id)[0];
      ok(hit, `검색 사이트에 ${id} 가 없음`);
      ok(hit.href.includes(HOSTS[id]), `${id} 주소가 ${HOSTS[id]} 가 아님: ${hit.href}`);
      ok(hit.label.length > 0, `${id} 이름이 비어 있음`);
    });
    ok(new Set(d.sites.map(x => x.href)).size === 10, "검색 사이트 주소가 중복됨");

    await p.click("#back"); await p.waitForTimeout(400);
  }],

  ["19 ESC 와 주소창으로도 상세를 여닫는다", async (p) => {
    await p.click(".places tbody tr .name-btn");
    await p.waitForTimeout(400);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(400);
    ok(await p.$eval("#detail", e => e.hidden), "ESC 로 안 닫힘");

    const name = await p.$eval(".places tbody tr .name", e => e.textContent.trim());
    await p.evaluate(n => { location.hash = "place/" + encodeURIComponent(n); }, name);
    await p.waitForTimeout(500);
    ok(await p.$eval("#detail", e => !e.hidden), "해시로 안 열림");
    ok(await text(p, ".d-name") === name, "해시로 연 가게가 다름");
    await p.click("#back"); await p.waitForTimeout(400);
  }],

  ["20 표 구조가 머리글과 맞는다", async (p, ctx) => {
    const heads = await p.$$eval(".places thead th", e => e.length);
    ok(heads === 6, `머리글이 6칸이 아니라 ${heads}칸`);
    const wrong = await p.$$eval(".places tbody tr:not(.hint):not(.empty):not(.skeleton)",
      rows => rows.map(r => r.children.length).filter(n => n !== 6).length);
    ok(wrong === 0, `칸 수가 6이 아닌 행 ${wrong}개`);
  }],

  ["21 넓은 화면에서 가로폭을 다 쓴다", async (p, ctx) => {
    if (ctx.width < 1000) return;
    const m = await p.evaluate(() => {
      const wrap = document.querySelector(".table-wrap");
      const table = document.querySelector(".places");
      const root = document.documentElement.clientWidth;
      return { wrap: wrap.getBoundingClientRect().width,
               table: table.getBoundingClientRect().width, root };
    });
    ok(m.table >= m.wrap - 2, `표가 컨테이너보다 좁음 (${Math.round(m.table)}/${Math.round(m.wrap)})`);
    ok(m.wrap >= m.root * 0.86,
       `본문이 창 폭의 86% 미만 (${Math.round(m.wrap)}/${m.root})`);
  }],

  ["22 가로 스크롤이 생기지 않는다", async (p) => {
    const over = await p.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(over <= 1, `페이지가 가로로 ${over}px 넘침`);
  }],

  ["23 라이트·다크·시스템 전환이 먹는다", async (p) => {
    const lum = async () => p.evaluate(() => {
      const f = s => { const [r, g, b] = s.match(/\d+/g).map(Number);
                       return 0.299 * r + 0.587 * g + 0.114 * b; };
      return { bg: f(getComputedStyle(document.body).backgroundColor),
               attr: document.documentElement.getAttribute("data-theme") };
    });

    const btns = await p.$$eval("#theme button", els => els.map(b => b.dataset.theme));
    ok(btns.join(",") === "auto,light,dark", `전환 버튼이 이상함: ${btns.join(",")}`);

    await p.click('#theme button[data-theme="dark"]');
    await p.waitForTimeout(250);
    let m = await lum();
    ok(m.attr === "dark", "다크를 눌렀는데 data-theme 가 dark 가 아님");
    ok(m.bg < 80, `다크인데 배경이 밝음 (${Math.round(m.bg)})`);

    await p.click('#theme button[data-theme="light"]');
    await p.waitForTimeout(250);
    m = await lum();
    ok(m.attr === "light", "라이트를 눌렀는데 data-theme 가 light 가 아님");
    ok(m.bg > 200, `라이트인데 배경이 어두움 (${Math.round(m.bg)})`);

    // 새로고침해도 고른 값이 남아야 한다
    await p.reload();
    await p.waitForTimeout(1100);
    m = await lum();
    ok(m.attr === "light", "새로고침 후 테마가 안 남음");
    ok(await pressed(p, '#theme button[data-theme="light"]') === "true", "버튼 표시가 안 남음");

    // 시스템으로 되돌리면 값을 빼야 한다 (화면 설정이 다시 살아나도록)
    await p.click('#theme button[data-theme="auto"]');
    await p.waitForTimeout(250);
    m = await lum();
    ok(m.attr === null, "시스템인데 data-theme 가 남아 있음");

    await p.evaluate(() => { try { localStorage.removeItem("magok.theme"); } catch (e) {} });
  }],

  ["24 본문 글자가 다크에서 더 굵어진다", async (p) => {
    const w = async () => p.evaluate(() =>
      getComputedStyle(document.querySelector(".places tbody .note")).fontWeight);
    await p.click('#theme button[data-theme="light"]'); await p.waitForTimeout(250);
    const light = await w();
    await p.click('#theme button[data-theme="dark"]'); await p.waitForTimeout(250);
    const dark = await w();
    ok(Number(dark) > Number(light),
       `다크에서 더 굵어야 하는데 라이트 ${light} / 다크 ${dark}`);
    await p.click('#theme button[data-theme="auto"]'); await p.waitForTimeout(200);
    await p.evaluate(() => { try { localStorage.removeItem("magok.theme"); } catch (e) {} });
  }],

  ["25 완전한 HTML 문서라 표준 모드로 뜬다", async (p) => {
    // doctype 이 없으면 쿼크 모드가 되고, 그때 표는 색을 상속하지 않는다
    // (UA 규칙 table { color: -internal-quirk-inherit }). 라이트에서 글자가 사라졌다.
    const d = await p.evaluate(() => ({
      mode: document.compatMode,
      lang: document.documentElement.lang,
      charset: document.characterSet,
      title: document.title,
      viewport: !!document.querySelector('meta[name="viewport"]'),
    }));
    ok(d.mode === "CSS1Compat", `쿼크 모드로 뜸 (${d.mode}) — doctype 확인`);
    ok(d.charset.toLowerCase() === "utf-8", `문자셋이 ${d.charset}`);
    ok(d.lang === "ko", `lang 이 '${d.lang}'`);
    ok(d.title.length > 0, "제목이 비어 있음");
    ok(d.viewport, "viewport 메타가 없음");
  }],

  ["26 표 글자가 라이트에서 어둡고 다크에서 밝다", async (p) => {
    const L = async () => p.evaluate(() => {
      const f = s => { const [r, g, b] = s.match(/\d+/g).map(Number);
                       return 0.299 * r + 0.587 * g + 0.114 * b; };
      return { name: f(getComputedStyle(document.querySelector(".places tbody .name")).color),
               body: f(getComputedStyle(document.body).backgroundColor) };
    });
    await p.click('#theme button[data-theme="light"]'); await p.waitForTimeout(300);
    let m = await L();
    ok(m.body > 200 && m.name < 90,
       `라이트에서 안 읽힘 — 배경 ${Math.round(m.body)} 글자 ${Math.round(m.name)}`);

    await p.click('#theme button[data-theme="dark"]'); await p.waitForTimeout(300);
    m = await L();
    ok(m.body < 80 && m.name > 150,
       `다크에서 안 읽힘 — 배경 ${Math.round(m.body)} 글자 ${Math.round(m.name)}`);

    await p.click('#theme button[data-theme="auto"]'); await p.waitForTimeout(200);
    await p.evaluate(() => { try { localStorage.removeItem("magok.theme"); } catch (e) {} });
  }],

  ["27 다크모드에서 배경과 글자가 뒤집히지 않는다", async (p, ctx) => {
    if (!ctx.dark) return;
    const c = await p.evaluate(() => {
      const lum = s => { const [r,g,b] = s.match(/\d+/g).map(Number); return (0.299*r+0.587*g+0.114*b); };
      return { bg: lum(getComputedStyle(document.body).backgroundColor),
               fg: lum(getComputedStyle(document.querySelector(".places tbody .name")).color) };
    });
    ok(c.bg < 90, `다크인데 배경이 밝음 (${Math.round(c.bg)})`);
    ok(c.fg > 140, `다크인데 글자가 어두움 (${Math.round(c.fg)})`);
  }],
];

// ---------------------------------------------------------------- 실행
const VIEWS = [
  { name: "폰 390", width: 390, height: 820, dark: false },
  { name: "PC 1100", width: 1100, height: 900, dark: false },
  { name: "PC 1700", width: 1700, height: 950, dark: false },
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
        await fn(page, { errors, dark: view.dark, width: view.width });
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
