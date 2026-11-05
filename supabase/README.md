# Migrations do Supabase

## Campos adicionais no formulário público

A migration `202611050002_visitor_service_details.sql` adiciona a data do culto e o consentimento de contato à tabela `visitors`. Os pedidos de oração ficam em `visitor_prayer_requests`, com RLS habilitado e leitura restrita aos perfis admin e pastoral. A Edge Function atualizada chama uma RPC privada; aplique essa migration antes de publicar a nova versão da função e do frontend.

As migrations ficam aqui em ordem cronológica (`YYYYMMDDHHMMSS_descricao.sql`). A migration inicial verifica se os nomes planejados já existem e aborta em caso de colisão; ela não apaga nem altera tabelas existentes.

## Aplicar ao projeto remoto

Depois de autenticar a CLI e vincular este projeto:

```sh
npx supabase login
npx supabase link --project-ref nalwqrzgwqjfakmxnraa
npm run db:push
```

O Supabase CLI usa uma sessão da conta para acessar a Management API. Não compartilhe token de acesso ou senha do banco no chat.

O primeiro admin precisa existir como usuário do Supabase Auth. Depois da migration, promova a conta pelo SQL Editor:

```sql
insert into public.profiles (id, display_name, role)
select id, 'Admin inicial', 'admin'
from auth.users
where email = 'TROQUE-PELO-EMAIL-DO-ADMIN'
on conflict (id) do update set role = 'admin', active = true;
```

## Edge Function pública

Faça deploy de `public-visitor-register` com `npm run functions:deploy:visitor`. O `config.toml` desativa a validação de JWT do gateway somente para esse endpoint público. A função não oferece leitura pública e usa a secret key disponível no runtime Supabase para chamar RPCs restritas.

Configure `VISITOR_ALLOWED_ORIGINS` com as origens exatas do app (localhost e domínio Vercel) e `VISITOR_IP_HASH_SECRET` com um segredo aleatório de pelo menos 32 caracteres, usando o painel de secrets da Edge Function ou `npx supabase secrets set`. Não salve esse segredo em arquivos versionados. A função combina honeypot, tempo mínimo de preenchimento, limite de 30 solicitações por IP por hora e HMAC do IP; o endereço IP bruto não é armazenado.

O runtime Supabase disponibiliza as chaves administrativas para Edge Functions. Nunca copie uma secret/service-role key para `.env.local`, variáveis `VITE_*`, código cliente ou GitHub.
