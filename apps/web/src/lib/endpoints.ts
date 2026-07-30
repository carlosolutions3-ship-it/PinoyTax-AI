import { api } from './api-client';
import type {
  AiConversation,
  AiMessage,
  AuditLog,
  Branch,
  Company,
  ComplianceStatus,
  Employee,
  FilingDeadline,
  Firm,
  FirmCompanyAssignmentEntry,
  FirmDashboard,
  FirmPermissionCatalogEntry,
  FirmStaffEntry,
  FirmType,
  FlaggedIssue,
  Folder,
  FormTemplate,
  IssueStatus,
  LoginResponse,
  MyCompanyEntry,
  MyFirmEntry,
  NotificationItem,
  NotificationPreference,
  PendingClientInvitation,
  PendingFirmInvitation,
  PendingInvitation,
  PayrollRun,
  PayrollRunDetail,
  Payslip,
  SecurityEvent,
  SessionInfo,
  StaffEntry,
  TaxComputation,
  UserProfile,
  VaultDocument,
  DocumentVersion,
} from './types';

// ---------------------------------------------------------------------------
// auth (POST /auth/*, GET /auth/sessions, DELETE /auth/sessions/:id)
// ---------------------------------------------------------------------------

export const authApi = {
  register: (input: { email: string; password: string; firstName: string; lastName: string; phoneNumber?: string }) =>
    api.post<{ id: string; email: string }>('/auth/register', input),

  verifyEmail: (token: string) => api.post<{ message: string }>('/auth/verify-email', { token }),

  login: (input: { email: string; password: string; rememberMe?: boolean }) =>
    api.post<LoginResponse>('/auth/login', input),

  logout: () => api.post<{ message: string }>('/auth/logout'),

  forgotPassword: (email: string) => api.post<{ message: string }>('/auth/forgot-password', { email }),

  resetPassword: (input: { token: string; newPassword: string }) =>
    api.post<{ message: string }>('/auth/reset-password', input),

  listSessions: () => api.get<SessionInfo[]>('/auth/sessions'),

  revokeSession: (sessionId: string) => api.delete<{ message: string }>(`/auth/sessions/${sessionId}`),
};

// ---------------------------------------------------------------------------
// users (GET /users/me, GET /users/me/notifications)
// ---------------------------------------------------------------------------

export const usersApi = {
  me: () => api.get<UserProfile>('/users/me'),
  myNotifications: () => api.get<NotificationItem[]>('/users/me/notifications'),
};

// ---------------------------------------------------------------------------
// companies (org module)
// ---------------------------------------------------------------------------

export interface CreateCompanyInput {
  businessName: string;
  tradeName?: string;
  businessType: 'sole_prop' | 'opc' | 'partnership' | 'corporation';
  vatClassification: 'vat' | 'non_vat';
  tin: string;
  rdoCode?: string;
  businessAddress?: string;
  email?: string;
  contactNumber?: string;
}

export interface UpdateCompanyInput {
  tradeName?: string;
  vatClassification?: 'vat' | 'non_vat';
  rdoCode?: string;
  businessAddress?: string;
  email?: string;
  contactNumber?: string;
}

export const companiesApi = {
  create: (input: CreateCompanyInput) => api.post<Company>('/companies', input),
  listMine: () => api.get<MyCompanyEntry[]>('/companies'),
  getOne: (companyId: string) => api.get<Company>(`/companies/${companyId}`),
  update: (companyId: string, input: UpdateCompanyInput) =>
    api.patch<Company>(`/companies/${companyId}`, input),
  inviteStaff: (companyId: string, input: { email: string; roleCode: 'accountant' | 'bookkeeper' }) =>
    api.post(`/companies/${companyId}/invitations`, input),
  listMyInvitations: () => api.get<PendingInvitation[]>('/companies/invitations/mine'),
  acceptInvitation: (invitationId: string) =>
    api.post<StaffEntry>(`/companies/invitations/${invitationId}/accept`),
  listStaff: (companyId: string) => api.get<StaffEntry[]>(`/companies/${companyId}/staff`),
  revokeStaff: (companyId: string, userCompanyRoleId: string) =>
    api.delete<StaffEntry>(`/companies/${companyId}/staff/${userCompanyRoleId}`),
};

// ---------------------------------------------------------------------------
// branches
// ---------------------------------------------------------------------------

export interface CreateBranchInput {
  branchName: string;
  branchAddress?: string;
  rdoCode?: string;
}

export interface UpdateBranchInput {
  branchName?: string;
  branchAddress?: string;
  rdoCode?: string;
  status?: 'active' | 'inactive';
}

export const branchesApi = {
  list: (companyId: string) => api.get<Branch[]>(`/companies/${companyId}/branches`),
  create: (companyId: string, input: CreateBranchInput) =>
    api.post<Branch>(`/companies/${companyId}/branches`, input),
  update: (companyId: string, branchId: string, input: UpdateBranchInput) =>
    api.patch<Branch>(`/companies/${companyId}/branches/${branchId}`, input),
};

// ---------------------------------------------------------------------------
// payroll
// ---------------------------------------------------------------------------

export interface CreateEmployeeInput {
  firstName: string;
  lastName: string;
  tin?: string;
  sssNumber?: string;
  philhealthNumber?: string;
  pagibigNumber?: string;
  dateHired: string;
  basicSalary: number;
  payFrequency: 'monthly' | 'semi_monthly' | 'weekly';
}

export const payrollApi = {
  listEmployees: (companyId: string) => api.get<Employee[]>(`/companies/${companyId}/employees`),
  createEmployee: (companyId: string, input: CreateEmployeeInput) =>
    api.post<Employee>(`/companies/${companyId}/employees`, input),

  listRuns: (companyId: string) => api.get<PayrollRun[]>(`/companies/${companyId}/payroll-runs`),
  getRun: (companyId: string, runId: string) =>
    api.get<PayrollRunDetail>(`/companies/${companyId}/payroll-runs/${runId}`),
  createRun: (companyId: string, input: { periodStart: string; periodEnd: string }) =>
    api.post<PayrollRun>(`/companies/${companyId}/payroll-runs`, input),
  computeRun: (companyId: string, runId: string) =>
    api.post<Payslip[]>(`/companies/${companyId}/payroll-runs/${runId}/compute`),
  finalizeRun: (companyId: string, runId: string) =>
    api.post<PayrollRun>(`/companies/${companyId}/payroll-runs/${runId}/finalize`),
};

// ---------------------------------------------------------------------------
// tax computations
// ---------------------------------------------------------------------------

export interface ComputeTaxInput {
  computationType: 'income_tax' | 'vat' | 'percentage_tax' | 'ewt' | 'withholding_comp';
  periodStart: string;
  periodEnd: string;
  grossSales?: number;
  grossReceipts?: number;
  businessExpenses?: number;
  payrollExpenses?: number;
  otherDeductions?: number;
}

export const taxApi = {
  list: (companyId: string) => api.get<TaxComputation[]>(`/companies/${companyId}/tax-computations`),
  getOne: (companyId: string, computationId: string) =>
    api.get<TaxComputation>(`/companies/${companyId}/tax-computations/${computationId}`),
  compute: (companyId: string, input: ComputeTaxInput) =>
    api.post<TaxComputation>(`/companies/${companyId}/tax-computations`, input),
  confirm: (companyId: string, computationId: string) =>
    api.post<TaxComputation>(`/companies/${companyId}/tax-computations/${computationId}/confirm`),
};

// ---------------------------------------------------------------------------
// compliance
// ---------------------------------------------------------------------------

export const complianceApi = {
  getDeadlines: (companyId: string, status?: string) =>
    api.get<FilingDeadline[]>(
      `/companies/${companyId}/deadlines${status ? `?status=${encodeURIComponent(status)}` : ''}`,
    ),
  getStatus: (companyId: string) => api.get<ComplianceStatus[]>(`/companies/${companyId}/compliance-status`),
  getFlaggedIssues: (companyId: string) => api.get<FlaggedIssue[]>(`/companies/${companyId}/flagged-issues`),
  runScan: (companyId: string) => api.post<{ message: string }>(`/companies/${companyId}/compliance-scan`),
  updateIssueStatus: (companyId: string, issueId: string, status: IssueStatus) =>
    api.patch<FlaggedIssue>(`/companies/${companyId}/flagged-issues/${issueId}`, { status }),
};

// ---------------------------------------------------------------------------
// AI assistant
// ---------------------------------------------------------------------------

export const aiApi = {
  startConversation: (companyId: string) =>
    api.post<AiConversation>(`/companies/${companyId}/ai/conversations`),
  getConversation: (companyId: string, conversationId: string) =>
    api.get<AiConversation>(`/companies/${companyId}/ai/conversations/${conversationId}`),
  sendMessage: (companyId: string, conversationId: string, content: string) =>
    api.post<AiMessage>(`/companies/${companyId}/ai/conversations/${conversationId}/messages`, { content }),
};

// ---------------------------------------------------------------------------
// documents
// ---------------------------------------------------------------------------

export const documentsApi = {
  listFolders: (companyId: string) => api.get<Folder[]>(`/companies/${companyId}/documents/folders`),
  createFolder: (companyId: string, input: { name: string; parentFolderId?: string }) =>
    api.post<Folder>(`/companies/${companyId}/documents/folders`, input),
  list: (companyId: string) => api.get<VaultDocument[]>(`/companies/${companyId}/documents`),
  upload: (
    companyId: string,
    file: File,
    input: { category: string; folderId?: string },
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', input.category);
    if (input.folderId) formData.append('folderId', input.folderId);
    return api.postForm<VaultDocument>(`/companies/${companyId}/documents`, formData);
  },
  uploadVersion: (companyId: string, documentId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.postForm<VaultDocument>(`/companies/${companyId}/documents/${documentId}/versions`, formData);
  },
  listVersions: (companyId: string, documentId: string) =>
    api.get<DocumentVersion[]>(`/companies/${companyId}/documents/${documentId}/versions`),
  getDownloadUrl: (companyId: string, documentId: string) =>
    api.get<{ url: string; expiresInSeconds: number }>(
      `/companies/${companyId}/documents/${documentId}/download`,
    ),
};

// ---------------------------------------------------------------------------
// forms (public)
// ---------------------------------------------------------------------------

export const formsApi = {
  list: (agency?: string) => api.get<FormTemplate[]>(`/forms${agency ? `?agency=${agency}` : ''}`),
  getOne: (formCode: string) => api.get<FormTemplate>(`/forms/${formCode}`),
  getDownloadUrl: (formCode: string) =>
    api.get<{ url: string; expiresInSeconds: number }>(`/forms/${formCode}/download`),
};

// ---------------------------------------------------------------------------
// notifications
// ---------------------------------------------------------------------------

export const notificationsApi = {
  getPreferences: () => api.get<NotificationPreference[]>('/notification-preferences'),
  setPreference: (input: { channel: string; category: string; isEnabled: boolean }) =>
    api.patch<NotificationPreference>('/notification-preferences', input),
};

// ---------------------------------------------------------------------------
// admin
// ---------------------------------------------------------------------------

export const adminApi = {
  auditLogs: (companyId: string, take?: number) =>
    api.get<AuditLog[]>(`/admin/audit-logs/${companyId}${take ? `?take=${take}` : ''}`),
  securityEvents: (take?: number) =>
    api.get<SecurityEvent[]>(`/admin/security-events${take ? `?take=${take}` : ''}`),
};

// ---------------------------------------------------------------------------
// firms
// ---------------------------------------------------------------------------

export interface CreateFirmInput {
  firmName: string;
  firmType: FirmType;
  contactEmail: string;
  contactNumber?: string;
}

export interface UpdateFirmInput {
  firmName?: string;
  contactEmail?: string;
  contactNumber?: string;
}

// firm_owner is intentionally not assignable via invite/role-change — see
// the backend DTO comment (ownership transfer is out of scope).
export type AssignableFirmRoleCode = 'firm_admin' | 'firm_accountant' | 'firm_bookkeeper' | 'firm_auditor';

export const firmsApi = {
  create: (input: CreateFirmInput) => api.post<Firm>('/firms', input),
  listMine: () => api.get<MyFirmEntry[]>('/firms'),
  getOne: (firmId: string) => api.get<Firm>(`/firms/${firmId}`),
  update: (firmId: string, input: UpdateFirmInput) => api.patch<Firm>(`/firms/${firmId}`, input),
  getDashboard: (firmId: string) => api.get<FirmDashboard>(`/firms/${firmId}/dashboard`),
  permissionCatalog: () => api.get<FirmPermissionCatalogEntry[]>('/firms/permission-catalog'),

  inviteStaff: (firmId: string, input: { email: string; firmRoleCode: AssignableFirmRoleCode }) =>
    api.post<FirmStaffEntry>(`/firms/${firmId}/staff`, input),
  listStaff: (firmId: string) => api.get<FirmStaffEntry[]>(`/firms/${firmId}/staff`),
  updateStaffRole: (firmId: string, membershipId: string, firmRoleCode: AssignableFirmRoleCode) =>
    api.patch<FirmStaffEntry>(`/firms/${firmId}/staff/${membershipId}`, { firmRoleCode }),
  revokeStaff: (firmId: string, membershipId: string) =>
    api.delete<FirmStaffEntry>(`/firms/${firmId}/staff/${membershipId}`),

  listMyInvitations: () => api.get<PendingFirmInvitation[]>('/firms/invitations/mine'),
  acceptInvitation: (membershipId: string) => api.post<FirmStaffEntry>(`/firms/invitations/${membershipId}/accept`),

  createClientCompany: (firmId: string, input: CreateCompanyInput) =>
    api.post<Company>(`/firms/${firmId}/companies`, input),
  listClientCompanies: (firmId: string) => api.get<Company[]>(`/firms/${firmId}/companies`),
  lookupCompanyByTin: (firmId: string, tin: string) =>
    api.get<{ id: string; businessName: string; tradeName: string | null; firmId: string | null }>(
      `/firms/${firmId}/companies/lookup?tin=${encodeURIComponent(tin)}`,
    ),
  removeClientCompany: (firmId: string, companyId: string) =>
    api.delete<Company>(`/firms/${firmId}/companies/${companyId}`),
  inviteClientCompany: (firmId: string, companyId: string) =>
    api.post(`/firms/${firmId}/client-invitations`, { companyId }),

  listMyClientInvitations: () => api.get<PendingClientInvitation[]>('/firms/client-invitations/mine'),
  respondToClientInvitation: (invitationId: string, accept: boolean) =>
    api.post(`/firms/client-invitations/${invitationId}/respond`, { accept }),

  listAssignments: (firmId: string, companyId: string) =>
    api.get<FirmCompanyAssignmentEntry[]>(`/firms/${firmId}/companies/${companyId}/assignments`),
  setAssignment: (firmId: string, companyId: string, membershipId: string, permissionCodes: string[]) =>
    api.put<FirmCompanyAssignmentEntry>(
      `/firms/${firmId}/companies/${companyId}/assignments/${membershipId}`,
      { permissionCodes },
    ),
  revokeAssignment: (firmId: string, assignmentId: string) =>
    api.delete<FirmCompanyAssignmentEntry>(`/firms/${firmId}/assignments/${assignmentId}`),
};
