import { IsIn } from 'class-validator';

export class UpdateIssueStatusDto {
  @IsIn(['acknowledged', 'resolved', 'dismissed'])
  status!: 'acknowledged' | 'resolved' | 'dismissed';
}
