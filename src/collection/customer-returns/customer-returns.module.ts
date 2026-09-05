import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { CustomerReturnCounters, CustomerReturns, TruckUnclassifiedReturnStock } from './schemas/customer-returns.schema';
import { Customers } from '../customers/schemas/customers.schema'; import { Trucks } from '../trucks/schemas/trucks.schema'; import { Products } from '../products/schemas/products.schema';
import { InventoryMovements } from '../inventory/schemas/inventory-movement.schema'; import { CustomerDebtLedger } from '../debt-payments/schemas/customer-debt-ledger.schema'; import { Notifications } from '../notifications/schemas/notifications.schema';
import { CustomerReturnsService } from './customer-returns.service';
import { WebsiteProducts } from '../website-orders/schemas/website-products.schema';
@Module({ imports: [TypegooseModule.forFeature([CustomerReturns, CustomerReturnCounters, TruckUnclassifiedReturnStock, Customers, Trucks, Products, WebsiteProducts, InventoryMovements, CustomerDebtLedger, Notifications])], providers: [CustomerReturnsService], exports: [CustomerReturnsService] })
export class CustomerReturnsModule {}
