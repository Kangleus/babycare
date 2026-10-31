import { Platform } from 'react-native';

/* 原型 index.html「mascot animation」段原样搬运（去掉 .tuan 前缀，SvgXml 不保留根 svg 的 class）。
   仅 Web；原生端团子动画在后续里程碑用 Reanimated 实现。 */
const CSS = `
.t-body{transform-origin:60px 108px;animation:yj-breath 2.6s ease-in-out infinite alternate}
@keyframes yj-breath{0%{transform:scale(1,1)}100%{transform:scale(1.025,.965)}}
.t-eye{transform-box:fill-box;transform-origin:center;animation:yj-blink 4.2s infinite}
@keyframes yj-blink{0%,91%,100%{transform:scaleY(1)}94%{transform:scaleY(.08)}}
.t-ring{transform-box:fill-box;transform-origin:50% 90%;animation:yj-ring 1.6s ease-in-out infinite}
@keyframes yj-ring{0%,60%,100%{transform:rotate(0)}65%{transform:rotate(-12deg)}70%{transform:rotate(12deg)}75%{transform:rotate(-10deg)}80%{transform:rotate(9deg)}85%{transform:rotate(-4deg)}}
.t-bubble{transform-box:fill-box;transform-origin:0% 50%;animation:yj-bubble 2.4s ease-in-out infinite}
@keyframes yj-bubble{0%{transform:scale(.3)}70%{transform:scale(1)}85%{transform:scale(1.08);opacity:1}100%{transform:scale(1.1);opacity:0}}
.t-z{animation:yj-zz 2.6s ease-in-out infinite;opacity:0}
.t-z.b{animation-delay:1.3s}
@keyframes yj-zz{0%{opacity:0;transform:translate(0,6px)}30%{opacity:1}100%{opacity:0;transform:translate(8px,-14px)}}
.t-sprout{transform-box:fill-box;transform-origin:50% 100%;animation:yj-sway 3s ease-in-out infinite alternate}
@keyframes yj-sway{0%{transform:rotate(-6deg)}100%{transform:rotate(6deg)}}
`;

export function injectMascotCss() {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || document.getElementById('yj-mascot')) return;
  const el = document.createElement('style');
  el.id = 'yj-mascot';
  el.textContent = CSS;
  document.head.appendChild(el);
}
