/* Web：文字走 navigator.share，不支持就复制到剪贴板；图片用 html-to-image 把便签渲染成 PNG 下载 */
import { toPng } from 'html-to-image';

export async function shareText(text: string): Promise<'shared' | 'copied' | 'cancel'> {
  const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
  if (nav.share) { try { await nav.share({ text }); return 'shared'; } catch { return 'cancel'; } }
  await nav.clipboard.writeText(text); return 'copied';
}
export async function shareImage(node: unknown, name: string): Promise<'shared' | 'saved' | 'cancel'> {
  const url = await toPng(node as HTMLElement, { pixelRatio: 2, cacheBust: true });
  const a = document.createElement('a'); a.href = url; a.download = `${name}.png`; document.body.appendChild(a); a.click(); a.remove();
  return 'saved';
}
