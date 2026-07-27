import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';

@Injectable()
export class FormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listForms(agency?: string) {
    return this.prisma.formTemplate.findMany({
      where: agency ? { agency: agency as never } : undefined,
      orderBy: { formCode: 'asc' },
    });
  }

  async getForm(formCode: string) {
    const form = await this.prisma.formTemplate.findUnique({ where: { formCode } });
    if (!form) {
      throw new NotFoundException({ code: 'FORM_NOT_FOUND', message: 'Form template not found.' });
    }
    return form;
  }

  async getDownloadUrl(formCode: string) {
    const form = await this.getForm(formCode);
    if (!form.fileUrl) {
      throw new NotFoundException({
        code: 'FORM_FILE_NOT_AVAILABLE',
        message: 'No downloadable file is available for this form yet.',
      });
    }
    // fileUrl stores the S3 object key for form templates uploaded to the
    // platform's shared reference bucket (not a public URL).
    const url = await this.storage.getSignedDownloadUrl(form.fileUrl);
    return { url, expiresInSeconds: 300 };
  }
}
