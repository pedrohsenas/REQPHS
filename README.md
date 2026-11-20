# Requisições de Material — UIS e UIS 3

Site estático (sem servidor) para criar listas de materiais a partir do banco de itens da empresa, com prévia ao vivo da requisição no formato do modelo Excel e impressão direta em PDF para assinatura digital. Inclui a **Gestão de Materiais**: RM concluída → OS do Sadege → OC e previsão → lista de separação no celular do almoxarifado → entregue.

## Duas unidades no mesmo site

- O mesmo site atende a **UIS** e a **UIS 3**, com o mesmo banco de itens, a mesma memória de preços e o mesmo layout.
- Requisições (RM/MM) e projetos pertencem a uma unidade. Pessoas e setores são marcados como **UIS**, **UIS 3** ou **Todos** (comuns às duas, ex.: gerentes e coordenadores).
- Cada unidade só enxerga o que é dela e o que está marcado como **Todos**.
- A unidade em uso fica na URL: `…/?u=uis3` ou `…/?u=uis`. Dá para deixar as duas abertas em abas lado a lado.
- Quem faz login com um e-mail cadastrado numa unidade só fica preso a ela. Quem está marcado como **Todos** troca de unidade pelo seletor no topo.
- **Acesso duplo** (teste/monitoramento): os e-mails da lista `ACESSO_DUPLO` em `app.js` (ou em `acessoDuplo` no `config.js`) podem alternar entre as duas unidades sem aparecer como pessoa da outra. Hoje: `projetoseletrica.uis3@lar.ind.br`.
- LOCAL padrão nas requisições: UIS 3 → `185 - UIS 3`; UIS → `12 - UIS`.

## Supabase

Antes de usar as unidades na nuvem, rode **uma vez** o arquivo `supabase_unidades.sql` no SQL Editor do Supabase. Ele cria as colunas `unidade` (pessoas, setores e projetos) e não apaga nada.

## Banco de itens leve no celular (núcleo × outros)

- No aparelho fica só o **núcleo**: itens de manutenção, engenharia e adm (≈ 244 mil, pacote de ~4 MB). Ficam **só na nuvem** os **outros**: comida e bebida, cortes, embalagens e peças de frigorífico e aviário, sementes, defensivos e ração, roupa sem CA, cama/mesa/banho, cosméticos, cerveja e cigarro, itens de loja e todos os **desativados** (≈ 153 mil). Itens de soja e da UIS (óleo, farelo, lecitina, casca, etiquetas "… UIS") ficam no núcleo mesmo com código de frigorífico.
- O núcleo chega como **um pacote compactado** (`.tsv.gz`, poucos MB) no Storage (`req-pacotes`), gerado pela Edge Function `pacote-itens`. Depois, só as mudanças (conferência leve por `atualizado_em`). Ao reabrir, o banco sai do próprio aparelho em ~1 s.
- **Enquanto o pacote baixa, a busca funciona on-line** (função `req_buscar_itens`), na RM e na Busca de códigos. Aviso azul acima dos resultados.
- **Buscar outros** (caixa na busca da RM e na Busca de códigos): procura **só** nos itens fora do núcleo, direto na nuvem. Os resultados têm o selo OUTROS.
- Item “outros” que entra numa RM (ou ganha preço) passa **sozinho** para o núcleo, para todos.
- As regras ficam na tabela `req_itens_regras` (expressões regulares sobre a descrição em maiúsculas e sem acento). Para ajustar: edite a tabela no Supabase, rode `select public.req_itens_reclassificar();` e depois **Banco de itens → Publicar pacote agora** (ou `select public.req_pacote_publicar();`). Ajuste fino de um item: coluna `escopo_fixo` (`nucleo`/`outros`).
- A importação do `.xlsx` compara com o banco inteiro da nuvem e, no fim, gera o pacote novo para os celulares.
- Se o banco ainda não tiver as funções novas, o app usa o método antigo (lista completa em páginas).

## Gestão de Materiais

Menu **Gestão de Materiais** (`#/materiais`). Fluxo:

1. Conclua a RM e toque em **🔗 Vincular à OS** (na RM, ou em *Vincular RM à OS* na Gestão). Vincule a **RM inteira** (lote) ou só alguns itens (**picados**).
2. Escolha a **OS do Sadege** ou crie uma nova: nº, descrição (tratada como nome do projeto), disciplina e projeto (ou **OS solta**). Um projeto pode ter várias OS, uma por disciplina.
3. Ponha cada item na **OC do fornecedor** (veja abaixo).
4. Quando o material chega do fornecedor, **📥 Receber** (a OC inteira ou só parte dela).
5. Monte a **lista de separação** para o almoxarifado (por RM inteira ou itens picados) e toque em **Enviar ao almoxarifado**. Sai também em **PDF** (A4, checklist) e pelo **Compartilhar** (WhatsApp, e-mail).
6. O almoxarifado marca no celular; a engenharia vê na hora. **Concluir separação** e, quando o material sair, **Marcar entregue**.

Etapas de cada item: **Sem OC → Comprado → Recebido → Em separação → Separado → Entregue**. ⚠ = previsão vencida e ainda não recebido. O **Quadro de OS** coloca cada OS na coluna da etapa mais atrasada dos itens dela. OS de projeto aparecem primeiro, com a faixa do projeto. A aba **Itens** é a lista operacional, com seleção em lote, agrupada **por OS** ou **por OC**. O resumo do projeto mostra as OS dele.

### OC por fornecedor

A OC é um cadastro próprio (`req_oc`): **nº, fornecedor, data do pedido e previsão de entrega**. Ela é emitida por fornecedor, então pode ter **um item só** ou **vários**, inclusive de RMs e OS diferentes.

- **Digitando na linha do item** (aba Itens): nº de uma OC que já existe → o item entra nela na hora. Nº novo → abre o cadastro da OC (fornecedor, pedido, previsão).
- **Em lote**: marque os itens → **🧾 OC** → escolha a OC (busca por nº ou fornecedor) ou **+ Nova OC**. Agrupando **Por OC**, o grupo **Sem OC** fica em cima, com o botão **Pôr numa OC**.
- **Aba OCs**: cada OC com fornecedor, previsão, recebidos/total e as OS que ela atende; filtros *A receber*, *Atrasadas*, *Recebidas*. **+ Nova OC** cadastra a OC e depois **+ Itens** põe os itens nela.
- **Previsão**: é da OC e vale para todos os itens dela. Mudando a previsão na linha de um item, o app pergunta: **a OC inteira** (o fornecedor adiou) ou **só este item** (entrega parcial / saldo → previsão própria).
- **Receber**: na tela da OC, tudo o que falta ou só os selecionados. A data de recebimento fica em cada item.
- **Cancelar OC** devolve os itens para *Sem OC* e guarda a OC; **Excluir** apaga a OC (os itens continuam nas OS, sem OC).
- Uma OC cadastrada sem nº (só o fornecedor) ganha o nº quando ele é digitado na linha de um item dela.

**Almoxarifado:** crie o login da pessoa (Supabase → Authentication → Add user) e cadastre-a em **Cadastros** com papel **Almoxarifado**. Ela entra direto nas listas de separação, não baixa o banco e não aparece como assinante.

## Ajuda e confirmações

- Botão **?** no topo: dicas da tela atual e das outras telas.
- Toda ação que apaga, trava ou envia algo pede confirmação numa tela própria.
- No celular: menu inferior (Início, Códigos, Materiais, Separação, Mais), painéis que sobem de baixo e alvos de toque maiores.

## Scripts do Supabase (`supabase/`)

| Arquivo | O que faz |
|---|---|
| `01_itens_nucleo_outros.sql` | colunas `busca`, `escopo`, `usado` em `req_itens`, regras, índices e promoção automática de itens usados |
| `02_itens_busca_pacote.sql` | busca on-line, pacote em trechos, resumo, reclassificação e bucket `req-pacotes` |
| `03_pacote_publicar.sql` | `req_pacote_publicar()` (chama a Edge Function pelo `pg_net`) |
| `04_gestao_materiais.sql` | tabelas `req_os`, `req_mat`, `req_sep`, `req_sep_itens` e papel **almoxarifado** |
| `05_regras_filtro_v2.sql` | regras v2 do filtro (códigos de frigorífico com número, carnes em qualquer posição, rações, varejo), com exceção para soja/UIS, e reclassificação |
| `06_oc_fornecedor.sql` | OC como cadastro (`req_oc`: nº, fornecedor, pedido, previsão), `req_mat.oc_id` e `data_receb`; o nº em texto no item é mantido pelo banco |
| `functions/pacote-itens/` | Edge Function que gera o pacote `.tsv.gz` |

Os de 01 a 04 e o 06 são aditivos: não apagam nem alteram dados existentes. O 05 só muda o `escopo` dos itens (núcleo/outros); itens já usados em RM nunca saem do núcleo. Todos já foram aplicados no projeto **Requisicoes**.

## Busca de códigos

No menu superior, **Busca de códigos** procura no **banco de itens inteiro** (não só no que já foi lançado). Sem nada digitado, mostra os códigos mais usados nas requisições da unidade.

- **Descrição**: termos em qualquer ordem. `-palavra` exclui; `"frase exata"` entre aspas.
- **Código**: pelo começo (ou em qualquer parte, nos critérios). **Cole uma lista de códigos** (do Excel, um por linha) para conferir todos de uma vez: os que não existem no banco aparecem em vermelho.
- **Critérios**: começa com (família, ex.: CABO, DISJ), sem as palavras, unidade de medida, uso na unidade (já usados / com preço / nunca usados), situação (ativos/desativados) e ordem (relevância, mais usados, código, descrição).
- **Busca flexível** (ligada por padrão): ignora espaços e traços; entende abreviações e plurais (DISJUNTORES acha DISJ, TRAFO acha TRANSFORMADOR, CAIXA acha CX); vírgula = ponto nas medidas (2,5 = 2.5). A lista de abreviações fica em `BC_ABREV` no `app.js`.
- **Chips** de família e unidade abaixo do resumo refinam com um toque.
- **Minhas buscas**: ☆ salva os critérios atuais com um nome (neste navegador).
- Clique no **código** para copiar; **⧉ Cód. + descrição**, **🕘 Histórico** (abre o Histórico por item já filtrado) e **🔍 Google**. **📋 Copiar resultados** leva tudo para colar no Excel.
- No celular, cada código vira um cartão com botões grandes; os critérios ficam recolhidos.

## Histórico por item

No menu superior, **Histórico por item** lista todos os itens já lançados nas requisições da unidade, da data mais recente para a mais antiga. Filtre por **código** (pelo começo do código) ou por **nome** (termos em qualquer ordem). Ao digitar em um campo, o outro fica bloqueado. A tela mostra 30 linhas por vez.

## Botões da requisição

- **⬇ PDF** baixa o PDF direto, em A4 paisagem, sem abrir a impressão. O arquivo é vetorial, com texto pesquisável, e tem cerca de 70 kB. Listas longas quebram de página entre as linhas, como na impressão. Precisa da pasta `fontes/` publicada junto com o site. As bibliotecas (pdf-lib) carregam do jsDelivr no primeiro clique. Se algo falhar, o botão oferece abrir a impressão.
- **🖨️ Imprimir** continua abrindo a impressão do navegador.
- **📊 Resumo MG** baixa um Excel sem formatação para copiar e colar: CÓDIGO, DESCRIÇÃO, quatro colunas em branco (C a F, para preencher no destino), QUANTIDADE, UNIDADE, VALOR UNITÁRIO, VALOR TOTAL. No MM, a quantidade usada é a Qtde mínima.
- **▲ ▼ ✕** ao lado de cada item sobem, descem ou removem o item. Não aparecem na impressão nem no PDF, e a mudança de ordem fica no histórico de edições.

## Projetos, demandas e RDO

Módulo em [`projetos/`](projetos/README.md), no endereço `…/REQPHS/projetos/`. Usa o mesmo banco e o mesmo login. Antes de usar, rode `projetos/supabase_projetos.sql` uma vez.
