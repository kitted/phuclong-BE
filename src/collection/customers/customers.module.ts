import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import {
  CustomerCounters,
  Customers,
  InvoiceFollowUpBooks,
  InvoiceFollowUpDrafts,
} from './schemas/customers.schema';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { Vouchers } from '../promotions/schemas/promotions.schema';
import { CustomersService } from './customers.service';
import { CustomerDebtLedger } from '../debt-payments/schemas/customer-debt-ledger.schema';
import { Users } from '../users/schemas/users.schema';
import { DebtPayments } from '../debt-payments/schemas/debt-payments.schema';
import { CustomerReturns } from '../customer-returns/schemas/customer-returns.schema';

@Module({
  imports: [
    TypegooseModule.forFeature([
      Customers,
      CustomerCounters,
      InvoiceFollowUpDrafts,
      InvoiceFollowUpBooks,
      Invoices,
      DebtPayments,
      CustomerReturns,
      Vouchers,
      CustomerDebtLedger,
      Users,
    ]),
  ],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
