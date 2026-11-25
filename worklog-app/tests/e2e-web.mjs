// 웹 빌드를 아이폰·PC 화면으로 띄워 주요 흐름을 확인한다.
// 실행: npx expo export --platform web --output-dir dist && node tests/e2e-web.mjs dist [스크린샷폴더]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright'); // 전역 설치본도 찾도록 require

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
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${!cond && extra ? ` (${extra})` : ''}`); };
const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const today = key(now);
const plus = (n) => key(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));

const browser = await chromium.launch();
const errors = [];
async function open(ctxOpts, seed) {
  const ctx = await browser.newContext(ctxOpts);
  if (seed) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('worklog.tasks.v2', s); sessionStorage.setItem('seeded', '1'); } }, seed);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await page.getByTestId('add-input').waitFor();
  return page;
}
const tid = (page, id) => page.getByTestId(id);
const titles = async (page, scope = 'body') =>
  page.locator(`${scope} [data-testid^="open-"]`).evaluateAll((els) => els.map((e) => e.innerText.split('\n')[0]));
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('worklog.tasks.v2') ?? '[]'));
async function add(page, text) { await tid(page, 'add-input').fill(text); await tid(page, 'add-input').press('Enter'); await page.waitForTimeout(80); }

// ---------- 아이폰 ----------
const page = await open({ ...devices['iPhone 15'] });
const shot = async (n) => shots && page.screenshot({ path: path.join(shots, `${n}.png`) });

check('01 첫 화면은 홈(남은 일)', (await tid(page, 'home-summary').innerText()).includes('남은 일'));
const long = '고객사 제안서 1차 초안 검토하고 피드백 정리해서 팀장님께 공유하기. 말줄임 없이 전부 보여야 하는 아주 긴 업무 내용입니다 끝.';
await add(page, '회의 자료 준비');
await add(page, long);
await add(page, '경비 정산');
check('02 추가 3개', (await titles(page)).length === 3);
check('03 긴 내용 말줄임 없음', (await titles(page)).some((t) => t.endsWith('끝.')));
const longEl = page.locator('[data-testid^="open-"]', { hasText: '끝.' }).first();
const box = await longEl.boundingBox();
check('04 긴 내용은 여러 줄로 펼쳐짐', box && box.height > 60, box && box.height);

await tid(page, 'tab-calendar').click();
check('05 기록 탭 기본은 일간', (await tid(page, 'mode-daily').getAttribute('aria-selected')) === 'true');
check('06 주간 날짜 스트립에 오늘', await tid(page, `strip-${today}`).isVisible());
const firstId = (await stored(page)).find((t) => t.title === '회의 자료 준비').id;
await tid(page, `check-${firstId}`).click();
await page.waitForTimeout(150);
const order = await titles(page);
check('07 체크하면 맨 아래로', order[order.length - 1] === '회의 자료 준비', order.join('|'));
const deco = await page.locator(`[data-testid="open-${firstId}"] >> text=회의 자료 준비`).evaluate((e) => getComputedStyle(e).textDecorationLine);
check('08 체크하면 취소선', deco.includes('line-through'));
const op = await tid(page, `task-${firstId}`).evaluate((e) => getComputedStyle(e).opacity);
check('09 체크하면 흐리게', Number(op) < 1, op);
await shot('e1-daily');

await tid(page, 'filter-done').click();
check('10 완료 필터', (await titles(page)).join() === '회의 자료 준비');
await tid(page, 'filter-todo').click();
check('11 미완료 필터', (await titles(page)).length === 2 && !(await titles(page)).includes('회의 자료 준비'));
await tid(page, 'filter-all').click();

// 수정
const gyeongbi = (await stored(page)).find((t) => t.title === '경비 정산').id;
await tid(page, `open-${gyeongbi}`).click();
await tid(page, 'edit-title').fill('경비 정산 (11월분)');
await tid(page, 'edit-save').click();
await page.waitForTimeout(150);
check('12 수정', (await titles(page)).includes('경비 정산 (11월분)'));

// 미루기: 내일로
await tid(page, `open-${gyeongbi}`).click();
await tid(page, 'pp-tomorrow').click();
await page.waitForTimeout(150);
check('13 내일로 미루면 오늘 목록에서 빠짐', !(await titles(page)).includes('경비 정산 (11월분)'));
const moved = (await stored(page)).find((t) => t.id === gyeongbi);
check('14 미룬 날짜·이력 저장', moved.date === plus(1) && moved.originalDate === today && moved.postponedCount === 1);
await tid(page, `strip-${plus(1)}`).click().catch(async () => { await tid(page, 'next').click(); });
await page.waitForTimeout(100);
if (plus(1) !== today && !(await titles(page)).length) { await tid(page, 'next').click(); }
check('15 내일에서 보임', (await titles(page)).includes('경비 정산 (11월분)'));
check('16 미룸 표시', (await page.locator(`[data-testid="open-${gyeongbi}"]`).innerText()).includes('1번 미룸'));
await tid(page, 'today').click();

// 예약: 날짜 골라 미래에 추가
await tid(page, 'add-date').click();
await tid(page, 'dp-month-next').click();
const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 10);
await tid(page, `dp-${key(nextMonth)}`).click();
check('17 날짜 칩이 예약으로 바뀜', (await tid(page, 'add-date').innerText()).includes('예약'));
await page.waitForTimeout(500);
check('17b 날짜 고른 뒤 입력칸에 커서', (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'add-input');
await add(page, '분기 보고서 제출');
check('18 예약하면 안내', (await tid(page, 'toast').innerText()).includes('예약했어요'));
check('19 예약 업무 저장', (await stored(page)).some((t) => t.title === '분기 보고서 제출' && t.date === key(nextMonth)));

// 년/월/일 이동 + 오늘
await tid(page, 'period-label').click();
await tid(page, 'dp-year-prev').click();
check('20 년 이동', (await tid(page, 'dp-year').innerText()) === `${now.getFullYear() - 1}년`);
await tid(page, 'dp-year-next').click();
await tid(page, 'dp-month-next').click();
await tid(page, `dp-${key(nextMonth)}`).click();
check('21 고른 날로 이동', (await tid(page, 'period-label').innerText()).includes(`${nextMonth.getMonth() + 1}월 10일`));
check('22 그날 예약 업무 보임', (await titles(page)).includes('분기 보고서 제출'));
await tid(page, 'today').click();
check('23 오늘 버튼', (await tid(page, 'period-label').innerText()).includes(`${now.getMonth() + 1}월 ${now.getDate()}일`));

// 알림
const longId = (await stored(page)).find((t) => t.title === long).id;
await tid(page, `bell-${longId}`).click();
await tid(page, 'rm-input').fill('23:59');
await tid(page, 'rm-save').click();
await page.waitForTimeout(150);
const rem = (await stored(page)).find((t) => t.id === longId).remindAt;
check('24 알림 시각 저장', !!rem && new Date(rem).getHours() === 23 || now.getHours() === 23, rem);
await tid(page, `bell-${firstId}`).click();
await tid(page, 'rm-input').fill('99:99');
await tid(page, 'rm-save').click();
check('25 잘못된 시각 안내', await tid(page, 'rm-err').isVisible());
await page.keyboard.press('Escape');
await page.mouse.click(10, 10);
await page.waitForTimeout(300);

// 주간·월간: 날짜는 다 보이고, 업무 없는 날은 날짜만
await tid(page, 'mode-weekly').click();
check('26 주간 7일', (await page.locator('[data-testid^="dayhead-"]').count()) === 7);
await shot('e2-weekly');
await tid(page, 'mode-monthly').click();
const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
check('27 월간 모든 날짜', (await page.locator('[data-testid^="dayhead-"]').count()) === dim);
await tid(page, `dayhead-${today}`).click();
check('28 월간 날짜 누르면 일간', (await tid(page, 'mode-daily').getAttribute('aria-selected')) === 'true');
await shot('e3-monthly');

// 삭제 + 되돌리기
await tid(page, `open-${longId}`).click();
await tid(page, 'edit-delete').click();
await page.waitForTimeout(150);
check('29 삭제', !(await titles(page)).includes(long));
await tid(page, 'toast-action').click();
await page.waitForTimeout(150);
check('30 되돌리기', (await titles(page)).includes(long));

// 새로고침 뒤 유지
await page.reload();
await tid(page, 'add-input').waitFor();
await tid(page, 'tab-calendar').click();
check('31 새로고침 뒤 유지', (await titles(page)).length === 2);

// 홈: 밀린 일·예약
await page.evaluate((y) => {
  const all = JSON.parse(localStorage.getItem('worklog.tasks.v2'));
  all.push({ id: 'old1', title: '어제 못한 일', date: y, done: false, order: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  localStorage.setItem('worklog.tasks.v2', JSON.stringify(all));
}, plus(-1));
await page.reload();
await tid(page, 'home-overdue').waitFor();
check('32 홈에 밀린 일', (await tid(page, 'home-overdue').innerText()).includes('어제 못한 일'));
check('33 홈에 예약된 일', (await tid(page, 'home-upcoming').innerText()).includes('분기 보고서 제출'));
check('34 홈에는 완료한 일 없음', !(await tid(page, 'home').innerText()).includes('회의 자료 준비'));
await shot('e4-home');
await tid(page, 'move-all').click();
await page.waitForTimeout(200);
check('35 밀린 일 모두 오늘로', (await stored(page)).find((t) => t.id === 'old1').date === today);

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
check('36 가로 넘침 없음(아이폰)', overflow <= 0, overflow);

// ---------- 좁은 화면·PC ----------
const small = await open({ viewport: { width: 320, height: 568 } });
await add(small, '좁은 화면 '.repeat(8));
check('37 320px 가로 넘침 없음', (await small.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
check('38 320px 추가 버튼 화면 안', ((await tid(small, 'add-btn').boundingBox()).x + 44) <= 320);

const pc = await open({ viewport: { width: 1440, height: 900 } });
const w = (await tid(pc, 'add-input').boundingBox()).width;
check('39 PC 에서는 가운데 한 단(640 이하)', w < 640, w);
shots && pc.screenshot({ path: path.join(shots, 'e5-pc.png') });

// ---------- 저장 데이터가 깨졌을 때 덮어쓰지 않음 ----------
const broken = await open({ ...devices['iPhone 15'] }, '{깨진 데이터');
check('40 읽기 실패 안내', await tid(broken, 'load-failed').isVisible());
await add(broken, '새 업무');
const raw = await broken.evaluate(() => localStorage.getItem('worklog.tasks.v2'));
check('41 깨진 원본을 덮어쓰지 않음', raw === '{깨진 데이터');
check('42 원본 사본 보관', await broken.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('worklog.tasks.v2.corrupt.'))));

check('43 화면 오류 없음', errors.length === 0, errors.join(' / '));
console.log(`\n${pass} 통과 / ${fail} 실패`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
