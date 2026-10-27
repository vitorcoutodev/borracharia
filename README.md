# Sistema da Borracharia

Node.js + Express + MongoDB. Clientes, veículos, atendimentos, cobranças (com WhatsApp), planos de 30 dias, promoções e login.

## Rodar no computador
1. Instale o Node 18+.
2. `npm install`
3. Copie `.env.example` para `.env` e preencha (string do MongoDB Atlas, segredo, usuário e senha do admin).
4. `npm start` e abra http://localhost:3000

## Estrutura
- `server.js` – rotas e regras do sistema
- `models.js` – coleções do MongoDB
- `views/` – telas (EJS)
- `public/` – CSS e JS do navegador

## Senha esquecida
Troque `ADMIN_PASS` (no `.env` ou no painel do Render) e reinicie. A senha do admin é atualizada na inicialização.
