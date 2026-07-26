import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { getConnectionToken, InjectModel } from 'nestjs-typegoose';
import { Connection } from 'mongoose';
import { CustomerCounters, Customers } from './schemas/customers.schema';
import { CreateCustomerDto, CreateInteractionDto, CustomerDebtHistoryQueryDto, CustomerQueryDto, UpdateCustomerDto } from './dtos/customers.dto';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { Vouchers } from '../promotions/schemas/promotions.schema';
import * as ExcelJS from 'exceljs';
import { excelBoolean, excelNumber, excelValue, normalizeExcelRow } from '../../core/excel-import';
import { CustomerSegment, CustomerSource } from './schemas/customers.schema';
import { CustomerDebtLedger, DebtLedgerDirection, DebtLedgerType } from '../debt-payments/schemas/customer-debt-ledger.schema';
import { vietnamDateBoundary } from '../trucks/truck-transfer-date';
import { Users } from '../users/schemas/users.schema';

export function normalizePhones(value?: unknown): string[] {
  return String(value ?? '').split(/[,;|/]+/).map((phone) => phone.replace(/\D/g, '')).filter(Boolean).map((phone) => phone.startsWith('0') ? phone : `0${phone}`).filter((phone, index, values) => values.indexOf(phone) === index);
}

const SOURCE_LABELS: Record<CustomerSource, string> = { LEAD: 'Khách lead', LEGACY: 'Khách cũ', NEW: 'Khách mới' };
const SEGMENT_LABELS: Record<CustomerSegment, string> = { TEMPORARILY_INACTIVE: 'Tạm ngừng hoạt động', ACTIVE: 'Đang hoạt động', HIGHLY_ACTIVE: 'Hoạt động tốt', STOPPED_BUYING: 'Ngừng mua hàng', CHURNED: 'Khách rời đi', NEW_CUSTOMER: 'Khách mới' };
function aliasKey(value: unknown) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'D').trim().toUpperCase().replace(/\s+/g, ' '); }
const SOURCE_ALIASES: Record<string, CustomerSource> = { LEAD: CustomerSource.LEAD, LEGACY: CustomerSource.LEGACY, 'KHACH CU': CustomerSource.LEGACY, NEW: CustomerSource.NEW, 'KHACH MOI': CustomerSource.NEW };
const SEGMENT_ALIASES: Record<string, CustomerSegment> = { TEMPORARILY_INACTIVE: CustomerSegment.TEMPORARILY_INACTIVE, 'NGU QUEN 31-89 NGAY': CustomerSegment.TEMPORARILY_INACTIVE, ACTIVE: CustomerSegment.ACTIVE, 'DANG HOAT DONG': CustomerSegment.ACTIVE, HIGHLY_ACTIVE: CustomerSegment.HIGHLY_ACTIVE, 'THUONG XUYEN': CustomerSegment.HIGHLY_ACTIVE, STOPPED_BUYING: CustomerSegment.STOPPED_BUYING, '90-179 NGAY CHUA PS': CustomerSegment.STOPPED_BUYING, CHURNED: CustomerSegment.CHURNED, 'KHACH CHET >=180 NGAY': CustomerSegment.CHURNED, NEW_CUSTOMER: CustomerSegment.NEW_CUSTOMER, 'CHUA PHAT SINH DON': CustomerSegment.NEW_CUSTOMER, VIP: CustomerSegment.HIGHLY_ACTIVE, 'THAN THIET': CustomerSegment.HIGHLY_ACTIVE, 'TIEM NANG': CustomerSegment.ACTIVE, 'DAI LY': CustomerSegment.ACTIVE, THUONG: CustomerSegment.ACTIVE };

@Injectable()
export class CustomersService {
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
    return { data: await this.model.create({ ...dto, phone, phones, name: dto.name.trim(), code: await this.nextCode() }) };
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
    if (query.debtWarning === true || String(query.debtWarning) === 'true') expressions.push({ $and: [{ $gt: [{ $ifNull: ['$debt', 0] }, 0] }, { $gte: [{ $ifNull: ['$debt', 0] }, { $ifNull: ['$debtLimit', 0] }] }] });
    if (expressions.length === 1) filter.$expr = expressions[0];
    else if (expressions.length > 1) filter.$expr = { $and: expressions };
    const [data, totalItems] = await Promise.all([
      this.model.find(filter).select('code name phone phones email address source segment zaloConnected debt debtLimit note createdAt updatedAt').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);
    return {
      data: data.map((customer: any) => ({ ...customer, id: String(customer._id), sourceLabel: SOURCE_LABELS[customer.source], segmentLabel: SEGMENT_LABELS[customer.segment], availableDebtLimit: customer.debtLimit > 0 ? Math.max(0, customer.debtLimit - (customer.debt || 0)) : 0, debtWarning: (customer.debt || 0) > 0 && (customer.debt || 0) >= (customer.debtLimit || 0) })),
      meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  async summary() {
    const rows = await this.model.find({ isDeleted: false }).select('zaloConnected source debt debtLimit').lean();
    return { data: {
      totalCustomers: rows.length,
      zaloConnected: rows.filter((x) => x.zaloConnected).length,
      leads: rows.filter((x) => x.source === 'LEAD').length,
      debtWarnings: rows.filter((x) => (x.debt || 0) > 0 && (x.debt || 0) >= (x.debtLimit || 0)).length,
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
          const setPayload = { ...payload, ...(importedDebt !== undefined ? { debt: debtAfter } : {}), ...(importedDebtLimit !== undefined ? { debtLimit: debtLimitAfter } : {}) };
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
