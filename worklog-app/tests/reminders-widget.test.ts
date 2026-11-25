// 알림·위젯 순수 로직 테스트. 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  desiredReminders, fmtRemind, MAX_SCHEDULED, planReminders, presetsFor, reminderId, remindAtFor, shiftRemindAt, toDayKey,
} from '../src/reminders/logic';
import { parseOpenUrl } from '../src/reminders/links';
import { buildWidgetSnapshot } from '../src/widget/snapshot';
import { APP_GROUP, WIDGET_KIND } from '../src/widget/config';
import type { Task } from '../src/types';

const NOW = new Date(2026, 10, 25, 14, 10); // 2026-11-25(수) 14:10 로컬
let seq = 0;
function task(p: Partial<Task>): Task {
  seq++;
  return {
    id: `t${seq}`, title: `업무 ${seq}`, date: '2026-11-25', done: false, order: seq,
    createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '2026-11-20T00:00:00.000Z', ...p,
  };
}

test('알림 시각 표기: 오늘 · 내일 · 날짜 · 다른 해', () => {
  assert.equal(fmtRemind(new Date(2026, 10, 25, 15, 0).toISOString(), NOW), '오늘 오후 3:00');
  assert.equal(fmtRemind(new Date(2026, 10, 26, 9, 5).toISOString(), NOW), '내일 오전 9:05');
  assert.equal(fmtRemind(new Date(2026, 10, 28, 0, 0).toISOString(), NOW), '11월 28일 (토) 오전 12:00');
  assert.equal(fmtRemind(new Date(2027, 0, 2, 12, 30).toISOString(), NOW), '2027년 1월 2일 (토) 오후 12:30');
});

test('remindAtFor 는 로컬 날짜 기준 (UTC 로 하루 밀리지 않음)', () => {
  const d = new Date(remindAtFor('2026-11-26', 0, 30));
  assert.equal(toDayKey(d), '2026-11-26');
  assert.equal(d.getHours(), 0);
  assert.equal(d.getMinutes(), 30);
});

test('빠른 선택: 오늘 업무는 지금 기준, 지난 시각은 빠짐', () => {
  const p = presetsFor({ date: '2026-11-25' }, NOW);
  assert.deepEqual(p.map((x) => x.key), ['in30', 'in60', 'pm6']);
  assert.ok(p.every((x) => Date.parse(x.remindAt) > NOW.getTime()));
  const late = presetsFor({ date: '2026-11-25' }, new Date(2026, 10, 25, 18, 30));
  assert.ok(!late.some((x) => x.key === 'pm6'), '오후 6시가 지났으면 빼야 함');
  assert.ok(late.some((x) => x.key === 'tm9'));
});

test('빠른 선택: 예약(미래) 업무는 그날 기준', () => {
  const p = presetsFor({ date: '2026-12-01' }, NOW);
  assert.deepEqual(p.map((x) => x.key), ['d9', 'd13', 'eve']);
  assert.equal(toDayKey(new Date(p[2].remindAt)), '2026-11-30');
  // 내일 업무의 '전날 오후 9시' = 오늘 21시 → 아직 미래라 포함
  assert.ok(presetsFor({ date: '2026-11-26' }, NOW).some((x) => x.key === 'eve'));
});

test('예약 대상: 완료·삭제·지난 알림은 빠지고 가까운 순 최대 60개', () => {
  const future = (h: number) => new Date(2026, 10, 25, 14, 10 + h).toISOString();
  const ts = [
    task({ remindAt: future(5) }),
    task({ remindAt: future(1), done: true }),
    task({ remindAt: future(2), deletedAt: 'x' }),
    task({ remindAt: future(-1) }),
    task({}),
    task({ remindAt: future(3) }),
  ];
  const d = desiredReminders(ts, NOW);
  assert.deepEqual(d.map((x) => x.taskId), [ts[5].id, ts[0].id]);
  const many = Array.from({ length: 80 }, (_, i) => task({ remindAt: future(i + 1) }));
  assert.equal(desiredReminders(many, NOW).length, MAX_SCHEDULED);
});

test('기기 예약 맞추기: 바뀐 것만 취소·예약', () => {
  const at = (m: number) => new Date(2026, 10, 25, 15, m).toISOString();
  const a = task({ remindAt: at(0) });
  const b = task({ remindAt: at(10) });
  const c = task({ remindAt: at(20), done: true });
  const scheduled = [
    { identifier: reminderId(a.id), taskId: a.id, remindAt: at(0), title: a.title }, // 그대로
    { identifier: reminderId(b.id), taskId: b.id, remindAt: at(5), title: b.title }, // 시각 바뀜
    { identifier: reminderId(c.id), taskId: c.id, remindAt: at(20), title: c.title }, // 완료됨
    { identifier: reminderId('gone'), taskId: 'gone', remindAt: at(30), title: 'x' }, // 삭제된 업무
  ];
  const plan = planReminders([a, b, c], scheduled, NOW);
  assert.deepEqual(plan.toCancel.sort(), [reminderId(b.id), reminderId(c.id), reminderId('gone')].sort());
  assert.deepEqual(plan.toSchedule.map((x) => x.taskId), [b.id]);
  // 제목만 바뀌어도 다시 예약
  const renamed = planReminders([{ ...a, title: '새 제목' }], scheduled.slice(0, 1), NOW);
  assert.deepEqual(renamed.toSchedule.map((x) => x.taskId), [a.id]);
  // 아무것도 안 바뀌면 할 일 없음
  const same = planReminders([a], scheduled.slice(0, 1), NOW);
  assert.deepEqual(same, { toCancel: [], toSchedule: [] });
});

test('미루기: 알림이 같은 간격으로 따라감, 동기화로 이미 옮겨진 값은 다시 안 옮김', () => {
  const r = new Date(2026, 10, 25, 15, 0).toISOString();
  const moved = shiftRemindAt({ date: '2026-11-25', remindAt: r }, { date: '2026-11-27', remindAt: r });
  const m = new Date(moved!);
  assert.equal(toDayKey(m), '2026-11-27');
  assert.equal(m.getHours(), 15);
  // 전날 밤 알림도 하루 앞으로 함께
  const eve = new Date(2026, 10, 24, 21, 0).toISOString();
  assert.equal(toDayKey(new Date(shiftRemindAt({ date: '2026-11-25', remindAt: eve }, { date: '2026-11-26', remindAt: eve })!)), '2026-11-25');
  // 날짜와 알림이 함께 바뀌어 들어오면(다른 기기에서 이미 옮김) 그대로
  const already = new Date(2026, 10, 26, 15, 0).toISOString();
  assert.equal(shiftRemindAt({ date: '2026-11-25', remindAt: r }, { date: '2026-11-26', remindAt: already }), undefined);
  // 날짜 안 바뀜 · 알림 없음 · 업무 날보다 뒤에 걸린 알림은 그대로
  assert.equal(shiftRemindAt({ date: '2026-11-25', remindAt: r }, { date: '2026-11-25', remindAt: r }), undefined);
  assert.equal(shiftRemindAt({ date: '2026-11-25' }, { date: '2026-11-26' }), undefined);
  const after = new Date(2026, 10, 27, 9, 0).toISOString();
  assert.equal(shiftRemindAt({ date: '2026-11-25', remindAt: after }, { date: '2026-11-26', remindAt: after }), undefined);
});

test('위젯 데이터: 미완료만, 밀린 것 + 오늘 + 내일까지, 날짜·순서대로', () => {
  const ts = [
    task({ date: '2026-11-25', order: 2, title: '오늘 둘째' }),
    task({ date: '2026-11-25', order: 1, title: '오늘 첫째', remindAt: '2026-11-25T06:00:00.000Z' }),
    task({ date: '2026-11-24', order: 1, title: '어제 밀림' }),
    task({ date: '2026-11-25', done: true, title: '완료' }),
    task({ date: '2026-11-25', deletedAt: 'x', title: '삭제' }),
    task({ date: '2026-11-26', title: '내일' }),
    task({ date: '2026-11-27', title: '모레' }),
  ];
  const s = buildWidgetSnapshot(ts, NOW);
  assert.deepEqual(s.items.map((x) => x.title), ['어제 밀림', '오늘 첫째', '오늘 둘째', '내일']);
  assert.equal(s.items[1].remindAt, '2026-11-25T06:00:00.000Z');
  assert.ok(!('remindAt' in s.items[0]));
  assert.equal(s.truncated, 0);
  const many = Array.from({ length: 35 }, () => task({}));
  assert.equal(buildWidgetSnapshot(many, NOW).truncated, 5);
});

test('위젯·알림 탭 주소 해석', () => {
  assert.deepEqual(parseOpenUrl('worklog://today?from=widget', NOW), { date: '2026-11-25', source: 'widget' });
  assert.deepEqual(parseOpenUrl('worklog://day/2026-11-24?task=t9&from=widget', NOW), { date: '2026-11-24', source: 'widget', taskId: 't9' });
  assert.deepEqual(parseOpenUrl('worklog:///day/2026-12-01', NOW), { date: '2026-12-01', source: 'link' });
  assert.equal(parseOpenUrl('worklog://settings', NOW), null);
  assert.equal(parseOpenUrl('https://example.com', NOW), null);
  assert.equal(parseOpenUrl(null, NOW), null);
});

test('App Group·위젯 이름이 app.json · 위젯 Swift 와 일치', () => {
  const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
  assert.equal(APP_GROUP, `group.${app.expo.ios.bundleIdentifier}`);
  assert.equal(app.expo.scheme, 'worklog');
  assert.ok(app.expo.plugins.includes('./plugins/withWorklogWidget'));
  assert.ok(app.expo.plugins.includes('expo-notifications'));
  const swift = readFileSync(new URL('../targets/widget/WorklogWidget.swift', import.meta.url), 'utf8');
  assert.ok(swift.includes(`"${APP_GROUP}"`), 'Swift appGroup 불일치');
  assert.ok(swift.includes(`"${WIDGET_KIND}"`), 'Swift widgetKind 불일치');
  assert.ok(swift.includes('"worklog.widget.v1"'), 'Swift storageKey 불일치');
});
