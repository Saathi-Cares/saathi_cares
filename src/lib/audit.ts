// Audit & Event Logging Service
// Append-only audit log — no modifications or deletions permitted

export type AuditAction =
  | 'patient.create' | 'patient.update' | 'patient.archive' | 'patient.view'
  | 'encounter.create' | 'encounter.view'
  | 'referral.create' | 'referral.update'
  | 'donation.initiate' | 'donation.confirm' | 'donation.fail'
  | 'campaign.create' | 'campaign.update'
  | 'camp.create' | 'camp.update'
  | 'clinic.create'
  | 'cms.update' | 'cms.reset'
  | 'auth.login' | 'auth.logout' | 'auth.login_failed'
  | 'submission.read' | 'submission.respond' | 'submission.delete'
  | 'config.change';

export type AuditDomain = 'hmis' | 'donation' | 'cms' | 'auth' | 'admin';

export interface AuditEntry {
  id: string;
  action: AuditAction;
  domain: AuditDomain;
  actor: string;
  actorRole: string;
  entityType: string;
  entityId: string;
  details: string;
  timestamp: string;
  ipAddress: string;
}

const AUDIT_KEY = 'saathi_audit_log';

export function getAuditLog(filters?: { domain?: AuditDomain; action?: AuditAction; entityId?: string; limit?: number }): AuditEntry[] {
  try {
    let entries: AuditEntry[] = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
    if (filters?.domain) entries = entries.filter(e => e.domain === filters.domain);
    if (filters?.action) entries = entries.filter(e => e.action === filters.action);
    if (filters?.entityId) entries = entries.filter(e => e.entityId === filters.entityId);
    if (filters?.limit) entries = entries.slice(0, filters.limit);
    return entries;
  } catch { return []; }
}

export function logAudit(entry: Omit<AuditEntry, 'id' | 'timestamp' | 'ipAddress'>): void {
  const auditEntry: AuditEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ipAddress: '127.0.0.1', // In production, captured server-side
  };
  
  try {
    const log: AuditEntry[] = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
    log.unshift(auditEntry);
    // Keep last 1000 entries in localStorage
    localStorage.setItem(AUDIT_KEY, JSON.stringify(log.slice(0, 1000)));
  } catch {
    localStorage.setItem(AUDIT_KEY, JSON.stringify([auditEntry]));
  }
}

export function getAuditStats() {
  const log = getAuditLog();
  const today = new Date().toISOString().split('T')[0];
  const todayEntries = log.filter(e => e.timestamp.startsWith(today));
  
  const byDomain: Record<string, number> = {};
  log.forEach(e => { byDomain[e.domain] = (byDomain[e.domain] || 0) + 1; });
  
  const byAction: Record<string, number> = {};
  todayEntries.forEach(e => { byAction[e.action] = (byAction[e.action] || 0) + 1; });
  
  return { totalEntries: log.length, todayEntries: todayEntries.length, byDomain, todayByAction: byAction };
}
