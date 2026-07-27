import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateFolderDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  parentFolderId?: string;
}

export const DOCUMENT_CATEGORIES = [
  'bir_form',
  'permit',
  'receipt',
  'payment_confirmation',
  'other',
] as const;

export class UploadDocumentMetadataDto {
  @IsIn(DOCUMENT_CATEGORIES)
  category!: (typeof DOCUMENT_CATEGORIES)[number];

  @IsOptional()
  @IsString()
  folderId?: string;
}

export class ListDocumentsQueryDto {
  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsIn(DOCUMENT_CATEGORIES)
  category?: (typeof DOCUMENT_CATEGORIES)[number];
}
