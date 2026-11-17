/**
 * Gravação do fim de uma geração em segundo plano (sucesso ou falha).
 * Se essa escrita se perde, a tela fica em "Gerando" até a limpeza
 * automática, mesmo com o resultado já salvo. Tenta de novo algumas vezes.
 */
export async function writeJobTerminal(
  write: () => PromiseLike<{ error: unknown }>,
  label: string,
  attempts = 3,
): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const { error } = await write();
      if (!error) return true;
    } catch {
      // tenta de novo abaixo
    }
    console.error(`[${label}] falha ao gravar o fim da geração (tentativa ${attempt})`);
    if (attempt < attempts) await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  return false;
}
