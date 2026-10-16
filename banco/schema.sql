-- SCHEMA BORRACHARIA (seguro: nao apaga dados)
-- Importar pelo phpMyAdmin: selecione o banco borracharia > aba Importar

CREATE TABLE IF NOT EXISTS usuarios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  usuario VARCHAR(50) NOT NULL,
  senha VARCHAR(255) NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clientes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  telefone VARCHAR(20) NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE usuarios ENGINE=InnoDB;
ALTER TABLE clientes ENGINE=InnoDB;
ALTER TABLE usuarios CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE clientes CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE usuarios MODIFY id INT UNSIGNED NOT NULL AUTO_INCREMENT;
ALTER TABLE usuarios MODIFY senha VARCHAR(255) NOT NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ativo TINYINT(1) NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_usuario ON usuarios (usuario);

ALTER TABLE clientes MODIFY id INT UNSIGNED NOT NULL AUTO_INCREMENT;
ALTER TABLE clientes MODIFY telefone VARCHAR(20) NOT NULL;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS ativo TINYINT(1) NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes (nome);
CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes (telefone);

CREATE TABLE IF NOT EXISTS veiculos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT UNSIGNED NOT NULL,
  modelo VARCHAR(80) NOT NULL,
  placa VARCHAR(10) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_veiculos_cliente (cliente_id),
  INDEX idx_veiculos_placa (placa),
  CONSTRAINT fk_veiculos_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS servicos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  descricao VARCHAR(255) NULL,
  preco_padrao DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS atendimentos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT UNSIGNED NOT NULL,
  veiculo_id INT UNSIGNED NULL,
  usuario_id INT UNSIGNED NULL,
  total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  observacoes VARCHAR(255) NULL,
  status ENUM('finalizado','cancelado') NOT NULL DEFAULT 'finalizado',
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_atend_data (criado_em),
  INDEX idx_atend_cliente (cliente_id),
  CONSTRAINT fk_atend_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON DELETE RESTRICT,
  CONSTRAINT fk_atend_veiculo FOREIGN KEY (veiculo_id)
    REFERENCES veiculos (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS atendimento_servicos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  atendimento_id INT UNSIGNED NOT NULL,
  servico_id INT UNSIGNED NOT NULL,
  quantidade INT UNSIGNED NOT NULL DEFAULT 1,
  preco_unitario DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_as_atendimento FOREIGN KEY (atendimento_id)
    REFERENCES atendimentos (id) ON DELETE RESTRICT,
  CONSTRAINT fk_as_servico FOREIGN KEY (servico_id)
    REFERENCES servicos (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pagamentos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  atendimento_id INT UNSIGNED NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  forma ENUM('dinheiro','pix','cartao_debito','cartao_credito','outro') NOT NULL,
  pago_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id INT UNSIGNED NULL,
  INDEX idx_pag_atendimento (atendimento_id),
  CONSTRAINT fk_pag_atendimento FOREIGN KEY (atendimento_id)
    REFERENCES atendimentos (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS planos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(80) NOT NULL,
  preco DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  descricao VARCHAR(255) NULL,
  duracao_dias INT UNSIGNED NOT NULL DEFAULT 30,
  ativo TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plano_beneficios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  plano_id INT UNSIGNED NOT NULL,
  descricao VARCHAR(150) NOT NULL,
  limite_utilizacoes INT UNSIGNED NULL,
  CONSTRAINT fk_pb_plano FOREIGN KEY (plano_id)
    REFERENCES planos (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cliente_planos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT UNSIGNED NOT NULL,
  plano_id INT UNSIGNED NOT NULL,
  data_inicio DATE NOT NULL,
  data_vencimento DATE NOT NULL,
  status ENUM('ativo','vencido','cancelado') NOT NULL DEFAULT 'ativo',
  INDEX idx_cp_vencimento (status, data_vencimento),
  CONSTRAINT fk_cp_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON DELETE RESTRICT,
  CONSTRAINT fk_cp_plano FOREIGN KEY (plano_id)
    REFERENCES planos (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS utilizacoes_planos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cliente_plano_id INT UNSIGNED NOT NULL,
  plano_beneficio_id INT UNSIGNED NOT NULL,
  atendimento_id INT UNSIGNED NULL,
  usado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observacao VARCHAR(255) NULL,
  CONSTRAINT fk_up_cp FOREIGN KEY (cliente_plano_id)
    REFERENCES cliente_planos (id) ON DELETE RESTRICT,
  CONSTRAINT fk_up_beneficio FOREIGN KEY (plano_beneficio_id)
    REFERENCES plano_beneficios (id) ON DELETE RESTRICT,
  CONSTRAINT fk_up_atendimento FOREIGN KEY (atendimento_id)
    REFERENCES atendimentos (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS configuracoes (
  chave VARCHAR(50) NOT NULL PRIMARY KEY,
  valor VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
