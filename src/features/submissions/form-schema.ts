import schemaJson from './report-form-schema.json';

export type ReportFormBinding = 'title' | 'location' | 'details' | 'emergencyContact' | 'followUpDate';
export type ReportFormFieldType = 'text' | 'multiline' | 'phone' | 'date';
export type ReportFormSection = 'essentials' | 'details' | 'work-safety';
export type ReportValidationKey = ReportFormBinding;

export interface ReportFormField {
  id: string;
  binding?: ReportFormBinding;
  type: ReportFormFieldType;
  section: ReportFormSection;
  label: string;
  placeholder: string;
  required: boolean;
  maxLength: number;
  numberOfLines?: number;
  validationKey?: ReportValidationKey;
  visibleWhen?: 'requiresFollowUp';
  legacyTestID?: string;
  legacyErrorTestID?: string;
  custom?: boolean;
}

export interface ReportFormSchema {
  formId: string;
  version: number;
  fields: ReportFormField[];
}

export const REPORT_FORM_SCHEMA = schemaJson as ReportFormSchema;

const fieldIds = REPORT_FORM_SCHEMA.fields.map(field => field.id);
if (new Set(fieldIds).size !== fieldIds.length) {
  throw new Error(`Form schema '${REPORT_FORM_SCHEMA.formId}' contains duplicate field IDs`);
}

if (REPORT_FORM_SCHEMA.fields.some(field => !field.id.trim())) {
  throw new Error(`Form schema '${REPORT_FORM_SCHEMA.formId}' contains an empty field ID`);
}
