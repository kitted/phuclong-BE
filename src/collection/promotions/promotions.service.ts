import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { InjectModel } from 'nestjs-typegoose';
import { Categories } from '../categories/schemas/categories.schema';
import { Products } from '../products/schemas/products.schema';
import { Customers } from '../customers/schemas/customers.schema';
import { AssignVoucherDto, CreatePromotionDto, PromotionOptionsQueryDto, PromotionQueryDto, UpdatePromotionDto, UseVoucherDto } from './dtos/promotions.dto';
import { DiscountType, GiftSelectionMode, Promotions, PromotionConditionMetric, PromotionScope, PromotionStatus, PromotionType, Vouchers, VoucherStatus } from './schemas/promotions.schema';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { vietnamDateBoundary } from '../trucks/truck-transfer-date';

@Injectable()
export class PromotionsService {
  constructor(
    @InjectModel(Promotions) private readonly model: ReturnModelType<typeof Promotions>,
    @InjectModel(Vouchers) private readonly voucherModel: ReturnModelType<typeof Vouchers>,
    @InjectModel(Products) private readonly productModel: ReturnModelType<typeof Products>,
    @InjectModel(Categories) private readonly categoryModel: ReturnModelType<typeof Categories>,
    @InjectModel(Customers) private readonly customerModel: ReturnModelType<typeof Customers>,
    @InjectModel(Invoices) private readonly invoiceModel: ReturnModelType<typeof Invoices>,
  ) {}

  private positiveInt(value: string | undefined, fallback: number, max?: number) {
    const n = Number(value || fallback);
    if (!Number.isInteger(n) || n < 1 || (max && n > max)) throw new BadRequestException('Tham số phân trang không hợp lệ');
    return n;
  }

  private async validate(dto: CreatePromotionDto | UpdatePromotionDto, current?: any) {
    const data = { ...(current || {}), ...dto };
    const startAt = new Date(data.startAt); const endAt = new Date(data.endAt);
    if (!data.code?.trim() || !data.name?.trim()) throw new BadRequestException('Mã và tên chương trình là bắt buộc');
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) throw new BadRequestException('Thời gian kết thúc phải sau thời gian bắt đầu');
    const isDiscount = [PromotionType.VOUCHER, PromotionType.AUTO_DISCOUNT].includes(data.type);
    const isGift = [PromotionType.BUY_X_GET_Y, PromotionType.BUNDLE_GIFT].includes(data.type);
    if (data.activationPrefix && !String(data.activationPrefix).replace(/[^A-Z0-9]/gi, '')) throw new BadRequestException('Tiền tố mã kích hoạt phải có chữ hoặc số');
    if (isDiscount && (!data.discountType || !(data.discountValue > 0) || !data.scope)) throw new BadRequestException('Chương trình giảm giá cần loại, mức giảm và phạm vi áp dụng');
    if (isDiscount && data.discountType === DiscountType.PERCENT && data.discountValue > 100) throw new BadRequestException('Mức giảm phần trăm không được vượt quá 100');
    if (data.scope === PromotionScope.CATEGORY) {
      if (!data.categoryIds?.length) throw new BadRequestException('Phải chọn ít nhất một danh mục');
      if (await this.categoryModel.countDocuments({ _id: { $in: data.categoryIds }, isDeleted: false }) !== data.categoryIds.length) throw new BadRequestException('Danh mục áp dụng không hợp lệ');
    }
    if (data.scope === PromotionScope.PRODUCTS) {
      if (!data.productIds?.length) throw new BadRequestException('Phải chọn ít nhất một sản phẩm');
      if (await this.productModel.countDocuments({ _id: { $in: data.productIds }, isDeleted: false }) !== data.productIds.length) throw new BadRequestException('Sản phẩm áp dụng không hợp lệ');
    }
    if (data.scope === PromotionScope.PRODUCT_TYPE && !data.productType?.trim()) throw new BadRequestException('Loại sản phẩm là bắt buộc');
    if (data.type === PromotionType.VOUCHER && (!data.voucherPrefix?.trim() || !(data.quantity > 0) || !(data.usageLimitPerCustomer > 0))) {
      throw new BadRequestException('Voucher cần tiền tố, số lượng phát hành và giới hạn lượt dùng hợp lệ');
    }
    if (isGift) {
      if (!data.conditionGroups?.length || data.conditionGroups.some((group) => !group.conditions?.length)) throw new BadRequestException('Chương trình tặng quà cần ít nhất một nhóm điều kiện');
      if (!data.giftGroups?.length) throw new BadRequestException('Chương trình cần ít nhất một nhóm quà');
      for (const group of data.conditionGroups) for (const condition of group.conditions) {
        const threshold = condition.metric === PromotionConditionMetric.QUANTITY ? condition.minimumQuantity : condition.metric === PromotionConditionMetric.AMOUNT ? condition.minimumAmount : condition.minimumPoints;
        if (!(threshold > 0)) throw new BadRequestException('Ngưỡng điều kiện khuyến mãi phải lớn hơn 0');
        if (condition.productIds?.length && await this.productModel.countDocuments({ _id: { $in: condition.productIds }, isDeleted: false }) !== condition.productIds.length) throw new BadRequestException('Sản phẩm trong điều kiện không hợp lệ');
        if (condition.categoryIds?.length && await this.categoryModel.countDocuments({ _id: { $in: condition.categoryIds }, isDeleted: false }) !== condition.categoryIds.length) throw new BadRequestException('Danh mục trong điều kiện không hợp lệ');
      }
      const groupCodes = new Set<string>();
      for (const gift of data.giftGroups) {
        const normalizedCode = gift.code?.trim().toUpperCase();
        if (!normalizedCode || groupCodes.has(normalizedCode)) throw new BadRequestException('Mã nhóm quà bắt buộc và không được trùng');
        groupCodes.add(normalizedCode);
        if (!(gift.giftQuantity > 0)) throw new BadRequestException('Số lượng quà phải lớn hơn 0');
        if (gift.selectionMode !== GiftSelectionMode.SAME_AS_PURCHASED && !gift.productIds?.length) throw new BadRequestException('Nhóm quà cần danh sách sản phẩm');
        if (gift.productIds?.length && await this.productModel.countDocuments({ _id: { $in: gift.productIds }, isDeleted: false }) !== gift.productIds.length) throw new BadRequestException('Sản phẩm quà không hợp lệ');
      }
    }
    if (data.status === PromotionStatus.ACTIVE && (new Date() < startAt || new Date() > endAt)) throw new BadRequestException('Chỉ có thể kích hoạt chương trình trong thời gian hiệu lực');
  }

  async create(dto: CreatePromotionDto) {
    await this.validate(dto);
    const code = dto.code.trim().toUpperCase();
    if (await this.model.exists({ code, isDeleted: false })) throw new BadRequestException('Mã chương trình đã tồn tại');
    const activationPrefix = (dto.activationPrefix || code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
    return { data: await this.model.create({ ...dto, code, activationPrefix, voucherPrefix: dto.voucherPrefix?.trim().toUpperCase(), giftGroups: dto.giftGroups?.map((group) => ({ ...group, code: group.code.trim().toUpperCase() })), activated: 0, used: 0 }) };
  }

  async update(id: string, dto: UpdatePromotionDto) {
    const current = await this.model.findOne({ _id: id, isDeleted: false }).lean();
    if (!current) throw new NotFoundException('Không tìm thấy chương trình');
    await this.validate(dto, current);
    if (dto.code && await this.model.exists({ code: dto.code.trim().toUpperCase(), _id: { $ne: id }, isDeleted: false })) throw new BadRequestException('Mã chương trình đã tồn tại');
    const update: any = { ...dto };
    if (dto.code) update.code = dto.code.trim().toUpperCase();
    if (dto.voucherPrefix) update.voucherPrefix = dto.voucherPrefix.trim().toUpperCase();
    if (dto.activationPrefix !== undefined) update.activationPrefix = (dto.activationPrefix || update.code || current.code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
    if (dto.giftGroups) update.giftGroups = dto.giftGroups.map((group) => ({ ...group, code: group.code.trim().toUpperCase() }));
    return { data: await this.model.findByIdAndUpdate(id, update, { new: true }) };
  }

  private async expireEnded() {
    const now = new Date();
    await this.model.updateMany({ status: { $in: [PromotionStatus.ACTIVE, PromotionStatus.SCHEDULED] }, endAt: { $lt: now }, isDeleted: false }, { status: PromotionStatus.ENDED });
    await this.voucherModel.updateMany({ status: VoucherStatus.ACTIVE, expiresAt: { $lt: now }, isDeleted: false }, { status: VoucherStatus.EXPIRED });
  }

  async findAll(query: PromotionQueryDto): Promise<any> {
    await this.expireEnded();
    const page = this.positiveInt(query.page, 1); const limit = this.positiveInt(query.limit, 20, 100);
    const filter: any = { isDeleted: false };
    if (query.search?.trim()) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ code: { $regex: escaped, $options: 'i' } }, { name: { $regex: escaped, $options: 'i' } }];
    }
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    const [data, totalItems] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);
    return {
      data: data.map((promotion: any) => ({ ...promotion, id: String(promotion._id) })),
      meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  async options(query: PromotionOptionsQueryDto): Promise<any> {
    await this.expireEnded();
    const page = this.positiveInt(query.page, 1); const limit = this.positiveInt(query.limit, 20, 100);
    const parseEnums = <T extends string>(value: string | undefined, allowed: T[], fallback: T[]): T[] => {
      if (!value?.trim()) return fallback;
      const values = [...new Set(value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean))] as T[];
      if (!values.length || values.some((item) => !allowed.includes(item))) throw new BadRequestException('Bộ lọc chương trình không hợp lệ');
      return values;
    };
    const types = parseEnums(query.types, Object.values(PromotionType), [PromotionType.BUY_X_GET_Y, PromotionType.BUNDLE_GIFT]);
    const statuses = parseEnums(query.statuses, Object.values(PromotionStatus), [PromotionStatus.ACTIVE, PromotionStatus.SCHEDULED, PromotionStatus.DRAFT]);
    const filter: any = { isDeleted: false, type: { $in: types }, status: { $in: statuses } };
    if (query.search?.trim()) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = ['code', 'name', 'activationPrefix'].map((field) => ({ [field]: { $regex: escaped, $options: 'i' } }));
    }
    const pipeline: any[] = [
      { $match: filter },
      { $addFields: { statusPriority: { $indexOfArray: [[PromotionStatus.ACTIVE, PromotionStatus.SCHEDULED, PromotionStatus.DRAFT, PromotionStatus.PAUSED, PromotionStatus.ENDED], '$status'] } } },
      { $sort: { statusPriority: 1, startAt: -1, code: 1 } },
      { $facet: { data: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { code: 1, name: 1, type: 1, status: 1, activationPrefix: 1, startAt: 1, endAt: 1 } }], meta: [{ $count: 'total' }] } },
    ];
    const [result] = await this.model.aggregate(pipeline);
    const total = result?.meta?.[0]?.total || 0;
    return { data: (result?.data || []).map((item: any) => ({ ...item, id: String(item._id) })), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async summary() {
    await this.expireEnded();
    const [totalPrograms, active, scheduled, usedVouchers] = await Promise.all([
      this.model.countDocuments({ isDeleted: false }),
      this.model.countDocuments({ isDeleted: false, status: PromotionStatus.ACTIVE }),
      this.model.countDocuments({ isDeleted: false, status: PromotionStatus.SCHEDULED }),
      this.voucherModel.countDocuments({ isDeleted: false, status: VoucherStatus.USED }),
    ]);
    return { data: { totalPrograms, active, scheduled, usedVouchers } };
  }

  async findOne(id: string): Promise<any> {
    const promotion = await this.model.findOne({ _id: id, isDeleted: false }).populate('categoryIds', 'name').populate('productIds', 'code name').lean();
    if (!promotion) throw new NotFoundException('Không tìm thấy chương trình');
    return { data: { ...promotion, id: String((promotion as any)._id) } };
  }

  async changeStatus(id: string, status: PromotionStatus) {
    const promotion: any = await this.model.findOne({ _id: id, isDeleted: false }).lean();
    if (!promotion) throw new NotFoundException('Không tìm thấy chương trình');
    const allowed: Record<PromotionStatus, PromotionStatus[]> = {
      DRAFT: [PromotionStatus.SCHEDULED, PromotionStatus.ACTIVE],
      SCHEDULED: [PromotionStatus.ACTIVE, PromotionStatus.PAUSED],
      ACTIVE: [PromotionStatus.PAUSED],
      PAUSED: [PromotionStatus.ACTIVE],
      ENDED: [],
    };
    if (!allowed[promotion.status].includes(status)) throw new BadRequestException(`Không thể chuyển từ ${promotion.status} sang ${status}`);
    await this.validate({ status } as UpdatePromotionDto, promotion);
    return { data: await this.model.findByIdAndUpdate(id, { status }, { new: true }) };
  }

  async assignVoucher(id: string, dto: AssignVoucherDto) {
    if (!await this.customerModel.exists({ _id: dto.customerId, isDeleted: false })) throw new NotFoundException('Không tìm thấy khách hàng');
    const promotion: any = await this.model.findOne({ _id: id, isDeleted: false, type: PromotionType.VOUCHER }).lean();
    if (!promotion) throw new NotFoundException('Không tìm thấy chương trình voucher');
    if (![PromotionStatus.ACTIVE, PromotionStatus.SCHEDULED].includes(promotion.status)) throw new BadRequestException('Chương trình chưa sẵn sàng phát hành voucher');
    const assigned = await this.voucherModel.countDocuments({ promotionId: id, customerId: dto.customerId, isDeleted: false, status: { $ne: VoucherStatus.REVOKED } });
    if (assigned >= promotion.usageLimitPerCustomer) throw new ConflictException('Khách hàng đã đạt giới hạn voucher của chương trình');
    const reserved = await this.model.findOneAndUpdate({ _id: id, activated: { $lt: promotion.quantity } }, { $inc: { activated: 1 } }, { new: true }).lean();
    if (!reserved) throw new ConflictException('Chương trình đã phát hành hết voucher');
    const serial = String(reserved.activated).padStart(6, '0');
    try {
      const voucher = await this.voucherModel.create({ code: `${promotion.voucherPrefix}${serial}`, promotionId: id, customerId: dto.customerId, status: VoucherStatus.ACTIVE, activatedAt: new Date(), expiresAt: promotion.endAt });
      return { data: voucher };
    } catch (error) {
      await this.model.updateOne({ _id: id }, { $inc: { activated: -1 } });
      throw error;
    }
  }

  async useVoucher(code: string, dto: UseVoucherDto) {
    const voucher: any = await this.voucherModel.findOne({ code: code.toUpperCase(), customerId: dto.customerId, isDeleted: false }).populate('promotionId').lean();
    if (!voucher) throw new NotFoundException('Voucher không tồn tại hoặc không thuộc khách hàng');
    const now = new Date();
    if (voucher.status !== VoucherStatus.ACTIVE || voucher.expiresAt < now) throw new ConflictException('Voucher không còn hiệu lực');
    const promotion = voucher.promotionId;
    if (promotion.status !== PromotionStatus.ACTIVE || now < promotion.startAt || now > promotion.endAt) throw new ConflictException('Chương trình khuyến mãi không hoạt động');
    const updated = await this.voucherModel.findOneAndUpdate({ _id: voucher._id, status: VoucherStatus.ACTIVE }, { status: VoucherStatus.USED, usedAt: now, orderReference: dto.orderReference }, { new: true });
    if (!updated) throw new ConflictException('Voucher đã được sử dụng');
    await this.model.updateOne({ _id: promotion._id }, { $inc: { used: 1 } });
    return { data: updated };
  }

  async performance(id: string, from?: string, to?: string) {
    if (!await this.model.exists({ _id: id, isDeleted: false })) throw new NotFoundException('Không tìm thấy chương trình');
    const filter: any = { isDeleted: false, $or: [{ promotionId: id }, { 'promotionApplications.promotionId': id }] };
    if (from || to) { filter.date = {}; if (from) filter.date.$gte = vietnamDateBoundary(from, false); if (to) filter.date.$lte = vietnamDateBoundary(to, true); }
    const invoices: any[] = await this.invoiceModel.find(filter).select('customerId subtotal discountAmount grandTotal totalAmount').lean();
    return { data: { invoiceCount: invoices.length, grossRevenue: invoices.reduce((sum, x) => sum + (x.subtotal ?? x.totalAmount ?? 0), 0), discountAmount: invoices.reduce((sum, x) => sum + (x.discountAmount || 0), 0), netRevenue: invoices.reduce((sum, x) => sum + (x.grandTotal ?? x.totalAmount ?? 0), 0), uniqueCustomers: new Set(invoices.map((x) => x.customerId && String(x.customerId)).filter(Boolean)).size } };
  }

  async promotionInvoices(id: string, pageValue?: string, limitValue?: string): Promise<any> {
    const page = this.positiveInt(pageValue, 1); const limit = this.positiveInt(limitValue, 20, 100); const filter = { isDeleted: false, $or: [{ promotionId: id }, { 'promotionApplications.promotionId': id }] };
    const [data, totalItems] = await Promise.all([this.invoiceModel.find(filter).sort({ date: -1, createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).select('code date customer customerId subtotal discountAmount grandTotal totalAmount').lean(), this.invoiceModel.countDocuments(filter)]);
    return { data, meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) } };
  }
}
