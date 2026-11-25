import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Task } from '../types';
import { taskStore } from '../data/taskStore';
import { hhmm, parseDay, relDay, toDayKey } from '../lib/dates';
import { Button, Field, Sheet } from './ui';
import { C } from '../theme';

/**
 * 알림 시각 고르기(기본 판). remindAt 만 저장하고, 실제 기기 알림 예약은 알림 모듈이
 * taskStore.subscribe 로 이 값을 보고 처리합니다. 알림 모듈의 ReminderSheet 가 들어오면 교체.
 */
export default function ReminderSheetFallback({
  task, visible, onClose,
}: { task: Task | null; visible: boolean; onClose: () => void }) {
  const [time, setTime] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (visible) { setTime(task?.remindAt ? hhmm(task.remindAt) : ''); setErr(''); }
  }, [visible, task?.id]);
  if (!task) return null;

  const set = async (hm: string) => {
    const m = /^([01]?\d|2[0-3]):?([0-5]\d)$/.exec(hm.trim());
    if (!m) { setErr('시각을 09:30 처럼 입력해 주세요.'); return; }
    const d = parseDay(task.date);
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (d.getTime() <= Date.now()) { setErr('이미 지난 시각이에요. 다른 시각을 골라 주세요.'); return; }
    await taskStore.update(task.id, { remindAt: d.toISOString() });
    onClose();
  };
  const off = async () => { await taskStore.update(task.id, { remindAt: undefined }); onClose(); };

  return (
    <Sheet visible={visible} onClose={onClose} title="알림 받기" testID="reminder-sheet">
      <Text style={s.p}>{relDay(task.date, toDayKey(new Date()))}, 고른 시각에 알려 드려요.</Text>
      <View style={s.row}>
        {['09:00', '13:00', '18:00'].map((t) => (
          <Button key={t} title={t} kind="grey" size="m" style={{ flex: 1 }} onPress={() => set(t)} testID={`rm-${t}`} />
        ))}
      </View>
      <Field label="직접 입력" value={time} onChangeText={(v) => { setTime(v); setErr(''); }} placeholder="예: 14:30" keyboardType="numbers-and-punctuation" returnKeyType="done" onSubmitEditing={() => set(time)} testID="rm-input" />
      {!!err && <Text style={s.err} accessibilityLiveRegion="assertive" testID="rm-err">{err}</Text>}
      <View style={s.row}>
        {task.remindAt && <Button title="알림 끄기" kind="grey" style={{ flex: 1 }} onPress={off} testID="rm-off" />}
        <Button title="이 시각으로 받기" style={{ flex: 2 }} onPress={() => set(time)} testID="rm-save" />
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  p: { fontSize: 15, color: C.grey700, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  err: { color: C.redText, fontSize: 14, marginTop: -6, marginBottom: 10 },
});
