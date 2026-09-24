/**
 * Installation Manager — guardas server-only.
 *
 * O módulo é EXCLUSIVO da instalação MASTER. A checagem acontece aqui, no
 * servidor: nenhuma instalação cliente consegue ler/escrever o registro de
 * instalações mesmo chamando a server function diretamente.
 */

import { isMasterInstallation } from "./manager-contract";
import { readRuntimeEnv } from "@/lib/runtime-env.server";

export class NotMasterInstallationError extends Error {
  code = "installation_manager_indisponivel" as const;
  constructor() {
    super("O módulo de Instalações existe apenas na instalação MASTER do Unitos.");
    this.name = "NotMasterInstallationError";
  }
}

/** Lê o ambiente do processo (nunca em escopo de módulo). */
export function detectMaster(): boolean {
  return isMasterInstallation({
    supabaseUrl: readRuntimeEnv("SUPABASE_URL"),
    appUrl: readRuntimeEnv("PUBLIC_APP_URL"),
    role: readRuntimeEnv("UNITOS_INSTALLATION_ROLE"),
  });
}

/** Fail-closed: fora do MASTER toda operação do módulo é recusada. */
export function assertMasterInstallation(): void {
  if (!detectMaster()) throw new NotMasterInstallationError();
}
