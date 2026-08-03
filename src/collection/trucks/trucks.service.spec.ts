import { Test } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from 'nestjs-typegoose';
import { TrucksService } from './trucks.service';
import { Trucks } from './schemas/trucks.schema';
import { Products } from '../products/schemas/products.schema';
import { TruckTransferCounters, TruckTransfers } from './schemas/truck-transfers.schema';
import { InventoryMovementsService } from '../inventory/inventory-movements.service';
import { Users } from '../users/schemas/users.schema';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { InventoryMovements } from '../inventory/schemas/inventory-movement.schema';
import { CustomerReturns } from '../customer-returns/schemas/customer-returns.schema';
import { TruckStockChecks } from './schemas/truck-stock-checks.schema';

describe('TrucksService dependency injection', () => {
  it('uses the Typegoose connection token', async () => {
    const module = await Test.createTestingModule({
      providers: [
        TrucksService,
        { provide: getModelToken(Trucks.name), useValue: {} },
        { provide: getModelToken(Products.name), useValue: {} },
        { provide: getModelToken(TruckTransfers.name), useValue: {} },
        { provide: getModelToken(TruckTransferCounters.name), useValue: {} },
        { provide: getModelToken(Users.name), useValue: {} },
        { provide: getModelToken(Invoices.name), useValue: {} },
        { provide: getModelToken(InventoryMovements.name), useValue: {} },
        { provide: getModelToken(CustomerReturns.name), useValue: {} },
        { provide: getModelToken(TruckStockChecks.name), useValue: {} },
        { provide: InventoryMovementsService, useValue: {} },
        { provide: getConnectionToken(), useValue: { startSession: jest.fn() } },
      ],
    }).compile();

    expect(module.get(TrucksService)).toBeDefined();
  });
});
