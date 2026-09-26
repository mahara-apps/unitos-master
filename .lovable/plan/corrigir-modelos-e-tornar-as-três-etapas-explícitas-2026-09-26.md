# Corrigir modelos e tornar as três etapas explícitas

## Resultado esperado

- O campo **Modelo de IA** exibirá todas as conexões de texto realmente utilizáveis da conta, incluindo **Groq e Gemini** na NXT.
- O fluxo continuará com três etapas, conforme escolhido:
  1. Escopo, modelo e projeto
  2. Canais e quantidade de peças por canal
  3. Quantidade por formato em cada canal
- A pessoa verá claramente as três etapas antes de avançar, sem parecer que a primeira tela é o formulário inteiro.

## Alterações

- Ajustar o indicador superior para mostrar os nomes **Escopo**, **Canais** e **Formatos**, com etapa atual e etapas concluídas claramente diferenciadas.
- Manter o botão **Continuar** levando à seleção de canais/quantidades e depois aos formatos; revisar bloqueios e mensagens para que nenhuma escolha fique oculta ou pareça automática.
- Garantir que o seletor liste um item por provedor ativo com chave válida, sem limitar a lista ao provedor principal ou ao fallback.
- Diferenciar visualmente o modelo padrão dos demais, sem chamar todo modelo não principal de “fallback”.
- Preservar a seleção completa até a geração e confirmar que canal, quantidade e distribuição por formato chegam ao gerador sem alteração.

## Validação

- Cobrir Groq + Gemini ativos no mesmo workspace e confirmar que ambos aparecem e podem ser selecionados.
- Testar a sequência completa das três etapas, inclusive voltar e avançar sem perder escolhas.
- Confirmar a geração com diferentes canais, quantidades e formatos.
- Executar testes focados, tipos e os guardiões obrigatórios do MASTER.

## Entrega MASTER-first

- Incorporar os ajustes ao pacote MASTER posterior à 1.4.44, mantendo versão, hash e artefatos sincronizados.
- Não publicar nem atualizar instalações durante a implementação.
- Depois da validação local, solicitar autorização explícita para publicar o MASTER e outra autorização para atualizar a NXT.
- Após a atualização autorizada, validar o fluxo real na NXT e só então liberar a mesma versão para as demais instalações.
