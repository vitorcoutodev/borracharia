<?php
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/util.php';
exigir_login();

// PARAMETROS DA PESQUISA
$q = trim((string) ($_GET['q'] ?? ''));
$situacao = (string) ($_GET['situacao'] ?? 'ativos');
if (!in_array($situacao, ['ativos', 'inativos', 'todos'], true)) {
    $situacao = 'ativos';
}
$pagina = max(1, (int) ($_GET['pagina'] ?? 1));
$por_pagina = 30;

// MONTA O WHERE (sempre com parametros, nunca texto do usuario direto no SQL)
$onde = [];
$params = [];
if ($situacao === 'ativos') {
    $onde[] = 'c.ativo = 1';
}
if ($situacao === 'inativos') {
    $onde[] = 'c.ativo = 0';
}
if ($q !== '') {
    $cond = 'c.nome LIKE :busca_nome';
    $params[':busca_nome'] = '%' . like_escape($q) . '%';
    $digitos = so_digitos($q);
    if ($digitos !== '') {
        $cond .= ' OR c.telefone LIKE :busca_tel';
        $params[':busca_tel'] = '%' . like_escape($digitos) . '%';
    }
    $onde[] = '(' . $cond . ')';
}
$sql_onde = $onde ? 'WHERE ' . implode(' AND ', $onde) : '';

// TOTAL E PAGINACAO
$st = db()->prepare("SELECT COUNT(*) FROM clientes c $sql_onde");
$st->execute($params);
$total = (int) $st->fetchColumn();
$total_paginas = max(1, (int) ceil($total / $por_pagina));
if ($pagina > $total_paginas) {
    $pagina = $total_paginas;
}
$offset = ($pagina - 1) * $por_pagina;

// LISTA
$st = db()->prepare(
    "SELECT c.id, c.nome, c.telefone, c.ativo,
            (SELECT COUNT(*) FROM veiculos v WHERE v.cliente_id = c.id AND v.ativo = 1) AS qtd_veiculos
     FROM clientes c
     $sql_onde
     ORDER BY c.nome
     LIMIT $por_pagina OFFSET $offset"
);
$st->execute($params);
$clientes = $st->fetchAll();

function link_pagina(int $n, string $q, string $situacao): string
{
    return url('clientes/index.php') . '?' . http_build_query([
        'q' => $q, 'situacao' => $situacao, 'pagina' => $n,
    ]);
}

$titulo = 'Clientes';
require __DIR__ . '/../includes/header.php';
?>

<a class="btn btn-primario btn-grande btn-bloco" href="<?= e(url('clientes/form.php')) ?>">+ Novo cliente</a>

<form method="get" class="busca-form">
    <div class="busca">
        <input type="search" name="q" value="<?= e($q) ?>" placeholder="Buscar por nome ou telefone" aria-label="Buscar cliente">
        <button type="submit" class="btn btn-primario">Buscar</button>
    </div>
    <select name="situacao" aria-label="Situacao" onchange="this.form.submit()">
        <option value="ativos" <?= $situacao === 'ativos' ? 'selected' : '' ?>>Somente ativos</option>
        <option value="inativos" <?= $situacao === 'inativos' ? 'selected' : '' ?>>Somente inativos</option>
        <option value="todos" <?= $situacao === 'todos' ? 'selected' : '' ?>>Todos</option>
    </select>
</form>

<p class="texto-suave"><?= $total ?> cliente(s) encontrado(s)</p>

<?php if (!$clientes): ?>
    <div class="card">
        <p>Nenhum cliente encontrado.</p>
        <?php if ($q !== ''): ?>
            <a class="btn btn-primario" href="<?= e(url('clientes/form.php')) ?>">Cadastrar novo cliente</a>
        <?php endif; ?>
    </div>
<?php else: ?>
    <section class="lista">
        <?php foreach ($clientes as $c): ?>
            <a class="card item-lista" href="<?= e(url('clientes/ver.php?id=' . (int) $c['id'])) ?>">
                <div class="linha-card">
                    <span class="titulo"><?= e($c['nome']) ?></span>
                    <?php if (!(int) $c['ativo']): ?><span class="selo selo-inativo">Inativo</span><?php endif; ?>
                </div>
                <div class="detalhe"><?= e(telefone_formatar($c['telefone'])) ?></div>
                <div class="detalhe"><?= (int) $c['qtd_veiculos'] ?> veículo(s)</div>
            </a>
        <?php endforeach; ?>
    </section>

    <?php if ($total_paginas > 1): ?>
        <nav class="paginacao" aria-label="Paginas">
            <?php if ($pagina > 1): ?>
                <a class="btn" href="<?= e(link_pagina($pagina - 1, $q, $situacao)) ?>">&laquo; Anterior</a>
            <?php else: ?><span></span><?php endif; ?>
            <span class="texto-suave">Página <?= $pagina ?> de <?= $total_paginas ?></span>
            <?php if ($pagina < $total_paginas): ?>
                <a class="btn" href="<?= e(link_pagina($pagina + 1, $q, $situacao)) ?>">Próxima &raquo;</a>
            <?php else: ?><span></span><?php endif; ?>
        </nav>
    <?php endif; ?>
<?php endif; ?>

<?php require __DIR__ . '/../includes/footer.php'; ?>
