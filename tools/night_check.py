"""夜间首页 vs 原型夜间首页：并排截图 + 星星位置 / 尺寸 / 闪烁数值核对。"""
import asyncio, datetime, sys, statistics
from playwright.async_api import async_playwright
from PIL import Image, ImageChops
import paths
import e2e_common as common
O = paths.sub('m2')
BASE = paths.BASE_URL
PROTO = paths.require_proto()
FZ='*,*:before,*:after{animation:none!important;transition:none!important}'
STARS="()=>[...document.querySelectorAll(SEL)].map(e=>{const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2,b.width,+getComputedStyle(e).opacity]})"
async def onboard(r):
  T=r.get_by_test_id
  await common.login(r, BASE)
async def main():
  ok=True
  async with async_playwright() as pw:
    b=await pw.chromium.launch(executable_path=paths.CHROME,args=['--no-sandbox'])
    # 1) 静态对比：两边星星都停在 opacity .55（RN 用系统「减少动态效果」，原型用注入样式）
    ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,reduced_motion='reduce')
    await common.install_routes(ctx); await common.seed_context(ctx)
    r=await ctx.new_page(); errs=[]; r.on('pageerror',lambda e:errs.append(str(e)))
    await r.clock.set_system_time(datetime.datetime(2026,10,31,10,20,0)); await onboard(r)
    await r.get_by_label('夜间模式').first.click(); await r.wait_for_timeout(3500)
    a=await ctx.new_page(); await a.goto(PROTO); await a.wait_for_function('window.__ready'); await a.wait_for_timeout(800)
    await a.evaluate('toggleNight()'); await a.wait_for_timeout(3500)
    await a.add_style_tag(content=FZ+'.night-stars{opacity:1!important}.night-stars i{opacity:.55!important}'); await r.add_style_tag(content=FZ)
    await a.wait_for_timeout(300); await r.wait_for_timeout(300)
    await a.screenshot(path=O+'proto-night-home.png'); await r.screenshot(path=O+'rn-night-home.png')
    A=Image.open(O+'proto-night-home.png').convert('RGB');B=Image.open(O+'rn-night-home.png').convert('RGB')
    c=Image.new('RGB',(A.width*2+20,A.height),'white');c.paste(A,(0,0));c.paste(B,(A.width+20,0));c.save(O+'compare-night-home.png')
    d=ImageChops.difference(A,B).convert('L'); px=sum(1 for v in d.get_flattened_data() if v>40); pct=px/(A.width*A.height)*100
    if paths.visual_report('compare-night-home.png',pct): ok=False
    ps=await a.evaluate(STARS.replace('SEL',"'.night-stars i'")); rs=await r.evaluate(STARS.replace('SEL',"'[data-testid=night-stars] > div'"))
    print('stars proto',len(ps),'rn',len(rs))
    perr=max(max(abs(p[0]-q[0]),abs(p[1]-q[1]),abs(p[2]-q[2])) for p,q in zip(ps,rs)) if len(ps)==len(rs)==22 else 99
    print('max star position/size error (css px): %.3f'%perr); ok&= len(rs)==22 and perr<0.5
    # 2) 动画：正常动态下 RN 星星在 .2–.9 之间往返，周期 3s（两段 alternate）
    ctx2=await b.new_context(viewport={'width':390,'height':844})
    await common.install_routes(ctx2); await common.seed_context(ctx2)
    n=await ctx2.new_page(); n.on('pageerror',lambda e:errs.append(str(e))); await onboard(n)
    await n.get_by_label('夜间模式').first.click(); await n.wait_for_timeout(3200)
    samples=[]
    for i in range(32):
      samples.append([s[3] for s in await n.evaluate(STARS.replace('SEL',"'[data-testid=night-stars] > div'"))]); await n.wait_for_timeout(200)
    s0=[x[0] for x in samples]; print('star0 opacity over 6.4s: min %.2f max %.2f'%(min(s0),max(s0)))
    lo=min(min(x) for x in samples); hi=max(max(x) for x in samples); print('all stars opacity range %.2f–%.2f'%(lo,hi))
    phases=len({round(samples[10][i],2) for i in range(22)}); print('distinct opacities at one instant (5 delay groups):',phases)
    ok&= lo>=0.19 and hi<=0.91 and max(s0)-min(s0)>0.5 and phases>=4
    # 3) 关掉夜间：星星淡出后移除
    await n.get_by_label('夜间模式').first.click(); await n.wait_for_timeout(1200)
    gone=await n.evaluate("document.querySelectorAll('[data-testid=night-stars]').length"); print('stars removed after day mode:',gone==0); ok&=gone==0
    print('errors',errs); ok&=not errs
    await b.close()
  print('NIGHT CHECK', 'PASS' if ok else 'FAIL'); sys.exit(0 if ok else 1)
asyncio.run(main())
