/* 分享：原生用系统分享（文字）/ react-native-view-shot + expo-sharing（图片） */
import { Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

export async function shareText(text: string): Promise<'shared' | 'copied' | 'cancel'> {
  const r = await Share.share({ message: text });
  return r.action === Share.dismissedAction ? 'cancel' : 'shared';
}
export async function shareImage(node: unknown, name: string): Promise<'shared' | 'saved' | 'cancel'> {
  const uri = await captureRef(node as never, { format: 'png', quality: 1, result: 'tmpfile' });
  if (!(await Sharing.isAvailableAsync())) return 'cancel';
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: name, UTI: 'public.png' });
  return 'shared';
}
