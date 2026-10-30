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
const { Usuario, Plano, Cliente, Atendimento } = require('./models');

const { MONGODB_URI, SESSION_SECRET, ADMIN_USER, ADMIN_PASS } = process.env;
const PROD = process.env.NODE_ENV === 'production';
const NOME = process.env.NOME_SISTEMA || 'Borracharia';
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
const flash = (req, tipo, texto) => { req.session.flash = { tipo, texto }; };

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
app.get('/health', (req, res) => res.type('text').send('ok')); // para monitoramento, sem sessão
app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use((req, res, next) => { req.body = req.body || {}; next(); });
app.use(express.static(path.join(__dirname, 'public'), { maxAge: PROD ? '1d' : 0 }));

// valores padrão para qualquer tela (a página de erro funciona mesmo se a sessão/banco falhar)
app.use((req, res, next) => {
  Object.assign(res.locals, { nomeSistema: NOME, titulo: '', usuario: null, flash: null, csrf: '', rota: req.path, dinheiro, data, waLink, statusPlano });
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
    dinheiro, data, waLink, statusPlano,
  });
  delete req.session.flash;
  if (req.method === 'POST') {
    const t = req.body && req.body._csrf;
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
  const [clientes, hoje, planosAtivos, receber, vencendo, vencidos] = await Promise.all([
    Cliente.countDocuments({ ativo: true }),
    Atendimento.countDocuments({ createdAt: { $gte: inicioDoDia() } }),
    Cliente.countDocuments({ ativo: true, 'plano.vencimento': { $gte: agora } }),
    Atendimento.aggregate([{ $match: { pago: false } }, { $group: { _id: null, total: { $sum: '$valor' } } }]),
    Cliente.find({ ativo: true, 'plano.vencimento': { $gte: agora, $lte: limite } }).populate('plano.plano').sort('plano.vencimento'),
    Cliente.find({ ativo: true, 'plano.vencimento': { $lt: agora } }).populate('plano.plano').sort('-plano.vencimento').limit(10),
  ]);
  res.render('index', { titulo: 'Início', clientes, hoje, planosAtivos, receber: receber[0]?.total || 0, vencendo, vencidos });
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
  res.render('cliente', { titulo: c.nome, c, historico, planos, pendente });
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
      await Cliente.updateOne({ _id: req.params.id }, { $set: { plano: { plano: p._id, inicio, vencimento } } });
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
    if (c) return res.render('atendimento-novo', { titulo: 'Novo atendimento', c, resultados: null, q: '', erro: null, form: {} });
  }
  const q = String(req.query.q || '').trim();
  const filtro = { ativo: true };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filtro.$or = [{ nome: rx }, { telefone: rx }, { 'veiculos.placa': rx }];
  }
  const resultados = await Cliente.find(filtro).sort('nome').limit(30);
  res.render('atendimento-novo', { titulo: 'Novo atendimento', c: null, resultados, q, erro: null, form: {} });
}));

app.post('/atendimentos', ah(async (req, res) => {
  const b = req.body;
  const c = mongoose.isValidObjectId(b.cliente) && await Cliente.findById(b.cliente).populate('plano.plano');
  if (!c) return res.redirect('/atendimentos/novo');
  const valor = numero(b.valor);
  const pago = b.pago === '1';
  const servico = String(b.servico || '').trim();
  const erro = !servico ? 'Informe o serviço.' : !(valor >= 0) ? 'Informe um valor válido.' : null;
  if (erro) return res.render('atendimento-novo', { titulo: 'Novo atendimento', c, resultados: null, q: '', erro, form: b });
  await Atendimento.create({
    cliente: c._id, servico, valor, pago,
    veiculo: b.veiculo, obs: b.obs,
    forma: ['pix', 'dinheiro', 'cartao', 'outro'].includes(b.forma) ? b.forma : '',
    pagoEm: pago ? new Date() : undefined,
  });
  flash(req, 'ok', pago ? 'Atendimento finalizado.' : 'Atendimento finalizado. Valor enviado para Cobranças.');
  res.redirect('/clientes/' + c.id);
}));

// ---------- cobranças ----------
app.get('/cobrancas', ah(async (req, res) => {
  const lista = await Atendimento.find({ pago: false }).populate('cliente').sort('createdAt');
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
    await Plano.updateOne({ _id: req.params.id }, { $set: { nome, preco, beneficios: String(req.body.beneficios || '').trim() } });
    flash(req, 'ok', 'Plano salvo.');
  }
  res.redirect('/planos');
}));

// ---------- promoção (WhatsApp) ----------
app.get('/promocao', ah(async (req, res) => {
  const msg = String(req.query.msg || '').trim();
  const lista = msg ? await Cliente.find({ ativo: true }).sort('nome') : [];
  res.render('promocao', { titulo: 'Divulgar promoção', msg, lista });
}));

// ---------- erros ----------
app.use((req, res) => res.status(404).render('erro', { titulo: 'Erro', msg: 'Página não encontrada.' }));
app.use((err, req, res, next) => { // eslint-disable-line
  console.error(err);
  res.status(500).render('erro', { titulo: 'Erro', msg: 'Algo deu errado. Tente novamente.' });
});

// ---------- inicialização ----------
async function iniciar() {
  await conexao;
  if ((await Plano.countDocuments()) === 0) {
    await Plano.insertMany([1, 2, 3].map((n) => ({ ordem: n, nome: `Plano ${n}`, preco: 0, beneficios: '' })));
  }
  // Admin vem das variáveis de ambiente. Para trocar/recuperar a senha: mude ADMIN_PASS e reinicie.
  if (ADMIN_USER && ADMIN_PASS) {
    await Usuario.findOneAndUpdate(
      { usuario: ADMIN_USER.trim().toLowerCase() },
      { $set: { senhaHash: await bcrypt.hash(ADMIN_PASS, 12) } },
      { upsert: true },
    );
  } else if ((await Usuario.countDocuments()) === 0) {
    console.warn('ATENÇÃO: nenhum usuário existe. Defina ADMIN_USER e ADMIN_PASS.');
  }
  const porta = process.env.PORT || 3000;
  app.listen(porta, () => console.log(`${NOME} rodando na porta ${porta}`));
}
iniciar().catch((e) => { console.error('Falha ao conectar no MongoDB. Confira MONGODB_URI, usuário/senha e o Network Access do Atlas.\nDetalhe:', e.message); process.exit(1); });
