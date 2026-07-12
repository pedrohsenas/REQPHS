/* ============================================================
   Requisições UIS3 — app.js
   Tudo roda no navegador: banco de itens no IndexedDB,
   listas/projetos/preços no localStorage. Nenhum servidor.
   ============================================================ */
"use strict";

/* ---------------- pessoas (aba "Dados" do modelo) ---------------- */
const PESSOAS = [
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
];
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
const cargoDe = (nome) => (PESSOAS.find(p => p.nome === nome) || {}).cargo || "";

/* ---------------- utilidades ---------------- */
const $  = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const hoje = () => new Date().toISOString().slice(0, 10);
const fmtBR = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dinheiro = (v) => "R$ " + fmtBR.format(v || 0);
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
let listas   = LS.ler("rq.listas", []);     // ver novaLista()
let precos   = LS.ler("rq.precos", {});     // { chaveItem: {preco, em} }
const salvarTudo = () => { LS.gravar("rq.projetos", projetos); LS.gravar("rq.listas", listas); LS.gravar("rq.precos", precos); };

const chavePreco = (item) => item.codigo && item.codigo !== "S/ CÓD." ? "C:" + item.codigo : "D:" + norm(item.descricao);
function lembrarPreco(item) {
  if (!item.preco) return;
  precos[chavePreco(item)] = { preco: item.preco, em: hoje() };
  LS.gravar("rq.precos", precos);
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
  BANCO = itens.map(([c, d, u]) => {
    const n = norm(d) + " " + String(c);
    return { c: String(c), d: String(d), u: String(u || "UN"), n, ns: semEspaco(n) };
  });
}

async function carregarBanco() {
  const st = $("#status-banco");
  try {
    const salvo = await IDB.ler("banco");
    if (salvo && salvo.itens && salvo.itens.length) {
      indexarBanco(salvo.itens);
      st.textContent = `banco: ${BANCO.length.toLocaleString("pt-BR")} itens (${salvo.em || "importado"})`;
      st.className = "status-banco ok";
      return;
    }
    // sem banco no navegador: tenta dados/banco.json (repositório privado) ou exemplo
    for (const url of ["dados/banco.json", "dados/banco.exemplo.json"]) {
      try {
        const r = await fetch(url, { cache: "no-cache" });
        if (!r.ok) continue;
        const j = await r.json();
        indexarBanco(j.itens);
        st.textContent = `banco: ${BANCO.length.toLocaleString("pt-BR")} itens (${url.includes("exemplo") ? "EXEMPLO — importe o real" : "do repositório"})`;
        st.className = "status-banco ok";
        return;
      } catch { /* tenta o próximo */ }
    }
    st.textContent = "banco: vazio — clique em “Banco de itens” para importar o .xlsx";
    st.className = "status-banco erro";
  } catch (e) {
    st.textContent = "banco: erro ao carregar (" + e.message + ")";
    st.className = "status-banco erro";
  }
}

/* ---------------- importação do .xlsx da empresa ---------------- */
async function importarArquivoBanco(arquivo, apenasAtivos) {
  const prog = $("#progresso-banco");
  prog.hidden = false;
  prog.textContent = "Lendo arquivo… (o de 19 MB leva alguns segundos)";
  await new Promise(r => setTimeout(r, 30)); // deixa a UI respirar

  let itens = [];
  if (/\.json$/i.test(arquivo.name)) {
    const j = JSON.parse(await arquivo.text());
    itens = j.itens || j;
  } else {
    const buf = await arquivo.arrayBuffer();
    prog.textContent = "Interpretando planilha…";
    await new Promise(r => setTimeout(r, 30));
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames.find(n => /relacao/i.test(n)) || wb.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    // localiza a linha de cabeçalho (CÓDIGO / DESCRIÇÃO / UN)
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
      if (apenasAtivos && col.sit != null && norm(pega(l, col.sit)) !== "ATIVO") continue;
      itens.push([codigo, desc, pega(l, col.un) || "UN"]);
      if (i % 20000 === 0) { prog.textContent = `Processando… ${i.toLocaleString("pt-BR")} linhas`; await new Promise(r => setTimeout(r, 0)); }
    }
  }
  if (!itens.length) throw new Error("Nenhum item encontrado no arquivo.");
  prog.textContent = "Salvando no navegador…";
  await IDB.gravar("banco", { itens, em: dataBR(hoje()) });
  indexarBanco(itens);
  prog.textContent = `Pronto! ${itens.length.toLocaleString("pt-BR")} itens disponíveis para busca.`;
  const st = $("#status-banco");
  st.textContent = `banco: ${BANCO.length.toLocaleString("pt-BR")} itens (${dataBR(hoje())})`;
  st.className = "status-banco ok";
}

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
      achados.push({ it, pos: pos < 0 ? 999 : pos });
      if (achados.length >= 400) break;   // já há resultados de sobra
    }
  }
  achados.sort((a, b) => a.pos - b.pos || a.it.d.length - b.it.d.length);
  return achados.slice(0, limite).map(a => a.it);
}

/* ---------------- modelos de dados ---------------- */
function novaLista(titulo, projetoId) {
  return {
    id: uid(), titulo: titulo || "Nova requisição", projetoId: projetoId || "",
    numeroFO: "FO 185 1613-0015",
    local: "185 - UIS 3", areaSetor: "PROJETOS",
    emissao: hoje(), revisao: "0", numero: "",
    descricao: "", data: hoje(),
    solicitante: P.pedro, setor: "9313", projetoNum: "", nrOS: "",
    observacao: "COMUNICAR O SOLICITANTE QUANDO DA CHEGADA.",
    itens: [],                       // {codigo, descricao, un, qtd, preco}
    assinaturas: assinaturasPorValor(0),
    assinaturasManuais: false,
    criadoEm: hoje(),
  };
}
const totalDa = (l) => l.itens.reduce((s, i) => s + (i.qtd || 0) * (i.preco || 0), 0);

/* ---------------- roteamento ---------------- */
window.addEventListener("hashchange", render);
function render() {
  const h = location.hash || "#/";
  const app = $("#app");
  if (h.startsWith("#/lista/"))       telaEditor(app, h.slice(8));
  else if (h.startsWith("#/projeto/")) telaProjeto(app, h.slice(10));
  else telaInicio(app);
}

/* ============================================================
   TELA: INÍCIO — projetos e listas
   ============================================================ */
function telaInicio(app) {
  const cartaoLista = (l) => {
    const proj = projetos.find(p => p.id === l.projetoId);
    return `<div class="cartao">
      <h3><a href="#/lista/${l.id}">${esc(l.titulo)}</a></h3>
      <div class="sub">${l.itens.length} itens · criada em ${dataBR(l.criadoEm)}${proj ? ` · <span class="etiqueta">${esc(proj.nome)}</span>` : ""}</div>
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
      <button class="btn" id="btn-nova-lista">+ Nova lista</button>
      <button class="btn sec" id="btn-novo-projeto">+ Novo projeto</button>
    </div>
    ${projetos.length ? `<div class="secao-titulo">Projetos</div><div class="grade-cartoes">${projetos.map(cartaoProjeto).join("")}</div>` : ""}
    <div class="secao-titulo">Requisições</div>
    ${listas.length
      ? `<div class="grade-cartoes">${[...listas].reverse().map(cartaoLista).join("")}</div>`
      : `<div class="vazio">Nenhuma lista ainda.<br><br><button class="btn" id="btn-nova-lista-2">Criar a primeira lista</button></div>`}
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
    listas.push(l); salvarTudo();
    location.hash = "#/lista/" + l.id;
  };
  $("#btn-nova-lista").onclick = criarLista;
  const b2 = $("#btn-nova-lista-2"); if (b2) b2.onclick = criarLista;
  $("#btn-novo-projeto").onclick = () => {
    const nome = prompt("Nome do projeto:");
    if (!nome) return;
    projetos.push({ id: uid(), nome: nome.trim() }); salvarTudo(); render();
  };
  app.onclick = (e) => {
    const d = e.target.dataset || {};
    if (d.excluirLista) {
      const l = listas.find(x => x.id === d.excluirLista);
      if (confirm(`Excluir a lista “${l.titulo}”?`)) { listas = listas.filter(x => x.id !== d.excluirLista); salvarTudo(); render(); }
    }
    if (d.duplicar) {
      const o = listas.find(x => x.id === d.duplicar);
      const c = JSON.parse(JSON.stringify(o));
      c.id = uid(); c.titulo = o.titulo + " (cópia)"; c.criadoEm = hoje();
      listas.push(c); salvarTudo(); render();
    }
    if (d.excluirProjeto) {
      const p = projetos.find(x => x.id === d.excluirProjeto);
      if (confirm(`Excluir o projeto “${p.nome}”? As listas continuam existindo, apenas sem o vínculo.`)) {
        listas.forEach(l => { if (l.projetoId === d.excluirProjeto) l.projetoId = ""; });
        projetos = projetos.filter(x => x.id !== d.excluirProjeto);
        salvarTudo(); render();
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
    if (n) { p.nome = n.trim(); salvarTudo(); render(); }
  };
  window.criarListaNoProjeto = (pid) => {
    const t = prompt("Título da lista:", "");
    if (t === null) return false;
    const l = novaLista(t.trim() || "Nova requisição", pid);
    listas.push(l); salvarTudo();
    location.hash = "#/lista/" + l.id;
    return false;
  };
}

/* ============================================================
   TELA: EDITOR — busca à esquerda, folha A4 ao vivo à direita
   ============================================================ */
function telaEditor(app, id) {
  const L = listas.find(x => x.id === id);
  if (!L) { location.hash = "#/"; return; }
  const salvar = () => { salvarTudo(); };

  app.innerHTML = `
  <div class="pagina-titulo no-print">
    <h1>✏️ <input type="text" id="ed-titulo" value="${esc(L.titulo)}" style="font-size:17px;font-weight:700;min-width:280px"></h1>
    <select id="ed-projeto" title="Projeto">
      <option value="">— sem projeto —</option>
      ${projetos.map(p => `<option value="${p.id}" ${p.id === L.projetoId ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}
    </select>
    <span class="espacador"></span>
    <a class="btn sec" href="#/">← Voltar</a>
    <button class="btn" id="btn-pdf">🖨️ Gerar PDF</button>
  </div>

  <div class="editor">
    <!-- painel de busca -->
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
      Preços em verde vêm do histórico das suas listas.</div>
    </aside>

    <!-- folha A4 -->
    <div class="folha-envolve">
      <div class="folha-barra no-print">
        <span>Prévia do PDF — os campos amarelos são editáveis e saem brancos na impressão.</span>
        <span class="total-vivo" id="total-vivo"></span>
      </div>
      <div class="folha" id="folha"></div>
    </div>
  </div>`;

  $("#ed-titulo").oninput = (e) => { L.titulo = e.target.value; salvar(); };
  $("#ed-projeto").onchange = (e) => { L.projetoId = e.target.value; salvar(); };
  $("#btn-pdf").onclick = () => {
    const tituloAntes = document.title;
    document.title = L.titulo.replace(/[\\/:*?"<>|]/g, "-");   // vira o nome do PDF
    window.print();
    setTimeout(() => { document.title = tituloAntes; }, 500);
  };

  /* ---------- busca ---------- */
  let selecionado = -1, resultadosAtuais = [];
  const caixa = $("#busca");
  const desenharResultados = () => {
    const alvo = $("#resultados");
    alvo.innerHTML = resultadosAtuais.map((r, i) => {
      const ph = precoLembrado({ codigo: r.c, descricao: r.d });
      return `<div class="resultado ${i === selecionado ? "ativo" : ""}" data-i="${i}">
        <span class="cod">${esc(r.c)}</span><span class="desc">${esc(r.d)}</span>
        <span class="un">${esc(r.u)}</span>${ph ? `<span class="preco-hist">${dinheiro(ph)}</span>` : ""}
      </div>`;
    }).join("");
    $("#contagem").textContent = resultadosAtuais.length
      ? `${resultadosAtuais.length} resultado(s)` + (resultadosAtuais.length >= 60 ? " — refine a busca para ver mais" : "")
      : (caixa.value.trim() ? "Nada encontrado. Tente menos termos ou marque “ignorar espaços”." : "");
    $$(".resultado", alvo).forEach(el => el.onclick = () => adicionarDoBanco(resultadosAtuais[+el.dataset.i]));
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
    const item = { codigo: r.c, descricao: r.d, un: r.u, qtd: 1, preco: 0 };
    const ph = precoLembrado(item);
    if (ph) item.preco = ph;                    // puxa o último preço usado
    L.itens.push(item);
    salvar(); desenharFolha();
    caixa.select();
  }
  $("#btn-avulso").onclick = () => {
    const d = prompt("Descrição do item avulso:");
    if (!d) return;
    const item = { codigo: "S/ CÓD.", descricao: d.trim().toUpperCase(), un: "pç", qtd: 1, preco: 0 };
    const ph = precoLembrado(item);
    if (ph) item.preco = ph;
    L.itens.push(item); salvar(); desenharFolha();
  };

  /* ---------- folha A4 (prévia = PDF) ---------- */
  const LINHAS_MIN = 20;   // linhas em branco como no modelo Excel
  function desenharFolha() {
    const total = totalDa(L);
    if (!L.assinaturasManuais) L.assinaturas = assinaturasPorValor(total);
    $("#total-vivo").textContent = "Total: " + dinheiro(total);

    const linhaItem = (i, idx) => `
      <tr>
        <td class="c-cod">${esc(i.codigo)}</td>
        <td>${esc(i.descricao)}</td>
        <td class="c-un">${esc(i.un)}</td>
        <td class="c-qtd"><input data-qtd="${idx}" value="${i.qtd ?? ""}" inputmode="decimal"></td>
        <td class="c-custo"><input data-preco="${idx}" value="${i.preco ? fmtBR.format(i.preco) : ""}" inputmode="decimal" placeholder="—"></td>
        <td class="c-valor">${(i.qtd && i.preco) ? fmtBR.format(i.qtd * i.preco) : ""}</td>
        <td class="f-remover no-print"><button data-remover="${idx}" title="Remover">✕</button></td>
      </tr>`;
    const vazias = Math.max(0, LINHAS_MIN - L.itens.length);
    const linhaVazia = `<tr class="f-vazia-oculta"><td class="c-cod">&nbsp;</td><td></td><td class="c-un"></td><td class="c-qtd"></td><td class="c-custo"></td><td class="c-valor"></td><td class="f-remover no-print"></td></tr>`;

    const blocoAssin = (nome, i) => `
      <div class="f-ass-bloco">
        <div class="f-ass-rot">${i === 0 && L.assinaturas.includes(P.pedro) && nome === P.pedro ? "VISTO SOLICITANTE" : "VISTO AUTORIZAÇÃO"}</div>
        <div class="f-ass-espaco"></div>
        <div class="f-ass-nome">${esc(nome)}</div>
        <div class="f-ass-cargo">${esc(cargoDe(nome))}</div>
        <div class="f-ass-troca no-print">
          <select data-ass="${i}">
            ${PESSOAS.map(p => `<option ${p.nome === nome ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}
            <option value="__remover">(remover assinatura)</option>
          </select>
        </div>
      </div>`;

    $("#folha").innerHTML = `
      <div class="f-topo">
        <div class="f-logo">Lar<small>Cooperativa Agroindustrial</small></div>
        <div class="f-titulo">REQUISIÇÃO DE MATERIAL</div>
        <div class="f-num"><input data-l="numeroFO" value="${esc(L.numeroFO)}" style="text-align:center;font-weight:700"></div>
        <div class="f-controle">Número<br>FO 012 232-12<br>Emissão: 19/06/15<br>Revisão: 31/10/19 · Nº 3</div>
      </div>

      <div class="f-grade linha-5">
        <div class="f-celula"><div class="f-rotulo">LOCAL</div><div class="valor-celula"><input data-l="local" value="${esc(L.local)}"></div></div>
        <div class="f-celula"><div class="f-rotulo">ÁREA/SETOR</div><div class="valor-celula"><input data-l="areaSetor" value="${esc(L.areaSetor)}"></div></div>
        <div class="f-celula"><div class="f-rotulo">EMISSÃO</div><div class="valor-celula"><input type="date" data-l="emissao" value="${esc(L.emissao)}"></div></div>
        <div class="f-celula"><div class="f-rotulo">REVISÃO</div><div class="valor-celula"><input data-l="revisao" value="${esc(L.revisao)}"></div></div>
        <div class="f-celula"><div class="f-rotulo">Nº</div><div class="valor-celula"><input data-l="numero" value="${esc(L.numero)}"></div></div>
      </div>

      <div class="f-grade linha-desc">
        <div class="f-celula"><div class="f-rotulo">DESCRIÇÃO DO PRODUTO/ PROCESSO A SER COMPRADO</div>
          <textarea data-l="descricao" placeholder="Descreva a finalidade da compra…">${esc(L.descricao)}</textarea></div>
      </div>

      <div class="f-grade linha-5">
        <div class="f-celula"><div class="f-rotulo">DATA</div><div class="valor-celula"><input type="date" data-l="data" value="${esc(L.data)}"></div></div>
        <div class="f-celula"><div class="f-rotulo">SOLICITANTE</div><div class="valor-celula"><input data-l="solicitante" value="${esc(L.solicitante)}"></div></div>
        <div class="f-celula"><div class="f-rotulo">SETOR</div><div class="valor-celula"><input data-l="setor" value="${esc(L.setor)}"></div></div>
        <div class="f-celula"><div class="f-rotulo">PROJETO</div><div class="valor-celula"><input data-l="projetoNum" value="${esc(L.projetoNum)}"></div></div>
        <div class="f-celula"><div class="f-rotulo">NR O.S.</div><div class="valor-celula"><input data-l="nrOS" value="${esc(L.nrOS)}"></div></div>
      </div>

      <table class="f-itens">
        <thead><tr>
          <th class="c-cod">Código</th><th>Descrição</th><th class="c-un">Unidade</th>
          <th class="c-qtd">Qtd.</th><th class="c-custo">Custo Médio (Unitário)</th><th class="c-valor">Valor</th>
          <th class="f-remover no-print"></th>
        </tr></thead>
        <tbody>
          ${L.itens.map(linhaItem).join("")}
          ${linhaVazia.repeat(vazias)}
          <tr class="f-total">
            <td colspan="4" style="border:none"></td>
            <td class="rot">Valor total do pedido</td>
            <td class="c-valor">${fmtBR.format(total)}</td>
            <td class="f-remover no-print"></td>
          </tr>
        </tbody>
      </table>

      <div class="f-obs"><div class="rot">OBSERVAÇÃO:</div><input data-l="observacao" value="${esc(L.observacao)}"></div>

      <div class="f-assina">
        ${L.assinaturas.map(blocoAssin).join("")}
        ${Array(Math.max(0, 3 - L.assinaturas.length)).fill('<div class="f-ass-bloco"><div class="f-ass-rot">VISTO AUTORIZAÇÃO</div><div class="f-ass-espaco"></div><div class="f-ass-nome">&nbsp;</div><div class="f-ass-cargo">&nbsp;</div></div>').join("")}
        <div class="f-ass-bloco"><div class="f-ass-rot">VISTO ALMOXARIFADO</div><div class="f-ass-espaco"></div><div class="f-ass-nome">&nbsp;</div><div class="f-ass-cargo">&nbsp;</div></div>
      </div>
      <div class="no-print" style="margin-top:6px;font-size:11px;color:#777">
        Assinaturas sugeridas pela alçada de valor (até R$ 3.000 / até R$ 20.000 / acima).
        ${L.assinaturasManuais ? '<button class="btn mini sec" id="btn-auto-ass">Voltar ao automático</button>' : "Troque nos seletores acima para fixar manualmente."}
      </div>`;

    /* eventos da folha */
    $$("#folha [data-l]").forEach(el => {
      el.onchange = el.oninput = () => { L[el.dataset.l] = el.value; salvar(); };
    });
    $$("#folha [data-qtd]").forEach(el => {
      el.onchange = () => {
        L.itens[+el.dataset.qtd].qtd = lerPreco(el.value);
        salvar(); desenharFolha();
      };
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
        if (el.value === "__remover") L.assinaturas.splice(i, 1);
        else L.assinaturas[i] = el.value;
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

/* ============================================================
   Modais: banco e backup
   ============================================================ */
function ligarModais() {
  const abrir = (m) => { m.hidden = false; };
  const fechar = (m) => { m.hidden = true; };
  $$(".modal").forEach(m => {
    m.addEventListener("click", (e) => { if (e.target === m || e.target.dataset.fechar !== undefined && e.target.hasAttribute("data-fechar")) fechar(m); });
  });
  $("#btn-importar-banco").onclick = () => abrir($("#modal-banco"));
  $("#btn-backup").onclick = () => abrir($("#modal-backup"));

  $("#arquivo-banco").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      await importarArquivoBanco(f, $("#chk-apenas-ativos").checked);
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
      alert("Backup importado.");
    } catch (err) { alert("Arquivo inválido: " + err.message); }
    e.target.value = "";
  };
}

/* ---------------- inicialização ---------------- */
ligarModais();
render();
carregarBanco();
