<?php
require_once __DIR__ . '/includes/auth.php';
exigir_login();

$pdo = db();
$dias_aviso = (int) config()['dias_aviso_plano'];

// Total de clientes ativos
$total_clientes = (int) $pdo->query('SELECT COUNT(*) FROM clientes WHERE ativo = 1')->fetchColumn();

// Atendimentos de hoje
$atend_hoje = (int) $pdo->query(
    "SELECT COUNT(*) FROM atendimentos
     WHERE status = 'finalizado'
       AND criado_em >= CURDATE() AND criado_em < CURDATE() + INTERVAL 1 DAY"
)->fetchColumn();

// Valor pendente = total dos atendimentos - total pago
$pendente = (float) $pdo->query(
    "SELECT COALESCE(SUM(a.total - COALESCE(p.pago, 0)), 0)
     FROM atendimentos a
     LEFT JOIN (SELECT atendimento_id, SUM(valor) AS pago
                FROM pagamentos GROUP BY atendimento_id) p ON p.atendimento_id = a.id
     WHERE a.status = 'finalizado' AND a.total > COALESCE(p.pago, 0)"
)->fetchColumn();

// Planos ativos que vencem nos proximos dias
$st = $pdo->prepare(
    "SELECT COUNT(*) FROM cliente_planos
     WHERE status = 'ativo'
       AND data_vencimento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL :d DAY)"
);
$st->execute([':d' => $dias_aviso]);
$planos_vencendo = (int) $st->fetchColumn();

$atalhos = [
    ['Clientes', 'clientes/index.php'],
    ['Veículos', 'veiculos/index.php'],
    ['Serviços', 'servicos/index.php'],
    ['Cobranças', 'financeiro/index.php'],
    ['Planos', 'planos/index.php'],
    ['Histórico', 'historico/index.php'],
];

$titulo = 'Início';
require __DIR__ . '/includes/header.php';
?>

<?php $novo_ok = pagina_existe('atendimentos/novo.php'); ?>
<a class="btn btn-primario btn-grande btn-bloco <?= $novo_ok ? '' : 'desativado' ?>"
   href="<?= $novo_ok ? e(url('atendimentos/novo.php')) : '#' ?>">+ Novo atendimento</a>

<section class="grid-indicadores">
    <div class="card indicador"><span class="rotulo">Clientes</span><span class="valor"><?= $total_clientes ?></span></div>
    <div class="card indicador"><span class="rotulo">Atendimentos hoje</span><span class="valor"><?= $atend_hoje ?></span></div>
    <div class="card indicador"><span class="rotulo">Pendente a receber</span><span class="valor"><?= e(dinheiro($pendente)) ?></span></div>
    <div class="card indicador"><span class="rotulo">Planos a vencer</span><span class="valor"><?= $planos_vencendo ?></span></div>
</section>

<h2>Atalhos</h2>
<section class="grid-atalhos">
    <?php foreach ($atalhos as [$rotulo, $caminho]): $ok = pagina_existe($caminho); ?>
        <a class="card atalho <?= $ok ? '' : 'desativado' ?>" href="<?= $ok ? e(url($caminho)) : '#' ?>">
            <?= e($rotulo) ?>
        </a>
    <?php endforeach; ?>
</section>

<h2>Avisos</h2>
<section class="card">
    <?php if ($pendente <= 0 && $planos_vencendo === 0): ?>
        <p class="texto-suave">Nenhum aviso no momento.</p>
    <?php endif; ?>
    <?php if ($pendente > 0): ?>
        <div class="alerta alerta-aviso">Há <?= e(dinheiro($pendente)) ?> pendentes de pagamento.</div>
    <?php endif; ?>
    <?php if ($planos_vencendo > 0): ?>
        <div class="alerta alerta-aviso"><?= $planos_vencendo ?> plano(s) vencem em até <?= $dias_aviso ?> dias.</div>
    <?php endif; ?>
</section>

<?php require __DIR__ . '/includes/footer.php'; ?>
