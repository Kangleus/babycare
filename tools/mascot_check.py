"""对比团团动画：Web 原 CSS 实现 vs 原生 Animated 实现（在浏览器里用 ?mascot=native 跑同一份 RN 代码）。
两边都停在同一关键帧进度，截图做像素差。"""
import asyncio, datetime, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageChops
O='/workspace/yijuji-app/shots/m1/anim/'
import os; os.makedirs(O,exist_ok=True)
DUR={'breath':2.6,'blink':4.2,'ring':1.6,'bubble':2.4,'zz':2.6,'sway':3.0}
CLS={'breath':'.t-body','blink':'.t-eye','ring':'.t-ring','bubble':'.t-bubble','zz':'.t-z','sway':'.t-sprout'}
def css(name,t):
  rules=[]
  for n,c in CLS.items():
    tt=t if n==name else 0
    rules.append(f"{c}{{animation-play-state:paused!important;animation-delay:{-tt*DUR[n]}s!important}}")
  zb=((t if name=='zz' else 0)+0.5)%1
  rules.append(f".t-z.b{{animation-delay:{-zb*2.6}s!important}}")
  # Web 上内联 <svg> 有 3px 基线空隙（原生没有），对比时两边统一成 block，只比较动画本身
  rules.append('svg[viewBox="-6 -8 132 132"]{display:block}')
  return '\n'.join(rules)
CASES=[('blink',0.94),('blink',0.925),('ring',0.7),('ring',0.65),('sway',0.0),('sway',1.0),('breath',1.0),('bubble',0.5),('bubble',0.92),('zz',0.3),('zz',0.65)]
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2)
    r=await ctx.new_page(); T=r.get_by_test_id; errs=[]
    await r.clock.set_system_time(datetime.datetime(2026,10,31,10,20,0))
    await r.goto('http://localhost:8090/'); await r.wait_for_timeout(2500)
    await T('ob-agree').click(); await T('ob-continue').click(); await r.wait_for_timeout(500); await T('pf-submit').click(); await r.wait_for_timeout(2500)
    n=await ctx.new_page(); n.on('pageerror',lambda e:errs.append(str(e))); n.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    await n.clock.set_system_time(datetime.datetime(2026,10,31,10,20,0))
    await n.goto('http://localhost:8090/?mascot=native'); await n.wait_for_timeout(3000)
    worst=0; rows=[]; matrix_err=[0]
    for scene in ['home','sleep']:
      if scene=='sleep':
        for pg in (r,n): await pg.get_by_test_id('plus-sleep').click(); await pg.wait_for_timeout(1200)
      clip={'x':0,'y':60,'width':390,'height':460} if scene=='home' else {'x':0,'y':200,'width':390,'height':200}
      for name,t in CASES:
        # 用 Web Animations API 把每个 CSS 动画暂停并精确设到进度 t（.t-z.b 自带 1.3s 延迟）
        await r.bring_to_front()
        h=await r.add_style_tag(content='svg[viewBox="-6 -8 132 132"]{display:block}')
        await n.evaluate(f"window.__yjMascot('{name}',{t})")
        await r.wait_for_timeout(250); await n.wait_for_timeout(250)
        fa=O+f'{scene}-{name}-{t}-css.png'; fb=O+f'{scene}-{name}-{t}-native.png'
        await r.bring_to_front(); await r.wait_for_timeout(150)
        await r.evaluate('''([name,t])=>{const M={'yj-breath':['breath',2600],'yj-blink':['blink',4200],'yj-ring':['ring',1600],'yj-bubble':['bubble',2400],'yj-zz':['zz',2600],'yj-sway':['sway',3000]};
          document.getAnimations().forEach(a=>{const m=M[a.animationName];if(!m)return;a.pause();const p=m[0]===name?t:0;
            const isB=a.effect&&a.effect.target&&a.effect.target.classList&&a.effect.target.classList.contains('b');
            a.currentTime=isB?1300+((p+0.5)%1)*m[1]:p*m[1];});}''',[name,t])
        await r.wait_for_timeout(60); await r.screenshot(path=fa,clip=clip)
        await n.bring_to_front(); await n.wait_for_timeout(150); await n.screenshot(path=fb,clip=clip)
        # 数值核对：两边的变换矩阵（角度 / 缩放）一致
        cssv=await r.evaluate('''()=>{const g=(sel)=>{const e=document.querySelector(sel);if(!e)return null;const m=new DOMMatrix(getComputedStyle(e).transform);return [Math.atan2(m.b,m.a)*180/Math.PI,m.a/Math.cos(Math.atan2(m.b,m.a)),m.d/Math.cos(Math.atan2(m.b,m.a)),getComputedStyle(e).opacity*1]};
          return {ring:g('.t-ring'),sprout:g('.t-sprout'),body:g('.t-body'),eye:g('.t-eye'),bubble:g('.t-bubble')}}''')
        natv=await n.evaluate('''()=>{const L=(k)=>{const s=[...document.querySelectorAll('svg')].find(s=>s.innerHTML.includes('class="'+k+'"'));if(!s)return null;const e=s.parentElement;const m=new DOMMatrix(getComputedStyle(e).transform);return [Math.atan2(m.b,m.a)*180/Math.PI,m.a/Math.cos(Math.atan2(m.b,m.a)),m.d/Math.cos(Math.atan2(m.b,m.a)),getComputedStyle(e).opacity*1]};
          const b=[...document.querySelectorAll('svg')].find(s=>s.innerHTML.includes('t-ring'));let body=null;if(b){const m=new DOMMatrix(getComputedStyle(b.parentElement.parentElement).transform);body=[0,m.a,m.d,1]}
          return {ring:L('t-ring'),sprout:L('t-sprout'),body,eye:L('t-eye'),bubble:L('t-bubble')}}''')
        for key in cssv:
          a,bv=cssv[key],natv.get(key)
          if a and bv and scene=='home' and key!='bubble' and key!='body' or (a and bv and key=='bubble' and scene=='sleep'):
            err=max(abs(x-y) for x,y in zip(a,bv)); matrix_err[0]=max(matrix_err[0],err)
            if err>0.01: print('  MISMATCH',scene,name,t,key,a,bv)
        await h.evaluate('e=>e.remove()')
        A=Image.open(fa).convert('RGB');B=Image.open(fb).convert('RGB')
        d=ImageChops.difference(A,B).convert('L'); px=sum(1 for v in d.get_flattened_data() if v>48); pct=px/(A.width*A.height)*100
        worst=max(worst,pct); rows.append((scene,name,t,pct))
        c=Image.new('RGB',(A.width*2+10,A.height),'white');c.paste(A,(0,0));c.paste(B,(A.width+10,0));c.save(O+f'{scene}-{name}-{t}-cmp.png')
        ImageChops.difference(A,B).point(lambda v:255 if v>48 else 0).save(O+f'{scene}-{name}-{t}-diff.png')
        os.remove(fa); os.remove(fb)
    for row in rows: print('%-5s %-6s t=%-5s diff %.3f%%'%row)
    # 非静止：原生实现确实在动（同一位置连续两帧不同）
    await n.reload(); await n.wait_for_timeout(2500)
    s1=await n.screenshot(clip={'x':200,'y':300,'width':190,'height':220}); await n.wait_for_timeout(700); s2=await n.screenshot(clip={'x':200,'y':300,'width':190,'height':220})
    moving=s1!=s2
    print('native mascot animating:',moving,'errors:',errs,'worst pixel diff %.3f%%'%worst,'max transform error %.5f'%matrix_err[0])
    await b.close()
    sys.exit(0 if moving and not errs and worst<1.0 and matrix_err[0]<0.01 else 1)
asyncio.run(main())
