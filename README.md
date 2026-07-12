# Requisições de Material — UIS3

Site estático (sem servidor) para criar listas de materiais a partir do banco de itens da empresa, com prévia ao vivo da requisição no formato do modelo Excel e impressão direta em PDF para assinatura digital.

## O que ele faz

- **Busca instantânea em 184 mil itens** sem abrir o Excel: o .xlsx é importado uma vez e fica salvo no próprio navegador (IndexedDB). A busca aceita vários termos em qualquer ordem, ignora acentos e, opcionalmente, espaços/traços ("2,5MM" encontra "2,5 MM").
- **Listas de requisição** com título, vinculáveis a **projetos** (com resumo consolidado de valores e materiais).
- **Prévia A4 ao vivo** idêntica ao formulário "REQUISIÇÃO DE MATERIAL": código e unidade vêm do banco; quantidade e preço você digita direto na folha.
- **Memória de preços**: o último preço unitário usado para um item é sugerido automaticamente nas próximas listas; editar o preço atualiza a memória.
- **Assinaturas por alçada**: até R$ 3.000 → Pedro + Alex; até R$ 20.000 → Pedro + Alex + Jaisson; acima → Alex + Jaisson + Ademilson. Cada bloco tem um seletor para trocar manualmente por qualquer pessoa da lista.
- **Gerar PDF**: botão que abre a impressão do navegador (Destino → "Salvar como PDF"). Os campos editáveis saem como texto normal, no layout do modelo.
- **Backup**: exporta/importa um .json com todas as listas, projetos e preços.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub (pode ser **público**, desde que você NÃO suba o banco da empresa — veja abaixo).
2. Envie os arquivos desta pasta (`index.html`, `style.css`, `app.js`, `dados/`, `conversor/`).
3. No repositório: **Settings → Pages → Source: Deploy from a branch → Branch: main / (root) → Save**.
4. Em ~1 minuto o site estará em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

## Carregar o banco de itens (escolha UMA das opções)

**Opção A — recomendada (repositório público, dados privados):**
Abra o site → botão **"Banco de itens"** → selecione o .xlsx da empresa. A conversão acontece no navegador (leva alguns segundos para 19 MB) e os itens ficam salvos localmente. Nada é enviado para a internet. Repita quando quiser atualizar o banco.

**Opção B — repositório PRIVADO:**
Gere o `dados/banco.json` com o conversor e faça commit; o site carrega o banco sozinho em qualquer navegador:

```bash
pip install openpyxl
python conversor/converte_banco.py "RelacaoDeProdutos.xlsx"
```

> ⚠️ **Nunca** faça commit do banco da empresa em repositório público: qualquer pessoa poderia baixá-lo. GitHub Pages de repositório privado exige plano pago; na dúvida, use a Opção A.

## Onde ficam os meus dados

Listas, projetos e histórico de preços ficam no `localStorage` do navegador; o banco de itens fica no IndexedDB. Ou seja: **por navegador/computador**. Use o botão **Backup** para transferir para outra máquina ou se resguardar contra limpeza de dados do navegador.

## Dicas de uso

- No campo de busca, **Enter adiciona o primeiro resultado**; ↑/↓ navegam; clique também adiciona.
- Preços aparecem em **verde** nos resultados quando já existem no histórico.
- "Item avulso (S/ CÓD.)" cadastra materiais fora do banco, como no seu modelo.
- Quantidade e preço aceitam vírgula decimal (padrão brasileiro).
- Para o nome do arquivo PDF sair igual ao título da lista, o botão "Gerar PDF" já ajusta o título da página antes de imprimir.
