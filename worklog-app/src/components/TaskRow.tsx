import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Task } from '../types';
import { C, HIT } from '../theme';
import { Checkbox, IconButton } from './ui';
import { hhmm, shortDay } from '../lib/dates';
import { taskStore } from '../data/taskStore';

/**
 * 업무 한 줄: [체크] 내용(말줄임 없음) [알림]
 * 완료하면 취소선 + 흐린 회색 글자(투명도는 대비가 무너져 안 씀). 줄을 누르면 수정·미루기·삭제 시트.
 */
export default function TaskRow({
  task, onOpen, onBell, showDate, onError,
}: { task: Task; onOpen: (t: Task) => void; onBell: (t: Task) => void; showDate?: boolean; onError?: (msg: string) => void }) {
  const meta: string[] = [];
  if (showDate) meta.push(shortDay(task.date));
  if (task.remindAt) meta.push(`${hhmm(task.remindAt)} 알림`);
  if (task.postponedCount) meta.push(`${task.postponedCount}번 미룸`);
  return (
    <View style={s.row} testID={`task-${task.id}`}>
      <Checkbox
        checked={task.done}
        label={`${task.title} ${task.done ? '완료됨' : '완료하기'}`}
        onPress={() => taskStore.toggleDone(task.id).catch(() => onError?.('저장하지 못했어요. 다시 눌러 주세요.'))}
        testID={`check-${task.id}`}
      />
      <Pressable
        style={s.body}
        onPress={() => onOpen(task)}
        accessibilityRole="button"
        accessibilityHint="수정, 미루기, 삭제"
        testID={`open-${task.id}`}
      >
        <Text style={[s.title, task.done && s.done]}>{task.title}</Text>
        {meta.length > 0 && <Text style={s.meta}>{meta.join(' · ')}</Text>}
      </Pressable>
      <IconButton
        name={task.remindAt ? 'notifications' : 'notifications-outline'}
        label={task.remindAt ? `알림 ${hhmm(task.remindAt)}, 바꾸기` : '알림 설정'}
        active={!!task.remindAt}
        onPress={() => onBell(task)}
        testID={`bell-${task.id}`}
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', minHeight: HIT + 8, paddingVertical: 4 },
  body: { flex: 1, minHeight: HIT, justifyContent: 'center', paddingVertical: 8, paddingRight: 4 },
  title: { fontSize: 16, lineHeight: 24, color: C.text },
  done: { textDecorationLine: 'line-through', color: C.grey600 },
  meta: { fontSize: 13, color: C.grey600, marginTop: 2 },
});
