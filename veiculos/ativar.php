<?php
require_once __DIR__ . '/../includes/auth.php';
exigir_login();

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !csrf_validar()) {
    flash_definir('erro', 'Pedido inválido. Tente novamente.');
    redirecionar('veiculos/index.php');
}

$id = (int) ($_POST['id'] ?? 0);
$acao = (string) ($_POST['acao'] ?? '');

$st = db()->prepare('SELECT cliente_id FROM veiculos WHERE id = :id');
$st->execute([':id' => $id]);
$cliente_id = $st->fetchColumn();

if ($cliente_id === false || !in_array($acao, ['desativar', 'reativar'], true)) {
    flash_definir('erro', 'Pedido inválido.');
    redirecionar('veiculos/index.php');
}

// Nunca exclui: apenas marca como ativo ou inativo (preserva o historico)
$st = db()->prepare('UPDATE veiculos SET ativo = :a WHERE id = :id');
$st->execute([':a' => $acao === 'reativar' ? 1 : 0, ':id' => $id]);

flash_definir('sucesso', $acao === 'reativar' ? 'Veículo reativado.' : 'Veículo desativado.');
redirecionar('clientes/ver.php?id=' . (int) $cliente_id);
