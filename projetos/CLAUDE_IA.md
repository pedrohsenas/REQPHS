# Claude + banco de projetos

O site grava tudo no Supabase em tabelas simples. O Claude pode **ler, analisar e gravar** nelas, por exemplo planos de ação, metas, demandas e atividades. Há dois níveis de uso.

## Nível 1 — sem configurar nada (já funciona)
No site, toque em **🤖 Contexto p/ Claude** (Painel ou IA) e escolha um pedido pronto:
- **Revisão de sexta**: entrevista curta, as 3 prioridades da semana, riscos e o que delegar ou encerrar.
- **Status para a gerência**: bullets com datas, % de avanço, custo × orçamento e marcos.
- **Plano de ação de projeto atrasado**: 5W2H e metas semanais.

O resumo é copiado e você só precisa colar numa conversa no projeto "Gestão de Projetos" do Claude.

## Nível 2 — Claude conectado ao banco (recomendado)
Conecte o Claude ao Supabase pelo conector/MCP oficial do Supabase, com o projeto `oxhyvaqhbdtvmqvxlqdn`. A partir daí, o Claude consulta as tabelas e views direto e grava o resultado em `prj_ia`, que aparece na aba **IA** do site.

> Segurança: o MCP do Supabase tem acesso amplo ao projeto. Use o modo **read-only** enquanto estiver testando e só libere escrita depois que confiar no fluxo.

### O que o Claude deve ler
| Objeto | Conteúdo |
|---|---|
| `v_prj_resumo` | uma linha por projeto: prazo, dias decorridos, avanço %, custo material + extra, orçamento, RDOs, demandas abertas |
| `v_prj_demandas_semana` | criadas × concluídas por semana e tempo médio de resolução |
| `prj_demandas` | todas as demandas (prioridade, status, prazo, projeto) |
| `prj_rdos` | RDOs (`dados.ocorrencias`, `dados.atividades`, `dados.maoObra`) |
| `prj_fichas` | escopo, atividades, marcos e orçamento (`dados` jsonb) |
| `prj_custos`, `v_prj_custo_material` | custos |

### Onde o Claude escreve
```sql
insert into prj_ia (unidade, projeto_id, tipo, titulo, conteudo, prazo)
values ('UIS3', '<id do projeto ou null>', 'plano_acao',   -- plano_acao | meta | sugestao | controle | entrevista | resumo
        'Destravar drywall e forro',
        '**O quê:** ...\n**Quem:** ...\n**Quando:** ...', '2026-11-06');
```
Para uma demanda nova vinda da entrevista:
```sql
insert into prj_demandas (id, unidade, titulo, prioridade, projeto_id, prazo)
values (gen_random_uuid()::text, 'UIS3', 'Cobrar orçamento do drywall', 'alta', '<id>', '2026-10-29');
```

### Roteiro de entrevista (cole como instrução no projeto do Claude)
1. Ler `v_prj_resumo` e as demandas abertas antes de perguntar qualquer coisa.
2. Fazer **uma pergunta por vez**, no máximo 5, começando pelos projetos com alerta (atrasado, prazo vencido, acima do orçamento).
3. Confirmar comigo antes de gravar. Depois, registrar em `prj_ia` os planos de ação e metas (com prazo) e em `prj_demandas` as tarefas novas.
4. Fechar com um resumo de 5 linhas: o que mudou, os riscos e as 3 prioridades.
5. Ter em mente que o trabalho é prático: nada de burocracia nem planos com mais de 5 ações.
