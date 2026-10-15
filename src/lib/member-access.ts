/**
 * Regra de quem pode reenviar acesso / definir senha provisória de um membro.
 * Somente Super Admin e Admin/Owner do workspace (autoridade "admin").
 * Manager e User nunca. Admin não altera Owner nem Super Admin. Ninguém altera a si mesmo.
 */
export type MemberAccessCheck = {
  actorAuthority: string | null | undefined;
  actorId: string;
  targetId: string;
  targetRole: string | null | undefined;
  targetIsSuperAdmin: boolean;
};

export function memberAccessDenial(c: MemberAccessCheck): string | null {
  if (c.actorAuthority !== "super_admin" && c.actorAuthority !== "admin") {
    return "Somente Super Admin e Admin podem gerenciar o acesso de membros.";
  }
  if (c.actorId === c.targetId) return "Para alterar a sua própria senha, use o seu Perfil.";
  if (c.actorAuthority !== "super_admin") {
    if (c.targetIsSuperAdmin) return "Somente Super Admin pode alterar o acesso de outro Super Admin.";
    if (c.targetRole === "owner") return "Somente Super Admin pode alterar o acesso do Owner.";
  }
  return null;
}

export function canManageMemberAccess(c: MemberAccessCheck): boolean {
  return memberAccessDenial(c) === null;
}

export const TEMP_PASSWORD_MIN = 8;

export function generateTempPassword(length = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[arr[i] % alphabet.length];
  return out;
}
