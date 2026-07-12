/* ============================================================
   Configuração da nuvem (Supabase)
   Use um projeto Supabase DEDICADO para as requisições
   (separado do painel de gestão, para isolar dados e evitar
   qualquer conflito ou sobrecarga entre os sistemas).
   Copie do painel do Supabase: Settings → API
   Deixe em branco para rodar 100% local.
   ============================================================ */
window.CONFIG_NUVEM = {
  url: "",       // ex.: "https://abcdefgh.supabase.co"  (do projeto NOVO)
  anonKey: "",   // chave "anon public" do projeto NOVO (pode ficar no site; a segurança vem do login + RLS)
};
