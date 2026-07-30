import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

enum FirmType {
  accounting_firm = 'accounting_firm',
  bookkeeping_firm = 'bookkeeping_firm',
  tax_consultancy = 'tax_consultancy',
}

// Assignable via invite/role-change endpoints. firm_owner is deliberately
// excluded — the only path to that role is creating the firm (see
// FirmService.createFirm); transferring ownership is out of scope for this
// release (see KNOWN_LIMITATIONS.md).
const ASSIGNABLE_FIRM_ROLE_CODES = ['firm_admin', 'firm_accountant', 'firm_bookkeeper', 'firm_auditor'] as const;
type AssignableFirmRoleCode = (typeof ASSIGNABLE_FIRM_ROLE_CODES)[number];

export class CreateFirmDto {
  @IsString()
  firmName!: string;

  @IsEnum(FirmType)
  firmType!: FirmType;

  @IsEmail()
  contactEmail!: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;
}

export class UpdateFirmDto {
  @IsOptional()
  @IsString()
  firmName?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;
}

export class InviteFirmStaffDto {
  @IsEmail()
  email!: string;

  @IsIn(ASSIGNABLE_FIRM_ROLE_CODES)
  firmRoleCode!: AssignableFirmRoleCode;
}

export class UpdateFirmStaffRoleDto {
  @IsIn(ASSIGNABLE_FIRM_ROLE_CODES)
  firmRoleCode!: AssignableFirmRoleCode;
}

export class InviteClientCompanyDto {
  @IsUUID()
  companyId!: string;
}

export class RespondToClientInvitationDto {
  @IsBoolean()
  accept!: boolean;
}

export class AssignStaffPermissionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissionCodes!: string[];
}
