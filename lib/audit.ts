/**
 * Helper para registrar cambios en audit_log.
 * Llamar desde APIs que mutan datos importantes.
 */
import { createServerClient } from "@/lib/supabase-server";
import type { AuthSession } from "@/lib/types";

export interface AuditEntry {
  entity_type: "lead" | "payment" | "client" | "renewal" | "team_member" | "refund";
  entity_id: string;
  field?: string;
  old_value?: string | number | null;
  new_value?: string | number | null;
  action?: "create" | "update" | "delete" | "merge" | "apply_refund" | string;
}

export async function logAudit(session: AuthSession | null, entry: AuditEntry): Promise<void> {
  try {
    const sb = createServerClient();
    await sb.from("audit_log").insert({
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      field: entry.field || null,
      old_value: entry.old_value === undefined || entry.old_value === null ? null : String(entry.old_value),
      new_value: entry.new_value === undefined || entry.new_value === null ? null : String(entry.new_value),
      changed_by_id: session?.team_member_id || null,
      changed_by_nombre: session?.nombre || null,
      action: entry.action || "update",
    });
  } catch (err) {
    // Silenciar errores de audit para no romper la operación principal
    console.error("[logAudit]", err);
  }
}

/**
 * Logger más conveniente para múltiples campos en un mismo PATCH.
 */
export async function logAuditPatch(
  session: AuthSession | null,
  entityType: AuditEntry["entity_type"],
  entityId: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>
): Promise<void> {
  const sb = createServerClient();
  const entries = Object.keys(newValues).filter((k) => {
    const ov = oldValues[k];
    const nv = newValues[k];
    if (ov === nv) return false;
    if (ov == null && nv == null) return false;
    return true;
  });
  if (entries.length === 0) return;

  try {
    await sb.from("audit_log").insert(
      entries.map((field) => ({
        entity_type: entityType,
        entity_id: entityId,
        field,
        old_value: oldValues[field] === undefined || oldValues[field] === null ? null : String(oldValues[field]),
        new_value: newValues[field] === undefined || newValues[field] === null ? null : String(newValues[field]),
        changed_by_id: session?.team_member_id || null,
        changed_by_nombre: session?.nombre || null,
        action: "update",
      }))
    );
  } catch (err) {
    console.error("[logAuditPatch]", err);
  }
}
