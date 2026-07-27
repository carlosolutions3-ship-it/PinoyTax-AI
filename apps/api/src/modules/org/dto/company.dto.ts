import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

enum BusinessType {
  sole_prop = 'sole_prop',
  opc = 'opc',
  partnership = 'partnership',
  corporation = 'corporation',
}

enum VatClassification {
  vat = 'vat',
  non_vat = 'non_vat',
}

export class CreateCompanyDto {
  @IsString()
  businessName!: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsEnum(BusinessType)
  businessType!: BusinessType;

  @IsEnum(VatClassification)
  vatClassification!: VatClassification;

  // Philippine TIN format: NNN-NNN-NNN or NNN-NNN-NNN-NNNNN (branch code)
  @Matches(/^\d{3}-\d{3}-\d{3}(-\d{3,5})?$/, {
    message: 'TIN must be in the format 000-000-000 or 000-000-000-00000.',
  })
  tin!: string;

  @IsOptional()
  @IsString()
  rdoCode?: string;

  @IsOptional()
  @IsString()
  businessAddress?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;
}

export class InviteStaffDto {
  @IsEmail()
  email!: string;

  @IsIn(['accountant', 'bookkeeper'])
  roleCode!: 'accountant' | 'bookkeeper';
}

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsOptional()
  @IsEnum(VatClassification)
  vatClassification?: VatClassification;

  @IsOptional()
  @IsString()
  rdoCode?: string;

  @IsOptional()
  @IsString()
  businessAddress?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;
}
