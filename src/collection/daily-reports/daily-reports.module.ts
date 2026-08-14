import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import {
  DailyReportCounters,
  DailyReports,
} from './schemas/daily-reports.schema';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { DebtPayments } from '../debt-payments/schemas/debt-payments.schema';
import { CustomerReturns } from '../customer-returns/schemas/customer-returns.schema';
import { DailyReportsService } from './daily-reports.service';
@Module({
  imports: [
    TypegooseModule.forFeature([
      DailyReports,
      DailyReportCounters,
      Invoices,
      DebtPayments,
      CustomerReturns,
    ]),
  ],
  providers: [DailyReportsService],
  exports: [DailyReportsService],
})
export class DailyReportsModule {}
