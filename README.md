# Requisições de Material — UIS e UIS 3

Site estático (sem servidor) para criar listas de materiais a partir do banco de itens da empresa, com prévia ao vivo da requisição no formato do modelo Excel e impressão direta em PDF para assinatura digital.

## Duas unidades no mesmo site

- O mesmo site atende a **UIS** e a **UIS 3**, com o mesmo banco de itens, a mesma memória de preços e o mesmo layout.
- Requisições (RM/MM) e projetos pertencem a uma unidade. Pessoas e setores são marcados como **UIS**, **UIS 3** ou **Todos** (comuns às duas, ex.: gerentes e coordenadores).
- Cada unidade só enxerga o que é dela e o que está marcado como **Todos**.
- A unidade em uso fica na URL: `…/?u=uis3` ou `…/?u=uis`. Dá para deixar as duas abertas em abas lado a lado.
- Quem faz login com um e-mail cadastrado numa unidade só fica preso a ela. Quem está marcado como **Todos** troca de unidade pelo seletor no topo.

## Supabase

Antes de usar as unidades na nuvem, rode **uma vez** o arquivo `supabase_unidades.sql` no SQL Editor do Supabase. Ele cria as colunas `unidade` (pessoas, setores e projetos) e não apaga nada.

## Histórico por item

No menu superior, **Histórico por item** lista todos os itens já lançados nas requisições da unidade, da data mais recente para a mais antiga. Filtre por **código** (pelo começo do código) ou por **nome** (termos em qualquer ordem). Ao digitar em um campo, o outro fica bloqueado. A tela mostra 30 linhas por vez.
