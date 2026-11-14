-- =============================================================
-- Banco de itens: NÚCLEO (vai no pacote do celular) × OUTROS
-- (fica só na nuvem, aparece com "Buscar outros").
-- Aditivo: não apaga nem altera dados existentes de req_itens
-- (só acrescenta colunas calculadas). O app antigo continua igual.
-- =============================================================
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- ---------- normalização igual à do app: MAIÚSCULAS, sem acento ----------
create or replace function privado.norm_txt(t text) returns text
  language sql immutable parallel safe set search_path = ''
  as $f$ select upper(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))) $f$;
create or replace function privado.sem_sep(t text) returns text
  language sql immutable parallel safe set search_path = ''
  as $f$ select regexp_replace(coalesce(t, ''), '[[:space:]._/-]+', '', 'g') $f$;
create or replace function privado.like_esc(t text) returns text
  language sql immutable parallel safe set search_path = ''
  as $f$ select replace(replace(replace(coalesce(t, ''), '\', '\\'), '%', '\%'), '_', '\_') $f$;
create or replace function privado.req_item_busca(p_cod text, p_desc text) returns text
  language sql immutable parallel safe set search_path = ''
  as $f$ select privado.norm_txt(p_desc) || ' ' || coalesce(p_cod, '') || ' |' || privado.sem_sep(privado.norm_txt(p_desc)) $f$;

-- ---------- regras: o que NÃO é de manutenção/engenharia/adm de unidade de soja ----------
-- padrao = expressão regular (Postgres) aplicada à descrição em MAIÚSCULAS, sem acento
-- e sem o prefixo de loja "FL." / "FL.BX.". Para ajustar: insert/update/delete aqui
-- e depois  select public.req_itens_reclassificar();
create table if not exists public.req_itens_regras (
  id        bigint generated always as identity primary key,
  grupo     text not null,
  padrao    text not null,
  obs       text,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.req_itens_regras enable row level security;
drop policy if exists req_itens_regras_ler on public.req_itens_regras;
create policy req_itens_regras_ler on public.req_itens_regras for select to authenticated
  using ((select privado.acesso_liberado()));

-- expressão inválida não entra (senão a classificação inteira quebraria)
create or replace function privado.req_regra_validar() returns trigger
  language plpgsql set search_path = '' as $f$
begin
  perform '' ~ new.padrao;
  return new;
end $f$;
drop trigger if exists req_itens_regras_validar on public.req_itens_regras;
create trigger req_itens_regras_validar before insert or update of padrao on public.req_itens_regras
  for each row execute function privado.req_regra_validar();

-- todas as regras ativas numa expressão só (compilada uma vez)
create table if not exists privado.req_regras_cache (
  id     int primary key default 1 check (id = 1),
  regex  text not null default '',
  versao timestamptz not null default now()
);
create or replace function privado.req_regras_recompor() returns trigger
  language plpgsql security definer set search_path = '' as $f$
begin
  insert into privado.req_regras_cache (id, regex, versao)
  values (1, coalesce((select string_agg('(?:' || r.padrao || ')', '|' order by r.id)
                         from public.req_itens_regras r where r.ativo), ''), now())
  on conflict (id) do update set regex = excluded.regex, versao = excluded.versao;
  return null;
end $f$;
drop trigger if exists req_itens_regras_cache on public.req_itens_regras;
create trigger req_itens_regras_cache after insert or update or delete or truncate on public.req_itens_regras
  for each statement execute function privado.req_regras_recompor();

insert into public.req_itens_regras (grupo, padrao, obs) values
('Frigorífico/indústria de alimentos', '^(ETC|CCFEX|CCF|ETB|EPP|EPF|EPR|EPL|IF|SBB)-', 'códigos de cortes, embalagens e rótulos de frigorífico'),
('Frigorífico/indústria de alimentos', '^MEIO (PEITO|ASA|DAS ASAS)\M', 'cortes de frango'),
('Varejo (supermercado)', '^(BISC|CHOC|IOG|BLS|DS|AMAC|SORV|SAND|MIST|BARB|BEB|SALG|EXT)\.', 'marcas de loja: biscoito, chocolate, iogurte, bala, desodorante, amaciante, sorvete, sandália, mistura, barbante'),
('Varejo (supermercado)', '^MAC\.|^MAC (IDALICE|BELL|INST|C/ OVOS|SEMOLA|YAKISSOBA|INTEGRAL|ESPAGUETE)\M', 'macarrão'),
('Varejo (supermercado)', '^(SB\.(PO|LIQ)|SB\.RIOGRANDENSE|LAVA R\.|LAVA ROUPA|LIMPA TAPETE)', 'sabão em pó e lava-roupas de varejo'),
('Varejo (supermercado)', '^(JG\.(CAMA|LENCOL|BANHEIRO|BANHO|PANELAS|BERCO|POTE|COPOS|TACAS|TALHERES|JANTAR|CHA|CAFE|MESA|TOALHA)|CJ\.(TRAM|POTE|ASSADEIRA|FRONHA|MESA|EXT|FAMA))\M', 'jogos de cama, mesa e cozinha'),
('Varejo (supermercado)', '^TELEF\.', 'telefones de loja'),
('Alimentos e bebidas', '^(FRANGO|QJO|QUEIJO|PAO|PAES|LEITE|VINHO|SUCO|MOLHO|DOCE|DOCES|ARROZ|FEIJAO|BATATA|OVO|OVOS|LINGUICA|SALAME|SALSICHA|MORTADELA|BACON|PRESUNTO|APRESUNTADO|CARNE|COSTELA|PEITO|FILE|FILEZINHO|BOLO|PIZZA|LASANHA|PASTEL|COXINHA|BOLINHO|TORTA|CUCA|PANETONE|BOLACHA|WAFER|WAFFER|COOKIES|BALA|PIRULITO|CONFEITO|PACOCA|PICOLE|GELEIA|GELATINA|PUDIM|CEREAL|GRANOLA|AVEIA|FARINHA|FAROFA|ACUCAR|CAFE|CHA|ERVA|AZEITE|AZEITONA|PALMITO|ERVILHA|MILHO|MANDIOCA|CENOURA|ALFACE|BROCOLIS|COUVE|TOMATE|PEPINO|ALHO|UVA|PESSEGO|FIGO|COCO|ACAI|AMENDOIM|PIPOCA|MAIONESE|KETCHUP|MOSTARDA|TEMPERO|CALDO|PIMENTA|ATUM|SARDINHA|PATE|POLPA|NECTAR|COCA|FANTA|ENERGETICO|VODKA|WHISKY|CERVEJA|CACHACA|REFRIGERANTE|WHEY|TORRADA|RECHEIO|IOGURTE|MANTEIGA|MARGARINA|REQUEIJAO|SORVETE|CHOCOLATE|BISCOITO|SALGADINHO|MACARRAO|BANANA|MELANCIA|ABACAXI|MAMAO|MORANGO|CEBOLA|REPOLHO|ABOBORA|BETERRABA|CHUCHU|PEIXE|TILAPIA|CAMARAO|LOMBO|PERNIL|PICANHA|ALCATRA|SOBRECOXA|MOELA|TOUCINHO|TORRESMO|NHOQUE|RAVIOLI|CAPELETTI|EMPANADO|EMPANITOS|HAMBURGUER|NUGGETS|ALMONDEGA|KIBE|ESFIHA|TRUFA|BOMBOM|DOCINHO|SAGU|CANJICA|POLVILHO|FUBA|PE MOLEQUE|MARIA MOLE|VINAGRE|AGUARD|AGUARDENTE|LICOR|ESPUMANTE|ACHOCOLATADO|GOIABADA|AMEIXA|NOZES|PISTACHE|LENTILHA|QUINOA|LINHACA|GERGELIM|OREGANO|COMINHO|COLORAU|SAZON|SHOYU|CEBOLINHA|SALSINHA|MEL)\M', 'comida e bebida'),
('Alimentos e bebidas', '^(MASSA (DE ARROZ|MEZZANI|LAR|PASTEL|FRIREGGIO|PIZZA|LASANHA|FOLHADA)|CREME (DE LEITE|DE CENOURA|DE QUEIJO|DE AVELA|QUEIJO|AVELA|VO)|TEMP (COMP|FOOD|PRONTO|ESP)|MIX (SMART|TORRESMO|SABOR|4 LEGUMES|FRANGO)|CAPS (MELITTA|3 CORACOES|LOR|NESCAFE|DOLCE|TRES)|PROTEINA (DE SOJA|TEXTURIZADA|JASMINE)|REFRIG (LT|LATA|PET|SORTIDO|COCA|GUARANA|SPRITE|FANTA|SCHIN|PEPSI|KUAT|SUKITA|[0-9]))', 'comida e bebida (expressões)'),
('Agro e veterinária', '\mSTE\M', 'sementes (cultivar com STE)'),
('Agro e veterinária', '^(SEMENTE|SEMENTES|SEM ISLA|HERBICIDA|FUNGICIDA|INSETICIDA|ACARICIDA|NEMATICIDA|ADUBO|FERTILIZANTE|FERTIPAR|YARA|MOSAIC|AGRITER|STOLLER|INOCULANTE|VACINA|RACAO|PREMIX|PX|MUDAS|MUDA|LEITOES|SOJA|TRIGO|SORGO|CANOLA|BRACHIARIA|CAPIM|UREIA|VERMIFUGO|CARRAPATICIDA|MIX DE SEMENTES|SAL MINERAL|SUPLEMENTO MINERAL|BOLSA SECA|AVES (MATRIZES|MACHO|POSTURA|CORTE)|SUPER (SIMPLES|TRIPLO))\M', 'sementes, defensivos, fertilizantes, ração, vacinas, animais'),
('Agro e veterinária', '^(HERB|FUNG|INOC)\.|^BRINCO (P/|BOV|SUINO)|^VAC(\.| )(?!.*(LATAO|VISOR|NPT|BSP|\mBAR\M|PSI|MANOM|VACUO|INOX|GLIC|VERT|DIAL|[0-9] ?MM|ORDENH|ORDENE))', 'defensivos, inoculantes, vacinas, brincos de gado'),
('Vestuário e acessórios', '^(CALCA|BLUSA|BLUSAO|CAMISETA|CAMISETE|VESTIDO|SAIA|BERMUDA|SHORTS|SHORT|CASACO|JAQUETA|BLAZER|MOLETON|MOLETOM|CUECA|CALCINHA|SUTIA|PIJAMA|CAMISOLA|CAPRI|MARIA JOAO|BABY LOOK|REGATA|LEGGING|BIQUINI|MAIO|SUNGA|GRAVATA|CHINELO|SANDALIA|SAPATILHA|TENIS|PULSEIRA|BRINCO|BOLSA (EDI|TIQUINHO|FEMININA|DE MAO|INFANTIL)|MEIA (INF|SELENE|ESPORTIVA|ESP|MASC|FEM|SOQUETE|CANO|CALCA|SOCIAL|LUPO|TRIFIL)|FRALDA|CAMISA (SOC|POLO|POL|M/L|M/C|MANGA|MASC|FEM|INF|TAM|T\.|URBANO|VERAO|XADREZ|JEANS|SOCIAL|BASICA|ESTAMP|POSTO|VERMELHA|AZUL|BRANCA|PRETA|CINZA|VERDE|AMARELA))\M(?!.*(\mCA ?[0-9]|SEGURANCA|\mEPI\M|ANTICHAMA|ANTI-CHAMA|ARCO ELETRICO|NR-?10|BRIGADA|ALTA VISIBILIDADE|REFLETIV|IMPERMEAVEL|\mPVC\M|NITRIL|RASPA|CILINDRO|PISTAO|MOTOR|BOMBA|INOX|\mACO\M|REFRIGERACAO|\mEIXO\M|MANCAL|HIDR|PNEUMAT|ROLAMENTO|PRENSA|GAXETA|JUNTA|DES:|DIGESTOR|VALV|CHAPA|ALUMINIO|QUEBRADOR|MANUT|ALTO RISCO|TERMIC|ISOLA|SOLDA|SOLDADOR))', 'roupas, calçados e acessórios (EPI com CA continua)'),
('Casa, cama, mesa e lazer', '^(FRONHA|EDREDON|EDREDOM|COLCHA|COBERTOR|COBRELEITO|TRAVESSEIRO|PANELA|CACAROLA|ASSADEIRA|FRIGIDEIRA|LEITEIRA|FORMINHA|TACA|FLOR|ORQUIDEA|CACHEPO|BONECA|BRINQUEDO|BICICLETA|PATINETE|GUARDANAPO|FAQUEIRO|SOUSPLAT|ENFEITE)\M', 'casa, cama/mesa/banho, decoração, brinquedos'),
('Casa, cama, mesa e lazer', '^LENCOL (?!.*(ISOLANTE|\mPVC\M|BORRACHA|INDUSTRIAL|EMBORRACH|[0-9] ?KV|NEOPRENE|LONA|APARADOR))', 'lençol de cama'),
('Casa, cama, mesa e lazer', '^(COBRE LEITO|TOALHA (BANHO|ROSTO|LAVABO|SOCIAL|P/PES|PES|MESA|PRAIA|INFANTIL|FACE|CAMESA|KARSTEN|DOHLER|JURITEX|VALLETEX|ATLANTICA|LEPPER|BUETTNER|SANTISTA|TEKA)|PLANTA (?!BAIXA|INDUSTRIAL|PILOTO)|BOLA (LIDER|VOLEI|FUTEBOL|COURO|MUNDI|BASQUETE|INFANTIL|DE IZOPOR)|CARRINHO (SM|ADJOMAR|REVAL|BURIGOTTO|SILMAR|TILIN|BEBE|BRINQ|BONECA|INFANTIL)|VELA (AROMAT|DECOR|ANIV|PERFUM)|CANECA (OXFORD|PLASDURAN|PORCELANA|CERAMICA|INFANTIL|PERSONALIZADA)|COPO (BOTECO|PLASTILANIA|CHICLETE|INFANTIL|CERVEJA|AMERICANO)|PORTA RETRATO|QUADRO DECORATIVO|ARVORE DE NATAL|PISCA PISCA|CESTA (BAMBU|VIME|SIMOVEL|PACOTE|NAIKITS|GRAMADENSE|DE NATAL|BASICA))', 'casa, cama/mesa/banho, decoração, brinquedos (expressões)'),
('Casa, cama, mesa e lazer', '^CORTINA (?!AR\M|PVC|DE AR|DE LUZ|LUZ|SEGURANCA|INDUSTRIAL|FITA|TIRA|ROLO)|^TAPETE (?!.*(BORRACHA|ISOLANTE|INDUSTRIAL|VINIL|TRAMA|CAPACHO|ANTIDERRAPANTE|\mPVC\M|SANITIZANTE))|^PRATO (BIG|FESTA|ANIV|RASO|FUNDO|SOBREMESA|PORCELANA|DURALEX|DUR\.|GERMER|LAMINADO|PAPELAO|DESCARTAVEL|DECORADO|FESTCOLOR|BRINK|CERAMICA|VIDRO|RED|H RASO|PLASTICO|INFANTIL)', 'cortina, tapete e prato de uso doméstico'),
('Higiene pessoal e beleza', '^(DESOD|SHAMP|SHAMPOO|CONDICIONADOR|CR (TRAT|DENTAL|DEPILAT|HIDRAT|PENTEAR)|CREME (NIVEA|DENTAL|HIDRAT|FACIAL|VULT|DEPIL)|ESC (DENT|CABELO)|ESCOVA (DENT|CABELO)|TINT |ESM |BATOM|PERFUME|MAQUIAGEM|ABSORVENTE|LENCO UMEDECIDO|HIDRATANTE|GEL (POS|COND|FIX|SEDA|CAPILAR)|MASC (CAP|BIO|PREBIOTICO|TRAT|MEU|MAIS))', 'cosméticos e higiene pessoal de loja'),
('Serviços de outras áreas', '^VT ', 'vale-transporte');

-- ---------- colunas novas em req_itens ----------
alter table public.req_itens
  add column if not exists busca       text,
  add column if not exists escopo      text    not null default 'nucleo',
  add column if not exists escopo_fixo text,
  add column if not exists usado       boolean not null default false;
alter table public.req_itens drop constraint if exists req_itens_escopo_chk;
alter table public.req_itens add  constraint req_itens_escopo_chk check (escopo in ('nucleo', 'outros'));
alter table public.req_itens drop constraint if exists req_itens_escopo_fixo_chk;
alter table public.req_itens add  constraint req_itens_escopo_fixo_chk check (escopo_fixo is null or escopo_fixo in ('nucleo', 'outros'));
comment on column public.req_itens.escopo is 'nucleo = vai no pacote do celular; outros = só na nuvem (Buscar outros)';
comment on column public.req_itens.escopo_fixo is 'ajuste manual: força nucleo/outros acima das regras';
comment on column public.req_itens.usado is 'já entrou em alguma requisição ou tem preço: fica sempre no núcleo';

-- ordem: ajuste manual > desativado (outros) > já usado (núcleo) > regras
create or replace function privado.req_item_escopo(p_desc text, p_ativo boolean, p_usado boolean, p_fixo text)
  returns text language plpgsql stable security definer set search_path = '' as $f$
declare rx text;
begin
  if p_fixo in ('nucleo', 'outros') then return p_fixo; end if;
  if p_ativo is false then return 'outros'; end if;
  if p_usado then return 'nucleo'; end if;
  select c.regex into rx from privado.req_regras_cache c where c.id = 1;
  if coalesce(rx, '') = '' then return 'nucleo'; end if;
  return case when regexp_replace(privado.norm_txt(p_desc), '^FL\. ?(BX\. ?)?', '') ~ rx then 'outros' else 'nucleo' end;
end $f$;

create or replace function privado.req_itens_preparar() returns trigger
  language plpgsql security definer set search_path = '' as $f$
begin
  new.busca  := privado.req_item_busca(new.codigo, new.descricao);
  new.escopo := privado.req_item_escopo(new.descricao, new.ativo, new.usado, new.escopo_fixo);
  -- mudou de lado (núcleo ↔ outros): o celular percebe na conferência leve
  if tg_op = 'UPDATE' and new.escopo is distinct from old.escopo
     and coalesce(current_setting('app.sem_relogio', true), '') <> 'on' then
    new.atualizado_em := now();
  end if;
  return new;
end $f$;
drop trigger if exists req_itens_preparar on public.req_itens;
create trigger req_itens_preparar before insert or update of codigo, descricao, ativo, usado, escopo_fixo
  on public.req_itens for each row execute function privado.req_itens_preparar();

-- ---------- item usado em requisição (ou com preço) vira núcleo sozinho ----------
create or replace function privado.req_marcar_usados(p_cods text[]) returns void
  language sql security definer set search_path = '' as $f$
  update public.req_itens set usado = true where codigo = any(p_cods) and not usado;
$f$;
create or replace function privado.req_listas_usados() returns trigger
  language plpgsql security definer set search_path = '' as $f$
declare cods text[];
begin
  if jsonb_typeof(new.dados -> 'itens') <> 'array' then return null; end if;
  select array_agg(distinct btrim(e ->> 'codigo')) into cods
    from jsonb_array_elements(new.dados -> 'itens') e
   where coalesce(btrim(e ->> 'codigo'), '') not in ('', 'S/ CÓD.');
  if cods is not null then perform privado.req_marcar_usados(cods); end if;
  return null;
end $f$;
drop trigger if exists req_listas_usados on public.req_listas;
create trigger req_listas_usados after insert or update of dados on public.req_listas
  for each row execute function privado.req_listas_usados();

create or replace function privado.req_precos_usados() returns trigger
  language plpgsql security definer set search_path = '' as $f$
begin
  if new.chave like 'C:%' then perform privado.req_marcar_usados(array[substr(new.chave, 3)]); end if;
  return null;
end $f$;
drop trigger if exists req_precos_usados on public.req_precos;
create trigger req_precos_usados after insert or update on public.req_precos
  for each row execute function privado.req_precos_usados();

-- ---------- metadados (pacote publicado etc.) ----------
create table if not exists public.req_meta (
  chave         text primary key,
  valor         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.req_meta enable row level security;
drop policy if exists req_meta_equipe on public.req_meta;
create policy req_meta_equipe on public.req_meta for all to authenticated
  using ((select privado.acesso_liberado())) with check ((select privado.acesso_liberado()));

-- ---------- carga inicial (sem mexer no relógio: o app antigo não rebaixa nada) ----------
select set_config('app.sem_relogio', 'on', true);
insert into privado.req_regras_cache (id) values (1) on conflict do nothing;
update privado.req_regras_cache set regex = coalesce((select string_agg('(?:' || padrao || ')', '|' order by id)
  from public.req_itens_regras where ativo), ''), versao = now() where id = 1;

with cods as (
  select distinct btrim(e ->> 'codigo') c
    from public.req_listas l, jsonb_array_elements(case when jsonb_typeof(l.dados -> 'itens') = 'array' then l.dados -> 'itens' else '[]'::jsonb end) e
  union
  select substr(chave, 3) from public.req_precos where chave like 'C:%'
)
update public.req_itens i set usado = true from cods where i.codigo = cods.c and not i.usado;

update public.req_itens set descricao = descricao where busca is null;

-- ---------- índices ----------
create index if not exists req_itens_busca_trgm   on public.req_itens using gin (busca extensions.gin_trgm_ops);
create index if not exists req_itens_escopo_cod   on public.req_itens (escopo, codigo);
create index if not exists req_itens_atualizado   on public.req_itens (atualizado_em, codigo);
analyze public.req_itens;
