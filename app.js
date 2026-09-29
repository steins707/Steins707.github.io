import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const $ = id => document.getElementById(id);
const KEY = 'med_expiry_manager_v2';
const LEGACY_KEY = 'med_expiry_manager_v1';
let drugs = [], filter = 'all', cloud = null, user = null, editId = null, busy = false;
const configured = Boolean(SUPABASE_URL || SUPABASE_ANON_KEY);

function notify(message, error = false) { const el = $('notice'); el.textContent = message; el.className = `notice${error ? ' error' : ''}`; }
function clearNotice() { $('notice').classList.add('hidden'); }
function todayISO() { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); }
function dateValid(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const [y,m,d] = value.split('-').map(Number), dt = new Date(Date.UTC(y,m-1,d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m-1 && dt.getUTCDate() === d; }
function difference(date) { return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(todayISO() + 'T00:00:00Z')) / 86400000); }
function status(drug) { const n = difference(drug.expiry); return n < 0 ? 'expired' : n <= 30 ? 'warning' : 'valid'; }
function localRead() { try { const raw = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY) || '[]'); return Array.isArray(raw) ? raw.filter(d => d && typeof d.name === 'string' && dateValid(d.expiry)).map(d => ({ id: d.id || crypto.randomUUID(), name: d.name.slice(0,120), expiry: d.expiry })) : []; } catch { return []; } }
function localWrite() { localStorage.setItem(KEY, JSON.stringify(drugs)); }
function setBusy(value) { busy = value; document.querySelectorAll('button').forEach(b => b.disabled = value); }
function render() {
  $('today').textContent = todayISO();
  $('totalCount').textContent = drugs.length;
  $('warningCount').textContent = drugs.filter(d => status(d) === 'warning').length;
  $('expiredCount').textContent = drugs.filter(d => status(d) === 'expired').length;
  $('clearBtn').disabled = busy || drugs.length === 0;
  const list = $('drugList'); list.replaceChildren();
  const selected = drugs.filter(d => filter === 'all' || status(d) === filter).sort((a,b) => a.expiry.localeCompare(b.expiry) || a.name.localeCompare(b.name));
  if (!selected.length) { const el = document.createElement('div'); el.className = 'empty'; el.textContent = drugs.length ? '没有符合筛选条件的药品' : '暂无记录，先添加一条药品。'; list.append(el); return; }
  for (const drug of selected) {
    const item = document.createElement('article'); item.className = 'item';
    const info = document.createElement('div');
    const name = document.createElement('div'); name.className = 'name'; name.textContent = drug.name;
    const detail = document.createElement('div'); detail.className = 'details'; detail.textContent = `有效期至 ${drug.expiry}`;
    const badge = document.createElement('span'); badge.className = `badge ${status(drug)}`;
    const n = difference(drug.expiry); badge.textContent = n < 0 ? `已过期 ${-n} 天` : n === 0 ? '今天到期' : n <= 30 ? `临期 · 剩余 ${n} 天` : `剩余 ${n} 天`;
    info.append(name, detail, badge);
    const actions = document.createElement('div'); actions.className = 'item-actions';
    for (const [label, action, className] of [['编辑','edit','secondary'],['删除','delete','danger']]) { const b = document.createElement('button'); b.type = 'button'; b.className = `btn small ${className}`; b.textContent = label; b.dataset.action = action; b.dataset.id = String(drug.id); actions.append(b); }
    item.append(info,actions); list.append(item);
  }
}
function showMode() { $('mode').textContent = cloud ? (user ? `云端同步 · ${user.email}` : '云端模式 · 请登录') : '本机保存'; $('authPanel').classList.toggle('hidden', !cloud); $('authForm').classList.toggle('hidden', !!user); $('logoutBtn').classList.toggle('hidden', !user); $('app').classList.toggle('hidden', !!cloud && !user); }
async function load() { if (cloud) { const { data, error } = await cloud.from('drugs').select('id,name,expiry').eq('user_id', user.id).order('expiry'); if (error) throw error; drugs = data || []; } else drugs = localRead(); render(); }
async function add(name, expiry) { if (cloud) { const { data, error } = await cloud.from('drugs').insert({ user_id:user.id, name, expiry }).select('id,name,expiry').single(); if (error) throw error; drugs.push(data); } else { drugs.push({ id:crypto.randomUUID(), name, expiry }); localWrite(); } }
async function update(id, name, expiry) { if (cloud) { const { data, error } = await cloud.from('drugs').update({ name, expiry }).eq('id',id).eq('user_id',user.id).select('id,name,expiry').single(); if (error) throw error; drugs = drugs.map(d => String(d.id) === String(id) ? data : d); } else { drugs = drugs.map(d => String(d.id) === String(id) ? {...d,name,expiry} : d); localWrite(); } }
async function remove(id) { if (cloud) { const { data,error } = await cloud.from('drugs').delete().eq('id',id).eq('user_id',user.id).select('id'); if (error) throw error; if (!data?.length) throw Error('未找到要删除的记录'); } drugs = drugs.filter(d => String(d.id) !== String(id)); if (!cloud) localWrite(); }
async function run(operation) { if (busy) return; setBusy(true); clearNotice(); try { await operation(); render(); } catch (e) { notify(`操作失败：${e.message || e}`,true); } finally { setBusy(false); } }

$('drugForm').addEventListener('submit', e => { e.preventDefault(); const name = $('drugName').value.trim(), expiry = $('drugExpiry').value; if (!name || !dateValid(expiry)) return notify('请填写名称和有效日期。',true); run(async()=>{ await add(name,expiry); $('drugForm').reset(); $('drugName').focus(); }); });
$('drugList').addEventListener('click', e => { const btn = e.target.closest('button[data-action]'); if (!btn || busy) return; const drug = drugs.find(d => String(d.id) === btn.dataset.id); if (!drug) return; if (btn.dataset.action === 'delete') { if (confirm(`确定删除“${drug.name}”？`)) run(() => remove(drug.id)); } else { editId = drug.id; $('editName').value = drug.name; $('editExpiry').value = drug.expiry; $('editDialog').showModal(); } });
$('editForm').addEventListener('submit', e => { e.preventDefault(); const name = $('editName').value.trim(), expiry = $('editExpiry').value; if (!name || !dateValid(expiry)) return notify('请填写名称和有效日期。',true); const id = editId; run(async()=>{ await update(id,name,expiry); $('editDialog').close(); }); });
$('cancelEdit').addEventListener('click', () => $('editDialog').close());
document.querySelectorAll('.filter').forEach(b => b.addEventListener('click',()=>{ filter = b.dataset.filter; document.querySelectorAll('.filter').forEach(x => x.setAttribute('aria-pressed',String(x === b))); render(); }));
$('clearBtn').addEventListener('click',()=>{ if (!drugs.length || !confirm(`确定清空全部 ${drugs.length} 条记录？此操作不可恢复。`)) return; run(async()=>{ if (cloud) { const {data,error} = await cloud.from('drugs').delete().eq('user_id',user.id).select('id'); if (error) throw error; if (data.length !== drugs.length) { await load(); throw Error('部分记录未删除，请检查列表'); } } drugs = []; if (!cloud) localWrite(); }); });
$('authForm').addEventListener('submit',e=>{ e.preventDefault(); run(async()=>{ const {error} = await cloud.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value}); if(error) throw error; $('password').value=''; }); });
$('registerBtn').addEventListener('click',()=>{ if (!$('authForm').reportValidity()) return; run(async()=>{ const {data,error} = await cloud.auth.signUp({email:$('email').value.trim(),password:$('password').value}); if(error) throw error; $('password').value=''; notify(data.session ? '注册并登录成功。' : '注册成功，请检查验证邮件后登录。'); }); });
$('logoutBtn').addEventListener('click',()=>run(async()=>{ const {error} = await cloud.auth.signOut(); if(error) throw error; }));

async function init() {
  if (configured) {
    try {
      const url = new URL(SUPABASE_URL);
      if (!['https:','http:'].includes(url.protocol) || !SUPABASE_ANON_KEY.trim()) throw Error('请在 config.js 中填写有效的 Project URL 和 publishable/anon key');
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      cloud = createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
      cloud.auth.onAuthStateChange((_event,session)=>{ const previous = user?.id; user = session?.user || null; drugs=[]; showMode(); render(); if(user && previous !== user.id) setTimeout(()=>load().catch(e=>notify(`读取失败：${e.message}`,true)),0); });
      const {data,error} = await cloud.auth.getSession(); if(error) throw error;
      user=data.session?.user || null; showMode(); if(user) await load();
    } catch(e) { cloud=null; user=null; showMode(); await load(); notify(`云端初始化失败，已切换至本机保存：${e.message}`,true); }
  } else { showMode(); await load(); }
  setInterval(render,60000);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) render(); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
init();
