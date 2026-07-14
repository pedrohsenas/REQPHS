'use strict';
// ─── projeto_ficha.js — ficha do projeto (planejamento + execução) ────

let _fichaProj      = null;
let _fichaAba       = 'plan';
let _fichaEtapaId   = null;
let _fichaEtapaTipo = 'plan';
let _empCacheModal  = null;  // cache de empresas para o modal de etapa
// Rascunhos em memória (perdem-se só ao recarregar a página):
let _modalDrafts = {};   // { etapaId: { coment, status, resp, prazo, ini, fim, iniPrev, dur, empresa } }
let _gedDrafts   = {};   // { etapaId: { nome, prazo, ini, fim, iniPrev, dur, peso } }
let _editProjDraft = null; // { titulo, setor, prazo }

// ══════════════════════════════════════════════════════════════════════
// CARREGAMENTO
// ══════════════════════════════════════════════════════════════════════
async function abrirFichaProjeto(id, aba) {
  window._ajudaChave = 'projetos';
  if (aba) _fichaAba = aba;
  setConteudo('<div class="loading"><div class="spinner"></div> Carregando projeto...</div>');
  try {
    await _prjCarregarPerfis();
    _fichaProj = await prjBuscar(id);
    const sess = await dbSessao();
    _fichaProj._meuAuthId = sess?.user?.id;
    // Carrega empresas para o select de Empresa responsável
    if (PERFIL?.papel === 'gestor' && !_empCacheModal) {
      try { _empCacheModal = await empListar(); } catch(_) { _empCacheModal = []; }
    } else if (!_empCacheModal) {
      // terceiros/técnicos: precisam só do nome da empresa atribuída para exibir read-only
      try { _empCacheModal = await empListar(); } catch(_) { _empCacheModal = []; }
    }
    // Limpa rascunho ao abrir novo projeto
    _rascunhoLimpar();
    _atualizarBotaoEnviarSolicitacao();
    _renderFicha();
  } catch (e) {
    setConteudo(`<div class="result-card erro"><p>Erro: ${e.message}</p></div>`);
  }
}

function _podeEditar() {
  if (PERFIL?.papel === 'gestor') return true;
  if (PERFIL?.papel === 'terceiro') return false; // edita pontual via etapa
  const equipe = (_fichaProj?.projeto_equipe || []).map(e => e.perfil_id);
  return equipe.includes(_fichaProj?._meuAuthId);
}

// Terceiro só pode editar etapas atribuídas à sua empresa
function _podeEditarEtapa(etapa) {
  if (!etapa) return false;
  if (PERFIL?.papel === 'gestor') return true;
  if (PERFIL?.papel === 'terceiro') return etapa.empresa_id === PERFIL?.empresa_id;
  const equipe = (_fichaProj?.projeto_equipe || []).map(e => e.perfil_id);
  return equipe.includes(_fichaProj?._meuAuthId);
}

// Para terceiros: alterações em campos da etapa não salvam direto, vão para rascunho
// Estrutura: { etapa_id: { campo: { antes, depois } } }
var _solRascunho = {};

function _rascunhoAdicionar(etapa_id, campo, antes, depois) {
  if (!_solRascunho[etapa_id]) _solRascunho[etapa_id] = {};
  _solRascunho[etapa_id][campo] = { antes, depois };
}

function _rascunhoLimpar() { _solRascunho = {}; }

function _rascunhoContarItens() {
  let n = 0;
  for (const eId in _solRascunho) n += Object.keys(_solRascunho[eId]).length;
  return n;
}

// ══════════════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════════════
function _renderFicha() {
  const p      = _fichaProj;
  const gestor = PERFIL?.papel === 'gestor';
  const podeEditar = _podeEditar();
  const perfis = _prjPerfis || [];
  const equipeIds = (p.projeto_equipe || []).map(e => e.perfil_id);

  const etaplasPlan = p.projeto_etapas || [];
  const etapasExec  = p.projeto_exec_etapas || [];
  const pctPlan = prjCalcProgresso(etaplasPlan);
  const pctExec = prjExecCalcProgresso(etapasExec);

  const atrasado = p.status !== 'concluido' && p.status !== 'cancelado' &&
    p.prazo_final && new Date(p.prazo_final + 'T23:59:59') < new Date();

  setConteudo(`
    <div class="ficha-head">
      <button class="btn-mini" onclick="telaProjetos()">‹ Projetos</button>
      <div class="ficha-titulo">
        <span style="font-weight:700;font-size:17px">${escHtml(p.titulo)}</span>
        ${_prjBadgeStatus(p.status)}
        ${atrasado ? '<span class="badge-atrasada">&#9888; Atrasado</span>' : ''}
        ${_prjBadgePrio(p.prioridade)}
      </div>
      ${gestor ? `<div class="ficha-acoes">
        <button class="btn-mini" onclick="_abrirModalEditarProjeto()">Editar</button>
        <button class="btn-mini btn-mini-danger" onclick="prjAcaoExcluir('${p.id}','${escHtml(p.titulo)}')">Excluir</button>
      </div>` : ''}
    </div>

    <!-- Abas Planejamento / Execução -->
    <div class="cat-tabs" style="margin-bottom:18px">
      <button class="cat-tab ${_fichaAba==='plan'?'ativo':''}" onclick="_trocarAba('plan')">
        &#128196; Planejamento <span style="font-family:var(--mono);font-size:11px">${pctPlan.toFixed(0)}%</span>
      </button>
      <button class="cat-tab ${_fichaAba==='exec'?'ativo':''}" onclick="_trocarAba('exec')">
        &#9881; Execução <span style="font-family:var(--mono);font-size:11px">${pctExec.toFixed(0)}%</span>
      </button>
    </div>

    <div id="ficha-aba-conteudo"></div>
    <div id="prj-modal-root"></div>
    <div id="prj-etapa-modal-root"></div>
  `);

  _renderAba();
}

function _trocarAba(aba) {
  _fichaAba = aba;
  document.querySelectorAll('.cat-tab').forEach(el => {
    el.classList.toggle('ativo', el.textContent.includes(aba === 'plan' ? 'Planejamento' : 'Execução'));
  });
  _renderAba();
}

function _renderAba() {
  const el = document.getElementById('ficha-aba-conteudo');
  if (!el) return;
  if (_fichaAba === 'plan') _renderAbaPlan(el);
  else _renderAbaExec(el);
}

// ══════════════════════════════════════════════════════════════════════
// ABA PLANEJAMENTO
// ══════════════════════════════════════════════════════════════════════
function _renderAbaPlan(el) {
  const p = _fichaProj;
  const gestor = PERFIL?.papel === 'gestor';
  const podeEditar = _podeEditar();
  const perfis = _prjPerfis || [];
  const equipeIds = (p.projeto_equipe || []).map(e => e.perfil_id);
  const etapas = p.projeto_etapas || [];
  const pct = prjCalcProgresso(etapas);
  const fotosGerais = (p.projeto_fotos || []).filter(f => !f.etapa_id && !f.exec_etapa_id);

  el.innerHTML = `
    <div class="ficha-grid">
      <div class="ficha-col">
        <div class="card-sec">
          <h3 class="card-sec-titulo">Informações</h3>
          <div class="row2">
            <div class="field"><label>Setor</label>
              <input type="text" value="${escHtml(p.setor||'—')}" disabled /></div>
            <div class="field"><label>Prazo final</label>
              <input type="text" value="${p.prazo_final?new Date(p.prazo_final+'T12:00:00').toLocaleDateString('pt-BR'):'—'}" disabled /></div>
          </div>
          <div class="row2">
            <div class="field"><label>Status</label>
              ${podeEditar ? `<select id="fp-status">
                <option value="pendente"${p.status==='pendente'?' selected':''}>Pendente</option>
                <option value="em_andamento"${p.status==='em_andamento'?' selected':''}>Em andamento</option>
                <option value="concluido"${p.status==='concluido'?' selected':''}>Concluído</option>
                <option value="cancelado"${p.status==='cancelado'?' selected':''}>Cancelado</option>
              </select>` : `<input type="text" value="${p.status}" disabled />`}
            </div>
            <div class="field"><label>Prioridade</label>
              ${gestor ? `<select id="fp-prio">
                <option value="alta"${p.prioridade==='alta'?' selected':''}>Alta</option>
                <option value="media"${p.prioridade==='media'?' selected':''}>Média</option>
                <option value="baixa"${p.prioridade==='baixa'?' selected':''}>Baixa</option>
              </select>` : `<input type="text" value="${p.prioridade||'—'}" disabled />`}
            </div>
          </div>
          ${podeEditar ? `<button class="btn btn-sec" style="margin-top:8px" onclick="_prjSalvarInfo()">Salvar informações</button>` : ''}
        </div>

        <div class="card-sec">
          <h3 class="card-sec-titulo">Progresso de planejamento</h3>
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
            <div class="prj-barra-wrap" style="flex:1;height:14px">
              <div class="prj-barra-fill" style="width:${pct.toFixed(0)}%;height:14px;border-radius:7px"></div>
            </div>
            <span style="font-family:var(--mono);font-size:18px;font-weight:700;color:var(--accent)">${pct.toFixed(1)}%</span>
          </div>
          <p class="page-sub">${etapas.length} etapa(s) · Prazo: ${p.prazo_final?new Date(p.prazo_final+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</p>
        </div>

        <div class="card-sec">
          <h3 class="card-sec-titulo">Descrição</h3>
          ${podeEditar ? `
            <textarea id="fp-descricao" rows="4" placeholder="Escopo, objetivos e detalhes relevantes..."
              style="margin-bottom:8px">${escHtml(p.descricao||'')}</textarea>
            <button class="btn btn-sec" onclick="_prjSalvarDescricao()">Salvar descrição</button>` :
            `<p style="font-size:14px;white-space:pre-wrap">${escHtml(p.descricao||'Sem descrição.')}</p>`}
        </div>

        <div class="card-sec">
          <h3 class="card-sec-titulo">Fotos do projeto</h3>
          <div class="etapa-fotos" id="fp-fotos-projeto">
            ${fotosGerais.map(f => `
              <div class="etapa-foto-wrap" id="pfoto-${f.id}">
                <img src="${prjUrlFoto(f.caminho_storage)}" class="etapa-foto"
                  onclick="window.open('${prjUrlFoto(f.caminho_storage)}','_blank')" />
                ${podeEditar ? `<button class="foto-del-btn" onclick="_prjFotoProjetoExcluir('${f.id}','${f.caminho_storage}')">&#x2715;</button>` : ''}
              </div>`).join('')}
          </div>
          ${podeEditar ? `<label class="btn btn-sec" style="margin-top:10px;display:inline-block;cursor:pointer">
            + Adicionar fotos
            <input type="file" accept="image/*" multiple style="display:none" onchange="_prjFotosProjetoAdicionar(this)" />
          </label>` : ''}
        </div>

        <div class="card-sec">
          <h3 class="card-sec-titulo">Equipe técnica</h3>
          ${gestor ? `<div class="prj-equipe-grid" id="fp-equipe">
            ${(_prjPerfis||[]).map(pf => `
              <label class="prj-check-label">
                <input type="checkbox" value="${pf.id}" ${equipeIds.includes(pf.id)?'checked':''}
                  onchange="_prjSalvarEquipe()" />
                ${escHtml(pf.nome)} <span style="color:var(--tx2);font-size:11px">(${pf.papel})</span>
              </label>`).join('')}
          </div>` : (equipeIds.length ?
            `<ul style="padding-left:18px;font-size:14px">${(p.projeto_equipe||[]).map(e=>`<li>${escHtml(e.perfis?.nome||'')}</li>`).join('')}</ul>` :
            '<p class="page-sub">Nenhum técnico.</p>')}
        </div>
      </div>

      <div class="ficha-col">
        <div class="card-sec">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h3 class="card-sec-titulo" style="margin:0">Etapas de Planejamento</h3>
            ${gestor ? `<button class="btn-mini" onclick="_abrirModalGerenciarEtapas('plan')">Gerenciar</button>` : ''}
          </div>
          ${etapas.length ? etapas.map(et => _renderCardEtapa(et, 'plan')).join('') :
            '<p class="page-sub">Nenhuma etapa cadastrada.</p>'}
        </div>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════
// ABA EXECUÇÃO
// ══════════════════════════════════════════════════════════════════════
function _renderAbaExec(el) {
  const p = _fichaProj;
  const gestor = PERFIL?.papel === 'gestor';
  const podeEditar = _podeEditar();
  const etapas = p.projeto_exec_etapas || [];
  const pct = prjExecCalcProgresso(etapas);
  const proj = _prjProjecaoTermino(etapas);

  el.innerHTML = `
    <div class="ficha-grid">
      <div class="ficha-col">
        <div class="card-sec">
          <h3 class="card-sec-titulo">Progresso de execução</h3>
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
            <div class="prj-barra-wrap" style="flex:1;height:14px">
              <div class="prj-barra-fill" style="width:${pct.toFixed(0)}%;height:14px;border-radius:7px;background:#16a34a"></div>
            </div>
            <span style="font-family:var(--mono);font-size:18px;font-weight:700;color:#16a34a">${pct.toFixed(1)}%</span>
          </div>
          <p class="page-sub">${etapas.length} etapa(s) · ${etapas.filter(e=>e.status==='concluida').length} concluída(s)</p>
          ${proj.dataTerminoPrev ? `
          <div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:${proj.desvioDias>0?'var(--crit-bg)':proj.desvioDias<0?'var(--ok-bg)':'var(--bg0)'};border:1px solid ${proj.desvioDias>0?'var(--crit-bd)':proj.desvioDias<0?'var(--ok-bd)':'var(--line2)'}">
            <div style="font-size:12px;color:var(--tx2);margin-bottom:2px">Projeção de término</div>
            <div style="font-family:var(--mono);font-size:15px;font-weight:700">${new Date(proj.dataTerminoPrev+'T12:00:00').toLocaleDateString('pt-BR')}</div>
            ${proj.desvioDias !== 0 ? `<div style="font-size:12px;margin-top:3px;color:${proj.desvioDias>0?'var(--crit)':'#16a34a'}">${proj.desvioDias>0?'▲ +'+proj.desvioDias+' dia(s) de atraso':'▼ '+Math.abs(proj.desvioDias)+' dia(s) adiantado'}</div>` : '<div style="font-size:12px;color:#16a34a;margin-top:3px">▶ No prazo</div>'}
          </div>` : ''}
        </div>

        <!-- Gantt: Previsto × Realizado -->
        <div class="card-sec">
          <h3 class="card-sec-titulo">Cronograma — Previsto × Realizado</h3>
          ${_renderGantt(etapas)}
        </div>
      </div>

      <div class="ficha-col">
        <div class="card-sec">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:6px;flex-wrap:wrap">
            <h3 class="card-sec-titulo" style="margin:0">Etapas de Execução</h3>
            <div style="display:flex;gap:6px">
              <button class="btn-mini" onclick="rdoTelaProjeto('${p.id}')">📋 RDOs</button>
              ${podeEditar ? `<button class="btn-mini" onclick="_abrirModalGerenciarEtapas('exec')">Gerenciar</button>` : ''}
            </div>
          </div>
          ${etapas.length ? etapas.map(et => _renderCardEtapa(et, 'exec')).join('') :
            '<p class="page-sub">Nenhuma etapa de execução cadastrada.</p>'}
          ${podeEditar ? `<button class="btn btn-sec" style="margin-top:12px;width:100%" onclick="_execAdicionarEtapa()">+ Nova etapa de execução</button>` : ''}
        </div>
      </div>
    </div>`;
}

// ── Gantt simplificado ──
function _renderGantt(etapas) {
  const comDatas = etapas.filter(e => e.data_inicio_prev || e.data_fim_prev || e.data_inicio || e.data_fim);
  if (!comDatas.length) return '<p class="page-sub">Defina datas previstas nas etapas para visualizar o cronograma.</p>';

  // Intervalo total
  const todasDatas = [];
  comDatas.forEach(e => {
    if (e.data_inicio_prev) todasDatas.push(e.data_inicio_prev);
    if (e.data_fim_prev)    todasDatas.push(e.data_fim_prev);
    if (e.data_inicio)      todasDatas.push(e.data_inicio);
    if (e.data_fim)         todasDatas.push(e.data_fim);
  });
  todasDatas.push(new Date().toISOString().slice(0,10));
  todasDatas.sort();
  const minD = new Date(todasDatas[0]+'T00:00:00');
  const maxD = new Date(todasDatas[todasDatas.length-1]+'T00:00:00');
  const spanTotal = Math.max((maxD - minD)/86400000, 1);

  function pct(d) { return Math.min(100, Math.max(0, (new Date(d+'T00:00:00')-minD)/86400000/spanTotal*100)); }
  function wid(d1, d2) { return Math.max(0.5, pct(d2)-pct(d1)); }

  const hojeIso = new Date().toISOString().slice(0,10);
  const hojePct = pct(hojeIso);

  let html = `<div style="margin-bottom:4px">`;

  comDatas.forEach(et => {
    const temPrev = et.data_inicio_prev && et.data_fim_prev;
    const temReal = et.data_inicio && et.data_fim;
    // % avançado pela etapa baseado em checklist × dias previstos
    const pctEt = prjExecCalcProgressoEtapa(et);
    // Desvio
    let desvio = '';
    if (temPrev && temReal) {
      const dfimPrev = new Date(et.data_fim_prev+'T00:00:00');
      const dfimReal = new Date(et.data_fim+'T00:00:00');
      const dias = Math.round((dfimReal-dfimPrev)/86400000);
      if (dias !== 0) desvio = `<span style="font-family:var(--mono);font-size:10px;color:${dias>0?'var(--crit)':'#16a34a'};margin-left:4px">${dias>0?'+':''}${dias}d</span>`;
    } else if (temPrev && et.status !== 'concluida') {
      // Projeção: quanto falta × ratio de andamento
      const dur = et.duracao_prev_dias || Math.round((new Date(et.data_fim_prev+'T00:00:00')-new Date(et.data_inicio_prev+'T00:00:00'))/86400000);
      if (dur > 0) {
        const diasRestPrev = dur * (1 - pctEt/100);
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        const iniReal = et.data_inicio ? new Date(et.data_inicio+'T00:00:00') : hoje;
        const projFim = new Date(iniReal.getTime() + diasRestPrev*86400000/(pctEt<100?1:1));
        projFim.setDate(projFim.getDate() + Math.round(diasRestPrev));
        const diasDesvio = Math.round((projFim - new Date(et.data_fim_prev+'T00:00:00'))/86400000);
        if (Math.abs(diasDesvio) > 0) desvio = `<span style="font-family:var(--mono);font-size:10px;color:${diasDesvio>0?'var(--crit)':'#16a34a'};margin-left:4px">proj. ${diasDesvio>0?'+':''}${diasDesvio}d</span>`;
      }
    }

    html += `<div style="margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;font-size:12px;font-weight:600">
        <span style="flex:0 0 auto;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(et.nome)}">${escHtml(et.nome)}</span>
        <span class="badge-etapa ${et.status}" style="font-size:10px;padding:1px 7px">${_prjNomeStatus(et.status)}</span>
        ${desvio}
        <span style="font-family:var(--mono);font-size:10px;color:var(--tx2);margin-left:auto">${pctEt.toFixed(0)}%</span>
      </div>
      <div style="position:relative;height:10px;background:var(--bg2);border-radius:5px;overflow:hidden">
        <div style="position:absolute;left:${hojePct.toFixed(1)}%;top:-2px;bottom:-2px;width:3px;background:var(--accent);z-index:3;box-shadow:0 0 4px rgba(26,95,212,0.5);border-radius:2px"></div>`;

    // Barra prevista (cinza escuro)
    if (temPrev) {
      html += `<div style="position:absolute;left:${pct(et.data_inicio_prev).toFixed(1)}%;width:${wid(et.data_inicio_prev,et.data_fim_prev).toFixed(1)}%;height:100%;background:var(--bg3);border-radius:5px"></div>`;
      // Preenchimento proporcional ao % do checklist sobre a barra prevista
      const fillW = wid(et.data_inicio_prev,et.data_fim_prev) * pctEt/100;
      html += `<div style="position:absolute;left:${pct(et.data_inicio_prev).toFixed(1)}%;width:${fillW.toFixed(1)}%;height:100%;background:#16a34a;border-radius:5px;opacity:0.5"></div>`;
    }
    // Barra real (verde)
    if (temReal) {
      html += `<div style="position:absolute;left:${pct(et.data_inicio).toFixed(1)}%;width:${wid(et.data_inicio,et.data_fim).toFixed(1)}%;height:100%;background:#16a34a;border-radius:5px"></div>`;
    }

    html += `</div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--tx2);margin-top:2px">
        <span>${temPrev?'Prev: '+new Date(et.data_inicio_prev+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' – '+new Date(et.data_fim_prev+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):''}</span>
        <span>${temReal?'Real: '+new Date(et.data_inicio+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' – '+new Date(et.data_fim+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):et.data_inicio?'Iniciou: '+new Date(et.data_inicio+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):''}</span>
      </div>
    </div>`;
  });

  html += `<div style="display:flex;gap:16px;margin-top:8px;font-size:11px;color:var(--tx2);flex-wrap:wrap">
    <span><span style="display:inline-block;width:12px;height:8px;background:var(--bg3);border-radius:3px;margin-right:4px"></span>Previsto</span>
    <span><span style="display:inline-block;width:12px;height:8px;background:#16a34a;opacity:0.45;border-radius:3px;margin-right:4px"></span>Avanço (checklist %)</span>
    <span><span style="display:inline-block;width:12px;height:8px;background:#16a34a;border-radius:3px;margin-right:4px"></span>Realizado</span>
    <span style="display:flex;align-items:center"><span style="display:inline-block;width:3px;height:13px;background:var(--accent);border-radius:2px;box-shadow:0 0 4px rgba(26,95,212,0.5);margin-right:5px"></span><strong style="color:var(--accent)">Hoje</strong></span>
  </div></div>`;
  return html;
}

// ── Projeção de término do projeto (paralelo: max das projeções individuais) ──
function _prjProjecaoTermino(etapas) {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  let maxPrevIso = null;
  let desvioDiasTot = 0;
  let pesoTot = 0;

  for (const et of etapas) {
    if (!et.data_fim_prev) continue;
    const dfimPrev = new Date(et.data_fim_prev+'T00:00:00');
    const durPrev = et.duracao_prev_dias
      || (et.data_inicio_prev ? Math.max(1,Math.round((dfimPrev-new Date(et.data_inicio_prev+'T00:00:00'))/86400000)) : null);

    if (et.status === 'concluida' && et.concluido_em) {
      const concl = new Date(et.concluido_em); concl.setHours(0,0,0,0);
      const dev = Math.round((concl-dfimPrev)/86400000);
      desvioDiasTot += dev * (et.peso_projeto||1);
      pesoTot += (et.peso_projeto||1);
    } else if (durPrev) {
      const pctEt = prjExecCalcProgressoEtapa(et);
      const diasRestantes = durPrev * (1 - pctEt/100);
      const iniRef = et.data_inicio ? new Date(et.data_inicio+'T00:00:00') : hoje;
      const projFim = new Date(iniRef.getTime() + Math.round(diasRestantes)*86400000);
      const dev = Math.round((projFim-dfimPrev)/86400000);
      desvioDiasTot += dev * (et.peso_projeto||1);
      pesoTot += (et.peso_projeto||1);
    }

    if (!maxPrevIso || et.data_fim_prev > maxPrevIso) maxPrevIso = et.data_fim_prev;
  }

  if (!maxPrevIso) return { dataTerminoPrev: null, desvioDias: 0 };
  const desvioDias = pesoTot ? Math.round(desvioDiasTot/pesoTot) : 0;
  const dataTermino = new Date(maxPrevIso+'T00:00:00');
  dataTermino.setDate(dataTermino.getDate() + desvioDias);
  return { dataTerminoPrev: dataTermino.toISOString().slice(0,10), desvioDias };
}

function _renderCardEtapa(et, tipo) {
  const checkKey = tipo === 'exec' ? 'projeto_exec_checklist' : 'projeto_checklist';
  const calcFn   = tipo === 'exec' ? prjExecCalcProgressoEtapa : prjCalcProgressoEtapa;
  const pEt = calcFn(et);
  const prazoField = tipo === 'exec' ? et.data_fim : et.prazo;
  const atras = prazoField && et.status !== 'concluida' &&
    new Date(prazoField + 'T23:59:59') < new Date();
  const perfis = _prjPerfis || [];
  const resp = perfis.find(pf => pf.id === et.responsavel_id);
  const empresa = (tipo === 'exec' && et.empresa_id)
    ? (_empCacheModal || []).find(em => em.id === et.empresa_id) : null;
  // Destaque visual para etapas da empresa do terceiro
  const minhaEmpresa = PERFIL?.papel === 'terceiro' && et.empresa_id === PERFIL?.empresa_id;
  const classes = ['prj-etapa-card'];
  if (atras) classes.push('prj-et-atras');
  if (minhaEmpresa) classes.push('prj-et-minha');

  return `
    <div class="${classes.join(' ')}" onclick="abrirModalEtapa('${et.id}','${tipo}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div>
          <span class="prj-et-nome">${escHtml(et.nome)}</span>
          ${et.fixo?'<span style="font-size:10px;color:var(--tx2);margin-left:6px">marco final</span>':''}
          ${atras?'<span class="badge-atrasada" style="margin-left:6px">Atrasada</span>':''}
          ${empresa ? `<span class="badge-empresa">🏢 ${escHtml(empresa.nome)}</span>` : ''}
        </div>
        <span class="badge-etapa ${et.status}">${_prjNomeStatus(et.status)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
        <div class="prj-barra-wrap" style="flex:1">
          <div class="prj-barra-fill" style="width:${pEt.toFixed(0)}%;${tipo==='exec'?'background:#16a34a':''}"></div>
        </div>
        <span style="font-family:var(--mono);font-size:12px;min-width:34px">${pEt.toFixed(0)}%</span>
      </div>
      <div style="display:flex;gap:14px;margin-top:6px;font-size:12px;color:var(--tx2)">
        ${tipo==='exec' && et.data_inicio ? `<span>&#128197; início: ${new Date(et.data_inicio+'T12:00:00').toLocaleDateString('pt-BR')}</span>` : ''}
        ${prazoField ? `<span>&#128198; fim: ${new Date(prazoField+'T12:00:00').toLocaleDateString('pt-BR')}</span>` : ''}
        ${resp ? `<span>&#128100; ${escHtml(resp.nome)}</span>` : ''}
        <span style="color:var(--accent)">&#8599; abrir</span>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════
// MODAL DE ETAPA (planejamento e execução)
// ══════════════════════════════════════════════════════════════════════
async function abrirModalEtapa(etapaId, tipo) {
  // Terceiro só abre etapas atribuídas à sua empresa (no exec)
  if (PERFIL?.papel === 'terceiro') {
    if (tipo !== 'exec') {
      _mostrarFeedback('Etapas de planejamento são apenas para consulta');
      return;
    }
    const etapa = (_fichaProj?.projeto_exec_etapas || []).find(e => e.id === etapaId);
    if (!etapa || etapa.empresa_id !== PERFIL.empresa_id) {
      _mostrarFeedback('Esta etapa não é da sua empresa');
      return;
    }
  }
  _fichaEtapaId   = etapaId;
  _fichaEtapaTipo = tipo || 'plan';
  await _renderModalEtapa();
  // Restaura rascunho (consumo único: evita sobrescrever valores após saves internos)
  _modalRestaurarDraft(etapaId);
  delete _modalDrafts[etapaId];
}

function _getEtapaAtual() {
  const lista = _fichaEtapaTipo === 'exec'
    ? (_fichaProj?.projeto_exec_etapas || [])
    : (_fichaProj?.projeto_etapas || []);
  return lista.find(e => e.id === _fichaEtapaId);
}

async function _renderModalEtapa() {
  const etapa = _getEtapaAtual();
  if (!etapa) return;
  const tipo = _fichaEtapaTipo;
  const p = _fichaProj;
  const gestor = PERFIL?.papel === 'gestor';
  const terceiro = PERFIL?.papel === 'terceiro';
  // Terceiro: pode editar apenas se a etapa for da sua empresa
  const podeEditar = terceiro ? _podeEditarEtapa(etapa) : _podeEditar();
  const perfis = _prjPerfis || [];
  const empresas = _empCacheModal || [];

  // Pega valor do rascunho se houver (terceiro), senão o valor real
  const valOu = (campo) => {
    if (terceiro && _solRascunho[etapa.id]?.[campo]) return _solRascunho[etapa.id][campo].depois;
    return etapa[campo];
  };

  const checkKey   = tipo === 'exec' ? 'projeto_exec_checklist'  : 'projeto_checklist';
  const comentKey  = tipo === 'exec' ? 'projeto_exec_comentarios': 'projeto_comentarios';
  // fotos: exec usa projeto_fotos filtrado por exec_etapa_id; plan usa etapa.projeto_fotos
  const calcFn     = tipo === 'exec' ? prjExecCalcProgressoEtapa : prjCalcProgressoEtapa;

  const check  = (etapa[checkKey]  || []).sort((a,b) => (a.ordem||0) - (b.ordem||0));
  const coments= (etapa[comentKey] || []).sort((a,b) => a.criado_em>b.criado_em?1:-1);
  const fotos = tipo === 'exec'
    ? (_fichaProj?.projeto_fotos||[]).filter(f => f.exec_etapa_id === etapa.id)
    : (etapa.projeto_fotos || []);
  const pEt    = calcFn(etapa);
  const pesoTotalCheck = check.reduce((s,c)=>s+(c.peso||1),0);

  const itensPendentes = check.filter(c => !c.concluido).length;

  document.getElementById('prj-etapa-modal-root').innerHTML = `
    <div class="prj-overlay" onclick="if(event.target===this)fecharModalEtapa()">
      <div class="prj-modal prj-etapa-modal">
        <div class="prj-modal-head">
          <div>
            <h3>${escHtml(etapa.nome)}</h3>
            <span style="font-size:11px;color:var(--tx2)">${tipo==='exec'?'Execução':'Planejamento'}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-family:var(--mono);font-size:13px;color:${tipo==='exec'?'#16a34a':'var(--accent)'}">${pEt.toFixed(0)}%</span>
            <button class="btn-mini" onclick="fecharModalEtapa()">&#x2715;</button>
          </div>
        </div>

        <!-- Controle -->
        <div class="card-sec" style="margin-bottom:14px">
          <h3 class="card-sec-titulo">Controle</h3>
          ${tipo === 'exec' ? `
          <div style="padding:10px 12px;background:var(--bg0);border-radius:8px;border:1px solid var(--line2);margin-bottom:12px">
            <div style="font-size:11px;font-family:var(--mono);color:var(--tx2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Previsto</div>
            <div class="row2">
              <div class="field"><label>Início previsto</label>
                <input id="met-inicio-prev" type="date" value="${valOu('data_inicio_prev')||''}" ${podeEditar?'':'disabled'} /></div>
              <div class="field"><label>Duração prevista (dias)</label>
                <input id="met-dur-prev" type="number" min="1" max="999" value="${valOu('duracao_prev_dias')||''}" placeholder="ex: 5" ${podeEditar?'':'disabled'} /></div>
            </div>
            ${etapa.data_inicio_prev && etapa.duracao_prev_dias ? `<p class="page-sub">Término previsto: ${new Date(new Date(etapa.data_inicio_prev+'T00:00:00').getTime()+(etapa.duracao_prev_dias)*86400000).toLocaleDateString('pt-BR')}</p>` : ''}
          </div>
          <div style="font-size:11px;font-family:var(--mono);color:var(--tx2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Realizado</div>
          <div class="row2" style="margin-bottom:10px">
            <div class="field"><label>Data início real</label>
              <input id="met-inicio" type="date" value="${valOu('data_inicio')||''}" ${podeEditar?'':'disabled'} /></div>
            <div class="field"><label>Data fim real</label>
              <input id="met-fim" type="date" value="${valOu('data_fim')||''}" ${podeEditar?'':'disabled'} /></div>
          </div>` : `
          <div class="field" style="max-width:200px;margin-bottom:10px"><label>Prazo</label>
            <input id="met-prazo" type="date" value="${valOu('prazo')||''}" ${gestor?'':'disabled'} /></div>`}
          ${tipo === 'exec' ? `
          <div class="field"><label>Empresa responsável</label>
            ${gestor ? `<select id="met-empresa">
              <option value="">— interna —</option>
              ${empresas.map(em => `<option value="${em.id}"${etapa.empresa_id===em.id?' selected':''}>${escHtml(em.nome)}</option>`).join('')}
            </select>` : `<input type="text" value="${escHtml(empresas.find(em=>em.id===etapa.empresa_id)?.nome||'Equipe interna')}" disabled />`}
          </div>` : ''}
          <div class="row2">
            <div class="field"><label>Status</label>
              ${podeEditar ? `<select id="met-status">
                <option value="pendente"${valOu('status')==='pendente'?' selected':''}>Pendente</option>
                <option value="em_andamento"${valOu('status')==='em_andamento'?' selected':''}>Em andamento</option>
                <option value="concluida"${valOu('status')==='concluida'?' selected':''}>Concluída</option>
              </select>` : `<input type="text" value="${_prjNomeStatus(etapa.status)}" disabled />`}
            </div>
            <div class="field"><label>Responsável</label>
              ${(gestor || (terceiro && podeEditar)) ? `<select id="met-resp">
                <option value="">— selecione —</option>
                ${perfis.map(pf=>`<option value="${pf.id}"${valOu('responsavel_id')===pf.id?' selected':''}>${escHtml(pf.nome)}</option>`).join('')}
              </select>` : `<input type="text" value="${escHtml(perfis.find(pf=>pf.id===etapa.responsavel_id)?.nome||'—')}" disabled />`}
            </div>
          </div>
          ${etapa.concluido_em ? `<p class="page-sub">Concluída em ${new Date(etapa.concluido_em).toLocaleString('pt-BR')}</p>` : ''}
          ${podeEditar ? `
          <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
            <button class="btn" onclick="_etapaSalvar()">Salvar alterações</button>
            <span id="met-salvo" style="font-size:12px;color:#16a34a;display:none">&#10003; Salvo</span>
          </div>` : ''}
          ${itensPendentes > 0 && podeEditar ? `
          <p class="page-sub" style="margin-top:8px;color:var(--warn)">
            &#9888; ${itensPendentes} item(ns) do checklist ainda pendente(s)
          </p>` : ''}
        </div>

        <!-- Checklist -->
        <div class="card-sec" style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <h3 class="card-sec-titulo" style="margin:0">Checklist
              <span style="font-family:var(--mono);font-size:12px;color:var(--tx2);margin-left:8px">
                ${check.filter(c=>c.concluido).length}/${check.length} · Peso total: ${pesoTotalCheck}
              </span>
            </h3>
            ${podeEditar ? `<button class="btn-mini" onclick="_checkAdicionar('${etapa.id}','${tipo}')">+ Item</button>` : ''}
          </div>
          <div id="met-check-lista">
            ${check.length === 0 ? `<p class="page-sub">Nenhum item.</p>` :
              check.map((c, _ci) => `
              <div class="prj-check-item" id="ci-${c.id}">
                ${podeEditar ? `
                <div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0">
                  <button class="check-seta" ${_ci===0?'disabled':''} onclick="_checkMover('${c.id}','${tipo}',-1)" title="Mover para cima">▲</button>
                  <button class="check-seta" ${_ci===check.length-1?'disabled':''} onclick="_checkMover('${c.id}','${tipo}',1)" title="Mover para baixo">▼</button>
                </div>` : ''}
                <label style="display:flex;align-items:center;gap:10px;flex:1;cursor:pointer">
                  <input type="checkbox" ${c.concluido?'checked':''} ${podeEditar?'':'disabled'}
                    onchange="_checkMarcar('${c.id}',this.checked,'${tipo}')" />
                  <span style="${c.concluido?'text-decoration:line-through;color:var(--tx2)':''}">${escHtml(c.descricao)}</span>
                </label>
                <span class="prj-check-peso">Peso ${c.peso||1}</span>
                ${podeEditar ? `<button class="btn-mini btn-mini-danger" style="padding:2px 7px" onclick="_checkExcluir('${c.id}','${tipo}')">&#x2715;</button>` : ''}
              </div>`).join('')}
          </div>
        </div>

        <!-- Comentários -->
        <div class="card-sec" style="margin-bottom:14px">
          <h3 class="card-sec-titulo">Comentários</h3>
          <div id="met-coments" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">
            ${coments.length === 0 ? `<p class="page-sub">Sem comentários.</p>` :
              coments.map(c => {
                const autorNome = (_prjPerfis||[]).find(pf=>pf.id===c.autor_id)?.nome||'';
                return `<div class="prj-coment" id="comt-${c.id}">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start">
                    <span style="font-size:12px;font-weight:600">${escHtml(autorNome)}</span>
                    <div style="display:flex;align-items:center;gap:6px">
                      <span style="font-size:11px;color:var(--tx2)">${new Date(c.criado_em).toLocaleString('pt-BR')}</span>
                      ${gestor?`<button class="btn-mini btn-mini-danger" style="padding:2px 6px" onclick="_comentExcluir('${c.id}','${tipo}')">&#x2715;</button>`:''}
                    </div>
                  </div>
                  <p style="margin-top:4px;font-size:14px;white-space:pre-wrap">${escHtml(c.texto)}</p>
                </div>`;
              }).join('')}
          </div>
          ${podeEditar ? `
          <textarea id="met-novo-coment" rows="2" placeholder="Adicionar comentário..." style="margin-bottom:8px"></textarea>
          <button class="btn btn-sec" onclick="_comentAdicionar('${etapa.id}','${tipo}')">Enviar comentário</button>` : ''}
        </div>

        <!-- Fotos -->
        <div class="card-sec">
          <h3 class="card-sec-titulo">Fotos</h3>
          <div class="etapa-fotos" id="met-fotos">
            ${fotos.map(f => `
              <div class="etapa-foto-wrap" id="fw-${f.id}">
                <img src="${prjUrlFoto(f.caminho_storage)}" class="etapa-foto"
                  onclick="window.open('${prjUrlFoto(f.caminho_storage)}','_blank')" />
                ${podeEditar ? `<button class="foto-del-btn" onclick="_fotoExcluir('${f.id}','${f.caminho_storage}')">&#x2715;</button>` : ''}
              </div>`).join('')}
          </div>
          ${podeEditar ? `
          <label class="btn btn-sec" style="margin-top:10px;display:inline-block;cursor:pointer">
            + Adicionar fotos
            <input type="file" accept="image/*" multiple style="display:none"
              onchange="_fotosAdicionar('${p.id}','${etapa.id}',this,'${tipo}')" />
          </label>` : ''}
        </div>
      </div>
    </div>`;
}

function fecharModalEtapa() {
  // Preserva o que foi digitado/alterado e não salvo (restaurado ao reabrir)
  if (_fichaEtapaId) {
    const g = id => document.getElementById(id)?.value;
    const d = {
      coment:  g('met-novo-coment'),
      status:  g('met-status'),
      resp:    g('met-resp'),
      prazo:   g('met-prazo'),
      ini:     g('met-inicio'),
      fim:     g('met-fim'),
      iniPrev: g('met-inicio-prev'),
      dur:     g('met-dur-prev'),
      empresa: g('met-empresa'),
    };
    // Só guarda se há algo digitado no comentário ou algum controle presente
    const temAlgo = Object.values(d).some(v => v != null && v !== '');
    if (temAlgo) _modalDrafts[_fichaEtapaId] = d;
    else delete _modalDrafts[_fichaEtapaId];
  }
  document.getElementById('prj-etapa-modal-root').innerHTML = '';
  _fichaEtapaId = null;
}

// Restaura rascunho do modal de etapa (chamado após o render)
function _modalRestaurarDraft(etapaId) {
  const d = _modalDrafts[etapaId];
  if (!d) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el && v != null && v !== '') el.value = v; };
  set('met-novo-coment', d.coment);
  set('met-status',      d.status);
  set('met-resp',        d.resp);
  set('met-prazo',       d.prazo);
  set('met-inicio',      d.ini);
  set('met-fim',         d.fim);
  set('met-inicio-prev', d.iniPrev);
  set('met-dur-prev',    d.dur);
  set('met-empresa',     d.empresa);
}

// ── Atualiza % nas abas sem recriar a ficha inteira ──
function _atualizarBotoesAba() {
  const p = _fichaProj;
  const pctPlan = prjCalcProgresso(p.projeto_etapas || []);
  const pctExec = prjExecCalcProgresso(p.projeto_exec_etapas || []);
  const btns = document.querySelectorAll('.cat-tabs .cat-tab');
  if (btns[0]) btns[0].innerHTML = `&#128196; Planejamento <span style="font-family:var(--mono);font-size:11px">${pctPlan.toFixed(0)}%</span>`;
  if (btns[1]) btns[1].innerHTML = `&#9881; Execução <span style="font-family:var(--mono);font-size:11px">${pctExec.toFixed(0)}%</span>`;
}

// ── Verifica se todas as etapas exec estão concluídas e propõe concluir o projeto ──
async function _verificarConclusaoProjeto() {
  const etapas = _fichaProj.projeto_exec_etapas || [];
  if (!etapas.length) return;
  const todasConcluidas = etapas.every(e => e.status === 'concluida');
  if (todasConcluidas && _fichaProj.status !== 'concluido') {
    if (confirm('Todas as etapas de execução foram concluídas!\nDeseja marcar o projeto como "Concluído"?')) {
      await prjAtualizar(_fichaProj.id, { status: 'concluido' });
      _fichaProj.status = 'concluido';
      // Atualiza badge de status no cabeçalho sem recriar a ficha
      const tituloEl = document.querySelector('.ficha-titulo');
      if (tituloEl) {
        // Remove badge antigo e insere novo
        const badgeAntigo = tituloEl.querySelector('.ac-cont, .badge-status');
        if (badgeAntigo) badgeAntigo.outerHTML = _prjBadgeStatus('concluido');
      }
      _mostrarFeedback('Projeto marcado como Concluído');
    }
  }
}

// ── Terceiro: acumula alterações de campos da etapa no rascunho de solicitação ──
function _etapaSalvarParaSolicitacao(etapa, isExec) {
  // Lê valores atuais dos inputs e compara com os da etapa para detectar mudanças
  const campos = {};
  if (isExec) {
    campos.status            = document.getElementById('met-status')?.value || etapa.status;
    campos.empresa_id        = document.getElementById('met-empresa')?.value || null;
    campos.data_inicio_prev  = document.getElementById('met-inicio-prev')?.value || null;
    campos.duracao_prev_dias = +(document.getElementById('met-dur-prev')?.value) || null;
    campos.data_inicio       = document.getElementById('met-inicio')?.value || null;
    campos.data_fim          = document.getElementById('met-fim')?.value || null;
    campos.responsavel_id    = document.getElementById('met-resp')?.value || null;
  } else {
    campos.status         = document.getElementById('met-status')?.value || etapa.status;
    campos.prazo          = document.getElementById('met-prazo')?.value || null;
    campos.responsavel_id = document.getElementById('met-resp')?.value || null;
  }

  let mudou = 0;
  for (const [k, v] of Object.entries(campos)) {
    const atual = etapa[k] == null ? null : etapa[k];
    const novo  = v == null ? null : v;
    if (String(atual || '') !== String(novo || '')) {
      _rascunhoAdicionar(etapa.id, k, atual, novo);
      mudou++;
    }
  }

  if (mudou === 0) {
    _mostrarFeedback('Nenhuma alteração detectada');
    return;
  }

  _mostrarFeedback(`${mudou} alteração(ões) adicionadas ao rascunho`);
  _atualizarBotaoEnviarSolicitacao();
  // Re-renderiza modal pra refletir os campos com indicador de pendente
  _renderModalEtapa();
}

// Botão flutuante "Enviar solicitação" — aparece quando há rascunho
function _atualizarBotaoEnviarSolicitacao() {
  let btn = document.getElementById('btn-enviar-sol');
  const n = _rascunhoContarItens();
  if (n === 0) {
    if (btn) btn.remove();
    return;
  }
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'btn-enviar-sol';
    btn.className = 'btn-enviar-sol';
    btn.onclick = _abrirRevisaoSolicitacao;
    document.body.appendChild(btn);
  }
  btn.innerHTML = `📨 Enviar solicitação <span class="btn-enviar-sol-n">${n}</span>`;
}

function _abrirRevisaoSolicitacao() {
  const itens = [];
  for (const eId in _solRascunho) {
    for (const campo in _solRascunho[eId]) {
      itens.push({
        exec_etapa_id: eId,
        campo,
        valor_antes: _solRascunho[eId][campo].antes,
        valor_depois: _solRascunho[eId][campo].depois
      });
    }
  }
  const etapas = _fichaProj.projeto_exec_etapas || _fichaProj.projeto_etapas || [];
  const nomeEtapa = id => etapas.find(e => e.id === id)?.nome || '—';

  // Modal de revisão
  document.getElementById('prj-modal-root').innerHTML = `
    <div class="prj-overlay" onclick="if(event.target===this)_fecharRevisao()">
      <div class="prj-modal" style="max-width:680px">
        <div class="prj-modal-head">
          <h3>Revisar alterações</h3>
          <button class="btn-mini" onclick="_fecharRevisao()">&#x2715;</button>
        </div>
        <p class="page-sub" style="margin-bottom:14px">Estas alterações serão enviadas para aprovação do gestor.</p>
        <div style="max-height:50vh;overflow-y:auto">
        ${itens.map(it => `
          <div style="border:1px solid var(--line2);border-radius:var(--r2);padding:8px 12px;margin-bottom:6px">
            <div style="font-size:11px;color:var(--tx2)">${escHtml(nomeEtapa(it.exec_etapa_id))}</div>
            <div style="display:flex;gap:8px;font-size:13px;margin-top:3px;flex-wrap:wrap">
              <strong>${_solNomeCampoLocal(it.campo)}:</strong>
              <span style="color:var(--tx2)">${escHtml(_solFmtValorLocal(it.campo, it.valor_antes)) || '—'}</span>
              <span>→</span>
              <span style="color:var(--accent);font-weight:600">${escHtml(_solFmtValorLocal(it.campo, it.valor_depois)) || '—'}</span>
            </div>
          </div>`).join('')}
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
          <button class="btn btn-sec" onclick="_fecharRevisao()">Continuar editando</button>
          <button class="btn" onclick="_enviarSolicitacao()">Enviar solicitação</button>
        </div>
      </div>
    </div>`;
}

function _solNomeCampoLocal(c) {
  const MAP = {
    status: 'Status', data_inicio: 'Data início real', data_fim: 'Data fim real',
    data_inicio_prev: 'Início previsto', data_fim_prev: 'Fim previsto',
    duracao_prev_dias: 'Duração prev. (d)', responsavel_id: 'Responsável',
    prazo: 'Prazo', peso_projeto: 'Peso', nome: 'Nome'
  };
  return MAP[c] || c;
}

function _solFmtValorLocal(campo, valor) {
  if (valor == null || valor === '') return '';
  if (['data_inicio','data_fim','data_inicio_prev','data_fim_prev','prazo'].includes(campo))
    return new Date(valor + 'T12:00:00').toLocaleDateString('pt-BR');
  if (campo === 'status')
    return {pendente:'Pendente',em_andamento:'Em andamento',concluida:'Concluída'}[valor] || valor;
  if (campo === 'responsavel_id')
    return (_prjPerfis || []).find(p => p.id === valor)?.nome || valor;
  return String(valor);
}

function _fecharRevisao() {
  document.getElementById('prj-modal-root').innerHTML = '';
}

async function _enviarSolicitacao() {
  const itens = [];
  for (const eId in _solRascunho) {
    for (const campo in _solRascunho[eId]) {
      itens.push({
        exec_etapa_id: eId,
        campo,
        valor_antes: _solRascunho[eId][campo].antes,
        valor_depois: _solRascunho[eId][campo].depois
      });
    }
  }
  if (!itens.length) return;
  const btn = document.querySelector('.prj-modal .btn:last-child');
  btn.disabled = true; btn.textContent = 'Enviando...';
  try {
    await solCriar(_fichaProj.id, PERFIL.empresa_id, itens);
    _rascunhoLimpar();
    _fecharRevisao();
    _atualizarBotaoEnviarSolicitacao();
    _mostrarFeedback('Solicitação enviada para aprovação');
  } catch (e) {
    alert('Erro: ' + e.message);
    btn.disabled = false; btn.textContent = 'Enviar solicitação';
  }
}

// ── Salvar controle da etapa — regras completas status ↔ checklist ↔ datas ──
async function _etapaSalvar() {
  const etapa = _getEtapaAtual();
  if (!etapa) return;
  // Valida todas as datas do modal antes de qualquer processamento
  if (typeof DataValida !== 'undefined' && !DataValida.checarTodas(document.querySelector('.prj-etapa-modal'))) return;
  const tipo    = _fichaEtapaTipo;
  const isExec  = tipo === 'exec';

  // ── Terceiro: alterações em campos vão para rascunho de solicitação ──
  if (PERFIL?.papel === 'terceiro') {
    return _etapaSalvarParaSolicitacao(etapa, isExec);
  }

  const statusEl = document.getElementById('met-status');
  let   novoStatus = statusEl?.value || etapa.status;
  const resp   = document.getElementById('met-resp')?.value || null;

  const checkKey      = isExec ? 'projeto_exec_checklist'  : 'projeto_checklist';
  const checkFnMarcar = isExec ? prjExecCheckMarcar         : prjCheckMarcar;
  const check         = etapa[checkKey] || [];

  // ── PRÉ-CONDIÇÃO: checklist obrigatório para sair de Pendente ──
  if (novoStatus !== 'pendente' && check.length === 0) {
    alert('Esta etapa não possui itens no checklist.\nAdicione ao menos um item antes de alterar o status.');
    if (statusEl) statusEl.value = etapa.status;
    return;
  }
  // Em andamento exige ao menos 1 item marcado E 1 pendente (progresso parcial)
  if (novoStatus === 'em_andamento') {
    const temMarcado  = check.some(c =>  c.concluido);
    const temPendente = check.some(c => !c.concluido);
    if (!temMarcado || !temPendente) {
      alert('Para "Em andamento" deve haver ao menos um item do checklist concluído e um pendente.\n\n' +
        (check.length === 0 ? 'Adicione itens ao checklist primeiro.' :
         !temMarcado ? 'Nenhum item foi marcado ainda — use "Pendente".' :
         'Todos os itens estão marcados — use "Concluída".'));
      if (statusEl) statusEl.value = etapa.status;
      return;
    }
  }
  // Em andamento (exec) exige data de início real
  if (novoStatus === 'em_andamento' && isExec) {
    const dataInicio = document.getElementById('met-inicio')?.value;
    if (!dataInicio) {
      alert('Informe a data de início real antes de marcar como "Em andamento".');
      if (statusEl) statusEl.value = etapa.status;
      document.getElementById('met-inicio')?.focus();
      return;
    }
  }
  // Em andamento (planejamento) exige prazo definido
  if (novoStatus === 'em_andamento' && !isExec) {
    const prazo = document.getElementById('met-prazo')?.value;
    if (!prazo) {
      alert('Informe o prazo antes de marcar como "Em andamento".');
      if (statusEl) statusEl.value = etapa.status;
      document.getElementById('met-prazo')?.focus();
      return;
    }
  }

  const campos = { responsavel_id: resp || null };

  // ── Campos de datas ──
  if (isExec) {
    campos.empresa_id        = document.getElementById('met-empresa')?.value || null;
    campos.data_inicio_prev  = document.getElementById('met-inicio-prev')?.value || null;
    campos.duracao_prev_dias = +(document.getElementById('met-dur-prev')?.value) || null;
    if (campos.data_inicio_prev && campos.duracao_prev_dias) {
      const d = new Date(campos.data_inicio_prev+'T00:00:00');
      d.setDate(d.getDate() + campos.duracao_prev_dias);
      campos.data_fim_prev = d.toISOString().slice(0,10);
    } else { campos.data_fim_prev = null; }

    campos.data_inicio = document.getElementById('met-inicio')?.value || null;
    campos.data_fim    = document.getElementById('met-fim')?.value    || null;

    // Data início preenchida + status Pendente → sugere Em andamento
    if (campos.data_inicio && novoStatus === 'pendente' && etapa.status === 'pendente') {
      if (check.length >= 2 && confirm('Data de início preenchida. Deseja alterar o status para "Em andamento"?')) {
        novoStatus = 'em_andamento';
        if (statusEl) statusEl.value = 'em_andamento';
      }
    }

    // Data fim preenchida + não concluída → força Concluída
    if (campos.data_fim && novoStatus !== 'concluida') {
      if (confirm('Data fim real preenchida. A etapa será marcada como "Concluída". Confirmar?')) {
        novoStatus = 'concluida';
        if (statusEl) statusEl.value = 'concluida';
      } else {
        campos.data_fim = null;
        const el = document.getElementById('met-fim');
        if (el) el.value = '';
      }
    }

    // Concluída → data fim obrigatória
    if (novoStatus === 'concluida' && !campos.data_fim) {
      const hoje = new Date().toISOString().slice(0,10);
      alert('Para concluir a etapa informe a data fim real.\nPreenchendo com a data de hoje — ajuste se necessário antes de salvar.');
      campos.data_fim = hoje;
      const el = document.getElementById('met-fim');
      if (el) el.value = hoje;
      campos.status = novoStatus;
      if (statusEl) statusEl.value = novoStatus;
      // Mostra data preenchida mas retorna para o usuário confirmar
      await _renderModalEtapa();
      return;
    }
  } else {
    campos.prazo = document.getElementById('met-prazo')?.value || null;
  }

  // ── Intertravamento status ↔ checklist ──
  const pendentes  = check.filter(c => !c.concluido);
  const marcados   = check.filter(c =>  c.concluido);

  if (novoStatus === 'concluida') {
    // Marca todos os pendentes
    if (pendentes.length > 0) {
      if (!confirm(`${pendentes.length} item(ns) ainda pendente(s).\nTodos serão marcados como concluídos. Confirmar?`)) return;
      for (const item of pendentes) { await checkFnMarcar(item.id, true); item.concluido = true; }
    }
    if (!etapa.concluido_em) campos.concluido_em = new Date().toISOString();

  } else if (novoStatus === 'pendente') {
    // Pendente: desmarca TUDO e limpa datas reais
    if (marcados.length > 0) {
      if (!confirm(`Ao retornar para Pendente, todos os ${check.length} item(ns) do checklist serão redefinidos como pendentes. Confirmar?`)) return;
      for (const item of marcados) { await checkFnMarcar(item.id, false); item.concluido = false; }
    }
    campos.concluido_em = null;
    if (isExec) {
      // Limpa data fim (etapa não está mais concluída)
      if (campos.data_fim && etapa.status === 'concluida') {
        campos.data_fim = null;
        const el = document.getElementById('met-fim'); if (el) el.value = '';
      }
    }

  } else if (novoStatus === 'em_andamento') {
    // Em andamento: não mexe nos itens marcados, limpa concluido_em
    if (etapa.status === 'concluida') {
      // Saindo de concluída → desmarca todos
      if (!confirm(`Ao reabrir a etapa, todos os ${check.length} item(ns) do checklist serão redefinidos como pendentes. Confirmar?`)) return;
      for (const item of marcados) { await checkFnMarcar(item.id, false); item.concluido = false; }
      if (isExec && campos.data_fim) {
        if (!confirm('Deseja manter a data fim real preenchida mesmo reabrindo a etapa?')) {
          campos.data_fim = null;
          const el = document.getElementById('met-fim'); if (el) el.value = '';
        }
      }
    }
    campos.concluido_em = null;
  }

  campos.status = novoStatus;

  // ── Reabriu etapa → projeto volta para Em andamento se estava Concluído ──
  if (novoStatus !== 'concluida' && etapa.status === 'concluida' &&
      _fichaProj.status === 'concluido') {
    await prjAtualizar(_fichaProj.id, { status: 'em_andamento' });
    _fichaProj.status = 'em_andamento';
    _mostrarFeedback('Projeto reaberto automaticamente para Em andamento');
  }

  try {
    const fn = isExec ? prjExecEtapaAtualizar : prjEtapaAtualizar;
    await fn(etapa.id, campos);
    Object.assign(etapa, campos);
    // Preserva comentário em digitação através do re-render
    const _comentTmp = document.getElementById('met-novo-coment')?.value;
    _atualizarBotoesAba();
    _renderAba();
    await _renderModalEtapa();
    if (_comentTmp) { const el = document.getElementById('met-novo-coment'); if (el) el.value = _comentTmp; }
    _mostrarFeedback('Alterações salvas');
    if (isExec) await _verificarConclusaoProjeto();
  } catch (e) {
    alert('Erro ao salvar: ' + e.message);
  }
}

// ── Checklist ──
async function _checkAdicionar(etapaId, tipo) {
  const desc = prompt('Descrição do item:');
  if (!desc?.trim()) return;
  const pesoStr = prompt('Peso do item (ex: 1, 2, 3):', '1');
  const peso = parseInt(pesoStr) || 1;
  const isExec = tipo === 'exec';
  const tabela = isExec ? 'projeto_exec_checklist' : 'projeto_checklist';
  const fn = isExec ? prjExecCheckCriar : prjCheckCriar;
  try {
    const _etapaOrd = _getEtapaAtual();
    const _checkOrdKey = isExec ? 'projeto_exec_checklist' : 'projeto_checklist';
    const _maxOrdem = Math.max(0, ...(((_etapaOrd?.[_checkOrdKey])||[]).map(x => x.ordem||0)));
    const novo = await fn({ etapa_id: etapaId, descricao: desc.trim(), peso, ordem: _maxOrdem + 1 });
    const etapa = _getEtapaAtual();
    const checkKey = isExec ? 'projeto_exec_checklist' : 'projeto_checklist';
    if (etapa) { etapa[checkKey] = etapa[checkKey] || []; etapa[checkKey].push(novo); }
    await _renderModalEtapa();
  } catch (e) { alert('Erro: ' + e.message); }
}

async function _checkMarcar(id, concluido, tipo) {
  const isExec = tipo === 'exec';
  const fn = isExec ? prjExecCheckMarcar : prjCheckMarcar;
  try {
    await fn(id, concluido);
    const etapa = _getEtapaAtual();
    const checkKey = isExec ? 'projeto_exec_checklist' : 'projeto_checklist';
    const calcFn   = isExec ? prjExecCalcProgressoEtapa : prjCalcProgressoEtapa;
    if (etapa) {
      const item = (etapa[checkKey]||[]).find(c=>c.id===id);
      if (item) { item.concluido = concluido; }
    }

    // Atualiza visual do item
    const span = document.querySelector(`#ci-${id} label span`);
    if (span) span.style = concluido ? 'text-decoration:line-through;color:var(--tx2)' : '';

    // Atualiza % no header
    const pEt = etapa ? calcFn(etapa) : 0;
    const pctEl = document.querySelector('.prj-etapa-modal .prj-modal-head span');
    if (pctEl) pctEl.textContent = pEt.toFixed(0) + '%';

    // Atualiza % nas abas em tempo real
    _atualizarBotoesAba();

    // Verifica se todos concluídos → sugere marcar etapa como concluída
    const check = etapa?.[checkKey] || [];
    if (concluido && check.length > 0 && check.every(c => c.concluido) && etapa.status !== 'concluida') {
      if (confirm('Todos os itens do checklist foram concluídos!\nDeseja marcar a etapa como "Concluída"?')) {
        document.getElementById('met-status').value = 'concluida';
        await _etapaSalvar();
      }
    }
  } catch (e) { alert('Erro: ' + e.message); }
}

// Move item do checklist para cima (-1) ou baixo (+1)
async function _checkMover(id, tipo, direcao) {
  const isExec = tipo === 'exec';
  const checkKey = isExec ? 'projeto_exec_checklist' : 'projeto_checklist';
  const tabela = isExec ? 'projeto_exec_checklist' : 'projeto_checklist';
  const etapa = _getEtapaAtual();
  if (!etapa) return;
  const lista = (etapa[checkKey] || []).sort((a,b) => (a.ordem||0)-(b.ordem||0));
  const idx = lista.findIndex(x => x.id === id);
  const alvo = idx + direcao;
  if (idx < 0 || alvo < 0 || alvo >= lista.length) return;
  const a = lista[idx], b = lista[alvo];
  // Garante ordens distintas (dados legados podem ter null/0 duplicado)
  if ((a.ordem||0) === (b.ordem||0)) { a.ordem = idx + 1; b.ordem = alvo + 1; }
  try {
    await prjCheckTrocarOrdem(tabela, a, b);
    const tmp = a.ordem; a.ordem = b.ordem; b.ordem = tmp;
    await _renderModalEtapa();
  } catch (e) {
    alert('Erro ao mover: ' + e.message);
  }
}

async function _checkExcluir(id, tipo) {
  if (!confirm('Excluir este item?')) return;
  const isExec = tipo === 'exec';
  const fn = isExec ? prjExecCheckExcluir : prjCheckExcluir;
  const checkKey = isExec ? 'projeto_exec_checklist' : 'projeto_checklist';
  try {
    await fn(id);
    const etapa = _getEtapaAtual();
    if (etapa) etapa[checkKey] = (etapa[checkKey]||[]).filter(c=>c.id!==id);
    document.getElementById('ci-'+id)?.remove();
  } catch (e) { alert('Erro: ' + e.message); }
}

// ── Comentários ──
async function _comentAdicionar(etapaId, tipo) {
  const txt = document.getElementById('met-novo-coment')?.value.trim();
  if (!txt) return;
  const isExec = tipo === 'exec';
  const fn = isExec ? prjExecComentarioCriar : prjComentarioCriar;
  const comentKey = isExec ? 'projeto_exec_comentarios' : 'projeto_comentarios';
  try {
    const novo = await fn(etapaId, txt);
    const etapa = _getEtapaAtual();
    if (etapa) { etapa[comentKey] = etapa[comentKey]||[]; etapa[comentKey].push(novo); }
    document.getElementById('met-novo-coment').value = '';
    const lista = document.getElementById('met-coments');
    if (lista) {
      if (lista.querySelector('.page-sub')) lista.innerHTML = '';
      lista.insertAdjacentHTML('beforeend', `
        <div class="prj-coment" id="comt-${novo.id}">
          <div style="display:flex;justify-content:space-between">
            <span style="font-size:12px;font-weight:600">${escHtml(PERFIL?.nome||'')}</span>
            <span style="font-size:11px;color:var(--tx2)">${new Date(novo.criado_em).toLocaleString('pt-BR')}</span>
          </div>
          <p style="margin-top:4px;font-size:14px;white-space:pre-wrap">${escHtml(novo.texto)}</p>
        </div>`);
    }
  } catch (e) { alert('Erro: ' + e.message); }
}

async function _comentExcluir(id, tipo) {
  if (!confirm('Excluir comentário?')) return;
  const fn = tipo === 'exec' ? prjExecComentarioExcluir : prjComentarioExcluir;
  const comentKey = tipo === 'exec' ? 'projeto_exec_comentarios' : 'projeto_comentarios';
  try {
    await fn(id);
    const etapa = _getEtapaAtual();
    if (etapa) etapa[comentKey] = (etapa[comentKey]||[]).filter(c=>c.id!==id);
    document.getElementById('comt-'+id)?.remove();
  } catch (e) { alert('Erro: ' + e.message); }
}

// ── Fotos ──
async function _fotosAdicionar(projetoId, etapaId, input, tipo) {
  const files = [...input.files];
  if (!files.length) return;
  input.parentElement.childNodes[0].textContent = ' Enviando...';
  try {
    for (const file of files) {
      const blob = await _prjComprimirFoto(file);
      if (tipo === 'exec') await prjUploadFoto(projetoId, null, blob, etapaId);
      else await prjUploadFoto(projetoId, etapaId, blob, null);
    }
    _fichaProj = await prjBuscar(projetoId);
    await _renderModalEtapa();
  } catch (e) { alert('Erro ao enviar foto: ' + e.message); }
}

async function _fotoExcluir(id, caminho) {
  if (!confirm('Excluir esta foto?')) return;
  const tipo = _fichaEtapaTipo;
  // fotos exec em projeto_fotos por exec_etapa_id
  try {
    await prjFotoExcluir(id, caminho);
    const etapa = _getEtapaAtual();
  if (tipo === 'exec') {
    if (_fichaProj?.projeto_fotos) _fichaProj.projeto_fotos = _fichaProj.projeto_fotos.filter(f=>f.id!==id);
  } else {
    if (etapa) etapa.projeto_fotos = (etapa.projeto_fotos||[]).filter(f=>f.id!==id);
  }
    document.getElementById('fw-'+id)?.remove();
  } catch (e) { alert('Erro: ' + e.message); }
}

async function _prjComprimirFoto(file) {
  return new Promise(res => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX=1200; let w=img.width,h=img.height;
      if(w>MAX||h>MAX){if(w>h){h=Math.round(h*MAX/w);w=MAX;}else{w=Math.round(w*MAX/h);h=MAX;}}
      const c=document.createElement('canvas');c.width=w;c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      c.toBlob(b=>{URL.revokeObjectURL(url);res(b);},'image/jpeg',0.82);
    };
    img.src=url;
  });
}

// ── Fotos gerais do projeto ──
async function _prjFotosProjetoAdicionar(input) {
  const files = [...input.files]; if (!files.length) return;
  input.parentElement.childNodes[0].textContent = ' Enviando...';
  try {
    for (const file of files) { const blob = await _prjComprimirFoto(file); await prjUploadFoto(_fichaProj.id, null, blob, null); }
    _fichaProj = await prjBuscar(_fichaProj.id); _renderFicha();
  } catch (e) { alert('Erro: ' + e.message); }
}
async function _prjFotoProjetoExcluir(id, caminho) {
  if (!confirm('Excluir esta foto?')) return;
  try {
    await prjFotoExcluir(id, caminho);
    if (_fichaProj.projeto_fotos) _fichaProj.projeto_fotos = _fichaProj.projeto_fotos.filter(f=>f.id!==id);
    document.getElementById('pfoto-'+id)?.remove();
  } catch(e) { alert('Erro: '+e.message); }
}

// ── Salvar info geral ──
async function _prjSalvarInfo() {
  const status = document.getElementById('fp-status')?.value;
  const prio   = document.getElementById('fp-prio')?.value;
  const campos = {};
  if (status) campos.status = status;
  if (prio)   campos.prioridade = prio;
  try {
    await prjAtualizar(_fichaProj.id, campos);
    Object.assign(_fichaProj, campos);
    // Atualiza badge no cabeçalho em tempo real
    const badgeEl = document.querySelector('.ficha-titulo .ac-cont, .ficha-titulo .badge-status');
    if (badgeEl) badgeEl.outerHTML = _prjBadgeStatus(_fichaProj.status);
    _mostrarFeedback('Informações salvas');
  } catch(e) { alert('Erro: '+e.message); }
}

async function _prjSalvarDescricao() {
  const txt = document.getElementById('fp-descricao')?.value ?? '';
  try {
    await prjAtualizar(_fichaProj.id, { descricao: txt });
    _fichaProj.descricao = txt;
    _mostrarFeedback('Descrição salva');
  } catch(e) { alert('Erro: '+e.message); }
}

async function _prjSalvarEquipe() {
  const ids = [...document.querySelectorAll('#fp-equipe input:checked')].map(el => el.value);
  try { await prjEquipeDefinir(_fichaProj.id, ids); }
  catch(e) { alert('Erro ao salvar equipe: '+e.message); }
}

function _mostrarFeedback(msg) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#166534;color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:200;box-shadow:0 4px 12px rgba(0,0,0,0.2)';
  el.textContent = '✓ ' + msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ── Nova etapa execução ──
async function _execAdicionarEtapa() {
  const nome = prompt('Nome da nova etapa de execução:');
  if (!nome?.trim()) return;
  const etapas = _fichaProj.projeto_exec_etapas || [];
  const ordem = Math.max(...etapas.map(e => e.ordem), 0) + 1;
  try {
    await prjExecEtapaCriar({ projeto_id: _fichaProj.id, nome: nome.trim(), ordem, peso_projeto: 1, status: 'pendente' });
    _fichaProj = await prjBuscar(_fichaProj.id);
    _renderFicha(); _trocarAba('exec');
  } catch(e) { alert('Erro: '+e.message); }
}

// ── Modal gerenciar etapas (plan e exec) ──
function _abrirModalGerenciarEtapas(tipo) {
  const etapas = tipo === 'exec' ? (_fichaProj.projeto_exec_etapas||[]) : (_fichaProj.projeto_etapas||[]);
  document.getElementById('prj-modal-root').innerHTML = `
    <div class="prj-overlay" onclick="if(event.target===this)_fecharModalGerenciar()">
      <div class="prj-modal" style="max-width:620px">
        <div class="prj-modal-head">
          <h3>Gerenciar Etapas — ${tipo==='exec'?'Execução':'Planejamento'}</h3>
          <button class="btn-mini" onclick="_fecharModalGerenciar()">&#x2715;</button>
        </div>
        <p class="page-sub" style="margin-bottom:12px">Salve cada linha individualmente.</p>
        <div id="ged-lista">
          ${etapas.map((et, _idx) => `
            <div id="ged-row-${et.id}" style="background:var(--bg0);border:1px solid var(--line2);border-radius:var(--r2);padding:10px 12px;margin-bottom:8px">
              <!-- Linha 1: número, nome, peso, ações -->
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:${tipo==='exec'?'8px':'0'}">
                <span class="prj-etapa-ord" style="flex-shrink:0">${_idx + 1}</span>
                <input type="text" value="${escHtml(et.nome)}" id="ged-nome-${et.id}" style="flex:1;min-width:0" placeholder="Nome da etapa" />
                <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
                  <span style="font-size:11px;color:var(--tx2)">Peso</span>
                  <input type="number" min="1" max="99" value="${et.peso_projeto||1}" id="ged-peso-${et.id}" style="width:48px;padding:6px 8px" />
                </div>
                <button class="btn-mini" onclick="_gedSalvarEtapa('${et.id}','${tipo}')" style="flex-shrink:0">&#128190;</button>
                ${!et.fixo ? `<button class="btn-mini btn-mini-danger" onclick="_gedExcluirEtapa('${et.id}','${tipo}','${escHtml(et.nome)}')" style="flex-shrink:0">&#x2715;</button>` : '<span style="width:50px"></span>'}
              </div>
              ${tipo==='exec' ? `
              <!-- Linha 2: datas (exec) -->
              <div style="display:grid;grid-template-columns:1fr 80px 1fr 1fr;gap:6px;margin-left:28px">
                <div>
                  <div style="font-size:10px;color:var(--tx2);margin-bottom:2px">Início previsto</div>
                  <input type="date" value="${et.data_inicio_prev||''}" id="ged-ini-prev-${et.id}" style="width:100%;padding:5px 8px;font-size:13px" />
                </div>
                <div>
                  <div style="font-size:10px;color:var(--tx2);margin-bottom:2px">Duração (d)</div>
                  <input type="number" min="1" max="999" value="${et.duracao_prev_dias||''}" id="ged-dur-${et.id}" style="width:100%;padding:5px 8px;font-size:13px" placeholder="dias" />
                </div>
                <div>
                  <div style="font-size:10px;color:var(--tx2);margin-bottom:2px">Início real</div>
                  <input type="date" value="${et.data_inicio||''}" id="ged-ini-${et.id}" style="width:100%;padding:5px 8px;font-size:13px" />
                </div>
                <div>
                  <div style="font-size:10px;color:var(--tx2);margin-bottom:2px">Fim real</div>
                  <input type="date" value="${et.data_fim||''}" id="ged-fim-${et.id}" style="width:100%;padding:5px 8px;font-size:13px" />
                </div>
              </div>` : `
              <!-- Linha 2: prazo (plan) -->
              <div style="display:flex;align-items:center;gap:8px;margin-left:28px;margin-top:6px">
                <span style="font-size:11px;color:var(--tx2);flex-shrink:0">Prazo</span>
                <input type="date" value="${et.prazo||''}" id="ged-prazo-${et.id}" style="max-width:180px;padding:5px 8px;font-size:13px" />
              </div>`}
            </div>`).join('')}
        </div>
        <button class="btn btn-sec" style="margin-top:12px" onclick="_gedAdicionarEtapa('${tipo}')">+ Adicionar etapa</button>
        <div style="display:flex;justify-content:flex-end;margin-top:18px">
          <button class="btn" onclick="_fecharModalGerenciar()">Fechar</button>
        </div>
      </div>
    </div>`;
  _gedRestaurarDrafts();
}

function _fecharModalGerenciar() {
  _gedCapturarDrafts();
  document.getElementById('prj-modal-root').innerHTML = '';
  abrirFichaProjeto(_fichaProj.id, _fichaAba);
}

// Captura valores não salvos das linhas do modal Gerenciar Etapas
function _gedCapturarDrafts() {
  document.querySelectorAll('[id^="ged-row-"]').forEach(row => {
    const id = row.id.replace('ged-row-', '');
    const g = suf => document.getElementById('ged-' + suf + '-' + id)?.value;
    _gedDrafts[id] = {
      nome: g('nome'), prazo: g('prazo'), peso: g('peso'),
      iniPrev: g('ini-prev'), dur: g('dur'), ini: g('ini'), fim: g('fim')
    };
  });
}

// Restaura rascunhos nas linhas (consumo único)
function _gedRestaurarDrafts() {
  for (const id in _gedDrafts) {
    const d = _gedDrafts[id];
    const set = (suf, v) => { const el = document.getElementById('ged-' + suf + '-' + id); if (el && v != null && v !== '') el.value = v; };
    set('nome', d.nome); set('prazo', d.prazo); set('peso', d.peso);
    set('ini-prev', d.iniPrev); set('dur', d.dur); set('ini', d.ini); set('fim', d.fim);
  }
  _gedDrafts = {};
}

async function _gedSalvarEtapa(id, tipo) {
  const nome  = document.getElementById('ged-nome-'+id)?.value.trim();
  const peso  = +(document.getElementById('ged-peso-'+id)?.value)||1;
  if (!nome) { alert('Informe o nome.'); return; }
  if (typeof DataValida !== 'undefined' && !DataValida.checarTodas(document.getElementById('ged-row-'+id))) return;
  const campos = { nome, peso_projeto: peso };
  if (tipo === 'exec') {
    campos.data_inicio_prev  = document.getElementById('ged-ini-prev-'+id)?.value || null;
    campos.duracao_prev_dias = +(document.getElementById('ged-dur-'+id)?.value) || null;
    if (campos.data_inicio_prev && campos.duracao_prev_dias) {
      const d = new Date(campos.data_inicio_prev+'T00:00:00');
      d.setDate(d.getDate() + campos.duracao_prev_dias);
      campos.data_fim_prev = d.toISOString().slice(0,10);
    } else { campos.data_fim_prev = null; }
    campos.data_inicio = document.getElementById('ged-ini-'+id)?.value || null;
    campos.data_fim    = document.getElementById('ged-fim-'+id)?.value || null;
  } else {
    campos.prazo = document.getElementById('ged-prazo-'+id)?.value || null;
  }
  try {
    const fn = tipo === 'exec' ? prjExecEtapaAtualizar : prjEtapaAtualizar;
    await fn(id, campos);
    delete _gedDrafts[id];
    const btn = document.querySelector(`#ged-row-${id} button`);
    if (btn) { btn.textContent='✓'; setTimeout(()=>btn.textContent='💾',1200); }
  } catch(e) { alert('Erro: '+e.message); }
}

async function _gedExcluirEtapa(id, tipo, nome) {
  if (!confirm(`Excluir etapa "${nome}"?`)) return;
  const fn = tipo === 'exec' ? prjExecEtapaExcluir : prjEtapaExcluir;
  try {
    await fn(id);
    document.getElementById('ged-row-'+id)?.remove();
    // Renumera as ordens restantes para eliminar buracos
    await _gedRenumerar(tipo, id);
  }
  catch(e) { alert('Erro: '+e.message); }
}

// Renumera sequencialmente as etapas restantes (1, 2, 3...) no banco
async function _gedRenumerar(tipo, idExcluido) {
  const lista = (tipo === 'exec' ? _fichaProj.projeto_exec_etapas : _fichaProj.projeto_etapas) || [];
  const restantes = lista.filter(e => e.id !== idExcluido).sort((a,b) => a.ordem - b.ordem);
  const fnAtualizar = tipo === 'exec' ? prjExecEtapaAtualizar : prjEtapaAtualizar;
  for (let i = 0; i < restantes.length; i++) {
    const novaOrdem = i + 1;
    if (restantes[i].ordem !== novaOrdem) {
      await fnAtualizar(restantes[i].id, { ordem: novaOrdem });
      restantes[i].ordem = novaOrdem;
    }
  }
  // Atualiza cache local removendo a excluída
  if (tipo === 'exec') _fichaProj.projeto_exec_etapas = restantes;
  else _fichaProj.projeto_etapas = restantes;
}

async function _gedAdicionarEtapa(tipo) {
  const etapas = tipo==='exec' ? (_fichaProj.projeto_exec_etapas||[]) : (_fichaProj.projeto_etapas||[]);
  const conclusao = etapas.find(e=>e.fixo);
  const ordem = conclusao ? conclusao.ordem : Math.max(...etapas.map(e=>e.ordem),0)+1;
  if (conclusao) {
    const fn = tipo==='exec' ? prjExecEtapaAtualizar : prjEtapaAtualizar;
    await fn(conclusao.id, {ordem: ordem+1});
  }
  const fn = tipo==='exec' ? prjExecEtapaCriar : prjEtapaCriar;
  try {
    await fn({ projeto_id:_fichaProj.id, nome:'Nova etapa', ordem, peso_projeto:1, status:'pendente' });
    _fichaProj = await prjBuscar(_fichaProj.id);
    _abrirModalGerenciarEtapas(tipo);
  } catch(e) { alert('Erro: '+e.message); }
}

// ── Modal editar projeto ──
function _abrirModalEditarProjeto() {
  const p = _fichaProj;
  // Restaura rascunho se houver (fechou sem salvar antes)
  const d = _editProjDraft && _editProjDraft.projId === p.id ? _editProjDraft : null;
  document.getElementById('prj-modal-root').innerHTML = `
    <div class="prj-overlay" onclick="if(event.target===this)_fecharModalEditarProjeto()">
      <div class="prj-modal" style="max-width:500px">
        <div class="prj-modal-head">
          <h3>Editar Projeto</h3>
          <button class="btn-mini" onclick="_fecharModalEditarProjeto()">&#x2715;</button>
        </div>
        <div class="field"><label>Título *</label>
          <input id="ep-titulo" type="text" maxlength="120" value="${escHtml(d ? d.titulo : p.titulo)}" /></div>
        <div class="row2">
          <div class="field"><label>Setor</label>
            <select id="ep-setor">
              <option value="">— selecione —</option>
              ${SETORES_PROJETOS.map(s=>`<option value="${s}"${(d ? d.setor : p.setor)===s?' selected':''}>${s}</option>`).join('')}
            </select></div>
          <div class="field"><label>Prazo final</label>
            <input id="ep-prazo" type="date" value="${(d ? d.prazo : p.prazo_final)||''}" /></div>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
          <button class="btn btn-sec" onclick="_fecharModalEditarProjeto(true)">Cancelar</button>
          <button class="btn" onclick="_prjSalvarEdicao()">Salvar</button>
        </div>
      </div>
    </div>`;
}
function _fecharModalEditarProjeto(descartar) {
  if (descartar) {
    _editProjDraft = null;
  } else {
    // Preserva o que foi digitado para retomar ao reabrir
    const get = id => document.getElementById(id)?.value ?? '';
    const titulo = get('ep-titulo'), setor = get('ep-setor'), prazo = get('ep-prazo');
    const p = _fichaProj;
    const mudou = titulo !== (p?.titulo||'') || setor !== (p?.setor||'') || prazo !== (p?.prazo_final||'');
    _editProjDraft = mudou ? { projId: p.id, titulo, setor, prazo } : null;
  }
  document.getElementById('prj-modal-root').innerHTML='';
}
async function _prjSalvarEdicao() {
  const titulo = document.getElementById('ep-titulo').value.trim();
  if (!titulo) { alert('Informe o título.'); return; }
  if (typeof DataValida !== 'undefined' && !DataValida.checar('ep-prazo', 'Prazo final')) return;
  const prazo = document.getElementById('ep-prazo').value;
  const setor  = document.getElementById('ep-setor').value;
  try {
    await prjAtualizar(_fichaProj.id, { titulo, setor:setor||null, prazo_final:prazo||null });
    _editProjDraft = null;
    document.getElementById('prj-modal-root').innerHTML='';
    _fichaProj = await prjBuscar(_fichaProj.id);
    _renderFicha();
  } catch(e) { alert('Erro: '+e.message); }
}

function _prjNomeStatus(s) {
  return {pendente:'Pendente',em_andamento:'Em andamento',concluida:'Concluída',cancelada:'Cancelada'}[s]||s;
}
