-- =============================================================
-- Check-in de turno (entrevista) + campo estruturado nos registros da IA
-- Rodar UMA vez no Supabase (SQL Editor). Só cria; não apaga nada.
-- =============================================================

create table if not exists public.prj_checkins (
  id            text primary key,
  unidade       text default 'UIS3',
  data          date not null default current_date,
  turno         text not null,                       -- manha | tarde | noite
  dados         jsonb not null default '{}'::jsonb,  -- respostas estruturadas (ver CLAUDE_IA.md)
  duracao_seg   integer,                             -- tempo gasto no preenchimento
  autor         text,
  criado_em     timestamptz not null default now()
);
create index if not exists prj_checkins_data_idx on public.prj_checkins (unidade, data desc);

alter table public.prj_checkins enable row level security;
drop policy if exists prj_checkins_autenticado on public.prj_checkins;
create policy prj_checkins_autenticado on public.prj_checkins
  for all to authenticated using (true) with check (true);

-- prioridades estruturadas do relatório diário (o app usa para sugerir o plano)
alter table public.prj_ia add column if not exists dados jsonb;

-- Visão "plana" de cada check-in, para análise (Claude / painéis)
create or replace view public.v_prj_checkins
with (security_invoker = on) as
select
  c.id, coalesce(c.unidade,'UIS3') as unidade, c.data, c.turno, c.criado_em, c.duracao_seg,
  case when jsonb_typeof(c.dados->'energia') = 'number' then (c.dados->>'energia')::int end        as energia,
  case when jsonb_typeof(c.dados->'foco')    = 'number' then (c.dados->>'foco')::int end           as foco,
  (select coalesce(sum(case when jsonb_typeof(a->'horas') = 'number' then (a->>'horas')::numeric else 0 end),0)
     from jsonb_array_elements(coalesce(c.dados->'alocacao','[]'::jsonb)) a)                       as horas_registradas,
  (select count(*) from jsonb_array_elements(coalesce(c.dados->'plano_anterior','[]'::jsonb)) p)    as itens_planejados,
  (select count(*) from jsonb_array_elements(coalesce(c.dados->'plano_anterior','[]'::jsonb)) p
     where p->>'resultado' = 'feito')                                                               as itens_feitos,
  c.dados->'interrupcoes'->>'faixa'                                                                 as interrupcoes,
  (select count(*) from jsonb_array_elements(coalesce(c.dados->'bloqueios','[]'::jsonb)) b)        as bloqueios,
  (select count(*) from jsonb_array_elements(coalesce(c.dados->'novas_demandas','[]'::jsonb)) n)   as novas_demandas,
  c.dados->>'nota'                                                                                  as nota
from public.prj_checkins c;

-- Horas por frente de trabalho (projeto ou categoria), por dia
create or replace view public.v_prj_horas_dia
with (security_invoker = on) as
select c.data, coalesce(c.unidade,'UIS3') as unidade,
       a->>'tipo' as tipo, a->>'id' as id, a->>'nome' as nome,
       sum(case when jsonb_typeof(a->'horas') = 'number' then (a->>'horas')::numeric else 0 end) as horas
from public.prj_checkins c
cross join lateral jsonb_array_elements(coalesce(c.dados->'alocacao','[]'::jsonb)) a
group by 1,2,3,4,5;

notify pgrst, 'reload schema';
