// =============================================================
// pacote-itens — gera o pacote compacto do banco de itens (NÚCLEO)
// para os celulares: um único arquivo TSV compactado (gzip) no
// Storage (bucket privado "req-pacotes") + registro em req_meta.
//
// Quem pode chamar:
//   · usuário logado com acesso liberado (app: botão "Publicar pacote");
//   · o próprio banco (pg_net, req_pacote_publicar), com o cabeçalho x-pacote-chave
//     conferido em privado.segredos. Deploy com verify_jwt = false (autenticação própria).
// Formato de cada linha:  código \t descrição \t unidade
// =============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const BUCKET = "req-pacotes";
const PAGINA = 50000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pacote-chave",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function autorizado(req: Request, sb: ReturnType<typeof createClient>): Promise<boolean> {
  const chave = req.headers.get("x-pacote-chave") || "";
  if (chave) {                                       // chamado pelo banco (req_pacote_publicar)
    const { data } = await sb.rpc("req_pacote_chave_ok", { p_chave: chave });
    if (data === true) return true;
  }
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const usuario = createClient(URL_SB, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data, error } = await usuario.rpc("req_meu_acesso");
  return !error && data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);
  try {
    const sb = createClient(URL_SB, SERVICO, { auth: { persistSession: false } });
    if (!(await autorizado(req, sb))) return json({ erro: "sem acesso" }, 401);
    const inicio = Date.now();

    /* relógio ANTES de ler: o que mudar durante a geração chega na conferência leve */
    const ult = await sb.from("req_itens").select("atualizado_em").order("atualizado_em", { ascending: false }).limit(1);
    if (ult.error) throw new Error(ult.error.message);
    const marco = ult.data && ult.data[0] ? ult.data[0].atualizado_em : null;

    const partes: string[] = [];
    let apos = "", total = 0;
    for (;;) {
      const { data, error } = await sb.rpc("req_pacote_parte", { p_apos: apos, p_lim: PAGINA, p_escopo: "nucleo" });
      if (error) throw new Error(error.message);
      const n = data?.n || 0;
      if (!n) break;
      partes.push(data.tsv);
      total += n;
      apos = data.ultimo;
      if (n < PAGINA) break;
    }
    if (!total) return json({ erro: "núcleo vazio — nada a publicar" }, 409);

    const texto = partes.join("\n");
    const bruto = new TextEncoder().encode(texto);
    const gz = new Uint8Array(await new Response(new Blob([bruto]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());

    const versao = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const arquivo = `itens-nucleo-${versao}.tsv.gz`;
    const up = await sb.storage.from(BUCKET).upload(arquivo, gz, { contentType: "application/gzip", upsert: true, cacheControl: "31536000" });
    if (up.error) throw new Error("storage: " + up.error.message);

    const valor = { arquivo, versao, total, bytes: gz.byteLength, bytes_texto: bruto.byteLength, marco, gerado_em: new Date().toISOString() };
    const m = await sb.from("req_meta").upsert({ chave: "pacote", valor, atualizado_em: new Date().toISOString() });
    if (m.error) throw new Error("meta: " + m.error.message);

    /* faxina: guarda só o atual e o anterior (quem estiver baixando o anterior termina sem erro) */
    const lista = await sb.storage.from(BUCKET).list("", { limit: 100, sortBy: { column: "name", order: "desc" } });
    const velhos = (lista.data || []).map((o) => o.name).filter((n) => n.startsWith("itens-nucleo-") && n !== arquivo).slice(1);
    if (velhos.length) await sb.storage.from(BUCKET).remove(velhos);

    return json({ ok: true, ...valor, ms: Date.now() - inicio });
  } catch (e) {
    return json({ erro: String((e as Error)?.message || e) }, 500);
  }
});
