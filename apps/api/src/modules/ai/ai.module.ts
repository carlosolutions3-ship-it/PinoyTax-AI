import { Module } from '@nestjs/common';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { KnowledgeBaseService } from './knowledge-base.service';

@Module({
  controllers: [AiAssistantController],
  providers: [AiAssistantService, KnowledgeBaseService],
  exports: [AiAssistantService],
})
export class AiModule {}
