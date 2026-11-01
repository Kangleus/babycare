/* Supabase 客户端：只用「publishable key」（可以放在客户端，权限全靠 RLS）；绝不放 service key。
   会话存在 AsyncStorage（Web = localStorage），App 回到前台时自动续期。 */
import './polyfill';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { CLOUD } from './cloud-config';

export const SUPABASE_URL = CLOUD.url;
const KEY = CLOUD.publishableKey;
export const cloudConfigured = !!(SUPABASE_URL && KEY);

export const supabase = createClient(SUPABASE_URL || 'https://invalid.local', KEY || 'missing', {
  auth: { storage: AsyncStorage, storageKey: 'yj-auth', autoRefreshToken: true, persistSession: true, detectSessionInUrl: Platform.OS === 'web' },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', s => { if (s === 'active') supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh(); });
}
