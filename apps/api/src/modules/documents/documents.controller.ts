import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../identity/guards/permissions.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateFolderDto, ListDocumentsQueryDto, UploadDocumentMetadataDto } from './dto/document.dto';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB per Phase 3 §5 upload caps

@ApiTags('documents')
@ApiBearerAuth('access-token')
@Controller('companies/:companyId/documents')
@UseGuards(PermissionsGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('folders')
  @RequirePermissions('documents:write')
  async createFolder(@Param('companyId') companyId: string, @Body() dto: CreateFolderDto) {
    return this.documentsService.createFolder(companyId, dto);
  }

  @Get('folders')
  @RequirePermissions('documents:read')
  async listFolders(@Param('companyId') companyId: string) {
    return this.documentsService.listFolders(companyId);
  }

  @Get()
  @RequirePermissions('documents:read')
  async listDocuments(
    @Param('companyId') companyId: string,
    @Query() { folderId, category }: ListDocumentsQueryDto,
  ) {
    return this.documentsService.listDocuments(companyId, folderId, category);
  }

  @Post()
  @RequirePermissions('documents:write')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  async uploadDocument(
    @Param('companyId') companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentMetadataDto,
  ) {
    if (!file) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'A file must be attached.' });
    }
    return this.documentsService.uploadDocument(
      companyId,
      user.id,
      file.originalname,
      file.mimetype,
      file.buffer,
      dto,
    );
  }

  @Post(':documentId/versions')
  @RequirePermissions('documents:write')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  async uploadNewVersion(
    @Param('companyId') companyId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'A file must be attached.' });
    }
    return this.documentsService.uploadNewVersion(
      companyId,
      documentId,
      user.id,
      file.originalname,
      file.mimetype,
      file.buffer,
    );
  }

  @Get(':documentId/versions')
  @RequirePermissions('documents:read')
  async listVersions(@Param('companyId') companyId: string, @Param('documentId') documentId: string) {
    return this.documentsService.listVersions(companyId, documentId);
  }

  @Get(':documentId/download')
  @RequirePermissions('documents:read')
  async getDownloadUrl(@Param('companyId') companyId: string, @Param('documentId') documentId: string) {
    return this.documentsService.getDownloadUrl(companyId, documentId);
  }
}
