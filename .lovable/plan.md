# Auditoria: nenhuma IA do Lovable + Supabase externo

## Resultado da auditoria (verificado agora no código e no ambiente)

### IA — 100% com chaves próprias, zero Lovable
- Nenhuma chamada a `ai.gateway.lovable.dev` em todo o `src/`.
- `src/lib/ai-provider.server.ts` cria os provedores direto: OpenAI, Anthropic, Google (Gemini) e Groq, sempre com a chave da marca (`createOpenAI/createAnthropic/createGoogleGenerativeAI/createGroq`).
- Embeddings vão direto para `api.openai.com/v1/embeddings` ou `generativelanguage.googleapis.com`.
- Imagens vão direto para `api.openai.com/v1/images/generations` ou Google (Imagen/Gemini).
- Nenhum modelo do catálogo Lovable é usado; nenhum arquivo de IA lê `LOVABLE_API_KEY`.

### Banco de dados — Supabase externo
- URL em uso: `https://tkjbhttylouamqxnbfgv.supabase.co`, resolvida por variáveis de ambiente (`SUPABASE_URL` / `VITE_SUPABASE_URL`).
- Ambiente reporta o Supabase como **externo, não gerenciado** pelo Lovable Cloud.
- Cliente do navegador, cliente de serviço e middleware de autenticação leem tudo de variáveis de ambiente — nada fixo em código além do fallback público desta instalação.
- Nenhuma Edge Function do Supabase: toda a lógica de servidor está em server functions do próprio app.

### Único ponto ainda ligado ao Lovable (não é IA)
`src/lib/email/resend.server.ts` tem uma rota alternativa de envio de e-mail:
quando existe `LOVABLE_API_KEY` e a chave cadastrada **não** começa com `re_`,
o envio passa por `connector-gateway.lovable.dev/resend/emails` em vez de
`api.resend.com`. Em produção, com chave `re_` própria, essa rota nunca é usada
— mas o caminho existe no código e é a última dependência do Lovable no runtime.

## Plano de correção (1 ajuste cirúrgico)

1. Remover a rota de gateway do Lovable em `src/lib/email/resend.server.ts`:
   envio sempre direto para `api.resend.com` com a chave da instalação
   (`Authorization: Bearer <RESEND_API_KEY / chave do workspace>`).
2. Se a chave configurada não for uma chave própria válida do Resend, falhar com
   mensagem clara em pt-BR ("chave de e-mail não configurada"), sem fallback
   silencioso — mesmo padrão já usado na IA.
3. Ajustar os testes que hoje exercitam o caminho de gateway
   (`tests/email-resend.unit.test.ts`, `tests/email-resend-resilience.unit.test.ts`)
   para cobrir apenas a rota direta e a nova falha explícita.
4. Adicionar um teste-guardião que reprova qualquer uso de `LOVABLE_API_KEY`
   ou de domínios `*.lovable.dev` no runtime do app (`src/`), impedindo
   reintrodução futura.
5. Ciclo MASTER-first: regenerar o pacote delta, atualizar `delta_version.txt`
   e `MASTER_RELEASE_VERSION` com a mesma versão, rodar `bun run master:check`,
   typecheck e build.

Sem mudança de banco, RLS, rotas, permissões ou interface.

## Detalhes técnicos
- Guardião: teste unitário varrendo `src/**` por `LOVABLE_API_KEY` e `lovable.dev`
  (exceção permitida apenas para `previewAuthStorage.ts`, que trata origem do
  preview, e listas de domínio de readiness).
- Nenhuma variável nova de ambiente; `RESEND_API_KEY` permanece opcional.
