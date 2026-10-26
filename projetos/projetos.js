/* ============================================================
   Projetos UIS 3 — gestão de projetos, demandas e RDO
   Site estático. Mesmo Supabase e mesmo login das Requisições
   (../config.js). Projetos = tabela req_projetos (compartilhada);
   custo de material = requisições (req_listas) do projeto.
   Tabelas próprias: prj_fichas, prj_rdos, prj_demandas,
   prj_custos, prj_ia + bucket "rdo-fotos" (supabase_projetos.sql).
   ============================================================ */
"use strict";

/* ---------------- constantes do formulário ---------------- */
const PADRAO = {
  responsavel: "Pedro H. Sena (Eng. Eletricista)",
  setor: "1620 - Projetos e Melhorias",
  maoObra: ["Gestores", "Engenheiro", "Eletricista", "Mecânico", "Pedreiro", "Servente", "Terceiros"],
  equipamentos: ["PTA", "Munck", "Andaime", "Gerador"],
};
const UNIDADES = {
  UIS3: { id: "UIS3", nome: "UIS 3", local: "Unidade Industrial de Soja 3 - Marechal Cândido Rondon/PR" },
  UIS:  { id: "UIS",  nome: "UIS",   local: "Unidade Industrial de Soja - Marechal Cândido Rondon/PR" },
};
const TEMPOS = ["Limpo", "Nublado", "Chuvoso", "Garoa", "Instável"];
const CONDICOES = ["Praticável", "Praticável (interno)", "Parcialmente praticável", "Impraticável"];
const PRIORIDADES = [["alta", "Alta"], ["media", "Média"], ["baixa", "Baixa"]];
const STATUS_DEM = [["aberta", "Aberta"], ["andamento", "Em andamento"], ["aguardando", "Aguardando terceiros"], ["concluida", "Concluída"], ["cancelada", "Cancelada"]];
const FASES = [["planejamento", "Planejamento"], ["execucao", "Execução"], ["parado", "Parado"], ["concluido", "Concluído"]];
const CATEG_CUSTO = [["servico", "Serviço terceiro"], ["mao_obra", "Mão de obra"], ["material_extra", "Material (fora da RM)"], ["outros", "Outros"]];
const TIPOS_IA = { plano_acao: "Plano de ação", meta: "Meta", sugestao: "Sugestão", controle: "Medida de controle", entrevista: "Entrevista", resumo: "Resumo" };
const BUCKET = "rdo-fotos";

/* ---------------- utilidades ---------------- */
const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const dataBR = (iso) => { if (!iso) return ""; const [a, m, d] = String(iso).slice(0, 10).split("-"); return `${d}/${m}/${a}`; };
const dataCurta = (iso) => { if (!iso) return ""; const [a, m, d] = String(iso).slice(0, 10).split("-"); return `${d}/${m}/${a.slice(2)}`; };
const diasEntre = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);
const somaDias = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const diaSemana = (iso) => DIAS_SEMANA[new Date(iso + "T12:00:00").getDay()];
const fmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const dinheiro = (v) => "R$ " + fmt.format(+v || 0);
const dinheiroCurto = (v) => { v = +v || 0; return v >= 1e6 ? "R$ " + fmt1.format(v / 1e6) + " mi" : v >= 1e4 ? "R$ " + fmt1.format(v / 1e3) + " mil" : dinheiro(v); };
const num = (t) => { if (t == null || t === "") return 0; const n = parseFloat(String(t).trim().replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : 0; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s ?? "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const statusPct = (p) => (+p || 0) <= 0 ? "Parada" : (+p >= 100 ? "Concluído" : "Andamento");
const LS = {
  ler(k, p) { try { return JSON.parse(localStorage.getItem(k)) ?? p; } catch { return p; } },
  gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* cheio / privado */ } },
};
function toast(msg, ms = 2600) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
}
const debounce = (fn, ms) => { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.agora = (...a) => { clearTimeout(t); fn(...a); }; return f; };

/* ---------------- unidade ---------------- */
function lerUnidade() {
  const daUrl = String(new URLSearchParams(location.search).get("u") || "").toUpperCase().replace(/\s/g, "");
  const salva = String(localStorage.getItem("rq.unidade") || "").toUpperCase();
  return UNIDADES[daUrl] ? daUrl : (UNIDADES[salva] ? salva : "UIS3");
}
let UN = lerUnidade();
const UNI = () => UNIDADES[UN];
const unidadeDe = (r) => { const u = String((r && r.unidade) || "").toUpperCase().replace(/\s/g, ""); return UNIDADES[u] ? u : "UIS3"; };

/* ---------------- nuvem ---------------- */
const CFG = window.CONFIG_NUVEM || {};
const sb = (CFG.url && CFG.anonKey && window.supabase) ? window.supabase.createClient(CFG.url, CFG.anonKey) : null;
let emailSessao = "";

/* ---------------- estado ---------------- */
const VAZIO = () => ({ projetos: [], fichas: {}, rdos: [], demandas: [], custos: [], listas: [], ia: [] });
let S = Object.assign(VAZIO(), LS.ler("pj.cache." + UN, {}));
let faltaTabela = false;                       // SQL ainda não rodado
let carregou = false;
const guardarCache = debounce(() => LS.gravar("pj.cache." + UN, S), 400);

/* indicador de gravação */
let pendentes = 0, erroGravacao = false;
function sinal() {
  const el = $("#sync"); if (!el) return;
  el.className = "sync" + (pendentes ? " salvando" : erroGravacao ? " erro" : "");
  el.title = pendentes ? "Salvando…" : erroGravacao ? "Falha ao salvar na nuvem — os dados ficaram neste aparelho" : "Tudo salvo";
}
async function gravar(tabela, obj) {
  guardarCache();
  if (!sb) return true;
  pendentes++; sinal();
  try {
    const { error } = await sb.from(tabela).upsert(obj);
    if (error) throw error;
    erroGravacao = false; return true;
  } catch (e) {
    console.warn("gravar", tabela, e.message || e);
    erroGravacao = true;
    if (tabelaInexistente(e)) { faltaTabela = true; render(); }
    else toast("⚠️ Não salvou na nuvem: " + (e.message || e));
    return false;
  } finally { pendentes--; sinal(); }
}
async function apagar(tabela, id, col = "id") {
  guardarCache();
  if (!sb) return;
  const { error } = await sb.from(tabela).delete().eq(col, id);
  if (error) toast("⚠️ Não excluiu na nuvem: " + error.message);
}
const tabelaInexistente = (e) => /does not exist|could not find the table|PGRST205|42P01/i.test((e && (e.message || e.code)) || "");

async function carregar() {
  if (!sb) { carregou = true; render(); return; }
  try {
    const [p, l] = await Promise.all([
      sb.from("req_projetos").select("*"),
      sb.from("req_listas").select("dados"),
    ]);
    if (p.error) throw p.error;
    const novo = VAZIO();
    novo.projetos = (p.data || []).filter(r => unidadeDe(r) === UN);
    novo.listas = (l.data || []).map(r => r.dados).filter(d => d && unidadeDe(d) === UN);
    const tabs = await Promise.all([
      sb.from("prj_fichas").select("*"),
      sb.from("prj_rdos").select("*").order("data", { ascending: false }),
      sb.from("prj_demandas").select("*").order("criado_em", { ascending: false }),
      sb.from("prj_custos").select("*").order("data", { ascending: false }),
      sb.from("prj_ia").select("*").order("criado_em", { ascending: false }),
    ]);
    const erro = tabs.find(t => t.error);
    if (erro && tabelaInexistente(erro.error)) faltaTabela = true;
    else if (erro) throw erro.error;
    else faltaTabela = false;
    const [f, r, d, c, ia] = tabs.map(t => t.data || []);
    const ids = new Set(novo.projetos.map(x => String(x.id)));
    novo.fichas = Object.fromEntries(f.filter(x => ids.has(x.projeto_id)).map(x => [x.projeto_id, x.dados || {}]));
    novo.rdos = r.filter(x => unidadeDe(x) === UN);
    novo.demandas = d.filter(x => unidadeDe(x) === UN);
    novo.custos = c.filter(x => unidadeDe(x) === UN);
    novo.ia = ia.filter(x => unidadeDe(x) === UN);
    S = novo; guardarCache.agora();
  } catch (e) {
    console.warn("carregar:", e.message || e);
    toast("Sem conexão com o banco — mostrando dados deste aparelho.");
  }
  carregou = true;
  render();
}

/* ============================================================
   REGRAS DE NEGÓCIO
   ============================================================ */
const projetosAtivos = () => S.projetos.filter(p => p.status !== "arquivado")
  .sort((a, b) => (ultimaAtividade(b) || "").localeCompare(ultimaAtividade(a) || "") || String(a.nome).localeCompare(String(b.nome)));
const projetoPorId = (id) => S.projetos.find(p => String(p.id) === String(id));
const nomeProjeto = (id) => (projetoPorId(id) || {}).nome || "";
function fichaDe(pid) {
  const f = S.fichas[pid] || (S.fichas[pid] = {});
  f.atividades ||= []; f.marcos ||= [];
  f.maoObra ||= [...PADRAO.maoObra]; f.equipamentos ||= [...PADRAO.equipamentos];
  f.setor ??= PADRAO.setor; f.responsavel ??= PADRAO.responsavel; f.local ??= UNI().local;
  f.fase ||= "execucao";
  return f;
}
const salvarFicha = (pid) => gravar("prj_fichas", { projeto_id: String(pid), unidade: UN, dados: fichaDe(pid), atualizado_em: new Date().toISOString() });
const rdosDe = (pid) => S.rdos.filter(r => String(r.projeto_id) === String(pid)).sort((a, b) => (b.numero || 0) - (a.numero || 0) || String(b.data).localeCompare(a.data));
const ultimaAtividade = (p) => { const r = rdosDe(p.id)[0]; return r ? r.data : ""; };
const avancoDe = (ativs) => ativs && ativs.length ? ativs.reduce((s, a) => s + (+a.pct || 0), 0) / ativs.length : null;

const totalLista = (l) => l.tipo === "MM" ? 0 : (l.itens || []).reduce((s, i) => s + (+i.qtd || 0) * (+i.preco || 0), 0);
const listasDe = (pid) => S.listas.filter(l => String(l.projetoId) === String(pid) && l.tipo !== "MM");
const custoMaterial = (pid) => listasDe(pid).reduce((s, l) => s + totalLista(l), 0);
const custosExtrasDe = (pid) => S.custos.filter(c => String(c.projeto_id) === String(pid));
const custoExtra = (pid) => custosExtrasDe(pid).reduce((s, c) => s + (+c.valor || 0), 0);

/* indicadores de um projeto */
function indicadores(pid) {
  const f = fichaDe(pid);
  const avanco = avancoDe(f.atividades);
  const prazo = +f.prazoDias || 0;
  const decorrido = f.inicio ? Math.max(0, diasEntre(f.inicio, hojeISO())) : null;
  const prazoPct = prazo && decorrido != null ? (decorrido / prazo) * 100 : null;
  const custo = custoMaterial(pid) + custoExtra(pid);
  const orc = +f.orcamento || 0;
  const custoPct = orc ? (custo / orc) * 100 : null;
  const alertas = [];
  if (f.fase !== "concluido" && avanco != null && prazoPct != null && prazoPct - avanco > 15) alertas.push("atrasado");
  if (f.fase !== "concluido" && prazoPct != null && prazoPct > 100 && (avanco ?? 0) < 100) alertas.push("prazo vencido");
  if (custoPct != null && custoPct > 100) alertas.push("acima do orçamento");
  return { f, avanco, prazo, decorrido, prazoPct, custo, orc, custoPct, alertas, restante: prazo && decorrido != null ? prazo - decorrido : null };
}
function barra(rot, pct, txt, classe = "") {
  const v = pct == null ? 0 : clamp(pct, 0, 100);
  return `<div class="barra"><span>${rot}</span><div class="trilho"><div class="enchimento ${classe}" style="width:${v}%"></div></div><b>${txt ?? (pct == null ? "—" : Math.round(pct) + "%")}</b></div>`;
}
function barrasProjeto(ind) {
  return `<div class="barras">
    ${barra("Avanço", ind.avanco)}
    ${barra("Prazo", ind.prazoPct, null, "prazo" + (ind.prazoPct > 100 ? " estouro" : ""))}
    ${barra("Custo", ind.custoPct, ind.orc ? null : dinheiroCurto(ind.custo), "custo" + (ind.custoPct > 100 ? " estouro" : ""))}
  </div>`;
}
const tagsAlerta = (ind) => ind.alertas.map(a => `<span class="tag atraso">${esc(a)}</span>`).join("");

/* demandas */
const ABERTAS = ["aberta", "andamento", "aguardando"];
const ehAberta = (d) => ABERTAS.includes(d.status);
const PESO_PRIO = { alta: 0, media: 1, baixa: 2 };
const ordenarDemandas = (a, b) => (PESO_PRIO[a.prioridade] ?? 1) - (PESO_PRIO[b.prioridade] ?? 1)
  || (a.prazo || "9999").localeCompare(b.prazo || "9999") || String(b.criado_em).localeCompare(String(a.criado_em));
const vencida = (d) => ehAberta(d) && d.prazo && d.prazo < hojeISO();

/* ============================================================
   FOTOS — compressão, envio, cache e fila offline (IndexedDB)
   ============================================================ */
const blobs = new Map();                       // path → Blob (sessão)
const urls = new Map();                        // path → objectURL
const IDB = {
  _db: null,
  abrir() {
    if (this._db) return this._db;
    this._db = new Promise((ok, erro) => {
      const r = indexedDB.open("pj-fotos", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("pend");
      r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error);
    });
    return this._db;
  },
  async op(modo, fn) { const db = await this.abrir(); return new Promise((ok, erro) => { const tx = db.transaction("pend", modo); const q = fn(tx.objectStore("pend")); tx.oncomplete = () => ok(q && q.result); tx.onerror = () => erro(tx.error); }); },
  por(k, v) { return this.op("readwrite", s => s.put(v, k)).catch(() => {}); },
  ler(k) { return this.op("readonly", s => s.get(k)).catch(() => null); },
  tirar(k) { return this.op("readwrite", s => s.delete(k)).catch(() => {}); },
};
async function comprimir(arquivo, lado = 1600, q = 0.82) {
  const bmp = await (window.createImageBitmap ? createImageBitmap(arquivo, { imageOrientation: "from-image" }).catch(() => null) : null);
  let img = bmp, w, h;
  if (!img) {
    img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = URL.createObjectURL(arquivo); });
  }
  w = img.width; h = img.height;
  const k = Math.min(1, lado / Math.max(w, h));
  const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(ok => c.toBlob(ok, "image/jpeg", q));
  return { blob, w: c.width, h: c.height };
}
async function enviarFoto(path, blob) {
  if (!sb) return true;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) { console.warn("foto:", error.message); return false; }
  return true;
}
async function obterFoto(path) {
  if (blobs.has(path)) return blobs.get(path);
  const pend = await IDB.ler(path);
  if (pend) { blobs.set(path, pend); return pend; }
  if (!sb) return null;
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error) { console.warn("baixar foto:", error.message); return null; }
  blobs.set(path, data); return data;
}
async function urlFoto(path) {
  if (urls.has(path)) return urls.get(path);
  const b = await obterFoto(path); if (!b) return "";
  const u = URL.createObjectURL(b); urls.set(path, u); return u;
}
/* reenvia fotos que ficaram pendentes (sem sinal na área) */
async function reenviarPendentes() {
  if (!sb || !navigator.onLine) return;
  let mudou = false;
  for (const r of S.rdos) for (const f of (r.dados.fotos || [])) {
    if (!f.pendente) continue;
    const b = await obterFoto(f.path);
    if (b && await enviarFoto(f.path, b)) { f.pendente = false; IDB.tirar(f.path); mudou = true; await gravar("prj_rdos", r); }
  }
  if (mudou) { toast("Fotos pendentes enviadas ✔"); if (/^#\/rdo\//.test(location.hash)) render(); }
}
window.addEventListener("online", reenviarPendentes);

/* ============================================================
   ROTAS
   ============================================================ */
const app = $("#app");
function render() {
  const h = (location.hash || "#/").split("?")[0];
  const [, rota = "", a, b] = h.split("/");
  const r = rota || "painel";
  $$("#nav a, #tabbar a").forEach(x => x.classList.toggle("ativo", x.dataset.rota === (r === "p" ? "projetos" : r === "rdo" ? "rdos" : r)));
  $("#chip-unidade").textContent = UNI().nome;
  document.title = "Projetos " + UNI().nome;
  window.scrollTo({ top: 0 });
  if (!carregou && !S.projetos.length) { app.innerHTML = `<div class="carregando">Carregando…</div>`; return; }
  const aviso = faltaTabela ? `<div class="aviso">⚠️ Falta criar as tabelas do módulo de projetos no Supabase. Abra o SQL Editor do Supabase e rode o arquivo
    <code>projetos/supabase_projetos.sql</code> (uma vez só). Até lá, demandas, RDOs e fichas ficam salvos só neste aparelho.</div>` : "";
  const telas = { painel: telaPainel, demandas: telaDemandas, projetos: telaProjetos, p: telaProjeto, rdos: telaRdos, rdo: telaRdo, ia: telaIA };
  (telas[r] || telaPainel)(a, b);
  if (aviso) app.insertAdjacentHTML("afterbegin", aviso);
}
window.addEventListener("hashchange", () => { fecharFolha(); render(); });

/* ============================================================
   TELA: PAINEL
   ============================================================ */
function telaPainel() {
  const abertas = S.demandas.filter(ehAberta);
  const altas = abertas.filter(d => d.prioridade === "alta").length;
  const venc = abertas.filter(vencida).length;
  const semana = somaDias(hojeISO(), -7);
  const feitas7 = S.demandas.filter(d => d.status === "concluida" && String(d.concluido_em || "").slice(0, 10) >= semana).length;
  const ativos = projetosAtivos();
  const inds = ativos.map(p => ({ p, ind: indicadores(p.id) }));
  const comAlerta = inds.filter(x => x.ind.alertas.length).length;
  const mes = hojeISO().slice(0, 7);
  const rdosMes = S.rdos.filter(r => String(r.data).startsWith(mes)).length;
  const iaAbertas = S.ia.filter(i => i.status === "aberto");
  const top = abertas.sort(ordenarDemandas).slice(0, 6);

  app.innerHTML = `
    <div class="titulo"><h1>Painel</h1><span class="esp"></span>
      <button class="btn sec mini" id="btn-ctx">🤖 Contexto p/ Claude</button>
      <span class="sub">${diaSemana(hojeISO())}, ${dataBR(hojeISO())}</span></div>
    <div class="kpis">
      <a class="kpi ${venc ? "alerta" : ""}" href="#/demandas"><div class="rot">Demandas abertas</div><div class="val">${abertas.length}</div>
        <div class="det">${altas} alta${altas === 1 ? "" : "s"}${venc ? ` · <b style="color:var(--vermelho)">${venc} vencida${venc === 1 ? "" : "s"}</b>` : ""}</div></a>
      <a class="kpi" href="#/demandas?f=concluidas"><div class="rot">Concluídas em 7 dias</div><div class="val">${feitas7}</div><div class="det">${tempoMedio()}</div></a>
      <a class="kpi ${comAlerta ? "alerta" : ""}" href="#/projetos"><div class="rot">Projetos ativos</div><div class="val">${ativos.length}</div>
        <div class="det">${comAlerta ? `${comAlerta} com alerta` : "nenhum alerta"}</div></a>
      <a class="kpi" href="#/rdos"><div class="rot">RDOs no mês</div><div class="val">${rdosMes}</div><div class="det">${S.rdos.length} no total</div></a>
    </div>

    <div class="secao">Prioridades<a class="acao" href="#/demandas">ver todas →</a></div>
    ${top.length ? `<div class="lista">${top.map(itemDemanda).join("")}</div>` : `<div class="vazio">Nenhuma demanda aberta. Use o <b>＋</b> para lançar.</div>`}

    <div class="secao">Projetos em andamento<a class="acao" href="#/projetos">todos →</a></div>
    ${inds.length ? `<div class="cartoes">${inds.slice(0, 6).map(({ p, ind }) => cartaoProjeto(p, ind)).join("")}</div>` : `<div class="vazio">Nenhum projeto ativo.</div>`}

    ${iaAbertas.length ? `<div class="secao">Ações sugeridas pela IA<a class="acao" href="#/ia">ver →</a></div>
      <div class="pilha">${iaAbertas.slice(0, 3).map(cartaoIA).join("")}</div>` : ""}`;
  ligarDemandas(app);
  ligarIA(app);
  $("#btn-ctx").onclick = () => folhaContexto();
}
function tempoMedio() {
  const lim = somaDias(hojeISO(), -30);
  const f = S.demandas.filter(d => d.concluido_em && String(d.concluido_em).slice(0, 10) >= lim && d.criado_em);
  if (!f.length) return "tempo médio: —";
  const m = f.reduce((s, d) => s + (new Date(d.concluido_em) - new Date(d.criado_em)) / 86400000, 0) / f.length;
  return `resolução média (30d): ${fmt1.format(m)} dia${m >= 1.95 ? "s" : ""}`;
}
function cartaoProjeto(p, ind) {
  const f = ind.f;
  const ult = rdosDe(p.id)[0];
  return `<a class="cartao" href="#/p/${encodeURIComponent(p.id)}">
    <h3>${esc(p.nome)}</h3>
    <div class="meta">${f.codigo ? esc(f.codigo) + " · " : ""}${esc((FASES.find(x => x[0] === f.fase) || [])[1] || "")}
      ${ind.restante != null ? ` · ${ind.restante >= 0 ? ind.restante + " dias restantes" : Math.abs(ind.restante) + " dias além do prazo"}` : ""}</div>
    ${barrasProjeto(ind)}
    <div class="rodape">${tagsAlerta(ind)}<span class="meta">${ult ? `Último RDO nº ${ult.numero} · ${dataCurta(ult.data)}` : "Sem RDO"}</span></div>
  </a>`;
}

/* ============================================================
   TELA: DEMANDAS
   ============================================================ */
let filtroDem = "abertas", prioNova = "media", filtroProj = "";
function itemDemanda(d) {
  const feito = d.status === "concluida";
  const st = STATUS_DEM.find(s => s[0] === d.status);
  return `<div class="item ${feito ? "feito" : ""}" data-dem="${esc(d.id)}">
    <button class="check" data-check="${esc(d.id)}" title="${feito ? "Reabrir" : "Concluir"}">${feito ? "✓" : ""}</button>
    <div class="corpo"><div class="txt">${esc(d.titulo)}</div>
      <div class="meta"><span class="tag ${esc(d.prioridade)}">${esc((PRIORIDADES.find(x => x[0] === d.prioridade) || [, ""])[1])}</span>
        ${d.status !== "aberta" && !feito ? `<span class="tag">${esc(st ? st[1] : d.status)}</span>` : ""}
        ${d.projeto_id ? `<span>▤ ${esc(nomeProjeto(d.projeto_id))}</span>` : ""}
        ${d.prazo ? `<span class="${vencida(d) ? "vencida" : ""}">⏱ ${dataCurta(d.prazo)}</span>` : ""}
        ${feito && d.concluido_em ? `<span>✓ ${dataCurta(String(d.concluido_em).slice(0, 10))}</span>` : ""}
      </div></div></div>`;
}
function ligarDemandas(raiz) {
  $$("[data-check]", raiz).forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const d = S.demandas.find(x => x.id === b.dataset.check); if (!d) return;
    if (d.status === "concluida") { d.status = "aberta"; d.concluido_em = null; }
    else { d.status = "concluida"; d.concluido_em = new Date().toISOString(); toast("Concluída ✔"); }
    gravar("prj_demandas", d); render();
  });
  $$("[data-dem]", raiz).forEach(el => el.onclick = () => folhaDemanda(S.demandas.find(x => x.id === el.dataset.dem)));
}
function novaDemanda(titulo, extra = {}) {
  const d = { id: uid(), unidade: UN, titulo: titulo.trim(), detalhe: "", prioridade: prioNova, status: "aberta",
    projeto_id: null, prazo: null, solicitante: "", autor: emailSessao, criado_em: new Date().toISOString(), concluido_em: null, ...extra };
  S.demandas.unshift(d); gravar("prj_demandas", d);
  return d;
}
function telaDemandas() {
  const q = new URLSearchParams((location.hash.split("?")[1]) || "");
  if (q.get("f")) filtroDem = q.get("f");
  const filtros = [["abertas", "Abertas"], ["alta", "Alta prioridade"], ["vencidas", "Vencidas"], ["concluidas", "Concluídas"], ["todas", "Todas"]];
  let ds = S.demandas.slice();
  if (filtroProj) ds = ds.filter(d => String(d.projeto_id) === filtroProj);
  ds = ds.filter(d => filtroDem === "abertas" ? ehAberta(d) : filtroDem === "alta" ? ehAberta(d) && d.prioridade === "alta"
    : filtroDem === "vencidas" ? vencida(d) : filtroDem === "concluidas" ? d.status === "concluida" : true);
  ds.sort(filtroDem === "concluidas" ? (a, b) => String(b.concluido_em).localeCompare(String(a.concluido_em)) : ordenarDemandas);
  app.innerHTML = `
    <div class="titulo"><h1>Demandas</h1></div>
    <form class="captura" id="form-cap" autocomplete="off">
      <input type="text" id="cap-txt" placeholder="O que precisa ser feito?" enterkeyhint="done">
      <button class="btn" type="submit">Lançar</button>
    </form>
    <div class="filtros" style="margin-top:8px">
      <div class="prio-sel" id="prio-sel">${PRIORIDADES.map(([k, t]) => `<button type="button" data-p="${k}" class="${k} ${prioNova === k ? "on" : ""}">${t}</button>`).join("")}</div>
    </div>
    <div class="filtros">${filtros.map(([k, t]) => `<button data-f="${k}" class="${filtroDem === k ? "on" : ""}">${t}</button>`).join("")}
      <select id="f-proj" style="width:auto; padding:5px 10px; font-size:13px; border-radius:20px">
        <option value="">Todos os projetos</option>${projetosAtivos().map(p => `<option value="${esc(p.id)}" ${filtroProj === String(p.id) ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}
      </select></div>
    ${ds.length ? `<div class="lista">${ds.map(itemDemanda).join("")}</div>` : `<div class="vazio">Nada por aqui.</div>`}`;
  $("#form-cap").onsubmit = (e) => {
    e.preventDefault();
    const t = $("#cap-txt").value; if (!t.trim()) return;
    novaDemanda(t, filtroProj ? { projeto_id: filtroProj } : {});
    render(); setTimeout(() => $("#cap-txt") && $("#cap-txt").focus(), 30);
  };
  $$("#prio-sel button").forEach(b => b.onclick = () => { prioNova = b.dataset.p; $$("#prio-sel button").forEach(x => x.classList.toggle("on", x === b)); });
  $$("[data-f]").forEach(b => b.onclick = () => { filtroDem = b.dataset.f; history.replaceState(null, "", "#/demandas"); render(); });
  $("#f-proj").onchange = (e) => { filtroProj = e.target.value; render(); };
  ligarDemandas(app);
}

/* ============================================================
   FOLHAS (bottom sheet)
   ============================================================ */
function abrirFolha(html, ao) {
  const f = $("#folha");
  f.innerHTML = `<div class="caixa">${html}</div>`; f.hidden = false;
  f.onclick = (e) => { if (e.target === f) fecharFolha(); };
  $$("[data-fechar]", f).forEach(b => b.onclick = fecharFolha);
  ao && ao(f);
  const foco = $("[autofocus]", f); if (foco) setTimeout(() => foco.focus(), 60);
}
function fecharFolha() { const f = $("#folha"); f.hidden = true; f.innerHTML = ""; }
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharFolha(); });
const opcoes = (lista, sel) => lista.map(([v, t]) => `<option value="${esc(v)}" ${String(sel ?? "") === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("");
const opcoesProjetos = (sel) => `<option value="">— sem projeto —</option>` + opcoes(projetosAtivos().map(p => [p.id, p.nome]), sel);

function folhaDemanda(d, extra = {}) {
  const nova = !d;
  d = d || { prioridade: prioNova, status: "aberta", ...extra };
  abrirFolha(`
    <h2>${nova ? "Nova demanda" : "Demanda"}</h2>
    <form class="pilha" id="f-dem">
      <label class="campo">Título<input type="text" name="titulo" value="${esc(d.titulo)}" required ${nova ? "autofocus" : ""}></label>
      <div class="grade2">
        <label class="campo">Prioridade<select name="prioridade">${opcoes(PRIORIDADES, d.prioridade)}</select></label>
        <label class="campo">Status<select name="status">${opcoes(STATUS_DEM, d.status)}</select></label>
      </div>
      <div class="grade2">
        <label class="campo">Prazo<input type="date" name="prazo" value="${esc(d.prazo || "")}"></label>
        <label class="campo">Quem pediu<input type="text" name="solicitante" value="${esc(d.solicitante)}" placeholder="opcional"></label>
      </div>
      <label class="campo">Projeto<select name="projeto_id">${opcoesProjetos(d.projeto_id)}</select></label>
      <label class="campo">Detalhes<textarea name="detalhe" placeholder="opcional">${esc(d.detalhe)}</textarea></label>
      <div class="rodape">${nova ? "" : `<button type="button" class="btn sec" id="d-del">Excluir</button>`}
        <button type="button" class="btn sec" data-fechar>Cancelar</button><button class="btn" type="submit">Salvar</button></div>
      ${!nova && d.criado_em ? `<div class="meta" style="font-size:12px;color:var(--cinza)">Criada em ${dataBR(String(d.criado_em).slice(0, 10))}</div>` : ""}
    </form>`, (f) => {
    $("#f-dem", f).onsubmit = (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target));
      const obj = nova ? novaDemanda(v.titulo, {}) : d;
      const antes = obj.status;
      Object.assign(obj, { titulo: v.titulo.trim(), prioridade: v.prioridade, status: v.status, prazo: v.prazo || null,
        solicitante: v.solicitante.trim(), projeto_id: v.projeto_id || null, detalhe: v.detalhe.trim() });
      if (obj.status === "concluida" && antes !== "concluida") obj.concluido_em = new Date().toISOString();
      if (obj.status !== "concluida") obj.concluido_em = null;
      gravar("prj_demandas", obj); fecharFolha(); render();
    };
    const del = $("#d-del", f);
    if (del) del.onclick = () => {
      if (!confirm("Excluir esta demanda?")) return;
      S.demandas = S.demandas.filter(x => x.id !== d.id); apagar("prj_demandas", d.id); fecharFolha(); render();
    };
  });
}
function folhaRapida() {
  abrirFolha(`<h2>Lançar</h2>
    <div class="opcoes-rapidas">
      <button data-op="dem"><span>☑</span><div>Demanda<small>algo para fazer, do dia a dia</small></div></button>
      <button data-op="rdo"><span>▣</span><div>RDO de hoje<small>fotos, efetivo e avanço da obra</small></div></button>
      <button data-op="custo"><span>R$</span><div>Custo de projeto<small>serviço, mão de obra, extra</small></div></button>
      <button data-op="proj"><span>▤</span><div>Projeto novo<small>aparece também nas Requisições</small></div></button>
    </div>`, (f) => {
    $$("[data-op]", f).forEach(b => b.onclick = () => {
      const op = b.dataset.op;
      if (op === "dem") folhaDemanda(null);
      if (op === "rdo") escolherProjetoParaRdo();
      if (op === "custo") escolherProjeto("Custo em qual projeto?", (pid) => folhaCusto(pid));
      if (op === "proj") folhaProjeto(null);
    });
  });
}
$("#fab").onclick = folhaRapida;

function escolherProjeto(titulo, ao) {
  const ps = projetosAtivos();
  if (!ps.length) { toast("Crie um projeto primeiro."); folhaProjeto(null); return; }
  if (ps.length === 1) { ao(ps[0].id); return; }
  abrirFolha(`<h2>${esc(titulo)}</h2><div class="opcoes-rapidas">
    ${ps.map(p => `<button data-pid="${esc(p.id)}"><span>▤</span><div>${esc(p.nome)}<small>${esc(fichaDe(p.id).codigo || "")}</small></div></button>`).join("")}</div>`,
    (f) => $$("[data-pid]", f).forEach(b => b.onclick = () => ao(b.dataset.pid)));
}
const escolherProjetoParaRdo = () => escolherProjeto("RDO de qual obra?", (pid) => criarRdo(pid));

/* ============================================================
   PROJETOS
   ============================================================ */
let verArquivados = false;
function telaProjetos() {
  const ps = verArquivados ? S.projetos.filter(p => p.status === "arquivado") : projetosAtivos();
  app.innerHTML = `
    <div class="titulo"><h1>Projetos</h1><span class="esp"></span>
      <button class="btn sec mini" id="btn-arq">${verArquivados ? "Ver ativos" : "📦 Arquivados"}</button>
      <button class="btn mini" id="btn-novo">+ Projeto</button>
      <span class="sub">Mesma lista de projetos das Requisições de Material — o custo de material vem das RMs vinculadas.</span></div>
    ${ps.length ? `<div class="cartoes">${ps.map(p => cartaoProjeto(p, indicadores(p.id))).join("")}</div>` : `<div class="vazio">Nenhum projeto ${verArquivados ? "arquivado" : "ativo"}.</div>`}`;
  $("#btn-arq").onclick = () => { verArquivados = !verArquivados; render(); };
  $("#btn-novo").onclick = () => folhaProjeto(null);
}

function folhaProjeto(p) {
  const novo = !p;
  const f = novo ? { fase: "execucao", inicio: hojeISO() } : fichaDe(p.id);
  abrirFolha(`
    <h2>${novo ? "Novo projeto" : "Dados do projeto"}</h2>
    <form class="pilha" id="f-proj">
      <label class="campo">Nome<input type="text" name="nome" value="${esc(p && p.nome)}" required ${novo ? "autofocus" : ""} placeholder="Ex.: Reforma do mezanino"></label>
      <div class="grade2">
        <label class="campo">Código / nº<input type="text" name="codigo" value="${esc(f.codigo)}" placeholder="185_066_2025"></label>
        <label class="campo">Fase<select name="fase">${opcoes(FASES, f.fase)}</select></label>
      </div>
      <div class="grade3">
        <label class="campo">Início<input type="date" name="inicio" value="${esc(f.inicio || "")}"></label>
        <label class="campo">Prazo (dias)<input type="number" inputmode="numeric" name="prazoDias" value="${esc(f.prazoDias || "")}"></label>
        <label class="campo">Orçamento R$<input type="text" inputmode="decimal" name="orcamento" value="${f.orcamento ? fmt.format(f.orcamento) : ""}"></label>
      </div>
      <label class="campo">Escopo / objetivo<textarea name="descricao" placeholder="O que será entregue, em poucas linhas">${esc(f.descricao)}</textarea></label>
      ${novo ? "" : `
      <div class="grade2">
        <label class="campo">Setor<input type="text" name="setor" value="${esc(f.setor)}"></label>
        <label class="campo">Responsável<input type="text" name="responsavel" value="${esc(f.responsavel)}"></label>
      </div>
      <label class="campo">Mão de obra no RDO (separe por vírgula)<input type="text" name="maoObra" value="${esc(f.maoObra.join(", "))}"></label>
      <label class="campo">Equipamentos no RDO (separe por vírgula)<input type="text" name="equipamentos" value="${esc(f.equipamentos.join(", "))}"></label>`}
      <div class="rodape">${novo ? "" : `<button type="button" class="btn sec" id="p-arq">${p.status === "arquivado" ? "Reativar" : "Arquivar"}</button>`}
        <button type="button" class="btn sec" data-fechar>Cancelar</button><button class="btn" type="submit">Salvar</button></div>
    </form>`, (el) => {
    $("#f-proj", el).onsubmit = async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target));
      let proj = p;
      if (novo) {
        proj = { id: uid(), nome: v.nome.trim(), status: "andamento", autor: emailSessao, unidade: UN };
        S.projetos.push(proj);
      } else proj.nome = v.nome.trim();
      await gravar("req_projetos", { id: proj.id, nome: proj.nome, status: proj.status || "andamento", autor: proj.autor || emailSessao, unidade: proj.unidade || UN });
      const fi = fichaDe(proj.id);
      Object.assign(fi, { codigo: v.codigo.trim(), fase: v.fase, inicio: v.inicio, prazoDias: +v.prazoDias || "", orcamento: num(v.orcamento) || "", descricao: v.descricao.trim() });
      if (!novo) {
        fi.setor = v.setor.trim(); fi.responsavel = v.responsavel.trim();
        fi.maoObra = v.maoObra.split(",").map(s => s.trim()).filter(Boolean);
        fi.equipamentos = v.equipamentos.split(",").map(s => s.trim()).filter(Boolean);
      }
      salvarFicha(proj.id); fecharFolha();
      if (novo) location.hash = "#/p/" + encodeURIComponent(proj.id); else render();
    };
    const arq = $("#p-arq", el);
    if (arq) arq.onclick = () => {
      p.status = p.status === "arquivado" ? "andamento" : "arquivado";
      gravar("req_projetos", { id: p.id, nome: p.nome, status: p.status, autor: p.autor || emailSessao, unidade: p.unidade || UN });
      fecharFolha(); render();
    };
  });
}

let abaProj = "resumo";
function telaProjeto(idCod) {
  const pid = decodeURIComponent(idCod || "");
  const p = projetoPorId(pid);
  if (!p) { app.innerHTML = `<a class="voltar" href="#/projetos">← Projetos</a><div class="vazio">Projeto não encontrado.</div>`; return; }
  const ind = indicadores(pid), f = ind.f;
  const rs = rdosDe(pid);
  const dems = S.demandas.filter(d => String(d.projeto_id) === pid);
  const ias = S.ia.filter(i => String(i.projeto_id) === pid);
  const abas = [["resumo", "Resumo"], ["atividades", "Atividades"], ["custos", "Custos"], ["rdos", `RDOs (${rs.length})`],
    ["demandas", `Demandas (${dems.filter(ehAberta).length})`], ["ia", `IA (${ias.filter(i => i.status === "aberto").length})`]];
  app.innerHTML = `
    <a class="voltar" href="#/projetos">← Projetos</a>
    <div class="titulo"><h1>${esc(p.nome)}</h1><span class="esp"></span>
      <button class="btn sec mini" id="btn-editar">Editar</button>
      <button class="btn mini" id="btn-rdo">+ RDO</button>
      <span class="sub">${f.codigo ? esc(f.codigo) + " · " : ""}${esc((FASES.find(x => x[0] === f.fase) || [])[1] || "")}
        ${f.inicio ? ` · início ${dataBR(f.inicio)}` : ""} ${tagsAlerta(ind)}</span></div>
    <div class="abas">${abas.map(([k, t]) => `<button data-aba="${k}" class="${abaProj === k ? "on" : ""}">${t}</button>`).join("")}</div>
    <div id="aba"></div>`;
  $$("[data-aba]").forEach(b => b.onclick = () => { abaProj = b.dataset.aba; render(); });
  $("#btn-editar").onclick = () => folhaProjeto(p);
  $("#btn-rdo").onclick = () => criarRdo(pid);
  const alvo = $("#aba");
  ({ resumo: abaResumo, atividades: abaAtividades, custos: abaCustos, rdos: abaRdos, demandas: abaDemandas, ia: abaIA }[abaProj] || abaResumo)(alvo, p, ind, { rs, dems, ias });
}

function abaResumo(alvo, p, ind) {
  const f = ind.f;
  alvo.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="rot">Avanço físico</div><div class="val">${ind.avanco == null ? "—" : fmt1.format(ind.avanco) + "%"}</div><div class="det">${f.atividades.length} atividade(s)</div></div>
      <div class="kpi ${ind.prazoPct > 100 ? "alerta" : ""}"><div class="rot">Prazo</div><div class="val">${ind.restante == null ? "—" : ind.restante}</div>
        <div class="det">${ind.prazo ? `dias a vencer · ${ind.decorrido} de ${ind.prazo}` : "defina início e prazo"}</div></div>
      <div class="kpi ${ind.custoPct > 100 ? "alerta" : ""}"><div class="rot">Custo realizado</div><div class="val" style="font-size:20px">${dinheiroCurto(ind.custo)}</div>
        <div class="det">${ind.orc ? `${fmt1.format(ind.custoPct)}% de ${dinheiroCurto(ind.orc)}` : "sem orçamento"}</div></div>
      <div class="kpi"><div class="rot">RDOs</div><div class="val">${rdosDe(p.id).length}</div><div class="det">${(rdosDe(p.id)[0] && "último " + dataCurta(rdosDe(p.id)[0].data)) || "nenhum"}</div></div>
    </div>
    <div class="cartao" style="margin-top:12px">${barrasProjeto(ind)}
      ${ind.avanco != null && ind.prazoPct != null ? `<div class="meta" style="margin-top:8px">${ind.avanco >= ind.prazoPct
        ? "✔ Avanço físico em dia com o prazo consumido."
        : `⚠ Avanço ${fmt1.format(ind.prazoPct - ind.avanco)} p.p. abaixo do prazo consumido.`}</div>` : ""}</div>
    <div class="secao">Escopo</div>
    <div class="cartao" style="white-space:pre-wrap; font-size:14px; line-height:1.55">${f.descricao ? esc(f.descricao) : `<span class="meta">Sem escopo. Toque em <b>Editar</b> para descrever.</span>`}</div>
    <div class="secao">Marcos<button class="acao btn sec mini" id="m-add">+ marco</button></div>
    <div class="cartao" id="marcos">${f.marcos.length ? "" : `<span class="meta">Marcos são as datas-chave (ex.: entrega do quadro, energização). Bastam 3 a 5.</span>`}
      ${f.marcos.map(m => `<div class="ativ marco">
        <input type="text" value="${esc(m.nome)}" data-m="${m.id}" data-k="nome" placeholder="Marco">
        <input type="date" value="${esc(m.prev || "")}" data-m="${m.id}" data-k="prev" title="Data prevista">
        <button class="rm" data-mrm="${m.id}" title="Remover">×</button>
        <label class="check" style="grid-column:1/-1; display:flex; gap:8px; font-size:13px; color:var(--cinza); margin-top:-2px">
          <input type="checkbox" data-mok="${m.id}" ${m.real ? "checked" : ""}> concluído ${m.real ? "em " + dataBR(m.real) : ""}
          ${!m.real && m.prev && m.prev < hojeISO() ? `<span class="tag atraso">vencido</span>` : ""}</label>
      </div>`).join("")}</div>`;
  const salvar = debounce(() => salvarFicha(p.id), 700);
  $("#m-add").onclick = () => { f.marcos.push({ id: uid(), nome: "", prev: "", real: "" }); salvarFicha(p.id); render(); setTimeout(() => { const i = $$("#marcos input[type=text]").pop(); i && i.focus(); }, 30); };
  $$("[data-m]").forEach(i => i.oninput = () => { const m = f.marcos.find(x => x.id === i.dataset.m); m[i.dataset.k] = i.value; salvar(); });
  $$("[data-mrm]").forEach(b => b.onclick = () => { f.marcos = f.marcos.filter(x => x.id !== b.dataset.mrm); salvarFicha(p.id); render(); });
  $$("[data-mok]").forEach(c => c.onchange = () => { const m = f.marcos.find(x => x.id === c.dataset.mok); m.real = c.checked ? hojeISO() : ""; salvarFicha(p.id); render(); });
}

/* editor de atividades com % — usado na ficha e no RDO */
function htmlAtividades(ativs) {
  return ativs.map((a, i) => `<div class="ativ" data-ai="${i}">
    <input type="text" value="${esc(a.nome)}" data-an="${i}" placeholder="Atividade">
    <button class="rm" data-arm="${i}" title="Remover">×</button>
    <div class="ativ-pct">
      <div class="pct"><input type="number" inputmode="numeric" min="0" max="100" value="${+a.pct || 0}" data-ap="${i}"><span>%</span></div>
      <div class="pct-rapido">${[0, 25, 50, 75, 100].map(v => `<button type="button" data-aq="${i}" data-v="${v}" class="${(+a.pct || 0) === v ? "on" : ""}">${v}</button>`).join("")}</div>
    </div>
  </div>`).join("");
}
function ligarAtividades(raiz, ativs, aoMudar, redesenhar) {
  $$("[data-an]", raiz).forEach(i => i.oninput = () => { ativs[+i.dataset.an].nome = i.value; aoMudar(); });
  $$("[data-ap]", raiz).forEach(i => i.oninput = () => {
    ativs[+i.dataset.ap].pct = clamp(num(i.value), 0, 100); aoMudar();
    $$(`[data-aq="${i.dataset.ap}"]`, raiz).forEach(b => b.classList.toggle("on", +b.dataset.v === ativs[+i.dataset.ap].pct));
  });
  $$("[data-aq]", raiz).forEach(b => b.onclick = () => {
    const k = +b.dataset.aq; ativs[k].pct = +b.dataset.v; aoMudar();
    $(`[data-ap="${k}"]`, raiz).value = ativs[k].pct;
    $$(`[data-aq="${k}"]`, raiz).forEach(x => x.classList.toggle("on", x === b));
  });
  $$("[data-arm]", raiz).forEach(b => b.onclick = () => {
    const a = ativs[+b.dataset.arm];
    if (a.nome && !confirm(`Remover "${a.nome}"?`)) return;
    ativs.splice(+b.dataset.arm, 1); aoMudar(); redesenhar();
  });
}
function abaAtividades(alvo, p, ind) {
  const f = ind.f;
  const desenhar = () => {
    alvo.innerHTML = `<div class="cartao">
      <div class="meta" style="margin-bottom:6px">Estas atividades e percentuais aparecem no RDO. Ao preencher o RDO, os % daqui são atualizados.</div>
      <div id="ativs">${htmlAtividades(f.atividades) || `<div class="meta" style="padding:10px 0">Nenhuma atividade ainda.</div>`}</div>
      <div class="linha-acoes" style="margin-top:12px"><button class="btn sec mini" id="a-add">+ atividade</button>
        <span class="meta">Avanço geral: <b>${ind.avanco == null ? "—" : fmt1.format(avancoDe(f.atividades)) + "%"}</b></span></div></div>`;
    const salvar = debounce(() => salvarFicha(p.id), 700);
    ligarAtividades(alvo, f.atividades, salvar, () => { salvarFicha(p.id); desenhar(); });
    $("#a-add").onclick = () => { f.atividades.push({ id: uid(), nome: "", pct: 0 }); desenhar(); const i = $$("#ativs input[type=text]").pop(); i && i.focus(); };
  };
  desenhar();
}

function abaCustos(alvo, p, ind) {
  const ls = listasDe(p.id), ex = custosExtrasDe(p.id);
  const mat = custoMaterial(p.id), ext = custoExtra(p.id);
  alvo.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="rot">Material (RMs)</div><div class="val" style="font-size:20px">${dinheiroCurto(mat)}</div><div class="det">${ls.length} requisição(ões)</div></div>
      <div class="kpi"><div class="rot">Serviços e extras</div><div class="val" style="font-size:20px">${dinheiroCurto(ext)}</div><div class="det">${ex.length} lançamento(s)</div></div>
      <div class="kpi"><div class="rot">Total</div><div class="val" style="font-size:20px">${dinheiroCurto(mat + ext)}</div><div class="det">${ind.orc ? "orçado " + dinheiroCurto(ind.orc) : "sem orçamento"}</div></div>
      <div class="kpi ${ind.custoPct > 100 ? "alerta" : ""}"><div class="rot">Saldo</div><div class="val" style="font-size:20px">${ind.orc ? dinheiroCurto(ind.orc - mat - ext) : "—"}</div><div class="det">${ind.orc ? fmt1.format(ind.custoPct) + "% consumido" : ""}</div></div>
    </div>
    <div class="secao">Requisições de material (automático)</div>
    ${ls.length ? `<div class="rolagem"><table class="tab"><thead><tr><th>Requisição</th><th>Data</th><th>Situação</th><th class="num">Valor</th></tr></thead><tbody>
      ${ls.map(l => `<tr><td><a href="../?u=${UN.toLowerCase()}#/lista/${esc(l.id)}" target="_blank" rel="noopener">${esc(l.titulo)}</a></td><td>${dataCurta(l.data || l.criadoEm)}</td>
        <td>${l.status === "concluida" ? `<span class="tag ok">concluída</span>` : `<span class="tag">em andamento</span>`}</td><td class="num">${dinheiro(totalLista(l))}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="vazio">Nenhuma RM vinculada a este projeto nas Requisições.</div>`}
    <div class="secao">Serviços e extras<button class="acao btn sec mini" id="c-add">+ custo</button></div>
    ${ex.length ? `<div class="rolagem"><table class="tab"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="num">Valor</th></tr></thead><tbody>
      ${ex.map(c => `<tr data-custo="${esc(c.id)}" style="cursor:pointer"><td>${dataCurta(c.data)}</td><td>${esc(c.descricao)}${c.fornecedor ? `<div class="meta">${esc(c.fornecedor)}</div>` : ""}</td>
        <td>${esc((CATEG_CUSTO.find(x => x[0] === c.categoria) || [, c.categoria])[1])}</td><td class="num">${dinheiro(c.valor)}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="vazio">Lance aqui serviços de terceiros, mão de obra e o que não passa por RM.</div>`}`;
  $("#c-add").onclick = () => folhaCusto(p.id);
  $$("[data-custo]").forEach(tr => tr.onclick = () => folhaCusto(p.id, S.custos.find(c => c.id === tr.dataset.custo)));
}
function folhaCusto(pid, c) {
  const novo = !c;
  c = c || { data: hojeISO(), categoria: "servico" };
  abrirFolha(`<h2>${novo ? "Novo custo" : "Custo"} · ${esc(nomeProjeto(pid))}</h2>
    <form class="pilha" id="f-custo">
      <label class="campo">Descrição<input type="text" name="descricao" value="${esc(c.descricao)}" required ${novo ? "autofocus" : ""} placeholder="Ex.: Mão de obra elétrica — medição 1"></label>
      <div class="grade2">
        <label class="campo">Valor R$<input type="text" inputmode="decimal" name="valor" value="${c.valor ? fmt.format(c.valor) : ""}" required></label>
        <label class="campo">Data<input type="date" name="data" value="${esc(c.data)}"></label>
      </div>
      <div class="grade2">
        <label class="campo">Categoria<select name="categoria">${opcoes(CATEG_CUSTO, c.categoria)}</select></label>
        <label class="campo">Fornecedor<input type="text" name="fornecedor" value="${esc(c.fornecedor)}" placeholder="opcional"></label>
      </div>
      <div class="rodape">${novo ? "" : `<button type="button" class="btn sec" id="c-del">Excluir</button>`}
        <button type="button" class="btn sec" data-fechar>Cancelar</button><button class="btn" type="submit">Salvar</button></div>
    </form>`, (el) => {
    $("#f-custo", el).onsubmit = (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target));
      if (novo) { c = { id: uid(), projeto_id: String(pid), unidade: UN, autor: emailSessao, criado_em: new Date().toISOString() }; S.custos.unshift(c); }
      Object.assign(c, { descricao: v.descricao.trim(), valor: num(v.valor), data: v.data || hojeISO(), categoria: v.categoria, fornecedor: v.fornecedor.trim() });
      gravar("prj_custos", c); fecharFolha();
      if (!/^#\/p\//.test(location.hash)) { abaProj = "custos"; location.hash = "#/p/" + encodeURIComponent(pid); } else render();
    };
    const del = $("#c-del", el);
    if (del) del.onclick = () => { if (!confirm("Excluir este custo?")) return; S.custos = S.custos.filter(x => x.id !== c.id); apagar("prj_custos", c.id); fecharFolha(); render(); };
  });
}

function linhaRdo(r, comProjeto) {
  const d = r.dados || {};
  const av = avancoDe(d.atividades);
  const efetivo = (d.maoObra || []).reduce((s, m) => s + (+m.n || 0), 0);
  return `<a class="item" href="#/rdo/${encodeURIComponent(r.id)}" style="text-decoration:none">
    <span class="tag grafite" style="margin-top:2px">nº ${r.numero}</span>
    <div class="corpo"><div class="txt">${dataBR(r.data)} · ${diaSemana(r.data)}</div>
      <div class="meta">${comProjeto ? `<span>▤ ${esc(nomeProjeto(r.projeto_id))}</span>` : ""}
        <span>${av == null ? "" : "avanço " + fmt1.format(av) + "%"}</span><span>👷 ${efetivo}</span><span>📷 ${(d.fotos || []).length}</span>
        ${(d.fotos || []).some(f => f.pendente) ? `<span class="tag media">foto pendente</span>` : ""}</div></div></a>`;
}
function abaRdos(alvo, p, ind, { rs }) {
  alvo.innerHTML = rs.length ? `<div class="lista">${rs.map(r => linhaRdo(r, false)).join("")}</div>`
    : `<div class="vazio">Nenhum RDO ainda. Toque em <b>+ RDO</b>.</div>`;
}
function abaDemandas(alvo, p, ind, { dems }) {
  alvo.innerHTML = `<div class="linha-acoes" style="margin-bottom:10px"><button class="btn sec mini" id="pd-add">+ demanda neste projeto</button></div>
    ${dems.length ? `<div class="lista">${dems.sort((a, b) => (ehAberta(b) - ehAberta(a)) || ordenarDemandas(a, b)).map(itemDemanda).join("")}</div>` : `<div class="vazio">Sem demandas vinculadas.</div>`}`;
  $("#pd-add").onclick = () => folhaDemanda(null, { projeto_id: String(p.id) });
  ligarDemandas(alvo);
}
function abaIA(alvo, p, ind, { ias }) {
  alvo.innerHTML = `<div class="meta" style="margin-bottom:10px">Planos de ação, metas e sugestões que o Claude gravar para este projeto aparecem aqui.</div>
    ${ias.length ? `<div class="pilha">${ias.map(cartaoIA).join("")}</div>` : `<div class="vazio">Nada ainda. Peça ao Claude uma análise deste projeto.</div>`}`;
  ligarIA(alvo);
}

/* ============================================================
   RDO — lista e editor
   ============================================================ */
function telaRdos() {
  const rs = S.rdos.slice().sort((a, b) => String(b.data).localeCompare(a.data) || (b.numero || 0) - (a.numero || 0));
  app.innerHTML = `
    <div class="titulo"><h1>RDO — Relatório Diário de Obra</h1><span class="esp"></span>
      <button class="btn" id="btn-novo-rdo">+ RDO de hoje</button></div>
    ${rs.length ? `<div class="lista">${rs.slice(0, 80).map(r => linhaRdo(r, true)).join("")}</div>` : `<div class="vazio">Nenhum RDO ainda.</div>`}`;
  $("#btn-novo-rdo").onclick = escolherProjetoParaRdo;
}

function criarRdo(pid) {
  pid = String(pid);
  const f = fichaDe(pid);
  const anteriores = rdosDe(pid);
  const ult = anteriores[0];
  const hoje = hojeISO();
  const jaHoje = anteriores.find(r => r.data === hoje);
  if (jaHoje && !confirm(`Já existe o RDO nº ${jaHoje.numero} de hoje para esta obra. Criar outro mesmo assim?`)) { location.hash = "#/rdo/" + encodeURIComponent(jaHoje.id); return; }
  const u = ult ? ult.dados : {};
  const contagem = (rotulos, antes) => rotulos.map(nome => ({ nome, n: +((antes || []).find(x => x.nome === nome) || {}).n || 0 }));
  const r = {
    id: uid(), projeto_id: pid, unidade: UN,
    numero: (anteriores.reduce((m, x) => Math.max(m, +x.numero || 0), 0)) + 1,
    data: hoje, autor: emailSessao, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
    dados: {
      clima: u.clima ? JSON.parse(JSON.stringify(u.clima)) : { manha: { tempo: "Limpo", condicao: "Praticável" }, tarde: { tempo: "Limpo", condicao: "Praticável" } },
      maoObra: contagem(f.maoObra, u.maoObra),
      equipamentos: contagem(f.equipamentos, u.equipamentos),
      atividades: f.atividades.map(a => ({ ...a })),
      ocorrencias: "",
      fotos: [],
    },
  };
  S.rdos.unshift(r); gravar("prj_rdos", r);
  fecharFolha();
  location.hash = "#/rdo/" + encodeURIComponent(r.id);
}

function telaRdo(idCod) {
  const r = S.rdos.find(x => x.id === decodeURIComponent(idCod || ""));
  if (!r) { app.innerHTML = `<a class="voltar" href="#/rdos">← RDOs</a><div class="vazio">RDO não encontrado.</div>`; return; }
  const p = projetoPorId(r.projeto_id) || { id: r.projeto_id, nome: "(projeto removido)" };
  const f = fichaDe(r.projeto_id);
  const d = r.dados;
  d.clima ||= { manha: {}, tarde: {} }; d.maoObra ||= []; d.equipamentos ||= []; d.atividades ||= []; d.fotos ||= [];
  const ehUltimo = rdosDe(r.projeto_id)[0] === r;
  const pr = prazoRdo(r, f);

  const salvar = debounce(() => {
    r.atualizado_em = new Date().toISOString();
    gravar("prj_rdos", r);
    if (ehUltimo) {          // o RDO mais recente atualiza o % das atividades do projeto
      f.atividades = d.atividades.map(a => ({ id: a.id || uid(), nome: a.nome, pct: +a.pct || 0 }));
      salvarFicha(r.projeto_id);
    }
  }, 900);

  const contadores = (lista, chave) => lista.map((m, i) => `<div class="contador ${+m.n ? "" : "zero"}">
      <span title="${esc(m.nome)}">${esc(m.nome)}</span>
      <div class="ctl"><button type="button" data-${chave}="${i}" data-d="-1">−</button><b>${+m.n || 0}</b><button type="button" data-${chave}="${i}" data-d="1">+</button></div></div>`).join("");
  const climaSel = (per) => `<span class="per">${per === "manha" ? "Manhã" : "Tarde"}</span>
      <select data-clima="${per}" data-k="tempo">${opcoes(TEMPOS.map(t => [t, t]), d.clima[per]?.tempo)}</select>
      <select data-clima="${per}" data-k="condicao">${opcoes(CONDICOES.map(t => [t, t]), d.clima[per]?.condicao)}</select>`;

  app.innerHTML = `
    <a class="voltar" href="#/p/${encodeURIComponent(p.id)}">← ${esc(p.nome)}</a>
    <div class="titulo"><h1>RDO nº ${r.numero}</h1><span class="esp"></span>
      <button class="btn sec mini" id="rdo-del">Excluir</button>
      <span class="sub">${esc(f.codigo ? f.codigo + " · " : "")}${esc(p.nome)}</span></div>

    <div class="bloco">
      <div class="grade2">
        <label class="campo">Data<input type="date" id="rdo-data" value="${esc(r.data)}"></label>
        <label class="campo">Nº<input type="number" inputmode="numeric" id="rdo-num" value="${r.numero}"></label>
      </div>
      <div class="resumo-rdo" style="margin-top:10px">
        <span>${diaSemana(r.data)}</span>
        <span>Prazo: <b>${pr.prazo || "—"}</b> d</span><span>Decorrido: <b>${pr.decorrido ?? "—"}</b> d</span><span>A vencer: <b>${pr.vencer ?? "—"}</b> d</span>
        ${!f.inicio || !f.prazoDias ? `<a href="#" id="rdo-prazo">definir início/prazo</a>` : ""}
      </div>
    </div>

    <div class="bloco"><h2>Condição climática</h2><div class="clima">${climaSel("manha")}${climaSel("tarde")}</div></div>

    <div class="bloco"><h2>Mão de obra<span class="esp"></span><span class="meta" id="tot-mo"></span></h2><div class="contadores" id="mo">${contadores(d.maoObra, "mo")}</div></div>
    <div class="bloco"><h2>Equipamentos<span class="esp"></span><span class="meta" id="tot-eq"></span></h2><div class="contadores" id="eq">${contadores(d.equipamentos, "eq")}</div></div>

    <div class="bloco"><h2>Atividades<span class="esp"></span><span class="meta" id="tot-av"></span></h2>
      <div id="rdo-ativs">${htmlAtividades(d.atividades)}</div>
      <button class="btn sec mini" id="rdo-add-ativ" style="margin-top:10px">+ atividade</button>
      ${ehUltimo ? "" : `<div class="meta" style="margin-top:8px">RDO antigo: alterar aqui não muda o % atual do projeto.</div>`}
    </div>

    <div class="bloco"><h2>Ocorrências / observações</h2>
      <textarea id="rdo-oc" placeholder="O que foi feito hoje, pendências, problemas, pedidos à equipe…">${esc(d.ocorrencias)}</textarea>
      ${ultimaOcorrencia(r) ? `<button class="btn sec mini" id="rdo-copiar-oc" style="margin-top:8px">↺ trazer texto do RDO anterior</button>` : ""}
    </div>

    <div class="bloco"><h2>Fotos<span class="esp"></span><span class="meta">${d.fotos.length}</span></h2>
      <div class="fotos" id="fotos">
        ${d.fotos.map((ft, i) => `<div class="foto">
          ${ft.pendente ? `<span class="pend">não enviada</span>` : ""}
          <img data-path="${esc(ft.path)}" alt="">
          <div class="acoes">${i ? `<button data-fup="${i}" title="Mover para antes">◀</button>` : ""}<button data-frm="${i}" title="Remover">✕</button></div>
          <input type="text" value="${esc(ft.legenda)}" data-fleg="${i}" placeholder="legenda (opcional)">
        </div>`).join("")}
        <label class="add-foto"><b>📷</b>Adicionar fotos<input type="file" id="in-fotos" accept="image/*" multiple hidden></label>
      </div>
    </div>

    <div class="rdo-barra">
      <button class="btn sec" id="rdo-pdf">⬇ PDF</button>
      <button class="btn verde" id="rdo-share">Compartilhar no WhatsApp</button>
    </div>`;

  /* totais ao vivo */
  const totais = () => {
    $("#tot-mo").textContent = "total " + d.maoObra.reduce((s, m) => s + (+m.n || 0), 0);
    $("#tot-eq").textContent = "total " + d.equipamentos.reduce((s, m) => s + (+m.n || 0), 0);
    const av = avancoDe(d.atividades);
    $("#tot-av").textContent = av == null ? "" : "geral " + fmt1.format(av) + "%";
  };
  totais();

  $("#rdo-data").onchange = (e) => { r.data = e.target.value || hojeISO(); salvar.agora(); render(); };
  $("#rdo-num").oninput = (e) => { r.numero = +e.target.value || r.numero; salvar(); };
  const lp = $("#rdo-prazo"); if (lp) lp.onclick = (e) => { e.preventDefault(); folhaProjeto(p); };
  $$("[data-clima]").forEach(s => s.onchange = () => { (d.clima[s.dataset.clima] ||= {})[s.dataset.k] = s.value; salvar(); });
  for (const [chave, lista] of [["mo", d.maoObra], ["eq", d.equipamentos]]) {
    $$(`[data-${chave}]`).forEach(b => b.onclick = () => {
      const m = lista[+b.dataset[chave]]; m.n = Math.max(0, (+m.n || 0) + (+b.dataset.d));
      b.parentElement.querySelector("b").textContent = m.n;
      b.closest(".contador").classList.toggle("zero", !m.n);
      totais(); salvar();
    });
  }
  const redesenharAtivs = () => { $("#rdo-ativs").innerHTML = htmlAtividades(d.atividades); ligarAtividades($("#rdo-ativs"), d.atividades, () => { totais(); salvar(); }, redesenharAtivs); totais(); };
  ligarAtividades($("#rdo-ativs"), d.atividades, () => { totais(); salvar(); }, redesenharAtivs);
  $("#rdo-add-ativ").onclick = () => { d.atividades.push({ id: uid(), nome: "", pct: 0 }); redesenharAtivs(); const i = $$("#rdo-ativs input[type=text]").pop(); i && i.focus(); salvar(); };
  $("#rdo-oc").oninput = (e) => { d.ocorrencias = e.target.value; salvar(); };
  const cp = $("#rdo-copiar-oc"); if (cp) cp.onclick = () => { $("#rdo-oc").value = d.ocorrencias = ultimaOcorrencia(r); salvar(); };

  /* fotos */
  $$("#fotos img[data-path]").forEach(async (img) => { img.src = await urlFoto(img.dataset.path); });
  $$("[data-fleg]").forEach(i => i.oninput = () => { d.fotos[+i.dataset.fleg].legenda = i.value; salvar(); });
  $$("[data-frm]").forEach(b => b.onclick = () => {
    if (!confirm("Remover esta foto do RDO?")) return;
    const [ft] = d.fotos.splice(+b.dataset.frm, 1);
    if (sb && !ft.pendente) sb.storage.from(BUCKET).remove([ft.path]);
    IDB.tirar(ft.path); salvar.agora(); render();
  });
  $$("[data-fup]").forEach(b => b.onclick = () => { const i = +b.dataset.fup; [d.fotos[i - 1], d.fotos[i]] = [d.fotos[i], d.fotos[i - 1]]; salvar.agora(); render(); });
  $("#in-fotos").onchange = async (e) => {
    const arqs = [...e.target.files]; if (!arqs.length) return;
    toast(`Preparando ${arqs.length} foto(s)…`);
    for (const a of arqs) {
      try {
        const { blob, w, h } = await comprimir(a);
        const path = `${UN}/${r.projeto_id}/${r.id}/${uid()}.jpg`;
        blobs.set(path, blob);
        const ft = { path, legenda: "", w, h, pendente: true };
        d.fotos.push(ft);
        await IDB.por(path, blob);
        if (await enviarFoto(path, blob)) { ft.pendente = false; IDB.tirar(path); }
      } catch (err) { console.warn(err); toast("Não consegui ler uma das fotos."); }
    }
    salvar.agora(); render();
    if (d.fotos.some(x => x.pendente)) toast("Sem conexão: fotos guardadas no aparelho, envio automático quando voltar o sinal.", 4500);
  };

  $("#rdo-del").onclick = () => {
    if (!confirm(`Excluir o RDO nº ${r.numero}? As fotos também serão apagadas.`)) return;
    S.rdos = S.rdos.filter(x => x !== r); apagar("prj_rdos", r.id);
    if (sb) { const ps = d.fotos.filter(x => !x.pendente).map(x => x.path); if (ps.length) sb.storage.from(BUCKET).remove(ps); }
    location.hash = "#/p/" + encodeURIComponent(r.projeto_id);
  };
  $("#rdo-pdf").onclick = (e) => exportarRdo(r, "baixar", e.currentTarget);
  $("#rdo-share").onclick = (e) => exportarRdo(r, "compartilhar", e.currentTarget);
}
function ultimaOcorrencia(r) {
  const ant = rdosDe(r.projeto_id).filter(x => x !== r && (x.numero || 0) < (r.numero || 0) && x.dados && x.dados.ocorrencias);
  return ant.length ? ant[0].dados.ocorrencias : "";
}
function prazoRdo(r, f) {
  const prazo = +f.prazoDias || 0;
  const decorrido = f.inicio ? Math.max(0, diasEntre(f.inicio, r.data)) : null;
  return { prazo, decorrido, vencer: prazo && decorrido != null ? prazo - decorrido : null };
}
const nomeArquivoRdo = (r, p) => `RDO_${UN}_${r.numero}_${String(p.nome).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w .()-]+/g, "-").slice(0, 60).trim()} - ${dataCurta(r.data).replace(/\//g, "-")}.pdf`;

async function exportarRdo(r, modo, botao) {
  const p = projetoPorId(r.projeto_id) || { nome: "Projeto" };
  const f = fichaDe(r.projeto_id);
  const txt = botao.textContent; botao.disabled = true; botao.textContent = "Gerando PDF…";
  try {
    const fotos = [];
    for (const ft of r.dados.fotos || []) { const b = await obterFoto(ft.path); if (b) fotos.push({ blob: b, legenda: ft.legenda }); }
    const pr = prazoRdo(r, f);
    const bytes = await window.RDOPDF.gerar({
      numero: r.numero, data: r.data, diaSemana: diaSemana(r.data),
      projeto: f.codigo ? `${f.codigo}_${p.nome}` : p.nome,
      unidade: f.local || UNI().local, setor: f.setor, responsavel: f.responsavel,
      prazo: pr.prazo || "", decorrido: pr.decorrido ?? "", vencer: pr.vencer ?? "",
      clima: r.dados.clima, maoObra: r.dados.maoObra, equipamentos: r.dados.equipamentos,
      atividades: r.dados.atividades.filter(a => String(a.nome || "").trim()),
      ocorrencias: r.dados.ocorrencias, fotos,
    });
    const nome = nomeArquivoRdo(r, p);
    const arquivo = new File([bytes], nome, { type: "application/pdf" });
    if (modo === "compartilhar" && navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: nome.replace(/\.pdf$/, ""), text: `RDO nº ${r.numero} — ${p.nome} — ${dataBR(r.data)}` });
      } catch (e) { if (e.name !== "AbortError") throw e; }
    } else {
      const a = document.createElement("a"); a.href = URL.createObjectURL(arquivo); a.download = nome;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      if (modo === "compartilhar") toast("Este navegador não compartilha arquivos: o PDF foi baixado — anexe no WhatsApp.", 4500);
    }
  } catch (e) {
    console.error(e); toast("Erro ao gerar o PDF: " + (e.message || e), 5000);
  } finally { botao.disabled = false; botao.textContent = txt; }
}

/* ============================================================
   IA — registros do Claude e contexto para colar
   ============================================================ */
function cartaoIA(i) {
  return `<div class="cartao ia-item ${esc(i.tipo)} ${i.status !== "aberto" ? "feito" : ""}">
    <div class="linha-acoes"><span class="tag">${esc(TIPOS_IA[i.tipo] || i.tipo)}</span>
      ${i.projeto_id ? `<a class="meta" href="#/p/${encodeURIComponent(i.projeto_id)}">▤ ${esc(nomeProjeto(i.projeto_id))}</a>` : ""}
      ${i.prazo ? `<span class="meta">⏱ ${dataCurta(i.prazo)}</span>` : ""}<span class="esp" style="flex:1"></span>
      <span class="meta">${dataCurta(String(i.criado_em).slice(0, 10))}</span></div>
    <h3 style="margin-top:8px">${esc(i.titulo)}</h3>
    ${i.conteudo ? `<div class="conteudo">${esc(i.conteudo).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</div>` : ""}
    <div class="rodape">${i.status === "aberto"
      ? `<button class="btn sec mini" data-ia="${esc(i.id)}" data-st="feito">✓ Feito</button><button class="btn sec mini" data-ia="${esc(i.id)}" data-st="descartado">Descartar</button>`
      : `<span class="tag ${i.status === "feito" ? "ok" : ""}">${esc(i.status)}</span><button class="btn sec mini" data-ia="${esc(i.id)}" data-st="aberto">Reabrir</button>`}
      ${i.tipo === "plano_acao" || i.tipo === "meta" ? `<button class="btn sec mini" data-ia-dem="${esc(i.id)}">→ virar demanda</button>` : ""}</div>
  </div>`;
}
function ligarIA(raiz) {
  $$("[data-ia]", raiz).forEach(b => b.onclick = () => {
    const i = S.ia.find(x => x.id === b.dataset.ia); i.status = b.dataset.st; gravar("prj_ia", i); render();
  });
  $$("[data-ia-dem]", raiz).forEach(b => b.onclick = () => {
    const i = S.ia.find(x => x.id === b.dataset.iaDem);
    folhaDemanda(null, { titulo: i.titulo, detalhe: i.conteudo || "", projeto_id: i.projeto_id || null, prazo: i.prazo || null });
  });
}
let filtroIA = "aberto";
function telaIA() {
  const is = S.ia.filter(i => filtroIA === "todos" || i.status === filtroIA);
  app.innerHTML = `
    <div class="titulo"><h1>IA — análises e planos</h1><span class="esp"></span>
      <button class="btn grafite mini" id="btn-ctx">🤖 Contexto p/ Claude</button>
      <span class="sub">O Claude lê e grava neste banco (via conector Supabase). O que ele registrar aparece aqui; sem conector, use o botão de contexto e cole na conversa.</span></div>
    <div class="filtros">${[["aberto", "Abertos"], ["feito", "Feitos"], ["descartado", "Descartados"], ["todos", "Todos"]]
      .map(([k, t]) => `<button data-fi="${k}" class="${filtroIA === k ? "on" : ""}">${t}</button>`).join("")}</div>
    ${is.length ? `<div class="pilha">${is.map(cartaoIA).join("")}</div>` : `<div class="vazio">Nenhum registro ${filtroIA === "todos" ? "" : filtroIA}.</div>`}`;
  $$("[data-fi]").forEach(b => b.onclick = () => { filtroIA = b.dataset.fi; render(); });
  $("#btn-ctx").onclick = () => folhaContexto();
  ligarIA(app);
}

/* resumo em Markdown de tudo que está aberto — para colar no Claude */
function contextoIA() {
  const L = [];
  const h = hojeISO();
  L.push(`# Situação ${UNI().nome} — ${dataBR(h)} (${diaSemana(h)})`, "");
  L.push("## Projetos ativos");
  for (const p of projetosAtivos()) {
    const ind = indicadores(p.id), f = ind.f;
    L.push(`### ${p.nome}${f.codigo ? ` (${f.codigo})` : ""}`);
    L.push(`- Fase: ${(FASES.find(x => x[0] === f.fase) || [, f.fase])[1]} · início ${f.inicio ? dataBR(f.inicio) : "?"} · prazo ${f.prazoDias || "?"} dias · decorridos ${ind.decorrido ?? "?"}`);
    L.push(`- Avanço físico: ${ind.avanco == null ? "sem atividades" : fmt1.format(ind.avanco) + "%"} · prazo consumido: ${ind.prazoPct == null ? "?" : fmt1.format(ind.prazoPct) + "%"}`);
    L.push(`- Custo: ${dinheiro(ind.custo)} (material RM ${dinheiro(custoMaterial(p.id))} + extras ${dinheiro(custoExtra(p.id))})${ind.orc ? ` de ${dinheiro(ind.orc)} orçados` : " · sem orçamento"}`);
    if (ind.alertas.length) L.push(`- ALERTAS: ${ind.alertas.join(", ")}`);
    if (f.descricao) L.push(`- Escopo: ${f.descricao.replace(/\s+/g, " ")}`);
    if (f.atividades.length) L.push(`- Atividades: ${f.atividades.map(a => `${a.nome} ${+a.pct || 0}%`).join("; ")}`);
    const ms = f.marcos.filter(m => m.nome);
    if (ms.length) L.push(`- Marcos: ${ms.map(m => `${m.nome} (prev. ${m.prev ? dataBR(m.prev) : "?"}${m.real ? ", feito " + dataBR(m.real) : ""})`).join("; ")}`);
    const r = rdosDe(p.id)[0];
    if (r) L.push(`- Último RDO nº ${r.numero} em ${dataBR(r.data)}: ${String(r.dados.ocorrencias || "").replace(/\s+/g, " ").slice(0, 400) || "(sem observações)"}`);
    L.push("");
  }
  L.push("## Demandas abertas");
  const ab = S.demandas.filter(ehAberta).sort(ordenarDemandas);
  if (!ab.length) L.push("- nenhuma");
  for (const d of ab) L.push(`- [${d.prioridade}] ${d.titulo}${d.projeto_id ? ` — ${nomeProjeto(d.projeto_id)}` : ""}${d.prazo ? ` — prazo ${dataBR(d.prazo)}${vencida(d) ? " (VENCIDA)" : ""}` : ""} — aberta há ${diasEntre(String(d.criado_em).slice(0, 10), h)} dia(s)${d.status !== "aberta" ? ` — ${d.status}` : ""}`);
  L.push("", `Concluídas nos últimos 7 dias: ${S.demandas.filter(d => d.status === "concluida" && String(d.concluido_em || "").slice(0, 10) >= somaDias(h, -7)).length}. ${tempoMedio()}.`);
  const ia = S.ia.filter(i => i.status === "aberto");
  if (ia.length) { L.push("", "## Ações da IA ainda abertas"); ia.forEach(i => L.push(`- (${TIPOS_IA[i.tipo] || i.tipo}) ${i.titulo}`)); }
  return L.join("\n");
}
const PROMPTS_IA = [
  ["Revisão de sexta", "Faça minha revisão semanal com base no contexto acima: me entreviste com no máximo 5 perguntas curtas (uma de cada vez) sobre o que mudou, depois me dê: 1) 3 prioridades da próxima semana, 2) riscos por projeto com medida de controle, 3) demandas que posso delegar ou encerrar."],
  ["Status para a gerência", "Monte o status dos projetos para apresentar à gerência: bullets objetivos com datas, % de avanço, custo x orçamento, próximos marcos e pontos de atenção. Tom executivo, sem jargão."],
  ["Plano de ação de projeto atrasado", "Para os projetos com alerta, monte um plano de ação 5W2H enxuto (o quê, por quê, quem, quando, como) e metas semanais mensuráveis."],
];
function folhaContexto() {
  const ctx = contextoIA();
  abrirFolha(`<h2>Contexto para o Claude</h2>
    <p class="meta" style="margin-top:-6px">Copie e cole numa conversa com o Claude (no projeto "Gestão de Projetos"). Escolha um pedido pronto ou escreva o seu.</p>
    <pre class="contexto" id="ctx-txt">${esc(ctx)}</pre>
    <div class="opcoes-rapidas" style="margin-top:12px">
      ${PROMPTS_IA.map(([t, pr], i) => `<button data-pr="${i}"><span>📋</span><div>${esc(t)}<small>copia contexto + pedido</small></div></button>`).join("")}
    </div>
    <div class="rodape"><button class="btn sec" data-fechar>Fechar</button><button class="btn" id="ctx-copiar">Copiar só o contexto</button></div>`, (el) => {
    const copiar = async (t) => {
      try { await navigator.clipboard.writeText(t); }
      catch { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
      toast("Copiado — cole no Claude ✔"); fecharFolha();
    };
    $("#ctx-copiar", el).onclick = () => copiar(ctx);
    $$("[data-pr]", el).forEach(b => b.onclick = () => copiar(ctx + "\n\n---\n" + PROMPTS_IA[+b.dataset.pr][1]));
  });
}

/* ============================================================
   LOGIN (mesma sessão das Requisições: mesmo domínio + mesmo Supabase)
   ============================================================ */
async function iniciar() {
  render();
  if (!sb) { carregou = true; render(); return; }
  const { data: { session } } = await sb.auth.getSession();
  if (session) { emailSessao = session.user.email || ""; aposLogin(); return; }
  const tela = $("#tela-login"); tela.hidden = false; $("#email").focus();
  $("#form-login").onsubmit = async (e) => {
    e.preventDefault();
    $("#login-erro").textContent = "Entrando…";
    const { data, error } = await sb.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#senha").value });
    if (error) { $("#login-erro").textContent = "E-mail ou senha incorretos."; return; }
    emailSessao = data.user.email || ""; tela.hidden = true; aposLogin();
  };
}
function aposLogin() {
  $("#btn-sair").hidden = false;
  carregar().then(reenviarPendentes);
}
$("#btn-sair").onclick = async () => { if (sb) await sb.auth.signOut(); location.reload(); };
$("#chip-unidade").onclick = (e) => {
  e.preventDefault();
  const outra = UN === "UIS3" ? "UIS" : "UIS3";
  if (!confirm(`Trocar para a unidade ${UNIDADES[outra].nome}?`)) return;
  localStorage.setItem("rq.unidade", outra);
  const u = new URL(location.href); u.searchParams.set("u", outra.toLowerCase()); location.href = u.toString();
};
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
iniciar();
