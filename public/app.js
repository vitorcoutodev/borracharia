// confirma ações marcadas com data-confirm
document.addEventListener('submit', (e) => {
  const msg = e.target.dataset && e.target.dataset.confirm;
  if (msg && !window.confirm(msg)) e.preventDefault();
});
// menu lateral no celular
const b = document.getElementById('burger'), m = document.getElementById('menu'), f = document.getElementById('fundo');
if (b && m && f) {
  const abrir = (o) => { m.classList.toggle('aberto', o); f.classList.toggle('aberto', o); b.setAttribute('aria-expanded', o); };
  b.addEventListener('click', () => abrir(!m.classList.contains('aberto')));
  f.addEventListener('click', () => abrir(false));
}
// foto: envia assim que escolher; promoção: marca enviado e filtra clientes
document.addEventListener('change', (e) => { if (e.target.matches('input[data-auto]') && e.target.files.length) e.target.form.submit(); });
document.addEventListener('click', (e) => { const a = e.target.closest('a[data-zap]'); if (a) { a.classList.remove('zap'); a.classList.add('sec'); a.textContent = 'Enviado'; } });
document.addEventListener('input', (e) => {
  if (!e.target.matches('input[data-filtro]')) return;
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('[data-nome]').forEach((r) => { r.style.display = r.dataset.nome.includes(q) ? '' : 'none'; });
});
// compartilhar imagem + texto pelo menu do celular (precisa de HTTPS, ou seja, no site publicado)
document.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-compartilhar]');
  if (!b) return;
  try {
    const dados = { text: b.dataset.texto };
    if (b.dataset.img) {
      const blob = await (await fetch(b.dataset.img)).blob();
      const f = new File([blob], 'promocao.jpg', { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) dados.files = [f];
    }
    if (navigator.share) await navigator.share(dados);
    else alert('Este aparelho não permite compartilhar. Use os botões Enviar da lista.');
  } catch (err) { if (err.name !== 'AbortError') alert('Não foi possível compartilhar.'); }
});
