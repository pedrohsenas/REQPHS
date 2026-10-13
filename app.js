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

/* Regras de alçada de assinatura por valor total.
   O 1º visto é sempre o SOLICITANTE da própria requisição (quem criou);
   acima de R$ 30 mil o documento sobe para as gerências. */
function assinaturasPorValor(total, solicitante) {
  const quem = solicitante || P.pedro;
  if (total <= 5000)  return [quem, P.alex];                  // supervisor
  if (total <= 30000) return [quem, P.alex, P.jaisson];       // + gerente industrial
  return [P.alex, P.jaisson, P.ademilson];                    // gerente corporativo
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
  const eu = (usuarioAtual && usuarioAtual.nome) || P.pedro;
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
  l.assinaturas = l.tipo === "MM" ? assinaturasMM(l) : assinaturasPorValor(0, l.solicitante);
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
const setorCadastrado = (v) => (setores || []).some(s => s.nome === v);

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
  el.title = fora ? "Setor fora do cadastro (Cadastros → Setores)" : "Código numérico do setor — sugestões do cadastro";
}

/* ---------------- roteamento ---------------- */
window.addEventListener("hashchange", render);
function render() {
  const h = location.hash || "#/";
  const app = $("#app");
  sairDoEditor();                                   // salva pendências do editor anterior
  app.onclick = null;                               // cada tela liga os próprios cliques
  document.body.classList.toggle("pg-editor", h.startsWith("#/lista/"));
  if (h.startsWith("#/lista/"))       telaEditor(app, h.slice(8));
  else if (h.startsWith("#/projeto/")) telaProjeto(app, h.slice(10));
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
    ...pessoas.map(p => p.nome),
    ...listas.map(l => l.autor).filter(Boolean),
    ...projetos.map(p => p.autor).filter(Boolean),
  ])].sort();

  const ativos = projetos.filter(p => p.status !== "arquivado" && donoOk(p.autor));
  const ordem = localStorage.getItem("rq.ordem") || "novas";   // 'novas' (padrão) ou 'antigas'
  const quando = (l) => {
    const t = Date.parse(l.criadoEm || "");                    // data de criação (aaaa-mm-dd)
    if (!isNaN(t)) return t;
    const p = parseInt(String(l.id).split("-")[0], 36);        // reserva: o id embute o timestamp
    return isNaN(p) ? 0 : p;
  };
  const ordenar = (arr) => arr.sort((a, b) => ordem === "antigas" ? quando(a) - quando(b) : quando(b) - quando(a));
  const rms = ordenar(listas.filter(l => (l.tipo || "RM") !== "MM" && donoOk(l.autor)));
  const mms = ordenar(listas.filter(l => l.tipo === "MM" && donoOk(l.autor)));
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
    if (projetos.length) {
      const nomes = projetos.map((p, i) => `${i + 1} - ${p.nome}`).join("\n");
      const r = prompt("Vincular a um projeto? Digite o número (ou deixe vazio):\n" + nomes, "");
      if (r) { const p = projetos[parseInt(r, 10) - 1]; if (p) projetoId = p.id; }
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
    const p = { id: uid(), nome: nome.trim(), status: "andamento", autor: (usuarioAtual && usuarioAtual.nome) || emailSessao || "" };
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
  const arquivados = projetos.filter(p => p.status === "arquivado");
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
    <td>${esc(s.nome)}${setorValido(s.nome) ? "" : ' <span class="etiqueta" title="Edite para um código só com números">não numérico</span>'}</td>
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

    <div class="secao-titulo">Setores (código numérico)</div>
    <p style="font-size:12px;color:var(--cinza);margin:0 0 8px">
      Aparecem como sugestão no campo <strong>SETOR</strong> da RM e do MM (que aceita apenas números). Novas requisições começam com o setor em branco.</p>
    <table class="app" style="max-width:480px"><thead><tr><th>Setor</th><th></th></tr></thead>
      <tbody>${setores.slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR", { numeric: true })).map(linhaSetor).join("")}</tbody></table>
    <button class="btn" id="btn-add-setor" style="margin-top:10px">+ Adicionar setor</button>`;

  const pedirPessoa = (p = {}) => {
    const nome = prompt("Nome completo:", p.nome || ""); if (nome === null || !nome.trim()) return null;
    const cargo = prompt("Função/cargo (ex.: Supervisor de Manutenção - UIS3):", p.cargo || ""); if (cargo === null) return null;
    const email = prompt("E-mail de login (opcional, vincula ao Supabase):", p.email || ""); if (email === null) return null;
    return { nome: nome.trim(), cargo: cargo.trim(), email: email.trim().toLowerCase() };
  };
  /* pede o código do setor: só números e sem repetir */
  const pedirSetor = (atual = "") => {
    let sugestao = atual;
    for (;;) {
      const v = prompt("Código numérico do setor (somente números, ex.: 9313):", sugestao);
      if (v === null) return null;
      const c = v.replace(/\s/g, "");
      if (!setorValido(c)) { alert("Use apenas números no código do setor."); sugestao = v; continue; }
      if (c !== atual && setores.some(s => s.nome === c)) { alert(`O setor ${c} já está cadastrado.`); sugestao = c; continue; }
      return c;
    }
  };
  $("#btn-add-pessoa").onclick = () => {
    const d = pedirPessoa(); if (!d) return;
    const p = { id: uid(), ...d };
    pessoas.push(p); salvarCadastros(); nuvemSalvarPessoa(p); deduzirUsuario(); render();
  };
  $("#btn-add-setor").onclick = () => {
    const nome = pedirSetor(); if (!nome) return;
    const s = { id: uid(), nome };
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
      const nome = pedirSetor(s.nome); if (!nome) return;
      s.nome = nome; salvarCadastros(); nuvemSalvarSetor(s); render();
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
   TELA: EDITOR — painel lateral recolhível (itens · anotações ·
   histórico) e folha A4 ao vivo numa "mesa" de tela cheia
   ============================================================ */
function telaEditor(app, id) {
  const L = listas.find(x => x.id === id);
  if (!L) { location.hash = "#/"; return; }
  if (!L.tipo) L.tipo = "RM";
  if (!L.status) L.status = "andamento";
  const ehMM = L.tipo === "MM";
  const prefixoPdf = ehMM ? "MM_UIS3_" : "RM_UIS3_";
  const nomePdf = () => prefixoPdf + (L.titulo || "documento").replace(/[\\/:*?"<>|]/g, "-");

  const travada = () => L.status === "concluida";
  const abaInicial = sessionStorage.getItem("rq.latAba") || "itens";
  const setoresNum = setores.filter(s => setorValido(s.nome))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));

  app.innerHTML = `
  <div class="ed">
    <div class="ed-barra no-print">
      <span class="ed-tipo" title="${ehMM ? "Relação de Mínimos e Máximos para Compra" : "Requisição de Material"}">${ehMM ? "MM" : "RM"}</span>
      <input type="text" id="ed-titulo" class="ed-titulo" value="${esc(L.titulo)}" placeholder="Título da lista">
      <select id="ed-projeto" title="Projeto vinculado">
        <option value="">— sem projeto —</option>
        ${projetos.filter(p => p.status !== "arquivado" || p.id === L.projetoId)
          .map(p => `<option value="${p.id}" ${p.id === L.projetoId ? "selected" : ""}>${esc(p.nome)}${p.status === "arquivado" ? " (arquivado)" : ""}</option>`).join("")}
      </select>
      <label class="ed-rot" title="Quem criou/responde por esta lista">Autor
        <select id="ed-autor">
          <option value="" ${!L.autor ? "selected" : ""}>— não definido —</option>
          ${[...new Set([...pessoas.map(p => p.nome), ...(L.autor ? [L.autor] : [])])].sort()
            .map(n => `<option ${n === L.autor ? "selected" : ""}>${esc(n)}</option>`).join("")}
        </select>
      </label>
      <span class="ed-sep"></span>
      <button class="btn sec ed-status" id="btn-status"></button>
      <button class="ed-salvo" id="ed-salvo" data-estado="salvo" title="Clique para salvar agora"></button>
      <span class="espacador"></span>
      <button class="btn sec" id="btn-imprimir">🖨️ Imprimir</button>
      <button class="btn" id="btn-pdf">📤 PDF</button>
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

  /* exportar PDF = impressão vetorial salva como PDF (texto pesquisável, arquivo leve) */
  $("#btn-pdf").onclick = imprimirDocumento;

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
    if (!L.assinaturasManuais && !travada()) L.assinaturas = assinaturasPorValor(total, L.solicitante);
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
    const rotAss = (i, nome) => (i === 0 && nome && nome === L.solicitante) ? "VISTO SOLICITANTE" : "VISTO AUTORIZAÇÃO";
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
        <td class="d-remover no-print"><button data-remover="${idx}" title="Remover">✕</button></td>
      </tr>`;

    const ass = [L.assinaturas[0] || "", L.assinaturas[1] || "", L.assinaturas[2] || ""];
    const nomeCargo = (nome) => nome
      ? `<div class="d-ass-nome">${esc(nome)}</div><div class="d-ass-cargo">${esc(cargoDe(nome))}</div>`
      : "&nbsp;";
    const seletorAss = (i) => `
      <div class="d-ass-troca no-print">
        <select data-ass="${i}">
          <option value="" ${!ass[i] ? "selected" : ""}>(sem assinatura)</option>
          ${pessoas.map(p => `<option ${p.nome === ass[i] ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}
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
