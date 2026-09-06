import { DocumentSafetyService } from './document-safety.service';
import { DocumentSafetyOperationStatus } from './schemas/document-safety-operation.schema';
import { RoleEnum } from '../users/interfaces/role.enum';

describe('DocumentSafetyService', () => {
  const chain = (rows: any[]) => ({
    sort: jest
      .fn()
      .mockReturnValue({ lean: jest.fn().mockResolvedValue(rows) }),
  });

  const createService = () => {
    const operations: any = {
      findOne: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      create: jest.fn().mockResolvedValue({ _id: 'operation-1' }),
      findOneAndUpdate: jest.fn().mockResolvedValue({
        _id: 'operation-1',
        status: DocumentSafetyOperationStatus.COMPLETED,
      }),
    };
    const invoices: any = { find: jest.fn().mockReturnValue(chain([])) };
    const receipts: any = { find: jest.fn().mockReturnValue(chain([])) };
    const returns: any = { find: jest.fn().mockReturnValue(chain([])) };
    const invoiceService: any = { reverse: jest.fn().mockResolvedValue({}) };
    const debtPaymentService: any = { cancel: jest.fn().mockResolvedValue({}) };
    const customerReturnService: any = {
      reverse: jest.fn().mockResolvedValue({}),
    };
    const notifications: any = { create: jest.fn().mockResolvedValue([]) };
    const service = new DocumentSafetyService(
      operations,
      invoices,
      receipts,
      returns,
      invoiceService,
      debtPaymentService,
      customerReturnService,
      notifications,
    );
    return {
      service,
      operations,
      invoiceService,
      debtPaymentService,
      customerReturnService,
    };
  };

  it('returns an idempotent operation without running another reversal', async () => {
    const { service, operations, invoiceService } = createService();
    operations.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'existing-operation',
        status: DocumentSafetyOperationStatus.COMPLETED,
      }),
    });

    const response = await service.reverseDay(
      {
        date: '2026-09-07',
        reason: 'Kiểm tra idempotency',
        confirmation: 'HOAN TAC CHUNG TU TRONG NGAY',
        idempotencyKey: 'b45eb17a-c5b2-4f4b-a746-19641c46c997',
      },
      { id: 'admin-1', role: RoleEnum.ADMIN },
    );

    expect(response.idempotent).toBe(true);
    expect(invoiceService.reverse).not.toHaveBeenCalled();
  });

  it('cancels debt payments before reversing returns and invoices', async () => {
    const {
      service,
      debtPaymentService,
      customerReturnService,
      invoiceService,
    } = createService();
    jest.spyOn(service, 'preview').mockResolvedValue({
      data: {
        canReverse: true,
        period: { from: new Date(), to: new Date() },
        documents: {
          debtPayments: [{ id: 'receipt-1', code: 'PT-1', status: 'ACTIVE' }],
          customerReturns: [
            { id: 'return-1', code: 'TH-1', status: 'COMPLETED' },
          ],
          invoices: [{ id: 'invoice-1', code: 'HD-1', status: 'ACTIVE' }],
        },
      },
    });

    const response = await service.reverseDay(
      {
        date: '2026-09-07',
        reason: 'Hoàn tác dữ liệu nhập nhầm',
        confirmation: 'HOAN TAC CHUNG TU TRONG NGAY',
        idempotencyKey: '6a972625-8de2-4fc6-8138-1f22cb80f57e',
      },
      { id: 'admin-1', role: RoleEnum.ADMIN, name: 'Admin' },
    );

    expect(debtPaymentService.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      customerReturnService.reverse.mock.invocationCallOrder[0],
    );
    expect(
      customerReturnService.reverse.mock.invocationCallOrder[0],
    ).toBeLessThan(invoiceService.reverse.mock.invocationCallOrder[0]);
    expect(response.data.status).toBe(DocumentSafetyOperationStatus.COMPLETED);
  });
});
