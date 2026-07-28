import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@Injectable()
export class BranchService {
  constructor(private readonly prisma: PrismaService) {}

  async createBranch(companyId: string, dto: CreateBranchDto) {
    return this.prisma.branch.create({
      data: {
        companyId,
        branchName: dto.branchName,
        branchAddress: dto.branchAddress,
        rdoCode: dto.rdoCode,
      },
    });
  }

  async listBranches(companyId: string) {
    return this.prisma.branch.findMany({
      where: { companyId },
      orderBy: { branchName: 'asc' },
    });
  }

  async getBranch(companyId: string, branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch || branch.companyId !== companyId) {
      throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Branch not found.' });
    }
    return branch;
  }

  async updateBranch(companyId: string, branchId: string, dto: UpdateBranchDto) {
    await this.getBranch(companyId, branchId);
    return this.prisma.branch.update({ where: { id: branchId }, data: dto });
  }
}
