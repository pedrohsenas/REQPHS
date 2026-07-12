/* ============================================================
   Requisições UIS3 — app.js
   Tudo roda no navegador: banco de itens no IndexedDB,
   listas/projetos/preços no localStorage. Nenhum servidor.
   ============================================================ */
"use strict";

/* ---------------- pessoas (aba "Dados" do modelo) ---------------- */
const PESSOAS_PADRAO = [
  { nome: "Pedro Henrique Sena de Souza",   cargo: "Engenheiro Eletricista - UIS3" },
  { nome: "Alexssandro Aparecido Benitez",  cargo: "Supervisor de Manutenção - UIS3" },
  { nome: "Jaisson Aranha Machado",         cargo: "Gerente Industrial - UIS3" },
  { nome: "Ademilson Freire da Silva",      cargo: "Gerente de Operações e Energias" },
  { nome: "Mauro Cardoso de Souza",         cargo: "Gerente Industrial - UIS" },
  { nome: "Ronnis Tarles Dantas Costa",     cargo: "PCM - UIS3" },
  { nome: "Juliano Covo",                   cargo: "PCM - UIS3" },
  { nome: "Marcia Pereira Paz",             cargo: "PCM - UIS3" },
  { nome: "Luiz Ricardo de Oliveira Silva", cargo: "Coordenador de Manutenção" },
  { nome: "Eberson Mariano da Roza",        cargo: "Supervisor de Produção - UIS3" },
].map((p, i) => ({ id: "padrao-" + (i + 1), email: "", ...p }));

/* cadastros editáveis (tela "Cadastros"): assinantes e setores */
let pessoas = null;   // carregado após LS existir (abaixo)
let setores = null;
const P = {
  pedro:     "Pedro Henrique Sena de Souza",
  alex:      "Alexssandro Aparecido Benitez",
  jaisson:   "Jaisson Aranha Machado",
  ademilson: "Ademilson Freire da Silva",
};

/* Regras de alçada de assinatura por valor total */
function assinaturasPorValor(total) {
  if (total <= 3000)  return [P.pedro, P.alex];
  if (total <= 20000) return [P.pedro, P.alex, P.jaisson];
  return [P.alex, P.jaisson, P.ademilson];
}
const cargoDe = (nome) => ((pessoas || PESSOAS_PADRAO).find(p => p.nome === nome) || {}).cargo || "";
const acharPorCargo = (trecho) => {
  const t = trecho.toUpperCase();
  const p = (pessoas || PESSOAS_PADRAO).find(x => String(x.cargo || "").toUpperCase().includes(t));
  return p ? p.nome : "";
};
/* assinantes fixos do Cadastro de Mín/Máx: solicitante + supervisor + gerente industrial */
function assinaturasMM(l) {
  return [
    l.solicitante || "",
    acharPorCargo("SUPERVISOR DE MANUTENÇÃO") || P.alex,
    acharPorCargo("GERENTE INDUSTRIAL - UIS3") || P.jaisson,
  ].filter(Boolean);
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
let projetos = LS.ler("rq.projetos", []);   // [{id, nome}]
pessoas = LS.ler("rq.pessoas", PESSOAS_PADRAO);          // [{id, nome, cargo, email}]
setores = LS.ler("rq.setores", [{ id: "s1", nome: "9313" }]);  // [{id, nome}]
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
  if (!sb) return;
  const { error } = await sb.from("req_listas").upsert({ id: l.id, dados: l, atualizado_em: new Date().toISOString() });
  if (error) console.warn("nuvem/listas:", error.message);
}
async function nuvemExcluirLista(id) {
  if (!sb) return;
  await sb.from("req_listas").delete().eq("id", id);
}
async function nuvemSalvarProjeto(p) {
  if (!sb) return;
  await sb.from("req_projetos").upsert(p);
}
async function nuvemExcluirProjeto(id) {
  if (!sb) return;
  await sb.from("req_projetos").delete().eq("id", id);
}
async function nuvemSalvarPessoa(p) { if (sb) await sb.from("req_pessoas").upsert(p); }
async function nuvemExcluirPessoa(id) { if (sb) await sb.from("req_pessoas").delete().eq("id", id); }
async function nuvemSalvarSetor(s) { if (sb) await sb.from("req_setores").upsert(s); }
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
    projetos = (p.data || []).map(r => ({ id: r.id, nome: r.nome }));
    listas = (l.data || []).map(r => r.dados);
    precos = Object.fromEntries((pr.data || []).map(r => [r.chave, { preco: +r.preco, em: r.em }]));
    /* cadastros (tabelas podem não existir ainda; tolerante a erro) */
    try {
      const pe = await sb.from("req_pessoas").select("*");
      if (!pe.error && pe.data && pe.data.length) pessoas = pe.data;
    } catch { /* mantém local */ }
    try {
      const se = await sb.from("req_setores").select("*");
      if (!se.error && se.data && se.data.length) setores = se.data;
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
        col = { codigo: mapa["CODIGO"], desc: mapa["DESCRICAO"], un: mapa["UN"], sit: mapa["SITUACAO"] };
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
    for (let i = cab + 1; i < linhas.length; i++) {
      const l = linhas[i] || [];
      const codigo = pega(l, col.codigo), desc = pega(l, col.desc);
      if (!codigo || !desc) continue;
      const ativo = (col.sit == null) ? 1 : (norm(pega(l, col.sit)) === "ATIVO" ? 1 : 0);
      novos.push([codigo, desc, pega(l, col.un) || "UN", ativo]);
      if (i % 20000 === 0) { prog.textContent = `Processando… ${i.toLocaleString("pt-BR")} linhas`; await new Promise(r => setTimeout(r, 0)); }
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
  // desativa o que sumiu do arquivo — só quando o arquivo parece ser a base completa
  const baseCompleta = novos.length >= anterior.size * 0.5;
  if (baseCompleta) {
    for (const [c, reg] of anterior) {
      if (!vistos.has(c) && reg[3] === 1) { reg[3] = 0; qDesativados++; alterados.push([...reg]); }
    }
  }

  const itens = [...anterior.values()];
  prog.textContent = "Salvando no navegador…";
  const agora = new Date().toISOString();
  const registro = { v: 2, em: agora, sync: agora, itens };
  await IDB.gravar("banco", registro);
  indexarBanco(itens);

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
    + `${qDesativados.toLocaleString("pt-BR")} desativados`
    + (baseCompleta ? "" : "<br>⚠️ Arquivo pequeno em relação ao banco atual: nada foi desativado (parece uma carga parcial).")
    + `<br>Total agora: ${itens.length.toLocaleString("pt-BR")} itens. `
    + (sb ? "Enviado para a nuvem: toda a equipe já vê a base atualizada."
          : "Para valer em todos os computadores, clique em “Baixar banco.json” e substitua o arquivo <code>dados/banco.json</code> no repositório.");
  const st = $("#status-banco");
  st.textContent = `banco: ${itens.filter(i => i[3] === 1).length.toLocaleString("pt-BR")} ativos de ${itens.length.toLocaleString("pt-BR")} (deste navegador · ${dataBR(hoje())})`;
  st.className = "status-banco ok";
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
  return {
    id: uid(), tipo: tipo || "RM",                    // RM = requisição de material · MM = cadastro mín/máx
    status: "andamento",                              // andamento | concluida
    autor: (usuarioAtual && usuarioAtual.nome) || emailSessao || "",
    anotacoes: "",
    titulo: titulo || "Nova requisição", projetoId: projetoId || "",
    numeroFO: "FO 185 1613-0015",
    local: "185 - UIS 3", areaSetor: "PROJETOS",
    emissao: hoje(), revisao: "0", numero: "",
    descricao: "", data: hoje(),
    solicitante: (usuarioAtual && usuarioAtual.nome) || P.pedro, setor: "9313", projetoNum: "", nrOS: "",
    observacao: "COMUNICAR O SOLICITANTE QUANDO DA CHEGADA.",
    itens: [],                       // {codigo, descricao, un, qtd, preco}
    assinaturas: assinaturasPorValor(0),
    assinaturasManuais: false,
    criadoEm: hoje(),
  };
}
const totalDa = (l) => l.tipo === "MM"
  ? l.itens.reduce((s, i) => s + (i.qtdMin || 0) * (i.preco || 0), 0)     // MM: valor total = Qtde MÍN × valor un (padrão do FO)
  : l.itens.reduce((s, i) => s + (i.qtd || 0) * (i.preco || 0), 0);

/* ---------------- roteamento ---------------- */
window.addEventListener("hashchange", render);
function render() {
  const h = location.hash || "#/";
  const app = $("#app");
  if (h.startsWith("#/lista/"))       telaEditor(app, h.slice(8));
  else if (h.startsWith("#/projeto/")) telaProjeto(app, h.slice(10));
  else if (h === "#/cadastros")        telaCadastros(app);
  else telaInicio(app);
}

/* ============================================================
   TELA: INÍCIO — projetos e listas
   ============================================================ */
function telaInicio(app) {
  const rms = [...listas].reverse().filter(l => (l.tipo || "RM") !== "MM");
  const mms = [...listas].reverse().filter(l => l.tipo === "MM");
  const cartaoLista = (l) => {
    const proj = projetos.find(p => p.id === l.projetoId);
    return `<div class="cartao ${l.status === "concluida" ? "concluida" : ""}">
      <h3><span class="etiqueta tipo">${l.tipo === "MM" ? "MM" : "RM"}</span> <a href="#/lista/${l.id}">${esc(l.titulo)}</a></h3>
      <div class="sub">${l.itens.length} itens · ${dataBR(l.criadoEm)}${l.autor ? ` · por ${esc(l.autor)}` : ""}${proj ? ` · <span class="etiqueta">${esc(proj.nome)}</span>` : ""}${l.status === "concluida" ? ' · <span class="etiqueta ok">✔ concluída</span>' : ""}</div>
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
    return `<div class="cartao projeto">
      <h3><a href="#/projeto/${p.id}">${esc(p.nome)}</a></h3>
      <div class="sub">${ls.length} lista(s)</div>
      <div class="rodape"><span class="valor">${dinheiro(tot)}</span><span class="espacador"></span>
        <a class="btn mini sec" href="#/projeto/${p.id}">Resumo</a>
        <button class="btn mini perigo" data-excluir-projeto="${p.id}">Excluir</button></div>
    </div>`;
  };

  app.innerHTML = `
    <div class="pagina-titulo">
      <h1>Listas de materiais</h1><span class="espacador"></span>
      <button class="btn" id="btn-nova-lista">+ Requisição (RM)</button>
      <button class="btn sec" id="btn-nova-mm">+ Cadastro Mín/Máx (MM)</button>
      <button class="btn sec" id="btn-novo-projeto">+ Novo projeto</button>
    </div>
    ${projetos.length ? `<div class="secao-titulo">Projetos</div><div class="grade-cartoes">${projetos.map(cartaoProjeto).join("")}</div>` : ""}
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
    if (projetos.length) {
      const nomes = projetos.map((p, i) => `${i + 1} - ${p.nome}`).join("\n");
      const r = prompt("Vincular a um projeto? Digite o número (ou deixe vazio):\n" + nomes, "");
      if (r) { const p = projetos[parseInt(r, 10) - 1]; if (p) projetoId = p.id; }
    }
    const l = novaLista(titulo.trim() || "Nova requisição", projetoId);
    l.descricao = "";
    listas.push(l); salvarTudo(); nuvemSalvarLista(l);
    location.hash = "#/lista/" + l.id;
  };
  $("#btn-nova-lista").onclick = criarLista;
  const b2 = $("#btn-nova-lista-2"); if (b2) b2.onclick = criarLista;
  $("#btn-nova-mm").onclick = () => {
    const t = prompt("Título do cadastro de Mínimo e Máximo:", "");
    if (t === null) return;
    const l = novaLista(t.trim() || "Novo cadastro MM", "", "MM");
    l.numeroFO = MM_NUMERO;
    l.descricao = "RELAÇÃO DE MÍNIMOS E MÁXIMOS PARA COMPRA";
    l.setor = "";
    l.assinaturas = assinaturasMM(l);
    listas.push(l); salvarTudo(); nuvemSalvarLista(l);
    location.hash = "#/lista/" + l.id;
  };
  $("#btn-novo-projeto").onclick = () => {
    const nome = prompt("Nome do projeto:");
    if (!nome) return;
    const p = { id: uid(), nome: nome.trim() };
    projetos.push(p); salvarTudo(); nuvemSalvarProjeto(p); render();
  };
  app.onclick = (e) => {
    const d = e.target.dataset || {};
    if (d.excluirLista) {
      const l = listas.find(x => x.id === d.excluirLista);
      if (confirm(`Excluir a lista “${l.titulo}”?`)) { listas = listas.filter(x => x.id !== d.excluirLista); salvarTudo(); nuvemExcluirLista(d.excluirLista); render(); }
    }
    if (d.duplicar) {
      const o = listas.find(x => x.id === d.duplicar);
      const c = JSON.parse(JSON.stringify(o));
      c.id = uid(); c.titulo = o.titulo + " (cópia)"; c.criadoEm = hoje();
      listas.push(c); salvarTudo(); nuvemSalvarLista(c); render();
    }
    if (d.excluirProjeto) {
      const p = projetos.find(x => x.id === d.excluirProjeto);
      if (confirm(`Excluir o projeto “${p.nome}”? As listas continuam existindo, apenas sem o vínculo.`)) {
        listas.forEach(l => { if (l.projetoId === d.excluirProjeto) { l.projetoId = ""; nuvemSalvarLista(l); } });
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
      <a class="btn" href="#/" onclick="return criarListaNoProjeto('${p.id}')">+ Lista neste projeto</a>
    </div>
    <div class="resumo-blocos">
      <div class="resumo-num"><div class="rot">Listas</div><div class="val">${ls.length}</div></div>
      <div class="resumo-num"><div class="rot">Itens (linhas)</div><div class="val">${totalItens}</div></div>
      <div class="resumo-num"><div class="rot">Valor total</div><div class="val">${dinheiro(total)}</div></div>
    </div>
    <div class="secao-titulo">Listas do projeto</div>
    <table class="app"><thead><tr><th>Lista</th><th>Itens</th><th class="num">Total</th><th></th></tr></thead><tbody>
      ${ls.map(l => `<tr><td>${esc(l.titulo)}</td><td>${l.itens.length}</td><td class="num">${dinheiro(totalDa(l))}</td>
        <td><a class="btn mini sec" href="#/lista/${l.id}">Abrir</a></td></tr>`).join("") || `<tr><td colspan="4">Nenhuma lista vinculada.</td></tr>`}
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
  window.criarListaNoProjeto = (pid) => {
    const t = prompt("Título da lista:", "");
    if (t === null) return false;
    const l = novaLista(t.trim() || "Nova requisição", pid);
    listas.push(l); salvarTudo(); nuvemSalvarLista(l);
    location.hash = "#/lista/" + l.id;
    return false;
  };
}

/* ============================================================
   TELA: CADASTROS — assinantes (nomes/funções/e-mails) e setores
   ============================================================ */
function telaCadastros(app) {
  const linhaPessoa = (p) => `<tr>
    <td>${esc(p.nome)}</td><td>${esc(p.cargo)}</td><td>${esc(p.email || "—")}</td>
    <td style="white-space:nowrap">
      <button class="btn mini sec" data-editar-pessoa="${p.id}">Editar</button>
      <button class="btn mini perigo" data-excluir-pessoa="${p.id}">Excluir</button>
    </td></tr>`;
  const linhaSetor = (s) => `<tr>
    <td>${esc(s.nome)}</td>
    <td style="white-space:nowrap">
      <button class="btn mini sec" data-editar-setor="${s.id}">Editar</button>
      <button class="btn mini perigo" data-excluir-setor="${s.id}">Excluir</button>
    </td></tr>`;

  app.innerHTML = `
    <div class="pagina-titulo">
      <h1>Cadastros</h1><span class="espacador"></span>
      <a class="btn sec" href="#/">← Voltar</a>
    </div>
    <div class="secao-titulo">Assinantes (nomes e funções)</div>
    <p style="font-size:12px;color:var(--cinza);margin:0 0 8px">
      O <strong>e-mail</strong> vincula a pessoa ao login: quem entrar com ele vira automaticamente o solicitante das novas listas.
      Atenção: a alçada de valores usa os nomes de Pedro, Alex, Jaisson e Ademilson — se renomear essas pessoas, avise para ajustarmos a regra.</p>
    <table class="app"><thead><tr><th>Nome</th><th>Função</th><th>E-mail (login)</th><th></th></tr></thead>
      <tbody>${pessoas.map(linhaPessoa).join("")}</tbody></table>
    <button class="btn" id="btn-add-pessoa" style="margin-top:10px">+ Adicionar assinante</button>

    <div class="secao-titulo">Setores (usados no Cadastro de Mín/Máx)</div>
    <table class="app" style="max-width:480px"><thead><tr><th>Setor</th><th></th></tr></thead>
      <tbody>${setores.map(linhaSetor).join("")}</tbody></table>
    <button class="btn" id="btn-add-setor" style="margin-top:10px">+ Adicionar setor</button>`;

  const pedirPessoa = (p = {}) => {
    const nome = prompt("Nome completo:", p.nome || ""); if (nome === null || !nome.trim()) return null;
    const cargo = prompt("Função/cargo (ex.: Supervisor de Manutenção - UIS3):", p.cargo || ""); if (cargo === null) return null;
    const email = prompt("E-mail de login (opcional, vincula ao Supabase):", p.email || ""); if (email === null) return null;
    return { nome: nome.trim(), cargo: cargo.trim(), email: email.trim().toLowerCase() };
  };
  $("#btn-add-pessoa").onclick = () => {
    const d = pedirPessoa(); if (!d) return;
    const p = { id: uid(), ...d };
    pessoas.push(p); salvarCadastros(); nuvemSalvarPessoa(p); deduzirUsuario(); render();
  };
  $("#btn-add-setor").onclick = () => {
    const nome = prompt("Nome/código do setor:"); if (!nome || !nome.trim()) return;
    const s = { id: uid(), nome: nome.trim() };
    setores.push(s); salvarCadastros(); nuvemSalvarSetor(s); render();
  };
  app.onclick = (e) => {
    const d = e.target.dataset || {};
    if (d.editarPessoa) {
      const p = pessoas.find(x => x.id === d.editarPessoa);
      const novo = pedirPessoa(p); if (!novo) return;
      Object.assign(p, novo); salvarCadastros(); nuvemSalvarPessoa(p); deduzirUsuario(); render();
    }
    if (d.excluirPessoa) {
      const p = pessoas.find(x => x.id === d.excluirPessoa);
      if (confirm(`Excluir “${p.nome}” do cadastro de assinantes?`)) {
        pessoas = pessoas.filter(x => x.id !== d.excluirPessoa);
        salvarCadastros(); nuvemExcluirPessoa(d.excluirPessoa); render();
      }
    }
    if (d.editarSetor) {
      const s = setores.find(x => x.id === d.editarSetor);
      const nome = prompt("Nome/código do setor:", s.nome); if (!nome || !nome.trim()) return;
      s.nome = nome.trim(); salvarCadastros(); nuvemSalvarSetor(s); render();
    }
    if (d.excluirSetor) {
      const s = setores.find(x => x.id === d.excluirSetor);
      if (confirm(`Excluir o setor “${s.nome}”?`)) {
        setores = setores.filter(x => x.id !== d.excluirSetor);
        salvarCadastros(); nuvemExcluirSetor(d.excluirSetor); render();
      }
    }
  };
}

/* ============================================================
   TELA: EDITOR — busca à esquerda, folha A4 ao vivo à direita
   ============================================================ */
function telaEditor(app, id) {
  const L = listas.find(x => x.id === id);
  if (!L) { location.hash = "#/"; return; }
  if (!L.tipo) L.tipo = "RM";
  if (!L.status) L.status = "andamento";
  const ehMM = L.tipo === "MM";
  const prefixoPdf = ehMM ? "MM_UIS3_" : "RM_UIS3_";
  const nomePdf = () => prefixoPdf + (L.titulo || "documento").replace(/[\\/:*?"<>|]/g, "-");

  /* salvar: local na hora; nuvem 0,8s após parar de digitar; botão mostra o estado */
  let tNuvem = null;
  const marcarSalvo = (ok) => {
    const b = $("#btn-salvar"); if (!b) return;
    b.textContent = ok ? "✓ Salvo" : "💾 Salvar";
    b.classList.toggle("salvo", ok);
  };
  const salvar = () => {
    salvarTudo(); marcarSalvo(false);
    clearTimeout(tNuvem);
    tNuvem = setTimeout(async () => { await nuvemSalvarLista(L); marcarSalvo(true); }, 800);
  };

  app.innerHTML = `
  <div class="barra-editor no-print">
    <div class="be-linha">
      <span class="be-tipo">${ehMM ? "MM" : "RM"}</span>
      <input type="text" id="ed-titulo" class="be-titulo" value="${esc(L.titulo)}" placeholder="Título">
      <select id="ed-projeto" title="Projeto">
        <option value="">— sem projeto —</option>
        ${projetos.map(p => `<option value="${p.id}" ${p.id === L.projetoId ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}
      </select>
    </div>
    <div class="be-linha">
      <button class="btn sec" id="btn-status">${L.status === "concluida" ? "✅ Concluída" : "🕓 Em andamento"}</button>
      <button class="btn sec" id="btn-salvar">✓ Salvo</button>
      <span class="espacador"></span>
      <a class="btn sec" href="#/">← Voltar</a>
      <button class="btn sec" id="btn-imprimir">🖨️ Imprimir</button>
      <button class="btn" id="btn-pdf">📤 PDF</button>
    </div>
    <details class="be-notas">
      <summary>📝 Anotações internas${L.autor ? " · autor: " + esc(L.autor) : ""} (não saem no PDF)</summary>
      <textarea id="ed-anotacoes" placeholder="Anotações gerais desta lista…">${esc(L.anotacoes || "")}</textarea>
    </details>
  </div>

  <div class="editor">
    <aside class="painel no-print">
      <h2>Adicionar material</h2>
      <div class="busca-linha">
        <input type="text" id="busca" placeholder="Digite parte da descrição ou código… (Enter adiciona o 1º)" autocomplete="off">
      </div>
      <div class="busca-opcoes">
        <label><input type="checkbox" id="opt-espacos" checked> Ignorar espaços/traços (2,5MM = 2,5 MM)</label>
      </div>
      <div id="resultados"></div>
      <div class="contagem" id="contagem"></div>
      <button class="btn sec mini" id="btn-avulso" style="margin-top:8px">+ Item avulso (S/ CÓD.)</button>
      <div class="dica">Vários termos = todos precisam aparecer, em qualquer ordem.
      Ex.: <em>cabo pp 4x2,5</em>. Acentos são ignorados automaticamente.
      Amarelo = já usado antes; preço em verde vem do histórico.</div>
    </aside>

    <div class="folha-envolve">
      <div class="folha-barra no-print">
        <span class="zoom-ctl">
          <button class="btn mini sec" id="zoom-menos" title="Diminuir">−</button>
          <span id="zoom-val">100%</span>
          <button class="btn mini sec" id="zoom-mais" title="Aumentar">+</button>
          <button class="btn mini sec" id="zoom-ajustar" title="Ajustar à largura da tela">Ajustar</button>
        </span>
        <span class="total-vivo" id="total-vivo"></span>
      </div>
      <div class="folha-rolagem"><div class="folha" id="folha"></div></div>
    </div>
  </div>`;

  /* ---------- barra do editor ---------- */
  $("#ed-titulo").oninput = (e) => { L.titulo = e.target.value; salvar(); };
  $("#ed-projeto").onchange = (e) => { L.projetoId = e.target.value; salvar(); };
  $("#ed-anotacoes").oninput = (e) => { L.anotacoes = e.target.value; salvar(); };
  $("#btn-status").onclick = () => {
    L.status = L.status === "concluida" ? "andamento" : "concluida";
    $("#btn-status").textContent = L.status === "concluida" ? "✅ Concluída" : "🕓 Em andamento";
    salvar();
  };
  $("#btn-salvar").onclick = async () => {
    salvarTudo();
    clearTimeout(tNuvem);
    $("#btn-salvar").textContent = "Salvando…";
    await nuvemSalvarLista(L);
    marcarSalvo(true);
  };
  marcarSalvo(true);

  $("#btn-imprimir").onclick = () => {
    const tituloAntes = document.title;
    document.title = nomePdf();               // vira o nome do PDF na impressão
    window.print();
    setTimeout(() => { document.title = tituloAntes; }, 500);
  };

  /* ---------- PDF: clona a folha trocando campos por texto e pagina manualmente ---------- */
  function clonarFolhaParaPdf() {
    const orig = $(".folha");
    const clone = orig.cloneNode(true);
    clone.style.zoom = "1";
    clone.style.width = "1123px";
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
      if (o.closest("td.d-preco")) {   // R$ à esquerda, número à direita
        span.style.cssText = "display:inline-block;width:calc(100% - 18px);float:right;text-align:right";
      } else {
        span.style.cssText = `display:block;white-space:pre-wrap;overflow:hidden;text-align:${st.textAlign};font-weight:${st.fontWeight};min-height:11px`;
      }
      el.replaceWith(span);
    });
    clone.querySelectorAll(".no-print, td.d-remover, .d-ass-troca").forEach(el => el.remove());
    clone.querySelectorAll("tr.d-vazia").forEach(el => el.remove());   // sem linhas em branco, como no oficial
    clone.querySelectorAll("col.cX").forEach(c => { c.style.width = "0"; });
    return clone;
  }

  async function gerarPdfBlob() {
    const clone = clonarFolhaParaPdf();
    const palco = document.createElement("div");
    palco.style.cssText = "position:fixed;left:-12000px;top:0;width:1123px;background:#fff;z-index:-1";
    palco.appendChild(clone);
    document.body.appendChild(palco);
    try {
      await new Promise(r => setTimeout(r, 80));   // deixa as imagens assentarem
      const canvas = await html2canvas(clone, { scale: 2, backgroundColor: "#ffffff", windowWidth: 1200, useCORS: true });
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
      const margem = 6;
      const pw = 297 - margem * 2;                              // largura útil da página
      const ph = 210 - margem * 2;                              // altura útil
      const pagPx = Math.floor(canvas.width * (ph / pw));       // altura de 1 página em px do canvas
      let y = 0, primeira = true;
      while (y < canvas.height) {
        const fatia = Math.min(pagPx, canvas.height - y);
        const c2 = document.createElement("canvas");
        c2.width = canvas.width; c2.height = fatia;
        c2.getContext("2d").drawImage(canvas, 0, y, canvas.width, fatia, 0, 0, canvas.width, fatia);
        if (!primeira) pdf.addPage();
        pdf.addImage(c2.toDataURL("image/jpeg", 0.95), "JPEG", margem, margem, pw, fatia * (pw / canvas.width));
        primeira = false;
        y += fatia;
      }
      return pdf.output("blob");
    } finally {
      palco.remove();
    }
  }

  /* gera o ARQUIVO .pdf (funciona no celular) e abre o compartilhar do sistema */
  $("#btn-pdf").onclick = async () => {
    const btn = $("#btn-pdf");
    btn.disabled = true; btn.textContent = "Gerando…";
    try {
      const nome = nomePdf() + ".pdf";
      const blob = await gerarPdfBlob();
      const arquivo = new File([blob], nome, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        try { await navigator.share({ files: [arquivo], title: nomePdf() }); }
        catch (e) { if (e.name !== "AbortError") baixarBlob(blob, nome); }
      } else {
        baixarBlob(blob, nome);
      }
    } catch (e) {
      alert("Erro ao gerar o PDF: " + e.message);
    }
    btn.disabled = false; btn.textContent = "📤 PDF";
  };

  /* ---------- zoom da folha (celular e PC) ---------- */
  let zoomManual = parseFloat(sessionStorage.getItem("rq.zoom") || "") || 0;   // 0 = ajustar à tela
  function aplicarZoom() {
    const f = $(".folha"); if (!f) return;
    const larguraDisp = $(".folha-envolve").clientWidth - 4;
    const fator = zoomManual || Math.min(1, larguraDisp / 1123);
    f.style.zoom = fator;
    $("#zoom-val").textContent = Math.round(fator * 100) + "%";
  }
  const mudarZoom = (delta) => {
    const atual = parseFloat($(".folha").style.zoom || 1);
    zoomManual = Math.min(2, Math.max(0.3, atual + delta));
    sessionStorage.setItem("rq.zoom", zoomManual);
    aplicarZoom();
  };
  $("#zoom-menos").onclick = () => mudarZoom(-0.1);
  $("#zoom-mais").onclick = () => mudarZoom(+0.1);
  $("#zoom-ajustar").onclick = () => { zoomManual = 0; sessionStorage.setItem("rq.zoom", ""); aplicarZoom(); };
  window.addEventListener("resize", aplicarZoom);

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
      window.open("https://www.google.com/search?q=" + encodeURIComponent('"' + r.d + '"'), "_blank");
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
    const base = { codigo: r.c, descricao: r.d, un: r.u, preco: 0 };
    const ph = precoLembrado(base);
    if (ph) base.preco = ph;                    // puxa o último preço usado
    const item = ehMM ? { ...base, qtdMin: 0, qtdMax: 0, justificativa: "" } : { ...base, qtd: 1 };
    L.itens.push(item);
    salvar(); desenharFolha();
    caixa.select();
  }
  $("#btn-avulso").onclick = () => {
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
    const dir = e.key === "ArrowUp" ? -1 : 1;                     // Enter desce, como no Excel
    const col = COLUNAS_NAV.find(k => t.dataset[k] !== undefined);
    let alvo = null;
    if (col) {                                                    // dentro da tabela: mesma coluna, linha ±1
      alvo = $(`#folha [data-${col}="${+t.dataset[col] + dir}"]`);
      if (!alvo && dir === 1 && e.key === "Enter") { caixa.focus(); e.preventDefault(); return; }
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

    if (ehMM) folhaMM(); else folhaRM();
    ligarEventosFolha();
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
    if (!L.assinaturasManuais) L.assinaturas = assinaturasPorValor(total);
    $("#total-vivo").textContent = "Total: " + dinheiro(total);

    const linhaItem = (i, idx) => `
      <tr class="d-item ${idx % 2 ? "zebra" : ""}">
        <td class="d-cent">${esc(i.codigo)}</td>
        <td class="d-desc-item">${esc(i.descricao)}</td>
        <td class="d-cent">${esc(i.un)}</td>
        <td class="d-qtd"><input data-qtd="${idx}" value="${i.qtd ? fmtQtd(i.qtd) : ""}" inputmode="decimal"></td>
        <td class="d-preco"><span>R$</span><input data-preco="${idx}" value="${i.preco ? fmtBR.format(i.preco) : ""}" inputmode="decimal" style="text-align:right"></td>
        <td class="d-num">${(i.qtd && i.preco) ? "R$ " + fmtBR.format(i.qtd * i.preco) : ""}</td>
        <td class="d-remover no-print"><button data-remover="${idx}" title="Remover">✕</button></td>
      </tr>`;
    const vazias = Math.max(0, LINHAS_MIN - L.itens.length);
    const linhaVazia = `<tr class="d-item d-vazia"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td class="d-remover no-print"></td></tr>`;

    const ass = [L.assinaturas[0] || "", L.assinaturas[1] || "", L.assinaturas[2] || ""];
    const rotAss = (i, nome) => (i === 0 && nome === P.pedro) ? "VISTO SOLICITANTE" : "VISTO AUTORIZAÇÃO";
    const celAss = (nome, i, colspan) => `
      <td colspan="${colspan}">
        ${nome ? `<div class="d-ass-nome">${esc(nome)}</div><div class="d-ass-cargo">${esc(cargoDe(nome))}</div>` : "&nbsp;"}
        <div class="d-ass-troca no-print">
          <select data-ass="${i}">
            <option value="" ${!nome ? "selected" : ""}>(sem assinatura)</option>
            ${pessoas.map(p => `<option ${p.nome === nome ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}
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
        <td class="d-cent"><input data-l="setor" value="${esc(L.setor)}" style="text-align:center"></td>
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
      Assinaturas sugeridas pela alçada de valor (até R$ 3.000 / até R$ 20.000 / acima).
      ${L.assinaturasManuais ? '<button class="btn mini sec" id="btn-auto-ass">Voltar ao automático</button>' : "Troque nos seletores para fixar manualmente."}
    </div>`;
  }

  /* ===== folha MM: RELAÇÃO DE MÍNIMOS E MÁXIMOS PARA COMPRA =====
     Réplica do FO 185 1615-0014. Colunas (proporções do modelo):
     ESPECIFICAÇÃO 28% | UN 3,4% | MIN 6% | MAX 6% | CÓDIGO 6,5% | VALOR UN 7% | VALOR TOTAL 8,4% | JUSTIF. 34,7%
     Valor total da linha = QTDE MIN × VALOR UN (regra do próprio formulário). */
  function folhaMM() {
    L.assinaturas = assinaturasMM(L);
    const total = totalDa(L);
    $("#total-vivo").textContent = "Soma (Qtde Mín × Valor Un): " + dinheiro(total);

    const linhaItem = (i, idx) => `
      <tr class="d-item ${idx % 2 ? "zebra" : ""}">
        <td class="d-desc-item">${esc(i.descricao)}</td>
        <td class="d-cent">${esc(i.un)}</td>
        <td class="d-qtd"><input data-min="${idx}" value="${i.qtdMin ? fmtQtd(i.qtdMin) : ""}" inputmode="decimal" style="text-align:center"></td>
        <td class="d-qtd"><input data-max="${idx}" value="${i.qtdMax ? fmtQtd(i.qtdMax) : ""}" inputmode="decimal" style="text-align:center"></td>
        <td class="d-cent">${esc(i.codigo)}</td>
        <td class="d-preco"><span>R$</span><input data-preco="${idx}" value="${i.preco ? fmtBR.format(i.preco) : ""}" inputmode="decimal" style="text-align:right"></td>
        <td>${(i.qtdMin && i.preco) ? `<span class="val-flex"><span>R$</span><span>${fmtBR.format(i.qtdMin * i.preco)}</span></span>` : ""}</td>
        <td class="d-just"><input data-just="${idx}" value="${esc(i.justificativa || "")}" placeholder=""></td>
        <td class="d-remover no-print"><button data-remover="${idx}" title="Remover">✕</button></td>
      </tr>`;
    const vazias = Math.max(0, LINHAS_MIN - L.itens.length);
    const linhaVazia = `<tr class="d-item d-vazia"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td class="d-remover no-print"></td></tr>`;

    const ass = L.assinaturas;   // [solicitante, supervisor, gerente industrial]
    const nomeCargo = (nome) => nome
      ? `<div class="d-ass-nome">${esc(nome)}</div><div class="d-ass-cargo">${esc(cargoDe(nome))}</div>`
      : "&nbsp;";

    $("#folha").innerHTML = `
    <table class="doc">
      <colgroup>
        <col style="width:28%"><col style="width:3.4%"><col style="width:6%"><col style="width:6%">
        <col style="width:6.5%"><col style="width:7%"><col style="width:8.4%"><col style="width:34.7%"><col class="cX">
      </colgroup>

      <!-- cabeçalho: logo | título | bloco Número/Emissão/Revisão/No. -->
      <tr>
        <td class="d-logo"><img src="logo.png" alt="Lar" onerror="this.outerHTML='<b style=\'font-size:22px;color:#d5203b\'>Lar</b>'"></td>
        <td class="d-titulo" colspan="6">RELAÇÃO DE MÍNIMOS E MÁXIMOS PARA COMPRA</td>
        <td style="padding:0">
          <table class="mm-num">
            <tr><td colspan="3" class="rot">Número</td></tr>
            <tr><td colspan="3" class="d-cent d-valor"><input data-l="numeroFO" value="${esc(L.numeroFO || MM_NUMERO)}" style="text-align:center;font-weight:700"></td></tr>
            <tr><td class="rot">Emissão</td><td class="rot">Revisão</td><td class="rot">No.</td></tr>
            <tr><td class="d-cent d-valor">${MM_EMISSAO}</td><td class="d-cent d-valor"></td><td class="d-cent d-valor">${MM_NO}</td></tr>
          </table>
        </td>
        <td class="d-remover no-print"></td>
      </tr>

      <!-- linha solicitante / setor / data / nr o.s. -->
      <tr>
        <td colspan="8" style="padding:0">
          <table class="mm-linha6">
            <tr>
              <td style="width:44%"><span class="rotulo">SOLICITANTE:</span> <input data-l="solicitante" value="${esc(L.solicitante)}" style="width:calc(100% - 92px);display:inline-block"></td>
              <td class="rotulo" style="width:6%;text-align:center">SETOR:</td>
              <td style="width:20%" class="d-cent">
                <select data-l="setor" style="width:100%;background:#fffbe6;border:none;text-align:center;text-align-last:center">
                  <option value="">— selecione —</option>
                  ${setores.map(s => `<option ${s.nome === L.setor ? "selected" : ""}>${esc(s.nome)}</option>`).join("")}
                </select>
              </td>
              <td style="width:17%"><span class="rotulo">DATA:</span> <input type="date" data-l="data" value="${esc(L.data)}" style="width:calc(100% - 46px);display:inline-block"></td>
              <td style="width:13%"><span class="rotulo">NR O.S.</span> <input data-l="nrOS" value="${esc(L.nrOS || "")}" style="width:calc(100% - 58px);display:inline-block"></td>
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
      ${linhaVazia.repeat(vazias)}

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
              <td>${nomeCargo(ass[0])}</td>
              <td>${nomeCargo(ass[1])}</td>
              <td>${nomeCargo(ass[2])}</td>
              <td>&nbsp;</td>
            </tr>
          </table>
        </td>
        <td class="d-remover no-print"></td>
      </tr>
    </table>
    <div class="no-print" style="margin-top:6px;font-size:11px;color:#777">
      Assinantes fixos do MM: solicitante + supervisor + gerente industrial (independe do valor).
      Valor total de cada linha segue o formulário oficial: Qtde Mín × Valor Un.
    </div>`;
  }

  /* ===== eventos comuns da folha ===== */
  function ligarEventosFolha() {
    $$("#folha [data-l]").forEach(el => {
      el.onchange = el.oninput = () => { L[el.dataset.l] = el.value; salvar(); };
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
  caixa.focus();
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

  $("#btn-exportar-backup").onclick = () => {
    const blob = new Blob([JSON.stringify({ projetos, listas, precos }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `backup-requisicoes-${hoje()}.json`;
    a.click();
  };
  $("#arquivo-backup").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!confirm("Importar backup? Isso SUBSTITUI as listas, projetos e preços atuais deste navegador.")) return;
      projetos = j.projetos || []; listas = j.listas || []; precos = j.precos || {};
      salvarTudo(); render();
      if (sb) {
        for (const p of projetos) await nuvemSalvarProjeto(p);
        for (const l of listas) await nuvemSalvarLista(l);
        for (const [chave, reg] of Object.entries(precos)) await nuvemSalvarPreco(chave, reg);
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
  carregarBanco();
  carregarNuvem();
});
