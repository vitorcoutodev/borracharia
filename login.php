<?php
require_once __DIR__ . '/includes/auth.php';

if (usuario_logado()) {
    redirecionar('index.php');
}

$erro = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_validar()) {
        $erro = 'Sessão expirada. Recarregue a página e tente de novo.';
    } elseif (($_SESSION['bloqueado_ate'] ?? 0) > time()) {
        $erro = 'Muitas tentativas. Aguarde 5 minutos.';
    } else {
        $usuario = trim($_POST['usuario'] ?? '');
        $senha = $_POST['senha'] ?? '';

        if ($usuario === '' || $senha === '') {
            $erro = 'Informe usuário e senha.';
        } else {
            $st = db()->prepare(
                'SELECT id, nome, senha FROM usuarios WHERE usuario = :u AND ativo = 1 LIMIT 1'
            );
            $st->execute([':u' => $usuario]);
            $u = $st->fetch();

            if ($u && password_verify($senha, $u['senha'])) {
                session_regenerate_id(true); // evita fixacao de sessao
                unset($_SESSION['tentativas'], $_SESSION['bloqueado_ate']);
                $_SESSION['usuario_id'] = (int) $u['id'];
                $_SESSION['usuario_nome'] = $u['nome'];
                $_SESSION['ultimo_acesso'] = time();
                redirecionar('index.php');
            }

            $_SESSION['tentativas'] = ($_SESSION['tentativas'] ?? 0) + 1;
            if ($_SESSION['tentativas'] >= 5) {
                $_SESSION['bloqueado_ate'] = time() + 300;
                $_SESSION['tentativas'] = 0;
            }
            $erro = 'Usuário ou senha inválidos.';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#171717">
    <title>Entrar - <?= e(config()['nome_sistema']) ?></title>
    <link rel="stylesheet" href="<?= e(url('assets/css/style.css')) ?>">
</head>
<body class="pagina-login">
    <main class="login-caixa card">
        <h1 class="login-marca"><?= e(config()['nome_sistema']) ?></h1>
        <p class="texto-suave">Acesse o sistema de gestão</p>

        <?php if ($erro): ?>
            <div class="alerta alerta-erro" role="alert"><?= e($erro) ?></div>
        <?php endif; ?>

        <form method="post" autocomplete="on">
            <?= csrf_campo() ?>
            <div class="campo">
                <label for="usuario">Usuário</label>
                <input type="text" id="usuario" name="usuario" required autofocus
                       autocomplete="username" value="<?= e($_POST['usuario'] ?? '') ?>">
            </div>
            <div class="campo">
                <label for="senha">Senha</label>
                <input type="password" id="senha" name="senha" required autocomplete="current-password">
            </div>
            <button type="submit" class="btn btn-primario btn-grande btn-bloco">Entrar</button>
        </form>

        <details class="esqueci">
            <summary>Esqueci minha senha</summary>
            <p class="texto-suave">
                Por segurança, a senha nunca é exibida. A redefinição é feita
                pelo administrador do sistema.
            </p>
        </details>
    </main>
</body>
</html>
