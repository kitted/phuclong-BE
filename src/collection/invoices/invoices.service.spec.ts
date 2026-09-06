import { Test } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from 'nestjs-typegoose';
import {
  calculateInvoiceDebtAllocation,
  canViewAllCompanyInvoices,
  InvoicesService,
  resolveInvoiceSalespersonId,
} from './invoices.service';
import { Invoices } from './schemas/invoices.schema';
import { InvoiceCounters } from './schemas/invoice-counter.schema';
import { Products } from '../products/schemas/products.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { Customers } from '../customers/schemas/customers.schema';
import { Users } from '../users/schemas/users.schema';
import { Promotions, Vouchers } from '../promotions/schemas/promotions.schema';
import { InventoryMovementsService } from '../inventory/inventory-movements.service';
import { Categories } from '../categories/schemas/categories.schema';
import { PromotionRuleEngineService } from './promotion-rule-engine.service';
import { PromotionActivationsService } from '../promotion-activations/promotion-activations.service';
import { PromotionActivations } from '../promotion-activations/schemas/promotion-activations.schema';
import { CustomerDebtLedger } from '../debt-payments/schemas/customer-debt-ledger.schema';
import { RoleEnum } from '../users/interfaces/role.enum';
import {
  DebtPaymentCounters,
  DebtPayments,
} from '../debt-payments/schemas/debt-payments.schema';
import { NotificationsService } from '../notifications/notifications.service';
import * as ExcelJS from 'exceljs';
import { WebsiteProducts } from '../website-orders/schemas/website-products.schema';
import { LeadsService } from '../leads/leads.service';
import { CustomerCoinsService } from '../customer-coins/customer-coins.service';

describe('invoice salesperson authorization', () => {
  const staffId = '507f1f77bcf86cd799439011';
  const otherId = '507f191e810c19729de860ea';
  it('infers salesperson from staff JWT when omitted', () =>
    expect(
      resolveInvoiceSalespersonId(undefined, {
        id: staffId,
        role: RoleEnum.STAFF,
      }),
    ).toBe(staffId));
  it('accepts the staff own salespersonId', () =>
    expect(
      resolveInvoiceSalespersonId(staffId, {
        id: staffId,
        role: RoleEnum.STAFF,
      }),
    ).toBe(staffId));
  it('rejects another salesperson for staff', () =>
    expect(() =>
      resolveInvoiceSalespersonId(otherId, {
        id: staffId,
        role: RoleEnum.STAFF,
      }),
    ).toThrow('Nhân viên chỉ được tạo hóa đơn'));
  it('requires salesperson for admin', () =>
    expect(() =>
      resolveInvoiceSalespersonId(undefined, { role: RoleEnum.ADMIN }),
    ).toThrow('Vui lòng chọn nhân viên bán hàng'));
  it('accepts the selected salesperson for admin', () =>
    expect(resolveInvoiceSalespersonId(otherId, { role: RoleEnum.ADMIN })).toBe(
      otherId,
    ));
});

describe('invoice read visibility', () => {
  it('always grants company-wide visibility to admin', () => {
    expect(
      canViewAllCompanyInvoices({
        role: RoleEnum.ADMIN,
        canViewAllInvoices: false,
      }),
    ).toBe(true);
  });

  it('supports the uppercase admin role stored by legacy accounts', () => {
    expect(
      canViewAllCompanyInvoices({ role: 'ADMIN', canViewAllInvoices: false }),
    ).toBe(true);
  });

  it('only grants company-wide visibility to opted-in staff', () => {
    expect(
      canViewAllCompanyInvoices({
        role: RoleEnum.STAFF,
        canViewAllInvoices: true,
      }),
    ).toBe(true);
    expect(
      canViewAllCompanyInvoices({
        role: RoleEnum.STAFF,
        canViewAllInvoices: false,
      }),
    ).toBe(false);
  });
});

describe('invoice Excel export', () => {
  it('writes invoice and product data rows to both worksheets', async () => {
    const service: any = Object.create(InvoicesService.prototype);
    service.timelineFilters = jest
      .fn()
      .mockResolvedValue({ invoiceFilter: {}, receiptFilter: {} });
    service.timelineDocuments = jest.fn().mockResolvedValue([
      {
        _id: 'invoice-1',
        documentType: 'INVOICE',
        code: 'HD001',
        date: new Date('2026-07-01T03:00:00.000Z'),
        customerCode: 'KH001',
        customerName: 'Khách hàng 01',
        salespersonName: 'Nhân viên 01',
        grandTotal: 125000,
        receivedAmount: 125000,
        paymentStatus: 'PAID',
        items: [
          {
            productCode: 'SP001',
            productName: 'Sản phẩm 01',
            unit: 'Chai',
            qty: 2,
            price: 62500,
            lineTotal: 125000,
            lineType: 'SALE',
          },
        ],
      },
    ]);

    const buffer = await service.export(
      { from: '2026-07-01', to: '2026-07-31' },
      { id: 'actor' },
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    expect(workbook.getWorksheet('Danh sách hóa đơn')?.rowCount).toBe(2);
    expect(
      workbook.getWorksheet('Danh sách hóa đơn')?.getCell('C2').value,
    ).toBe('HD001');
    expect(workbook.getWorksheet('Sản phẩm đã bán')?.rowCount).toBe(2);
    expect(workbook.getWorksheet('Sản phẩm đã bán')?.getCell('F2').value).toBe(
      'SP001',
    );
  });
});

describe('invoice payment with old debt allocation', () => {
  it('pays invoice and clears all old debt', () => {
    expect(calculateInvoiceDebtAllocation(500000, 300000, 200000)).toEqual({
      paidAmount: 300000,
      existingDebtPaidAmount: 200000,
      debtAmount: 0,
      customerDebtAfter: 0,
    });
  });
  it('pays invoice and reduces old debt partially', () => {
    expect(calculateInvoiceDebtAllocation(400000, 300000, 200000)).toEqual({
      paidAmount: 300000,
      existingDebtPaidAmount: 100000,
      debtAmount: 0,
      customerDebtAfter: 100000,
    });
  });
});

describe('truck invoice negative inventory', () => {
  it('deducts an existing truck balance without requiring enough stock', async () => {
    const service: any = Object.create(InvoicesService.prototype);
    service.truckModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue({
        inventory: [{ productId: 'product-1', qty: 2 }],
      }),
    };

    const before = await service.deductTruckStockAllowNegative(
      'truck-1',
      'product-1',
      5,
      {},
    );

    expect(before).toBe(2);
    expect(service.truckModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'truck-1',
        'inventory.productId': 'product-1',
      }),
      { $inc: { 'inventory.$.qty': -5 } },
      expect.objectContaining({ new: false }),
    );
  });

  it('creates a negative inventory row when the product was not on the truck', async () => {
    const service: any = Object.create(InvoicesService.prototype);
    service.truckModel = {
      findOneAndUpdate: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ inventory: [] }),
    };

    const before = await service.deductTruckStockAllowNegative(
      'truck-1',
      'product-1',
      3,
      {},
    );

    expect(before).toBe(0);
    expect(service.truckModel.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        _id: 'truck-1',
        'inventory.productId': { $ne: 'product-1' },
      }),
      { $push: { inventory: { productId: 'product-1', qty: -3 } } },
      expect.objectContaining({ new: false }),
    );
  });
});

describe('InvoicesService dependency injection', () => {
  it('resolves all transaction models and the Typegoose connection', async () => {
    const models = [
      Invoices,
      InvoiceCounters,
      Products,
      WebsiteProducts,
      Trucks,
      Customers,
      Users,
      Promotions,
      Vouchers,
      Categories,
      PromotionActivations,
      CustomerDebtLedger,
      DebtPayments,
      DebtPaymentCounters,
    ];
    const module = await Test.createTestingModule({
      providers: [
        InvoicesService,
        ...models.map((model) => ({
          provide: getModelToken(model.name),
          useValue: {},
        })),
        { provide: InventoryMovementsService, useValue: {} },
        { provide: PromotionRuleEngineService, useValue: {} },
        { provide: PromotionActivationsService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: LeadsService, useValue: {} },
        { provide: CustomerCoinsService, useValue: {} },
        {
          provide: getConnectionToken(),
          useValue: { startSession: jest.fn() },
        },
      ],
    }).compile();
    expect(module.get(InvoicesService)).toBeDefined();
  });
});
