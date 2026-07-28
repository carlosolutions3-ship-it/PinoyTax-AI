import { NotFoundException } from '@nestjs/common';
import { BranchService } from './branch.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('BranchService', () => {
  let service: BranchService;
  let prisma: { branch: { create: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock } };

  const COMPANY_ID = 'company-1';

  beforeEach(() => {
    prisma = {
      branch: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    service = new BranchService(prisma as unknown as PrismaService);
  });

  it('creates a branch scoped to the given company', async () => {
    prisma.branch.create.mockResolvedValue({ id: 'b1', companyId: COMPANY_ID, branchName: 'Cebu' });
    await service.createBranch(COMPANY_ID, { branchName: 'Cebu' });
    expect(prisma.branch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ companyId: COMPANY_ID, branchName: 'Cebu' }) }),
    );
  });

  it('lists only branches for the given company', async () => {
    prisma.branch.findMany.mockResolvedValue([]);
    await service.listBranches(COMPANY_ID);
    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: COMPANY_ID } }),
    );
  });

  it('rejects fetching a branch that belongs to a different company', async () => {
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', companyId: 'other-company' });
    await expect(service.getBranch(COMPANY_ID, 'b1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects updating a branch that belongs to a different company', async () => {
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', companyId: 'other-company' });
    await expect(service.updateBranch(COMPANY_ID, 'b1', { status: 'inactive' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.branch.update).not.toHaveBeenCalled();
  });

  it('updates a branch that belongs to the given company', async () => {
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', companyId: COMPANY_ID });
    prisma.branch.update.mockResolvedValue({ id: 'b1', companyId: COMPANY_ID, status: 'inactive' });
    const result = await service.updateBranch(COMPANY_ID, 'b1', { status: 'inactive' });
    expect(result.status).toBe('inactive');
  });
});
