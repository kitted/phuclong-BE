import { DailyReportsService } from './daily-reports.service';

const leanResult = (value: unknown) => ({
  lean: jest.fn().mockResolvedValue(value),
});

describe('DailyReportsService per-salesperson reporting', () => {
  it('filters every daily operation by the selected salesperson', async () => {
    const service: any = Object.create(DailyReportsService.prototype);
    const salespersonId = '507f1f77bcf86cd799439011';
    service.users = {
      findOne: jest.fn().mockReturnValue(
        leanResult({
          _id: salespersonId,
          employeeCode: 'SALE01',
          fullName: 'Sale 01',
          phone: '0900000001',
        }),
      ),
    };
    service.invoices = { find: jest.fn().mockReturnValue(leanResult([])) };
    service.receipts = { find: jest.fn().mockReturnValue(leanResult([])) };
    service.returns = { find: jest.fn().mockReturnValue(leanResult([])) };

    const result = await service.preview('2026-10-06', salespersonId);

    expect(service.invoices.find).toHaveBeenCalledWith(
      expect.objectContaining({ salespersonId }),
    );
    expect(service.receipts.find).toHaveBeenCalledWith(
      expect.objectContaining({ collectorId: salespersonId }),
    );
    expect(service.returns.find).toHaveBeenCalledWith(
      expect.objectContaining({ driverId: salespersonId }),
    );
    expect(result.data.salesperson).toMatchObject({
      id: salespersonId,
      code: 'SALE01',
      name: 'Sale 01',
    });
  });

  it('checks duplicate reports by both date and salesperson', async () => {
    const service: any = Object.create(DailyReportsService.prototype);
    const salespersonId = '507f1f77bcf86cd799439011';
    service.ensurePerSalespersonReportIndex = jest
      .fn()
      .mockResolvedValue(undefined);
    service.model = { exists: jest.fn().mockResolvedValue({ _id: 'report' }) };

    await expect(
      service.create({ date: '2026-10-06', salespersonId }, 'actor'),
    ).rejects.toThrow('Sale này đã được chốt báo cáo trong ngày');
    expect(service.model.exists).toHaveBeenCalledWith({
      reportDate: '2026-10-06',
      salespersonId,
      isDeleted: false,
    });
  });
});
