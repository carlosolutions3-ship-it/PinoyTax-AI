import { IsIn, IsOptional } from 'class-validator';

export class GetDeadlinesQueryDto {
  @IsOptional()
  @IsIn(['upcoming', 'due_today', 'overdue', 'filed'])
  status?: 'upcoming' | 'due_today' | 'overdue' | 'filed';
}
