# 原生团团动画 / 夜间星星：验证记录（2026-11-01）

1. `npx expo export --platform ios --platform android --output-dir /tmp/native-export`：两端 Hermes 字节码均编译成功
   （ios entry .hbc 3.0MB / android entry .hbc 3.4MB），字节码里能找到 `__yjMascot`、`reduceMotionChanged`、`night-stars`，
   说明 src/lib/mascot.tsx 与夜间星星都打进了原生包。
2. 同一份原生实现可在浏览器里用 `?mascot=native` 运行。`tools/mascot_check.py` 把 Web CSS 版与原生 Animated 版
   停在 11 个相同关键帧（眨眼 92.5/94%、闹钟 65/70%、豆芽 0/100%、呼吸 100%、泡泡 50/92%、zz 30/65%），
   在首页（预测卡团团：豆芽+闹钟）与「记一次睡觉」面板（睡觉团团：泡泡+zz）两个场景对比：
   变换矩阵（角度 / 缩放 / 透明度）误差 0.00000；截图像素差最多约 0.3%（旋转图层抗锯齿）。对比图在 shots/m1/anim/。
   减少动态效果模式下两种实现逐像素一致（差异 0 像素）。
3. 实机（iOS / Android 设备或模拟器）还没跑过：这台机器没有模拟器。
