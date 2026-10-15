<?php
// Cria o primeiro usuario. Uso: /opt/lampp/bin/php banco/criar_admin.php
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Execute apenas pelo terminal.');
}
require_once __DIR__ . '/../includes/db.php';

function perguntar(string $texto, bool $oculto = false): string
{
    echo $texto;
    if ($oculto) { shell_exec('stty -echo'); }
    $valor = trim((string) fgets(STDIN));
    if ($oculto) { shell_exec('stty echo'); echo PHP_EOL; }
    return $valor;
}

$nome = perguntar('Nome completo: ');
$usuario = perguntar('Usuario (letras minusculas, numeros, . _ -): ');
$senha = perguntar('Senha (minimo 8 caracteres): ', true);

if ($nome === '' || !preg_match('/^[a-z0-9._-]{3,30}$/', $usuario) || strlen($senha) < 8) {
    exit("Dados invalidos. Nada foi salvo.\n");
}

$st = db()->prepare('SELECT COUNT(*) FROM usuarios WHERE usuario = :u');
$st->execute([':u' => $usuario]);
if ($st->fetchColumn() > 0) {
    exit("Esse usuario ja existe.\n");
}

$st = db()->prepare('INSERT INTO usuarios (nome, usuario, senha) VALUES (:n, :u, :s)');
$st->execute([':n' => $nome, ':u' => $usuario, ':s' => password_hash($senha, PASSWORD_DEFAULT)]);
echo "Usuario criado com sucesso.\n";
