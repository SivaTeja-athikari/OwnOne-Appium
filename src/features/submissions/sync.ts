import { submissionCredentials } from '@/core/auth/remote-auth-api';
import { getActiveEnvironmentConfig } from '@/config/environment';
import { useAuthStore } from '@/state/auth-store';
import { listReports, reportResult, type Report, type Scope } from './storage';

const listeners = new Set<() => void>();
export const subscribeReports = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const notifyReports = () => listeners.forEach(fn => fn());
let running = false;
export const isSending = () => running;
type FirestoreValue = {
  stringValue?: string;
  booleanValue?: boolean;
  arrayValue?: { values: { mapValue: { fields: Record<string, FirestoreValue> } }[] };
  mapValue?: { fields: Record<string, FirestoreValue> };
};
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a],[b]) => a.localeCompare(b));
    return `{${entries.map(([key,item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function matchesServerFields(serverFields: Record<string, unknown> | undefined, fields: Record<string, FirestoreValue>) {
  return Object.entries(fields).every(([key,value]) => stable(serverFields?.[key]) === stable(value));
}
function current(s: Scope) {
  const state = useAuthStore.getState();
  return state.currentUser?.id === s.userId && state.activeTenant?.id === s.tenantId &&
    !!state.authToken && getActiveEnvironmentConfig().environment === s.environment;
}
async function send(s: Scope, r: Report) {
  const { token, projectId } = await submissionCredentials(s.userId);
  if (!current(s)) return false;
  const name = `projects/${projectId}/databases/(default)/documents/environments/${s.environment}/workspaces/${s.tenantId}/members/${s.userId}/submissions/${r.id}`;
  const fields: Record<string, FirestoreValue> = {
    ownerId:{ stringValue:s.userId }, tenantId:{ stringValue:s.tenantId },
    title:{ stringValue:r.title }, details:{ stringValue:r.details }, createdAt:{ stringValue:r.createdAt },
    ...(r.location ? { location:{ stringValue:r.location } } : {}),
    ...(r.category ? { category:{ stringValue:r.category } } : {}),
    ...(r.priority ? { priority:{ stringValue:r.priority } } : {}),
    ...(r.outcome ? { outcome:{ stringValue:r.outcome } } : {}),
    ...(r.riskAssessment ? { riskAssessment:{ stringValue:r.riskAssessment } } : {}),
    ...(r.emergencyContact ? { emergencyContact:{ stringValue:r.emergencyContact } } : {}),
    ...(r.requiresFollowUp !== undefined ? { requiresFollowUp:{ booleanValue:r.requiresFollowUp } } : {}),
    ...(r.followUpDate ? { followUpDate:{ stringValue:r.followUpDate } } : {}),
    ...(r.signOffName ? { signOffName:{ stringValue:r.signOffName } } : {}),
    ...(r.workOrderReference ? { workOrderReference:{ stringValue:r.workOrderReference } } : {}),
    ...(r.nextAction ? { nextAction:{ stringValue:r.nextAction } } : {}),
    ...(r.checklist?.length ? { checklist:{ arrayValue:{ values:r.checklist.map(item => ({ mapValue:{ fields:{
      id:{ stringValue:item.id }, label:{ stringValue:item.label }, passed:{ booleanValue:item.passed },
    } } })) } } } : {}),
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' };
    const previous = await fetch(`https://firestore.googleapis.com/v1/${name}`, { headers,signal:controller.signal });
    if (previous.ok) {
      const data = await previous.json();
      if (matchesServerFields(data.fields,fields)) return true;
      throw new Error('This reference has different server data. Contact support before retrying.');
    }
    if (previous.status !== 404) {
      if (previous.status === 403) throw new Error('Access denied. Ask your administrator to check report permissions.');
      if (previous.status === 401) throw new Error('Sign in online again to send this report.');
      throw new Error('Could not verify server receipt. Your report remains saved.');
    }
    if (!current(s)) return false;
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
      method:'POST', headers, signal:controller.signal,
      body:JSON.stringify({ writes:[{ update:{ name,fields },currentDocument:{ exists:false } }] }),
    });
    if (response.ok) return true;
    if (response.status === 409) {
      // The server may have committed before the connection was lost. Confirm
      // the original document instead of creating a second submission.
      const existing = await fetch(`https://firestore.googleapis.com/v1/${name}`, { headers, signal:controller.signal });
      if (existing.ok) {
        const data = await existing.json();
        if (matchesServerFields(data.fields,fields)) return true;
      }
    }
    if (response.status === 403) throw new Error('Access denied. Ask your administrator to check report permissions.');
    if (response.status === 401) throw new Error('Sign in online again to send this report.');
    throw new Error('Server did not confirm this report. It remains saved; retry when connected.');
  } finally { clearTimeout(timer); }
}
export async function syncReports(s: Scope, manual = false) {
  if (running || !current(s)) return;
  running = true;
  notifyReports();
  try {
    const rows = (await listReports(s)).filter(r => r.status === 'pending');
    for (const r of rows) {
      if (!current(s)) break;
      if (!manual && (r.error.startsWith('Access denied') || r.error.startsWith('Sign in'))) continue;
      try {
        if (await send(s,r)) await reportResult(s,r.id,null);
      } catch (error) {
        const message = error instanceof Error && !['AbortError','TypeError'].includes(error.name)
          ? error.message : 'Connection interrupted. Your report is saved and will retry.';
        await reportResult(s,r.id,message);
        break;
      }
    }
  } finally { running = false; notifyReports(); }
}
