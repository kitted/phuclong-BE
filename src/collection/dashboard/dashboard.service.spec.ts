import { Types } from 'mongoose';
import { DashboardService } from './dashboard.service';
import { RoleEnum } from '../users/interfaces/role.enum';

const queryResult = (value: any) => ({
  select: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(value),
  }),
});

const sortedQueryResult = (value: any) => ({
  select: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(value),
    }),
  }),
});

describe('DashboardService new customers', () => {
  it('counts invoices created after the customer entered the new-customer group', async () => {
    const service: any = Object.create(DashboardService.prototype);
    const salespersonId = new Types.ObjectId().toString();
    const customerId = new Types.ObjectId();
    const now = Date.now();
    const createdAt = new Date(now - 20 * 86400000);
    const firstInvoiceAt = new Date(now - 10 * 86400000);
    const latestInvoiceAt = new Date(now - 5 * 86400000);
    service.customers = {
      find: jest.fn().mockReturnValue(
        queryResult([
          {
            _id: customerId,
            code: 'KH001',
            name: 'Khách mới',
            phone: '0900000000',
            createdAt,
            codeHistory: [],
            interactions: [
              {
                context: 'NEW_CUSTOMER_CARE',
                channel: 'PHONE',
                action: 'Khách quan tâm dầu máy',
                outcome: 'CALL_BACK',
                followUpRequired: true,
                occurredAt: new Date(now - 2 * 86400000),
                nextFollowUpAt: new Date(now + 86400000),
              },
            ],
          },
        ]),
      ),
    };
    service.invoices = {
      find: jest.fn().mockReturnValue(
        sortedQueryResult([
          {
            customerId,
            code: 'HD-02',
            date: latestInvoiceAt,
            grandTotal: 700000,
            salespersonName: 'Sale Hậu',
          },
          {
            customerId,
            code: 'HD-01',
            date: firstInvoiceAt,
            totalAmount: 500000,
            salespersonName: 'Sale Hậu',
          },
        ]),
      ),
    };

    const result = await service.newCustomers(
      { days: '45', invoiceCount: 'ALL', limit: '200' },
      { id: salespersonId, role: RoleEnum.STAFF },
    );

    const invoiceMatch = service.invoices.find.mock.calls[0][0];
    expect(String(invoiceMatch.salespersonId)).toBe(salespersonId);
    expect(invoiceMatch.customerId.$in).toEqual([customerId]);
    expect(result.data).toContainEqual(
      expect.objectContaining({
        id: String(customerId),
        customerCode: 'KH001',
        customerName: 'Khách mới',
        qualificationReason: 'CREATED',
        customerQualifiedAt: createdAt,
        invoiceCount: 2,
        totalRevenue: 1200000,
        careInteractionCount: 1,
        latestCareInteraction: expect.objectContaining({
          outcome: 'CALL_BACK',
          followUpRequired: true,
        }),
      }),
    );
    expect(result.meta.days).toBe(45);
    expect(result.meta.candidateCount).toBe(1);
  });

  it('uses the latest code assignment date and ignores earlier invoices', async () => {
    const service: any = Object.create(DashboardService.prototype);
    const customerId = new Types.ObjectId();
    const now = Date.now();
    const codeChangedAt = new Date(now - 12 * 86400000);
    service.customers = {
      find: jest.fn().mockReturnValue(
        queryResult([
          {
            _id: customerId,
            code: 'KH099',
            name: 'Khách được gán mã',
            createdAt: new Date(now - 200 * 86400000),
            codeHistory: [
              {
                oldCode: 'KH-CU',
                newCode: 'KH099',
                changedAt: codeChangedAt,
              },
            ],
          },
        ]),
      ),
    };
    service.invoices = {
      find: jest.fn().mockReturnValue(
        sortedQueryResult([
          {
            customerId,
            code: 'HD-SAU',
            date: new Date(now - 4 * 86400000),
            grandTotal: 300000,
          },
          {
            customerId,
            code: 'HD-TRUOC',
            date: new Date(now - 20 * 86400000),
            grandTotal: 900000,
          },
        ]),
      ),
    };

    const result = await service.newCustomers(
      { days: '45', invoiceCount: '1', limit: '200' },
      { id: new Types.ObjectId().toString(), role: RoleEnum.ADMIN },
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        qualificationReason: 'CODE_CHANGED',
        customerQualifiedAt: codeChangedAt,
        invoiceCount: 1,
        totalRevenue: 300000,
        latestInvoiceCode: 'HD-SAU',
      }),
    );
  });

  it('exports the selected new-customer care history as an Excel workbook', async () => {
    const service: any = Object.create(DashboardService.prototype);
    const customerId = new Types.ObjectId();
    const actorId = new Types.ObjectId();
    const now = Date.now();
    const createdAt = new Date(now - 20 * 86400000);
    const interaction = {
      context: 'NEW_CUSTOMER_CARE',
      channel: 'PHONE',
      action: 'Khách quan tâm sản phẩm mới',
      purpose: 'NEEDS',
      outcome: 'CALL_BACK',
      followUpRequired: true,
      occurredAt: new Date(now - 2 * 86400000),
      nextFollowUpAt: new Date(now + 86400000),
      createdBy: String(actorId),
    };
    service.customers = {
      find: jest
        .fn()
        .mockReturnValueOnce(
          queryResult([
            {
              _id: customerId,
              code: 'KH001',
              name: 'Khách cần chăm sóc',
              phone: '0900000000',
              createdAt,
              codeHistory: [],
              interactions: [interaction],
            },
          ]),
        )
        .mockReturnValueOnce(
          queryResult([{ _id: customerId, interactions: [interaction] }]),
        ),
    };
    service.invoices = {
      find: jest.fn().mockReturnValue(
        sortedQueryResult([
          {
            customerId,
            code: 'HD-01',
            date: new Date(now - 10 * 86400000),
            grandTotal: 500000,
          },
        ]),
      ),
    };
    service.users = {
      find: jest.fn().mockReturnValue(
        queryResult([
          {
            _id: actorId,
            fullName: 'CSKH Hậu',
            username: 'hau',
          },
        ]),
      ),
    };

    const file = await service.exportNewCustomerCare(
      {
        days: '45',
        invoiceCount: 'ALL',
        customerIds: [String(customerId)],
      },
      { id: new Types.ObjectId().toString(), role: RoleEnum.ADMIN },
    );

    expect(Buffer.isBuffer(file)).toBe(true);
    expect(file.length).toBeGreaterThan(1000);
    expect(service.users.find).toHaveBeenCalledWith({
      _id: { $in: [String(actorId)] },
    });
  });
});
