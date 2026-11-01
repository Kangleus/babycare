/* 原生：提醒到点的本地通知（expo-notifications）。只给「已确认」的提醒排程，时间完全来自家长设置 */
import * as Notifications from 'expo-notifications';
import type { Reminder } from '@/data/types';
import { RCAT } from './health';

let asked = false;
Notifications.setNotificationHandler({
  /* 前台时不弹系统横幅，由 App 内团团横幅接手 */
  handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

async function allowed() {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (asked) return false;
  asked = true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function scheduleAll(rs: Reminder[], babyName: string, now: Date) {
  const want = rs.filter(r => r.confirmed && (r.repeat !== 'none' || (!r.doneAt && Date.parse(r.dueAt) > +now)));
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!want.length || !(await allowed())) return;
  for (const r of want.slice(0, 60)) {
    const at = new Date(r.dueAt);
    const content = { title: `到点啦 · ${RCAT[r.cat].n}提醒`, body: `${r.title}${r.cat === 'med' ? ' · 按医嘱' : ''} · ${babyName}`, data: { rid: r.id } };
    const trigger: Notifications.NotificationTriggerInput =
      r.repeat === 'daily' ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: at.getHours(), minute: at.getMinutes() }
      : r.repeat === 'weekly' ? { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: at.getDay() + 1, hour: at.getHours(), minute: at.getMinutes() }
      : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at };
    try { await Notifications.scheduleNotificationAsync({ identifier: r.id, content, trigger }); } catch { /* 单条失败不影响其他 */ }
  }
}
/** 点通知 / 前台收到通知 → 回调提醒 id */
export function listen(onTap: (rid: string) => void, onRecv: (rid: string) => void) {
  const a = Notifications.addNotificationResponseReceivedListener(r => { const id = r.notification.request.content.data?.rid; if (typeof id === 'string') onTap(id); });
  const b = Notifications.addNotificationReceivedListener(n => { const id = n.request.content.data?.rid; if (typeof id === 'string') onRecv(id); });
  return () => { a.remove(); b.remove(); };
}
