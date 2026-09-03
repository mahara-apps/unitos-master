// Server-only: camada ÚNICA de envio de WhatsApp via Evolution API.
//
// Uso previsto: disparos de automações, notificações do sistema e templates.
// Não existe inbox, atendimento, recebimento ou leitura de mensagens aqui.
//
// Contrato: workspace + instância + destinatários (por id) + mensagem.
// Nenhuma automação ou módulo de notificação fala com a Evolution direto.

import { EvolutionApiError, evolutionRequest } from "@/lib/evolution/client.server";
import { EvolutionConfigError } from "@/lib/evolution/config.server";
import { loadInstance, resolveInstanceConfig } from "@/lib/evolution/scope.server";
import { assertBrandMember, assertClientScope } from "@/lib/access-guard";
import { logMessage } from "@/lib/messaging-log.server";
import { maskDestination, toEvolutionNumber, type WhatsappDestination } from "./destination";
import { resolveRecipients, type ResolvedRecipient } from "./recipients.server";
import type { WhatsappRecipientType } from "./types";

type AnySupabase = Parameters<typeof assertBrandMember>[0] & { from: (table: string) => any };

export type WhatsappSendResult = {
  recipientId: string | null;
  type: WhatsappRecipientType | "raw";
  label: string;
  destination: string;
  status: "sent" | "failed" | "skipped";
  providerMessageId: string | null;
  error: string | null;
};

export type WhatsappSendSummary = {
  instanceId: string;
  sent: number;
  failed: number;
  skipped: number;
  results: WhatsappSendResult[];
};

/** Envia um texto para um destino já resolvido e validado. */
export async function sendWhatsappText(
  config: Parameters<typeof evolutionRequest>[0],
  instanceName: string,
  destination: WhatsappDestination,
  message: string,
  options: { budget?: { take: () => boolean }; cooldownKey?: string } = {},
): Promise<{ providerMessageId: string | null }> {
  const { data } = await evolutionRequest<unknown>(config, {
    method: "POST",
    path: `/message/sendText/${encodeURIComponent(instanceName)}`,
    body: { number: toEvolutionNumber(destination), text: message },
    attempts: 2,
    operation: "sendText",
    ...(options.budget ? { budget: options.budget } : {}),
    ...(options.cooldownKey ? { cooldownKey: options.cooldownKey } : {}),
  });
  const record =
    data && typeof data === "object" ? (data as Record<string, unknown>) : ({} as never);
  const key = record["key"] as Record<string, unknown> | undefined;
  const id = (key?.["id"] as string | undefined) ?? (record["id"] as string | undefined) ?? null;
  return { providerMessageId: id };
}


function safeError(error: unknown): string {
  if (error instanceof EvolutionApiError) return error.message;
  if (error instanceof EvolutionConfigError) return error.message;
  return "Falha ao enviar a mensagem pelo WhatsApp.";
}

/**
 * Ponto de entrada para automações e notificações.
 * `actorUserId` nulo indica worker (service_role): a cadeia estrutural continua
 * sendo validada, mas não há checagem de escopo de usuário.
 */
export async function sendWhatsappToRecipients(
  supabase: AnySupabase,
  actorUserId: string | null,
  input: {
    brandId: string;
    instanceId: string;
    recipientIds: string[];
    message: string;
  },
): Promise<WhatsappSendSummary> {
  const message = input.message.trim();
  if (!message) throw new Error("Mensagem vazia.");

  const instance = await loadInstance(supabase, input.brandId, input.instanceId);
  if (actorUserId) {
    await assertBrandMember(supabase, actorUserId, input.brandId);
    if (instance.client_id) await assertClientScope(supabase, actorUserId, instance.client_id);
  }
  if (instance.status !== "connected") {
    throw new Error("A instância de WhatsApp não está conectada.");
  }

  const { resolved, unresolved } = await resolveRecipients(
    supabase,
    actorUserId,
    input.brandId,
    input.recipientIds,
  );

  // Instância vinculada a um cliente só envia para destinatários daquele cliente.
  const eligible: ResolvedRecipient[] = [];
  const results: WhatsappSendResult[] = [];
  for (const r of resolved) {
    if (instance.client_id && r.clientId && r.clientId !== instance.client_id) {
      results.push({
        recipientId: r.recipientId,
        type: r.type,
        label: r.label,
        destination: maskDestination(r.destination),
        status: "skipped",
        providerMessageId: null,
        error: "Destinatário de outro cliente.",
      });
      continue;
    }
    eligible.push(r);
  }

  for (const u of unresolved) {
    results.push({
      recipientId: u.recipientId,
      type: "raw",
      label: u.label ?? u.recipientId,
      destination: "-",
      status: "skipped",
      providerMessageId: null,
      error: u.reason,
    });
  }

  if (!eligible.length) {
    return {
      instanceId: instance.id,
      sent: 0,
      failed: 0,
      skipped: results.length,
      results,
    };
  }

  const config = await resolveInstanceConfig(supabase, input.brandId);
  const actor = actorUserId
    ? ({ kind: "user", userId: actorUserId } as const)
    : ({ kind: "service_role" } as const);

  for (const r of eligible) {
    const clientId = r.clientId ?? instance.client_id ?? null;
    const scope = clientId
      ? ({ scope: "client", brandId: input.brandId, clientId } as const)
      : ({ scope: "workspace", brandId: input.brandId } as const);
    try {
      const { providerMessageId } = await sendWhatsappText(
        config,
        instance.instance_name,
        r.destination,
        message,
      );
      results.push({
        recipientId: r.recipientId,
        type: r.type,
        label: r.label,
        destination: maskDestination(r.destination),
        status: "sent",
        providerMessageId,
        error: null,
      });
      await logMessage(supabase as never, actor, scope, {
        channel: "whatsapp",
        status: "sent",
        recipient: maskDestination(r.destination),
        providerMessageId,
        metadata: { recipient_id: r.recipientId, recipient_type: r.type, instance_id: instance.id },
      }).catch(() => undefined);
    } catch (error) {
      const messageText = safeError(error);
      results.push({
        recipientId: r.recipientId,
        type: r.type,
        label: r.label,
        destination: maskDestination(r.destination),
        status: "failed",
        providerMessageId: null,
        error: messageText,
      });
      await logMessage(supabase as never, actor, scope, {
        channel: "whatsapp",
        status: "failed",
        recipient: maskDestination(r.destination),
        errorMessage: messageText,
        metadata: { recipient_id: r.recipientId, recipient_type: r.type, instance_id: instance.id },
      }).catch(() => undefined);
    }
  }

  return {
    instanceId: instance.id,
    sent: results.filter((r) => r.status === "sent").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  };
}
