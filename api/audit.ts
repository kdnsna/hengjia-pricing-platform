import { auditLogs } from "@db/schema";
import { ROLE_DEFINITIONS, type AccessUser } from "@contracts/access";
import { getDb } from "./queries/connection";

export async function recordAudit(
  user: AccessUser | null,
  action: string,
  objectType: string,
  objectId: string,
  detail: string,
): Promise<void> {
  const actor = user ? `${user.name}·${ROLE_DEFINITIONS[user.role].shortLabel}` : "系统初始化";
  await getDb().insert(auditLogs).values({ action, actor, objectType, objectId, detail });
}
