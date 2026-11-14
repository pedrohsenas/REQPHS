-- =============================================================
-- Filtro do banco de itens — regras v2 (14/11/2026)
-- Validadas contra o banco real: ~13 mil itens saem do pacote,
-- nenhum item já usado em RM é afetado (usado → sempre núcleo).
-- Itens de soja e da UIS (óleo bruto/refinado, farelo, lecitina,
-- casca, etiquetas "... UIS") ficam no núcleo mesmo com prefixo de frigorífico.
-- =============================================================

-- a regra 1 (prefixos de frigorífico só com traço) passa a ser coberta pela regra A, que tem a exceção da soja
update public.req_itens_regras set ativo = false
 where padrao = '^(ETC|CCFEX|CCF|ETB|EPP|EPF|EPR|EPL|IF|SBB)-';

insert into public.req_itens_regras (grupo, padrao, obs)
select v.grupo, v.padrao, v.obs
  from (values
 ('Frigorífico/indústria de alimentos',
  '^(?!.*(SOJA|\mUIS3?\M|FARELO|LECITIN|DEGOM|OLEO (BRUTO|REFIN)))(ETC|ETB|ETJ|ETP|EPP|EPF|EPR|EPL|EPS|EPC|EPBFP|EPFUN|EPPUN|EFCC|EFRI|CCF|CCFB|CCFEX|CCFT|CCFSEX|CCS|CCSEX|CMS|CMSEX|MCF|MCFEX|MCS|MCSEX|FCCEX|CRF|REPRO|RR|SBB|IF|MP|CB|AM|VEG|COP|CX|ES|REF)[0-9]{0,3} ?- ?',
  'códigos de cortes, embalagens, rótulos e produtos de frigorífico/alimentos (ETC4-, EPFUN-, CX3-, MP-, VEG-); soja e UIS ficam'),
 ('Frigorífico/indústria de alimentos',
  '^(?!.*(SOJA|\mUIS3?\M|FARELO|LECITIN|DEGOM|OLEO (BRUTO|REFIN)))(ETC|ETB|ETJ|ETP|EPP|EPF)[0-9]{0,2} [A-Z(]',
  'os mesmos códigos sem traço (ETJ FIGADO, EPF STEAK)'),
 ('Frigorífico/indústria de alimentos',
  '\m(FRANGOS?|FGO|SASSAMI|SOBRECOXAS?|COXINHAS?|COXAS?|MIUDOS|MOELAS?|FIGADO|SUINOS?|SUINA|BOVINOS?|BOVINA|TILAPIA|GRILLER|SHAWARMA|PERNIL|PAPADA|TOUCINHO|BACON|LINGUICAS?|SALSICHAS?|MORTADELA|PRESUNTO|EMPANAD[OA]S?|EMPANITOS|STEAK|CARTILAG(EM)?|FILEZINHO|CARNE MEC|M\.PEITO|MEIO PEITO|FILE (DE )?PEITO)\M',
  'carnes, cortes e miúdos em qualquer posição (inclui peças de máquinas de frigorífico e aviário)'),
 ('Frigorífico/indústria de alimentos',
  '^(?!.*(SOJA|\mUIS3?\M|FARELO|LECITIN|DEGOM|OLEO (BRUTO|REFIN)))(EPI[0-9]?-(FILME|PLAST)|ET[.-](?!.*(CALIBR|EQUIP|SEGUR|PAINEL|MANUT|INSPE|BLOQUEIO|PERIGO|RISCO|ELETR|PATRIM|LOTO|IDENTIF|\mTAG\M))|EMB\.(?!.*(SOJA|FARELO|OLEO|LECITIN|CASCA|GRAO|BAG)))',
  'filmes de interfolha, etiquetas e embalagens de produto (etiquetas técnicas e de soja ficam)'),
 ('Agro e veterinária',
  '\m(RACAO|RACOES|LACTACAO)\M|^(RVL|RBC|RSC|RSG|RSL)[0-9]* ?-|^CORTE[0-9]+-|^NUCLEO (?!.*(FERRIT|TRAFO|TRANSF|MAGNET|BOBINA|REATOR|SILICIO|BOMBA|VALV|SOLENOIDE|\mACO\M|INOX|CONTATOR|RELE|REDUTOR|COROA|TINTA|BICO|PRODUCAO|ALOJAMENTO|ENGREN|EIXO|MOTOR))|^RC (PEIXE|BOV|SUI|AVE|EQUI|CAO|CAES|GATO|POSTURA|CORTE|LEIT|CAPRIN|OVIN|COELHO|PET)',
  'rações e núcleos para animais (fábrica de ração, granjas)'),
 ('Varejo (supermercado)',
  '^(CERV|REQJ|ESPUM|CIGARROS?)[. ]|^SH(\.| [A-Z+])|^ABS\.(?!.*(PLAST|CHAPA|TUBO|FILAMENTO))|^ANTI-?SEP|^TINT\.|^ESC\.? ?D\.|^CR\.? ?(D\.|BARB|PENT|TRAT|DENTAL|DEPIL|HIDRAT|ALIS|COMB|ACETO|MAOS|PES|FACIAL|NIVEA)|^COND[. ].*([0-9] ?ML\M|[0-9] ?G\M|MAYCRENE|PANTENE|DOVE|SEDA|VULT|PALMOL|HUGGIES|ELSEVE|TRESEMME|SKALA|NIELY|CABELO)|^SAB[. ](?!.*(INDUSTR|GALAO|BOMBONA|\m(5|20|50) ?(L|LT|LTS|LITROS)\M))|^ESMALTE .*\m([0-9]|1[0-5])(,[0-9]+)? ?ML\M|^BALAO [0-9]+ C/ ?[0-9]+',
  'cerveja, cigarro, shampoo, condicionador, sabonete, creme e escova dental, absorvente, esmalte de unha, balão de festa'),
 ('Alimentos e bebidas',
  '^(CROQUETE|ESFIRRA|ESFIRA|ESPETINHO|EMPADA|EMPADINHA|CAFTA|CROISSANT|ENROLADO|SALGADO|SALGADOS|QUIBE|SANDUICHE|TAPIOCA|AROMA|CONDIMENTO|REFRESCO|FERMENTO|TORTILHA|PANQUECA|BLEND)\M|^AMIDO\M(?!.*(P\.A|\mPA\M|SOLUVEL|REAGENTE|ANALIT|LAB))|^FAR (AMENDOA|TRIGO|MANDIOCA|MILHO|ROSCA|LAR|ARROZ|AVEIA|LINHACA|COCO|BANANA|CASTANHA|INTEGRAL)|^REFR (PO|EM PO)\M|^VIN\.(ALCOOL|TINTO|BRANCO|ROSE|LAR)|^MIST (BOLO|[0-9] LEGUMES|LEGUMES|P/ ?BOLO)|^BISC |^TEMP[. ].*([0-9] ?(G|GR|KG|ML)\M|AJINOMOTO|KITANO|ZAELI|TEMPERBOM|SAZON|CHURR|ALHO|ERVAS)',
  'salgados, temperos, farinhas, refrescos e outros alimentos (complemento)')
 ) as v(grupo, padrao, obs)
 where not exists (select 1 from public.req_itens_regras r where r.padrao = v.padrao);

-- reaplica as regras (marca atualizado_em: o app remove os itens do pacote na próxima sincronização)
select public.req_itens_reclassificar();

-- depois: gerar o pacote novo
-- select public.req_pacote_publicar();
