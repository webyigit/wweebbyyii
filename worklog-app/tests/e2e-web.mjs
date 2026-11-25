// 웹 빌드를 아이폰 화면 크기로 띄워 주요 흐름을 확인한다.
// 실행: npx expo export --platform web --output-dir dist && node tests/e2e-web.mjs dist [스크린샷폴더]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright'); // 전역 설치본도 찾도록 require 사용

const root = path.resolve(process.argv[2] ?? 'dist');
const shots = process.argv[3];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.ico': 'image/x-icon', '.json': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;

let pass = 0, fail = 0;
const check = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 15'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const shot = async (n) => shots && page.screenshot({ path: path.join(shots, `${n}.png`) });
const tid = (id) => page.getByTestId(id);

await page.goto(url);
await tid('f-done').waitFor();
check('01 첫 화면은 오늘 일간', (await tid('period-label').innerText()).includes('일 ('));
await shot('01-daily-empty');

await tid('f-done').fill('제안서 목차 확정');
await tid('f-todo').fill('경쟁사 분석');
await page.waitForTimeout(900);
check('02 자동 저장', (await tid('save-status').innerText()) === '저장됨');
await shot('02-daily-saved');

await page.reload();
await tid('f-done').waitFor();
check('03 새로고침 뒤에도 남아 있음', (await tid('f-done').inputValue()) === '제안서 목차 확정');

// 입력 직후 바로 다른 날로 이동해도 잃지 않음
await tid('f-memo').fill('급히 쓴 메모');
await tid('prev').click();
check('04 이전 날은 비어 있음', (await tid('f-done').inputValue()) === '');
await tid('today').click();
check('05 이동 직전 입력도 저장됨', (await tid('f-memo').inputValue()) === '급히 쓴 메모');

await tid('seg-weekly').click();
check('06 주간 라벨', (await tid('period-label').innerText()).includes('주차'));
check('07 이 주의 일간 기록 1개', (await tid('toggle-days').innerText()).includes('1개'));
await tid('f-done').fill('주간 보고 제출');
await page.waitForTimeout(800);
await shot('03-weekly');

await tid('seg-monthly').click();
check('08 월간 라벨', /\d+년 \d+월$/.test((await tid('period-label').innerText()).trim()));
await tid('next').click();
check('09 다음 달은 비어 있음', (await tid('f-done').inputValue()) === '');
await shot('04-monthly');

await tid('tab-list').click();
await page.waitForTimeout(200);
check('10 목록에 2개', (await page.locator('[data-testid^="item-"]').count()) === 2);
await tid('search').fill('주간 보고');
await page.waitForTimeout(200);
check('11 검색 1개', (await page.locator('[data-testid^="item-"]').count()) === 1);
await shot('05-list');
await tid('search').fill('없는말zz');
check('12 검색 결과 없음 안내', await tid('list-empty').isVisible());
await tid('search').fill('');
await page.locator('[data-testid^="item-daily"]').first().click();
check('13 목록에서 누르면 그 기록 열림', (await tid('f-done').inputValue()) === '제안서 목차 확정');

page.once('dialog', (d) => d.accept());
await tid('delete').click();
check('14 삭제', (await tid('f-done').inputValue()) === '');
await tid('tab-list').click();
check('15 삭제 뒤 목록 1개', (await page.locator('[data-testid^="item-"]').count()) === 1);

await tid('tab-settings').click();
await tid('g-owner').fill('../evil');
await tid('g-repo').fill('data');
await tid('g-sync').click();
await page.waitForTimeout(200);
check('16 잘못된 소유자 거부', (await tid('g-msg').innerText()).includes('소유자'));
await tid('g-owner').fill('me');
await tid('g-sync').click();
await page.waitForTimeout(200);
check('17 토큰 없으면 안내', (await tid('g-msg').innerText()).includes('토큰'));
check('18 토큰 칸은 가려짐', (await tid('g-token').getAttribute('type')) === 'password');
const stored = await page.evaluate(() => JSON.stringify(localStorage));
await tid('g-token').fill('github_pat_SECRETTEST');
await page.route('https://api.github.com/**', (r) => r.fulfill({ status: 401, body: '{}' }));
await tid('g-sync').click();
await page.waitForTimeout(500);
check('19 401 이면 토큰 안내', (await tid('g-msg').innerText()).includes('토큰이 올바르지'));
const stored2 = await page.evaluate(() => JSON.stringify(localStorage));
check('20 토큰이 브라우저 저장소에 안 남음', !stored2.includes('SECRETTEST') && !stored.includes('SECRETTEST'));
await shot('06-settings');

check('21 화면 오류 없음', errors.length === 0);
if (errors.length) console.log(errors);
console.log(`\n${pass} 통과 / ${fail} 실패`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
