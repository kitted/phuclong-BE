import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { InjectModel } from 'nestjs-typegoose';
import { EmployeeKpiCounters, EmployeeKpiMetric, EmployeeKpis, EmployeeKpiStatus } from './schemas/employee-kpis.schema';
import { Users, UserStatus } from '../users/schemas/users.schema';
import { RoleEnum } from '../users/interfaces/role.enum';
import { Invoices, InvoiceLineType } from '../invoices/schemas/invoices.schema';
import { PromotionActivations, PromotionActivationStatus } from '../promotion-activations/schemas/promotion-activations.schema';
import { CreateEmployeeKpiDto, EmployeeKpiEvidenceQueryDto, EmployeeKpiQueryDto, LeaderboardQueryDto, UpdateEmployeeKpiDto } from './dtos/employee-kpis.dto';
import { Promotions, PromotionType } from '../promotions/schemas/promotions.schema';
import { Products } from '../products/schemas/products.schema';
import { Categories } from '../categories/schemas/categories.schema';
import { vietnamDateBoundary } from '../trucks/truck-transfer-date';

@Injectable()
export class EmployeeKpisService {
  constructor(@InjectModel(EmployeeKpis) private model: ReturnModelType<typeof EmployeeKpis>, @InjectModel(EmployeeKpiCounters) private counter: ReturnModelType<typeof EmployeeKpiCounters>, @InjectModel(Users) private users: ReturnModelType<typeof Users>, @InjectModel(Invoices) private invoices: ReturnModelType<typeof Invoices>, @InjectModel(PromotionActivations) private activations: ReturnModelType<typeof PromotionActivations>, @InjectModel(Promotions) private promotions: ReturnModelType<typeof Promotions>, @InjectModel(Products) private products: ReturnModelType<typeof Products>, @InjectModel(Categories) private categories: ReturnModelType<typeof Categories>) {}
  private range(from: string | Date, to: string | Date) {
    const start = typeof from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(from) ? vietnamDateBoundary(from, false) : new Date(from);
    const end = typeof to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(to) ? vietnamDateBoundary(to, true) : new Date(to);
    if (Number.isNaN(+start) || Number.isNaN(+end) || end < start) throw new BadRequestException('Khoảng thời gian KPI không hợp lệ');
    return { start, end };
  }
  private async validateTargets(targets: any[], from: Date, to: Date, status: EmployeeKpiStatus): Promise<void> {
    if (!targets?.length) throw new BadRequestException('Phải có ít nhất một chỉ tiêu');
    for (const target of targets) {
      if (!(Number(target.targetValue) > 0)) throw new BadRequestException('Giá trị mục tiêu phải lớn hơn 0');
      if (target.metric === EmployeeKpiMetric.PROMOTION_ACTIVATION_COUNT) {
        if (!target.promotionId) throw new BadRequestException('KPI mã kích hoạt bắt buộc chọn chương trình');
        const promotion: any = await this.promotions.findOne({ _id: target.promotionId, type: { $in: [PromotionType.BUY_X_GET_Y, PromotionType.BUNDLE_GIFT] }, isDeleted: false }).select('status startAt endAt').lean();
        if (!promotion) throw new BadRequestException('Chương trình KPI mã kích hoạt không hợp lệ');
        if (from > promotion.endAt || to < promotion.startAt) throw new BadRequestException({ code: 'KPI_PROMOTION_DATE_NOT_OVERLAP', message: 'Thời gian KPI không giao với thời gian chương trình' });
        if (status === EmployeeKpiStatus.ACTIVE && !['ACTIVE', 'SCHEDULED'].includes(promotion.status)) throw new BadRequestException({ code: 'KPI_PROMOTION_NOT_READY', message: 'KPI hoạt động chỉ được gắn với chương trình đang chạy hoặc đã lên lịch' });
      }
      if (target.metric === EmployeeKpiMetric.PRODUCT_REVENUE) {
        const scopes = [Boolean(target.productIds?.length), Boolean(target.categoryIds?.length), Boolean(target.productType?.trim()), Boolean(target.brandIds?.length)].filter(Boolean).length;
        if (scopes > 1) throw new BadRequestException('KPI doanh thu chỉ được chọn một phạm vi sản phẩm');
        if (target.productIds?.length && await this.products.countDocuments({ _id: { $in: target.productIds }, isDeleted: false }) !== target.productIds.length) throw new BadRequestException('Sản phẩm KPI không hợp lệ');
        if (target.categoryIds?.length && await this.categories.countDocuments({ _id: { $in: target.categoryIds }, isDeleted: false }) !== target.categoryIds.length) throw new BadRequestException('Danh mục KPI không hợp lệ');
      }
    }
  }
  async create(dto: CreateEmployeeKpiDto, actor?: string): Promise<any> {
    const employee: any = await this.users.findOne({ _id: dto.employeeId, role: RoleEnum.STAFF, status: UserStatus.ACTIVE, isDeleted: false }).lean();
    if (!employee) throw new BadRequestException('Nhân viên không tồn tại hoặc không hoạt động');
    const { start, end } = this.range(dto.from, dto.to); await this.validateTargets(dto.targets, start, end, dto.status || EmployeeKpiStatus.DRAFT);
    const month = `${start.getFullYear()}${String(start.getMonth() + 1).padStart(2, '0')}`; const seq: any = await this.counter.findOneAndUpdate({ key: `KPI_${month}` }, { $inc: { sequence: 1 } }, { upsert: true, new: true });
    const doc = await this.model.create({ ...dto, name: dto.name?.trim() || `KPI ${employee.fullName || employee.username} ${month}`, code: `KPI-${month}-${String(seq.sequence).padStart(4, '0')}`, employeeId: employee._id, employeeCode: employee.employeeCode || '', employeeName: employee.fullName || employee.username, from: start, to: end, createdBy: actor || undefined }); return { data: doc };
  }
  async findAll(query: EmployeeKpiQueryDto): Promise<any> { const filter: any = { isDeleted: false }; if (query.employeeId) filter.employeeId = query.employeeId; if (query.status) filter.status = query.status; if (query.search) filter.$or = [{ code: { $regex: query.search, $options: 'i' } }, { name: { $regex: query.search, $options: 'i' } }, { employeeName: { $regex: query.search, $options: 'i' } }]; if (query.from) filter.to = { $gte: new Date(query.from) }; if (query.to) filter.from = { $lte: new Date(query.to) }; const page = +query.page || 1, limit = +query.limit || 20; const [data, total] = await Promise.all([this.model.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), this.model.countDocuments(filter)]); return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }; }
  async findOne(id: string, employeeId?: string): Promise<any> { const doc: any = await this.model.findOne({ _id: id, isDeleted: false, ...(employeeId ? { employeeId } : {}) }).lean(); if (!doc) throw new NotFoundException('Không tìm thấy KPI hoặc KPI không thuộc nhân viên hiện tại'); return { data: doc }; }
  async update(id: string, dto: UpdateEmployeeKpiDto): Promise<any> { const existing: any = await this.model.findOne({ _id: id, isDeleted: false }); if (!existing) throw new NotFoundException('Không tìm thấy KPI'); if (existing.status === EmployeeKpiStatus.CANCELLED) throw new BadRequestException('Không thể sửa KPI đã hủy'); const from: any = dto.from || existing.from, to: any = dto.to || existing.to; const { start, end } = this.range(from, to); await this.validateTargets(dto.targets || existing.targets, start, end, dto.status || existing.status); Object.assign(existing, dto, { from: start, to: end }); await existing.save(); return { data: existing }; }
  async remove(id: string, actor?: string): Promise<any> { const doc = await this.model.findOneAndUpdate({ _id: id, isDeleted: false, status: EmployeeKpiStatus.DRAFT }, { isDeleted: true, deletedAt: new Date(), deletedBy: actor }, { new: true }); if (!doc) throw new BadRequestException('Chỉ có thể xóa KPI nháp'); return { data: { id, deleted: true } }; }
  private async actual(employeeId: any, from: Date, to: Date, target: any) {
    if (target.metric === EmployeeKpiMetric.PROMOTION_ACTIVATION_COUNT) return this.activations.countDocuments({ salespersonId: employeeId, activatedAt: { $gte: from, $lte: to }, status: PromotionActivationStatus.ACTIVE, isDeleted: false, ...(target.promotionId ? { promotionId: target.promotionId } : {}) });
    const base: any = { salespersonId: employeeId, date: { $gte: from, $lte: to }, isDeleted: false };
    if (target.metric === EmployeeKpiMetric.INVOICE_COUNT) return this.invoices.countDocuments(base);
    if (target.metric === EmployeeKpiMetric.TOTAL_REVENUE) { const rows = await this.invoices.aggregate([{ $match: base }, { $group: { _id: null, value: { $sum: '$grandTotal' } } }]); return rows[0]?.value || 0; }
    const itemFilter: any = {}; if (!target.includeGiftLines) itemFilter['items.lineType'] = InvoiceLineType.SALE; if (target.productIds?.length) itemFilter['items.productId'] = { $in: target.productIds }; if (target.categoryIds?.length) itemFilter['items.categoryId'] = { $in: target.categoryIds.map(String) }; if (target.brandIds?.length) itemFilter['items.brandId'] = { $in: target.brandIds }; if (target.productType) itemFilter['items.productType'] = target.productType;
    const rows = await this.invoices.aggregate([{ $match: base }, { $unwind: '$items' }, { $match: itemFilter }, { $group: { _id: null, value: { $sum: '$items.lineTotal' } } }]); return rows[0]?.value || 0;
  }
  async progress(id: string, employeeId?: string): Promise<any> { const { data: doc }: any = await this.findOne(id, employeeId); const targets = await Promise.all(doc.targets.map(async (target: any) => { const actualValue = await this.actual(doc.employeeId, doc.from, doc.to, target); return { ...target, actualValue, progressPercent: target.targetValue ? Math.round(actualValue / target.targetValue * 10000) / 100 : 0, exceededValue: Math.max(0, actualValue - target.targetValue) }; })); return { data: { ...doc, targets } }; }
  private itemContribution(items: any[], target: any): number {
    const productIds = new Set((target.productIds || []).map(String)); const categoryIds = new Set((target.categoryIds || []).map(String)); const brandIds = new Set((target.brandIds || []).map(String));
    return (items || []).filter((item: any) => (target.includeGiftLines || item.lineType === InvoiceLineType.SALE)
      && (!productIds.size || productIds.has(String(item.productId)))
      && (!categoryIds.size || categoryIds.has(String(item.categoryId)))
      && (!brandIds.size || brandIds.has(String(item.brandId)))
      && (!target.productType || String(item.productType).toLocaleLowerCase('vi') === String(target.productType).toLocaleLowerCase('vi')))
      .reduce((sum: number, item: any) => sum + Number(item.lineTotal || 0), 0);
  }
  async evidence(id: string, query: EmployeeKpiEvidenceQueryDto, employeeId?: string): Promise<any> {
    const { data: kpi }: any = await this.findOne(id, employeeId); const targetIndex = Number(query.targetIndex);
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= kpi.targets.length) throw new BadRequestException('Chỉ tiêu KPI không hợp lệ');
    const target: any = kpi.targets[targetIndex]; const base = { salespersonId: kpi.employeeId, date: { $gte: kpi.from, $lte: kpi.to }, isDeleted: false };
    const invoices: any[] = await this.invoices.find(base).sort({ date: -1, createdAt: -1, _id: -1 }).populate('customerId', 'code name phone').lean();
    const invoiceIds = invoices.map((invoice) => invoice._id);
    const activationFilter: any = { salespersonId: kpi.employeeId, activatedAt: { $gte: kpi.from, $lte: kpi.to }, status: PromotionActivationStatus.ACTIVE, isDeleted: false, ...(target.promotionId ? { promotionId: target.promotionId } : {}) };
    const activations: any[] = target.metric === EmployeeKpiMetric.PROMOTION_ACTIVATION_COUNT
      ? await this.activations.find(activationFilter).sort({ activatedAt: -1 }).lean()
      : invoiceIds.length ? await this.activations.find({ invoiceId: { $in: invoiceIds }, isDeleted: false }).lean() : [];
    const activationsByInvoice = new Map<string, any[]>(); for (const activation of activations) { const key = String(activation.invoiceId); activationsByInvoice.set(key, [...(activationsByInvoice.get(key) || []), { id: String(activation._id), code: activation.code, status: activation.status, activatedAt: activation.activatedAt }]); }
    let rows = invoices.map((invoice: any) => {
      const activationCodes = activationsByInvoice.get(String(invoice._id)) || [];
      const contributionValue = target.metric === EmployeeKpiMetric.INVOICE_COUNT ? 1 : target.metric === EmployeeKpiMetric.TOTAL_REVENUE ? Number(invoice.grandTotal || 0) : target.metric === EmployeeKpiMetric.PRODUCT_REVENUE ? this.itemContribution(invoice.items, target) : activationCodes.length;
      const customer: any = invoice.customerId;
      return { id: String(invoice._id), code: invoice.code, date: invoice.date, customerCode: customer?.code || '', customerName: customer?.name || invoice.customer, customerPhone: customer?.phone || '', grandTotal: invoice.grandTotal, contributionValue, paymentStatus: invoice.paymentStatus, activationCodes };
    }).filter((row) => row.contributionValue > 0);
    if (query.search?.trim()) { const search = query.search.trim().toLocaleLowerCase('vi'); rows = rows.filter((row) => [row.code, row.customerCode, row.customerName, row.customerPhone, ...row.activationCodes.map((item: any) => item.code)].some((value) => String(value || '').toLocaleLowerCase('vi').includes(search))); }
    const page = Math.max(1, Number(query.page) || 1); const limit = Math.min(100, Math.max(1, Number(query.limit) || 20)); const total = rows.length; const actualValue = await this.actual(kpi.employeeId, kpi.from, kpi.to, target);
    return { data: { kpi: { id: String(kpi._id), name: kpi.name, employeeId: String(kpi.employeeId), employeeName: kpi.employeeName, from: kpi.from, to: kpi.to }, target: { ...target, actualValue }, invoices: rows.slice((page - 1) * limit, page * limit) }, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
  listForEmployee(employeeId: string, query: EmployeeKpiQueryDto): Promise<any> { return this.findAll({ ...query, employeeId }); }
  async leaderboard(query: LeaderboardQueryDto): Promise<any> { const { start, end } = this.range(query.from, query.to); const docs: any[] = await this.model.find({ status: { $in: [EmployeeKpiStatus.ACTIVE, EmployeeKpiStatus.COMPLETED] }, from: { $lte: end }, to: { $gte: start }, 'targets.metric': query.metric, isDeleted: false }).lean(); const rows: any[] = []; for (const doc of docs) for (const target of doc.targets.filter((x: any) => x.metric === query.metric)) { const actualValue = await this.actual(doc.employeeId, start > doc.from ? start : doc.from, end < doc.to ? end : doc.to, target); rows.push({ employeeId: doc.employeeId, employeeCode: doc.employeeCode, employeeName: doc.employeeName, kpiId: doc._id, targetValue: target.targetValue, actualValue, progressPercent: target.targetValue ? Math.round(actualValue / target.targetValue * 10000) / 100 : 0 }); } rows.sort((a, b) => b.actualValue - a.actualValue); return { data: rows.map((row, i) => ({ rank: i + 1, ...row })) }; }
}
