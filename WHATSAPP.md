# WhatsApp oficial (Cloud API da Meta)

Sem isto o sistema continua funcionando com os botões manuais e o compartilhamento do celular. Com isto ele passa a:
enviar promoção com imagem para cada cliente ou para todos, enviar o termo do plano, cobrar automaticamente no dia combinado e marcar o termo como aceito quando o cliente responde SIM ou NÃO.

## 1. Conta e número
1. Tenha uma conta no Meta Business (business.facebook.com).
2. Em developers.facebook.com crie um app do tipo Empresa e adicione o produto WhatsApp.
3. Adicione o número da borracharia e verifique por SMS ou ligação. O número normalmente não pode estar ativo no aplicativo comum do WhatsApp; confira no painel as opções que a Meta oferece hoje.

## 2. Dados para o `.env` e para o Render
- `WHATSAPP_PHONE_ID`: WhatsApp > Configuração da API > ID do número de telefone.
- `WHATSAPP_TOKEN`: token permanente. Em Configurações da empresa > Usuários do sistema, crie um usuário, atribua o app e gere o token com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`. O token temporário do painel expira em horas.
- `WHATSAPP_APP_SECRET`: Configurações do app > Básico > Chave secreta do app.
- `WHATSAPP_VERIFY_TOKEN`: um texto que você inventa (ex.: gere com `openssl rand -hex 16`).

## 3. Modelos de mensagem (WhatsApp > Gerenciador de modelos)
Idioma: Português (BR). Os nomes abaixo são os esperados pelo sistema.

**cobranca_pagamento** (categoria Utilidade)
Olá {{1}}, tudo bem? Hoje é o dia combinado para o pagamento de {{2}} referente a {{3}}. Chave PIX (CNPJ): {{4}}. Obrigado!

**termo_plano** (categoria Utilidade)
Olá {{1}}! Segue o termo do {{2}} da Rogério Pneus: valor de {{3}} por mês, com validade de 30 dias, incluindo {{4}}. Os serviços são limitados às quantidades do plano em cada período e o que não for usado não acumula. Você concorda? Responda SIM ou NÃO.

**promocao_rogerio** (categoria Marketing), cabeçalho do tipo Imagem
Olá, {{1}}! Temos uma novidade da Rogério Pneus para você: {{2}}. Responda esta mensagem para falar com a gente.

Exemplos de variáveis (a Meta pede ao criar): {{1}} João, {{2}} R$ 100,00 / Troca de pneus, etc. Os modelos só funcionam depois de aprovados.

## 4. Webhook (para o SIM/NÃO do termo)
Em WhatsApp > Configuração > Webhook: URL `https://SEU-SITE/webhook/whatsapp`, token de verificação igual ao `WHATSAPP_VERIFY_TOKEN`, e assine o campo `messages`.

## 5. Custos e regras
- A Meta cobra por mensagem entregue. Referência para o Brasil em 2026: Marketing em torno de R$ 0,31 a R$ 0,38; Utilidade em torno de R$ 0,04 a R$ 0,05. Os valores mudam; confira em developers.facebook.com/docs/whatsapp/pricing.
- Envie promoções só para quem aceitou receber. Mensagens para quem não autorizou geram denúncias e podem derrubar a qualidade ou bloquear o número.
- A cobrança automática roda a cada 30 minutos, entre 9h e 20h, e só funciona com o site ligado. No plano grátis do Render o site dorme; prefira o plano Starter.
- As imagens vão por link público: a promoção precisa ser enviada pelo site publicado (https), não pelo `localhost`.
