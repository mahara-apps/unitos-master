# Acesso travado em "Preparando seu espaço..." (ZAHA e Casa 8)

## O que já está confirmado
- A tela que trava é a de entrada da área logada. Ela só sai dali quando o sistema termina de ler quem é a pessoa logada.
- Essa leitura tem um limite de 6 segundos para consultar o servidor. Se o limite estoura, o sistema recorre à sessão salva no navegador, **mas essa segunda leitura não tem limite nenhum**.
- As duas leituras disputam a mesma "trava" interna do navegador. Se a primeira ficar presa (rede lenta, renovação de login emperrada, várias abas do Unitos abertas ao mesmo tempo), a segunda espera para sempre. Resultado: o carregamento gira sem fim.
- Isso explica por que o problema é inconsistente: depende do navegador, das abas abertas e do momento em que o login está sendo renovado. Também explica por que aparece em todas as instalações e com contas diferentes, já que é o mesmo código do MASTER.
- A causa exata ainda não foi reproduzida aqui. No navegador automático que uso, o problema não aparece. O ponto acima é a falha concreta encontrada no código, e se encaixa nos relatos.

## O que vou corrigir no MASTER
1. **Limite de tempo total:** a entrada não espera mais de cerca de 8 segundos no total, nem na leitura de reserva.
2. **Saída clara em vez de girar para sempre:** se o limite estourar, aparece a mensagem "Não conseguimos confirmar seu acesso", com os botões "Tentar novamente" e "Entrar novamente". O segundo limpa a sessão travada daquele navegador e leva ao login.
3. **Destravar a renovação presa:** quando a leitura estourar, o sistema força uma nova leitura e evita que as várias abas do Unitos fiquem esperando umas pelas outras.
4. **Registro do motivo:** cada travamento grava no console um aviso com o tempo de espera e o ponto em que parou. Assim, o próximo relato chega com prova.
5. **Testes:** um teste automático simula a leitura que nunca responde e confirma que a tela sai do carregamento dentro do limite.

## Segurança
- Login, papéis e permissões continuam como estão. O servidor segue conferindo o acesso em toda ação.
- Sem a sessão confirmada, ninguém entra. A mudança só troca o carregamento infinito por uma saída clara.

## Entrega
- Sigo o fluxo MASTER-first: testes, pacote, versão sincronizada e `master:check`.
- Publico só com a sua autorização. Depois, cada instalação (ZAHA e Casa 8) precisa clicar em "Atualizar".

## Enquanto isso (paliativo para os usuários)
- Fechar todas as abas do Unitos e abrir apenas uma.
- Se continuar travando, sair e entrar de novo ou limpar os dados do site no navegador.

## Detalhes técnicos
- `src/lib/auth-cache.ts` `resolveUser`: colocar `local` (`getSession`) também em `Promise.race` com timeout. Timeout global → retorna estado `"timeout"` distinto de `null` (sem sessão), para não confundir erro com ausência.
- `src/routes/_authenticated/route.tsx`: no `beforeLoad`, o estado `"timeout"` renderiza `errorComponent`/tela de recuperação, em vez de redirecionar ou ficar pendente. "Entrar novamente" chama `supabase.auth.signOut({ scope: "local" })` e `clearCachedUser()`.
- Teste em `tests/auth-cache.unit.test.ts` com mocks que nunca resolvem, usando fake timers.
