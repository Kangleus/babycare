import { LVACC } from '@/data/mock';
import { useApp } from './app-state';
/** 团团当前等级的配件（夜间戴睡帽）—— 原型 lvAcc() */
export function useLvAcc() { const { night, lvl } = useApp(); return night ? ['cap'] : LVACC[lvl]; }
