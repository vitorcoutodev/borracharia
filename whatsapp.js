// WhatsApp Cloud API (oficial). Só fica ativo se WHATSAPP_TOKEN e WHATSAPP_PHONE_ID estiverem definidos.
const { WHATSAPP_TOKEN: TOKEN, WHATSAPP_PHONE_ID: PHONE_ID, WHATSAPP_API_VERSION: VERSAO = 'v23.0' } = process.env;
const ativo = () => Boolean(TOKEN && PHONE_ID);
const numero = (tel) => { let n = String(tel || '').replace(/\D/g, ''); if (n.length <= 11) n = '55' + n; return n; };
const limpa = (t) => String(t).replace(/\s+/g, ' ').trim().slice(0, 1000); // variáveis de modelo não aceitam quebra de linha

async function enviar(corpo) {
  const r = await fetch(`https://graph.facebook.com/${VERSAO}/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...corpo }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || `Erro ${r.status}`);
  return j;
}
// modelo aprovado pela Meta; imagemUrl (pública, https) vai no cabeçalho do modelo
function template(tel, nome, params, imagemUrl) {
  const components = [];
  if (imagemUrl) components.push({ type: 'header', parameters: [{ type: 'image', image: { link: imagemUrl } }] });
  if (params.length) components.push({ type: 'body', parameters: params.map((p) => ({ type: 'text', text: limpa(p) })) });
  return enviar({ to: numero(tel), type: 'template', template: { name: nome, language: { code: 'pt_BR' }, components } });
}
module.exports = { ativo, template, numero };
