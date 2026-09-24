# Correção global: substituição segura de modelos descontinuados

## Objetivo

Garantir que um modelo removido pelo provedor seja substituído imediatamente por outro compatível com o mesmo papel, sem reexecutar migrations históricas, sem trocar as chaves/provedores escolhidos e sem comprometer RBAC, RLS ou autenticação.

## Alterações

1. **Atualizar o catálogo compilado do MASTER**
   - Remover modelos já indisponíveis, começando pelo Anthropic estratégico `claude-opus-4-1`.
   - Definir sucessores atuais por papel e capacidade, mantendo separados estratégico, operacional e imagem.
   - Manter alternativas conservadoras para instalações que ainda não receberam um override dinâmico.

2. **Escolha de sucessor por compatibilidade, não apenas pelo nome**
   - Cruzar a listagem real da conta com uma cadeia aprovada por provedor e papel.
   - Nunca escolher embedding, áudio, transcrição, imagem ou modelo de outra família para texto.
   - Validar o candidato com uma chamada mínima antes de promovê-lo.
   - Se nenhum candidato compatível funcionar, manter a falha explícita e notificar; não trocar de provedor silenciosamente.

3. **Recuperação imediata durante o uso**
   - Ao receber erro terminal de modelo ausente/descontinuado, tentar o próximo modelo compatível no mesmo provedor.
   - Gravar o modelo validado como override para as chamadas seguintes e invalidar o cache imediatamente.
   - Limitar tentativas para evitar custo duplicado e preservar o fallback entre provedores apenas para falhas transitórias.

4. **Monitoramento preventivo**
   - Fazer o health check diário usar a mesma regra canônica de sucessão do runtime.
   - Registrar modelo antigo, sucessor, origem e resultado; notificar Super Admin quando houver troca ou quando nenhuma substituição for possível.
   - Continuar verificando somente provedores com chave própria cadastrada em cada instalação.

5. **Cobertura de regressão**
   - Modelo estratégico Anthropic removido → sucessor compatível e disponível.
   - Candidato listado mas inválido → não é promovido; tenta o próximo aprovado.
   - Modelo ausente no runtime → troca uma única vez, conclui e persiste override.
   - Erro de chave, quota ou request inválido → não é confundido com descontinuação.
   - Nenhum modelo compatível → falha clara, sem loop e sem troca indevida de provedor.

## Entrega MASTER-first

- Alterar somente código e testes atuais; nenhuma migration histórica será reexecutada ou modificada.
- Se não houver mudança de schema, `verify-installation.sql` permanece sem nova checagem estrutural.
- Regenerar o delta, sincronizar `delta_version.txt` e `MASTER_RELEASE_VERSION`, regenerar os artefatos do MASTER e executar `bun run master:check`.
- Rodar testes focados, suíte global, typecheck e validação da aplicação sem aumentar timeout, pular testes ou mascarar falhas.
- Publicação e propagação ficam aguardando autorização explícita.

## Fora de escopo

Não cadastrar chaves ausentes de OpenAI/Gemini, não mudar o provedor selecionado pela Casa 8 e não alterar RBAC, RLS, autenticação ou dados de clientes.
