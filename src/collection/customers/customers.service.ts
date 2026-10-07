import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { getConnectionToken, InjectModel } from 'nestjs-typegoose';
import { Connection } from 'mongoose';
import {
  CustomerCodeStatus,
  CustomerCounters,
  CustomerInteractionChannel,
  Customers,
  InvoiceFollowUpBooks,
  InvoiceFollowUpDrafts,
} from './schemas/customers.schema';
import {
  CreateInvoiceFollowUpDraftDto,
  CreateCustomerDto,
  CreateInteractionDto,
  CustomerDebtHistoryQueryDto,
  CustomerQueryDto,
  DailyInvoiceFollowUpQueryDto,
  UpdateInvoiceFollowUpDraftDto,
  UpdateCustomerDto,
  UpdateCustomerStoreProfileDto,
} from './dtos/customers.dto';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { DebtPayments } from '../debt-payments/schemas/debt-payments.schema';
import { CustomerReturns } from '../customer-returns/schemas/customer-returns.schema';
import { Vouchers } from '../promotions/schemas/promotions.schema';
import * as ExcelJS from 'exceljs';
import {
  excelBoolean,
  excelNumber,
  excelValue,
  normalizeExcelRow,
} from '../../core/excel-import';
import { CustomerSegment, CustomerSource } from './schemas/customers.schema';
import {
  CustomerDebtLedger,
  DebtLedgerDirection,
  DebtLedgerType,
} from '../debt-payments/schemas/customer-debt-ledger.schema';
import { vietnamDateBoundary } from '../trucks/truck-transfer-date';
import { Users, UserStatus } from '../users/schemas/users.schema';
import { createHash } from 'crypto';
import { ImportCustomerInteractionRowDto } from './dtos/customers.dto';
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';
import { RoleEnum } from '../users/interfaces/role.enum';
import { parseBusinessDate } from '../../core/business-date';

export function normalizePhones(value?: unknown): string[] {
  return String(value ?? '')
    .split(/[,;|/]+/)
    .map((phone) => phone.replace(/\D/g, ''))
    .filter(Boolean)
    .map((phone) => (phone.startsWith('0') ? phone : `0${phone}`))
    .filter((phone, index, values) => values.indexOf(phone) === index);
}

export function normalizeInteractionChannel(
  value?: unknown,
): CustomerInteractionChannel {
  const channel = String(value || '')
    .trim()
    .toUpperCase();
  if (['PHONE', 'CALL', 'CALLING', 'GOI_DIEN'].includes(channel))
    return CustomerInteractionChannel.PHONE;
  if (channel === 'SMS') return CustomerInteractionChannel.SMS;
  return CustomerInteractionChannel.ZALO;
}

const SOURCE_LABELS: Record<CustomerSource, string> = {
  LEAD: 'Khách lead',
  LEGACY: 'Khách cũ',
  NEW: 'Khách mới',
};
const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  TEMPORARILY_INACTIVE: 'Tạm ngừng hoạt động',
  ACTIVE: 'Đang hoạt động',
  HIGHLY_ACTIVE: 'Hoạt động tốt',
  STOPPED_BUYING: 'Ngừng mua hàng',
  CHURNED: 'Khách rời đi',
  NEW_CUSTOMER: 'Khách mới',
};
function aliasKey(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'D')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}
const SOURCE_ALIASES: Record<string, CustomerSource> = {
  LEAD: CustomerSource.LEAD,
  LEGACY: CustomerSource.LEGACY,
  'KHACH CU': CustomerSource.LEGACY,
  NEW: CustomerSource.NEW,
  'KHACH MOI': CustomerSource.NEW,
};
const SEGMENT_ALIASES: Record<string, CustomerSegment> = {
  TEMPORARILY_INACTIVE: CustomerSegment.TEMPORARILY_INACTIVE,
  'NGU QUEN 31-89 NGAY': CustomerSegment.TEMPORARILY_INACTIVE,
  ACTIVE: CustomerSegment.ACTIVE,
  'DANG HOAT DONG': CustomerSegment.ACTIVE,
  HIGHLY_ACTIVE: CustomerSegment.HIGHLY_ACTIVE,
  'THUONG XUYEN': CustomerSegment.HIGHLY_ACTIVE,
  STOPPED_BUYING: CustomerSegment.STOPPED_BUYING,
  '90-179 NGAY CHUA PS': CustomerSegment.STOPPED_BUYING,
  CHURNED: CustomerSegment.CHURNED,
  'KHACH CHET >=180 NGAY': CustomerSegment.CHURNED,
  NEW_CUSTOMER: CustomerSegment.NEW_CUSTOMER,
  'CHUA PHAT SINH DON': CustomerSegment.NEW_CUSTOMER,
  VIP: CustomerSegment.HIGHLY_ACTIVE,
  'THAN THIET': CustomerSegment.HIGHLY_ACTIVE,
  'TIEM NANG': CustomerSegment.ACTIVE,
  'DAI LY': CustomerSegment.ACTIVE,
  THUONG: CustomerSegment.ACTIVE,
};

export function buildCustomerInteractionImportKey(
  row: ImportCustomerInteractionRowDto,
  code: string,
  occurredAt: Date,
  phone: string,
) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        row.rowNumber || 0,
        code,
        occurredAt.toISOString(),
        row.zaloStatus || '',
        row.invoiceStatus || '',
        row.interaction?.trim() || '',
        phone,
        row.note?.trim() || '',
      ]),
    )
    .digest('hex');
}

export function customerStoreProfileFlags(customer: any) {
  return {
    hasStoreLocation:
      Number.isFinite(customer?.storeLocation?.latitude) &&
      Number.isFinite(customer?.storeLocation?.longitude),
    hasStorefrontImage: Boolean(customer?.storefrontImage?.url),
  };
}

@Injectable()
export class CustomersService implements OnModuleInit {
  private readonly logger = new Logger(CustomersService.name);

  private deletedCodePlaceholder(id: unknown) {
    return `__DELETED__:${String(id)}`;
  }

  constructor(
    @InjectModel(Customers)
    private readonly model: ReturnModelType<typeof Customers>,
    @InjectModel(CustomerCounters)
    private readonly counterModel: ReturnModelType<typeof CustomerCounters>,
    @InjectModel(InvoiceFollowUpDrafts)
    private readonly invoiceFollowUpDraftModel: ReturnModelType<
      typeof InvoiceFollowUpDrafts
    >,
    @InjectModel(InvoiceFollowUpBooks)
    private readonly invoiceFollowUpBookModel: ReturnModelType<
      typeof InvoiceFollowUpBooks
    >,
    @InjectModel(Invoices)
    private readonly invoiceModel: ReturnModelType<typeof Invoices>,
    @InjectModel(DebtPayments)
    private readonly debtPaymentModel: ReturnModelType<typeof DebtPayments>,
    @InjectModel(CustomerReturns)
    private readonly customerReturnModel: ReturnModelType<
      typeof CustomerReturns
    >,
    @InjectModel(Vouchers)
    private readonly voucherModel: ReturnModelType<typeof Vouchers>,
    @InjectModel(CustomerDebtLedger)
    private readonly debtLedgerModel: ReturnModelType<
      typeof CustomerDebtLedger
    >,
    @InjectModel(Users)
    private readonly userModel: ReturnModelType<typeof Users>,
    @Inject(getConnectionToken()) private readonly connection: Connection,
  ) {}

  async onModuleInit() {
    await this.ensureCustomerCodeIndex();
  }

  private async ensureCustomerCodeIndex() {
    const collection = this.model.collection;
    try {
      const indexes = await collection.indexes();
      const codeIndex: any = indexes.find(
        (item: any) =>
          item.key?.code === 1 && Object.keys(item.key).length === 1,
      );
      const partial = codeIndex?.partialFilterExpression;
      const isExpected = Boolean(
        codeIndex?.unique &&
          partial?.isDeleted === false &&
          partial?.code?.$type === 'string',
      );
      if (isExpected) return;

      if (codeIndex) {
        try {
          await collection.dropIndex(codeIndex.name);
        } catch (error: any) {
          // Another application instance may have completed this migration.
          if (error?.code !== 27 && error?.codeName !== 'IndexNotFound')
            throw error;
        }
      }

      await collection.updateMany(
        {
          isDeleted: true,
          code: { $type: 'string' },
          deletedCode: { $exists: false },
        },
        [{ $set: { deletedCode: '$code' } }],
      );
      await collection.updateMany(
        { isDeleted: true },
        {
          $unset: { code: 1 },
          $set: { codeStatus: CustomerCodeStatus.UNASSIGNED },
        },
      );

      const currentCodeIndex: any = (await collection.indexes()).find(
        (item: any) =>
          item.key?.code === 1 && Object.keys(item.key).length === 1,
      );
      if (!currentCodeIndex) {
        await collection.createIndex(
          { code: 1 },
          {
            name: 'code_1',
            unique: true,
            partialFilterExpression: {
              isDeleted: false,
              code: { $type: 'string' },
            },
          },
        );
      }
      this.logger.log('Customer code index migration completed');
    } catch (error: any) {
      // Customer mutations remain safe with the legacy index and this
      // idempotent migration will be retried on the next application start.
      this.logger.error(
        `Customer code index migration deferred: ${error?.message || error}`,
      );
    }
  }

  private page(value: string | undefined, fallback: number, max?: number) {
    const n = Number(value || fallback);
    if (!Number.isInteger(n) || n < 1 || (max && n > max))
      throw new BadRequestException('Tham số phân trang không hợp lệ');
    return n;
  }

  private importDate(value: unknown) {
    if (value === null || value === undefined || value === '')
      return new Date();
    const date =
      typeof value === 'number'
        ? new Date((value - 25569) * 86400000)
        : new Date(String(value));
    if (Number.isNaN(date.getTime()))
      throw new BadRequestException('Ngày hiệu lực công nợ không hợp lệ');
    return date;
  }

  private async nextCode() {
    for (;;) {
      const counter: any = await this.counterModel.findOneAndUpdate(
        { key: 'CUSTOMER_CODE' },
        { $inc: { sequence: 1 } },
        { upsert: true, new: true },
      );
      const code = `KH${String(counter.sequence).padStart(3, '0')}`;
      if (!(await this.model.exists({ code }))) return code;
    }
  }

  async create(dto: CreateCustomerDto) {
    const phones = normalizePhones(dto.phone);
    const phone = phones.join(', ') || undefined;
    return {
      data: await this.model.create({
        ...dto,
        phone,
        phones,
        name: dto.name.trim(),
        code: await this.nextCode(),
        codeStatus: CustomerCodeStatus.ASSIGNED,
      }),
    };
  }

  async updateCode(
    id: string,
    codeValue: string,
    reasonValue: string,
    actorId?: string,
  ) {
    await this.assertAdminActor(actorId);
    const code = String(codeValue || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
    const reason = String(reasonValue || '').trim();
    if (!code)
      throw new BadRequestException('Mã khách hàng không được để trống');
    if (!reason)
      throw new BadRequestException('Phải nhập lý do cấp hoặc đổi mã');
    const existing = await this.model.exists({
      _id: { $ne: id },
      code,
      isDeleted: false,
    });
    if (existing)
      throw new ConflictException({
        code: 'CUSTOMER_CODE_ALREADY_EXISTS',
        message: 'Mã khách hàng đã thuộc khách hàng khác',
      });
    const current: any = await this.model
      .findOne({ _id: id, isDeleted: false })
      .select('code')
      .lean();
    if (!current) throw new NotFoundException('Không tìm thấy khách hàng');
    let customer: any;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        // Keep a unique placeholder until the production database has migrated
        // from the legacy global unique index to the partial unique index.
        const deletedOwners: any[] = await this.model
          .find({ _id: { $ne: id }, code, isDeleted: true })
          .select('_id code')
          .session(session)
          .lean();
        for (const deletedOwner of deletedOwners) {
          await this.model.updateOne(
            { _id: deletedOwner._id, code, isDeleted: true },
            {
              $set: {
                deletedCode: code,
                code: this.deletedCodePlaceholder(deletedOwner._id),
              },
            },
            { session },
          );
        }
        customer = await this.model.findOneAndUpdate(
          { _id: id, isDeleted: false },
          {
            $set: { code, codeStatus: CustomerCodeStatus.ASSIGNED },
            $push: {
              codeHistory: {
                oldCode: current.code,
                newCode: code,
                changedBy: actorId,
                changedAt: new Date(),
                reason,
              },
            },
          },
          { new: true, session },
        );
        if (!customer)
          throw new ConflictException({
            code: 'CUSTOMER_STATE_CHANGED',
            message: 'Trạng thái khách hàng vừa thay đổi, vui lòng thử lại',
          });
      });
    } catch (error: any) {
      if (error?.code === 11000)
        throw new ConflictException({
          code: 'CUSTOMER_CODE_ALREADY_EXISTS',
          message: 'Mã khách hàng đã thuộc khách hàng khác',
        });
      throw error;
    } finally {
      await session.endSession();
    }
    const match = /^KH(\d+)$/.exec(code);
    if (match)
      await this.counterModel.updateOne(
        { key: 'CUSTOMER_CODE' },
        {
          $max: { sequence: Number(match[1]) },
          $setOnInsert: { key: 'CUSTOMER_CODE' },
        },
        { upsert: true },
      );
    return { data: customer };
  }

  async deleteCustomer(id: string, reasonValue: string, actorId?: string) {
    await this.assertAdminActor(actorId);
    const reason = String(reasonValue || '').trim();
    if (!reason)
      throw new BadRequestException('Phải nhập lý do xóa khách hàng');
    const customer: any = await this.model
      .findOne({ _id: id, isDeleted: false })
      .select('code debt')
      .lean();
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    if (Number(customer.debt || 0) > 0)
      throw new ConflictException({
        code: 'CUSTOMER_HAS_OUTSTANDING_DEBT',
        message: 'Không thể xóa khách hàng còn công nợ',
      });
    const deleted = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false, debt: { $lte: 0 } },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: actorId,
          deleteReason: reason,
          deletedCode: customer.code,
          code: this.deletedCodePlaceholder(customer._id),
        },
      },
      { new: true },
    );
    if (!deleted)
      throw new ConflictException({
        code: 'CUSTOMER_STATE_CHANGED',
        message: 'Trạng thái khách hàng vừa thay đổi, vui lòng thử lại',
      });
    return { data: deleted };
  }

  private async assertAdminActor(actorId?: string) {
    if (!actorId)
      throw new ForbiddenException('Không xác định được người thực hiện');
    const actor = await this.userModel.exists({
      _id: actorId,
      isDeleted: false,
      status: { $ne: UserStatus.INACTIVE },
      role: RoleEnum.ADMIN,
    });
    if (!actor)
      throw new ForbiddenException(
        'Chỉ quản trị viên đang hoạt động được thực hiện thao tác này',
      );
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const payload: any = { ...dto };
    if (dto.phone !== undefined) {
      const phones = normalizePhones(dto.phone);
      payload.phones = phones;
      payload.phone = phones.join(', ') || undefined;
    }
    if (dto.name !== undefined) payload.name = dto.name.trim();
    const update: any = { $set: payload };
    if (dto.phone !== undefined && !payload.phone) {
      delete payload.phone;
      update.$unset = { phone: 1 };
    }
    const customer = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      update,
      { new: true },
    );
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    return { data: customer };
  }

  async findAll(query: CustomerQueryDto): Promise<any> {
    const page = this.page(query.page, 1);
    const limit = this.page(query.limit, 20, 100);
    const filter: any = { isDeleted: false };
    if (query.search?.trim()) {
      const escaped = query.search
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = ['code', 'name', 'phone', 'phones'].map((field) => ({
        [field]: { $regex: escaped, $options: 'i' },
      }));
    }
    if (query.source) filter.source = query.source;
    if (query.segment) filter.segment = query.segment;
    if (query.zaloConnected === 'true' || query.zaloConnected === 'false')
      filter.zaloConnected = query.zaloConnected === 'true';
    const expressions: any[] = [];
    if (query.hasDebt === true || String(query.hasDebt) === 'true')
      expressions.push({ $gt: [{ $ifNull: ['$debt', 0] }, 0] });
    if (query.debtWarning === true || String(query.debtWarning) === 'true')
      expressions.push({
        $and: [
          { $gt: [{ $ifNull: ['$debtLimit', 0] }, 0] },
          { $gte: [{ $ifNull: ['$debt', 0] }, { $ifNull: ['$debtLimit', 0] }] },
        ],
      });
    if (expressions.length === 1) filter.$expr = expressions[0];
    else if (expressions.length > 1) filter.$expr = { $and: expressions };
    const [data, totalItems] = await Promise.all([
      this.model
        .find(filter)
        .select(
          'code codeStatus name phone phones email address source segment zaloConnected debt debtLimit invoiceCoinBalance plusExCoinBalance note createdAt updatedAt storeLocation.latitude storeLocation.longitude storefrontImage.url',
        )
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.model.countDocuments(filter),
    ]);
    return {
      data: data.map((customer: any) => ({
        ...customer,
        id: String(customer._id),
        ...customerStoreProfileFlags(customer),
        sourceLabel: SOURCE_LABELS[customer.source],
        segmentLabel: SEGMENT_LABELS[customer.segment],
        availableDebtLimit:
          customer.debtLimit > 0
            ? Math.max(0, customer.debtLimit - (customer.debt || 0))
            : 0,
        debtWarning:
          (customer.debtLimit || 0) > 0 &&
          (customer.debt || 0) >= customer.debtLimit,
      })),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async findDeleted(query: CustomerQueryDto, actorId?: string): Promise<any> {
    await this.assertAdminActor(actorId);
    const page = this.page(query.page, 1);
    const limit = this.page(query.limit, 20, 100);
    const filter: any = { isDeleted: true };
    if (query.search?.trim()) {
      const escaped = query.search
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = ['code', 'deletedCode', 'name', 'phone', 'phones'].map(
        (field) => ({ [field]: { $regex: escaped, $options: 'i' } }),
      );
    }
    const [rows, totalItems] = await Promise.all([
      this.model
        .find(filter)
        .select(
          'code deletedCode codeStatus name phone phones email address source segment debt debtLimit note deleteReason deletedAt deletedBy createdAt updatedAt',
        )
        .sort({ deletedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.model.countDocuments(filter),
    ]);
    return {
      data: rows.map((row: any) => {
        const displayCode =
          row.deletedCode ||
          (String(row.code || '').startsWith('__DELETED__:')
            ? null
            : row.code) ||
          null;
        return { ...row, code: displayCode, id: String(row._id), displayCode };
      }),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async findDeletedOne(id: string, actorId?: string): Promise<any> {
    await this.assertAdminActor(actorId);
    const row: any = await this.model
      .findOne({ _id: id, isDeleted: true })
      .lean();
    if (!row) throw new NotFoundException('Không tìm thấy khách hàng đã xóa');
    const displayCode =
      row.deletedCode ||
      (String(row.code || '').startsWith('__DELETED__:') ? null : row.code) ||
      null;
    return {
      data: { ...row, code: displayCode, id: String(row._id), displayCode },
    };
  }

  async restoreCustomer(id: string, actorId?: string): Promise<any> {
    await this.assertAdminActor(actorId);
    const deleted: any = await this.model
      .findOne({ _id: id, isDeleted: true })
      .select('code deletedCode')
      .lean();
    if (!deleted)
      throw new NotFoundException('Không tìm thấy khách hàng đã xóa');
    const desiredCode = deleted.deletedCode || deleted.code;
    const codeAvailable = desiredCode
      ? !(await this.model.exists({
          _id: { $ne: id },
          code: desiredCode,
          isDeleted: false,
        }))
      : false;
    const set: any = {
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      deleteReason: null,
      codeStatus: codeAvailable
        ? CustomerCodeStatus.ASSIGNED
        : CustomerCodeStatus.UNASSIGNED,
    };
    if (codeAvailable) set.code = desiredCode;
    if (!codeAvailable) set.code = this.deletedCodePlaceholder(deleted._id);
    const update: any = { $set: set };
    const restored = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: true },
      update,
      { new: true },
    );
    if (!restored)
      throw new ConflictException({
        code: 'CUSTOMER_STATE_CHANGED',
        message: 'Trạng thái khách hàng vừa thay đổi, vui lòng thử lại',
      });
    const restoredData: any = restored.toObject
      ? restored.toObject()
      : restored;
    if (!codeAvailable) delete restoredData.code;
    return {
      data: restoredData,
      meta: { codeRestored: codeAvailable, previousCode: desiredCode || null },
    };
  }

  async summary() {
    const rows = await this.model
      .find({ isDeleted: false })
      .select('zaloConnected source debt debtLimit')
      .lean();
    return {
      data: {
        totalCustomers: rows.length,
        zaloConnected: rows.filter((x) => x.zaloConnected).length,
        leads: rows.filter((x) => x.source === 'LEAD').length,
        debtWarnings: rows.filter(
          (x) => (x.debtLimit || 0) > 0 && (x.debt || 0) >= x.debtLimit,
        ).length,
        totalDebt: rows.reduce((sum, x) => sum + (x.debt || 0), 0),
      },
    };
  }

  async findOne(id: string) {
    const customer: any = await this.model
      .findOne({ _id: id, isDeleted: false })
      .lean();
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    const [invoices, vouchers] = await Promise.all([
      this.invoiceModel
        .find({ customerId: id, isDeleted: false })
        .sort({ date: -1, createdAt: -1, _id: -1 })
        .lean(),
      this.voucherModel
        .find({ customerId: id, isDeleted: false })
        .populate('promotionId', 'name discountType discountValue')
        .sort({ createdAt: -1, _id: -1 })
        .lean(),
    ]);
    const totalSpent = invoices.reduce(
      (sum, item) => sum + (item.totalAmount || 0),
      0,
    );
    return {
      data: {
        ...customer,
        id: String(customer._id),
        sourceLabel: SOURCE_LABELS[customer.source],
        segmentLabel: SEGMENT_LABELS[customer.segment],
        totalSpent,
        orderCount: invoices.length,
        lastOrderAt: invoices[0]?.date || null,
        invoices: invoices.map((x: any) => ({
          id: String(x._id),
          code: x.code,
          date: x.date,
          total: x.totalAmount,
          paid: x.paidAmount || 0,
          status: x.paymentStatus || 'UNPAID',
        })),
        vouchers: vouchers.map((x: any) => ({
          id: String(x._id),
          code: x.code,
          campaign: x.promotionId?.name,
          benefit:
            x.promotionId?.discountType === 'PERCENT'
              ? `Giảm ${x.promotionId.discountValue}%`
              : `Giảm ${x.promotionId?.discountValue || 0}đ`,
          expiresAt: x.expiresAt,
          status: x.status,
        })),
        interactions: (customer.interactions || [])
          .slice()
          .reverse()
          .map((x) => ({ ...x, id: String(x._id) })),
      },
    };
  }

  async addInteraction(
    id: string,
    dto: CreateInteractionDto,
    actorId?: string,
  ) {
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    const interaction = {
      ...dto,
      occurredAt,
      at: new Date(),
      createdBy: actorId,
    };
    const update: any = { $push: { interactions: interaction } };
    if (dto.zaloStatus)
      update.$set = { zaloConnected: dto.zaloStatus === 'CONNECTED' };
    const customer = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      update,
      { new: true },
    );
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    return { data: customer.interactions[customer.interactions.length - 1] };
  }

  async dailyInvoiceFollowUps(q: DailyInvoiceFollowUpQueryDto) {
    const filter: any = {
      isDeleted: false,
      status: { $ne: 'REVERSED' },
      date: {
        $gte: vietnamDateBoundary(q.date, false),
        $lte: vietnamDateBoundary(q.date, true),
      },
    };
    if (q.salespersonId) filter.salespersonId = q.salespersonId;
    const invoices: any[] = await this.invoiceModel
      .find(filter)
      .select(
        'code date customerId customerCode customerName customerPhone salespersonId salespersonCode salespersonName grandTotal totalAmount',
      )
      .sort({ date: 1, code: 1 })
      .lean();
    const [debtPayments, customerReturns]: any[][] = await Promise.all([
      this.debtPaymentModel
        .find({
          isDeleted: false,
          status: 'ACTIVE',
          date: {
            $gte: vietnamDateBoundary(q.date, false),
            $lte: vietnamDateBoundary(q.date, true),
          },
        })
        .select(
          'code date customerId customerCode customerName customerPhone collectorId collectorCode collectorName amount',
        )
        .sort({ date: 1, code: 1 })
        .lean(),
      this.customerReturnModel
        .find({
          isDeleted: false,
          status: 'COMPLETED',
          createdAt: {
            $gte: vietnamDateBoundary(q.date, false),
            $lte: vietnamDateBoundary(q.date, true),
          },
        })
        .select(
          'code createdAt customerId customerCode customerName customerPhone createdBy returnAmount',
        )
        .sort({ createdAt: 1, code: 1 })
        .lean(),
    ]);
    const customerIds = [
      ...new Set(
        [...invoices, ...debtPayments, ...customerReturns]
          .map((item) => (item.customerId ? String(item.customerId) : ''))
          .filter(Boolean),
      ),
    ];
    const customers: any[] = await this.model
      .find({ _id: { $in: customerIds }, isDeleted: false })
      .select('code name phone phones zaloConnected interactions')
      .lean();
    const customerMap = new Map(
      customers.map((customer) => [String(customer._id), customer]),
    );
    const drafts: any[] = await this.invoiceFollowUpDraftModel
      .find({
        isDeleted: false,
        date: {
          $gte: vietnamDateBoundary(q.date, false),
          $lte: vietnamDateBoundary(q.date, true),
        },
      })
      .sort({ createdAt: 1, _id: 1 })
      .lean();
    const book: any = await this.invoiceFollowUpBookModel
      .findOne({
        date: {
          $gte: vietnamDateBoundary(q.date, false),
          $lte: vietnamDateBoundary(q.date, true),
        },
      })
      .lean();
    const draftByDocument = new Map(
      drafts
        .filter((draft) => draft.documentId || draft.invoiceId)
        .map((draft) => [
          `${draft.documentType || 'INVOICE'}:${draft.documentId || draft.invoiceId}`,
          draft,
        ]),
    );
    const search = String(q.search || '')
      .trim()
      .toLowerCase();
    const now = Date.now();
    const invoiceData = invoices
      .map((invoice) => {
        const customer = customerMap.get(String(invoice.customerId));
        const tracking = draftByDocument.get(`INVOICE:${String(invoice._id)}`);
        const matching = (customer?.interactions || [])
          .filter((item: any) =>
            item.invoiceId
              ? String(item.invoiceId) === String(invoice._id)
              : item.invoiceCode === invoice.code,
          )
          .sort(
            (left: any, right: any) =>
              new Date(right.occurredAt || right.at || 0).getTime() -
              new Date(left.occurredAt || left.at || 0).getTime(),
          );
        const latest = matching[0] || null;
        const lastUpdatedAt =
          tracking?.lastUpdatedAt || latest?.occurredAt || latest?.at || null;
        const followUpAt = lastUpdatedAt
          ? new Date(new Date(lastUpdatedAt).getTime() + 24 * 60 * 60 * 1000)
          : null;
        const needsFollowUp =
          (tracking?.invoiceStatus || latest?.invoiceStatus) === 'SENT' &&
          !(tracking?.interaction || latest?.interaction) &&
          Boolean(followUpAt && followUpAt.getTime() <= now);
        return {
          id: String(invoice._id),
          documentType: 'INVOICE',
          documentId: String(invoice._id),
          documentCode: invoice.code,
          draftId: tracking?._id ? String(tracking._id) : '',
          customerSelectable: !customer,
          invoiceId: String(invoice._id),
          invoiceCode: invoice.code,
          invoiceDate: invoice.date,
          amount: invoice.grandTotal ?? invoice.totalAmount ?? 0,
          customerId:
            tracking?.customerId || (customer?._id ? String(customer._id) : ''),
          customerCode: tracking?.customerCode || customer?.code || '',
          customerName: tracking?.customerName || customer?.name || '',
          phone:
            tracking?.phone ||
            latest?.phone ||
            customer?.phone ||
            customer?.phones?.[0] ||
            invoice.customerPhone ||
            '',
          salespersonId: String(invoice.salespersonId || ''),
          salespersonCode: invoice.salespersonCode,
          salespersonName: invoice.salespersonName,
          zaloStatus:
            tracking?.zaloStatus ||
            latest?.zaloStatus ||
            (customer?.zaloConnected ? 'CONNECTED' : 'NOT_CONNECTED'),
          invoiceStatus:
            tracking?.invoiceStatus || latest?.invoiceStatus || 'NOT_SENT',
          interactionChannel: normalizeInteractionChannel(
            tracking?.interactionChannel || latest?.channel,
          ),
          interaction: tracking?.interaction || latest?.interaction || '',
          note: tracking?.note || latest?.note || '',
          lastUpdatedAt,
          followUpAt,
          needsFollowUp,
          historyCount: matching.length,
        };
      })
      .filter(Boolean);
    const mapOperationalDocuments = (documents: any[], documentType: string) =>
      documents.map((document) => {
        const customer = customerMap.get(String(document.customerId));
        const id = String(document._id);
        const tracking = draftByDocument.get(`${documentType}:${id}`);
        const matching = (customer?.interactions || [])
          .filter(
            (item: any) =>
              item.documentType === documentType &&
              (String(item.documentId || '') === id ||
                item.documentCode === document.code),
          )
          .sort(
            (left: any, right: any) =>
              new Date(right.occurredAt || right.at || 0).getTime() -
              new Date(left.occurredAt || left.at || 0).getTime(),
          );
        const latest = matching[0] || null;
        const lastUpdatedAt =
          tracking?.lastUpdatedAt || latest?.occurredAt || latest?.at || null;
        const followUpAt = lastUpdatedAt
          ? new Date(new Date(lastUpdatedAt).getTime() + 24 * 60 * 60 * 1000)
          : null;
        const invoiceStatus =
          tracking?.invoiceStatus || latest?.invoiceStatus || 'NOT_SENT';
        const interaction = tracking?.interaction || latest?.interaction || '';
        return {
          id,
          documentType,
          documentId: id,
          documentCode: document.code,
          draftId: tracking?._id ? String(tracking._id) : '',
          customerSelectable: !customer,
          invoiceId: '',
          invoiceCode: document.code,
          invoiceDate: document.date || document.createdAt,
          amount:
            documentType === 'DEBT_PAYMENT'
              ? Number(document.amount || 0)
              : Number(document.returnAmount || 0),
          customerId:
            tracking?.customerId || (customer?._id ? String(customer._id) : ''),
          customerCode:
            tracking?.customerCode ||
            customer?.code ||
            document.customerCode ||
            '',
          customerName:
            tracking?.customerName ||
            customer?.name ||
            document.customerName ||
            '',
          phone:
            tracking?.phone ||
            latest?.phone ||
            customer?.phone ||
            customer?.phones?.[0] ||
            document.customerPhone ||
            '',
          salespersonId: String(
            document.collectorId || document.createdBy || '',
          ),
          salespersonCode: document.collectorCode || '',
          salespersonName: document.collectorName || '',
          zaloStatus:
            tracking?.zaloStatus ||
            latest?.zaloStatus ||
            (customer?.zaloConnected ? 'CONNECTED' : 'NOT_CONNECTED'),
          invoiceStatus,
          interactionChannel: normalizeInteractionChannel(
            tracking?.interactionChannel || latest?.channel,
          ),
          interaction,
          note: tracking?.note || latest?.note || '',
          lastUpdatedAt,
          followUpAt,
          needsFollowUp:
            invoiceStatus === 'SENT' &&
            !interaction &&
            Boolean(followUpAt && followUpAt.getTime() <= now),
          historyCount: matching.length,
        };
      });
    const debtPaymentData = mapOperationalDocuments(
      debtPayments,
      'DEBT_PAYMENT',
    );
    const customerReturnData = mapOperationalDocuments(
      customerReturns,
      'CUSTOMER_RETURN',
    );
    const draftData = drafts
      .filter((draft) => !draft.documentId && !draft.invoiceId)
      .map((draft) => {
        const lastUpdatedAt =
          draft.lastUpdatedAt || draft.updatedAt || draft.createdAt;
        const followUpAt = lastUpdatedAt
          ? new Date(new Date(lastUpdatedAt).getTime() + 24 * 60 * 60 * 1000)
          : null;
        return {
          id: String(draft._id),
          draftId: String(draft._id),
          isTemporary: true,
          customerSelectable: true,
          invoiceId: '',
          invoiceCode: draft.invoiceCode || '',
          invoiceDate: draft.date,
          amount: 0,
          customerCode: draft.customerCode || '',
          customerId: draft.customerId || '',
          customerName: draft.customerName || '',
          phone: draft.phone || '',
          salespersonName: draft.salespersonName || '',
          zaloStatus: draft.zaloStatus || 'NOT_CONNECTED',
          invoiceStatus: draft.invoiceStatus || 'NOT_SENT',
          interactionChannel: normalizeInteractionChannel(
            draft.interactionChannel,
          ),
          interaction: draft.interaction || '',
          note: draft.note || '',
          lastUpdatedAt,
          followUpAt,
          needsFollowUp:
            draft.invoiceStatus === 'SENT' &&
            !draft.interaction &&
            Boolean(followUpAt && followUpAt.getTime() <= now),
          historyCount: 0,
        };
      });
    const data = [
      ...invoiceData,
      ...debtPaymentData,
      ...customerReturnData,
      ...draftData,
    ].filter((item: any) =>
      !search
        ? true
        : [
            item.customerCode,
            item.customerName,
            item.phone,
            item.invoiceCode,
            item.salespersonName,
          ]
            .join(' ')
            .toLowerCase()
            .includes(search),
    );
    return {
      data,
      book: book
        ? {
            isFinalized: Boolean(book.isFinalized),
            finalizedAt: book.finalizedAt,
            finalizedBy: book.finalizedBy,
          }
        : { isFinalized: false },
      summary: {
        total: data.length,
        sourceInvoiceCount: invoiceData.length,
        debtPaymentCount: debtPaymentData.length,
        customerReturnCount: customerReturnData.length,
        sourceDocumentCount:
          invoiceData.length +
          debtPaymentData.length +
          customerReturnData.length,
        trackedInvoiceCount: data.filter(
          (item: any) => item.documentId || item.invoiceId,
        ).length,
        manualCount: draftData.length,
        sent: data.filter((item: any) => item.invoiceStatus === 'SENT').length,
        notSent: data.filter((item: any) => item.invoiceStatus === 'NOT_SENT')
          .length,
        doNotSend: data.filter(
          (item: any) => item.invoiceStatus === 'DO_NOT_SEND',
        ).length,
        needsFollowUp: data.filter((item: any) => item.needsFollowUp).length,
      },
    };
  }

  async createInvoiceFollowUpDraft(
    dto: CreateInvoiceFollowUpDraftDto,
    actorId: string,
  ) {
    const date = vietnamDateBoundary(dto.date, false);
    const closed = await this.invoiceFollowUpBookModel.exists({
      date,
      isFinalized: true,
    });
    if (closed)
      throw new BadRequestException('Sổ theo dõi ngày này đã được chốt');
    const now = new Date();
    const values = {
      ...dto,
      documentType: dto.documentType || (dto.invoiceId ? 'INVOICE' : undefined),
      documentId: dto.documentId || dto.invoiceId,
      documentCode: dto.documentCode || dto.invoiceCode,
      date,
      customerName: dto.customerName?.trim() || '',
      customerCode: dto.customerCode?.trim(),
      invoiceCode: dto.invoiceCode?.trim(),
      phone: dto.phone?.trim(),
      note: dto.note?.trim(),
      interaction: dto.interaction?.trim(),
      updatedBy: actorId,
      lastUpdatedAt: now,
    };
    const documentType = dto.documentType || (dto.invoiceId ? 'INVOICE' : '');
    const documentId = dto.documentId || dto.invoiceId;
    if (documentType && documentId) {
      const dateFilter = {
        $gte: vietnamDateBoundary(dto.date, false),
        $lte: vietnamDateBoundary(dto.date, true),
      };
      const document =
        documentType === 'DEBT_PAYMENT'
          ? await this.debtPaymentModel.exists({
              _id: documentId,
              isDeleted: false,
              status: 'ACTIVE',
              date: dateFilter,
            })
          : documentType === 'CUSTOMER_RETURN'
            ? await this.customerReturnModel.exists({
                _id: documentId,
                isDeleted: false,
                status: 'COMPLETED',
                createdAt: dateFilter,
              })
            : await this.invoiceModel.exists({
                _id: documentId,
                isDeleted: false,
                status: { $ne: 'REVERSED' },
                date: dateFilter,
              });
      if (!document)
        throw new BadRequestException(
          'Chứng từ liên kết không tồn tại trong ngày đã chọn',
        );
      const draft = await this.invoiceFollowUpDraftModel.findOneAndUpdate(
        { documentType, documentId, isDeleted: false },
        { $set: values, $setOnInsert: { createdBy: actorId } },
        { new: true, upsert: true },
      );
      return { data: draft };
    }
    const draft = await this.invoiceFollowUpDraftModel.create({
      ...values,
      createdBy: actorId,
    });
    return { data: draft };
  }

  async updateInvoiceFollowUpDraft(
    id: string,
    dto: UpdateInvoiceFollowUpDraftDto,
    actorId: string,
  ) {
    const existing: any = await this.invoiceFollowUpDraftModel
      .findOne({ _id: id, isDeleted: false })
      .lean();
    if (!existing) throw new NotFoundException('Không tìm thấy dòng theo dõi');
    const bookDate = dto.date
      ? vietnamDateBoundary(dto.date, false)
      : new Date(existing.date);
    const closed = await this.invoiceFollowUpBookModel.exists({
      date: bookDate,
      isFinalized: true,
    });
    if (closed)
      throw new BadRequestException('Sổ theo dõi ngày này đã được chốt');
    const changes: any = {
      ...dto,
      updatedBy: actorId,
      lastUpdatedAt: new Date(),
    };
    if (dto.date) changes.date = vietnamDateBoundary(dto.date, false);
    for (const key of [
      'customerName',
      'customerCode',
      'invoiceCode',
      'phone',
      'note',
      'interaction',
    ])
      if (changes[key] !== undefined)
        changes[key] = String(changes[key]).trim();
    const draft = await this.invoiceFollowUpDraftModel.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: changes },
      { new: true },
    );
    if (!draft) throw new NotFoundException('Không tìm thấy dòng tạm');
    return { data: draft };
  }

  async removeInvoiceFollowUpDraft(id: string, actorId: string) {
    const existing: any = await this.invoiceFollowUpDraftModel
      .findOne({ _id: id, isDeleted: false })
      .lean();
    if (!existing) throw new NotFoundException('Không tìm thấy dòng tạm');
    const closed = await this.invoiceFollowUpBookModel.exists({
      date: existing.date,
      isFinalized: true,
    });
    if (closed)
      throw new BadRequestException('Sổ theo dõi ngày này đã được chốt');
    const draft = await this.invoiceFollowUpDraftModel.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId } },
      { new: true },
    );
    if (!draft) throw new NotFoundException('Không tìm thấy dòng tạm');
    return { data: { id, deleted: true } };
  }

  async finalizeDailyInvoiceFollowUps(
    q: DailyInvoiceFollowUpQueryDto,
    actorId: string,
  ) {
    const date = vietnamDateBoundary(q.date, false);
    const existing: any = await this.invoiceFollowUpBookModel
      .findOne({ date })
      .lean();
    if (existing?.isFinalized)
      return {
        data: {
          alreadyFinalized: true,
          finalizedAt: existing.finalizedAt,
          interactionCount: existing.interactionCount || 0,
        },
      };
    const result: any = await this.dailyInvoiceFollowUps(q);
    const rows = result.data.filter((row: any) => row.customerId);
    if (rows.length) {
      await this.model.bulkWrite(
        rows.map((row: any) => ({
          updateOne: {
            filter: { _id: row.customerId, isDeleted: false },
            update: {
              $push: {
                interactions: {
                  at: new Date(),
                  occurredAt: new Date(),
                  channel: normalizeInteractionChannel(row.interactionChannel),
                  action: 'Chốt sổ theo dõi gửi hóa đơn điện tử',
                  zaloStatus: row.zaloStatus,
                  invoiceStatus: row.invoiceStatus,
                  interaction: row.interaction || undefined,
                  phone: row.phone || undefined,
                  note: row.note || undefined,
                  invoiceId: row.invoiceId || undefined,
                  invoiceCode: row.invoiceCode || undefined,
                  documentType: row.documentType || undefined,
                  documentId: row.documentId || undefined,
                  documentCode:
                    row.documentCode || row.invoiceCode || undefined,
                  createdBy: actorId,
                },
              },
              ...(row.zaloStatus
                ? { $set: { zaloConnected: row.zaloStatus === 'CONNECTED' } }
                : {}),
            },
          },
        })),
      );
    }
    const finalizedAt = new Date();
    const book = await this.invoiceFollowUpBookModel.findOneAndUpdate(
      { date },
      {
        $set: {
          isFinalized: true,
          finalizedAt,
          finalizedBy: actorId,
          sourceInvoiceCount: result.summary.sourceDocumentCount,
          trackedInvoiceCount: result.summary.trackedInvoiceCount,
          interactionCount: rows.length,
        },
      },
      { new: true, upsert: true },
    );
    return { data: book };
  }

  async exportDailyInvoiceFollowUps(q: DailyInvoiceFollowUpQueryDto) {
    const result: any = await this.dailyInvoiceFollowUps(q);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Theo dõi hóa đơn');
    sheet.columns = [
      { header: 'MÃ KHÁCH HÀNG', key: 'customerCode', width: 18 },
      { header: 'TÊN KHÁCH HÀNG', key: 'customerName', width: 34 },
      { header: 'LOẠI CHỨNG TỪ', key: 'documentTypeLabel', width: 22 },
      { header: 'KB ZALO', key: 'zaloStatus', width: 18 },
      { header: 'HÓA ĐƠN', key: 'invoiceStatus', width: 16 },
      { header: 'MÃ HÓA ĐƠN', key: 'invoiceCode', width: 20 },
      { header: 'LOẠI TƯƠNG TÁC', key: 'interactionChannelLabel', width: 20 },
      { header: 'TƯƠNG TÁC', key: 'interaction', width: 24 },
      { header: 'SỐ ĐIỆN THOẠI', key: 'phone', width: 18 },
      { header: 'NOTE', key: 'note', width: 35 },
      { header: 'SALE', key: 'salespersonName', width: 24 },
      { header: 'NGÀY', key: 'invoiceDate', width: 18 },
      { header: 'CẦN CẬP NHẬT 24H', key: 'needsFollowUp', width: 20 },
    ];
    result.data.forEach((item: any) =>
      sheet.addRow({
        ...item,
        documentTypeLabel:
          item.documentType === 'DEBT_PAYMENT'
            ? 'THANH TOÁN CÔNG NỢ'
            : item.documentType === 'CUSTOMER_RETURN'
              ? 'HOÀN HÀNG TỪ KHÁCH'
              : item.documentType === 'INVOICE'
                ? 'HÓA ĐƠN BÁN HÀNG'
                : 'DÒNG TẠM',
        zaloStatus:
          item.zaloStatus === 'CONNECTED' ? 'ĐÃ KẾT BẠN' : 'CHƯA KẾT BẠN',
        invoiceStatus:
          item.invoiceStatus === 'SENT'
            ? 'ĐÃ GỬI'
            : item.invoiceStatus === 'DO_NOT_SEND'
              ? 'KHÔNG GỬI'
              : 'CHƯA GỬI',
        interactionChannelLabel:
          normalizeInteractionChannel(item.interactionChannel) === 'PHONE'
            ? 'GỌI ĐIỆN'
            : normalizeInteractionChannel(item.interactionChannel) === 'SMS'
              ? 'SMS'
              : 'ZALO',
        needsFollowUp: item.needsFollowUp ? 'CẦN CẬP NHẬT' : '',
      }),
    );
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF315F50' },
    };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'L1' };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async updateStoreProfile(
    id: string,
    dto: UpdateCustomerStoreProfileDto,
    actorId?: string,
  ) {
    await this.assertStoreProfileActor(actorId);
    const latitude = Number(dto.latitude);
    const longitude = Number(dto.longitude);
    const accuracy =
      dto.accuracy === undefined ? undefined : Number(dto.accuracy);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
      throw new BadRequestException('Vĩ độ phải nằm trong khoảng -90 đến 90');
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
      throw new BadRequestException(
        'Kinh độ phải nằm trong khoảng -180 đến 180',
      );
    if (accuracy !== undefined && (!Number.isFinite(accuracy) || accuracy < 0))
      throw new BadRequestException('Độ chính xác GPS không hợp lệ');
    if (!['GPS', 'MAP'].includes(dto.source))
      throw new BadRequestException('Nguồn vị trí phải là GPS hoặc MAP');
    if (dto.note && dto.note.length > 500)
      throw new BadRequestException('Ghi chú vị trí tối đa 500 ký tự');
    const capturedAt = dto.capturedAt ? new Date(dto.capturedAt) : new Date();
    if (Number.isNaN(capturedAt.getTime()))
      throw new BadRequestException('Thời gian ghi nhận vị trí không hợp lệ');
    const storeLocation = {
      latitude,
      longitude,
      accuracy,
      source: dto.source,
      note: dto.note?.trim() || undefined,
      capturedAt,
      capturedBy: actorId || undefined,
      geo: { type: 'Point', coordinates: [longitude, latitude] },
    };
    const customer = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: { storeLocation } },
      { new: true },
    );
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    return { data: customer };
  }

  private async assertStoreProfileActor(actorId?: string) {
    if (!actorId)
      throw new ForbiddenException('Không xác định được người thực hiện');
    const actor = await this.userModel.exists({
      _id: actorId,
      isDeleted: false,
      status: UserStatus.ACTIVE,
      role: { $in: [RoleEnum.ADMIN, RoleEnum.STAFF] },
    });
    if (!actor)
      throw new ForbiddenException(
        'Tài khoản không còn hoạt động hoặc không có quyền thao tác',
      );
  }

  async deleteStoreProfile(id: string, actorId?: string) {
    await this.assertStoreProfileActor(actorId);
    const customer = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $unset: { storeLocation: 1 } },
      { new: true },
    );
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    return { data: customer };
  }

  private configureCloudinary() {
    const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
    const api_key = process.env.CLOUDINARY_API_KEY;
    const api_secret = process.env.CLOUDINARY_API_SECRET;
    if (!cloud_name || !api_key || !api_secret)
      throw new BadRequestException(
        'Cloudinary chưa được cấu hình trên backend',
      );
    cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  }

  private uploadStorefrontBuffer(
    buffer: Buffer,
    folder: string,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          overwrite: false,
          transformation: [
            {
              width: 1600,
              height: 1600,
              crop: 'limit',
              quality: 'auto',
              fetch_format: 'auto',
            },
          ],
        },
        (error, result) =>
          error || !result
            ? reject(error || new Error('Cloudinary không trả kết quả upload'))
            : resolve(result),
      );
      stream.end(buffer);
    });
  }

  async uploadStorefrontImage(id: string, file: any, actorId?: string) {
    await this.assertStoreProfileActor(actorId);
    if (!file?.buffer)
      throw new BadRequestException('Vui lòng chọn ảnh bảng hiệu');
    if (file.size > 5 * 1024 * 1024)
      throw new BadRequestException('Ảnh bảng hiệu không được vượt quá 5 MB');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
      throw new BadRequestException('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP');
    const customer: any = await this.model
      .findOne({ _id: id, isDeleted: false })
      .select('code storefrontImage')
      .lean();
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    this.configureCloudinary();
    const uploaded = await this.uploadStorefrontBuffer(
      file.buffer,
      `customers/${customer.code || id}/storefront`,
    );
    const storefrontImage = {
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
      width: uploaded.width,
      height: uploaded.height,
      format: uploaded.format,
      bytes: uploaded.bytes,
      uploadedAt: new Date(),
      uploadedBy: actorId || undefined,
    };
    let updated: any;
    try {
      updated = await this.model.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { $set: { storefrontImage } },
        { new: true },
      );
      if (!updated) throw new NotFoundException('Không tìm thấy khách hàng');
    } catch (error) {
      await cloudinary.uploader
        .destroy(uploaded.public_id, { resource_type: 'image' })
        .catch(() => undefined);
      throw error;
    }
    const oldPublicId = customer.storefrontImage?.publicId;
    if (oldPublicId && oldPublicId !== uploaded.public_id)
      await cloudinary.uploader
        .destroy(oldPublicId, { resource_type: 'image' })
        .catch(() => undefined);
    return { data: updated };
  }

  async deleteStorefrontImage(id: string, actorId?: string) {
    await this.assertStoreProfileActor(actorId);
    const current: any = await this.model
      .findOne({ _id: id, isDeleted: false })
      .select('storefrontImage')
      .lean();
    if (!current) throw new NotFoundException('Không tìm thấy khách hàng');
    const customer = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $unset: { storefrontImage: 1 } },
      { new: true },
    );
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    const publicId = current.storefrontImage?.publicId;
    if (publicId) {
      try {
        this.configureCloudinary();
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
      } catch (error) {
        this.logger.warn(
          `Không thể cleanup ảnh Cloudinary ${publicId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return { data: customer };
  }

  async importInteractions(
    rows: ImportCustomerInteractionRowDto[],
    actorId?: string,
  ) {
    if (!Array.isArray(rows) || !rows.length)
      throw new BadRequestException('File import không có dữ liệu tương tác');
    if (rows.length > 10000)
      throw new BadRequestException(
        'Mỗi lần chỉ được import tối đa 10.000 dòng',
      );
    let imported = 0;
    let zaloUpdated = 0;
    let duplicatesSkipped = 0;
    const errors: Array<{
      row: number;
      message: string;
      data: ImportCustomerInteractionRowDto;
    }> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNumber = Number(row.rowNumber) || index + 2;
      try {
        const customerCode = String(row.customerCode || '')
          .trim()
          .toUpperCase()
          .replace(/\s+/g, '');
        if (!customerCode) throw new Error('Thiếu mã khách hàng');
        if (
          row.zaloStatus &&
          !['CONNECTED', 'NOT_CONNECTED'].includes(row.zaloStatus)
        )
          throw new Error('Tình trạng Zalo không hợp lệ');
        if (
          row.invoiceStatus &&
          !['SENT', 'NOT_SENT', 'DO_NOT_SEND'].includes(row.invoiceStatus)
        )
          throw new Error('Tình trạng gửi hóa đơn không hợp lệ');
        if (
          !row.zaloStatus &&
          !row.invoiceStatus &&
          !row.interaction?.trim() &&
          !row.note?.trim()
        )
          throw new Error('Dòng chưa có nội dung hoặc trạng thái tương tác');
        const occurredAt = parseBusinessDate(row.occurredAt, 'Ngày tương tác');
        const phone = normalizePhones(row.phone).join(', ');
        const importKey = buildCustomerInteractionImportKey(
          row,
          customerCode,
          occurredAt,
          phone,
        );
        const customer: any = await this.model
          .findOne({ code: customerCode, isDeleted: false })
          .select('_id zaloConnected interactions.importKey')
          .lean();
        if (!customer)
          throw new Error(`Không tìm thấy khách hàng ${customerCode}`);
        if (
          (customer.interactions || []).some(
            (item) => item.importKey === importKey,
          )
        ) {
          imported++;
          duplicatesSkipped++;
          continue;
        }
        const desiredZalo = row.zaloStatus
          ? row.zaloStatus === 'CONNECTED'
          : undefined;
        const interaction = {
          at: occurredAt,
          occurredAt,
          channel: 'IMPORT',
          action: row.interaction?.trim() || 'Cập nhật tình hình tương tác',
          result: row.note?.trim() || undefined,
          zaloStatus: row.zaloStatus,
          invoiceStatus: row.invoiceStatus,
          interaction: row.interaction?.trim() || undefined,
          phone: phone || undefined,
          note: row.note?.trim() || undefined,
          createdBy: actorId,
          importKey,
        };
        const update: any = { $push: { interactions: interaction } };
        if (desiredZalo !== undefined)
          update.$set = { zaloConnected: desiredZalo };
        const updated = await this.model.findOneAndUpdate(
          {
            _id: customer._id,
            isDeleted: false,
            'interactions.importKey': { $ne: importKey },
          },
          update,
          { new: true },
        );
        if (!updated) {
          imported++;
          duplicatesSkipped++;
          continue;
        }
        imported++;
        if (
          desiredZalo !== undefined &&
          Boolean(customer.zaloConnected) !== desiredZalo
        )
          zaloUpdated++;
      } catch (error) {
        errors.push({
          row: rowNumber,
          message:
            error instanceof Error
              ? error.message
              : 'Không thể import tương tác',
          data: row,
        });
      }
    }
    return {
      data: {
        totalRows: rows.length,
        imported,
        zaloUpdated,
        failed: errors.length,
        duplicatesSkipped,
        errors,
      },
    };
  }

  async exportInteractions() {
    const customers: any[] = await this.model
      .find({ isDeleted: false, 'interactions.0': { $exists: true } })
      .select('code name phone interactions')
      .sort({ code: 1 })
      .lean();
    const rows = customers
      .flatMap((customer) =>
        (customer.interactions || []).map((interaction) => ({
          customerCode: customer.code,
          customerName: customer.name,
          zaloStatus: interaction.zaloStatus,
          invoiceStatus: interaction.invoiceStatus,
          interaction: interaction.interaction || interaction.action || '',
          phone: interaction.phone || customer.phone || '',
          note: interaction.note || interaction.result || '',
          occurredAt: interaction.occurredAt || interaction.at,
        })),
      )
      .sort(
        (left, right) =>
          +new Date(right.occurredAt) - +new Date(left.occurredAt),
      );
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Tương tác khách hàng');
    sheet.columns = [
      { header: 'MÃ KHÁCH HÀNG', key: 'customerCode', width: 18 },
      { header: 'TÊN KHÁCH HÀNG', key: 'customerName', width: 30 },
      { header: 'TÌNH TRẠNG ZALO', key: 'zaloStatus', width: 22 },
      { header: 'TÌNH TRẠNG HOÁ ĐƠN', key: 'invoiceStatus', width: 22 },
      { header: 'TƯƠNG TÁC', key: 'interaction', width: 34 },
      { header: '#', key: 'separator', width: 5 },
      { header: 'SỐ ĐIỆN THOẠI', key: 'phone', width: 20 },
      { header: 'NOTE', key: 'note', width: 34 },
      { header: 'NGÀY', key: 'occurredAt', width: 16 },
    ];
    for (const row of rows)
      sheet.addRow({
        ...row,
        zaloStatus:
          row.zaloStatus === 'CONNECTED'
            ? 'ĐÃ KẾT BẠN'
            : row.zaloStatus === 'NOT_CONNECTED'
              ? 'CHƯA KẾT BẠN'
              : '',
        invoiceStatus:
          row.invoiceStatus === 'SENT'
            ? 'ĐÃ GỬI'
            : row.invoiceStatus === 'DO_NOT_SEND'
              ? 'KHÔNG GỬI'
              : row.invoiceStatus === 'NOT_SENT'
                ? 'CHƯA GỬI'
                : '',
        occurredAt: row.occurredAt ? new Date(row.occurredAt) : null,
      });
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'I1' };
    sheet.getColumn('phone').numFmt = '@';
    sheet.getColumn('occurredAt').numFmt = 'dd/mm/yyyy';
    (sheet as any).dataValidations.add('C2:C10001', {
      type: 'list',
      allowBlank: true,
      formulae: ['"ĐÃ KẾT BẠN,CHƯA KẾT BẠN"'],
    });
    (sheet as any).dataValidations.add('D2:D10001', {
      type: 'list',
      allowBlank: true,
      formulae: ['"ĐÃ GỬI,CHƯA GỬI,KHÔNG GỬI"'],
    });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async debtHistory(customerId: string, query: CustomerDebtHistoryQueryDto) {
    const customer: any = await this.model
      .findOne({ _id: customerId, isDeleted: false })
      .select('debt debtLimit')
      .lean();
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const filter: any = { customerId, isDeleted: false };
    if (query.type) filter.type = query.type;
    if (query.from || query.to) {
      filter.occurredAt = {};
      if (query.from)
        filter.occurredAt.$gte = vietnamDateBoundary(query.from, false);
      if (query.to)
        filter.occurredAt.$lte = vietnamDateBoundary(query.to, true);
    }
    const [rows, total, highest] = await Promise.all([
      this.debtLedgerModel
        .find(filter)
        .sort({ occurredAt: -1, createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.debtLedgerModel.countDocuments(filter),
      this.debtLedgerModel
        .findOne({ customerId, isDeleted: false })
        .sort({ balanceAfter: -1 })
        .select('balanceAfter')
        .lean(),
    ]);
    const actorIds = [
      ...new Set(rows.map((row: any) => row.createdBy).filter(Boolean)),
    ];
    const actors: any[] = actorIds.length
      ? await this.userModel
          .find({ _id: { $in: actorIds } })
          .select('employeeCode fullName username')
          .lean()
      : [];
    const actorMap = new Map(
      actors.map((actor) => [
        String(actor._id),
        {
          id: String(actor._id),
          employeeCode: actor.employeeCode,
          name: actor.fullName || actor.username,
        },
      ]),
    );
    return {
      data: rows.map((row: any) => ({
        ...row,
        id: String(row._id),
        effectiveAt: row.effectiveAt || row.occurredAt,
        previousDebt:
          row.previousDebt ??
          Math.max(
            0,
            row.direction === DebtLedgerDirection.INCREASE
              ? row.balanceAfter - row.amount
              : row.balanceAfter + row.amount,
          ),
        increaseAmount:
          row.increaseAmount ??
          (row.direction === DebtLedgerDirection.INCREASE ? row.amount : 0),
        decreaseAmount:
          row.decreaseAmount ??
          (row.direction === DebtLedgerDirection.DECREASE ? row.amount : 0),
        actor: row.createdBy
          ? actorMap.get(String(row.createdBy)) || { id: String(row.createdBy) }
          : null,
      })),
      summary: {
        currentDebt: customer.debt || 0,
        currentDebtLimit: customer.debtLimit || 0,
        highestDebt: Math.max(
          customer.debt || 0,
          Number((highest as any)?.balanceAfter || 0),
        ),
      },
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async debtHistoryChart(
    customerId: string,
    query: CustomerDebtHistoryQueryDto,
  ) {
    if (!(await this.model.exists({ _id: customerId, isDeleted: false })))
      throw new NotFoundException('Không tìm thấy khách hàng');
    const filter: any = { customerId, isDeleted: false };
    if (query.type) filter.type = query.type;
    if (query.from || query.to) {
      filter.occurredAt = {};
      if (query.from)
        filter.occurredAt.$gte = vietnamDateBoundary(query.from, false);
      if (query.to)
        filter.occurredAt.$lte = vietnamDateBoundary(query.to, true);
    }
    const rows: any[] = await this.debtLedgerModel
      .find(filter)
      .sort({ occurredAt: 1, createdAt: 1, _id: 1 })
      .select('effectiveAt occurredAt balanceAfter')
      .lean();
    return {
      data: rows.map((row) => ({
        date: (row.effectiveAt || row.occurredAt).toISOString().slice(0, 10),
        debt: row.balanceAfter,
      })),
    };
  }

  async importRows(
    rows: Record<string, unknown>[],
    actorId?: string,
  ): Promise<any> {
    if (!Array.isArray(rows) || !rows.length)
      throw new BadRequestException('File import không có dữ liệu');
    if (rows.length > 10000)
      throw new BadRequestException(
        'Mỗi lần chỉ được import tối đa 10.000 dòng',
      );
    let created = 0;
    let updated = 0;
    let debtLedgersCreated = 0;
    let duplicatePhonesAccepted = 0;
    const errors: Array<{
      row: number;
      message: string;
      data: Record<string, unknown>;
    }> = [];
    for (let index = 0; index < rows.length; index++) {
      const original = rows[index];
      try {
        const row = normalizeExcelRow(original);
        const code = String(
          excelValue(row, ['Mã khách hàng', 'Mã KH', 'customerCode', 'code']),
        )
          .trim()
          .toUpperCase()
          .replace(/\s+/g, '');
        const name = String(
          excelValue(row, ['Tên khách hàng', 'Tên', 'name']),
        ).trim();
        const phones = normalizePhones(
          excelValue(row, [
            'Số điện thoại',
            'SĐT',
            'Điện thoại',
            'phone',
            'phone number',
          ]),
        );
        const phone = phones.join(', ') || undefined;
        if (!code) throw new Error('Thiếu mã khách hàng');
        if (!name) throw new Error('Thiếu tên khách hàng');
        const source =
          SOURCE_ALIASES[aliasKey(excelValue(row, ['Nguồn', 'source']))];
        const segment =
          SEGMENT_ALIASES[aliasKey(excelValue(row, ['Phân loại', 'segment']))];
        const rawDebt = excelValue(row, ['Công nợ', 'debt'], null);
        const rawDebtLimit = excelValue(
          row,
          ['Hạn mức công nợ', 'debtLimit'],
          null,
        );
        const importedDebt =
          rawDebt === null ? undefined : Math.max(0, excelNumber(rawDebt));
        const importedDebtLimit =
          rawDebtLimit === null
            ? undefined
            : Math.max(0, excelNumber(rawDebtLimit));
        const rawEffectiveAt = excelValue(
          row,
          ['Ngày công nợ', 'Ngày hiệu lực', 'effectiveAt'],
          null,
        );
        const effectiveAt = this.importDate(rawEffectiveAt);
        const payload: any = {
          name,
          phone,
          phones,
          email:
            String(excelValue(row, ['Email', 'email'])).trim() || undefined,
          address:
            String(excelValue(row, ['Địa chỉ', 'address'])).trim() || undefined,
          zaloConnected: excelBoolean(
            excelValue(row, ['Đã kết bạn Zalo', 'Zalo', 'zaloConnected']),
          ),
          note:
            String(excelValue(row, ['Ghi chú', 'note'])).trim() || undefined,
        };
        if (source) payload.source = source;
        if (segment) payload.segment = segment;
        const session = await this.connection.startSession();
        let rowCreated = false;
        let rowLedgerCreated = false;
        let rowDuplicatePhone = false;
        try {
          await session.withTransaction(async () => {
            const existing: any = await this.model
              .findOne({ code, isDeleted: false })
              .session(session)
              .lean();
            const duplicatePhone = phones.length
              ? await this.model
                  .exists({
                    isDeleted: false,
                    code: { $ne: code },
                    phones: { $in: phones },
                  })
                  .session(session)
              : null;
            rowDuplicatePhone = Boolean(duplicatePhone);
            const previousDebt = Number(existing?.debt || 0);
            const previousDebtLimit = Number(existing?.debtLimit || 0);
            const debtAfter = importedDebt ?? previousDebt;
            const debtLimitAfter = importedDebtLimit ?? previousDebtLimit;
            const setPayload = {
              ...payload,
              codeStatus: CustomerCodeStatus.ASSIGNED,
              ...(importedDebt !== undefined ? { debt: debtAfter } : {}),
              ...(importedDebtLimit !== undefined
                ? { debtLimit: debtLimitAfter }
                : {}),
            };
            let customer: any;
            if (existing)
              customer = await this.model.findOneAndUpdate(
                { _id: existing._id },
                { $set: setPayload },
                { new: true, session },
              );
            else {
              customer = (
                await this.model.create(
                  [
                    {
                      ...setPayload,
                      code,
                      debt: debtAfter,
                      debtLimit: debtLimitAfter,
                    },
                  ],
                  { session },
                )
              )[0];
              rowCreated = true;
            }
            const changed =
              debtAfter !== previousDebt ||
              debtLimitAfter !== previousDebtLimit;
            if (changed) {
              const delta = debtAfter - previousDebt;
              await this.debtLedgerModel.create(
                [
                  {
                    customerId: customer._id,
                    customerCode: code,
                    type: existing
                      ? DebtLedgerType.IMPORT_ADJUSTMENT
                      : DebtLedgerType.OPENING_BALANCE,
                    direction:
                      delta >= 0
                        ? DebtLedgerDirection.INCREASE
                        : DebtLedgerDirection.DECREASE,
                    amount: Math.abs(delta),
                    previousDebt,
                    increaseAmount: Math.max(0, delta),
                    decreaseAmount: Math.max(0, -delta),
                    balanceAfter: debtAfter,
                    previousDebtLimit,
                    debtLimitAfter,
                    occurredAt: effectiveAt,
                    effectiveAt,
                    referenceType: 'CUSTOMER_IMPORT',
                    referenceId: `ROW_${index + 2}`,
                    createdBy: actorId,
                    note: existing
                      ? 'Điều chỉnh từ file import'
                      : 'Công nợ đầu kỳ từ file import',
                  },
                ],
                { session },
              );
              rowLedgerCreated = true;
            }
            const match = code.match(/^KH(\d+)$/);
            if (match)
              await this.counterModel.updateOne(
                { key: 'CUSTOMER_CODE' },
                { $max: { sequence: Number(match[1]) } },
                { upsert: true, session },
              );
          });
          created += rowCreated ? 1 : 0;
          updated += rowCreated ? 0 : 1;
          debtLedgersCreated += rowLedgerCreated ? 1 : 0;
          duplicatePhonesAccepted += rowDuplicatePhone ? 1 : 0;
        } finally {
          await session.endSession();
        }
      } catch (error) {
        errors.push({
          row: index + 2,
          message:
            error instanceof Error ? error.message : 'Không thể lưu khách hàng',
          data: original,
        });
      }
    }
    return {
      data: {
        totalRows: rows.length,
        created,
        updated,
        failed: errors.length,
        debtLedgersCreated,
        duplicatePhonesAccepted,
        errors,
      },
    };
  }

  async exportExcel(): Promise<Buffer> {
    const customers = await this.model
      .find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .lean();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Khach hang');
    sheet.columns = [
      { header: 'Mã khách hàng', key: 'code', width: 18 },
      { header: 'Tên khách hàng', key: 'name', width: 30 },
      { header: 'Số điện thoại', key: 'phone', width: 18 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Địa chỉ', key: 'address', width: 32 },
      { header: 'Nguồn', key: 'source', width: 14 },
      { header: 'Phân loại', key: 'segment', width: 18 },
      { header: 'Đã kết bạn Zalo', key: 'zaloConnected', width: 20 },
      { header: 'Công nợ', key: 'debt', width: 16 },
      { header: 'Hạn mức công nợ', key: 'debtLimit', width: 20 },
      { header: 'Ghi chú', key: 'note', width: 32 },
    ];
    customers.forEach((item: any) =>
      sheet.addRow({
        ...item,
        zaloConnected: item.zaloConnected ? 'Có' : 'Không',
      }),
    );
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'K1' };
    sheet.getColumn('phone').numFmt = '@';
    sheet.getColumn('debt').numFmt = '#,##0';
    sheet.getColumn('debtLimit').numFmt = '#,##0';
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
