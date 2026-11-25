import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { toDayKey } from './dates';

/** 오늘 날짜 키. 자정을 넘기거나 앱으로 돌아오면 다시 계산 */
export function useToday(): string {
  const [today, setToday] = useState(() => toDayKey(new Date()));
  useEffect(() => {
    const check = () => setToday(toDayKey(new Date()));
    const t = setInterval(check, 60_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => { clearInterval(t); sub.remove(); };
  }, []);
  return today;
}
