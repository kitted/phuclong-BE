import { Test } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from 'nestjs-typegoose';
import { InvoicesService, resolveInvoiceSalespersonId } from './invoices.service';
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

describe('invoice salesperson authorization', () => {
  const staffId = '507f1f77bcf86cd799439011';
  const otherId = '507f191e810c19729de860ea';
  it('infers salesperson from staff JWT when omitted', () => expect(resolveInvoiceSalespersonId(undefined, { id: staffId, role: RoleEnum.STAFF })).toBe(staffId));
  it('accepts the staff own salespersonId', () => expect(resolveInvoiceSalespersonId(staffId, { id: staffId, role: RoleEnum.STAFF })).toBe(staffId));
  it('rejects another salesperson for staff', () => expect(() => resolveInvoiceSalespersonId(otherId, { id: staffId, role: RoleEnum.STAFF })).toThrow('Nhân viên chỉ được tạo hóa đơn'));
  it('requires salesperson for admin', () => expect(() => resolveInvoiceSalespersonId(undefined, { role: RoleEnum.ADMIN })).toThrow('Vui lòng chọn nhân viên bán hàng'));
  it('accepts the selected salesperson for admin', () => expect(resolveInvoiceSalespersonId(otherId, { role: RoleEnum.ADMIN })).toBe(otherId));
});

describe('InvoicesService dependency injection', () => {
  it('resolves all transaction models and the Typegoose connection', async () => {
    const models = [Invoices, InvoiceCounters, Products, Trucks, Customers, Users, Promotions, Vouchers, Categories, PromotionActivations, CustomerDebtLedger];
    const module = await Test.createTestingModule({ providers: [
      InvoicesService,
      ...models.map((model) => ({ provide: getModelToken(model.name), useValue: {} })),
      { provide: InventoryMovementsService, useValue: {} },
      { provide: PromotionRuleEngineService, useValue: {} },
      { provide: PromotionActivationsService, useValue: {} },
      { provide: getConnectionToken(), useValue: { startSession: jest.fn() } },
    ] }).compile();
    expect(module.get(InvoicesService)).toBeDefined();
  });
});
