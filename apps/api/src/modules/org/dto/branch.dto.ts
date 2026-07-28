import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateBranchDto {
  @IsString()
  branchName!: string;

  @IsOptional()
  @IsString()
  branchAddress?: string;

  @IsOptional()
  @IsString()
  rdoCode?: string;
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsString()
  branchAddress?: string;

  @IsOptional()
  @IsString()
  rdoCode?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;
}
