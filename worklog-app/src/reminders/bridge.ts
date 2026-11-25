/**
 * 본체 앱과 알림·위젯을 잇는 곳. App.tsx 에서:
 *
 *   useEffect(() => startReminderBridge(), []);
 *   useEffect(() => subscribeOpenRequests((r) => { 날짜를 r.date 로, 일간 탭으로 }), []);
 *
 * - taskStore 변경을 듣고 기기 알림 예약·위젯 데이터를 맞춤
 * - 업무를 미루면 알림 시각도 같은 간격으로 따라감
 * - 알림의 '완료'·'10분 뒤 다시' 버튼 처리
 * - 앱이 다시 앞으로 오면(날짜가 바뀌었을 수 있으니) 위젯 갱신
 */
import { AppState, Linking, Platform } from 'react-native';
import { taskStore } from '../data/taskStore';
import type { Task } from '../types';
import { updateWidget } from '../widget';
import { shiftRemindAt, SNOOZE_MINUTES } from './logic';
import { parseOpenUrl, type OpenRequest } from './links';
import { ACTION_DONE, ACTION_SNOOZE, configureNotifications, listenReminderResponses, syncReminders } from './notifications';

const DEBOUNCE_MS = 300;

export function startReminderBridge(): () => void {
  if (Platform.OS === 'web') return () => {};
  configureNotifications();

  let prev = new Map<string, Pick<Task, 'date' | 'remindAt'>>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: Task[] = taskStore.getTasks();

  const flush = () => {
    timer = null;
    syncReminders(latest);
    updateWidget(latest);
  };

  const onChange = (tasks: Task[]) => {
    latest = tasks;
    // 미룬 업무의 알림 따라 옮기기
    const next = new Map<string, Pick<Task, 'date' | 'remindAt'>>();
    for (const t of tasks) {
      next.set(t.id, { date: t.date, remindAt: t.remindAt });
      const p = prev.get(t.id);
      if (!p || t.done) continue;
      const moved = shiftRemindAt(p, t);
      if (moved && Date.parse(moved) > Date.now()) {
        next.set(t.id, { date: t.date, remindAt: moved });
        taskStore.update(t.id, { remindAt: moved });
      }
    }
    prev = next;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  };

  const unsub = taskStore.subscribe(onChange);
  taskStore.ready().then(() => {
    const now = taskStore.getTasks();
    prev = new Map(now.map((t) => [t.id, { date: t.date, remindAt: t.remindAt }]));
    latest = now;
    flush();
  });

  const unsubActions = listenReminderResponses(async (r) => {
    await taskStore.ready();
    if (r.action === ACTION_DONE) {
      const t = taskStore.getTasks().find((x) => x.id === r.taskId);
      if (t && !t.done) await taskStore.toggleDone(t.id);
    } else if (r.action === ACTION_SNOOZE) {
      const at = new Date(Date.now() + SNOOZE_MINUTES * 60000);
      at.setSeconds(0, 0);
      await taskStore.update(r.taskId, { remindAt: at.toISOString() });
    }
  });

  const appState = AppState.addEventListener('change', (s) => {
    if (s === 'active') updateWidget(taskStore.getTasks());
  });

  return () => {
    unsub();
    unsubActions();
    appState.remove();
    if (timer) clearTimeout(timer);
  };
}

/**
 * 위젯 탭(worklog://…) · 알림 탭으로 앱이 열릴 때 어느 날을 보여 줄지 알려 줌.
 * 앱이 꺼져 있다 열린 경우도 처음 한 번 전달합니다.
 */
export function subscribeOpenRequests(cb: (r: OpenRequest) => void): () => void {
  const onUrl = ({ url }: { url: string }) => {
    const r = parseOpenUrl(url);
    if (r) cb(r);
  };
  Linking.getInitialURL().then((u) => {
    const r = parseOpenUrl(u);
    if (r) cb(r);
  }).catch(() => {});
  const sub = Linking.addEventListener('url', onUrl);
  const unsubNoti = listenReminderResponses((r) => {
    cb({ date: r.date, taskId: r.taskId, source: 'notification' });
  });
  return () => {
    sub.remove();
    unsubNoti();
  };
}

export type { OpenRequest };
