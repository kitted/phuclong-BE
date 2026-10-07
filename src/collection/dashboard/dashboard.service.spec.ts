import { Types } from 'mongoose';
import { DashboardService } from './dashboard.service';
import { RoleEnum } from '../users/interfaces/role.enum';

describe('DashboardService new customers', () => {
  it('finds customers with one or two invoices in 45 days and scopes staff to themselves', async () => {
    const service: any = Object.create(DashboardService.prototype);
    const salespersonId = new Types.ObjectId().toString();
    const customerId = new Types.ObjectId();
    service.invoices = {
      aggregate: jest.fn().mockResolvedValue([
        {
          _id: customerId,
          invoiceCount: 2,
          totalRevenue: 1200000,
          firstInvoiceAt: new Date('2026-09-01T00:00:00.000Z'),
          latestInvoiceAt: new Date('2026-09-20T00:00:00.000Z'),
          latestInvoiceCode: 'HD-02',
          salespersonNames: ['Sale Hậu'],
        },
      ]),
    };
    service.customers = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: customerId,
              code: 'KH001',
              name: 'Khách mới',
              phone: '0900000000',
            },
          ]),
        }),
      }),
    };

    const result = await service.newCustomers(
      { days: '45', invoiceCount: 'ALL', limit: '200' },
      { id: salespersonId, role: RoleEnum.STAFF },
    );

    const pipeline = service.invoices.aggregate.mock.calls[0][0];
    expect(String(pipeline[0].$match.salespersonId)).toBe(salespersonId);
    expect(pipeline).toContainEqual({
      $match: { invoiceCount: { $gte: 1, $lte: 2 } },
    });
    expect(result.data).toContainEqual(
      expect.objectContaining({
        id: String(customerId),
        customerCode: 'KH001',
        customerName: 'Khách mới',
        invoiceCount: 2,
        totalRevenue: 1200000,
      }),
    );
    expect(result.meta.days).toBe(45);
  });
});
