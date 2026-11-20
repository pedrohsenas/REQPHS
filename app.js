/* ============================================================
   Requisições UIS / UIS 3 — app.js
   Tudo roda no navegador: banco de itens no IndexedDB,
   listas/projetos/preços no localStorage. Nenhum servidor.
   ============================================================ */
"use strict";

/* ---------------- pessoas (aba "Dados" do modelo) ---------------- */
const PESSOAS_PADRAO = [
  { nome: "Pedro Henrique Sena de Souza",   cargo: "Engenheiro Eletricista - UIS3",    unidade: "UIS3" },
  { nome: "Alexssandro Aparecido Benitez",  cargo: "Supervisor de Manutenção - UIS3",  unidade: "UIS3" },
  { nome: "Jaisson Aranha Machado",         cargo: "Gerente Industrial - UIS3",        unidade: "UIS3" },
  { nome: "Ademilson Freire da Silva",      cargo: "Gerente de Operações e Energias",  unidade: "TODOS" },
  { nome: "Mauro Cardoso de Souza",         cargo: "Gerente Industrial - UIS",         unidade: "UIS" },
  { nome: "Ronnis Tarles Dantas Costa",     cargo: "PCM - UIS3",                       unidade: "UIS3" },
  { nome: "Juliano Covo",                   cargo: "PCM - UIS3",                       unidade: "UIS3" },
  { nome: "Marcia Pereira Paz",             cargo: "PCM - UIS3",                       unidade: "UIS3" },
  { nome: "Luiz Ricardo de Oliveira Silva", cargo: "Coordenador de Manutenção",        unidade: "TODOS" },
  { nome: "Eberson Mariano da Roza",        cargo: "Supervisor de Produção - UIS3",    unidade: "UIS3" },
].map((p, i) => ({ id: "padrao-" + (i + 1), email: "", ...p }));

/* cadastros editáveis (tela "Cadastros"): assinantes e setores — cada um com unidade */
let pessoas = null;   // carregado após LS existir (abaixo)
let setores = null;
const P = {
  pedro:     "Pedro Henrique Sena de Souza",
  alex:      "Alexssandro Aparecido Benitez",
  jaisson:   "Jaisson Aranha Machado",
  ademilson: "Ademilson Freire da Silva",
};

/* ============================================================
   UNIDADES — dois sistemas paralelos (UIS e UIS 3) sobre o
   mesmo banco de itens, a mesma memória de preços e o mesmo layout.
   · requisições e projetos pertencem a UMA unidade;
   · pessoas e setores: "UIS", "UIS3" ou "TODOS" (comuns às duas,
     ex.: gerentes e coordenadores);
   · cada unidade só enxerga o que é dela + os comuns.
   A unidade em uso vai na URL (?u=uis3 / ?u=uis), então dá para
   ter as duas abertas em abas lado a lado. Quem está vinculado pelo
   e-mail a uma unidade só fica preso a ela; "Todos" pode alternar.
   ============================================================ */
const TODOS = "TODOS";
const UNIDADES = {
  UIS3: { id: "UIS3", nome: "UIS 3", sigla: "UIS3", local: "185 - UIS 3",
          padrao: { solicitante: P.pedro, supervisor: P.alex, gerente: P.jaisson, corporativo: P.ademilson } },
  UIS:  { id: "UIS",  nome: "UIS",   sigla: "UIS",  local: "12 - UIS",
          padrao: { solicitante: "", supervisor: "", gerente: "Mauro Cardoso de Souza", corporativo: P.ademilson } },
};
const OPCOES_UNIDADE = [["UIS", "UIS"], ["UIS3", "UIS 3"], [TODOS, "Todos"]];
const nomeUnidade = (u) => u === TODOS ? "Todos" : (UNIDADES[u] || UNIDADES.UIS3).nome;
let UN = "UIS3";                                    // unidade em uso nesta aba
const UNI = () => UNIDADES[UN];

/* "uis 3" / "UIS3" / "todos" → código; vazio se não reconhecer */
const valorUnidade = (v) => {
  const u = String(v || "").toUpperCase().replace(/[\s_-]/g, "");
  return (UNIDADES[u] || u === TODOS) ? u : "";
};
/* listas e projetos sem unidade vêm da época em que só existia a UIS 3 */
const unidadeDoRegistro = (r) => { const u = valorUnidade(r && r.unidade); return UNIDADES[u] ? u : "UIS3"; };
const unidadeDoSetor = (s) => valorUnidade(s && s.unidade) || "UIS3";
/* pessoa sem unidade gravada: sugere pela função (cargo) */
function unidadeSugerida(p) {
  const c = norm(p && p.cargo);
  if (/\bUIS\s*-?\s*3\b/.test(c)) return "UIS3";
  if (/\bUIS\b/.test(c)) return "UIS";
  if (/GERENTE|COORDENADOR|DIRETOR|SUPERINTENDENTE/.test(c)) return TODOS;
  return "UIS3";
}
const unidadeDaPessoa = (p) => valorUnidade(p && p.unidade) || unidadeSugerida(p);
const naUnidade = (u, un = UN) => u === un || u === TODOS;
const pessoasUN  = (un = UN) => (pessoas || PESSOAS_PADRAO).filter(p => p.papel !== "almoxarifado" && naUnidade(unidadeDaPessoa(p), un));
const setoresUN  = (un = UN) => (setores || []).filter(s => naUnidade(unidadeDoSetor(s), un));
const projetosUN = (un = UN) => projetos.filter(p => unidadeDoRegistro(p) === un);
const listasUN   = (un = UN) => listas.filter(l => unidadeDoRegistro(l) === un);

/* Acesso às duas unidades para teste/monitoramento, SEM aparecer como pessoa da outra:
   o cadastro diz onde o nome aparece; esta lista diz quem pode alternar.
   (dá para acrescentar e-mails também em config.js: acessoDuplo: ["…"]) */
const ACESSO_DUPLO = ["projetoseletrica.uis3@lar.ind.br", ...((window.CONFIG_NUVEM || {}).acessoDuplo || [])]
  .map(e => String(e).trim().toLowerCase());
const temAcessoDuplo = () => !!emailSessao && ACESSO_DUPLO.includes(String(emailSessao).trim().toLowerCase());
/* quem pode alternar: acesso duplo, pessoas "Todos" e quem não tem vínculo de login */
const podeTrocarUnidade = () => temAcessoDuplo() || !usuarioAtual || unidadeDaPessoa(usuarioAtual) === TODOS;
const unidadeDaUrl = () => { const u = valorUnidade(new URLSearchParams(location.search).get("u")); return UNIDADES[u] ? u : ""; };
function resolverUnidade() {
  const propria = usuarioAtual ? unidadeDaPessoa(usuarioAtual) : TODOS;
  if (UNIDADES[propria] && !temAcessoDuplo()) return propria;      // preso à própria unidade
  const salva = valorUnidade(localStorage.getItem("rq.unidade"));
  return unidadeDaUrl() || (UNIDADES[salva] ? salva : (UNIDADES[propria] ? propria : "UIS3"));
}
function gravarUnidadeNaUrl(u) {
  try {
    localStorage.setItem("rq.unidade", u);
    const url = new URL(location.href);
    if (url.searchParams.get("u") !== u.toLowerCase()) { url.searchParams.set("u", u.toLowerCase()); history.replaceState(null, "", url); }
  } catch { /* file:// ou modo privado: segue só em memória */ }
}
function aplicarUnidade() {
  UN = resolverUnidade();
  gravarUnidadeNaUrl(UN);
  desenharMarca();
}
/* abre um registro de outra unidade: troca sozinho (se puder) ou volta ao início */
function garantirUnidade(u) {
  if (u === UN) return true;
  if (podeTrocarUnidade()) {
    UN = u; gravarUnidadeNaUrl(u); desenharMarca();
    toast(`Unidade trocada para ${nomeUnidade(u)}`);
    return true;
  }
  toast("Esse registro pertence a outra unidade.");
  location.hash = "#/";
  return false;
}
/* troca pelo seletor do topo */
function trocarUnidade(u) {
  if (!UNIDADES[u] || u === UN || !podeTrocarUnidade()) return;
  gravarUnidadeNaUrl(u);
  if (/^#\/(lista|projeto|os|separacao)\//.test(location.hash)) location.hash = "#/";   // a tela aberta era da outra unidade
  else render();
}
function desenharMarca() {
  const nome = UNI().nome;
  document.title = "Recursos Materiais " + nome;
  document.body.dataset.unidade = UN;
  const lt = $("#login-titulo"); if (lt) lt.textContent = "Recursos Materiais " + nome;
  const ctl = $("#unidade-ctl"); if (!ctl) return;
  const chave = UN + "|" + podeTrocarUnidade();
  if (ctl.dataset.chave === chave) return;
  ctl.dataset.chave = chave;
  ctl.innerHTML = podeTrocarUnidade()
    ? `<select id="sel-unidade" class="unidade-sel" title="${temAcessoDuplo() ? "Acesso às duas unidades (teste/monitoramento). " : ""}Trocar de unidade — cada uma tem suas requisições, projetos e cadastros">
        ${Object.values(UNIDADES).map(u => `<option value="${u.id}" ${u.id === UN ? "selected" : ""}>${u.nome}</option>`).join("")}
      </select>`
    : `<span class="unidade-chip" title="Sua unidade">${esc(nome)}</span>`;
  const sel = $("#sel-unidade");
  if (sel) sel.onchange = () => trocarUnidade(sel.value);
}

/* Regras de alçada de assinatura por valor total (iguais nas duas unidades).
   O 1º visto é sempre o SOLICITANTE da própria requisição; os demais saem
   pela FUNÇÃO no cadastro, entre as pessoas visíveis na unidade:
   até R$ 5 mil → supervisor de manutenção; até R$ 30 mil → + gerente
   industrial; acima → supervisor + gerente industrial + gerente de operações. */
/* ---------- intertravamento com o cadastro de pessoas ----------
   Nomes gravados nas listas (solicitante, autor, assinaturas) precisam
   existir no cadastro. Um nome antigo/abreviado é ligado ao cadastro quando
   há UM só candidato compatível: mesmo nome sem acento/maiúsculas, ou mesmo
   primeiro e último nome com os do meio iguais ou abreviados
   ("Pedro Henrique Sena de Souza" ↔ "Pedro Henrique S. de Souza"). */
const CONECTIVOS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);
const tokensNome = (s) => norm(s).replace(/[.,\-]/g, " ").split(/\s+/).filter(t => t && !CONECTIVOS.has(t));
function nomesCompativeis(a, b) {
  const x = tokensNome(a), y = tokensNome(b);
  if (x.length < 2 || y.length < 2) return x.join(" ") === y.join(" ") && x.length > 0;
  if (x[0] !== y[0] || x[x.length - 1] !== y[y.length - 1]) return false;
  const [cur, lon] = x.length <= y.length ? [x.slice(1, -1), y.slice(1, -1)] : [y.slice(1, -1), x.slice(1, -1)];
  let j = 0;                                          // meio do mais curto, em ordem, dentro do mais longo
  for (const t of cur) {
    while (j < lon.length && !(lon[j] === t || (t.length === 1 && lon[j][0] === t) || (lon[j].length === 1 && t[0] === lon[j]))) j++;
    if (j++ >= lon.length) return false;
  }
  return true;
}
/* devolve o nome exato do cadastro (ou "" se não houver um único compatível) */
function nomeDoCadastro(nome, un = UN) {
  const v = String(nome || "").trim();
  if (!v) return "";
  const todos = pessoas || PESSOAS_PADRAO;
  if (todos.some(p => p.nome === v)) return v;
  const unico = (lista) => lista.length === 1 ? lista[0].nome : "";
  const iguais = todos.filter(p => norm(p.nome).replace(/\s+/g, " ").trim() === norm(v).replace(/\s+/g, " "));
  if (iguais.length) return unico(iguais) || unico(iguais.filter(p => naUnidade(unidadeDaPessoa(p), un)));
  const comp = todos.filter(p => nomesCompativeis(p.nome, v));
  return unico(comp) || unico(comp.filter(p => naUnidade(unidadeDaPessoa(p), un)));
}
const noCadastro = (nome) => !!nome && (pessoas || PESSOAS_PADRAO).some(p => p.nome === nome);

function papelNaUnidade(un, trecho, padrao) {
  const t = norm(trecho);
  const cand = pessoasUN(un).filter(p => norm(p.cargo).includes(t));
  const pad = nomeDoCadastro(padrao, un);               // padrão só vale se estiver no cadastro
  if (pad && cand.some(p => p.nome === pad)) return pad;
  const p = cand.find(x => unidadeDaPessoa(x) === un) || cand[0];
  return p ? p.nome : pad;
}
function assinantesDaUnidade(un) {
  const U = UNIDADES[un] || UNIDADES.UIS3;
  return {
    solicitante: nomeDoCadastro(U.padrao.solicitante, un),
    supervisor:  papelNaUnidade(un, "SUPERVISOR DE MANUTEN", U.padrao.supervisor),
    gerente:     papelNaUnidade(un, "GERENTE INDUSTRIAL", U.padrao.gerente),
    corporativo: papelNaUnidade(un, "GERENTE DE OPERA", U.padrao.corporativo),
  };
}
function assinaturasPorValor(total, solicitante, un = UN) {
  const a = assinantesDaUnidade(un);
  const quem = solicitante || a.solicitante;
  if (total <= 5000)  return [quem, a.supervisor];                  // supervisor
  if (total <= 30000) return [quem, a.supervisor, a.gerente];       // + gerente industrial
  return [a.supervisor, a.gerente, a.corporativo];                  // gerente corporativo
}
const cargoDe = (nome) => ((pessoas || PESSOAS_PADRAO).find(p => p.nome === nome) || {}).cargo || "";
/* assinantes fixos do Cadastro de Mín/Máx: solicitante + supervisor + gerente industrial */
function assinaturasMM(l) {
  const a = assinantesDaUnidade(unidadeDoRegistro(l));
  return [l.solicitante || "", a.supervisor, a.gerente].filter(Boolean);
}

/* usuário logado (nuvem): vincula pelo e-mail do cadastro de assinantes */
let emailSessao = "";
let usuarioAtual = null;
function deduzirUsuario() {
  usuarioAtual = (pessoas || []).find(p => p.email && norm(p.email) === norm(emailSessao)) || null;
}

/* ---------------- utilidades ---------------- */
const $  = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const hoje = () => new Date().toISOString().slice(0, 10);
const fmtBR = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dinheiro = (v) => "R$ " + fmtBR.format(v || 0);
const EMISSAO_MODELO = "12/02/26";   // data de emissão do FORMULÁRIO padrão RM (fixa, não muda por lista)
const MM_NUMERO = "FO 185 1615-0014";
const MM_EMISSAO = "13/02/25";       // emissão do formulário MM (fixa)
const MM_NO = "00";
const dataBR = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };   // só dígitos: seguro em qualquer lugar
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* normalização para busca: maiúsculas, sem acento */
const norm = (s) => String(s ?? "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const semEspaco = (s) => s.replace(/[\s._\-\/]/g, "");   // ignora espaços e separadores comuns

/* preço digitado "12,34" ou "12.34" -> número */
function lerPreco(txt) {
  if (txt == null || txt === "") return 0;
  const t = String(txt).trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t);
  return isFinite(n) ? n : 0;
}

/* ---------------- armazenamento (localStorage) ---------------- */
const LS = {
  ler(chave, padrao) { try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; } },
  gravar(chave, v) { if (LS.fechado) return; try { localStorage.setItem(chave, JSON.stringify(v)); } catch (e) { console.warn("armazenamento local:", e.message); } },
  fechado: false,                             // saindo da conta: nada mais é gravado neste navegador
};
let projetos = LS.ler("rq.projetos", []);   // [{id, nome, status, autor, unidade}]
if (!Array.isArray(projetos)) projetos = [];
pessoas = LS.ler("rq.pessoas", PESSOAS_PADRAO);          // [{id, nome, cargo, email, unidade}]
setores = LS.ler("rq.setores", [{ id: "s1", nome: "9313", unidade: "UIS3" }]);  // [{id, nome, unidade}]
let listas   = LS.ler("rq.listas", []);     // ver novaLista()
if (!Array.isArray(listas)) listas = [];
let precos   = LS.ler("rq.precos", {});     // { chaveItem: {preco, em} }
if (!precos || typeof precos !== "object" || Array.isArray(precos)) precos = {};
const salvarTudo = () => { LS.gravar("rq.projetos", projetos); LS.gravar("rq.listas", listas); LS.gravar("rq.precos", precos); };
const salvarCadastros = () => { LS.gravar("rq.pessoas", pessoas); LS.gravar("rq.setores", setores); };

/* ============================================================
   NUVEM (Supabase) — banco on-line e multiusuário
   Se config.js estiver vazio, o app roda 100% local como antes.
   ============================================================ */
const CFG = window.CONFIG_NUVEM || {};
const nuvemAtiva = () => !!(CFG.url && CFG.anonKey && window.supabase);
const sb = nuvemAtiva() ? window.supabase.createClient(CFG.url, CFG.anonKey) : null;

/* ============================================================
   SINCRONIA DAS LISTAS — a tela acompanha a nuvem
   · cada lista tem uma VERSÃO na nuvem (coluna rev; sem ela, o relógio
     atualizado_em). O navegador guarda a última versão que viu;
   · gravar = "troque, desde que a versão ainda seja a que eu vi".
     Se outra pessoa gravou antes, o navegador baixa a dela, JUNTA com
     as minhas alterações e grava de novo — ninguém sobrescreve ninguém;
   · mudanças dos outros chegam por tempo real (Realtime), ao abrir a
     lista, ao voltar para a aba e por conferência periódica;
   · o que não conseguiu subir fica marcado como pendente e sobe depois.
   ============================================================ */
/* JSON com chaves em ordem fixa: compara conteúdo sem depender da ordem (o banco reordena) */
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x))
  ? Object.fromEntries(Object.keys(x).sort().map(c => [c, x[c]])) : x);
const vistoNuvem = new Map();                  // id → { rev, em, json }: última versão vista/gravada
const enviando = new Map();                    // id → conteúdo que está subindo agora (para reconhecer o próprio eco)
let maiorEm = "";                              // relógio mais recente já visto na nuvem (conferência leve)
const notarRelogio = (em) => { if (em && (!maiorEm || Date.parse(em) > Date.parse(maiorEm))) maiorEm = em; };
let temRev = false;                            // a tabela tem a coluna rev (supabase_sincronia.sql)?
const colsVersao = () => temRev ? "rev,atualizado_em" : "atualizado_em";
const mesmaVersao = (a, b) => (a.rev != null && b.rev != null) ? +a.rev === +b.rev
  : Date.parse(a.em || a.atualizado_em) === Date.parse(b.em || b.atualizado_em);
const pendentes = new Set(LS.ler("rq.pendentes", []));      // ids com alteração ainda não confirmada pela nuvem
function marcarPendente(id, sim) {
  if (sim === pendentes.has(id)) return;
  sim ? pendentes.add(id) : pendentes.delete(id);
  LS.gravar("rq.pendentes", [...pendentes]);
  if (LS.fechado) return;
  try {                                         // guarda a versão de onde parti: junta certo mesmo se fechar a aba
    const v = vistoNuvem.get(id);
    if (sim && v) localStorage.setItem("rq.base." + id, v.json); else if (!sim) localStorage.removeItem("rq.base." + id);
  } catch { /* cota cheia: segue em memória */ }
}
function verNuvem(id, v) {
  vistoNuvem.set(id, v);
  if (pendentes.has(id) && !LS.fechado) try { localStorage.setItem("rq.base." + id, v.json); } catch { /* idem */ }
}
/* de onde partiram as minhas alterações: última versão vista · foto do editor aberto · base guardada da sessão anterior */
function baseDe(id, visto) {
  if (visto) return JSON.parse(visto.json);
  /* base guardada: existe justamente quando ficou alteração por enviar de uma sessão anterior */
  try { const g = localStorage.getItem("rq.base." + id); if (g) return JSON.parse(g); } catch { /* sem base */ }
  if (editorAtivo && editorAtivo.id === id && editorAtivo.base()) return editorAtivo.base();
  return null;
}

/* ---------- higiene do que entra (nuvem, backup, cache): tipos e tamanhos previsíveis ---------- */
const ID_OK = /^[A-Za-z0-9_-]{1,60}$/;
const comoTexto = (v, max = 400) => v == null ? "" : String(v).slice(0, max);
const comoNumero = (v) => { const n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : 0; };
function normalizarLista(d) {
  if (!d || typeof d !== "object" || Array.isArray(d) || typeof d.id !== "string" || !ID_OK.test(d.id)) return null;
  for (const c of ["__proto__", "constructor", "prototype"]) if (Object.prototype.hasOwnProperty.call(d, c)) delete d[c];
  d.tipo = d.tipo === "MM" ? "MM" : "RM";
  d.status = d.status === "concluida" ? "concluida" : "andamento";
  for (const c of ["titulo", "projetoId", "autor", "numeroFO", "local", "areaSetor", "emissao", "revisao", "numero", "data",
                   "solicitante", "setor", "projetoNum", "nrOS", "criadoEm", "unidade"])
    if (d[c] != null && typeof d[c] !== "string") d[c] = comoTexto(d[c]);
  for (const c of ["descricao", "observacao", "anotacoes"]) if (d[c] != null && typeof d[c] !== "string") d[c] = comoTexto(d[c], 20000);
  d.itens = (Array.isArray(d.itens) ? d.itens : []).filter(i => i && typeof i === "object" && !Array.isArray(i)).map(i => {
    i.codigo = comoTexto(i.codigo, 60); i.descricao = comoTexto(i.descricao, 400); i.un = comoTexto(i.un, 20);
    for (const c of ["qtd", "preco", "qtdMin", "qtdMax"]) if (c in i) i[c] = comoNumero(i[c]);
    if ("justificativa" in i) i.justificativa = comoTexto(i.justificativa, 400);
    return i;
  });
  d.assinaturas = (Array.isArray(d.assinaturas) ? d.assinaturas : []).map(a => comoTexto(a, 200));
  d.log = (Array.isArray(d.log) ? d.log : []).filter(e => e && typeof e === "object" && typeof e.em === "string")
    .map(e => { e.por = comoTexto(e.por, 200); e.mudancas = Array.isArray(e.mudancas) ? e.mudancas.filter(m => m && typeof m.k === "string") : []; return e; });
  return d;
}
const normalizarProjeto = (p) => (p && typeof p === "object" && typeof p.id === "string" && ID_OK.test(p.id))
  ? { ...p, nome: comoTexto(p.nome, 200), autor: comoTexto(p.autor, 200), status: p.status === "arquivado" ? "arquivado" : "andamento" } : null;
const normalizarPessoa = (p) => (p && typeof p === "object" && typeof p.id === "string" && ID_OK.test(p.id))
  ? { ...p, nome: comoTexto(p.nome, 200), cargo: comoTexto(p.cargo, 200), email: comoTexto(p.email, 200),
      papel: p.papel === "almoxarifado" ? "almoxarifado" : "assinante" } : null;
const normalizarSetor = (s) => (s && typeof s === "object" && typeof s.id === "string" && ID_OK.test(s.id))
  ? { ...s, nome: comoTexto(s.nome, 60) } : null;

/* ---------- junta três versões: base (a que eu tinha), local (minhas mudanças) e remota (dos outros) ----------
   Campo a campo e item a item: vale a alteração de quem mexeu; se os dois mexeram no mesmo campo, vale a minha
   (é o que está na minha tela). Altera "local" no próprio objeto — o editor aberto continua apontando para ele. */
function mesclarLista(base, local, remoto) {
  base = base || {};
  const igual = (a, b) => canon(a ?? null) === canon(b ?? null);
  for (const k of new Set([...Object.keys(local), ...Object.keys(remoto)])) {
    if (k === "itens" || k === "log" || k === "id") continue;
    if (igual(local[k], base[k]) && !igual(remoto[k], local[k])) {          // só o outro mexeu
      if (remoto[k] === undefined) delete local[k]; else local[k] = remoto[k];
    }
  }
  const mb = mapaItens({ itens: base.itens || [] }), ml = mapaItens(local), mr = mapaItens(remoto);
  const chaveDe = new Map(), saida = [];
  for (const [k, il] of ml) {
    const ib = mb.get(k), ir = mr.get(k);
    chaveDe.set(il, k);
    if (!ir) { if (ib && igual(il, ib)) continue; saida.push(il); continue; }  // o outro removeu e eu não mexi → sai
    if (ib) for (const c of new Set([...Object.keys(il), ...Object.keys(ir)])) {
      if (igual(il[c], ib[c]) && !igual(ir[c], il[c])) { if (ir[c] === undefined) delete il[c]; else il[c] = ir[c]; }
    }
    saida.push(il);
  }
  for (const [k, ir] of mr) if (!ml.has(k) && !mb.has(k)) { chaveDe.set(ir, k); saida.push(ir); }   // item novo do outro
  /* ordem: se eu não reordenei, segue a ordem do outro (itens só meus ficam onde estavam, no fim) */
  const ordemL = [...ml.keys()].filter(k => mb.has(k)).join("\n"), ordemB = [...mb.keys()].filter(k => ml.has(k)).join("\n");
  if (ordemL === ordemB) {
    const pos = new Map([...mr.keys()].map((k, n) => [k, n]));
    const idx = (it) => pos.has(chaveDe.get(it)) ? pos.get(chaveDe.get(it)) : Infinity;
    saida.sort((a, b) => (idx(a) === idx(b)) ? 0 : idx(a) - idx(b));
  }
  local.itens = saida;
  /* histórico de edições: une as entradas (a mesma entrada estendida fica com a versão mais recente) */
  const porChave = new Map();
  for (const e of [...(remoto.log || []), ...(local.log || [])]) {
    const ch = (e.inicio || e.em) + "|" + e.por, ja = porChave.get(ch);
    if (!ja || String(e.em) >= String(ja.em)) porChave.set(ch, e);
  }
  local.log = [...porChave.values()].sort((a, b) => String(a.em).localeCompare(String(b.em))).slice(-LOG_MAX);
  return local;
}

/* ---------- aplica no navegador uma versão que veio da nuvem ---------- */
function aplicarListaRemota(dadosRemotos, versao) {
  const rem = normalizarLista(dadosRemotos);
  if (!rem) return false;
  const id = rem.id, visto = vistoNuvem.get(id);
  if (visto && mesmaVersao(visto, versao)) return false;                     // já tenho essa versão (eco da minha gravação)
  if (editorAtivo && editorAtivo.id === id) editorAtivo.assentar();          // o que estou digitando agora entra como alteração minha
  const jsonR = canon(rem);
  const novoVisto = { rev: versao.rev, em: versao.em || versao.atualizado_em, json: jsonR };
  notarRelogio(novoVisto.em);
  const local = listas.find(l => l.id === id);
  if (!local) { listas.push(rem); verNuvem(id, novoVisto); return true; }
  const jsonL = canon(local);
  if (jsonL === jsonR || enviando.get(id) === jsonR) { verNuvem(id, novoVisto); return false; }   // igual, ou é o eco do que acabei de enviar
  const tenhoMudancas = pendentes.has(id) || (visto ? jsonL !== visto.json : false);
  if (tenhoMudancas) mesclarLista(baseDe(id, visto), local, rem);
  else { for (const k of Object.keys(local)) delete local[k]; Object.assign(local, rem); }    // mesmo objeto: o editor aberto enxerga
  verNuvem(id, novoVisto);
  return canon(local) !== jsonL;                       // a tela precisa mudar?
}

/* ---------- grava uma lista (com conferência de versão e junção automática) ----------
   devolve true · "mesclado" (gravou depois de juntar com alterações de outra pessoa) · false (não gravou) */
async function nuvemSalvarLista(l) {
  if (!sb) return true;                       // modo local: gravar no navegador já é "salvo"
  const eraPendente = pendentes.has(l.id);
  marcarPendente(l.id, true);
  let mesclou = false;
  try {
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const visto = vistoNuvem.get(l.id);
      const corpo = { dados: l, atualizado_em: new Date().toISOString() };
      const enviado = canon(l);
      let q;
      if (!visto) q = sb.from("req_listas").insert({ id: l.id, ...corpo });
      else {
        q = sb.from("req_listas").update(corpo).eq("id", l.id);
        q = (temRev && visto.rev != null) ? q.eq("rev", visto.rev) : q.eq("atualizado_em", visto.em);
      }
      enviando.set(l.id, enviado);
      const { data, error } = await q.select(colsVersao());
      if (error && !(!visto && error.code === "23505")) { console.warn("nuvem/listas:", error.message); return false; }
      if (!error && data && data.length) {
        verNuvem(l.id, { rev: data[0].rev, em: data[0].atualizado_em, json: enviado });
        notarRelogio(data[0].atualizado_em);
        if (canon(l) === enviado) marcarPendente(l.id, false);                 // nada mudou enquanto gravava
        return mesclou ? "mesclado" : true;
      }
      /* não gravou: outra pessoa gravou antes de mim (ou excluiu) → baixa a dela e junta */
      const r = await sb.from("req_listas").select("dados," + colsVersao()).eq("id", l.id).maybeSingle();
      if (r.error) { console.warn("nuvem/listas:", r.error.message); return false; }
      if (!r.data) { vistoNuvem.delete(l.id); continue; }                      // foi excluída lá: recria com o que tenho
      const rem = normalizarLista(r.data.dados);
      if (!rem) return false;
      if (canon(rem) !== enviado) {
        if (editorAtivo && editorAtivo.id === l.id) editorAtivo.assentar();
        const b = baseDe(l.id, visto);
        if (b || eraPendente) mesclarLista(b, l, rem);                     // junta as minhas mudanças com as dela
        else { for (const k of Object.keys(l)) delete l[k]; Object.assign(l, rem); }   // sem referência do que mudei: fica a da nuvem
        mesclou = true;
      }
      verNuvem(l.id, { rev: r.data.rev, em: r.data.atualizado_em, json: canon(rem) });
    }
    return false;
  } catch (e) { console.warn("nuvem/listas:", e.message); return false; }
  finally { enviando.delete(l.id); mostrarSinc(); }
}
async function nuvemExcluirLista(id) {
  vistoNuvem.delete(id); marcarPendente(id, false);
  if (!sb) return;
  const { error } = await sb.from("req_listas").delete().eq("id", id);
  if (error) console.warn("nuvem/listas (excluir):", error.message);
}

/* o que estava guardado neste navegador passa pela mesma higiene do que vem da nuvem */
listas = listas.map(normalizarLista).filter(Boolean);
projetos = projetos.map(normalizarProjeto).filter(Boolean);
pessoas = (Array.isArray(pessoas) ? pessoas : PESSOAS_PADRAO).map(normalizarPessoa).filter(Boolean);
setores = (Array.isArray(setores) ? setores : []).map(normalizarSetor).filter(Boolean);
/* Colunas novas (unidade, status, autor) dependem do supabase_unidades.sql.
   Enquanto ele não for rodado, grava o que a tabela aceitar e avisa. */
const colunasFaltando = new Set();             // "tabela.coluna" ausentes na nuvem
let avisouMigracao = false;
function notarColunaFaltando(tabela, coluna) {
  colunasFaltando.add(tabela + "." + coluna);
  if (!avisouMigracao) { avisouMigracao = true; toast("⚠️ Falta rodar um script do Supabase (veja Cadastros)."); }
}
function avisoMigracao() {
  if (!colunasFaltando.size) return "";
  return `<div class="aviso" style="margin-bottom:14px">⚠️ O Supabase ainda não tem a(s) coluna(s)
    <strong>${[...colunasFaltando].map(esc).join(", ")}</strong>. Rode no SQL Editor do Supabase
    ${[...colunasFaltando].some(c => c.endsWith(".papel")) ? "<code>supabase/04_gestao_materiais.sql</code> (papel almoxarifado)" : "<code>supabase_unidades.sql</code> (unidade de pessoas, setores e projetos)"}.
    Sem isso, esse dado não fica gravado na nuvem.</div>`;
}
async function upsertTolerante(tabela, obj) {
  if (!sb) return true;
  const reg = { ...obj };
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    let error;
    try { ({ error } = await sb.from(tabela).upsert(reg)); } catch (e) { error = e; }
    if (!error) return true;
    const m = /could not find the '([^']+)' column/i.exec(error.message || "");
    if (!m || !(m[1] in reg)) { console.warn(`nuvem/${tabela}:`, error.message); return false; }
    notarColunaFaltando(tabela, m[1]);
    delete reg[m[1]];                           // tenta de novo sem a coluna que falta
  }
  return false;
}
async function nuvemSalvarProjeto(p) { return upsertTolerante("req_projetos", p); }
async function nuvemExcluirProjeto(id) {
  if (!sb) return;
  await sb.from("req_projetos").delete().eq("id", id);
}
async function nuvemSalvarPessoa(p) { return upsertTolerante("req_pessoas", p); }
async function nuvemExcluirPessoa(id) { if (sb) await sb.from("req_pessoas").delete().eq("id", id); }
async function nuvemSalvarSetor(s) { return upsertTolerante("req_setores", s); }
async function nuvemExcluirSetor(id) { if (sb) await sb.from("req_setores").delete().eq("id", id); }

async function nuvemSalvarPreco(chave, reg) {
  if (!sb) return;
  await sb.from("req_precos").upsert({ chave, preco: reg.preco, em: reg.em });
}

/* ---------- conferência com a nuvem: 1ª carga, periódica, ao voltar para a aba e sob demanda ---------- */
let sincEmCurso = null, ultimaSinc = 0, primeiraCarga = true, canalLigado = false, semConexao = false;
/* "ao vivo" só vale com o canal ligado E o banco preparado (o mesmo SQL que cria a coluna rev liga os avisos das tabelas) */
const aoVivo = () => canalLigado && temRev;
function mostrarSinc() {
  const el = $("#status-sinc"); if (!el) return;
  if (!sb) { el.hidden = true; return; }
  el.hidden = false;
  const estado = semConexao ? "fora" : (pendentes.size ? "pend" : (aoVivo() ? "vivo" : "ok"));
  el.dataset.estado = estado;
  el.textContent = { fora: "● sem conexão", pend: `● ${pendentes.size} a enviar`, vivo: "● ao vivo", ok: "● sincronizado" }[estado];
  el.title = (ultimaSinc ? "Última conferência com a nuvem: " + new Date(ultimaSinc).toLocaleTimeString("pt-BR") + ". " : "")
    + (aoVivo() ? "Mudanças dos colegas chegam na hora." : "Conferindo a cada 30 s e sempre que uma requisição é aberta.") + " Clique para conferir agora.";
}
/* o banco devolve no máximo 1000 linhas por consulta: busca em páginas, pela chave, até acabar
   (sem isso, passando de 1000 registros os últimos simplesmente não apareceriam) */
async function buscarPorChave(tabela, cols, chave = "id", pagina = 1000) {
  const tudo = []; let ultimo = null;
  for (;;) {
    let q = sb.from(tabela).select(cols, { count: "exact" }).order(chave, { ascending: true }).limit(pagina);
    if (ultimo != null) q = q.gt(chave, ultimo);
    const { data, error, count } = await q;
    if (error) return { data: null, error };
    tudo.push(...(data || []));
    /* acabou? vale a contagem do banco (o limite por consulta do servidor pode ser menor que a página pedida) */
    const acabou = !data || !data.length || (count != null ? data.length >= count : data.length < pagina);
    if (acabou) return { data: tudo, error: null };
    ultimo = data[data.length - 1][chave];
  }
}
let ultimoToque = 0;                                  // última vez que o usuário digitou algo
document.addEventListener("input", () => { ultimoToque = Date.now(); }, true);
async function baixarCadastros() {
  /* tabelas pequenas: baixa inteiras e diz se algo mudou */
  const antes = canon([projetos, pessoas, setores]);
  const [p, pe, se] = await Promise.all([
    buscarPorChave("req_projetos", "*"), buscarPorChave("req_pessoas", "*"), buscarPorChave("req_setores", "*"),
  ]);
  const semColuna = (rows, tabela, cols) => {
    if (rows && rows.length) cols.forEach(c => { if (!(c in rows[0])) colunasFaltando.add(tabela + "." + c); });
  };
  if (!p.error) {
    projetos = (p.data || []).map(r => {
      const o = { id: r.id, nome: r.nome };
      for (const k of ["status", "autor", "unidade"]) if (r[k] != null && r[k] !== "") o[k] = r[k];
      return normalizarProjeto(o);
    }).filter(Boolean);
    semColuna(p.data, "req_projetos", ["unidade", "status", "autor"]);
  }
  if (!pe.error && pe.data && pe.data.length) { pessoas = pe.data.map(normalizarPessoa).filter(Boolean); semColuna(pe.data, "req_pessoas", ["unidade"]); }
  if (!se.error && se.data && se.data.length) { setores = se.data.map(normalizarSetor).filter(Boolean); semColuna(se.data, "req_setores", ["unidade"]); }
  deduzirUsuario();
  return canon([projetos, pessoas, setores]) !== antes;
}
/* completa = confere também exclusões e cadastros (1ª carga, a cada 5 min, ao reconectar e sob demanda);
   leve = só o que mudou desde o relógio mais recente que já vi (uma consulta pequena) */
let ultimaCompleta = 0, querCompleta = false;
function sincronizar(completa = false) {
  if (!sb || !emailSessao) return Promise.resolve(false);
  if (completa) querCompleta = true;
  if (sincEmCurso) return sincEmCurso;
  sincEmCurso = (async () => {
    const mudadas = new Set(), removidas = new Set();
    const eraPrimeira = primeiraCarga;
    const fazCompleta = eraPrimeira || querCompleta || Date.now() - ultimaCompleta > 300000;
    querCompleta = false;
    let cadastrosMudaram = false, naNuvem = null;
    try {
      if (eraPrimeira) {
        let r = await buscarPorChave("req_listas", "id,dados,rev,atualizado_em", "id", 200);
        const semRev = !!r.error && (r.error.code === "42703" || /\brev\b/.test(r.error.message || ""));
        if (semRev) r = await buscarPorChave("req_listas", "id,dados,atualizado_em", "id", 200);   // banco ainda sem a coluna rev
        if (r.error) throw new Error(r.error.message);
        temRev = !semRev;
        for (const row of r.data || []) if (aplicarListaRemota(row.dados, row)) mudadas.add(row.id);
        naNuvem = new Set((r.data || []).map(x => x.id));
      } else if (fazCompleta || !temRev) {
        /* lista de versões (leve): baixa só o que mudou e percebe o que foi excluído.
           Sem a coluna rev o relógio é o de cada computador — por isso aqui confere sempre pela lista inteira. */
        const v = await buscarPorChave("req_listas", "id," + colsVersao());
        if (v.error) throw new Error(v.error.message);
        const baixar = (v.data || []).filter(r => { const visto = vistoNuvem.get(r.id); return !visto || !mesmaVersao(visto, r); }).map(r => r.id);
        for (let i = 0; i < baixar.length; i += 50) {
          const d = await sb.from("req_listas").select("id,dados," + colsVersao()).in("id", baixar.slice(i, i + 50));
          if (d.error) throw new Error(d.error.message);
          for (const row of d.data || []) if (aplicarListaRemota(row.dados, row)) mudadas.add(row.id);
        }
        naNuvem = new Set((v.data || []).map(x => x.id));
      } else {
        let q = sb.from("req_listas").select("id,dados," + colsVersao());
        if (maiorEm) q = q.gt("atualizado_em", maiorEm);
        const d = await q;
        if (d.error) throw new Error(d.error.message);
        for (const row of d.data || []) if (aplicarListaRemota(row.dados, row)) mudadas.add(row.id);
      }
      if (naNuvem) {
        /* o que sumiu da nuvem foi excluído por alguém — a não ser que seja meu e ainda esteja por enviar */
        for (const l of [...listas]) {
          if (naNuvem.has(l.id) || pendentes.has(l.id)) continue;
          listas = listas.filter(x => x !== l); vistoNuvem.delete(l.id); removidas.add(l.id);
        }
      }
      if (fazCompleta) {
        cadastrosMudaram = await baixarCadastros();      // projetos, pessoas e setores
        if (eraPrimeira) {                                // preços: só na 1ª carga (depois chegam por tempo real)
          const pr = await buscarPorChave("req_precos", "*", "chave");
          if (!pr.error) precos = Object.fromEntries((pr.data || []).filter(r => r && typeof r.chave === "string")
            .map(r => [r.chave, { preco: +r.preco || 0, em: comoTexto(r.em, 20) }]));
        }
        ultimaCompleta = Date.now();
      }
      primeiraCarga = false; semConexao = false; ultimaSinc = Date.now();
      if (fazCompleta || mudadas.size || removidas.size) { salvarTudo(); salvarCadastros(); }      // cache local para abrir rápido na próxima vez
      /* sobe o que estava por enviar (ficou offline, aba fechada no meio…) */
      for (const id of [...pendentes]) {
        const l = listas.find(x => x.id === id);
        if (!l) { marcarPendente(id, false); continue; }
        if (editorAtivo && editorAtivo.id === id) continue;            // o editor aberto cuida da própria gravação
        const ref = baseDe(id, vistoNuvem.get(id));                     // o que mudou desde a versão da nuvem entra no histórico
        const mud = ref ? diffLista(ref, l) : [];
        const desfazer = mud.length ? registrarLog(l, mud) : () => {};
        if (await nuvemSalvarLista(l)) mudadas.add(id); else desfazer();
      }
      if (eraPrimeira && !(editorAtivo && Date.now() - ultimoToque < 20000)) {
        if (editorAtivo && mudadas.has(editorAtivo.id)) editorAtivo.recarregar();   // separa o que é meu do que veio dos colegas
        render();
      }
      else if (mudadas.size || removidas.size || cadastrosMudaram) refletirSinc(mudadas, removidas, cadastrosMudaram);
      return true;
    } catch (e) {
      semConexao = true;
      console.warn("nuvem: sem sincronizar agora (", e.message, ")");
      if ($("#aguardando-nuvem")) render();           // estava esperando a nuvem: segue com o que há neste navegador
      return false;
    } finally {
      sincEmCurso = null; mostrarSinc();
      if (querCompleta && !semConexao) setTimeout(() => sincronizar(), 50);
    }
  })();
  return sincEmCurso;
}
const carregarNuvem = sincronizar;                    // nome antigo, mesma função

/* ---------- mostra na tela o que mudou ---------- */
let tRedesenho = null;
function refletirSinc(mudadas, removidas) {
  if (editorAtivo) {
    const id = editorAtivo.id;
    if (removidas.has(id)) {
      editorAtivo.abandonar();
      toast("Esta requisição foi excluída por outra pessoa.");
      location.hash = "#/";
    } else if (mudadas.has(id)) editorAtivo.recarregar();
    return;                                           // outras listas: a tela inicial mostra quando eu voltar
  }
  if ($(".form-cad")) return;                         // formulário aberto: não redesenha por baixo
  if ($("#bc-tela")) return;                          // busca de códigos: não usa listas ao vivo, não perde o que se digita
  clearTimeout(tRedesenho);
  tRedesenho = setTimeout(() => { if (!editorAtivo && !$(".form-cad")) render(); }, 150);
}
/* baixa só a lista aberta (rápido) — é o que garante que ela abre atualizada */
async function atualizarListaAberta(id) {
  if (!sb || primeiraCarga) return;
  const r = await sb.from("req_listas").select("id,dados," + colsVersao()).eq("id", id).maybeSingle();
  if (r.error || !editorAtivo || editorAtivo.id !== id) return;
  if (!r.data) {                                       // não existe mais na nuvem
    const l = listas.find(x => x.id === id);
    if (l && vistoNuvem.has(id) && !pendentes.has(id)) {
      listas = listas.filter(x => x !== l); vistoNuvem.delete(id); salvarTudo();
      refletirSinc(new Set(), new Set([id]));
    }
    return;
  }
  if (aplicarListaRemota(r.data.dados, r.data)) { salvarTudo(); refletirSinc(new Set([id]), new Set()); }
}

/* ---------- tempo real: o banco avisa cada navegador aberto ---------- */
let canalTempoReal = null, tCadastros = null;
function ligarTempoReal() {
  if (!sb || canalTempoReal || !sb.channel) return;
  const conferirLogo = () => { clearTimeout(tCadastros); tCadastros = setTimeout(() => sincronizar(true), 400); };
  canalTempoReal = sb.channel("rq-dados")
    .on("postgres_changes", { event: "*", schema: "public", table: "req_listas" }, (p) => {
      if (primeiraCarga) return;
      if (p.eventType === "DELETE") {
        const id = p.old && p.old.id, l = listas.find(x => x.id === id);
        if (!l || pendentes.has(id)) return;                          // tenho alteração por enviar: a próxima gravação recria
        listas = listas.filter(x => x !== l); vistoNuvem.delete(id); salvarTudo();
        refletirSinc(new Set(), new Set([id]));
        return;
      }
      const row = p.new;
      if (!row || !row.dados || typeof row.dados !== "object") { conferirLogo(); return; }    // aviso sem conteúdo: busca
      if (aplicarListaRemota(row.dados, row)) { salvarTudo(); refletirSinc(new Set([row.id]), new Set()); }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "req_projetos" }, conferirLogo)
    .on("postgres_changes", { event: "*", schema: "public", table: "req_pessoas" }, conferirLogo)
    .on("postgres_changes", { event: "*", schema: "public", table: "req_setores" }, conferirLogo)
    .on("postgres_changes", { event: "*", schema: "public", table: "req_precos" }, (p) => {
      if (p.eventType === "DELETE" || !p.new || typeof p.new.chave !== "string") return;
      precos[p.new.chave] = { preco: +p.new.preco || 0, em: comoTexto(p.new.em, 20) };
      LS.gravar("rq.precos", precos);
    })
    .subscribe((estado) => {
      const antes = canalLigado;
      canalLigado = estado === "SUBSCRIBED";
      if (canalLigado && !antes && !primeiraCarga) sincronizar(true);   // reconectou: confere o que passou enquanto estava fora
      mostrarSinc();
    });
}
/* conferência periódica (rede de segurança do tempo real) e ao voltar para a aba */
function ligarSincronia() {
  if (!sb) return;
  ligarTempoReal();
  const seVelha = (ms) => { if (!document.hidden && navigator.onLine !== false && Date.now() - ultimaSinc > ms) sincronizar(); };
  setInterval(() => seVelha(aoVivo() ? 120000 : 30000), 10000);
  document.addEventListener("visibilitychange", () => seVelha(5000));
  window.addEventListener("focus", () => seVelha(5000));
  window.addEventListener("online", () => { semConexao = false; sincronizar(true); });
  window.addEventListener("offline", () => { semConexao = true; mostrarSinc(); });
  const el = $("#status-sinc");
  if (el) el.onclick = async () => { el.textContent = "● conferindo…"; toast(await sincronizar(true) ? "Tudo conferido com a nuvem." : "Sem conexão com a nuvem agora."); };
}

const chavePreco = (item) => item.codigo && item.codigo !== "S/ CÓD." ? "C:" + item.codigo : "D:" + norm(item.descricao);
function lembrarPreco(item) {
  if (!item.preco) return;
  const chave = chavePreco(item);
  precos[chave] = { preco: item.preco, em: hoje() };
  LS.gravar("rq.precos", precos);
  nuvemSalvarPreco(chave, precos[chave]);   // compartilha com a equipe
}
const precoLembrado = (item) => (precos[chavePreco(item)] || {}).preco;

/* ---------------- banco de itens (IndexedDB) ----------------
   No aparelho fica só o NÚCLEO do banco (manutenção, engenharia, adm).
   Ele chega como UM pacote compacto (.tsv.gz, ~3 MB) do Storage, gerado
   pela Edge Function "pacote-itens"; depois só vêm as mudanças
   (conferência leve por atualizado_em).
   · enquanto o pacote não terminou de chegar, a busca vai direto na nuvem;
   · "Buscar outros" procura sempre na nuvem, só nos itens fora do núcleo;
   · se o banco na nuvem ainda não tiver as funções novas, cai no método antigo. */
let BANCO = [];        // [{c: código, d: descrição, u: unidade, a: ativo, n: norm, ns: norm sem espaço}]
let aoMudarBanco = null;   // tela aberta que quer saber quando o banco muda
const IDB = {
  abrir() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("rq-banco", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async ler(chave) {
    const db = await this.abrir();
    return new Promise((res, rej) => {
      const t = db.transaction("kv").objectStore("kv").get(chave);
      t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
    });
  },
  async gravar(chave, valor) {
    const db = await this.abrir();
    return new Promise((res, rej) => {
      const t = db.transaction("kv", "readwrite").objectStore("kv").put(valor, chave);
      t.onsuccess = () => res(); t.onerror = () => rej(t.error);
    });
  },
  async apagar(chave) {
    const db = await this.abrir();
    return new Promise((res, rej) => {
      const t = db.transaction("kv", "readwrite").objectStore("kv").delete(chave);
      t.onsuccess = () => res(); t.onerror = () => rej(t.error);
    });
  },
};

const pausa = (ms = 0) => new Promise(r => setTimeout(r, ms));
/* estado do banco neste aparelho (barra de progresso, textos e decisão local × nuvem) */
const BANCO_EST = { baixando: false, pct: 0, fase: "", origem: "", versao: "", em: "", erro: "", bytes: 0 };
const bancoPronto = () => BANCO.length > 0;
const SO_ASCII = /^[\x20-\x7e]*$/;
const normRapido = (s) => SO_ASCII.test(s) ? s.toUpperCase() : norm(s);   // a maioria das descrições já vem limpa

function itemDoBanco(c, d, u, a) {
  const n = normRapido(d) + " " + c;
  return { c, d, u: u || "UN", a: a === 0 ? 0 : 1, n, ns: semEspaco(n) };
}
/* compat: [código, descrição, unidade, ativo?] (modo local, banco.json e importação) */
function indexarBanco(itens) {
  BANCO = itens.map(([c, d, u, a]) => itemDoBanco(String(c), String(d), String(u || "UN"), a));
  avisarBancoMudou();
}
function avisarBancoMudou() {
  if (typeof aoMudarBanco === "function") setTimeout(aoMudarBanco, 0);
  mostrarBanco();
}

/* indicador no topo + barra fina de progresso */
let tMostrar = 0;
function mostrarBanco(forcar) {
  if (!forcar && Date.now() - tMostrar < 120) return;
  tMostrar = Date.now();
  const st = $("#status-banco"); if (!st) return;
  const barra = $("#barra-banco");
  const n = BANCO.length.toLocaleString("pt-BR");
  if (BANCO_EST.baixando) {
    const pct = Math.round(BANCO_EST.pct * 100);
    st.textContent = `banco: ${BANCO_EST.fase || "baixando"}${pct ? " " + pct + "%" : "…"}${bancoPronto() ? "" : " · busca on-line"}`;
    st.className = "status-banco carregando";
    if (barra) { barra.hidden = false; barra.style.setProperty("--pct", Math.max(4, pct) + "%"); }
  } else {
    if (barra) barra.hidden = true;
    if (BANCO_EST.erro && !bancoPronto()) { st.textContent = "banco: " + BANCO_EST.erro; st.className = "status-banco erro"; }
    else if (bancoPronto()) {
      st.textContent = `banco: ${n} itens${BANCO_EST.origem ? " · " + BANCO_EST.origem : ""}`;
      st.className = "status-banco ok";
    } else { st.textContent = "banco: carregando…"; st.className = "status-banco"; }
  }
  st.title = bancoPronto()
    ? `Banco de manutenção neste aparelho: ${n} itens${BANCO_EST.versao ? " (pacote " + BANCO_EST.versao + ")" : ""}. Itens de outras áreas: marque “Buscar outros”.`
    : "Enquanto o banco baixa, a busca é feita direto na nuvem.";
}

/* texto do pacote → itens indexados, em fatias (a tela não trava; enquanto isso a busca segue on-line) */
async function montarBanco(reg) {
  const extras = new Map((reg.extras || []).map(e => [e[0], e]));     // [c, d, u, a, escopo] mais novos que o pacote
  const linhas = reg.tsv ? reg.tsv.split("\n") : [];
  const novo = [];
  const fase = BANCO_EST.fase;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const t1 = l.indexOf("\t"); if (t1 < 1) continue;
    const c = l.slice(0, t1);
    if (extras.has(c)) continue;
    const t2 = l.indexOf("\t", t1 + 1), t3 = t2 < 0 ? -1 : l.indexOf("\t", t2 + 1);
    const d = t2 < 0 ? l.slice(t1 + 1) : l.slice(t1 + 1, t2);
    const u = t2 < 0 ? "UN" : (t3 < 0 ? l.slice(t2 + 1) : l.slice(t2 + 1, t3));
    novo.push(itemDoBanco(c, d, u, t3 >= 0 && l.slice(t3 + 1) === "0" ? 0 : 1));
    if (i % 20000 === 19999) {
      if (BANCO_EST.baixando) { BANCO_EST.fase = "preparando"; BANCO_EST.pct = i / linhas.length; mostrarBanco(); }
      await pausa();
    }
  }
  for (const [c, d, u, a, escopo] of extras.values()) if (escopo !== "outros" && a !== 0) novo.push(itemDoBanco(c, d, u, a));
  BANCO_EST.fase = fase;
  BANCO = novo;
  avisarBancoMudou();
}

/* ---------- nuvem: pacote publicado, trechos de texto e mudanças ---------- */
const semFuncao = (e) => !!e && (e.code === "PGRST202" || e.code === "42883" || e.code === "42P01" || e.code === "42703"
  || /could not find|does not exist|schema cache/i.test(e.message || ""));
async function lerMetaPacote() {
  const { data, error } = await sb.from("req_meta").select("valor").eq("chave", "pacote").maybeSingle();
  if (error) { if (semFuncao(error)) return null; throw new Error(error.message); }
  return data && data.valor && data.valor.arquivo ? data.valor : null;
}
/* baixa o .tsv.gz do Storage, com progresso; devolve o texto */
async function baixarPacote(meta) {
  if (typeof DecompressionStream === "undefined") throw new Error("navegador sem descompactação");
  const { data, error } = await sb.storage.from("req-pacotes").createSignedUrl(meta.arquivo, 900);
  if (error || !data) throw new Error((error && error.message) || "sem link do pacote");
  const r = await fetch(data.signedUrl, { cache: "no-store" });
  if (!r.ok || !r.body) throw new Error("pacote indisponível (" + r.status + ")");
  const total = +r.headers.get("content-length") || meta.bytes || 0;
  const leitor = r.body.getReader(), partes = [];
  let lidos = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(value); lidos += value.byteLength;
    BANCO_EST.pct = total ? Math.min(0.99, lidos / total) : 0; mostrarBanco();
  }
  const bytes = new Uint8Array(lidos);
  let p = 0; for (const v of partes) { bytes.set(v, p); p += v.byteLength; }
  if (bytes[0] === 0x1f && bytes[1] === 0x8b)                    // gzip (normal)
    return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  return new TextDecoder().decode(bytes);                         // o servidor já entregou descompactado
}
/* sem pacote publicado (ou navegador antigo): o mesmo texto em trechos, pela função do banco */
async function baixarPorTrechos(escopo = "nucleo", aoAvancar = null) {
  const ult = await sb.from("req_itens").select("atualizado_em").order("atualizado_em", { ascending: false }).limit(1);
  if (ult.error) throw ult.error;
  const marco = ult.data && ult.data[0] ? ult.data[0].atualizado_em : null;
  const partes = [];
  let apos = "", n = 0;
  for (;;) {
    const { data, error } = await sb.rpc("req_pacote_parte", { p_apos: apos, p_lim: 40000, p_escopo: escopo });
    if (error) throw error;
    if (!data || !data.n) break;
    partes.push(data.tsv); n += data.n; apos = data.ultimo;
    if (aoAvancar) aoAvancar(n);
    if (data.n < 40000) break;
  }
  return { tsv: partes.join("\n"), marco, total: n };
}
/* conferência leve: o que mudou depois do pacote (novos, alterados, mudaram de núcleo ↔ outros) */
async function conferirMudancas(reg) {
  if (!reg.marco) return reg;
  const extras = new Map((reg.extras || []).map(e => [e[0], e]));
  let marco = reg.marco, desde = reg.marco, lidos = 0;
  for (;;) {
    const { data, error } = await sb.from("req_itens").select("codigo,descricao,un,ativo,escopo,atualizado_em")
      .gt("atualizado_em", desde).order("atualizado_em", { ascending: true }).order("codigo", { ascending: true })
      .range(lidos, lidos + 999);
    if (error) throw error;
    for (const r of data || []) {
      extras.set(String(r.codigo), [String(r.codigo), r.descricao, r.un || "UN", r.ativo ? 1 : 0, r.escopo || "nucleo"]);
      if (Date.parse(r.atualizado_em) > Date.parse(marco)) marco = r.atualizado_em;
    }
    lidos += (data || []).length;
    if (!data || !data.length) break;
  }
  if (!lidos) return reg;
  const novo = { ...reg, extras: [...extras.values()], marco };
  await IDB.gravar("banco3", novo).catch(() => {});
  await montarBanco(novo);
  return novo;
}

let bancoCarregando = false;                  // enquanto sincroniza, não se importa planilha por cima
async function carregarBanco(forcarPacote = false) {
  if (bancoCarregando) return;
  bancoCarregando = true;
  try { await carregarBancoAgora(forcarPacote); }
  finally { bancoCarregando = false; BANCO_EST.baixando = false; mostrarBanco(true); }
}
async function carregarBancoAgora(forcarPacote) {
  if (!sb) return carregarBancoLegado();                     // modo local: arquivo do site / deste navegador
  BANCO_EST.erro = "";
  let reg = forcarPacote ? null : await IDB.ler("banco3").catch(() => null);
  if (reg && reg.v === 3 && typeof reg.tsv === "string") {
    BANCO_EST.origem = "neste aparelho"; BANCO_EST.versao = reg.versao || "";
    await montarBanco(reg);
  } else reg = null;
  try {
    const meta = await lerMetaPacote();
    if (meta && (!reg || reg.versao !== meta.versao)) {
      BANCO_EST.baixando = true; BANCO_EST.fase = "baixando"; BANCO_EST.pct = 0; mostrarBanco(true);
      let tsv = null;
      try { tsv = await baixarPacote(meta); }
      catch (e) { console.warn("pacote:", e.message); }
      if (tsv != null) {
        reg = { v: 3, versao: meta.versao, marco: meta.marco, tsv, extras: [], em: new Date().toISOString(), bytes: meta.bytes || 0 };
      } else {                                                 // sem descompactação ou Storage fora: trechos
        BANCO_EST.fase = "baixando (trechos)"; BANCO_EST.pct = 0;
        const t = await baixarPorTrechos("nucleo", (n) => { BANCO_EST.pct = meta.total ? n / meta.total : 0; mostrarBanco(); });
        reg = { v: 3, versao: meta.versao, marco: t.marco, tsv: t.tsv, extras: [], em: new Date().toISOString() };
      }
      BANCO_EST.fase = "preparando"; mostrarBanco(true);
      await IDB.gravar("banco3", reg).catch(() => {});
      IDB.apagar("banco").catch(() => {});                     // formato antigo (397 mil linhas): libera espaço
      BANCO_EST.origem = "pacote " + dataBR(String(meta.gerado_em || "").slice(0, 10));
      BANCO_EST.versao = meta.versao;
      await montarBanco(reg);
    } else if (!reg) {                                         // nada publicado ainda: trechos de texto
      BANCO_EST.baixando = true; BANCO_EST.fase = "baixando"; BANCO_EST.pct = 0; mostrarBanco(true);
      let t;
      try { t = await baixarPorTrechos("nucleo", (n) => { BANCO_EST.pct = Math.min(0.95, n / 260000); mostrarBanco(); }); }
      catch (e) {
        if (semFuncao(e)) { BANCO_EST.baixando = false; return carregarBancoLegado(); }   // banco sem as funções novas
        throw e;
      }
      reg = { v: 3, versao: "trechos", marco: t.marco, tsv: t.tsv, extras: [], em: new Date().toISOString() };
      await IDB.gravar("banco3", reg).catch(() => {});
      IDB.apagar("banco").catch(() => {});
      BANCO_EST.origem = "nuvem"; BANCO_EST.versao = "";
      await montarBanco(reg);
    }
    BANCO_EST.baixando = false;
    if (reg) await conferirMudancas(reg);
    if (!bancoPronto()) BANCO_EST.erro = "nuvem vazia — importe o .xlsx em “Banco de itens”";
  } catch (e) {
    console.warn("banco:", e && e.message);
    BANCO_EST.baixando = false;
    if (bancoPronto()) BANCO_EST.origem = "neste aparelho · nuvem indisponível";
    else BANCO_EST.erro = "sem conexão — a busca usa a nuvem quando a rede voltar";
  }
}

/* ---------- busca direto na nuvem (banco ainda baixando, ou "Buscar outros") ---------- */
async function buscarNaNuvem(consulta, escopo = "nucleo", limite = 60, flex = true) {
  if (!sb) return { ok: false, motivo: "Busca na nuvem indisponível no modo local." };
  if (navigator.onLine === false) return { ok: false, motivo: "Sem conexão com a internet." };
  try {
    const { data, error } = await sb.rpc("req_buscar_itens", { p_q: String(consulta || ""), p_escopo: escopo, p_lim: limite, p_flex: !!flex });
    if (error) return { ok: false, motivo: semFuncao(error) ? "A busca on-line ainda não foi instalada no banco." : error.message };
    return { ok: true, itens: (data || []).map(r => Object.assign(itemDoBanco(String(r.codigo), r.descricao || "", r.un || "UN", r.ativo ? 1 : 0),
      { usado: !!r.usado, outros: r.escopo === "outros", online: true })) };
  } catch (e) { return { ok: false, motivo: e.message || "falha de rede" }; }
}

/* ---------- método antigo (banco sem as funções novas, ou modo local) ---------- */
async function carregarBancoLegado() {
  const mostrar = (reg, origem) => {
    BANCO_EST.origem = origem; BANCO_EST.erro = "";
    indexarBanco(reg.itens);
  };
  try {
    const local = await IDB.ler("banco").catch(() => null);

    /* ---- modo nuvem: sincroniza com a tabela req_itens ---- */
    if (sb) {
      if (local && local.itens && local.itens.length) mostrar(local, "cache — sincronizando…");
      else { BANCO_EST.baixando = true; BANCO_EST.fase = "baixando (método antigo)"; mostrarBanco(true); }
      try {
        const mapa = new Map((local && local.itens || []).map(i => [String(i[0]), i]));
        const desde = (local && local.sync) || null;
        let marco = desde, baixados = 0;
        for (;;) {
          let q = sb.from("req_itens")
            .select("codigo,descricao,un,ativo,atualizado_em")
            .order("atualizado_em", { ascending: true }).order("codigo", { ascending: true })   // 2ª chave: páginas sem repetir nem pular
            .range(baixados, baixados + 999);
          if (desde) q = q.gt("atualizado_em", desde);
          const { data, error } = await q;
          if (error) throw new Error(error.message);
          for (const r of (data || [])) {
            mapa.set(String(r.codigo), [String(r.codigo), r.descricao, r.un || "UN", r.ativo ? 1 : 0]);
            if (!marco || r.atualizado_em > marco) marco = r.atualizado_em;
          }
          baixados += (data || []).length;
          if (baixados && baixados % 5000 === 0) {
            BANCO_EST.fase = `baixando ${baixados.toLocaleString("pt-BR")} itens`; mostrarBanco(true);
            await new Promise(r => setTimeout(r, 0));
          }
          if (!data || !data.length) break;            // só para quando vier vazio (o servidor pode limitar a menos de 1000)
        }
        const reg = { v: 2, em: new Date().toISOString(), sync: marco, itens: [...mapa.values()] };
        if (reg.itens.length) {
          await IDB.gravar("banco", reg).catch(() => {});
          mostrar(reg, baixados ? `nuvem · ${baixados.toLocaleString("pt-BR")} sincronizados` : "nuvem · em dia");
          return;
        }
        BANCO_EST.erro = "nuvem vazia — importe o .xlsx em “Banco de itens”";
        return;
      } catch (e) {
        if (local && local.itens && local.itens.length) { mostrar(local, "cache local — nuvem indisponível"); return; }
        BANCO_EST.erro = "erro na nuvem (" + e.message + ")";
        return;
      }
    }

    /* ---- modo local (sem Supabase configurado): igual antes ---- */
    let web = null, urlWeb = "";
    for (const url of ["dados/banco.json", "dados/banco.exemplo.json"]) {
      try {
        const r = await fetch(url, { cache: "no-cache" });
        if (!r.ok) continue;
        web = await r.json(); urlWeb = url; break;
      } catch { /* tenta o próximo */ }
    }
    const escolhido = (tempoDe(local) >= tempoDe(web) && local && local.itens && local.itens.length)
      ? { reg: local, origem: "deste navegador" }
      : (web && web.itens && web.itens.length ? { reg: web, origem: urlWeb.includes("exemplo") ? "EXEMPLO — importe o real" : "do site" } : null);
    if (!escolhido) {
      BANCO_EST.erro = "vazio — clique em “Banco de itens” para importar o .xlsx";
      return;
    }
    if (escolhido.reg === web && tempoDe(web) > tempoDe(local)) await IDB.gravar("banco", web).catch(() => {});
    mostrar(escolhido.reg, escolhido.origem);
  } catch (e) {
    BANCO_EST.erro = "erro ao carregar (" + e.message + ")";
  } finally { BANCO_EST.baixando = false; mostrarBanco(true); }
}

/* "em" antigo em dd/mm/aaaa e novo em ISO */
function tempoDe(reg) {
  if (!reg || !reg.em) return 0;
  let em = reg.em;
  if (/^\d{2}\//.test(em)) { const [d, m, a] = em.split("/"); em = `${a}-${m}-${d}`; }
  const t = Date.parse(em);
  return isNaN(t) ? 0 : t;
}

/* ---------------- importação do .xlsx da empresa ---------------- */
async function importarArquivoBanco(arquivo) {
  const prog = $("#progresso-banco");
  prog.hidden = false;
  if (bancoCarregando) throw new Error("o banco de itens ainda está sincronizando com a nuvem. Aguarde terminar (indicador no topo) e tente de novo.");
  prog.textContent = "Lendo arquivo… (o de 19 MB leva alguns segundos)";
  await new Promise(r => setTimeout(r, 30)); // deixa a UI respirar

  /* --- lê o arquivo novo: [codigo, descricao, un, ativo] --- */
  let novos = [];
  if (/\.json$/i.test(arquivo.name)) {
    const j = JSON.parse(await arquivo.text());
    novos = (j.itens || j).map(([c, d, u, a]) => [String(c), String(d), String(u || "UN"), a === 0 ? 0 : 1]);
  } else {
    if (!window.XLSX) throw new Error("a biblioteca de planilhas não carregou. Recarregue a página (Ctrl+F5) e tente de novo.");
    const buf = await arquivo.arrayBuffer();
    prog.textContent = "Interpretando planilha…";
    await new Promise(r => setTimeout(r, 30));
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames.find(n => /relacao/i.test(n)) || wb.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    let cab = -1, col = {};
    for (let i = 0; i < Math.min(linhas.length, 60); i++) {
      const l = linhas[i] || [];
      const mapa = {};
      l.forEach((v, j) => { if (v != null) mapa[norm(v).trim()] = j; });
      if (mapa["CODIGO"] != null && mapa["DESCRICAO"] != null) {
        cab = i;
        col = { codigo: mapa["CODIGO"], desc: mapa["DESCRICAO"], un: mapa["UN"], sit: mapa["SITUACAO"],
                dp: mapa["DP"], gr: mapa["GR"], sb: mapa["SB"] };
        break;
      }
    }
    if (cab < 0) throw new Error("Não encontrei as colunas CÓDIGO/DESCRIÇÃO. Confira o arquivo.");
    const pega = (l, j) => {
      if (j == null || l[j] == null) return "";
      let v = l[j];
      if (typeof v === "number" && Number.isInteger(v)) v = String(v);
      return String(v).trim();
    };
    /* 1ª passada: só itens ATIVOS, agrupados por DP/GR para a triagem */
    const brutos = [];
    let descartadosInativos = 0;
    for (let i = cab + 1; i < linhas.length; i++) {
      const l = linhas[i] || [];
      const codigo = pega(l, col.codigo), desc = pega(l, col.desc);
      if (!codigo || !desc) continue;
      const ativo = (col.sit == null) ? 1 : (norm(pega(l, col.sit)) === "ATIVO" ? 1 : 0);
      if (!ativo) { descartadosInativos++; continue; }   // inativos nem entram no banco
      brutos.push([codigo, desc, pega(l, col.un) || "UN", 1,
                   pega(l, col.dp), pega(l, col.gr), pega(l, col.sb)]);
      if (i % 20000 === 0) { prog.textContent = `Processando… ${i.toLocaleString("pt-BR")} linhas`; await new Promise(r => setTimeout(r, 0)); }
    }
    if (!brutos.length) throw new Error("Nenhum item ativo encontrado no arquivo.");

    /* triagem por grupo: o usuário escolhe o que interessa à engenharia */
    if (col.dp != null) {
      const escolhidos = await escolherGrupos(brutos, descartadosInativos);
      if (!escolhidos) { prog.textContent = "Importação cancelada."; return; }
      novos = brutos.filter(b => escolhidos.has(b[4] + "/" + b[5])).map(b => b.slice(0, 4));
    } else {
      novos = brutos.map(b => b.slice(0, 4));
    }
  }
  if (!novos.length) throw new Error("Nenhum item encontrado no arquivo.");

  /* --- mescla: adiciona novos, atualiza existentes, desativa ausentes ---
     Na nuvem, a comparação é com o banco INTEIRO (núcleo + outros), não só com o que está neste aparelho. */
  prog.textContent = "Lendo o banco atual…";
  await new Promise(r => setTimeout(r, 20));
  const anterior = await itensAtuaisParaMesclar(prog);
  prog.textContent = "Mesclando com o banco atual…";
  const vistos = new Set();
  let qNovos = 0, qAtualizados = 0, qReativados = 0, qDesativados = 0;

  const alterados = [];                      // apenas o que mudou vai para a nuvem
  for (const [c, d, u, a] of novos) {
    vistos.add(c);
    const ant = anterior.get(c);
    if (!ant) { anterior.set(c, [c, d, u, a]); alterados.push([c, d, u, a]); qNovos++; continue; }
    const mudou = ant[1] !== d || ant[2] !== u || ant[3] !== a;
    if (ant[3] === 0 && a === 1) qReativados++;
    else if (mudou) qAtualizados++;
    if (mudou) alterados.push([c, d, u, a]);
    anterior.set(c, [c, d, u, a]);           // sobrescreve nome/unidade/situação
  }
  // remove do banco o que não veio na carga (inativos e grupos não escolhidos)
  const baseCompleta = novos.length >= anterior.size * 0.5;
  const removidos = [];
  if (baseCompleta) {
    for (const [c] of anterior) {
      if (!vistos.has(c)) { anterior.delete(c); removidos.push(c); qDesativados++; }
    }
  }

  /* remoção em massa pede confirmação explícita (arquivo errado ou filtro de grupos trocado não esvazia o banco de todos) */
  if (removidos.length && !await confirmar({ titulo: `Remover ${removidos.length.toLocaleString("pt-BR")} itens do banco?`, icone: "⚠", perigo: true, ok: "Remover e continuar",
      texto: `Esta carga vai <strong>remover ${removidos.length.toLocaleString("pt-BR")}</strong> de ${(removidos.length + anterior.size).toLocaleString("pt-BR")} itens do banco`
        + (sb ? " — <strong>para toda a equipe</strong>" : "") + " (não constam no arquivo ou ficaram fora dos grupos escolhidos)." })) {
    prog.textContent = "Importação cancelada. Nada foi alterado.";
    return;
  }
  const itens = [...anterior.values()];
  const agora = new Date().toISOString();
  if (!sb) {
    prog.textContent = "Salvando no navegador…";
    /* modo local: o banco inteiro fica neste navegador */
    await IDB.gravar("banco", { v: 2, em: agora, sync: agora, itens });
    indexarBanco(itens);
  }

  /* apaga na nuvem os itens que saíram do banco (inativos / grupos não escolhidos) */
  if (sb && removidos.length) {
    for (let i = 0; i < removidos.length; i += 500) {
      const lote = removidos.slice(i, i + 500);
      const { error } = await sb.from("req_itens").delete().in("codigo", lote);
      if (error) console.warn("nuvem/remoção:", error.message);
      prog.textContent = `Limpando a nuvem… ${Math.min(i + 500, removidos.length).toLocaleString("pt-BR")} de ${removidos.length.toLocaleString("pt-BR")}`;
      await new Promise(r => setTimeout(r, 0));
    }
  }

  /* envia as mudanças para a nuvem em lotes (todos da equipe passam a ver) */
  if (sb && alterados.length) {
    for (let i = 0; i < alterados.length; i += 1000) {
      const lote = alterados.slice(i, i + 1000).map(([c, d, u, a]) => ({
        codigo: c, descricao: d, un: u, ativo: a === 1, atualizado_em: agora,
      }));
      const { error } = await sb.from("req_itens").upsert(lote);
      if (error) { prog.textContent = "Erro ao enviar para a nuvem: " + error.message; throw new Error(error.message); }
      prog.textContent = `Enviando para a nuvem… ${Math.min(i + 1000, alterados.length).toLocaleString("pt-BR")} de ${alterados.length.toLocaleString("pt-BR")}`;
      await new Promise(r => setTimeout(r, 0));
    }
  }

  /* nuvem: gera o pacote novo para os celulares (itens removidos só somem com pacote novo) */
  let msgPacote = "";
  if (sb && (alterados.length || removidos.length)) {
    try {
      prog.textContent = "Gerando o pacote compacto para os celulares…";
      const m = await publicarPacote((t) => { prog.textContent = t; });
      msgPacote = `<br>Pacote para celulares publicado: ${(m.total || 0).toLocaleString("pt-BR")} itens de manutenção (${fmtBytes(m.bytes)}).`;
      carregarBanco();
    } catch (e) {
      msgPacote = `<br>⚠️ O pacote para celulares não foi gerado agora (${esc(e.message)}). Use “Publicar pacote” abaixo.`;
    }
  }

  prog.innerHTML = `<strong>Mesclagem concluída:</strong> ${qNovos.toLocaleString("pt-BR")} novos · `
    + `${qAtualizados.toLocaleString("pt-BR")} atualizados · ${qReativados.toLocaleString("pt-BR")} reativados · `
    + `${qDesativados.toLocaleString("pt-BR")} removidos`
    + (baseCompleta ? "" : "<br>⚠️ Arquivo pequeno em relação ao banco atual: nada foi desativado (parece uma carga parcial).")
    + `<br>Total agora: ${itens.length.toLocaleString("pt-BR")} itens. `
    + (sb ? "Enviado para a nuvem: toda a equipe já vê a base atualizada." + msgPacote
          : "Para valer em todos os computadores, clique em “Baixar banco.json” e substitua o arquivo <code>dados/banco.json</code> no repositório.");
  mostrarBanco(true);
  if (typeof atualizarPainelBanco === "function") atualizarPainelBanco();
}

/* o banco atual inteiro, para comparar com a planilha nova: [código, descrição, unidade, ativo] */
async function itensAtuaisParaMesclar(prog) {
  if (!sb) return new Map(BANCO.map(i => [i.c, [i.c, i.d, i.u, i.a]]));
  const mapa = new Map();
  try {
    let apos = "";
    for (;;) {
      const { data, error } = await sb.rpc("req_pacote_parte", { p_apos: apos, p_lim: 50000, p_escopo: "todos" });
      if (error) throw error;
      if (!data || !data.n) break;
      for (const l of data.tsv.split("\n")) {
        const p = l.split("\t");
        if (p[0]) mapa.set(p[0], [p[0], p[1] || "", p[2] || "UN", p[3] === "0" ? 0 : 1]);
      }
      apos = data.ultimo;
      prog.textContent = `Lendo o banco atual da nuvem… ${mapa.size.toLocaleString("pt-BR")} itens`;
      if (data.n < 50000) break;
    }
    return mapa;
  } catch (e) {
    if (!semFuncao(e)) throw new Error("não consegui ler o banco atual da nuvem (" + (e.message || e) + ")");
  }
  /* banco sem as funções novas: lista completa, página a página (lento, mas só nesta tela) */
  const r = await buscarPorChave("req_itens", "codigo,descricao,un,ativo", "codigo", 1000);
  if (r.error) throw new Error(r.error.message);
  for (const x of r.data) mapa.set(String(x.codigo), [String(x.codigo), x.descricao, x.un || "UN", x.ativo ? 1 : 0]);
  return mapa;
}

const fmtBytes = (b) => !b ? "—" : b < 1048576 ? Math.round(b / 1024) + " kB" : (b / 1048576).toFixed(1).replace(".", ",") + " MB";

/* pede o pacote novo à nuvem e espera ficar pronto (até ~3 min) */
async function publicarPacote(aoAvancar) {
  const antes = await lerMetaPacote().catch(() => null);
  const { error } = await sb.rpc("req_pacote_publicar");
  if (error) throw new Error(semFuncao(error) ? "a publicação ainda não foi instalada no banco" : error.message);
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    await pausa(3000);
    if (aoAvancar) aoAvancar(`Gerando o pacote compacto para os celulares… ${Math.round((Date.now() - t0) / 1000)} s`);
    const m = await lerMetaPacote().catch(() => null);
    if (m && (!antes || m.versao !== antes.versao)) return m;
  }
  throw new Error("o pacote não ficou pronto em 3 minutos");
}

/* ============================================================
   Triagem de grupos: mostra DP/GR com contagem e amostras reais
   para o usuário marcar só o que interessa à engenharia.
   ============================================================ */
function escolherGrupos(brutos, inativos) {
  return new Promise((resolve) => {
    /* agrupa por DP/GR guardando exemplos de descrição */
    const grupos = new Map();
    for (const b of brutos) {
      const chave = b[4] + "/" + b[5];
      let g = grupos.get(chave);
      if (!g) { g = { chave, dp: b[4], gr: b[5], n: 0, amostras: [] }; grupos.set(chave, g); }
      g.n++;
      if (g.amostras.length < 3 && g.n % 7 === 1) g.amostras.push(b[1]);
    }
    const lista = [...grupos.values()].sort((a, b) => b.n - a.n);
    const marcados = new Set(LS.ler("rq.gruposEscolhidos", []));
    const primeiraVez = marcados.size === 0;

    const cx = document.createElement("div");
    cx.className = "modal";
    cx.innerHTML = `
      <div class="modal-caixa" style="max-width:820px;max-height:88vh;display:flex;flex-direction:column">
        <h2>Escolha os grupos de itens</h2>
        <p style="margin:0 0 8px">
          ${brutos.length.toLocaleString("pt-BR")} itens ativos em ${lista.length} grupos.
          ${inativos ? `<strong>${inativos.toLocaleString("pt-BR")}</strong> inativos já foram descartados.` : ""}
          Marque apenas os grupos usados pela engenharia — os demais não entram no banco, deixando a busca leve e limpa.
        </p>
        <div class="triagem-acoes">
          <input type="text" id="filtro-grupos" placeholder="Filtrar por descrição, DP ou GR…" style="flex:1">
          <button class="btn sec mini" id="tri-todos">Marcar todos</button>
          <button class="btn sec mini" id="tri-nenhum">Desmarcar todos</button>
        </div>
        <div class="triagem-lista" id="tri-lista"></div>
        <div class="modal-acoes" style="align-items:center">
          <span id="tri-resumo" class="contagem"></span>
          <span class="espacador" style="flex:1"></span>
          <button class="btn sec" id="tri-cancelar">Cancelar</button>
          <button class="btn" id="tri-ok">Importar selecionados</button>
        </div>
      </div>`;
    document.body.appendChild(cx);

    const alvo = cx.querySelector("#tri-lista");
    const resumo = cx.querySelector("#tri-resumo");
    const atualizarResumo = () => {
      const total = lista.filter(g => marcados.has(g.chave)).reduce((s, g) => s + g.n, 0);
      resumo.textContent = `${marcados.size} grupo(s) · ${total.toLocaleString("pt-BR")} itens serão importados`;
    };
    const desenhar = () => {
      const f = norm(cx.querySelector("#filtro-grupos").value.trim());
      const vis = f ? lista.filter(g => norm(g.chave + " " + g.amostras.join(" ")).includes(f)) : lista;
      alvo.innerHTML = vis.map(g => `
        <label class="tri-item">
          <input type="checkbox" data-g="${esc(g.chave)}" ${marcados.has(g.chave) ? "checked" : ""}>
          <span class="tri-cod">DP ${esc(g.dp)} · GR ${esc(g.gr)}</span>
          <span class="tri-n">${g.n.toLocaleString("pt-BR")}</span>
          <span class="tri-amostra">${esc(g.amostras.join(" · ") || "—")}</span>
        </label>`).join("") || `<div class="vazio">Nenhum grupo com esse filtro.</div>`;
      alvo.querySelectorAll("input[data-g]").forEach(el => {
        el.onchange = () => {
          if (el.checked) marcados.add(el.dataset.g); else marcados.delete(el.dataset.g);
          atualizarResumo();
        };
      });
      atualizarResumo();
    };
    cx.querySelector("#filtro-grupos").oninput = desenhar;
    cx.querySelector("#tri-todos").onclick = () => { lista.forEach(g => marcados.add(g.chave)); desenhar(); };
    cx.querySelector("#tri-nenhum").onclick = () => { marcados.clear(); desenhar(); };
    cx.querySelector("#tri-cancelar").onclick = () => { cx.remove(); resolve(null); };
    cx.querySelector("#tri-ok").onclick = () => {
      if (!marcados.size) { toast("Marque ao menos um grupo."); return; }
      LS.gravar("rq.gruposEscolhidos", [...marcados]);   // lembra a escolha nas próximas cargas
      cx.remove();
      resolve(marcados);
    };
    if (primeiraVez) {
      /* sugestão inicial: grupos cujas amostras parecem de manutenção/engenharia */
      const pistas = /CABO|DISJ|MOTOR|ROLAMENTO|PARAFUSO|VALVULA|SENSOR|LAMPADA|CONECTOR|CORREIA|MANGUEIRA|FILTRO|BOMBA|CHAVE|RELE|CONTATOR|TUBO|CHAPA|ELETROD|FUSIVEL|INVERSOR|TRANSFORMADOR|LUVA|ABRACADEIRA|GRAXA|ROLO|ENGRENAGEM|VEDA|RETENTOR|MANCAL|POLIA|SOLDA|BROCA|TINTA|CANALETA|CONDULETE|TERMINAL/;
      lista.forEach(g => { if (pistas.test(norm(g.amostras.join(" ")))) marcados.add(g.chave); });
    }
    desenhar();
  });
}

/* baixa o banco mesclado para publicar no repositório (dados/banco.json) */
async function baixarBancoJson() {
  const reg = await IDB.ler("banco");
  if (!reg || !reg.itens || !reg.itens.length) { toast("Não há banco importado neste navegador ainda."); return; }
  const blob = new Blob([JSON.stringify(reg)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "banco.json";
  a.click();
}

/* item cuja lupa foi clicada por último (verde) — lembra ao voltar do Google */
let lupaMarcada = sessionStorage.getItem("rq.lupa") || "";

/* ---------------- busca ---------------- */
/* Todos os termos digitados precisam aparecer (em qualquer ordem).
   Modo "ignorar espaços" compara também sem espaços/pontos/traços. */
function buscar(consulta, ignorarEspacos, limite = 60) {
  const termos = norm(consulta).trim().split(/\s+/).filter(Boolean);
  if (!termos.length) return [];
  const termosNS = termos.map(semEspaco);
  const achados = [];
  for (let i = 0; i < BANCO.length; i++) {
    const it = BANCO[i];
    let ok = true;
    for (let t = 0; t < termos.length; t++) {
      const bate = it.n.includes(termos[t]) || (ignorarEspacos && it.ns.includes(termosNS[t]));
      if (!bate) { ok = false; break; }
    }
    if (ok) {
      // pontuação simples: começo da descrição vale mais
      const pos = it.n.indexOf(termos[0]);
      const usado = !!precos["C:" + it.c];           // já apareceu em alguma requisição
      achados.push({ it, pos: (pos < 0 ? 999 : pos) + (it.a ? 0 : 10000) - (usado ? 100000 : 0) });
      if (achados.length >= 400) break;   // já há resultados de sobra
    }
  }
  achados.sort((a, b) => a.pos - b.pos || a.it.d.length - b.it.d.length);
  return achados.slice(0, limite).map(a => ({ ...a.it, usado: a.usado }));
}

/* ---------------- modelos de dados ---------------- */
function novaLista(titulo, projetoId, tipo) {
  const U = UNI();
  const eu = (usuarioAtual && usuarioAtual.nome) || nomeDoCadastro(U.padrao.solicitante);
  return {
    id: uid(), tipo: tipo || "RM",                    // RM = requisição de material · MM = cadastro mín/máx
    unidade: UN,                                      // UIS3 | UIS — define quem enxerga a lista
    status: "andamento",                              // andamento | concluida
    autor: (usuarioAtual && usuarioAtual.nome) || emailSessao || "",
    anotacoes: "",
    titulo: titulo || "Nova requisição", projetoId: projetoId || "",
    numeroFO: "FO 185 1613-0015",
    local: U.local, areaSetor: "PROJETOS",
    emissao: hoje(), revisao: "0", numero: "",
    descricao: "", data: hoje(),
    solicitante: eu, setor: "", projetoNum: "", nrOS: "",   // setor em branco: código do cadastro
    observacao: "COMUNICAR O SOLICITANTE QUANDO DA CHEGADA.",
    itens: [],                       // {codigo, descricao, un, qtd, preco}
    assinaturas: [],
    assinaturasManuais: false,
    criadoEm: hoje(),
  };
}
/* título (e projeto) de uma lista nova — no lugar dos antigos prompt() */
function formNovaLista(tipo = "RM", projetoId = "") {
  const projs = projetosUN().filter(p => p.status !== "arquivado");
  return formulario(tipo === "MM" ? "Novo cadastro de Mínimo e Máximo" : "Nova requisição de material", [
    { nome: "titulo", rot: "Título", ph: tipo === "MM" ? "Ex.: Mín/máx — rolamentos do extrator" : "Ex.: Materiais do CCM do farelo",
      ajuda: "Aparece no cartão e no nome do PDF. Dá para mudar depois." },
    ...(tipo === "MM" ? [] : [{ nome: "projeto", rot: "Projeto (opcional)", opcoes: [["", "— sem projeto —"], ...projs.map(p => [p.id, p.nome])] }]),
  ], { titulo: "", projeto: projetoId || "" });
}
/* completa a lista recém-criada com as assinaturas do próprio criador */
function prepararAssinaturas(l) {
  l.assinaturas = l.tipo === "MM" ? assinaturasMM(l) : assinaturasPorValor(0, l.solicitante, unidadeDoRegistro(l));
  return l;
}
const totalDa = (l) => l.tipo === "MM"
  ? l.itens.reduce((s, i) => s + (i.qtdMin || 0) * (i.preco || 0), 0)     // MM: valor total = Qtde MÍN × valor un (padrão do FO)
  : l.itens.reduce((s, i) => s + (i.qtd || 0) * (i.preco || 0), 0);

/* ============================================================
   LOG DE EDIÇÕES — só registra o que foi efetivamente salvo
   Cada lista guarda l.log = [{em, por, inicio?, mudancas:[{k,t,de,para}]}]
   Edições seguidas da mesma pessoa (até 15 min) viram uma entrada só.
   ============================================================ */
const LOG_MAX = 60;                 // entradas guardadas por lista
const LOG_MUDANCAS_MAX = 40;        // linhas de mudança por entrada
const LOG_JUNTAR_MIN = 15;          // janela para juntar edições da mesma pessoa
const quemSou = () => (usuarioAtual && usuarioAtual.nome) || emailSessao || "Usuário local";
const dataHoraBR = (iso) => {
  const d = new Date(iso); if (!iso || isNaN(d)) return "";
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};
const horaBR = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
const curto = (s, n = 48) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const fmtNum = (n) => n ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(n) : "";
const ultimaEdicao = (l) => (l && l.log && l.log.length) ? l.log[l.log.length - 1] : null;

const CAMPOS_LOG = [
  ["titulo", "Título"], ["status", "Status"], ["projetoId", "Projeto vinculado"], ["autor", "Autor"],
  ["numeroFO", "Número"], ["local", "Local"], ["areaSetor", "Área/Setor"], ["descricao", "Descrição"],
  ["data", "Data"], ["solicitante", "Solicitante"], ["setor", "Setor"], ["projetoNum", "Projeto (nº)"],
  ["nrOS", "NR O.S."], ["observacao", "Observação"],
];
function valorLog(campo, v) {
  if (v == null || v === "") return "";
  if (campo === "status") return v === "concluida" ? "Concluída" : "Em andamento";
  if (campo === "projetoId") { const p = projetos.find(x => x.id === v); return p ? p.nome : "(projeto removido)"; }
  if (campo === "data") return dataBR(v);
  return curto(v, 60);
}
const rotItem = (i) => ((i.codigo && i.codigo !== "S/ CÓD.") ? i.codigo + " · " : "") + curto(i.descricao, 42);
/* item com quantidades e preço, para inclusões/remoções no log */
function descItemLog(i) {
  const un = i.un ? " " + i.un : "";
  let q = "";
  if (i.qtdMin !== undefined || i.qtdMax !== undefined) {
    q = [i.qtdMin ? "mín " + fmtNum(i.qtdMin) : "", i.qtdMax ? "máx " + fmtNum(i.qtdMax) : ""].filter(Boolean).join(" / ");
  } else if (i.qtd) q = fmtNum(i.qtd);
  return rotItem(i) + (q ? ` (${q}${un})` : "") + (i.preco ? " × " + dinheiro(i.preco) : "");
}
function mapaItens(l) {
  const m = new Map(), n = {};
  for (const i of (l.itens || [])) {
    const b = (i.codigo || "") + "|" + norm(i.descricao);
    n[b] = (n[b] || 0) + 1;
    m.set(b + "#" + n[b], i);
  }
  return m;
}
const CAMPOS_ITEM_LOG = [
  ["qtd", "Qtd.", fmtNum], ["qtdMin", "Qtde mín.", fmtNum], ["qtdMax", "Qtde máx.", fmtNum],
  ["preco", "Valor un.", (v) => v ? dinheiro(v) : ""], ["justificativa", "Justificativa", (v) => curto(v, 40)],
];
/* compara duas versões da lista e devolve as mudanças */
function diffLista(a, b) {
  const mud = [];
  for (const [c, rot] of CAMPOS_LOG) {
    if (String(a[c] ?? "") !== String(b[c] ?? "")) mud.push({ k: "f:" + c, t: rot, de: valorLog(c, a[c]), para: valorLog(c, b[c]) });
  }
  if ((a.anotacoes || "") !== (b.anotacoes || "")) mud.push({ k: "f:anotacoes", t: "Anotações internas alteradas" });
  const assA = (a.assinaturas || []).join(", "), assB = (b.assinaturas || []).join(", ");
  if (assA !== assB) mud.push({ k: "f:assinaturas", t: "Assinaturas", de: assA, para: assB });
  const ma = mapaItens(a), mb = mapaItens(b);
  for (const [k, ib] of mb) {
    const ia = ma.get(k);
    if (!ia) { mud.push({ k: "+:" + k, t: "Item incluído", para: descItemLog(ib) }); continue; }
    for (const [c, rot, f] of CAMPOS_ITEM_LOG) {
      if (String(ia[c] || "") !== String(ib[c] || "")) mud.push({ k: c + ":" + k, t: rot + " — " + rotItem(ib), de: f(ia[c]), para: f(ib[c]) });
    }
  }
  for (const [k, ia] of ma) if (!mb.has(k)) mud.push({ k: "-:" + k, t: "Item removido", de: descItemLog(ia) });
  if (!mud.some(m => m.k[0] === "+" || m.k[0] === "-") && [...ma.keys()].join("\n") !== [...mb.keys()].join("\n"))
    mud.push({ k: "f:ordem", t: "Ordem dos itens alterada" });
  return mud;
}
/* junta mudanças novas numa entrada existente (de → para final; incluído+removido se anulam) */
function juntarMudancas(velhas, novas, l) {
  const r = velhas.map(m => ({ ...m }));
  for (const m of novas) {
    const chave = m.k.slice(m.k.indexOf(":") + 1);
    if (m.k.startsWith("-:") && r.some(x => x.k === "+:" + chave)) {
      for (let j = r.length - 1; j >= 0; j--) if (r[j].k.endsWith(":" + chave)) r.splice(j, 1);
      continue;
    }
    if (m.k.startsWith("+:")) {
      const iRem = r.findIndex(x => x.k === "-:" + chave);
      if (iRem >= 0) { r.splice(iRem, 1); continue; }
    }
    const i = r.findIndex(x => x.k === m.k);
    if (i < 0) { r.push({ ...m }); continue; }
    r[i].para = m.para;
    if (r[i].de !== undefined && (r[i].de || "") === (r[i].para || "")) r.splice(i, 1);   // voltou ao original
  }
  return consolidarIncluidos(r, l).slice(-LOG_MUDANCAS_MAX);
}
/* itens incluídos nesta entrada: o texto reflete qtd/preço finais e os ajustes avulsos somem */
function consolidarIncluidos(r, l) {
  if (!l) return r;
  const incl = new Set(r.filter(x => x.k.startsWith("+:")).map(x => x.k.slice(2)));
  if (!incl.size) return r;
  const mapa = mapaItens(l);
  return r.filter(x => {
    const i = x.k.indexOf(":");
    return i < 0 || x.k.startsWith("+:") || !incl.has(x.k.slice(i + 1));
  }).map(x => {
    if (!x.k.startsWith("+:")) return x;
    const it = mapa.get(x.k.slice(2));
    return it ? { ...x, para: descItemLog(it) } : x;
  });
}
/* registra no log da lista; devolve uma função que desfaz (se o salvamento falhar) */
function registrarLog(l, mudancas) {
  const antes = (l.log || []).slice();
  const agora = new Date().toISOString(), por = quemSou();
  const ult = antes[antes.length - 1];
  const marco = mudancas.some(m => m.k === "f:status");      // concluir/reabrir: sempre entrada própria
  let novo, juntou = false;
  if (!marco && ult && !ult.marco && ult.por === por && (Date.parse(agora) - Date.parse(ult.em)) < LOG_JUNTAR_MIN * 60000) {
    juntou = true;
    novo = antes.slice(0, -1).concat([{ em: agora, por, inicio: ult.inicio || ult.em, mudancas: juntarMudancas(ult.mudancas || [], mudancas, l) }]);
  } else {
    const e = { em: agora, por, mudancas: consolidarIncluidos(mudancas, l).slice(0, LOG_MUDANCAS_MAX) };
    if (marco) e.marco = true;
    novo = antes.concat([e]);
  }
  l.log = novo.slice(-LOG_MAX);
  /* desfazer (a gravação falhou): tira só a MINHA entrada — o histórico pode ter recebido entradas dos colegas nesse meio-tempo */
  const minha = novo[novo.length - 1], juntada = juntou ? ult : null;
  return () => {
    const i = (l.log || []).indexOf(minha);
    if (i < 0) return;
    if (juntada) l.log.splice(i, 1, juntada); else l.log.splice(i, 1);
  };
}
function htmlMudanca(m) {
  if (m.k.startsWith("+:")) return `<span class="lg-add">+ incluído</span> ${esc(m.para)}`;
  if (m.k.startsWith("-:")) return `<span class="lg-rem">− removido</span> <span class="lg-de">${esc(m.de)}</span>`;
  if (m.de === undefined && m.para === undefined) return esc(m.t);
  return `${esc(m.t)}: <span class="lg-de">${esc(m.de || "vazio")}</span> → <strong>${esc(m.para || "vazio")}</strong>`;
}
function faixaLog(e) {
  if (e.inicio && new Date(e.inicio).toDateString() === new Date(e.em).toDateString() && horaBR(e.inicio) !== horaBR(e.em))
    return `${dataHoraBR(e.inicio)}–${horaBR(e.em)}`;
  return dataHoraBR(e.em);
}

/* aviso flutuante discreto */
function toast(msg) {
  let el = $("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast no-print"; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add("visivel");
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("visivel"), 2600);
}

/* setores: só código numérico */
const setorValido = (v) => /^\d+$/.test(String(v || ""));
const setorCadastrado = (v, un = UN) => setoresUN(un).some(s => s.nome === v);

/* editor aberto: ao sair da tela, salva o que estiver pendente */
let editorAtivo = null;
let roZoom = null;
function sairDoEditor() {
  if (editorAtivo) { editorAtivo.commit(); editorAtivo = null; }
  if (roZoom) { roZoom.disconnect(); roZoom = null; }
}
document.addEventListener("visibilitychange", () => { if (document.hidden && editorAtivo) editorAtivo.commit(); });
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && editorAtivo) { e.preventDefault(); editorAtivo.focarBusca(); }
});
function marcarSetor(el) {
  const fora = !!el.value && !setorCadastrado(el.value);
  el.classList.toggle("fora-cadastro", fora);
  el.title = fora ? `Setor fora do cadastro da ${UNI().nome} (Cadastros → Setores)` : "Código numérico do setor — sugestões do cadastro";
}

/* ---------------- roteamento ---------------- */
window.addEventListener("hashchange", render);
function render() {
  try { desenharTela(); }
  catch (e) {
    console.error("tela:", e);
    const app = $("#app");
    app.innerHTML = `<div class="vazio" style="margin:30px auto;max-width:560px">Não consegui montar esta tela.<br>
      <span style="font-size:12px">${esc(e && e.message)}</span><br><br>
      <a class="btn" href="#/">Voltar ao início</a> <button class="btn sec" id="btn-recarregar">Recarregar a página</button></div>`;
    const b = $("#btn-recarregar"); if (b) b.onclick = () => location.reload();
  }
}
let rotaAnterior = "";
function desenharTela() {
  const h = location.hash || "#/";
  const app = $("#app");
  sairDoEditor();                                   // salva pendências do editor anterior
  if (sb && !primeiraCarga && Date.now() - ultimaSinc > 8000) sincronizar();   // tela nova, dados frescos
  app.onclick = null; app.onchange = null;          // cada tela liga os próprios eventos
  GM.tela = null;                                   // Gestão de Materiais: só a tela aberta se redesenha
  document.body.classList.remove("com-lote");
  aplicarUnidade();                                 // UIS ou UIS 3 (URL / login)
  /* almoxarifado: só separação (e busca de códigos) */
  document.body.classList.toggle("perfil-almox", ehAlmox());
  if (ehAlmox() && !(h.startsWith("#/separacao/") || h === "#/materiais/separacao" || h === "#/codigos")) { location.hash = "#/materiais/separacao"; return; }
  document.body.classList.toggle("pg-editor", h.startsWith("#/lista/"));
  $$("#topo nav a[href]").forEach(a => {
    const href = a.getAttribute("href");
    a.classList.toggle("ativo", href === h || (href === "#/materiais" && (h.startsWith("#/materiais") || h.startsWith("#/os/") || h.startsWith("#/separacao/"))));
  });
  desenharMenuMovel();
  if (h !== rotaAnterior) { rotaAnterior = h; window.scrollTo(0, 0); }   // tela nova começa do topo (redesenho não)
  if (h.startsWith("#/lista/"))       telaEditor(app, h.slice(8));
  else if (h === "#/materiais/itens")  telaMateriais(app, "itens");
  else if (h === "#/materiais/separacao") telaMateriais(app, "separacao");
  else if (h.startsWith("#/materiais")) telaMateriais(app, "quadro");
  else if (h.startsWith("#/os/"))      telaOS(app, h.slice(5));
  else if (h.startsWith("#/separacao/")) telaSeparacao(app, h.slice(12));
  else if (h.startsWith("#/projeto/")) telaProjeto(app, h.slice(10));
  else if (h === "#/historico")        telaHistorico(app);
  else if (h === "#/codigos")          telaBuscaCodigos(app);
  else if (h === "#/cadastros")        telaCadastros(app);
  else if (h === "#/arquivados")       telaArquivados(app);
  else telaInicio(app);
}

/* registro que ainda não está neste navegador (link direto, 1º acesso): espera a nuvem responder antes de desistir */
function aguardarNuvem(app) {
  if (!sb || !primeiraCarga || semConexao) return false;
  app.innerHTML = `<div class="vazio" id="aguardando-nuvem" style="margin:40px auto;max-width:420px">Carregando da nuvem…</div>`;
  return true;                                       // a 1ª carga redesenha a tela ao terminar
}

/* ============================================================
   TELA: INÍCIO — projetos e listas
   ============================================================ */
function telaInicio(app) {
  /* filtro por dono: 'meu' (padrão), 'todos' ou 'p:Nome da Pessoa' */
  let filtro = localStorage.getItem("rq.filtroDono") || "meu";
  if (filtro === "meu" && !usuarioAtual) filtro = "todos";   // sem vínculo de login, mostra tudo
  const donoOk = (autor) => {
    if (!autor) return true;                                  // registros antigos sem autor aparecem sempre
    if (filtro === "todos") return true;
    if (filtro === "meu") return usuarioAtual && autor === usuarioAtual.nome;
    return autor === filtro.slice(2);
  };
  const autores = [...new Set([
    ...pessoasUN().map(p => p.nome),
    ...listasUN().map(l => l.autor).filter(Boolean),
    ...projetosUN().map(p => p.autor).filter(Boolean),
  ])].sort();
  if (filtro.startsWith("p:") && !autores.includes(filtro.slice(2))) filtro = "todos";   // pessoa de outra unidade

  const ativos = projetosUN().filter(p => p.status !== "arquivado" && donoOk(p.autor));
  const ordem = localStorage.getItem("rq.ordem") || "novas";   // 'novas' (padrão) ou 'antigas'
  const quando = (l) => {
    const t = Date.parse(l.criadoEm || "");                    // data de criação (aaaa-mm-dd)
    if (!isNaN(t)) return t;
    const p = parseInt(String(l.id).split("-")[0], 36);        // reserva: o id embute o timestamp
    return isNaN(p) ? 0 : p;
  };
  const ordenar = (arr) => arr.sort((a, b) => ordem === "antigas" ? quando(a) - quando(b) : quando(b) - quando(a));
  const rms = ordenar(listasUN().filter(l => (l.tipo || "RM") !== "MM" && donoOk(l.autor)));
  const mms = ordenar(listasUN().filter(l => l.tipo === "MM" && donoOk(l.autor)));
  const cartaoLista = (l) => {
    const proj = projetos.find(p => p.id === l.projetoId);
    const ult = ultimaEdicao(l);
    return `<div class="cartao ${l.status === "concluida" ? "concluida" : ""}">
      <h3><span class="etiqueta tipo">${l.tipo === "MM" ? "MM" : "RM"}</span> <a href="#/lista/${esc(l.id)}">${esc(l.titulo)}</a></h3>
      <div class="sub">${l.itens.length} ite${l.itens.length === 1 ? "m" : "ns"} · criada em ${dataBR(l.criadoEm)}${l.autor ? ` · por ${esc(l.autor)}` : ""}${proj ? ` · <span class="etiqueta">${esc(proj.nome)}</span>` : ""}${l.status === "concluida" ? ' · <span class="etiqueta ok">✔ concluída</span>' : ""}</div>
      ${ult ? `<div class="sub ult" title="Última edição salva">✎ ${esc(dataHoraBR(ult.em))} · ${esc(ult.por)}</div>` : ""}
      <div class="rodape">
        <span class="valor">${dinheiro(totalDa(l))}</span>
        <span class="espacador"></span>
        <a class="btn mini" href="#/lista/${esc(l.id)}">Abrir</a>
        <button class="btn mini sec" data-duplicar="${esc(l.id)}">Duplicar</button>
        <button class="btn mini perigo icone" data-excluir-lista="${esc(l.id)}" title="Excluir" aria-label="Excluir">🗑</button>
      </div>
    </div>`;
  };
  const cartaoProjeto = (p) => {
    const ls = listas.filter(l => l.projetoId === p.id);
    const tot = ls.reduce((s, l) => s + totalDa(l), 0);
    return `<div class="cartao projeto ${p.status === "arquivado" ? "concluida" : ""}">
      <h3><a href="#/projeto/${esc(p.id)}">${esc(p.nome)}</a></h3>
      <div class="sub">${ls.length} lista(s)${p.autor ? ` · por ${esc(p.autor)}` : ""}${p.status === "arquivado" ? ' · <span class="etiqueta ok">📦 arquivado</span>' : ""}</div>
      <div class="rodape"><span class="valor">${dinheiro(tot)}</span><span class="espacador"></span>
        <a class="btn mini sec" href="#/projeto/${esc(p.id)}">Resumo</a>
        <button class="btn mini sec" data-arquivar-projeto="${esc(p.id)}">${p.status === "arquivado" ? "Reativar" : "Arquivar"}</button>
        <button class="btn mini perigo icone" data-excluir-projeto="${esc(p.id)}" title="Excluir projeto" aria-label="Excluir projeto">🗑</button></div>
    </div>`;
  };

  app.innerHTML = `
    <div class="pagina-titulo">
      <h1>Listas de materiais</h1><span class="espacador"></span>
      <select id="filtro-ordem" title="Ordenar por data de criação">
        <option value="novas" ${ordem === "novas" ? "selected" : ""}>🕘 Mais recentes primeiro</option>
        <option value="antigas" ${ordem === "antigas" ? "selected" : ""}>🕘 Mais antigas primeiro</option>
      </select>
      <select id="filtro-dono" title="De quem mostrar os cartões">
        <option value="meu" ${filtro === "meu" ? "selected" : ""}>👤 Meus</option>
        <option value="todos" ${filtro === "todos" ? "selected" : ""}>👥 Todos</option>
        ${autores.map(a => `<option value="p:${esc(a)}" ${filtro === "p:" + a ? "selected" : ""}>${esc(a)}</option>`).join("")}
      </select>
      <button class="btn" id="btn-nova-lista">+ Requisição (RM)</button>
      <button class="btn sec" id="btn-nova-mm">+ Cadastro Mín/Máx (MM)</button>
      <button class="btn sec" id="btn-novo-projeto">+ Novo projeto</button>
    </div>
    <div id="inicio-gm"></div>
    ${avisoMigracao()}
    ${ativos.length ? `<div class="secao-titulo">Projetos em andamento</div><div class="grade-cartoes">${ativos.map(cartaoProjeto).join("")}</div>` : ""}
    <div class="secao-titulo">Requisições (RM)</div>
    ${rms.length
      ? `<div class="grade-cartoes">${rms.map(cartaoLista).join("")}</div>`
      : `<div class="vazio">Nenhuma requisição ainda.<br><br><button class="btn" id="btn-nova-lista-2">Criar a primeira requisição</button></div>`}
    <div class="secao-titulo">Cadastros de Mínimo e Máximo (MM)</div>
    ${mms.length
      ? `<div class="grade-cartoes">${mms.map(cartaoLista).join("")}</div>`
      : `<div class="vazio">Nenhum cadastro de mín/máx ainda — use o botão “+ Cadastro Mín/Máx (MM)”.</div>`}
  `;

  const criarLista = async () => {
    const v = await formNovaLista("RM");
    if (!v) return;
    const l = prepararAssinaturas(novaLista(v.titulo.trim() || "Nova requisição", v.projeto || ""));
    l.descricao = "";
    registrarLog(l, [{ k: "criada", t: "Requisição criada" }]);
    listas.push(l); salvarTudo(); nuvemSalvarLista(l);
    location.hash = "#/lista/" + l.id;
  };
  /* faixa da Gestão de Materiais: o que pede ação (sem OC, atrasados, separação) */
  const faixaGM = () => {
    const el = $("#inicio-gm"); if (!el || !GM.pronto) return;
    const idx = gmIdx(); let semOC = 0, atr = 0, emSep = 0;
    for (const m of gmMat()) { const e = gmEtapa(m, idx); if (e === "aguardando") semOC++; if (e === "separacao") emSep++; if (gmAtrasado(m, e)) atr++; }
    const seps = gmSep().filter(x => x.status === "enviada").length;
    if (!semOC && !atr && !emSep && !seps) { el.innerHTML = ""; return; }
    el.innerHTML = `<a class="faixa-gm" href="#/materiais/itens">📦 <strong>Gestão de Materiais</strong>
      ${semOC ? `<span>${semOC} sem OC</span>` : ""}${atr ? `<span class="atraso">⚠ ${atr} com previsão vencida</span>` : ""}
      ${seps ? `<span>${seps} lista(s) no almoxarifado</span>` : ""}<b>Abrir →</b></a>`;
  };
  if (GM.pronto) faixaGM(); else gmCarregar().then(faixaGM);
  $("#filtro-dono").onchange = (e) => { localStorage.setItem("rq.filtroDono", e.target.value); render(); };
  $("#filtro-ordem").onchange = (e) => { localStorage.setItem("rq.ordem", e.target.value); render(); };
  $("#btn-nova-lista").onclick = criarLista;
  const b2 = $("#btn-nova-lista-2"); if (b2) b2.onclick = criarLista;
  $("#btn-nova-mm").onclick = async () => {
    const v = await formNovaLista("MM");
    if (!v) return;
    const l = novaLista(v.titulo.trim() || "Novo cadastro MM", "", "MM");
    l.numeroFO = MM_NUMERO;
    l.descricao = "RELAÇÃO DE MÍNIMOS E MÁXIMOS PARA COMPRA";
    l.setor = "";
    prepararAssinaturas(l);
    registrarLog(l, [{ k: "criada", t: "Cadastro MM criado" }]);
    listas.push(l); salvarTudo(); nuvemSalvarLista(l);
    location.hash = "#/lista/" + l.id;
  };
  $("#btn-novo-projeto").onclick = async () => {
    const nome = await perguntar("Novo projeto", "Nome do projeto", "", { ph: "Ex.: Substituição do CCM do farelo", obrigatorio: true, erro: "Informe o nome do projeto.",
      ajuda: "Projetos agrupam RMs e as OS do Sadege (uma por disciplina) na Gestão de Materiais." });
    if (!nome) return;
    const p = { id: uid(), nome: nome.trim(), status: "andamento", autor: (usuarioAtual && usuarioAtual.nome) || emailSessao || "", unidade: UN };
    projetos.push(p); salvarTudo(); nuvemSalvarProjeto(p); render();
  };
  app.onclick = async (e) => {
    const d = e.target.dataset || {};
    if (d.excluirLista) {
      const l = listas.find(x => x.id === d.excluirLista);
      const vinc = GM.pronto ? GM.mat.filter(m => m.lista_id === l.id).length : 0;
      if (await confirmar({ titulo: `Excluir ${l.tipo === "MM" ? "o cadastro MM" : "a requisição"}?`, icone: "🗑", perigo: true, ok: "Excluir",
        texto: `<strong>${esc(l.titulo)}</strong> · ${l.itens.length} item(ns) · ${dinheiro(totalDa(l))}`
          + (l.status === "concluida" ? `<br><br>⚠ Esta requisição está <strong>CONCLUÍDA</strong>.` : "")
          + (vinc ? `<br>${vinc} item(ns) dela estão na Gestão de Materiais e continuam lá.` : "") + "<br>Não dá para desfazer." })) {
        listas = listas.filter(x => x.id !== d.excluirLista); salvarTudo(); nuvemExcluirLista(d.excluirLista); render(); toast("Lista excluída");
      }
    }
    if (d.duplicar) {
      const o = listas.find(x => x.id === d.duplicar);
      const c = JSON.parse(JSON.stringify(o));
      c.id = uid(); c.titulo = o.titulo + " (cópia)"; c.criadoEm = hoje();
      c.status = "andamento"; c.log = [];               // a cópia nasce editável e com histórico próprio
      registrarLog(c, [{ k: "criada", t: `Criada como cópia de “${curto(o.titulo, 50)}”` }]);
      listas.push(c); salvarTudo(); nuvemSalvarLista(c); render();
    }
    if (d.arquivarProjeto) {
      const p = projetos.find(x => x.id === d.arquivarProjeto);
      p.status = p.status === "arquivado" ? "andamento" : "arquivado";
      salvarTudo(); nuvemSalvarProjeto(p); render();
    }
    if (d.excluirProjeto) {
      const p = projetos.find(x => x.id === d.excluirProjeto);
      const nOS = GM.pronto ? GM.os.filter(o => o.projeto_id === p.id).length : 0;
      if (await confirmar({ titulo: "Excluir o projeto?", icone: "🗑", perigo: true, ok: "Excluir projeto",
        texto: `<strong>${esc(p.nome)}</strong><br>As listas continuam existindo, apenas sem o vínculo.`
          + (nOS ? `<br>${nOS} OS deste projeto ficam soltas na Gestão de Materiais.` : "") })) {
        if (nOS) gmAtualizar("os", GM.os.filter(o => o.projeto_id === p.id).map(o => o.id), { projeto_id: null });
        listas.forEach(l => {
          if (l.projetoId !== d.excluirProjeto) return;
          l.projetoId = "";
          registrarLog(l, [{ k: "f:projetoId", t: "Projeto vinculado", de: p.nome, para: "" }]);
          nuvemSalvarLista(l);
        });
        projetos = projetos.filter(x => x.id !== d.excluirProjeto);
        salvarTudo(); nuvemExcluirProjeto(d.excluirProjeto); render();
      }
    }
  };
}

/* ============================================================
   TELA: RESUMO DE PROJETO
   ============================================================ */
function telaProjeto(app, id) {
  const p = projetos.find(x => x.id === id);
  if (!p) { if (!aguardarNuvem(app)) location.hash = "#/"; return; }
  if (!garantirUnidade(unidadeDoRegistro(p))) return;
  const ls = listas.filter(l => l.projetoId === id);
  const total = ls.reduce((s, l) => s + totalDa(l), 0);
  const totalItens = ls.reduce((s, l) => s + l.itens.length, 0);

  // consolidado por item (soma quantidades entre listas)
  const cons = {};
  ls.forEach(l => l.itens.forEach(i => {
    const k = chavePreco(i);
    if (!cons[k]) cons[k] = { ...i, qtd: 0, valor: 0 };
    cons[k].qtd += i.qtd || 0;
    cons[k].valor += (i.qtd || 0) * (i.preco || 0);
  }));
  const consolidado = Object.values(cons).sort((a, b) => b.valor - a.valor);

  app.innerHTML = `
    <div class="pagina-titulo">
      <h1>Projeto: ${esc(p.nome)}</h1><span class="espacador"></span>
      <button class="btn sec" id="btn-renomear">Renomear</button>
      <button class="btn sec" id="btn-arquivar">${p.status === "arquivado" ? "Reativar projeto" : "📦 Arquivar projeto"}</button>
      <button class="btn" id="btn-lista-projeto">+ Lista neste projeto</button>
    </div>
    <div class="resumo-blocos">
      <div class="resumo-num"><div class="rot">Listas</div><div class="val">${ls.length}</div></div>
      <div class="resumo-num"><div class="rot">Itens (linhas)</div><div class="val">${totalItens}</div></div>
      <div class="resumo-num"><div class="rot">Valor total</div><div class="val">${dinheiro(total)}</div></div>
    </div>
    <div class="secao-titulo">Listas do projeto</div>
    <table class="app"><thead><tr><th>Lista</th><th>Status</th><th>Itens</th><th>Última edição salva</th><th class="num">Total</th><th></th></tr></thead><tbody>
      ${ls.map(l => { const u = ultimaEdicao(l); return `<tr><td>${esc(l.titulo)}</td>
        <td>${l.status === "concluida" ? '<span class="etiqueta ok">✔ concluída</span>' : '<span class="etiqueta">em andamento</span>'}</td>
        <td>${l.itens.length}</td><td style="font-size:12px;color:var(--cinza)">${u ? `${esc(dataHoraBR(u.em))} · ${esc(u.por)}` : "—"}</td>
        <td class="num">${dinheiro(totalDa(l))}</td>
        <td><a class="btn mini sec" href="#/lista/${esc(l.id)}">Abrir</a></td></tr>`; }).join("") || `<tr><td colspan="6">Nenhuma lista vinculada.</td></tr>`}
    </tbody></table>
    <div class="secao-titulo">OS e materiais (Gestão de Materiais)</div>
    <div id="proj-os">${GM.pronto ? gmResumoProjeto(p.id) : '<div class="vazio">Carregando…</div>'}</div>
    <div class="secao-titulo">Materiais consolidados (todas as listas)</div>
    <table class="app"><thead><tr><th>Código</th><th>Descrição</th><th>Un</th><th class="num">Qtd. total</th><th class="num">Valor</th></tr></thead><tbody>
      ${consolidado.map(i => `<tr><td>${esc(i.codigo)}</td><td>${esc(i.descricao)}</td><td>${esc(i.un)}</td>
        <td class="num">${fmtBR.format(i.qtd)}</td><td class="num">${dinheiro(i.valor)}</td></tr>`).join("") || `<tr><td colspan="5">Sem itens.</td></tr>`}
    </tbody></table>`;

  if (!GM.pronto) gmCarregar().then(() => { const el = $("#proj-os"); if (el) el.innerHTML = GM.semTabelas ? "" : gmResumoProjeto(p.id); });
  $("#btn-renomear").onclick = () => {
    perguntar("Renomear projeto", "Nome do projeto", p.nome, { obrigatorio: true }).then(n => {
      if (n) { p.nome = n; salvarTudo(); nuvemSalvarProjeto(p); render(); }
    });
  };
  $("#btn-arquivar").onclick = () => {
    p.status = p.status === "arquivado" ? "andamento" : "arquivado";
    salvarTudo(); nuvemSalvarProjeto(p); render();
  };
  $("#btn-lista-projeto").onclick = async () => {
    const v = await formNovaLista("RM", p.id);
    if (!v) return false;
    const l = prepararAssinaturas(novaLista(v.titulo.trim() || "Nova requisição", v.projeto || p.id));
    registrarLog(l, [{ k: "criada", t: "Requisição criada" }]);
    listas.push(l); salvarTudo(); nuvemSalvarLista(l);
    location.hash = "#/lista/" + l.id;
    return false;
  };
}

/* ============================================================
   TELA: PROJETOS ARQUIVADOS (concluídos)
   ============================================================ */
function telaArquivados(app) {
  const arquivados = projetosUN().filter(p => p.status === "arquivado");
  const cartao = (p) => {
    const ls = listas.filter(l => l.projetoId === p.id);
    const tot = ls.reduce((s, l) => s + totalDa(l), 0);
    return `<div class="cartao projeto concluida">
      <h3><a href="#/projeto/${esc(p.id)}">${esc(p.nome)}</a></h3>
      <div class="sub">${ls.length} lista(s)${p.autor ? ` · por ${esc(p.autor)}` : ""}</div>
      <div class="rodape"><span class="valor">${dinheiro(tot)}</span><span class="espacador"></span>
        <a class="btn mini sec" href="#/projeto/${esc(p.id)}">Resumo</a>
        <button class="btn mini" data-reativar="${esc(p.id)}">Reativar</button></div>
    </div>`;
  };
  app.innerHTML = `
    <div class="pagina-titulo">
      <h1>📦 Projetos arquivados</h1><span class="espacador"></span>
      <a class="btn sec" href="#/">← Voltar</a>
    </div>
    ${arquivados.length
      ? `<div class="grade-cartoes">${arquivados.map(cartao).join("")}</div>`
      : `<div class="vazio">Nenhum projeto arquivado.<br>Conclua um projeto usando o botão “Arquivar” no cartão ou no resumo dele.</div>`}`;
  app.onclick = (e) => {
    const id = e.target.dataset && e.target.dataset.reativar;
    if (!id) return;
    const p = projetos.find(x => x.id === id);
    p.status = "andamento";
    salvarTudo(); nuvemSalvarProjeto(p); render();
  };
}

/* ============================================================
   TELA: CADASTROS — assinantes e setores por unidade
   (UIS · UIS 3 · Todos). Cada unidade vê o que é dela + os comuns.
   ============================================================ */
/* formulário simples em janela — devolve os valores ou null (cancelar/Esc) */
function formulario(titulo, campos, valores = {}, validar = null) {
  return new Promise((resolve) => {
    const cx = document.createElement("div");
    cx.className = "modal no-print modal-form";
    cx.innerHTML = `<form class="modal-caixa form-cad" novalidate>
      <h2>${esc(titulo)}</h2>
      ${campos.map(c => `<div class="campo">
        <label for="fc-${c.nome}">${esc(c.rot)}</label>
        ${c.opcoes
          ? `<select id="fc-${c.nome}" name="${c.nome}">${c.opcoes.map(([v, r]) =>
              `<option value="${esc(v)}" ${String(valores[c.nome] ?? "") === v ? "selected" : ""}>${esc(r)}</option>`).join("")}</select>`
          : `<input id="fc-${c.nome}" name="${c.nome}" type="${c.tipo || "text"}" value="${esc(valores[c.nome] ?? "")}"
               placeholder="${esc(c.ph || "")}" ${c.attrs || ""}>`}
        ${c.ajuda ? `<small>${esc(c.ajuda)}</small>` : ""}
      </div>`).join("")}
      <p class="form-erro" data-erro></p>
      <div class="modal-acoes"><span class="espacador"></span>
        <button type="button" class="btn sec" data-cancelar>Cancelar</button>
        <button type="submit" class="btn">Salvar</button></div>
    </form>`;
    document.body.appendChild(cx);
    const f = cx.querySelector("form");
    const fim = (v) => { cx.remove(); resolve(v); };
    cx.querySelector("[data-cancelar]").onclick = () => fim(null);
    f.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); fim(null); } });
    f.onsubmit = (e) => {
      e.preventDefault();
      const v = {};
      campos.forEach(c => { v[c.nome] = f.elements.namedItem(c.nome).value; });
      const erro = validar ? validar(v) : "";
      if (erro) { f.querySelector("[data-erro]").textContent = erro; return; }
      fim(v);
    };
    setTimeout(() => { const el = f.querySelector("input, select"); if (el) { el.focus(); if (el.select) el.select(); } }, 0);
  });
}

function telaCadastros(app) {
  const verTodas = podeTrocarUnidade() && sessionStorage.getItem("rq.cadTodas") === "1";
  const visivel = (u) => verTodas || naUnidade(u);
  const sobrepoe = (a, b) => a === b || a === TODOS || b === TODOS;
  const selUnidade = (tipo, id, atual, sugerido) => `
    <select class="sel-un" data-un-${tipo}="${esc(id)}" title="Unidade em que aparece">
      ${OPCOES_UNIDADE.map(([v, r]) => `<option value="${v}" ${v === atual ? "selected" : ""}>${r}</option>`).join("")}
    </select>${sugerido ? ' <span class="etiqueta sugerido" title="Deduzido pela função — escolha a unidade para confirmar">sugerido</span>' : ""}`;
  const listaP = pessoas.filter(p => visivel(unidadeDaPessoa(p)))
    .sort((a, b) => (a.papel === "almoxarifado") - (b.papel === "almoxarifado"));
  const listaS = setores.filter(s => visivel(unidadeDoSetor(s)))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR", { numeric: true }));
  const ocultosP = pessoas.length - listaP.length, ocultosS = setores.length - listaS.length;

  const linhaPessoa = (p) => `<tr>
    <td>${esc(p.nome)}${usuarioAtual && p === usuarioAtual ? ' <span class="etiqueta ok">você</span>' : ""}${p.papel === "almoxarifado" ? ' <span class="etiqueta almox" title="Só acessa as listas de separação; não assina">📋 almoxarifado</span>' : ""}</td>
    <td>${esc(p.cargo)}</td><td>${esc(p.email || "—")}</td>
    <td style="white-space:nowrap">${selUnidade("pessoa", p.id, unidadeDaPessoa(p), !valorUnidade(p.unidade))}</td>
    <td style="white-space:nowrap">
      <button class="btn mini sec" data-editar-pessoa="${esc(p.id)}">Editar</button>
      <button class="btn mini perigo" data-excluir-pessoa="${esc(p.id)}">Excluir</button>
    </td></tr>`;
  const linhaSetor = (s) => `<tr>
    <td>${esc(s.nome)}${setorValido(s.nome) ? "" : ' <span class="etiqueta" title="Edite para um código só com números">não numérico</span>'}</td>
    <td style="white-space:nowrap">${selUnidade("setor", s.id, unidadeDoSetor(s), !valorUnidade(s.unidade))}</td>
    <td style="white-space:nowrap">
      <button class="btn mini sec" data-editar-setor="${esc(s.id)}">Editar</button>
      <button class="btn mini perigo" data-excluir-setor="${esc(s.id)}">Excluir</button>
    </td></tr>`;

  app.innerHTML = `
    <div class="pagina-titulo">
      <h1>Cadastros</h1><span class="etiqueta tipo">${esc(UNI().nome)}</span><span class="espacador"></span>
      ${podeTrocarUnidade() ? `<select id="cad-ver" title="Quais cadastros listar">
          <option value="">Mostrar: ${esc(UNI().nome)} + comuns</option>
          <option value="todas" ${verTodas ? "selected" : ""}>Mostrar: todas as unidades</option>
        </select>` : ""}
      <a class="btn sec" href="#/">← Voltar</a>
    </div>
    ${avisoMigracao()}
    <div class="dica cad-intro">Cada unidade enxerga só as pessoas e os setores dela e os marcados como <strong>Todos</strong>
      (comuns às duas — ex.: gerentes e coordenadores). O banco de itens e a memória de preços são compartilhados.
      ${podeTrocarUnidade() && !verTodas && (ocultosP || ocultosS)
        ? `<br>${[ocultosP ? `${ocultosP} pessoa(s)` : "", ocultosS ? `${ocultosS} setor(es)` : ""].filter(Boolean).join(" e ")} da outra unidade não aparecem nesta lista.` : ""}</div>

    <div class="secao-titulo">Pessoas (assinantes e almoxarifado)</div>
    <p class="cad-nota">O <strong>e-mail</strong> vincula a pessoa ao login: quem entrar com ele vira o solicitante das novas listas e trabalha
      na unidade dela (com <strong>Todos</strong>, pode alternar entre UIS e UIS 3 no topo da tela).
      A alçada de assinaturas é montada pela <strong>função</strong>: Supervisor de Manutenção, Gerente Industrial e Gerente de Operações de cada unidade.</p>
    <table class="app cad"><thead><tr><th>Nome</th><th>Função</th><th>E-mail (login)</th><th>Unidade</th><th></th></tr></thead>
      <tbody>${listaP.map(linhaPessoa).join("") || `<tr><td colspan="5">Nenhuma pessoa cadastrada para esta unidade.</td></tr>`}</tbody></table>
    <button class="btn" id="btn-add-pessoa" style="margin-top:10px">+ Adicionar pessoa</button>

    <div class="secao-titulo">Setores (código numérico)</div>
    <p class="cad-nota">Aparecem como sugestão no campo <strong>SETOR</strong> da RM e do MM (que aceita apenas números).
      Novas requisições começam com o setor em branco.</p>
    <table class="app cad" style="max-width:560px"><thead><tr><th>Setor</th><th>Unidade</th><th></th></tr></thead>
      <tbody>${listaS.map(linhaSetor).join("") || `<tr><td colspan="3">Nenhum setor cadastrado para esta unidade.</td></tr>`}</tbody></table>
    <button class="btn" id="btn-add-setor" style="margin-top:10px">+ Adicionar setor</button>`;

  const formPessoa = (p) => formulario(p ? "Editar assinante" : "Novo assinante", [
      { nome: "nome", rot: "Nome completo" },
      { nome: "cargo", rot: "Função / cargo", ph: `Ex.: Supervisor de Manutenção - ${UNI().sigla}` },
      { nome: "email", rot: "E-mail de login (opcional)", tipo: "email",
        ajuda: "Quem entrar com este e-mail vira o solicitante das novas listas." },
      { nome: "unidade", rot: "Unidade", opcoes: OPCOES_UNIDADE,
        ajuda: "UIS e UIS 3 não se enxergam. “Todos” aparece nas duas (gerentes, coordenadores…)." },
      { nome: "papel", rot: "Papel no app", opcoes: [["assinante", "Assinante / equipe (padrão)"], ["almoxarifado", "Almoxarifado — só listas de separação"]],
        ajuda: "Almoxarifado entra pelo celular, vê e marca as listas de separação e não aparece como assinante." },
    ], p ? { nome: p.nome, cargo: p.cargo, email: p.email, unidade: unidadeDaPessoa(p), papel: p.papel || "assinante" } : { unidade: UN, papel: "assinante" },
    (v) => {
      if (!v.nome.trim()) return "Informe o nome.";
      const em = norm(v.email.trim());
      if (em && pessoas.some(x => x !== p && x.email && norm(x.email) === em)) return "Este e-mail já está vinculado a outra pessoa.";
      return "";
    }).then(v => v && { nome: v.nome.trim(), cargo: v.cargo.trim(), email: v.email.trim().toLowerCase(), unidade: v.unidade, papel: v.papel });

  const formSetor = (s) => formulario(s ? "Editar setor" : "Novo setor", [
      { nome: "nome", rot: "Código do setor (somente números)", ph: "Ex.: 9313", attrs: 'inputmode="numeric" autocomplete="off"' },
      { nome: "unidade", rot: "Unidade", opcoes: OPCOES_UNIDADE },
    ], s ? { nome: s.nome, unidade: unidadeDoSetor(s) } : { unidade: UN },
    (v) => {
      const c = v.nome.replace(/\s/g, "");
      if (!setorValido(c)) return "Use apenas números no código do setor.";
      const dup = setores.find(x => x !== s && x.nome === c && sobrepoe(unidadeDoSetor(x), v.unidade));
      if (dup) return `O setor ${c} já está cadastrado (${nomeUnidade(unidadeDoSetor(dup))}).`;
      return "";
    }).then(v => v && { nome: v.nome.replace(/\s/g, ""), unidade: v.unidade });

  const avisarSeSaiu = (rotulo, u) => { if (!verTodas && !naUnidade(u)) toast(`${rotulo} agora aparece só na ${nomeUnidade(u)}.`); };

  $("#btn-add-pessoa").onclick = async () => {
    const d = await formPessoa(); if (!d) return;
    const p = { id: uid(), ...d };
    pessoas.push(p); salvarCadastros(); nuvemSalvarPessoa(p); deduzirUsuario(); avisarSeSaiu(p.nome, p.unidade); render();
  };
  $("#btn-add-setor").onclick = async () => {
    const d = await formSetor(); if (!d) return;
    const s = { id: uid(), ...d };
    setores.push(s); salvarCadastros(); nuvemSalvarSetor(s); avisarSeSaiu("O setor " + s.nome, s.unidade); render();
  };
  app.onclick = async (e) => {
    const d = e.target.dataset || {};
    if (d.editarPessoa) {
      const p = pessoas.find(x => x.id === d.editarPessoa);
      const novo = await formPessoa(p); if (!novo) return;
      const antigo = p.nome;
      Object.assign(p, novo); salvarCadastros(); nuvemSalvarPessoa(p); deduzirUsuario(); avisarSeSaiu(p.nome, p.unidade);
      if (antigo !== p.nome) {                          // nome novo vale também nas listas em aberto
        let n = 0;
        for (const l of listas) {
          if (l.status === "concluida") continue;           // documento emitido fica como está
          const antes = JSON.stringify([l.solicitante, l.autor, l.assinaturas]);
          if (l.solicitante === antigo) l.solicitante = p.nome;
          if (l.autor === antigo) l.autor = p.nome;
          l.assinaturas = (l.assinaturas || []).map(a => a === antigo ? p.nome : a);
          if (JSON.stringify([l.solicitante, l.autor, l.assinaturas]) !== antes) {
            registrarLog(l, [{ k: "f:renomeado", t: "Nome atualizado pelo cadastro", de: antigo, para: p.nome }]);
            nuvemSalvarLista(l); n++;
          }
        }
        projetos.forEach(pr => { if (pr.autor === antigo) { pr.autor = p.nome; nuvemSalvarProjeto(pr); } });
        salvarTudo();
        if (n) toast(`Nome atualizado em ${n} lista(s) em aberto.`);
      }
      render();
    }
    if (d.excluirPessoa) {
      const p = pessoas.find(x => x.id === d.excluirPessoa);
      if (await confirmar({ titulo: "Excluir do cadastro?", icone: "🗑", perigo: true, ok: "Excluir",
        texto: `<strong>${esc(p.nome)}</strong> — ${esc(p.cargo || "")}${p.email ? `<br>Quem entra com ${esc(p.email)} perde o acesso ao app.` : ""}` })) {
        pessoas = pessoas.filter(x => x.id !== d.excluirPessoa);
        salvarCadastros(); nuvemExcluirPessoa(d.excluirPessoa); deduzirUsuario(); render();
      }
    }
    if (d.editarSetor) {
      const s = setores.find(x => x.id === d.editarSetor);
      const novo = await formSetor(s); if (!novo) return;
      Object.assign(s, novo); salvarCadastros(); nuvemSalvarSetor(s); avisarSeSaiu("O setor " + s.nome, s.unidade); render();
    }
    if (d.excluirSetor) {
      const s = setores.find(x => x.id === d.excluirSetor);
      if (await confirmar({ titulo: `Excluir o setor ${s.nome}?`, icone: "🗑", perigo: true, ok: "Excluir" })) {
        setores = setores.filter(x => x.id !== d.excluirSetor);
        salvarCadastros(); nuvemExcluirSetor(d.excluirSetor); render();
      }
    }
  };
  /* troca rápida de unidade direto na tabela */
  app.onchange = (e) => {
    const el = e.target;
    if (el.id === "cad-ver") { sessionStorage.setItem("rq.cadTodas", el.value ? "1" : ""); render(); return; }
    if (el.dataset.unPessoa) {
      const p = pessoas.find(x => x.id === el.dataset.unPessoa); if (!p) return;
      p.unidade = el.value; salvarCadastros(); nuvemSalvarPessoa(p); deduzirUsuario(); avisarSeSaiu(p.nome, p.unidade); render();
    }
    if (el.dataset.unSetor) {
      const s = setores.find(x => x.id === el.dataset.unSetor); if (!s) return;
      const dup = setores.find(x => x !== s && x.nome === s.nome && sobrepoe(unidadeDoSetor(x), el.value));
      if (dup) { toast(`O setor ${s.nome} já existe em ${nomeUnidade(unidadeDoSetor(dup))}.`); render(); return; }
      s.unidade = el.value; salvarCadastros(); nuvemSalvarSetor(s); avisarSeSaiu("O setor " + s.nome, s.unidade); render();
    }
  };
}

/* ============================================================
   TELA: EDITOR — painel lateral recolhível (itens · anotações ·
   histórico) e folha A4 ao vivo numa "mesa" de tela cheia
   ============================================================ */
function telaEditor(app, id) {
  const L = listas.find(x => x.id === id);
  if (!L) { if (!aguardarNuvem(app)) location.hash = "#/"; return; }
  if (!garantirUnidade(unidadeDoRegistro(L))) return;   // lista de outra unidade
  const UL = unidadeDoRegistro(L);
  if (!L.tipo) L.tipo = "RM";
  if (!L.status) L.status = "andamento";
  const ehMM = L.tipo === "MM";
  const prefixoPdf = (ehMM ? "MM_" : "RM_") + UNIDADES[UL].sigla + "_";
  const nomePdf = () => prefixoPdf + (L.titulo || "documento").replace(/[\\/:*?"<>|]/g, "-");

  const travada = () => L.status === "concluida";
  const abaInicial = sessionStorage.getItem("rq.latAba") || "itens";
  const setoresNum = setoresUN(UL).filter(s => setorValido(s.nome))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  /* assinantes possíveis: pessoas da unidade + comuns (e quem já estiver na folha) */
  const opcoesAss = (sel) => {
    const nomes = pessoasUN(UL).map(p => p.nome);
    const fora = sel && !noCadastro(sel)
      ? `<option value="${esc(sel)}" selected disabled>⚠ ${esc(sel)} — fora do cadastro</option>` : "";
    return fora + [...new Set(nomes.concat(sel && noCadastro(sel) ? [sel] : []))]
      .map(n => `<option value="${esc(n)}" ${n === sel ? "selected" : ""}>${esc(n)}</option>`).join("");
  };

  app.innerHTML = `
  <div class="ed">
    <div class="ed-barra no-print">
      <span class="ed-tipo" title="${ehMM ? "Relação de Mínimos e Máximos para Compra" : "Requisição de Material"}">${ehMM ? "MM" : "RM"}</span>
      <input type="text" id="ed-titulo" class="ed-titulo" value="${esc(L.titulo)}" placeholder="Título da lista">
      <select id="ed-projeto" title="Projeto vinculado">
        <option value="">— sem projeto —</option>
        ${projetosUN(UL).filter(p => p.status !== "arquivado" || p.id === L.projetoId)
          .map(p => `<option value="${esc(p.id)}" ${p.id === L.projetoId ? "selected" : ""}>${esc(p.nome)}${p.status === "arquivado" ? " (arquivado)" : ""}</option>`).join("")}
      </select>
      <label class="ed-rot" title="Quem criou/responde por esta lista">Autor
        <select id="ed-autor">
          <option value="" ${!L.autor ? "selected" : ""}>— não definido —</option>
          ${[...new Set([...pessoasUN(UL).map(p => p.nome), ...(L.autor ? [L.autor] : [])])].sort()
            .map(n => `<option ${n === L.autor ? "selected" : ""}>${esc(n)}</option>`).join("")}
        </select>
      </label>
      <span class="ed-sep"></span>
      <button class="btn sec ed-status" id="btn-status"></button>
      ${ehMM ? "" : `<button class="btn sec ed-vinc" id="btn-vincular" title="Mandar itens desta RM concluída para uma OS do Sadege (Gestão de Materiais)">🔗 Vincular à OS</button>`}
      <button class="ed-salvo" id="ed-salvo" data-estado="salvo" title="Clique para salvar agora"></button>
      <span class="espacador"></span>
      <button class="btn sec" id="btn-resumo-mg" title="Excel sem formatação para copiar e colar: Código, Descrição, 4 colunas em branco, Quantidade, Unidade, Valor unitário, Valor total">📊 Resumo MG</button>
      <button class="btn sec" id="btn-imprimir" title="Abre a impressão do navegador">🖨️ Imprimir</button>
      <button class="btn" id="btn-pdf" title="Baixa o PDF direto (A4 paisagem), sem abrir a impressão">⬇ PDF</button>
      <a class="btn sec" href="#/">← Voltar</a>
    </div>

    <div class="ed-trava no-print" id="ed-trava" hidden>
      <span>🔒 <strong>Requisição concluída</strong> — somente leitura. Impressão e PDF continuam disponíveis.</span>
      <button class="btn mini" id="btn-reabrir">Reabrir para edição</button>
    </div>

    <div class="ed-corpo ${localStorage.getItem("rq.latFechada") === "1" ? "lat-fechada" : ""}">
      <aside class="ed-lateral no-print">
        <div class="lat-abas">
          <button class="lat-aba" data-aba="itens" title="Adicionar material (Ctrl+K)"><span class="ico">🔎</span><span class="rot">Itens</span></button>
          <button class="lat-aba" data-aba="notas" title="Anotações internas"><span class="ico">📝</span><span class="rot">Anotações</span></button>
          <button class="lat-aba" data-aba="hist" title="Histórico de edições salvas"><span class="ico">🕘</span><span class="rot">Histórico</span></button>
          <span class="espacador"></span>
          <button class="lat-recolher" id="lat-recolher" title="Recolher / expandir o painel">«</button>
        </div>
        <div class="lat-conteudo">
          <section class="lat-painel lat-itens" data-painel="itens">
            <div class="busca-linha">
              <input type="text" id="busca" placeholder="Descrição ou código… (Enter adiciona o 1º)" autocomplete="off">
            </div>
            <div class="busca-opcoes">
              <label><input type="checkbox" id="opt-espacos" checked> Ignorar espaços/traços</label>
              <label class="chk-outros" title="Procura só nos itens que não são de manutenção (comida, roupa, agro, loja…), direto na nuvem"><input type="checkbox" id="opt-outros"> Buscar outros</label>
              <button class="btn sec mini" id="btn-avulso">+ Item avulso (S/ CÓD.)</button>
            </div>
            <div class="busca-modo" id="busca-modo" hidden></div>
            <p class="trava-dica">🔒 Inclusão de itens bloqueada: a requisição está concluída.</p>
            <div id="resultados"></div>
            <div class="contagem" id="contagem"></div>
            <div class="dica">Vários termos = todos precisam aparecer, em qualquer ordem.
              Ex.: <em>cabo pp 4x2,5</em>. Acentos são ignorados. Amarelo = já usado antes; preço em verde vem do histórico.
              Não achou? Marque <strong>Buscar outros</strong> (itens fora da manutenção, só na nuvem).
              <strong>Ctrl+K</strong> volta para a busca de qualquer ponto.</div>
          </section>
          <section class="lat-painel" data-painel="notas" hidden>
            <p class="lat-sub">Anotações internas desta lista — não saem no PDF.</p>
            <textarea id="ed-anotacoes" class="lat-notas" placeholder="Anotações gerais desta lista…">${esc(L.anotacoes || "")}</textarea>
          </section>
          <section class="lat-painel" data-painel="hist" hidden>
            <p class="lat-sub">Somente alterações efetivamente salvas. Edições seguidas da mesma pessoa são agrupadas.</p>
            <div id="historico"></div>
          </section>
        </div>
      </aside>

      <section class="ed-direita">
        <div class="mesa-barra no-print">
          <span class="ed-ultima" id="ed-ultima"></span>
          <span class="espacador"></span>
          <span class="zoom-ctl">
            <button class="btn mini sec" id="zoom-menos" title="Diminuir (Ctrl + roda do mouse)">−</button>
            <span id="zoom-val">100%</span>
            <button class="btn mini sec" id="zoom-mais" title="Aumentar (Ctrl + roda do mouse)">+</button>
            <button class="btn mini sec zoom-modo" data-modo="largura" title="Ajustar à largura disponível">↔ Largura</button>
            <button class="btn mini sec zoom-modo" data-modo="pagina" title="Mostrar a página inteira">▢ Página</button>
          </span>
          <span class="total-vivo" id="total-vivo"></span>
        </div>
        <div class="ed-mesa" id="ed-mesa"><div class="folha" id="folha"></div></div>
      </section>
    </div>
  </div>
  <datalist id="dl-setores">${setoresNum.map(s => `<option value="${esc(s.nome)}"></option>`).join("")}</datalist>
  <datalist id="dl-pessoas">${pessoasUN(UL).map(p => `<option value="${esc(p.nome)}"></option>`).join("")}</datalist>`;

  const chip = $("#ed-salvo"), elUltima = $("#ed-ultima"), elHist = $("#historico");
  const corpo = $(".ed-corpo");

  /* ---------- salvamento + log de edição ----------
     Rascunho local a cada alteração; "salvo" de verdade 0,9 s depois de parar
     de digitar, quando a nuvem confirma (ou na hora, no modo local).
     Só nesse momento a alteração entra no histórico. */
  let base = null;                   // última versão confirmada (referência do diff)
  let tNuvem = null;
  let fila = Promise.resolve();      // salvamentos em série: evita entradas duplicadas
  const fotografar = () => { const c = JSON.parse(JSON.stringify(L)); delete c.log; return c; };
  const TXT_SALVO = { salvo: "✓ Salvo", pendente: "● Não salvo", salvando: "Salvando…", erro: "⚠ Falha ao salvar — tentar de novo" };
  function marcar(estado) { chip.textContent = TXT_SALVO[estado]; chip.dataset.estado = estado; }
  function salvar() {
    if (sb) marcarPendente(L.id, true);   // desde já "por enviar": se a aba fechar agora, sobe na próxima vez
    salvarTudo();                    // rascunho local imediato
    marcar("pendente");
    clearTimeout(tNuvem);
    tNuvem = setTimeout(commit, 900);
  }
  function commit() {
    clearTimeout(tNuvem); tNuvem = null;
    fila = fila.then(efetivar, efetivar);
    return fila;
  }
  async function efetivar() {
    if (!base) return true;
    const mud = diffLista(base, L);
    const faltaSubir = !!sb && pendentes.has(L.id);    // algo meu ainda não está na nuvem
    if (!mud.length && !faltaSubir) { salvarTudo(); if (!tNuvem) marcar("salvo"); return true; }
    marcar("salvando");
    const snap = fotografar();
    const desfazer = mud.length ? registrarLog(L, mud) : () => {};
    salvarTudo();
    const ok = await nuvemSalvarLista(L);
    if (!base) return true;                            // a lista saiu de cena enquanto gravava
    if (!ok) { desfazer(); salvarTudo(); marcar("erro"); return false; }
    if (ok === "mesclado") {                           // alguém gravou antes: as duas edições foram juntadas
      redesenharTudo(); base = daNuvem(); salvarTudo();
      toast("Outra pessoa também editou esta requisição — juntei as duas alterações.");
    } else base = snap;
    if (!tNuvem) marcar(diffLista(base, L).length ? "pendente" : "salvo");
    mostrarUltima(); desenharHistorico();
    return true;
  }
  /* a lista como está na nuvem (referência do que é alteração minha) */
  function daNuvem() {
    const v = vistoNuvem.get(L.id);
    if (!v) return fotografar();
    const c = JSON.parse(v.json); delete c.log;
    /* assinaturas automáticas são calculadas por esta tela (não são edição de ninguém): não contam como diferença */
    if (!L.assinaturasManuais && !c.assinaturasManuais) c.assinaturas = (L.assinaturas || []).slice();
    return c;
  }
  function redesenharTudo() {
    const foco = document.activeElement;
    for (const [sel, campo] of [["#ed-titulo", "titulo"], ["#ed-projeto", "projetoId"], ["#ed-autor", "autor"], ["#ed-anotacoes", "anotacoes"]]) {
      const el = $(sel); if (el && el !== foco && el.value !== (L[campo] || "")) el.value = L[campo] || "";
    }
    desenharFolha(); aplicarTrava(); mostrarUltima(); desenharHistorico();
  }
  /* chegou da nuvem uma versão mais nova desta lista (o conteúdo de L já foi atualizado no lugar) */
  let regravacoes = [];                // trava de segurança: regravações automáticas recentes
  function recarregar() {
    if (!base) return;
    redesenharTudo();
    base = daNuvem();
    const minhas = diffLista(base, L).length > 0;
    if (minhas && !tNuvem) {
      /* tenho alterações que ainda não subiram: regrava — mas nunca em ciranda com outro navegador */
      regravacoes = regravacoes.filter(t => Date.now() - t < 60000);
      if (regravacoes.length < 3) { regravacoes.push(Date.now()); salvar(); } else marcar("pendente");
    } else if (!tNuvem) marcar("salvo");
    const u = ultimaEdicao(L);
    toast(u && u.por && u.por !== quemSou() ? `Atualizada agora — alteração de ${u.por}` : "Requisição atualizada com a versão mais recente.");
  }
  function mostrarUltima() {
    const u = ultimaEdicao(L);
    elUltima.innerHTML = u
      ? `Última edição salva: <strong>${esc(dataHoraBR(u.em))}</strong> · ${esc(u.por)}`
      : "Nenhuma edição salva registrada ainda";
  }
  function desenharHistorico() {
    const log = (L.log || []).slice().reverse();
    if (!log.length) { elHist.innerHTML = `<div class="dica">Ainda não há edições salvas nesta lista.</div>`; return; }
    elHist.innerHTML = log.map(e => {
      const ms = e.mudancas || [];
      const li = (arr) => arr.map(m => `<li>${htmlMudanca(m)}</li>`).join("");
      return `<div class="lg-entrada${e.marco ? " marco" : ""}">
        <div class="lg-cab"><strong>${esc(faixaLog(e))}</strong><span>${esc(e.por)}</span></div>
        ${ms.length ? `<ul>${li(ms.slice(0, 8))}</ul>` : ""}
        ${ms.length > 8 ? `<details><summary>+ ${ms.length - 8} alteração(ões)</summary><ul>${li(ms.slice(8))}</ul></details>` : ""}
      </div>`;
    }).join("");
  }

  /* ---------- status e bloqueio de requisição concluída ---------- */
  function aplicarTrava() {
    const t = travada();
    $(".ed").classList.toggle("travada", t);
    $("#ed-trava").hidden = !t;
    const bv = $("#btn-vincular");
    if (bv) {
      bv.classList.toggle("pronto", t);
      const n = GM.pronto ? GM.mat.filter(m => m.lista_id === L.id).length : 0;
      bv.textContent = n ? `🔗 OS (${n}/${L.itens.length})` : "🔗 Vincular à OS";
      bv.title = t ? "Mandar itens desta RM para uma OS do Sadege (Gestão de Materiais)" : "Conclua a RM para vincular os itens a uma OS";
    }
    const bs = $("#btn-status");
    bs.textContent = t ? "✅ Concluída" : "🕓 Em andamento";
    bs.classList.toggle("concluida", t);
    bs.title = t ? "Concluída — clique para reabrir" : "Clique para marcar como concluída";
    ["#ed-titulo", "#ed-projeto", "#ed-autor", "#ed-anotacoes", "#busca", "#opt-espacos", "#opt-outros", "#btn-avulso"]
      .forEach(s => { const el = $(s); if (el) el.disabled = t; });
    if (t) { $("#busca").value = ""; resultadosAtuais = []; desenharResultados(); }
  }
  async function trocarStatus() {
    if (travada()) {
      const vinc = GM.pronto ? GM.mat.filter(m => m.lista_id === L.id).length : 0;
      if (!await confirmar({ titulo: "Reabrir a requisição?", icone: "🔓", ok: "Reabrir para edição",
        texto: "Ela está <strong>concluída</strong> e travada. Para editar, o status volta para “Em andamento”; a reabertura fica no histórico."
          + (vinc ? `<br><br>⚠ ${vinc} item(ns) desta RM estão na Gestão de Materiais. O que você mudar aqui <strong>não</strong> muda lá.` : "") })) return;
      L.status = "andamento";
    } else {
      if (!await confirmar({ titulo: "Concluir a requisição?", icone: "✅", ok: "Concluir",
        texto: `<strong>${esc(L.titulo)}</strong> · ${L.itens.length} item(ns) · ${dinheiro(totalDa(L))}<br>Ela fica travada para edição (PDF e impressão continuam liberados). Depois você pode vincular os itens a uma OS.` })) return;
      L.status = "concluida";
    }
    desenharFolha();
    aplicarTrava();
    salvarTudo();
    await commit();
    toast(travada() ? "✅ Requisição concluída e bloqueada para edição" : "🔓 Requisição reaberta para edição");
  }
  let ultimoAviso = 0;
  function avisarTrava() {
    if (Date.now() - ultimoAviso < 2500) return;
    ultimoAviso = Date.now();
    toast("🔒 Requisição concluída — use “Reabrir para edição” para alterar.");
  }

  /* ---------- barra do editor ---------- */
  $("#ed-titulo").oninput = (e) => { L.titulo = e.target.value; salvar(); };
  $("#ed-projeto").onchange = (e) => { L.projetoId = e.target.value; salvar(); };
  $("#ed-anotacoes").oninput = (e) => { L.anotacoes = e.target.value; salvar(); };
  $("#ed-autor").onchange = (e) => {
    const antigo = L.autor;
    L.autor = e.target.value;
    /* se o solicitante ainda era o autor anterior, acompanha a troca */
    if (L.autor && (!L.solicitante || L.solicitante === antigo)) L.solicitante = L.autor;
    if (!L.assinaturasManuais) desenharFolha();
    salvar();
  };
  $("#btn-status").onclick = trocarStatus;
  const btVinc = $("#btn-vincular");
  if (btVinc) btVinc.onclick = async () => {
    if (!travada()) {
      if (await confirmar({ titulo: "Concluir antes de vincular", icone: "🔗", ok: "Concluir agora",
        texto: "Só itens de RM <strong>concluída</strong> vão para a Gestão de Materiais (assim a lista não muda depois de vinculada). Concluir esta RM agora?" })) {
        L.status = "concluida"; desenharFolha(); aplicarTrava(); salvarTudo(); await commit();
        toast("✅ Requisição concluída");
      } else return;
    }
    await commit();
    gmVincularRM(L.id);
  };
  if (!GM.pronto) gmCarregar().then(() => { if (editorAtivo && editorAtivo.id === L.id) aplicarTrava(); });
  $("#btn-reabrir").onclick = trocarStatus;
  chip.onclick = () => { salvarTudo(); commit(); };

  /* ---------- painel lateral: abas e recolher ---------- */
  function selecionarAba(aba) {
    $$(".lat-aba").forEach(b => b.classList.toggle("ativa", b.dataset.aba === aba));
    $$(".lat-painel").forEach(p => { p.hidden = p.dataset.painel !== aba; });
    sessionStorage.setItem("rq.latAba", aba);
  }
  function abrirAba(aba) {
    corpo.classList.remove("lat-fechada");
    localStorage.setItem("rq.latFechada", "");
    selecionarAba(aba);
  }
  $$(".lat-aba").forEach(b => b.onclick = () => abrirAba(b.dataset.aba));
  $("#lat-recolher").onclick = () => {
    const fechar = !corpo.classList.contains("lat-fechada");
    corpo.classList.toggle("lat-fechada", fechar);
    localStorage.setItem("rq.latFechada", fechar ? "1" : "");
  };
  function focarBusca() {
    abrirAba("itens");
    const c = $("#busca");
    if (c && !c.disabled) { c.focus(); c.select(); }
  }
  /* imprime um CLONE textual do documento: datas viram texto (sem ícone de calendário
     cortando o ano), campos perdem o fundo amarelo e o PDF salvo é vetorial e pesquisável */
  function imprimirDocumento() {
    const clone = clonarFolhaParaPdf(false);
    const area = document.createElement("div");
    area.className = "area-impressao";
    area.appendChild(clone);
    document.body.appendChild(area);
    document.body.classList.add("imprimindo-clone");
    const tituloAntes = document.title;
    document.title = nomePdf();               // vira o nome do arquivo PDF
    let limpo = false;
    const limpar = () => {
      if (limpo) return; limpo = true;
      area.remove();
      document.body.classList.remove("imprimindo-clone");
      document.title = tituloAntes;
      window.onafterprint = null;
    };
    window.onafterprint = limpar;
    window.print();
    setTimeout(limpar, 3000);                 // reserva, caso o navegador não dispare o evento
  }
  $("#btn-imprimir").onclick = imprimirDocumento;

  /* ---------- PDF: clona a folha trocando campos por texto e pagina manualmente ---------- */
  function clonarFolhaParaPdf(paraCaptura = true) {
    const orig = $(".folha");
    const clone = orig.cloneNode(true);
    if (paraCaptura) {
      clone.classList.add("captura");        // bordas finas na captura (o traço engrossava na foto)
      clone.style.width = "1123px";
    }
    clone.style.zoom = "1";
    clone.style.boxShadow = "none";
    clone.style.padding = "0";
    clone.style.margin = "0";
    const eOrig = [...orig.querySelectorAll("input, textarea, select")];
    const eClone = [...clone.querySelectorAll("input, textarea, select")];
    eClone.forEach((el, i) => {
      const o = eOrig[i];
      let txt = "";
      if (o.tagName === "SELECT") txt = o.value ? (o.selectedOptions[0] ? o.selectedOptions[0].textContent : "") : "";
      else if (o.type === "date") txt = dataBR(o.value);
      else txt = o.value;
      const span = document.createElement("span");
      span.textContent = txt;
      const st = getComputedStyle(o);
      if (o.closest("td.d-preco")) {          // R$ à esquerda, número à direita
        span.style.cssText = "display:inline-block;width:calc(100% - 18px);float:right;text-align:right";
      } else if (o.closest(".campo-linha")) { // rótulo e valor na MESMA linha (DATA:, NR O.S., SOLICITANTE:)
        span.style.cssText = `display:inline;white-space:nowrap;font-weight:${st.fontWeight}`;
      } else {
        span.style.cssText = `display:block;white-space:pre-wrap;overflow:hidden;text-align:${st.textAlign};font-weight:${st.fontWeight};min-height:11px`;
      }
      el.replaceWith(span);
    });
    clone.querySelectorAll(".no-print, td.d-remover, .d-ass-troca").forEach(el => el.remove());
    if (!ehMM) clone.querySelectorAll("tr.d-vazia").forEach(el => el.remove());   // RM sem vazias; MM é formulário de página cheia
    clone.querySelectorAll("col.cX").forEach(c => { c.style.width = "0"; });
    return clone;
  }

  /* PDF: download direto, vetorial, A4 paisagem (se falhar, oferece a impressão) */
  $("#btn-pdf").onclick = async () => {
    const bt = $("#btn-pdf");
    if (bt.disabled) return;
    const rotulo = bt.textContent;
    bt.disabled = true; bt.textContent = "Gerando PDF…";
    try {
      const bytes = await gerarPdfVetorial(clonarFolhaParaPdf(false), {
        titulo: nomePdf(), autor: L.autor || L.solicitante || "", criador: "Recursos Materiais " + UNIDADES[UL].nome,
      });
      baixarBlob(new Blob([bytes], { type: "application/pdf" }), nomePdf() + ".pdf");
      toast("📄 PDF baixado — A4 paisagem");
    } catch (e) {
      console.warn("pdf:", e);
      if (await confirmar({ titulo: "PDF direto indisponível", icone: "📄", ok: "Abrir a impressão",
        texto: `Não foi possível gerar o PDF direto (${esc(e.message)}). Abrir a impressão do navegador para salvar como PDF?` })) imprimirDocumento();
    } finally {
      bt.disabled = false; bt.textContent = rotulo;
    }
  };
  $("#btn-resumo-mg").onclick = () => {
    if (!L.itens.length) { toast("A lista ainda não tem itens."); return; }
    baixarResumoMG(L);
  };

  /* ---------- zoom da folha: ajustar à largura (padrão), página inteira ou manual ---------- */
  const mesa = $("#ed-mesa"), folhaEl = $("#folha");
  const LARGURA_A4 = 1123;            // 297 mm em px CSS
  let modoZoom = localStorage.getItem("rq.zoomModo") || "largura";
  function aplicarZoom() {
    if (!folhaEl.isConnected) return;
    const est = getComputedStyle(mesa);
    const padH = parseFloat(est.paddingLeft) + parseFloat(est.paddingRight);
    const padV = parseFloat(est.paddingTop) + parseFloat(est.paddingBottom);
    const fitLarg = (mesa.clientWidth - padH) / LARGURA_A4;
    let z;
    if (modoZoom === "pagina" && window.innerWidth > 900) {
      folhaEl.style.zoom = 1;
      const h = folhaEl.offsetHeight || 794;
      z = Math.min(fitLarg, (mesa.clientHeight - padV) / h);
    } else if (modoZoom === "largura" || modoZoom === "pagina") {
      z = fitLarg;
    } else {
      z = parseFloat(modoZoom) || 1;
    }
    z = Math.min(2.5, Math.max(0.3, z));
    folhaEl.style.zoom = z.toFixed(3);
    $("#zoom-val").textContent = Math.round(z * 100) + "%";
    $$(".zoom-modo").forEach(b => b.classList.toggle("ativo", b.dataset.modo === modoZoom));
  }
  function mudarZoom(delta) {
    const atual = parseFloat(folhaEl.style.zoom) || 1;
    modoZoom = String(Math.round(Math.min(2.5, Math.max(0.3, atual + delta)) * 100) / 100);
    localStorage.setItem("rq.zoomModo", modoZoom);
    aplicarZoom();
  }
  $("#zoom-menos").onclick = () => mudarZoom(-0.1);
  $("#zoom-mais").onclick = () => mudarZoom(+0.1);
  $$(".zoom-modo").forEach(b => b.onclick = () => {
    modoZoom = b.dataset.modo; localStorage.setItem("rq.zoomModo", modoZoom); aplicarZoom();
  });
  /* Ctrl + roda do mouse (ou pinça no touchpad) aproxima/afasta só a folha */
  mesa.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    mudarZoom(Math.max(-0.1, Math.min(0.1, -e.deltaY * 0.0015)));
  }, { passive: false });
  /* reajusta quando a janela muda ou o painel lateral abre/fecha */
  roZoom = new ResizeObserver(() => aplicarZoom());
  roZoom.observe(mesa);
  /* clique num campo travado: lembra como reabrir */
  mesa.addEventListener("mousedown", (e) => {
    if (travada() && e.target.closest("#folha input, #folha textarea, #folha select")) avisarTrava();
  });

  /* ---------- busca ---------- */
  let selecionado = -1, resultadosAtuais = [];
  let lupaAtiva = sessionStorage.getItem("rq.lupa") || "";   // código do item em análise no Google
  const caixa = $("#busca");
  const desenharResultados = () => {
    const alvo = $("#resultados");
    alvo.innerHTML = resultadosAtuais.map((r, i) => {
      const ph = precoLembrado({ codigo: r.c, descricao: r.d });
      return `<div class="resultado ${i === selecionado ? "ativo" : ""} ${r.usado ? "usado" : ""} ${r.outros ? "outros" : ""}" data-i="${i}">
        <span class="cod">${esc(r.c)}</span><span class="desc">${esc(r.d)}${r.a ? "" : ' <span class="badge-inativo">DESATIVADO</span>'}${r.outros ? ' <span class="badge-outros" title="Fora do banco de manutenção — ao entrar numa requisição, passa a fazer parte dele">OUTROS</span>' : ""}</span>
        <span class="un">${esc(r.u)}</span>${ph ? `<span class="preco-hist">${dinheiro(ph)}</span>` : ""}
        <button class="lupa ${r.c === lupaAtiva ? "verde" : ""}" data-lupa="${i}" title="Pesquisar este item no Google (nova guia)">+🔍</button>
      </div>`;
    }).join("");
    $("#contagem").textContent = buscando ? "Buscando na nuvem…" : erroBusca ? erroBusca : resultadosAtuais.length
      ? `${resultadosAtuais.length} resultado(s)` + (resultadosAtuais.length >= 60 ? " — refine a busca para ver mais" : "")
      : (caixa.value.trim() ? ($("#opt-outros").checked
          ? "Nada encontrado também fora da manutenção. Tente menos termos."
          : "Nada encontrado. Tente menos termos, “ignorar espaços” ou marque “Buscar outros”.") : "");
    $$(".resultado", alvo).forEach(el => el.onclick = () => adicionarDoBanco(resultadosAtuais[+el.dataset.i]));
    $$(".lupa", alvo).forEach(el => el.onclick = (e) => {
      e.stopPropagation();                                   // não adiciona o item à lista
      const r = resultadosAtuais[+el.dataset.lupa];
      lupaAtiva = r.c;                                       // marca este item como "em análise"
      sessionStorage.setItem("rq.lupa", lupaAtiva);
      desenharResultados();
      window.open("https://www.google.com/search?q=" + encodeURIComponent(r.d), "_blank");
    });
  };
  /* local (banco no aparelho) ou nuvem (banco ainda baixando / "Buscar outros") */
  let timer = null, seqBusca = 0, buscando = false, erroBusca = "";
  const modoBusca = () => {
    const el = $("#busca-modo"); if (!el) return;
    const outros = $("#opt-outros").checked;
    const txt = outros ? "🌐 Itens fora da manutenção (comida, roupa, agro, loja…) — busca direto na nuvem."
      : !bancoPronto() ? `🌐 Busca on-line enquanto o banco baixa${BANCO_EST.baixando && BANCO_EST.pct ? " (" + Math.round(BANCO_EST.pct * 100) + "%)" : ""}.` : "";
    el.hidden = !txt; el.textContent = txt;
    el.classList.toggle("outros", outros);
  };
  caixa.oninput = () => {
    clearTimeout(timer);
    const q = caixa.value, espacos = $("#opt-espacos").checked, outros = $("#opt-outros").checked;
    const naNuvem = outros || !bancoPronto();
    modoBusca();
    if (!q.trim()) { seqBusca++; buscando = false; erroBusca = ""; resultadosAtuais = []; selecionado = -1; desenharResultados(); return; }
    timer = setTimeout(async () => {
      if (!naNuvem) {
        erroBusca = "";
        resultadosAtuais = buscar(q, espacos);
      } else {
        const seq = ++seqBusca;
        buscando = true; erroBusca = ""; desenharResultados();
        const r = await buscarNaNuvem(q, outros ? "outros" : "nucleo", 60, espacos);
        if (seq !== seqBusca) return;                       // chegou resposta de uma busca antiga
        buscando = false;
        resultadosAtuais = r.ok ? r.itens : [];
        erroBusca = r.ok ? "" : r.motivo;
      }
      selecionado = resultadosAtuais.length ? 0 : -1;
      desenharResultados();
    }, naNuvem ? 320 : 120);
  };
  $("#opt-espacos").onchange = caixa.oninput;
  $("#opt-outros").onchange = () => { caixa.oninput(); caixa.focus(); };
  /* o banco terminou de chegar: a mesma busca passa a ser local */
  aoMudarBanco = () => {
    if (!caixa.isConnected) { aoMudarBanco = null; return; }
    modoBusca();
    if (caixa.value.trim() && !$("#opt-outros").checked) caixa.oninput();
  };
  modoBusca();
  caixa.onkeydown = (e) => {
    if (e.key === "ArrowDown") { selecionado = Math.min(selecionado + 1, resultadosAtuais.length - 1); desenharResultados(); e.preventDefault(); }
    if (e.key === "ArrowUp")   { selecionado = Math.max(selecionado - 1, 0); desenharResultados(); e.preventDefault(); }
    if (e.key === "Enter" && selecionado >= 0) { adicionarDoBanco(resultadosAtuais[selecionado]); e.preventDefault(); }
  };

  function adicionarDoBanco(r) {
    if (!r) return;
    if (travada()) { avisarTrava(); return; }
    const base = { codigo: r.c, descricao: r.d, un: r.u, preco: 0 };
    const ph = precoLembrado(base);
    if (ph) base.preco = ph;                    // puxa o último preço usado
    const item = ehMM ? { ...base, qtdMin: 0, qtdMax: 0, justificativa: "" } : { ...base, qtd: 1 };
    L.itens.push(item);
    salvar(); desenharFolha();
    caixa.select();
  }
  $("#btn-avulso").onclick = async () => {
    if (travada()) { avisarTrava(); return; }
    const d = await perguntar("Item avulso (S/ CÓD.)", "Descrição do item", "", { obrigatorio: true, ph: "Ex.: SUPORTE ESPECIAL CONFORME DESENHO",
      ajuda: "Use só quando o item não existe no banco (nem em “Buscar outros”)." });
    if (!d) return;
    const base = { codigo: "S/ CÓD.", descricao: d.trim().toUpperCase(), un: "pç", preco: 0 };
    const ph = precoLembrado(base);
    if (ph) base.preco = ph;
    const item = ehMM ? { ...base, qtdMin: 0, qtdMax: 0, justificativa: "" } : { ...base, qtd: 1 };
    L.itens.push(item); salvar(); desenharFolha();
  };

  /* ---------- navegação por setas entre os campos da folha ---------- */
  const COLUNAS_NAV = ["qtd", "preco", "min", "max", "just"];
  let itensDesenhados = [];
  $("#folha").parentElement.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Enter") return;
    const t = e.target;
    if (!t.matches("input, select")) return;
    if (t.type === "date" || t.tagName === "SELECT") return;      // setas têm função própria nesses
    if (t.getAttribute("list")) return;                           // campo com sugestões (setor): setas escolhem
    const dir = e.key === "ArrowUp" ? -1 : 1;                     // Enter desce, como no Excel
    const col = COLUNAS_NAV.find(k => t.dataset[k] !== undefined);
    let alvo = null;
    if (col) {                                                    // dentro da tabela: mesma coluna, linha ±1
      alvo = $(`#folha [data-${col}="${+t.dataset[col] + dir}"]`);
      if (!alvo && dir === 1 && e.key === "Enter") { if (!travada()) focarBusca(); e.preventDefault(); return; }
    } else {                                                      // cabeçalho: campo seguinte/anterior
      const campos = $$("#folha input, #folha textarea").filter(el => el.offsetParent);
      const i = campos.indexOf(t);
      if (i >= 0) alvo = campos[i + dir];
    }
    if (alvo) { alvo.focus(); if (alvo.select) alvo.select(); e.preventDefault(); }
  });

  /* ---------- folha (prévia = PDF oficial, A4 paisagem) ---------- */
  const LINHAS_MIN = 10;   // linhas em branco só na tela; a impressão as oculta
  const fmtQtd = (n) => n ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(n) : "";

  function desenharFolha() {
    /* guarda o campo focado para devolver o foco após redesenhar */
    const at = document.activeElement;
    const foco = (at && at.closest && at.closest("#folha") && at.dataset) ? { ...at.dataset } : null;
    const cursor = (foco && at.tagName !== "SELECT" && at.type !== "button") ? [at.selectionStart, at.selectionEnd] : null;
    const antes = itensDesenhados;                    // os itens como estavam na tela (a nuvem pode ter mudado a ordem)

    $("#folha").classList.toggle("mm", ehMM);
    if (ehMM) folhaMM(); else folhaRM();
    ligarEventosFolha();
    if (travada()) {                                  // concluída: documento congelado
      $$("#folha input, #folha textarea").forEach(el => { el.readOnly = true; });
      $$("#folha select").forEach(el => { el.disabled = true; });
    }
    aplicarZoom();

    const chaves = [...mapaItens(L).keys()];
    itensDesenhados = L.itens.map((it, n) => ({ it, chave: chaves[n] }));
    if (foco) {
      for (const k of [...COLUNAS_NAV, "l"]) {
        if (foco[k] !== undefined) {
          let alvo = foco[k];
          if (k !== "l") {                              // célula de item: segue o MESMO item, esteja onde estiver agora
            const era = antes[+alvo];
            alvo = era ? L.itens.indexOf(era.it) : -1;
            if (alvo < 0 && era) alvo = chaves.indexOf(era.chave);
            if (alvo < 0) break;
          }
          const el = $(`#folha [data-${k}="${alvo}"]`);
          if (el) {
            el.focus();
            if (cursor && cursor[0] != null) try { el.setSelectionRange(Math.min(cursor[0], el.value.length), Math.min(cursor[1], el.value.length)); } catch { /* campo sem cursor */ }
          }
          break;
        }
      }
    }
  }
  /* antes de a nuvem mexer nesta lista: confirma o que está sendo digitado numa célula (senão se perderia ao redesenhar) */
  function assentar() {
    const f = document.activeElement;
    if (!base || !f || !f.closest || !f.closest("#folha") || f.readOnly || f.dataset.l !== undefined) return;
    if (typeof f.onchange !== "function" || f.tagName === "SELECT" || f.value === f.defaultValue) return;
    const fim = f.value.length, k = COLUNAS_NAV.find(c => f.dataset[c] !== undefined), n = k && f.dataset[k];
    f.onchange();
    const el = k ? $(`#folha [data-${k}="${n}"]`) : null;
    if (el && document.activeElement === el) try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* idem */ }
  }

  /* ===== folha RM: REQUISIÇÃO DE MATERIAL ===== */
  function folhaRM() {
    const total = totalDa(L);
    if (!L.assinaturasManuais && !travada()) L.assinaturas = assinaturasPorValor(total, L.solicitante, UL);
    $("#total-vivo").textContent = "Total: " + dinheiro(total);

    const linhaItem = (i, idx) => `
      <tr class="d-item ${idx % 2 ? "zebra" : ""}">
        <td class="d-cent">${esc(i.codigo)}</td>
        <td class="d-desc-item">${esc(i.descricao)}</td>
        <td class="d-cent">${esc(i.un)}</td>
        <td class="d-qtd"><input data-qtd="${idx}" value="${i.qtd ? fmtQtd(i.qtd) : ""}" inputmode="decimal"></td>
        <td class="d-preco"><span>R$</span><input data-preco="${idx}" value="${i.preco ? fmtBR.format(i.preco) : ""}" inputmode="decimal" style="text-align:right"></td>
        <td class="d-num">${(i.qtd && i.preco) ? "R$ " + fmtBR.format(i.qtd * i.preco) : ""}</td>
        <td class="d-remover no-print"><span class="ord-ctl"><button data-subir="${idx}" title="Subir item"${idx === 0 ? " disabled" : ""}>▲</button><button data-descer="${idx}" title="Descer item"${idx === L.itens.length - 1 ? " disabled" : ""}>▼</button><button data-remover="${idx}" title="Remover">✕</button></span></td>
      </tr>`;
    const vazias = Math.max(0, LINHAS_MIN - L.itens.length);
    const linhaVazia = `<tr class="d-item d-vazia"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td class="d-remover no-print"></td></tr>`;

    const ass = [L.assinaturas[0] || "", L.assinaturas[1] || "", L.assinaturas[2] || ""];
    const rotAss = (i, nome) => (i === 0 && nome && nome === L.solicitante) ? "VISTO SOLICITANTE" : "VISTO AUTORIZAÇÃO";
    const celAss = (nome, i, colspan) => `
      <td colspan="${colspan}">
        ${nome ? `<div class="d-ass-nome">${esc(nome)}</div><div class="d-ass-cargo">${esc(cargoDe(nome))}</div>` : "&nbsp;"}
        <div class="d-ass-troca no-print">
          <select data-ass="${i}">
            <option value="" ${!nome ? "selected" : ""}>(sem assinatura)</option>
            ${opcoesAss(nome)}
          </select>
        </div>
      </td>`;

    $("#folha").innerHTML = `
    <table class="doc">
      <colgroup>
        <col class="cA"><col class="cB"><col class="cC"><col class="cD"><col class="cE"><col class="cF"><col class="cX">
      </colgroup>
      <tr>
        <td class="d-logo"><img src="logo.png" alt="Lar" data-reserva="Lar"></td>
        <td class="d-titulo" colspan="2">REQUISIÇÃO DE MATERIAL</td>
        <td class="d-numero" colspan="2"><span class="rotulo">NÚMERO</span><input data-l="numeroFO" value="${esc(L.numeroFO)}"></td>
        <td class="d-anexos"><img src="icone_doc.png" alt="" data-some><img src="icone_pdf.png" alt="" data-some></td>
        <td class="d-remover no-print"></td>
      </tr>
      <tr class="d-rot-min">
        <td>LOCAL</td><td colspan="2">ÁREA/SETOR</td>
        <td class="d-rot-cent">EMISSÃO</td><td class="d-rot-cent">REVISÃO</td><td class="d-rot-cent">Nº</td><td class="d-remover no-print"></td>
      </tr>
      <tr class="d-valor">
        <td><input data-l="local" value="${esc(L.local)}"></td>
        <td colspan="2"><input data-l="areaSetor" value="${esc(L.areaSetor)}"></td>
        <td class="d-cent d-valor">${EMISSAO_MODELO}</td>
        <td class="d-cent d-valor"></td>
        <td class="d-cent d-valor">0</td>
        <td class="d-remover no-print"></td>
      </tr>
      <tr><td class="d-descricao" colspan="6">
        <span class="rotulo">DESCRIÇÃO DO PRODUTO/ PROCESSO À SER COMPRADO:</span>
        <textarea data-l="descricao" placeholder="Descreva a finalidade da compra…">${esc(L.descricao)}</textarea>
      </td><td class="d-remover no-print"></td></tr>
      <tr class="d-rot-cent" style="font-weight:700">
        <td class="d-rot-cent">DATA</td><td class="d-rot-cent" colspan="2">SOLICITANTE</td>
        <td class="d-rot-cent">SETOR</td><td class="d-rot-cent">PROJETO</td><td class="d-rot-cent">NR O.S.</td><td class="d-remover no-print"></td>
      </tr>
      <tr>
        <td class="d-cent"><input type="date" data-l="data" value="${esc(L.data)}" style="text-align:center"></td>
        <td class="d-cent" colspan="2"><input data-l="solicitante" value="${esc(L.solicitante)}" style="text-align:center"></td>
        <td class="d-cent"><input data-l="setor" data-setor value="${esc(L.setor || "")}" list="dl-setores" inputmode="numeric" autocomplete="off" style="text-align:center"></td>
        <td class="d-cent"><input data-l="projetoNum" value="${esc(L.projetoNum)}" style="text-align:center"></td>
        <td class="d-cent"><input data-l="nrOS" value="${esc(L.nrOS)}" style="text-align:center"></td><td class="d-remover no-print"></td>
      </tr>
      <tr class="d-cab-itens">
        <td>Código</td><td>Descrição</td><td>Unidade</td><td>Qtd.</td>
        <td>Custo Médio (Unitário)</td><td>Valor</td><td class="d-remover no-print"></td>
      </tr>
      ${L.itens.map(linhaItem).join("")}
      ${linhaVazia.repeat(vazias)}
      <tr class="d-total">
        <td colspan="4" style="border-right:none"></td>
        <td class="rot">Valor total do pedido</td>
        <td><span class="val"><span>R$</span><span>${fmtBR.format(total)}</span></span></td>
        <td class="d-remover no-print"></td>
      </tr>
      <tr><td class="d-obs" colspan="6">
        <span class="rotulo">OBSERVAÇÃO:</span> <input data-l="observacao" value="${esc(L.observacao)}" style="width:calc(100% - 90px);display:inline-block">
      </td><td class="d-remover no-print"></td></tr>
      <tr class="d-ass-rot">
        <td>${esc(rotAss(0, ass[0]))}</td>
        <td>VISTO AUTORIZAÇÃO</td>
        <td colspan="2">VISTO AUTORIZAÇÃO</td>
        <td colspan="2">VISTO ALMOXARIFADO</td><td class="d-remover no-print"></td>
      </tr>
      <tr class="d-ass-area">
        ${celAss(ass[0], 0, 1)}
        ${celAss(ass[1], 1, 1)}
        ${celAss(ass[2], 2, 2)}
        <td colspan="2">&nbsp;</td><td class="d-remover no-print"></td>
      </tr>
    </table>
    <div class="no-print" style="margin-top:6px;font-size:11px;color:#777">
      Assinaturas sugeridas pela alçada de valor (até R$ 5.000 / até R$ 30.000 / acima).
      ${L.assinaturasManuais ? '<button class="btn mini sec" id="btn-auto-ass">Voltar ao automático</button>' : "Troque nos seletores para fixar manualmente."}
    </div>`;
  }

  /* ===== folha MM: RELAÇÃO DE MÍNIMOS E MÁXIMOS PARA COMPRA =====
     Réplica do FO 185 1615-0014. Colunas (proporções do modelo):
     ESPECIFICAÇÃO 28% | UN 3,4% | MIN 6% | MAX 6% | CÓDIGO 6,5% | VALOR UN 7% | VALOR TOTAL 8,4% | JUSTIF. 34,7%
     Valor total da linha = QTDE MIN × VALOR UN (regra do próprio formulário). */
  function folhaMM() {
    if (!L.assinaturasManuais && !travada()) L.assinaturas = assinaturasMM(L);
    const total = totalDa(L);
    $("#total-vivo").textContent = "Soma (Qtde Mín × Valor Un): " + dinheiro(total);

    const linhaItem = (i, idx) => `
      <tr class="d-item">
        <td class="d-desc-item">${esc(i.descricao)}</td>
        <td class="d-cent">${esc(i.un)}</td>
        <td class="d-qtd"><input data-min="${idx}" value="${i.qtdMin ? fmtQtd(i.qtdMin) : ""}" inputmode="decimal" style="text-align:center"></td>
        <td class="d-qtd"><input data-max="${idx}" value="${i.qtdMax ? fmtQtd(i.qtdMax) : ""}" inputmode="decimal" style="text-align:center"></td>
        <td class="d-cent d-cod-mm">${esc(i.codigo)}</td>
        <td class="d-preco"><span>R$</span><input data-preco="${idx}" value="${i.preco ? fmtBR.format(i.preco) : ""}" inputmode="decimal" style="text-align:right"></td>
        <td>${(i.qtdMin && i.preco) ? `<span class="val-flex"><span>R$</span><span>${fmtBR.format(i.qtdMin * i.preco)}</span></span>` : ""}</td>
        <td class="d-just"><input data-just="${idx}" value="${esc(i.justificativa || "")}" placeholder=""></td>
        <td class="d-remover no-print"><span class="ord-ctl"><button data-subir="${idx}" title="Subir item"${idx === 0 ? " disabled" : ""}>▲</button><button data-descer="${idx}" title="Descer item"${idx === L.itens.length - 1 ? " disabled" : ""}>▼</button><button data-remover="${idx}" title="Remover">✕</button></span></td>
      </tr>`;

    const ass = [L.assinaturas[0] || "", L.assinaturas[1] || "", L.assinaturas[2] || ""];
    const nomeCargo = (nome) => nome
      ? `<div class="d-ass-nome">${esc(nome)}</div><div class="d-ass-cargo">${esc(cargoDe(nome))}</div>`
      : "&nbsp;";
    const seletorAss = (i) => `
      <div class="d-ass-troca no-print">
        <select data-ass="${i}">
          <option value="" ${!ass[i] ? "selected" : ""}>(sem assinatura)</option>
          ${opcoesAss(ass[i])}
        </select>
      </div>`;

    $("#folha").innerHTML = `
    <!-- cabeçalho como bloco próprio, separado por um respiro em branco (como o original) -->
    <table class="doc mm-cab">
      <colgroup><col style="width:27.9%"><col style="width:55.2%"><col style="width:16.9%"></colgroup>
      <tr>
        <td class="d-logo" style="text-align:left"><img src="logo.png" alt="Lar" data-reserva="Lar"></td>
        <td class="d-titulo" style="font-size:12.5px">RELAÇÃO DE MÍNIMOS E MÁXIMOS PARA COMPRA</td>
        <td style="padding:0">
          <table class="mm-num">
            <tr><td colspan="3" class="rot">Número</td></tr>
            <tr><td colspan="3" class="d-cent d-valor"><input data-l="numeroFO" value="${esc(L.numeroFO || MM_NUMERO)}" style="text-align:center;font-weight:700"></td></tr>
            <tr><td class="rot" style="width:31%">Emissão</td><td class="rot" style="width:38%">Revisão</td><td class="rot" style="width:31%">No.</td></tr>
            <tr><td class="d-cent d-valor">${MM_EMISSAO}</td><td class="d-cent d-valor"></td><td class="d-cent d-valor">${MM_NO}</td></tr>
          </table>
        </td>
      </tr>
    </table>
    <div class="mm-respiro"></div>

    <table class="doc">
      <colgroup>
        <col style="width:27.9%"><col style="width:2.9%"><col style="width:6.1%"><col style="width:6.1%">
        <col style="width:5.9%"><col style="width:6.7%"><col style="width:8.6%"><col style="width:35.8%"><col class="cX">
      </colgroup>

      <!-- linha solicitante / setor / data / nr o.s. -->
      <tr>
        <td colspan="8" style="padding:0">
          <table class="mm-linha6">
            <tr>
              <td style="width:49.7%" class="campo-linha"><span class="rotulo">SOLICITANTE:</span> <input data-l="solicitante" value="${esc(L.solicitante)}" style="width:calc(100% - 92px);display:inline-block"></td>
              <td class="rotulo" style="width:11.2%;text-align:center">SETOR:</td>
              <td style="width:16.1%" class="d-cent"><input data-l="setor" data-setor value="${esc(L.setor || "")}" list="dl-setores" inputmode="numeric" autocomplete="off" style="text-align:center"></td>
              <td style="width:11%" class="campo-linha"><span class="rotulo">DATA:</span><input type="date" data-l="data" value="${esc(L.data)}"></td>
              <td style="width:12%" class="campo-linha"><span class="rotulo">NR O.S.</span><input data-l="nrOS" value="${esc(L.nrOS || "")}"></td>
            </tr>
          </table>
        </td>
        <td class="d-remover no-print"></td>
      </tr>

      <!-- descrição fixa do processo -->
      <tr>
        <td class="d-descricao"><span class="rotulo">DESCRIÇÃO DO PRODUTO/PROCESSO À SER COMPRADO:</span></td>
        <td colspan="7" class="d-valor"><input data-l="descricao" value="${esc(L.descricao || "RELAÇÃO DE MÍNIMOS E MÁXIMOS PARA COMPRA")}" style="text-align:left;font-weight:700"></td>
        <td class="d-remover no-print"></td>
      </tr>

      <!-- tabela de itens -->
      <tr class="d-cab-itens">
        <td>ESPECIFICAÇÃO</td><td>UN</td><td>QTDE MIN</td><td>QTDE MAX</td>
        <td>CÓDIGO</td><td>VALOR UN<br>(COMPRA/<br>ORÇAMENTO)</td><td>VALOR TOTAL</td><td>JUSTIFICATIVA/DESTINO</td>
        <td class="d-remover no-print"></td>
      </tr>
      ${L.itens.map(linhaItem).join("")}
      <tr class="d-total-mm">
        <td colspan="5" style="border-right:none"></td>
        <td class="d-cent" style="font-weight:700">TOTAL</td>
        <td><span class="val-flex" style="font-weight:700"><span>R$</span><span>${fmtBR.format(total)}</span></span></td>
        <td></td>
        <td class="d-remover no-print"></td>
      </tr>

      <!-- observação -->
      <tr><td class="d-obs" colspan="8">
        <span class="rotulo">OBSERVAÇÃO:</span> <input data-l="observacao" value="${esc(L.observacao || "")}" style="width:calc(100% - 90px);display:inline-block">
      </td><td class="d-remover no-print"></td></tr>

      <!-- vistos: solicitante | autorização | autorização | setor pedidos de compras -->
      <tr>
        <td colspan="8" style="padding:0">
          <table class="mm-assina">
            <tr class="d-ass-rot">
              <td style="width:28%">VISTO SOLICITANTE</td>
              <td style="width:28%">VISTO AUTORIZAÇÃO</td>
              <td style="width:21%">VISTO AUTORIZAÇÃO</td>
              <td style="width:23%">VISTO SETOR PEDIDOS DE COMPRAS</td>
            </tr>
            <tr class="d-ass-area">
              <td>${nomeCargo(ass[0])}${seletorAss(0)}</td>
              <td>${nomeCargo(ass[1])}${seletorAss(1)}</td>
              <td>${nomeCargo(ass[2])}${seletorAss(2)}</td>
              <td>&nbsp;</td>
            </tr>
          </table>
        </td>
        <td class="d-remover no-print"></td>
      </tr>
    </table>
    <div class="no-print" style="margin-top:6px;font-size:11px;color:#777">
      Assinantes padrão do MM: solicitante + supervisor + gerente industrial (independe do valor).
      ${L.assinaturasManuais ? '<button class="btn mini sec" id="btn-auto-ass">Voltar ao padrão</button>' : "Troque nos seletores se necessário."}
      Valor total de cada linha segue o formulário oficial: Qtde Mín × Valor Un.
    </div>`;
  }

  /* ===== eventos comuns da folha ===== */
  function ligarEventosFolha() {
    $$("#folha [data-l]").forEach(el => {
      const ehSetor = el.dataset.setor !== undefined;
      if (ehSetor) marcarSetor(el);
      el.onchange = el.oninput = () => {
        if (ehSetor) {                                   // setor: só dígitos
          const v = el.value.replace(/\D/g, "");
          if (v !== el.value) el.value = v;
          marcarSetor(el);
        }
        L[el.dataset.l] = el.value; salvar();
      };
      if (el.dataset.l === "solicitante") {
        el.setAttribute("list", "dl-pessoas"); el.autocomplete = "off";
        const marcar = () => {
          const fora = !!el.value.trim() && !noCadastro(el.value);
          el.classList.toggle("fora-cadastro", fora);
          el.title = fora ? "Nome fora do cadastro de pessoas — escolha um nome da lista" : "Solicitante (cadastro de pessoas)";
        };
        marcar();
        el.addEventListener("input", marcar);
        el.onblur = () => {
          const certo = nomeDoCadastro(el.value, UL);         // liga ao nome exato do cadastro
          if (certo && certo !== el.value) { el.value = L.solicitante = certo; salvar(); }
          marcar();
          if (!L.assinaturasManuais) desenharFolha();          // 1º visto = solicitante
        };
      }
    });
    $$("#folha [data-qtd]").forEach(el => {
      el.onchange = () => { L.itens[+el.dataset.qtd].qtd = lerPreco(el.value); salvar(); desenharFolha(); };
    });
    $$("#folha [data-min]").forEach(el => {
      el.onchange = () => { L.itens[+el.dataset.min].qtdMin = lerPreco(el.value); salvar(); desenharFolha(); };
    });
    $$("#folha [data-max]").forEach(el => {
      el.onchange = () => { L.itens[+el.dataset.max].qtdMax = lerPreco(el.value); salvar(); desenharFolha(); };
    });
    $$("#folha [data-just]").forEach(el => {
      el.onchange = () => { L.itens[+el.dataset.just].justificativa = el.value; salvar(); };
    });
    $$("#folha [data-preco]").forEach(el => {
      el.onchange = () => {
        const it = L.itens[+el.dataset.preco];
        it.preco = lerPreco(el.value);
        lembrarPreco(it);                       // memoriza para as próximas listas
        salvar(); desenharFolha();
      };
    });
    /* sobe/desce: troca o item com o vizinho e mantém o foco no botão para cliques seguidos */
    const mover = (i, passo) => {
      const j = i + passo;
      if (travada() || j < 0 || j >= L.itens.length) return;
      [L.itens[i], L.itens[j]] = [L.itens[j], L.itens[i]];
      salvar(); desenharFolha();
      const alvo = $(`#folha [data-${passo < 0 ? "subir" : "descer"}="${j}"]`);
      (alvo && !alvo.disabled ? alvo : $(`#folha [data-remover="${j}"]`))?.focus();
    };
    $$("#folha [data-subir]").forEach(el => { el.onclick = () => mover(+el.dataset.subir, -1); });
    $$("#folha [data-descer]").forEach(el => { el.onclick = () => mover(+el.dataset.descer, +1); });
    $$("#folha [data-remover]").forEach(el => {
      el.onclick = () => { L.itens.splice(+el.dataset.remover, 1); salvar(); desenharFolha(); };
    });
    $$("#folha [data-ass]").forEach(el => {
      el.onchange = () => {
        const i = +el.dataset.ass;
        const novas = [...L.assinaturas];
        if (el.value === "") novas.splice(i, 1);
        else novas[i] = el.value;
        L.assinaturas = novas.filter(Boolean);
        L.assinaturasManuais = true;
        salvar(); desenharFolha();
      };
    });
    const ba = $("#btn-auto-ass");
    if (ba) ba.onclick = () => { L.assinaturasManuais = false; salvar(); desenharFolha(); };
  }

  desenharFolha();
  base = fotografar();                 // referência do log: a lista como foi aberta
  if (sb && pendentes.has(L.id)) {     // ficou alteração por enviar: a referência é a versão da nuvem de onde ela partiu
    const b = baseDe(L.id, vistoNuvem.get(L.id));
    if (b) {
      delete b.log;
      if (!L.assinaturasManuais && !b.assinaturasManuais) b.assinaturas = (L.assinaturas || []).slice();
      base = b;
    }
  }
  if (!travada()) {
    const trocas = [];
    const ligar = (v) => { const c = v && !noCadastro(v) ? nomeDoCadastro(v, UL) : ""; if (c) trocas.push(`${v} → ${c}`); return c || v; };
    L.solicitante = ligar(L.solicitante);
    L.autor = ligar(L.autor);
    L.assinaturas = (L.assinaturas || []).map(ligar);
    if (trocas.length) {
      desenharFolha(); salvar();
      toast(`Nome(s) ajustado(s) ao cadastro: ${[...new Set(trocas)].join(" · ")}`);
    }
  }
  aplicarTrava();
  marcar("salvo");
  mostrarUltima();
  desenharHistorico();
  selecionarAba(["itens", "notas", "hist"].includes(abaInicial) ? abaInicial : "itens");
  editorAtivo = { id: L.id, commit, focarBusca, recarregar, assentar, base: () => base,
                  abandonar: () => { base = null; clearTimeout(tNuvem); tNuvem = null; } };
  if (pendentes.has(L.id)) commit();                  // ficou algo por enviar da última vez
  atualizarListaAberta(L.id);                         // confere na nuvem se esta é mesmo a última versão
  if (!travada() && !corpo.classList.contains("lat-fechada")) caixa.focus();
}

/* ============================================================
   PDF DIRETO (download) — vetorial, A4 paisagem, margens de 7 mm
   O navegador monta o mesmo clone textual da impressão com a largura
   útil da página (283 mm); cada fundo, borda, palavra e imagem é
   redesenhado no PDF exatamente onde o navegador o colocou.
   Fonte RQ Sans embutida (= Carlito reduzida; mesmas medidas da Calibri do formulário).
   Bibliotecas e fontes só carregam no 1º clique.
   ============================================================ */
const LIBS_PDF = {                             // versão fixa + assinatura: o navegador recusa arquivo adulterado
  pdflib:  ["https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
            "sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI"],
  fontkit: ["https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js",
            "sha384-2p6U+1mmqF10USehFeRiyG2ESG9FwIqN+jxULn5w9jjQIihSn9Pt13dVCn/Hawjn"],
};
const carregarScript = ([src, assinatura]) => new Promise((ok, erro) => {
  const s = document.createElement("script");
  s.src = src; s.integrity = assinatura; s.crossOrigin = "anonymous";
  s.onload = ok; s.onerror = () => erro(new Error("sem acesso a " + src.split("/npm/")[1]));
  document.head.appendChild(s);
});
let recursosPdf = null;                       // promessa única: bibliotecas + fontes
function carregarRecursosPdf() {
  if (!recursosPdf) recursosPdf = (async () => {
    if (!window.PDFLib) await carregarScript(LIBS_PDF.pdflib);
    if (!window.fontkit) await carregarScript(LIBS_PDF.fontkit).catch(() => {});   // sem ela: Helvetica
    const ler = (u) => fetch(u).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);
    const ler2 = async (n) => (await ler("fontes/" + n)) || ler(n);              // pasta fontes/ ou raiz do site
    const [reg, neg] = await Promise.all([ler2("RQSans-Regular.ttf"), ler2("RQSans-Bold.ttf")]);
    return { reg, neg };
  })().catch(e => { recursosPdf = null; throw e; });
  return recursosPdf;
}

async function gerarPdfVetorial(clone, info = {}) {
  const rec = await carregarRecursosPdf();
  const { PDFDocument, StandardFonts, rgb, LineCapStyle } = window.PDFLib;
  const MM = 72 / 25.4, PX = 0.75;                     // pt por mm · pt por px CSS
  const PAG_L = 297 * MM, PAG_A = 210 * MM, MARG = 7 * MM;
  const AREA_A = (PAG_A - 2 * MARG) / PX;              // altura útil em px CSS (≈ 741)

  /* 1) clone fora da tela, na largura útil da página (igual à impressão) */
  const caixa = document.createElement("div");
  caixa.className = "no-print";
  caixa.style.cssText = "position:fixed;left:-30000px;top:0;width:283mm;background:#fff;pointer-events:none";
  clone.removeAttribute("id");
  clone.style.width = "283mm"; clone.style.minHeight = "0";
  caixa.appendChild(clone);
  document.body.appendChild(caixa);
  try {
    await Promise.all([...clone.querySelectorAll("img")].map(im => im.complete ? 0
      : new Promise(ok => { im.onload = im.onerror = ok; setTimeout(ok, 3000); })));
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    const o = clone.getBoundingClientRect();
    const X = (x) => x - o.left, Y = (y) => y - o.top;
    const cor = (c) => {
      const m = /rgba?\(([^)]+)\)/.exec(c || ""); if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return a === 0 ? null : { r: r / 255, g: g / 255, b: b / 255 };
    };
    const fundos = [], linhas = [], palavras = [], imagens = [];

    /* 2) fundos, bordas e imagens */
    for (const el of [clone, ...clone.querySelectorAll("*")]) {
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const x1 = X(r.left), y1 = Y(r.top), x2 = X(r.right), y2 = Y(r.bottom);
      const bg = cor(st.backgroundColor);
      if (bg && !(bg.r === 1 && bg.g === 1 && bg.b === 1)) fundos.push({ x1, y1, x2, y2, c: bg });
      /* célula de tabela com bordas colapsadas: a linha fica centrada na aresta;
         a própria tabela e os demais elementos: borda por dentro do retângulo */
      const colapsa = /^(TD|TH)$/.test(el.tagName) && st.borderCollapse === "collapse";
      for (const [lado, horiz] of [["Top", 1], ["Bottom", 1], ["Left", 0], ["Right", 0]]) {
        const w = parseFloat(st[`border${lado}Width`]);
        const est = st[`border${lado}Style`];
        if (!w || est === "none" || est === "hidden") continue;
        const c = cor(st[`border${lado}Color`]); if (!c) continue;
        const d = colapsa ? 0 : w / 2;
        const cap = colapsa;                                                   // cantos da grade fechados
        if (horiz) { const y = lado === "Top" ? y1 + d : y2 - d; linhas.push({ x1, y1: y, x2, y2: y, w, c, cap }); }
        else { const x = lado === "Left" ? x1 + d : x2 - d; linhas.push({ x1: x, y1, x2: x, y2, w, c, cap }); }
      }
      if (el.tagName === "IMG" && el.complete && el.naturalWidth) imagens.push({ el, x1, y1, x2, y2 });
    }

    /* 3) texto: palavra por palavra, na posição que o navegador calculou */
    const recortes = new Map();
    const recorteDe = (el) => {                        // caixa visível (ancestrais com overflow escondido)
      if (recortes.has(el)) return recortes.get(el);
      let cx = { x1: -1e9, y1: -1e9, x2: 1e9, y2: 1e9, reticencias: false };
      for (let a = el; a && a !== caixa; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.overflowX !== "visible" || s.overflowY !== "visible") {
          const r = a.getBoundingClientRect();
          cx = { x1: Math.max(cx.x1, X(r.left)), y1: Math.max(cx.y1, Y(r.top)), x2: Math.min(cx.x2, X(r.right)),
                 y2: Math.min(cx.y2, Y(r.bottom)), reticencias: cx.reticencias || s.textOverflow === "ellipsis" };
        }
      }
      recortes.set(el, cx);
      return cx;
    };
    /* linha de base de cada fonte, medida no próprio navegador */
    const bases = {};
    const linhaDeBase = (st) => {
      const k = st.fontFamily + "|" + st.fontWeight;
      if (bases[k] == null) {
        const sp = document.createElement("span");
        sp.style.cssText = `font-family:${st.fontFamily};font-weight:${st.fontWeight};font-size:100px;line-height:normal;white-space:nowrap`;
        sp.textContent = "Hg";
        const mk = document.createElement("span");
        mk.style.cssText = "display:inline-block;width:1px;height:0;vertical-align:baseline";
        sp.appendChild(mk); caixa.appendChild(sp);
        const rg = document.createRange(); rg.selectNodeContents(sp.firstChild);
        bases[k] = (mk.getBoundingClientRect().top - rg.getBoundingClientRect().top) / 100;
        sp.remove();
      }
      return bases[k];
    };
    const rg = document.createRange();
    const andar = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    for (let n = andar.nextNode(); n; n = andar.nextNode()) {
      const t = n.nodeValue;
      if (!t || !t.trim()) continue;
      const pai = n.parentElement, st = getComputedStyle(pai);
      if (st.visibility === "hidden") continue;
      const fs = parseFloat(st.fontSize);
      const base = { fs, neg: (parseInt(st.fontWeight, 10) || 400) >= 600, c: cor(st.color) || { r: 0, g: 0, b: 0 },
                     bl: linhaDeBase(st), clip: recorteDe(pai) };
      let p = null;
      const fecha = () => { if (p && p.txt) palavras.push(p); p = null; };
      for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        if (/\s/.test(ch)) { fecha(); continue; }
        rg.setStart(n, i); rg.setEnd(n, i + 1);
        const cr = rg.getClientRects()[0];
        if (!cr || !cr.width) continue;
        if (p && Math.abs(cr.top - p.topAbs) > fs * 0.5) fecha();          // quebrou a linha
        if (!p) p = { ...base, txt: "", topAbs: cr.top, x: X(cr.left), y: Y(cr.top), h: cr.height, dir: [] };
        p.txt += ch; p.dir.push(X(cr.right));
      }
      fecha();
    }

    /* 4) páginas: quebra entre linhas das tabelas, como a impressão */
    const H = clone.getBoundingClientRect().height;
    const cortes = [...clone.querySelectorAll(":scope > table > tbody > tr, :scope > table > tr")]
      .map(tr => Y(tr.getBoundingClientRect().bottom)).sort((a, b) => a - b);
    const paginas = [];
    for (let ini = 0; ini < H - 0.5;) {
      let fim = H;
      if (H - ini > AREA_A) {
        const ok = cortes.filter(y => y > ini + 1 && y - ini <= AREA_A);
        fim = ok.length ? ok[ok.length - 1] : ini + AREA_A;
      }
      paginas.push([ini, fim]); ini = fim;
    }

    /* 5) desenha */
    const pdf = await PDFDocument.create();
    let fReg, fNeg, embutida = false;
    if (window.fontkit && rec.reg && rec.neg) {
      try {
        pdf.registerFontkit(window.fontkit);
        /* fontes já reduzidas (~55 kB cada); o "subset" da biblioteca perde letras */
        fReg = await pdf.embedFont(rec.reg, { subset: false });
        fNeg = await pdf.embedFont(rec.neg, { subset: false });
        embutida = true;
      } catch (e) { console.warn("pdf/fonte:", e); }
    }
    if (!embutida) { fReg = await pdf.embedFont(StandardFonts.Helvetica); fNeg = await pdf.embedFont(StandardFonts.HelveticaBold); }
    const textoSeguro = (txt, f) => {                  // Helvetica não tem todos os caracteres
      if (embutida) return txt;
      return [...txt].map(ch => { try { f.encodeText(ch); return ch; } catch { return "?"; } }).join("");
    };
    const pngs = new Map();
    for (const im of imagens) {
      if (pngs.has(im.el.src)) continue;
      try {
        const cv = document.createElement("canvas");
        cv.width = im.el.naturalWidth; cv.height = im.el.naturalHeight;
        cv.getContext("2d").drawImage(im.el, 0, 0);
        const blob = await new Promise(ok => cv.toBlob(ok, "image/png"));
        pngs.set(im.el.src, await pdf.embedPng(new Uint8Array(await blob.arrayBuffer())));
      } catch (e) { pngs.set(im.el.src, null); }
    }
    const C = (c) => rgb(c.r, c.g, c.b);
    for (const [y0, y1] of paginas) {
      const pg = pdf.addPage([PAG_L, PAG_A]);
      const px = (x) => MARG + x * PX;
      const py = (y) => PAG_A - MARG - (y - y0) * PX;
      for (const f of fundos) {
        const a = Math.max(f.y1, y0), b = Math.min(f.y2, y1);
        if (b <= a) continue;
        pg.drawRectangle({ x: px(f.x1), y: py(b), width: (f.x2 - f.x1) * PX, height: (b - a) * PX, color: C(f.c) });
      }
      for (const im of imagens) {
        const img = pngs.get(im.el.src);
        if (!img || im.y1 < y0 - 0.5 || im.y1 >= y1) continue;
        const w = im.x2 - im.x1, h = im.y2 - im.y1;                         // object-fit: contain
        const k = Math.min(w / im.el.naturalWidth, h / im.el.naturalHeight);
        const dw = im.el.naturalWidth * k, dh = im.el.naturalHeight * k;
        const dx = im.x1 + (w - dw) / 2, dy = im.y1 + (h - dh) / 2;
        pg.drawImage(img, { x: px(dx), y: py(dy + dh), width: dw * PX, height: dh * PX });
      }
      for (const l of linhas) {
        let { x1, y1: a, x2, y2: b } = l;
        if (a === b) { if (a < y0 - 0.5 || a > y1 + 0.5) continue; }
        else { a = Math.max(a, y0); b = Math.min(b, y1); if (b <= a) continue; }
        pg.drawLine({ start: { x: px(x1), y: py(a) }, end: { x: px(x2), y: py(b) },
                      thickness: l.w * PX, color: C(l.c), lineCap: l.cap ? LineCapStyle.Projecting : LineCapStyle.Butt });
      }
      for (const w of palavras) {
        const meio = w.y + w.h / 2;
        if (meio < y0 || meio >= y1) continue;
        const cl = w.clip;
        if (w.y >= cl.y2 - 0.5 || w.y + w.h <= cl.y1 + 0.5) continue;        // escondida pelo recorte
        const f = w.neg ? fNeg : fReg, tam = w.fs * PX;
        let txt = w.txt;
        if (w.dir[w.dir.length - 1] > cl.x2 + 0.5) {                           // passa da célula: corta
          let n = w.dir.findIndex(d => d > cl.x2 + 0.5);
          if (cl.reticencias) {
            const lr = f.widthOfTextAtSize("…", tam) / PX;
            while (n > 0 && w.dir[n - 1] + lr > cl.x2) n--;
            txt = txt.slice(0, n) + "…";
          } else txt = txt.slice(0, n);
          if (!txt) continue;
        }
        if (w.x >= cl.x2 - 0.5) continue;
        pg.drawText(textoSeguro(txt, f), { x: px(w.x), y: py(w.y + w.bl * w.fs), size: tam, font: f, color: C(w.c) });
      }
    }
    pdf.setTitle(info.titulo || "Requisição");
    if (info.autor) pdf.setAuthor(info.autor);
    pdf.setCreator(info.criador || "Recursos Materiais");
    pdf.setProducer("Recursos Materiais — pdf-lib");
    pdf.setLanguage("pt-BR");
    return await pdf.save();
  } finally {
    caixa.remove();
  }
}

/* ============================================================
   RESUMO MG — Excel cru (sem formatação) para copiar e colar:
   CÓDIGO | DESCRIÇÃO | 4 colunas em branco (C–F, preenchidas no destino) |
   QUANTIDADE | UNIDADE | VALOR UNITÁRIO | VALOR TOTAL
   MM usa a Qtde mínima (mesma regra do total do formulário).
   ============================================================ */
function baixarResumoMG(l) {
  const mm = l.tipo === "MM";
  const VAZIAS = ["", "", "", ""];                    // C–F: completadas depois na planilha de destino
  const cab = ["CÓDIGO", "DESCRIÇÃO", ...VAZIAS, "QUANTIDADE", "UNIDADE", "VALOR UNITÁRIO", "VALOR TOTAL"];
  const linhas = (l.itens || []).map(i => {
    const q = mm ? (+i.qtdMin || 0) : (+i.qtd || 0), p = +i.preco || 0;
    const cod = String(i.codigo ?? "").trim();
    return [/^\d+$/.test(cod) ? Number(cod) : cod, i.descricao || "", ...VAZIAS, q, i.un || "", p, Math.round(q * p * 100) / 100];
  });
  const nome = "Resumo_MG_" + (l.titulo || "lista").replace(/[\\/:*?"<>|]/g, "-");
  if (window.XLSX) {
    const ws = XLSX.utils.aoa_to_sheet([cab, ...linhas]);
    ws["!cols"] = [{ wch: 10 }, { wch: 52 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 9 }, { wch: 15 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resumo MG");
    XLSX.writeFile(wb, nome + ".xlsx");
  } else {                                            // reserva: CSV que o Excel abre direto
    const f = (v) => typeof v === "number" ? String(v).replace(".", ",") : `"${String(v).replace(/"/g, '""')}"`;
    const csv = "﻿" + [cab, ...linhas].map(r => r.map(f).join(";")).join("\r\n");
    baixarBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), nome + ".csv");
  }
}

/* ============================================================
   TELA: HISTÓRICO POR ITEM
   Todos os itens lançados nas requisições da unidade, da data mais
   recente para a mais antiga. Filtro imediato por CÓDIGO (começo do
   código) ou por NOME (todos os termos, sem acento) — digitar em um
   bloqueia o outro. A página mostra só 30 linhas por vez.
   ============================================================ */
const HIST_PAGINA = 30;
const DESC_MM_PADRAO = "RELAÇÃO DE MÍNIMOS E MÁXIMOS PARA COMPRA";
const chaveItemHist = (codigo, n) => (codigo && codigo !== "S/ CÓD.") ? "C:" + codigo : "D:" + n;

/* uma linha por item lançado (monta em memória; a tela só desenha 30) */
function montarHistorico() {
  const nomeProj = new Map(projetos.map(p => [p.id, p.nome]));
  const linhas = [];
  for (const l of listasUN()) {
    const mm = l.tipo === "MM";
    const data = l.data || l.criadoEm || "";
    const criada = Date.parse((l.log && l.log[0] && l.log[0].em) || l.criadoEm || "") || 0;
    (l.itens || []).forEach((i, idx) => {
      const n = norm(i.descricao);
      const q = mm ? (+i.qtdMin || 0) : (+i.qtd || 0);
      const preco = +i.preco || 0;
      linhas.push({
        l, idx, mm, codigo: String(i.codigo ?? ""), nome: String(i.descricao ?? ""), un: i.un || "",
        q, qMax: mm ? (+i.qtdMax || 0) : 0, preco, total: q * preco,
        data, t: Date.parse(data) || 0, criada,
        autor: nomeDoCadastro(l.autor || l.solicitante) || l.autor || l.solicitante || "", projeto: nomeProj.get(l.projetoId) || "",
        n, ns: semEspaco(n), c: norm(i.codigo).replace(/\s/g, ""),
      });
    });
  }
  /* data da requisição ↓, depois a lista criada por último, depois a ordem dentro da lista */
  linhas.sort((a, b) => b.t - a.t || b.criada - a.criada || a.idx - b.idx);
  /* preço anterior do mesmo item (para a seta de variação) */
  const ultimo = new Map();
  for (let k = linhas.length - 1; k >= 0; k--) {
    const r = linhas[k];
    if (!r.preco) continue;
    const ch = chaveItemHist(r.codigo, r.n);
    if (ultimo.has(ch)) r.ant = ultimo.get(ch);
    ultimo.set(ch, r.preco);
  }
  return linhas;
}

function filtrarHistorico(linhas, f) {
  let r = f.tipo === "RM" ? linhas.filter(x => !x.mm) : f.tipo === "MM" ? linhas.filter(x => x.mm) : linhas;
  const c = norm(f.cod).replace(/\s/g, "");
  if (c) return r.filter(x => x.c.startsWith(c));
  const termos = norm(f.nome).trim().split(/\s+/).filter(Boolean);
  if (!termos.length) return r;
  const tns = termos.map(semEspaco);
  return r.filter(x => termos.every((t, i) => x.n.includes(t) || (f.espacos && tns[i] && x.ns.includes(tns[i]))));
}

/* destaca os termos encontrados (só quando o texto normalizado tem o mesmo tamanho) */
function marcarTermos(txt, termos) {
  const s = String(txt ?? ""), n = norm(s);
  if (!termos.length || n.length !== s.length) return esc(s);
  const m = new Array(s.length).fill(false);
  for (const t of termos) {
    for (let p = n.indexOf(t); p >= 0; p = n.indexOf(t, p + t.length)) for (let k = p; k < p + t.length; k++) m[k] = true;
  }
  let out = "", dentro = false;
  for (let k = 0; k < s.length; k++) {
    if (m[k] !== dentro) { out += m[k] ? "<mark>" : "</mark>"; dentro = m[k]; }
    out += esc(s[k]);
  }
  return out + (dentro ? "</mark>" : "");
}

function resumoHistorico(res, f) {
  if (!res.length) return "";
  const porCod = new Map();
  for (const r of res) {
    const k = r.codigo || "—";
    const c = porCod.get(k);
    if (c) c.n++; else porCod.set(k, { n: 1, nome: r.nome, un: r.un });
  }
  const nReq = new Set(res.map(r => r.l.id)).size;
  let h = `<strong>${res.length}</strong> lançamento(s) em <strong>${nReq}</strong> requisição(ões) · <strong>${porCod.size}</strong> código(s)`;
  if (!f.cod && !f.nome.trim()) return h + " · da data mais recente para a mais antiga";
  if (porCod.size === 1) {
    const [cod, info] = [...porCod][0];
    const comPreco = res.filter(r => r.preco);
    h = `<span class="h-item">${esc(cod)} · ${esc(info.nome)}</span><br>` + h;
    if (comPreco.length) {
      const ps = comPreco.map(r => r.preco);
      h += ` · último preço <strong>${dinheiro(comPreco[0].preco)}</strong> em ${dataBR(comPreco[0].data)}`;
      if (comPreco.length > 1) h += ` · menor <strong>${dinheiro(Math.min(...ps))}</strong> · maior <strong>${dinheiro(Math.max(...ps))}</strong>`;
    }
    const qRM = res.filter(r => !r.mm).reduce((s, r) => s + r.q, 0);
    if (qRM) h += ` · qtd. requisitada <strong>${fmtNum(qRM)} ${esc(info.un)}</strong>`;
    return h;
  }
  const top = [...porCod].sort((a, b) => b[1].n - a[1].n).slice(0, 12);
  h += `<div class="h-chips">Códigos encontrados (clique para ver só um): ${top.map(([c, i]) => c === "—"
      ? `<span class="h-chip mudo">sem código <b>×${i.n}</b></span>`
      : `<button class="h-chip" data-cod="${esc(c)}" title="${esc(i.nome)}">${esc(c)} <b>×${i.n}</b></button>`).join("")}
    ${porCod.size > 12 ? `<span class="h-mais-cod">+${porCod.size - 12}</span>` : ""}</div>`;
  return h;
}

function telaHistorico(app) {
  const linhas = montarHistorico();
  const f = { cod: "", nome: "", espacos: true, tipo: "" };
  try { Object.assign(f, JSON.parse(sessionStorage.getItem("rq.hist") || "{}")); } catch { /* padrão */ }
  if (f.cod) f.nome = "";
  let pagina = 1, res = [];
  const nReq = new Set(linhas.map(r => r.l.id)).size;

  app.innerHTML = `
    <div class="pagina-titulo">
      <h1>Histórico por item</h1><span class="etiqueta tipo">${esc(UNI().nome)}</span>
      <span class="espacador"></span>
      <span class="h-total">${linhas.length.toLocaleString("pt-BR")} itens lançados em ${nReq} requisição(ões)</span>
    </div>
    <div class="h-filtros">
      <div class="h-campo cod" id="hc-cod">
        <label for="h-cod">Código</label>
        <input type="text" id="h-cod" inputmode="numeric" autocomplete="off" spellcheck="false">
        <button class="h-limpar" id="hl-cod" title="Limpar (Esc)" hidden>✕</button>
      </div>
      <div class="h-ou">ou</div>
      <div class="h-campo nome" id="hc-nome">
        <label for="h-nome">Nome do material</label>
        <input type="text" id="h-nome" autocomplete="off" spellcheck="false">
        <button class="h-limpar" id="hl-nome" title="Limpar (Esc)" hidden>✕</button>
      </div>
      <div class="h-opcoes">
        <label class="check"><input type="checkbox" id="h-espacos"> Ignorar espaços/traços</label>
        <select id="h-tipo" title="Tipo de documento">
          <option value="">RM e MM</option><option value="RM">Só RM</option><option value="MM">Só MM</option>
        </select>
      </div>
    </div>
    <div class="h-resumo" id="h-resumo"></div>
    <div class="h-rolagem">
      <table class="app hist">
        <thead><tr>
          <th>Data</th><th>Código</th><th>Nome do material</th><th>Un</th><th class="num">Qtd.</th>
          <th class="num">Preço un.</th><th class="num">Total</th><th>Requisição</th><th>Autor</th>
        </tr></thead>
        <tbody id="h-corpo"></tbody>
      </table>
    </div>
    <div class="h-rodape"><span id="h-conta"></span><button class="btn sec" id="h-mais" hidden></button></div>`;

  const inCod = $("#h-cod"), inNome = $("#h-nome");
  inCod.value = f.cod; inNome.value = f.nome;
  $("#h-espacos").checked = f.espacos !== false;
  $("#h-tipo").value = f.tipo || "";

  const variacao = (r) => {
    if (!r.ant || !r.preco) return "";
    const v = (r.preco - r.ant) / r.ant;
    if (Math.abs(v) < 0.005) return `<span class="h-var igual" title="Igual ao lançamento anterior deste item">=</span>`;
    const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Math.abs(v) * 100);
    return `<span class="h-var ${v > 0 ? "sobe" : "desce"}" title="Lançamento anterior deste item: ${dinheiro(r.ant)}">${v > 0 ? "▲" : "▼"} ${pct}%</span>`;
  };
  const codHtml = (r) => {
    const c = norm(f.cod).replace(/\s/g, "");
    if (c && !/\s/.test(r.codigo) && norm(r.codigo).length === r.codigo.length && r.c.startsWith(c))
      return `<mark>${esc(r.codigo.slice(0, c.length))}</mark>${esc(r.codigo.slice(c.length))}`;
    return esc(r.codigo || "—");
  };
  /* repetida = mesma requisição da linha de cima: só o título, sem repetir descrição e projeto.
     O status (✔ concluída) vai em TODAS as linhas: sem ele, a linha repetida ficava igual a uma RM em andamento. */
  const linha = (r, termos, repetida) => {
    const desc = (r.l.descricao || "").trim();
    const mostraDesc = !repetida && desc && !(r.mm && norm(desc) === norm(DESC_MM_PADRAO));
    const concl = r.l.status === "concluida";
    const proj = repetida ? "" : r.projeto;
    return `<tr${repetida ? ' class="h-rep"' : ""}>
      <td class="h-data">${esc(dataBR(r.data)) || "—"}</td>
      <td class="h-cod">${codHtml(r)}</td>
      <td class="h-nome">${marcarTermos(r.nome, termos)}</td>
      <td class="h-un">${esc(r.un)}</td>
      <td class="num">${r.mm
        ? `<span title="Qtde mínima · máxima">mín ${fmtNum(r.q) || 0}${r.qMax ? ` · máx ${fmtNum(r.qMax)}` : ""}</span>`
        : (fmtNum(r.q) || "—")}</td>
      <td class="num">${r.preco ? dinheiro(r.preco) : "—"}${variacao(r)}</td>
      <td class="num"${r.mm ? ' title="MM: Qtde mín × preço"' : ""}>${r.total ? dinheiro(r.total) : "—"}</td>
      <td class="h-req">
        <a href="#/lista/${esc(r.l.id)}" title="Abrir a requisição"><span class="etiqueta tipo">${r.mm ? "MM" : "RM"}</span> ${esc(r.l.titulo)}</a>
        ${mostraDesc ? `<div class="h-desc" title="${esc(desc)}">${esc(curto(desc, 90))}</div>` : ""}
        ${(proj || concl) ? `<div class="h-tags">${proj ? `<span class="etiqueta">${esc(proj)}</span>` : ""}${concl ? '<span class="etiqueta ok">✔ concluída</span>' : ""}</div>` : ""}
      </td>
      <td class="h-autor">${esc(r.autor || "—")}</td>
    </tr>`;
  };

  function desenhar() {
    const vis = res.slice(0, pagina * HIST_PAGINA);
    const termos = f.cod ? [] : norm(f.nome).trim().split(/\s+/).filter(Boolean);
    $("#h-corpo").innerHTML = vis.map((r, k) => linha(r, termos, k > 0 && vis[k - 1].l === r.l)).join("")
      || `<tr><td colspan="9" class="h-vazio">${linhas.length
          ? "Nenhum lançamento encontrado com esse filtro."
          : `Nenhum item lançado ainda nas requisições da ${esc(UNI().nome)}.`}</td></tr>`;
    $("#h-conta").textContent = res.length ? `Mostrando ${vis.length} de ${res.length.toLocaleString("pt-BR")} lançamento(s)` : "";
    const resta = res.length - vis.length;
    $("#h-mais").hidden = resta <= 0;
    $("#h-mais").textContent = `Mostrar mais ${Math.min(HIST_PAGINA, resta)}`;
  }
  /* digitou no código → nome bloqueado; digitou no nome → código bloqueado */
  function travas() {
    const porCod = inCod.value.length > 0, porNome = !porCod && inNome.value.length > 0;
    inNome.readOnly = porCod; inCod.readOnly = porNome;
    $("#hc-nome").classList.toggle("bloq", porCod);
    $("#hc-cod").classList.toggle("bloq", porNome);
    inCod.placeholder = porNome ? "Limpe o nome" : "Ex.: 952420";
    inNome.placeholder = porCod ? "Bloqueado — limpe o código para buscar pelo nome" : "Termos do nome, em qualquer ordem… ex.: difus 2x110";
    $("#hl-cod").hidden = !inCod.value;
    $("#hl-nome").hidden = !inNome.value;
  }
  function atualizar() {
    travas();
    res = filtrarHistorico(linhas, f);
    pagina = 1;
    $("#h-resumo").innerHTML = resumoHistorico(res, f);
    desenhar();
    try { sessionStorage.setItem("rq.hist", JSON.stringify(f)); } catch { /* sem sessão: segue */ }
  }
  const limpar = (campo) => {
    if (campo === inCod) f.cod = ""; else f.nome = "";
    campo.value = "";
    atualizar();
    campo.focus();
  };
  inCod.oninput = () => { if (!inCod.readOnly) { f.cod = inCod.value; atualizar(); } };
  inNome.oninput = () => { if (!inNome.readOnly) { f.nome = inNome.value; atualizar(); } };
  for (const el of [inCod, inNome]) {
    const outro = el === inCod ? "NOME" : "CÓDIGO";
    const avisar = (e) => {
      if (!el.readOnly) return;
      if (e.type === "keydown" && e.key.length !== 1 && e.key !== "Backspace" && e.key !== "Delete") return;
      toast(`🔒 Campo bloqueado: limpe o ${outro} para buscar por aqui.`);
    };
    el.addEventListener("keydown", avisar);
    el.addEventListener("mousedown", avisar);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.value && !el.readOnly) { e.preventDefault(); limpar(el); }
    });
  }
  $("#hl-cod").onclick = () => limpar(inCod);
  $("#hl-nome").onclick = () => limpar(inNome);
  $("#h-espacos").onchange = (e) => { f.espacos = e.target.checked; atualizar(); };
  $("#h-tipo").onchange = (e) => { f.tipo = e.target.value; atualizar(); };
  $("#h-mais").onclick = () => { pagina++; desenhar(); };
  /* chip de código no resumo: mostra só aquele código */
  $("#h-resumo").onclick = (e) => {
    const b = e.target.closest("[data-cod]"); if (!b) return;
    f.nome = ""; inNome.value = "";
    f.cod = b.dataset.cod; inCod.value = f.cod;
    atualizar(); inCod.focus();
  };

  atualizar();
  const foco = f.nome ? inNome : inCod;
  foco.focus();
  foco.setSelectionRange(foco.value.length, foco.value.length);
}

/* ============================================================
   TELA: BUSCA DE CÓDIGOS
   Procura no BANCO DE ITENS inteiro (não só no que já foi lançado).
   Critérios: termos em qualquer ordem (com -exclusão e "frase exata"),
   código (começo, parte ou LISTA colada para conferir), começa com
   (família), sem as palavras, unidade, uso na unidade, situação e ordem.
   Busca flexível: ignora espaços/traços, entende abreviações e plurais
   (DISJUNTORES acha DISJ) e medidas com vírgula ou ponto (2,5 = 2.5).
   Buscas podem ser salvas neste navegador ("Minhas buscas").
   ============================================================ */
const BC_PAGINA = 30;
const BC_SALVAS = "rq.buscasCodigos";
const BC_PADRAO = { q: "", cod: "", codModo: "inicio", familia: "", sem: "", un: "", uso: "", sit: "", ordem: "rel",
                    espacos: true, abrev: true, medidas: true, outros: false };

/* Abreviações e sinônimos que NÃO são só o começo da palavra.
   (As que são começo — DISJ, TERM, PARAF, ROLAM, CONTAT… — já funcionam sozinhas.)
   Para acrescentar: PALAVRA: ["ABREV", …] — maiúsculas, sem acento. Vale nos dois sentidos. */
const BC_ABREV = {
  CAIXA: ["CX"], ROLAMENTO: ["ROL"], MOTOR: ["MOT"], TRANSFORMADOR: ["TRAFO", "TR"], INVERSOR: ["INV"],
  FUSIVEL: ["FUS"], VALVULA: ["VLV"], CILINDRO: ["CIL"], ARRUELA: ["ARR"], CONECTOR: ["CON"],
  CONTATOR: ["CONT"], LUMINARIA: ["LUM"], RETENTOR: ["RET"], ENGRENAGEM: ["ENG"], REDUCAO: ["RED"],
  COTOVELO: ["COT", "JOELHO"], JOELHO: ["COTOVELO", "COT"], BUCHA: ["BCH"], CHAVE: ["CH"], TOMADA: ["TOM"],
  CABECA: ["CAB"], ALUMINIO: ["AL"], POLEGADA: ["POL"], TRIFASICO: ["TRIF", "3F"], MONOFASICO: ["MONOF", "1F"],
  BIFASICO: ["BIF", "2F"], NIVEL: ["NIV"], VELOCIDADE: ["VEL"], VEDACAO: ["VED"], ACOPLAMENTO: ["ACOP"],
  ELEMENTO: ["ELEM"], FILTRO: ["FILT", "FTR"], BOMBA: ["BBA"], TRANSMISSOR: ["TX", "TRANSM"], FONTE: ["FT"],
  PARAFUSO: ["PARAF", "PRF"], PORCA: ["PCA"], GALVANIZADO: ["GALV", "ZINC", "ZINCADO"], INOXIDAVEL: ["INOX"],
  PNEUMATICO: ["PNEUM", "PN"], HIDRAULICO: ["HIDR", "HID"], ELETRICO: ["ELET", "ELETR"], SOLENOIDE: ["SOL"],
  LAMPADA: ["LAMP", "LP"], ROLDANA: ["POLIA"], POLIA: ["ROLDANA"], SUPORTE: ["SUP"], DIAMETRO: ["DIAM", "DIA"],
  COMPRIMENTO: ["COMP"], ESPESSURA: ["ESP"], CAPACITOR: ["CAP"], CONDUTOR: ["COND"], ISOLADOR: ["ISOL"],
  ABRACADEIRA: ["ABRAC"], ELETRODUTO: ["ELETROD"], RESISTENCIA: ["RESIST", "RES"], MANOMETRO: ["MANOM"],
  TERMOMETRO: ["TERMOM"], CORREIA: ["CORR"], MANGUEIRA: ["MANG"], PRESSOSTATO: ["PRESS"], TEMPORIZADOR: ["TEMPOR"],
};
const BC_ABREV_LISTA = Object.entries(BC_ABREV);
const BC_REVERSO = new Map();                         // TRAFO → [TRANSFORMADOR]
for (const [k, v] of BC_ABREV_LISTA) for (const a of v) { if (!BC_REVERSO.has(a)) BC_REVERSO.set(a, []); BC_REVERSO.get(a).push(k); }
/* palavras curtas comuns que não valem como abreviação (PARA não é PARAFUSO) */
const BC_PARADAS = new Set(["PARA", "PELO", "PELA", "COMO", "CADA", "ENTRE", "SOBRE", "TIPO", "MODELO", "PECA", "PECAS"]);


/* índice por código (refeito só quando o banco muda) */
let bcMapaFonte = null, bcMapa = new Map();
function bcPorCodigo() {
  if (bcMapaFonte !== BANCO) { bcMapa = new Map(BANCO.map(it => [it.c, it])); bcMapaFonte = BANCO; }
  return bcMapa;
}
const bcUn = (it) => norm(it.u).trim() || "—";
const bcFamilia = (it) => it.fam || (it.fam = (it.n.split(/[^A-Z0-9]+/).find(Boolean) || "—"));
const bcColl = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

/* quantas vezes cada código entrou nas requisições da unidade */
function bcUsoNaUnidade() {
  const m = new Map();
  for (const l of listasUN()) {
    const data = l.data || l.criadoEm || "";
    for (const i of (l.itens || [])) {
      const c = String(i.codigo ?? "").trim();
      if (!c || c === "S/ CÓD.") continue;
      let u = m.get(c);
      if (!u) m.set(c, u = { n: 0, req: new Set(), ult: "", nome: i.descricao || "" });
      u.n++; u.req.add(l.id);
      if (data > u.ult) { u.ult = data; u.nome = i.descricao || u.nome; }
    }
  }
  return m;
}

/* campo de termos: palavras, "frases exatas" e -exclusões */
function bcLerTermos(txt) {
  const inc = [], exc = [], re = /(-?)"([^"]*)"?|(\S+)/g, s = norm(txt);
  let m;
  while ((m = re.exec(s))) {
    if (m[3] !== undefined) {
      if (m[3].length > 1 && m[3][0] === "-") exc.push(m[3].slice(1));
      else if (m[3] !== "-") inc.push(m[3]);
    } else {
      const fr = m[2].trim().replace(/\s+/g, " ");
      if (fr) (m[1] ? exc : inc).push(fr);
    }
  }
  return { inc, exc };
}
/* campo de código: um código, ou vários (colados do Excel, separados por espaço, vírgula, ponto e vírgula) */
function bcCodigos(txt) {
  const tk = norm(txt).split(/[\s,;|]+/).filter(Boolean);
  if (tk.length < 2) return tk;
  const mapa = bcPorCodigo(), vistos = new Set();
  return tk.filter(t => (mapa.has(t) || /^\d{3,}$/.test(t)) && !vistos.has(t) && vistos.add(t));
}

/* prepara um termo: variações aceitas (medida, abreviação, sinônimo) */
function bcPrepTermo(t, f) {
  const medida = /\d[.,]\d/.test(t);
  const P = { t, ns: medida ? "" : semEspaco(t), alt: [], tok: [], pref: false };
  if (f.medidas && medida) P.alt.push(t.replace(/[.,]/g, c => c === "," ? "." : ","));
  if (medida && !f.medidas) P.ns = semEspaco(t);
  if (f.abrev && /^[A-Z0-9]{2,}$/.test(t)) {
    for (const k of (BC_REVERSO.get(t) || [])) P.alt.push(k);                 // TRAFO → TRANSFORMADOR
    if (/^[A-Z]{4,}$/.test(t)) {
      P.pref = true;                                                            // PARAFUSOS aceita PARAF, PARAFUSO…
      for (const [k, v] of BC_ABREV_LISTA)
        if (k === t || (t.length >= 5 && (k.startsWith(t) || t.startsWith(k)))) P.tok.push(...v);   // CAIXAS → CX
    }
  }
  return P;
}
const bcLetraNum = (ch) => ch >= "A" && ch <= "Z" || ch >= "0" && ch <= "9";
/* custo do encaixe de um termo no item (-1 = não serve): quanto menor, melhor */
function bcCusto(it, P, f) {
  const p = it.n.indexOf(P.t);
  if (p >= 0) return (p === 0 || !bcLetraNum(it.n[p - 1])) ? 0 : 2;
  for (const a of P.alt) if (it.n.includes(a)) return 3;
  if (f.espacos && P.ns && it.ns.includes(P.ns)) return 4;
  if (P.pref || P.tok.length) {
    const tk = it.tk || (it.tk = it.n.split(/[^A-Z0-9]+/));
    for (const w of tk) {
      if (P.tok.includes(w)) return 5;
      if (P.pref && w.length >= 4 && w.length < P.t.length && P.t.startsWith(w) && !BC_PARADAS.has(w)) return 6;
    }
  }
  return -1;
}
/* o trecho que encaixou (para destacar na descrição) */
function bcTrecho(it, P, f) {
  if (it.n.includes(P.t)) return P.t;
  for (const a of P.alt) if (it.n.includes(a)) return a;
  if (P.pref || P.tok.length) {
    for (const w of (it.tk || it.n.split(/[^A-Z0-9]+/))) {
      if (P.tok.includes(w)) return w;
      if (P.pref && w.length >= 4 && w.length < P.t.length && P.t.startsWith(w) && !BC_PARADAS.has(w)) return w;
    }
  }
  return "";
}

const bcSemCriterio = (f) => !f.q.trim() && !f.cod.trim() && !f.familia.trim() && !f.sem.trim() && !f.un && !f.uso && !f.sit;

function bcBuscar(f, uso) {
  const { inc, exc } = bcLerTermos(f.q);
  const excl = [...exc, ...norm(f.sem).split(/[\s,;]+/).filter(Boolean)];
  const Ps = inc.map(t => bcPrepTermo(t, f));
  const codTk = bcCodigos(f.cod);
  const c1 = codTk.length === 1 ? codTk[0].replace(/\s/g, "") : "";
  const fam = norm(f.familia).trim();
  const vazio = bcSemCriterio(f);
  const base = [];
  for (let i = 0; i < BANCO.length; i++) {
    const it = BANCO[i];
    const u = uso.get(it.c);
    if (vazio && !u) continue;                        // sem critério: só os já usados na unidade
    if (c1 && !(f.codModo === "parte" ? it.c.includes(c1) : it.c.startsWith(c1))) continue;
    if (f.sit === "ativos" && !it.a) continue;
    if (f.sit === "inativos" && it.a) continue;
    if (f.uso) {
      const p = !!precos["C:" + it.c];
      if (f.uso === "usados" && !u) continue;
      if (f.uso === "preco" && !p) continue;
      if (f.uso === "nunca" && (u || p)) continue;
    }
    let custo = 0, ok = true;
    for (const P of Ps) { const k = bcCusto(it, P, f); if (k < 0) { ok = false; break; } custo += k; }
    if (!ok) continue;
    if (excl.length && excl.some(t => it.n.includes(t))) continue;
    const p0 = Ps.length ? Math.max(0, it.n.indexOf(Ps[0].t)) : 0;
    const s = custo * 10 + Math.min(p0, 40) / 4 + (it.a ? 0 : 500)
            - (u ? 12 + Math.min(u.n, 10) : 0) - (precos["C:" + it.c] ? 4 : 0) + (c1 ? it.c.length : 0);
    base.push({ it, s, u });
  }
  /* família e unidade: contagens para os chips, cada uma sem o próprio filtro */
  const fams = new Map(), uns = new Map(), res = [];
  for (const r of base) {
    const okF = !fam || r.it.n.startsWith(fam), okU = !f.un || bcUn(r.it) === f.un;
    if (okU) { const k = bcFamilia(r.it); fams.set(k, (fams.get(k) || 0) + 1); }
    if (okF) { const k = bcUn(r.it); uns.set(k, (uns.get(k) || 0) + 1); }
    if (okF && okU) res.push(r);
  }
  const usoN = (r) => r.u ? r.u.n : 0;
  const ordem = vazio && f.ordem === "rel" ? "uso" : f.ordem;
  const cmp = {
    uso: (a, b) => usoN(b) - usoN(a) || a.s - b.s,
    cod: (a, b) => bcColl.compare(a.it.c, b.it.c),
    desc: (a, b) => bcColl.compare(a.it.d, b.it.d) || bcColl.compare(a.it.c, b.it.c),
    rel: (a, b) => a.s - b.s || a.it.d.length - b.it.d.length || bcColl.compare(a.it.c, b.it.c),
  }[ordem] || ((a, b) => a.s - b.s);
  res.sort(cmp);
  return { res, fams, uns, Ps, nBase: base.length, vazio };
}

/* lista de códigos colada: cada código na ordem em que veio, com os que faltam no banco */
function bcConferir(codTk, uso) {
  const mapa = bcPorCodigo();
  return codTk.map(c => { const it = mapa.get(c); return it ? { it, u: uso.get(c) } : { falta: c, u: uso.get(c) }; });
}

async function copiarTexto(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch { /* sem permissão: tenta o jeito antigo */ }
  const ta = document.createElement("textarea");
  ta.value = txt; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch { /* nada */ }
  ta.remove();
  return ok;
}

function telaBuscaCodigos(app) {
  const f = { ...BC_PADRAO };
  try { Object.assign(f, JSON.parse(sessionStorage.getItem("rq.codigos") || "{}")); } catch { /* padrão */ }
  let pagina = 1, R = null, linhasVis = [], lista = null;
  const UNOME = esc(UNI().nome);
  const movel = window.matchMedia && window.matchMedia("(max-width:900px)").matches;
  const painelAberto = sessionStorage.getItem("rq.bcPainel");

  app.innerHTML = `<div id="bc-tela">
    <div class="pagina-titulo">
      <h1>Busca de códigos</h1><span class="etiqueta tipo">${UNOME}</span>
      <span class="espacador"></span>
      <span class="h-total" id="bc-total"></span>
    </div>
    <div class="bc-salvas" id="bc-salvas"></div>
    <div class="h-filtros bc-filtros">
      <div class="h-campo nome">
        <label for="bc-q">Descrição</label>
        <input type="text" id="bc-q" autocomplete="off" spellcheck="false" enterkeyhint="search"
               placeholder="Termos em qualquer ordem… ex.: disjuntor 3p 32a">
        <button class="h-limpar" id="bcl-q" title="Limpar (Esc)" hidden>✕</button>
      </div>
      <div class="h-campo cod">
        <label for="bc-cod">Código</label>
        <input type="text" id="bc-cod" inputmode="numeric" autocomplete="off" spellcheck="false" enterkeyhint="search"
               placeholder="Ex.: 9524 — ou cole vários">
        <button class="h-limpar" id="bcl-cod" title="Limpar (Esc)" hidden>✕</button>
      </div>
      <label class="check bc-outros" title="Itens que não são de manutenção/engenharia/adm (comida, roupa, agro, loja…) não vêm no banco do aparelho; esta opção procura só neles, direto na nuvem">
        <input type="checkbox" id="bc-outros"> Buscar outros <small>itens fora da manutenção · direto na nuvem</small></label>
      <div class="bc-dica"><code>-palavra</code> exclui · <code>"frase exata"</code> entre aspas ·
        cole uma lista de códigos (do Excel) para conferir todos de uma vez</div>
      <details class="bc-criterios" id="bc-criterios"${painelAberto === "1" || (painelAberto == null && !movel) ? " open" : ""}>
        <summary>Critérios <span class="bc-nativos" id="bc-nativos"></span></summary>
        <div class="bc-grade">
          <label class="bc-crit"><span>Começa com</span>
            <input type="text" id="bc-familia" autocomplete="off" spellcheck="false" placeholder="ex.: CABO, DISJ, TERMINAL"></label>
          <label class="bc-crit"><span>Sem as palavras</span>
            <input type="text" id="bc-sem" autocomplete="off" spellcheck="false" placeholder="ex.: locacao kit"></label>
          <label class="bc-crit"><span>Unidade de medida</span><select id="bc-un"></select></label>
          <label class="bc-crit"><span>Uso na ${UNOME}</span><select id="bc-uso">
            <option value="">Todos os itens do banco</option><option value="usados">Já usados em requisições</option>
            <option value="preco">Com preço registrado</option><option value="nunca">Nunca usados</option></select></label>
          <label class="bc-crit"><span>Situação</span><select id="bc-sit">
            <option value="">Ativos e desativados</option><option value="ativos">Só ativos</option><option value="inativos">Só desativados</option></select></label>
          <label class="bc-crit"><span>Código digitado</span><select id="bc-codmodo">
            <option value="inicio">No começo do código</option><option value="parte">Em qualquer parte</option></select></label>
          <label class="bc-crit"><span>Ordenar por</span><select id="bc-ordem">
            <option value="rel">Relevância</option><option value="uso">Mais usados</option>
            <option value="cod">Código</option><option value="desc">Descrição (A–Z)</option></select></label>
        </div>
        <div class="bc-flex">
          <label class="check"><input type="checkbox" id="bc-espacos"> Ignorar espaços e traços <small>4X2,5 = 4 X 2,5</small></label>
          <label class="check"><input type="checkbox" id="bc-abrev"> Abreviações e plurais <small>disjuntores acha DISJ</small></label>
          <label class="check"><input type="checkbox" id="bc-medidas"> Vírgula = ponto <small>2,5 = 2.5</small></label>
          <span class="espacador"></span>
          <button class="btn sec mini" id="bc-zerar" title="Volta todos os critérios ao padrão">Limpar tudo</button>
        </div>
      </details>
    </div>
    <div class="h-resumo" id="bc-resumo"></div>
    <div class="h-rolagem bc-rolagem">
      <table class="app bc">
        <thead><tr><th>Código</th><th>Descrição</th><th>Un</th><th class="num">Último preço</th><th>Uso na ${UNOME}</th><th></th></tr></thead>
        <tbody id="bc-corpo"></tbody>
      </table>
    </div>
    <div class="h-rodape"><span id="bc-conta"></span><button class="btn sec" id="bc-mais" hidden></button>
      <button class="btn sec" id="bc-copiar-tudo" hidden title="Copia código, descrição e unidade — cola direto no Excel">📋 Copiar resultados</button></div>
  </div>`;

  const inQ = $("#bc-q"), inCod = $("#bc-cod"), det = $("#bc-criterios");
  const campos = { familia: "#bc-familia", sem: "#bc-sem", un: "#bc-un", uso: "#bc-uso", sit: "#bc-sit", codModo: "#bc-codmodo", ordem: "#bc-ordem" };
  const marcas = { espacos: "#bc-espacos", abrev: "#bc-abrev", medidas: "#bc-medidas", outros: "#bc-outros" };

  function opcoesUnidade() {
    const cont = new Map();
    for (const it of BANCO) { const k = bcUn(it); cont.set(k, (cont.get(k) || 0) + 1); }
    const ord = [...cont].sort((a, b) => b[1] - a[1]).slice(0, 40);
    if (f.un && !cont.has(f.un)) ord.push([f.un, 0]);
    $("#bc-un").innerHTML = `<option value="">Todas</option>` + ord.map(([u, n]) => `<option value="${esc(u)}">${esc(u)} (${n.toLocaleString("pt-BR")})</option>`).join("");
    $("#bc-un").value = f.un;
  }
  function preencher() {
    inQ.value = f.q; inCod.value = f.cod;
    for (const [k, s] of Object.entries(campos)) $(s).value = f[k];
    for (const [k, s] of Object.entries(marcas)) $(s).checked = k === "outros" ? !!f.outros : f[k] !== false;
  }
  const nAtivos = () => ["familia", "sem"].filter(k => f[k].trim()).length
    + ["un", "uso", "sit"].filter(k => f[k]).length + (f.codModo !== "inicio") + (f.ordem !== "rel")
    + ["espacos", "abrev", "medidas"].filter(k => f[k] === false).length;

  /* ---------- minhas buscas (salvas neste navegador) ---------- */
  const salvas = () => { const s = LS.ler(BC_SALVAS, []); return Array.isArray(s) ? s : []; };
  function desenharSalvas() {
    const s = salvas();
    $("#bc-salvas").innerHTML = (s.length ? `<span class="bc-salvas-rot">Minhas buscas</span>` : "")
      + s.map((b, i) => `<span class="bc-salva"><button data-salva="${i}" title="Aplicar esta busca">★ ${esc(b.nome)}</button><button class="bc-salva-x" data-apagar="${i}" title="Apagar esta busca salva">✕</button></span>`).join("")
      + `<button class="bc-salvar" id="bc-salvar" ${bcSemCriterio(f) && !nAtivos() ? "disabled" : ""} title="Guarda os critérios atuais com um nome (neste navegador)">☆ Salvar esta busca</button>`;
  }
  $("#bc-salvas").onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const s = salvas();
    if (b.id === "bc-salvar") {
      const sug = curto(f.q || f.familia || f.cod || "Minha busca", 30);
      const nome = await perguntar("Salvar esta busca", "Nome", sug, { obrigatorio: true });
      if (!nome) return;
      const i = s.findIndex(x => x.nome.toLowerCase() === nome.toLowerCase());
      const reg = { nome: curto(nome, 40), f: { ...f } };
      if (i >= 0) s[i] = reg; else s.push(reg);
      LS.gravar(BC_SALVAS, s.slice(-24));
      desenharSalvas(); toast(`★ Busca “${reg.nome}” salva.`);
    } else if (b.dataset.apagar != null) {
      const x = s[+b.dataset.apagar];
      if (x && await confirmar({ titulo: "Apagar a busca salva?", perigo: true, ok: "Apagar", texto: `★ <strong>${esc(x.nome)}</strong>` })) { s.splice(+b.dataset.apagar, 1); LS.gravar(BC_SALVAS, s); desenharSalvas(); }
    } else if (b.dataset.salva != null) {
      const x = s[+b.dataset.salva]; if (!x) return;
      Object.assign(f, BC_PADRAO, x.f || {});
      preencher(); opcoesUnidade();
      if (nAtivos()) det.open = true;
      atualizar();
      toast(`★ ${x.nome}`);
    }
  };

  /* ---------- desenho ---------- */
  const usoHtml = (u) => u
    ? `<span title="${u.n} lançamento(s) em ${u.req.size} requisição(ões)"><b>${u.req.size}</b> req.${u.ult ? ` · últ. ${esc(dataBR(u.ult))}` : ""}</span>`
    : `<span class="bc-mudo">—</span>`;
  const precoHtml = (c) => {
    const p = precos["C:" + c];
    return p && p.preco ? `${dinheiro(p.preco)}${p.em ? `<small>${esc(dataBR(p.em))}</small>` : ""}` : `<span class="bc-mudo">—</span>`;
  };
  const codHtml = (c, c1) => (c1 && f.codModo !== "parte" && c.startsWith(c1))
    ? `<mark>${esc(c.slice(0, c1.length))}</mark>${esc(c.slice(c1.length))}`
    : (c1 && f.codModo === "parte" && c.includes(c1))
      ? esc(c.slice(0, c.indexOf(c1))) + `<mark>${esc(c1)}</mark>` + esc(c.slice(c.indexOf(c1) + c1.length)) : esc(c);
  function linha(r, k, c1) {
    if (r.falta) return `<tr class="bc-falta">
      <td class="bc-cod"><span class="bc-cod-txt">${esc(r.falta)}</span></td>
      <td class="bc-desc"><strong>Não encontrado no banco de itens.</strong>${r.u ? `<div class="bc-sub">Já foi lançado em requisições como: ${esc(r.u.nome)}</div>` : ""}</td>
      <td class="bc-un"></td><td class="bc-preco num">${precoHtml(r.falta)}</td><td class="bc-uso">${usoHtml(r.u)}</td>
      <td class="bc-acoes">${r.u ? `<button class="btn sec mini" data-hist="${esc(r.falta)}">🕘 Histórico</button>` : ""}</td></tr>`;
    const it = r.it;
    const hl = R ? R.Ps.map(P => bcTrecho(it, P, f)).filter(Boolean) : [];
    return `<tr class="${it.a ? "" : "bc-inativo"}">
      <td class="bc-cod"><button class="bc-copiar" data-copiar="${k}" title="Copiar o código ${esc(it.c)}">${codHtml(it.c, c1)}<span class="bc-ico" aria-hidden="true">⧉</span></button></td>
      <td class="bc-desc">${marcarTermos(it.d, hl)}${it.a ? "" : ' <span class="badge-inativo">DESATIVADO</span>'}${it.outros ? ' <span class="badge-outros" title="Fora do banco de manutenção">OUTROS</span>' : ""}</td>
      <td class="bc-un">${esc(it.u)}</td>
      <td class="bc-preco num">${precoHtml(it.c)}</td>
      <td class="bc-uso">${usoHtml(r.u)}</td>
      <td class="bc-acoes">
        <button class="btn sec mini" data-copiar-desc="${k}" title="Copiar código e descrição">⧉ Cód. + descrição</button>
        ${r.u ? `<button class="btn sec mini" data-hist="${esc(it.c)}" title="Ver este código no Histórico por item">🕘 Histórico</button>` : ""}
        <button class="btn sec mini" data-google="${k}" title="Pesquisar a descrição no Google (nova guia)">🔍 Google</button>
      </td></tr>`;
  }
  function desenhar() {
    const todas = lista || R.res;
    linhasVis = todas.slice(0, pagina * BC_PAGINA);
    const c1 = !lista ? (bcCodigos(f.cod)[0] || "") : "";
    $("#bc-corpo").innerHTML = linhasVis.map((r, k) => linha(r, k, c1)).join("")
      || `<tr><td colspan="6" class="h-vazio">${R && R.online && R.carregando
          ? "Buscando na nuvem…"
          : R && R.online && R.erro ? esc(R.erro)
          : !BANCO.length && !(R && R.online)
          ? "O banco de itens ainda está carregando…"
          : R && R.vazio
            ? `Nenhum código usado ainda nas requisições da ${UNOME}. Digite acima para procurar nos itens do banco.`
            : "Nenhum código encontrado.<br><small>Tente menos termos, confira “Abreviações” e “Ignorar espaços” em Critérios, ou use “Limpar tudo”.</small>"}</td></tr>`;
    const tot = todas.length;
    $("#bc-conta").textContent = tot ? `Mostrando ${linhasVis.length} de ${tot.toLocaleString("pt-BR")}` : "";
    const resta = tot - linhasVis.length;
    $("#bc-mais").hidden = resta <= 0;
    $("#bc-mais").textContent = `Mostrar mais ${Math.min(BC_PAGINA, resta)}`;
    $("#bc-copiar-tudo").hidden = !tot;
  }
  function resumo() {
    const nuvem = R && R.online
      ? `<div class="bc-nuvem">🌐 ${f.outros ? "<strong>Buscar outros</strong>: só itens fora da manutenção, direto na nuvem"
          : "Busca on-line enquanto o banco baixa neste aparelho"} — até 200 resultados, sem abreviações.</div>` : "";
    if (R && R.online) {
      if (R.carregando) return nuvem;
      if (lista) {
        const ach = lista.filter(r => !r.falta).length, falta = lista.length - ach;
        return nuvem + `Conferência de lista: <strong>${lista.length}</strong> código(s) · <strong>${ach}</strong> encontrado(s)`
          + (falta ? ` · <strong class="bc-alerta">${falta} não encontrado(s)</strong>` : " · todos no banco ✔");
      }
      if (R.vazio) return nuvem + `Mostrando os códigos já usados nas requisições da ${UNOME}. Digite acima para procurar.`;
      return nuvem + `<strong>${R.res.length.toLocaleString("pt-BR")}</strong> código(s) encontrado(s)` + (R.res.length >= 200 ? " — refine para ver outros" : "");
    }
    if (!BANCO.length) return "Carregando o banco de itens…";
    if (lista) {
      const ach = lista.filter(r => !r.falta).length, falta = lista.length - ach;
      return `Conferência de lista: <strong>${lista.length}</strong> código(s) colado(s) · <strong>${ach}</strong> encontrado(s)`
        + (falta ? ` · <strong class="bc-alerta">${falta} não encontrado(s)</strong>` : " · todos no banco ✔")
        + `<br><small>Na conferência de lista, os outros critérios não se aplicam.</small>`;
    }
    if (R.vazio) return `Sem critérios: mostrando os <strong>${R.res.length.toLocaleString("pt-BR")}</strong> códigos já usados nas requisições da ${UNOME}, dos mais usados para os menos. `
      + `Digite acima para procurar nos <strong>${BANCO.length.toLocaleString("pt-BR")}</strong> itens do banco.`;
    let h = `<strong>${R.res.length.toLocaleString("pt-BR")}</strong> código(s) encontrado(s)`;
    if (R.res.length !== R.nBase) h += ` de ${R.nBase.toLocaleString("pt-BR")}`;
    const chips = (rot, mapa, ativo, attr, nomeTodos) => {
      if (!ativo && mapa.size < 2) return "";
      const top = [...mapa].sort((a, b) => b[1] - a[1]).slice(0, movel ? 8 : 14);
      return `<div class="h-chips bc-chips"><span class="bc-chips-rot">${rot}:</span>`
        + (ativo ? `<button class="h-chip bc-ativo" data-${attr}="" title="Remover este filtro">${esc(ativo)} ✕</button>` : "")
        + (ativo ? "" : top.map(([k, n]) => `<button class="h-chip" data-${attr}="${esc(k)}">${esc(k)} <b>${n.toLocaleString("pt-BR")}</b></button>`).join(""))
        + (!ativo && mapa.size > top.length ? `<span class="h-mais-cod">+${mapa.size - top.length}</span>` : "")
        + (ativo ? "" : `<span class="bc-dica-chip">${nomeTodos}</span>`) + `</div>`;
    };
    h += chips("Começa com", R.fams, norm(f.familia).trim(), "familia", "toque para filtrar");
    h += chips("Unidade", R.uns, f.un, "un", "");
    return h;
  }
  function travas() {
    $("#bcl-q").hidden = !inQ.value; $("#bcl-cod").hidden = !inCod.value;
    const n = nAtivos();
    $("#bc-nativos").textContent = n ? `${n} ativo(s)` : "";
    const tk = bcCodigos(inCod.value);
    $("#bc-cod").closest(".h-campo").classList.toggle("bc-lista", tk.length > 1);
    $("label[for=bc-cod]").textContent = tk.length > 1 ? `Código · lista de ${tk.length}` : "Código";
  }
  /* na nuvem: banco ainda baixando ou "Buscar outros" (critérios simples, sem abreviações) */
  let seqNuvem = 0;
  async function atualizarNaNuvem(uso) {
    const seq = ++seqNuvem;
    const tk = norm(f.cod).split(/[\s,;|]+/).filter(Boolean);
    lista = null;
    R = { res: [], fams: new Map(), uns: new Map(), Ps: [], nBase: 0, vazio: false, online: true, carregando: true };
    pagina = 1; $("#bc-resumo").innerHTML = resumo(); desenhar();
    if (!f.outros && bcSemCriterio(f)) {                         // sem critério: os já usados (nomes do histórico)
      const res = [...uso].map(([c, u]) => ({ it: itemDoBanco(c, u.nome || "", "", 1), s: 0, u })).sort((a, b) => b.u.n - a.u.n);
      if (seq !== seqNuvem) return;
      R = { res, fams: new Map(), uns: new Map(), Ps: [], nBase: res.length, vazio: true, online: true };
    } else if (tk.length > 1) {                                  // lista colada: confere os códigos direto na tabela
      let rows = [], erro = "";
      if (!sb) erro = "Busca na nuvem indisponível no modo local.";
      else {
        const r = await sb.from("req_itens").select("codigo,descricao,un,ativo,escopo").in("codigo", tk.slice(0, 500));
        if (r.error) erro = r.error.message; else rows = r.data || [];
      }
      if (seq !== seqNuvem) return;
      const mapa = new Map(rows.map(x => [String(x.codigo), x]));
      lista = [...new Set(tk)].map(c => { const x = mapa.get(c);
        return x ? { it: Object.assign(itemDoBanco(c, x.descricao, x.un, x.ativo ? 1 : 0), { outros: x.escopo === "outros" }), u: uso.get(c) } : { falta: c, u: uso.get(c) }; });
      R = { res: [], fams: new Map(), uns: new Map(), Ps: [], nBase: 0, vazio: false, online: true, erro };
    } else {
      const { inc, exc } = bcLerTermos(f.q);
      const termos = [...inc.map(t => t.includes(" ") ? t.split(" ") : [t]).flat(), ...(tk[0] ? [tk[0]] : []),
                      ...(norm(f.familia).trim() ? [norm(f.familia).trim()] : []),
                      ...[...exc, ...norm(f.sem).split(/[\s,;]+/).filter(Boolean)].map(t => "-" + t)];
      const r = await buscarNaNuvem(termos.join(" "), f.outros ? "outros" : (f.sit === "inativos" ? "outros" : "nucleo"), 200, f.espacos !== false);
      if (seq !== seqNuvem) return;
      const fam = norm(f.familia).trim();
      let res = (r.ok ? r.itens : []).filter(it => (!fam || it.n.startsWith(fam)) && (!f.un || bcUn(it) === f.un)
        && (f.sit !== "ativos" || it.a) && (f.sit !== "inativos" || !it.a))
        .map((it, k) => ({ it, s: k, u: uso.get(it.c) }))
        .filter(x => !f.uso || (f.uso === "usados" ? x.u : f.uso === "preco" ? precos["C:" + x.it.c] : !(x.u || precos["C:" + x.it.c])));
      const cmp = { uso: (a, b) => (b.u ? b.u.n : 0) - (a.u ? a.u.n : 0) || a.s - b.s, cod: (a, b) => bcColl.compare(a.it.c, b.it.c),
                    desc: (a, b) => bcColl.compare(a.it.d, b.it.d) }[f.ordem];
      if (cmp) res.sort(cmp);
      R = { res, fams: new Map(), uns: new Map(), Ps: inc.map(t => bcPrepTermo(t, f)), nBase: res.length, vazio: false, online: true, erro: r.ok ? "" : r.motivo };
    }
    pagina = 1;
    $("#bc-resumo").innerHTML = resumo();
    desenhar();
  }
  function atualizar() {
    travas();
    const uso = bcUsoNaUnidade();
    $("#bc-total").textContent = BANCO.length ? `${BANCO.length.toLocaleString("pt-BR")} itens no banco` : (BANCO_EST.baixando ? "banco baixando…" : "banco carregando…");
    try { sessionStorage.setItem("rq.codigos", JSON.stringify(f)); } catch { /* sem sessão */ }
    if (f.outros || !bancoPronto()) { desenharSalvas(); atualizarNaNuvem(uso); return; }
    seqNuvem++;
    const tk = bcCodigos(f.cod);
    lista = tk.length > 1 ? bcConferir(tk, uso) : null;
    R = lista ? { res: [], fams: new Map(), uns: new Map(), Ps: [], nBase: 0, vazio: false } : bcBuscar(f, uso);
    pagina = 1;
    $("#bc-resumo").innerHTML = resumo();
    desenhar();
    desenharSalvas();
  }

  /* ---------- eventos ---------- */
  let timer = null;
  const depois = () => { clearTimeout(timer); timer = setTimeout(atualizar, (f.outros || !bancoPronto()) ? 350 : 140); };
  inQ.oninput = () => { f.q = inQ.value; travas(); depois(); };
  inCod.oninput = () => { f.cod = inCod.value; travas(); depois(); };
  /* lista colada do Excel: quebras de linha e tabulações viram espaço (o campo apagaria as quebras) */
  inCod.addEventListener("paste", (e) => {
    const t = e.clipboardData && e.clipboardData.getData("text");
    if (!t || !/[\r\n\t]/.test(t.trim())) return;
    e.preventDefault();
    inCod.setRangeText(t.split(/[\r\n\t]+/).map(s => s.trim()).filter(Boolean).join(" "), inCod.selectionStart, inCod.selectionEnd, "end");
    inCod.dispatchEvent(new Event("input"));
  });
  for (const el of [inQ, inCod]) el.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.value) { e.preventDefault(); el.value = ""; el.dispatchEvent(new Event("input")); }
    if (e.key === "Enter") { e.preventDefault(); clearTimeout(timer); atualizar(); if (movel) el.blur(); }   // celular: fecha o teclado
  });
  $("#bcl-q").onclick = () => { inQ.value = ""; f.q = ""; atualizar(); inQ.focus(); };
  $("#bcl-cod").onclick = () => { inCod.value = ""; f.cod = ""; atualizar(); inCod.focus(); };
  for (const [k, s] of Object.entries(campos)) {
    const el = $(s);
    if (el.tagName === "SELECT") el.onchange = () => { f[k] = el.value; atualizar(); };
    else el.oninput = () => { f[k] = el.value; travas(); depois(); };
  }
  for (const [k, s] of Object.entries(marcas)) $(s).onchange = (e) => { f[k] = e.target.checked; atualizar(); };
  $("#bc-zerar").onclick = () => { Object.assign(f, BC_PADRAO); preencher(); opcoesUnidade(); atualizar(); inQ.focus(); };
  det.addEventListener("toggle", () => { try { sessionStorage.setItem("rq.bcPainel", det.open ? "1" : "0"); } catch { /* nada */ } });
  $("#bc-mais").onclick = () => { pagina++; desenhar(); };
  $("#bc-resumo").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.familia != null) { f.familia = b.dataset.familia; $("#bc-familia").value = f.familia; }
    else if (b.dataset.un != null) { f.un = b.dataset.un; $("#bc-un").value = f.un; }
    else return;
    atualizar();
  };
  $("#bc-copiar-tudo").onclick = async () => {
    const todas = (lista || R.res).slice(0, 5000);
    const lin = todas.map(r => r.falta ? [r.falta, "NÃO ENCONTRADO NO BANCO", ""] : [r.it.c, r.it.d, r.it.u]);
    const ok = await copiarTexto(["CÓDIGO\tDESCRIÇÃO\tUN", ...lin.map(l => l.join("\t"))].join("\r\n"));
    toast(ok ? `📋 ${lin.length.toLocaleString("pt-BR")} linha(s) copiadas — cole no Excel.` : "Não consegui copiar neste navegador.");
  };
  $("#bc-corpo").onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const d = b.dataset;
    if (d.hist) {
      try { sessionStorage.setItem("rq.hist", JSON.stringify({ cod: d.hist, nome: "", espacos: true, tipo: "" })); } catch { /* nada */ }
      location.hash = "#/historico";
      return;
    }
    const r = linhasVis[+(d.copiar ?? d.copiarDesc ?? d.google)];
    if (!r || !r.it) return;
    if (d.google != null) {
      sessionStorage.setItem("rq.lupa", r.it.c);
      window.open("https://www.google.com/search?q=" + encodeURIComponent(r.it.d), "_blank", "noopener");
      return;
    }
    const txt = d.copiar != null ? r.it.c : `${r.it.c} - ${r.it.d}`;
    if (await copiarTexto(txt)) {
      toast(d.copiar != null ? `Código ${r.it.c} copiado.` : "Código e descrição copiados.");
      const tr = b.closest("tr");
      tr.classList.remove("bc-copiado"); void tr.offsetWidth; tr.classList.add("bc-copiado");
    } else toast("Não consegui copiar neste navegador.");
  };

  /* o banco chega depois (cache/nuvem): redesenha sem perder o que foi digitado */
  aoMudarBanco = () => {
    if (!$("#bc-tela")) { aoMudarBanco = null; return; }
    opcoesUnidade(); atualizar();
  };

  preencher(); opcoesUnidade(); atualizar();
  if (!movel) {
    const foco = f.cod && !f.q ? inCod : inQ;
    foco.focus(); foco.setSelectionRange(foco.value.length, foco.value.length);
  }
}

function baixarBlob(blob, nome) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ============================================================
   Modais: banco e backup
   ============================================================ */
/* painel "Banco de itens": o que está neste aparelho, o que está na nuvem e o pacote publicado */
async function atualizarPainelBanco() {
  const el = $("#painel-banco"); if (!el) return;
  const aqui = BANCO_EST.baixando
    ? `baixando ${Math.round(BANCO_EST.pct * 100)}% — enquanto isso a busca é on-line`
    : bancoPronto() ? `<strong>${BANCO.length.toLocaleString("pt-BR")}</strong> itens de manutenção${BANCO_EST.origem ? " · " + esc(BANCO_EST.origem) : ""}`
    : esc(BANCO_EST.erro || "ainda não baixado");
  el.innerHTML = `<div class="pb-linha"><span class="pb-rot">Neste aparelho</span><span>${aqui}</span></div>
    ${sb ? `<div class="pb-linha"><span class="pb-rot">Na nuvem</span><span id="pb-nuvem">consultando…</span></div>
    <div class="pb-linha"><span class="pb-rot">Pacote dos celulares</span><span id="pb-pacote">—</span></div>
    <p class="pb-nota">No aparelho fica só o banco de <strong>manutenção, engenharia e adm</strong>. Comida, roupa, agro, itens de loja e desativados
      ficam na nuvem e aparecem com <strong>Buscar outros</strong>. Item “outros” que entra numa RM passa sozinho para o banco de manutenção.</p>
    <div class="pb-acoes"><button class="btn sec" id="pb-rebaixar">↻ Baixar de novo neste aparelho</button>
      <button class="btn sec" id="pb-publicar" title="Gera o pacote compacto com o banco atual (use depois de mudar as regras no Supabase)">Publicar pacote agora</button></div>
    <div id="pb-msg" class="progresso" hidden></div>` : ""}`;
  if (!sb) return;
  $("#pb-rebaixar").onclick = async () => {
    if (!await confirmar({ titulo: "Baixar o banco de novo?", icone: "↻", ok: "Baixar de novo",
      texto: "Apaga a cópia deste aparelho e baixa o pacote atual (alguns MB). Enquanto baixa, a busca funciona on-line." })) return;
    await IDB.apagar("banco3").catch(() => {}); BANCO = []; avisarBancoMudou();
    carregarBanco(true); atualizarPainelBanco();
  };
  $("#pb-publicar").onclick = async () => {
    const msg = $("#pb-msg"); msg.hidden = false; msg.textContent = "Pedindo o pacote novo à nuvem…";
    $("#pb-publicar").disabled = true;
    try {
      const m = await publicarPacote((t) => { msg.textContent = t; });
      msg.innerHTML = `✓ Pacote publicado: ${(m.total || 0).toLocaleString("pt-BR")} itens (${fmtBytes(m.bytes)}). Os aparelhos baixam a versão nova ao abrir o app.`;
      carregarBanco(); setTimeout(atualizarPainelBanco, 1500);
    } catch (e) { msg.textContent = "Não foi possível publicar agora: " + e.message; }
    finally { const b = $("#pb-publicar"); if (b) b.disabled = false; }
  };
  try {
    const { data, error } = await sb.rpc("req_itens_resumo");
    const nv = $("#pb-nuvem"), pc = $("#pb-pacote"); if (!nv) return;
    if (error) { nv.textContent = semFuncao(error) ? "funções novas ainda não instaladas no banco" : error.message; return; }
    const f = (n) => (+n || 0).toLocaleString("pt-BR");
    nv.innerHTML = `<strong>${f(data.nucleo)}</strong> de manutenção · <strong>${f(data.outros)}</strong> outros <small>(${f(data.desativados)} desativados)</small> · ${f(data.usados)} já usados em RM`;
    const pac = data.pacote;
    pc.innerHTML = pac ? `${f(pac.total)} itens · ${fmtBytes(pac.bytes)} compactado · ${esc(dataHoraBR(pac.gerado_em))}` : "ainda não publicado (os aparelhos baixam em trechos)";
  } catch (e) { const nv = $("#pb-nuvem"); if (nv) nv.textContent = e.message; }
}
function ligarModais() {
  const abrir = (m) => { m.hidden = false; };
  const fechar = (m) => { m.hidden = true; };
  $$(".modal").forEach(m => {
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest("[data-fechar]")) fechar(m);
    });
  });
  $("#btn-importar-banco").onclick = () => { abrir($("#modal-banco")); atualizarPainelBanco(); };
  $$("#modal-banco .so-local").forEach(el => { el.hidden = !!sb; });
  $("#btn-baixar-banco").onclick = baixarBancoJson;
  $("#btn-backup").onclick = () => abrir($("#modal-backup"));

  $("#arquivo-banco").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      await importarArquivoBanco(f);
    } catch (err) {
      $("#progresso-banco").hidden = false;
      $("#progresso-banco").textContent = "Erro: " + err.message;
    }
    e.target.value = "";
  };

  /* backup: só a unidade em uso (a outra não é exportada nem afetada) */
  $("#btn-exportar-backup").onclick = () => {
    const blob = new Blob([JSON.stringify({ unidade: UN, projetos: projetosUN(), listas: listasUN(), precos }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `backup-requisicoes-${UNI().sigla}-${hoje()}.json`;
    a.click();
  };
  $("#arquivo-backup").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const doArquivo = valorUnidade(j.unidade);
      if (doArquivo && doArquivo !== UN && !await confirmar({ titulo: "Backup de outra unidade", icone: "⚠", ok: "Importar mesmo assim",
        texto: `Este backup é da <strong>${esc(nomeUnidade(doArquivo))}</strong>. Importar para a <strong>${esc(UNI().nome)}</strong>?` })) return;
      if (!j || typeof j !== "object") throw new Error("conteúdo inesperado");
      if (!await confirmar({ titulo: "Importar backup?", icone: "💾", ok: "Importar", perigo: !sb,
        texto: sb
        ? `As listas e projetos do arquivo entram na <strong>${esc(UNI().nome)}</strong> e substituem os de mesmo código. O que não está no arquivo continua como está.`
        : `Isso <strong>substitui</strong> as listas e projetos da ${esc(UNI().nome)} neste navegador (a outra unidade não é afetada). Os preços do arquivo entram na memória de preços.` })) return;
      const daOutra = (arr) => new Set(arr.filter(x => unidadeDoRegistro(x) !== UN).map(x => x.id));
      const idsP = daOutra(projetos), idsL = daOutra(listas);
      const novosP = (Array.isArray(j.projetos) ? j.projetos : []).map(p => normalizarProjeto({ ...p, unidade: UN })).filter(p => p && !idsP.has(p.id));
      const novasL = (Array.isArray(j.listas) ? j.listas : []).map(l => normalizarLista({ ...l, unidade: UN })).filter(l => l && !idsL.has(l.id));
      const precosArq = {};
      for (const [chave, reg] of Object.entries((j.precos && typeof j.precos === "object") ? j.precos : {})) {
        if (reg && typeof reg === "object" && chave.length <= 420) precosArq[chave] = { preco: comoNumero(reg.preco), em: comoTexto(reg.em, 20) };
      }
      j.precos = precosArq;
      const nP = new Set(novosP.map(p => p.id)), nL = new Set(novasL.map(l => l.id));
      projetos = projetos.filter(p => sb ? !nP.has(p.id) : unidadeDoRegistro(p) !== UN).concat(novosP);
      listas = listas.filter(l => sb ? !nL.has(l.id) : unidadeDoRegistro(l) !== UN).concat(novasL);
      precos = { ...precos, ...precosArq };
      salvarTudo(); render();
      if (sb) {
        for (const p of novosP) await nuvemSalvarProjeto(p);
        for (const l of novasL) await nuvemSalvarLista(l);
        for (const [chave, reg] of Object.entries(j.precos || {})) await nuvemSalvarPreco(chave, reg);
      }
      toast("💾 Backup importado" + (sb ? " e enviado para a nuvem." : "."));
    } catch (err) { toast("Arquivo inválido: " + err.message); }
    e.target.value = "";
  };
}

/* ============================================================
   Acesso por senha (fixa, sem usuário)
   Guardamos apenas o SHA-256 da senha — o texto não fica no código.
   Atenção: em site estático isso é uma cortina de privacidade,
   não segurança forte (o conteúdo do site é público para quem tiver o link).
   ============================================================ */
const SENHA_HASH = "1a7086d1c6998de11d1ffd745096a0bfa726f0c4d11f7d3264e681d0aaf66413";
async function sha256(txt) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* some com os dados deste navegador (saída da conta, conta sem acesso) */
function limparDadosLocais() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (/^rq\.(listas|projetos|precos|pessoas|setores|pendentes|base\..+)$/.test(k)) localStorage.removeItem(k);
    }
  } catch { /* sem armazenamento: nada a limpar */ }
}
async function sair() {
  if (editorAtivo) await editorAtivo.commit();
  if (sb && pendentes.size && !await confirmar({ titulo: "Sair com alterações não enviadas?", icone: "⚠", perigo: true, ok: "Sair mesmo assim",
    texto: `Há <strong>${pendentes.size}</strong> requisição(ões) com alterações que ainda não foram enviadas para a nuvem. Saindo agora, elas serão perdidas.` })) return;
  if (!(sb && pendentes.size) && !await confirmar({ titulo: "Sair da conta?", icone: "↩", ok: "Sair",
    texto: "Os dados guardados neste aparelho são apagados; ao entrar de novo, tudo volta da nuvem." })) return;
  LS.fechado = true;
  limparDadosLocais();
  if (sb) { try { await sb.auth.signOut(); } catch { /* sai de qualquer forma */ } }
  location.reload();
}
/* conta que entra mas não está liberada no banco (ver supabase_seguranca.sql): avisa em vez de mostrar tudo vazio */
async function conferirAcesso() {
  try {
    const { data, error } = await sb.rpc("req_meu_acesso");
    if (error || data !== false) return;               // banco antigo (sem a função) ou acesso liberado
    LS.fechado = true;
    limparDadosLocais();
    sessionStorage.setItem("rq.aviso", "Esta conta não tem acesso liberado. Peça ao responsável para incluir o seu e-mail em Cadastros.");
    await sb.auth.signOut();
    location.reload();
  } catch { /* sem rede: a próxima conferência decide */ }
}

/* aoAutenticar: chamado quando o usuário está liberado para usar o app */
async function ligarLogin(aoAutenticar) {
  const tela = $("#tela-login");
  const aviso = sessionStorage.getItem("rq.aviso");
  if (aviso) { $("#login-erro").textContent = aviso; sessionStorage.removeItem("rq.aviso"); }

  /* ----- modo NUVEM: login multiusuário do Supabase (mesmas contas do painel de gestão) ----- */
  if (sb) {
    $("#email").hidden = false;
    const liberar = (email) => {
      emailSessao = email || ""; deduzirUsuario();
      tela.hidden = true; $("#btn-sair").hidden = false;
      sb.auth.onAuthStateChange((evento) => {            // sessão encerrada em outra aba ou expirada
        if (evento !== "SIGNED_OUT") return;
        if (!pendentes.size) { LS.fechado = true; limparDadosLocais(); }   // o que falta enviar fica guardado para subir no próximo login
        location.reload();
      });
      aoAutenticar();
      conferirAcesso();
    };
    const { data: { session } } = await sb.auth.getSession();
    if (session) { liberar(session.user.email); return; }
    if (!pendentes.size) {                             // ninguém logado: nada de dados guardados nem em memória (salvo o que falta enviar)
      limparDadosLocais(); listas = []; projetos = []; precos = {};
    }
    tela.hidden = false; $("#email").focus();
    let tentativas = 0, bloqueadoAte = 0;
    $("#form-login").onsubmit = async (e) => {
      e.preventDefault();
      if (Date.now() < bloqueadoAte) { $("#login-erro").textContent = `Muitas tentativas. Aguarde ${Math.ceil((bloqueadoAte - Date.now()) / 1000)} s.`; return; }
      $("#login-erro").textContent = "Entrando…";
      const email = $("#email").value.trim();
      const { data, error } = await sb.auth.signInWithPassword({ email, password: $("#senha").value });
      if (error) {
        const semRede = error.status === 0 || error.name === "AuthRetryableFetchError" || /failed to fetch|network/i.test(error.message || "");
        if (semRede) { $("#login-erro").textContent = "Sem conexão com o servidor. Confira a internet e tente de novo."; return; }
        if (++tentativas >= 5) { bloqueadoAte = Date.now() + 30000; tentativas = 0; }
        $("#login-erro").textContent = "E-mail ou senha incorretos."; $("#senha").select(); return;
      }
      $("#senha").value = "";
      liberar((data && data.user && data.user.email) || email);
    };
    return;
  }

  /* ----- modo LOCAL: senha única (como antes) ----- */
  if (localStorage.getItem("rq.acesso") === SENHA_HASH) { tela.hidden = true; aoAutenticar(); return; }
  tela.hidden = false;
  $("#senha").focus();
  $("#form-login").onsubmit = async (e) => {
    e.preventDefault();
    const h = await sha256($("#senha").value);
    if (h === SENHA_HASH) {
      localStorage.setItem("rq.acesso", h);
      tela.hidden = true;
      aoAutenticar();
    } else {
      $("#login-erro").textContent = "Senha incorreta.";
      $("#senha").select();
    }
  };
}

/* imagens que não carregam: some com elas (ícones) ou troca pelo nome (logo) — sem código dentro do HTML */
function tratarImagemQuebrada(im) {
  if (!im || im.tagName !== "IMG" || !im.isConnected) return;
  if (im.dataset.reserva) {
    const b = document.createElement("b");
    b.textContent = im.dataset.reserva; b.style.cssText = "font-size:22px;color:#d5203b";
    im.replaceWith(b);
  } else if (im.dataset.some !== undefined) im.remove();
}
document.addEventListener("error", (e) => tratarImagemQuebrada(e.target), true);
$$("img[data-some], img[data-reserva]").forEach(im => { if (im.complete && !im.naturalWidth) tratarImagemQuebrada(im); });

/* erro inesperado: avisa (uma vez a cada 10 s) em vez de falhar calado */
let ultimoAvisoErro = 0;
function avisarErro(e) {
  console.error("erro inesperado:", e);
  if (Date.now() - ultimoAvisoErro < 10000) return;
  ultimoAvisoErro = Date.now();
  try { toast("⚠ Algo não saiu como esperado. Se o problema continuar, recarregue a página."); } catch { /* sem tela */ }
}
window.addEventListener("error", (e) => { if (e.error) avisarErro(e.error); });
window.addEventListener("unhandledrejection", (e) => avisarErro(e.reason));

/* ---------------- inicialização ---------------- */
ligarModais();
$("#btn-sair").onclick = sair;
$("#btn-ajuda").onclick = abrirAjuda;
$("#btn-mais").onclick = abrirMenuMais;
if (CFG.url && CFG.anonKey && !sb) {
  /* a nuvem está configurada mas a biblioteca de conexão não carregou: NÃO cai no modo local (gravaria só neste computador) */
  $("#app").innerHTML = `<div class="vazio" style="margin:40px auto;max-width:560px"><strong>Não foi possível conectar à nuvem.</strong><br>
    A biblioteca de conexão não carregou (rede ou bloqueio do navegador). Nada foi alterado.<br><br>
    <button class="btn" id="btn-recarregar">Tentar de novo</button></div>`;
  $("#btn-recarregar").onclick = () => location.reload();
  $("#status-banco").textContent = "sem conexão";
} else {
  if (!sb) render();                          // modo local: abre com o que está neste navegador
  ligarLogin(() => {                          // na nuvem, nada aparece antes do login
    render();                                 // cache local na hora, já na unidade do usuário
    const primeira = sincronizar(true);       // 1ª carga: traz tudo da nuvem e redesenha
    /* almoxarifado não precisa do banco de itens no aparelho; sem saber ainda quem é (1º acesso), espera os cadastros */
    const iniciarBanco = () => { if (!ehAlmox()) carregarBanco(); else mostrarBanco(true); };
    if (usuarioAtual) iniciarBanco(); else primeira.then(iniciarBanco, iniciarBanco);
    gmCarregar().then(() => { if (GM.tela) GM.tela(); });
    ligarSincronia();                         // tempo real + conferência periódica
    mostrarSinc();
  });
}
