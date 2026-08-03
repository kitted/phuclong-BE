import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Products } from '../products/schemas/products.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { InventoryMovements } from './schemas/inventory-movement.schema';
import { InventoryService } from './inventory.service';
import { WarehouseStockChecks } from './schemas/warehouse-stock-checks.schema';
import {
  WarehouseInventoryBackupCounters,
  WarehouseInventoryBackups,
} from './schemas/warehouse-inventory-backups.schema';
import { Users } from '../users/schemas/users.schema';
import { Notifications } from '../notifications/schemas/notifications.schema';
import { AuditLogs } from '../audit-logs/schemas/audit-logs.schema';
import { WarehouseStockCheckService } from './warehouse-stock-check.service';

@Module({
  imports: [
    TypegooseModule.forFeature([
      Products,
      Trucks,
      InventoryMovements,
      WarehouseStockChecks,
      WarehouseInventoryBackups,
      WarehouseInventoryBackupCounters,
      Users,
      Notifications,
      AuditLogs,
    ]),
  ],
  providers: [InventoryService, WarehouseStockCheckService],
  exports: [InventoryService, WarehouseStockCheckService],
})
export class InventoryModule {}
