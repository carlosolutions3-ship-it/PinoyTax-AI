import { IsDateString, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export enum ComputationTypeDto {
  income_tax = 'income_tax',
  vat = 'vat',
  percentage_tax = 'percentage_tax',
  ewt = 'ewt',
  withholding_comp = 'withholding_comp',
}

export class ComputeTaxDto {
  @IsEnum(ComputationTypeDto)
  computationType!: ComputationTypeDto;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  grossSales?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  grossReceipts?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  businessExpenses?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  payrollExpenses?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  otherDeductions?: number;
}
