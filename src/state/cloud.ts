/* 订阅云端同步状态（登录、家庭、同步中 / 已同步 / 离线、待上传条数） */
import { useSyncExternalStore } from 'react';
import { cloud, CloudState } from '@/data/sync';

const sub = (f: () => void) => cloud.on(e => { if (e === 'state') f(); });
const snap = () => cloud.state;
export function useCloud(): CloudState { return useSyncExternalStore(sub, snap, snap); }
export { cloud };
