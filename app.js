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
const pessoasUN  = (un = UN) => (pessoas || PESSOAS_PADRAO).filter(p => naUnidade(unidadeDaPessoa(p), un));
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
  if (/^#\/(lista|projeto)\//.test(location.hash)) location.hash = "#/";   // a tela aberta era da outra unidade
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
function papelNaUnidade(un, trecho, padrao) {
  const t = norm(trecho);
  const cand = pessoasUN(un).filter(p => norm(p.cargo).includes(t));
  if (padrao && cand.some(p => p.nome === padrao)) return padrao;
  const p = cand.find(x => unidadeDaPessoa(x) === un) || cand[0];
  return p ? p.nome : (padrao || "");
}
function assinantesDaUnidade(un) {
  const U = UNIDADES[un] || UNIDADES.UIS3;
  return {
    solicitante: U.padrao.solicitante,
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
const dataBR = (iso) => { if (!iso) return ""; const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

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
  gravar(chave, v) { localStorage.setItem(chave, JSON.stringify(v)); },
};
let projetos = LS.ler("rq.projetos", []);   // [{id, nome, status, autor, unidade}]
pessoas = LS.ler("rq.pessoas", PESSOAS_PADRAO);          // [{id, nome, cargo, email, unidade}]
setores = LS.ler("rq.setores", [{ id: "s1", nome: "9313", unidade: "UIS3" }]);  // [{id, nome, unidade}]
let listas   = LS.ler("rq.listas", []);     // ver novaLista()
let precos   = LS.ler("rq.precos", {});     // { chaveItem: {preco, em} }
const salvarTudo = () => { LS.gravar("rq.projetos", projetos); LS.gravar("rq.listas", listas); LS.gravar("rq.precos", precos); };
const salvarCadastros = () => { LS.gravar("rq.pessoas", pessoas); LS.gravar("rq.setores", setores); };

/* ============================================================
   NUVEM (Supabase) — banco on-line e multiusuário
   Se config.js estiver vazio, o app roda 100% local como antes.
   ============================================================ */
const CFG = window.CONFIG_NUVEM || {};
const nuvemAtiva = () => !!(CFG.url && CFG.anonKey && window.supabase);
const sb = nuvemAtiva() ? window.supabase.createClient(CFG.url, CFG.anonKey) : null;

async function nuvemSalvarLista(l) {
  if (!sb) return true;                       // modo local: gravar no navegador já é "salvo"
  try {
    const { error } = await sb.from("req_listas").upsert({ id: l.id, dados: l, atualizado_em: new Date().toISOString() });
    if (error) { console.warn("nuvem/listas:", error.message); return false; }
    return true;
  } catch (e) { console.warn("nuvem/listas:", e.message); return false; }
}
async function nuvemExcluirLista(id) {
  if (!sb) return;
  await sb.from("req_listas").delete().eq("id", id);
}
/* Colunas novas (unidade, status, autor) dependem do supabase_unidades.sql.
   Enquanto ele não for rodado, grava o que a tabela aceitar e avisa. */
const colunasFaltando = new Set();             // "tabela.coluna" ausentes na nuvem
let avisouMigracao = false;
function notarColunaFaltando(tabela, coluna) {
  colunasFaltando.add(tabela + "." + coluna);
  if (!avisouMigracao) { avisouMigracao = true; toast("⚠️ Falta rodar o supabase_unidades.sql no Supabase (veja Cadastros)."); }
}
function avisoMigracao() {
  if (!colunasFaltando.size) return "";
  return `<div class="aviso" style="margin-bottom:14px">⚠️ O Supabase ainda não tem a(s) coluna(s)
    <strong>${[...colunasFaltando].map(esc).join(", ")}</strong>. Rode o arquivo <code>supabase_unidades.sql</code>
    no SQL Editor do Supabase. Sem isso, a unidade de pessoas, setores e projetos não fica gravada na nuvem
    e, ao recarregar, eles voltam a aparecer como UIS 3.</div>`;
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

/* carrega listas/projetos/preços compartilhados e redesenha */
async function carregarNuvem() {
  if (!sb) return;
  try {
    const [p, l, pr] = await Promise.all([
      sb.from("req_projetos").select("*"),
      sb.from("req_listas").select("dados"),
      sb.from("req_precos").select("*"),
    ]);
    if (p.error || l.error || pr.error) throw new Error((p.error || l.error || pr.error).message);
    projetos = (p.data || []).map(r => {
      const o = { id: r.id, nome: r.nome };
      for (const k of ["status", "autor", "unidade"]) if (r[k] != null && r[k] !== "") o[k] = r[k];
      return o;
    });
    const semColuna = (rows, tabela, cols) => {
      if (rows && rows.length) cols.forEach(c => { if (!(c in rows[0])) colunasFaltando.add(tabela + "." + c); });
    };
    semColuna(p.data, "req_projetos", ["unidade", "status", "autor"]);
    listas = (l.data || []).map(r => r.dados);
    precos = Object.fromEntries((pr.data || []).map(r => [r.chave, { preco: +r.preco, em: r.em }]));
    /* cadastros (tabelas podem não existir ainda; tolerante a erro) */
    try {
      const pe = await sb.from("req_pessoas").select("*");
      if (!pe.error && pe.data && pe.data.length) { pessoas = pe.data; semColuna(pe.data, "req_pessoas", ["unidade"]); }
    } catch { /* mantém local */ }
    try {
      const se = await sb.from("req_setores").select("*");
      if (!se.error && se.data && se.data.length) { setores = se.data; semColuna(se.data, "req_setores", ["unidade"]); }
    } catch { /* mantém local */ }
    deduzirUsuario();
    salvarTudo(); salvarCadastros();   // cache local para abrir rápido na próxima vez
    render();
  } catch (e) {
    console.warn("nuvem: usando cache local (", e.message, ")");
  }
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

/* ---------------- banco de itens (IndexedDB) ---------------- */
let BANCO = [];        // [{c: código, d: descrição, u: unidade, n: norm, ns: norm sem espaço}]
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
};

function indexarBanco(itens) {
  // formato: [código, descrição, unidade, ativo?]  (ativo ausente = 1)
  BANCO = itens.map(([c, d, u, a]) => {
    const n = norm(d) + " " + String(c);
    return { c: String(c), d: String(d), u: String(u || "UN"), a: a === 0 ? 0 : 1, n, ns: semEspaco(n) };
  });
}

/* aceita "em" antigo em dd/mm/aaaa e novo em ISO */
function tempoDe(reg) {
  if (!reg || !reg.em) return 0;
  let em = reg.em;
  if (/^\d{2}\//.test(em)) { const [d, m, a] = em.split("/"); em = `${a}-${m}-${d}`; }
  const t = Date.parse(em);
  return isNaN(t) ? 0 : t;
}

async function carregarBanco() {
  const st = $("#status-banco");
  const mostrar = (reg, origem) => {
    indexarBanco(reg.itens);
    const ativos = BANCO.filter(i => i.a).length;
    st.textContent = `banco: ${ativos.toLocaleString("pt-BR")} ativos de ${BANCO.length.toLocaleString("pt-BR")} (${origem})`;
    st.className = "status-banco ok";
  };
  try {
    const local = await IDB.ler("banco").catch(() => null);

    /* ---- modo nuvem: sincroniza com a tabela req_itens ---- */
    if (sb) {
      if (local && local.itens && local.itens.length) mostrar(local, "cache — sincronizando…");
      else { st.textContent = "banco: baixando da nuvem…"; st.className = "status-banco"; }
      try {
        const mapa = new Map((local && local.itens || []).map(i => [String(i[0]), i]));
        const desde = (local && local.sync) || null;
        let marco = desde, baixados = 0, pagina = 0;
        for (;;) {
          let q = sb.from("req_itens")
            .select("codigo,descricao,un,ativo,atualizado_em")
            .order("atualizado_em", { ascending: true })
            .range(pagina * 1000, pagina * 1000 + 999);
          if (desde) q = q.gt("atualizado_em", desde);
          const { data, error } = await q;
          if (error) throw new Error(error.message);
          for (const r of (data || [])) {
            mapa.set(String(r.codigo), [String(r.codigo), r.descricao, r.un || "UN", r.ativo ? 1 : 0]);
            if (!marco || r.atualizado_em > marco) marco = r.atualizado_em;
          }
          baixados += (data || []).length;
          if (baixados && baixados % 5000 === 0) {
            st.textContent = `banco: baixando da nuvem… ${baixados.toLocaleString("pt-BR")} itens`;
            await new Promise(r => setTimeout(r, 0));
          }
          if (!data || data.length < 1000) break;
          pagina++;
        }
        const reg = { v: 2, em: new Date().toISOString(), sync: marco, itens: [...mapa.values()] };
        if (reg.itens.length) {
          await IDB.gravar("banco", reg).catch(() => {});
          mostrar(reg, baixados ? `nuvem · ${baixados.toLocaleString("pt-BR")} sincronizados` : "nuvem · em dia");
          return;
        }
        st.textContent = "banco: nuvem vazia — importe o .xlsx em “Banco de itens”";
        st.className = "status-banco erro";
        return;
      } catch (e) {
        if (local && local.itens && local.itens.length) { mostrar(local, "cache local — nuvem indisponível"); return; }
        st.textContent = "banco: erro na nuvem (" + e.message + ")";
        st.className = "status-banco erro";
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
      st.textContent = "banco: vazio — clique em “Banco de itens” para importar o .xlsx";
      st.className = "status-banco erro";
      return;
    }
    if (escolhido.reg === web && tempoDe(web) > tempoDe(local)) await IDB.gravar("banco", web).catch(() => {});
    mostrar(escolhido.reg, escolhido.origem);
  } catch (e) {
    st.textContent = "banco: erro ao carregar (" + e.message + ")";
    st.className = "status-banco erro";
  }
}

/* ---------------- importação do .xlsx da empresa ---------------- */
async function importarArquivoBanco(arquivo) {
  const prog = $("#progresso-banco");
  prog.hidden = false;
  prog.textContent = "Lendo arquivo… (o de 19 MB leva alguns segundos)";
  await new Promise(r => setTimeout(r, 30)); // deixa a UI respirar

  /* --- lê o arquivo novo: [codigo, descricao, un, ativo] --- */
  let novos = [];
  if (/\.json$/i.test(arquivo.name)) {
    const j = JSON.parse(await arquivo.text());
    novos = (j.itens || j).map(([c, d, u, a]) => [String(c), String(d), String(u || "UN"), a === 0 ? 0 : 1]);
  } else {
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

  /* --- mescla: adiciona novos, atualiza existentes, desativa ausentes --- */
  prog.textContent = "Mesclando com o banco atual…";
  await new Promise(r => setTimeout(r, 20));
  const anterior = new Map(BANCO.map(i => [i.c, [i.c, i.d, i.u, i.a]]));
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

  const itens = [...anterior.values()];
  prog.textContent = "Salvando no navegador…";
  const agora = new Date().toISOString();
  /* sem "sync" quando houve remoção: os outros dispositivos refazem a carga completa,
     pois a sincronização incremental não enxerga itens excluídos */
  const registro = { v: 2, em: agora, sync: removidos.length ? null : agora, itens };
  await IDB.gravar("banco", registro);
  indexarBanco(itens);

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

  prog.innerHTML = `<strong>Mesclagem concluída:</strong> ${qNovos.toLocaleString("pt-BR")} novos · `
    + `${qAtualizados.toLocaleString("pt-BR")} atualizados · ${qReativados.toLocaleString("pt-BR")} reativados · `
    + `${qDesativados.toLocaleString("pt-BR")} removidos`
    + (baseCompleta ? "" : "<br>⚠️ Arquivo pequeno em relação ao banco atual: nada foi desativado (parece uma carga parcial).")
    + `<br>Total agora: ${itens.length.toLocaleString("pt-BR")} itens. `
    + (sb ? "Enviado para a nuvem: toda a equipe já vê a base atualizada."
          : "Para valer em todos os computadores, clique em “Baixar banco.json” e substitua o arquivo <code>dados/banco.json</code> no repositório.");
  const st = $("#status-banco");
  st.textContent = `banco: ${itens.filter(i => i[3] === 1).length.toLocaleString("pt-BR")} ativos de ${itens.length.toLocaleString("pt-BR")} (deste navegador · ${dataBR(hoje())})`;
  st.className = "status-banco ok";
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
      if (!marcados.size) { alert("Marque ao menos um grupo."); return; }
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
  if (!reg || !reg.itens || !reg.itens.length) { alert("Não há banco importado neste navegador ainda."); return; }
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
  const eu = (usuarioAtual && usuarioAtual.nome) || U.padrao.solicitante;
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
  let novo;
  if (!marco && ult && !ult.marco && ult.por === por && (Date.parse(agora) - Date.parse(ult.em)) < LOG_JUNTAR_MIN * 60000) {
    novo = antes.slice(0, -1).concat([{ em: agora, por, inicio: ult.inicio || ult.em, mudancas: juntarMudancas(ult.mudancas || [], mudancas, l) }]);
  } else {
    const e = { em: agora, por, mudancas: consolidarIncluidos(mudancas, l).slice(0, LOG_MUDANCAS_MAX) };
    if (marco) e.marco = true;
    novo = antes.concat([e]);
  }
  l.log = novo.slice(-LOG_MAX);
  return () => { l.log = antes; };
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
  const h = location.hash || "#/";
  const app = $("#app");
  sairDoEditor();                                   // salva pendências do editor anterior
  app.onclick = null; app.onchange = null;          // cada tela liga os próprios eventos
  aplicarUnidade();                                 // UIS ou UIS 3 (URL / login)
  document.body.classList.toggle("pg-editor", h.startsWith("#/lista/"));
  $$("#topo nav a[href]").forEach(a => a.classList.toggle("ativo", a.getAttribute("href") === h));
  if (h.startsWith("#/lista/"))       telaEditor(app, h.slice(8));
  else if (h.startsWith("#/projeto/")) telaProjeto(app, h.slice(10));
  else if (h === "#/historico")        telaHistorico(app);
  else if (h === "#/cadastros")        telaCadastros(app);
  else if (h === "#/arquivados")       telaArquivados(app);
  else telaInicio(app);
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
      <h3><span class="etiqueta tipo">${l.tipo === "MM" ? "MM" : "RM"}</span> <a href="#/lista/${l.id}">${esc(l.titulo)}</a></h3>
      <div class="sub">${l.itens.length} itens · criada em ${dataBR(l.criadoEm)}${l.autor ? ` · por ${esc(l.autor)}` : ""}${proj ? ` · <span class="etiqueta">${esc(proj.nome)}</span>` : ""}${l.status === "concluida" ? ' · <span class="etiqueta ok">✔ concluída</span>' : ""}</div>
      ${ult ? `<div class="sub ult" title="Última edição salva">✎ ${esc(dataHoraBR(ult.em))} · ${esc(ult.por)}</div>` : ""}
      <div class="rodape">
        <span class="valor">${dinheiro(totalDa(l))}</span>
        <span class="espacador"></span>
        <a class="btn mini" href="#/lista/${l.id}">Abrir</a>
        <button class="btn mini sec" data-duplicar="${l.id}">Duplicar</button>
        <button class="btn mini perigo" data-excluir-lista="${l.id}">Excluir</button>
      </div>
    </div>`;
  };
  const cartaoProjeto = (p) => {
    const ls = listas.filter(l => l.projetoId === p.id);
    const tot = ls.reduce((s, l) => s + totalDa(l), 0);
    return `<div class="cartao projeto ${p.status === "arquivado" ? "concluida" : ""}">
      <h3><a href="#/projeto/${p.id}">${esc(p.nome)}</a></h3>
      <div class="sub">${ls.length} lista(s)${p.autor ? ` · por ${esc(p.autor)}` : ""}${p.status === "arquivado" ? ' · <span class="etiqueta ok">📦 arquivado</span>' : ""}</div>
      <div class="rodape"><span class="valor">${dinheiro(tot)}</span><span class="espacador"></span>
        <a class="btn mini sec" href="#/projeto/${p.id}">Resumo</a>
        <button class="btn mini sec" data-arquivar-projeto="${p.id}">${p.status === "arquivado" ? "Reativar" : "Arquivar"}</button>
        <button class="btn mini perigo" data-excluir-projeto="${p.id}">Excluir</button></div>
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

  const criarLista = () => {
    const titulo = prompt("Título da lista de materiais:", "");
    if (titulo === null) return;
    let projetoId = "";
    const projs = projetosUN();
    if (projs.length) {
      const nomes = projs.map((p, i) => `${i + 1} - ${p.nome}`).join("\n");
      const r = prompt("Vincular a um projeto? Digite o número (ou deixe vazio):\n" + nomes, "");
      if (r) { const p = projs[parseInt(r, 10) - 1]; if (p) projetoId = p.id; }
    }
    const l = prepararAssinaturas(novaLista(titulo.trim() || "Nova requisição", projetoId));
    l.descricao = "";
    registrarLog(l, [{ k: "criada", t: "Requisição criada" }]);
    listas.push(l); salvarTudo(); nuvemSalvarLista(l);
    location.hash = "#/lista/" + l.id;
  };
  $("#filtro-dono").onchange = (e) => { localStorage.setItem("rq.filtroDono", e.target.value); render(); };
  $("#filtro-ordem").onchange = (e) => { localStorage.setItem("rq.ordem", e.target.value); render(); };
  $("#btn-nova-lista").onclick = criarLista;
  const b2 = $("#btn-nova-lista-2"); if (b2) b2.onclick = criarLista;
  $("#btn-nova-mm").onclick = () => {
    const t = prompt("Título do cadastro de Mínimo e Máximo:", "");
    if (t === null) return;
    const l = novaLista(t.trim() || "Novo cadastro MM", "", "MM");
    l.numeroFO = MM_NUMERO;
    l.descricao = "RELAÇÃO DE MÍNIMOS E MÁXIMOS PARA COMPRA";
    l.setor = "";
    prepararAssinaturas(l);
    registrarLog(l, [{ k: "criada", t: "Cadastro MM criado" }]);
    listas.push(l); salvarTudo(); nuvemSalvarLista(l);
    location.hash = "#/lista/" + l.id;
  };
  $("#btn-novo-projeto").onclick = () => {
    const nome = prompt("Nome do projeto:");
    if (!nome) return;
    const p = { id: uid(), nome: nome.trim(), status: "andamento", autor: (usuarioAtual && usuarioAtual.nome) || emailSessao || "", unidade: UN };
    projetos.push(p); salvarTudo(); nuvemSalvarProjeto(p); render();
  };
  app.onclick = (e) => {
    const d = e.target.dataset || {};
    if (d.excluirLista) {
      const l = listas.find(x => x.id === d.excluirLista);
      if (confirm(`Excluir a lista “${l.titulo}”?${l.status === "concluida" ? "\n\nAtenção: esta requisição está CONCLUÍDA." : ""}`)) { listas = listas.filter(x => x.id !== d.excluirLista); salvarTudo(); nuvemExcluirLista(d.excluirLista); render(); }
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
      if (confirm(`Excluir o projeto “${p.nome}”? As listas continuam existindo, apenas sem o vínculo.`)) {
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
  if (!p) { location.hash = "#/"; return; }
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
      <a class="btn" href="#/" onclick="return criarListaNoProjeto('${p.id}')">+ Lista neste projeto</a>
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
        <td><a class="btn mini sec" href="#/lista/${l.id}">Abrir</a></td></tr>`; }).join("") || `<tr><td colspan="6">Nenhuma lista vinculada.</td></tr>`}
    </tbody></table>
    <div class="secao-titulo">Materiais consolidados (todas as listas)</div>
    <table class="app"><thead><tr><th>Código</th><th>Descrição</th><th>Un</th><th class="num">Qtd. total</th><th class="num">Valor</th></tr></thead><tbody>
      ${consolidado.map(i => `<tr><td>${esc(i.codigo)}</td><td>${esc(i.descricao)}</td><td>${esc(i.un)}</td>
        <td class="num">${fmtBR.format(i.qtd)}</td><td class="num">${dinheiro(i.valor)}</td></tr>`).join("") || `<tr><td colspan="5">Sem itens.</td></tr>`}
    </tbody></table>`;

  $("#btn-renomear").onclick = () => {
    const n = prompt("Novo nome do projeto:", p.nome);
    if (n) { p.nome = n.trim(); salvarTudo(); nuvemSalvarProjeto(p); render(); }
  };
  $("#btn-arquivar").onclick = () => {
    p.status = p.status === "arquivado" ? "andamento" : "arquivado";
    salvarTudo(); nuvemSalvarProjeto(p); render();
  };
  window.criarListaNoProjeto = (pid) => {
    const t = prompt("Título da lista:", "");
    if (t === null) return false;
    const l = prepararAssinaturas(novaLista(t.trim() || "Nova requisição", pid));
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
      <h3><a href="#/projeto/${p.id}">${esc(p.nome)}</a></h3>
      <div class="sub">${ls.length} lista(s)${p.autor ? ` · por ${esc(p.autor)}` : ""}</div>
      <div class="rodape"><span class="valor">${dinheiro(tot)}</span><span class="espacador"></span>
        <a class="btn mini sec" href="#/projeto/${p.id}">Resumo</a>
        <button class="btn mini" data-reativar="${p.id}">Reativar</button></div>
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
    cx.className = "modal no-print";
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
  const listaP = pessoas.filter(p => visivel(unidadeDaPessoa(p)));
  const listaS = setores.filter(s => visivel(unidadeDoSetor(s)))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR", { numeric: true }));
  const ocultosP = pessoas.length - listaP.length, ocultosS = setores.length - listaS.length;

  const linhaPessoa = (p) => `<tr>
    <td>${esc(p.nome)}${usuarioAtual && p === usuarioAtual ? ' <span class="etiqueta ok">você</span>' : ""}</td>
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

    <div class="secao-titulo">Assinantes (nomes e funções)</div>
    <p class="cad-nota">O <strong>e-mail</strong> vincula a pessoa ao login: quem entrar com ele vira o solicitante das novas listas e trabalha
      na unidade dela (com <strong>Todos</strong>, pode alternar entre UIS e UIS 3 no topo da tela).
      A alçada de assinaturas é montada pela <strong>função</strong>: Supervisor de Manutenção, Gerente Industrial e Gerente de Operações de cada unidade.</p>
    <table class="app cad"><thead><tr><th>Nome</th><th>Função</th><th>E-mail (login)</th><th>Unidade</th><th></th></tr></thead>
      <tbody>${listaP.map(linhaPessoa).join("") || `<tr><td colspan="5">Nenhuma pessoa cadastrada para esta unidade.</td></tr>`}</tbody></table>
    <button class="btn" id="btn-add-pessoa" style="margin-top:10px">+ Adicionar assinante</button>

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
    ], p ? { nome: p.nome, cargo: p.cargo, email: p.email, unidade: unidadeDaPessoa(p) } : { unidade: UN },
    (v) => {
      if (!v.nome.trim()) return "Informe o nome.";
      const em = norm(v.email.trim());
      if (em && pessoas.some(x => x !== p && x.email && norm(x.email) === em)) return "Este e-mail já está vinculado a outra pessoa.";
      return "";
    }).then(v => v && { nome: v.nome.trim(), cargo: v.cargo.trim(), email: v.email.trim().toLowerCase(), unidade: v.unidade });

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
      Object.assign(p, novo); salvarCadastros(); nuvemSalvarPessoa(p); deduzirUsuario(); avisarSeSaiu(p.nome, p.unidade); render();
    }
    if (d.excluirPessoa) {
      const p = pessoas.find(x => x.id === d.excluirPessoa);
      if (confirm(`Excluir “${p.nome}” do cadastro de assinantes?`)) {
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
      if (confirm(`Excluir o setor “${s.nome}”?`)) {
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
  if (!L) { location.hash = "#/"; return; }
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
  const opcoesAss = (sel) => [...new Set([...pessoasUN(UL).map(p => p.nome), ...(sel ? [sel] : [])])]
    .map(n => `<option ${n === sel ? "selected" : ""}>${esc(n)}</option>`).join("");

  app.innerHTML = `
  <div class="ed">
    <div class="ed-barra no-print">
      <span class="ed-tipo" title="${ehMM ? "Relação de Mínimos e Máximos para Compra" : "Requisição de Material"}">${ehMM ? "MM" : "RM"}</span>
      <input type="text" id="ed-titulo" class="ed-titulo" value="${esc(L.titulo)}" placeholder="Título da lista">
      <select id="ed-projeto" title="Projeto vinculado">
        <option value="">— sem projeto —</option>
        ${projetosUN(UL).filter(p => p.status !== "arquivado" || p.id === L.projetoId)
          .map(p => `<option value="${p.id}" ${p.id === L.projetoId ? "selected" : ""}>${esc(p.nome)}${p.status === "arquivado" ? " (arquivado)" : ""}</option>`).join("")}
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
              <button class="btn sec mini" id="btn-avulso">+ Item avulso (S/ CÓD.)</button>
            </div>
            <p class="trava-dica">🔒 Inclusão de itens bloqueada: a requisição está concluída.</p>
            <div id="resultados"></div>
            <div class="contagem" id="contagem"></div>
            <div class="dica">Vários termos = todos precisam aparecer, em qualquer ordem.
              Ex.: <em>cabo pp 4x2,5</em>. Acentos são ignorados. Amarelo = já usado antes; preço em verde vem do histórico.
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
  <datalist id="dl-setores">${setoresNum.map(s => `<option value="${esc(s.nome)}"></option>`).join("")}</datalist>`;

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
    if (!mud.length) { salvarTudo(); if (!tNuvem) marcar("salvo"); return true; }
    marcar("salvando");
    const snap = fotografar();
    const desfazer = registrarLog(L, mud);
    salvarTudo();
    const ok = await nuvemSalvarLista(L);
    if (!ok) { desfazer(); salvarTudo(); marcar("erro"); return false; }
    base = snap;
    if (!tNuvem) marcar(diffLista(base, L).length ? "pendente" : "salvo");
    mostrarUltima(); desenharHistorico();
    return true;
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
    const bs = $("#btn-status");
    bs.textContent = t ? "✅ Concluída" : "🕓 Em andamento";
    bs.classList.toggle("concluida", t);
    bs.title = t ? "Concluída — clique para reabrir" : "Clique para marcar como concluída";
    ["#ed-titulo", "#ed-projeto", "#ed-autor", "#ed-anotacoes", "#busca", "#opt-espacos", "#btn-avulso"]
      .forEach(s => { const el = $(s); if (el) el.disabled = t; });
    if (t) { $("#busca").value = ""; resultadosAtuais = []; desenharResultados(); }
  }
  async function trocarStatus() {
    if (travada()) {
      if (!confirm("Esta requisição está CONCLUÍDA e bloqueada para edição.\n\n"
        + "Para editar, o status voltará para “Em andamento”. A reabertura fica registrada no histórico.\n\n"
        + "Deseja reabrir a requisição?")) return;
      L.status = "andamento";
    } else {
      if (!confirm("Marcar esta requisição como CONCLUÍDA?\n\n"
        + "Ela ficará bloqueada para edição (impressão e PDF continuam liberados). "
        + "Para alterá-la depois será preciso reabri-la.")) return;
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
      if (confirm(`Não foi possível gerar o PDF direto (${e.message}).\n\nAbrir a impressão para salvar como PDF?`)) imprimirDocumento();
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
      return `<div class="resultado ${i === selecionado ? "ativo" : ""} ${r.usado ? "usado" : ""}" data-i="${i}">
        <span class="cod">${esc(r.c)}</span><span class="desc">${esc(r.d)}${r.a ? "" : ' <span class="badge-inativo">DESATIVADO</span>'}</span>
        <span class="un">${esc(r.u)}</span>${ph ? `<span class="preco-hist">${dinheiro(ph)}</span>` : ""}
        <button class="lupa ${r.c === lupaAtiva ? "verde" : ""}" data-lupa="${i}" title="Pesquisar este item no Google (nova guia)">+🔍</button>
      </div>`;
    }).join("");
    $("#contagem").textContent = resultadosAtuais.length
      ? `${resultadosAtuais.length} resultado(s)` + (resultadosAtuais.length >= 60 ? " — refine a busca para ver mais" : "")
      : (caixa.value.trim() ? "Nada encontrado. Tente menos termos ou marque “ignorar espaços”." : "");
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
  let timer = null;
  caixa.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      resultadosAtuais = buscar(caixa.value, $("#opt-espacos").checked);
      selecionado = resultadosAtuais.length ? 0 : -1;
      desenharResultados();
    }, 120);
  };
  $("#opt-espacos").onchange = caixa.oninput;
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
  $("#btn-avulso").onclick = () => {
    if (travada()) { avisarTrava(); return; }
    const d = prompt("Descrição do item avulso:");
    if (!d) return;
    const base = { codigo: "S/ CÓD.", descricao: d.trim().toUpperCase(), un: "pç", preco: 0 };
    const ph = precoLembrado(base);
    if (ph) base.preco = ph;
    const item = ehMM ? { ...base, qtdMin: 0, qtdMax: 0, justificativa: "" } : { ...base, qtd: 1 };
    L.itens.push(item); salvar(); desenharFolha();
  };

  /* ---------- navegação por setas entre os campos da folha ---------- */
  const COLUNAS_NAV = ["qtd", "preco", "min", "max", "just"];
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

    $("#folha").classList.toggle("mm", ehMM);
    if (ehMM) folhaMM(); else folhaRM();
    ligarEventosFolha();
    if (travada()) {                                  // concluída: documento congelado
      $$("#folha input, #folha textarea").forEach(el => { el.readOnly = true; });
      $$("#folha select").forEach(el => { el.disabled = true; });
    }
    aplicarZoom();

    if (foco) {
      for (const k of [...COLUNAS_NAV, "l"]) {
        if (foco[k] !== undefined) {
          const el = $(`#folha [data-${k}="${foco[k]}"]`);
          if (el) { el.focus(); }
          break;
        }
      }
    }
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
        <td class="d-logo"><img src="logo.png" alt="Lar" onerror="this.outerHTML='<b style=\'font-size:22px;color:#d5203b\'>Lar</b>'"></td>
        <td class="d-titulo" colspan="2">REQUISIÇÃO DE MATERIAL</td>
        <td class="d-numero" colspan="2"><span class="rotulo">NÚMERO</span><input data-l="numeroFO" value="${esc(L.numeroFO)}"></td>
        <td class="d-anexos"><img src="icone_doc.png" alt="" onerror="this.remove()"><img src="icone_pdf.png" alt="" onerror="this.remove()"></td>
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
        <td class="d-logo" style="text-align:left"><img src="logo.png" alt="Lar" onerror="this.outerHTML='<b style=\'font-size:22px;color:#d5203b\'>Lar</b>'"></td>
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
        el.onblur = () => { if (!L.assinaturasManuais) desenharFolha(); };   // 1º visto = solicitante
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
  aplicarTrava();
  marcar("salvo");
  mostrarUltima();
  desenharHistorico();
  selecionarAba(["itens", "notas", "hist"].includes(abaInicial) ? abaInicial : "itens");
  editorAtivo = { commit, focarBusca };
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
const LIBS_PDF = {
  pdflib:  "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
  fontkit: "https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js",
};
const carregarScript = (src) => new Promise((ok, erro) => {
  const s = document.createElement("script");
  s.src = src; s.onload = ok; s.onerror = () => erro(new Error("sem acesso a " + src.split("/npm/")[1]));
  document.head.appendChild(s);
});
let recursosPdf = null;                       // promessa única: bibliotecas + fontes
function carregarRecursosPdf() {
  if (!recursosPdf) recursosPdf = (async () => {
    if (!window.PDFLib) await carregarScript(LIBS_PDF.pdflib);
    if (!window.fontkit) await carregarScript(LIBS_PDF.fontkit).catch(() => {});   // sem ela: Helvetica
    const ler = (u) => fetch(u).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);
    const [reg, neg] = await Promise.all([ler("fontes/RQSans-Regular.ttf"), ler("fontes/RQSans-Bold.ttf")]);
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
        autor: l.autor || l.solicitante || "", projeto: nomeProj.get(l.projetoId) || "",
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
  /* repetida = mesma requisição da linha de cima: só o título, sem repetir descrição/etiquetas */
  const linha = (r, termos, repetida) => {
    const desc = (r.l.descricao || "").trim();
    const mostraDesc = !repetida && desc && !(r.mm && norm(desc) === norm(DESC_MM_PADRAO));
    const concl = !repetida && r.l.status === "concluida";
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
function ligarModais() {
  const abrir = (m) => { m.hidden = false; };
  const fechar = (m) => { m.hidden = true; };
  $$(".modal").forEach(m => {
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest("[data-fechar]")) fechar(m);
    });
  });
  $("#btn-importar-banco").onclick = () => abrir($("#modal-banco"));
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
      if (doArquivo && doArquivo !== UN && !confirm(`Este backup é da ${nomeUnidade(doArquivo)}. Importar mesmo assim para a ${UNI().nome}?`)) return;
      if (!confirm(`Importar backup? Isso SUBSTITUI as listas e projetos da ${UNI().nome} neste navegador (a outra unidade não é afetada). Os preços do arquivo entram na memória de preços.`)) return;
      const novosP = (j.projetos || []).map(p => ({ ...p, unidade: UN }));
      const novasL = (j.listas || []).map(l => ({ ...l, unidade: UN }));
      projetos = projetos.filter(p => unidadeDoRegistro(p) !== UN).concat(novosP);
      listas = listas.filter(l => unidadeDoRegistro(l) !== UN).concat(novasL);
      precos = { ...precos, ...(j.precos || {}) };
      salvarTudo(); render();
      if (sb) {
        for (const p of novosP) await nuvemSalvarProjeto(p);
        for (const l of novasL) await nuvemSalvarLista(l);
        for (const [chave, reg] of Object.entries(j.precos || {})) await nuvemSalvarPreco(chave, reg);
      }
      alert("Backup importado" + (sb ? " e enviado para a nuvem." : "."));
    } catch (err) { alert("Arquivo inválido: " + err.message); }
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

/* aoAutenticar: chamado quando o usuário está liberado para usar o app */
async function ligarLogin(aoAutenticar) {
  const tela = $("#tela-login");

  /* ----- modo NUVEM: login multiusuário do Supabase (mesmas contas do painel de gestão) ----- */
  if (sb) {
    $("#email").hidden = false;
    const { data: { session } } = await sb.auth.getSession();
    if (session) { emailSessao = session.user.email || ""; deduzirUsuario(); tela.hidden = true; $("#btn-sair").hidden = false; aoAutenticar(); return; }
    tela.hidden = false; $("#email").focus();
    $("#form-login").onsubmit = async (e) => {
      e.preventDefault();
      $("#login-erro").textContent = "Entrando…";
      const { error } = await sb.auth.signInWithPassword({
        email: $("#email").value.trim(),
        password: $("#senha").value,
      });
      if (error) { $("#login-erro").textContent = "E-mail ou senha incorretos."; $("#senha").select(); return; }
      emailSessao = $("#email").value.trim(); deduzirUsuario();
      tela.hidden = true; $("#btn-sair").hidden = false;
      aoAutenticar();
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

/* ---------------- inicialização ---------------- */
ligarModais();
render();                                   // abre com o cache local na hora
$("#btn-sair").onclick = async () => { if (sb) await sb.auth.signOut(); location.reload(); };
ligarLogin(() => {                          // dados só depois de autenticado
  render();                                 // já na unidade do usuário logado
  carregarBanco();
  carregarNuvem();
});
