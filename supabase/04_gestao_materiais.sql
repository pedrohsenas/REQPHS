-- =============================================================
-- GESTÃO DE MATERIAIS
--   OS (Sadege) ── pertence (ou não) a um projeto (req_projetos)
--     └─ materiais: itens de RMs concluídas vinculados à OS
--          (OC, data do pedido, previsão de entrega, entrega)
--   Listas de separação para o almoxarifado (checklist no celular)
-- Mesmo padrão das demais tabelas: ids de texto gerados no app,
-- acesso pela função privado.acesso_liberado(), tempo real ligado.
-- =============================================================

-- papel da pessoa no cadastro: assinante (padrão) ou almoxarifado (só acesso; não assina)
alter table public.req_pessoas add column if not exists papel text not null default 'assinante';
alter table public.req_pessoas drop constraint if exists req_pessoas_papel_chk;
alter table public.req_pessoas add  constraint req_pessoas_papel_chk check (papel in ('assinante', 'almoxarifado'));

-- ---------- OS do Sadege ----------
create table if not exists public.req_os (
  id            text primary key check (id ~ '^[A-Za-z0-9_-]{1,60}$'),
  unidade       text not null default 'UIS3' check (unidade in ('UIS', 'UIS3')),
  numero        text not null default '',          -- nº da OS no Sadege
  descricao     text not null default '',          -- tratada como nome do projeto/demanda
  disciplina    text not null default '',          -- Elétrica, Mecânica, Civil, Automação…
  projeto_id    text,                              -- req_projetos.id — vazio = OS solta
  demanda_id    text,                              -- prj_demandas.id (opcional)
  status        text not null default 'aberta' check (status in ('aberta', 'concluida', 'cancelada')),
  autor         text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists req_os_numero_un on public.req_os (unidade, numero) where numero <> '';
create index if not exists req_os_projeto on public.req_os (projeto_id);

-- ---------- materiais (item de RM vinculado a uma OS) ----------
create table if not exists public.req_mat (
  id            text primary key check (id ~ '^[A-Za-z0-9_-]{1,60}$'),
  unidade       text not null default 'UIS3' check (unidade in ('UIS', 'UIS3')),
  os_id         text not null references public.req_os (id) on delete cascade,
  lista_id      text not null,                     -- RM de origem (req_listas.id)
  item_chave    text not null default '',          -- código|descrição#n na RM: evita vincular duas vezes
  codigo        text not null default '',
  descricao     text not null default '',
  un            text not null default '',
  qtd           numeric not null default 0,
  preco         numeric not null default 0,
  oc            text not null default '',          -- ordem de compra
  data_pedido   date,
  data_prev     date,                              -- previsão de entrega
  data_entrega  date,                              -- entregue/retirado na frente de serviço
  cancelado     boolean not null default false,
  obs           text not null default '',
  autor         text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists req_mat_item_un on public.req_mat (lista_id, item_chave) where item_chave <> '';
create index if not exists req_mat_os on public.req_mat (os_id);

-- ---------- listas de separação (almoxarifado) ----------
create table if not exists public.req_sep (
  id            text primary key check (id ~ '^[A-Za-z0-9_-]{1,60}$'),
  unidade       text not null default 'UIS3' check (unidade in ('UIS', 'UIS3')),
  numero        integer,                           -- SEP-0001 (sequencial por unidade)
  titulo        text not null default '',
  status        text not null default 'rascunho'
                check (status in ('rascunho', 'enviada', 'separada', 'entregue', 'cancelada')),
  responsavel   text not null default '',          -- quem separa no almoxarifado
  obs           text not null default '',
  autor         text,
  criado_em     timestamptz not null default now(),
  enviada_em    timestamptz,
  separada_em   timestamptz,
  entregue_em   timestamptz,
  atualizado_em timestamptz not null default now()
);
create table if not exists public.req_sep_itens (
  id            text primary key check (id ~ '^[A-Za-z0-9_-]{1,60}$'),
  sep_id        text not null references public.req_sep (id) on delete cascade,
  mat_id        text not null references public.req_mat (id) on delete cascade,
  qtd           numeric not null default 0,
  ordem         integer not null default 0,
  separado      boolean not null default false,
  qtd_sep       numeric,                           -- separado de fato (vazio = qtd)
  separado_por  text,
  separado_em   timestamptz,
  obs           text not null default '',
  atualizado_em timestamptz not null default now(),
  unique (sep_id, mat_id)
);
create index if not exists req_sep_itens_mat on public.req_sep_itens (mat_id);

-- número sequencial da lista e relógio de alteração (do servidor)
create or replace function privado.req_sep_numero() returns trigger
  language plpgsql security definer set search_path = '' as $f$
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtext('req_sep_numero:' || new.unidade));
    select coalesce(max(s.numero), 0) + 1 into new.numero from public.req_sep s where s.unidade = new.unidade;
  end if;
  return new;
end $f$;
drop trigger if exists req_sep_numero on public.req_sep;
create trigger req_sep_numero before insert on public.req_sep for each row execute function privado.req_sep_numero();

create or replace function privado.tocar_relogio() returns trigger
  language plpgsql set search_path = '' as $f$
begin
  new.atualizado_em := now();
  return new;
end $f$;
drop trigger if exists req_os_relogio on public.req_os;
create trigger req_os_relogio before update on public.req_os for each row execute function privado.tocar_relogio();
drop trigger if exists req_mat_relogio on public.req_mat;
create trigger req_mat_relogio before update on public.req_mat for each row execute function privado.tocar_relogio();
drop trigger if exists req_sep_relogio on public.req_sep;
create trigger req_sep_relogio before update on public.req_sep for each row execute function privado.tocar_relogio();
drop trigger if exists req_sep_itens_relogio on public.req_sep_itens;
create trigger req_sep_itens_relogio before update on public.req_sep_itens for each row execute function privado.tocar_relogio();

-- acesso: mesma regra das demais tabelas
alter table public.req_os        enable row level security;
alter table public.req_mat       enable row level security;
alter table public.req_sep       enable row level security;
alter table public.req_sep_itens enable row level security;
drop policy if exists req_os_equipe on public.req_os;
create policy req_os_equipe on public.req_os for all to authenticated
  using ((select privado.acesso_liberado())) with check ((select privado.acesso_liberado()));
drop policy if exists req_mat_equipe on public.req_mat;
create policy req_mat_equipe on public.req_mat for all to authenticated
  using ((select privado.acesso_liberado())) with check ((select privado.acesso_liberado()));
drop policy if exists req_sep_equipe on public.req_sep;
create policy req_sep_equipe on public.req_sep for all to authenticated
  using ((select privado.acesso_liberado())) with check ((select privado.acesso_liberado()));
drop policy if exists req_sep_itens_equipe on public.req_sep_itens;
create policy req_sep_itens_equipe on public.req_sep_itens for all to authenticated
  using ((select privado.acesso_liberado())) with check ((select privado.acesso_liberado()));

-- tempo real: o check do almoxarifado aparece na hora para a engenharia
do $f$
declare t text;
begin
  foreach t in array array['req_os', 'req_mat', 'req_sep', 'req_sep_itens'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $f$;

notify pgrst, 'reload schema';
