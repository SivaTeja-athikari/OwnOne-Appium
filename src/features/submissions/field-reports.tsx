import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useAppNetworkState } from '@/hooks/use-app-network';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/state/auth-store';
import { AuthField } from '@/components/forms/auth-field';
import { AppIcon, Button, Card, ui } from '@/components/ui/workspace-ui';
import { WorkspaceScreen } from '@/components/ui/workspace-screen';
import { deleteDraft, listReports, saveReport, type ChecklistItem, type Report, type ReportFields, type ReportOutcome, type RiskAssessment, type Scope } from './storage';
import { REPORT_FORM_SCHEMA, type ReportFormField } from './form-schema';
import { isSending, notifyReports, subscribeReports, syncReports } from './sync';

const CHECKLIST_TEMPLATE: ChecklistItem[] = [
  { id:'site-induction',label:'Site induction completed',passed:false },
  { id:'work-area',label:'Work area inspected',passed:false },
  { id:'safety-controls',label:'Required safety controls checked',passed:false },
];
type ValidationField = 'title' | 'location' | 'details' | 'emergencyContact' | 'followUpDate';
type DropdownKey = 'category' | 'priority';

function schemaFieldValue(report: Report, field: ReportFormField): string {
  return field.binding
    ? String(report[field.binding] ?? '')
    : String(report.customFields?.[field.id] ?? '');
}

const DROPDOWN_HINTS = {
  category: {
    'Site visit': 'On-site inspection or visit',
    Delivery: 'Goods or materials delivered',
    Maintenance: 'Repair or scheduled service',
    Incident: 'Unexpected event to document',
  },
  priority: {
    Normal: 'Routine follow-up',
    High: 'Needs timely attention',
    Urgent: 'Requires immediate action',
  },
} as const;

type ScenarioStarter = {
  key: string;
  title: string;
  detail: string;
  icon: 'document' | 'clock' | 'flag' | 'grid';
  fields: ReportFields;
  followUpDays?: number;
};

const SAMPLE_SCENARIOS: ScenarioStarter[] = [
  {
    key:'offline_delivery',title:'Offline delivery',detail:'Completed delivery captured without a connection',icon:'document',
    fields:{
      title:'Delivery inspection · Warehouse 02',location:'North Gate · Warehouse 02',workOrderReference:'WO-2048',
      category:'Delivery',priority:'High',details:'Delivery received while the device was offline. Packaging was intact and the quantity matched the order.',
      outcome:'Completed',riskAssessment:'Low',checklist:CHECKLIST_TEMPLATE.map(item => ({ ...item,passed:true })),signOffName:'Alex Morgan',
    },
  },
  {
    key:'maintenance_follow_up',title:'Maintenance follow-up',detail:'Work in progress with a scheduled next action',icon:'clock',followUpDays:3,
    fields:{
      title:'Preventive maintenance follow-up',location:'Plant 4 · Loading bay',workOrderReference:'SR-318',
      category:'Maintenance',priority:'Normal',details:'A worn belt was identified during inspection. Equipment remains operational, but a replacement should be scheduled.',
      outcome:'In progress',riskAssessment:'Medium',requiresFollowUp:true,
      nextAction:'Schedule the replacement and confirm the equipment check.',
      checklist:CHECKLIST_TEMPLATE.map((item,index) => ({ ...item,passed:index < 2 })),signOffName:'Alex Morgan',
    },
  },
  {
    key:'blocked_safety_incident',title:'Blocked safety incident',detail:'Critical risk, follow-up required',icon:'flag',followUpDays:1,
    fields:{
      title:'Restricted access · Safety incident',location:'East service corridor',workOrderReference:'INC-771',
      category:'Incident',priority:'Urgent',details:'Work stopped after a restricted access area was found unsecured. No work continued in the area; supervisor review is required.',
      outcome:'Blocked',riskAssessment:'Critical',requiresFollowUp:true,emergencyContact:'+1 415 555 0106',
      nextAction:'Keep the area closed until the site supervisor verifies access controls.',
      checklist:CHECKLIST_TEMPLATE.map((item,index) => ({ ...item,passed:index === 0 })),signOffName:'Alex Morgan',
    },
  },
  {
    key:'batch_inspection_1',title:'Offline batch · Report 1 of 2',detail:'North wing inspection, first separate report',icon:'grid',
    fields:{
      title:'Batch inspection · North wing',location:'North Wing Depot',workOrderReference:'BATCH-001',
      category:'Site visit',priority:'High',details:'First report in an offline batch. Record this inspection, then enter the second report as a separate submission.',
      outcome:'Completed',riskAssessment:'Low',checklist:CHECKLIST_TEMPLATE.map(item => ({ ...item,passed:true })),signOffName:'Alex Morgan',
    },
  },
  {
    key:'batch_inspection_2',title:'Offline batch · Report 2 of 2',detail:'South wing inspection, second separate report',icon:'grid',
    fields:{
      title:'Batch inspection · South wing',location:'South Wing Depot',workOrderReference:'BATCH-002',
      category:'Site visit',priority:'Normal',details:'Second report in the same offline batch. This is a separate site record with its own details and reference.',
      outcome:'In progress',riskAssessment:'Medium',nextAction:'Complete the remaining inspection checks on the next visit.',
      checklist:CHECKLIST_TEMPLATE.map((item,index) => ({ ...item,passed:index === 0 })),signOffName:'Alex Morgan',
    },
  },
];

function dateAfterDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function blank(): Report {
  return { id:randomUUID(),title:'',details:'',location:'',category:'Site visit',priority:'Normal',outcome:'Completed',riskAssessment:'Low',emergencyContact:'',requiresFollowUp:false,followUpDate:'',checklist:CHECKLIST_TEMPLATE.map(item => ({ ...item })),signOffName:'',workOrderReference:'',nextAction:'',customFields:{},formSchemaId:REPORT_FORM_SCHEMA.formId,formSchemaVersion:REPORT_FORM_SCHEMA.version,status:'draft',createdAt:new Date().toISOString(),error:'',confirmedAt:null };
}

function reportFieldError(field: ValidationField, value: string): string | undefined {
  const cleaned = value.trim();
  if (field === 'emergencyContact') {
    if (cleaned && !/^\+?\d{7,15}$/.test(cleaned.replace(/[\s()-]/g,''))) return 'Enter a valid phone number with 7–15 digits.';
    return undefined;
  }
  if (!cleaned) {
    if (field === 'title') return 'Enter a report title.';
    if (field === 'location') return 'Enter the site or location.';
    if (field === 'followUpDate') return 'Add a due date for the follow-up.';
    return 'Describe what happened.';
  }
  if (field === 'title' && cleaned.length < 3) return 'Use at least 3 characters for the title.';
  if (field === 'location' && cleaned.length < 2) return 'Enter at least 2 characters for the location.';
  if (field === 'details' && cleaned.length < 10) return 'Add a little more detail (at least 10 characters).';
  if (field === 'followUpDate') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return 'Use the date format YYYY-MM-DD.';
    const [year,month,day] = cleaned.split('-').map(Number);
    const date = new Date(year,month-1,day);
    if (date.getFullYear() !== year || date.getMonth() !== month-1 || date.getDate() !== day) return 'Enter a valid calendar date.';
    const today = new Date();
    const todayString = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    if (cleaned < todayString) return 'The follow-up date cannot be in the past.';
  }
  return undefined;
}

export function FieldReports({ scope }: { scope: Scope }) {
  const theme = useTheme();
  const network = useAppNetworkState();
  const token = useAuthStore(s => s.authToken);
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const [form,setForm] = useState<Report>(blank);
  const latest = useRef(form);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const submitting = useRef(false);
  const [ready,setReady] = useState(false);
  const [busy,setBusy] = useState(false);
  const [saving,setSaving] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [fieldErrors,setFieldErrors] = useState<Partial<Record<ValidationField,string>>>({});
  const [validated,setValidated] = useState(false);
  const [rows,setRows] = useState<Report[]>([]);
  const [sending,setSending] = useState(false);
  const [section,setSection] = useState<'compose' | 'history'>('compose');
  const [openDropdown,setOpenDropdown] = useState<DropdownKey | null>(null);
  const [scenarioPickerVisible,setScenarioPickerVisible] = useState(false);
  const [loadedScenario,setLoadedScenario] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const data = await listReports(scope);
        if (active) { setRows(data); setSending(isSending()); }
      } catch { if (active) setError('Could not read saved reports. Try reopening this screen.'); }
    };
    void listReports(scope).then(data => {
      if (!active) return;
      const draft = data.find(r => r.status === 'draft');
      if (draft) { latest.current = draft; setForm(draft); setMessage('Your saved draft has been restored.'); }
      setRows(data); setReady(true);
    }).catch(() => { if (active) setError('Device storage is unavailable. Reopen this screen before entering details.'); });
    const unsubscribe = subscribeReports(() => void refresh());
    return () => { active = false; unsubscribe(); };
  },[scope]);
  const update = (key: keyof Report, value: string | boolean | ChecklistItem[] | Record<string,string> | undefined) => {
    if (submitting.current) return;
    const next = { ...latest.current,[key]:value } as Report;
    latest.current = next;
    if (validated) {
      if (key === 'title' || key === 'location' || key === 'details' || key === 'emergencyContact')
        setFieldErrors(current => ({ ...current,[key]:reportFieldError(key,String(value ?? '')) ?? undefined }));
      if (key === 'followUpDate' || key === 'requiresFollowUp')
        setFieldErrors(current => ({ ...current,followUpDate:next.requiresFollowUp ? reportFieldError('followUpDate',next.followUpDate ?? '') : undefined }));
    }
    setForm(next); setSaving(true); setError(''); setMessage('');
    const write = writes.current.catch(() => undefined).then(() => saveReport(scope,next));
    writes.current = write;
    void write.then(() => {
      if (latest.current === next) { setSaving(false); setMessage('Draft saved on this device.'); }
    }).catch(() => { setSaving(false); setError('Draft could not be saved. Keep this screen open and try again.'); });
  };
  const submit = async () => {
    if (submitting.current) return;
    const report = latest.current;
    setValidated(true);
    const nextErrors = {
      title: reportFieldError('title',report.title),
      location: reportFieldError('location',report.location ?? ''),
      details: reportFieldError('details',report.details),
      emergencyContact: reportFieldError('emergencyContact',report.emergencyContact ?? ''),
      followUpDate: report.requiresFollowUp ? reportFieldError('followUpDate',report.followUpDate ?? '') : undefined,
    };
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      setError('Review the highlighted fields and try again.');
      setSection('compose');
      return;
    }
    submitting.current = true; setBusy(true); setError('');
    try {
      await writes.current.catch(() => undefined);
      await saveReport(scope,{ ...report,title:report.title.trim(),details:report.details.trim(),status:'pending' });
      const next = blank(); latest.current = next; setForm(next); setFieldErrors({}); setValidated(false);
      setLoadedScenario('');
      setMessage('Saved on this device. Pending reports send automatically when your connection returns while the app is open.');
      setSection('history');
      notifyReports();
      if (!offline && token) void syncReports(scope,true).catch(() => setError('Unable to send now. Your report remains saved.'));
    } catch { setError('Could not save the submission. Your entered details are still here. Try again.'); }
    finally { submitting.current = false; setBusy(false); }
  };
  const discard = () => Alert.alert('Discard draft?', 'This removes the current draft from this device.',[
    { text:'Keep draft',style:'cancel' },
    { text:'Discard',style:'destructive',onPress:() => {
      if (submitting.current) return;
      submitting.current = true; setBusy(true);
      void writes.current.catch(() => undefined).then(() => deleteDraft(scope,latest.current.id)).then(() => {
        const next = blank(); latest.current = next; setForm(next); setFieldErrors({}); setValidated(false); setLoadedScenario(''); setMessage('Draft discarded.'); setError('');
      }).catch(() => setError('Could not discard the draft. Try again.')).finally(() => { submitting.current = false; setBusy(false); });
    } },
  ]);
  const pending = rows.filter(r => r.status === 'pending');
  const toggleChecklist = (id: string) => update('checklist',(latest.current.checklist ?? CHECKLIST_TEMPLATE).map(item => item.id === id ? { ...item,passed:!item.passed } : item));
  const renderSchemaField = (field: ReportFormField) => (
    <AuthField
      key={field.id}
      fieldSchemaId={field.id}
      label={field.label}
      testID={field.legacyTestID}
      errorTestID={field.legacyErrorTestID}
      value={schemaFieldValue(form,field)}
      onChangeText={value => {
        if (field.binding) update(field.binding,value);
        else update('customFields',{ ...(latest.current.customFields ?? {}),[field.id]:value });
      }}
      maxLength={field.maxLength}
      multiline={field.type === 'multiline'}
      numberOfLines={field.numberOfLines}
      keyboardType={field.type === 'phone' ? 'phone-pad' : 'default'}
      editable={ready && !busy}
      placeholder={field.placeholder}
      error={field.validationKey ? fieldErrors[field.validationKey] : undefined}
    />
  );
  const hasDraftContent = Boolean(form.title || form.details || form.location || form.emergencyContact || form.signOffName || form.workOrderReference || form.nextAction || Object.values(form.customFields ?? {}).some(Boolean) || form.requiresFollowUp || form.category !== 'Site visit' || form.priority !== 'Normal' || form.outcome !== 'Completed' || form.riskAssessment !== 'Low' || form.checklist?.some(item => item.passed));
  const applyScenario = (scenario: ScenarioStarter) => {
    const apply = () => {
      const current = latest.current;
      const next: Report = {
        ...blank(),
        ...scenario.fields,
        id:current.id,
        createdAt:current.createdAt,
        status:'draft',
        error:'',
        confirmedAt:null,
        checklist:scenario.fields.checklist?.map(item => ({ ...item })),
        ...(scenario.followUpDays ? { followUpDate:dateAfterDays(scenario.followUpDays) } : {}),
      };
      latest.current = next;
      setForm(next);
      setFieldErrors({});
      setValidated(false);
      setLoadedScenario(scenario.title);
      setError('');
      setSection('compose');
      setScenarioPickerVisible(false);
      setSaving(true);
      setMessage('');
      const write = writes.current.catch(() => undefined).then(() => saveReport(scope,next));
      writes.current = write;
      void write.then(() => {
        if (latest.current === next) {
          setSaving(false);
          setMessage(`${scenario.title} filled in. Review or edit any field, then submit when ready.`);
        }
      }).catch(() => {
        setSaving(false);
        setError('The example could not be saved as a draft. Keep this screen open and try again.');
      });
    };
    setScenarioPickerVisible(false);
    if (hasDraftContent) {
      Alert.alert(
        'Replace the current draft?',
        'Your current draft is saved on this device. Choosing this scenario will replace its fields; you can still edit the new draft before submitting.',
        [
          { text:'Keep current draft',style:'cancel' },
          { text:'Replace with example',style:'destructive',onPress:apply },
        ],
      );
      return;
    }
    apply();
  };
  return <WorkspaceScreen title="Field reports" subtitle="Your work, captured.">
    <View testID="report_connectivity_card" style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={{ flex:1,gap:4 }}>
          <Text style={styles.heroEyebrow}>WORK SAVED. PROGRESS TRACKED.</Text>
          <Text style={styles.heroBody}>{offline ? 'Keep capturing. Send when connected.' : 'Your reports, from capture to confirmation.'}</Text>
        </View>
        <AppIcon name="document" color="#A8DFCA" size={24} />
      </View>
      <View testID="report_pending_count" style={styles.stats}>
        {[[pending.length,'Awaiting sync'],[rows.filter(r => r.status === 'sent').length,'Server confirmed']].map(([count,label]) => <View key={label} style={styles.stat}>
          <Text style={styles.statNumber}>{count}</Text><Text style={styles.statLabel}>{label}</Text>
        </View>)}
      </View>
    </View>
    <View style={[styles.segment,{ backgroundColor:theme.backgroundElement }]}>
      {([['compose','New report','plus'],['history','Activity','clock']] as const).map(([id,label,icon]) => <Pressable key={id} testID={`report_section_${id}`} accessibilityRole="tab" accessibilityState={{ selected:section === id }} onPress={() => setSection(id)} style={[styles.segmentItem,section === id && { backgroundColor:theme.surface }]}>
        <AppIcon name={icon} size={18} color={section === id ? theme.accent : theme.textSecondary} />
        <Text style={{ color:section === id ? theme.text : theme.textSecondary,fontWeight:'700' }}>{label}{id === 'history' && pending.length > 0 ? ` (${pending.length})` : ''}</Text>
      </Pressable>)}
    </View>
    {section === 'compose' && <Card>
      <View style={styles.formHeading}><View style={[styles.sectionIcon,{ backgroundColor:theme.backgroundSelected }]}><AppIcon name="document" color={theme.accent} size={24} /></View><View style={{ flex:1,gap:4 }}><Text style={[ui.heading,{ color:theme.text }]}>New report</Text><Text style={[ui.small,{ color:theme.textSecondary }]}>Record a visit, delivery or update.</Text></View></View>
      <View style={{ flexDirection:'row',alignItems:'center',gap:6 }}>
        <Text accessibilityLabel="Required" style={{ color:theme.danger,fontWeight:'800',fontSize:15 }}>*</Text>
        <Text style={[ui.small,{ color:theme.textSecondary }]}>Required field · Draft saves automatically</Text>
      </View>
      {scope.environment !== 'production' && <View testID="report_scenario_starter" style={[styles.scenarioStarter,{ backgroundColor:theme.backgroundElement,borderColor:theme.border }]}>
        <View style={styles.scenarioStarterTop}>
          <View style={[styles.scenarioStarterIcon,{ backgroundColor:theme.backgroundSelected }]}><AppIcon name="grid" size={18} color={theme.accent} /></View>
          <View style={{ flex:1,gap:3 }}>
            <Text style={[styles.scenarioStarterEyebrow,{ color:theme.accent }]}>DEMO STARTERS</Text>
            <Text style={[styles.scenarioStarterTitle,{ color:theme.text }]}>{loadedScenario || 'Prefill a report form'}</Text>
          </View>
          <View style={[styles.scenarioStarterCount,{ backgroundColor:theme.backgroundSelected }]}>
            <Text style={[styles.scenarioStarterCountText,{ color:theme.accent }]}>5 CASES</Text>
          </View>
        </View>
        <Text style={[styles.scenarioStarterBody,{ color:theme.textSecondary }]}>Choose a realistic case to fill the fields. Edit anything you need; nothing submits automatically.</Text>
        <Pressable
          testID="report_open_scenario_picker_btn"
          accessibilityRole="button"
          accessibilityLabel={loadedScenario ? 'Choose or change a report scenario' : 'Browse report scenarios'}
          disabled={!ready || busy}
          onPress={() => setScenarioPickerVisible(true)}
          style={({ pressed }) => [styles.scenarioChooseButton,{ backgroundColor:theme.accentSolid,opacity:!ready || busy ? 0.5 : pressed ? 0.82 : 1 }]}
        >
          <Text style={styles.scenarioChooseText}>{loadedScenario ? 'Choose another scenario' : 'Browse report scenarios'}</Text>
          <AppIcon name="arrow" size={16} color="#FFFFFF" />
        </Pressable>
      </View>}
      <Text style={[styles.sectionLabel,{ color:theme.accent }]}>01  /  THE ESSENTIALS</Text>
      {REPORT_FORM_SCHEMA.fields.filter(field => field.section === 'essentials').map(renderSchemaField)}
      <AuthField label="Customer / work order reference (optional)" testID="report_work_order_reference_input" value={form.workOrderReference ?? ''} onChangeText={v => update('workOrderReference',v)} maxLength={80} editable={ready && !busy} placeholder="e.g. WO-2048 or service ticket ID" />
      {([
        ['category', 'Report type'],
        ['priority', 'Priority'],
      ] as const).map(([key,label]) => <View key={key} style={styles.group}>
        <View style={styles.dropdownLabelRow}>
          <View style={[styles.dropdownLabelMark,{ backgroundColor:theme.backgroundSelected }]}>
            <AppIcon name={key === 'category' ? 'document' : 'flag'} size={15} color={theme.accent} />
          </View>
          <View style={{ flex:1,gap:2 }}>
            <Text style={[styles.fieldLabel,{ color:theme.text }]}>{label}</Text>
            <Text style={[styles.dropdownLabelHint,{ color:theme.textSecondary }]}>{key === 'category' ? 'What kind of work are you recording?' : 'How quickly does this need attention?'}</Text>
          </View>
        </View>
        <Pressable
          testID={`report_${key}_dropdown`}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${form[key]}. Choose ${label.toLowerCase()}`}
          accessibilityState={{ expanded:openDropdown === key,disabled:!ready || busy }}
          disabled={!ready || busy}
          onPress={() => setOpenDropdown(openDropdown === key ? null : key)}
          style={[
            styles.dropdown,
            {
              borderColor: openDropdown === key ? theme.accent : theme.border,
              backgroundColor: theme.surface,
            },
            openDropdown === key && styles.dropdownActive,
          ]}
        >
          <View style={styles.dropdownValueRow}>
            {key === 'category' ? (
              <View style={[styles.dropdownLeadingIcon,{ backgroundColor:theme.backgroundSelected }]}>
                <AppIcon name="document" size={18} color={theme.accent} />
              </View>
            ) : (
              <View style={[styles.priorityIconWrap,{ backgroundColor:theme.backgroundSelected }]}>
                <View
                style={[
                  styles.priorityDot,
                  {
                    backgroundColor:
                      form.priority === 'Urgent'
                        ? theme.danger
                        : form.priority === 'High'
                        ? '#F59E0B'
                        : theme.accent,
                  },
                ]}
                />
              </View>
            )}
            <View style={{ flex:1,gap:3 }}>
              <Text style={[styles.dropdownValueText,{ color:theme.text }]}>{form[key]}</Text>
              <Text style={[styles.dropdownValueHint,{ color:theme.textSecondary }]}>{DROPDOWN_HINTS[key][form[key] as keyof typeof DROPDOWN_HINTS[typeof key]]}</Text>
            </View>
          </View>
          <View
            style={[
              styles.chevronWrapper,
              { backgroundColor: openDropdown === key ? theme.backgroundSelected : theme.backgroundElement },
              openDropdown === key && { transform: [{ rotate: '180deg' }] },
            ]}
          >
            <AppIcon
              name="chevronDown"
              size={16}
              color={openDropdown === key ? theme.accent : theme.textSecondary}
            />
          </View>
        </Pressable>
      </View>)}
      <Text style={[styles.sectionLabel,{ color:theme.accent }]}>02  /  THE FULL PICTURE</Text>
      {REPORT_FORM_SCHEMA.fields.filter(field => field.section === 'details').map(renderSchemaField)}
      <Text style={[ui.small,{ color:theme.textSecondary }]}>{form.details.length}/2000 characters{saving ? ' · Saving draft…' : ''}</Text>
      <AuthField label="Next action / handover (optional)" testID="report_next_action_input" value={form.nextAction ?? ''} onChangeText={v => update('nextAction',v)} maxLength={1000} multiline numberOfLines={3} editable={ready && !busy} placeholder="Who needs to do what next? Add a handover note if useful." />
      <Text style={[styles.sectionLabel,{ color:theme.accent }]}>03  /  WORK & SAFETY</Text>
      <View style={styles.group}>
        <Text style={[ui.small,{ color:theme.text,fontWeight:'700' }]}>Visit outcome</Text>
        <View style={styles.choices}>
          {(['Completed','In progress','Blocked'] as ReportOutcome[]).map(value => <Pressable key={value} testID={`report_outcome_${value.replaceAll(' ','_')}`} accessibilityRole="radio" accessibilityState={{ checked:form.outcome === value }} onPress={() => { update('outcome',value); if (value === 'Blocked' && !latest.current.requiresFollowUp) update('requiresFollowUp',true); }} style={[styles.choice,{ borderColor:form.outcome === value ? theme.accent : theme.border,backgroundColor:form.outcome === value ? theme.backgroundSelected : theme.surface }]}><Text style={{ color:form.outcome === value ? theme.accent : theme.text,fontWeight:'700' }}>{value}</Text></Pressable>)}
        </View>
      </View>
      <View style={styles.group}>
        <Text style={[ui.small,{ color:theme.text,fontWeight:'700' }]}>Safety risk observed</Text>
        <View style={styles.choices}>
          {(['Low','Medium','High','Critical'] as RiskAssessment[]).map(value => <Pressable key={value} testID={`report_risk_${value}`} accessibilityRole="radio" accessibilityState={{ checked:form.riskAssessment === value }} onPress={() => update('riskAssessment',value)} style={[styles.choice,{ borderColor:form.riskAssessment === value ? (value === 'Critical' ? theme.danger : theme.accent) : theme.border,backgroundColor:form.riskAssessment === value ? theme.backgroundSelected : theme.surface }]}><Text style={{ color:form.riskAssessment === value ? (value === 'Critical' ? theme.danger : theme.accent) : theme.text,fontWeight:'700' }}>{value}</Text></Pressable>)}
        </View>
        <Text style={[ui.small,{ color:theme.textSecondary }]}>Select the highest risk observed during this visit.</Text>
      </View>
      {REPORT_FORM_SCHEMA.fields.filter(field => field.section === 'work-safety' && !field.visibleWhen).map(renderSchemaField)}
      <View style={styles.group}>
        <Pressable testID="report_requires_follow_up_toggle" accessibilityRole="switch" accessibilityState={{ checked:Boolean(form.requiresFollowUp),disabled:!ready || busy }} disabled={!ready || busy} onPress={() => update('requiresFollowUp',!form.requiresFollowUp)} style={styles.followUpToggle}>
          <View style={{ flex:1,gap:3 }}><Text style={[ui.small,{ color:theme.text,fontWeight:'700' }]}>Follow-up required</Text><Text style={[ui.small,{ color:theme.textSecondary }]}>Schedule a next action for this report.</Text></View>
          <View style={[styles.switchTrack,{ backgroundColor:form.requiresFollowUp ? theme.accent : theme.border }]}><View style={[styles.switchThumb,form.requiresFollowUp && styles.switchThumbOn]} /></View>
        </Pressable>
        {form.requiresFollowUp && <View style={styles.group}>{REPORT_FORM_SCHEMA.fields.filter(field => field.visibleWhen === 'requiresFollowUp' && Boolean(form[field.visibleWhen])).map(renderSchemaField)}<Text style={[ui.small,{ color:theme.textSecondary }]}>Use YYYY-MM-DD. The date can be today or later.</Text></View>}
      </View>
      <View style={styles.group}>
        <Text style={[ui.small,{ color:theme.text,fontWeight:'700' }]}>Visit checklist</Text>
        <Text style={[ui.small,{ color:theme.textSecondary }]}>Record which standard checks were completed.</Text>
        {(form.checklist ?? CHECKLIST_TEMPLATE).map((item,index) => <Pressable key={item.id} testID={`report_checklist_toggle_${index}`} accessibilityRole="checkbox" accessibilityState={{ checked:item.passed }} onPress={() => toggleChecklist(item.id)} style={styles.checklistRow}>
          <View style={[styles.checkbox,{ borderColor:item.passed ? theme.accent : theme.border,backgroundColor:item.passed ? theme.accent : theme.surface }]}>{item.passed && <AppIcon name="check" size={16} color="#FFFFFF" />}</View>
          <Text style={[ui.body,{ color:theme.text,flex:1 }]}>{item.label}</Text>
        </Pressable>)}
      </View>
      <AuthField label="Completed by (optional)" testID="report_sign_off_name_input" value={form.signOffName ?? ''} onChangeText={v => update('signOffName',v)} maxLength={120} autoCapitalize="words" editable={ready && !busy} placeholder="Name of the person completing this report" />
      {!!error && <Text testID="report_error" accessibilityRole="alert" style={{ color:theme.danger }}>{error}</Text>}
      {!!message && <Text testID="report_save_status" accessibilityLiveRegion="polite" style={[ui.body,{ color:theme.text }]}>{message}</Text>}
      <View style={styles.actionsRow}>
        <Button testID="report_submit_btn" style={styles.actionBtn} disabled={!ready || busy} onPress={() => void submit()}>{busy ? 'Saving…' : offline || !token ? 'Save for submission' : 'Submit report'}</Button>
        <Button secondary testID="report_discard_btn" style={styles.actionBtn} disabled={!ready || busy || !hasDraftContent} onPress={discard}>Discard draft</Button>
      </View>
      <View style={styles.reassurance}><AppIcon name="lock" size={16} color={theme.textSecondary} /><Text style={[ui.small,{ color:theme.textSecondary,flex:1 }]}>Saved on this device first. Marked submitted only after server confirmation.</Text></View>
    </Card>}
    {section === 'history' && <View style={styles.historyContainer}>
      <Card>
        <View style={styles.historyHeader}>
          <View style={[styles.sectionIcon,{ backgroundColor:theme.backgroundSelected }]}>
            <AppIcon name="clock" color={theme.accent} size={22} />
          </View>
          <View style={{ flex:1,gap:3 }}>
            <Text style={[ui.heading,{ color:theme.text }]}>Report Activity</Text>
            <Text style={[ui.small,{ color:theme.textSecondary }]}>
              {rows.filter(r => r.status !== 'draft').length} total reports · {pending.length} pending sync
            </Text>
          </View>
        </View>

        {!!error && <Text accessibilityRole="alert" style={{ color:theme.danger }}>{error}</Text>}
        {!!message && <Text accessibilityLiveRegion="polite" style={[ui.small,{ color:theme.textSecondary }]}>{message}</Text>}

        <Text style={[ui.body,{ color:theme.textSecondary }]}>
          Pending reports stay on this device until the server confirms receipt. Keep this app open to send them.
        </Text>

        <Button
          testID="report_retry_btn"
          secondary
          disabled={offline || !token || sending || pending.length === 0}
          onPress={() => void syncReports(scope,true).catch(() => setError('Unable to send now. Reports remain saved.'))}
        >
          {sending ? 'Sending…' : 'Send pending reports'}
        </Button>
      </Card>

      {rows.filter(r => r.status !== 'draft').slice(0,30).map(r => {
        const isSent = r.status === 'sent';
        const riskColor = r.riskAssessment === 'Critical' ? theme.danger : r.riskAssessment === 'High' ? '#F59E0B' : r.riskAssessment === 'Medium' ? '#EAB308' : theme.accent;
        const priorityColor = r.priority === 'Urgent' ? theme.danger : r.priority === 'High' ? '#F59E0B' : theme.textSecondary;

        return (
          <View
            key={r.id}
            testID={`report_record_${r.id}`}
            style={[
              styles.activityCard,
              {
                backgroundColor: theme.surface,
                borderColor: isSent ? theme.border : theme.accent,
              },
            ]}
          >
            {/* Top Row: Category Pill & Status Badge */}
            <View style={styles.activityCardTop}>
              <View style={styles.tagGroup}>
                <View style={[styles.categoryBadge, { backgroundColor: theme.backgroundSelected }]}>
                  <AppIcon name="document" size={13} color={theme.accent} />
                  <Text style={[styles.categoryBadgeText, { color: theme.accent }]}>{r.category}</Text>
                </View>
                {r.priority && r.priority !== 'Normal' && (
                  <View style={[styles.priorityBadge, { backgroundColor: `${priorityColor}18` }]}>
                    <View style={[styles.priorityDotSmall, { backgroundColor: priorityColor }]} />
                    <Text style={[styles.priorityBadgeText, { color: priorityColor }]}>{r.priority}</Text>
                  </View>
                )}
                {r.riskAssessment && (
                  <View style={[styles.priorityBadge, { backgroundColor: `${riskColor}18` }]}>
                    <Text style={[styles.priorityBadgeText, { color: riskColor }]}>Risk {r.riskAssessment}</Text>
                  </View>
                )}
              </View>

              <View
                style={[
                  styles.statusPillSmall,
                  { backgroundColor: isSent ? `${theme.accent}15` : '#F59E0B18' },
                ]}
              >
                <AppIcon
                  name={isSent ? 'check' : 'clock'}
                  size={12}
                  color={isSent ? theme.accent : '#F59E0B'}
                />
                <Text
                  testID={`report_status_${r.id}`}
                  style={[
                    styles.statusPillText,
                    { color: isSent ? theme.accent : '#D97706' },
                  ]}
                >
                  {isSent ? 'Submitted · Server confirmed' : 'Pending · Saved on this device'}
                </Text>
              </View>
            </View>

            {/* Title */}
            <Text style={[styles.activityTitle, { color: theme.text }]}>{r.title}</Text>

            {/* Location & Metadata Chips */}
            <View style={styles.metaRow}>
              {!!r.location && (
                <View style={styles.metaItem}>
                  <AppIcon name="building" size={13} color={theme.textSecondary} />
                  <Text style={[styles.metaText, { color: theme.textSecondary }]}>{r.location}</Text>
                </View>
              )}
              {!!r.workOrderReference && (
                <View style={styles.metaItem}>
                  <AppIcon name="grid" size={13} color={theme.textSecondary} />
                  <Text style={[styles.metaText, { color: theme.textSecondary }]}>WO: {r.workOrderReference}</Text>
                </View>
              )}
            </View>

            {/* Body Details preview in subtle container */}
            <View style={[styles.detailsBox, { backgroundColor: theme.backgroundElement }]}>
              <Text numberOfLines={3} style={[ui.body, { color: theme.text, fontSize: 13, lineHeight: 19 }]}>
                {r.details}
              </Text>
            </View>

            {/* Structured attributes highlights */}
            {(r.outcome || r.requiresFollowUp || r.emergencyContact || r.signOffName || r.checklist?.length || r.nextAction) ? (
              <View style={[styles.chipsContainer, { borderTopColor: theme.border }]}>
                {!!r.outcome && (
                  <View style={[styles.chipItem, { backgroundColor: theme.backgroundElement }]}>
                    <Text style={[styles.chipLabel, { color: theme.textSecondary }]}>Outcome:</Text>
                    <Text style={[styles.chipVal, { color: theme.text }]}>{r.outcome}</Text>
                  </View>
                )}
                {r.requiresFollowUp && !!r.followUpDate && (
                  <View style={[styles.chipItem, { backgroundColor: '#F59E0B14' }]}>
                    <Text style={[styles.chipLabel, { color: '#B45309' }]}>Follow-up due:</Text>
                    <Text style={[styles.chipVal, { color: '#B45309' }]}>{r.followUpDate}</Text>
                  </View>
                )}
                {!!r.checklist?.length && (
                  <View style={[styles.chipItem, { backgroundColor: theme.backgroundElement }]}>
                    <AppIcon name="check" size={11} color={theme.accent} />
                    <Text style={[styles.chipVal, { color: theme.textSecondary }]}>
                      {r.checklist.filter(item => item.passed).length}/{r.checklist.length} checks
                    </Text>
                  </View>
                )}
                {!!r.emergencyContact && (
                  <View style={[styles.chipItem, { backgroundColor: theme.backgroundElement }]}>
                    <Text style={[styles.chipLabel, { color: theme.textSecondary }]}>Contact:</Text>
                    <Text style={[styles.chipVal, { color: theme.text }]}>{r.emergencyContact}</Text>
                  </View>
                )}
                {!!r.signOffName && (
                  <View style={[styles.chipItem, { backgroundColor: theme.backgroundElement }]}>
                    <Text style={[styles.chipLabel, { color: theme.textSecondary }]}>By:</Text>
                    <Text style={[styles.chipVal, { color: theme.text }]}>{r.signOffName}</Text>
                  </View>
                )}
                {!!r.nextAction && (
                  <View style={[styles.chipItem, { backgroundColor: theme.backgroundElement, width: '100%' }]}>
                    <Text style={[styles.chipLabel, { color: theme.textSecondary }]}>Next action:</Text>
                    <Text numberOfLines={1} style={[styles.chipVal, { color: theme.text, flex: 1 }]}>{r.nextAction}</Text>
                  </View>
                )}
              </View>
            ) : null}

            {/* Footer with Reference and Timestamp */}
            <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
              <View style={{ flex:1,gap:2 }}>
                <Text selectable style={[styles.referenceText, { color: theme.textSecondary }]}>
                  Ref: <Text style={{ fontFamily: 'monospace' }}>{r.id}</Text>
                </Text>
                <Text style={[styles.dateText, { color: theme.textSecondary }]}>
                  {new Date(r.confirmedAt ?? r.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </Text>
              </View>
            </View>

            {!!r.error && (
              <View style={[styles.errorBox, { backgroundColor: `${theme.danger}15`, borderColor: theme.danger }]}>
                <Text style={[styles.errorText, { color: theme.danger }]}>{r.error}</Text>
              </View>
            )}
          </View>
        );
      })}

      {rows.every(r => r.status === 'draft') && (
        <Card>
          <View style={styles.empty}>
            <View style={[styles.emptyIconCircle, { backgroundColor: theme.backgroundSelected }]}>
              <AppIcon name="document" size={36} color={theme.accent} />
            </View>
            <Text style={[ui.heading,{ color:theme.text }]}>Your next report starts here</Text>
            <Text style={[ui.body,{ color:theme.textSecondary,textAlign:'center' }]}>
              Create a report to track its journey from saved on your device to received by the server.
            </Text>
            <Button secondary onPress={() => setSection('compose')}>Create your first report</Button>
          </View>
        </Card>
      )}
    </View>}
    <Modal transparent visible={scenarioPickerVisible} animationType="slide" onRequestClose={() => setScenarioPickerVisible(false)}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close sample scenarios" onPress={() => setScenarioPickerVisible(false)} />
        <View accessibilityViewIsModal style={[styles.selectionSheet,{ backgroundColor:theme.surface,borderColor:theme.border }]}>
          <View style={[styles.sheetHandle,{ backgroundColor:theme.border }]} />
          <View style={styles.sheetHeading}>
            <View style={{ flex:1,gap:4 }}>
              <Text style={[styles.sheetEyebrow,{ color:theme.accent }]}>REPORT STARTERS</Text>
              <Text style={[styles.sheetTitle,{ color:theme.text }]}>Choose a scenario</Text>
              <Text style={[ui.small,{ color:theme.textSecondary }]}>We’ll prefill the form. You can change every field before saving or submitting.</Text>
            </View>
            <Pressable testID="report_close_scenario_picker_btn" accessibilityRole="button" accessibilityLabel="Close sample scenarios" onPress={() => setScenarioPickerVisible(false)} style={[styles.sheetClose,{ backgroundColor:theme.backgroundElement }]}>
              <AppIcon name="close" size={17} color={theme.textSecondary} />
            </Pressable>
          </View>
          <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetOptions} showsVerticalScrollIndicator={false}>
            {SAMPLE_SCENARIOS.map(scenario => <Pressable
              key={scenario.key}
              testID={`report_scenario_${scenario.key}`}
              accessibilityRole="button"
              accessibilityLabel={`${scenario.title}. ${scenario.detail}. Prefill report form.`}
              onPress={() => applyScenario(scenario)}
              style={({ pressed }) => [styles.scenarioOption,{ borderColor:theme.border,backgroundColor:theme.background },pressed && { opacity:0.76 }]}
            >
              <View style={[styles.sheetOptionIcon,{ backgroundColor:theme.backgroundSelected }]}><AppIcon name={scenario.icon} size={18} color={theme.accent} /></View>
              <View style={{ flex:1,gap:4 }}>
                <Text style={[styles.dropdownOptionText,{ color:theme.text,fontWeight:'700' }]}>{scenario.title}</Text>
                <Text style={[styles.dropdownOptionHint,{ color:theme.textSecondary }]}>{scenario.detail}</Text>
              </View>
              <AppIcon name="arrow" size={16} color={theme.accent} />
            </Pressable>)}
          </ScrollView>
          <Text style={[styles.sheetFooter,{ color:theme.textSecondary }]}>No report is submitted until you press the form’s submit button.</Text>
        </View>
      </View>
    </Modal>
    <Modal transparent visible={openDropdown !== null} animationType="slide" onRequestClose={() => setOpenDropdown(null)}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close selection" onPress={() => setOpenDropdown(null)} />
        {openDropdown && <View accessibilityViewIsModal style={[styles.selectionSheet,{ backgroundColor:theme.surface,borderColor:theme.border }]}>
          <View style={[styles.sheetHandle,{ backgroundColor:theme.border }]} />
          <View style={styles.sheetHeading}>
            <View style={{ flex:1,gap:4 }}>
              <Text style={[styles.sheetEyebrow,{ color:theme.accent }]}>FIELD REPORT</Text>
              <Text style={[styles.sheetTitle,{ color:theme.text }]}>{openDropdown === 'category' ? 'Choose report type' : 'Set report priority'}</Text>
              <Text style={[ui.small,{ color:theme.textSecondary }]}>{openDropdown === 'category' ? 'Select the option that best describes this work.' : 'Choose the level that reflects how quickly action is needed.'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close selection" onPress={() => setOpenDropdown(null)} style={[styles.sheetClose,{ backgroundColor:theme.backgroundElement }]}>
              <AppIcon name="close" size={17} color={theme.textSecondary} />
            </Pressable>
          </View>
          <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetOptions} showsVerticalScrollIndicator={false}>
            {(openDropdown === 'category' ? ['Site visit','Delivery','Maintenance','Incident'] as const : ['Normal','High','Urgent'] as const).map(value => {
              const isSelected = form[openDropdown] === value;
              const tone = openDropdown === 'priority' && value === 'Urgent' ? theme.danger : openDropdown === 'priority' && value === 'High' ? '#F59E0B' : theme.accent;
              return <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked:isSelected }}
                onPress={() => { update(openDropdown,value); setOpenDropdown(null); }}
                testID={`report_${openDropdown}_option_${value.replaceAll(' ','_')}`}
                style={({ pressed }) => [styles.sheetOption,{ borderColor:isSelected ? theme.accent : theme.border,backgroundColor:isSelected ? theme.backgroundSelected : theme.background },pressed && { opacity:0.76 }]}
              >
                <View style={[styles.sheetOptionIcon,{ backgroundColor:openDropdown === 'priority' ? `${tone}18` : theme.backgroundSelected }]}>
                  {openDropdown === 'category' ? <AppIcon name="document" size={18} color={theme.accent} /> : <View style={[styles.priorityDot,{ width:10,height:10,backgroundColor:tone }]} />}
                </View>
                <View style={{ flex:1,gap:4 }}>
                  <Text style={[styles.dropdownOptionText,{ color:theme.text,fontWeight:'700' }]}>{value}</Text>
                  <Text style={[styles.dropdownOptionHint,{ color:theme.textSecondary }]}>{DROPDOWN_HINTS[openDropdown][value as keyof typeof DROPDOWN_HINTS[typeof openDropdown]]}</Text>
                </View>
                <View style={[styles.radioOuter,{ borderColor:isSelected ? theme.accent : theme.border }]}>{isSelected && <View style={[styles.radioInner,{ backgroundColor:theme.accent }]} />}</View>
              </Pressable>;
            })}
          </ScrollView>
          <Text style={[styles.sheetFooter,{ color:theme.textSecondary }]}>Your choice is saved with this report.</Text>
        </View>}
      </View>
    </Modal>
  </WorkspaceScreen>;
}

const styles = StyleSheet.create({
  hero:{ backgroundColor:'#122F37',borderRadius:20,padding:18,gap:14,overflow:'hidden' },
  heroTop:{ flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap' },
  heroEyebrow:{ color:'#A3CBC7',fontSize:9,fontWeight:'700',letterSpacing:1.2 },
  connectionPill:{ flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:12,paddingVertical:8,borderRadius:30 },
  dot:{ width:7,height:7,borderRadius:4 },
  heroTitle:{ fontSize:29,lineHeight:36,fontWeight:'700',letterSpacing:-0.8,color:'#F4FAF8' },
  heroBody:{ fontSize:12,lineHeight:18,color:'#BED3D4' },
  stats:{ flexDirection:'row',gap:12,borderTopWidth:1,borderTopColor:'#35535A',paddingTop:12 },
  stat:{ flex:1,gap:8,flexDirection:'row',alignItems:'center' },statNumber:{ fontSize:24,fontWeight:'700',color:'#D6F6D2' },statLabel:{ fontSize:12,color:'#BED3D4' },
  segment:{ flexDirection:'row',padding:5,borderRadius:18,gap:4 },
  segmentItem:{ flex:1,minHeight:48,borderRadius:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8 },
  formHeading:{ flexDirection:'row',alignItems:'center',gap:14 },
  group:{ gap:9 },
  fieldLabel:{ fontSize:13,fontWeight:'600' },
  dropdownLabelRow:{ flexDirection:'row',alignItems:'center',gap:10,marginBottom:2 },
  dropdownLabelMark:{ width:30,height:30,borderRadius:10,alignItems:'center',justifyContent:'center' },
  dropdownLabelHint:{ fontSize:11,lineHeight:15 },
  dropdown:{ minHeight:68,borderWidth:1,borderRadius:16,paddingHorizontal:13,paddingVertical:11,flexDirection:'row',alignItems:'center',justifyContent:'space-between',shadowColor:'#102D36',shadowOffset:{ width:0,height:2 },shadowOpacity:0.04,shadowRadius:5,elevation:1 },
  dropdownActive:{ shadowOpacity:0.1,shadowRadius:7,elevation:3 },
  dropdownValueRow:{ flexDirection:'row',alignItems:'center',gap:12,flex:1 },
  dropdownLeadingIcon:{ width:38,height:38,borderRadius:12,alignItems:'center',justifyContent:'center' },
  priorityIconWrap:{ width:38,height:38,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#F5F2E8' },
  dropdownValueText:{ fontSize:15,fontWeight:'700',letterSpacing:-0.2 },
  dropdownValueHint:{ fontSize:11,lineHeight:14 },
  chevronWrapper:{ width:32,height:32,borderRadius:11,alignItems:'center',justifyContent:'center' },
  priorityDot:{ width:8,height:8,borderRadius:4 },
  sheetBackdrop:{ flex:1,justifyContent:'flex-end',alignItems:'center',backgroundColor:'#07182099' },
  selectionSheet:{ width:'100%',maxWidth:600,maxHeight:'78%',borderTopLeftRadius:28,borderTopRightRadius:28,borderWidth:1,paddingHorizontal:20,paddingTop:12,paddingBottom:28,gap:18 },
  sheetHandle:{ width:38,height:4,borderRadius:4,alignSelf:'center' },
  sheetHeading:{ flexDirection:'row',alignItems:'flex-start',gap:14 },
  sheetEyebrow:{ fontSize:10,fontWeight:'800',letterSpacing:1.5 },
  sheetTitle:{ fontSize:21,lineHeight:27,fontWeight:'800',letterSpacing:-0.5 },
  sheetClose:{ width:36,height:36,borderRadius:12,alignItems:'center',justifyContent:'center' },
  sheetScroll:{ flexShrink:1 },
  sheetOptions:{ gap:10,paddingBottom:2 },
  sheetOption:{ minHeight:68,borderWidth:1,borderRadius:17,paddingHorizontal:13,paddingVertical:11,flexDirection:'row',alignItems:'center',gap:12 },
  sheetOptionIcon:{ width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center' },
  radioOuter:{ width:21,height:21,borderWidth:1.5,borderRadius:11,alignItems:'center',justifyContent:'center' },
  radioInner:{ width:11,height:11,borderRadius:6 },
  sheetFooter:{ fontSize:11,textAlign:'center',marginTop:-6 },
  dropdownOptionText:{ fontSize:13 },
  dropdownOptionHint:{ fontSize:11,lineHeight:14 },
  checkCircle:{ width:20,height:20,borderRadius:10,alignItems:'center',justifyContent:'center' },
  choices:{ flexDirection:'row',flexWrap:'wrap',gap:8 },
  choice:{ borderWidth:1,paddingHorizontal:14,paddingVertical:12,borderRadius:14,minHeight:44,justifyContent:'center' },
  followUpToggle:{ flexDirection:'row',alignItems:'center',gap:14,minHeight:56 },
  switchTrack:{ width:48,height:28,borderRadius:16,justifyContent:'center',padding:3 },
  switchThumb:{ width:22,height:22,borderRadius:12,backgroundColor:'#FFFFFF' },
  switchThumbOn:{ alignSelf:'flex-end' },
  checklistRow:{ flexDirection:'row',alignItems:'center',gap:12,minHeight:48 },
  checkbox:{ width:24,height:24,borderWidth:2,borderRadius:7,alignItems:'center',justifyContent:'center' },
  sectionIcon:{ padding:10,borderRadius:13 },sectionLabel:{ fontSize:10,fontWeight:'700',letterSpacing:1.6,marginTop:10 },
  actionsRow:{ flexDirection:'row',gap:12,alignItems:'center' },
  actionBtn:{ flex:1,paddingHorizontal:10 },
  reassurance:{ flexDirection:'row',gap:8,alignItems:'center' },
  empty:{ alignItems:'center',gap:16,paddingVertical:26 },
  emptyIconCircle:{ width:68,height:68,borderRadius:34,alignItems:'center',justifyContent:'center' },
  historyContainer:{ gap:14 },
  historyHeader:{ flexDirection:'row',alignItems:'center',gap:14 },
  scenarioStarter:{ gap:11,padding:14,borderRadius:18,borderWidth:1 },
  scenarioStarterTop:{ flexDirection:'row',alignItems:'center',gap:10 },
  scenarioStarterIcon:{ width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center' },
  scenarioStarterEyebrow:{ fontSize:9,fontWeight:'800',letterSpacing:1.3 },
  scenarioStarterTitle:{ fontSize:14,fontWeight:'800',letterSpacing:-0.25 },
  scenarioStarterCount:{ paddingHorizontal:9,paddingVertical:6,borderRadius:20 },
  scenarioStarterCountText:{ fontSize:9,fontWeight:'800',letterSpacing:0.6 },
  scenarioStarterBody:{ fontSize:11,lineHeight:16 },
  scenarioChooseButton:{ minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,paddingHorizontal:14,borderRadius:13 },
  scenarioChooseText:{ color:'#FFFFFF',fontSize:12,fontWeight:'800' },
  scenarioOption:{ minHeight:72,borderWidth:1,borderRadius:16,paddingHorizontal:12,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:11 },
  activityCard:{ borderWidth:1,borderRadius:20,padding:16,gap:12,shadowColor:'#102D36',shadowOffset:{ width:0,height:2 },shadowOpacity:0.04,shadowRadius:6,elevation:2 },
  activityCardTop:{ flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:8,flexWrap:'wrap' },
  tagGroup:{ flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap',flex:1 },
  categoryBadge:{ flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:9,paddingVertical:4,borderRadius:8 },
  categoryBadgeText:{ fontSize:11,fontWeight:'700' },
  priorityBadge:{ flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:8,paddingVertical:4,borderRadius:8 },
  priorityBadgeText:{ fontSize:11,fontWeight:'700' },
  priorityDotSmall:{ width:6,height:6,borderRadius:3 },
  statusPillSmall:{ flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:9,paddingVertical:4,borderRadius:10 },
  statusPillText:{ fontSize:10,fontWeight:'700' },
  activityTitle:{ fontSize:17,lineHeight:23,fontWeight:'700',letterSpacing:-0.3 },
  metaRow:{ flexDirection:'row',alignItems:'center',gap:14,flexWrap:'wrap' },
  metaItem:{ flexDirection:'row',alignItems:'center',gap:5 },
  metaText:{ fontSize:12,fontWeight:'500' },
  detailsBox:{ padding:12,borderRadius:12 },
  chipsContainer:{ flexDirection:'row',flexWrap:'wrap',gap:6,paddingTop:10,borderTopWidth:1 },
  chipItem:{ flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:8,paddingVertical:4,borderRadius:7 },
  chipLabel:{ fontSize:11,fontWeight:'600' },
  chipVal:{ fontSize:11,fontWeight:'700' },
  cardFooter:{ flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,paddingTop:10,borderTopWidth:1 },
  referenceText:{ fontSize:11 },
  dateText:{ fontSize:11 },
  errorBox:{ padding:8,borderRadius:8,borderWidth:1 },
  errorText:{ fontSize:11,fontWeight:'600' },
});
