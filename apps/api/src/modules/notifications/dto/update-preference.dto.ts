import { IsBoolean, IsIn, IsString } from 'class-validator';

export class UpdateNotificationPreferenceDto {
  @IsIn(['email', 'sms', 'push', 'in_app'])
  channel!: 'email' | 'sms' | 'push' | 'in_app';

  @IsString()
  category!: string;

  @IsBoolean()
  isEnabled!: boolean;
}
