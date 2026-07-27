import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AiAssistantService } from './ai-assistant.service';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../identity/guards/permissions.guard';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('ai')
@ApiBearerAuth('access-token')
@Controller('companies/:companyId/ai/conversations')
@UseGuards(PermissionsGuard)
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Post()
  @RequirePermissions('ai_assistant:use')
  async startConversation(
    @Param('companyId') companyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.aiAssistantService.startConversation(companyId, user.id);
  }

  @Get(':conversationId')
  @RequirePermissions('ai_assistant:use')
  async getConversation(
    @Param('companyId') companyId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.aiAssistantService.getConversation(companyId, conversationId);
  }

  @Post(':conversationId/messages')
  @RequirePermissions('ai_assistant:use')
  async sendMessage(
    @Param('companyId') companyId: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.aiAssistantService.sendMessage(companyId, conversationId, dto.content);
  }
}
