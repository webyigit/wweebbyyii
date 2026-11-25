import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { taskStore } from '../data/taskStore';
import { relDay, toDayKey } from '../lib/dates';
import DatePickerSheet from './DatePickerSheet';
import { C, HIT, R } from '../theme';

/** 화면 아래 업무 추가 줄. 날짜 칩을 눌러 다른 날(미래면 예약)로 넣을 수 있음 */
export default function AddTaskBar({ day, onAdded, onError }: { day: string; onAdded?: (day: string) => void; onError: (m: string) => void }) {
  const [text, setText] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const date = target ?? day;
  const today = toDayKey(new Date());

  const add = async () => {
    const t = text.trim();
    if (!t) return;
    try {
      await taskStore.add({ title: t, date });
      setText('');
      setTarget(null);
      onAdded?.(date);
    } catch {
      onError('저장하지 못했어요. 다시 눌러 주세요.');
    }
  };

  return (
    <View style={s.wrap}>
      <Pressable onPress={() => setPicking(true)} style={s.date} accessibilityRole="button" accessibilityLabel={`날짜 ${relDay(date, today)}, 바꾸기`} testID="add-date">
        <Ionicons name="calendar-outline" size={16} color={C.blueText} />
        <Text style={s.dateText}>{date > today ? `${relDay(date, today)} 예약` : relDay(date, today)}</Text>
      </Pressable>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="할 일을 적어 주세요"
        placeholderTextColor={C.grey600}
        style={s.input}
        onSubmitEditing={add}
        returnKeyType="done"
        blurOnSubmit={false}
        accessibilityLabel="새 업무 내용"
        multiline={false}
        testID="add-input"
      />
      <Pressable
        onPress={add}
        disabled={!text.trim()}
        style={[s.btn, !text.trim() && { opacity: 0.3 }]}
        accessibilityRole="button"
        accessibilityLabel="업무 추가"
        accessibilityState={{ disabled: !text.trim() }}
        testID="add-btn"
      >
        <Ionicons name="arrow-up" size={22} color="#fff" />
      </Pressable>
      <DatePickerSheet visible={picking} value={date} title="언제 할 일인가요" onClose={() => setPicking(false)} onPick={setTarget} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line },
  date: { flexDirection: 'row', alignItems: 'center', gap: 4, height: HIT, paddingHorizontal: 10, borderRadius: R.m, backgroundColor: C.blue50 },
  dateText: { fontSize: 14, fontWeight: '600', color: C.blueText },
  input: { flex: 1, height: HIT, borderRadius: R.m, backgroundColor: C.greyBg, paddingHorizontal: 14, fontSize: 16, color: C.text },
  btn: { width: HIT, height: HIT, borderRadius: R.m, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
});
