/* ============================================================
   ui.js — peças de interface compartilhadas
   · confirmar(): tela de confirmação (no lugar do confirm do navegador)
   · perguntar(): um campo de texto (no lugar do prompt)
   · folha(): painel que sobe de baixo no celular / janela no computador
   · ajuda: botão "?" com dicas da tela atual
   · menu do celular: barra inferior + "Mais"
   Carregado ANTES do app.js: aqui só há declarações; as funções usam
   esc(), $(), toast()… do app.js na hora em que são chamadas.
   ============================================================ */
"use strict";

/* ---------- confirmação ----------
   opc: { titulo, texto (HTML já escapado), detalhes: [HTML], ok, cancelar, perigo, icone }
   devolve true (confirmou) ou false */
function confirmar(opc = {}) {
  return new Promise((resolve) => {
    const anterior = document.activeElement;
    const cx = document.createElement("div");
    cx.className = "modal no-print conf";
    cx.setAttribute("role", "alertdialog");
    cx.setAttribute("aria-modal", "true");
    cx.innerHTML = `<div class="modal-caixa conf-caixa${opc.perigo ? " perigo" : ""}">
      <div class="conf-cab">${opc.icone ? `<span class="conf-ico" aria-hidden="true">${opc.icone}</span>` : ""}<h2>${esc(opc.titulo || "Confirmar")}</h2></div>
      ${opc.texto ? `<div class="conf-texto">${opc.texto}</div>` : ""}
      ${opc.detalhes && opc.detalhes.length ? `<ul class="conf-lista">${opc.detalhes.map(d => `<li>${d}</li>`).join("")}</ul>` : ""}
      <div class="conf-acoes">
        <button type="button" class="btn sec" data-r="0">${esc(opc.cancelar || "Cancelar")}</button>
        <button type="button" class="btn${opc.perigo ? " perigo-cheio" : ""}" data-r="1">${esc(opc.ok || "Confirmar")}</button>
      </div>
    </div>`;
    document.body.appendChild(cx);
    const fim = (v) => {
      cx.remove();
      document.removeEventListener("keydown", tecla, true);
      if (anterior && anterior.focus) try { anterior.focus(); } catch { /* sem foco */ }
      resolve(v);
    };
    const tecla = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fim(false); }
    };
    document.addEventListener("keydown", tecla, true);
    cx.addEventListener("click", (e) => {
      if (e.target === cx) return fim(false);
      const b = e.target.closest("[data-r]");
      if (b) fim(b.dataset.r === "1");
    });
    /* ação destrutiva: o foco começa no "Cancelar" (Enter não apaga sem querer) */
    setTimeout(() => cx.querySelector(opc.perigo ? '[data-r="0"]' : '[data-r="1"]').focus(), 0);
  });
}

/* ---------- escolha entre opções (ex.: só este item × a OC inteira) ----------
   opc: { titulo, texto (HTML), icone, opcoes: [{ v, rot, sub }], cancelar }
   devolve o v escolhido, ou null */
function escolher(opc = {}) {
  return new Promise((resolve) => {
    const anterior = document.activeElement;
    const cx = document.createElement("div");
    cx.className = "modal no-print conf";
    cx.setAttribute("role", "alertdialog");
    cx.setAttribute("aria-modal", "true");
    cx.innerHTML = `<div class="modal-caixa conf-caixa">
      <div class="conf-cab">${opc.icone ? `<span class="conf-ico" aria-hidden="true">${opc.icone}</span>` : ""}<h2>${esc(opc.titulo || "Escolha")}</h2></div>
      ${opc.texto ? `<div class="conf-texto">${opc.texto}</div>` : ""}
      <div class="conf-ops">${(opc.opcoes || []).map((o, i) => `<button type="button" class="conf-op${i ? "" : " prim"}" data-i="${i}">
        <strong>${esc(o.rot)}</strong>${o.sub ? `<small>${esc(o.sub)}</small>` : ""}</button>`).join("")}</div>
      <div class="conf-acoes"><button type="button" class="btn sec" data-i="-1">${esc(opc.cancelar || "Cancelar")}</button></div>
    </div>`;
    document.body.appendChild(cx);
    const fim = (v) => {
      cx.remove();
      document.removeEventListener("keydown", tecla, true);
      if (anterior && anterior.focus) try { anterior.focus(); } catch { /* sem foco */ }
      resolve(v);
    };
    const tecla = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fim(null); } };
    document.addEventListener("keydown", tecla, true);
    cx.addEventListener("click", (e) => {
      if (e.target === cx) return fim(null);
      const b = e.target.closest("[data-i]"); if (!b) return;
      const i = +b.dataset.i;
      fim(i < 0 ? null : opc.opcoes[i].v);
    });
    setTimeout(() => { const b = cx.querySelector(".conf-op"); if (b) b.focus(); }, 0);
  });
}

/* ---------- um campo de texto ---------- */
function perguntar(titulo, rotulo, valor = "", opc = {}) {
  return formulario(titulo, [{ nome: "v", rot: rotulo, ph: opc.ph || "", ajuda: opc.ajuda || "", attrs: opc.attrs || "" }],
    { v: valor }, (v) => (opc.obrigatorio && !v.v.trim()) ? (opc.erro || "Preencha o campo.") : "")
    .then(r => r ? r.v.trim() : null);
}

/* ---------- painel (folha que sobe no celular, janela larga no computador) ----------
   devolve { el, corpo, fechar } — fechar(valor) resolve a promessa "fechou" */
function folha({ titulo = "", classe = "", largura = 760 } = {}) {
  const cx = document.createElement("div");
  cx.className = "modal no-print folha-modal " + classe;
  cx.innerHTML = `<div class="folha-caixa" style="--larg:${largura}px" role="dialog" aria-modal="true">
    <div class="folha-cab"><h2>${esc(titulo)}</h2><button type="button" class="folha-x" aria-label="Fechar" data-fechar-folha>✕</button></div>
    <div class="folha-corpo"></div>
  </div>`;
  document.body.appendChild(cx);
  document.body.classList.add("com-folha");
  let resolver;
  const fechou = new Promise(r => { resolver = r; });
  const fechar = (v = null) => {
    if (!cx.isConnected) return;
    cx.remove();
    if (!document.querySelector(".folha-modal")) document.body.classList.remove("com-folha");
    document.removeEventListener("keydown", tecla, true);
    resolver(v);
  };
  const tecla = (e) => { if (e.key === "Escape" && document.querySelector(".folha-modal:last-of-type") === cx && !document.querySelector(".conf")) { e.preventDefault(); fechar(null); } };
  document.addEventListener("keydown", tecla, true);
  cx.addEventListener("click", (e) => { if (e.target === cx || e.target.closest("[data-fechar-folha]")) fechar(null); });
  return { el: cx, corpo: cx.querySelector(".folha-corpo"), fechar, fechou };
}

/* ============================================================
   AJUDA — dicas por tela (botão "?" no topo)
   ============================================================ */
const AJUDA = {
  inicio: {
    titulo: "Início",
    dicas: [
      "<strong>+ Requisição (RM)</strong> cria uma lista de materiais; <strong>+ Cadastro Mín/Máx (MM)</strong> cria o formulário de mínimos e máximos.",
      "Agrupe as listas em <strong>projetos</strong>. O resumo do projeto soma os materiais de todas as listas e mostra as OS de cada disciplina.",
      "O filtro <strong>👤 Meus / 👥 Todos</strong> escolhe de quem são os cartões; a ordem é pela data de criação.",
      "Cartão verde = requisição concluída (travada para edição; PDF e impressão continuam liberados).",
    ],
  },
  editor: {
    titulo: "Requisição (RM / MM)",
    dicas: [
      "Digite na busca (à esquerda; no celular, acima da folha) e toque no resultado para incluir. <strong>Enter</strong> inclui o primeiro. <strong>Ctrl+K</strong> volta para a busca.",
      "Vários termos, em qualquer ordem: <em>cabo pp 4x2,5</em>. Acentos são ignorados. Amarelo = já usado antes; preço em verde = último preço registrado.",
      "Não achou? Marque <strong>Buscar outros</strong>: procura nos itens que não são de manutenção (comida, roupa, agro, loja…), direto na nuvem. Um item “outros” que entra numa RM passa a fazer parte do banco de manutenção para todos.",
      "Enquanto o banco ainda está baixando no aparelho, a busca funciona <strong>on-line</strong> (aviso azul acima dos resultados).",
      "Quantidade e valor se editam direto na folha. <strong>▲ ▼ ✕</strong> mudam a ordem ou removem o item.",
      "Ao terminar, marque <strong>Concluída</strong>: a folha trava e o botão <strong>🔗 Vincular à OS</strong> manda os itens para a Gestão de Materiais.",
      "<strong>⬇ PDF</strong> baixa o documento em A4 paisagem; <strong>🖨️ Imprimir</strong> abre a impressão; <strong>📊 Resumo MG</strong> gera o Excel para colar.",
    ],
  },
  codigos: {
    titulo: "Busca de códigos",
    dicas: [
      "Procura no banco de itens inteiro (não só no que já foi lançado). Sem nada digitado, mostra os códigos mais usados na unidade.",
      "<code>-palavra</code> exclui; <code>\"frase exata\"</code> entre aspas. Cole uma lista de códigos do Excel no campo Código para conferir todos de uma vez.",
      "<strong>Buscar outros</strong> procura só nos itens fora da manutenção, direto na nuvem.",
      "Toque no código para copiar. <strong>⧉ Cód. + descrição</strong>, <strong>🕘 Histórico</strong> e <strong>🔍 Google</strong> ficam em cada linha.",
      "☆ <strong>Salvar esta busca</strong> guarda os critérios com um nome (neste aparelho).",
    ],
  },
  historico: {
    titulo: "Histórico por item",
    dicas: [
      "Todos os itens já lançados nas requisições da unidade, do mais recente para o mais antigo, com preços.",
      "Filtre por código (pelo começo) ou por nome (termos em qualquer ordem). Ao digitar num campo, o outro fica bloqueado.",
    ],
  },
  materiais: {
    titulo: "Gestão de Materiais",
    dicas: [
      "<strong>Fluxo:</strong> RM concluída → <strong>Vincular à OS</strong> (a RM inteira ou só alguns itens) → cada item vai para a <strong>OC do fornecedor</strong> → <strong>recebido</strong> → <strong>lista de separação</strong> para o almoxarifado → <strong>entregue</strong>.",
      "<strong>OC por fornecedor:</strong> uma OC pode ter <strong>um item só</strong> ou <strong>vários</strong>, de RMs e OS diferentes. Digite o nº da OC na linha do item: se a OC já existe, o item entra nela; se é nova, abre o cadastro (fornecedor, pedido, previsão).",
      "Para pôr vários itens na mesma OC de uma vez: marque os itens → <strong>🧾 OC</strong>. Na aba Itens, <strong>Por OC</strong> agrupa a lista pelas OCs, com os <strong>Sem OC</strong> em cima.",
      "A <strong>previsão</strong> é da OC e vale para todos os itens dela. Se só parte chegar depois (saldo), mude a previsão na linha e escolha <strong>Só este item</strong>.",
      "<strong>Quadro</strong>: cada cartão é uma OS do Sadege, na coluna da etapa mais atrasada dos itens dela (o gargalo). OS de projeto aparecem com a faixa do projeto e primeiro.",
      "Etapas: <strong>Sem OC</strong> → <strong>Comprado</strong> (tem OC) → <strong>Recebido</strong> (chegou do fornecedor) → <strong>Em separação</strong> → <strong>Separado</strong> → <strong>Entregue</strong>. ⚠ = previsão vencida e ainda não recebido.",
    ],
  },
  os: {
    titulo: "Ordem de serviço",
    dicas: [
      "Tudo o que está vinculado a esta OS: itens, etapas, previsões e listas de separação.",
      "<strong>+ Vincular itens</strong> traz itens de outra RM concluída para esta OS.",
      "Os itens aparecem agrupados pela <strong>OC</strong> (fornecedor). Uma OS pode depender de várias OCs; o grupo <strong>Sem OC</strong> é o que ainda falta comprar.",
      "<strong>Editar</strong> muda o nº do Sadege, a descrição, a disciplina e o projeto (ou deixa a OS solta).",
    ],
  },
  oc: {
    titulo: "Ordem de compra (OC)",
    dicas: [
      "A OC é emitida <strong>por fornecedor</strong>: pode ter um item só ou vários, de RMs e OS diferentes.",
      "<strong>+ Nova OC</strong> cadastra nº, fornecedor, data do pedido e previsão. Depois, <strong>+ Itens</strong> põe nela os itens sem OC (ou traz de outra OC).",
      "Atalho: digite o nº da OC direto na linha do item (aba Itens). Mesmo nº = mesma OC.",
      "A <strong>previsão da OC</strong> vale para todos os itens dela. Entrega parcial: dê uma <strong>previsão própria</strong> só aos itens que chegam depois.",
      "<strong>📥 Receber</strong> marca a chegada do fornecedor: tudo o que falta ou só os itens selecionados (entrega parcial). Dá para corrigir a data em cada linha.",
      "<strong>Cancelar OC</strong> devolve os itens para <strong>Sem OC</strong> e guarda a OC como cancelada; <strong>Excluir</strong> apaga a OC.",
    ],
  },
  separacao: {
    titulo: "Lista de separação",
    dicas: [
      "<strong>Rascunho</strong>: escolha os itens (por RM inteira ou picados) e ajuste as quantidades. Depois, <strong>Enviar ao almoxarifado</strong>.",
      "<strong>Almoxarifado:</strong> toque no item para marcar como separado. Se faltou algo, abra o item (▾) e informe a quantidade separada e uma observação.",
      "Com tudo marcado, <strong>Concluir separação</strong>. Quando o material sair para a frente de serviço, <strong>Marcar entregue</strong>.",
      "<strong>PDF</strong> gera o checklist para imprimir; <strong>Compartilhar</strong> manda o PDF ou o link (WhatsApp, e-mail).",
      "As marcações aparecem na hora para todos (tempo real).",
    ],
  },
  cadastros: {
    titulo: "Cadastros",
    dicas: [
      "O e-mail vincula a pessoa ao login. A <strong>função</strong> monta a alçada de assinaturas.",
      "Papel <strong>Almoxarifado</strong>: a pessoa entra no app só para ver e marcar as listas de separação, e não aparece como assinante.",
      "Cada unidade enxerga as pessoas e os setores dela e os marcados como <strong>Todos</strong>.",
    ],
  },
  projeto: {
    titulo: "Resumo do projeto",
    dicas: [
      "Listas do projeto, materiais consolidados e as OS (disciplinas) vinculadas com o andamento dos materiais.",
    ],
  },
};
const AJUDA_GERAL = [
  "<strong>Banco de itens</strong>: no aparelho fica só o banco de manutenção (≈ 255 mil itens, pacote de poucos MB). Itens de outras áreas ficam na nuvem — use <strong>Buscar outros</strong>.",
  "O indicador no topo mostra o banco e a sincronia: <strong>● ao vivo</strong> = mudanças dos colegas chegam na hora; toque para conferir agora.",
  "No celular, use o menu inferior. <strong>Adicionar à tela inicial</strong> (menu do navegador) deixa o app com ícone próprio.",
  "Ações que apagam ou travam algo sempre pedem confirmação.",
];

function rotaAjuda() {
  const h = location.hash || "#/";
  if (h.startsWith("#/lista/")) return "editor";
  if (h.startsWith("#/os/")) return "os";
  if (h.startsWith("#/oc/") || h === "#/materiais/ocs") return "oc";
  if (h.startsWith("#/separacao/") || h === "#/materiais/separacao") return "separacao";
  if (h.startsWith("#/materiais")) return "materiais";
  if (h.startsWith("#/projeto/")) return "projeto";
  const m = { "#/codigos": "codigos", "#/historico": "historico", "#/cadastros": "cadastros" }[h];
  return m || "inicio";
}
function abrirAjuda() {
  const chave = rotaAjuda();
  const a = AJUDA[chave] || AJUDA.inicio;
  const f = folha({ titulo: "Ajuda — " + a.titulo, classe: "ajuda", largura: 620 });
  f.corpo.innerHTML = `
    <ol class="ajuda-lista">${a.dicas.map(d => `<li>${d}</li>`).join("")}</ol>
    <details class="ajuda-geral"><summary>Dicas gerais</summary><ul>${AJUDA_GERAL.map(d => `<li>${d}</li>`).join("")}</ul></details>
    <div class="ajuda-rodape">Outras telas: ${Object.entries(AJUDA).filter(([k]) => k !== chave)
      .map(([k, v]) => `<button type="button" class="h-chip" data-ajuda="${k}">${esc(v.titulo)}</button>`).join("")}</div>`;
  f.corpo.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ajuda]"); if (!b) return;
    const v = AJUDA[b.dataset.ajuda];
    f.el.querySelector(".folha-cab h2").textContent = "Ajuda — " + v.titulo;
    f.corpo.querySelector(".ajuda-lista").innerHTML = v.dicas.map(d => `<li>${d}</li>`).join("");
    f.corpo.scrollTop = 0;
  });
}

/* ============================================================
   MENU DO CELULAR — barra inferior + "Mais"
   ============================================================ */
function desenharMenuMovel() {
  const nav = document.getElementById("nav-movel"); if (!nav) return;
  const h = location.hash || "#/";
  const almox = typeof ehAlmox === "function" && ehAlmox();
  const itens = almox
    ? [["#/materiais/separacao", "📋", "Separação"], ["#/codigos", "🔎", "Códigos"], ["ajuda", "?", "Ajuda"]]
    : [["#/", "🏠", "Início"], ["#/codigos", "🔎", "Códigos"], ["#/materiais", "📦", "Materiais"], ["#/materiais/separacao", "📋", "Separação"], ["mais", "☰", "Mais"]];
  const ativo = (href) => href === "#/" ? (h === "#/" || h === "" || h.startsWith("#/lista/") || h.startsWith("#/projeto/"))
    : href === "#/materiais" ? (h.startsWith("#/materiais") && h !== "#/materiais/separacao") || h.startsWith("#/os/") || h.startsWith("#/oc/")
    : href === "#/materiais/separacao" ? (h === "#/materiais/separacao" || h.startsWith("#/separacao/"))
    : h === href;
  const chave = itens.map(i => i[0]).join() + "|" + h;
  if (nav.dataset.chave === chave) return;
  nav.dataset.chave = chave;
  nav.innerHTML = itens.map(([href, ico, rot]) => (href === "mais" || href === "ajuda")
    ? `<button type="button" data-acao="${href}"><span class="nm-ico">${ico}</span><span>${rot}</span></button>`
    : `<a href="${href}" class="${ativo(href) ? "ativo" : ""}"><span class="nm-ico">${ico}</span><span>${rot}</span></a>`).join("");
  nav.onclick = (e) => {
    const b = e.target.closest("[data-acao]"); if (!b) return;
    if (b.dataset.acao === "ajuda") abrirAjuda(); else abrirMenuMais();
  };
}
function abrirMenuMais() {
  const f = folha({ titulo: "Mais opções", classe: "menu-mais", largura: 420 });
  const it = (acao, ico, rot, sub = "") => `<button type="button" class="mm-item" data-mm="${acao}"><span class="mm-ico">${ico}</span><span><strong>${rot}</strong>${sub ? `<small>${sub}</small>` : ""}</span></button>`;
  const almox = typeof ehAlmox === "function" && ehAlmox();
  const local = typeof sb === "undefined" || !sb;
  f.corpo.innerHTML = almox ? `<div class="mm-grade">${it("ajuda", "❓", "Ajuda desta tela")}${it("sair", "↩", "Sair da conta")}</div>` : `<div class="mm-grade">
    ${it("#/historico", "🕘", "Histórico por item", "itens já lançados, com preços")}
    ${it("#/arquivados", "📦", "Projetos arquivados")}
    ${it("#/cadastros", "👥", "Cadastros", "assinantes, almoxarifado, setores")}
    ${it("banco", "🗄️", "Banco de itens", "pacote, importação, atualizar")}
    ${it("backup", "💾", "Backup das listas")}
    ${it("ajuda", "❓", "Ajuda desta tela")}
    ${local ? "" : it("sair", "↩", "Sair da conta")}
  </div>`;
  f.corpo.onclick = (e) => {
    const b = e.target.closest("[data-mm]"); if (!b) return;
    const a = b.dataset.mm;
    f.fechar();
    if (a.startsWith("#/")) location.hash = a;
    else if (a === "banco") { const x = document.getElementById("btn-importar-banco"); if (x) x.click(); }
    else if (a === "backup") { const x = document.getElementById("btn-backup"); if (x) x.click(); }
    else if (a === "ajuda") abrirAjuda();
    else if (a === "sair") { const x = document.getElementById("btn-sair"); if (x) x.click(); }
  };
}
