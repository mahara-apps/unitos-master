export type ResendUiError =
  | "credencial_invalida"
  | "dominio_remetente_nao_verificado"
  | "conta_resend_em_modo_teste"
  | "resend_sem_permissao_de_envio"
  | "remetente_instalacao_nao_configurado"
  | "resend_nao_configurado";

/** Tradução única dos códigos seguros retornados pela camada Resend. */
export function emailSendErrorMessage(error?: string): string {
  if (error === "credencial_invalida") return "A chave da API do Resend foi recusada.";
  if (error === "dominio_remetente_nao_verificado")
    return "O domínio do remetente ainda não foi verificado no Resend.";
  if (error === "conta_resend_em_modo_teste")
    return "O Resend está em modo de teste e só permite enviar para o e-mail da própria conta.";
  if (error === "resend_sem_permissao_de_envio")
    return "A chave não possui permissão para enviar e-mails no Resend.";
  if (error === "remetente_instalacao_nao_configurado")
    return "Configure o remetente institucional desta instalação antes de enviar e-mails.";
  if (error === "resend_nao_configurado") return "O canal de e-mail ainda não foi configurado.";
  return error ? `Não enviado: ${error}` : "Não enviado";
}