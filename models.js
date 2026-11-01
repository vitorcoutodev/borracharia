const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const Usuario = model('Usuario', new Schema({
  usuario: { type: String, required: true, unique: true, trim: true, lowercase: true },
  senhaHash: { type: String, required: true },
  email: { type: String, trim: true, lowercase: true },
  resetHash: String,    // hash do link de redefinição (o link em si nunca é guardado)
  resetExpira: Date,
}, { timestamps: true }));

const Plano = model('Plano', new Schema({
  ordem: { type: Number, required: true },
  nome: { type: String, required: true, trim: true },
  preco: { type: Number, default: 0, min: 0 },
  beneficios: { type: String, default: '', trim: true },
  itens: [{ nome: { type: String, trim: true }, qtd: { type: Number, min: 0 } }], // limite mensal de cada serviço
  duracaoDias: { type: Number, default: 30 },
}));

const clienteSchema = new Schema({
  nome: { type: String, required: true, trim: true },
  telefone: { type: String, required: true, trim: true },
  ativo: { type: Boolean, default: true },
  veiculos: [{ modelo: { type: String, trim: true }, placa: { type: String, trim: true, uppercase: true } }],
  plano: {
    plano: { type: Schema.Types.ObjectId, ref: 'Plano' },
    inicio: Date,
    vencimento: Date,
    termo: { type: String, enum: ['pendente', 'aceito', 'recusado'], default: 'pendente' },
  },
}, { timestamps: true });
clienteSchema.index({ nome: 1 });
clienteSchema.index({ telefone: 1 });
clienteSchema.index({ 'plano.vencimento': 1 });
const Cliente = model('Cliente', clienteSchema);

const atendimentoSchema = new Schema({
  cliente: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
  veiculo: { type: String, trim: true },
  servico: { type: String, required: true, trim: true },
  valor: { type: Number, required: true, min: 0 },
  forma: { type: String, enum: ['pix', 'dinheiro', 'cartao', 'outro', ''], default: '' },
  pago: { type: Boolean, default: true },
  pagoEm: Date,
  obs: { type: String, trim: true },
  venceEm: Date,      // data combinada para pagar
  usoPlano: String,
  foto: { type: Schema.Types.ObjectId, ref: 'Imagem' },
  avisadoEm: Date, // cobrança automática já enviada   // item do plano consumido neste atendimento
}, { timestamps: true });
atendimentoSchema.index({ cliente: 1, createdAt: -1 });
atendimentoSchema.index({ pago: 1, createdAt: 1 });
const Atendimento = model('Atendimento', atendimentoSchema);

const Imagem = model('Imagem', new Schema({
  dados: { type: Buffer, required: true },
  publica: { type: Boolean, default: false }, // promoções são públicas (link no WhatsApp); fotos de serviço não
}, { timestamps: true }));

const Promocao = model('Promocao', new Schema({
  texto: { type: String, required: true, trim: true },
  imagem: { type: Schema.Types.ObjectId, ref: 'Imagem' },
  envio: { total: Number, ok: { type: Number, default: 0 }, falhas: { type: Number, default: 0 }, andamento: Boolean },
}, { timestamps: true }));

module.exports = { Usuario, Plano, Cliente, Atendimento, Imagem, Promocao };
