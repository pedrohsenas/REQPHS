/* ============================================================
   RDO → PDF vetorial no padrão do formulário Lar
   "Relatório Diário de Obra (RDO)" — FO 124 1454 005, rev. 00
   Gera tudo no navegador com pdf-lib (texto pesquisável, leve).
   Uso: const bytes = await RDOPDF.gerar({...})  → Uint8Array
   ============================================================ */
(function () {
  "use strict";
  const FORM = { numero: "FO 124 1454 005", emissao: "21/03/25", revisao: "", numRevisao: "00" };
  const LIBS = {
    pdflib:  "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
    fontkit: "https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js",
  };
  /* fontes métricas-Calibri do repositório (mesmas do PDF das Requisições) */
  const FONTES = {
    reg: ["../fontes/RQSans-Regular.ttf", "../RQSans-Regular.ttf"],
    neg: ["../fontes/RQSans-Bold.ttf", "../RQSans-Bold.ttf"],
  };
  const LOGO = ["../logo.png"];

  const carregarScript = (src) => new Promise((ok, erro) => {
    const s = document.createElement("script"); s.src = src; s.onload = ok;
    s.onerror = () => erro(new Error("sem acesso a " + src)); document.head.appendChild(s);
  });
  const lerPrimeiro = async (urls) => {
    for (const u of urls) { try { const r = await fetch(u); if (r.ok) return await r.arrayBuffer(); } catch { /* próxima */ } }
    return null;
  };
  let recursos = null;
  function carregarRecursos() {
    if (!recursos) recursos = (async () => {
      if (!window.PDFLib) await carregarScript(LIBS.pdflib);
      if (!window.fontkit) await carregarScript(LIBS.fontkit).catch(() => {});
      const [reg, neg, logo] = await Promise.all([lerPrimeiro(FONTES.reg), lerPrimeiro(FONTES.neg), lerPrimeiro(LOGO)]);
      return { reg, neg, logo };
    })().catch(e => { recursos = null; throw e; });
    return recursos;
  }

  /* reduz a foto para o PDF (≈1280 px, JPEG 0,78) */
  async function fotoParaPdf(blob) {
    let img;
    try { img = await createImageBitmap(blob); }
    catch { img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = URL.createObjectURL(blob); }); }
    const k = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const b = await new Promise(ok => c.toBlob(ok, "image/jpeg", 0.78));
    return new Uint8Array(await b.arrayBuffer());
  }

  async function gerar(d) {
    const rec = await carregarRecursos();
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const pdf = await PDFDocument.create();
    pdf.setTitle(`RDO nº ${d.numero} — ${d.projeto}`);
    pdf.setAuthor(d.responsavel || ""); pdf.setCreator("Projetos UIS 3"); pdf.setProducer("pdf-lib");

    let F, FB, padrao = false;
    if (rec.reg && rec.neg && window.fontkit) {
      pdf.registerFontkit(window.fontkit);
      F = await pdf.embedFont(rec.reg, { subset: true });
      FB = await pdf.embedFont(rec.neg, { subset: true });
    } else {
      F = await pdf.embedFont(StandardFonts.Helvetica); FB = await pdf.embedFont(StandardFonts.HelveticaBold); padrao = true;
    }
    /* fonte padrão só codifica Latin-1: troca o que não couber */
    const limpo = (t) => {
      t = String(t ?? "").replace(/\r/g, "").replace(/[−‒–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/\t/g, "  ");
      return padrao ? t.replace(/[^\x0A\x20-\x7E\xA0-\xFF]/g, "") : t.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}️]/gu, "");
    };

    /* ---------- geometria ---------- */
    const A4 = [595.28, 841.89];
    const ML = 16, MT = 18, MB = 18;
    const LARG = A4[0] - 2 * ML;
    const U = LARG / 780;                       // grade em "unidades" do modelo (780 de largura)
    const X = (u) => ML + u * U;
    const PRETO = rgb(0, 0, 0), CINZA_TXT = rgb(0.3, 0.3, 0.3);
    const BARRA = rgb(0.75, 0.75, 0.75), ROT = rgb(0.85, 0.85, 0.85), CLARO = rgb(0.93, 0.93, 0.93);
    const COR_ST = {
      "Concluído": { fill: rgb(0.573, 0.816, 0.314), txt: rgb(0.06, 0.24, 0.06) },
      "Andamento": { fill: rgb(0.855, 0.89, 0.953), txt: rgb(0.12, 0.22, 0.39) },
      "Parada":    { fill: rgb(1, 0, 0), txt: rgb(1, 1, 1) },
    };
    const statusDe = (p) => (+p || 0) <= 0 ? "Parada" : (+p >= 100 ? "Concluído" : "Andamento");
    const pctTxt = (p) => (Math.round((+p || 0) * 10) / 10).toFixed(1).replace(".", ",");

    let pag, y;                                   // y medido de cima para baixo
    const paginas = [];
    const novaPagina = () => { pag = pdf.addPage(A4); paginas.push(pag); y = MT; };
    const Y = (yy) => A4[1] - yy;
    const cabe = (h) => y + h <= A4[1] - MB;

    function quebrar(texto, fonte, tam, larg) {
      const linhas = [];
      for (const par of limpo(texto).split("\n")) {
        let atual = "";
        for (const pal of par.split(/ +/)) {
          let p = pal;
          while (fonte.widthOfTextAtSize(p, tam) > larg) {             // palavra maior que a linha
            let i = p.length; while (i > 1 && fonte.widthOfTextAtSize(p.slice(0, i), tam) > larg) i--;
            if (atual) { linhas.push(atual); atual = ""; }
            linhas.push(p.slice(0, i)); p = p.slice(i);
          }
          const t = atual ? atual + " " + p : p;
          if (fonte.widthOfTextAtSize(t, tam) <= larg) atual = t; else { linhas.push(atual); atual = p; }
        }
        linhas.push(atual);
      }
      return linhas;
    }
    /* célula com borda, fundo e texto (1+ linhas) */
    function celula(u0, u1, yy, h, txt = "", o = {}) {
      const x0 = X(u0), w = (u1 - u0) * U;
      if (o.fill) pag.drawRectangle({ x: x0, y: Y(yy + h), width: w, height: h, color: o.fill });
      if (o.borda !== false) pag.drawRectangle({ x: x0, y: Y(yy + h), width: w, height: h, borderColor: PRETO, borderWidth: 0.5 });
      if (txt === "" || txt == null) return;
      const fonte = o.bold ? FB : F, tam = o.size || 7.5, pad = 3;
      const linhas = Array.isArray(txt) ? txt.map(limpo) : (o.wrap ? quebrar(txt, fonte, tam, w - 2 * pad) : [limpo(txt)]);
      const lh = tam * 1.2;
      const altTxt = linhas.length * lh;
      let ty = o.topo ? yy + pad + tam * 0.85 : yy + (h - altTxt) / 2 + tam * 0.85;
      for (const l of linhas) {
        let tw = fonte.widthOfTextAtSize(l, tam);
        let s = tam;
        if (!o.wrap && tw > w - 2 * pad) { s = tam * (w - 2 * pad) / tw; tw = w - 2 * pad; }   // encolhe para caber
        const tx = o.align === "left" ? x0 + pad : o.align === "right" ? x0 + w - pad - tw : x0 + (w - tw) / 2;
        pag.drawText(l, { x: tx, y: Y(ty), size: s, font: fonte, color: o.cor || PRETO });
        ty += lh;
      }
    }
    const barra = (titulo, align = "left", h = 13) => { celula(0, 780, y, h, titulo, { fill: BARRA, bold: true, align, size: 7.5 }); y += h; };

    novaPagina();

    /* ---------- cabeçalho ---------- */
    const yh = y, h1 = 20, h2 = 12, h3 = 16, HC = h1 + h2 + h3;
    celula(0, 112, yh, HC);
    if (rec.logo) {
      try {
        const logo = await pdf.embedPng(rec.logo);
        const caixaW = 112 * U - 14, caixaH = HC - 8;
        const k = Math.min(caixaW / logo.width, caixaH / logo.height);
        const lw = logo.width * k, lh = logo.height * k;
        pag.drawImage(logo, { x: X(0) + (112 * U - lw) / 2, y: Y(yh + (HC + lh) / 2), width: lw, height: lh });
      } catch { celula(0, 112, yh, HC, "Lar", { bold: true, size: 18, borda: false, cor: rgb(0.9, 0.1, 0.25) }); }
    } else celula(0, 112, yh, HC, "Lar", { bold: true, size: 18, borda: false, cor: rgb(0.9, 0.1, 0.25) });
    celula(112, 538, yh, HC, "Relatório Diário de Obra (RDO)", { bold: true, size: 15 });
    celula(538, 685, yh, h1, ["Número", FORM.numero], { bold: true, size: 6.8 });
    celula(685, 780, yh, h1, "Página 1/1", { bold: true, size: 6.8 });   // reescrito no fim
    celula(538, 612, yh + h1, h2, "Emissão", { bold: true, size: 6.8 });
    celula(612, 685, yh + h1, h2, "Revisão", { bold: true, size: 6.8 });
    celula(685, 780, yh + h1, h2, "Número Revisão", { bold: true, size: 6.8 });
    celula(538, 612, yh + h1 + h2, h3, FORM.emissao, { bold: true, size: 7 });
    celula(612, 685, yh + h1 + h2, h3, FORM.revisao, { size: 7 });
    celula(685, 780, yh + h1 + h2, h3, FORM.numRevisao, { bold: true, size: 7 });
    const celPagina = { yh, h1 };
    y = yh + HC;

    /* ---------- identificação ---------- */
    let h = 16;
    celula(0, 112, y, h, "RDO n°", { fill: ROT, bold: true });
    celula(112, 210, y, h, String(d.numero ?? ""));
    celula(210, 305, y, h, "Prazo do Projeto (dias)", { fill: ROT, bold: true, size: 7 });
    celula(305, 360, y, h, String(d.prazo ?? ""));
    celula(360, 470, y, h, "Prazo Decorrido (dias)", { fill: ROT, bold: true, size: 7 });
    celula(470, 538, y, h, String(d.decorrido ?? ""));
    celula(538, 685, y, h, "Prazo a Vencer (dias)", { fill: ROT, bold: true, align: "left" });
    celula(685, 780, y, h, String(d.vencer ?? ""), { bold: true });
    y += h;
    const linhasProj = quebrar(d.projeto, F, 7.5, 426 * U - 6);
    h = Math.max(20, linhasProj.length * 9 + 6);
    celula(0, 112, y, h, "Projeto/Melhoria", { fill: ROT, bold: true });
    celula(112, 538, y, h, linhasProj, { align: "left", topo: true });
    celula(538, 685, y, h, "Data do Relatório", { fill: ROT, bold: true, align: "left" });
    celula(685, 780, y, h, dataBR(d.data), { align: "left" });
    y += h; h = 13;
    celula(0, 112, y, h, "Unidade", { fill: ROT, bold: true });
    celula(112, 538, y, h, d.unidade, { align: "left" });
    celula(538, 685, y, h, "Dia da Semana", { fill: ROT, bold: true, align: "left" });
    celula(685, 780, y, h, d.diaSemana, { bold: true, align: "left" });
    y += h;
    celula(0, 112, y, h, "Setor", { fill: ROT, bold: true });
    celula(112, 365, y, h, d.setor, { align: "left" });
    celula(365, 455, y, h, "Responsável", { fill: ROT, bold: true, align: "left" });
    celula(455, 780, y, h, d.responsavel, { align: "left" });
    y += h;

    /* ---------- clima ---------- */
    barra("Condição climática", "center");
    h = 12;
    celula(0, 240, y, h, "Período do dia", { fill: CLARO, bold: true });
    celula(240, 468, y, h, "Tempo", { fill: CLARO, bold: true, align: "left" });
    celula(468, 780, y, h, "Condição", { fill: CLARO, bold: true, align: "left" });
    y += h;
    for (const [k, nome] of [["manha", "Manhã"], ["tarde", "Tarde"]]) {
      const c = (d.clima && d.clima[k]) || {};
      celula(0, 240, y, h, nome); celula(240, 468, y, h, c.tempo || "", { align: "left" }); celula(468, 780, y, h, c.condicao || "", { align: "left" });
      y += h;
    }

    /* ---------- mão de obra e equipamentos ---------- */
    function contagem(titulo, lista, rotTotal) {
      barra(titulo);
      const itens = (lista && lista.length ? lista : [{ nome: "-", n: 0 }]);
      const larg = 620 / itens.length;
      const total = itens.reduce((s, m) => s + (+m.n || 0), 0);
      const hc = 13;
      itens.forEach((m, i) => {
        celula(i * larg, (i + 1) * larg, y, hc, m.nome, { bold: true, size: 7 });
        celula(i * larg, (i + 1) * larg, y + hc, hc, String(+m.n || 0));
      });
      celula(620, 780, y, hc, rotTotal, { fill: CLARO, bold: true, size: 7 });
      celula(620, 780, y + hc, hc, String(total), { fill: CLARO, bold: true });
      y += 2 * hc;
    }
    contagem("Mão de Obra", d.maoObra, "Total Mão de Obra Envolvida");
    contagem("Equipamentos", d.equipamentos, "Total Equipamentos Envolvidos");

    /* ---------- atividades ---------- */
    const ativs = d.atividades || [];
    const geral = ativs.length ? ativs.reduce((s, a) => s + (+a.pct || 0), 0) / ativs.length : 0;
    h = 13;
    celula(0, 585, y, h, "Atividades / Tarefas", { fill: BARRA, bold: true, align: "left" });
    celula(585, 620, y, h, "%", { fill: BARRA, bold: true });
    celula(620, 780, y, h, "Status", { fill: BARRA, bold: true, align: "left" });
    y += h;
    const stG = ativs.length ? statusDe(geral) : "-";
    celula(0, 585, y, h, "Avanço geral do projeto", { bold: true, align: "left" });
    celula(585, 620, y, h, ativs.length ? pctTxt(geral) : "-", { bold: true, size: 7 });
    celula(620, 780, y, h, stG, { bold: true, align: "left", fill: COR_ST[stG] && COR_ST[stG].fill, cor: COR_ST[stG] && COR_ST[stG].txt });
    y += h;
    ativs.forEach((a, i) => {
      const ls = quebrar(a.nome, F, 7.5, 563 * U - 6);
      const ha = Math.max(13, ls.length * 9 + 4);
      if (!cabe(ha)) { novaPagina(); }
      const st = statusDe(a.pct), c = COR_ST[st];
      celula(0, 22, y, ha, String(i + 1), { bold: true });
      celula(22, 585, y, ha, ls, { align: "left" });
      celula(585, 620, y, ha, pctTxt(a.pct), { size: 7 });
      celula(620, 780, y, ha, st, { bold: true, align: "left", fill: c.fill, cor: c.txt });
      y += ha;
    });

    /* ---------- ocorrências ---------- */
    if (!cabe(13 + 40)) novaPagina();
    barra("Ocorrências / Observações");
    const lsOc = quebrar(d.ocorrencias || "", F, 8, 758 * U - 8);
    const lh = 8 * 1.25;
    let iL = 0;
    do {                                         // texto longo continua na página seguinte
      const cabem = Math.max(1, Math.floor((A4[1] - MB - y - 8) / lh));
      const parte = lsOc.slice(iL, iL + cabem);
      const hb = Math.max(46, parte.length * lh + 8);
      celula(0, 22, y, hb, iL === 0 ? String(d.numero ?? "") : "", { bold: true });
      celula(22, 780, y, hb);
      parte.forEach((l, k) => pag.drawText(l, { x: X(22) + 4, y: Y(y + 4 + 8 * 0.85 + k * lh), size: 8, font: F, color: PRETO }));
      y += hb; iL += cabem;
      if (iL < lsOc.length) { novaPagina(); barra("Ocorrências / Observações (continuação)"); }
    } while (iL < lsOc.length);

    /* ---------- fotos (2 por linha) ---------- */
    const fotos = [];
    for (const f of d.fotos || []) {
      try { const img = await pdf.embedJpg(await fotoParaPdf(f.blob)); fotos.push({ img, legenda: limpo(f.legenda || "") }); }
      catch (e) { console.warn("foto ignorada no PDF:", e); }
    }
    const HASS = 14;                                 // linha "Assinatura Digital"
    if (fotos.length) {
      const GAP = 16 * U, PADV = 12;
      const colW = (LARG - 3 * GAP) / 2;
      const MAXH = 290;
      let iniBloco = null;
      const fecharBloco = () => { if (iniBloco != null) pag.drawRectangle({ x: X(0), y: Y(y), width: LARG, height: y - iniBloco, borderColor: PRETO, borderWidth: 0.5 }); iniBloco = null; };
      const abrirBloco = (titulo) => { barra(titulo); iniBloco = y; y += PADV; };
      if (!cabe(13 + 140)) novaPagina();
      abrirBloco("Fotos");
      for (let i = 0; i < fotos.length; i += 2) {
        const par = fotos.slice(i, i + 2);
        const sozinha = par.length === 1;
        const w = sozinha ? Math.min(LARG - 2 * GAP, colW * 1.45) : colW;
        const dims = par.map(f => { const k = Math.min(w / f.img.width, MAXH / f.img.height); return { w: f.img.width * k, h: f.img.height * k }; });
        const temLeg = par.some(f => f.legenda);
        const legLinhas = par.map(f => f.legenda ? quebrar(f.legenda, F, 7.5, w).slice(0, 3) : []);
        const hLeg = temLeg ? Math.max(...legLinhas.map(l => l.length)) * 9.5 + 4 : 0;
        const hl = Math.max(...dims.map(x => x.h)) + hLeg + PADV;
        if (!cabe(hl + (i + 2 >= fotos.length ? HASS : 0))) { fecharBloco(); novaPagina(); abrirBloco("Fotos"); }
        par.forEach((f, k) => {
          const cx = sozinha ? ML + LARG / 2 : ML + GAP + k * (colW + GAP) + colW / 2;
          const dm = dims[k];
          const off = (Math.max(...dims.map(x => x.h)) - dm.h) / 2;          // centraliza na vertical
          pag.drawImage(f.img, { x: cx - dm.w / 2, y: Y(y + off + dm.h), width: dm.w, height: dm.h });
          legLinhas[k].forEach((l, j) => {
            const tw = F.widthOfTextAtSize(l, 7.5);
            pag.drawText(l, { x: cx - tw / 2, y: Y(y + off + dm.h + 4 + 7.5 * 0.85 + j * 9.5), size: 7.5, font: F, color: CINZA_TXT });
          });
        });
        y += hl;
      }
      fecharBloco();
    }
    if (!cabe(HASS)) novaPagina();
    celula(0, 780, y, HASS, "Assinatura Digital:", { align: "left", size: 7 });
    y += HASS;

    /* ---------- "Página 1/N" no cabeçalho ---------- */
    if (paginas.length > 1) {
      const p1 = paginas[0];
      p1.drawRectangle({ x: X(685) + 0.6, y: Y(celPagina.yh + celPagina.h1) + 0.6, width: 95 * U - 1.2, height: celPagina.h1 - 1.2, color: rgb(1, 1, 1) });
      pag = p1; celula(685, 780, celPagina.yh, celPagina.h1, `Página 1/${paginas.length}`, { bold: true, size: 6.8, borda: false });
    }
    return pdf.save();
  }
  function dataBR(iso) { if (!iso) return ""; const [a, m, d] = String(iso).split("-"); return `${d}/${m}/${a}`; }

  window.RDOPDF = { gerar, carregarRecursos };
})();
