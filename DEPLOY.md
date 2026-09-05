# Deploy — Performance das Redes Sociais

Este guia cobre as partes que só você pode fazer (criação de contas e apps
externos). O código já está pronto para plugar assim que você tiver essas
credenciais.

## 1. Testar localmente primeiro

1. Copie `.env.example` para `.env` e preencha pelo menos:
   - `PERFORMANCE_ACCESS_CODE` — uma senha sua para entrar na Performance e na Administração de Integrações.
2. Rode `npm start` e abra `http://localhost:4173`.
3. Clique em "Performance" → vai pedir login → entre com o código.
4. Clique em "Lançar números" e preencha a primeira semana manualmente pra ver o relatório funcionando de ponta a ponta (isso já funciona sem nenhuma integração).

## 2. Git + GitHub

O projeto ainda não é um repositório git. Depois que eu rodar `git init` e o
primeiro commit (próximo passo desta sessão), você precisa:
1. Criar um repositório vazio no seu GitHub.
2. Rodar `git remote add origin <url-do-seu-repo>` e `git push -u origin main`.

## 3. Hospedagem (Render — recomendado)

1. Crie uma conta em https://render.com e conecte seu GitHub.
2. "New Web Service" → selecione o repositório → Build command `npm install`, Start command `npm start`.
3. **Adicione um disco persistente** (Render → Disks) montado em `/opt/render/project/src/data` — sem isso, os arquivos JSON (incluindo os snapshots semanais) somem a cada novo deploy.
4. Em "Environment", cole todas as variáveis do seu `.env` (exceto `NODE_ENV`, que o Render já define). Defina `PUBLIC_BASE_URL` com a URL que o Render vai te dar (ex.: `https://performance-prleofelix.onrender.com`).
5. Depois do primeiro deploy, volte pra este chat com a URL pública — eu configuro a rotina agendada (`/schedule`, cron `0 13 * * 5`, sexta 10h de Brasília) apontando pro `POST /api/social/fetch` dessa URL, usando o `CRON_SECRET`.

## 4. Instagram — Meta for Developers

1. Acesse https://developers.facebook.com/apps → "Criar app" → tipo "Empresa".
2. Adicione o produto **"Instagram Graph API"** (via "Facebook Login for Business").
3. Em "Configurações básicas", copie o **App ID** e o **App Secret** → cole em `META_APP_ID` / `META_APP_SECRET`.
4. Em "Facebook Login" → "Configurações", adicione a URI de redirecionamento:
   `https://SEU-DOMINIO/api/integrations/instagram/callback`
5. Confirme que sua Página do Facebook está vinculada à conta @prleofelix do Instagram (Business/Creator) em Configurações da Página → Instagram.
6. Não precisa de App Review — como você é o dono/admin do app testando sua própria conta, o modo de desenvolvimento já é suficiente.
7. Com o app hospedado e as env vars configuradas, vá em Administração de Integrações → "Conectar Instagram".

## 5. YouTube — Google Cloud Console

1. Acesse https://console.cloud.google.com → crie um projeto novo.
2. Em "APIs e serviços" → "Biblioteca", ative:
   - **YouTube Data API v3**
   - **YouTube Analytics API**
3. Crie uma **API key** (APIs e serviços → Credenciais → Criar credenciais → Chave de API) → cole em `GOOGLE_API_KEY`.
4. Crie uma credencial **OAuth client ID**, tipo "Aplicativo da Web":
   - URI de redirecionamento autorizado: `https://SEU-DOMINIO/api/integrations/youtube/callback`
   - Copie o Client ID / Client Secret → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
5. Na tela de consentimento OAuth, adicione seu e-mail do Google (o mesmo do canal PrLeofelix) como usuário de teste, se o app estiver em modo de teste.
6. Com tudo hospedado, vá em Administração de Integrações → "Conectar YouTube".

**Lembrete importante:** impressões e CTR do YouTube (aba "Alcance" do Studio)
continuam sendo lançados manualmente pra sempre — é uma limitação confirmada
e permanente da API do Google, não uma etapa pendente de automação.

## 6. Depois de conectar

- O token do Instagram dura ~60 dias — a página de Administração de Integrações avisa quando estiver perto de expirar.
- Teste o botão "Buscar automaticamente" na Performance antes de confiar na rotina agendada.
- Confirme que a rotina de sexta-feira rodou olhando se a semana atual aparece preenchida no relatório no sábado de manhã.
