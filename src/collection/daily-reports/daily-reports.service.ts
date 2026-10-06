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
import { Products } from '../products/schemas/products.schema';
import { Customers } from '../customers/schemas/customers.schema';
import { WebsiteProducts } from '../website-orders/schemas/website-products.schema';
import { Types } from 'mongoose';
import { Trucks } from '../trucks/schemas/trucks.schema';
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
    @InjectModel(Products)
    private productsModel: ReturnModelType<typeof Products>,
    @InjectModel(Customers)
    private customers: ReturnModelType<typeof Customers>,
    @InjectModel(WebsiteProducts)
    private websiteProducts: ReturnModelType<typeof WebsiteProducts>,
    @InjectModel(Trucks)
    private trucks: ReturnModelType<typeof Trucks>,
  ) {}

  private reportIndexReady?: Promise<void>;

  private ensurePerTruckReportIndex() {
    if (!this.reportIndexReady)
      this.reportIndexReady = (async () => {
        try {
          const collection: any = this.model.collection;
          const indexes: any[] = await collection.indexes();
          const oldDateOnlyIndex = indexes.find(
            (item) =>
              item.unique &&
              Object.keys(item.key || {}).length === 1 &&
              item.key?.reportDate === 1,
          );
          if (oldDateOnlyIndex)
            try {
              await collection.dropIndex(oldDateOnlyIndex.name);
            } catch (error: any) {
              if (error?.code !== 27 && error?.codeName !== 'IndexNotFound')
                throw error;
            }
          const hasPerTruckIndex = indexes.some(
            (item) =>
              item.unique &&
              item.key?.reportDate === 1 &&
              item.key?.truckId === 1,
          );
          if (!hasPerTruckIndex)
            await collection.createIndex(
              { reportDate: 1, truckId: 1 },
              {
                unique: true,
                name: 'reportDate_1_truckId_1',
                partialFilterExpression: {
                  truckId: { $type: 'objectId' },
                  isDeleted: false,
                },
              },
            );
        } catch (error: any) {
          if (error?.code !== 26 && error?.codeName !== 'NamespaceNotFound')
            throw error;
        }
      })();
    return this.reportIndexReady;
  }

  private paymentMethodLabel(payments: any[] = []): string {
    const methods = new Set(
      payments
        .filter((payment) => Number(payment?.amount || 0) > 0)
        .map((payment) =>
          payment.method === PaymentMethod.CASH ? 'TM' : 'CK',
        ),
    );
    return [...methods].join('+');
  }

  async preview(date: string, truckId: string) {
    if (!Types.ObjectId.isValid(truckId))
      throw new NotFoundException('Không tìm thấy xe lập báo cáo');
    const truck: any = await this.trucks
      .findOne({ _id: truckId, isDeleted: false })
      .lean();
    if (!truck) throw new NotFoundException('Không tìm thấy xe lập báo cáo');
    const from = vietnamDateBoundary(date, false),
      to = vietnamDateBoundary(date, true),
      [invoices, receipts, returns]: any[][] = await Promise.all([
        this.invoices
          .find({
            isDeleted: { $ne: true },
            status: { $ne: 'REVERSED' },
            date: { $gte: from, $lte: to },
            sourceType: 'truck',
            truckId: truck._id,
          })
          .lean(),
        this.receipts
          .find({
            isDeleted: false,
            status: DebtPaymentStatus.ACTIVE,
            date: { $gte: from, $lte: to },
            collectorId: truck.driverId || new Types.ObjectId(),
          })
          .lean(),
        this.returns
          .find({
            isDeleted: false,
            status: CustomerReturnStatus.COMPLETED,
            createdAt: { $gte: from, $lte: to },
            destinationTruckId: String(truck._id),
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
        customerId: x.customerId ? String(x.customerId) : undefined,
        employeeName: x.salespersonName,
        amount: Number(x.grandTotal || 0),
        paymentMethod: this.paymentMethodLabel(x.payments || []),
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
        customerId: x.customerId ? String(x.customerId) : undefined,
        employeeName: x.collectorName,
        amount: Number(x.amount || 0),
        paymentMethod: this.paymentMethodLabel(x.payments || []),
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
        customerId: x.customerId ? String(x.customerId) : undefined,
        employeeName: x.driverName,
        amount: -Number(x.returnAmount || 0),
        paymentMethod: '',
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
    const productRows = [...products.values()];
    const productIds = productRows
      .map((item) => String(item.productId || ''))
      .filter((id) => Types.ObjectId.isValid(id));
    const customerIds = documents
      .map((item) => String(item.customerId || ''))
      .filter((id) => Types.ObjectId.isValid(id));
    const [adminProducts, linkedProducts, customerRows] = await Promise.all([
      productIds.length
        ? this.productsModel
            .find({ _id: { $in: productIds } })
            .select('imageUrl')
            .lean()
        : [],
      productIds.length
        ? this.websiteProducts
            .find({
              isDeleted: { $ne: true },
              inventoryProductId: { $in: productIds },
            })
            .select('inventoryProductId imageUrls')
            .lean()
        : [],
      customerIds.length
        ? this.customers
            .find({ _id: { $in: customerIds } })
            .select('storefrontImage')
            .lean()
        : [],
    ]);
    const adminImages = new Map(
      adminProducts.map(
        (item: any) => [String(item._id), item.imageUrl] as [string, any],
      ),
    );
    const websiteImages = new Map(
      linkedProducts.map(
        (item: any) =>
          [
            String(item.inventoryProductId),
            (item.imageUrls || []).find(Boolean),
          ] as [string, any],
      ),
    );
    const storefrontImages = new Map(
      customerRows.map(
        (item: any) =>
          [String(item._id), item.storefrontImage] as [string, any],
      ),
    );
    for (const item of documents)
      item.storefrontImage =
        storefrontImages.get(String(item.customerId)) || item.storefrontImage;
    for (const item of productRows)
      item.imageUrl =
        adminImages.get(String(item.productId)) ||
        websiteImages.get(String(item.productId)) ||
        item.imageUrl;
    return {
      data: {
        reportDate: date,
        truck: {
          id: String(truck._id),
          code: truck.code,
          name: truck.name,
          licensePlate: truck.licensePlate,
          driverId: truck.driverId ? String(truck.driverId) : undefined,
          driverName: truck.driverName || truck.driver,
        },
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
        products: productRows,
      },
    };
  }
  async create(dto: CreateDailyReportDto, actorId: string) {
    await this.ensurePerTruckReportIndex();
    if (
      await this.model.exists({
        reportDate: dto.date,
        truckId: dto.truckId,
        isDeleted: false,
      })
    )
      throw new ConflictException('Xe này đã được chốt báo cáo trong ngày');
    const preview: any = await this.preview(dto.date, dto.truckId),
      truck = preview.data.truck,
      key = dto.date.replaceAll('-', ''),
      c: any = await this.counters.findOneAndUpdate(
        { key },
        { $inc: { sequence: 1 } },
        { upsert: true, new: true },
      ),
      doc = await this.model.create({
        code: `BCN-${key.slice(2)}-${String(c.sequence).padStart(4, '0')}`,
        reportDate: dto.date,
        truckId: dto.truckId,
        truckCode: truck.code,
        truckName: truck.name,
        truckLicensePlate: truck.licensePlate,
        driverId: truck.driverId,
        driverName: truck.driverName,
        periodFrom: preview.data.period.from,
        periodTo: preview.data.period.to,
        area: dto.area?.trim() || undefined,
        performerName:
          dto.performerName?.trim() || truck.driverName || undefined,
        vehicle:
          dto.vehicle?.trim() ||
          [truck.name, truck.licensePlate].filter(Boolean).join(' · '),
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
    if (q.truckId) filter.truckId = q.truckId;
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
      ['BÁO CÁO CUỐI NGÀY THEO XE', doc.reportDate],
      ['Mã báo cáo', doc.code],
      [
        'Xe',
        [doc.truckName, doc.truckLicensePlate].filter(Boolean).join(' · '),
      ],
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
