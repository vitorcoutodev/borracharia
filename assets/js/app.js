// MENU DO CELULAR (abrir e fechar)
(function () {
  var botao = document.getElementById('menuBotao');
  var overlay = document.getElementById('overlay');
  if (!botao) return;

  botao.addEventListener('click', function () {
    document.body.classList.toggle('menu-aberto');
  });
  overlay.addEventListener('click', function () {
    document.body.classList.remove('menu-aberto');
  });
})();
