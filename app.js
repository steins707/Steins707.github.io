import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const $ = id => document.getElementById(id);
const KEY = 'medicine_sync_code_v1';
let drugs = [], filter = 'all', editId = null, code = '', busy = false;
function notify(message, error = false) { const el = $('notice'); el.textContent = message; el.className = `notice${error ? ' error' : ''}`; }
function todayISO() { const d = new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); }
function validDate(s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const [y,m,d]=s.split('-').map(Number), x=new Date(Date.UTC(y,m-1,d)); return x.getUTCFullYear()===y && x.getUTCMonth()===m-1 && x.getUTCDate()===d; }
function days(s) { return Math.round((Date.parse(s+'T00:00:00Z')-Date.parse(todayISO()+'T00:00:00Z'))/86400000); }
function status(d) { const n=days(d.expiry); return n<0?'expired':n<=30?'warning':'valid'; }
function normalize(raw) { if(!Array.isArray(raw) || raw.length>10000) throw Error('备份格式错误或记录过多'); return raw.map(d=>{ if(!d || typeof d.name!=='string' || !d.name.trim() || d.name.length>120 || !validDate(d.expiry)) throw Error('备份中存在无效记录'); return {id:crypto.randomUUID(),name:d.name.trim(),expiry:d.expiry}; }); }
async function api(action, extras={}) {
 const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/medicine_vault_action`,{method:'POST',headers:{'apikey':SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_code:code,p_action:action,...extras})});
 if(!response.ok){let msg;try{msg=(await response.json()).message}catch{}throw Error(msg||`服务器返回 ${response.status}`)}
 return response.json();
}
function connected(yes){$('connectPanel').classList.toggle('hidden',yes);$('connectedPanel').classList.toggle('hidden',!yes);$('app').classList.toggle('hidden',!yes);$('mode').textContent=yes?'同步码云端模式':'等待连接';$('currentCode').value=yes?code:'';}
async function run(action){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{drugs=await action();render();}catch(e){notify(`操作失败：${e.message}`,true);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);render();}}

function render() {
 $('today').textContent=todayISO();
 $('totalCount').textContent=drugs.length; $('warningCount').textContent=drugs.filter(d=>status(d)==='warning').length; $('expiredCount').textContent=drugs.filter(d=>status(d)==='expired').length;
 $('clearBtn').disabled=!drugs.length; $('exportBtn').disabled=!drugs.length;
 const list=$('drugList'); list.replaceChildren();
 const selected=drugs.filter(d=>filter==='all'||status(d)===filter).sort((a,b)=>a.expiry.localeCompare(b.expiry)||a.name.localeCompare(b.name));
 if(!selected.length){const el=document.createElement('div');el.className='empty';el.textContent=drugs.length?'没有符合筛选条件的药品':'暂无记录，先添加一条药品。';list.append(el);return;}
 for(const drug of selected){
  const item=document.createElement('article');item.className='item';const info=document.createElement('div');
  const name=document.createElement('div');name.className='name';name.textContent=drug.name;
  const detail=document.createElement('div');detail.className='details';detail.textContent=`有效期至 ${drug.expiry}`;
  const badge=document.createElement('span');badge.className=`badge ${status(drug)}`;const n=days(drug.expiry);badge.textContent=n<0?`已过期 ${-n} 天`:n===0?'今天到期':n<=30?`临期 · 剩余 ${n} 天`:`剩余 ${n} 天`;info.append(name,detail,badge);
  const actions=document.createElement('div');actions.className='item-actions';
  for(const [label,act,cls] of [['编辑','edit','secondary'],['删除','delete','danger']]){const b=document.createElement('button');b.type='button';b.className=`btn small ${cls}`;b.textContent=label;b.dataset.action=act;b.dataset.id=drug.id;actions.append(b);}
  item.append(info,actions);list.append(item);
 }
}
$('drugForm').addEventListener('submit',e=>{e.preventDefault();const name=$('drugName').value.trim(),expiry=$('drugExpiry').value;if(!name||!validDate(expiry))return notify('请填写名称和有效日期。',true);run(async()=>{const result=await api('add',{p_name:name,p_expiry:expiry});$('drugForm').reset();return result;});});
$('drugList').addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(!b)return;const drug=drugs.find(d=>d.id===b.dataset.id);if(!drug)return;if(b.dataset.action==='delete'){if(confirm(`确定删除“${drug.name}”？`))run(()=>api('delete',{p_id:drug.id}));}else{editId=drug.id;$('editName').value=drug.name;$('editExpiry').value=drug.expiry;$('editDialog').showModal();}});
$('editForm').addEventListener('submit',e=>{e.preventDefault();const name=$('editName').value.trim(),expiry=$('editExpiry').value;if(!name||!validDate(expiry))return notify('请填写名称和有效日期。',true);run(async()=>{const result=await api('update',{p_id:editId,p_name:name,p_expiry:expiry});$('editDialog').close();return result;});});
$('cancelEdit').addEventListener('click',()=>$('editDialog').close());
document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('.filter').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();}));
$('clearBtn').addEventListener('click',()=>{if(drugs.length&&confirm(`确定清空全部 ${drugs.length} 条记录？此操作不可恢复。`))run(()=>api('clear'));});
$('exportBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),drugs:drugs.map(({name,expiry})=>({name,expiry}))},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`药品有效期备份-${todayISO()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);});
$('importBtn').addEventListener('click',()=>$('importFile').click());
$('importFile').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>2_000_000)throw Error('文件超过 2 MB');const payload=JSON.parse(await file.text());if(payload.version!==1)throw Error('不支持的备份版本');const incoming=normalize(payload.drugs);if(!confirm(`导入 ${incoming.length} 条记录并替换当前云端全部 ${drugs.length} 条记录？请先导出备份。`))return;run(()=>api('replace',{p_items:incoming.map(({name,expiry})=>({name,expiry}))}));}catch(err){notify(`导入失败：${err.message}`,true);}});
function randomCode(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
$('createBtn').addEventListener('click',()=>{if(!confirm('创建新的空白云端空间？请保存生成的同步码，否则换设备后无法找回。'))return;const next=randomCode();code=next;run(async()=>{const result=await api('create');localStorage.setItem(KEY,code);connected(true);$('syncCode').value='';notify('空间已创建。请立即复制同步码并妥善保存。');return result;});});
$('joinBtn').addEventListener('click',()=>{const next=$('syncCode').value.trim().toLowerCase();if(!/^[0-9a-f]{64}$/.test(next))return notify('同步码应为64位十六进制字符。',true);code=next;run(async()=>{const result=await api('list');localStorage.setItem(KEY,code);connected(true);$('syncCode').value='';return result;});});
$('copyBtn').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(code);notify('同步码已复制，请安全保存。');}catch{notify('复制失败，请检查浏览器剪贴板权限。',true);}});
$('disconnectBtn').addEventListener('click',()=>{if(!confirm('断开此设备？云端记录不会删除。请先确认你已保存同步码。'))return;localStorage.removeItem(KEY);code='';drugs=[];connected(false);render();});
connected(false);render();
const stored=localStorage.getItem(KEY);if(stored&&/^[0-9a-f]{64}$/.test(stored)){code=stored;run(async()=>{const result=await api('list');connected(true);return result;});}
setInterval(()=>{if(code&&!busy)run(()=>api('list'));else render();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&code&&!busy)run(()=>api('list'));});
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
