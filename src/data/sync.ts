/* =========================================================
   云端同步引擎（Supabase）
   - 离线优先：所有写入先落本地（LocalRepo），再把「要同步的东西」排进 outbox（AsyncStorage 持久化），
     有网就按顺序推送；推送失败（没网）就保留，15 秒后 / 回到前台 / 重新联网时重试。
   - 拉取：按 updated_at 增量拉本宝宝的记录（带 5 秒重叠窗口），outbox 里还没推上去的记录以本地为准，
     其余以服务器为准（服务器上按写入先后「后写覆盖」）。删除 = 软删除（deleted_at），方便其他设备同步掉。
   - Realtime：订阅 records 表 baby_id=当前宝宝 的变化，家人新记一条几秒内出现。
   - 首次登录：如果已有家庭就自动连上；没有就让用户「创建我们家」或「输入邀请码加入」。
     连上时把本机已有的真实记录（演示数据 demo-* 不传）上传到这个家庭，按 id 去重。
   ========================================================= */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { cloudConfigured, supabase } from './supabase';
import type { LocalRepo } from './local-repo';
import type { Baby, BabyRecord, Member, RecordType } from './types';
import type { Kind } from '@/theme/tokens';

export type CloudLink = { userId: string; familyId: string; familyName: string; babyId: string; displayName: string; role: 'admin' | 'member'; lastPull: string | null };
export type CloudStatus = 'off' | 'signedOut' | 'noFamily' | 'syncing' | 'synced' | 'offline';
export type CloudState = { status: CloudStatus; email: string | null; userId: string | null; link: CloudLink | null; pending: number; lastError: string | null };
type Op = { k: 'rec'; id: string } | { k: 'baby' } | { k: 'cards' };
type Row = { id: string; baby_id: string; family_id: string; type: RecordType; started_at: string; ended_at: string | null; vals: BabyRecord['values']; note: string | null; created_by_name: string; src: 'voice' | 'manual'; created_at: string; updated_at: string; deleted_at: string | null };
type BabyRow = { id: string; family_id: string; name: string; birthday: string; gender: Baby['gender']; avatar: Baby['avatar']; feeding: Baby['feeding'] };

const KL = 'yj:v1:cloud', KO = 'yj:v1:outbox';
export const isDemo = (id: string) => id.startsWith('demo-');
export const RELATIONS = ['妈妈', '爸爸', '奶奶', '爷爷', '外婆', '外公'] as const;

const toRow = (r: BabyRecord, familyId: string) => ({
  id: r.id, baby_id: r.babyId, family_id: familyId, type: r.type, started_at: r.time, ended_at: r.endTime ?? null,
  vals: r.values ?? {}, note: r.note ?? null, created_by_name: r.createdBy, src: r.src, created_at: r.createdAt, deleted_at: null,
});
const fromRow = (r: Row): BabyRecord => ({
  id: r.id, babyId: r.baby_id, type: r.type, time: r.started_at, endTime: r.type === 'sleep' ? r.ended_at : (r.ended_at ?? undefined),
  values: r.vals ?? {}, note: r.note ?? undefined, createdBy: r.created_by_name, src: r.src, createdAt: r.created_at, updatedAt: r.updated_at,
});
const fromBabyRow = (b: BabyRow): Baby => ({ id: b.id, name: b.name, birthday: b.birthday, gender: b.gender, avatar: b.avatar, feeding: b.feeding });

/** PostgREST / Postgres 返回的是「请求本身有问题」（约束、权限）→ 重试也没用，丢掉这条；其余（断网）保留重试 */
const permanent = (e: { code?: string } | null) => !!e?.code && (/^[0-9A-Z]{5}$/.test(e.code) || e.code.startsWith('PGRST'));

/** 把 Supabase Auth 的英文错误翻成人话 */
export function authErrorText(e: { message?: string; status?: number; code?: string } | null | undefined) {
  if (!e) return '';
  const m = (e.message ?? '').toLowerCase(), c = e.code ?? '';
  if (c === 'over_email_send_rate_limit' || e.status === 429 || m.includes('rate limit')) return '发送太频繁了，请过一会儿再试（免费邮件服务每小时只能发很少几封）';
  if (c === 'invalid_credentials' || m.includes('invalid login')) return '邮箱或密码不对';
  if (c === 'email_not_confirmed' || m.includes('not confirmed')) return '邮箱还没验证：请先点开验证邮件里的链接';
  if (c === 'user_already_exists' || m.includes('already registered')) return '这个邮箱已经注册过了，直接登录吧';
  if (c === 'weak_password' || m.includes('password should')) return '密码至少 6 位';
  if (c === 'email_address_invalid' || m.includes('invalid') && m.includes('email')) return '邮箱格式不对，或这个邮箱暂时不能注册';
  if (c === 'signup_disabled') return '暂未开放注册';
  if (m.includes('fetch') || m.includes('network')) return '网络不通，请检查网络后再试';
  return e.message ?? '出错了，请稍后再试';
}

class CloudSync {
  private repo: LocalRepo | null = null;
  private started = false;
  private link: CloudLink | null = null;
  private outbox: Op[] = [];
  private flushing = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private ch: RealtimeChannel | null = null;
  private ls = new Set<(e: 'state' | 'data') => void>();
  private st: CloudState = { status: cloudConfigured ? 'signedOut' : 'off', email: null, userId: null, link: null, pending: 0, lastError: null };
  private sessionUser: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  get state() { return this.st; }
  get linked() { return !!this.link; }
  on(fn: (e: 'state' | 'data') => void) { this.ls.add(fn); return () => { this.ls.delete(fn); }; }
  private emit(e: 'state' | 'data') { this.ls.forEach(f => f(e)); }
  private set(p: Partial<CloudState>) { this.st = { ...this.st, ...p, link: this.link, pending: this.outbox.length }; this.emit('state'); }
  /** 认证事件、加入家庭等改动串行执行，避免并发把状态搞乱 */
  private serial<T>(f: () => Promise<T>): Promise<T> { const r = this.queue.then(f, f); this.queue = r.catch(() => {}); return r; }

  async start(repo: LocalRepo) {
    if (this.started) return; this.started = true; this.repo = repo;
    const [l, o] = await Promise.all([AsyncStorage.getItem(KL), AsyncStorage.getItem(KO)]);
    this.link = l ? (JSON.parse(l) as CloudLink) : null; this.outbox = o ? (JSON.parse(o) as Op[]) : [];
    this.set({});
    if (!cloudConfigured) return;
    /* 回调里不能直接 await supabase 调用（会死锁），放到下一拍执行 */
    supabase.auth.onAuthStateChange((_ev, session) => { setTimeout(() => { this.serial(() => this.onSession(session)); }, 0); });
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener?.('online', () => this.kick());
    else AppState.addEventListener('change', s => { if (s === 'active') this.kick(); });
  }

  private async onSession(session: Session | null) {
    if (!session) {
      if (this.sessionUser) await this.unlinkLocal();
      this.sessionUser = null; this.set({ status: 'signedOut', email: null, userId: null }); return;
    }
    if (this.sessionUser === session.user.id) return;
    this.sessionUser = session.user.id;
    this.set({ email: session.user.email ?? null, userId: session.user.id });
    if (this.link && this.link.userId !== session.user.id) await this.unlinkLocal();
    if (this.link) { this.connect(); return; }
    await this.autoLink();
  }

  /** 登录后：已经是某个家庭的成员 → 直接连上（换手机 / 重装后登录） */
  private async autoLink() {
    const uid = this.sessionUser; if (!uid) return;
    const { data, error } = await supabase.from('family_members').select('family_id, display_name, role, families(name)').eq('user_id', uid).order('joined_at', { ascending: false }).limit(1);
    if (error) { this.set({ status: 'offline', lastError: error.message }); this.later(() => this.serial(() => this.autoLink())); return; }
    const m = data?.[0] as unknown as { family_id: string; display_name: string; role: 'admin' | 'member'; families: { name: string } | null } | undefined;
    if (!m) { this.set({ status: 'noFamily' }); return; }
    await this.linkFamily(m.family_id, m.display_name, m.role, m.families?.name ?? '我们家', true);
  }

  /** 连上某个家庭：拿家庭里的宝宝（没有就上传本机宝宝），本机真实记录挪到这个宝宝名下排队上传 */
  private async linkFamily(familyId: string, displayName: string, role: 'admin' | 'member', familyName: string, carryLocal: boolean) {
    const repo = this.repo!, uid = this.sessionUser!;
    const { data: babies, error } = await supabase.from('babies').select('id, family_id, name, birthday, gender, avatar, feeding').eq('family_id', familyId).is('deleted_at', null).order('created_at').limit(1);
    if (error) throw new Error(error.message);
    const localBaby = await repo.getBaby();
    const mine = (await repo.rawAll()).filter(r => !isDemo(r.id));
    const ops: Op[] = [];
    let babyId: string;
    const remote = (babies?.[0] ?? null) as BabyRow | null;
    if (remote) {
      babyId = remote.id; await repo.rawSaveBaby(fromBabyRow(remote));
    } else {
      if (!localBaby) throw new Error('本机还没有宝宝资料');
      babyId = localBaby.id; ops.push({ k: 'baby' }, { k: 'cards' });
    }
    const carried = carryLocal ? mine.map(r => ({ ...r, babyId })) : [];
    await repo.rawSetRecords(carried);
    ops.push(...carried.map(r => ({ k: 'rec' as const, id: r.id })));
    this.link = { userId: uid, familyId, familyName, babyId, displayName, role, lastPull: null };
    this.outbox = ops;
    await this.persist();
    this.set({ status: 'syncing', lastError: null });
    this.emit('data');
    this.connect();
  }

  private connect() {
    const link = this.link; if (!link) return;
    if (this.ch) { supabase.removeChannel(this.ch); this.ch = null; }
    this.ch = supabase.channel(`records:${link.babyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `baby_id=eq.${link.babyId}` }, p => { if (p.new && (p.new as Row).id) this.applyRows([p.new as Row]); })
      .subscribe(s => { if (s === 'SUBSCRIBED') this.pull(); });
    this.kick();
  }

  /** 推 + 拉 + 刷新成员（有网时随时可调） */
  kick() { if (!this.link) return; this.flush().then(() => this.pull()).then(() => this.refreshMembers()).catch(() => {}); }
  private later(f: () => void) { if (this.retry) clearTimeout(this.retry); this.retry = setTimeout(() => { this.retry = null; f(); }, 15000); }
  private async persist() { await AsyncStorage.multiSet([[KL, JSON.stringify(this.link)], [KO, JSON.stringify(this.outbox)]]); }

  /** SupabaseRepo 每次本地写入后调用 */
  enqueue(op: Op) {
    if (!this.link) return;
    if (op.k === 'rec' && isDemo(op.id)) return;
    const same = (o: Op) => o.k === op.k && (o.k !== 'rec' || (op.k === 'rec' && o.id === op.id));
    this.outbox = [...this.outbox.filter(o => !same(o)), op];
    this.persist(); this.set({});
    this.flush();
  }

  async flush() {
    if (!this.link || this.flushing) return; this.flushing = true;
    try {
      if (this.outbox.length) this.set({ status: 'syncing' });
      while (this.outbox.length && this.link) {
        const op = this.outbox[0];
        const err = await this.push(op);
        if (err && !permanent(err)) throw new Error(err.message);
        if (err) this.set({ lastError: `一条数据没能同步：${err.message}` });
        this.outbox = this.outbox.slice(1); await this.persist(); this.set({});
      }
      if (this.link) this.set({ status: 'synced' });
    } catch (e) {
      this.set({ status: 'offline', lastError: String((e as Error).message ?? e) });
      this.later(() => this.kick());
    } finally { this.flushing = false; }
  }

  private async push(op: Op): Promise<{ code?: string; message: string } | null> {
    const link = this.link!, repo = this.repo!;
    try {
      if (op.k === 'rec') {
        const r = (await repo.rawAll()).find(x => x.id === op.id);
        if (r && r.babyId !== link.babyId) return null;
        const { error } = r
          ? await supabase.from('records').upsert(toRow(r, link.familyId), { onConflict: 'id' })
          : await supabase.from('records').update({ deleted_at: new Date().toISOString() }).eq('id', op.id);
        return error;
      }
      if (op.k === 'baby') {
        const b = await repo.getBaby(); if (!b || b.id !== link.babyId) return null;
        const { error } = await supabase.from('babies').upsert({ id: b.id, family_id: link.familyId, name: b.name, birthday: b.birthday, gender: b.gender, avatar: b.avatar, feeding: b.feeding }, { onConflict: 'id' });
        return error;
      }
      const s = await repo.getSettings();
      const { error } = await supabase.from('card_settings').upsert({ baby_id: link.babyId, family_id: link.familyId, cards: s.cards }, { onConflict: 'baby_id' });
      return error;
    } catch (e) { return { message: String((e as Error).message ?? e) }; }
  }

  /** 把服务器上的行合并进本地；outbox 里还没推的以本地为准 */
  private async applyRows(rows: Row[]) {
    const link = this.link, repo = this.repo; if (!link || !repo || !rows.length) return;
    const pend = new Set(this.outbox.flatMap(o => (o.k === 'rec' ? [o.id] : [])));
    const list = await repo.rawAll(); let changed = false, maxU = link.lastPull;
    for (const r of rows) {
      if (!maxU || r.updated_at > maxU) maxU = r.updated_at;
      if (r.baby_id !== link.babyId || pend.has(r.id)) continue;
      const i = list.findIndex(x => x.id === r.id);
      if (r.deleted_at) { if (i >= 0) { list.splice(i, 1); changed = true; } continue; }
      const rec = fromRow(r);
      if (i < 0) list.push(rec); else list[i] = rec;
      changed = true;
    }
    if (this.link !== link) return;
    link.lastPull = maxU; await this.persist();
    if (changed) { await repo.rawSetRecords(list); this.emit('data'); }
  }

  async pull() {
    const link = this.link; if (!link) return;
    for (let page = 0; page < 50; page++) {
      let q = supabase.from('records').select('*').eq('baby_id', link.babyId).order('updated_at').limit(1000);
      if (link.lastPull) q = q.gt('updated_at', new Date(Date.parse(link.lastPull) - 5000).toISOString());
      else q = q.is('deleted_at', null);
      const { data, error } = await q;
      if (error) { this.set({ status: 'offline', lastError: error.message }); this.later(() => this.kick()); return; }
      await this.applyRows((data ?? []) as Row[]);
      if ((data ?? []).length < 1000) break;
    }
    /* 宝宝资料和首页卡片（家人改了也跟着变） */
    const [{ data: b }, { data: cs }] = await Promise.all([
      supabase.from('babies').select('id, family_id, name, birthday, gender, avatar, feeding').eq('id', link.babyId).maybeSingle(),
      supabase.from('card_settings').select('cards').eq('baby_id', link.babyId).maybeSingle(),
    ]);
    if (this.link !== link) return;
    let changed = false;
    if (b && !this.outbox.some(o => o.k === 'baby')) {
      const nb = fromBabyRow(b as BabyRow), cur = await this.repo!.getBaby();
      if (JSON.stringify(nb) !== JSON.stringify(cur)) { await this.repo!.rawSaveBaby(nb); changed = true; }
    }
    if (cs && !this.outbox.some(o => o.k === 'cards')) {
      const cur = await this.repo!.getSettings();
      if (JSON.stringify(cur.cards) !== JSON.stringify(cs.cards)) { await this.repo!.rawSaveSettings({ cards: cs.cards as Kind[] }); changed = true; }
    }
    if (changed) this.emit('data');
    if (!this.outbox.length && this.st.status !== 'synced') this.set({ status: 'synced' });
  }

  async refreshMembers() {
    const link = this.link; if (!link) return;
    const { data, error } = await supabase.from('family_members').select('user_id, display_name, role, joined_at').eq('family_id', link.familyId).order('joined_at');
    if (error || !data || this.link !== link) return;
    if (!data.some(m => m.user_id === link.userId)) { await this.unlinkLocal(); this.set({ status: 'noFamily' }); return; } // 被移出家庭
    const ms: Member[] = data.map(m => ({ id: m.user_id, name: m.display_name, role: m.role === 'admin' ? 'admin' : 'recorder', isLocal: m.user_id === link.userId }));
    const me = data.find(m => m.user_id === link.userId)!;
    link.displayName = me.display_name; link.role = me.role as 'admin' | 'member';
    await this.persist(); await this.repo!.rawSetMembers(ms);
    this.set({}); this.emit('data');
  }

  /** 退出 / 注销时：断开实时、清掉 outbox 和家庭信息；本机记录保留（未登录也能继续用） */
  private async unlinkLocal() {
    if (this.ch) { supabase.removeChannel(this.ch); this.ch = null; }
    this.link = null; this.outbox = [];
    await AsyncStorage.multiRemove([KL, KO]);
    await this.repo?.rawSetMembers(null);
    this.set({ lastError: null }); this.emit('data');
  }

  /* —— 账号与家庭（界面调用） —— */
  async signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(authErrorText(error));
  }
  /** 注册：返回 'confirm' = 需要去邮箱点验证链接；'ok' = 已直接登录（项目关闭了邮箱验证） */
  async signUp(email: string, password: string): Promise<'ok' | 'confirm'> {
    const redirect = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : 'yijuji://';
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirect } });
    if (error) throw new Error(authErrorText(error));
    if (data.user && data.user.identities && data.user.identities.length === 0) throw new Error('这个邮箱已经注册过了，直接登录吧');
    return data.session ? 'ok' : 'confirm';
  }
  async signOut() {
    await this.serial(async () => { await this.unlinkLocal(); this.sessionUser = null; await supabase.auth.signOut({ scope: 'local' }); this.set({ status: 'signedOut', email: null, userId: null }); });
  }
  createFamily(displayName: string) {
    return this.serial(async () => {
      const { data, error } = await supabase.rpc('create_family', { p_name: '我们家', p_display_name: displayName });
      if (error) throw new Error(error.message.includes('too many') ? '最多创建 5 个家庭' : authErrorText(error));
      await this.linkFamily(data as string, displayName, 'admin', '我们家', true);
    });
  }
  async createInvite(): Promise<{ code: string; expiresAt: string }> {
    if (!this.link) throw new Error('还没有加入家庭');
    const { data, error } = await supabase.rpc('create_invite', { p_family: this.link.familyId });
    if (error) throw new Error(error.message.includes('too many') ? '有效邀请码太多了，先用掉几个吧' : authErrorText(error));
    const row = (data as { code: string; expires_at: string }[])[0];
    return { code: row.code, expiresAt: row.expires_at };
  }
  acceptInvite(code: string, displayName: string) {
    return this.serial(async () => {
      const was = !!this.link;
      if (was) { await this.flush(); if (this.outbox.length) throw new Error('还有记录没同步上去，请联网后再试'); }
      const { data, error } = await supabase.rpc('accept_invite', { p_code: code.trim().toUpperCase(), p_display_name: displayName });
      if (error) throw new Error(error.message.includes('too many') ? '尝试太多次了，请一小时后再试' : authErrorText(error));
      if (!data) throw new Error('邀请码不对，或者已经过期 / 被用过了');
      if (was) await this.unlinkLocal();
      const { data: f } = await supabase.from('families').select('name').eq('id', data as string).maybeSingle();
      /* 第一次连上家庭才把本机记录带过去；从一个家庭换到另一个家庭时，旧家庭的记录留在旧家庭 */
      await this.linkFamily(data as string, displayName, 'member', f?.name ?? '我们家', !was);
    });
  }
  /** 注销账号：服务器上删掉我的账号、我的成员身份；我独自一人的家庭连同宝宝和记录一起删除 */
  async deleteAccount() {
    await this.serial(async () => {
      const { error } = await supabase.rpc('delete_account');
      if (error) throw new Error(authErrorText(error));
      await this.unlinkLocal(); this.sessionUser = null;
      await supabase.auth.signOut({ scope: 'local' });
      this.set({ status: 'signedOut', email: null, userId: null });
    });
  }
}

export const cloud = new CloudSync();
