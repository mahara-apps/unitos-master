# Carrossel: texto de cada arte gerado junto com a legenda

## Resposta direta
Hoje o texto de cada arte do carrossel **não existe em lugar nenhum**. Quando a pauta vira peça, os agentes escrevem:
- a legenda (sempre);
- o roteiro (só para vídeo: Reels, Stories em vídeo, TikTok, YouTube);
- a direção visual.

Para Carrossel, nenhum agente escreve "quantas artes" nem "o texto de cada uma". Por isso a legenda da tela acaba tentando contar a história inteira em um parágrafo.

## O que muda
1. **Novo passo dos agentes, só para Carrossel:** depois da direção visual e antes da legenda, o roteirista escreve o carrossel arte por arte:
   - quantidade de artes (entre 3 e 10; a IA escolhe conforme o tema, padrão 5 a 7);
   - para cada arte: número, título curto (texto grande da arte), texto de apoio (opcional) e uma nota rápida para o designer;
   - a primeira arte é sempre o gancho, e a última é sempre a chamada para ação.
2. **A legenda passa a conversar com o carrossel:** ela recebe o roteiro das artes como contexto, então complementa em vez de repetir tudo.
3. **Onde aparece na peça:** um bloco novo **"Textos das artes (N artes)"**, logo acima da Legenda, só quando o formato é Carrossel. Ele mostra "Arte 1 de 6 — título / apoio / nota", e cada texto pode ser editado e copiado. A Legenda continua no mesmo campo de hoje.
4. **Peças que já existem:** o botão "Refazer" gera também os textos das artes. Peças que não forem refeitas ficam como estão; nada é apagado.
5. **Mudar o formato da peça para Carrossel** mostra o bloco vazio, com o botão "Gerar textos das artes".

## Fora do escopo
- Não gera imagens (a IA do sistema é só texto).
- O número de artes é só uma recomendação: não limita quantas mídias podem ser anexadas.
- A publicação na Meta não muda.

## Detalhes técnicos
- `src/lib/post-agents.server.ts`: incluir o passo `carousel_slides` quando o formato for Carrossel, usando o roteirista social e `CarouselSchema { slides: [{ title, body, design_note }] }`. O schema é portátil, sem limites rígidos. A normalização acontece depois: de 3 a 10 artes, corte de tamanho dos textos e descarte de artes sem título. A saída tem um limite explícito de tamanho, e uma resposta cortada (`finishReason length`) é tratada como `output_truncated`. A resposta em pt-BR é validada e, se vier em inglês, a geração é repetida. A peça é recuperada com `salvageStructuredOutput`, como já é feito nos outros passos.
- Armazenamento: o roteiro do carrossel fica no campo `script` da peça, que hoje fica vazio para Carrossel, em formato estruturado (JSON com marcador `kind: "carousel"`). Um parser puro em `src/lib/carousel-slides.ts` lê esse formato e também aceita texto livre antigo. Sem tabela nova. Se o schema precisar de coluna, fazemos uma migration aditiva com o fluxo MASTER-first completo.
- `src/components/content/task-dialog.tsx`: novo componente `CarouselSlidesEditor`, exibido quando `format === carrossel`. Ele salva pelo mesmo caminho de salvamento da peça. RBAC e RLS continuam iguais.
- Prompt da legenda: recebe os títulos das artes como contexto.
- Testes: normalizador (limites de 3 a 10 artes, descarte de arte sem título, ordem preservada), parser (JSON e texto antigo) e escolha dos passos (Carrossel inclui `carousel_slides`; Feed e Reels não incluem).
- MASTER-first: delta, `delta_version.txt` e `MASTER_RELEASE_VERSION` alinhados, e `master:check` executado. Publicação só com autorização.
