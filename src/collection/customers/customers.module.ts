import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { CustomerCounters, Customers } from './schemas/customers.schema';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { Vouchers } from '../promotions/schemas/promotions.schema';
import { CustomersService } from './customers.service';
import { CustomerDebtLedger } from '../debt-payments/schemas/customer-debt-ledger.schema';
import { Users } from '../users/schemas/users.schema';

@Module({
  imports: [TypegooseModule.forFeature([Customers, CustomerCounters, Invoices, Vouchers, CustomerDebtLedger, Users])],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
