<?php
declare(strict_types=1);

// CARREGA CONFIGURACOES
function config(): array
{
    static $cfg = null;
    if ($cfg === null) {
        $cfg = require __DIR__ . '/../config/config.php';
    }
    return $cfg;
}

// CONEXAO PDO (uma unica vez por requisicao)
function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = config()['db'];
        $dsn = "mysql:host={$c['host']};dbname={$c['nome']};charset={$c['charset']}";
        try {
            $pdo = new PDO($dsn, $c['usuario'], $c['senha'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $e) {
            // Nunca mostrar detalhes do erro ao usuario
            error_log('Erro de conexao: ' . $e->getMessage());
            http_response_code(500);
            exit('Erro ao conectar ao banco de dados.');
        }
    }
    return $pdo;
}
