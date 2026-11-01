/* 设计令牌：与原型 style.css 的 :root / body.night 一一对应 */
export type Palette = {
  bg: string; bg2: string; card: string; ink: string; sub: string; line: string; shadow: string;
  yellow: string; pink: string; green: string; blue: string; orange: string;
  yellowS: string; pinkS: string; greenS: string; blueS: string; orangeS: string;
  lilac: string; lilacS: string; aqua: string; aquaS: string; lime: string; limeS: string;
  caramel: string; caramelS: string; coral: string; coralS: string; peri: string; periS: string;
};

export const light: Palette = {
  bg: '#FFF9EC', bg2: '#FFF3DA', card: '#FFFFFF', ink: '#4A3A2C', sub: '#8C7A66', line: '#F0E2C8', shadow: '#4A3A2C',
  yellow: '#FFD45C', pink: '#FF9EB1', green: '#8FD9A8', blue: '#8CCBFF', orange: '#FFB677',
  yellowS: '#FFF1C2', pinkS: '#FFE3E9', greenS: '#DDF5E5', blueS: '#DCEFFF', orangeS: '#FFE8D3',
  lilac: '#B8A6F2', lilacS: '#EDE7FF', aqua: '#7ED6CF', aquaS: '#DDF6F3', lime: '#C6E36E', limeS: '#F0F8D5',
  caramel: '#E2B07E', caramelS: '#F8EBDD', coral: '#FF907C', coralS: '#FFE3DC', peri: '#A9C4FF', periS: '#E7EEFF',
};

export const night: Palette = {
  bg: '#231B15', bg2: '#2C221A', card: '#33281F', ink: '#F4E6CF', sub: '#B39F86', line: '#46382B', shadow: '#120D09',
  yellow: '#E9B949', pink: '#E58C9C', green: '#7CBF94', blue: '#7BAEDB', orange: '#E39E62',
  yellowS: '#4A3B1F', pinkS: '#4A2D31', greenS: '#2C4031', blueS: '#283A4C', orangeS: '#4A3322',
  lilac: '#9585CC', lilacS: '#342C47', aqua: '#66B3AD', aquaS: '#22393A', lime: '#A3BC5A', limeS: '#333B20',
  caramel: '#BF9064', caramelS: '#43352A', coral: '#D9796A', coralS: '#4A2C27', peri: '#8399CB', periS: '#2B3247',
};

/* 记录类型 → 卡片主色 / 浅底色（原型 body{--feed:var(--yellow)…}） */
export type Kind = 'feed' | 'sleep' | 'diaper' | 'pee' | 'poop' | 'water' | 'med' | 'temp' | 'symptom' | 'growth' | 'bath';
export const KIND_KEYS: Record<Kind, [keyof Palette, keyof Palette]> = {
  feed: ['yellow', 'yellowS'], sleep: ['blue', 'blueS'], diaper: ['green', 'greenS'],
  pee: ['lime', 'limeS'], poop: ['caramel', 'caramelS'], water: ['aqua', 'aquaS'],
  med: ['lilac', 'lilacS'], temp: ['pink', 'pinkS'], symptom: ['coral', 'coralS'],
  growth: ['orange', 'orangeS'], bath: ['peri', 'periS'],
};
export const kindColor = (p: Palette, k: Kind) => ({ k: p[KIND_KEYS[k][0]], ks: p[KIND_KEYS[k][1]] });

/* 字体：标题 ZCOOL 快乐体（--fh），正文与数字 Nunito（--fb / --fn） */
export const F = {
  h: 'ZCOOLKuaiLe_400Regular',
  b7: 'Nunito_700Bold',
  b8: 'Nunito_800ExtraBold',
  b9: 'Nunito_900Black',
};

/* 原型的硬阴影：box-shadow: 0 Npx 0 var(--shadow) */
export const hard = (p: Palette, y: number) => ({ boxShadow: `0px ${y}px 0px ${p.shadow}` });
