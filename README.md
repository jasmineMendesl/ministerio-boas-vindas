# Projeto Pertencer

Aplicação mobile-first para o Ministério de Boas-Vindas. Inclui autenticação da equipe, quatro áreas internas e cadastro público de visitantes.

## Executar localmente

1. Instale Node.js 20 ou superior e execute `npm install`.
2. Copie `.env.example` para `.env.local` e configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. A variável legada `VITE_SUPABASE_ANON_KEY` também é aceita.
3. Execute `npm run dev`.

`.env.local` está ignorado pelo Git. Publishable Keys são próprias para o cliente com RLS habilitado. Não use secret/service-role keys em variáveis `VITE_*`, no frontend ou no GitHub.

## GitHub Pages

O workflow `.github/workflows/pages.yml` constrói e publica o site em pushes para `main` ou `master`. No GitHub:

1. Em **Settings → Pages**, escolha **GitHub Actions** como fonte de publicação.
2. Em **Settings → Secrets and variables → Actions → Variables**, crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. A Publishable Key será incorporada ao JavaScript público do site; nunca cadastre uma Secret Key ou `service_role` nessas variáveis.
3. Faça push para `main` ou `master` e acompanhe a execução em **Actions**.

O workflow define automaticamente o caminho-base do repositório. No GitHub Pages, as rotas usam hash para funcionar sem configuração de servidor; o QR Code público terá formato `https://<owner>.github.io/<repo>/#/visitante` para um site de projeto. Para um site de usuário/organização, o formato é `https://<owner>.github.io/#/visitante`.

## Supabase

A migration `202611050001_initial_schema.sql` foi aplicada ao projeto `ministerio-boas-vindas`; as tabelas e policies têm RLS. O secret `VISITOR_IP_HASH_SECRET` também foi configurado no projeto. Nenhum secret administrativo é usado no cliente.

Antes de publicar o formulário:

1. No **Supabase Dashboard → Edge Functions → Secrets**, configure `VISITOR_ALLOWED_ORIGINS` com a origem exata do GitHub Pages, por exemplo `https://<owner>.github.io` (sem caminho ou barra final). Para desenvolvimento local, inclua também `http://localhost:5173` e `http://127.0.0.1:5173`.
2. Publique a Edge Function com `npm run functions:deploy:visitor`.
3. Acesse `/#/visitante` no site publicado e valide o envio. A página só confirma o cadastro depois da resposta da função.

O runtime das Edge Functions recebe a chave administrativa no backend. Ela não deve ser copiada para `.env.local`, GitHub Actions ou código do navegador.

## Banco e verificações

Para aplicar migrations futuras, vincule a CLI ao projeto e rode `npm run db:push`. A migration inicial verifica colisões de nomes e aborta se as tabelas já existirem.

```sh
npm test
npm run test:db
npm run build
```
