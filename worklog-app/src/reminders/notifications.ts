/**
 * 기기 로컬 알림 (expo-notifications). 서버·푸시 토큰 없이 기기 안에서만 예약합니다.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Task } from '../types';
import { ID_PREFIX, planReminders, SNOOZE_MINUTES, type DesiredReminder, type ScheduledInfo } from './logic';

export const CHANNEL_ID = 'task-reminders';
export const CATEGORY_ID = 'task-reminder';
export const ACTION_DONE = 'done';
export const ACTION_SNOOZE = 'snooze';

export interface ReminderData {
  kind: 'task-reminder';
  taskId: string;
  date: string;
  remindAt: string;
  title: string;
}

let configured: Promise<void> | null = null;

/** 앱 시작 시 한 번: 앱이 켜져 있을 때도 배너 표시, 안드로이드 채널, 알림 버튼(완료·10분 뒤) */
export function configureNotifications(): Promise<void> {
  if (configured) return configured;
  configured = (async () => {
    if (Platform.OS === 'web') return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: '업무 알림',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
      { identifier: ACTION_DONE, buttonTitle: '완료', options: { opensAppToForeground: true } },
      { identifier: ACTION_SNOOZE, buttonTitle: `${SNOOZE_MINUTES}분 뒤 다시`, options: { opensAppToForeground: true } },
    ]);
  })().catch(() => {});
  return configured;
}

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function getPermission(): Promise<PermissionState> {
  if (Platform.OS === 'web') return 'unsupported';
  const p = await Notifications.getPermissionsAsync();
  if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

/** 처음 알림을 켤 때만 묻습니다(앱 시작 때 묻지 않음) */
export async function ensurePermission(): Promise<PermissionState> {
  const now = await getPermission();
  if (now !== 'undetermined') return now;
  const r = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return r.granted ? 'granted' : r.canAskAgain ? 'undetermined' : 'denied';
}

function isOurs(data: unknown): data is ReminderData {
  return !!data && typeof data === 'object' && (data as ReminderData).kind === 'task-reminder';
}

async function readScheduled(): Promise<ScheduledInfo[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all
    .filter((n) => n.identifier.startsWith(ID_PREFIX) && isOurs(n.content.data))
    .map((n) => {
      const d = n.content.data as unknown as ReminderData;
      return { identifier: n.identifier, taskId: d.taskId, remindAt: d.remindAt, title: d.title };
    });
}

async function schedule(r: DesiredReminder): Promise<void> {
  const data: ReminderData = { kind: 'task-reminder', taskId: r.taskId, date: r.date, remindAt: r.remindAt, title: r.title };
  await Notifications.scheduleNotificationAsync({
    identifier: r.identifier,
    content: {
      title: '할 일 알림',
      body: r.title,
      sound: true,
      categoryIdentifier: CATEGORY_ID,
      data: data as unknown as Record<string, unknown>,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(r.remindAt),
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
  });
}

let running: Promise<void> = Promise.resolve();

/** 업무 목록에 맞춰 기기 예약을 맞춤. 바뀐 것만 취소·예약. 겹쳐 불려도 순서대로 */
export function syncReminders(tasks: Task[]): Promise<void> {
  running = running.then(async () => {
    if (Platform.OS === 'web') return;
    if ((await getPermission()) !== 'granted') return;
    await configureNotifications();
    const plan = planReminders(tasks, await readScheduled());
    for (const id of plan.toCancel) await Notifications.cancelScheduledNotificationAsync(id);
    for (const r of plan.toSchedule) await schedule(r);
  }).catch(() => {});
  return running;
}

export interface ReminderResponse {
  taskId: string;
  date: string;
  action: 'open' | typeof ACTION_DONE | typeof ACTION_SNOOZE;
}

function toResponse(res: Notifications.NotificationResponse): ReminderResponse | null {
  const data = res.notification.request.content.data;
  if (!isOurs(data)) return null;
  const a = res.actionIdentifier;
  const action = a === ACTION_DONE ? ACTION_DONE : a === ACTION_SNOOZE ? ACTION_SNOOZE : 'open';
  return { taskId: data.taskId, date: data.date, action };
}

const subs = new Set<(r: ReminderResponse) => void>();
let attached = false;
/** 꺼진 앱이 알림으로 켜진 경우의 응답. 구독자마다 한 번씩 전달 */
let initial: ReminderResponse | null = null;
const seen = new Set<string>();

function attach() {
  if (attached) return;
  attached = true;
  const last = Notifications.getLastNotificationResponse();
  if (last) {
    seen.add(keyOf(last));
    initial = toResponse(last);
    Notifications.clearLastNotificationResponse();
  }
  Notifications.addNotificationResponseReceivedListener((res) => {
    const k = keyOf(res);
    if (seen.has(k)) return;
    seen.add(k);
    const r = toResponse(res);
    if (r) for (const s of subs) s(r);
  });
}

function keyOf(res: Notifications.NotificationResponse): string {
  return `${res.notification.request.identifier}|${res.notification.date}|${res.actionIdentifier}`;
}

/** 알림을 누르거나 버튼(완료·10분 뒤)을 눌렀을 때. 여러 곳에서 구독해도 각자 한 번씩 받음 */
export function listenReminderResponses(cb: (r: ReminderResponse) => void): () => void {
  if (Platform.OS === 'web') return () => {};
  attach();
  subs.add(cb);
  if (initial) {
    const r = initial;
    setTimeout(() => subs.has(cb) && cb(r), 0);
  }
  return () => {
    subs.delete(cb);
  };
}
