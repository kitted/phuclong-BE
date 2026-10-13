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
      expect.objectContaining({
        status: 'ACTIVE',
        date: expect.any(Object),
      }),
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

  it('includes a debt payment linked to the selected salesperson invoice even when an admin collected it', async () => {
    const service: any = Object.create(DailyReportsService.prototype);
    const salespersonId = '507f1f77bcf86cd799439011';
    const receiptId = '507f191e810c19729de860ea';
    service.users = {
      findOne: jest.fn().mockReturnValue(
        leanResult({ _id: salespersonId, fullName: 'Sale 01' }),
      ),
    };
    service.invoices = {
      find: jest.fn().mockReturnValue(
        leanResult([
          {
            _id: 'invoice-current',
            salespersonId,
            debtPaymentId: receiptId,
            grandTotal: 100000,
            payments: [{ method: 'CASH', amount: 100000 }],
            items: [],
          },
        ]),
      ),
    };
    service.receipts = {
      find: jest.fn().mockReturnValue(
        leanResult([
          {
            _id: receiptId,
            code: 'PTCN-261013-000001',
            collectorId: '507f191e810c19729de860ff',
            collectorName: 'Admin',
            amount: 50000,
            payments: [{ method: 'BANK_TRANSFER', amount: 50000 }],
            allocations: [],
          },
        ]),
      ),
    };
    service.returns = { find: jest.fn().mockReturnValue(leanResult([])) };

    const result = await service.preview('2026-10-13', salespersonId);

    expect(result.data.summary.debtReceiptCount).toBe(1);
    expect(result.data.summary.totalCollected).toBe(150000);
    expect(result.data.documents).toContainEqual(
      expect.objectContaining({
        type: 'DEBT_PAYMENT',
        code: 'PTCN-261013-000001',
        amount: 50000,
      }),
    );
  });

  it('includes a full debt payment whose customer balance becomes 0đ', async () => {
    const service: any = Object.create(DailyReportsService.prototype);
    const salespersonId = '507f1f77bcf86cd799439011';
    service.users = {
      findOne: jest.fn().mockReturnValue(
        leanResult({ _id: salespersonId, fullName: 'Sale 01' }),
      ),
    };
    service.invoices = { find: jest.fn().mockReturnValue(leanResult([])) };
    service.receipts = {
      find: jest.fn().mockReturnValue(
        leanResult([
          {
            _id: '507f191e810c19729de860ea',
            code: 'PTCN-261013-000002',
            salespersonId,
            collectorId: '507f191e810c19729de860ff',
            amount: 250000,
            customerDebtBefore: 250000,
            customerDebtAfter: 0,
            payments: [{ method: 'CASH', amount: 250000 }],
            allocations: [],
          },
        ]),
      ),
    };
    service.returns = { find: jest.fn().mockReturnValue(leanResult([])) };

    const result = await service.preview('2026-10-13', salespersonId);

    expect(result.data.summary.debtReceiptCount).toBe(1);
    expect(result.data.summary.cash).toBe(250000);
    expect(result.data.documents).toContainEqual(
      expect.objectContaining({
        type: 'DEBT_PAYMENT',
        amount: 250000,
      }),
    );
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

  it('soft deletes an old report and allows its date to be reported again', async () => {
    const service: any = Object.create(DailyReportsService.prototype);
    const actorId = '507f1f77bcf86cd799439011';
    service.model = {
      findOneAndUpdate: jest.fn().mockResolvedValue({
        _id: '507f191e810c19729de860ea',
        code: 'BCN-261006-0001',
      }),
    };

    const result = await service.remove(
      '507f191e810c19729de860ea',
      actorId,
      'admin',
    );

    expect(service.model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '507f191e810c19729de860ea', isDeleted: false },
      {
        $set: expect.objectContaining({
          isDeleted: true,
          deletedAt: expect.any(Date),
          deletedBy: actorId,
        }),
      },
      { new: true },
    );
    expect(result.data).toEqual({
      id: '507f191e810c19729de860ea',
      code: 'BCN-261006-0001',
      deleted: true,
    });
  });

  it('only lets a sale delete their own report', async () => {
    const service: any = Object.create(DailyReportsService.prototype);
    const actorId = '507f1f77bcf86cd799439011';
    service.model = {
      findOneAndUpdate: jest.fn().mockResolvedValue({
        _id: '507f191e810c19729de860ea',
        code: 'BCN-261006-0001',
      }),
    };

    await service.remove('507f191e810c19729de860ea', actorId, 'staff');

    expect(service.model.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: '507f191e810c19729de860ea',
        isDeleted: false,
        salespersonId: actorId,
      },
      expect.anything(),
      { new: true },
    );
  });
});
