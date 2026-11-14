-- =============================================================
-- Busca on-line e pacote compacto do banco de itens
-- =============================================================

-- ---------- busca on-line (enquanto o pacote baixa, ou "Buscar outros") ----------
-- termos em qualquer ordem; -palavra exclui; p_flex = ignora espaços/traços e vírgula = ponto
create or replace function public.req_buscar_itens(p_q text, p_escopo text default 'nucleo',
                                                   p_lim integer default 60, p_flex boolean default true)
  returns table (codigo text, descricao text, un text, ativo boolean, escopo text, usado boolean)
  language plpgsql stable security invoker set search_path = '' as $f$
declare
  toks  text[] := regexp_split_to_array(btrim(privado.norm_txt(left(coalesce(p_q, ''), 200))), '\s+');
  t text; tn text; ta text; prim text := '';
  conds text[] := '{}';
  lim integer := least(greatest(coalesce(p_lim, 60), 1), 200);
  sql text;
begin
  foreach t in array toks loop
    exit when coalesce(array_length(conds, 1), 0) >= 10;
    continue when t = '' or t = '-';
    if left(t, 1) = '-' then
      conds := conds || format('i.busca not like %L', '%' || privado.like_esc(substr(t, 2)) || '%');
      continue;
    end if;
    if prim = '' then prim := t; end if;
    tn := privado.sem_sep(t);
    ta := case when t ~ '[0-9][.,][0-9]' then translate(t, '.,', ',.') else '' end;   -- 2,5 = 2.5
    conds := conds || format('(i.busca like %L%s%s)',
      '%' || privado.like_esc(t) || '%',
      case when p_flex and tn <> '' and tn <> t then format(' or i.busca like %L', '%' || privado.like_esc(tn) || '%') else '' end,
      case when p_flex and ta <> '' then format(' or i.busca like %L', '%' || privado.like_esc(ta) || '%') else '' end);
  end loop;
  if prim = '' then return; end if;
  sql := 'select i.codigo, i.descricao, i.un, i.ativo, i.escopo, i.usado from public.req_itens i where '
      || array_to_string(conds, ' and ')
      || case when p_escopo in ('nucleo', 'outros') then format(' and i.escopo = %L', p_escopo) else '' end
      || format(' order by (i.codigo like %L) desc, i.usado desc, i.ativo desc, (i.busca like %L) desc, strpos(i.busca, %L), length(i.descricao), i.codigo limit %s',
                privado.like_esc(prim) || '%', privado.like_esc(prim) || '%', prim, lim);
  return query execute sql;
end $f$;
comment on function public.req_buscar_itens is 'Busca no banco de itens na nuvem. p_escopo: nucleo | outros | todos.';

-- ---------- pacote: um trecho do banco em texto (código \t descrição \t un [\t 0 = desativado]) ----------
create or replace function public.req_pacote_parte(p_apos text default '', p_lim integer default 50000,
                                                   p_escopo text default 'nucleo')
  returns json language sql stable security invoker set search_path = '' as $f$
  with x as (
    select i.codigo, i.descricao, i.un, i.ativo from public.req_itens i
     where i.codigo > coalesce(p_apos, '')
       and (p_escopo = 'todos' or i.escopo = p_escopo)
     order by i.codigo
     limit least(greatest(coalesce(p_lim, 50000), 1), 60000)
  )
  select json_build_object(
    'n', count(*),
    'ultimo', (select x2.codigo from x x2 order by x2.codigo desc limit 1),
    'tsv', coalesce(string_agg(x.codigo || E'\t' || translate(x.descricao, E'\t\r\n', '   ') || E'\t'
                               || coalesce(x.un, '') || case when x.ativo then '' else E'\t0' end, E'\n' order by x.codigo), ''))
  from x;
$f$;

-- ---------- resumo para a tela "Banco de itens" ----------
create or replace function public.req_itens_resumo()
  returns json language sql stable security invoker set search_path = '' as $f$
  select json_build_object(
    'nucleo',      (select count(*) from public.req_itens where escopo = 'nucleo'),
    'outros',      (select count(*) from public.req_itens where escopo = 'outros'),
    'desativados', (select count(*) from public.req_itens where not ativo),
    'usados',      (select count(*) from public.req_itens where usado),
    'grupos',      (select json_agg(json_build_object('grupo', grupo, 'regras', n) order by grupo)
                      from (select grupo, count(*) n from public.req_itens_regras where ativo group by grupo) g),
    'pacote',      (select valor from public.req_meta where chave = 'pacote'));
$f$;

-- ---------- reaplica as regras (depois de mexer em req_itens_regras) ----------
create or replace function public.req_itens_reclassificar()
  returns json language plpgsql security definer set search_path = '' as $f$
declare n integer;
begin
  if not privado.acesso_liberado() and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'sem acesso' using errcode = '42501';
  end if;
  with novo as (
    select i.codigo, privado.req_item_escopo(i.descricao, i.ativo, i.usado, i.escopo_fixo) e
      from public.req_itens i
  )
  update public.req_itens i set escopo = novo.e, atualizado_em = now()
    from novo where novo.codigo = i.codigo and novo.e is distinct from i.escopo;
  get diagnostics n = row_count;
  return json_build_object('mudaram', n);
end $f$;

revoke execute on function public.req_buscar_itens(text, text, integer, boolean) from anon;
revoke execute on function public.req_pacote_parte(text, integer, text) from anon;
revoke execute on function public.req_itens_resumo() from anon;
revoke execute on function public.req_itens_reclassificar() from anon, public;
grant  execute on function public.req_itens_reclassificar() to authenticated;

-- ---------- Storage: pacote compactado (privado; leitura para quem tem acesso) ----------
insert into storage.buckets (id, name, public) values ('req-pacotes', 'req-pacotes', false)
  on conflict (id) do nothing;
drop policy if exists req_pacotes_ler on storage.objects;
create policy req_pacotes_ler on storage.objects for select to authenticated
  using (bucket_id = 'req-pacotes' and (select privado.acesso_liberado()));
