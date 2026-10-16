<?php
// Espera a variavel $titulo definida antes do include
$menu = [
    ['Início', 'index.php'],
    ['Clientes', 'clientes/index.php'],
    ['Veículos', 'veiculos/index.php'],
    ['Atendimentos', 'atendimentos/index.php'],
    ['Serviços', 'servicos/index.php'],
    ['Cobranças', 'financeiro/index.php'],
    ['Planos', 'planos/index.php'],
    ['Histórico', 'historico/index.php'],
    ['WhatsApp', 'whatsapp/index.php'],
    ['Configurações', 'configuracoes/index.php'],
];
$nome_sistema = config()['nome_sistema'];
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#171717">
    <title><?= e($titulo ?? 'Início') ?> - <?= e($nome_sistema) ?></title>
    <link rel="stylesheet" href="<?= e(url('assets/css/style.css')) ?>">
</head>
<body>
<header class="topbar">
    <button type="button" class="menu-botao" id="menuBotao" aria-label="Abrir menu">&#9776;</button>
    <span class="topbar-titulo"><?= e($titulo ?? 'Início') ?></span>
</header>

<div class="overlay" id="overlay"></div>

<nav class="sidebar" id="sidebar" aria-label="Menu principal">
    <div class="sidebar-marca"><?= e($nome_sistema) ?></div>
    <?php foreach ($menu as [$rotulo, $caminho]):
        $ativo = ($_SERVER['SCRIPT_NAME'] === config()['base_url'] . '/' . $caminho);
        $existe = pagina_existe($caminho);
        $classe = 'menu-link' . ($ativo ? ' ativo' : '') . ($existe ? '' : ' desativado');
    ?>
        <a class="<?= $classe ?>" href="<?= $existe ? e(url($caminho)) : '#' ?>">
            <?= e($rotulo) ?><?= $existe ? '' : ' <small>(em breve)</small>' ?>
        </a>
    <?php endforeach; ?>

    <form method="post" action="<?= e(url('logout.php')) ?>" class="sidebar-sair">
        <?= csrf_campo() ?>
        <small class="texto-suave">Olá, <?= e($_SESSION['usuario_nome'] ?? '') ?></small>
        <button type="submit" class="btn btn-bloco">Sair</button>
    </form>
</nav>

<main class="conteudo">
    <?= flash_exibir() ?>
