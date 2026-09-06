import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { InjectModel } from 'nestjs-typegoose';
import * as ExcelJS from 'exceljs';
import { vietnamDateBoundary } from '../trucks/truck-transfer-date';
import {
  Invoices,
  InvoiceStatus,
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
import { InvoicesService } from '../invoices/invoices.service';
import { DebtPaymentsService } from '../debt-payments/debt-payments.service';
import { CustomerReturnsService } from '../customer-returns/customer-returns.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notifications.schema';
import { RoleEnum } from '../users/interfaces/role.enum';
import {
  DocumentSafetyDateQueryDto,
  DocumentSafetyHistoryQueryDto,
  ReverseDocumentDayDto,
} from './dtos/document-safety.dto';
import {
  DocumentSafetyOperations,
  DocumentSafetyOperationStatus,
} from './schemas/document-safety-operation.schema';

type SafetyActor = { id: string; role?: RoleEnum; name?: string };

@Injectable()
export class DocumentSafetyService {
  constructor(
    @InjectModel(DocumentSafetyOperations)
    private readonly operations: ReturnModelType<
      typeof DocumentSafetyOperations
    >,
    @InjectModel(Invoices)
    private readonly invoices: ReturnModelType<typeof Invoices>,
    @InjectModel(DebtPayments)
    private readonly receipts: ReturnModelType<typeof DebtPayments>,
    @InjectModel(CustomerReturns)
    private readonly returns: ReturnModelType<typeof CustomerReturns>,
    private readonly invoiceService: InvoicesService,
    private readonly debtPaymentService: DebtPaymentsService,
    private readonly customerReturnService: CustomerReturnsService,
    private readonly notifications: NotificationsService,
  ) {}

  private boundaries(date: string) {
    return {
      from: vietnamDateBoundary(date, false),
      to: vietnamDateBoundary(date, true),
    };
  }

  private invoiceDateFilter(from: Date, to: Date) {
    return {
      $or: [
        { date: { $gte: from, $lte: to } },
        {
          $and: [
            { $or: [{ date: { $exists: false } }, { date: null }] },
            { createdAt: { $gte: from, $lte: to } },
          ],
        },
      ],
    };
  }

  private paymentMethods(payments: any[] = []): string {
    return [
      ...new Set(
        payments
          .filter((item) => Number(item?.amount || 0) > 0)
          .map((item) =>
            item.method === PaymentMethod.CASH ? 'Tiền mặt' : 'Chuyển khoản',
          ),
      ),
    ].join(' + ');
  }

  private async loadDay(date: string) {
    const { from, to } = this.boundaries(date);
    const [invoices, receipts, returns]: any[][] = await Promise.all([
      this.invoices
        .find({
          isDeleted: { $ne: true },
          ...this.invoiceDateFilter(from, to),
        })
        .sort({ date: 1, createdAt: 1, _id: 1 })
        .lean(),
      this.receipts
        .find({
          isDeleted: { $ne: true },
          date: { $gte: from, $lte: to },
        })
        .sort({ date: 1, createdAt: 1, _id: 1 })
        .lean(),
      this.returns
        .find({
          isDeleted: { $ne: true },
          createdAt: { $gte: from, $lte: to },
        })
        .sort({ createdAt: 1, _id: 1 })
        .lean(),
    ]);
    return { from, to, invoices, receipts, returns };
  }

  private mapInvoice(item: any) {
    return {
      id: String(item._id),
      type: 'INVOICE',
      code: item.code,
      occurredAt: item.date || item.createdAt,
      createdAt: item.createdAt,
      status:
        item.status === InvoiceStatus.REVERSED
          ? InvoiceStatus.REVERSED
          : InvoiceStatus.ACTIVE,
      customerCode: item.customerCode,
      customerName: item.customerName || item.customer || 'Khách lẻ',
      salespersonName: item.salespersonName,
      amount: Number(item.grandTotal || 0),
      paidAmount: Number(item.paidAmount || 0),
      debtAmount: Number(item.debtAmount || 0),
      paymentMethods: this.paymentMethods(item.payments || []),
      itemCount: (item.items || []).length,
    };
  }

  private mapReceipt(item: any) {
    return {
      id: String(item._id),
      type: 'DEBT_PAYMENT',
      code: item.code,
      occurredAt: item.date || item.createdAt,
      createdAt: item.createdAt,
      status: item.status || DebtPaymentStatus.ACTIVE,
      customerCode: item.customerCode,
      customerName: item.customerName,
      salespersonName: item.collectorName,
      amount: Number(item.amount || 0),
      paymentMethods: this.paymentMethods(item.payments || []),
      allocationCount: (item.allocations || []).length,
    };
  }

  private mapReturn(item: any) {
    return {
      id: String(item._id),
      type: 'CUSTOMER_RETURN',
      code: item.code,
      occurredAt: item.createdAt,
      createdAt: item.createdAt,
      status: item.status || CustomerReturnStatus.COMPLETED,
      customerCode: item.customerCode,
      customerName: item.customerName,
      salespersonName: item.driverName,
      amount: Number(item.returnAmount || 0),
      debtReductionAmount: Number(item.debtReductionAmount || 0),
      refundAmount: Number(item.refundAmount || 0),
      itemCount: (item.items || []).length,
    };
  }

  async preview(query: DocumentSafetyDateQueryDto): Promise<any> {
    const day = await this.loadDay(query.date);
    const invoiceRows = day.invoices.map((item) => this.mapInvoice(item));
    const receiptRows = day.receipts.map((item) => this.mapReceipt(item));
    const returnRows = day.returns.map((item) => this.mapReturn(item));
    const activeInvoices = invoiceRows.filter(
      (item) => item.status !== InvoiceStatus.REVERSED,
    );
    const activeReceipts = receiptRows.filter(
      (item) => item.status === DebtPaymentStatus.ACTIVE,
    );
    const activeReturns = returnRows.filter(
      (item) => item.status === CustomerReturnStatus.COMPLETED,
    );
    const selectedReceiptIds = new Set(activeReceipts.map((item) => item.id));
    const invoiceIds = activeInvoices.map((item) => item.id);
    const externalReceipts: any[] = invoiceIds.length
      ? await this.receipts
          .find({
            isDeleted: { $ne: true },
            status: DebtPaymentStatus.ACTIVE,
            'allocations.invoiceId': { $in: invoiceIds },
          })
          .select('_id code date allocations')
          .lean()
      : [];
    const blockers: any[] = externalReceipts
      .filter((item) => !selectedReceiptIds.has(String(item._id)))
      .map((item) => ({
        code: 'INVOICE_HAS_PAYMENT_OUTSIDE_DAY',
        documentId: String(item._id),
        documentCode: item.code,
        message: `Phiếu thu ${item.code} nằm ngoài ngày ${query.date} đang phân bổ vào hóa đơn trong ngày`,
      }));
    const activeCount =
      activeInvoices.length + activeReceipts.length + activeReturns.length;
    if (!activeCount)
      blockers.push({
        code: 'NO_ACTIVE_DOCUMENTS',
        message: 'Không còn chứng từ đang hoạt động để hoàn tác trong ngày này',
      });
    const warnings = activeReturns
      .filter((item) => item.refundAmount > 0)
      .map((item) => ({
        code: 'RETURN_REFUND_REQUIRES_COLLECTION',
        documentId: item.id,
        documentCode: item.code,
        message: `Phiếu ${item.code} đã hoàn tiền ${item.refundAmount.toLocaleString('vi-VN')} đ; sau khi đảo cần thu hồi khoản này`,
      }));
    return {
      data: {
        date: query.date,
        period: { from: day.from, to: day.to },
        canReverse: blockers.length === 0,
        summary: {
          totalDocuments:
            invoiceRows.length + receiptRows.length + returnRows.length,
          activeDocuments: activeCount,
          invoiceCount: invoiceRows.length,
          activeInvoiceCount: activeInvoices.length,
          invoiceAmount: activeInvoices.reduce(
            (sum, item) => sum + item.amount,
            0,
          ),
          debtPaymentCount: receiptRows.length,
          activeDebtPaymentCount: activeReceipts.length,
          debtPaymentAmount: activeReceipts.reduce(
            (sum, item) => sum + item.amount,
            0,
          ),
          customerReturnCount: returnRows.length,
          activeCustomerReturnCount: activeReturns.length,
          customerReturnAmount: activeReturns.reduce(
            (sum, item) => sum + item.amount,
            0,
          ),
        },
        documents: {
          invoices: invoiceRows,
          debtPayments: receiptRows,
          customerReturns: returnRows,
        },
        warnings,
        blockers,
      },
    };
  }

  private styleSheet(sheet: ExcelJS.Worksheet) {
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8F3FF' },
    };
    if (sheet.columnCount)
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheet.columnCount },
      };
  }

  async export(query: DocumentSafetyDateQueryDto): Promise<Buffer> {
    const day = await this.loadDay(query.date);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Phúc Long - Vùng an toàn chứng từ';
    workbook.created = new Date();

    const invoices = workbook.addWorksheet('Hóa đơn');
    invoices.columns = [
      { header: 'STT', key: 'number', width: 8 },
      { header: 'Mã hóa đơn', key: 'code', width: 20 },
      { header: 'Ngày', key: 'date', width: 20 },
      { header: 'Trạng thái', key: 'status', width: 16 },
      { header: 'Mã khách', key: 'customerCode', width: 16 },
      { header: 'Khách hàng', key: 'customerName', width: 32 },
      { header: 'Nhân viên', key: 'salespersonName', width: 24 },
      { header: 'Tổng tiền', key: 'amount', width: 18 },
      { header: 'Đã trả', key: 'paidAmount', width: 18 },
      { header: 'Còn nợ', key: 'debtAmount', width: 18 },
      { header: 'Thanh toán', key: 'paymentMethods', width: 24 },
    ];
    day.invoices.forEach((item, index) =>
      invoices.addRow({ number: index + 1, ...this.mapInvoice(item) }),
    );
    ['amount', 'paidAmount', 'debtAmount'].forEach(
      (key) => (invoices.getColumn(key).numFmt = '#,##0'),
    );
    this.styleSheet(invoices);

    const invoiceItems = workbook.addWorksheet('Chi tiết hóa đơn');
    invoiceItems.columns = [
      { header: 'Mã hóa đơn', key: 'invoiceCode', width: 20 },
      { header: 'Mã sản phẩm', key: 'productCode', width: 20 },
      { header: 'Tên sản phẩm', key: 'productName', width: 36 },
      { header: 'Loại dòng', key: 'lineType', width: 16 },
      { header: 'Đơn vị', key: 'unit', width: 12 },
      { header: 'Số lượng', key: 'qty', width: 14 },
      { header: 'Đơn giá', key: 'price', width: 18 },
      { header: 'Thành tiền', key: 'lineTotal', width: 18 },
    ];
    day.invoices.forEach((invoice) =>
      (invoice.items || []).forEach((item) =>
        invoiceItems.addRow({
          invoiceCode: invoice.code,
          productCode: item.productCode,
          productName: item.productName,
          lineType: item.lineType,
          unit: item.unit,
          qty: Number(item.qty || 0),
          price: Number(item.price || 0),
          lineTotal: Number(item.lineTotal || 0),
        }),
      ),
    );
    ['qty', 'price', 'lineTotal'].forEach(
      (key) => (invoiceItems.getColumn(key).numFmt = '#,##0'),
    );
    this.styleSheet(invoiceItems);

    const receipts = workbook.addWorksheet('Thanh toán công nợ');
    receipts.columns = [
      { header: 'STT', key: 'number', width: 8 },
      { header: 'Mã phiếu thu', key: 'code', width: 20 },
      { header: 'Ngày', key: 'occurredAt', width: 20 },
      { header: 'Trạng thái', key: 'status', width: 16 },
      { header: 'Mã khách', key: 'customerCode', width: 16 },
      { header: 'Khách hàng', key: 'customerName', width: 32 },
      { header: 'Người thu', key: 'salespersonName', width: 24 },
      { header: 'Số tiền', key: 'amount', width: 18 },
      { header: 'Phương thức', key: 'paymentMethods', width: 24 },
      { header: 'Số hóa đơn phân bổ', key: 'allocationCount', width: 20 },
    ];
    day.receipts.forEach((item, index) =>
      receipts.addRow({ number: index + 1, ...this.mapReceipt(item) }),
    );
    receipts.getColumn('amount').numFmt = '#,##0';
    this.styleSheet(receipts);

    const returns = workbook.addWorksheet('Trả hàng');
    returns.columns = [
      { header: 'STT', key: 'number', width: 8 },
      { header: 'Mã phiếu trả', key: 'code', width: 20 },
      { header: 'Ngày', key: 'occurredAt', width: 20 },
      { header: 'Trạng thái', key: 'status', width: 16 },
      { header: 'Mã khách', key: 'customerCode', width: 16 },
      { header: 'Khách hàng', key: 'customerName', width: 32 },
      { header: 'Xe / nhân viên', key: 'salespersonName', width: 24 },
      { header: 'Giá trị trả', key: 'amount', width: 18 },
      { header: 'Giảm công nợ', key: 'debtReductionAmount', width: 18 },
      { header: 'Hoàn tiền', key: 'refundAmount', width: 18 },
      { header: 'Số mặt hàng', key: 'itemCount', width: 16 },
    ];
    day.returns.forEach((item, index) =>
      returns.addRow({ number: index + 1, ...this.mapReturn(item) }),
    );
    ['amount', 'debtReductionAmount', 'refundAmount'].forEach(
      (key) => (returns.getColumn(key).numFmt = '#,##0'),
    );
    this.styleSheet(returns);

    const filters = workbook.addWorksheet('Thông tin trích xuất');
    filters.columns = [
      { header: 'Thông tin', key: 'label', width: 28 },
      { header: 'Giá trị', key: 'value', width: 50 },
    ];
    filters.addRows([
      { label: 'Ngày chứng từ', value: query.date },
      { label: 'Từ', value: day.from.toISOString() },
      { label: 'Đến', value: day.to.toISOString() },
      {
        label: 'Số hóa đơn',
        value: day.invoices.length,
      },
      {
        label: 'Số phiếu thu công nợ',
        value: day.receipts.length,
      },
      {
        label: 'Số phiếu trả hàng',
        value: day.returns.length,
      },
    ]);
    filters.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async history(query: DocumentSafetyHistoryQueryDto): Promise<any> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter: any = { isDeleted: { $ne: true } };
    if (query.date) filter.documentDate = query.date;
    const [data, total] = await Promise.all([
      this.operations
        .find(filter)
        .select('-snapshot -result')
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.operations.countDocuments(filter),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async reverseDay(
    dto: ReverseDocumentDayDto,
    actor: SafetyActor,
  ): Promise<any> {
    if (actor.role !== RoleEnum.ADMIN || !actor.id)
      throw new ForbiddenException('Chỉ quản trị viên được hoàn tác theo ngày');
    if (dto.confirmation.trim() !== 'HOAN TAC CHUNG TU TRONG NGAY')
      throw new BadRequestException(
        'Câu xác nhận không đúng: HOAN TAC CHUNG TU TRONG NGAY',
      );
    const existing = await this.operations
      .findOne({ idempotencyKey: dto.idempotencyKey })
      .lean();
    if (existing) return { data: existing, idempotent: true };

    const preview = await this.preview({ date: dto.date });
    if (!preview.data.canReverse)
      throw new ConflictException({
        code: 'DOCUMENT_DAY_CANNOT_REVERSE',
        message: 'Ngày đã chọn chưa đủ điều kiện hoàn tác',
        blockers: preview.data.blockers,
      });

    const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
    await this.operations.updateMany(
      {
        status: DocumentSafetyOperationStatus.PROCESSING,
        createdAt: { $lt: staleBefore },
        activeLockKey: { $exists: true },
      },
      {
        $set: {
          status: DocumentSafetyOperationStatus.FAILED,
          failedAt: new Date(),
          errorMessage: 'Tiến trình hết hạn trước khi hoàn tất',
        },
        $unset: { activeLockKey: 1 },
      },
    );

    let operation: any;
    try {
      operation = await this.operations.create({
        idempotencyKey: dto.idempotencyKey,
        activeLockKey: dto.date,
        documentDate: dto.date,
        periodFrom: preview.data.period.from,
        periodTo: preview.data.period.to,
        status: DocumentSafetyOperationStatus.PROCESSING,
        reason: dto.reason.trim(),
        createdBy: actor.id,
        createdByName: actor.name,
        snapshot: preview.data,
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        const duplicate = await this.operations
          .findOne({ idempotencyKey: dto.idempotencyKey })
          .lean();
        if (duplicate) return { data: duplicate, idempotent: true };
        throw new ConflictException({
          code: 'DOCUMENT_DAY_REVERSAL_RUNNING',
          message: 'Ngày này đang có một tiến trình hoàn tác khác',
        });
      }
      throw error;
    }

    const result: any = {
      debtPayments: [],
      customerReturns: [],
      invoices: [],
      failure: null,
    };
    const reason = `Hoàn tác ngày ${dto.date}: ${dto.reason.trim()}`;
    let processed = 0;
    try {
      for (const item of preview.data.documents.debtPayments.filter(
        (value) => value.status === DebtPaymentStatus.ACTIVE,
      )) {
        await this.debtPaymentService.cancel(item.id, { reason }, actor.id);
        result.debtPayments.push({ id: item.id, code: item.code });
        processed++;
      }
      for (const item of preview.data.documents.customerReturns.filter(
        (value) => value.status === CustomerReturnStatus.COMPLETED,
      )) {
        await this.customerReturnService.reverse(item.id, reason, actor.id);
        result.customerReturns.push({ id: item.id, code: item.code });
        processed++;
      }
      for (const item of preview.data.documents.invoices.filter(
        (value) => value.status !== InvoiceStatus.REVERSED,
      )) {
        await this.invoiceService.reverse(item.id, reason, actor);
        result.invoices.push({ id: item.id, code: item.code });
        processed++;
      }
      const completedAt = new Date();
      const completed = await this.operations.findOneAndUpdate(
        { _id: operation._id },
        {
          $set: {
            status: DocumentSafetyOperationStatus.COMPLETED,
            result,
            completedAt,
          },
          $unset: { activeLockKey: 1 },
        },
        { new: true },
      );
      await this.notifications
        .create({
          type: NotificationType.DOCUMENT_DAY_REVERSED,
          title: 'Đã hoàn tác chứng từ theo ngày',
          message: `${dto.date}: ${processed} chứng từ`,
          entityType: 'DOCUMENT_SAFETY_OPERATION',
          entityId: String(operation._id),
          data: { date: dto.date, processed, reason: dto.reason.trim() },
        })
        .catch(() => undefined);
      return { data: completed };
    } catch (error: any) {
      result.failure = {
        message: error?.response?.message || error?.message || 'Lỗi hoàn tác',
      };
      const status = processed
        ? DocumentSafetyOperationStatus.PARTIAL
        : DocumentSafetyOperationStatus.FAILED;
      const failed = await this.operations.findOneAndUpdate(
        { _id: operation._id },
        {
          $set: {
            status,
            result,
            failedAt: new Date(),
            errorMessage: result.failure.message,
          },
          $unset: { activeLockKey: 1 },
        },
        { new: true },
      );
      return { data: failed };
    }
  }
}
