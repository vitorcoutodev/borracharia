<?php
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/util.php';
exigir_login();

$q = trim((string) ($_GET['q'] ?? ''));
$situacao = (string) ($_GET['situacao'] ?? 'ativos');
if (!in_array($situacao, ['ativos', 'inativos', 'todos'], true)) {
    $situacao = 'ativos';
}
$pagina = max(1, (int) ($_GET['pagina'] ?? 1));
$por_pagina = 30;

$onde = [];
$params = [];
if ($situacao === 'ativos') {
    $onde[] = 'v.ativo = 1';
}
if ($situacao === 'inativos') {
    $onde[] = 'v.ativo = 0';
}
if ($q !== '') {
    $cond = 'v.modelo LIKE :busca_modelo OR c.nome LIKE :busca_cliente';
    $params[':busca_modelo'] = '%' . like_escape($q) . '%';
    $params[':busca_cliente'] = '%' . like_escape($q) . '%';
    $placa_busca = placa_normalizar($q);
    if ($placa_busca !== '') {
        $cond .= ' OR v.placa LIKE :busca_placa';
        $params[':busca_placa'] = '%' . like_escape($placa_busca) . '%';
    }
    $onde[] = '(' . $cond . ')';
}
$sql_onde = $onde ? 'WHERE ' . implode(' AND ', $onde) : '';

$st = db()->prepare("SELECT COUNT(*) FROM veiculos v JOIN clientes c ON c.id = v.cliente_id $sql_onde");
$st->execute($params);
$total = (int) $st->fetchColumn();
$total_paginas = max(1, (int) ceil($total / $por_pagina));
if ($pagina > $total_paginas) {
    $pagina = $total_paginas;
}
$offset = ($pagina - 1) * $por_pagina;

$st = db()->prepare(
    "SELECT v.id, v.modelo, v.placa, v.ativo, c.id AS cliente_id, c.nome AS cliente_nome
     FROM veiculos v
     JOIN clientes c ON c.id = v.cliente_id
     $sql_onde
     ORDER BY v.modelo
     LIMIT $por_pagina OFFSET $offset"
);
$st->execute($params);
$veiculos = $st->fetchAll();

function link_pagina_v(int $n, string $q, string $situacao): string
{
    return url('veiculos/index.php') . '?' . http_build_query([
        'q' => $q, 'situacao' => $situacao, 'pagina' => $n,
    ]);
}

$titulo = 'Veículos';
require __DIR__ . '/../includes/header.php';
?>

<div class="card">
    <p>Para cadastrar um veículo, abra o cliente e toque em <strong>Adicionar veículo</strong>.</p>
    <a class="btn btn-primario" href="<?= e(url('clientes/index.php')) ?>">Ir para clientes</a>
</div>

<form method="get" class="busca-form" style="margin-top:16px">
    <div class="busca">
        <input type="search" name="q" value="<?= e($q) ?>" placeholder="Buscar por placa, modelo ou cliente" aria-label="Buscar veiculo">
        <button type="submit" class="btn btn-primario">Buscar</button>
    </div>
    <select name="situacao" aria-label="Situacao" onchange="this.form.submit()">
        <option value="ativos" <?= $situacao === 'ativos' ? 'selected' : '' ?>>Somente ativos</option>
        <option value="inativos" <?= $situacao === 'inativos' ? 'selected' : '' ?>>Somente inativos</option>
        <option value="todos" <?= $situacao === 'todos' ? 'selected' : '' ?>>Todos</option>
    </select>
</form>

<p class="texto-suave"><?= $total ?> veículo(s) encontrado(s)</p>

<section class="lista">
    <?php if (!$veiculos): ?>
        <div class="card"><p>Nenhum veículo encontrado.</p></div>
    <?php endif; ?>
    <?php foreach ($veiculos as $v): ?>
        <div class="card">
            <div class="linha-card">
                <span class="titulo"><?= e($v['modelo']) ?></span>
                <?php if (!(int) $v['ativo']): ?><span class="selo selo-inativo">Inativo</span><?php endif; ?>
            </div>
            <div class="detalhe"><?= e(placa_formatar($v['placa'])) ?></div>
            <div class="detalhe">Cliente: <?= e($v['cliente_nome']) ?></div>
            <div class="botoes">
                <a class="btn btn-pequeno" href="<?= e(url('clientes/ver.php?id=' . (int) $v['cliente_id'])) ?>">Ver cliente</a>
                <a class="btn btn-pequeno" href="<?= e(url('veiculos/form.php?id=' . (int) $v['id'])) ?>">Editar</a>
            </div>
        </div>
    <?php endforeach; ?>
</section>

<?php if ($total_paginas > 1): ?>
    <nav class="paginacao" aria-label="Paginas">
        <?php if ($pagina > 1): ?>
            <a class="btn" href="<?= e(link_pagina_v($pagina - 1, $q, $situacao)) ?>">&laquo; Anterior</a>
        <?php else: ?><span></span><?php endif; ?>
        <span class="texto-suave">Página <?= $pagina ?> de <?= $total_paginas ?></span>
        <?php if ($pagina < $total_paginas): ?>
            <a class="btn" href="<?= e(link_pagina_v($pagina + 1, $q, $situacao)) ?>">Próxima &raquo;</a>
        <?php else: ?><span></span><?php endif; ?>
    </nav>
<?php endif; ?>

<?php require __DIR__ . '/../includes/footer.php'; ?>
