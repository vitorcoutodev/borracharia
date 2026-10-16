<?php
declare(strict_types=1);

// FUNCOES AUXILIARES: TELEFONE, PLACA E BUSCA

function so_digitos(string $texto): string
{
    return preg_replace('/\D+/', '', $texto) ?? '';
}

// Guarda so os digitos (DDD + numero). Remove o 55 do pais se vier junto.
function normalizar_telefone(string $texto): string
{
    $d = so_digitos($texto);
    if (strlen($d) >= 12 && str_starts_with($d, '55')) {
        $d = substr($d, 2);
    }
    return $d;
}

// Aceita 10 digitos (fixo) ou 11 digitos (celular), ja com DDD
function telefone_valido(string $digitos): bool
{
    return (bool) preg_match('/^[1-9][0-9][0-9]{8,9}$/', $digitos);
}

function telefone_formatar(string $d): string
{
    if (strlen($d) === 11) {
        return '(' . substr($d, 0, 2) . ') ' . substr($d, 2, 5) . '-' . substr($d, 7);
    }
    if (strlen($d) === 10) {
        return '(' . substr($d, 0, 2) . ') ' . substr($d, 2, 4) . '-' . substr($d, 6);
    }
    return $d;
}

// Placa: maiusculas, sem tracos e sem espacos
function placa_normalizar(string $texto): string
{
    return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $texto) ?? '');
}

// Vazio e permitido (veiculo sem placa). Formato antigo (ABC1234) ou Mercosul (ABC1D23)
function placa_valida(string $placa): bool
{
    return $placa === '' || (bool) preg_match('/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/', $placa);
}

function placa_formatar(?string $placa): string
{
    if ($placa === null || $placa === '') {
        return 'Sem placa';
    }
    if (preg_match('/^[A-Z]{3}[0-9]{4}$/', $placa)) {
        return substr($placa, 0, 3) . '-' . substr($placa, 3);
    }
    return $placa;
}

// Escapa % e _ para a pesquisa LIKE nao tratar como curinga
function like_escape(string $texto): string
{
    return addcslashes($texto, '%_\\');
}

function data_hora_br(string $data): string
{
    $t = strtotime($data);
    return $t ? date('d/m/Y H:i', $t) : '';
}
