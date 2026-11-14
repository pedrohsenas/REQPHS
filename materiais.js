/* ============================================================
   materiais.js — GESTÃO DE MATERIAIS
   RM concluída → itens vinculados a uma OS do Sadege (que pode
   pertencer a um projeto ou ficar solta) → OC, data do pedido,
   previsão de entrega → lista de separação para o almoxarifado
   (checklist no celular + PDF) → entregue.

   Etapas de cada item (derivadas, sem campo de status a manter):
     Sem OC → Comprado (tem OC) → Em separação (lista enviada)
            → Separado (almoxarifado marcou) → Entregue
   A OS fica na coluna da etapa mais atrasada dos itens dela.

   Tabelas: req_os, req_mat, req_sep, req_sep_itens (ver
   supabase/04_gestao_materiais.sql). Sem Supabase, tudo fica
   neste navegador (localStorage), como o resto do app.
   Carregado ANTES do app.js: só declarações.
   ============================================================ */
"use strict";

const GM = { pronto: false, carregando: null, erro: "", semTabelas: false,
             os: [], mat: [], sep: [], si: [], canal: null, tela: null, sel: new Set() };
const GM_TAB = { os: "req_os", mat: "req_mat", sep: "req_sep", si: "req_sep_itens" };
const GM_LS = "rq.gm";
const ETAPAS = [
  { id: "aguardando", rot: "Sem OC",       curto: "Sem OC" },
  { id: "comprado",   rot: "Comprado",     curto: "Comprado" },
  { id: "separacao",  rot: "Em separação", curto: "Separação" },
  { id: "separado",   rot: "Separado",     curto: "Separado" },
  { id: "entregue",   rot: "Entregue",     curto: "Entregue" },
];
const ETAPA_ORDEM = Object.fromEntries(ETAPAS.map((e, i) => [e.id, i]));
const rotEtapa = (id) => (ETAPAS.find(e => e.id === id) || { rot: "Cancelado" }).rot;
const DISCIPLINAS = ["Elétrica", "Mecânica", "Civil", "Automação", "Instrumentação", "Caldeiraria", "Utilidades", "Segurança", "Outros"];
const SEP_STATUS = { rascunho: "Rascunho", enviada: "No almoxarifado", separada: "Separada", entregue: "Entregue", cancelada: "Cancelada" };

const ehAlmox = () => !!(typeof usuarioAtual !== "undefined" && usuarioAtual && usuarioAtual.papel === "almoxarifado");
const gmOS  = () => GM.os.filter(o => (o.unidade || "UIS3") === UN);
const gmMat = () => GM.mat.filter(m => (m.unidade || "UIS3") === UN);
const gmSep = () => GM.sep.filter(s => (s.unidade || "UIS3") === UN);
const dataCurta = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${m[3]}/${m[2]}` : ""; };
const numSep = (s) => "SEP-" + String(s.numero || "—").padStart(4, "0");
const rotOS = (o) => o ? ((o.numero ? "OS " + o.numero : "OS s/ nº") + (o.descricao ? " · " + o.descricao : "")) : "OS removida";

/* ---------------- dados ---------------- */
function gmLocalLer() {
  const d = LS.ler(GM_LS, {});
  return { os: d.os || [], mat: d.mat || [], sep: d.sep || [], si: d.si || [] };
}
function gmLocalGravar() { LS.gravar(GM_LS, { os: GM.os, mat: GM.mat, sep: GM.sep, si: GM.si }); }

async function gmCarregar(forcar = false) {
  if (GM.carregando) return GM.carregando;
  if (GM.pronto && !forcar) return;
  GM.carregando = (async () => {
    if (!sb) { Object.assign(GM, gmLocalLer(), { pronto: true }); return; }
    const res = await Promise.all(Object.values(GM_TAB).map(t => buscarPorChave(t, "*", "id", 1000)));
    const falha = res.find(r => r.error);
    if (falha) {
      if (semFuncao(falha.error)) GM.semTabelas = true; else GM.erro = falha.error.message;
      return;
    }
    [GM.os, GM.mat, GM.sep, GM.si] = res.map(r => r.data || []);
    Object.assign(GM, { pronto: true, semTabelas: false, erro: "" });
    gmTempoReal();
  })().catch(e => { GM.erro = e.message; }).finally(() => { GM.carregando = null; });
  return GM.carregando;
}

/* tempo real: o check do almoxarifado aparece na hora para a engenharia (e vice-versa) */
function gmTempoReal() {
  if (!sb || GM.canal || !sb.channel) return;
  let ch = sb.channel("rq-materiais");
  for (const [k, t] of Object.entries(GM_TAB))
    ch = ch.on("postgres_changes", { event: "*", schema: "public", table: t }, (p) => gmEvento(k, p));
  GM.canal = ch.subscribe((estado) => { if (estado === "SUBSCRIBED" && GM.pronto) gmCarregar(true).then(gmMudou); });
}
function gmEvento(k, p) {
  if (p.eventType === "DELETE") {
    const id = p.old && p.old.id; if (!id) return;
    GM[k] = GM[k].filter(x => x.id !== id);
    if (k === "sep") GM.si = GM.si.filter(x => x.sep_id !== id);
    if (k === "mat") GM.si = GM.si.filter(x => x.mat_id !== id);
    if (k === "os") { const ids = new Set(GM.mat.filter(m => m.os_id === id).map(m => m.id)); GM.mat = GM.mat.filter(m => m.os_id !== id); GM.si = GM.si.filter(x => !ids.has(x.mat_id)); }
  } else if (p.new && p.new.id) {
    const i = GM[k].findIndex(x => x.id === p.new.id);
    if (i >= 0) GM[k][i] = p.new; else GM[k].push(p.new);
  }
  gmMudou();
}
/* redesenha a tela aberta — mas não por baixo de quem está digitando */
let tGm = null;
function gmMudou() {
  clearTimeout(tGm);
  tGm = setTimeout(() => {
    if (!GM.tela) return;
    const a = document.activeElement;
    const digitando = a && a.closest && a.closest("#app") && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "checkbox";
    if (digitando || document.querySelector(".folha-modal, .conf")) { gmMudou(); return; }
    try { GM.tela(); } catch (e) { console.warn("materiais:", e); }
  }, 250);
}

async function gmInserir(k, objs) {
  if (!objs.length) return true;
  GM[k].push(...objs);
  if (!sb) { gmLocalGravar(); return true; }
  const { data, error } = await sb.from(GM_TAB[k]).insert(objs).select();
  if (error) {
    const ids = new Set(objs.map(o => o.id));
    GM[k] = GM[k].filter(x => !ids.has(x.id));
    toast("⚠ Não salvou: " + error.message);
    return false;
  }
  for (const r of data || []) { const i = GM[k].findIndex(x => x.id === r.id); if (i >= 0) GM[k][i] = r; }
  return true;
}
async function gmAtualizar(k, ids, campos) {
  ids = [].concat(ids);
  const antes = [];
  for (const x of GM[k]) if (ids.includes(x.id)) { antes.push({ ...x }); Object.assign(x, campos); }
  if (!sb) { gmLocalGravar(); return true; }
  let erro = null;
  for (let i = 0; i < ids.length && !erro; i += 200) {
    const { error } = await sb.from(GM_TAB[k]).update(campos).in("id", ids.slice(i, i + 200));
    erro = error;
  }
  if (erro) {
    for (const a of antes) { const x = GM[k].find(y => y.id === a.id); if (x) Object.assign(x, a); }
    toast("⚠ Não salvou: " + erro.message);
    gmMudou();
    return false;
  }
  return true;
}
async function gmExcluir(k, ids) {
  ids = [].concat(ids); if (!ids.length) return true;
  const set = new Set(ids);
  const copia = { os: GM.os.slice(), mat: GM.mat.slice(), sep: GM.sep.slice(), si: GM.si.slice() };
  GM[k] = GM[k].filter(x => !set.has(x.id));
  if (k === "os") { const m = new Set(GM.mat.filter(x => set.has(x.os_id)).map(x => x.id)); GM.mat = GM.mat.filter(x => !set.has(x.os_id)); GM.si = GM.si.filter(x => !m.has(x.mat_id)); }
  if (k === "mat") GM.si = GM.si.filter(x => !set.has(x.mat_id));
  if (k === "sep") GM.si = GM.si.filter(x => !set.has(x.sep_id));
  if (!sb) { gmLocalGravar(); return true; }
  const { error } = await sb.from(GM_TAB[k]).delete().in("id", ids);
  if (error) { Object.assign(GM, copia); toast("⚠ Não excluiu: " + error.message); return false; }
  return true;
}

/* ---------------- índices e etapas ---------------- */
function gmIdx() {
  const sepPor = new Map(GM.sep.map(s => [s.id, s]));
  const siPorMat = new Map(), siPorSep = new Map(), matPorOs = new Map();
  for (const x of GM.si) {
    const s = sepPor.get(x.sep_id); if (!s) continue;
    if (!siPorSep.has(x.sep_id)) siPorSep.set(x.sep_id, []);
    siPorSep.get(x.sep_id).push(x);
    if (s.status === "cancelada") continue;
    if (!siPorMat.has(x.mat_id)) siPorMat.set(x.mat_id, []);
    siPorMat.get(x.mat_id).push(x);
  }
  for (const m of GM.mat) { if (!matPorOs.has(m.os_id)) matPorOs.set(m.os_id, []); matPorOs.get(m.os_id).push(m); }
  const osPor = new Map(GM.os.map(o => [o.id, o]));
  const matPor = new Map(GM.mat.map(m => [m.id, m]));
  return { sepPor, siPorMat, siPorSep, matPorOs, osPor, matPor };
}
function gmEtapa(m, idx) {
  if (m.cancelado) return "cancelado";
  if (m.data_entrega) return "entregue";
  const si = idx.siPorMat.get(m.id) || [];
  if (si.some(x => x.separado)) return "separado";
  if (si.some(x => { const s = idx.sepPor.get(x.sep_id); return s && (s.status === "enviada" || s.status === "separada"); })) return "separacao";
  if (String(m.oc || "").trim()) return "comprado";
  return "aguardando";
}
const gmAtrasado = (m, etapa) => !!m.data_prev && m.data_prev < hoje() && ETAPA_ORDEM[etapa] <= ETAPA_ORDEM.separacao;
/* sep ativa (não cancelada) em que o item já está */
const gmSepDoItem = (m, idx) => (idx.siPorMat.get(m.id) || []).map(x => idx.sepPor.get(x.sep_id)).find(s => s && s.status !== "entregue");

function gmResumoOS(o, idx) {
  const itens = (idx.matPorOs.get(o.id) || []).filter(m => !m.cancelado);
  const cont = Object.fromEntries(ETAPAS.map(e => [e.id, 0]));
  let valor = 0, atrasados = 0, prox = "";
  for (const m of itens) {
    const e = gmEtapa(m, idx);
    cont[e]++;
    valor += (+m.qtd || 0) * (+m.preco || 0);
    if (gmAtrasado(m, e)) atrasados++;
    if (m.data_prev && ETAPA_ORDEM[e] < ETAPA_ORDEM.separado && (!prox || m.data_prev < prox)) prox = m.data_prev;
  }
  const etapa = itens.length ? ETAPAS.find(e => cont[e.id] > 0).id : "aguardando";
  const proj = o.projeto_id ? projetos.find(p => p.id === o.projeto_id) : null;
  return { o, itens, cont, valor, atrasados, prox, etapa, proj, vazia: !itens.length };
}

/* ---------------- filtros (guardados na sessão) ---------------- */
const gmFiltro = () => { try { return { q: "", proj: "", disc: "", etapa: "", os: "", entregues: false, ...JSON.parse(sessionStorage.getItem("rq.gmFiltro") || "{}") }; } catch { return { q: "", proj: "", disc: "", etapa: "", os: "", entregues: false }; } };
const gmGuardarFiltro = (f) => { try { sessionStorage.setItem("rq.gmFiltro", JSON.stringify(f)); } catch { /* sem sessão */ } };
function gmPassaFiltro(o, f, idx, itensTambem = true) {
  if (f.proj === "_soltas" && o.projeto_id) return false;
  if (f.proj === "_projetos" && !o.projeto_id) return false;
  if (f.proj && !f.proj.startsWith("_") && o.projeto_id !== f.proj) return false;
  if (f.disc && o.disciplina !== f.disc) return false;
  const q = norm(f.q).trim();
  if (!q) return true;
  const proj = o.projeto_id ? (projetos.find(p => p.id === o.projeto_id) || {}).nome : "";
  const alvo = norm([o.numero, o.descricao, o.disciplina, proj].join(" "));
  if (q.split(/\s+/).every(t => alvo.includes(t))) return true;
  if (!itensTambem) return false;
  return (idx.matPorOs.get(o.id) || []).some(m => { const a = norm(m.codigo + " " + m.descricao + " " + m.oc); return q.split(/\s+/).every(t => a.includes(t)); });
}

/* ============================================================
   TELA PRINCIPAL — #/materiais (quadro) · #/materiais/itens · #/materiais/separacao
   ============================================================ */
function telaMateriais(app, aba = "quadro") {
  if (ehAlmox() && aba !== "separacao") { location.hash = "#/materiais/separacao"; return; }
  GM.tela = () => { if ((location.hash || "").startsWith("#/materiais")) telaMateriais(app, aba); };
  const cab = `<div class="pagina-titulo gm-titulo">
      <h1>${ehAlmox() ? "Separação de materiais" : "Gestão de Materiais"}</h1><span class="etiqueta tipo">${esc(UNI().nome)}</span>
      <span class="espacador"></span>
      ${ehAlmox() ? "" : `<button class="btn sec" id="gm-nova-sep" title="Lista de itens para o almoxarifado separar">+ Lista de separação</button>
      <button class="btn" id="gm-vincular" title="Mandar itens de uma RM concluída para uma OS">🔗 Vincular RM à OS</button>`}
    </div>
    ${ehAlmox() ? "" : `<nav class="gm-abas" role="tablist">
      <a role="tab" href="#/materiais" class="${aba === "quadro" ? "ativa" : ""}">Quadro de OS</a>
      <a role="tab" href="#/materiais/itens" class="${aba === "itens" ? "ativa" : ""}">Itens</a>
      <a role="tab" href="#/materiais/separacao" class="${aba === "separacao" ? "ativa" : ""}">Separação</a>
    </nav>`}`;
  if (!GM.pronto) {
    app.innerHTML = cab + gmAvisoCarga();
    if (!GM.semTabelas && !GM.erro) gmCarregar().then(() => { if (GM.tela) GM.tela(); });
    gmLigarCab();
    return;
  }
  app.innerHTML = cab + `<div id="gm-corpo"></div>`;
  const corpo = $("#gm-corpo");
  if (aba === "itens") gmAbaItens(corpo);
  else if (aba === "separacao") gmAbaSeparacao(corpo);
  else gmAbaQuadro(corpo);
  gmLigarCab();
}
function gmAvisoCarga() {
  if (GM.semTabelas) return `<div class="vazio gm-instalar"><strong>A Gestão de Materiais ainda não foi instalada no banco.</strong><br>
    Rode <code>supabase/04_gestao_materiais.sql</code> no SQL Editor do Supabase (uma vez). Nada das requisições é alterado.</div>`;
  if (GM.erro) return `<div class="vazio">Não consegui carregar a Gestão de Materiais.<br><small>${esc(GM.erro)}</small><br><br>
    <button class="btn" id="gm-tentar">Tentar de novo</button></div>`;
  return `<div class="vazio">Carregando materiais…</div>`;
}
function gmLigarCab() {
  const v = $("#gm-vincular"); if (v) v.onclick = () => gmVincularRM();
  const n = $("#gm-nova-sep"); if (n) n.onclick = () => gmNovaSeparacao();
  const t = $("#gm-tentar"); if (t) t.onclick = () => { GM.erro = ""; render(); };
}

/* ---------------- aba QUADRO (kanban de OS) ---------------- */
function gmAbaQuadro(corpo) {
  const f = gmFiltro();
  const idx = gmIdx();
  const todas = gmOS().filter(o => o.status !== "cancelada");
  const lista = todas.filter(o => gmPassaFiltro(o, f, idx)).map(o => gmResumoOS(o, idx));
  const projsComOS = [...new Set(todas.filter(o => o.projeto_id).map(o => o.projeto_id))]
    .map(id => projetos.find(p => p.id === id)).filter(Boolean);
  const discs = [...new Set(todas.map(o => o.disciplina).filter(Boolean))].sort();
  const limite = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

  /* faixa de projetos: destaque e filtro com um toque */
  const faixa = projsComOS.map(p => {
    const ros = todas.filter(o => o.projeto_id === p.id).map(o => gmResumoOS(o, idx));
    const tot = ros.reduce((s, r) => s + r.itens.length, 0), ent = ros.reduce((s, r) => s + r.cont.entregue, 0);
    const atr = ros.reduce((s, r) => s + r.atrasados, 0);
    return `<button class="gm-proj-chip ${f.proj === p.id ? "ativo" : ""}" data-proj="${esc(p.id)}">
      <span class="gm-proj-nome">📁 ${esc(p.nome)}</span>
      <span class="gm-proj-info">${ros.length} OS · ${tot ? Math.round(ent / tot * 100) : 0}% entregue${atr ? ` · <b class="atraso">${atr} atrasado(s)</b>` : ""}</span>
      <span class="gm-mini-barra"><i style="width:${tot ? ent / tot * 100 : 0}%"></i></span></button>`;
  }).join("");

  const cartao = (r) => {
    const o = r.o, tot = r.itens.length;
    const seg = ETAPAS.map(e => r.cont[e.id] ? `<i class="et-${e.id}" style="flex:${r.cont[e.id]}" title="${e.rot}: ${r.cont[e.id]}"></i>` : "").join("");
    return `<a class="os-cartao ${r.proj ? "de-projeto" : "solta"} ${r.atrasados ? "com-atraso" : ""}" href="#/os/${esc(o.id)}">
      <span class="os-proj">${r.proj ? "📁 " + esc(r.proj.nome) : "OS solta"}</span>
      <span class="os-topo"><b class="os-num">${o.numero ? "OS " + esc(o.numero) : "OS s/ nº"}</b>${o.disciplina ? `<span class="chip-disc">${esc(o.disciplina)}</span>` : ""}</span>
      <span class="os-desc">${esc(o.descricao || "—")}</span>
      ${tot ? `<span class="os-barra">${seg}</span>` : `<span class="os-vazia">Sem itens vinculados</span>`}
      <span class="os-rod">${tot} ite${tot === 1 ? "m" : "ns"}${r.valor ? " · " + dinheiro(r.valor) : ""}${r.prox ? ` · prev. <b class="${r.prox < hoje() ? "atraso" : ""}">${dataCurta(r.prox)}</b>` : ""}${r.atrasados ? ` · <b class="atraso">⚠ ${r.atrasados}</b>` : ""}</span>
    </a>`;
  };
  const ordem = (a, b) => (!!b.proj - !!a.proj) || (b.atrasados - a.atrasados) || String(a.prox || "9").localeCompare(String(b.prox || "9")) || String(a.o.numero).localeCompare(String(b.o.numero), "pt-BR", { numeric: true });
  const colunas = ETAPAS.map(e => {
    let cards = lista.filter(r => r.etapa === e.id);
    let ocultas = 0;
    if (e.id === "entregue" && !f.entregues) {
      const antes = cards.length;
      cards = cards.filter(r => (r.o.atualizado_em || "").slice(0, 10) >= limite);
      ocultas = antes - cards.length;
    }
    cards.sort(ordem);
    return `<section class="gm-col et-${e.id}">
      <header><span class="gm-col-ponto"></span>${e.rot}<b>${cards.length}</b></header>
      <div class="gm-col-cards">${cards.map(cartao).join("") || `<div class="gm-col-vazia">—</div>`}
      ${ocultas ? `<button class="btn sec mini gm-ver-ent">+ ${ocultas} entregue(s) há mais de 30 dias</button>` : ""}</div>
    </section>`;
  }).join("");

  corpo.innerHTML = `
    <div class="gm-filtros">
      <input type="search" id="gm-q" placeholder="Procurar OS, descrição, projeto, código…" value="${esc(f.q)}" autocomplete="off">
      <select id="gm-proj"><option value="">Todos os projetos</option><option value="_projetos" ${f.proj === "_projetos" ? "selected" : ""}>Só OS de projeto</option>
        <option value="_soltas" ${f.proj === "_soltas" ? "selected" : ""}>Só OS soltas</option>
        ${projsComOS.map(p => `<option value="${esc(p.id)}" ${f.proj === p.id ? "selected" : ""}>📁 ${esc(p.nome)}</option>`).join("")}</select>
      <select id="gm-disc"><option value="">Todas as disciplinas</option>${discs.map(d => `<option ${f.disc === d ? "selected" : ""}>${esc(d)}</option>`).join("")}</select>
    </div>
    ${faixa ? `<div class="gm-projetos">${faixa}</div>` : ""}
    ${todas.length ? `<div class="gm-quadro">${colunas}</div>` : `<div class="vazio gm-vazio">
      <strong>Nenhuma OS ainda.</strong><br>Conclua uma RM e toque em <strong>🔗 Vincular à OS</strong> (na própria RM ou aqui em cima).<br>
      A OS do Sadege nasce nesse momento, com projeto ou solta.<br><br>
      <button class="btn" id="gm-vincular-2">🔗 Vincular RM à OS</button></div>`}`;

  const q = $("#gm-q");
  let t = null;
  q.oninput = () => { clearTimeout(t); t = setTimeout(() => { f.q = q.value; gmGuardarFiltro(f); gmAbaQuadro(corpo); const n = $("#gm-q"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); };
  $("#gm-proj").onchange = (e) => { f.proj = e.target.value; gmGuardarFiltro(f); gmAbaQuadro(corpo); };
  $("#gm-disc").onchange = (e) => { f.disc = e.target.value; gmGuardarFiltro(f); gmAbaQuadro(corpo); };
  corpo.onclick = (e) => {
    const p = e.target.closest("[data-proj]");
    if (p) { f.proj = f.proj === p.dataset.proj ? "" : p.dataset.proj; gmGuardarFiltro(f); gmAbaQuadro(corpo); return; }
    if (e.target.closest(".gm-ver-ent")) { f.entregues = true; gmGuardarFiltro(f); gmAbaQuadro(corpo); return; }
    if (e.target.closest("#gm-vincular-2")) gmVincularRM();
  };
}

/* ---------------- aba ITENS (lista operacional) ---------------- */
function gmAbaItens(corpo, osFixa = null) {
  const f = osFixa ? { q: "", proj: "", disc: "", etapa: GM.etapaOS || "" } : gmFiltro();
  const idx = gmIdx();
  const oss = gmOS().filter(o => o.status !== "cancelada" && (!osFixa || o.id === osFixa) && (osFixa || gmPassaFiltro(o, f, idx, false)));
  const q = norm(f.q).trim(), termos = q ? q.split(/\s+/) : [];
  const linhasPorOS = [];
  const contEt = Object.fromEntries([...ETAPAS.map(e => [e.id, 0]), ["atrasados", 0]]);
  for (const o of oss) {
    const itens = (idx.matPorOs.get(o.id) || []).filter(m => (m.unidade || "UIS3") === UN).map(m => ({ m, e: gmEtapa(m, idx) }))
      .filter(x => x.e !== "cancelado" || osFixa);
    const casaOS = !termos.length || termos.every(t => norm([o.numero, o.descricao].join(" ")).includes(t));
    const vis = itens.filter(x => casaOS || termos.every(t => norm(x.m.codigo + " " + x.m.descricao + " " + x.m.oc).includes(t)));
    for (const x of vis) { if (contEt[x.e] != null) contEt[x.e]++; if (gmAtrasado(x.m, x.e)) contEt.atrasados++; }
    const filtradas = vis.filter(x => !f.etapa || (f.etapa === "atrasados" ? gmAtrasado(x.m, x.e) : x.e === f.etapa));
    if (filtradas.length || osFixa) linhasPorOS.push({ o, itens: filtradas });
  }
  const visiveis = new Set(linhasPorOS.flatMap(g => g.itens.map(x => x.m.id)));
  for (const id of [...GM.sel]) if (!visiveis.has(id)) GM.sel.delete(id);
  const listaRM = (id) => listas.find(l => l.id === id);
  const linha = ({ m, e }) => {
    const rm = listaRM(m.lista_id), sep = gmSepDoItem(m, idx), atr = gmAtrasado(m, e);
    return `<tr class="gm-linha et-${e}${atr ? " atrasado" : ""}${GM.sel.has(m.id) ? " sel" : ""}" data-id="${esc(m.id)}">
      <td class="gm-c-sel"><input type="checkbox" data-sel="${esc(m.id)}" ${GM.sel.has(m.id) ? "checked" : ""} aria-label="Selecionar"></td>
      <td class="gm-c-et"><span class="et-chip et-${e}">${e === "cancelado" ? "Cancelado" : rotEtapa(e)}</span>${atr ? '<span class="et-atraso" title="Previsão de entrega vencida">⚠</span>' : ""}</td>
      <td class="gm-c-cod">${esc(m.codigo)}</td>
      <td class="gm-c-desc">${esc(m.descricao)}<div class="gm-sub">${rm ? `<a href="#/lista/${esc(rm.id)}">RM ${esc(curto(rm.titulo, 34))}</a>` : "RM removida"}${sep ? ` · <a href="#/separacao/${esc(sep.id)}">${numSep(sep)}</a>` : ""}</div></td>
      <td class="gm-c-qtd num">${fmtNum(+m.qtd) || "0"} <small>${esc(m.un)}</small></td>
      <td class="gm-c-oc"><label class="gm-rot-m">OC</label><input class="gm-in" data-campo="oc" value="${esc(m.oc || "")}" placeholder="nº OC" inputmode="numeric" autocomplete="off"></td>
      <td class="gm-c-dt"><label class="gm-rot-m">Pedido</label><input type="date" class="gm-in" data-campo="data_pedido" value="${esc(m.data_pedido || "")}"></td>
      <td class="gm-c-dt"><label class="gm-rot-m">Previsão</label><input type="date" class="gm-in${atr ? " vencida" : ""}" data-campo="data_prev" value="${esc(m.data_prev || "")}"></td>
      <td class="gm-c-dt"><label class="gm-rot-m">Entregue</label><input type="date" class="gm-in" data-campo="data_entrega" value="${esc(m.data_entrega || "")}"></td>
      <td class="gm-c-menu"><button class="btn sec mini" data-menu="${esc(m.id)}" aria-label="Mais ações">⋯</button></td>
    </tr>`;
  };
  const grupo = (g) => {
    const p = g.o.projeto_id ? projetos.find(x => x.id === g.o.projeto_id) : null;
    return `<tr class="gm-grupo${p ? " de-projeto" : ""}"><td colspan="10">
      <input type="checkbox" data-sel-os="${esc(g.o.id)}" aria-label="Selecionar os itens desta OS" ${g.itens.length && g.itens.every(x => GM.sel.has(x.m.id)) ? "checked" : ""}>
      <a href="#/os/${esc(g.o.id)}"><b>${g.o.numero ? "OS " + esc(g.o.numero) : "OS s/ nº"}</b> ${esc(g.o.descricao || "")}</a>
      ${g.o.disciplina ? `<span class="chip-disc">${esc(g.o.disciplina)}</span>` : ""}
      <span class="gm-grupo-proj">${p ? "📁 " + esc(p.nome) : "OS solta"}</span>
      <span class="gm-grupo-n">${g.itens.length} ite${g.itens.length === 1 ? "m" : "ns"}</span></td></tr>`;
  };
  const chips = [["", "Todos"], ...ETAPAS.map(e => [e.id, e.rot]), ["atrasados", "⚠ Atrasados"]]
    .map(([id, rot]) => `<button class="h-chip et-f et-${id || "todos"} ${f.etapa === id ? "bc-ativo" : ""}" data-etapa="${id}">${rot}${id ? ` <b>${contEt[id] || 0}</b>` : ""}</button>`).join("");

  corpo.innerHTML = `
    ${osFixa ? "" : `<div class="gm-filtros">
      <input type="search" id="gm-q" placeholder="Procurar código, descrição, OC, OS…" value="${esc(f.q)}" autocomplete="off">
      <select id="gm-proj"><option value="">Todos os projetos</option><option value="_projetos" ${f.proj === "_projetos" ? "selected" : ""}>Só OS de projeto</option>
        <option value="_soltas" ${f.proj === "_soltas" ? "selected" : ""}>Só OS soltas</option>
        ${projetosUN().filter(p => gmOS().some(o => o.projeto_id === p.id)).map(p => `<option value="${esc(p.id)}" ${f.proj === p.id ? "selected" : ""}>📁 ${esc(p.nome)}</option>`).join("")}</select>
    </div>`}
    <div class="h-chips gm-etapas">${chips}</div>
    <div class="gm-tabela-env">
      <table class="app gm-tabela">
        <thead><tr><th class="gm-c-sel"></th><th>Etapa</th><th>Código</th><th>Descrição</th><th class="num">Qtd</th><th>OC</th><th>Pedido</th><th>Previsão</th><th>Entregue</th><th></th></tr></thead>
        <tbody>${linhasPorOS.map(g => grupo(g) + g.itens.map(linha).join("")).join("")
          || `<tr><td colspan="10" class="h-vazio">${GM.mat.length ? "Nenhum item com esses filtros." : "Nenhum item vinculado ainda. Use 🔗 Vincular RM à OS."}</td></tr>`}</tbody>
      </table>
    </div>
    <div class="gm-acoes-lote" id="gm-lote" ${GM.sel.size ? "" : "hidden"}>
      <span><b id="gm-n-sel">${GM.sel.size}</b> selecionado(s)</span>
      <button class="btn sec mini" data-lote="datas">OC / datas</button>
      <button class="btn sec mini" data-lote="sep">Lista de separação</button>
      <button class="btn sec mini" data-lote="entregue">Entregue</button>
      <button class="btn sec mini" data-lote="mover">Mover de OS</button>
      <button class="btn mini perigo" data-lote="desvincular">Desvincular</button>
      <button class="btn sec mini" data-lote="limpar" aria-label="Limpar seleção">✕</button>
    </div>`;

  const redesenhar = () => gmAbaItens(corpo, osFixa);
  const qEl = $("#gm-q", corpo);
  if (qEl) {
    let t = null;
    qEl.oninput = () => { clearTimeout(t); t = setTimeout(() => { f.q = qEl.value; gmGuardarFiltro(f); redesenhar(); const n = $("#gm-q", corpo); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 220); };
  }
  const pj = $("#gm-proj", corpo); if (pj) pj.onchange = (e) => { f.proj = e.target.value; gmGuardarFiltro(f); redesenhar(); };
  const atualizarLote = () => {
    const l = $("#gm-lote", corpo); l.hidden = !GM.sel.size; $("#gm-n-sel", corpo).textContent = GM.sel.size;
    document.body.classList.toggle("com-lote", GM.sel.size > 0);
  };
  atualizarLote();
  corpo.onchange = async (e) => {
    const el = e.target;
    if (el.dataset.sel) { el.checked ? GM.sel.add(el.dataset.sel) : GM.sel.delete(el.dataset.sel); el.closest("tr").classList.toggle("sel", el.checked); atualizarLote(); return; }
    if (el.dataset.selOs) {
      const g = linhasPorOS.find(x => x.o.id === el.dataset.selOs);
      for (const x of g ? g.itens : []) el.checked ? GM.sel.add(x.m.id) : GM.sel.delete(x.m.id);
      redesenhar(); return;
    }
    if (el.classList.contains("gm-in")) {
      const id = el.closest("tr").dataset.id, campo = el.dataset.campo;
      const v = campo === "oc" ? el.value.trim() : (el.value || null);
      const m = GM.mat.find(x => x.id === id);
      if (campo === "data_entrega" && v && m && !m.data_entrega) {
        if (!await confirmar({ titulo: "Marcar como entregue?", icone: "📦", ok: "Marcar entregue",
          texto: `<strong>${esc(m.codigo)}</strong> ${esc(m.descricao)}<br>Entregue em ${dataBR(v)}.` })) { el.value = ""; return; }
      }
      if (await gmAtualizar("mat", id, { [campo]: v })) { toast("✓ Salvo"); redesenhar(); }
    }
  };
  corpo.onclick = async (e) => {
    const ch = e.target.closest("[data-etapa]");
    if (ch) { f.etapa = f.etapa === ch.dataset.etapa ? "" : ch.dataset.etapa; if (osFixa) GM.etapaOS = f.etapa; else gmGuardarFiltro(f); redesenhar(); return; }
    const mn = e.target.closest("[data-menu]");
    if (mn) { gmMenuItem(mn.dataset.menu, redesenhar); return; }
    const lt = e.target.closest("[data-lote]");
    if (!lt) return;
    const ids = [...GM.sel];
    const a = lt.dataset.lote;
    if (a === "limpar") { GM.sel.clear(); redesenhar(); return; }
    if (a === "datas") { if (await gmFormDatas(ids)) { redesenhar(); } return; }
    if (a === "sep") { gmNovaSeparacao(ids); return; }
    if (a === "mover") { if (await gmMoverItens(ids)) { GM.sel.clear(); redesenhar(); } return; }
    if (a === "entregue") {
      const d = hoje();
      if (!await confirmar({ titulo: `Marcar ${ids.length} item(ns) como entregue(s)?`, icone: "📦", ok: "Marcar entregues",
        texto: `Data de entrega: <strong>${dataBR(d)}</strong>. Dá para corrigir a data em cada linha depois.` })) return;
      if (await gmAtualizar("mat", ids.filter(id => !(GM.mat.find(m => m.id === id) || {}).data_entrega), { data_entrega: d })) { GM.sel.clear(); toast("📦 Entregues"); redesenhar(); }
      return;
    }
    if (a === "desvincular") {
      const emSep = ids.filter(id => (idx.siPorMat.get(id) || []).length).length;
      if (!await confirmar({ titulo: `Desvincular ${ids.length} item(ns) da OS?`, icone: "🔗", perigo: true, ok: "Desvincular",
        texto: "Os itens saem da Gestão de Materiais (a RM de origem não muda) e podem ser vinculados de novo depois."
          + (emSep ? `<br><strong>${emSep}</strong> deles estão em listas de separação e sairão delas.` : "") })) return;
      if (await gmExcluir("mat", ids)) { GM.sel.clear(); toast("Itens desvinculados"); redesenhar(); }
    }
  };
}

/* menu "⋯" de um item */
async function gmMenuItem(id, depois) {
  const m = GM.mat.find(x => x.id === id); if (!m) return;
  const o = GM.os.find(x => x.id === m.os_id);
  const f = folha({ titulo: `${m.codigo} · ${curto(m.descricao, 40)}`, classe: "menu-item", largura: 460 });
  f.corpo.innerHTML = `<div class="mm-grade">
    <button class="mm-item" data-a="rm"><span class="mm-ico">📄</span><span><strong>Abrir a RM de origem</strong></span></button>
    <button class="mm-item" data-a="os"><span class="mm-ico">🧾</span><span><strong>Abrir a OS</strong><small>${esc(rotOS(o))}</small></span></button>
    <button class="mm-item" data-a="obs"><span class="mm-ico">📝</span><span><strong>Observação</strong><small>${esc(m.obs || "nenhuma")}</small></span></button>
    <button class="mm-item" data-a="mover"><span class="mm-ico">↪</span><span><strong>Mover para outra OS</strong></span></button>
    <button class="mm-item" data-a="cancelar"><span class="mm-ico">${m.cancelado ? "↺" : "⊘"}</span><span><strong>${m.cancelado ? "Reativar item" : "Cancelar item"}</strong><small>${m.cancelado ? "volta para o fluxo" : "não vai mais ser comprado/entregue"}</small></span></button>
    <button class="mm-item perigo" data-a="desv"><span class="mm-ico">🔗</span><span><strong>Desvincular da OS</strong></span></button>
  </div>`;
  f.corpo.onclick = async (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a; f.fechar();
    if (a === "rm") location.hash = "#/lista/" + m.lista_id;
    else if (a === "os") location.hash = "#/os/" + m.os_id;
    else if (a === "obs") { const v = await perguntar("Observação do item", `${m.codigo} — ${curto(m.descricao, 50)}`, m.obs || ""); if (v !== null && await gmAtualizar("mat", id, { obs: v })) depois(); }
    else if (a === "mover") { if (await gmMoverItens([id])) depois(); }
    else if (a === "cancelar") {
      if (!m.cancelado && !await confirmar({ titulo: "Cancelar este item?", icone: "⊘", ok: "Cancelar item", cancelar: "Voltar",
        texto: `<strong>${esc(m.codigo)}</strong> ${esc(m.descricao)}<br>Ele continua na OS, marcado como cancelado (dá para reativar).` })) return;
      if (await gmAtualizar("mat", id, { cancelado: !m.cancelado })) depois();
    } else if (a === "desv") {
      if (!await confirmar({ titulo: "Desvincular da OS?", icone: "🔗", perigo: true, ok: "Desvincular",
        texto: `<strong>${esc(m.codigo)}</strong> ${esc(m.descricao)}<br>O item sai da Gestão de Materiais (a RM não muda).` })) return;
      if (await gmExcluir("mat", [id])) depois();
    }
  };
}

/* OC e datas em lote */
async function gmFormDatas(ids) {
  const itens = GM.mat.filter(m => ids.includes(m.id));
  const um = itens.length === 1 ? itens[0] : null;
  const v = await formulario(`OC e datas — ${ids.length} item(ns)`, [
    { nome: "oc", rot: "Ordem de compra (OC)", ph: "deixe em branco para não mudar", attrs: 'inputmode="numeric" autocomplete="off"' },
    { nome: "data_pedido", rot: "Data do pedido", tipo: "date" },
    { nome: "data_prev", rot: "Previsão de entrega", tipo: "date" },
    { nome: "modo", rot: "Aplicar", opcoes: [["vazios", "Só onde estiver vazio"], ["todos", "Em todos os selecionados (substitui)"]] },
  ], um ? { oc: um.oc, data_pedido: um.data_pedido || "", data_prev: um.data_prev || "", modo: "todos" } : { modo: "vazios" },
  (x) => (!x.oc.trim() && !x.data_pedido && !x.data_prev) ? "Preencha ao menos um campo." : "");
  if (!v) return false;
  const campos = {};
  if (v.oc.trim()) campos.oc = v.oc.trim();
  if (v.data_pedido) campos.data_pedido = v.data_pedido;
  if (v.data_prev) campos.data_prev = v.data_prev;
  let ok = true;
  if (v.modo === "todos") ok = await gmAtualizar("mat", ids, campos);
  else for (const [c, val] of Object.entries(campos)) {
    const alvo = itens.filter(m => !String(m[c] || "").trim()).map(m => m.id);
    if (alvo.length) ok = (await gmAtualizar("mat", alvo, { [c]: val })) && ok;
  }
  if (ok) toast("✓ OC e datas salvas");
  return ok;
}

/* ============================================================
   OS — escolher/criar e editar
   ============================================================ */
/* formulário de OS. sugestao: { descricao, projetoId } */
async function gmFormOS(o = null, sugestao = {}) {
  const projs = projetosUN().filter(p => p.status !== "arquivado" || (o && p.id === o.projeto_id));
  const v = await formulario(o ? "Editar OS" : "Nova OS (Sadege)", [
    { nome: "numero", rot: "Nº da OS no Sadege", ph: "Ex.: 125874", attrs: 'inputmode="numeric" autocomplete="off"',
      ajuda: "Pode deixar em branco e completar depois." },
    { nome: "descricao", rot: "Descrição", ph: "Ex.: Substituição do CCM do farelo",
      ajuda: "É tratada como o nome do projeto/demanda. Projetos podem ter várias OS (uma por disciplina)." },
    { nome: "disciplina", rot: "Disciplina", opcoes: [["", "—"], ...DISCIPLINAS.map(d => [d, d])] },
    { nome: "projeto", rot: "Projeto", opcoes: [["", "— OS solta (sem projeto) —"], ["_novo", "+ Criar projeto com a descrição da OS"],
        ...projs.map(p => [p.id, "📁 " + p.nome])] },
  ], o ? { numero: o.numero, descricao: o.descricao, disciplina: o.disciplina, projeto: o.projeto_id || "" }
       : { numero: "", descricao: sugestao.descricao || "", disciplina: "", projeto: sugestao.projetoId || "" },
  (x) => {
    if (!x.numero.trim() && !x.descricao.trim()) return "Informe o nº da OS ou a descrição.";
    const dup = x.numero.trim() && gmOS().find(y => y !== o && y.numero === x.numero.trim());
    if (dup) return `A OS ${x.numero.trim()} já existe (${dup.descricao || "sem descrição"}). Use-a na lista de OS existentes.`;
    if (x.projeto === "_novo" && !x.descricao.trim()) return "Para criar o projeto, preencha a descrição.";
    return "";
  });
  if (!v) return null;
  let projetoId = v.projeto || null;
  if (projetoId === "_novo") {
    const nome = v.descricao.trim();
    const existente = projetosUN().find(p => norm(p.nome) === norm(nome));
    if (existente) projetoId = existente.id;
    else {
      const p = { id: uid(), nome, status: "andamento", autor: quemSou(), unidade: UN };
      projetos.push(p); salvarTudo(); nuvemSalvarProjeto(p);
      projetoId = p.id;
      toast(`📁 Projeto “${curto(nome, 40)}” criado`);
    }
  }
  const dados = { numero: v.numero.trim(), descricao: v.descricao.trim(), disciplina: v.disciplina, projeto_id: projetoId };
  if (o) { await gmAtualizar("os", o.id, dados); return o; }
  const nova = { id: uid(), unidade: UN, status: "aberta", autor: quemSou(), ...dados };
  return (await gmInserir("os", [nova])) ? nova : null;
}

/* seletor de OS (existente ou nova) dentro de uma folha */
function gmHtmlEscolhaOS(selId = "", sugestao = "") {
  const oss = gmOS().filter(o => o.status === "aberta")
    .sort((a, b) => (!!b.projeto_id - !!a.projeto_id) || String(b.criado_em || "").localeCompare(String(a.criado_em || "")));
  return `<div class="gm-os-escolha">
    <input type="search" class="gm-os-busca" placeholder="Procurar OS por nº, descrição ou projeto…" autocomplete="off" value="${esc(sugestao)}">
    <div class="gm-os-lista">${oss.map(o => {
      const p = o.projeto_id ? projetos.find(x => x.id === o.projeto_id) : null;
      return `<label class="gm-os-op" data-busca="${esc(norm([o.numero, o.descricao, o.disciplina, p ? p.nome : ""].join(" ")))}">
        <input type="radio" name="gm-os" value="${esc(o.id)}" ${o.id === selId ? "checked" : ""}>
        <span><b>${o.numero ? "OS " + esc(o.numero) : "OS s/ nº"}</b> ${esc(o.descricao)}${o.disciplina ? ` <span class="chip-disc">${esc(o.disciplina)}</span>` : ""}
        <small>${p ? "📁 " + esc(p.nome) : "OS solta"}</small></span></label>`;
    }).join("") || `<div class="gm-os-nenhuma">Nenhuma OS aberta ainda.</div>`}</div>
    <button type="button" class="btn sec gm-os-nova">+ Nova OS</button>
  </div>`;
}
function gmLigarEscolhaOS(raiz, aoCriar) {
  const busca = raiz.querySelector(".gm-os-busca");
  const filtrar = () => {
    const t = norm(busca.value).trim().split(/\s+/).filter(Boolean);
    raiz.querySelectorAll(".gm-os-op").forEach(l => { l.hidden = !t.every(x => l.dataset.busca.includes(x)); });
  };
  busca.oninput = filtrar;
  filtrar();
  raiz.querySelector(".gm-os-nova").onclick = async () => {
    const o = await aoCriar();
    if (!o) return;
    raiz.querySelector(".gm-os-escolha").outerHTML = gmHtmlEscolhaOS(o.id);
    gmLigarEscolhaOS(raiz, aoCriar);
  };
}

/* mover itens para outra OS */
async function gmMoverItens(ids) {
  const f = folha({ titulo: `Mover ${ids.length} item(ns) para outra OS`, largura: 620 });
  f.corpo.innerHTML = gmHtmlEscolhaOS() + `<div class="folha-acoes"><span class="espacador"></span>
    <button class="btn sec" data-fechar-folha>Cancelar</button><button class="btn" id="gm-mover-ok">Mover</button></div>`;
  gmLigarEscolhaOS(f.corpo, () => gmFormOS());
  f.corpo.querySelector("#gm-mover-ok").onclick = () => {
    const r = f.corpo.querySelector('input[name="gm-os"]:checked');
    if (!r) { toast("Escolha a OS de destino."); return; }
    f.fechar(r.value);
  };
  const destino = await f.fechou;
  if (!destino) return false;
  const ok = await gmAtualizar("mat", ids, { os_id: destino });
  if (ok) toast("↪ Itens movidos para " + rotOS(GM.os.find(o => o.id === destino)));
  return ok;
}

/* ============================================================
   VINCULAR RM → OS (a RM inteira em lote, ou itens picados)
   ============================================================ */
const gmChavesRM = (l) => [...mapaItens(l).entries()];       // [chave, item] na ordem da folha
async function gmVincularRM(listaId = null) {
  await gmCarregar();
  if (GM.semTabelas) { toast("A Gestão de Materiais ainda não foi instalada no banco (veja Ajuda)."); return; }
  if (!GM.pronto) { toast("Não consegui carregar a Gestão de Materiais agora."); return; }
  /* 1) qual RM (se não veio da própria RM) */
  if (!listaId) {
    const rms = listasUN().filter(l => l.tipo !== "MM" && l.status === "concluida")
      .sort((a, b) => String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")));
    const f = folha({ titulo: "Vincular RM à OS — escolha a requisição", largura: 640 });
    const vinc = new Map();
    for (const m of GM.mat) vinc.set(m.lista_id, (vinc.get(m.lista_id) || 0) + 1);
    f.corpo.innerHTML = `<p class="folha-nota">Só aparecem RMs <strong>concluídas</strong>. Para vincular uma RM em andamento, conclua-a primeiro (ela trava para edição).</p>
      <input type="search" class="gm-rm-busca" placeholder="Procurar RM…" autocomplete="off">
      <div class="gm-rm-lista">${rms.map(l => {
        const n = (l.itens || []).length, v = vinc.get(l.id) || 0;
        const p = projetos.find(x => x.id === l.projetoId);
        return `<button class="gm-rm-op${v >= n && n ? " completa" : ""}" data-rm="${esc(l.id)}" data-busca="${esc(norm(l.titulo + " " + (p ? p.nome : "") + " " + (l.numero || "")))}">
          <b>${esc(l.titulo)}</b><small>${dataBR(l.data || l.criadoEm)} · ${n} ite${n === 1 ? "m" : "ns"}${p ? " · 📁 " + esc(p.nome) : ""}</small>
          <span class="gm-rm-v">${v ? (v >= n ? "✓ todos vinculados" : `${v}/${n} vinculados`) : "nenhum vinculado"}</span></button>`;
      }).join("") || `<div class="vazio">Nenhuma RM concluída na ${esc(UNI().nome)}.</div>`}</div>`;
    const b = f.corpo.querySelector(".gm-rm-busca");
    b.oninput = () => { const t = norm(b.value).trim().split(/\s+/).filter(Boolean); f.corpo.querySelectorAll(".gm-rm-op").forEach(x => { x.hidden = !t.every(y => x.dataset.busca.includes(y)); }); };
    f.corpo.onclick = (e) => { const x = e.target.closest("[data-rm]"); if (x) f.fechar(x.dataset.rm); };
    listaId = await f.fechou;
    if (!listaId) return;
  }
  const L = listas.find(l => l.id === listaId);
  if (!L) return;
  if (L.status !== "concluida") { toast("Conclua a RM antes de vincular os itens a uma OS."); return; }

  /* 2) itens (lote ou picados) + OS + OC/datas opcionais */
  const ja = new Map(GM.mat.filter(m => m.lista_id === L.id).map(m => [m.item_chave, m]));
  const itens = gmChavesRM(L);
  const livres = itens.filter(([k]) => !ja.has(k));
  if (!livres.length) {
    toast("Todos os itens desta RM já estão vinculados.");
    const os1 = [...ja.values()][0]; if (os1) location.hash = "#/os/" + os1.os_id;
    return;
  }
  const proj = projetos.find(p => p.id === L.projetoId);
  const sugestaoOS = gmOS().find(o => o.status === "aberta" && L.projetoId && o.projeto_id === L.projetoId && [...ja.values()].some(m => m.os_id === o.id))
    || ([...ja.values()][0] && GM.os.find(o => o.id === [...ja.values()][0].os_id));
  const f = folha({ titulo: "Vincular à OS — " + curto(L.titulo, 50), largura: 760 });
  f.corpo.innerHTML = `
    <div class="gm-vinc-passo"><span class="gm-passo">1</span><h3>Itens da RM</h3>
      <label class="gm-todos"><input type="checkbox" id="gm-v-todos" checked> RM inteira (${livres.length})</label></div>
    <div class="gm-v-itens">${itens.map(([k, i]) => {
      const v = ja.get(k), o = v && GM.os.find(x => x.id === v.os_id);
      return `<label class="gm-v-item${v ? " ja" : ""}"><input type="checkbox" data-k="${esc(k)}" ${v ? "disabled" : "checked"}>
        <span class="gm-v-cod">${esc(i.codigo)}</span><span class="gm-v-desc">${esc(i.descricao)}${v ? `<small>já na ${esc(rotOS(o))}</small>` : ""}</span>
        <span class="gm-v-qtd">${fmtNum(i.qtd) || 0} ${esc(i.un || "")}</span></label>`;
    }).join("")}</div>
    <div class="gm-vinc-passo"><span class="gm-passo">2</span><h3>OS do Sadege</h3>${proj ? `<span class="gm-dica-proj">RM do projeto 📁 ${esc(proj.nome)}</span>` : ""}</div>
    ${gmHtmlEscolhaOS(sugestaoOS ? sugestaoOS.id : "")}
    <details class="gm-vinc-extra"><summary><span class="gm-passo">3</span> OC e datas agora <small>(opcional — dá para preencher depois)</small></summary>
      <div class="gm-v-datas">
        <label>Ordem de compra (OC)<input id="gm-v-oc" inputmode="numeric" autocomplete="off"></label>
        <label>Data do pedido<input type="date" id="gm-v-ped"></label>
        <label>Previsão de entrega<input type="date" id="gm-v-prev"></label>
      </div></details>
    <div class="folha-acoes"><span class="gm-v-resumo" id="gm-v-resumo"></span><span class="espacador"></span>
      <button class="btn sec" data-fechar-folha>Cancelar</button><button class="btn" id="gm-v-ok">Vincular</button></div>`;
  const marcados = () => [...f.corpo.querySelectorAll(".gm-v-item input:checked:not(:disabled)")].map(x => x.dataset.k);
  const resumo = () => {
    const n = marcados().length;
    f.corpo.querySelector("#gm-v-resumo").textContent = `${n} de ${livres.length} item(ns)`;
    f.corpo.querySelector("#gm-v-ok").textContent = n === livres.length ? `Vincular a RM inteira (${n})` : `Vincular ${n} item(ns)`;
    f.corpo.querySelector("#gm-v-todos").checked = n === livres.length;
    f.corpo.querySelector("#gm-v-todos").indeterminate = n > 0 && n < livres.length;
  };
  f.corpo.querySelector("#gm-v-todos").onchange = (e) => { f.corpo.querySelectorAll(".gm-v-item input:not(:disabled)").forEach(x => { x.checked = e.target.checked; }); resumo(); };
  f.corpo.querySelector(".gm-v-itens").onchange = resumo;
  gmLigarEscolhaOS(f.corpo, () => gmFormOS(null, { descricao: proj ? proj.nome : L.titulo, projetoId: L.projetoId || "" }));
  resumo();
  f.corpo.querySelector("#gm-v-ok").onclick = async () => {
    const ks = marcados();
    const r = f.corpo.querySelector('input[name="gm-os"]:checked');
    if (!ks.length) { toast("Marque ao menos um item."); return; }
    if (!r) { toast("Escolha a OS (ou crie uma nova)."); f.corpo.querySelector(".gm-os-busca").focus(); return; }
    const o = GM.os.find(x => x.id === r.value);
    const oc = f.corpo.querySelector("#gm-v-oc").value.trim(), ped = f.corpo.querySelector("#gm-v-ped").value, prev = f.corpo.querySelector("#gm-v-prev").value;
    const p = o.projeto_id ? projetos.find(x => x.id === o.projeto_id) : null;
    const ok = await confirmar({ titulo: "Confirmar vínculo", icone: "🔗", ok: "Vincular",
      texto: `<strong>${ks.length}</strong> ${ks.length === 1 ? "item" : "itens"} da RM <strong>${esc(L.titulo)}</strong>
        ${ks.length === livres.length ? "(a RM inteira)" : "(picados)"} vão para a <strong>${esc(rotOS(o))}</strong>
        — ${p ? "projeto 📁 " + esc(p.nome) : "OS solta"}.`,
      detalhes: [oc ? `OC: <strong>${esc(oc)}</strong>` : "", ped ? `Pedido: ${dataBR(ped)}` : "", prev ? `Previsão: ${dataBR(prev)}` : ""].filter(Boolean) });
    if (!ok) return;
    const mapa = new Map(itens);
    const novos = ks.map(k => { const i = mapa.get(k); return {
      id: uid(), unidade: UN, os_id: o.id, lista_id: L.id, item_chave: k,
      codigo: String(i.codigo || ""), descricao: String(i.descricao || ""), un: String(i.un || ""),
      qtd: +i.qtd || 0, preco: +i.preco || 0, oc, data_pedido: ped || null, data_prev: prev || null, autor: quemSou() }; });
    if (await gmInserir("mat", novos)) {
      f.fechar(true);
      toast(`🔗 ${novos.length} item(ns) vinculado(s) à ${rotOS(o)}`);
      const alvo = "#/os/" + o.id;
      if (location.hash === alvo) render(); else location.hash = alvo;
    }
  };
}

/* ============================================================
   TELA DA OS — #/os/<id>
   ============================================================ */
function telaOS(app, id) {
  GM.tela = () => { if (location.hash === "#/os/" + id) telaOS(app, id); };
  if (!GM.pronto) { app.innerHTML = gmAvisoCarga(); gmLigarCab(); if (!GM.semTabelas && !GM.erro) gmCarregar().then(() => GM.tela && GM.tela()); return; }
  const o = GM.os.find(x => x.id === id);
  if (!o) { app.innerHTML = `<div class="vazio">OS não encontrada (pode ter sido excluída).<br><br><a class="btn" href="#/materiais">Voltar ao quadro</a></div>`; return; }
  if (!garantirUnidade(o.unidade || "UIS3")) return;
  const idx = gmIdx();
  const r = gmResumoOS(o, idx);
  const seps = gmSep().filter(s => (idx.siPorSep.get(s.id) || []).some(x => { const m = idx.matPor.get(x.mat_id); return m && m.os_id === o.id; }));
  const tot = r.itens.length;
  app.innerHTML = `
    <div class="pagina-titulo gm-titulo">
      <a class="btn sec mini" href="#/materiais">← Quadro</a>
      <h1>${o.numero ? "OS " + esc(o.numero) : "OS sem nº"}</h1>
      ${o.disciplina ? `<span class="chip-disc grande">${esc(o.disciplina)}</span>` : ""}
      ${o.status !== "aberta" ? `<span class="etiqueta ok">${o.status === "concluida" ? "✔ concluída" : "cancelada"}</span>` : ""}
      <span class="espacador"></span>
      <button class="btn sec" id="os-editar">Editar</button>
      <button class="btn sec" id="os-sep">+ Lista de separação</button>
      <button class="btn" id="os-vinc">🔗 Vincular itens</button>
    </div>
    <div class="os-cabecalho ${r.proj ? "de-projeto" : ""}">
      <div class="os-cab-desc">${esc(o.descricao || "—")}</div>
      <div class="os-cab-proj">${r.proj ? `📁 Projeto <a href="#/projeto/${esc(r.proj.id)}">${esc(r.proj.nome)}</a>` : "OS solta (sem projeto)"}</div>
    </div>
    <div class="resumo-blocos gm-resumo">
      <div class="resumo-num"><div class="rot">Itens</div><div class="val">${tot}</div></div>
      <div class="resumo-num"><div class="rot">Valor</div><div class="val">${dinheiro(r.valor)}</div></div>
      <div class="resumo-num"><div class="rot">Entregues</div><div class="val">${r.cont.entregue}<small>/${tot}</small></div></div>
      <div class="resumo-num${r.atrasados ? " alerta" : ""}"><div class="rot">Próxima previsão</div><div class="val">${r.prox ? dataBR(r.prox) : "—"}${r.atrasados ? `<small class="atraso"> ⚠ ${r.atrasados} atrasado(s)</small>` : ""}</div></div>
    </div>
    ${tot ? `<div class="os-barra grande">${ETAPAS.map(e => r.cont[e.id] ? `<i class="et-${e.id}" style="flex:${r.cont[e.id]}"><span>${e.curto} ${r.cont[e.id]}</span></i>` : "").join("")}</div>` : ""}
    <div class="secao-titulo">Itens</div>
    <div id="os-itens"></div>
    <div class="secao-titulo">Listas de separação</div>
    ${seps.length ? `<div class="grade-cartoes">${seps.map(s => gmCartaoSep(s, idx)).join("")}</div>` : `<div class="vazio">Nenhuma lista de separação com itens desta OS.</div>`}
    <div class="os-rodape">
      ${o.status === "aberta" ? `<button class="btn sec" id="os-concluir">✔ Concluir OS</button>` : `<button class="btn sec" id="os-reabrir">Reabrir OS</button>`}
      <button class="btn perigo" id="os-excluir">Excluir OS</button>
      <span class="os-autor">${o.autor ? "Criada por " + esc(o.autor) : ""}${o.criado_em ? " em " + esc(dataHoraBR(o.criado_em)) : ""}</span>
    </div>`;
  gmAbaItens($("#os-itens"), o.id);
  $("#os-editar").onclick = async () => { if (await gmFormOS(o)) telaOS(app, id); };
  $("#os-vinc").onclick = () => gmVincularRM();
  $("#os-sep").onclick = () => {
    const ids = r.itens.filter(m => { const e = gmEtapa(m, idx); return ETAPA_ORDEM[e] <= ETAPA_ORDEM.comprado; }).map(m => m.id);
    gmNovaSeparacao(ids.length ? ids : null, o.id);
  };
  const conc = $("#os-concluir");
  if (conc) conc.onclick = async () => {
    const pend = tot - r.cont.entregue;
    if (!await confirmar({ titulo: "Concluir a OS?", icone: "✔", ok: "Concluir",
      texto: pend ? `Ainda há <strong>${pend}</strong> item(ns) não entregue(s). A OS sai do quadro principal, mas os itens continuam registrados.` : "Todos os itens foram entregues. A OS sai do quadro principal." })) return;
    if (await gmAtualizar("os", o.id, { status: "concluida" })) telaOS(app, id);
  };
  const reab = $("#os-reabrir"); if (reab) reab.onclick = async () => { if (await gmAtualizar("os", o.id, { status: "aberta" })) telaOS(app, id); };
  $("#os-excluir").onclick = async () => {
    if (!await confirmar({ titulo: "Excluir esta OS?", icone: "🗑", perigo: true, ok: "Excluir OS",
      texto: `<strong>${esc(rotOS(o))}</strong>${tot ? `<br>Os <strong>${tot}</strong> item(ns) vinculados saem da Gestão de Materiais (as RMs não mudam) e saem das listas de separação.` : ""}<br>Não dá para desfazer.` })) return;
    if (await gmExcluir("os", [o.id])) { toast("OS excluída"); location.hash = "#/materiais"; }
  };
}

/* ============================================================
   SEPARAÇÃO — listas para o almoxarifado
   ============================================================ */
function gmCartaoSep(s, idx) {
  const its = idx.siPorSep.get(s.id) || [];
  const feitos = its.filter(x => x.separado).length;
  const oss = [...new Set(its.map(x => (idx.matPor.get(x.mat_id) || {}).os_id).filter(Boolean))].map(id => idx.osPor.get(id)).filter(Boolean);
  return `<a class="cartao sep-cartao st-${s.status}" href="#/separacao/${esc(s.id)}">
    <span class="sep-topo"><b>${numSep(s)}</b><span class="st-chip st-${s.status}">${SEP_STATUS[s.status] || s.status}</span></span>
    <span class="sep-tit">${esc(s.titulo || "Lista de separação")}</span>
    <span class="sub">${oss.slice(0, 3).map(o => esc(o.numero ? "OS " + o.numero : curto(o.descricao, 20))).join(" · ")}${oss.length > 3 ? ` +${oss.length - 3}` : ""}</span>
    <span class="sep-prog"><span class="gm-mini-barra"><i style="width:${its.length ? feitos / its.length * 100 : 0}%"></i></span><small>${feitos}/${its.length} separados</small></span>
    <span class="sub">${s.responsavel ? "👷 " + esc(s.responsavel) + " · " : ""}${s.enviada_em ? "enviada " + esc(dataHoraBR(s.enviada_em)) : "criada " + esc(dataHoraBR(s.criado_em))}</span>
  </a>`;
}
function gmAbaSeparacao(corpo) {
  const idx = gmIdx();
  const filtro = sessionStorage.getItem("rq.sepFiltro") || "abertas";
  const ordemSt = { enviada: 0, rascunho: 1, separada: 2, entregue: 3, cancelada: 4 };
  let seps = gmSep();
  if (ehAlmox()) seps = seps.filter(s => s.status !== "rascunho");
  const cont = { abertas: seps.filter(s => ["rascunho", "enviada", "separada"].includes(s.status)).length,
                 entregue: seps.filter(s => s.status === "entregue").length, todas: seps.length };
  const vis = seps.filter(s => filtro === "todas" ? true : filtro === "entregue" ? s.status === "entregue" : ["rascunho", "enviada", "separada"].includes(s.status))
    .sort((a, b) => (ordemSt[a.status] - ordemSt[b.status]) || String(b.criado_em || "").localeCompare(String(a.criado_em || "")));
  corpo.innerHTML = `
    <div class="h-chips gm-sep-filtro">${[["abertas", "Abertas"], ["entregue", "Entregues"], ["todas", "Todas"]]
      .map(([k, r]) => `<button class="h-chip ${filtro === k ? "bc-ativo" : ""}" data-f="${k}">${r} <b>${cont[k]}</b></button>`).join("")}</div>
    ${vis.length ? `<div class="grade-cartoes">${vis.map(s => gmCartaoSep(s, idx)).join("")}</div>`
      : `<div class="vazio">${ehAlmox() ? "Nenhuma lista de separação enviada para o almoxarifado agora." :
          "Nenhuma lista aqui.<br>Crie uma com <strong>+ Lista de separação</strong>: escolha RMs inteiras ou itens picados."}</div>`}`;
  corpo.onclick = (e) => { const b = e.target.closest("[data-f]"); if (b) { sessionStorage.setItem("rq.sepFiltro", b.dataset.f); gmAbaSeparacao(corpo); } };
}

/* nova lista: itens pré-escolhidos (da seleção / OS) ou escolha por RM inteira ou picados */
async function gmNovaSeparacao(preIds = null, osId = null) {
  await gmCarregar();
  if (GM.semTabelas) { toast("A Gestão de Materiais ainda não foi instalada no banco (veja Ajuda)."); return; }
  if (!GM.pronto) return;
  const idx = gmIdx();
  const disponiveis = gmMat().filter(m => !m.cancelado && !m.data_entrega && !gmSepDoItem(m, idx))
    .filter(m => { const o = idx.osPor.get(m.os_id); return o && o.status !== "cancelada"; });
  if (!disponiveis.length) { toast("Não há itens disponíveis: todos já estão em listas, entregues ou cancelados."); return; }
  const pre = new Set((preIds || []).filter(id => disponiveis.some(m => m.id === id)));
  if (preIds && preIds.length && !pre.size) { toast("Os itens escolhidos já estão em listas de separação ou entregues."); return; }
  /* agrupado por RM (lote) com os itens (picados) */
  const porRM = new Map();
  for (const m of disponiveis) { if (!porRM.has(m.lista_id)) porRM.set(m.lista_id, []); porRM.get(m.lista_id).push(m); }
  const f = folha({ titulo: "Nova lista de separação", largura: 760 });
  const sugTit = (() => {
    const oss = [...new Set((pre.size ? [...pre].map(id => idx.matPor.get(id)) : []).map(m => m.os_id))].map(id => idx.osPor.get(id));
    const o = osId ? idx.osPor.get(osId) : (oss.length === 1 ? oss[0] : null);
    return o ? rotOS(o) : `Separação ${dataBR(hoje())}`;
  })();
  f.corpo.innerHTML = `
    <label class="gm-campo">Título<input id="gm-s-tit" value="${esc(sugTit)}" autocomplete="off"></label>
    <label class="gm-campo">Quem separa no almoxarifado <small>(opcional)</small><input id="gm-s-resp" list="gm-dl-almox" autocomplete="off" placeholder="Nome"></label>
    <datalist id="gm-dl-almox">${(pessoas || []).filter(p => p.papel === "almoxarifado").map(p => `<option value="${esc(p.nome)}">`).join("")}</datalist>
    <div class="gm-vinc-passo"><span class="gm-passo">✓</span><h3>Itens</h3><input type="search" class="gm-s-busca" placeholder="Filtrar…" autocomplete="off"></div>
    <div class="gm-s-grupos">${[...porRM.entries()].map(([lid, ms]) => {
      const l = listas.find(x => x.id === lid);
      const marcar = (m) => pre.size ? pre.has(m.id) : (osId ? m.os_id === osId : false);
      return `<div class="gm-s-grupo" data-busca="${esc(norm((l ? l.titulo : "") + " " + ms.map(m => m.codigo + " " + m.descricao + " " + ((idx.osPor.get(m.os_id) || {}).numero || "")).join(" ")))}">
        <label class="gm-s-rm"><input type="checkbox" data-rm="${esc(lid)}" ${ms.every(marcar) ? "checked" : ""}>
          <b>RM ${esc(l ? curto(l.titulo, 50) : "removida")}</b><small>${ms.length} disponível(is) · marcar a RM inteira (lote)</small></label>
        ${ms.map(m => { const o = idx.osPor.get(m.os_id); return `<label class="gm-v-item"><input type="checkbox" data-m="${esc(m.id)}" data-de="${esc(lid)}" ${marcar(m) ? "checked" : ""}>
          <span class="gm-v-cod">${esc(m.codigo)}</span><span class="gm-v-desc">${esc(m.descricao)}<small>${esc(rotOS(o))}${m.oc ? " · OC " + esc(m.oc) : ""}${m.data_prev ? " · prev. " + dataCurta(m.data_prev) : ""}</small></span>
          <span class="gm-v-qtd">${fmtNum(+m.qtd) || 0} ${esc(m.un)}</span></label>`; }).join("")}
      </div>`;
    }).join("")}</div>
    <div class="folha-acoes"><span class="gm-v-resumo" id="gm-s-res"></span><span class="espacador"></span>
      <button class="btn sec" data-fechar-folha>Cancelar</button><button class="btn" id="gm-s-ok">Criar lista</button></div>`;
  const resumo = () => {
    const n = f.corpo.querySelectorAll("input[data-m]:checked").length;
    f.corpo.querySelector("#gm-s-res").textContent = `${n} item(ns) marcados`;
    f.corpo.querySelectorAll("input[data-rm]").forEach(cb => {
      const filhos = [...f.corpo.querySelectorAll(`input[data-de="${CSS.escape(cb.dataset.rm)}"]`)];
      const k = filhos.filter(x => x.checked).length;
      cb.checked = k === filhos.length && k > 0; cb.indeterminate = k > 0 && k < filhos.length;
    });
  };
  f.corpo.onchange = (e) => {
    const cb = e.target;
    if (cb.dataset.rm) f.corpo.querySelectorAll(`input[data-de="${CSS.escape(cb.dataset.rm)}"]`).forEach(x => { x.checked = cb.checked; });
    resumo();
  };
  const busca = f.corpo.querySelector(".gm-s-busca");
  busca.oninput = () => { const t = norm(busca.value).trim().split(/\s+/).filter(Boolean); f.corpo.querySelectorAll(".gm-s-grupo").forEach(g => { g.hidden = !t.every(x => g.dataset.busca.includes(x)); }); };
  resumo();
  f.corpo.querySelector("#gm-s-ok").onclick = async () => {
    const ids = [...f.corpo.querySelectorAll("input[data-m]:checked")].map(x => x.dataset.m);
    if (!ids.length) { toast("Marque ao menos um item."); return; }
    const titulo = f.corpo.querySelector("#gm-s-tit").value.trim() || "Lista de separação";
    const resp = f.corpo.querySelector("#gm-s-resp").value.trim();
    const sep = { id: uid(), unidade: UN, titulo, responsavel: resp, status: "rascunho", autor: quemSou() };
    if (!await gmInserir("sep", [sep])) return;
    const ordem = disponiveis.filter(m => ids.includes(m.id));
    const ok = await gmInserir("si", ordem.map((m, i) => ({ id: uid(), sep_id: sep.id, mat_id: m.id, qtd: +m.qtd || 0, ordem: i })));
    if (!ok) { await gmExcluir("sep", [sep.id]); return; }
    f.fechar(true);
    toast(`📋 Lista criada com ${ids.length} item(ns) — revise e envie ao almoxarifado`);
    location.hash = "#/separacao/" + sep.id;
  };
}

/* ---------------- tela da lista: checklist (almoxarifado) ---------------- */
function telaSeparacao(app, id) {
  GM.tela = () => { if (location.hash === "#/separacao/" + id) telaSeparacao(app, id); };
  if (!GM.pronto) { app.innerHTML = gmAvisoCarga(); gmLigarCab(); if (!GM.semTabelas && !GM.erro) gmCarregar().then(() => GM.tela && GM.tela()); return; }
  const s = GM.sep.find(x => x.id === id);
  if (!s) { app.innerHTML = `<div class="vazio">Lista não encontrada (pode ter sido excluída).<br><br><a class="btn" href="#/materiais/separacao">Ver as listas</a></div>`; return; }
  if (!garantirUnidade(s.unidade || "UIS3")) return;
  const idx = gmIdx();
  const its = (idx.siPorSep.get(s.id) || []).slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const feitos = its.filter(x => x.separado).length;
  const rasc = s.status === "rascunho", aberta = s.status === "enviada", fechada = ["entregue", "cancelada"].includes(s.status);
  const podeMarcar = s.status === "enviada" || s.status === "separada";
  const almox = ehAlmox();
  const pct = its.length ? Math.round(feitos / its.length * 100) : 0;
  const abertos = new Set(GM.sepAbertos || []);
  const linha = (x) => {
    const m = idx.matPor.get(x.mat_id) || {};
    const o = idx.osPor.get(m.os_id);
    const rm = listas.find(l => l.id === m.lista_id);
    const atr = m.data_prev && m.data_prev < hoje() && !x.separado;
    const qs = x.qtd_sep != null && +x.qtd_sep !== +x.qtd;
    return `<li class="sep-item${x.separado ? " ok" : ""}${qs ? " parcial" : ""}" data-si="${esc(x.id)}">
      <button class="sep-check" ${podeMarcar ? "" : "disabled"} aria-pressed="${x.separado}" aria-label="${x.separado ? "Desmarcar" : "Marcar como separado"}">${x.separado ? "✓" : ""}</button>
      <div class="sep-info">
        <div class="sep-l1"><b class="sep-cod">${esc(m.codigo || "—")}</b><span class="sep-qtd">${fmtNum(+x.qtd) || 0} <small>${esc(m.un || "")}</small></span></div>
        <div class="sep-desc">${esc(m.descricao || "")}</div>
        <div class="sep-meta">${m.oc ? `<span>OC <b>${esc(m.oc)}</b></span>` : `<span class="sem">sem OC</span>`}
          ${m.data_pedido ? `<span>pedido ${dataCurta(m.data_pedido)}</span>` : ""}
          ${m.data_prev ? `<span class="${atr ? "atraso" : ""}">prev. ${dataCurta(m.data_prev)}</span>` : ""}
          <span>${esc(o ? (o.numero ? "OS " + o.numero : curto(o.descricao, 24)) : "")}</span></div>
        ${x.separado ? `<div class="sep-quem">✓ ${esc(x.separado_por || "")} ${x.separado_em ? "· " + esc(dataHoraBR(x.separado_em)) : ""}${qs ? ` · separado <b>${fmtNum(+x.qtd_sep)}</b> de ${fmtNum(+x.qtd)}` : ""}</div>` : ""}
        ${x.obs ? `<div class="sep-obs">📝 ${esc(x.obs)}</div>` : ""}
        <details class="sep-mais"${abertos.has(x.id) ? " open" : ""}><summary>${rasc ? "Quantidade e remover" : "Quantidade separada e observação"}</summary>
          <div class="sep-mais-c">
            ${rasc ? `<label>Qtd na lista<input type="number" step="any" min="0" data-qtd value="${esc(x.qtd)}"></label>
              <button class="btn mini perigo" data-remover>Remover da lista</button>`
              : `<label>Qtd separada<input type="number" step="any" min="0" data-qtdsep value="${esc(x.qtd_sep ?? "")}" placeholder="${esc(x.qtd)}" ${podeMarcar ? "" : "disabled"}></label>
              <label class="sep-obs-in">Observação<input data-obs value="${esc(x.obs || "")}" placeholder="ex.: faltou 2 unidades" ${fechada ? "disabled" : ""}></label>`}
            ${rm ? `<a class="sep-rm" href="#/lista/${esc(rm.id)}">RM ${esc(curto(rm.titulo, 40))}</a>` : ""}
          </div></details>
      </div></li>`;
  };
  app.innerHTML = `
    <div class="pagina-titulo gm-titulo sep-titulo">
      <a class="btn sec mini" href="#/materiais/separacao">← Listas</a>
      <h1>${numSep(s)}</h1><span class="st-chip st-${s.status} grande">${SEP_STATUS[s.status]}</span>
      <span class="espacador"></span>
      <button class="btn sec" id="sep-pdf">⬇ PDF</button>
      <button class="btn sec" id="sep-comp">↗ Compartilhar</button>
    </div>
    <div class="sep-cab">
      ${rasc && !almox ? `<input class="sep-tit-in" id="sep-tit" value="${esc(s.titulo)}" aria-label="Título">` : `<div class="sep-tit-txt">${esc(s.titulo || "Lista de separação")}</div>`}
      <div class="sep-cab-l2">${s.responsavel ? `👷 ${esc(s.responsavel)}` : ""}${s.autor ? ` · pedido por ${esc(s.autor)}` : ""}
        ${s.enviada_em ? ` · enviada ${esc(dataHoraBR(s.enviada_em))}` : ""}${s.separada_em ? ` · separada ${esc(dataHoraBR(s.separada_em))}` : ""}${s.entregue_em ? ` · entregue ${esc(dataHoraBR(s.entregue_em))}` : ""}</div>
    </div>
    <div class="sep-progresso" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
      <div class="sep-prog-txt"><span><b>${feitos}</b> de <b>${its.length}</b> separados</span><span class="sep-pct">${pct}%</span></div>
      <div class="sep-prog-barra"><i style="width:${pct}%"></i></div>
    </div>
    ${rasc ? `<div class="aviso-info">Rascunho: o almoxarifado ainda não vê esta lista. Confira os itens e toque em <strong>Enviar ao almoxarifado</strong>.</div>` : ""}
    <ul class="sep-lista">${its.map(linha).join("") || `<li class="vazio">Lista vazia.</li>`}</ul>
    <div class="sep-acoes" id="sep-acoes">
      ${rasc && !almox ? `<button class="btn sec" id="sep-add">+ Itens</button><button class="btn perigo" id="sep-del">Excluir</button><span class="espacador"></span><button class="btn" id="sep-enviar">Enviar ao almoxarifado</button>` : ""}
      ${aberta ? `${almox ? "" : `<button class="btn sec" id="sep-voltar">Voltar p/ rascunho</button>`}<span class="espacador"></span><button class="btn" id="sep-concluir">${feitos === its.length ? "✔ Concluir separação" : `Concluir separação (${feitos}/${its.length})`}</button>` : ""}
      ${s.status === "separada" ? `<button class="btn sec" id="sep-reabrir">Reabrir</button><span class="espacador"></span><button class="btn" id="sep-entregar">📦 Marcar entregue</button>` : ""}
      ${s.status === "entregue" ? `<span class="sep-fim">📦 Material entregue${s.entregue_em ? " em " + esc(dataHoraBR(s.entregue_em)) : ""}.</span>` : ""}
    </div>`;

  const tit = $("#sep-tit");
  if (tit) tit.onchange = () => gmAtualizar("sep", s.id, { titulo: tit.value.trim() || "Lista de separação" });
  $("#sep-pdf").onclick = () => gmPdfSeparacao(s.id, false);
  $("#sep-comp").onclick = () => gmPdfSeparacao(s.id, true);
  const lista = $(".sep-lista");
  lista.addEventListener("toggle", (e) => {
    const li = e.target.closest && e.target.closest("[data-si]"); if (!li || !e.target.matches("details")) return;
    const set = new Set(GM.sepAbertos || []); e.target.open ? set.add(li.dataset.si) : set.delete(li.dataset.si); GM.sepAbertos = [...set];
  }, true);
  lista.onclick = async (e) => {
    const li = e.target.closest("[data-si]"); if (!li) return;
    const x = GM.si.find(y => y.id === li.dataset.si); if (!x) return;
    if (e.target.closest("[data-remover]")) {
      if (!await confirmar({ titulo: "Remover este item da lista?", ok: "Remover", texto: "O item continua vinculado à OS e pode entrar em outra lista." })) return;
      if (await gmExcluir("si", [x.id])) telaSeparacao(app, id);
      return;
    }
    const alvo = e.target.closest(".sep-check") || (podeMarcar && !e.target.closest("details, a, input, button") ? li.querySelector(".sep-check") : null);
    if (!alvo || !podeMarcar) return;
    const marcar = !x.separado;
    const campos = marcar ? { separado: true, separado_por: quemSou(), separado_em: new Date().toISOString() }
                          : { separado: false, separado_por: null, separado_em: null };
    li.classList.toggle("ok", marcar);                       // resposta imediata ao toque
    if (navigator.vibrate) try { navigator.vibrate(12); } catch { /* sem vibração */ }
    if (await gmAtualizar("si", x.id, campos)) {
      if (s.status === "separada" && !marcar) await gmAtualizar("sep", s.id, { status: "enviada", separada_em: null });
      telaSeparacao(app, id);
    } else telaSeparacao(app, id);
  };
  lista.onchange = async (e) => {
    const li = e.target.closest("[data-si]"); if (!li) return;
    const x = GM.si.find(y => y.id === li.dataset.si); if (!x) return;
    if (e.target.matches("[data-qtd]")) { const v = parseFloat(String(e.target.value).replace(",", ".")); if (isFinite(v) && v >= 0 && await gmAtualizar("si", x.id, { qtd: v })) toast("✓ Quantidade salva"); }
    if (e.target.matches("[data-qtdsep]")) { const t = String(e.target.value).trim(); const v = t === "" ? null : parseFloat(t.replace(",", ".")); if ((v === null || (isFinite(v) && v >= 0)) && await gmAtualizar("si", x.id, { qtd_sep: v })) { toast("✓ Salvo"); telaSeparacao(app, id); } }
    if (e.target.matches("[data-obs]")) { if (await gmAtualizar("si", x.id, { obs: e.target.value.trim() })) toast("✓ Observação salva"); }
  };
  const on = (sel, fn) => { const b = $(sel); if (b) b.onclick = fn; };
  on("#sep-add", async () => {
    const ja = new Set(its.map(x => x.mat_id));
    const livres = gmMat().filter(m => !m.cancelado && !m.data_entrega && !gmSepDoItem(m, idx) && !ja.has(m.id));
    if (!livres.length) { toast("Não há outros itens disponíveis."); return; }
    const f = folha({ titulo: "Adicionar itens à " + numSep(s), largura: 700 });
    f.corpo.innerHTML = `<input type="search" class="gm-s-busca" placeholder="Filtrar…" autocomplete="off"><div class="gm-v-itens">${livres.map(m => `<label class="gm-v-item" data-busca="${esc(norm(m.codigo + " " + m.descricao))}">
      <input type="checkbox" data-m="${esc(m.id)}"><span class="gm-v-cod">${esc(m.codigo)}</span><span class="gm-v-desc">${esc(m.descricao)}<small>${esc(rotOS(idx.osPor.get(m.os_id)))}</small></span>
      <span class="gm-v-qtd">${fmtNum(+m.qtd)} ${esc(m.un)}</span></label>`).join("")}</div>
      <div class="folha-acoes"><span class="espacador"></span><button class="btn sec" data-fechar-folha>Cancelar</button><button class="btn" id="gm-add-ok">Adicionar</button></div>`;
    const b = f.corpo.querySelector(".gm-s-busca");
    b.oninput = () => { const t = norm(b.value).trim().split(/\s+/).filter(Boolean); f.corpo.querySelectorAll(".gm-v-item").forEach(l => { l.hidden = !t.every(y => l.dataset.busca.includes(y)); }); };
    f.corpo.querySelector("#gm-add-ok").onclick = async () => {
      const ids = [...f.corpo.querySelectorAll("input[data-m]:checked")].map(x => x.dataset.m);
      if (!ids.length) { f.fechar(); return; }
      const base = its.length;
      await gmInserir("si", ids.map((mid, i) => ({ id: uid(), sep_id: s.id, mat_id: mid, qtd: +(GM.mat.find(m => m.id === mid) || {}).qtd || 0, ordem: base + i })));
      f.fechar(); telaSeparacao(app, id);
    };
  });
  on("#sep-del", async () => {
    if (!await confirmar({ titulo: "Excluir esta lista?", icone: "🗑", perigo: true, ok: "Excluir lista", texto: "Os itens continuam vinculados às OS e ficam livres para outra lista." })) return;
    if (await gmExcluir("sep", [s.id])) { toast("Lista excluída"); location.hash = "#/materiais/separacao"; }
  });
  on("#sep-enviar", async () => {
    if (!its.length) { toast("A lista está vazia."); return; }
    const semOC = its.filter(x => !(idx.matPor.get(x.mat_id) || {}).oc).length;
    const resp = s.responsavel ? `<strong>${esc(s.responsavel)}</strong>` : "a equipe do almoxarifado";
    if (!await confirmar({ titulo: "Enviar ao almoxarifado?", icone: "📋", ok: "Enviar",
      texto: `${its.length} item(ns) para ${resp} separar. Depois de enviada, a lista aparece no celular do almoxarifado e os itens ficam na etapa <strong>Em separação</strong>.`
        + (semOC ? `<br><br>⚠ <strong>${semOC}</strong> item(ns) ainda sem OC.` : "") })) return;
    if (await gmAtualizar("sep", s.id, { status: "enviada", enviada_em: new Date().toISOString() })) {
      toast("📋 Enviada ao almoxarifado");
      telaSeparacao(app, id);
      if (await confirmar({ titulo: "Avisar o almoxarifado agora?", icone: "↗", ok: "Compartilhar", cancelar: "Agora não",
        texto: "Manda o PDF e o link da lista pelo WhatsApp, e-mail…" })) gmPdfSeparacao(s.id, true);
    }
  });
  on("#sep-voltar", async () => {
    if (!await confirmar({ titulo: "Voltar para rascunho?", ok: "Voltar para rascunho", texto: "A lista some do almoxarifado até ser enviada de novo. As marcações feitas continuam." })) return;
    if (await gmAtualizar("sep", s.id, { status: "rascunho" })) telaSeparacao(app, id);
  });
  on("#sep-concluir", async () => {
    const falta = its.length - feitos;
    if (!await confirmar({ titulo: falta ? `Concluir com ${falta} item(ns) sem marcar?` : "Concluir a separação?", icone: "✔", ok: "Concluir separação",
      texto: falta ? `Os itens não marcados <strong>não</strong> contam como separados e voltam a ficar disponíveis para outra lista. Use a observação do item para explicar (ex.: “aguardando entrega”).`
                   : "Todos os itens foram separados. A engenharia vê na hora." })) return;
    if (falta) await gmExcluir("si", its.filter(x => !x.separado).map(x => x.id));
    if (await gmAtualizar("sep", s.id, { status: "separada", separada_em: new Date().toISOString() })) { toast("✔ Separação concluída"); telaSeparacao(app, id); }
  });
  on("#sep-reabrir", async () => { if (await gmAtualizar("sep", s.id, { status: "enviada", separada_em: null })) telaSeparacao(app, id); });
  on("#sep-entregar", async () => {
    if (!await confirmar({ titulo: "Marcar como entregue?", icone: "📦", ok: "Marcar entregue",
      texto: `O material separado (${feitos} item(ns)) saiu do almoxarifado para a frente de serviço. Os itens ficam como <strong>Entregue</strong> com a data de hoje.` })) return;
    const d = hoje();
    const mats = its.filter(x => x.separado).map(x => x.mat_id).filter(mid => !(idx.matPor.get(mid) || {}).data_entrega);
    if (mats.length) await gmAtualizar("mat", mats, { data_entrega: d });
    if (await gmAtualizar("sep", s.id, { status: "entregue", entregue_em: new Date().toISOString() })) { toast("📦 Entregue"); telaSeparacao(app, id); }
  });
}

/* ---------------- PDF da lista de separação (A4 retrato, checklist) ---------------- */
async function gmPdfSeparacao(id, compartilhar) {
  const s = GM.sep.find(x => x.id === id); if (!s) return;
  const idx = gmIdx();
  const its = (idx.siPorSep.get(s.id) || []).slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const link = location.origin + location.pathname + "?u=" + (s.unidade || UN).toLowerCase() + "#/separacao/" + s.id;
  toast("Gerando PDF…");
  let bytes;
  try {
    const rec = await carregarRecursosPdf();
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const doc = await PDFDocument.create();
    let fR, fB;
    if (rec.reg && rec.neg && window.fontkit) { doc.registerFontkit(window.fontkit); fR = await doc.embedFont(rec.reg, { subset: true }); fB = await doc.embedFont(rec.neg, { subset: true }); }
    else { fR = await doc.embedFont(StandardFonts.Helvetica); fB = await doc.embedFont(StandardFonts.HelveticaBold); }
    let logo = null;
    try { const r = await fetch("logo.png"); if (r.ok) logo = await doc.embedPng(await r.arrayBuffer()); } catch { /* sem logo */ }
    const MM = 72 / 25.4, W = 210 * MM, H = 297 * MM, M = 12 * MM;
    const VERM = rgb(0.898, 0.102, 0.255), GRAF = rgb(0.267, 0.263, 0.267), CINZA = rgb(0.45, 0.45, 0.47), LINHA = rgb(0.8, 0.8, 0.82);
    const limpa = (t) => String(t ?? "").replace(/[^\x20-\x7E -ÿ]/g, "");   // só o que a fonte do PDF desenha
    const quebra = (t, f, tam, larg) => {
      const pal = limpa(t).split(/\s+/); const out = []; let l = "";
      for (const p of pal) { const c = l ? l + " " + p : p; if (f.widthOfTextAtSize(c, tam) <= larg || !l) l = c; else { out.push(l); l = p; } }
      if (l) out.push(l); return out.length ? out : [""];
    };
    const cols = [ // x relativo, largura
      ["", 8], ["CÓDIGO", 20], ["DESCRIÇÃO", 70], ["QTD", 16], ["UN", 9], ["OC", 20], ["PEDIDO", 15], ["PREVISÃO", 15], ["OS", 13]];
    const larguras = cols.map(c => c[1] * MM);
    const xs = []; { let x = M; for (const w of larguras) { xs.push(x); x += w; } }
    let pag, y, n = 0;
    const novaPagina = () => {
      pag = doc.addPage([W, H]); n++;
      y = H - M;
      if (logo) { const a = 11 * MM, l = a * logo.width / logo.height; pag.drawImage(logo, { x: M, y: y - a, width: l, height: a }); }
      pag.drawText(limpa(`LISTA DE SEPARAÇÃO ${numSep(s)}`), { x: M + 34 * MM, y: y - 5 * MM, size: 13, font: fB, color: GRAF });
      pag.drawText(limpa(`${UNIDADES[s.unidade || UN] ? UNIDADES[s.unidade || UN].nome : ""} · ${SEP_STATUS[s.status]} · emitida ${dataBR(hoje())}`), { x: M + 34 * MM, y: y - 10 * MM, size: 8.5, font: fR, color: CINZA });
      pag.drawText(limpa(`Pág. ${n}`), { x: W - M - 14 * MM, y: y - 5 * MM, size: 8, font: fR, color: CINZA });
      y -= 14 * MM;
      pag.drawRectangle({ x: M, y: y, width: W - 2 * M, height: 0.8, color: VERM });
      y -= 5 * MM;
      if (n === 1) {
        for (const l of quebra(s.titulo || "Lista de separação", fB, 11, W - 2 * M)) { pag.drawText(l, { x: M, y, size: 11, font: fB, color: GRAF }); y -= 5 * MM; }
        const info = [s.responsavel ? "Separador: " + s.responsavel : "", s.autor ? "Solicitado por: " + s.autor : "", s.enviada_em ? "Enviada: " + dataHoraBR(s.enviada_em) : ""].filter(Boolean).join("   ·   ");
        if (info) { pag.drawText(limpa(info), { x: M, y, size: 8.5, font: fR, color: CINZA }); y -= 4.5 * MM; }
        pag.drawText(limpa("Link do checklist: " + link), { x: M, y, size: 7, font: fR, color: CINZA }); y -= 6 * MM;
      }
      pag.drawRectangle({ x: M, y: y - 5.5 * MM, width: W - 2 * M, height: 6.5 * MM, color: GRAF });
      cols.forEach(([t], i) => pag.drawText(limpa(t), { x: xs[i] + 1.2 * MM, y: y - 3.6 * MM, size: 7.5, font: fB, color: rgb(1, 1, 1) }));
      y -= 6.5 * MM;
    };
    novaPagina();
    its.forEach((x, k) => {
      const m = idx.matPor.get(x.mat_id) || {};
      const o = idx.osPor.get(m.os_id) || {};
      const desc = quebra(m.descricao, fR, 8, larguras[2] - 2.4 * MM);
      const extra = x.obs ? quebra("Obs.: " + x.obs, fR, 7, larguras[2] - 2.4 * MM) : [];
      const alt = Math.max(7 * MM, (desc.length + extra.length) * 3.6 * MM + 3 * MM);
      if (y - alt < M + 22 * MM) novaPagina();
      if (k % 2) pag.drawRectangle({ x: M, y: y - alt, width: W - 2 * M, height: alt, color: rgb(0.965, 0.965, 0.97) });
      const cy = y - 4.2 * MM;
      pag.drawRectangle({ x: xs[0] + 2 * MM, y: cy - 1.2 * MM, width: 4 * MM, height: 4 * MM, borderColor: GRAF, borderWidth: 0.9, color: x.separado ? rgb(0.86, 0.95, 0.88) : undefined });
      if (x.separado) pag.drawText("X", { x: xs[0] + 3.1 * MM, y: cy - 0.4 * MM, size: 9, font: fB, color: rgb(0.12, 0.48, 0.27) });
      pag.drawText(limpa(m.codigo || ""), { x: xs[1] + 1.2 * MM, y: cy, size: 8.5, font: fB, color: GRAF });
      desc.forEach((l, i) => pag.drawText(l, { x: xs[2] + 1.2 * MM, y: cy - i * 3.6 * MM, size: 8, font: fR }));
      extra.forEach((l, i) => pag.drawText(l, { x: xs[2] + 1.2 * MM, y: cy - (desc.length + i) * 3.6 * MM, size: 7, font: fR, color: CINZA }));
      const q = fmtNum(+x.qtd) || "0";
      pag.drawText(limpa(q), { x: xs[3] + larguras[3] - 1.2 * MM - fB.widthOfTextAtSize(q, 9), y: cy, size: 9, font: fB });
      pag.drawText(limpa(m.un || ""), { x: xs[4] + 1.2 * MM, y: cy, size: 8, font: fR });
      pag.drawText(limpa(m.oc || "-"), { x: xs[5] + 1.2 * MM, y: cy, size: 8, font: fR });
      pag.drawText(limpa(dataBR(m.data_pedido) || "-"), { x: xs[6] + 1.2 * MM, y: cy, size: 7.5, font: fR });
      pag.drawText(limpa(dataBR(m.data_prev) || "-"), { x: xs[7] + 1.2 * MM, y: cy, size: 7.5, font: fR, color: m.data_prev && m.data_prev < hoje() && !x.separado ? VERM : undefined });
      pag.drawText(limpa(o.numero || "-"), { x: xs[8] + 1.2 * MM, y: cy, size: 7.5, font: fR });
      y -= alt;
      pag.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: LINHA });
    });
    if (y < M + 24 * MM) novaPagina();
    y -= 10 * MM;
    const assinatura = (rot, x) => { pag.drawLine({ start: { x, y }, end: { x: x + 70 * MM, y }, thickness: 0.6, color: GRAF }); pag.drawText(limpa(rot), { x, y: y - 4 * MM, size: 8, font: fR, color: CINZA }); };
    assinatura("Separado por (almoxarifado) / data", M);
    assinatura("Recebido por / data", W - M - 70 * MM);
    doc.setTitle(`${numSep(s)} ${s.titulo || ""}`.trim());
    doc.setCreator("Recursos Materiais " + (UNIDADES[s.unidade || UN] || UNI()).nome);
    bytes = await doc.save();
  } catch (e) {
    console.warn("pdf separação:", e);
    toast("Não consegui gerar o PDF agora (" + e.message + ").");
    if (compartilhar) gmCompartilharLink(s, link);
    return;
  }
  const nome = `${numSep(s)}_${(s.titulo || "separacao").replace(/[\\/:*?"<>|]/g, "-").slice(0, 60)}.pdf`;
  const blob = new Blob([bytes], { type: "application/pdf" });
  if (compartilhar) {
    const arq = new File([blob], nome, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [arq] })) {
      try { await navigator.share({ files: [arq], title: numSep(s), text: `${numSep(s)} — ${s.titulo || ""}\nChecklist: ${link}` }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    gmCompartilharLink(s, link);
  }
  baixarBlob(blob, nome);
}
async function gmCompartilharLink(s, link) {
  const txt = `${numSep(s)} — ${s.titulo || "Lista de separação"}\nChecklist: ${link}`;
  if (navigator.share) { try { await navigator.share({ title: numSep(s), text: txt, url: link }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
  toast(await copiarTexto(txt) ? "🔗 Link da lista copiado — cole no WhatsApp ou e-mail" : "Copie o link: " + link);
}

/* ---------------- painel resumido (início e projeto) ---------------- */
function gmResumoProjeto(projetoId) {
  if (!GM.pronto) return "";
  const idx = gmIdx();
  const oss = GM.os.filter(o => o.projeto_id === projetoId && o.status !== "cancelada");
  if (!oss.length) return `<div class="vazio">Nenhuma OS deste projeto na Gestão de Materiais.<br><small>Vincule as RMs concluídas a uma OS (com este projeto) para acompanhar compra, separação e entrega.</small></div>`;
  return `<div class="gm-quadro-mini">${oss.map(o => { const r = gmResumoOS(o, idx), tot = r.itens.length;
    return `<a class="os-cartao de-projeto" href="#/os/${esc(o.id)}">
      <span class="os-topo"><b class="os-num">${o.numero ? "OS " + esc(o.numero) : "OS s/ nº"}</b>${o.disciplina ? `<span class="chip-disc">${esc(o.disciplina)}</span>` : ""}<span class="et-chip et-${r.etapa}">${rotEtapa(r.etapa)}</span></span>
      <span class="os-desc">${esc(o.descricao || "—")}</span>
      ${tot ? `<span class="os-barra">${ETAPAS.map(e => r.cont[e.id] ? `<i class="et-${e.id}" style="flex:${r.cont[e.id]}"></i>` : "").join("")}</span>` : ""}
      <span class="os-rod">${tot} ite${tot === 1 ? "m" : "ns"} · ${r.cont.entregue} entregue(s)${r.atrasados ? ` · <b class="atraso">⚠ ${r.atrasados}</b>` : ""}</span></a>`; }).join("")}</div>`;
}
