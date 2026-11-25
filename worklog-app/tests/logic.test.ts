// 실행: npm test  (node 22 의 타입 제거 기능 사용, 별도 설치 없음)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysIn, dateFromKey, keyFor, label, shift, toDayKey, toWeekKey } from '../src/lib/dates';

test('ISO 주 번호: 연말·연초 경계', () => {
  assert.equal(toWeekKey(new Date(2026, 10, 25)), '2026-W48');
  assert.equal(toWeekKey(new Date(2024, 11, 30)), '2025-W01'); // 월요일인데 다음 해 1주
  assert.equal(toWeekKey(new Date(2021, 0, 3)), '2020-W53'); // 일요일인데 전 해 53주
  assert.equal(toWeekKey(new Date(2026, 0, 1)), '2026-W01');
});

test('주 키 → 월요일 날짜 왕복', () => {
  for (const k of ['2026-W01', '2026-W48', '2020-W53', '2025-W01']) {
    const d = dateFromKey('weekly', k);
    assert.equal(d.getDay(), 1, k);
    assert.equal(toWeekKey(d), k);
  }
});

test('월 이동은 31일에서도 한 달씩', () => {
  const d = shift('monthly', new Date(2026, 0, 31), 1);
  assert.equal(keyFor('monthly', d), '2026-02');
  assert.equal(keyFor('monthly', shift('monthly', new Date(2026, 0, 15), -1)), '2025-12');
});

test('기간의 날짜 목록', () => {
  assert.equal(daysIn('weekly', new Date(2026, 10, 25)).length, 7);
  assert.equal(daysIn('weekly', new Date(2026, 10, 25))[0], '2026-11-23');
  assert.equal(daysIn('monthly', new Date(2026, 1, 10)).length, 28);
  assert.equal(daysIn('monthly', new Date(2028, 1, 10)).length, 29);
});

test('라벨', () => {
  assert.equal(label('daily', new Date(2026, 10, 25)), '2026년 11월 25일 (수)');
  assert.equal(label('weekly', new Date(2026, 10, 25)), '48주차 · 11/23~11/29');
  assert.equal(toDayKey(new Date(2026, 0, 5)), '2026-01-05');
});

// base64·합치기·GitHub 동기화 테스트는 tests/sync.test.ts
