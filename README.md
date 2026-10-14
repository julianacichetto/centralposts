# Central de Posts HF Fórmulas

Gera os posts sozinha (textos com Claude + artes com Nano Banana), manda para você aprovar no WhatsApp e publica no Instagram (feed + story) às 8h.

**Rotina automática**
- **18h da véspera**: gera textos + artes do post de amanhã e manda no seu WhatsApp.
- **Você responde**: `SIM` (aprova) · `AJUSTAR: o que mudar` (refaz só o necessário) · `VER` (manda as artes de novo).
- **8h do dia**: publica o que foi aprovado. Se não aprovou, ele te avisa e publica na hora em que você responder `SIM`.

O painel (`/`) mostra o calendário, deixa editar textos, refazer artes, aprovar e publicar manualmente.

---

## Passo a passo para colocar no ar HOJE

> Para o post de **quarta 14/10 às 8h**, tudo precisa estar pronto até as **18h de hoje**. Se passar, gere pelo painel à noite (botão *Gerar textos e artes*).

### 1. Firebase (5 min)
1. No [console do Firebase](https://console.firebase.google.com), use o projeto que você já tem ou crie um.
2. Ative só o **Firestore** (plano gratuito Spark, sem upgrade). As imagens ficam no próprio Netlify (Netlify Blobs), não precisa do Storage.
3. *Configurações do projeto → Contas de serviço → Gerar nova chave privada*. Baixa um JSON.
4. Desse JSON você vai usar: `project_id`, `client_email`, `private_key`.

### 2. Gemini / Nano Banana (3 min)
1. Em [aistudio.google.com/apikey](https://aistudio.google.com/apikey), crie (ou use a do projeto do Veo) a chave.
2. O projeto precisa estar com **faturamento ativo** (geração de imagem pela API é paga).

### 3. Claude API (2 min)
1. Em [console.anthropic.com](https://console.anthropic.com) → *API Keys* → crie uma chave. Coloque créditos.

### 4. Instagram (15 min)
Requisitos: Instagram da HF como **conta profissional**, ligada a uma **Página do Facebook**.
1. No seu app da Meta (pode ser o mesmo do WhatsApp), adicione o produto **Instagram** (API com login do Facebook).
2. No **Gerenciador de Negócios → Usuários do sistema**, crie um usuário do sistema (admin), atribua a Página e a conta do Instagram a ele e **gere um token** com as permissões:
   `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management`.
   (Token de usuário do sistema não expira.) → isso é o `IG_TOKEN`.
3. Descubra o ID do Instagram: abra no navegador
   `https://graph.facebook.com/v23.0/me/accounts?fields=name,instagram_business_account&access_token=SEU_TOKEN`
   → o número em `instagram_business_account.id` é o `IG_USER_ID`.

### 5. WhatsApp (10 min)
Você já tem a Cloud API rodando no bot da HF. A Central usa o **mesmo número** para te mandar a aprovação.

**a) Modelo de mensagem** (necessário quando você não falou com o número nas últimas 24h):
WhatsApp Manager → *Modelos de mensagem* → criar:
- Nome: `aprovacao_post` · Categoria: **Utilidade** · Idioma: **Português (BR)**
- Cabeçalho: **Imagem**
- Corpo: `Post de {{1}} pronto para aprovação: {{2}}. Toque em Ver tudo para conferir as artes e a legenda.`
- Botões (resposta rápida): `Ver tudo` e `Aprovar`

> Enquanto o modelo não é aprovado pela Meta: mande um "oi" do seu celular para o número da HF antes das 18h. Isso abre a janela de 24h e a aprovação chega normalmente.

**b) Receber suas respostas.** Um app da Meta só tem um webhook, e o do seu número já aponta para o bot da HF. Então, no **webhook do bot existente**, encaminhe para a Central as mensagens que vêm do *seu* número (e o bot não responde a elas). Cole isto no início do handler POST do webhook do bot:

```js
// Encaminha as respostas de aprovação para a Central de Posts
const APROVADOR = "5519XXXXXXXXX"; // seu número pessoal, só dígitos
const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
if (msg?.from === APROVADOR) {
  await fetch("https://SEU-SITE-CENTRAL.netlify.app/webhook/whatsapp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return new Response("ok"); // o bot de atendimento ignora suas mensagens
}
```
*(Se o webhook do bot for uma rota do Next.js, troque o `return` pelo formato de resposta que ele já usa. Dá para pedir isso ao Claude Code no projeto do bot.)*
*(Alternativa: usar outro número/app só para a Central e apontar o webhook dele para `/webhook/whatsapp`, com o verify token `WA_VERIFY_TOKEN`.)*

### 6. Netlify (5 min)
1. Suba esta pasta num repositório do GitHub e crie o site no Netlify a partir dele (o Netlify instala as dependências sozinho).
2. Em *Site configuration → Environment variables*, cadastre:

| Variável | O que é |
| --- | --- |
| `SITE_URL` | Endereço do site, ex.: `https://central-hf.netlify.app` (sem barra no fim) |
| `PANEL_PASSWORD` | Senha do painel (você escolhe) |
| `INTERNAL_SECRET` | Qualquer texto longo aleatório |
| `FIREBASE_PROJECT_ID` | `project_id` do JSON |
| `FIREBASE_CLIENT_EMAIL` | `client_email` do JSON |
| `FIREBASE_PRIVATE_KEY` | `private_key` do JSON (cole inteiro, com `-----BEGIN…`) |
| `ANTHROPIC_API_KEY` | Chave da Claude API |
| `GEMINI_API_KEY` | Chave do Gemini |
| `IG_TOKEN` | Token do usuário do sistema |
| `IG_USER_ID` | ID da conta do Instagram |
| `WA_TOKEN` | Token do WhatsApp (o mesmo do bot) |
| `WA_PHONE_NUMBER_ID` | ID do número do WhatsApp (o mesmo do bot) |
| `WA_VERIFY_TOKEN` | Só se usar webhook próprio (alternativa do passo 5b) |

Opcionais: `META_APP_SECRET` (valida a assinatura do webhook), `GRAPH_VERSION` (padrão `v23.0`), `CLAUDE_MODEL` (padrão `claude-sonnet-5-5`), `GEMINI_IMAGE_MODEL` (padrão `gemini-nano-banana-2.1`), `WA_TEMPLATE` (padrão `aprovacao_post`).

3. Faça um novo deploy depois de cadastrar as variáveis.

### 7. Primeiro acesso (5 min)
1. Abra o site → digite a senha.
2. **Ajustes**: preencha o seu WhatsApp (ex.: `5519999999999`) e o @ do Instagram → *Salvar*. Se tiver um logo maior, envie (o atual é pequeno).
3. **Calendário** → *Importar calendário* (21 posts, 14/10 a 30/11).
4. **Teste agora**: abra o post de 14/10 → *Gerar textos e artes*. Em alguns minutos chega no seu WhatsApp. Responda `SIM`.
   Ele publica sozinho amanhã às 8h.

---

## Bom saber
- **Black Friday (27/11)** vem como *Precisa de info*: preencha a oferta nas notas e mude o status para *Rascunho*.
- Posts em **Rascunho** são gerados automaticamente às 18h da véspera. Mude para outro status se não quiser que gere.
- **Ajustes pelo WhatsApp** refazem só os slides afetados (ex.: `AJUSTAR: no slide 3 troca a foto por uma farmacêutica sorrindo`).
- **Custos aproximados por post**: centavos no Claude + uma imagem do Nano Banana por slide (carrossel = 5 + story).
- **Fotos reais**: os posts de bastidores ficam melhores com fotos de verdade. Por enquanto a IA gera a cena.
- Horários fixos em `netlify/functions/agenda-gerar.mjs` (18h) e `agenda-publicar.mjs` (8h), em UTC.

---

## E-mail marketing (aba "E-mails")

- **Envio**: Resend, saindo de `contato@hfformulas.com.br` (domínio verificado na Hostinger). Respostas dos clientes vão para `hfformulas@gmail.com`.
- **Calendário**: terças às 10h. Às 18h da véspera gera texto + capa e manda no Telegram (✅ Aprovar / ✏️ Ajustar, com link da prévia).
- **Aquecimento**: no máximo 1.300 e-mails por dia (Ajustes → limite). O restante sai sozinho no dia seguinte às 10h. Depois de 2–3 semanas, suba para 5.000.
- **Descadastro**: todo e-mail tem "Clique aqui para não receber mais" + botão de descadastro do Gmail. Quem sai nunca volta, nem reimportando a planilha.
- **Variáveis novas no Netlify**: `RESEND_API_KEY` (já cadastrada para os avisos) e opcionais `EMAIL_REMETENTE_MKT` (padrão `Grupo HF <contato@hfformulas.com.br>`) e `EMAIL_RESPOSTA` (padrão `hfformulas@gmail.com`).
