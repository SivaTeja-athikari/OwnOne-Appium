import * as SQLite from 'expo-sqlite';
import type { AppEnvironment } from '@/config/environment/types';

export interface Scope { environment: AppEnvironment; userId: string; tenantId: string }
export interface ChecklistItem { id: string; label: string; passed: boolean }
export type ReportOutcome = 'Completed' | 'In progress' | 'Blocked';
export type RiskAssessment = 'Low' | 'Medium' | 'High' | 'Critical';
export interface ReportFields {
  title: string;
  details: string;
  location?: string;
  category?: string;
  priority?: string;
  outcome?: ReportOutcome;
  riskAssessment?: RiskAssessment;
  emergencyContact?: string;
  requiresFollowUp?: boolean;
  followUpDate?: string;
  checklist?: ChecklistItem[];
  signOffName?: string;
  workOrderReference?: string;
  nextAction?: string;
  customFields?: Record<string, string>;
  formSchemaId?: string;
  formSchemaVersion?: number;
}
export interface Report extends ReportFields { id: string; status: 'draft' | 'pending' | 'sent'; createdAt: string; error: string; confirmedAt: string | null }
let opening: Promise<SQLite.SQLiteDatabase> | undefined;
async function database() {
  opening ??= (async () => {
    const db = await SQLite.openDatabaseAsync('ownone-reports.db');
    await db.execAsync(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY NOT NULL, environment TEXT NOT NULL, user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL, title TEXT NOT NULL, details TEXT NOT NULL,
      status TEXT NOT NULL, created_at TEXT NOT NULL, error TEXT NOT NULL DEFAULT '', confirmed_at TEXT);
      CREATE INDEX IF NOT EXISTS reports_scope ON reports(environment,user_id,tenant_id,status);`);
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(reports)');
    const migrations: Record<string, string> = {
      location: "TEXT NOT NULL DEFAULT ''",
      category: "TEXT NOT NULL DEFAULT ''",
      priority: "TEXT NOT NULL DEFAULT ''",
      outcome: "TEXT NOT NULL DEFAULT ''",
      risk_assessment: "TEXT NOT NULL DEFAULT ''",
      emergency_contact: "TEXT NOT NULL DEFAULT ''",
      requires_follow_up: "TEXT NOT NULL DEFAULT ''",
      follow_up_date: "TEXT NOT NULL DEFAULT ''",
      checklist: "TEXT NOT NULL DEFAULT '[]'",
      sign_off_name: "TEXT NOT NULL DEFAULT ''",
      work_order_reference: "TEXT NOT NULL DEFAULT ''",
      next_action: "TEXT NOT NULL DEFAULT ''",
      custom_fields: "TEXT NOT NULL DEFAULT '{}'",
      form_schema_id: "TEXT NOT NULL DEFAULT ''",
      form_schema_version: 'INTEGER NOT NULL DEFAULT 0',
    };
    for (const [column, definition] of Object.entries(migrations)) {
      if (!columns.some(item => item.name === column)) await db.execAsync(`ALTER TABLE reports ADD COLUMN ${column} ${definition};`);
    }
    return db;
  })();
  try { return await opening; } catch (error) { opening = undefined; throw error; }
}
export async function listReports(s: Scope): Promise<Report[]> {
  const rows = await (await database()).getAllAsync<{
    id: string; title: string; details: string; location: string; category: string; priority: string;
    outcome: string; risk_assessment: string; emergency_contact: string; requires_follow_up: string;
    follow_up_date: string; checklist: string; sign_off_name: string; work_order_reference: string; next_action: string;
    custom_fields: string; form_schema_id: string; form_schema_version: number; status: Report['status'];
    createdAt: string; error: string; confirmedAt: string | null;
  }>(
    `SELECT id,title,details,location,category,priority,outcome,risk_assessment,emergency_contact,
      requires_follow_up,follow_up_date,checklist,sign_off_name,work_order_reference,next_action,custom_fields,form_schema_id,form_schema_version,status,created_at AS createdAt,error,
      confirmed_at AS confirmedAt
     FROM reports WHERE environment=? AND user_id=? AND tenant_id=? ORDER BY created_at DESC`,
    s.environment,s.userId,s.tenantId);
  return rows.map(row => ({
    id: row.id, title: row.title, details: row.details, location: row.location || undefined,
    category: row.category || undefined, priority: row.priority || undefined,
    outcome: (row.outcome || undefined) as Report['outcome'],
    riskAssessment: (row.risk_assessment || undefined) as Report['riskAssessment'],
    emergencyContact: row.emergency_contact || undefined,
    requiresFollowUp: row.requires_follow_up === '' ? undefined : row.requires_follow_up === '1',
    followUpDate: row.follow_up_date || undefined,
    checklist: (() => { try { return JSON.parse(row.checklist || '[]') as ChecklistItem[]; } catch { return []; } })(),
    signOffName: row.sign_off_name || undefined,
    workOrderReference: row.work_order_reference || undefined,
    nextAction: row.next_action || undefined,
    customFields: (() => { try { return JSON.parse(row.custom_fields || '{}') as Record<string, string>; } catch { return {}; } })(),
    formSchemaId: row.form_schema_id || undefined,
    formSchemaVersion: row.form_schema_version || undefined,
    status: row.status, createdAt: row.createdAt, error: row.error, confirmedAt: row.confirmedAt,
  }));
}
export async function saveReport(s: Scope, r: Report) {
  const checklist = JSON.stringify(r.checklist ?? []);
  const customFields = JSON.stringify(r.customFields ?? {});
  const followUp = r.requiresFollowUp === undefined ? '' : r.requiresFollowUp ? '1' : '0';
  await (await database()).runAsync(`INSERT INTO reports
    (id,environment,user_id,tenant_id,title,details,status,created_at,error,location,category,priority,
     outcome,risk_assessment,emergency_contact,requires_follow_up,follow_up_date,checklist,sign_off_name,work_order_reference,next_action,custom_fields,form_schema_id,form_schema_version)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,details=excluded.details,status=excluded.status,
      location=excluded.location,category=excluded.category,priority=excluded.priority,outcome=excluded.outcome,
      risk_assessment=excluded.risk_assessment,emergency_contact=excluded.emergency_contact,
      requires_follow_up=excluded.requires_follow_up,follow_up_date=excluded.follow_up_date,
      checklist=excluded.checklist,sign_off_name=excluded.sign_off_name,
      work_order_reference=excluded.work_order_reference,next_action=excluded.next_action,
      custom_fields=excluded.custom_fields,form_schema_id=excluded.form_schema_id,form_schema_version=excluded.form_schema_version
    WHERE reports.status='draft' AND reports.environment=excluded.environment
    AND reports.user_id=excluded.user_id AND reports.tenant_id=excluded.tenant_id`,
    r.id,s.environment,s.userId,s.tenantId,r.title,r.details,r.status,r.createdAt,r.error,
    r.location ?? '',r.category ?? '',r.priority ?? '',r.outcome ?? '',r.riskAssessment ?? '',
    r.emergencyContact ?? '',followUp,r.followUpDate ?? '',checklist,r.signOffName ?? '',
    r.workOrderReference ?? '',r.nextAction ?? '',customFields,r.formSchemaId ?? '',r.formSchemaVersion ?? 0);
}
export async function reportResult(s: Scope, id: string, error: string | null) {
  await (await database()).runAsync(`UPDATE reports SET status=?,error=?,confirmed_at=?
    WHERE id=? AND environment=? AND user_id=? AND tenant_id=? AND status='pending'`,
    error === null ? 'sent' : 'pending',error ?? '',error === null ? new Date().toISOString() : null,
    id,s.environment,s.userId,s.tenantId);
}
export async function deleteDraft(s: Scope, id: string) {
  await (await database()).runAsync("DELETE FROM reports WHERE id=? AND environment=? AND user_id=? AND tenant_id=? AND status='draft'",
    id,s.environment,s.userId,s.tenantId);
}
