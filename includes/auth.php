<?php
declare(strict_types=1);

date_default_timezone_set('America/Sao_Paulo');
require_once __DIR__ . '/db.php';

// CABECALHOS DE SEGURANCA
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

// SESSAO PROTEGIDA
$https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
ini_set('session.use_strict_mode', '1');
session_name('borracharia_sessao');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'httponly' => true,
    'secure' => $https,
    'samesite' => 'Lax',
]);
session_start();

// FUNCOES AUXILIARES
function e(?string $texto): string
{
    // Escapa texto para HTML (protecao contra XSS)
    return htmlspecialchars((string) $texto, ENT_QUOTES, 'UTF-8');
}

function url(string $caminho = ''): string
{
    return config()['base_url'] . '/' . ltrim($caminho, '/');
}

function pagina_existe(string $caminho): bool
{
    return is_file(__DIR__ . '/../' . $caminho);
}

function redirecionar(string $caminho): never
{
    header('Location: ' . url($caminho));
    exit;
}

function dinheiro($valor): string
{
    return 'R$ ' . number_format((float) $valor, 2, ',', '.');
}

// CSRF
function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_campo(): string
{
    return '<input type="hidden" name="csrf" value="' . e(csrf_token()) . '">';
}

function csrf_validar(): bool
{
    $enviado = $_POST['csrf'] ?? '';
    return is_string($enviado) && hash_equals($_SESSION['csrf'] ?? '', $enviado);
}

// MENSAGENS (sucesso, erro, aviso)
function flash_definir(string $tipo, string $texto): void
{
    $_SESSION['flash'] = ['tipo' => $tipo, 'texto' => $texto];
}

function flash_exibir(): string
{
    if (empty($_SESSION['flash'])) {
        return '';
    }
    $f = $_SESSION['flash'];
    unset($_SESSION['flash']);
    return '<div class="alerta alerta-' . e($f['tipo']) . '" role="alert">' . e($f['texto']) . '</div>';
}

// CONTROLE DE LOGIN
function usuario_logado(): bool
{
    return !empty($_SESSION['usuario_id']);
}

function exigir_login(): void
{
    // Paginas internas nunca ficam em cache (privacidade)
    header('Cache-Control: no-store, no-cache, must-revalidate');

    if (!usuario_logado()) {
        redirecionar('login.php');
    }
    // Expira apos 2 horas sem atividade
    if (time() - ($_SESSION['ultimo_acesso'] ?? 0) > 7200) {
        session_unset();
        session_destroy();
        header('Location: ' . url('login.php'));
        exit;
    }
    $_SESSION['ultimo_acesso'] = time();
}
