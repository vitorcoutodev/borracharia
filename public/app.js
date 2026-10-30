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
