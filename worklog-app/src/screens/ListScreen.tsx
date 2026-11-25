import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Entry, Period } from '../types';
import { PERIOD_LABEL } from '../types';
import { useStore } from '../lib/store';
import { labelFromKey } from '../lib/dates';
import { Segmented } from '../components/ui';
import { C, HIT, R } from '../theme';

type Filter = 'all' | Period;

/** 정렬용: 기간의 시작일 문자열 */
function sortKey(e: Entry): string {
  return e.key;
}

export default function ListScreen({ onOpen }: { onOpen: (e: Entry) => void }) {
  const { entries } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries
      .filter((e) => filter === 'all' || e.period === filter)
      .filter((e) => !needle || `${e.done}\n${e.todo}\n${e.memo}\n${labelFromKey(e.period, e.key)}`.toLowerCase().includes(needle))
      .sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : sortKey(a) > sortKey(b) ? -1 : a.period < b.period ? -1 : 1));
  }, [entries, q, filter]);

  return (
    <View style={{ flex: 1 }}>
      <View style={st.top}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="기록 검색"
          placeholderTextColor="#8A90A0"
          style={st.search}
          accessibilityLabel="기록 검색"
          clearButtonMode="while-editing"
          returnKeyType="search"
          testID="search"
        />
        <Segmented
          label="기록 단위 필터"
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: '전체' }, ...(['daily', 'weekly', 'monthly'] as Period[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))]}
        />
      </View>
      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={st.empty} testID="list-empty">
            {entries.length === 0 ? '아직 기록이 없습니다.\n기록 탭에서 오늘 한 일을 적어 보세요.' : '검색 결과가 없습니다.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onOpen(item)}
            style={({ pressed }) => [st.card, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityHint="이 기록 열기"
            testID={`item-${item.id}`}
          >
            <View style={st.cardHead}>
              <Text style={st.badge}>{PERIOD_LABEL[item.period]}</Text>
              <Text style={st.when}>{labelFromKey(item.period, item.key)}</Text>
            </View>
            {!!item.done && <Text style={st.text} numberOfLines={3}>{item.done}</Text>}
            {!!item.todo && <Text style={st.sub} numberOfLines={2}>할 일: {item.todo}</Text>}
            {!!item.memo && <Text style={st.sub} numberOfLines={2}>메모: {item.memo}</Text>}
          </Pressable>
        )}
      />
    </View>
  );
}

const st = StyleSheet.create({
  top: { padding: 16, paddingBottom: 8, gap: 10 },
  search: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: R, paddingHorizontal: 12, minHeight: HIT, fontSize: 16, color: C.text },
  card: { backgroundColor: C.card, borderRadius: R, padding: 14, marginBottom: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  badge: { fontSize: 12, fontWeight: '800', color: C.primary, backgroundColor: C.primarySoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  when: { fontSize: 15, fontWeight: '700', color: C.text, flexShrink: 1 },
  text: { fontSize: 15, color: C.text },
  sub: { fontSize: 14, color: C.sub, marginTop: 3 },
  empty: { textAlign: 'center', color: C.sub, marginTop: 60, fontSize: 15, lineHeight: 22 },
});
