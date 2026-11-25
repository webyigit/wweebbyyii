import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Task } from '../types';
import { taskStore } from '../data/taskStore';
import { addDays, parseDay, relDay, toDayKey, weekStart } from '../lib/dates';
import { Button, Field, Sheet } from './ui';
import DatePickerSheet from './DatePickerSheet';
import { C } from '../theme';

/** 업무 수정·미루기·삭제 */
export default function TaskSheet({
  task, onClose, onDeleted, onError,
}: { task: Task | null; onClose: () => void; onDeleted: (t: Task) => void; onError: (msg: string) => void }) {
  const [title, setTitle] = useState('');
  const [picking, setPicking] = useState(false);
  useEffect(() => { if (task) setTitle(task.title); }, [task?.id]);
  if (!task) return null;
  const today = toDayKey(new Date());
  const base = task.date > today ? task.date : today;
  const nextMon = (() => {
    const m = weekStart(parseDay(base));
    return toDayKey(new Date(m.getFullYear(), m.getMonth(), m.getDate() + 7));
  })();

  const save = async () => {
    const t = title.trim();
    if (!t) { onError('내용을 입력해 주세요.'); return; }
    try {
      if (t !== task.title) await taskStore.update(task.id, { title: t });
      onClose();
    } catch { onError('저장하지 못했어요. 다시 눌러 주세요.'); }
  };
  const moveTo = async (day: string) => {
    try {
      const t = title.trim();
      if (t && t !== task.title) await taskStore.update(task.id, { title: t });
      await taskStore.postpone(task.id, day);
      onClose();
    } catch { onError('옮기지 못했어요. 다시 눌러 주세요.'); }
  };
  const del = async () => {
    try {
      await taskStore.remove(task.id);
      onClose();
      onDeleted(task);
    } catch { onError('삭제하지 못했어요. 다시 눌러 주세요.'); }
  };

  return (
    <>
      <Sheet visible={!!task && !picking} onClose={onClose} title="업무 수정" testID="task-sheet">
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 360, width: '100%' }}>
          <Field label="내용" value={title} onChangeText={setTitle} multiline testID="edit-title" />
          <Text style={s.label}>날짜 · {relDay(task.date, today)}{task.originalDate ? ` (처음 ${relDay(task.originalDate, today)})` : ''}</Text>
          <View style={s.row}>
            <Button title="내일로" kind="grey" size="m" style={s.flex} onPress={() => moveTo(addDays(base, 1))} testID="pp-tomorrow" />
            <Button title="다음 주 월요일" kind="grey" size="m" style={s.flex} onPress={() => moveTo(nextMon)} testID="pp-nextweek" />
          </View>
          <Button title="날짜 골라 옮기기" kind="grey" size="m" onPress={() => setPicking(true)} style={{ marginTop: 8 }} testID="pp-pick" />
        </ScrollView>
        <View style={[s.row, { marginTop: 20 }]}>
          <Button title="삭제" kind="danger" style={{ width: 96 }} onPress={del} testID="edit-delete" />
          <Button title="저장" style={s.flex} onPress={save} testID="edit-save" />
        </View>
      </Sheet>
      <DatePickerSheet
        visible={picking}
        value={task.date}
        title="어느 날로 옮길까요"
        onClose={() => setPicking(false)}
        onPick={(d) => { setPicking(false); moveTo(d); }}
      />
    </>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: C.grey700, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
