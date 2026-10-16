<?php
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/util.php';
exigir_login();

// SE TEM ID, E EDICAO. SE NAO TEM, E CADASTRO NOVO
$id = (int) ($_GET['id'] ?? $_POST['id'] ?? 0);
$cliente = null;

if ($id > 0) {
    $st = db()->prepare('SELECT id, nome, telefone FROM clientes WHERE id = :id');
    $st->execute([':id' => $id]);
    $cliente = $st->fetch();
    if (!$cliente) {
        flash_definir('erro', 'Cliente não encontrado.');
        redirecionar('clientes/index.php');
    }
}

$nome = $cliente['nome'] ?? '';
$telefone = $cliente ? telefone_formatar($cliente['telefone']) : '';
$erros = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_validar()) {
        $erros[] = 'Sessão expirada. Recarregue a página e tente de novo.';
    } else {
        $nome = trim((string) preg_replace('/\s+/', ' ', (string) ($_POST['nome'] ?? '')));
        $telefone = trim((string) ($_POST['telefone'] ?? ''));
        $tel = normalizar_telefone($telefone);

        if (mb_strlen($nome) < 3 || mb_strlen($nome) > 120) {
            $erros[] = 'Informe o nome completo (de 3 a 120 caracteres).';
        }
        if (!telefone_valido($tel)) {
            $erros[] = 'Informe o telefone com DDD. Exemplo: (51) 99999-8888.';
        }

        if (!$erros) {
            if ($cliente) {
                $st = db()->prepare('UPDATE clientes SET nome = :n, telefone = :t WHERE id = :id');
                $st->execute([':n' => $nome, ':t' => $tel, ':id' => $id]);
                flash_definir('sucesso', 'Cadastro atualizado.');
                redirecionar('clientes/ver.php?id=' . $id);
            }
            $st = db()->prepare('INSERT INTO clientes (nome, telefone) VALUES (:n, :t)');
            $st->execute([':n' => $nome, ':t' => $tel]);
            $novo_id = (int) db()->lastInsertId();
            flash_definir('sucesso', 'Cliente cadastrado.');
            redirecionar('clientes/ver.php?id=' . $novo_id);
        }
    }
}

$titulo = $cliente ? 'Editar cliente' : 'Novo cliente';
require __DIR__ . '/../includes/header.php';
?>

<?php foreach ($erros as $erro): ?>
    <div class="alerta alerta-erro" role="alert"><?= e($erro) ?></div>
<?php endforeach; ?>

<form method="post" class="card" autocomplete="off">
    <?= csrf_campo() ?>
    <input type="hidden" name="id" value="<?= (int) $id ?>">

    <div class="campo">
        <label for="nome">Nome completo</label>
        <input type="text" id="nome" name="nome" required maxlength="120" value="<?= e($nome) ?>" autofocus>
    </div>

    <div class="campo">
        <label for="telefone">Telefone com DDD</label>
        <input type="tel" id="telefone" name="telefone" required inputmode="tel" maxlength="20"
               placeholder="(51) 99999-8888" value="<?= e($telefone) ?>">
    </div>

    <div class="botoes">
        <button type="submit" class="btn btn-primario btn-grande">Salvar</button>
        <a class="btn btn-grande" href="<?= e($cliente ? url('clientes/ver.php?id=' . $id) : url('clientes/index.php')) ?>">Cancelar</a>
    </div>
</form>

<?php require __DIR__ . '/../includes/footer.php'; ?>
