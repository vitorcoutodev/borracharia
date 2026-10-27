const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const Usuario = model('Usuario', new Schema({
  usuario: { type: String, required: true, unique: true, trim: true, lowercase: true },
  senhaHash: { type: String, required: true },
}, { timestamps: true }));

const Plano = model('Plano', new Schema({
  ordem: { type: Number, required: true },
  nome: { type: String, required: true, trim: true },
  preco: { type: Number, default: 0, min: 0 },
  beneficios: { type: String, default: '', trim: true },
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
}, { timestamps: true });
atendimentoSchema.index({ cliente: 1, createdAt: -1 });
atendimentoSchema.index({ pago: 1, createdAt: 1 });
const Atendimento = model('Atendimento', atendimentoSchema);

module.exports = { Usuario, Plano, Cliente, Atendimento };
