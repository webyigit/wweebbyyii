/**
 * 토스(TDS Mobile) 시각 언어를 이 앱 역할 이름에 한 번 묶어 둔 토큰.
 * 값 출처: 사용자가 준 토스 design.md (TDS 발행 hex). 파란 글자는 대비를 위해 blue-700 을 씀.
 */
export const C = {
  bg: '#FFFFFF', // background
  greyBg: '#F2F4F6', // greyBackground (grey-100)
  grey50: '#F9FAFB',
  line: '#E5E8EB', // grey-200 헤어라인
  grey300: '#D1D6DB',
  grey400: '#B0B8C1',
  grey500: '#8B95A1',
  grey600: '#6B7684', // 흰 바탕 4.6:1
  grey700: '#4E5968', // 보조 글자 7.2:1
  text: '#191F28', // grey-900, 순검정 안 씀
  blue: '#3182F6', // blue-500 주요 채움
  blueText: '#1B64DA', // blue-700, 흰 바탕 글자 5.6:1
  blue50: '#E8F3FF',
  red: '#F04452',
  redText: '#D22030', // 흰 바탕 글자 5.0:1
  green: '#1E7B3A',
  scrim: 'rgba(0,0,0,0.56)',
  press: 'rgba(0,0,0,0.06)',
  // v1 화면(설정)이 쓰던 이름. 설정 화면이 새 토큰으로 옮겨지면 지움
  card: '#FFFFFF', sub: '#4E5968', primary: '#3182F6', primarySoft: '#E8F3FF', danger: '#D22030', ok: '#1E7B3A',
};

export const S = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const;
export const R = { s: 8, m: 12, l: 14, xl: 16, xxl: 20, full: 999 } as const;
export const HIT = 44;

export const T = {
  h1: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.5, color: C.text },
  h2: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.4, color: C.text },
  title: { fontSize: 17, fontWeight: '600' as const, color: C.text },
  body: { fontSize: 16, lineHeight: 24, color: C.text },
  body2: { fontSize: 15, lineHeight: 22, color: C.grey700 },
  label: { fontSize: 15, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '500' as const, color: C.grey600 },
};

/** PC(넓은 화면)에서도 모바일 한 단 폭으로 가운데 정렬 */
export const MAX_W = 640;
