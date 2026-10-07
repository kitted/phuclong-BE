import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { InjectModel } from 'nestjs-typegoose';
import { Categories } from '../categories/schemas/categories.schema';
import { Products } from '../products/schemas/products.schema';
import { Customers } from '../customers/schemas/customers.schema';
import {
  AssignVoucherDto,
  CreatePromotionDto,
  PromotionOptionsQueryDto,
  PromotionQueryDto,
  UpdatePromotionDto,
  UseVoucherDto,
} from './dtos/promotions.dto';
import {
  DiscountType,
  GiftSelectionMode,
  Promotions,
  PromotionConditionMetric,
  PromotionScope,
  PromotionStatus,
  PromotionType,
  Vouchers,
  VoucherAudience,
  VoucherConversionType,
  VoucherStatus,
} from './schemas/promotions.schema';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { vietnamDateBoundary } from '../trucks/truck-transfer-date';
import { CustomerCoinsService } from '../customer-coins/customer-coins.service';
import { CustomerCoinType } from '../customer-coins/schemas/customer-coins.schema';
import * as ExcelJS from 'exceljs';

@Injectable()
export class PromotionsService {
  constructor(
    @InjectModel(Promotions)
    private readonly model: ReturnModelType<typeof Promotions>,
    @InjectModel(Vouchers)
    private readonly voucherModel: ReturnModelType<typeof Vouchers>,
    @InjectModel(Products)
    private readonly productModel: ReturnModelType<typeof Products>,
    @InjectModel(Categories)
    private readonly categoryModel: ReturnModelType<typeof Categories>,
    @InjectModel(Customers)
    private readonly customerModel: ReturnModelType<typeof Customers>,
    @InjectModel(Invoices)
    private readonly invoiceModel: ReturnModelType<typeof Invoices>,
    private readonly customerCoins: CustomerCoinsService,
  ) {}

  private positiveInt(
    value: string | undefined,
    fallback: number,
    max?: number,
  ) {
    const n = Number(value || fallback);
    if (!Number.isInteger(n) || n < 1 || (max && n > max))
      throw new BadRequestException('Tham số phân trang không hợp lệ');
    return n;
  }

  private async validate(
    dto: CreatePromotionDto | UpdatePromotionDto,
    current?: any,
  ) {
    const data = { ...(current || {}), ...dto };
    const startAt = new Date(data.startAt);
    const endAt = new Date(data.endAt);
    if (!data.code?.trim() || !data.name?.trim())
      throw new BadRequestException('Mã và tên chương trình là bắt buộc');
    if (
      Number.isNaN(startAt.getTime()) ||
      Number.isNaN(endAt.getTime()) ||
      endAt <= startAt
    )
      throw new BadRequestException(
        'Thời gian kết thúc phải sau thời gian bắt đầu',
      );
    const isDiscount = [
      PromotionType.VOUCHER,
      PromotionType.AUTO_DISCOUNT,
    ].includes(data.type);
    const isGift = [
      PromotionType.BUY_X_GET_Y,
      PromotionType.BUNDLE_GIFT,
    ].includes(data.type);
    if (
      data.activationPrefix &&
      !String(data.activationPrefix).replace(/[^A-Z0-9]/gi, '')
    )
      throw new BadRequestException('Tiền tố mã kích hoạt phải có chữ hoặc số');
    if (
      isDiscount &&
      (!data.discountType || !(data.discountValue > 0) || !data.scope)
    )
      throw new BadRequestException(
        'Chương trình giảm giá cần loại, mức giảm và phạm vi áp dụng',
      );
    if (
      isDiscount &&
      data.discountType === DiscountType.PERCENT &&
      data.discountValue > 100
    )
      throw new BadRequestException(
        'Mức giảm phần trăm không được vượt quá 100',
      );
    if (data.scope === PromotionScope.CATEGORY) {
      if (!data.categoryIds?.length)
        throw new BadRequestException('Phải chọn ít nhất một danh mục');
      if (
        (await this.categoryModel.countDocuments({
          _id: { $in: data.categoryIds },
          isDeleted: false,
        })) !== data.categoryIds.length
      )
        throw new BadRequestException('Danh mục áp dụng không hợp lệ');
    }
    if (data.scope === PromotionScope.PRODUCTS) {
      if (!data.productIds?.length)
        throw new BadRequestException('Phải chọn ít nhất một sản phẩm');
      if (
        (await this.productModel.countDocuments({
          _id: { $in: data.productIds },
          isDeleted: false,
        })) !== data.productIds.length
      )
        throw new BadRequestException('Sản phẩm áp dụng không hợp lệ');
    }
    if (data.scope === PromotionScope.PRODUCT_TYPE && !data.productType?.trim())
      throw new BadRequestException('Loại sản phẩm là bắt buộc');
    if (
      data.type === PromotionType.VOUCHER &&
      (!data.voucherPrefix?.trim() ||
        !(data.quantity > 0) ||
        !(data.usageLimitPerCustomer > 0))
    ) {
      throw new BadRequestException(
        'Voucher cần tiền tố, số lượng phát hành và giới hạn lượt dùng hợp lệ',
      );
    }
    if (data.type === PromotionType.VOUCHER && data.advancedVoucher) {
      if (!(Number(data.minOrderValue) > 0))
        throw new BadRequestException(
          'Voucher nâng cao bắt buộc có giá trị đơn hàng tối thiểu',
        );
      if (
        data.discountType === DiscountType.PERCENT &&
        !(Number(data.maxDiscount) > 0)
      )
        throw new BadRequestException(
          'Voucher giảm phần trăm bắt buộc có số tiền giảm tối đa',
        );
      if (
        data.voucherAudience === VoucherAudience.SHARED &&
        !data.sharedCode?.trim()
      )
        throw new BadRequestException(
          'Voucher dùng chung cần có mã sử dụng chung',
        );
      if (
        data.conversionType !== VoucherConversionType.NONE &&
        !(Number(data.conversionCost) > 0)
      )
        throw new BadRequestException(
          'Voucher quy đổi cần số điểm hoặc coin lớn hơn 0',
        );
      if (
        data.conversionType !== VoucherConversionType.NONE &&
        data.voucherAudience !== VoucherAudience.CUSTOMER
      )
        throw new BadRequestException(
          'Voucher quy đổi điểm/coin phải cấp riêng cho khách hàng',
        );
      if (
        data.allowedWeekdays?.some(
          (day) => !Number.isInteger(day) || day < 0 || day > 6,
        )
      )
        throw new BadRequestException('Ngày áp dụng voucher không hợp lệ');
      const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (
        (data.dailyStartTime && !timePattern.test(data.dailyStartTime)) ||
        (data.dailyEndTime && !timePattern.test(data.dailyEndTime))
      )
        throw new BadRequestException(
          'Khung giờ voucher phải có định dạng HH:mm',
        );
      if (
        data.excludedCategoryIds?.length &&
        (await this.categoryModel.countDocuments({
          _id: { $in: data.excludedCategoryIds },
          isDeleted: false,
        })) !== data.excludedCategoryIds.length
      )
        throw new BadRequestException('Danh mục loại trừ không hợp lệ');
      if (
        data.excludedProductIds?.length &&
        (await this.productModel.countDocuments({
          _id: { $in: data.excludedProductIds },
          isDeleted: false,
        })) !== data.excludedProductIds.length
      )
        throw new BadRequestException('Sản phẩm loại trừ không hợp lệ');
    }
    if (isGift) {
      if (
        !data.conditionGroups?.length ||
        data.conditionGroups.some((group) => !group.conditions?.length)
      )
        throw new BadRequestException(
          'Chương trình tặng quà cần ít nhất một nhóm điều kiện',
        );
      if (!data.giftGroups?.length)
        throw new BadRequestException('Chương trình cần ít nhất một nhóm quà');
      for (const group of data.conditionGroups)
        for (const condition of group.conditions) {
          const threshold =
            condition.metric === PromotionConditionMetric.QUANTITY
              ? condition.minimumQuantity
              : condition.metric === PromotionConditionMetric.AMOUNT
                ? condition.minimumAmount
                : condition.minimumPoints;
          if (!(threshold > 0))
            throw new BadRequestException(
              'Ngưỡng điều kiện khuyến mãi phải lớn hơn 0',
            );
          if (
            condition.productIds?.length &&
            (await this.productModel.countDocuments({
              _id: { $in: condition.productIds },
              isDeleted: false,
            })) !== condition.productIds.length
          )
            throw new BadRequestException(
              'Sản phẩm trong điều kiện không hợp lệ',
            );
          if (
            condition.categoryIds?.length &&
            (await this.categoryModel.countDocuments({
              _id: { $in: condition.categoryIds },
              isDeleted: false,
            })) !== condition.categoryIds.length
          )
            throw new BadRequestException(
              'Danh mục trong điều kiện không hợp lệ',
            );
        }
      const groupCodes = new Set<string>();
      for (const gift of data.giftGroups) {
        const normalizedCode = gift.code?.trim().toUpperCase();
        if (!normalizedCode || groupCodes.has(normalizedCode))
          throw new BadRequestException(
            'Mã nhóm quà bắt buộc và không được trùng',
          );
        groupCodes.add(normalizedCode);
        if (!(gift.giftQuantity > 0))
          throw new BadRequestException('Số lượng quà phải lớn hơn 0');
        if (
          gift.selectionMode !== GiftSelectionMode.SAME_AS_PURCHASED &&
          !gift.productIds?.length
        )
          throw new BadRequestException('Nhóm quà cần danh sách sản phẩm');
        if (
          gift.productIds?.length &&
          (await this.productModel.countDocuments({
            _id: { $in: gift.productIds },
            isDeleted: false,
          })) !== gift.productIds.length
        )
          throw new BadRequestException('Sản phẩm quà không hợp lệ');
      }
    }
    if (
      data.status === PromotionStatus.ACTIVE &&
      (new Date() < startAt || new Date() > endAt)
    )
      throw new BadRequestException(
        'Chỉ có thể kích hoạt chương trình trong thời gian hiệu lực',
      );
  }

  async create(dto: CreatePromotionDto) {
    await this.validate(dto);
    const code = dto.code.trim().toUpperCase();
    if (await this.model.exists({ code, isDeleted: false }))
      throw new BadRequestException('Mã chương trình đã tồn tại');
    const activationPrefix = (dto.activationPrefix || code)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 7);
    const promotion: any = await this.model.create({
      ...dto,
      code,
      activationPrefix,
      sharedCode: dto.sharedCode?.trim().toUpperCase(),
      voucherPrefix: dto.voucherPrefix?.trim().toUpperCase(),
      giftGroups: dto.giftGroups?.map((group) => ({
        ...group,
        code: group.code.trim().toUpperCase(),
      })),
      activated: 0,
      used: 0,
      budgetUsed: 0,
    });
    if (
      dto.type === PromotionType.VOUCHER &&
      dto.advancedVoucher &&
      dto.voucherAudience === VoucherAudience.SHARED
    ) {
      const expiresAt = dto.dynamicExpiryDays
        ? new Date(
            Math.min(
              new Date(dto.endAt).getTime(),
              Date.now() + Number(dto.dynamicExpiryDays) * 86400000,
            ),
          )
        : new Date(dto.endAt);
      try {
        await this.voucherModel.create({
          code: dto.sharedCode!.trim().toUpperCase(),
          promotionId: promotion._id,
          status: VoucherStatus.ACTIVE,
          activatedAt: new Date(),
          expiresAt,
          usageCount: 0,
          maxUses: Number(dto.totalUsageLimit || 0),
        });
        await this.model.updateOne(
          { _id: promotion._id },
          { $set: { activated: 1 } },
        );
        promotion.activated = 1;
      } catch (error) {
        await this.model.deleteOne({ _id: promotion._id });
        throw error;
      }
    }
    let initialVoucher: any = null;
    if (
      dto.type === PromotionType.VOUCHER &&
      dto.advancedVoucher &&
      dto.voucherAudience === VoucherAudience.CUSTOMER &&
      dto.initialCustomerId
    ) {
      try {
        initialVoucher = (
          await this.assignVoucher(String(promotion._id), {
            customerId: dto.initialCustomerId,
          })
        ).data;
      } catch (error) {
        await this.voucherModel.deleteMany({ promotionId: promotion._id });
        await this.model.deleteOne({ _id: promotion._id });
        throw error;
      }
    }
    return {
      data: {
        ...(promotion.toObject ? promotion.toObject() : promotion),
        initialVoucherCode: initialVoucher?.code,
      },
    };
  }

  async update(id: string, dto: UpdatePromotionDto) {
    const current = await this.model
      .findOne({ _id: id, isDeleted: false })
      .lean();
    if (!current) throw new NotFoundException('Không tìm thấy chương trình');
    await this.validate(dto, current);
    if (
      dto.code &&
      (await this.model.exists({
        code: dto.code.trim().toUpperCase(),
        _id: { $ne: id },
        isDeleted: false,
      }))
    )
      throw new BadRequestException('Mã chương trình đã tồn tại');
    const update: any = { ...dto };
    if (dto.code) update.code = dto.code.trim().toUpperCase();
    if (dto.voucherPrefix)
      update.voucherPrefix = dto.voucherPrefix.trim().toUpperCase();
    if (dto.activationPrefix !== undefined)
      update.activationPrefix = (
        dto.activationPrefix ||
        update.code ||
        current.code
      )
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 7);
    if (dto.giftGroups)
      update.giftGroups = dto.giftGroups.map((group) => ({
        ...group,
        code: group.code.trim().toUpperCase(),
      }));
    return {
      data: await this.model.findByIdAndUpdate(id, update, { new: true }),
    };
  }

  private async expireEnded() {
    const now = new Date();
    await this.model.updateMany(
      {
        status: { $in: [PromotionStatus.ACTIVE, PromotionStatus.SCHEDULED] },
        endAt: { $lt: now },
        isDeleted: false,
      },
      { status: PromotionStatus.ENDED },
    );
    await this.voucherModel.updateMany(
      {
        status: VoucherStatus.ACTIVE,
        expiresAt: { $lt: now },
        isDeleted: false,
      },
      { status: VoucherStatus.EXPIRED },
    );
  }

  async findAll(query: PromotionQueryDto): Promise<any> {
    await this.expireEnded();
    const page = this.positiveInt(query.page, 1);
    const limit = this.positiveInt(query.limit, 20, 100);
    const filter: any = { isDeleted: false };
    if (query.search?.trim()) {
      const escaped = query.search
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { code: { $regex: escaped, $options: 'i' } },
        { name: { $regex: escaped, $options: 'i' } },
      ];
    }
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    const [data, totalItems] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.model.countDocuments(filter),
    ]);
    return {
      data: data.map((promotion: any) => ({
        ...promotion,
        id: String(promotion._id),
      })),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async options(query: PromotionOptionsQueryDto): Promise<any> {
    await this.expireEnded();
    const page = this.positiveInt(query.page, 1);
    const limit = this.positiveInt(query.limit, 20, 100);
    const parseEnums = <T extends string>(
      value: string | undefined,
      allowed: T[],
      fallback: T[],
    ): T[] => {
      if (!value?.trim()) return fallback;
      const values = [
        ...new Set(
          value
            .split(',')
            .map((item) => item.trim().toUpperCase())
            .filter(Boolean),
        ),
      ] as T[];
      if (!values.length || values.some((item) => !allowed.includes(item)))
        throw new BadRequestException('Bộ lọc chương trình không hợp lệ');
      return values;
    };
    const types = parseEnums(query.types, Object.values(PromotionType), [
      PromotionType.BUY_X_GET_Y,
      PromotionType.BUNDLE_GIFT,
    ]);
    const statuses = parseEnums(
      query.statuses,
      Object.values(PromotionStatus),
      [
        PromotionStatus.ACTIVE,
        PromotionStatus.SCHEDULED,
        PromotionStatus.DRAFT,
      ],
    );
    const filter: any = {
      isDeleted: false,
      type: { $in: types },
      status: { $in: statuses },
    };
    if (query.search?.trim()) {
      const escaped = query.search
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = ['code', 'name', 'activationPrefix'].map((field) => ({
        [field]: { $regex: escaped, $options: 'i' },
      }));
    }
    const pipeline: any[] = [
      { $match: filter },
      {
        $addFields: {
          statusPriority: {
            $indexOfArray: [
              [
                PromotionStatus.ACTIVE,
                PromotionStatus.SCHEDULED,
                PromotionStatus.DRAFT,
                PromotionStatus.PAUSED,
                PromotionStatus.ENDED,
              ],
              '$status',
            ],
          },
        },
      },
      { $sort: { statusPriority: 1, startAt: -1, code: 1 } },
      {
        $facet: {
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                code: 1,
                name: 1,
                type: 1,
                status: 1,
                activationPrefix: 1,
                startAt: 1,
                endAt: 1,
              },
            },
          ],
          meta: [{ $count: 'total' }],
        },
      },
    ];
    const [result] = await this.model.aggregate(pipeline);
    const total = result?.meta?.[0]?.total || 0;
    return {
      data: (result?.data || []).map((item: any) => ({
        ...item,
        id: String(item._id),
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async summary() {
    await this.expireEnded();
    const [totalPrograms, active, scheduled, usedVouchers] = await Promise.all([
      this.model.countDocuments({ isDeleted: false }),
      this.model.countDocuments({
        isDeleted: false,
        status: PromotionStatus.ACTIVE,
      }),
      this.model.countDocuments({
        isDeleted: false,
        status: PromotionStatus.SCHEDULED,
      }),
      this.voucherModel.countDocuments({
        isDeleted: false,
        status: VoucherStatus.USED,
      }),
    ]);
    return { data: { totalPrograms, active, scheduled, usedVouchers } };
  }

  async findOne(id: string): Promise<any> {
    const promotion = await this.model
      .findOne({ _id: id, isDeleted: false })
      .populate('categoryIds', 'name')
      .populate('productIds', 'code name')
      .lean();
    if (!promotion) throw new NotFoundException('Không tìm thấy chương trình');
    return { data: { ...promotion, id: String((promotion as any)._id) } };
  }

  async changeStatus(id: string, status: PromotionStatus) {
    const promotion: any = await this.model
      .findOne({ _id: id, isDeleted: false })
      .lean();
    if (!promotion) throw new NotFoundException('Không tìm thấy chương trình');
    const allowed: Record<PromotionStatus, PromotionStatus[]> = {
      DRAFT: [PromotionStatus.SCHEDULED, PromotionStatus.ACTIVE],
      SCHEDULED: [PromotionStatus.ACTIVE, PromotionStatus.PAUSED],
      ACTIVE: [PromotionStatus.PAUSED],
      PAUSED: [PromotionStatus.ACTIVE],
      ENDED: [],
    };
    if (!allowed[promotion.status].includes(status))
      throw new BadRequestException(
        `Không thể chuyển từ ${promotion.status} sang ${status}`,
      );
    await this.validate({ status } as UpdatePromotionDto, promotion);
    return {
      data: await this.model.findByIdAndUpdate(id, { status }, { new: true }),
    };
  }

  async assignVoucher(id: string, dto: AssignVoucherDto) {
    if (
      !(await this.customerModel.exists({
        _id: dto.customerId,
        isDeleted: false,
      }))
    )
      throw new NotFoundException('Không tìm thấy khách hàng');
    const promotion: any = await this.model
      .findOne({ _id: id, isDeleted: false, type: PromotionType.VOUCHER })
      .lean();
    if (!promotion)
      throw new NotFoundException('Không tìm thấy chương trình voucher');
    if (
      ![PromotionStatus.ACTIVE, PromotionStatus.SCHEDULED].includes(
        promotion.status,
      )
    )
      throw new BadRequestException(
        'Chương trình chưa sẵn sàng phát hành voucher',
      );
    if (promotion.voucherAudience === VoucherAudience.SHARED)
      throw new ConflictException(
        'Chương trình này sử dụng mã chung, không cần cấp riêng',
      );
    const assigned = await this.voucherModel.countDocuments({
      promotionId: id,
      customerId: dto.customerId,
      isDeleted: false,
      status: { $ne: VoucherStatus.REVOKED },
    });
    if (assigned >= 1)
      throw new ConflictException(
        'Khách hàng đã được cấp voucher của chương trình',
      );
    const reserved = await this.model
      .findOneAndUpdate(
        { _id: id, activated: { $lt: promotion.quantity } },
        { $inc: { activated: 1 } },
        { new: true },
      )
      .lean();
    if (!reserved)
      throw new ConflictException('Chương trình đã phát hành hết voucher');
    const serial = String(reserved.activated).padStart(6, '0');
    try {
      const expiresAt = promotion.dynamicExpiryDays
        ? new Date(
            Math.min(
              new Date(promotion.endAt).getTime(),
              Date.now() + Number(promotion.dynamicExpiryDays) * 86400000,
            ),
          )
        : promotion.endAt;
      const voucher: any = await this.voucherModel.create({
        code: `${promotion.voucherPrefix}${serial}`,
        promotionId: id,
        customerId: dto.customerId,
        status: VoucherStatus.ACTIVE,
        activatedAt: new Date(),
        expiresAt,
        usageCount: 0,
        maxUses: Number(promotion.maxUsesPerVoucher || 1),
      });
      if (
        promotion.conversionType &&
        promotion.conversionType !== VoucherConversionType.NONE
      ) {
        try {
          await this.customerCoins.redeem(
            dto.customerId,
            {
              coinType:
                promotion.conversionType === VoucherConversionType.PLUSEX
                  ? CustomerCoinType.PLUSEX
                  : CustomerCoinType.INVOICE,
              amount: Number(promotion.conversionCost),
              idempotencyKey: `VOUCHER:${String(voucher._id)}`,
              reason: `Quy đổi voucher ${voucher.code}`,
            },
            { name: 'Voucher khuyến mãi' },
          );
        } catch (error) {
          await this.voucherModel.deleteOne({ _id: voucher._id });
          await this.model.updateOne({ _id: id }, { $inc: { activated: -1 } });
          throw error;
        }
      }
      return { data: voucher };
    } catch (error) {
      await this.model.updateOne({ _id: id }, { $inc: { activated: -1 } });
      throw error;
    }
  }

  async useVoucher(code: string, dto: UseVoucherDto) {
    const voucher: any = await this.voucherModel
      .findOne({
        code: code.toUpperCase(),
        customerId: dto.customerId,
        isDeleted: false,
      })
      .populate('promotionId')
      .lean();
    if (!voucher)
      throw new NotFoundException(
        'Voucher không tồn tại hoặc không thuộc khách hàng',
      );
    const now = new Date();
    if (voucher.status !== VoucherStatus.ACTIVE || voucher.expiresAt < now)
      throw new ConflictException('Voucher không còn hiệu lực');
    const promotion = voucher.promotionId;
    if (
      promotion.status !== PromotionStatus.ACTIVE ||
      now < promotion.startAt ||
      now > promotion.endAt
    )
      throw new ConflictException('Chương trình khuyến mãi không hoạt động');
    const updated = await this.voucherModel.findOneAndUpdate(
      { _id: voucher._id, status: VoucherStatus.ACTIVE },
      {
        status: VoucherStatus.USED,
        usedAt: now,
        orderReference: dto.orderReference,
      },
      { new: true },
    );
    if (!updated) throw new ConflictException('Voucher đã được sử dụng');
    await this.model.updateOne({ _id: promotion._id }, { $inc: { used: 1 } });
    return { data: updated };
  }

  async performance(id: string, from?: string, to?: string) {
    if (!(await this.model.exists({ _id: id, isDeleted: false })))
      throw new NotFoundException('Không tìm thấy chương trình');
    const filter: any = {
      isDeleted: false,
      $or: [{ promotionId: id }, { 'promotionApplications.promotionId': id }],
    };
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = vietnamDateBoundary(from, false);
      if (to) filter.date.$lte = vietnamDateBoundary(to, true);
    }
    const invoices: any[] = await this.invoiceModel
      .find(filter)
      .select('customerId subtotal discountAmount grandTotal totalAmount')
      .lean();
    return {
      data: {
        invoiceCount: invoices.length,
        grossRevenue: invoices.reduce(
          (sum, x) => sum + (x.subtotal ?? x.totalAmount ?? 0),
          0,
        ),
        discountAmount: invoices.reduce(
          (sum, x) => sum + (x.discountAmount || 0),
          0,
        ),
        netRevenue: invoices.reduce(
          (sum, x) => sum + (x.grandTotal ?? x.totalAmount ?? 0),
          0,
        ),
        uniqueCustomers: new Set(
          invoices
            .map((x) => x.customerId && String(x.customerId))
            .filter(Boolean),
        ).size,
      },
    };
  }

  async promotionInvoices(
    id: string,
    pageValue?: string,
    limitValue?: string,
  ): Promise<any> {
    const page = this.positiveInt(pageValue, 1);
    const limit = this.positiveInt(limitValue, 20, 100);
    const filter = {
      isDeleted: false,
      $or: [{ promotionId: id }, { 'promotionApplications.promotionId': id }],
    };
    const [data, totalItems] = await Promise.all([
      this.invoiceModel
        .find(filter)
        .sort({ date: -1, createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select(
          'code date customer customerId subtotal discountAmount grandTotal totalAmount',
        )
        .lean(),
      this.invoiceModel.countDocuments(filter),
    ]);
    return {
      data,
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async voucherReport(query: {
    page?: string;
    limit?: string;
    search?: string;
    status?: string;
    from?: string;
    to?: string;
  }) {
    const page = this.positiveInt(query.page, 1);
    const limit = this.positiveInt(query.limit, 20, 10000);
    const voucherFilter: any = { isDeleted: false };
    const invoiceDateFilter: any = {};
    if (query.from)
      invoiceDateFilter.$gte = vietnamDateBoundary(query.from, false);
    if (query.to) invoiceDateFilter.$lte = vietnamDateBoundary(query.to, true);

    if (query.status) {
      if (query.status === 'USED') {
        voucherFilter.$or = [
          { status: VoucherStatus.USED },
          { usageCount: { $gt: 0 } },
        ];
      } else if (
        Object.values(VoucherStatus).includes(query.status as VoucherStatus)
      ) {
        voucherFilter.status = query.status;
      }
    }

    const search = String(query.search || '').trim();
    if (search) {
      const regex = new RegExp(
        search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      const [promotions, customers] = await Promise.all([
        this.model
          .find({ isDeleted: false, $or: [{ code: regex }, { name: regex }] })
          .select('_id')
          .lean(),
        this.customerModel
          .find({
            isDeleted: false,
            $or: [{ code: regex }, { name: regex }, { phone: regex }],
          })
          .select('_id')
          .lean(),
      ]);
      const searchConditions = [
        { code: regex },
        { promotionId: { $in: promotions.map((item: any) => item._id) } },
        { customerId: { $in: customers.map((item: any) => item._id) } },
      ];
      if (voucherFilter.$or)
        voucherFilter.$and = [
          { $or: voucherFilter.$or },
          { $or: searchConditions },
        ];
      else voucherFilter.$or = searchConditions;
    }

    if (Object.keys(invoiceDateFilter).length) {
      const voucherIds = await this.invoiceModel.distinct('voucherId', {
        isDeleted: false,
        voucherId: { $ne: null },
        date: invoiceDateFilter,
      });
      voucherFilter._id = { $in: voucherIds };
    }

    const [vouchers, total, allMatchingVouchers] = await Promise.all([
      this.voucherModel
        .find(voucherFilter)
        .populate('promotionId', 'code name discountType discountValue')
        .populate('customerId', 'code name phone')
        .sort({ activatedAt: -1, createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.voucherModel.countDocuments(voucherFilter),
      this.voucherModel
        .find(voucherFilter)
        .select('_id code status usageCount')
        .lean(),
    ]);
    const pageIds = vouchers.map((item: any) => item._id);
    const pageCodes = vouchers.map((item: any) => item.code);
    const allIds = allMatchingVouchers.map((item: any) => item._id);
    const invoiceFilter: any = {
      isDeleted: false,
      $or: [
        { voucherId: { $in: pageIds } },
        { voucherCode: { $in: pageCodes } },
      ],
    };
    if (Object.keys(invoiceDateFilter).length)
      invoiceFilter.date = invoiceDateFilter;
    const summaryInvoiceFilter: any = {
      isDeleted: false,
      voucherId: { $in: allIds },
    };
    if (Object.keys(invoiceDateFilter).length)
      summaryInvoiceFilter.date = invoiceDateFilter;
    const [invoices, summaryInvoices] = await Promise.all([
      this.invoiceModel
        .find(invoiceFilter)
        .sort({ date: -1, createdAt: -1 })
        .select(
          'code date customerId customerCode customerName customerPhone voucherId voucherCode discountAmount grandTotal totalAmount',
        )
        .lean(),
      this.invoiceModel
        .find(summaryInvoiceFilter)
        .select('voucherId customerId discountAmount')
        .lean(),
    ]);
    const invoicesByVoucher = new Map<string, any[]>();
    invoices.forEach((invoice: any) => {
      const key = String(invoice.voucherId || invoice.voucherCode || '');
      invoicesByVoucher.set(key, [
        ...(invoicesByVoucher.get(key) || []),
        invoice,
      ]);
    });
    const rows = vouchers.map((voucher: any) => {
      const usages =
        invoicesByVoucher.get(String(voucher._id)) ||
        invoicesByVoucher.get(voucher.code) ||
        [];
      return {
        ...voucher,
        id: String(voucher._id),
        usages,
        invoiceCount: usages.length,
        totalDiscount: usages.reduce(
          (sum, invoice) => sum + Number(invoice.discountAmount || 0),
          0,
        ),
      };
    });
    return {
      data: rows,
      summary: {
        issuedCount: total,
        activeCount: allMatchingVouchers.filter(
          (item: any) => item.status === VoucherStatus.ACTIVE,
        ).length,
        usedCodeCount: new Set(
          summaryInvoices.map((item: any) => String(item.voucherId)),
        ).size,
        usageCount: summaryInvoices.length,
        discountAmount: summaryInvoices.reduce(
          (sum, item: any) => sum + Number(item.discountAmount || 0),
          0,
        ),
        uniqueCustomers: new Set(
          summaryInvoices
            .map((item: any) => item.customerId && String(item.customerId))
            .filter(Boolean),
        ).size,
      },
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async exportVoucherReport(query: {
    search?: string;
    status?: string;
    from?: string;
    to?: string;
  }): Promise<Buffer> {
    const report = await this.voucherReport({
      ...query,
      page: '1',
      limit: '10000',
    });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Phuc Long';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Quản lý voucher', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = [
      { header: 'STT', key: 'number', width: 7 },
      { header: 'Mã voucher', key: 'voucherCode', width: 24 },
      { header: 'Chương trình', key: 'promotion', width: 32 },
      { header: 'Khách được cấp', key: 'assignedCustomer', width: 30 },
      { header: 'Trạng thái', key: 'status', width: 16 },
      { header: 'Ngày cấp', key: 'activatedAt', width: 20 },
      { header: 'Hạn sử dụng', key: 'expiresAt', width: 20 },
      { header: 'Mã hóa đơn', key: 'invoiceCode', width: 22 },
      { header: 'Ngày hóa đơn', key: 'invoiceDate', width: 20 },
      { header: 'Khách sử dụng', key: 'usedCustomer', width: 30 },
      { header: 'Số điện thoại', key: 'phone', width: 18 },
      { header: 'Tổng hóa đơn', key: 'invoiceTotal', width: 18 },
      { header: 'Số tiền giảm', key: 'discountAmount', width: 18 },
    ];
    let number = 0;
    report.data.forEach((voucher: any) => {
      const usages = voucher.usages.length ? voucher.usages : [null];
      usages.forEach((invoice: any) => {
        number += 1;
        sheet.addRow({
          number,
          voucherCode: voucher.code,
          promotion: [voucher.promotionId?.code, voucher.promotionId?.name]
            .filter(Boolean)
            .join(' · '),
          assignedCustomer:
            [voucher.customerId?.code, voucher.customerId?.name]
              .filter(Boolean)
              .join(' · ') || 'Mã dùng chung',
          status: voucher.status,
          activatedAt: voucher.activatedAt ? new Date(voucher.activatedAt) : '',
          expiresAt: voucher.expiresAt ? new Date(voucher.expiresAt) : '',
          invoiceCode: invoice?.code || '',
          invoiceDate: invoice?.date ? new Date(invoice.date) : '',
          usedCustomer: invoice?.customerName || '',
          phone: invoice?.customerPhone || '',
          invoiceTotal: Number(
            invoice?.grandTotal ?? invoice?.totalAmount ?? 0,
          ),
          discountAmount: Number(invoice?.discountAmount || 0),
        });
      });
    });
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1565C0' },
    };
    sheet.getColumn('activatedAt').numFmt = 'dd/mm/yyyy hh:mm';
    sheet.getColumn('expiresAt').numFmt = 'dd/mm/yyyy hh:mm';
    sheet.getColumn('invoiceDate').numFmt = 'dd/mm/yyyy hh:mm';
    sheet.getColumn('invoiceTotal').numFmt = '#,##0';
    sheet.getColumn('discountAmount').numFmt = '#,##0';
    sheet.autoFilter = { from: 'A1', to: 'M1' };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
