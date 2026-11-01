/* Web 没有可靠的后台本地通知：页面开着时由 App 内团团横幅提醒（见 RingWatcher） */
import type { Reminder } from '@/data/types';
export async function scheduleAll(_rs: Reminder[], _babyName: string, _now: Date) { /* no-op */ }
export function listen(_onTap: (rid: string) => void, _onRecv: (rid: string) => void) { return () => {}; }
