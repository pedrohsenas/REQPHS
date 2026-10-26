-- =============================================================
-- Gestão de Projetos (REQPHS/projetos) — tabelas novas
-- Rodar UMA vez no Supabase: SQL Editor → New query → colar → Run.
-- Mesmo projeto Supabase das Requisições. NÃO altera nem apaga
-- nada das tabelas req_* (só lê req_projetos e req_listas nas views).
-- Pode rodar de novo sem problema (tudo é "if not exists").
-- =============================================================

-- ---------- 1) Ficha do projeto (1:1 com req_projetos) ----------
-- O projeto continua nascendo/vivendo em req_projetos (nome, status,
-- unidade). Aqui fica o que é de gestão: código, escopo, prazo,
-- orçamento, atividades (% de avanço), marcos e listas do RDO.
create table if not exists public.prj_fichas (
  projeto_id    text primary key,            -- = req_projetos.id
  unidade       text,
  dados         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- ---------- 2) RDO — Relatório Diário de Obra ----------
create table if not exists public.prj_rdos (
  id            text primary key,
  projeto_id    text not null,
  unidade       text,
  numero        integer,
  data          date not null default current_date,
  dados         jsonb not null default '{}'::jsonb,  -- clima, mão de obra, atividades, ocorrências, fotos
  autor         text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists prj_rdos_projeto_idx on public.prj_rdos (projeto_id, data);

-- ---------- 3) Demandas (dia a dia) ----------
create table if not exists public.prj_demandas (
  id            text primary key,
  unidade       text,
  titulo        text not null,
  detalhe       text,
  prioridade    text not null default 'media',      -- alta | media | baixa
  status        text not null default 'aberta',     -- aberta | andamento | aguardando | concluida | cancelada
  projeto_id    text,                               -- opcional
  prazo         date,
  solicitante   text,
  autor         text,
  criado_em     timestamptz not null default now(),
  concluido_em  timestamptz
);
create index if not exists prj_demandas_status_idx on public.prj_demandas (unidade, status);

-- ---------- 4) Custos extras (serviços, mão de obra terceira, etc.) ----------
-- Material vem sozinho das requisições (req_listas). Aqui entra o resto.
create table if not exists public.prj_custos (
  id            text primary key,
  projeto_id    text not null,
  unidade       text,
  data          date not null default current_date,
  descricao     text not null,
  categoria     text not null default 'servico',    -- servico | mao_obra | material_extra | outros
  valor         numeric(14,2) not null default 0,
  fornecedor    text,
  autor         text,
  criado_em     timestamptz not null default now()
);
create index if not exists prj_custos_projeto_idx on public.prj_custos (projeto_id);

-- ---------- 5) Registros da IA (Claude escreve aqui) ----------
-- Planos de ação, metas, sugestões, medidas de controle e resumos
-- de entrevista. O site mostra e deixa marcar como feito.
create table if not exists public.prj_ia (
  id            text primary key default gen_random_uuid()::text,
  unidade       text default 'UIS3',
  projeto_id    text,                               -- vazio = geral
  tipo          text not null default 'sugestao',   -- plano_acao | meta | sugestao | controle | entrevista | resumo
  titulo        text not null,
  conteudo      text,                               -- markdown
  prazo         date,
  status        text not null default 'aberto',     -- aberto | feito | descartado
  criado_em     timestamptz not null default now()
);

-- ---------- 6) Segurança: só usuário logado (mesmo login das Requisições) ----------
do $$
declare t text;
begin
  foreach t in array array['prj_fichas','prj_rdos','prj_demandas','prj_custos','prj_ia'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_autenticado', t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)',
                   t || '_autenticado', t);
  end loop;
end $$;

-- ---------- 7) Fotos do RDO: bucket privado ----------
insert into storage.buckets (id, name, public)
values ('rdo-fotos', 'rdo-fotos', false)
on conflict (id) do nothing;

drop policy if exists "rdo_fotos_autenticado" on storage.objects;
create policy "rdo_fotos_autenticado" on storage.objects
  for all to authenticated
  using (bucket_id = 'rdo-fotos')
  with check (bucket_id = 'rdo-fotos');

-- ---------- 8) Views para análise (Claude / painéis) ----------
-- Custo de material por projeto, direto das requisições (RM).
create or replace view public.v_prj_custo_material
with (security_invoker = on) as
select
  l.dados->>'projetoId'                                       as projeto_id,
  count(distinct l.id)                                        as listas,
  coalesce(sum(
    coalesce(nullif(i->>'qtd','')::numeric, 0) *
    coalesce(nullif(i->>'preco','')::numeric, 0)), 0)         as valor_material
from public.req_listas l
cross join lateral jsonb_array_elements(coalesce(l.dados->'itens','[]'::jsonb)) i
where coalesce(l.dados->>'tipo','RM') = 'RM'
  and coalesce(l.dados->>'projetoId','') <> ''
group by 1;

-- Resumo por projeto: avanço, prazo, custo, RDOs, demandas.
create or replace view public.v_prj_resumo
with (security_invoker = on) as
with ativ as (
  select f.projeto_id,
         round(avg(coalesce(nullif(a->>'pct','')::numeric,0)),1) as avanco_pct
  from public.prj_fichas f
  cross join lateral jsonb_array_elements(coalesce(f.dados->'atividades','[]'::jsonb)) a
  group by 1
), extra as (
  select projeto_id, sum(valor) as valor_extra from public.prj_custos group by 1
), rdo as (
  select projeto_id, count(*) as rdos, max(data) as ultimo_rdo from public.prj_rdos group by 1
), dem as (
  select projeto_id, count(*) filter (where status not in ('concluida','cancelada')) as demandas_abertas
  from public.prj_demandas where projeto_id is not null group by 1
)
select
  p.id                                                        as projeto_id,
  p.nome,
  coalesce(p.unidade, 'UIS3')                                 as unidade,
  coalesce(p.status, 'andamento')                             as status_req,
  f.dados->>'codigo'                                          as codigo,
  f.dados->>'fase'                                            as fase,
  f.dados->>'responsavel'                                     as responsavel,
  nullif(f.dados->>'inicio','')::date                         as inicio,
  nullif(f.dados->>'prazoDias','')::int                       as prazo_dias,
  case when nullif(f.dados->>'inicio','') is not null
       then current_date - nullif(f.dados->>'inicio','')::date end as dias_decorridos,
  nullif(f.dados->>'orcamento','')::numeric                   as orcamento,
  coalesce(cm.valor_material, 0)                              as custo_material,
  coalesce(ex.valor_extra, 0)                                 as custo_extra,
  coalesce(cm.valor_material, 0) + coalesce(ex.valor_extra,0) as custo_total,
  at.avanco_pct,
  coalesce(r.rdos, 0)                                         as rdos,
  r.ultimo_rdo,
  coalesce(d.demandas_abertas, 0)                             as demandas_abertas
from public.req_projetos p
left join public.prj_fichas f            on f.projeto_id = p.id::text
left join public.v_prj_custo_material cm on cm.projeto_id = p.id::text
left join extra ex                       on ex.projeto_id = p.id::text
left join ativ at                        on at.projeto_id = p.id::text
left join rdo r                          on r.projeto_id = p.id::text
left join dem d                          on d.projeto_id = p.id::text;

-- Indicadores de demandas por semana (abertas x concluídas, lead time).
create or replace view public.v_prj_demandas_semana
with (security_invoker = on) as
select
  date_trunc('week', criado_em)::date                                          as semana,
  coalesce(unidade,'UIS3')                                                     as unidade,
  count(*)                                                                     as criadas,
  count(*) filter (where status = 'concluida')                                 as concluidas,
  round(avg(extract(epoch from (concluido_em - criado_em))/86400)
        filter (where concluido_em is not null)::numeric, 1)                   as dias_medios_resolucao
from public.prj_demandas
group by 1, 2
order by 1 desc;

notify pgrst, 'reload schema';
