import { Injectable } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { ReturnModelType } from '@typegoose/typegoose';
import * as ExcelJS from 'exceljs';
import { DashboardService } from '../dashboard/dashboard.service';
import { DashboardPeriodQueryDto } from '../dashboard/dtos/dashboard.dto';
import { resolveReportPeriod } from '../dashboard/report-period';
import { RoleEnum } from '../users/interfaces/role.enum';
import {
  Invoices,
  InvoiceLineType,
  PaymentMethod,
} from '../invoices/schemas/invoices.schema';
import {
  DebtPayments,
  DebtPaymentStatus,
} from '../debt-payments/schemas/debt-payments.schema';
import { Imports } from '../imports/schemas/imports.schema';
import { Products } from '../products/schemas/products.schema';
import { InventoryMovements } from '../inventory/schemas/inventory-movement.schema';
import {
  CustomerDebtLedger,
  DebtLedgerDirection,
} from '../debt-payments/schemas/customer-debt-ledger.schema';
import { Customers } from '../customers/schemas/customers.schema';
@Injectable()
export class ReportsService {
  private admin = { role: RoleEnum.ADMIN };
  constructor(
    private dashboard: DashboardService,
    @InjectModel(Invoices) private invoices: ReturnModelType<typeof Invoices>,
    @InjectModel(DebtPayments)
    private debtPayments: ReturnModelType<typeof DebtPayments>,
    @InjectModel(Imports) private imports: ReturnModelType<typeof Imports>,
    @InjectModel(Products) private products: ReturnModelType<typeof Products>,
    @InjectModel(InventoryMovements)
    private movements: ReturnModelType<typeof InventoryMovements>,
    @InjectModel(CustomerDebtLedger)
    private ledger: ReturnModelType<typeof CustomerDebtLedger>,
    @InjectModel(Customers) private customersModel: ReturnModelType<typeof Customers>,
  ) {}
  private filter(query: DashboardPeriodQueryDto, from: Date, to: Date) {
    const filter: any = {
      isDeleted: false,
      status: { $ne: 'REVERSED' },
      date: { $gte: from, $lte: to },
    };
    for (const key of ['salespersonId', 'truckId', 'sourceType', 'customerId'])
      if ((query as any)[key]) filter[key] = (query as any)[key];
    if (query.promotionId)
      filter.$or = [
        { promotionId: query.promotionId },
        { 'promotionApplications.promotionId': query.promotionId },
      ];
    return filter;
  }
  async overview(query: DashboardPeriodQueryDto): Promise<any> {
    const result: any = await this.dashboard.overview(query, this.admin);
    return {
      data: {
        period: result.data.period,
        filters: query,
        summary: result.data.sales,
        inventory: result.data.inventory,
        series: [],
        breakdowns: {},
        topItems: [],
      },
    };
  }
  salesTrend(query: DashboardPeriodQueryDto) {
    return this.dashboard.salesTrend(query, this.admin);
  }
  async sales(query: DashboardPeriodQueryDto): Promise<any> {
    const period = resolveReportPeriod(query);
    const rows: any[] = await this.invoices
      .find(this.filter(query, period.from, period.to))
      .lean();
    const bySource: any = {},
      byPaymentStatus: any = {},
      byEmployee: any = {};
    let grossRevenue = 0,
      discountAmount = 0,
      netRevenue = 0,
      cogs = 0;
    for (const row of rows) {
      grossRevenue += row.subtotal || 0;
      discountAmount += row.discountAmount || 0;
      netRevenue += row.grandTotal || 0;
      cogs += row.items.reduce(
        (sum, item) => sum + Number(item.costPrice || 0) * item.qty,
        0,
      );
      bySource[row.sourceType] =
        (bySource[row.sourceType] || 0) + row.grandTotal;
      byPaymentStatus[row.paymentStatus] =
        (byPaymentStatus[row.paymentStatus] || 0) + row.grandTotal;
      const employee = row.salespersonCode || String(row.salespersonId);
      byEmployee[employee] = (byEmployee[employee] || 0) + row.grandTotal;
    }
    return {
      data: {
        period,
        filters: query,
        summary: {
          invoiceCount: rows.length,
          grossRevenue,
          discountAmount,
          netRevenue,
          cogs,
          grossProfit: netRevenue - cogs,
          grossMarginPercent: netRevenue
            ? Math.round(((netRevenue - cogs) / netRevenue) * 10000) / 100
            : 0,
        },
        series: [],
        breakdowns: { bySource, byPaymentStatus, byEmployee },
        topItems: [],
      },
    };
  }
  async payments(query: DashboardPeriodQueryDto): Promise<any> {
    const period = resolveReportPeriod(query);
    const invoiceRows: any[] = await this.invoices
      .find(this.filter(query, period.from, period.to))
      .select('payments initialDebtAmount grandTotal initialPaidAmount')
      .lean();
    const receiptRows: any[] = await this.debtPayments
      .find({
        isDeleted: false,
        status: DebtPaymentStatus.ACTIVE,
        date: { $gte: period.from, $lte: period.to },
      })
      .lean();
    let cash = 0,
      bankTransfer = 0,
      creditSales = 0;
    for (const row of invoiceRows) {
      for (const payment of row.payments || [])
        payment.method === PaymentMethod.CASH
          ? (cash += payment.amount)
          : (bankTransfer += payment.amount);
      creditSales +=
        row.initialDebtAmount !== undefined
          ? row.initialDebtAmount
          : Math.max(0, row.grandTotal - (row.initialPaidAmount || 0));
    }
    let debtCollected = 0;
    for (const receipt of receiptRows) {
      debtCollected += receipt.amount;
      for (const payment of receipt.payments || [])
        payment.method === PaymentMethod.CASH
          ? (cash += payment.amount)
          : (bankTransfer += payment.amount);
    }
    return {
      data: {
        period,
        filters: query,
        summary: {
          cash,
          bankTransfer,
          creditSales,
          debtCollected,
          totalCashIn: cash + bankTransfer,
        },
        series: [],
        breakdowns: {},
        topItems: [],
      },
    };
  }
  async debt(query: DashboardPeriodQueryDto): Promise<any> {
    const period = resolveReportPeriod(query);
    const [invoiceRows, receipts, cancelled, beforeRows, periodLedger] =
      await Promise.all([
        this.invoices
          .find(this.filter(query, period.from, period.to))
          .select('initialDebtAmount grandTotal payments')
          .lean(),
        this.debtPayments
          .find({
            isDeleted: false,
            status: DebtPaymentStatus.ACTIVE,
            date: { $gte: period.from, $lte: period.to },
          })
          .lean(),
        this.debtPayments
          .find({
            isDeleted: false,
            status: DebtPaymentStatus.CANCELLED,
            cancelledAt: { $gte: period.from, $lte: period.to },
          })
          .lean(),
        this.ledger.aggregate([
          { $match: { isDeleted: false, occurredAt: { $lt: period.from } } },
          { $sort: { customerId: 1, occurredAt: -1 } },
          {
            $group: {
              _id: '$customerId',
              balanceAfter: { $first: '$balanceAfter' },
            },
          },
        ]),
        this.ledger
          .find({
            isDeleted: false,
            occurredAt: { $gte: period.from, $lte: period.to },
          })
          .lean(),
      ]);
    const creditSales = invoiceRows.reduce(
        (sum, row) =>
          sum +
          (row.initialDebtAmount !== undefined
            ? row.initialDebtAmount
            : Math.max(
                0,
                row.grandTotal - row.payments.reduce((v, p) => v + p.amount, 0),
              )),
        0,
      ),
      collected = receipts.reduce((sum, row) => sum + row.amount, 0),
      cancelledAmount = cancelled.reduce((sum, row) => sum + row.amount, 0);
    const current = await this.dashboard.debtSummary(query, this.admin);
    const openingDebt = beforeRows.reduce(
        (sum, row) => sum + row.balanceAfter,
        0,
      ),
      ledgerIncrease = periodLedger
        .filter((row) => row.direction === DebtLedgerDirection.INCREASE)
        .reduce((sum, row) => sum + row.amount, 0),
      ledgerDecrease = periodLedger
        .filter((row) => row.direction === DebtLedgerDirection.DECREASE)
        .reduce((sum, row) => sum + row.amount, 0);
    return {
      data: {
        period,
        filters: query,
        summary: {
          openingDebt,
          creditSales,
          debtCollected: collected,
          cancelledDebtPayments: cancelledAmount,
          ledgerIncrease,
          ledgerDecrease,
          closingDebt: openingDebt + ledgerIncrease - ledgerDecrease,
          currentOutstandingDebt: current.data.outstandingDebt,
          warningCustomers: current.data.warningCustomers,
          ledgerCoverageNotice:
            'Opening balance is complete from the first ledger entry of each customer onward.',
        },
        series: [],
        breakdowns: {},
        topItems: current.data.topDebtors,
      },
    };
  }
  async debtCustomers(query: DashboardPeriodQueryDto): Promise<any> {
    const result = await this.dashboard.debtSummary(query, this.admin);
    return {
      data: result.data.topDebtors,
      summary: {
        outstandingDebt: result.data.outstandingDebt,
        warningCustomers: result.data.warningCustomers,
      },
    };
  }
  async debtReceipts(query: DashboardPeriodQueryDto): Promise<any> {
    const period = resolveReportPeriod(query);
    const data = await this.debtPayments
      .find({ isDeleted: false, date: { $gte: period.from, $lte: period.to } })
      .sort({ date: -1, createdAt: -1, _id: -1 })
      .lean();
    return { data, period };
  }
  productsReport(query: DashboardPeriodQueryDto) {
    return this.dashboard.topProducts(
      { ...query, limit: query.limit || '100' },
      this.admin,
    );
  }
  async inventory(query: DashboardPeriodQueryDto): Promise<any> {
    const period = resolveReportPeriod(query);
    const [products, imports, movements] = await Promise.all([
      this.products.find({ isDeleted: false }).lean(),
      this.imports
        .find({
          isDeleted: false,
          status: 'completed',
          date: {
            $gte: period.from.toISOString(),
            $lte: period.to.toISOString(),
          },
        } as any)
        .lean(),
      this.movements
        .find({
          isDeleted: false,
          createdAt: { $gte: period.from, $lte: period.to },
        })
        .lean(),
    ]);
    const warehouseQuantity = products.reduce((s, p) => s + p.stock, 0),
      warehouseValue = products.reduce((s, p) => s + p.stock * p.costPrice, 0);
    const byMovement: any = {};
    for (const movement of movements)
      byMovement[movement.type] =
        (byMovement[movement.type] || 0) + movement.quantityChange;
    return {
      data: {
        period,
        filters: query,
        summary: {
          warehouseQuantity,
          warehouseValue,
          importCount: imports.length,
          importValue: imports.reduce((s, i) => s + i.totalAmount, 0),
        },
        series: [],
        breakdowns: { byMovement },
        topItems: [],
      },
    };
  }
  async importsReport(query: DashboardPeriodQueryDto): Promise<any> {
    const period = resolveReportPeriod(query);
    const data = await this.imports
      .find({
        isDeleted: false,
        date: {
          $gte: period.from.toISOString(),
          $lte: period.to.toISOString(),
        },
      } as any)
      .sort({ date: -1, createdAt: -1, _id: -1 })
      .lean();
    return {
      data,
      period,
      summary: {
        count: data.length,
        totalAmount: data
          .filter((row) => row.status === 'completed')
          .reduce((sum, row) => sum + row.totalAmount, 0),
        totalQuantity: data
          .filter((row) => row.status === 'completed')
          .reduce(
            (sum, row) =>
              sum + row.items.reduce((value, item) => value + item.qty, 0),
            0,
          ),
      },
    };
  }
  async inventoryMovements(query: DashboardPeriodQueryDto): Promise<any> {
    const period = resolveReportPeriod(query);
    const filter: any = {
      isDeleted: false,
      createdAt: { $gte: period.from, $lte: period.to },
    };
    if (query.productId) filter.productId = query.productId;
    const data = await this.movements
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    return { data, period };
  }
  trucks(query: DashboardPeriodQueryDto) {
    return this.dashboard.trucks(query, this.admin);
  }
  async customers(query: DashboardPeriodQueryDto, exportAll = false): Promise<any> {
    const period = resolveReportPeriod(query);
    const searchFilter: any = { isDeleted: false };
    if (query.search?.trim()) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      searchFilter.$or = ['code', 'name', 'phone', 'phones'].map((field) => ({ [field]: { $regex: escaped, $options: 'i' } }));
    }
    const [customers, invoices, receipts]: any[][] = await Promise.all([
      this.customersModel.find(searchFilter).select('code name phone phones').sort({ code: 1, name: 1, _id: 1 }).lean(),
      this.invoices.find({ isDeleted: { $ne: true }, status: { $ne: 'REVERSED' }, customerId: { $ne: null }, date: { $gte: period.from, $lte: period.to } }).select('customerId grandTotal initialDebtAmount debtAmount payments').lean(),
      this.debtPayments.find({ isDeleted: false, status: DebtPaymentStatus.ACTIVE, date: { $gte: period.from, $lte: period.to } }).select('customerId payments').lean(),
    ]);
    const metrics = new Map<string, any>();
    const get = (id: string) => { if (!metrics.has(id)) metrics.set(id, { invoiceCount: 0, purchaseAmount: 0, debtAddedAmount: 0, cashPaidAmount: 0 }); return metrics.get(id); };
    for (const invoice of invoices) { const m = get(String(invoice.customerId)); m.invoiceCount += 1; m.purchaseAmount += Number(invoice.grandTotal || 0); m.debtAddedAmount += invoice.initialDebtAmount !== undefined ? Number(invoice.initialDebtAmount || 0) : Number(invoice.debtAmount || 0); m.cashPaidAmount += (invoice.payments || []).filter((p) => p.method === PaymentMethod.CASH).reduce((sum, p) => sum + Number(p.amount || 0), 0); }
    for (const receipt of receipts) { const m = get(String(receipt.customerId)); m.cashPaidAmount += (receipt.payments || []).filter((p) => p.method === PaymentMethod.CASH).reduce((sum, p) => sum + Number(p.amount || 0), 0); }
    const allRows = customers.map((customer: any) => { const m = metrics.get(String(customer._id)) || { invoiceCount: 0, purchaseAmount: 0, debtAddedAmount: 0, cashPaidAmount: 0 }; const hasPurchased = m.invoiceCount > 0; return { customerId: String(customer._id), customerCode: customer.code || '', customerName: customer.name, phone: customer.phone || customer.phones?.[0] || '', hasPurchased, purchaseStatus: hasPurchased ? 'PURCHASED' : 'NOT_PURCHASED', ...m }; });
    const purchased = allRows.filter((row) => row.hasPurchased);
    const status = query.purchaseStatus || 'ALL';
    const filtered = status === 'PURCHASED' ? purchased : status === 'NOT_PURCHASED' ? allRows.filter((row) => !row.hasPurchased) : allRows;
    const page = Math.max(1, Number(query.page) || 1), limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const visible = exportAll ? filtered : filtered.slice((page - 1) * limit, page * limit);
    const data = visible.map((row, index) => ({ ...row, rowNumber: exportAll ? index + 1 : (page - 1) * limit + index + 1 }));
    return { data: { period, summary: { totalCustomers: allRows.length, customersWithInvoices: purchased.length, customersWithoutInvoices: allRows.length - purchased.length, invoiceCount: allRows.reduce((s, x) => s + x.invoiceCount, 0), purchaseAmount: allRows.reduce((s, x) => s + x.purchaseAmount, 0), debtAddedAmount: allRows.reduce((s, x) => s + x.debtAddedAmount, 0), cashPaidAmount: allRows.reduce((s, x) => s + x.cashPaidAmount, 0) }, data, meta: { page: exportAll ? 1 : page, limit: exportAll ? filtered.length : limit, totalItems: filtered.length, totalPages: exportAll ? (filtered.length ? 1 : 0) : Math.ceil(filtered.length / limit) } } };
  }
  promotions(query: DashboardPeriodQueryDto) {
    return this.dashboard.promotionMetrics(query, this.admin);
  }
  employees(query: DashboardPeriodQueryDto) {
    return this.dashboard.employeeMetrics(query, this.admin);
  }
  truckDetail(id: string, query: DashboardPeriodQueryDto) {
    return this.dashboard.trucks({ ...query, truckId: id }, this.admin);
  }
  promotionDetail(id: string, query: DashboardPeriodQueryDto) {
    return this.dashboard.promotionMetrics(
      { ...query, promotionId: id },
      this.admin,
    );
  }
  employeeDetail(id: string, query: DashboardPeriodQueryDto) {
    return this.dashboard.employeeMetrics(
      { ...query, salespersonId: id },
      this.admin,
    );
  }
  async export(
    report: string,
    query: DashboardPeriodQueryDto,
  ): Promise<Buffer> {
    const key = String(report || 'SALES').toUpperCase();
    const data: any =
      key === 'PAYMENTS'
        ? await this.payments(query)
        : key === 'DEBT'
          ? await this.debt(query)
          : key === 'PRODUCTS'
            ? await this.productsReport(query)
            : key === 'INVENTORY'
              ? await this.inventory(query)
              : key === 'TRUCKS'
                ? await this.trucks(query)
                : key === 'CUSTOMERS'
                  ? await this.customers(query, true)
                  : key === 'PROMOTIONS'
                    ? await this.promotions(query)
                    : key === 'EMPLOYEES'
                      ? await this.employees(query)
                      : await this.sales(query);
    if (key === 'CUSTOMERS') return this.exportCustomers(data, query);
    const workbook = new ExcelJS.Workbook();
    const overview = workbook.addWorksheet('Tong quan'),
      detail = workbook.addWorksheet('Du lieu chi tiet'),
      filters = workbook.addWorksheet('Bo loc'),
      notes = workbook.addWorksheet('Cong thuc chu thich');
    overview.columns = [
      { header: 'Chỉ số', key: 'key', width: 34 },
      { header: 'Giá trị', key: 'value', width: 24 },
    ];
    const summary = data.data?.summary || data.data || {};
    for (const [metric, value] of Object.entries(summary))
      if (typeof value !== 'object') overview.addRow({ key: metric, value });
    detail.addRow(['Dữ liệu JSON']);
    detail.addRow([
      JSON.stringify(data.data?.topItems || data.data?.data || []),
    ]);
    filters.columns = [
      { header: 'Bộ lọc', key: 'key', width: 30 },
      { header: 'Giá trị', key: 'value', width: 40 },
    ];
    for (const [name, value] of Object.entries(query))
      filters.addRow({ key: name, value: String(value ?? '') });
    notes.addRows([
      ['Báo cáo', key],
      ['Timezone', 'Asia/Ho_Chi_Minh'],
      ['Tiền tệ', 'VND - số nguyên'],
      ['Doanh thu thuần', 'grandTotal'],
      ['COGS', 'items.costPrice × qty'],
      ['Phiếu thu công nợ', 'Chỉ tính dòng tiền, không tính lại doanh thu'],
    ]);
    for (const sheet of workbook.worksheets)
      sheet.getRow(1).font = { bold: true };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private async exportCustomers(result: any, query: DashboardPeriodQueryDto): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const detail = workbook.addWorksheet('Khach hang');
    detail.columns = [
      { header: 'STT', key: 'rowNumber', width: 8 },
      { header: 'Mã khách hàng', key: 'customerCode', width: 18 },
      { header: 'Tên khách hàng', key: 'customerName', width: 34 },
      { header: 'Số điện thoại', key: 'phone', width: 18 },
      { header: 'Tình trạng mua hàng', key: 'purchaseStatusLabel', width: 22 },
      { header: 'Số hóa đơn', key: 'invoiceCount', width: 14 },
      { header: 'Tiền hàng đã mua', key: 'purchaseAmount', width: 20 },
      { header: 'Công nợ cộng thêm', key: 'debtAddedAmount', width: 20 },
      { header: 'Tiền mặt đã trả', key: 'cashPaidAmount', width: 20 },
    ];
    for (const row of result.data.data || []) detail.addRow({ ...row, purchaseStatusLabel: row.hasPurchased ? 'Có mua hàng' : 'Không mua hàng' });
    detail.views = [{ state: 'frozen', ySplit: 1 }];
    detail.autoFilter = { from: 'A1', to: 'I1' };
    detail.getRow(1).font = { bold: true };
    detail.getRow(1).alignment = { vertical: 'middle' };
    for (const column of ['F', 'G', 'H', 'I']) detail.getColumn(column).numFmt = '#,##0';

    const filters = workbook.addWorksheet('Bo loc');
    filters.columns = [{ header: 'Bộ lọc', key: 'key', width: 30 }, { header: 'Giá trị', key: 'value', width: 45 }];
    filters.addRows([
      { key: 'Kỳ báo cáo', value: query.period || result.data.period?.type || 'MONTH' },
      { key: 'Từ ngày', value: result.data.period?.from ? new Date(result.data.period.from).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '' },
      { key: 'Đến ngày', value: result.data.period?.to ? new Date(result.data.period.to).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '' },
      { key: 'Trạng thái mua hàng', value: query.purchaseStatus || 'ALL' },
      { key: 'Tìm kiếm', value: query.search || '' },
      { key: 'Timezone', value: 'Asia/Ho_Chi_Minh' },
    ]);
    filters.views = [{ state: 'frozen', ySplit: 1 }];
    filters.autoFilter = { from: 'A1', to: 'B1' };
    filters.getRow(1).font = { bold: true };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
