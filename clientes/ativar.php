<?php
require_once __DIR__ . '/../includes/auth.php';
exigir_login();

// So aceita POST com token CSRF (nunca altera dados por link)
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !csrf_validar()) {
    flash_definir('erro', 'Pedido inválido. Tente novamente.');
    redirecionar('clientes/index.php');
}

$id = (int) ($_POST['id'] ?? 0);
$acao = (string) ($_POST['acao'] ?? '');

if ($id <= 0 || !in_array($acao, ['desativar', 'reativar'], true)) {
    flash_definir('erro', 'Pedido inválido.');
    redirecionar('clientes/index.php');
}

// Nunca exclui: apenas marca como ativo ou inativo (preserva o historico)
$st = db()->prepare('UPDATE clientes SET ativo = :a WHERE id = :id');
$st->execute([':a' => $acao === 'reativar' ? 1 : 0, ':id' => $id]);

flash_definir('sucesso', $acao === 'reativar' ? 'Cliente reativado.' : 'Cliente desativado.');
redirecionar('clientes/ver.php?id=' . $id);
