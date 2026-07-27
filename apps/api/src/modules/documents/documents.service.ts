import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { CreateFolderDto, UploadDocumentMetadataDto } from './dto/document.dto';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async createFolder(companyId: string, dto: CreateFolderDto) {
    if (dto.parentFolderId) {
      const parent = await this.prisma.folder.findUnique({ where: { id: dto.parentFolderId } });
      if (!parent || parent.companyId !== companyId) {
        throw new NotFoundException({
          code: 'PARENT_FOLDER_NOT_FOUND',
          message: 'Parent folder not found.',
        });
      }
    }
    return this.prisma.folder.create({
      data: { companyId, name: dto.name, parentFolderId: dto.parentFolderId },
    });
  }

  async listFolders(companyId: string) {
    return this.prisma.folder.findMany({ where: { companyId } });
  }

  async listDocuments(companyId: string, folderId?: string, category?: string) {
    return this.prisma.vaultDocument.findMany({
      where: {
        companyId,
        ...(folderId ? { folderId } : {}),
        ...(category ? { category } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadDocument(
    companyId: string,
    uploadedById: string,
    fileName: string,
    mimeType: string,
    body: Buffer,
    dto: UploadDocumentMetadataDto,
  ) {
    if (dto.folderId) {
      const folder = await this.prisma.folder.findUnique({ where: { id: dto.folderId } });
      if (!folder || folder.companyId !== companyId) {
        throw new NotFoundException({ code: 'FOLDER_NOT_FOUND', message: 'Folder not found.' });
      }
    }

    const storageKey = this.storage.buildStorageKey(companyId, fileName);
    await this.storage.upload(storageKey, body, mimeType);

    return this.prisma.$transaction(async (tx) => {
      const document = await tx.vaultDocument.create({
        data: {
          companyId,
          folderId: dto.folderId,
          category: dto.category,
          fileName,
          storageKey,
          mimeType,
          sizeBytes: BigInt(body.length),
          uploadedById,
        },
      });

      const version = await tx.documentVersion.create({
        data: {
          documentId: document.id,
          storageKey,
          versionNumber: 1,
          uploadedById,
        },
      });

      return tx.vaultDocument.update({
        where: { id: document.id },
        data: { currentVersionId: version.id },
        include: { versions: true },
      });
    });
  }

  /**
   * Adds a new version of an existing document. The prior version's storage
   * object and database row are NEVER deleted — retained for regulatory
   * retrieval needs (Phase 2 §15).
   */
  async uploadNewVersion(
    companyId: string,
    documentId: string,
    uploadedById: string,
    fileName: string,
    mimeType: string,
    body: Buffer,
  ) {
    const document = await this.prisma.vaultDocument.findUnique({
      where: { id: documentId },
      include: { versions: true },
    });
    if (!document || document.companyId !== companyId) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: 'Document not found.' });
    }

    const storageKey = this.storage.buildStorageKey(document.companyId, fileName);
    await this.storage.upload(storageKey, body, mimeType);

    const nextVersionNumber = document.versions.length + 1;

    return this.prisma.$transaction(async (tx) => {
      const version = await tx.documentVersion.create({
        data: {
          documentId: document.id,
          storageKey,
          versionNumber: nextVersionNumber,
          uploadedById,
        },
      });

      return tx.vaultDocument.update({
        where: { id: document.id },
        data: { currentVersionId: version.id, fileName, mimeType, sizeBytes: BigInt(body.length) },
      });
    });
  }

  async listVersions(companyId: string, documentId: string) {
    const document = await this.prisma.vaultDocument.findUnique({ where: { id: documentId } });
    if (!document || document.companyId !== companyId) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: 'Document not found.' });
    }
    return this.prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { versionNumber: 'desc' },
    });
  }

  async getDownloadUrl(companyId: string, documentId: string) {
    const document = await this.prisma.vaultDocument.findUnique({ where: { id: documentId } });
    if (!document || document.companyId !== companyId) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: 'Document not found.' });
    }
    const url = await this.storage.getSignedDownloadUrl(document.storageKey);
    return { url, expiresInSeconds: 300 };
  }
}
