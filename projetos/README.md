# Projetos UIS 3 — gestão de projetos, demandas e RDO

Endereço: `https://pedrohsenas.github.io/REQPHS/projetos/`

Faz parte do mesmo site das Requisições: **mesmo Supabase (`../config.js`), mesmo login e mesma lista de projetos** (`req_projetos`). Um projeto criado aqui aparece nas Requisições e vice-versa. O custo de material de cada projeto sai sozinho das RMs vinculadas (`req_listas`).

## Instalação (uma vez)

1. Supabase → **SQL Editor** → colar `supabase_projetos.sql` → **Run**. O script cria as tabelas `prj_*`, o bucket privado `rdo-fotos` e as views de análise. Não mexe nas tabelas `req_*`.
2. Abra o endereço no celular e faça login com a mesma conta das Requisições. Depois, no menu do navegador, toque em **Adicionar à tela inicial** para usar como aplicativo.

## O que tem

| Tela | Para quê |
|---|---|
| **Painel** | Demandas abertas/vencidas, concluídas na semana, projetos com alerta, RDOs do mês e ações da IA |
| **Demandas** | Captura em 1 linha + prioridade. Toque no círculo para concluir e no texto para detalhar (prazo, projeto, quem pediu) |
| **Projetos** | Ficha (código, início, prazo, orçamento, escopo), atividades com %, marcos, custos (RM automática + serviços/extras), RDOs, demandas e IA do projeto |
| **RDO** | Formulário no padrão FO 124 1454 005: clima, efetivo (+/−), equipamentos, % das atividades, ocorrências e fotos. Gera o PDF e abre o compartilhamento (WhatsApp) |
| **IA** | Planos de ação, metas e medidas de controle gravados pelo Claude, mais o botão "Contexto p/ Claude" |

### RDO sem retrabalho
- O RDO novo já vem com o clima, o efetivo e os equipamentos do RDO anterior, além dos % atuais das atividades. Você só ajusta o que mudou, escreve as ocorrências e anexa as fotos.
- O % lançado no RDO mais recente atualiza o avanço do projeto.
- As fotos são reduzidas no celular (cerca de 300 kB cada) antes do envio. Sem sinal, elas ficam guardadas no aparelho e sobem sozinhas quando a conexão volta.
- **Compartilhar no WhatsApp** usa o compartilhamento nativo do Android/iOS com o PDF anexado. No computador, o botão baixa o PDF.
- As categorias de mão de obra e de equipamentos podem ser trocadas por projeto em **Editar**.

## Integração com o Claude
Veja `CLAUDE_IA.md`.

## Arquivos
- `index.html`, `projetos.css`, `projetos.js`: aplicativo
- `rdo-pdf.js`: gerador do PDF (pdf-lib, fontes `RQSans` e `logo.png` do site)
- `sw.js`, `manifest.webmanifest`: instalação no celular e abertura sem sinal
- `supabase_projetos.sql`: banco
