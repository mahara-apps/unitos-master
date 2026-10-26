# Provedor principal automático e avisos de saúde das IAs

## Regras
- Groq é somente fallback: nunca aparece como opção de principal e só é chamado quando o principal falha (indisponível, limite de uso, sem crédito, resposta recusada).
- Ao salvar uma chave válida de Gemini, OpenAI ou Anthropic, esse provedor vira o principal automaticamente, sem passo extra.
- Se a chave salva for recusada pelo provedor, ela não vira principal (o principal atual é mantido).
- Ao remover a chave do principal: se houver outro principal (Gemini/OpenAI/Anthropic) com chave válida, ele assume automaticamente; senão, fica "sem principal" e o aviso aparece.
- A troca automática fica registrada no histórico de chaves de IA (quem, quando, de qual para qual).

## Avisos visuais (Admin/Owner do workspace e Super Admin)
Faixa no topo de Conexões → IA, selo no menu lateral e notificação no sino, com a ação para resolver:
1. **Sem provedor principal** — só Groq ou nenhuma chave cadastrada.
2. **Chave recusada** — o provedor rejeitou a chave (inválida ou revogada).
3. **Sem crédito** — o provedor respondeu que acabou o saldo/crédito.
4. **Limite de uso / instabilidade** — muitas recusas temporárias seguidas.
5. **Rodando só no fallback** — o principal falhou e as gerações estão indo para o Groq.
6. **Fallback indisponível** — Groq sem chave ou com chave recusada (aviso mais leve).
7. **Limite de gasto mensal** — reaproveita os alertas 80/95/100% já existentes.

Os avisos somem sozinhos quando o próximo teste ou geração der certo. Notificações não se repetem para o mesmo problema no mesmo dia. Usuários comuns veem apenas "A IA está temporariamente indisponível, fale com o administrador".

O Super Admin vê no painel de Instalações um resumo por instalação (ex.: Casa 8: "sem principal").

## Sugestões para decidir (respondam no chat)
- **A.** Botão "Testar todos os provedores" com resultado lado a lado.
- **B.** Ordem de reserva entre principais (ex.: Gemini → Anthropic → Groq) em vez de só Groq.
- **C.** Restringir cadastrar/remover chaves a Owner/Admin (hoje qualquer membro pode — pendência já apontada).
- **D.** Teste automático de cada principal a cada 6 h, em vez de diário.
- **E.** E-mail para o Owner quando a IA ficar sem principal ou sem crédito.

Nada disso entra sem confirmação; a regra B contraria "Groq é o único fallback" e só muda se vocês pedirem.

## Detalhes técnicos
- `set_provider_connection`: novo parâmetro para gravar `text_primary_provider` na mesma transação quando a chave é de provedor principal e `verified <> 'invalid'`; `remove_provider_connection` promove o próximo principal válido ou zera.
- `saveProviderKey`/`testProviderKey` passam esse parâmetro; `orderedUsableTextProviders` permanece igual (principal + Groq).
- Novo `src/lib/ai-provider-health.ts` (puro): deriva a lista de avisos a partir do painel, credenciais, últimas falhas classificadas (`classifyAiError`: quota/credit, auth, rate_limit) e uso de fallback em `activity_events`; server fn somente para Owner/Admin/Super Admin.
- Notificações deduplicadas por workspace/tipo/dia, geradas no health check diário e após falhas de geração.
- Testes: chave válida vira principal; chave recusada não troca; remover principal promove outro ou zera; Groq nunca vira principal; cada aviso aparece e some no caso certo; usuário comum não vê detalhes.
- MASTER-first: migration, `build_delta.py`, `delta_version.txt` = `MASTER_RELEASE_VERSION` (1.4.81), `verify-installation` cobrindo as RPCs alteradas, `bun run master:check`. Publicação e atualização da Casa 8 só com autorização.
- Instalações existentes: na atualização, workspaces com principal vazio ou desconectado e exatamente um principal válido recebem esse como principal (sem apagar nada).
