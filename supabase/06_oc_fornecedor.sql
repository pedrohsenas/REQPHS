-- =============================================================
-- OC (ORDEM DE COMPRA) COMO CADASTRO PRÓPRIO
--   A OC é emitida por fornecedor: pode ter 1 item ou vários,
--   de RMs e OS diferentes. Ela guarda nº, fornecedor, data do
--   pedido e previsão de entrega; os itens apontam para ela.
--
--   req_mat.oc_id        → OC do item (vazio = Sem OC)
--   req_mat.data_prev    → previsão PRÓPRIA do item (vazio = a da OC),
--                           para entregas parciais / saldo
--   req_mat.data_receb   → chegou do fornecedor (recebido)
--   req_mat.oc           → nº da OC em texto, mantido pelo banco
--                           (relatórios e SQL; o app usa oc_id)
-- Aditivo: não apaga nada. OCs digitadas antes como texto viram cadastro.
-- =============================================================

create table if not exists public.req_oc (
  id            text primary key check (id ~ '^[A-Za-z0-9_-]{1,60}$'),
  unidade       text not null default 'UIS3' check (unidade in ('UIS', 'UIS3')),
  numero        text not null default '',          -- nº da OC no sistema de compras
  fornecedor    text not null default '',
  data_pedido   date,
  data_prev     date,                              -- previsão de entrega da OC
  obs           text not null default '',
  status        text not null default 'aberta' check (status in ('aberta', 'cancelada')),
  autor         text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists req_oc_numero_un on public.req_oc (unidade, numero) where numero <> '';
comment on table public.req_oc is 'Ordens de compra (por fornecedor). Recebimento e situação são derivados dos itens (req_mat).';

alter table public.req_mat add column if not exists oc_id text references public.req_oc (id) on delete set null;
alter table public.req_mat add column if not exists data_receb date;
create index if not exists req_mat_oc on public.req_mat (oc_id);
comment on column public.req_mat.data_prev  is 'Previsão própria do item (vazio = previsão da OC).';
comment on column public.req_mat.data_receb is 'Data em que o item chegou do fornecedor.';
comment on column public.req_mat.oc         is 'Nº da OC em texto, mantido pelo banco a partir de oc_id.';

-- OCs digitadas antes como texto → cadastro (uma por nº e unidade)
insert into public.req_oc (id, unidade, numero, data_pedido, data_prev, autor)
select 'oc' || substr(md5(m.unidade || '|' || btrim(m.oc)), 1, 24), m.unidade, btrim(m.oc),
       min(m.data_pedido), mode() within group (order by m.data_prev), min(m.autor)
  from public.req_mat m
 where btrim(m.oc) <> '' and m.oc_id is null
 group by m.unidade, btrim(m.oc)
on conflict do nothing;
update public.req_mat m set oc_id = o.id
  from public.req_oc o
 where m.oc_id is null and btrim(m.oc) <> '' and o.unidade = m.unidade and o.numero = btrim(m.oc);
update public.req_mat m set data_prev = null                    -- igual à da OC → herda
  from public.req_oc o where m.oc_id = o.id and m.data_prev is not distinct from o.data_prev;
update public.req_mat set data_pedido = null where oc_id is not null;   -- o pedido agora é da OC

-- nº da OC em texto no item, sempre igual ao cadastro
create or replace function privado.req_mat_oc_texto() returns trigger
  language plpgsql set search_path = '' as $f$
begin
  if new.oc_id is null then new.oc := '';
  else new.oc := coalesce((select o.numero from public.req_oc o where o.id = new.oc_id), '');
  end if;
  return new;
end $f$;
drop trigger if exists req_mat_oc_texto on public.req_mat;
create trigger req_mat_oc_texto before insert or update of oc_id on public.req_mat
  for each row execute function privado.req_mat_oc_texto();

create or replace function privado.req_oc_numero_itens() returns trigger
  language plpgsql set search_path = '' as $f$
begin
  update public.req_mat m set oc = new.numero where m.oc_id = new.id and m.oc is distinct from new.numero;
  return null;
end $f$;
drop trigger if exists req_oc_numero_itens on public.req_oc;
create trigger req_oc_numero_itens after update of numero on public.req_oc
  for each row when (new.numero is distinct from old.numero) execute function privado.req_oc_numero_itens();

drop trigger if exists req_oc_relogio on public.req_oc;
create trigger req_oc_relogio before update on public.req_oc for each row execute function privado.tocar_relogio();

alter table public.req_oc enable row level security;
drop policy if exists req_oc_equipe on public.req_oc;
create policy req_oc_equipe on public.req_oc for all to authenticated
  using ((select privado.acesso_liberado())) with check ((select privado.acesso_liberado()));

do $f$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'req_oc') then
    alter publication supabase_realtime add table public.req_oc;
  end if;
end $f$;

notify pgrst, 'reload schema';
