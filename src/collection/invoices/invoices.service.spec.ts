import { Test } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from 'nestjs-typegoose';
import { InvoicesService } from './invoices.service';
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
