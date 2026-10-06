import { DailyReportsService } from './daily-reports.service';

const leanResult = (value: unknown) => ({
  lean: jest.fn().mockResolvedValue(value),
});
const selectedLeanResult = (value: unknown) => ({
  select: jest.fn().mockReturnValue(leanResult(value)),
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

  it('lists a historical salesperson from old invoice snapshots', async () => {
    const service: any = Object.create(DailyReportsService.prototype);
    const salespersonId = '507f1f77bcf86cd799439011';
    service.users = { find: jest.fn().mockReturnValue(selectedLeanResult([])) };
    service.invoices = {
      find: jest.fn().mockReturnValue(
        selectedLeanResult([
          {
            salespersonId,
            salespersonCode: 'SALE-CU',
            salespersonName: 'Sale dữ liệu cũ',
          },
        ]),
      ),
    };

    const result = await service.salespeople('2025-01-10');

    expect(result.data).toContainEqual(
      expect.objectContaining({
        id: salespersonId,
        employeeCode: 'SALE-CU',
        fullName: 'Sale dữ liệu cũ',
        historical: true,
        hasInvoicesOnDate: true,
      }),
    );
  });

  it('counts promotion gifts in daily product quantities without adding revenue', async () => {
    const service: any = Object.create(DailyReportsService.prototype);
    const salespersonId = '507f1f77bcf86cd799439011';
    const productId = '507f191e810c19729de860ea';
    service.users = {
      findOne: jest
        .fn()
        .mockReturnValue(
          leanResult({ _id: salespersonId, fullName: 'Sale 01' }),
        ),
    };
    service.invoices = {
      find: jest.fn().mockReturnValue(
        leanResult([
          {
            _id: 'invoice-1',
            salespersonId,
            grandTotal: 100000,
            items: [
              {
                productId,
                productCode: 'SP01',
                productName: 'Sản phẩm 01',
                unit: 'Cái',
                qty: 2,
                lineTotal: 100000,
                lineType: 'SALE',
              },
              {
                productId,
                productCode: 'SP01',
                productName: 'Sản phẩm 01',
                unit: 'Cái',
                qty: 1,
                lineTotal: 0,
                lineType: 'GIFT',
              },
            ],
          },
        ]),
      ),
    };
    service.receipts = { find: jest.fn().mockReturnValue(leanResult([])) };
    service.returns = { find: jest.fn().mockReturnValue(leanResult([])) };
    service.productsModel = {
      find: jest.fn().mockReturnValue(selectedLeanResult([])),
    };
    service.websiteProducts = {
      find: jest.fn().mockReturnValue(selectedLeanResult([])),
    };

    const result = await service.preview('2026-10-06', salespersonId);

    expect(result.data.products).toContainEqual(
      expect.objectContaining({
        productId,
        quantity: 3,
        saleQuantity: 2,
        giftQuantity: 1,
        revenue: 100000,
      }),
    );
  });
});
