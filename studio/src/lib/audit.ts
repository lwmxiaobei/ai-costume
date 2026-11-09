import type { ServiceEnv } from "../env";
import type { SessionAccount } from "./auth";

export interface AuditActor {
  id: string | null;
  email: string | null;
  role: string | null;
}

export interface AuditInput {
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

export function auditActor(user: SessionAccount | null): AuditActor {
  return user
    ? { id: user.id, email: user.email, role: user.role }
    : { id: null, email: null, role: null };
}

function clientAddress(headers: Headers): string | null {
  return headers.get("CF-Connecting-IP") || null;
}

export async function recordAudit(
  env: ServiceEnv,
  actor: AuditActor,
  headers: Headers,
  input: AuditInput,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO audit_logs "
    + "(id, actor_id, actor_email, actor_role, action, target_type, target_id, metadata, ip_address, user_agent) "
    + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    "audit_" + crypto.randomUUID(),
    actor.id,
    actor.email,
    actor.role,
    input.action.slice(0, 80),
    input.targetType?.slice(0, 40) || null,
    input.targetId?.slice(0, 128) || null,
    JSON.stringify(input.metadata || {}).slice(0, 4_000),
    clientAddress(headers),
    headers.get("user-agent")?.slice(0, 256) || null,
  ).run();
}
