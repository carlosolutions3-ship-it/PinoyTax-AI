import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsString()
  tin?: string;

  @IsOptional()
  @IsString()
  sssNumber?: string;

  @IsOptional()
  @IsString()
  philhealthNumber?: string;

  @IsOptional()
  @IsString()
  pagibigNumber?: string;

  @IsDateString()
  dateHired!: string;

  @IsNumber()
  @Min(0)
  basicSalary!: number;

  @IsIn(['monthly', 'semi_monthly', 'weekly'])
  payFrequency!: 'monthly' | 'semi_monthly' | 'weekly';
}

export class CreatePayrollRunDto {
  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;
}
