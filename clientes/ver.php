<?php
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/util.php';
exigir_login();

$id = (int) ($_GET['id'] ?? 0);

$st = db()->prepare('SELECT id, nome, telefone, ativo, criado_em FROM clientes WHERE id = :id');
$st->execute([':id' => $id]);
$cliente = $st->fetch();
if (!$cliente) {
    flash_definir('erro', 'Cliente não encontrado.');
    redirecionar('clientes/index.php');
}

// VEICULOS DO CLIENTE (ativos primeiro)
$st = db()->prepare(
    'SELECT id, modelo, placa, ativo FROM veiculos
     WHERE cliente_id = :c ORDER BY ativo DESC, modelo'
);
$st->execute([':c' => $id]);
$veiculos = $st->fetchAll();

// HISTORICO DE ATENDIMENTOS (ultimos 20)
$st = db()->prepare(
    'SELECT a.id, a.criado_em, a.total, a.status, v.modelo, v.placa,
            COALESCE((SELECT SUM(p.valor) FROM pagamentos p WHERE p.atendimento_id = a.id), 0) AS pago
     FROM atendimentos a
     LEFT JOIN veiculos v ON v.id = a.veiculo_id
     WHERE a.cliente_id = :c
     ORDER BY a.criado_em DESC
     LIMIT 20'
);
$st->execute([':c' => $id]);
$atendimentos = $st->fetchAll();

$ativo = (int) $cliente['ativo'] === 1;
$titulo = 'Cliente';
require __DIR__ . '/../includes/header.php';
?>

<section class="card">
    <div class="linha-card">
        <h1 class="titulo-pagina"><?= e($cliente['nome']) ?></h1>
        <?php if (!$ativo): ?><span class="selo selo-inativo">Inativo</span><?php endif; ?>
    </div>
    <p class="detalhe">Telefone: <?= e(telefone_formatar($cliente['telefone'])) ?></p>
    <p class="detalhe">Cliente desde <?= e(date('d/m/Y', strtotime($cliente['criado_em']))) ?></p>

    <div class="botoes">
        <a class="btn btn-primario" href="<?= e(url('clientes/form.php?id=' . $id)) ?>">Editar</a>
        <form method="post" action="<?= e(url('clientes/ativar.php')) ?>"
              onsubmit="return confirm('<?= $ativo ? 'Desativar este cliente? O histórico será mantido.' : 'Reativar este cliente?' ?>');">
            <?= csrf_campo() ?>
            <input type="hidden" name="id" value="<?= $id ?>">
            <input type="hidden" name="acao" value="<?= $ativo ? 'desativar' : 'reativar' ?>">
            <button type="submit" class="btn btn-perigo"><?= $ativo ? 'Desativar' : 'Reativar' ?></button>
        </form>
    </div>
</section>

<h2>Veículos</h2>
<a class="btn btn-primario btn-bloco" href="<?= e(url('veiculos/form.php?cliente_id=' . $id)) ?>">+ Adicionar veículo</a>

<section class="lista" style="margin-top:12px">
    <?php if (!$veiculos): ?>
        <div class="card"><p class="texto-suave">Nenhum veículo cadastrado para este cliente.</p></div>
    <?php endif; ?>
    <?php foreach ($veiculos as $v): $v_ativo = (int) $v['ativo'] === 1; ?>
        <div class="card">
            <div class="linha-card">
                <span class="titulo"><?= e($v['modelo']) ?></span>
                <?php if (!$v_ativo): ?><span class="selo selo-inativo">Inativo</span><?php endif; ?>
            </div>
            <div class="detalhe"><?= e(placa_formatar($v['placa'])) ?></div>
            <div class="botoes">
                <a class="btn btn-pequeno" href="<?= e(url('veiculos/form.php?id=' . (int) $v['id'])) ?>">Editar</a>
                <form method="post" action="<?= e(url('veiculos/ativar.php')) ?>"
                      onsubmit="return confirm('<?= $v_ativo ? 'Desativar este veículo?' : 'Reativar este veículo?' ?>');">
                    <?= csrf_campo() ?>
                    <input type="hidden" name="id" value="<?= (int) $v['id'] ?>">
                    <input type="hidden" name="acao" value="<?= $v_ativo ? 'desativar' : 'reativar' ?>">
                    <button type="submit" class="btn btn-pequeno btn-perigo"><?= $v_ativo ? 'Desativar' : 'Reativar' ?></button>
                </form>
            </div>
        </div>
    <?php endforeach; ?>
</section>

<h2>Histórico de atendimentos</h2>
<section class="lista">
    <?php if (!$atendimentos): ?>
        <div class="card"><p class="texto-suave">Nenhum atendimento registrado ainda.</p></div>
    <?php endif; ?>
    <?php foreach ($atendimentos as $a):
        $saldo = (float) $a['total'] - (float) $a['pago'];
    ?>
        <div class="card">
            <div class="linha-card">
                <span class="titulo"><?= e(data_hora_br($a['criado_em'])) ?></span>
                <?php if ($a['status'] === 'cancelado'): ?>
                    <span class="selo selo-inativo">Cancelado</span>
                <?php elseif ($saldo > 0): ?>
                    <span class="selo">Pendente <?= e(dinheiro($saldo)) ?></span>
                <?php else: ?>
                    <span class="selo selo-inativo">Pago</span>
                <?php endif; ?>
            </div>
            <div class="detalhe">
                <?= e($a['modelo'] ?? 'Sem veículo') ?> · Total <?= e(dinheiro($a['total'])) ?> · Pago <?= e(dinheiro($a['pago'])) ?>
            </div>
        </div>
    <?php endforeach; ?>
</section>

<p><a class="btn" href="<?= e(url('clientes/index.php')) ?>">&laquo; Voltar para clientes</a></p>

<?php require __DIR__ . '/../includes/footer.php'; ?>
