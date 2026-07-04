// Mocked AI actions — replace with real OpenAI/Anthropic calls later.

export async function generateCopy(prompt: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 1400));
  return `✨ ${prompt.trim() || "Ideia inicial"}\n\nDescubra como o NexusFlow acelera sua produção de conteúdo com IA. Fluxo unificado, aprovações em tempo real e resultados mensuráveis. #IA #Marketing`;
}

export async function generateImage(prompt: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 1800));
  // Placeholder image URL — swap with real generation later.
  const seed = encodeURIComponent(prompt || "nexusflow");
  return `https://picsum.photos/seed/${seed}/800/600`;
}