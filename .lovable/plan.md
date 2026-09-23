# Correção global e definitiva do sistema de e-mails

## Diagnóstico consolidado

A instalação `unitos-new-teste-02` aparece como **1.4.28**, mas já possui objetos de banco introduzidos no pacote de e-mail posterior. Isso caracteriza aplicação parcial/divergência entre versão declarada e migrations efetivamente aplicadas.

As duas falhas têm a mesma origem:

- `installation_email_credentials` foi criada sem revogação explícita de todos os privilégios herdados por `anon` e `authenticated`;
- a proteção por RLS nega as linhas, mas não substitui a revogação de privilégios de tabela;
- a regra de privilégios padrão remove apenas leitura e escrita de `anon`, deixando capacidades administrativas como `TRUNCATE`, `TRIGGER`, `REFERENCES` e `MAINTAIN` disponíveis para futuras tabelas;
- o verificador detectou corretamente a instalação em estado inseguro/incompleto.

## Correção proposta

### 1. Reparar instalações existentes

Criar uma migration **forward-only e idempotente** no MASTER que:

- só atua se `public.installation_email_credentials` existir;
- revoga `ALL` da tabela para `PUBLIC`, `anon` e `authenticated`;
- concede somente `ALL` ao `service_role`;
- mantém RLS ligada e recria de modo idempotente a política de negação direta;
- revoga execução pública das funções de salvar/remover e concede execução somente ao `service_role`;
- não altera, descriptografa, migra ou apaga chave, remetente, domínio ou histórico.

Essa migration corrige tanto `unitos-new-teste-02` quanto qualquer instalação que já tenha recebido a estrutura defeituosa, independentemente de seu estado atual de privilégios.

### 2. Impedir repetição em novas instalações

Endurecer os privilégios padrão do schema `public`, para os papéis que criam objetos no processo de instalação:

- revogar de `anon` e `authenticated` todos os privilégios automáticos sobre **novas tabelas**;
- conceder acesso por tabela de forma explícita e mínima nas migrations correspondentes;
- preservar `service_role` para operações internas;
- não alterar as RPCs públicas legítimas do Portal nem permissões de tabelas que o aplicativo realmente utiliza pelo navegador.

Além disso, corrigir a migration de origem no pacote gerado para que uma instalação nova já nasça protegida, sem depender da migration reparadora.

### 3. Fortalecer as verificações

Unificar as verificações de segurança para exigir, na tabela de credenciais:

- ausência de `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `TRIGGER`, `REFERENCES` e `MAINTAIN` para `anon` e `authenticated`;
- presença de RLS e da política de negação direta;
- execução das RPCs de salvar/remover somente pelo `service_role`;
- privilégio operacional completo do `service_role`.

Adicionar uma verificação dos privilégios padrão para impedir que uma migration futura recrie o problema.

### 4. Tornar atualização parcial detectável e recuperável

A atualização não deve promover a versão apenas porque parte do delta foi executada. O fluxo deverá:

- comparar versão declarada, ledger de migrations, checkpoints e fingerprint do pacote;
- retomar somente da primeira migration ou instrução não confirmada;
- reaplicar com segurança migrations idempotentes de hardening;
- promover a versão apenas após todas as migrations e verificações obrigatórias passarem;
- classificar divergência como “atualização incompleta — retomável”, sem apagar checkpoints nem recomeçar tudo.

Isso permite atualizar `unitos-new-teste-02` de 1.4.28 para a nova release sem reinstalação e sem tocar nos dados existentes.

## Melhoria global do sistema de e-mails

### Configuração e isolamento

- Manter uma única chave cifrada, remetente e domínio por instalação.
- Manter alteração restrita a SUPER ADMIN e leitura da chave somente no servidor.
- Remover definitivamente qualquer fallback para chave de workspace ou variável compartilhada.
- Fazer tela, teste, convites, Portal e notificações usarem somente `sendBrandEmail` e o mesmo resolvedor.

### Estados e validação

Separar claramente:

1. **Não configurado** — falta chave ou remetente.
2. **Validação indisponível** — Resend não pôde ser consultado; configuração fica salva, sem declarar falha definitiva.
3. **Ação necessária** — chave recusada, domínio ausente ou DNS não verificado.
4. **Pronto** — chave válida e domínio `verified` na mesma conta Resend.
5. **Falha de envio** — configuração pronta, mas uma tentativa específica falhou.

A validação de DNS continua sem enviar mensagem. O teste real continua explícito e registra o resultado.

### Envio e observabilidade

- Manter retry apenas para rede, timeout, HTTP 429 e HTTP 5xx; nunca repetir automaticamente erros 400/401/403.
- Registrar por tentativa: instalação, evento, resultado, código seguro, duração, quantidade de retries e identificador da operação.
- Nunca registrar chave, corpo bruto do provedor ou conteúdo sensível.
- Evitar envio duplicado com uma chave idempotente por evento nos fluxos automáticos.
- Expor no painel a última validação de domínio e o último envio aceito/falho, distinguindo DNS de falha operacional.

## Testes obrigatórios

- Matriz completa de privilégios para `anon`, `authenticated` e `service_role`.
- Instalação nova já protegida desde a criação da tabela.
- Atualização de ambiente antigo/incompleto preservando credencial e remetente.
- Reexecução idempotente da migration de reparo.
- Chave válida com domínio pendente, inválida, ilegível e pronta.
- Envio de teste e todos os produtores usando o mesmo resolvedor.
- Retry sem duplicação e sanitização integral dos erros.
- Regressão da promoção de versão: nenhum ambiente fica marcado como atualizado com migration/verificação pendente.

## Entrega MASTER-first

1. Aplicar migration, código e testes no MASTER.
2. Regenerar `007_delta_migrations.sql`.
3. Sincronizar `delta_version.txt` e `MASTER_RELEASE_VERSION` na nova versão.
4. Atualizar os verificadores Client/Master.
5. Executar testes focados, suíte global sem atalhos, typecheck, build e `bun run master:check`.
6. Reportar resultados e pendências.
7. Publicar somente com autorização explícita.
8. Atualizar primeiro `unitos-new-teste-02`, confirmar PASS e envio controlado; depois propagar individualmente às demais instalações.

## Critérios de aceite

- As duas verificações reportadas passam em instalações existentes e novas.
- `anon` e `authenticated` não possuem acesso direto à tabela de credenciais.
- Nenhuma chave, remetente ou dado existente é perdido.
- A versão só avança quando banco, código e verificações estiverem sincronizados.
- Status exibido, validação e envio usam a mesma configuração por instalação.
- Um teste controlado é aceito pelo Resend e registrado sem exposição de segredo.
