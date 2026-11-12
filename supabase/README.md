# Migrations do Supabase

## Permissões de visitantes

A migration `202611120002_admin_only_schedule_attendance.sql` restringe também a consulta de presenças e faltas aos administradores ativos. Team continua consultando escalas publicadas e suas funções, sem dados de presença ou contagem de faltas. Valide essa restrição com `node scripts/verify-attendance-permissions.mjs`.

A migration `202611120001_admin_only_visitor_edit_delete.sql` restringe a edição e a exclusão de visitantes a administradores, nas funções RPC e nas políticas RLS. O perfil `team` continua podendo cadastrar visitantes, visualizar os dados e salvar observações internas. Os dados da pessoa vinculada ao visitante também ficam protegidos contra alterações diretas; cadastrar uma decisão com o mesmo telefone preserva o nome do visitante para `team`.

Para ativar no banco remoto, aplique as migrations com `npm run db:push` e publique o frontend atualizado. Para verificar as permissões localmente, execute `node scripts/verify-visitor-permissions.mjs`.

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

## Perfis e permissoes

A migration 202611050003_two_role_access_model.sql substitui os perfis por apenas admin e team. Ela converte perfis existentes pastoral para team (sem elevar privilegios) e atualiza as politicas RLS. Admin pode gerenciar perfis e todos os registros. Team pode operar visitantes, decisoes e acompanhamentos, mas tem somente leitura em eventos e convites do Projeto Pertencer. O Dashboard e uma tela de consulta; nao possui operacoes de escrita. O frontend consulta o proprio perfil ativo e bloqueia contas sem role valido, enquanto RLS continua sendo a protecao efetiva no banco.

A migration 202611050004_visitor_service_gift_reports.sql cria o fechamento por culto: data, identificacao do culto, quantidade de mimos e usuario responsavel. Ela e separada das entregas individuais em gift_deliveries. Admin gerencia todos os fechamentos; team consulta e pode registrar/editar os proprios, sem excluir. Aplicar depois da migration de perfis de duas funcoes.

## Escalas do Ministério

A migration `202611060002_ministry_schedules_and_auth_profiles.sql` cria escalas por data e culto (domingo às 10h, domingo às 18h e quinta às 19h15), permitindo múltiplos voluntários por função e várias funções por pessoa. O perfil é ligado ao usuário de autenticação pelo ID; novos usuários Auth recebem perfil `team` automaticamente. O nome exibido vem de `public.profiles.display_name`; a equipe consulta escalas e sua próxima atribuição, enquanto somente admin cria, altera ou exclui escalas.

Perfis existentes são preservados; usuários Auth sem perfil recebem `team`. Para alterar o nome mostrado nas escalas, atualize `public.profiles.display_name` diretamente no banco. A relação com o login é feita pelo mesmo `id` de `auth.users`; atualize a página após mudar o nome para carregar o valor novo.

## Notificações push em segundo plano

A aba **Escala extra** usa as migrations `202611100001_extra_schedules.sql` e `202611100003_extra_schedule_members_and_time.sql`: título, data, horário, quantidade de membros necessários, equipe selecionada e observação opcional. Administradores cadastram e editam; membros ativos consultam. Ao salvar, a função `notify-extra-schedule` envia push somente aos membros selecionados que continuam ativos e possuem inscrições habilitadas. O aviso abre `/escala?tab=extra`. Se o envio falhar, o cadastro permanece salvo e o administrador pode usar **Notificar equipe** para tentar novamente. Cadastros antigos precisam ser editados para informar horário e equipe antes de notificar.

Para ativar essa funcionalidade no projeto Supabase vinculado, execute `npm run db:push` e `npx supabase functions deploy notify-extra-schedule`, usando os secrets VAPID e a lista `VISITOR_ALLOWED_ORIGINS` já configurados para as notificações existentes. Valide o banco localmente com `node scripts/verify-extra-schedules.mjs`.

A migration `202611100002_extra_schedule_delete.sql` habilita a exclusão das escalas extras somente para administradores. A exclusão das escalas comuns e extras exige confirmação dentro da página e só é informada como concluída quando o banco retorna o registro excluído.

As mensagens das três escalas usam o mesmo padrão em `_shared/schedule-notifications.ts`. Cultos e Projeto Pertencer notificam cada voluntário com suas próprias funções em um único aviso. Escalas extras informam nome e horário. Quando houver observação, o aviso acrescenta “Atenção: essa escala tem observação.” sem substituir a mensagem da atribuição. Para publicar todas as alterações, aplique `npm run db:push` e execute `npm run functions:deploy:notifications`.

A migration `202611060003_background_web_push.sql` cria as inscrições privadas por dispositivo e adiciona o estado de publicação das escalas. O cadastro público e o registro de novas decisões notificam somente perfis admin ativos que ativaram push; a publicação da escala notifica somente os voluntários atribuídos. Os avisos de visitante e decisão são genéricos e não incluem dados pessoais.

Configure `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` como secrets das Edge Functions do Supabase. A chave pública fica em `src/lib/push-config.ts` e pode ser distribuída ao navegador; a chave privada nunca deve ir ao frontend ou ao GitHub. Publique as funções com `npm run functions:deploy:notifications`. Os usuários precisam ativar as notificações no dispositivo. Em iPhone/iPad, o site precisa ser adicionado à Tela de Início para receber Web Push.
