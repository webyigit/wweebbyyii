import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, KeyboardAvoidingView, TextInput, type TextInputProps, Modal, Platform, Pressable, StyleSheet, Text, View,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, HIT, MAX_W, R, T } from '../theme';

type BtnKind = 'primary' | 'weak' | 'ghost' | 'grey' | 'danger';
export function Button({
  title, onPress, kind = 'primary', size = 'l', disabled, style, testID, hint,
}: {
  title: string; onPress: () => void; kind?: BtnKind; size?: 'xl' | 'l' | 'm';
  disabled?: boolean; style?: StyleProp<ViewStyle>; testID?: string; hint?: string;
}) {
  const h = size === 'xl' ? 56 : size === 'l' ? 48 : HIT;
  const bg = { primary: C.blue, weak: C.blue50, ghost: C.blue50, grey: C.greyBg, danger: '#FEECEE' }[kind];
  const fg = { primary: '#fff', weak: C.blueText, ghost: C.blueText, grey: C.grey700, danger: C.redText }[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityHint={hint}
      testID={testID}
      style={({ pressed }) => [
        { height: h, borderRadius: size === 'xl' ? R.xl : size === 'l' ? R.l : R.m, backgroundColor: bg,
          alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
        disabled && { opacity: 0.3 },
        style,
      ]}
    >
      {({ pressed }) => (
        <>
          {pressed && <View style={[StyleSheet.absoluteFill, { backgroundColor: C.press, borderRadius: R.l }]} />}
          <Text style={{ color: fg, fontSize: size === 'm' ? 15 : 17, fontWeight: '700' }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

/** 상호 배타 선택(토스 segmented-control). 선택 칸은 흰 바탕+굵은 글자로 색 말고도 구분 */
export function Segmented<V extends string>({
  options, value, onChange, label, testPrefix = 'seg',
}: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void; label: string; testPrefix?: string }) {
  return (
    <View style={st.seg} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[st.segItem, on && st.segOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            aria-selected={on}
            testID={`${testPrefix}-${o.value}`}
          >
            <Text style={[st.segText, on && st.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 필터 칩(토스 chip). 선택은 진한 회색 바탕+흰 글자 */
export function Chip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      testID={testID}
      hitSlop={{ top: 5, bottom: 5 }}
      style={[st.chip, on && st.chipOn]}
    >
      <Text style={[st.chipText, on && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Checkbox({ checked, onPress, label, testID }: { checked: boolean; onPress: () => void; label: string; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      accessibilityLabel={label}
      testID={testID}
      style={st.checkHit}
    >
      <View style={[st.check, checked && st.checkOn]}>
        {checked && <Ionicons name="checkmark" size={16} color="#fff" />}
      </View>
    </Pressable>
  );
}

export function IconButton({
  name, label, onPress, color = C.grey600, active, testID,
}: { name: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color?: string; active?: boolean; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} style={st.iconBtn}>
      {({ pressed }) => (
        <View style={[st.iconInner, pressed && { backgroundColor: C.press }]}>
          <Ionicons name={name} size={22} color={active ? C.blue : color} />
        </View>
      )}
    </Pressable>
  );
}

/** 아래에서 올라오는 시트(토스: 모바일 dialog 대신 bottom-sheet) */
export function Sheet({
  visible, onClose, title, children, testID,
}: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode; testID?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={st.scrim} onPress={onClose} accessibilityLabel="닫기" accessibilityRole="button" />
        <View style={[st.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} testID={testID} accessibilityViewIsModal>
          <View style={st.grabber} />
          <Text style={[T.h2, { marginBottom: 16 }]} accessibilityRole="header">{title}</Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** 잠깐 떠 있다 사라지는 안내. action 이 있으면 되돌리기 같은 버튼 */
export function Toast({
  text, actionLabel, onAction, onHide, ms = 4000,
}: { text: string | null; actionLabel?: string; onAction?: () => void; onHide: () => void; ms?: number }) {
  const op = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!text) return;
    Animated.timing(op, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start();
    const t = setTimeout(onHide, ms);
    return () => clearTimeout(t);
  }, [text]);
  if (!text) return null;
  return (
    <Animated.View style={[st.toastWrap, { opacity: op }]} pointerEvents="box-none">
      <View style={st.toast} accessibilityLiveRegion="polite" accessibilityRole="alert" testID="toast">
        <Text style={st.toastText}>{text}</Text>
        {actionLabel && onAction && (
          <Pressable onPress={() => { onAction(); onHide(); }} accessibilityRole="button" style={st.toastBtn} testID="toast-action">
            <Text style={st.toastAction}>{actionLabel}</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

/** 토스 text-field: 회색 바탕, 포커스 때 흰 바탕 + 파란 1.5px 테두리 */
export function Field({ label, style, onFocus, onBlur, ...props }: TextInputProps & { label: string }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={st.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={C.grey600}
        {...props}
        onFocus={(e) => { setFocus(true); onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); onBlur?.(e); }}
        style={[st.input, focus && st.inputFocus, props.multiline && { minHeight: 96, textAlignVertical: 'top' }, style]}
      />
    </View>
  );
}

export const st = StyleSheet.create({
  fieldLabel: { fontSize: 14, fontWeight: '600', color: C.grey700, marginBottom: 8 },
  input: { minHeight: 48, borderRadius: R.m, backgroundColor: C.greyBg, borderWidth: 1, borderColor: C.grey400, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.text },
  inputFocus: { backgroundColor: C.bg, borderColor: C.blue, borderWidth: 1.5 },
  seg: { flexDirection: 'row', backgroundColor: C.greyBg, borderRadius: R.l, padding: 3 },
  segItem: { flex: 1, minHeight: HIT, alignItems: 'center', justifyContent: 'center', borderRadius: R.m },
  segOn: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, ...(Platform.OS === 'android' ? { elevation: 1 } : { shadowColor: '#0A1A3A', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } }) },
  segText: { fontSize: 15, fontWeight: '500', color: C.grey600 },
  segTextOn: { color: C.text, fontWeight: '700' },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: R.full, borderWidth: 1, borderColor: C.grey300, backgroundColor: C.bg, justifyContent: 'center' },
  chipOn: { backgroundColor: C.text, borderColor: C.text },
  chipText: { fontSize: 14, fontWeight: '600', color: C.grey700 },
  checkHit: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: C.grey500, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.blue, borderColor: C.blue },
  iconBtn: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  iconInner: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  scrim: { flex: 1, backgroundColor: C.scrim },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 10, width: '100%', maxWidth: MAX_W, alignSelf: 'center' },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.grey300, marginBottom: 14 },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 96, alignItems: 'center', paddingHorizontal: 16 },
  toast: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.text, borderRadius: R.l, paddingLeft: 18, paddingRight: 6, minHeight: 52, maxWidth: MAX_W - 32, width: '100%' },
  toastText: { color: '#fff', fontSize: 15, flex: 1, paddingVertical: 12 },
  toastBtn: { minHeight: HIT, paddingHorizontal: 12, justifyContent: 'center' },
  toastAction: { color: '#64A8FF', fontSize: 15, fontWeight: '700' },
});
