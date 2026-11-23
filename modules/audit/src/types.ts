/** Free-form values an entry carries (the server's property bag). */
export type PropertyBag = Record<string, unknown>;

/** An audit entry as `GET /api/v1/qcli/audit` returns it. */
export interface AuditEntryDto {
  id: string;
  timestamp: number;       // Unix time in milliseconds
  event: string;
  username: string;        // The user the event is about
  userId?: string;
  details?: string;
  actor?: string;          // Who performed the action
  actorId?: string;
  target?: string;         // What the event is about when it is not a user (group:admins, a job, ...)
  properties?: PropertyBag;
  metadata?: { remoteAddress?: string; sessionId?: string; mode?: string; tokenName?: string } & Record<string, unknown>;
}
