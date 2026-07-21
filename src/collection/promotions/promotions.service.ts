import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { InjectModel } from 'nestjs-typegoose';
import { Categories } from '../categories/schemas/categories.schema';
import { Products } from '../products/schemas/products.schema';
import { Customers } from '../customers/schemas/customers.schema';
import { AssignVoucherDto, CreatePromotionDto, PromotionQueryDto, UpdatePromotionDto, UseVoucherDto } from './dtos/promotions.dto';
import { DiscountType, Promotions, PromotionScope, PromotionStatus, PromotionType, Vouchers, VoucherStatus } from './schemas/promotions.schema';

@Injectable()
export class PromotionsService {
  constructor(
    @InjectModel(Promotions) private readonly model: ReturnModelType<typeof Promotions>,
    @InjectModel(Vouchers) private readonly voucherModel: ReturnModelType<typeof Vouchers>,
    @InjectModel(Products) private readonly productModel: ReturnModelType<typeof Products>,
    @InjectModel(Categories) private readonly categoryModel: ReturnModelType<typeof Categories>,
    @InjectModel(Customers) private readonly customerModel: ReturnModelType<typeof Customers>,
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
    if (!(data.discountValue > 0)) throw new BadRequestException('Mức giảm phải lớn hơn 0');
    if (data.discountType === DiscountType.PERCENT && data.discountValue > 100) throw new BadRequestException('Mức giảm phần trăm không được vượt quá 100');
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
    if (data.status === PromotionStatus.ACTIVE && (new Date() < startAt || new Date() > endAt)) throw new BadRequestException('Chỉ có thể kích hoạt chương trình trong thời gian hiệu lực');
  }

  async create(dto: CreatePromotionDto) {
    await this.validate(dto);
    const code = dto.code.trim().toUpperCase();
    if (await this.model.exists({ code, isDeleted: false })) throw new BadRequestException('Mã chương trình đã tồn tại');
    return { data: await this.model.create({ ...dto, code, voucherPrefix: dto.voucherPrefix?.trim().toUpperCase(), activated: 0, used: 0 }) };
  }

  async update(id: string, dto: UpdatePromotionDto) {
    const current = await this.model.findOne({ _id: id, isDeleted: false }).lean();
    if (!current) throw new NotFoundException('Không tìm thấy chương trình');
    await this.validate(dto, current);
    if (dto.code && await this.model.exists({ code: dto.code.trim().toUpperCase(), _id: { $ne: id }, isDeleted: false })) throw new BadRequestException('Mã chương trình đã tồn tại');
    const update: any = { ...dto };
    if (dto.code) update.code = dto.code.trim().toUpperCase();
    if (dto.voucherPrefix) update.voucherPrefix = dto.voucherPrefix.trim().toUpperCase();
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
      this.model.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);
    return {
      data: data.map((promotion: any) => ({ ...promotion, id: String(promotion._id) })),
      meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
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
}
