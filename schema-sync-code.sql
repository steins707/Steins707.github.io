-- 在 Supabase SQL Editor 执行。与原有 public.drugs 用户账户表分开，不删除旧数据。
-- 新同步码为 6 位数字；兼容旧版 64 位十六进制同步码。数据库只保存其 SHA-256 摘要。
create table if not exists public.medicine_vaults (
  token_hash text primary key,
  created_at timestamptz not null default now()
);
create table if not exists public.medicine_vault_items (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null references public.medicine_vaults(token_hash) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  expiry date not null
);
create index if not exists medicine_vault_items_lookup on public.medicine_vault_items(token_hash,expiry);
alter table public.medicine_vaults enable row level security;
alter table public.medicine_vault_items enable row level security;
revoke all on public.medicine_vaults, public.medicine_vault_items from public, anon, authenticated;

create or replace function public.medicine_vault_action(
  p_code text, p_action text, p_id uuid default null, p_name text default null,
  p_expiry date default null, p_items jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare h text; output jsonb; item jsonb;
begin
  if p_code is null or p_code !~ '^([0-9]{6}|[0-9a-f]{64})$' then raise exception '同步码格式无效'; end if;
  if pg_catalog.char_length(p_code)=64 then
    h := pg_catalog.encode(pg_catalog.sha256(pg_catalog.decode(p_code,'hex')),'hex');
  else
    h := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_code,'UTF8')),'hex');
  end if;
  if p_action = 'create' then
    insert into public.medicine_vaults(token_hash) values(h);
    return '[]'::jsonb;
  end if;
  if not exists(select 1 from public.medicine_vaults where token_hash=h) then raise exception '同步码不存在'; end if;
  if p_action = 'add' then
    if p_name is null or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 120 or p_expiry is null then raise exception '药品名称或日期无效'; end if;
    insert into public.medicine_vault_items(token_hash,name,expiry) values(h,pg_catalog.btrim(p_name),p_expiry);
  elsif p_action = 'update' then
    if p_name is null or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 120 or p_expiry is null then raise exception '药品名称或日期无效'; end if;
    update public.medicine_vault_items set name=pg_catalog.btrim(p_name),expiry=p_expiry where id=p_id and token_hash=h;
    if not found then raise exception '记录不存在'; end if;
  elsif p_action = 'delete' then
    delete from public.medicine_vault_items where id=p_id and token_hash=h;
    if not found then raise exception '记录不存在'; end if;
  elsif p_action = 'clear' then
    delete from public.medicine_vault_items where token_hash=h;
  elsif p_action = 'replace' then
    if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>10000 then raise exception '备份格式无效'; end if;
    for item in select value from jsonb_array_elements(p_items) as t(value) loop
      if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'name')<>'string' or jsonb_typeof(item->'expiry')<>'string'
        or pg_catalog.char_length(pg_catalog.btrim(item->>'name')) not between 1 and 120
        or (item->>'expiry') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception '备份包含无效记录'; end if;
      perform (item->>'expiry')::date;
    end loop;
    delete from public.medicine_vault_items where token_hash=h;
    insert into public.medicine_vault_items(token_hash,name,expiry)
      select h,pg_catalog.btrim(value->>'name'),(value->>'expiry')::date from jsonb_array_elements(p_items) as t(value);
  elsif p_action <> 'list' then
    raise exception '不支持的操作';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'expiry',expiry) order by expiry,name),'[]'::jsonb)
    into output from public.medicine_vault_items where token_hash=h;
  return output;
end $$;
revoke all on function public.medicine_vault_action(text,text,uuid,text,date,jsonb) from public, anon, authenticated;
grant execute on function public.medicine_vault_action(text,text,uuid,text,date,jsonb) to anon;
