<?php
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/util.php';
exigir_login();

// COM id = EDITAR VEICULO. COM cliente_id = CADASTRAR VEICULO NOVO PARA AQUELE CLIENTE
$id = (int) ($_GET['id'] ?? $_POST['id'] ?? 0);
$veiculo = null;

if ($id > 0) {
    $st = db()->prepare('SELECT id, cliente_id, modelo, placa FROM veiculos WHERE id = :id');
    $st->execute([':id' => $id]);
    $veiculo = $st->fetch();
    if (!$veiculo) {
        flash_definir('erro', 'Veículo não encontrado.');
        redirecionar('veiculos/index.php');
    }
    $cliente_id = (int) $veiculo['cliente_id'];
} else {
    $cliente_id = (int) ($_GET['cliente_id'] ?? $_POST['cliente_id'] ?? 0);
}

// O CLIENTE PRECISA EXISTIR
$st = db()->prepare('SELECT id, nome, ativo FROM clientes WHERE id = :id');
$st->execute([':id' => $cliente_id]);
$cliente = $st->fetch();
if (!$cliente) {
    flash_definir('erro', 'Escolha um cliente antes de cadastrar o veículo.');
    redirecionar('clientes/index.php');
}

$modelo = $veiculo['modelo'] ?? '';
$placa = $veiculo ? placa_formatar($veiculo['placa']) : '';
if ($placa === 'Sem placa') {
    $placa = '';
}
$erros = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_validar()) {
        $erros[] = 'Sessão expirada. Recarregue a página e tente de novo.';
    } else {
        $modelo = trim((string) preg_replace('/\s+/', ' ', (string) ($_POST['modelo'] ?? '')));
        $placa = trim((string) ($_POST['placa'] ?? ''));
        $placa_norm = placa_normalizar($placa);

        if (mb_strlen($modelo) < 2 || mb_strlen($modelo) > 80) {
            $erros[] = 'Informe o modelo do veículo (de 2 a 80 caracteres).';
        }
        if (!placa_valida($placa_norm)) {
            $erros[] = 'Placa inválida. Exemplos: ABC-1234 ou ABC1D23. Deixe em branco se não tiver placa.';
        }

        // PLACA NAO PODE REPETIR EM OUTRO VEICULO
        if (!$erros && $placa_norm !== '') {
            $st = db()->prepare(
                'SELECT c.nome FROM veiculos v JOIN clientes c ON c.id = v.cliente_id
                 WHERE v.placa = :p AND v.id <> :id LIMIT 1'
            );
            $st->execute([':p' => $placa_norm, ':id' => $id]);
            $dono = $st->fetchColumn();
            if ($dono !== false) {
                $erros[] = 'Esta placa já está cadastrada para: ' . $dono . '.';
            }
        }

        if (!$erros) {
            $placa_banco = $placa_norm === '' ? null : $placa_norm;
            if ($veiculo) {
                $st = db()->prepare('UPDATE veiculos SET modelo = :m, placa = :p WHERE id = :id');
                $st->execute([':m' => $modelo, ':p' => $placa_banco, ':id' => $id]);
                flash_definir('sucesso', 'Veículo atualizado.');
            } else {
                $st = db()->prepare('INSERT INTO veiculos (cliente_id, modelo, placa) VALUES (:c, :m, :p)');
                $st->execute([':c' => $cliente_id, ':m' => $modelo, ':p' => $placa_banco]);
                flash_definir('sucesso', 'Veículo cadastrado.');
            }
            redirecionar('clientes/ver.php?id=' . $cliente_id);
        }
    }
}

$titulo = $veiculo ? 'Editar veículo' : 'Novo veículo';
require __DIR__ . '/../includes/header.php';
?>

<?php foreach ($erros as $erro): ?>
    <div class="alerta alerta-erro" role="alert"><?= e($erro) ?></div>
<?php endforeach; ?>

<p class="texto-suave">Cliente: <strong><?= e($cliente['nome']) ?></strong></p>

<form method="post" class="card" autocomplete="off">
    <?= csrf_campo() ?>
    <input type="hidden" name="id" value="<?= (int) $id ?>">
    <input type="hidden" name="cliente_id" value="<?= (int) $cliente_id ?>">

    <div class="campo">
        <label for="modelo">Modelo do veículo</label>
        <input type="text" id="modelo" name="modelo" required maxlength="80"
               placeholder="Ex.: Gol, Fiesta, CG 160" value="<?= e($modelo) ?>" autofocus>
    </div>

    <div class="campo">
        <label for="placa">Placa (opcional)</label>
        <input type="text" id="placa" name="placa" maxlength="10"
               placeholder="ABC-1234 ou ABC1D23" value="<?= e($placa) ?>" style="text-transform:uppercase">
        <small class="texto-suave">Deixe em branco se o veículo não tiver placa.</small>
    </div>

    <div class="botoes">
        <button type="submit" class="btn btn-primario btn-grande">Salvar</button>
        <a class="btn btn-grande" href="<?= e(url('clientes/ver.php?id=' . $cliente_id)) ?>">Cancelar</a>
    </div>
</form>

<?php require __DIR__ . '/../includes/footer.php'; ?>
