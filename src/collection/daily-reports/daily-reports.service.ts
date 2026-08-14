import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { ReturnModelType } from '@typegoose/typegoose';
import * as ExcelJS from 'exceljs';
import {
  DailyReportCounters,
  DailyReports,
} from './schemas/daily-reports.schema';
import {
  CreateDailyReportDto,
  DailyReportQueryDto,
  UpdateDailyReportDto,
} from './dtos/daily-reports.dto';
import {
  Invoices,
  InvoiceLineType,
  PaymentMethod,
} from '../invoices/schemas/invoices.schema';
import {
  DebtPayments,
  DebtPaymentStatus,
} from '../debt-payments/schemas/debt-payments.schema';
import {
  CustomerReturns,
  CustomerReturnStatus,
} from '../customer-returns/schemas/customer-returns.schema';
import { vietnamDateBoundary } from '../trucks/truck-transfer-date';
@Injectable()
export class DailyReportsService {
  constructor(
    @InjectModel(DailyReports)
    private model: ReturnModelType<typeof DailyReports>,
    @InjectModel(DailyReportCounters)
    private counters: ReturnModelType<typeof DailyReportCounters>,
    @InjectModel(Invoices) private invoices: ReturnModelType<typeof Invoices>,
    @InjectModel(DebtPayments)
    private receipts: ReturnModelType<typeof DebtPayments>,
    @InjectModel(CustomerReturns)
    private returns: ReturnModelType<typeof CustomerReturns>,
  ) {}
  async preview(date: string) {
    const from = vietnamDateBoundary(date, false),
      to = vietnamDateBoundary(date, true),
      [invoices, receipts, returns]: any[][] = await Promise.all([
        this.invoices
          .find({
            isDeleted: { $ne: true },
            status: { $ne: 'REVERSED' },
            date: { $gte: from, $lte: to },
          })
          .lean(),
        this.receipts
          .find({
            isDeleted: false,
            status: DebtPaymentStatus.ACTIVE,
            date: { $gte: from, $lte: to },
          })
          .lean(),
        this.returns
          .find({
            isDeleted: false,
            status: CustomerReturnStatus.COMPLETED,
            createdAt: { $gte: from, $lte: to },
          })
          .lean(),
      ]);
    const documents: any[] = [];
    let cash = 0,
      bankTransfer = 0;
    const employees = new Map<string, any>(),
      products = new Map<string, any>();
    for (const x of invoices) {
      for (const p of x.payments || []) {
        if (p.method === PaymentMethod.CASH) cash += Number(p.amount || 0);
        else bankTransfer += Number(p.amount || 0);
      }
      documents.push({
        type: 'SALE',
        id: String(x._id),
        code: x.code,
        date: x.date,
        customerName: x.customerName || x.customer,
        employeeName: x.salespersonName,
        amount: Number(x.grandTotal || 0),
        note: x.note,
      });
      const e = employees.get(String(x.salespersonId)) || {
        employeeId: String(x.salespersonId),
        employeeCode: x.salespersonCode,
        employeeName: x.salespersonName,
        revenue: 0,
        invoiceCount: 0,
      };
      e.revenue += Number(x.grandTotal || 0);
      e.invoiceCount++;
      employees.set(String(x.salespersonId), e);
      for (const item of x.items || []) {
        if (item.lineType === InvoiceLineType.GIFT) continue;
        const key = String(item.productId),
          p = products.get(key) || {
            productId: key,
            productCode: item.productCode,
            productName: item.productName,
            unit: item.unit,
            quantity: 0,
            revenue: 0,
          };
        p.quantity += Number(item.qty || 0);
        p.revenue += Number(item.lineTotal || 0);
        products.set(key, p);
      }
    }
    for (const x of receipts) {
      for (const p of x.payments || []) {
        if (p.method === PaymentMethod.CASH) cash += Number(p.amount || 0);
        else bankTransfer += Number(p.amount || 0);
      }
      documents.push({
        type: 'DEBT_PAYMENT',
        id: String(x._id),
        code: x.code,
        date: x.date,
        customerName: x.customerName,
        employeeName: x.collectorName,
        amount: Number(x.amount || 0),
        note: x.note,
      });
    }
    for (const x of returns)
      documents.push({
        type: 'CUSTOMER_RETURN',
        id: String(x._id),
        code: x.code,
        date: x.createdAt,
        customerName: x.customerName,
        employeeName: x.driverName,
        amount: -Number(x.returnAmount || 0),
        note: x.note,
      });
    const salesRevenue = invoices.reduce(
        (s, x) => s + Number(x.grandTotal || 0),
        0,
      ),
      returnAmount = returns.reduce(
        (s, x) => s + Number(x.returnAmount || 0),
        0,
      );
    return {
      data: {
        reportDate: date,
        period: { from, to },
        summary: {
          documentCount: documents.length,
          invoiceCount: invoices.length,
          debtReceiptCount: receipts.length,
          customerReturnCount: returns.length,
          salesRevenue,
          returnAmount,
          netRevenue: salesRevenue - returnAmount,
          cash,
          bankTransfer,
          totalCollected: cash + bankTransfer,
        },
        documents,
        employees: [...employees.values()],
        products: [...products.values()],
      },
    };
  }
  async create(dto: CreateDailyReportDto, actorId: string) {
    if (await this.model.exists({ reportDate: dto.date, isDeleted: false }))
      throw new ConflictException('Ngày này đã được chốt báo cáo');
    const preview: any = await this.preview(dto.date),
      key = dto.date.replaceAll('-', ''),
      c: any = await this.counters.findOneAndUpdate(
        { key },
        { $inc: { sequence: 1 } },
        { upsert: true, new: true },
      ),
      doc = await this.model.create({
        code: `BCN-${key.slice(2)}-${String(c.sequence).padStart(4, '0')}`,
        reportDate: dto.date,
        periodFrom: preview.data.period.from,
        periodTo: preview.data.period.to,
        snapshot: preview.data,
        manualAdjustments: dto.manualAdjustments || [],
        notes: dto.notes,
        issues: dto.issues,
        createdBy: actorId,
      });
    return { data: doc };
  }
  async list(q: DailyReportQueryDto): Promise<any> {
    const page = Math.max(1, Number(q.page) || 1),
      limit = Math.min(100, Math.max(1, Number(q.limit) || 20)),
      filter: any = { isDeleted: false };
    if (q.from || q.to) {
      filter.reportDate = {};
      if (q.from) filter.reportDate.$gte = q.from;
      if (q.to) filter.reportDate.$lte = q.to;
    }
    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .select('-snapshot.documents')
        .sort({ reportDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.model.countDocuments(filter),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
  async detail(id: string): Promise<any> {
    const doc = await this.model.findOne({ _id: id, isDeleted: false }).lean();
    if (!doc) throw new NotFoundException('Không tìm thấy báo cáo ngày');
    return { data: doc };
  }
  async update(id: string, dto: UpdateDailyReportDto, actorId: string) {
    const doc = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: { ...dto, updatedBy: actorId } },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Không tìm thấy báo cáo ngày');
    return { data: doc };
  }
  async export(id: string) {
    const r: any = await this.detail(id),
      doc: any = r.data,
      s: any = doc.snapshot,
      book = new ExcelJS.Workbook(),
      summary = book.addWorksheet('Tổng hợp'),
      products = book.addWorksheet('Hàng bán');
    summary.addRows([
      ['BÁO CÁO TỔNG HỢP NGÀY', doc.reportDate],
      ['Mã báo cáo', doc.code],
      [],
      ['Chỉ số', 'Giá trị'],
      ...Object.entries(s.summary || {}),
    ]);
    summary.getRow(1).font = { bold: true, size: 16 };
    products.columns = [
      { header: 'STT', key: 'stt', width: 7 },
      { header: 'Mã sản phẩm', key: 'productCode', width: 20 },
      { header: 'Tên sản phẩm', key: 'productName', width: 36 },
      { header: 'Đơn vị', key: 'unit', width: 12 },
      { header: 'Số lượng', key: 'quantity', width: 14 },
      { header: 'Doanh thu', key: 'revenue', width: 18 },
    ];
    (s.products || []).forEach((x: any, i: number) =>
      products.addRow({ stt: i + 1, ...x }),
    );
    products.getRow(1).font = { bold: true };
    products.autoFilter = { from: 'A1', to: 'F1' };
    return Buffer.from(await book.xlsx.writeBuffer());
  }
}
