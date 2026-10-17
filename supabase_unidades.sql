-- =============================================================
-- Recursos Materiais — separação por unidade (UIS / UIS 3)
-- Rodar UMA vez no Supabase: SQL Editor → New query → colar → Run.
-- Não apaga nem altera dados existentes.
--   · registros antigos ficam com unidade vazia (NULL) e o site
--     os trata como UIS 3 (pessoas: sugerido pela função);
--   · requisições (req_listas) não precisam de coluna nova:
--     a unidade fica dentro do JSON "dados".
-- =============================================================

alter table public.req_pessoas  add column if not exists unidade text;
alter table public.req_setores  add column if not exists unidade text;
alter table public.req_projetos add column if not exists unidade text;
alter table public.req_projetos add column if not exists status  text;   -- andamento | arquivado
alter table public.req_projetos add column if not exists autor   text;

-- valores aceitos (NULL = registro antigo)
alter table public.req_pessoas  drop constraint if exists req_pessoas_unidade_chk;
alter table public.req_pessoas  add  constraint req_pessoas_unidade_chk
  check (unidade is null or unidade in ('UIS', 'UIS3', 'TODOS'));
alter table public.req_setores  drop constraint if exists req_setores_unidade_chk;
alter table public.req_setores  add  constraint req_setores_unidade_chk
  check (unidade is null or unidade in ('UIS', 'UIS3', 'TODOS'));
alter table public.req_projetos drop constraint if exists req_projetos_unidade_chk;
alter table public.req_projetos add  constraint req_projetos_unidade_chk
  check (unidade is null or unidade in ('UIS', 'UIS3'));

-- faz a API do Supabase enxergar as colunas novas na hora
notify pgrst, 'reload schema';
