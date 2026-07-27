// Mirrors apps/api/src/modules/**/dto and prisma/schema.prisma exactly.
// Do not add fields here that the backend does not actually return.

export type UUID = string;

export interface UserProfile {
  id: UUID;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  isEmailVerified: boolean;
  isPlatformAdmin: boolean;
  createdAt: string;
}

export interface AuthUser {
  id: UUID;
  email: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface SessionInfo {
  id: UUID;
  deviceName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  isRememberMe: boolean;
  lastActiveAt: string;
  createdAt: string;
}

export type BusinessType = 'sole_prop' | 'opc' | 'partnership' | 'corporation';
export type VatClassification = 'vat' | 'non_vat';
export type CompanyStatus = 'active' | 'inactive' | 'under_review';

export interface Company {
  id: UUID;
  firmId: UUID | null;
  businessName: string;
  tradeName: string | null;
  businessType: BusinessType;
  taxpayerClassification: string | null;
  vatClassification: VatClassification;
  tin: string;
  rdoCode: string | null;
  secRegistrationNumber: string | null;
  dtiRegistrationNumber: string | null;
  cdaRegistrationNumber: string | null;
  businessAddress: string | null;
  email: string | null;
  contactNumber: string | null;
  registrationDate: string | null;
  fiscalYearStart: string | null;
  accountingMethod: 'accrual' | 'cash';
  currency: string;
  logoUrl: string | null;
  status: CompanyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MyCompanyEntry {
  company: Company;
  role: string;
}

export type EmploymentStatus = 'active' | 'resigned' | 'terminated';
export type PayFrequency = 'monthly' | 'semi_monthly' | 'weekly';

export interface Employee {
  id: UUID;
  companyId: UUID;
  firstName: string;
  lastName: string;
  tin: string | null;
  sssNumber: string | null;
  philhealthNumber: string | null;
  pagibigNumber: string | null;
  employmentStatus: EmploymentStatus;
  dateHired: string | null;
  basicSalary: string; // Prisma Decimal serializes as string over JSON
  payFrequency: PayFrequency;
  createdAt: string;
  updatedAt: string;
}

export type PayrollRunStatus = 'draft' | 'processing' | 'finalized' | 'paid';

export interface PayrollRun {
  id: UUID;
  companyId: UUID;
  periodStart: string;
  periodEnd: string;
  status: PayrollRunStatus;
  createdById: string | null;
  finalizedAt: string | null;
  createdAt: string;
}

export interface Payslip {
  id: UUID;
  payrollRunId: UUID;
  employeeId: UUID;
  employee?: Employee;
  basicPay: string;
  overtimePay: string;
  holidayPay: string;
  allowances: string;
  sssContribution: string;
  philhealthContribution: string;
  pagibigContribution: string;
  withholdingTax: string;
  grossPay: string;
  totalDeductions: string;
  netPay: string;
  computationSnapshot: { errors?: string[]; computedAt?: string } | null;
}

export interface PayrollRunDetail extends PayrollRun {
  payslips: Payslip[];
}

export type ComputationType = 'income_tax' | 'vat' | 'percentage_tax' | 'ewt' | 'withholding_comp';
export type ComputationStatus = 'draft' | 'confirmed';

export interface TaxComputation {
  id: UUID;
  companyId: UUID;
  computationType: ComputationType;
  periodStart: string;
  periodEnd: string;
  inputs: Record<string, unknown>;
  ruleIdsUsed: string[];
  result: string | null;
  missingInputs: string[];
  status: ComputationStatus;
  createdAt: string;
  breakdown?: Record<string, unknown>;
}

export type Agency = 'bir' | 'sss' | 'philhealth' | 'pagibig' | 'lgu';
export type FilingStatus = 'upcoming' | 'due_today' | 'overdue' | 'filed';

export interface FilingDeadline {
  id: UUID;
  companyId: UUID;
  formCode: string;
  agency: Agency;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  status: FilingStatus;
}

export interface ComplianceStatus {
  id: UUID;
  companyId: UUID;
  category: string;
  completedCount: number;
  pendingCount: number;
  missingCount: number;
  overdueCount: number;
  compliancePercentage: string;
  lastComputedAt: string;
}

export type IssueType =
  | 'missing_filing'
  | 'missing_contribution'
  | 'missing_document'
  | 'vat_misclassification'
  | 'duplicate_transaction'
  | 'duplicate_expense'
  | 'computation_error'
  | 'missing_info'
  | 'other_risk';
export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IssueStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed';

export interface FlaggedIssue {
  id: UUID;
  companyId: UUID;
  issueType: IssueType;
  severity: IssueSeverity;
  description: string;
  recommendedAction: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  status: IssueStatus;
  detectedAt: string;
  resolvedAt: string | null;
}

export type MessageSender = 'user' | 'assistant';
export type ConfidenceFlag = 'grounded' | 'low_confidence' | 'missing_info';

export interface AiMessage {
  id: UUID;
  conversationId: UUID;
  sender: MessageSender;
  content: string;
  retrievedSources: Array<{ type: string; label: string; sourceReference: string | null; content: string }> | null;
  confidenceFlag: ConfidenceFlag | null;
  createdAt: string;
}

export interface AiConversation {
  id: UUID;
  companyId: UUID;
  userId: UUID;
  startedAt: string;
  lastMessageAt: string;
  messages?: AiMessage[];
}

export interface Folder {
  id: UUID;
  companyId: UUID;
  name: string;
  parentFolderId: UUID | null;
}

export type DocumentCategory = 'bir_form' | 'permit' | 'receipt' | 'payment_confirmation' | 'other';

export interface VaultDocument {
  id: UUID;
  companyId: UUID;
  folderId: UUID | null;
  category: DocumentCategory;
  fileName: string;
  storageKey: string;
  mimeType: string | null;
  sizeBytes: string | null;
  uploadedById: string | null;
  currentVersionId: string | null;
  createdAt: string;
}

export interface DocumentVersion {
  id: UUID;
  documentId: UUID;
  storageKey: string;
  versionNumber: number;
  uploadedById: string | null;
  createdAt: string;
}

export interface FormTemplate {
  id: UUID;
  formCode: string;
  agency: Agency;
  title: string;
  description: string | null;
  purpose: string | null;
  filingFrequency: string | null;
  defaultDueRule: string | null;
  requiredAttachments: string[];
  fileUrl: string | null;
  version: string | null;
}

export type NotificationChannel = 'email' | 'sms' | 'push' | 'in_app';
export type NotificationStatus = 'queued' | 'sent' | 'failed' | 'read';

export interface NotificationItem {
  id: UUID;
  companyId: UUID | null;
  userId: UUID;
  channel: NotificationChannel;
  category: string;
  title: string;
  body: string;
  relatedDeadlineId: string | null;
  status: NotificationStatus;
  scheduledFor: string | null;
  sentAt: string | null;
}

export interface NotificationPreference {
  id: UUID;
  userId: UUID;
  channel: NotificationChannel;
  category: string;
  isEnabled: boolean;
}

export interface AuditLog {
  id: UUID;
  companyId: UUID | null;
  actorUserId: UUID | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  beforeState: unknown;
  afterState: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export interface SecurityEvent {
  id: UUID;
  userId: UUID | null;
  eventType: string;
  details: unknown;
  createdAt: string;
}

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}
