import React, { useEffect, useRef, useState } from 'react';
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
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  // 보는 날이 바뀌면 고른 예약 날짜는 풀고, 쓰던 글은 그대로 둠
  useEffect(() => setTarget(null), [day]);
  const date = target ?? day;
  const today = toDayKey(new Date());

  // 엔터는 입력 직후 바로 올 수 있어 상태(text)가 아직 안 바뀌었을 수 있음 → 이벤트의 값을 우선
  const add = async (raw?: string) => {
    const t = (raw ?? text).trim();
    if (!t) return;
    // 엔터가 연달아 와도 두 번 넣지 않도록 먼저 비움. 실패하면 되돌려 놓음
    setText('');
    try {
      await taskStore.add({ title: t, date });
      setTarget(null);
      onAdded?.(date);
    } catch {
      setText(t);
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
        ref={input}
        value={text}
        onChangeText={setText}
        placeholder="할 일을 적어 주세요"
        placeholderTextColor={C.grey600}
        style={s.input}
        onSubmitEditing={(e) => add(e.nativeEvent.text)}
        returnKeyType="done"
        blurOnSubmit={false}
        accessibilityLabel="새 업무 내용"
        multiline={false}
        testID="add-input"
      />
      <Pressable
        onPress={() => add()}
        disabled={!text.trim()}
        style={[s.btn, !text.trim() && { opacity: 0.3 }]}
        accessibilityRole="button"
        accessibilityLabel="업무 추가"
        accessibilityState={{ disabled: !text.trim() }}
        testID="add-btn"
      >
        <Ionicons name="arrow-up" size={22} color="#fff" />
      </Pressable>
      <DatePickerSheet visible={picking} value={date} title="언제 할 일인가요" onClose={() => setPicking(false)} onPick={(d) => {
        setTarget(d);
        // 시트가 닫히는 애니메이션이 끝난 뒤 입력칸으로 커서를 돌려줌(바로 적을 수 있게)
        setTimeout(() => input.current?.focus(), 400);
      }} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line },
  date: { flexDirection: 'row', alignItems: 'center', gap: 4, height: HIT, paddingHorizontal: 10, borderRadius: R.m, backgroundColor: C.blue50 },
  dateText: { fontSize: 14, fontWeight: '600', color: C.blueText },
  input: { flex: 1, minWidth: 0, minHeight: HIT, borderRadius: R.m, backgroundColor: C.greyBg, paddingHorizontal: 14, fontSize: 16, color: C.text },
  btn: { width: HIT, height: HIT, borderRadius: R.m, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
});
