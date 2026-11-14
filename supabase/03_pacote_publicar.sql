-- =============================================================
-- Publicação do pacote compacto (Edge Function "pacote-itens")
-- O app (ou o próprio banco) chama  select public.req_pacote_publicar();
-- e o banco pede à Edge Function para gerar o .gz no Storage.
-- =============================================================
create extension if not exists pg_net with schema extensions;

create table if not exists privado.segredos (
  nome  text primary key,
  valor text not null
);
insert into privado.segredos (nome, valor)
  values ('pacote', encode(extensions.gen_random_bytes(24), 'hex'))
  on conflict (nome) do nothing;

-- a Edge Function confere a chave que o banco mandou (só o service_role chama)
create or replace function public.req_pacote_chave_ok(p_chave text) returns boolean
  language sql stable security definer set search_path = '' as $f$
  select exists (select 1 from privado.segredos s where s.nome = 'pacote' and s.valor = p_chave)
$f$;
revoke execute on function public.req_pacote_chave_ok(text) from public, anon, authenticated;
grant  execute on function public.req_pacote_chave_ok(text) to service_role;

-- pede a geração do pacote (assíncrono: o app acompanha por req_meta 'pacote')
create or replace function public.req_pacote_publicar() returns bigint
  language plpgsql security definer set search_path = '' as $f$
declare rid bigint;
begin
  if not privado.acesso_liberado() and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'sem acesso' using errcode = '42501';
  end if;
  select net.http_post(
           url     := 'https://oxhyvaqhbdtvmqvxlqdn.supabase.co/functions/v1/pacote-itens',
           headers := jsonb_build_object('Content-Type', 'application/json',
                                         'x-pacote-chave', (select s.valor from privado.segredos s where s.nome = 'pacote')),
           body    := '{}'::jsonb,
           timeout_milliseconds := 150000)
    into rid;
  return rid;
end $f$;
revoke execute on function public.req_pacote_publicar() from public, anon;
grant  execute on function public.req_pacote_publicar() to authenticated;
