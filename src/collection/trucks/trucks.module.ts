import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Trucks } from './schemas/trucks.schema';
import { Products } from '../products/schemas/products.schema';
import { TrucksService } from './trucks.service';
import { InventoryMovementsModule } from '../inventory/inventory-movements.module';
import { TruckTransferCounters, TruckTransfers } from './schemas/truck-transfers.schema';
import { Users } from '../users/schemas/users.schema';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { CustomerReturns } from '../customer-returns/schemas/customer-returns.schema';
import { TruckStockChecks } from './schemas/truck-stock-checks.schema';
import { TruckInventoryBackupCounters, TruckInventoryBackups } from './schemas/truck-inventory-backups.schema'; import { InventoryMovements } from '../inventory/schemas/inventory-movement.schema'; import { Notifications } from '../notifications/schemas/notifications.schema'; import { AuditLogs } from '../audit-logs/schemas/audit-logs.schema'; import { TruckStockSyncService } from './truck-stock-sync.service';

@Module({
  imports: [TypegooseModule.forFeature([Trucks, Products, TruckTransfers, TruckTransferCounters, Users, Invoices, CustomerReturns, TruckStockChecks, TruckInventoryBackups, TruckInventoryBackupCounters, InventoryMovements, Notifications, AuditLogs]), InventoryMovementsModule],
  providers: [TrucksService, TruckStockSyncService],
  exports: [TrucksService, TruckStockSyncService],
})
export class TrucksModule {}
