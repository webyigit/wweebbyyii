/**
 * 업무 행 우측의 알림 버튼. 알림이 없으면 회색 종, 있으면 파란 알약에 시각.
 * 눌렀을 때 ReminderSheet 를 여는 건 부모가 합니다: <ReminderButton task={t} onPress={() => open(t)} />
 */
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { C, HIT } from '../theme';
import type { Task } from '../types';
import { fmtClock, fmtRemind, toDayKey } from './logic';

export default function ReminderButton({ task, onPress }: { task: Task; onPress: () => void }) {
  const at = task.remindAt ? new Date(task.remindAt) : null;
  const active = !!at && !task.done && at.getTime() > Date.now();
  const short = at ? (toDayKey(at) === task.date ? fmtClock(at) : fmtRemind(task.remindAt!).replace(/ \(.\)/, '')) : '';
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [st.btn, active && st.on, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={active ? `알림 ${fmtRemind(task.remindAt!)}, 바꾸기` : '알림 설정'}
      testID={`reminder-btn-${task.id}`}
    >
      <Text style={[st.icon, active && st.onText]} importantForAccessibility="no">{active ? '⏰' : '🔔'}</Text>
      {active && <Text style={[st.text, st.onText]}>{short}</Text>}
    </Pressable>
  );
}

const st = StyleSheet.create({
  btn: { minHeight: HIT, minWidth: HIT, paddingHorizontal: 8, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: 0.55 },
  on: { backgroundColor: C.primarySoft, opacity: 1, paddingHorizontal: 10, minHeight: 32, alignSelf: 'center' },
  icon: { fontSize: 15 },
  text: { fontSize: 13, fontWeight: '600' },
  onText: { color: C.primary },
});
