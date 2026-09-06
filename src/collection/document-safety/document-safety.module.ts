import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { InvoicesModule } from '../invoices/invoices.module';
import { DebtPaymentsModule } from '../debt-payments/debt-payments.module';
import { CustomerReturnsModule } from '../customer-returns/customer-returns.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { DebtPayments } from '../debt-payments/schemas/debt-payments.schema';
import { CustomerReturns } from '../customer-returns/schemas/customer-returns.schema';
import { DocumentSafetyOperations } from './schemas/document-safety-operation.schema';
import { DocumentSafetyService } from './document-safety.service';

@Module({
  imports: [
    TypegooseModule.forFeature([
      DocumentSafetyOperations,
      Invoices,
      DebtPayments,
      CustomerReturns,
    ]),
    InvoicesModule,
    DebtPaymentsModule,
    CustomerReturnsModule,
    NotificationsModule,
  ],
  providers: [DocumentSafetyService],
  exports: [DocumentSafetyService],
})
export class DocumentSafetyModule {}
