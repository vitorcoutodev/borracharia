require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const sharp = require('sharp');
const wa = require('./whatsapp');
const { Usuario, Plano, Cliente, Atendimento, Imagem, Promocao } = require('./models');

const { MONGODB_URI, SESSION_SECRET, ADMIN_USER, ADMIN_PASS } = process.env;
const PROD = process.env.NODE_ENV === 'production';
const NOME = 'Rogério Pneus';
const SUBTITULO = 'Rogério Pneus Rodas Personalizadas';
const PIX = process.env.PIX_CHAVE || '60858425000168'; // CNPJ
const TPL = { promo: process.env.WA_TPL_PROMO || 'promocao_rogerio', cobranca: process.env.WA_TPL_COBRANCA || 'cobranca_pagamento', termo: process.env.WA_TPL_TERMO || 'termo_plano' };
const baseUrl = (req) => `${req.protocol}://${req.get('host')}`;
const siteUrl = (req) => (process.env.SITE_URL || baseUrl(req)).replace(/\/$/, ''); // links em e-mails: use SITE_URL (evita Host falso)
async function enviarEmail(para, assunto, html) { // API por HTTPS (o Render grátis bloqueia SMTP)
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'Rogério Pneus <onboarding@resend.dev>', to: [para], subject: assunto, html }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
const DIAS_AVISO = 5;

if (!MONGODB_URI || !SESSION_SECRET) {
  console.error('Faltam variáveis: MONGODB_URI e SESSION_SECRET (veja .env.example)');
  process.exit(1);
}

// ---------- utilidades ----------
const dinheiro = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const data = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function numero(v) {
  const s = String(v ?? '').trim();
  if (!s) return NaN;
  return s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
}
function waLink(tel, msg) {
  let n = String(tel || '').replace(/\D/g, '');
  if (n.length <= 11) n = '55' + n;
  return 'https://wa.me/' + n + (msg ? '?text=' + encodeURIComponent(msg) : '');
}
function inicioDoDia() { // meia-noite no horário de Brasília (UTC-3)
  const BR = 3 * 3600e3;
  return new Date(Math.floor((Date.now() - BR) / 86400e3) * 86400e3 + BR);
}
function statusPlano(c) {
  const p = c && c.plano;
  if (!p || !p.vencimento) return null;
  const dias = Math.ceil((new Date(p.vencimento) - Date.now()) / 86400e3);
  const tipo = dias < 0 ? 'vencido' : dias <= DIAS_AVISO ? 'vencendo' : 'ativo';
  return { tipo, dias };
}
const itensTexto = (itens) => (itens || []).map((i) => `${i.qtd} ${i.nome}`).join('\n');
function parseItens(txt) { // uma linha por item: "3 Conserto"
  return String(txt || '').split('\n').map((l) => l.match(/^\s*(\d{1,2})\s*(?:x|×)?\s+(.+?)\s*$/i))
    .filter(Boolean).map((m) => ({ qtd: Number(m[1]), nome: m[2].slice(0, 60) })).slice(0, 15);
}
// saldo do plano do cliente no período atual (null se não tem plano ativo)
async function saldoPlano(c) {
  const p = c.plano && c.plano.plano;
  if (!p || !p.itens || !c.plano.vencimento || new Date(c.plano.vencimento) < new Date()) return null;
  const usos = await Atendimento.aggregate([
    { $match: { cliente: c._id, usoPlano: { $type: 'string', $ne: '' }, createdAt: { $gte: c.plano.inicio } } },
    { $group: { _id: '$usoPlano', n: { $sum: 1 } } },
  ]);
  const mapa = Object.fromEntries(usos.map((u) => [u._id, u.n]));
  return p.itens.map((i) => ({ nome: i.nome, total: i.qtd, usado: mapa[i.nome] || 0, resta: Math.max(0, i.qtd - (mapa[i.nome] || 0)) }));
}
const flash = (req, tipo, texto) => { req.session.flash = { tipo, texto }; };

// ---- upload de imagens (guardadas no MongoDB, reduzidas para ~1280px)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
const receberFoto = (campo, voltar) => (req, res, next) => upload.single(campo)(req, res, (err) => {
  if (err) { flash(req, 'erro', 'Não foi possível enviar a imagem (máximo 12 MB).'); return res.redirect(voltar); }
  next();
});
async function salvarImagem(file, publica) { // devolve o id ou null; lança erro se não for imagem válida
  if (!file) return null;
  const dados = await sharp(file.buffer).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  return (await Imagem.create({ dados, publica }))._id;
}

// ---------- banco ----------
// Uma única conexão, usada pelo app e pelas sessões
const conexao = mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
conexao.catch(() => {}); // o erro é tratado em iniciar()
process.on('unhandledRejection', (e) => { console.error('Erro:', e && e.message ? e.message : e); process.exit(1); });

// ---------- app ----------
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1); // Render/Railway ficam atrás de proxy HTTPS

app.use(helmet({
  contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null } },
}));
// ---------- webhook do WhatsApp: cliente responde SIM/NÃO ao termo ----------
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
app.get('/webhook/whatsapp', (req, res) => {
  const tk = process.env.WHATSAPP_VERIFY_TOKEN;
  const ok = req.query['hub.mode'] === 'subscribe' && tk && req.query['hub.verify_token'] === tk;
  res.status(ok ? 200 : 403).send(ok ? String(req.query['hub.challenge']) : 'erro');
});
app.post('/webhook/whatsapp', express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }), (req, res) => {
  const seg = process.env.WHATSAPP_APP_SECRET;
  const esperado = seg ? 'sha256=' + crypto.createHmac('sha256', seg).update(req.rawBody || '').digest('hex') : '';
  const recebido = String(req.get('x-hub-signature-256') || '');
  if (!esperado || esperado.length !== recebido.length || !crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido))) return res.sendStatus(403);
  res.sendStatus(200);
  processarRespostas(req.body).catch((e) => console.error('Webhook:', e.message));
});
async function processarRespostas(body) {
  for (const ent of (body && body.entry) || []) for (const ch of ent.changes || []) for (const m of (ch.value && ch.value.messages) || []) {
    const t = semAcento(m.type === 'text' ? m.text.body : m.type === 'button' ? m.button.text : '');
    const st = /^(SIM|S|CONCORDO|ACEITO)\b/.test(t) ? 'aceito' : /^(NAO|N|RECUSO)\b/.test(t) ? 'recusado' : null;
    if (!st) continue;
    const fim = String(m.from).slice(-8); // compara os 8 últimos dígitos (o 9 inicial varia)
    const c = (await Cliente.find({ 'plano.plano': { $exists: true } })).find((x) => x.telefone.replace(/\D/g, '').slice(-8) === fim);
    if (c) { c.plano.termo = st; await c.save(); }
  }
}

app.get('/health', (req, res) => res.type('text').send('ok')); // para monitoramento, sem sessão
app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use((req, res, next) => { req.body = req.body || {}; next(); });
app.use(express.static(path.join(__dirname, 'public'), { maxAge: PROD ? '1d' : 0 }));

// valores padrão para qualquer tela (a página de erro funciona mesmo se a sessão/banco falhar)
app.use((req, res, next) => {
  Object.assign(res.locals, { nomeSistema: NOME, titulo: '', usuario: null, flash: null, csrf: '', rota: req.path, dinheiro, data, waLink, statusPlano, pix: PIX, waApi: wa.ativo(), subtitulo: SUBTITULO, itensTexto });
  next();
});

app.use(session({
  name: 'borracharia.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  store: MongoStore.create({ clientPromise: conexao.then((m) => m.connection.getClient()), ttl: 2 * 60 * 60 }),
  cookie: { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 2 * 60 * 60 * 1000 },
}));

// variáveis disponíveis em todas as telas + proteção CSRF
app.use((req, res, next) => {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  Object.assign(res.locals, {
    csrf: req.session.csrf, nomeSistema: NOME, rota: req.path, titulo: '',
    usuario: req.session.usuario || null,
    flash: req.session.flash || null,
    dinheiro, data, waLink, statusPlano, pix: PIX, waApi: wa.ativo(), subtitulo: SUBTITULO, itensTexto,
  });
  delete req.session.flash;
  if (req.method === 'POST') {
    const t = (req.body && req.body._csrf) || req.query._csrf; // multipart envia o token na URL
    const ok = typeof t === 'string' && t.length === req.session.csrf.length &&
      crypto.timingSafeEqual(Buffer.from(t), Buffer.from(req.session.csrf));
    if (!ok) return res.status(403).render('erro', { titulo: 'Erro', msg: 'Sessão expirada. Volte e tente de novo.' });
  }
  next();
});

app.param('id', (req, res, next, id) => {
  if (mongoose.isValidObjectId(id)) return next();
  res.status(404).render('erro', { titulo: 'Erro', msg: 'Página não encontrada.' });
});

// ---------- login ----------
const limiteLogin = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).render('login', { titulo: 'Entrar', erro: 'Muitas tentativas. Aguarde 15 minutos.' }) });
const DUMMY_HASH = bcrypt.hashSync('x', 10);

app.get('/login', (req, res) => {
  if (req.session.usuario) return res.redirect('/');
  res.render('login', { titulo: 'Entrar', erro: null });
});
app.post('/login', limiteLogin, ah(async (req, res, next) => {
  const u = await Usuario.findOne({ usuario: String(req.body.usuario || '').trim().toLowerCase() });
  const ok = await bcrypt.compare(String(req.body.senha || ''), u ? u.senhaHash : DUMMY_HASH);
  if (!u || !ok) return res.status(401).render('login', { titulo: 'Entrar', erro: 'Usuário ou senha incorretos.' });
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.usuario = u.usuario;
    res.redirect('/');
  });
}));
app.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

app.get('/img/:id', ah(async (req, res) => {
  const img = await Imagem.findById(req.params.id);
  if (!img || (!img.publica && !req.session.usuario)) return res.sendStatus(404);
  res.type('jpeg').set('Cache-Control', img.publica ? 'public, max-age=86400' : 'private, no-store').send(img.dados);
}));
app.get('/p/:id', ah(async (req, res) => { // página que o cliente abre pelo link do WhatsApp
  const promo = await Promocao.findById(req.params.id);
  if (!promo) return res.status(404).render('erro', { titulo: 'Erro', msg: 'Promoção não encontrada.' });
  res.render('promo-publica', { titulo: 'Promoção', promo, base: `${req.protocol}://${req.get('host')}` });
}));

// ---------- esqueci a senha (link por e-mail, vale 30 minutos) ----------
const limiteReset = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).render('erro', { titulo: 'Erro', msg: 'Muitas tentativas. Tente de novo em 1 hora.' }) });
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
app.get('/esqueci', (req, res) => res.render('esqueci', { titulo: 'Esqueci a senha' }));
app.post('/esqueci', limiteReset, ah(async (req, res) => {
  const u = await Usuario.findOne({ usuario: String(req.body.usuario || '').trim().toLowerCase() });
  if (u && u.email && process.env.RESEND_API_KEY) {
    const token = crypto.randomBytes(32).toString('hex');
    u.resetHash = hashToken(token); u.resetExpira = new Date(Date.now() + 30 * 60 * 1000); await u.save();
    try {
      await enviarEmail(u.email, `${NOME}: redefinir senha`, `<p>Para criar uma nova senha, abra o link (vale por 30 minutos):</p><p><a href="${siteUrl(req)}/redefinir/${token}">Redefinir senha</a></p><p>Se não foi você, ignore este e-mail.</p>`);
    } catch (e) { console.error('E-mail de redefinição:', e.message); }
  }
  flash(req, 'ok', 'Se o usuário existir, enviamos um link para o e-mail cadastrado.'); // mesma resposta sempre
  res.redirect('/login');
}));
const buscarReset = (token) => Usuario.findOne({ resetHash: hashToken(String(token)), resetExpira: { $gt: new Date() } });
app.get('/redefinir/:token', ah(async (req, res) => {
  if (!(await buscarReset(req.params.token))) return res.status(400).render('erro', { titulo: 'Erro', msg: 'Link inválido ou expirado. Peça um novo.' });
  res.render('redefinir', { titulo: 'Nova senha', erro: null });
}));
app.post('/redefinir/:token', ah(async (req, res) => {
  const u = await buscarReset(req.params.token);
  if (!u) return res.status(400).render('erro', { titulo: 'Erro', msg: 'Link inválido ou expirado. Peça um novo.' });
  const { senha, confirma } = req.body;
  const erro = !senha || senha.length < 10 ? 'Use pelo menos 10 caracteres.' : senha !== confirma ? 'As senhas não conferem.' : null;
  if (erro) return res.render('redefinir', { titulo: 'Nova senha', erro });
  u.senhaHash = await bcrypt.hash(senha, 12); u.resetHash = undefined; u.resetExpira = undefined; await u.save();
  flash(req, 'ok', 'Senha alterada. Entre com a nova senha.');
  res.redirect('/login');
}));

// tudo abaixo exige login
app.use((req, res, next) => {
  if (!req.session.usuario) return res.redirect('/login');
  res.set('Cache-Control', 'no-store');
  next();
});

// ---------- tela inicial ----------
app.get('/', ah(async (req, res) => {
  const agora = new Date();
  const limite = new Date(Date.now() + DIAS_AVISO * 864e5);
  const fimDoDia = new Date(inicioDoDia().getTime() + 864e5);
  const [clientes, hoje, planosAtivos, receber, vencendo, vencidos, cobrarHoje, faturado] = await Promise.all([
    Cliente.countDocuments({ ativo: true }),
    Atendimento.countDocuments({ createdAt: { $gte: inicioDoDia() } }),
    Cliente.countDocuments({ ativo: true, 'plano.vencimento': { $gte: agora } }),
    Atendimento.aggregate([{ $match: { pago: false } }, { $group: { _id: null, total: { $sum: '$valor' } } }]),
    Cliente.find({ ativo: true, 'plano.vencimento': { $gte: agora, $lte: limite } }).populate('plano.plano').sort('plano.vencimento'),
    Cliente.find({ ativo: true, 'plano.vencimento': { $lt: agora } }).populate('plano.plano').sort('-plano.vencimento').limit(10),
    Atendimento.find({ pago: false, venceEm: { $lt: fimDoDia } }).populate('cliente').sort('venceEm'),
    Atendimento.aggregate([{ $match: { pago: true, pagoEm: { $gte: inicioDoDia() } } }, { $group: { _id: null, total: { $sum: '$valor' } } }]),
  ]);
  res.render('index', { titulo: 'Início', clientes, hoje, planosAtivos, receber: receber[0]?.total || 0, vencendo, vencidos, cobrarHoje, faturado: faturado[0]?.total || 0 });
}));

// ---------- clientes ----------
app.get('/clientes', ah(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filtro = req.query.inativos ? {} : { ativo: true };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filtro.$or = [{ nome: rx }, { telefone: rx }, { 'veiculos.placa': rx }];
  }
  const lista = await Cliente.find(filtro).populate('plano.plano').sort('nome').limit(100);
  res.render('clientes', { titulo: 'Clientes', lista, q, inativos: !!req.query.inativos });
}));

app.get('/clientes/novo', (req, res) => res.render('cliente-form', { titulo: 'Novo cliente', c: null, erro: null }));

app.post('/clientes', ah(async (req, res) => {
  const { nome, telefone, modelo, placa } = req.body;
  const c = new Cliente({ nome, telefone });
  if (String(modelo || '').trim()) c.veiculos.push({ modelo, placa });
  try { await c.save(); } catch (e) {
    if (e.name === 'ValidationError') return res.render('cliente-form', { titulo: 'Novo cliente', c: req.body, erro: 'Preencha nome e telefone.' });
    throw e;
  }
  flash(req, 'ok', 'Cliente cadastrado.');
  res.redirect('/clientes/' + c.id);
}));

app.get('/clientes/:id', ah(async (req, res) => {
  const c = await Cliente.findById(req.params.id).populate('plano.plano');
  if (!c) return res.status(404).render('erro', { titulo: 'Erro', msg: 'Cliente não encontrado.' });
  const [historico, planos] = await Promise.all([
    Atendimento.find({ cliente: c._id }).sort('-createdAt').limit(50),
    Plano.find().sort('ordem'),
  ]);
  const pendente = historico.filter((a) => !a.pago).reduce((s, a) => s + a.valor, 0);
  const saldo = await saldoPlano(c);
  const pl = c.plano && c.plano.plano;
  const termoMsg = pl ? `Olá ${c.nome}! Segue o termo do ${pl.nome} - ${NOME}.\n\nValor: ${dinheiro(pl.preco)} por mês (validade de ${pl.duracaoDias} dias).\nO plano inclui, por período:\n${pl.itens.map((i) => `- ${i.qtd}x ${i.nome}`).join('\n')}\n\nOs serviços são limitados às quantidades acima em cada período de ${pl.duracaoDias} dias. O que não for usado não acumula para o período seguinte, e o que passar do limite é cobrado à parte.\n\nVocê concorda? Responda SIM para concordar ou NÃO.` : '';
  res.render('cliente', { titulo: c.nome, c, historico, planos, pendente, saldo, termoMsg });
}));

app.get('/clientes/:id/editar', ah(async (req, res) => {
  const c = await Cliente.findById(req.params.id);
  if (!c) return res.status(404).render('erro', { titulo: 'Erro', msg: 'Cliente não encontrado.' });
  res.render('cliente-form', { titulo: 'Editar cliente', c, erro: null });
}));

app.post('/clientes/:id', ah(async (req, res) => {
  const c = await Cliente.findById(req.params.id);
  if (!c) return res.status(404).render('erro', { titulo: 'Erro', msg: 'Cliente não encontrado.' });
  c.nome = req.body.nome; c.telefone = req.body.telefone;
  try { await c.save(); } catch (e) {
    if (e.name === 'ValidationError') return res.render('cliente-form', { titulo: 'Editar cliente', c: { ...req.body, _id: c._id }, erro: 'Preencha nome e telefone.' });
    throw e;
  }
  flash(req, 'ok', 'Cadastro atualizado.');
  res.redirect('/clientes/' + c.id);
}));

app.post('/clientes/:id/ativar', ah(async (req, res) => {
  const c = await Cliente.findById(req.params.id);
  if (c) { c.ativo = !c.ativo; await c.save(); flash(req, 'ok', c.ativo ? 'Cliente reativado.' : 'Cliente desativado.'); }
  res.redirect('/clientes/' + req.params.id);
}));

app.post('/clientes/:id/veiculos', ah(async (req, res) => {
  const modelo = String(req.body.modelo || '').trim();
  if (!modelo) flash(req, 'erro', 'Informe o modelo do veículo.');
  else {
    await Cliente.updateOne({ _id: req.params.id }, { $push: { veiculos: { modelo, placa: req.body.placa } } });
    flash(req, 'ok', 'Veículo adicionado.');
  }
  res.redirect('/clientes/' + req.params.id);
}));

app.post('/clientes/:id/veiculos/:vid/remover', ah(async (req, res) => {
  await Cliente.updateOne({ _id: req.params.id }, { $pull: { veiculos: { _id: req.params.vid } } });
  flash(req, 'ok', 'Veículo removido.');
  res.redirect('/clientes/' + req.params.id);
}));

app.post('/clientes/:id/termo', ah(async (req, res) => {
  const st = ['aceito', 'recusado', 'pendente'].includes(req.body.status) ? req.body.status : null;
  if (st) await Cliente.updateOne({ _id: req.params.id, 'plano.plano': { $exists: true } }, { $set: { 'plano.termo': st } });
  flash(req, 'ok', 'Resposta do termo registrada.');
  res.redirect('/clientes/' + req.params.id);
}));

app.post('/clientes/:id/termo-api', ah(async (req, res) => {
  const c = await Cliente.findById(req.params.id).populate('plano.plano');
  const pl = c && c.plano && c.plano.plano;
  if (!pl || !wa.ativo()) { flash(req, 'erro', 'Cliente sem plano ou WhatsApp API não configurado.'); return res.redirect('/clientes/' + req.params.id); }
  try {
    await wa.template(c.telefone, TPL.termo, [c.nome, pl.nome, dinheiro(pl.preco), pl.itens.map((i) => `${i.qtd} ${i.nome}`).join(', ')]);
    flash(req, 'ok', 'Termo enviado pelo WhatsApp. A resposta SIM ou NÃO atualiza o status sozinha.');
  } catch (e) { flash(req, 'erro', 'Falha no envio: ' + e.message); }
  res.redirect('/clientes/' + req.params.id);
}));

app.post('/clientes/:id/plano', ah(async (req, res) => {
  const pid = String(req.body.plano || '');
  if (!pid) {
    await Cliente.updateOne({ _id: req.params.id }, { $unset: { plano: '' } });
    flash(req, 'ok', 'Plano removido.');
  } else {
    const p = mongoose.isValidObjectId(pid) && await Plano.findById(pid);
    if (!p) flash(req, 'erro', 'Plano inválido.');
    else {
      const inicio = new Date();
      const vencimento = new Date(inicio.getTime() + p.duracaoDias * 864e5);
      await Cliente.updateOne({ _id: req.params.id }, { $set: { plano: { plano: p._id, inicio, vencimento, termo: 'pendente' } } });
      flash(req, 'ok', `${p.nome} ativado até ${data(vencimento)}.`);
    }
  }
  res.redirect('/clientes/' + req.params.id);
}));

// ---------- atendimentos ----------
app.get('/atendimentos/novo', ah(async (req, res) => {
  const cid = String(req.query.cliente || '');
  if (mongoose.isValidObjectId(cid)) {
    const c = await Cliente.findById(cid).populate('plano.plano');
    if (c) return res.render('atendimento-novo', { titulo: 'Novo atendimento', c, saldo: await saldoPlano(c), resultados: null, q: '', erro: null, form: {} });
  }
  const q = String(req.query.q || '').trim();
  const filtro = { ativo: true };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filtro.$or = [{ nome: rx }, { telefone: rx }, { 'veiculos.placa': rx }];
  }
  const resultados = await Cliente.find(filtro).sort('nome').limit(30);
  res.render('atendimento-novo', { titulo: 'Novo atendimento', c: null, saldo: null, resultados, q, erro: null, form: {} });
}));

app.post('/atendimentos', receberFoto('foto', '/atendimentos/novo'), ah(async (req, res) => {
  const b = req.body;
  const c = mongoose.isValidObjectId(b.cliente) && await Cliente.findById(b.cliente).populate('plano.plano');
  if (!c) return res.redirect('/atendimentos/novo');
  const saldo = await saldoPlano(c);
  const uso = String(b.uso || '');
  const item = uso && saldo ? saldo.find((i) => i.nome === uso && i.resta > 0) : null;
  let valor = numero(b.valor);
  if (item && Number.isNaN(valor)) valor = 0;
  const pago = item ? true : b.pago === '1';
  const servico = String(b.servico || '').trim() || (item ? item.nome : '');
  const erro = uso && !item ? 'Esse item não tem mais saldo no plano.' : !servico ? 'Informe o serviço.' : !(valor >= 0) ? 'Informe um valor válido.' : null;
  if (erro) return res.render('atendimento-novo', { titulo: 'Novo atendimento', c, saldo, resultados: null, q: '', erro, form: b });
  const venceEm = !pago && /^\d{4}-\d{2}-\d{2}$/.test(b.venceEm || '') ? new Date(b.venceEm + 'T12:00:00-03:00') : undefined;
  let foto = null;
  try { foto = await salvarImagem(req.file, false); } catch (e) {
    return res.render('atendimento-novo', { titulo: 'Novo atendimento', c, saldo, resultados: null, q: '', erro: 'Não consegui ler a foto. Use JPG ou PNG.', form: b });
  }
  await Atendimento.create({
    cliente: c._id, servico, valor, pago, venceEm, foto, usoPlano: item ? item.nome : undefined,
    veiculo: b.veiculo, obs: b.obs,
    forma: item ? '' : ['pix', 'dinheiro', 'cartao', 'outro'].includes(b.forma) ? b.forma : '',
    pagoEm: pago ? new Date() : undefined,
  });
  flash(req, 'ok', item ? `Atendimento registrado no plano (${item.nome}: restam ${item.resta - 1}).` : pago ? 'Atendimento finalizado.' : 'Atendimento finalizado. Valor enviado para Cobranças.');
  res.redirect('/clientes/' + c.id);
}));

// ---------- cobranças ----------
app.post('/atendimentos/:id/foto', receberFoto('foto', '/clientes'), ah(async (req, res) => {
  const a = await Atendimento.findById(req.params.id);
  if (!a) return res.redirect('/clientes');
  try {
    const id = await salvarImagem(req.file, false);
    if (id && !a.foto) { a.foto = id; await a.save(); flash(req, 'ok', 'Foto anexada.'); }
  } catch (e) { flash(req, 'erro', 'Não consegui ler a foto. Use JPG ou PNG.'); }
  res.redirect('/clientes/' + a.cliente);
}));

app.get('/cobrancas', ah(async (req, res) => {
  const lista = await Atendimento.find({ pago: false }).populate('cliente').sort({ venceEm: 1, createdAt: 1 });
  const total = lista.reduce((s, a) => s + a.valor, 0);
  res.render('cobrancas', { titulo: 'Cobranças', lista, total });
}));

app.post('/atendimentos/:id/pagar', ah(async (req, res) => {
  const forma = ['pix', 'dinheiro', 'cartao', 'outro'].includes(req.body.forma) ? req.body.forma : 'outro';
  await Atendimento.updateOne({ _id: req.params.id }, { $set: { pago: true, pagoEm: new Date(), forma } });
  flash(req, 'ok', 'Pagamento registrado.');
  res.redirect(req.body.voltar === 'cliente' && mongoose.isValidObjectId(req.body.cliente) ? '/clientes/' + req.body.cliente : '/cobrancas');
}));

// ---------- planos ----------
app.get('/planos', ah(async (req, res) => {
  const planos = await Plano.find().sort('ordem');
  const contagem = await Cliente.aggregate([
    { $match: { ativo: true, 'plano.vencimento': { $gte: new Date() } } },
    { $group: { _id: '$plano.plano', n: { $sum: 1 } } },
  ]);
  const ativos = Object.fromEntries(contagem.map((x) => [String(x._id), x.n]));
  res.render('planos', { titulo: 'Planos', planos, ativos });
}));

app.post('/planos/:id', ah(async (req, res) => {
  const preco = numero(req.body.preco);
  const nome = String(req.body.nome || '').trim();
  if (!nome || !(preco >= 0)) flash(req, 'erro', 'Informe nome e valor válidos.');
  else {
    await Plano.updateOne({ _id: req.params.id }, { $set: { nome, preco, itens: parseItens(req.body.itens) } });
    flash(req, 'ok', 'Plano salvo.');
  }
  res.redirect('/planos');
}));

// ---------- promoções (texto + imagem, envio pelo WhatsApp) ----------
app.get('/promocao', ah(async (req, res) => {
  res.render('promocao', { titulo: 'Promoções', lista: await Promocao.find().sort('-createdAt').limit(10) });
}));
app.post('/promocao', receberFoto('imagem', '/promocao'), ah(async (req, res) => {
  const texto = String(req.body.texto || '').trim().slice(0, 1000);
  if (!texto) { flash(req, 'erro', 'Escreva o texto da promoção.'); return res.redirect('/promocao'); }
  let imagem = null;
  try { imagem = await salvarImagem(req.file, true); } catch (e) { flash(req, 'erro', 'Não consegui ler a imagem. Use JPG ou PNG.'); return res.redirect('/promocao'); }
  const promo = await Promocao.create({ texto, imagem });
  res.redirect('/promocao/' + promo.id);
}));
app.get('/promocao/:id', ah(async (req, res) => {
  const promo = await Promocao.findById(req.params.id);
  if (!promo) return res.status(404).render('erro', { titulo: 'Erro', msg: 'Promoção não encontrada.' });
  const url = `${req.protocol}://${req.get('host')}/p/${promo.id}`;
  res.render('promocao-ver', { titulo: 'Promoção', promo, url, lista: await Cliente.find({ ativo: true }).sort('nome') });
}));

async function enviarPromo(promo, clientes, base) {
  const url = promo.imagem ? `${base}/img/${promo.imagem}` : `${base}/logo.png`;
  for (const c of clientes) {
    try { await wa.template(c.telefone, TPL.promo, [c.nome.split(' ')[0], promo.texto], url); await Promocao.updateOne({ _id: promo._id }, { $inc: { 'envio.ok': 1 } }); }
    catch (e) { console.error('Promoção:', c.nome, e.message); await Promocao.updateOne({ _id: promo._id }, { $inc: { 'envio.falhas': 1 } }); }
    await new Promise((r) => setTimeout(r, 400));
  }
  await Promocao.updateOne({ _id: promo._id }, { $set: { 'envio.andamento': false } });
}
app.post('/promocao/:id/enviar/:cid', ah(async (req, res) => {
  const [promo, c] = await Promise.all([Promocao.findById(req.params.id), mongoose.isValidObjectId(req.params.cid) && Cliente.findById(req.params.cid)]);
  if (!promo || !c || !wa.ativo()) return res.redirect('/promocao');
  try {
    await wa.template(c.telefone, TPL.promo, [c.nome.split(' ')[0], promo.texto], promo.imagem ? `${baseUrl(req)}/img/${promo.imagem}` : `${baseUrl(req)}/logo.png`);
    flash(req, 'ok', `Enviado para ${c.nome}.`);
  } catch (e) { flash(req, 'erro', `Falha ao enviar para ${c.nome}: ${e.message}`); }
  res.redirect('/promocao/' + promo.id);
}));
app.post('/promocao/:id/enviar-todos', ah(async (req, res) => {
  const promo = await Promocao.findById(req.params.id);
  if (!promo || !wa.ativo()) return res.redirect('/promocao');
  if (promo.envio && promo.envio.andamento) { flash(req, 'erro', 'Já existe um envio em andamento.'); return res.redirect('/promocao/' + promo.id); }
  const clientes = await Cliente.find({ ativo: true }).sort('nome');
  promo.envio = { total: clientes.length, ok: 0, falhas: 0, andamento: true };
  await promo.save();
  enviarPromo(promo, clientes, baseUrl(req)).catch((e) => console.error('Envio em massa:', e.message)); // segue em segundo plano
  flash(req, 'ok', `Envio iniciado para ${clientes.length} clientes. Atualize a página para acompanhar.`);
  res.redirect('/promocao/' + promo.id);
}));

// ---------- cobrança automática (dia combinado, entre 9h e 20h) ----------
async function cobrarAutomatico() {
  if (!wa.ativo()) return;
  const hora = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }));
  if (hora < 9 || hora >= 20) return;
  const fim = new Date(inicioDoDia().getTime() + 864e5);
  for (const a of await Atendimento.find({ pago: false, venceEm: { $lt: fim }, avisadoEm: null }).populate('cliente').limit(50)) {
    if (!a.cliente) continue;
    try {
      await wa.template(a.cliente.telefone, TPL.cobranca, [a.cliente.nome, dinheiro(a.valor), a.servico, PIX]);
      a.avisadoEm = new Date(); await a.save();
    } catch (e) { console.error('Cobrança automática:', a.cliente.nome, e.message); }
  }
}

// ---------- erros ----------
app.use((req, res) => res.status(404).render('erro', { titulo: 'Erro', msg: 'Página não encontrada.' }));
app.use((err, req, res, next) => { // eslint-disable-line
  console.error(err);
  res.status(500).render('erro', { titulo: 'Erro', msg: 'Algo deu errado. Tente novamente.' });
});

// ---------- inicialização ----------
async function iniciar() {
  await conexao;
  const it = (nome, qtd) => ({ nome, qtd });
  const PADRAO = [
    { ordem: 1, nome: 'Plano Simples', preco: 70, itens: [it('Conserto', 3), it('Rodízio', 1)] },
    { ordem: 2, nome: 'Plano Top', preco: 100, itens: [it('Conserto', 5), it('Balanceamento', 1), it('Rodízio', 1), it('Alinhamento de roda', 1)] },
    { ordem: 3, nome: 'Plano Executivo', preco: 200, itens: [it('Balanceamento', 1), it('Rodízio', 1), it('Válvulas novas', 1), it('Socorro até 24 km', 1), it('Alinhamento de roda', 1)] },
  ];
  for (const d of PADRAO) { // cria os planos; só preenche os que ainda estão vazios (não sobrescreve edições)
    const p = await Plano.findOne({ ordem: d.ordem });
    if (!p) await Plano.create(d);
    else if (!p.itens.length && p.preco === 0) { Object.assign(p, d); await p.save(); }
  }
  // O admin é criado na primeira vez com ADMIN_USER/ADMIN_PASS. Depois a senha é a do banco (alterada por "esqueci a senha").
  // Para forçar uma senha nova pelo servidor: ADMIN_RESET_SENHA=sim (e remova depois).
  if (ADMIN_USER && ADMIN_PASS) {
    const nome = ADMIN_USER.trim().toLowerCase(), email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const u = await Usuario.findOne({ usuario: nome });
    if (!u) await Usuario.create({ usuario: nome, senhaHash: await bcrypt.hash(ADMIN_PASS, 12), email: email || undefined });
    else {
      if (process.env.ADMIN_RESET_SENHA === 'sim') u.senhaHash = await bcrypt.hash(ADMIN_PASS, 12);
      if (email) u.email = email;
      await u.save();
    }
  } else if ((await Usuario.countDocuments()) === 0) {
    console.warn('ATENÇÃO: nenhum usuário existe. Defina ADMIN_USER e ADMIN_PASS.');
  }
  const porta = process.env.PORT || 3000;
  app.listen(porta, () => console.log(`${NOME} rodando na porta ${porta}${wa.ativo() ? ' (WhatsApp API ativa)' : ''}`));
  setInterval(() => cobrarAutomatico().catch((e) => console.error(e.message)), 30 * 60 * 1000);
  setTimeout(() => cobrarAutomatico().catch((e) => console.error(e.message)), 60 * 1000);
}
iniciar().catch((e) => { console.error('Falha ao conectar no MongoDB. Confira MONGODB_URI, usuário/senha e o Network Access do Atlas.\nDetalhe:', e.message); process.exit(1); });
