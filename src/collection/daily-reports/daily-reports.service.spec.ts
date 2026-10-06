import { DailyReportsService } from './daily-reports.service';

const leanResult = (value: unknown) => ({
  lean: jest.fn().mockResolvedValue(value),
});

describe('DailyReportsService per-truck reporting', () => {
  it('filters every daily operation by the selected truck', async () => {
    const service: any = Object.create(DailyReportsService.prototype);
    const truckId = '507f1f77bcf86cd799439011';
    const driverId = '507f191e810c19729de860ea';
    service.trucks = {
      findOne: jest.fn().mockReturnValue(
        leanResult({
          _id: truckId,
          code: 'T01',
          name: 'Xe 01',
          licensePlate: '51A-12345',
          driverId,
          driverName: 'Tài xế 01',
        }),
      ),
    };
    service.invoices = { find: jest.fn().mockReturnValue(leanResult([])) };
    service.receipts = { find: jest.fn().mockReturnValue(leanResult([])) };
    service.returns = { find: jest.fn().mockReturnValue(leanResult([])) };

    const result = await service.preview('2026-10-06', truckId);

    expect(service.invoices.find).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'truck', truckId }),
    );
    expect(service.receipts.find).toHaveBeenCalledWith(
      expect.objectContaining({ collectorId: driverId }),
    );
    expect(service.returns.find).toHaveBeenCalledWith(
      expect.objectContaining({ destinationTruckId: truckId }),
    );
    expect(result.data.truck).toMatchObject({
      id: truckId,
      code: 'T01',
      driverId,
    });
  });

  it('checks duplicate reports by both date and truck', async () => {
    const service: any = Object.create(DailyReportsService.prototype);
    const truckId = '507f1f77bcf86cd799439011';
    service.ensurePerTruckReportIndex = jest.fn().mockResolvedValue(undefined);
    service.model = { exists: jest.fn().mockResolvedValue({ _id: 'report' }) };

    await expect(
      service.create({ date: '2026-10-06', truckId }, 'actor'),
    ).rejects.toThrow('Xe này đã được chốt báo cáo trong ngày');
    expect(service.model.exists).toHaveBeenCalledWith({
      reportDate: '2026-10-06',
      truckId,
      isDeleted: false,
    });
  });
});
