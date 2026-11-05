/* ============================================================
   CHECK-IN DE TURNO — entrevista rápida (1 a 4 min)
   Uma pergunta por tela, quase tudo por toque, perguntas em cadeia
   (os projetos marcados em "onde foi o tempo" abrem a pergunta de
   avanço/bloqueio de cada um). As respostas:
     · viram dados estruturados em prj_checkins (para a IA);
     · já atualizam % das atividades e status das demandas;
     · criam as demandas novas que surgiram no turno;
     · fecham o ciclo "planejado × realizado" com o plano do turno anterior.
   Usa as funções e o estado de projetos.js (carregado antes).
   ============================================================ */
"use strict";

const TURNOS = [["manha", "Manhã"], ["tarde", "Tarde"], ["noite", "Noite"]];
const nomeTurno = (t) => (TURNOS.find(x => x[0] === t) || [, t])[1];
const turnoAgora = () => { const h = new Date().getHours(); return h < 13 ? "manha" : h < 19 ? "tarde" : "noite"; };
const CATEG_TEMPO = [
  ["demandas", "Demandas avulsas"], ["reuniao", "Reuniões"], ["urgencia", "Urgência / apagar incêndio"],
  ["campo", "Campo / acompanhar obra"], ["admin", "Administrativo / compras"], ["pericia", "Perícia judicial"], ["estudo", "Estudo / pós"],
];
const HORAS = [0.5, 1, 1.5, 2, 3, 4];
const fmtH = (h) => (h % 1 ? String(h).replace(".", ",") : h) + "h";
const ESCALA = [[1, "😫", "Muito baixa"], [2, "😕", "Baixa"], [3, "😐", "Normal"], [4, "🙂", "Boa"], [5, "💪", "Ótima"]];
const MOTIVOS_NAO = [["urgencia", "Urgência apareceu"], ["bloqueio", "Bloqueio"], ["subestimei", "Subestimei o tempo"], ["reuniao", "Reunião / chamado"], ["mudou", "Prioridade mudou"], ["outro", "Outro"]];
const BLOQUEIOS = [["", "Sem bloqueio"], ["material", "Material"], ["terceiro", "Terceiro / contratada"], ["aprovacao", "Aprovação / gerência"], ["informacao", "Informação / projeto"], ["equipe", "Equipe própria"], ["outro", "Outro"]];
const FAIXAS_INT = [["0", "Nenhuma"], ["1-2", "1 a 2"], ["3-5", "3 a 5"], ["6+", "6 ou mais"]];
const FONTES_INT = [["gerencia", "Gerência / supervisão"], ["producao", "Produção / operação"], ["manutencao", "Manutenção"], ["terceiros", "Terceiros"], ["telefone", "Telefone / WhatsApp"], ["email", "E-mail"]];

/* checkins vêm de carregar() em projetos.js */
const checkinsOrd = () => (S.checkins || []).slice().sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
const checkinDoTurno = (data = hojeISO(), turno = turnoAgora()) => (S.checkins || []).find(c => c.data === data && c.turno === turno);
const relatorioRecente = () => S.ia.filter(i => i.tipo === "resumo").sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))[0];

/* dias seguidos com pelo menos 1 check-in (ignora sábado e domingo) */
function sequenciaCheckins() {
  const dias = new Set((S.checkins || []).map(c => c.data));
  let d = hojeISO(), n = 0;
  if (!dias.has(d)) d = somaDias(d, -1);
  for (let i = 0; i < 60; i++) {
    const dow = new Date(d + "T12:00:00").getDay();
    if (dow === 0 || dow === 6) { d = somaDias(d, -1); continue; }
    if (!dias.has(d)) break;
    n++; d = somaDias(d, -1);
  }
  return n;
}

/* plano a conferir: o "próximo turno" do último check-in; sem ele, as prioridades do relatório da IA */
function planoParaConferir() {
  const ult = checkinsOrd()[0];
  if (ult && (ult.dados.plano_proximo || []).length) return { origem: `plano do check-in de ${dataCurta(ult.data)} (${nomeTurno(ult.turno)})`, itens: ult.dados.plano_proximo };
  const rel = relatorioRecente();
  const pr = rel && rel.dados && rel.dados.prioridades;
  if (pr && pr.length) return { origem: "prioridades do relatório da IA", itens: pr.map(p => ({ titulo: p.titulo, ref: p.ref || { tipo: "livre" } })) };
  return { origem: "", itens: [] };
}

/* ---------------- estado da entrevista ---------------- */
let CK = null;
function novoCK(existente) {
  const plano = planoParaConferir();
  return {
    id: existente ? existente.id : uid(),
    inicio: Date.now(),
    data: hojeISO(), turno: turnoAgora(),
    energia: 0, foco: 0,
    plano_origem: plano.origem,
    plano_anterior: plano.itens.map(p => ({ titulo: p.titulo, ref: p.ref || { tipo: "livre" }, resultado: "" })),
    motivo_nao: [],
    alocacao: [],                 // {tipo, id, nome, horas}
    avancos: {},                  // atividade_id → {projeto_id, atividade_id, nome, de, para}
    bloqueios: {},                // projeto_id → {tipo, texto}
    acoesDem: {},                 // demanda_id → concluida | avancou
    novas: [],                    // {id, titulo, prioridade}
    interrupcoes: { faixa: "", fontes: [] },
    plano_proximo: [],            // {titulo, ref}
    nota: "",
    passo: 0,
  };
}
function passosCK() {
  const p = ["abertura"];
  if (CK.plano_anterior.length) p.push("plano");
  p.push("tempo");
  CK.alocacao.filter(a => a.tipo === "projeto").forEach(a => p.push("proj:" + a.id));
  p.push("demandas", "interrupcoes", "proximo", "nota");
  return p;
}

/* ---------------- tela ---------------- */
function telaCheckin() {
  document.body.classList.add("pg-checkin");
  if (!CK) {
    const ja = checkinDoTurno();
    if (ja && !telaCheckin._refazer) {
      app.innerHTML = `<div class="ck-fim">
        <div class="ck-ok">✓</div><h1>Check-in da ${esc(nomeTurno(ja.turno).toLowerCase())} já registrado</h1>
        <p class="meta">Feito às ${new Date(ja.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Quer refazer? As respostas novas substituem as anteriores.</p>
        <div class="linha-acoes" style="justify-content:center"><a class="btn sec" href="#/">Voltar ao painel</a><button class="btn" id="ck-refazer">Refazer</button></div></div>`;
      $("#ck-refazer").onclick = () => { telaCheckin._refazer = true; CK = novoCK(ja); render(); };
      return;
    }
    CK = novoCK(ja);
  }
  desenharPasso();
}
function sairCheckin() { CK = null; telaCheckin._refazer = false; document.body.classList.remove("pg-checkin"); }
window.addEventListener("hashchange", () => { if (!/^#\/checkin/.test(location.hash)) { document.body.classList.remove("pg-checkin"); } });

function desenharPasso() {
  const passos = passosCK();
  CK.passo = clamp(CK.passo, 0, passos.length - 1);
  const id = passos[CK.passo];
  const pct = Math.round((CK.passo / passos.length) * 100);
  const ultimo = CK.passo === passos.length - 1;
  const seg = Math.round((Date.now() - CK.inicio) / 1000);
  app.innerHTML = `
    <div class="ck">
      <div class="ck-topo">
        <button class="ck-sair" id="ck-sair" aria-label="Sair">✕</button>
        <div class="ck-prog"><div style="width:${pct}%"></div></div>
        <span class="ck-n">${CK.passo + 1}/${passos.length}</span>
      </div>
      <div class="ck-corpo" id="ck-corpo"></div>
      <div class="ck-nav">
        <button class="btn sec" id="ck-voltar" ${CK.passo ? "" : "disabled"}>Voltar</button>
        <button class="btn ${ultimo ? "verde" : ""}" id="ck-prox">${ultimo ? "Registrar turno ✓" : "Próximo"}</button>
      </div>
    </div>`;
  const corpo = $("#ck-corpo");
  const P = id.startsWith("proj:") ? passoProjeto(id.slice(5)) : PASSOS[id]();
  corpo.innerHTML = P.html;
  P.ligar && P.ligar(corpo);
  $("#ck-sair").onclick = () => {
    if (!confirm("Sair sem registrar o turno? As respostas desta entrevista serão descartadas.")) return;
    sairCheckin(); location.hash = "#/";
  };
  $("#ck-voltar").onclick = () => { CK.passo--; desenharPasso(); };
  $("#ck-prox").onclick = () => {
    if (P.validar) { const msg = P.validar(); if (msg) { toast(msg); return; } }
    if (ultimo) { finalizarCheckin(); return; }
    CK.passo++; desenharPasso();
  };
  window.scrollTo({ top: 0 });
}
/* helpers de opção (chips) */
const chipsUnicos = (nome, lista, sel) => `<div class="ck-chips" data-grupo="${nome}">${lista.map(([v, t]) =>
  `<button type="button" class="ck-chip ${String(sel) === String(v) ? "on" : ""}" data-v="${esc(v)}">${esc(t)}</button>`).join("")}</div>`;
function ligarChipsUnicos(raiz, nome, ao) {
  $$(`[data-grupo="${nome}"] .ck-chip`, raiz).forEach(b => b.onclick = () => {
    $$(`[data-grupo="${nome}"] .ck-chip`, raiz).forEach(x => x.classList.toggle("on", x === b)); ao(b.dataset.v, b);
  });
}
const chipsMulti = (nome, lista, sel) => `<div class="ck-chips" data-multi="${nome}">${lista.map(([v, t]) =>
  `<button type="button" class="ck-chip ${sel.includes(v) ? "on" : ""}" data-v="${esc(v)}">${esc(t)}</button>`).join("")}</div>`;
function ligarChipsMulti(raiz, nome, lista) {
  $$(`[data-multi="${nome}"] .ck-chip`, raiz).forEach(b => b.onclick = () => {
    const v = b.dataset.v, i = lista.indexOf(v);
    if (i >= 0) lista.splice(i, 1); else lista.push(v);
    b.classList.toggle("on", i < 0);
  });
}

/* ---------------- perguntas ---------------- */
const PASSOS = {
  abertura() {
    const escala = (campo) => `<div class="ck-escala" data-escala="${campo}">${ESCALA.map(([v, e, t]) =>
      `<button type="button" class="${CK[campo] === v ? "on" : ""}" data-v="${v}" title="${t}"><span>${e}</span><small>${t}</small></button>`).join("")}</div>`;
    return {
      html: `<h2 class="ck-q">Como foi o turno?</h2>
        <p class="ck-dica">${diaSemana(CK.data)}, ${dataBR(CK.data)} · leva 1 a 4 minutos</p>
        <div class="ck-rot">Turno</div>${chipsUnicos("turno", TURNOS, CK.turno)}
        <div class="ck-rot">Sua energia</div>${escala("energia")}
        <div class="ck-rot">Seu foco (conseguiu se concentrar?)</div>${escala("foco")}`,
      ligar(r) {
        ligarChipsUnicos(r, "turno", v => { CK.turno = v; });
        $$("[data-escala]", r).forEach(g => $$("button", g).forEach(b => b.onclick = () => {
          CK[g.dataset.escala] = +b.dataset.v; $$("button", g).forEach(x => x.classList.toggle("on", x === b));
        }));
      },
      validar: () => (!CK.energia || !CK.foco) ? "Marque energia e foco (1 toque cada)." : "",
    };
  },

  plano() {
    const res = [["feito", "✓ Feito"], ["parcial", "◐ Em parte"], ["nao", "✗ Não"]];
    return {
      html: `<h2 class="ck-q">O que estava planejado aconteceu?</h2>
        <p class="ck-dica">${esc(CK.plano_origem)}</p>
        ${CK.plano_anterior.map((p, i) => `<div class="ck-cartao"><div class="ck-tit">${esc(p.titulo)}</div>${chipsUnicos("pl" + i, res, p.resultado)}</div>`).join("")}
        <div id="ck-motivos" ${CK.plano_anterior.some(p => p.resultado === "nao" || p.resultado === "parcial") ? "" : "hidden"}>
          <div class="ck-rot">O que atrapalhou?</div>${chipsMulti("motivos", MOTIVOS_NAO, CK.motivo_nao)}</div>`,
      ligar(r) {
        CK.plano_anterior.forEach((p, i) => ligarChipsUnicos(r, "pl" + i, v => {
          p.resultado = v;
          $("#ck-motivos", r).hidden = !CK.plano_anterior.some(x => x.resultado === "nao" || x.resultado === "parcial");
        }));
        ligarChipsMulti(r, "motivos", CK.motivo_nao);
      },
      validar: () => CK.plano_anterior.some(p => !p.resultado) ? "Responda cada item do plano." : "",
    };
  },

  tempo() {
    const usados = new Map();
    checkinsOrd().slice(0, 20).forEach(c => (c.dados.alocacao || []).forEach(a => usados.set(a.id, (usados.get(a.id) || 0) + 1)));
    const projs = projetosAtivos().slice().sort((a, b) => (usados.get(String(b.id)) || 0) - (usados.get(String(a.id)) || 0));
    const frentes = [...projs.map(p => ({ tipo: "projeto", id: String(p.id), nome: p.nome })), ...CATEG_TEMPO.map(([id, nome]) => ({ tipo: "categoria", id, nome }))];
    const linha = (f) => {
      const a = CK.alocacao.find(x => x.id === f.id);
      return `<div class="ck-frente ${a ? "on" : ""}" data-fr="${esc(f.id)}">
        <button type="button" class="ck-fr-nome">${f.tipo === "projeto" ? "▤ " : ""}${esc(f.nome)}</button>
        ${a ? `<div class="ck-horas">${HORAS.map(h => `<button type="button" class="${a.horas === h ? "on" : ""}" data-h="${h}">${fmtH(h)}</button>`).join("")}</div>` : ""}
      </div>`;
    };
    const total = CK.alocacao.reduce((s, a) => s + a.horas, 0);
    return {
      html: `<h2 class="ck-q">Onde foi o seu tempo?</h2>
        <p class="ck-dica">Toque no que ocupou o turno e ajuste as horas aproximadas. Total: <b id="ck-tot">${fmtH(total)}</b></p>
        <div class="ck-rot">Projetos</div>${frentes.filter(f => f.tipo === "projeto").map(linha).join("") || `<div class="meta">Nenhum projeto ativo.</div>`}
        <div class="ck-rot">Outras frentes</div>${frentes.filter(f => f.tipo === "categoria").map(linha).join("")}`,
      ligar(r) {
        $$(".ck-fr-nome", r).forEach(b => b.onclick = () => {
          const el = b.closest("[data-fr]"), id = el.dataset.fr;
          const i = CK.alocacao.findIndex(x => x.id === id);
          if (i >= 0) CK.alocacao.splice(i, 1);
          else { const f = frentes.find(x => x.id === id); CK.alocacao.push({ tipo: f.tipo, id: f.id, nome: f.nome, horas: 1 }); }
          const y = window.scrollY; desenharPasso(); window.scrollTo({ top: y });
        });
        $$(".ck-horas button", r).forEach(b => b.onclick = () => {
          const a = CK.alocacao.find(x => x.id === b.closest("[data-fr]").dataset.fr); a.horas = +b.dataset.h;
          $$("button", b.parentElement).forEach(x => x.classList.toggle("on", x === b));
          $("#ck-tot").textContent = fmtH(CK.alocacao.reduce((s, x) => s + x.horas, 0));
        });
      },
      validar: () => CK.alocacao.length ? "" : "Marque pelo menos uma frente de trabalho.",
    };
  },

  demandas() {
    const abertas = S.demandas.filter(ehAberta).sort(ordenarDemandas).slice(0, 12);
    const acoes = [["", "—"], ["avancou", "◐ Avancei"], ["concluida", "✓ Concluí"]];
    return {
      html: `<h2 class="ck-q">E as demandas?</h2>
        <p class="ck-dica">Marque só o que mudou. O que ficar em "—" continua como está.</p>
        ${abertas.map(d => `<div class="ck-cartao"><div class="ck-tit">${esc(d.titulo)}
            <span class="tag ${esc(d.prioridade)}">${esc((PRIORIDADES.find(x => x[0] === d.prioridade) || [, ""])[1])}</span>
            ${vencida(d) ? `<span class="tag atraso">vencida</span>` : ""}</div>
          ${chipsUnicos("dm-" + d.id, acoes, CK.acoesDem[d.id] || "")}</div>`).join("") || `<div class="vazio">Nenhuma demanda aberta.</div>`}
        <div class="ck-rot">Surgiu algo novo neste turno?</div>
        <form class="ck-nova" id="ck-nova" autocomplete="off">
          <input type="text" placeholder="Ex.: Orçar troca do disjuntor do CCM 3" enterkeyhint="done">
          ${chipsUnicos("prio-nova", PRIORIDADES, CK._prio || "media")}
          <button class="btn sec" type="submit">+ Adicionar</button>
        </form>
        <div id="ck-novas">${CK.novas.map((n, i) => `<div class="ck-novai"><span class="tag ${n.prioridade}">${esc((PRIORIDADES.find(x => x[0] === n.prioridade) || [, ""])[1])}</span>
          <span>${esc(n.titulo)}</span><button type="button" data-rmn="${i}" aria-label="Remover">✕</button></div>`).join("")}</div>`,
      ligar(r) {
        abertas.forEach(d => ligarChipsUnicos(r, "dm-" + d.id, v => { if (v) CK.acoesDem[d.id] = v; else delete CK.acoesDem[d.id]; }));
        ligarChipsUnicos(r, "prio-nova", v => { CK._prio = v; });
        $("#ck-nova", r).onsubmit = (e) => {
          e.preventDefault();
          const t = e.target.querySelector("input").value.trim(); if (!t) return;
          CK.novas.push({ id: uid(), titulo: t, prioridade: CK._prio || "media" });
          const y = window.scrollY; desenharPasso(); window.scrollTo({ top: y });
          setTimeout(() => { const i = $("#ck-nova input"); i && i.focus(); }, 30);
        };
        $$("[data-rmn]", r).forEach(b => b.onclick = () => { CK.novas.splice(+b.dataset.rmn, 1); const y = window.scrollY; desenharPasso(); window.scrollTo({ top: y }); });
      },
      validar() {   // texto digitado e não adicionado não se perde
        const i = $("#ck-nova input"); const t = i && i.value.trim();
        if (t) CK.novas.push({ id: uid(), titulo: t, prioridade: CK._prio || "media" });
        return "";
      },
    };
  },

  interrupcoes() {
    return {
      html: `<h2 class="ck-q">Quantas interrupções tiraram você do que estava fazendo?</h2>
        <p class="ck-dica">Chamados, ligações, "dá um pulo aqui"… conta aproximada.</p>
        ${chipsUnicos("faixa", FAIXAS_INT, CK.interrupcoes.faixa)}
        <div id="ck-fontes" ${CK.interrupcoes.faixa && CK.interrupcoes.faixa !== "0" ? "" : "hidden"}>
          <div class="ck-rot">De onde vieram?</div>${chipsMulti("fontes", FONTES_INT, CK.interrupcoes.fontes)}</div>`,
      ligar(r) {
        ligarChipsUnicos(r, "faixa", v => { CK.interrupcoes.faixa = v; $("#ck-fontes", r).hidden = v === "0"; });
        ligarChipsMulti(r, "fontes", CK.interrupcoes.fontes);
      },
      validar: () => CK.interrupcoes.faixa ? "" : "Escolha uma faixa (pode ser \"Nenhuma\").",
    };
  },

  proximo() {
    const sug = sugestoesPlano();
    const sel = CK.plano_proximo;
    const chave = (p) => (p.ref && p.ref.id ? p.ref.tipo + ":" + p.ref.id : "t:" + norm(p.titulo));
    const marcados = new Set(sel.map(chave));
    return {
      html: `<h2 class="ck-q">Quais as 3 prioridades do próximo turno?</h2>
        <p class="ck-dica">Toque para escolher (máx. 3) ou escreva. No próximo check-in você confere se aconteceu.</p>
        <div id="ck-sel" class="ck-sel">${sel.map((p, i) => `<div class="ck-seli"><b>${i + 1}</b><span>${esc(p.titulo)}</span><button type="button" data-rms="${i}" aria-label="Remover">✕</button></div>`).join("")
          || `<div class="meta">Nenhuma escolhida ainda.</div>`}</div>
        <form class="ck-nova" id="ck-livre" autocomplete="off"><input type="text" placeholder="Escrever uma prioridade…" enterkeyhint="done"><button class="btn sec" type="submit">+</button></form>
        <div class="ck-rot">Sugestões</div>
        <div class="ck-sugs">${sug.map((s, i) => `<button type="button" class="ck-sug ${marcados.has(chave(s)) ? "on" : ""}" data-sug="${i}">
          <span class="ck-sug-t">${esc(s.titulo)}</span><small>${esc(s.motivo)}</small></button>`).join("") || `<div class="meta">Sem sugestões.</div>`}</div>`,
      ligar(r) {
        const redesenhar = () => { const y = window.scrollY; desenharPasso(); window.scrollTo({ top: y }); };
        $$("[data-sug]", r).forEach(b => b.onclick = () => {
          const s = sug[+b.dataset.sug], k = chave(s), i = sel.findIndex(p => chave(p) === k);
          if (i >= 0) sel.splice(i, 1);
          else { if (sel.length >= 3) { toast("Máximo de 3 — tire uma antes."); return; } sel.push({ titulo: s.titulo, ref: s.ref }); }
          redesenhar();
        });
        $$("[data-rms]", r).forEach(b => b.onclick = () => { sel.splice(+b.dataset.rms, 1); redesenhar(); });
        $("#ck-livre", r).onsubmit = (e) => {
          e.preventDefault();
          const t = e.target.querySelector("input").value.trim(); if (!t) return;
          if (sel.length >= 3) { toast("Máximo de 3 — tire uma antes."); return; }
          sel.push({ titulo: t, ref: { tipo: "livre" } }); redesenhar();
        };
      },
      validar() {
        const i = $("#ck-livre input"); const t = i && i.value.trim();
        if (t && sel.length < 3) sel.push({ titulo: t, ref: { tipo: "livre" } });
        return sel.length ? "" : "Escolha pelo menos 1 prioridade.";
      },
    };
  },

  nota() {
    return {
      html: `<h2 class="ck-q">Algo que a IA deveria saber?</h2>
        <p class="ck-dica">Opcional. Use o microfone do teclado para ditar: decisões, problemas, conversas importantes, como você se sentiu.</p>
        <textarea id="ck-nota" rows="6" placeholder="Ex.: Gerência pediu prioridade na balança de fluxo; contratada da centrífuga atrasou de novo.">${esc(CK.nota)}</textarea>
        ${resumoAntesDeRegistrar()}`,
      ligar(r) { $("#ck-nota", r).oninput = (e) => { CK.nota = e.target.value; }; },
    };
  },
};

/* pergunta encadeada: um passo por projeto marcado em "onde foi o tempo" */
function passoProjeto(pid) {
  const p = projetoPorId(pid) || { nome: "Projeto" };
  const f = fichaDe(pid);
  const ativs = f.atividades.filter(a => String(a.nome || "").trim());
  const mostrarTodas = CK["_todas_" + pid];
  const lista = mostrarTodas ? ativs : ativs.filter(a => (+a.pct || 0) < 100 || CK.avancos[a.id]);
  const ocultas = ativs.length - lista.length;
  const pctAtual = (a) => CK.avancos[a.id] ? CK.avancos[a.id].para : (+a.pct || 0);
  const bl = CK.bloqueios[pid] || { tipo: "", texto: "" };
  return {
    html: `<h2 class="ck-q">▤ ${esc(p.nome)}</h2>
      <p class="ck-dica">O que avançou neste turno? Toque no novo percentual das atividades que andaram.</p>
      ${lista.map(a => `<div class="ck-cartao ${CK.avancos[a.id] ? "mudou" : ""}" data-at="${esc(a.id)}">
          <div class="ck-tit">${esc(a.nome)} <small>${CK.avancos[a.id] ? `${CK.avancos[a.id].de}% → <b>${pctAtual(a)}%</b>` : `${pctAtual(a)}%`}</small></div>
          <div class="pct-rapido">${[0, 10, 25, 50, 75, 90, 100].map(v => `<button type="button" data-v="${v}" class="${pctAtual(a) === v ? "on" : ""}">${v}</button>`).join("")}</div>
        </div>`).join("") || `<div class="vazio">Este projeto ainda não tem atividades. Cadastre na aba Atividades do projeto.</div>`}
      ${ocultas ? `<button type="button" class="btn sec mini" id="ck-todas">mostrar ${ocultas} concluída(s)</button>` : ""}
      <div class="ck-rot">Algum bloqueio?</div>${chipsUnicos("bl", BLOQUEIOS, bl.tipo)}
      <input type="text" id="ck-bl-txt" placeholder="Detalhe do bloqueio (opcional)" value="${esc(bl.texto)}" ${bl.tipo ? "" : "hidden"} style="margin-top:8px">`,
    ligar(r) {
      $$("[data-at]", r).forEach(el => $$("button", el).forEach(b => b.onclick = () => {
        const a = ativs.find(x => x.id === el.dataset.at), v = +b.dataset.v;
        if (v === (+a.pct || 0)) delete CK.avancos[a.id];
        else CK.avancos[a.id] = { projeto_id: pid, atividade_id: a.id, nome: a.nome, de: +a.pct || 0, para: v };
        const y = window.scrollY; desenharPasso(); window.scrollTo({ top: y });
      }));
      const t = $("#ck-todas", r); if (t) t.onclick = () => { CK["_todas_" + pid] = true; const y = window.scrollY; desenharPasso(); window.scrollTo({ top: y }); };
      ligarChipsUnicos(r, "bl", v => {
        if (v) CK.bloqueios[pid] = { ...(CK.bloqueios[pid] || {}), tipo: v, texto: (CK.bloqueios[pid] || {}).texto || "" }; else delete CK.bloqueios[pid];
        $("#ck-bl-txt", r).hidden = !v;
      });
      $("#ck-bl-txt", r).oninput = (e) => { if (CK.bloqueios[pid]) CK.bloqueios[pid].texto = e.target.value; };
    },
  };
}

/* sugestões para o plano do próximo turno, por ordem de importância */
function sugestoesPlano() {
  const out = [], vistos = new Set();
  const encerrada = (ref) => ref && ref.tipo === "demanda" && (CK.acoesDem[ref.id] === "concluida" || ((S.demandas.find(d => d.id === ref.id) || {}).status === "concluida"));
  const add = (titulo, ref, motivo) => {
    const k = (ref.id ? ref.tipo + ":" + ref.id : "t:" + norm(titulo));
    if (vistos.has(k) || encerrada(ref)) return;
    vistos.add(k); out.push({ titulo, ref, motivo });
  };
  CK.plano_anterior.filter(p => p.resultado === "nao" || p.resultado === "parcial").forEach(p => add(p.titulo, p.ref, "ficou do plano anterior"));
  const rel = relatorioRecente();
  ((rel && rel.dados && rel.dados.prioridades) || []).forEach(p => add(p.titulo, p.ref || { tipo: "livre" }, "sugerido no relatório da IA"));
  const abertas = S.demandas.filter(ehAberta).filter(d => CK.acoesDem[d.id] !== "concluida").sort(ordenarDemandas);
  abertas.filter(d => vencida(d)).forEach(d => add(d.titulo, { tipo: "demanda", id: d.id }, "demanda vencida"));
  abertas.filter(d => d.prioridade === "alta").forEach(d => add(d.titulo, { tipo: "demanda", id: d.id }, "demanda de prioridade alta"));
  CK.novas.forEach(n => add(n.titulo, { tipo: "demanda", id: n.id }, "surgiu neste turno"));
  projetosAtivos().forEach(p => {
    const ind = indicadores(p.id);
    const prox = fichaDe(p.id).atividades.find(a => String(a.nome || "").trim() && (CK.avancos[a.id] ? CK.avancos[a.id].para : +a.pct || 0) < 100);
    if (prox && (ind.alertas.length || CK.alocacao.some(x => x.id === String(p.id))))
      add(`${p.nome}: ${prox.nome}`, { tipo: "atividade", id: prox.id, projeto_id: String(p.id) }, ind.alertas.length ? "projeto com alerta: " + ind.alertas.join(", ") : "próxima etapa do projeto");
  });
  abertas.forEach(d => add(d.titulo, { tipo: "demanda", id: d.id }, "demanda aberta"));
  return out.slice(0, 12);
}

function resumoAntesDeRegistrar() {
  const horas = CK.alocacao.reduce((s, a) => s + a.horas, 0);
  const nAv = Object.keys(CK.avancos).length, nDem = Object.keys(CK.acoesDem).length;
  return `<div class="ck-resumo"><div class="ck-rot">Vai ser registrado</div><ul>
    <li>${fmtH(horas)} em ${CK.alocacao.length} frente(s)</li>
    ${nAv ? `<li>${nAv} atividade(s) com % atualizado</li>` : ""}
    ${nDem ? `<li>${nDem} demanda(s) atualizada(s)</li>` : ""}
    ${CK.novas.length ? `<li>${CK.novas.length} demanda(s) nova(s)</li>` : ""}
    ${Object.keys(CK.bloqueios).length ? `<li>${Object.keys(CK.bloqueios).length} bloqueio(s)</li>` : ""}
    <li>Plano do próximo turno: ${CK.plano_proximo.map(p => esc(p.titulo)).join(" · ")}</li></ul></div>`;
}

/* ---------------- registrar ---------------- */
function finalizarCheckin() {
  const agora = new Date().toISOString();
  // 1) atividades
  const fichasMudadas = new Set();
  Object.values(CK.avancos).forEach(av => {
    const a = fichaDe(av.projeto_id).atividades.find(x => x.id === av.atividade_id);
    if (a) { a.pct = av.para; fichasMudadas.add(av.projeto_id); }
  });
  fichasMudadas.forEach(pid => salvarFicha(pid));
  // 2) demandas existentes
  Object.entries(CK.acoesDem).forEach(([id, acao]) => {
    const d = S.demandas.find(x => x.id === id); if (!d) return;
    if (acao === "concluida") { d.status = "concluida"; d.concluido_em = agora; }
    else if (acao === "avancou" && d.status === "aberta") d.status = "andamento";
    gravar("prj_demandas", d);
  });
  // 3) demandas novas
  CK.novas.forEach(n => {
    const d = { id: n.id, unidade: UN, titulo: n.titulo, detalhe: "Lançada no check-in de turno.", prioridade: n.prioridade, status: "aberta",
      projeto_id: null, prazo: null, solicitante: "", autor: emailSessao, criado_em: agora, concluido_em: null };
    S.demandas.unshift(d); gravar("prj_demandas", d);
  });
  // 4) o check-in
  const dados = {
    versao: 1,
    energia: CK.energia, foco: CK.foco,
    plano_origem: CK.plano_origem,
    plano_anterior: CK.plano_anterior,
    motivo_nao: CK.motivo_nao,
    alocacao: CK.alocacao,
    avancos: Object.values(CK.avancos),
    bloqueios: Object.entries(CK.bloqueios).map(([projeto_id, b]) => ({ projeto_id, projeto: nomeProjeto(projeto_id), tipo: b.tipo, texto: b.texto || "" })),
    demandas_atualizadas: Object.entries(CK.acoesDem).map(([id, acao]) => ({ id, titulo: (S.demandas.find(x => x.id === id) || {}).titulo || "", acao })),
    novas_demandas: CK.novas,
    interrupcoes: CK.interrupcoes,
    plano_proximo: CK.plano_proximo,
    nota: CK.nota.trim(),
  };
  const reg = { id: CK.id, unidade: UN, data: CK.data, turno: CK.turno, dados, duracao_seg: Math.round((Date.now() - CK.inicio) / 1000), autor: emailSessao, criado_em: agora };
  S.checkins = (S.checkins || []).filter(c => c.id !== reg.id);
  S.checkins.unshift(reg);
  gravar("prj_checkins", reg);
  sincronizar(true);
  const feito = CK.plano_anterior.filter(p => p.resultado === "feito").length, plan = CK.plano_anterior.length;
  const horas = CK.alocacao.reduce((s, a) => s + a.horas, 0);
  const dur = reg.duracao_seg;
  sairCheckin();
  document.body.classList.add("pg-checkin");
  app.innerHTML = `<div class="ck-fim">
    <div class="ck-ok">✓</div><h1>Turno registrado</h1>
    <p class="meta">${nomeTurno(reg.turno)} de ${dataBR(reg.data)} · preenchido em ${Math.floor(dur / 60)} min ${dur % 60} s</p>
    <div class="kpis" style="margin:16px 0">
      <div class="kpi"><div class="rot">Horas registradas</div><div class="val">${fmtH(horas)}</div></div>
      <div class="kpi"><div class="rot">Plano cumprido</div><div class="val">${plan ? Math.round(feito / plan * 100) + "%" : "—"}</div><div class="det">${plan ? `${feito} de ${plan}` : "sem plano anterior"}</div></div>
      <div class="kpi"><div class="rot">Dias seguidos</div><div class="val">${sequenciaCheckins()}</div><div class="det">com check-in</div></div>
      <div class="kpi" style="grid-column:1 / -1"><div class="rot">Prioridades do próximo turno</div><div class="val" style="font-size:15px; font-weight:600; line-height:1.45">${CK_ultimoPlano(reg)}</div></div>
    </div>
    <p class="meta">O relatório diário do Claude usa estes dados para analisar o seu dia e sugerir as prioridades.</p>
    <a class="btn largo" href="#/">Ir para o painel</a></div>`;
}
const CK_ultimoPlano = (reg) => reg.dados.plano_proximo.map((p, i) => `${i + 1}. ${esc(p.titulo)}`).join("<br>");

/* ---------------- cartão do painel ---------------- */
function cartaoCheckinPainel() {
  const t = turnoAgora(), feito = checkinDoTurno(hojeISO(), t);
  const seq = sequenciaCheckins();
  const ult = checkinsOrd()[0];
  if (!feito) return `<a class="ck-cta" href="#/checkin">
      <span class="ck-cta-ic">🎙</span><div><b>Check-in da ${nomeTurno(t).toLowerCase()}</b><small>Entrevista rápida · 1 a 4 min${seq ? ` · ${seq} dia(s) seguido(s)` : ""}</small></div><span class="ck-cta-seta">›</span></a>`;
  return `<div class="ck-feito"><span>✓</span><div><b>Check-in da ${nomeTurno(t).toLowerCase()} feito</b>
      <small>${seq} dia(s) seguido(s) · próximo turno: ${(ult && ult.dados.plano_proximo || []).map(p => esc(p.titulo)).join(" · ") || "—"}</small></div>
      <a class="btn sec mini" href="#/checkin">Refazer</a></div>`;
}
