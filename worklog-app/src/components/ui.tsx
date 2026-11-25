import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { C, HIT, R } from '../theme';

export function Segmented<T extends string>({
  options, value, onChange, label,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <View style={s.seg} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[s.segItem, on && s.segOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            testID={`seg-${o.value}`}
          >
            <Text style={[s.segText, on && s.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Button({
  title, onPress, kind = 'primary', disabled, style, testID, accessibilityHint,
}: {
  title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean; style?: ViewStyle; testID?: string; accessibilityHint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={({ pressed }) => [
        s.btn,
        kind === 'primary' && s.btnPrimary,
        kind === 'ghost' && s.btnGhost,
        kind === 'danger' && s.btnDanger,
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.75 },
        style,
      ]}
    >
      <Text style={[s.btnText, kind === 'primary' ? { color: '#fff' } : kind === 'danger' ? { color: C.danger } : { color: C.primary }]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#8A90A0"
        style={[s.input, props.multiline && { minHeight: 96, textAlignVertical: 'top' }]}
        {...props}
      />
    </View>
  );
}

export const s = StyleSheet.create({
  seg: { flexDirection: 'row', backgroundColor: '#E6E9F0', borderRadius: R, padding: 3 },
  segItem: { flex: 1, minHeight: HIT - 4, alignItems: 'center', justifyContent: 'center', borderRadius: R - 3 },
  segOn: { backgroundColor: C.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  segText: { fontSize: 15, color: C.sub, fontWeight: '600' },
  segTextOn: { color: C.text },
  btn: { minHeight: HIT, paddingHorizontal: 16, borderRadius: R, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: C.primary },
  btnGhost: { backgroundColor: C.primarySoft },
  btnDanger: { backgroundColor: '#FDECEC' },
  btnText: { fontSize: 16, fontWeight: '700' },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 6 },
  input: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: R,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: C.text, minHeight: HIT,
  },
});
