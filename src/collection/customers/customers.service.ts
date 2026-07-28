import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { getConnectionToken, InjectModel } from 'nestjs-typegoose';
import { Connection } from 'mongoose';
import { CustomerCodeStatus, CustomerCounters, Customers } from './schemas/customers.schema';
import { CreateCustomerDto, CreateInteractionDto, CustomerDebtHistoryQueryDto, CustomerQueryDto, UpdateCustomerDto, UpdateCustomerStoreProfileDto } from './dtos/customers.dto';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { Vouchers } from '../promotions/schemas/promotions.schema';
import * as ExcelJS from 'exceljs';
import { excelBoolean, excelNumber, excelValue, normalizeExcelRow } from '../../core/excel-import';
import { CustomerSegment, CustomerSource } from './schemas/customers.schema';
import { CustomerDebtLedger, DebtLedgerDirection, DebtLedgerType } from '../debt-payments/schemas/customer-debt-ledger.schema';
import { vietnamDateBoundary } from '../trucks/truck-transfer-date';
import { Users, UserStatus } from '../users/schemas/users.schema';
import { createHash } from 'crypto';
import { ImportCustomerInteractionRowDto } from './dtos/customers.dto';
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';
import { RoleEnum } from '../users/interfaces/role.enum';

export function normalizePhones(value?: unknown): string[] {
  return String(value ?? '').split(/[,;|/]+/).map((phone) => phone.replace(/\D/g, '')).filter(Boolean).map((phone) => phone.startsWith('0') ? phone : `0${phone}`).filter((phone, index, values) => values.indexOf(phone) === index);
}

const SOURCE_LABELS: Record<CustomerSource, string> = { LEAD: 'Khách lead', LEGACY: 'Khách cũ', NEW: 'Khách mới' };
const SEGMENT_LABELS: Record<CustomerSegment, string> = { TEMPORARILY_INACTIVE: 'Tạm ngừng hoạt động', ACTIVE: 'Đang hoạt động', HIGHLY_ACTIVE: 'Hoạt động tốt', STOPPED_BUYING: 'Ngừng mua hàng', CHURNED: 'Khách rời đi', NEW_CUSTOMER: 'Khách mới' };
function aliasKey(value: unknown) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'D').trim().toUpperCase().replace(/\s+/g, ' '); }
const SOURCE_ALIASES: Record<string, CustomerSource> = { LEAD: CustomerSource.LEAD, LEGACY: CustomerSource.LEGACY, 'KHACH CU': CustomerSource.LEGACY, NEW: CustomerSource.NEW, 'KHACH MOI': CustomerSource.NEW };
const SEGMENT_ALIASES: Record<string, CustomerSegment> = { TEMPORARILY_INACTIVE: CustomerSegment.TEMPORARILY_INACTIVE, 'NGU QUEN 31-89 NGAY': CustomerSegment.TEMPORARILY_INACTIVE, ACTIVE: CustomerSegment.ACTIVE, 'DANG HOAT DONG': CustomerSegment.ACTIVE, HIGHLY_ACTIVE: CustomerSegment.HIGHLY_ACTIVE, 'THUONG XUYEN': CustomerSegment.HIGHLY_ACTIVE, STOPPED_BUYING: CustomerSegment.STOPPED_BUYING, '90-179 NGAY CHUA PS': CustomerSegment.STOPPED_BUYING, CHURNED: CustomerSegment.CHURNED, 'KHACH CHET >=180 NGAY': CustomerSegment.CHURNED, NEW_CUSTOMER: CustomerSegment.NEW_CUSTOMER, 'CHUA PHAT SINH DON': CustomerSegment.NEW_CUSTOMER, VIP: CustomerSegment.HIGHLY_ACTIVE, 'THAN THIET': CustomerSegment.HIGHLY_ACTIVE, 'TIEM NANG': CustomerSegment.ACTIVE, 'DAI LY': CustomerSegment.ACTIVE, THUONG: CustomerSegment.ACTIVE };

export function buildCustomerInteractionImportKey(row: ImportCustomerInteractionRowDto, code: string, occurredAt: Date, phone: string) {
  return createHash('sha256').update(JSON.stringify([
    row.rowNumber || 0, code, occurredAt.toISOString(), row.zaloStatus || '',
    row.invoiceStatus || '', row.interaction?.trim() || '', phone, row.note?.trim() || '',
  ])).digest('hex');
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
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectModel(Customers) private readonly model: ReturnModelType<typeof Customers>,
    @InjectModel(CustomerCounters) private readonly counterModel: ReturnModelType<typeof CustomerCounters>,
    @InjectModel(Invoices) private readonly invoiceModel: ReturnModelType<typeof Invoices>,
    @InjectModel(Vouchers) private readonly voucherModel: ReturnModelType<typeof Vouchers>,
    @InjectModel(CustomerDebtLedger) private readonly debtLedgerModel: ReturnModelType<typeof CustomerDebtLedger>,
    @InjectModel(Users) private readonly userModel: ReturnModelType<typeof Users>,
    @Inject(getConnectionToken()) private readonly connection: Connection,
  ) {}

  private page(value: string | undefined, fallback: number, max?: number) {
    const n = Number(value || fallback);
    if (!Number.isInteger(n) || n < 1 || (max && n > max)) throw new BadRequestException('Tham số phân trang không hợp lệ');
    return n;
  }

  private importDate(value: unknown) {
    if (value === null || value === undefined || value === '') return new Date();
    const date = typeof value === 'number' ? new Date((value - 25569) * 86400000) : new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Ngày hiệu lực công nợ không hợp lệ');
    return date;
  }

  private async nextCode() {
    for (;;) {
      const counter: any = await this.counterModel.findOneAndUpdate({ key: 'CUSTOMER_CODE' }, { $inc: { sequence: 1 } }, { upsert: true, new: true });
      const code = `KH${String(counter.sequence).padStart(3, '0')}`;
      if (!await this.model.exists({ code })) return code;
    }
  }

  async create(dto: CreateCustomerDto) {
    const phones = normalizePhones(dto.phone); const phone = phones.join(', ') || undefined;
    return { data: await this.model.create({ ...dto, phone, phones, name: dto.name.trim(), code: await this.nextCode(), codeStatus: CustomerCodeStatus.ASSIGNED }) };
  }

  async updateCode(id: string, codeValue: string, reasonValue: string, actorId?: string) {
    await this.assertAdminActor(actorId);
    const code = String(codeValue || '').trim().toUpperCase().replace(/\s+/g, '');
    const reason = String(reasonValue || '').trim();
    if (!code) throw new BadRequestException('Mã khách hàng không được để trống');
    if (!reason) throw new BadRequestException('Phải nhập lý do cấp hoặc đổi mã');
    const existing = await this.model.exists({ _id: { $ne: id }, code, isDeleted: false });
    if (existing) throw new ConflictException({ code: 'CUSTOMER_CODE_ALREADY_EXISTS', message: 'Mã khách hàng đã thuộc khách hàng khác' });
    const current: any = await this.model.findOne({ _id: id, isDeleted: false }).select('code').lean();
    if (!current) throw new NotFoundException('Không tìm thấy khách hàng');
    let customer: any;
    try {
      customer = await this.model.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { $set: { code, codeStatus: CustomerCodeStatus.ASSIGNED }, $push: { codeHistory: { oldCode: current.code, newCode: code, changedBy: actorId, changedAt: new Date(), reason } } },
        { new: true },
      );
    } catch (error: any) {
      if (error?.code === 11000) throw new ConflictException({ code: 'CUSTOMER_CODE_ALREADY_EXISTS', message: 'Mã khách hàng đã thuộc khách hàng khác' });
      throw error;
    }
    const match = /^KH(\d+)$/.exec(code);
    if (match) await this.counterModel.updateOne({ key: 'CUSTOMER_CODE' }, { $max: { sequence: Number(match[1]) }, $setOnInsert: { key: 'CUSTOMER_CODE' } }, { upsert: true });
    return { data: customer };
  }

  async deleteCustomer(id: string, reasonValue: string, actorId?: string) {
    await this.assertAdminActor(actorId);
    const reason = String(reasonValue || '').trim();
    if (!reason) throw new BadRequestException('Phải nhập lý do xóa khách hàng');
    const customer: any = await this.model.findOne({ _id: id, isDeleted: false }).select('debt').lean();
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    if (Number(customer.debt || 0) > 0) throw new ConflictException({ code: 'CUSTOMER_HAS_OUTSTANDING_DEBT', message: 'Không thể xóa khách hàng còn công nợ' });
    const deleted = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false, debt: { $lte: 0 } },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId, deleteReason: reason } },
      { new: true },
    );
    if (!deleted) throw new ConflictException({ code: 'CUSTOMER_STATE_CHANGED', message: 'Trạng thái khách hàng vừa thay đổi, vui lòng thử lại' });
    return { data: deleted };
  }

  private async assertAdminActor(actorId?: string) {
    if (!actorId) throw new ForbiddenException('Không xác định được người thực hiện');
    const actor = await this.userModel.exists({ _id: actorId, isDeleted: false, status: UserStatus.ACTIVE, role: RoleEnum.ADMIN });
    if (!actor) throw new ForbiddenException('Chỉ quản trị viên đang hoạt động được thực hiện thao tác này');
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const payload: any = { ...dto };
    if (dto.phone !== undefined) {
      const phones = normalizePhones(dto.phone); payload.phones = phones; payload.phone = phones.join(', ') || undefined;
    }
    if (dto.name !== undefined) payload.name = dto.name.trim();
    const update: any = { $set: payload };
    if (dto.phone !== undefined && !payload.phone) { delete payload.phone; update.$unset = { phone: 1 }; }
    const customer = await this.model.findOneAndUpdate({ _id: id, isDeleted: false }, update, { new: true });
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    return { data: customer };
  }

  async findAll(query: CustomerQueryDto): Promise<any> {
    const page = this.page(query.page, 1); const limit = this.page(query.limit, 20, 100);
    const filter: any = { isDeleted: false };
    if (query.search?.trim()) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = ['code', 'name', 'phone', 'phones'].map((field) => ({ [field]: { $regex: escaped, $options: 'i' } }));
    }
    if (query.source) filter.source = query.source;
    if (query.segment) filter.segment = query.segment;
    if (query.zaloConnected === 'true' || query.zaloConnected === 'false') filter.zaloConnected = query.zaloConnected === 'true';
    const expressions: any[] = [];
    if (query.hasDebt === true || String(query.hasDebt) === 'true') expressions.push({ $gt: [{ $ifNull: ['$debt', 0] }, 0] });
    if (query.debtWarning === true || String(query.debtWarning) === 'true') expressions.push({ $and: [{ $gt: [{ $ifNull: ['$debtLimit', 0] }, 0] }, { $gte: [{ $ifNull: ['$debt', 0] }, { $ifNull: ['$debtLimit', 0] }] }] });
    if (expressions.length === 1) filter.$expr = expressions[0];
    else if (expressions.length > 1) filter.$expr = { $and: expressions };
    const [data, totalItems] = await Promise.all([
      this.model.find(filter).select('code codeStatus name phone phones email address source segment zaloConnected debt debtLimit note createdAt updatedAt storeLocation.latitude storeLocation.longitude storefrontImage.url').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);
    return {
      data: data.map((customer: any) => ({ ...customer, id: String(customer._id), ...customerStoreProfileFlags(customer), sourceLabel: SOURCE_LABELS[customer.source], segmentLabel: SEGMENT_LABELS[customer.segment], availableDebtLimit: customer.debtLimit > 0 ? Math.max(0, customer.debtLimit - (customer.debt || 0)) : 0, debtWarning: (customer.debtLimit || 0) > 0 && (customer.debt || 0) >= customer.debtLimit })),
      meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  async summary() {
    const rows = await this.model.find({ isDeleted: false }).select('zaloConnected source debt debtLimit').lean();
    return { data: {
      totalCustomers: rows.length,
      zaloConnected: rows.filter((x) => x.zaloConnected).length,
      leads: rows.filter((x) => x.source === 'LEAD').length,
      debtWarnings: rows.filter((x) => (x.debtLimit || 0) > 0 && (x.debt || 0) >= x.debtLimit).length,
      totalDebt: rows.reduce((sum, x) => sum + (x.debt || 0), 0),
    } };
  }

  async findOne(id: string) {
    const customer: any = await this.model.findOne({ _id: id, isDeleted: false }).lean();
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    const [invoices, vouchers] = await Promise.all([
      this.invoiceModel.find({ customerId: id, isDeleted: false }).sort({ date: -1, createdAt: -1, _id: -1 }).lean(),
      this.voucherModel.find({ customerId: id, isDeleted: false }).populate('promotionId', 'name discountType discountValue').sort({ createdAt: -1, _id: -1 }).lean(),
    ]);
    const totalSpent = invoices.reduce((sum, item) => sum + (item.totalAmount || 0), 0);
    return { data: {
      ...customer,
      id: String(customer._id),
      sourceLabel: SOURCE_LABELS[customer.source], segmentLabel: SEGMENT_LABELS[customer.segment],
      totalSpent,
      orderCount: invoices.length,
      lastOrderAt: invoices[0]?.date || null,
      invoices: invoices.map((x: any) => ({ id: String(x._id), code: x.code, date: x.date, total: x.totalAmount, paid: x.paidAmount || 0, status: x.paymentStatus || 'UNPAID' })),
      vouchers: vouchers.map((x: any) => ({ id: String(x._id), code: x.code, campaign: x.promotionId?.name, benefit: x.promotionId?.discountType === 'PERCENT' ? `Giảm ${x.promotionId.discountValue}%` : `Giảm ${x.promotionId?.discountValue || 0}đ`, expiresAt: x.expiresAt, status: x.status })),
      interactions: (customer.interactions || []).slice().reverse().map((x) => ({ ...x, id: String(x._id) })),
    } };
  }

  async addInteraction(id: string, dto: CreateInteractionDto) {
    const customer = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $push: { interactions: { ...dto, at: new Date() } } },
      { new: true },
    );
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    return { data: customer.interactions[customer.interactions.length - 1] };
  }

  async updateStoreProfile(id: string, dto: UpdateCustomerStoreProfileDto, actorId?: string) {
    await this.assertStoreProfileActor(actorId);
    const latitude = Number(dto.latitude); const longitude = Number(dto.longitude);
    const accuracy = dto.accuracy === undefined ? undefined : Number(dto.accuracy);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new BadRequestException('Vĩ độ phải nằm trong khoảng -90 đến 90');
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new BadRequestException('Kinh độ phải nằm trong khoảng -180 đến 180');
    if (accuracy !== undefined && (!Number.isFinite(accuracy) || accuracy < 0)) throw new BadRequestException('Độ chính xác GPS không hợp lệ');
    if (!['GPS', 'MAP'].includes(dto.source)) throw new BadRequestException('Nguồn vị trí phải là GPS hoặc MAP');
    if (dto.note && dto.note.length > 500) throw new BadRequestException('Ghi chú vị trí tối đa 500 ký tự');
    const capturedAt = dto.capturedAt ? new Date(dto.capturedAt) : new Date();
    if (Number.isNaN(capturedAt.getTime())) throw new BadRequestException('Thời gian ghi nhận vị trí không hợp lệ');
    const storeLocation = {
      latitude, longitude, accuracy, source: dto.source,
      note: dto.note?.trim() || undefined, capturedAt, capturedBy: actorId || undefined,
      geo: { type: 'Point', coordinates: [longitude, latitude] },
    };
    const customer = await this.model.findOneAndUpdate({ _id: id, isDeleted: false }, { $set: { storeLocation } }, { new: true });
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    return { data: customer };
  }

  private async assertStoreProfileActor(actorId?: string) {
    if (!actorId) throw new ForbiddenException('Không xác định được người thực hiện');
    const actor = await this.userModel.exists({
      _id: actorId,
      isDeleted: false,
      status: UserStatus.ACTIVE,
      role: { $in: [RoleEnum.ADMIN, RoleEnum.STAFF] },
    });
    if (!actor) throw new ForbiddenException('Tài khoản không còn hoạt động hoặc không có quyền thao tác');
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
    const cloud_name = process.env.CLOUDINARY_CLOUD_NAME; const api_key = process.env.CLOUDINARY_API_KEY; const api_secret = process.env.CLOUDINARY_API_SECRET;
    if (!cloud_name || !api_key || !api_secret) throw new BadRequestException('Cloudinary chưa được cấu hình trên backend');
    cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  }

  private uploadStorefrontBuffer(buffer: Buffer, folder: string): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        folder, resource_type: 'image', overwrite: false,
        transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
      }, (error, result) => error || !result ? reject(error || new Error('Cloudinary không trả kết quả upload')) : resolve(result));
      stream.end(buffer);
    });
  }

  async uploadStorefrontImage(id: string, file: any, actorId?: string) {
    await this.assertStoreProfileActor(actorId);
    if (!file?.buffer) throw new BadRequestException('Vui lòng chọn ảnh bảng hiệu');
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException('Ảnh bảng hiệu không được vượt quá 5 MB');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) throw new BadRequestException('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP');
    const customer: any = await this.model.findOne({ _id: id, isDeleted: false }).select('code storefrontImage').lean();
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    this.configureCloudinary();
    const uploaded = await this.uploadStorefrontBuffer(file.buffer, `customers/${customer.code || id}/storefront`);
    const storefrontImage = {
      url: uploaded.secure_url, publicId: uploaded.public_id, width: uploaded.width,
      height: uploaded.height, format: uploaded.format, bytes: uploaded.bytes,
      uploadedAt: new Date(), uploadedBy: actorId || undefined,
    };
    let updated: any;
    try {
      updated = await this.model.findOneAndUpdate({ _id: id, isDeleted: false }, { $set: { storefrontImage } }, { new: true });
      if (!updated) throw new NotFoundException('Không tìm thấy khách hàng');
    } catch (error) {
      await cloudinary.uploader.destroy(uploaded.public_id, { resource_type: 'image' }).catch(() => undefined);
      throw error;
    }
    const oldPublicId = customer.storefrontImage?.publicId;
    if (oldPublicId && oldPublicId !== uploaded.public_id) await cloudinary.uploader.destroy(oldPublicId, { resource_type: 'image' }).catch(() => undefined);
    return { data: updated };
  }

  async deleteStorefrontImage(id: string, actorId?: string) {
    await this.assertStoreProfileActor(actorId);
    const current: any = await this.model.findOne({ _id: id, isDeleted: false }).select('storefrontImage').lean();
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
        this.logger.warn(`Không thể cleanup ảnh Cloudinary ${publicId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { data: customer };
  }

  async importInteractions(rows: ImportCustomerInteractionRowDto[], actorId?: string) {
    if (!Array.isArray(rows) || !rows.length) throw new BadRequestException('File import không có dữ liệu tương tác');
    if (rows.length > 10000) throw new BadRequestException('Mỗi lần chỉ được import tối đa 10.000 dòng');
    let imported = 0; let zaloUpdated = 0; let duplicatesSkipped = 0;
    const errors: Array<{ row: number; message: string; data: ImportCustomerInteractionRowDto }> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]; const rowNumber = Number(row.rowNumber) || index + 2;
      try {
        const customerCode = String(row.customerCode || '').trim().toUpperCase().replace(/\s+/g, '');
        if (!customerCode) throw new Error('Thiếu mã khách hàng');
        if (row.zaloStatus && !['CONNECTED', 'NOT_CONNECTED'].includes(row.zaloStatus)) throw new Error('Tình trạng Zalo không hợp lệ');
        if (row.invoiceStatus && !['SENT', 'NOT_SENT'].includes(row.invoiceStatus)) throw new Error('Tình trạng gửi hóa đơn không hợp lệ');
        if (!row.zaloStatus && !row.invoiceStatus && !row.interaction?.trim() && !row.note?.trim()) throw new Error('Dòng chưa có nội dung hoặc trạng thái tương tác');
        const occurredAt = new Date(row.occurredAt);
        if (Number.isNaN(occurredAt.getTime())) throw new Error('Ngày tương tác không hợp lệ');
        const phone = normalizePhones(row.phone).join(', ');
        const importKey = buildCustomerInteractionImportKey(row, customerCode, occurredAt, phone);
        const customer: any = await this.model.findOne({ code: customerCode, isDeleted: false }).select('_id zaloConnected interactions.importKey').lean();
        if (!customer) throw new Error(`Không tìm thấy khách hàng ${customerCode}`);
        if ((customer.interactions || []).some((item) => item.importKey === importKey)) { imported++; duplicatesSkipped++; continue; }
        const desiredZalo = row.zaloStatus ? row.zaloStatus === 'CONNECTED' : undefined;
        const interaction = {
          at: occurredAt, occurredAt, channel: 'IMPORT',
          action: row.interaction?.trim() || 'Cập nhật tình hình tương tác',
          result: row.note?.trim() || undefined,
          zaloStatus: row.zaloStatus, invoiceStatus: row.invoiceStatus,
          interaction: row.interaction?.trim() || undefined, phone: phone || undefined,
          note: row.note?.trim() || undefined, createdBy: actorId, importKey,
        };
        const update: any = { $push: { interactions: interaction } };
        if (desiredZalo !== undefined) update.$set = { zaloConnected: desiredZalo };
        const updated = await this.model.findOneAndUpdate(
          { _id: customer._id, isDeleted: false, 'interactions.importKey': { $ne: importKey } },
          update,
          { new: true },
        );
        if (!updated) { imported++; duplicatesSkipped++; continue; }
        imported++;
        if (desiredZalo !== undefined && Boolean(customer.zaloConnected) !== desiredZalo) zaloUpdated++;
      } catch (error) {
        errors.push({ row: rowNumber, message: error instanceof Error ? error.message : 'Không thể import tương tác', data: row });
      }
    }
    return { data: { totalRows: rows.length, imported, zaloUpdated, failed: errors.length, duplicatesSkipped, errors } };
  }

  async exportInteractions() {
    const customers: any[] = await this.model.find({ isDeleted: false, 'interactions.0': { $exists: true } }).select('code name phone interactions').sort({ code: 1 }).lean();
    const rows = customers.flatMap((customer) => (customer.interactions || []).map((interaction) => ({
      customerCode: customer.code,
      customerName: customer.name,
      zaloStatus: interaction.zaloStatus,
      invoiceStatus: interaction.invoiceStatus,
      interaction: interaction.interaction || interaction.action || '',
      phone: interaction.phone || customer.phone || '',
      note: interaction.note || interaction.result || '',
      occurredAt: interaction.occurredAt || interaction.at,
    }))).sort((left, right) => +new Date(right.occurredAt) - +new Date(left.occurredAt));
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Tương tác khách hàng');
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
    for (const row of rows) sheet.addRow({
      ...row,
      zaloStatus: row.zaloStatus === 'CONNECTED' ? 'ĐÃ KẾT BẠN' : row.zaloStatus === 'NOT_CONNECTED' ? 'CHƯA KẾT BẠN' : '',
      invoiceStatus: row.invoiceStatus === 'SENT' ? 'ĐÃ GỬI' : row.invoiceStatus === 'NOT_SENT' ? 'KHÔNG GỬI' : '',
      occurredAt: row.occurredAt ? new Date(row.occurredAt) : null,
    });
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'I1' };
    sheet.getColumn('phone').numFmt = '@'; sheet.getColumn('occurredAt').numFmt = 'dd/mm/yyyy';
    (sheet as any).dataValidations.add('C2:C10001', { type: 'list', allowBlank: true, formulae: ['"ĐÃ KẾT BẠN,CHƯA KẾT BẠN"'] });
    (sheet as any).dataValidations.add('D2:D10001', { type: 'list', allowBlank: true, formulae: ['"ĐÃ GỬI,KHÔNG GỬI"'] });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async debtHistory(customerId: string, query: CustomerDebtHistoryQueryDto) {
    const customer: any = await this.model.findOne({ _id: customerId, isDeleted: false }).select('debt debtLimit').lean();
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    const page = Number(query.page) || 1; const limit = Number(query.limit) || 20;
    const filter: any = { customerId, isDeleted: false };
    if (query.type) filter.type = query.type;
    if (query.from || query.to) { filter.occurredAt = {}; if (query.from) filter.occurredAt.$gte = vietnamDateBoundary(query.from, false); if (query.to) filter.occurredAt.$lte = vietnamDateBoundary(query.to, true); }
    const [rows, total, highest] = await Promise.all([
      this.debtLedgerModel.find(filter).sort({ occurredAt: -1, createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.debtLedgerModel.countDocuments(filter),
      this.debtLedgerModel.findOne({ customerId, isDeleted: false }).sort({ balanceAfter: -1 }).select('balanceAfter').lean(),
    ]);
    const actorIds = [...new Set(rows.map((row: any) => row.createdBy).filter(Boolean))];
    const actors: any[] = actorIds.length ? await this.userModel.find({ _id: { $in: actorIds } }).select('employeeCode fullName username').lean() : [];
    const actorMap = new Map(actors.map((actor) => [String(actor._id), { id: String(actor._id), employeeCode: actor.employeeCode, name: actor.fullName || actor.username }]));
    return { data: rows.map((row: any) => ({ ...row, id: String(row._id), effectiveAt: row.effectiveAt || row.occurredAt, previousDebt: row.previousDebt ?? Math.max(0, row.direction === DebtLedgerDirection.INCREASE ? row.balanceAfter - row.amount : row.balanceAfter + row.amount), increaseAmount: row.increaseAmount ?? (row.direction === DebtLedgerDirection.INCREASE ? row.amount : 0), decreaseAmount: row.decreaseAmount ?? (row.direction === DebtLedgerDirection.DECREASE ? row.amount : 0), actor: row.createdBy ? actorMap.get(String(row.createdBy)) || { id: String(row.createdBy) } : null })), summary: { currentDebt: customer.debt || 0, currentDebtLimit: customer.debtLimit || 0, highestDebt: Math.max(customer.debt || 0, Number((highest as any)?.balanceAfter || 0)) }, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async debtHistoryChart(customerId: string, query: CustomerDebtHistoryQueryDto) {
    if (!await this.model.exists({ _id: customerId, isDeleted: false })) throw new NotFoundException('Không tìm thấy khách hàng');
    const filter: any = { customerId, isDeleted: false };
    if (query.type) filter.type = query.type;
    if (query.from || query.to) { filter.occurredAt = {}; if (query.from) filter.occurredAt.$gte = vietnamDateBoundary(query.from, false); if (query.to) filter.occurredAt.$lte = vietnamDateBoundary(query.to, true); }
    const rows: any[] = await this.debtLedgerModel.find(filter).sort({ occurredAt: 1, createdAt: 1, _id: 1 }).select('effectiveAt occurredAt balanceAfter').lean();
    return { data: rows.map((row) => ({ date: (row.effectiveAt || row.occurredAt).toISOString().slice(0, 10), debt: row.balanceAfter })) };
  }

  async importRows(rows: Record<string, unknown>[], actorId?: string): Promise<any> {
    if (!Array.isArray(rows) || !rows.length) throw new BadRequestException('File import không có dữ liệu');
    if (rows.length > 10000) throw new BadRequestException('Mỗi lần chỉ được import tối đa 10.000 dòng');
    let created = 0; let updated = 0; let debtLedgersCreated = 0; let duplicatePhonesAccepted = 0;
    const errors: Array<{ row: number; message: string; data: Record<string, unknown> }> = [];
    for (let index = 0; index < rows.length; index++) {
      const original = rows[index];
      try {
        const row = normalizeExcelRow(original);
        const code = String(excelValue(row, ['Mã khách hàng', 'Mã KH', 'customerCode', 'code'])).trim().toUpperCase().replace(/\s+/g, '');
        const name = String(excelValue(row, ['Tên khách hàng', 'Tên', 'name'])).trim();
        const phones = normalizePhones(excelValue(row, ['Số điện thoại', 'SĐT', 'Điện thoại', 'phone', 'phone number']));
        const phone = phones.join(', ') || undefined;
        if (!code) throw new Error('Thiếu mã khách hàng');
        if (!name) throw new Error('Thiếu tên khách hàng');
        const source = SOURCE_ALIASES[aliasKey(excelValue(row, ['Nguồn', 'source']))];
        const segment = SEGMENT_ALIASES[aliasKey(excelValue(row, ['Phân loại', 'segment']))];
        const rawDebt = excelValue(row, ['Công nợ', 'debt'], null); const rawDebtLimit = excelValue(row, ['Hạn mức công nợ', 'debtLimit'], null);
        const importedDebt = rawDebt === null ? undefined : Math.max(0, excelNumber(rawDebt)); const importedDebtLimit = rawDebtLimit === null ? undefined : Math.max(0, excelNumber(rawDebtLimit));
        const rawEffectiveAt = excelValue(row, ['Ngày công nợ', 'Ngày hiệu lực', 'effectiveAt'], null); const effectiveAt = this.importDate(rawEffectiveAt);
        const payload: any = {
          name,
          phone,
          phones,
          email: String(excelValue(row, ['Email', 'email'])).trim() || undefined,
          address: String(excelValue(row, ['Địa chỉ', 'address'])).trim() || undefined,
          zaloConnected: excelBoolean(excelValue(row, ['Đã kết bạn Zalo', 'Zalo', 'zaloConnected'])),
          note: String(excelValue(row, ['Ghi chú', 'note'])).trim() || undefined,
        };
        if (source) payload.source = source;
        if (segment) payload.segment = segment;
        const session = await this.connection.startSession();
        let rowCreated = false; let rowLedgerCreated = false; let rowDuplicatePhone = false;
        try { await session.withTransaction(async () => {
          const existing: any = await this.model.findOne({ code, isDeleted: false }).session(session).lean();
          const duplicatePhone = phones.length ? await this.model.exists({ isDeleted: false, code: { $ne: code }, phones: { $in: phones } }).session(session) : null;
          rowDuplicatePhone = Boolean(duplicatePhone);
          const previousDebt = Number(existing?.debt || 0); const previousDebtLimit = Number(existing?.debtLimit || 0);
          const debtAfter = importedDebt ?? previousDebt; const debtLimitAfter = importedDebtLimit ?? previousDebtLimit;
          const setPayload = { ...payload, codeStatus: CustomerCodeStatus.ASSIGNED, ...(importedDebt !== undefined ? { debt: debtAfter } : {}), ...(importedDebtLimit !== undefined ? { debtLimit: debtLimitAfter } : {}) };
          let customer: any;
          if (existing) customer = await this.model.findOneAndUpdate({ _id: existing._id }, { $set: setPayload }, { new: true, session });
          else { customer = (await this.model.create([{ ...setPayload, code, debt: debtAfter, debtLimit: debtLimitAfter }], { session }))[0]; rowCreated = true; }
          const changed = debtAfter !== previousDebt || debtLimitAfter !== previousDebtLimit;
          if (changed) { const delta = debtAfter - previousDebt; await this.debtLedgerModel.create([{ customerId: customer._id, customerCode: code, type: existing ? DebtLedgerType.IMPORT_ADJUSTMENT : DebtLedgerType.OPENING_BALANCE, direction: delta >= 0 ? DebtLedgerDirection.INCREASE : DebtLedgerDirection.DECREASE, amount: Math.abs(delta), previousDebt, increaseAmount: Math.max(0, delta), decreaseAmount: Math.max(0, -delta), balanceAfter: debtAfter, previousDebtLimit, debtLimitAfter, occurredAt: effectiveAt, effectiveAt, referenceType: 'CUSTOMER_IMPORT', referenceId: `ROW_${index + 2}`, createdBy: actorId, note: existing ? 'Điều chỉnh từ file import' : 'Công nợ đầu kỳ từ file import' }], { session }); rowLedgerCreated = true; }
          const match = code.match(/^KH(\d+)$/); if (match) await this.counterModel.updateOne({ key: 'CUSTOMER_CODE' }, { $max: { sequence: Number(match[1]) } }, { upsert: true, session });
        }); created += rowCreated ? 1 : 0; updated += rowCreated ? 0 : 1; debtLedgersCreated += rowLedgerCreated ? 1 : 0; duplicatePhonesAccepted += rowDuplicatePhone ? 1 : 0; } finally { await session.endSession(); }
      } catch (error) {
        errors.push({ row: index + 2, message: error instanceof Error ? error.message : 'Không thể lưu khách hàng', data: original });
      }
    }
    return { data: { totalRows: rows.length, created, updated, failed: errors.length, debtLedgersCreated, duplicatePhonesAccepted, errors } };
  }

  async exportExcel(): Promise<Buffer> {
    const customers = await this.model.find({ isDeleted: false }).sort({ createdAt: -1 }).lean();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Khach hang');
    sheet.columns = [
      { header: 'Mã khách hàng', key: 'code', width: 18 }, { header: 'Tên khách hàng', key: 'name', width: 30 },
      { header: 'Số điện thoại', key: 'phone', width: 18 }, { header: 'Email', key: 'email', width: 28 },
      { header: 'Địa chỉ', key: 'address', width: 32 }, { header: 'Nguồn', key: 'source', width: 14 },
      { header: 'Phân loại', key: 'segment', width: 18 }, { header: 'Đã kết bạn Zalo', key: 'zaloConnected', width: 20 },
      { header: 'Công nợ', key: 'debt', width: 16 }, { header: 'Hạn mức công nợ', key: 'debtLimit', width: 20 },
      { header: 'Ghi chú', key: 'note', width: 32 },
    ];
    customers.forEach((item: any) => sheet.addRow({ ...item, zaloConnected: item.zaloConnected ? 'Có' : 'Không' }));
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'K1' };
    sheet.getColumn('phone').numFmt = '@'; sheet.getColumn('debt').numFmt = '#,##0'; sheet.getColumn('debtLimit').numFmt = '#,##0';
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
