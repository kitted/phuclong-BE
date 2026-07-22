import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { getConnectionToken, InjectModel } from 'nestjs-typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { Invoices, InvoiceLineType, InvoicePaymentStatus, PaymentMethod } from './schemas/invoices.schema';
import { InvoiceCounters } from './schemas/invoice-counter.schema';
import { Products } from '../products/schemas/products.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { Customers } from '../customers/schemas/customers.schema';
import { Users, UserStatus } from '../users/schemas/users.schema';
import { DiscountType, Promotions, PromotionScope, PromotionStatus, Vouchers, VoucherStatus } from '../promotions/schemas/promotions.schema';
import { ApplyGiftPromotionDto, CreateInvoiceDto, GiftPromotionPreviewDto, InvoicePreviewDto } from './dtos/invoices.dto';
import { InventoryMovementsService } from '../inventory/inventory-movements.service';
import { InventoryLocationType, InventoryMovementType } from '../inventory/schemas/inventory-movement.schema';
import { RoleEnum } from '../users/interfaces/role.enum';
import { ID } from '../../core/interfaces/id.interface';
import { Categories } from '../categories/schemas/categories.schema';
import { PromotionRuleEngineService } from './promotion-rule-engine.service';
import { PromotionActivationsService } from '../promotion-activations/promotion-activations.service';
import { PromotionActivations, PromotionActivationStatus } from '../promotion-activations/schemas/promotion-activations.schema';
import { InvoiceQueryDto } from './dtos/invoices.dto';
import { vietnamDateBoundary } from '../trucks/truck-transfer-date';

type Actor = { id?: string; role?: RoleEnum };

@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel(Invoices) private readonly model: ReturnModelType<typeof Invoices>,
    @InjectModel(Products) private readonly productModel: ReturnModelType<typeof Products>,
    @InjectModel(Trucks) private readonly truckModel: ReturnModelType<typeof Trucks>,
    @InjectModel(Customers) private readonly customerModel: ReturnModelType<typeof Customers>,
    @InjectModel(Users) private readonly userModel: ReturnModelType<typeof Users>,
    @InjectModel(Promotions) private readonly promotionModel: ReturnModelType<typeof Promotions>,
    @InjectModel(Vouchers) private readonly voucherModel: ReturnModelType<typeof Vouchers>,
    @InjectModel(InvoiceCounters) private readonly counterModel: ReturnModelType<typeof InvoiceCounters>,
    @InjectModel(Categories) private readonly categoryModel: ReturnModelType<typeof Categories>,
    @InjectModel(PromotionActivations) private readonly activationModel: ReturnModelType<typeof PromotionActivations>,
    private readonly movements: InventoryMovementsService,
    private readonly ruleEngine: PromotionRuleEngineService,
    private readonly activations: PromotionActivationsService,
    @Inject(getConnectionToken()) private readonly connection: Connection,
  ) {}

  private mergeItems(items: Array<{ productId: string; qty: number }>) {
    if (!Array.isArray(items) || !items.length) throw new BadRequestException('Hóa đơn phải có ít nhất một sản phẩm');
    const merged = new Map<string, number>();
    for (const item of items) {
      if (!Types.ObjectId.isValid(item.productId) || !Number.isInteger(item.qty) || item.qty < 1) throw new BadRequestException('Sản phẩm hoặc số lượng không hợp lệ');
      merged.set(item.productId, (merged.get(item.productId) || 0) + item.qty);
    }
    return [...merged].map(([productId, qty]) => ({ productId, qty }));
  }

  private async calculate(dto: InvoicePreviewDto, session?: ClientSession) {
    const requested = this.mergeItems(dto.items);
    const products: any[] = await this.productModel.find({ _id: { $in: requested.map((x) => x.productId) }, isDeleted: false }).session(session || null).lean();
    if (products.length !== requested.length) throw new BadRequestException('Một hoặc nhiều sản phẩm không tồn tại');
    const categoryIds = [...new Set(products.map((product) => product.categoryId && String(product.categoryId)).filter(Boolean))];
    const categories: any[] = categoryIds.length ? await this.categoryModel.find({ _id: { $in: categoryIds }, isDeleted: false }).select('name').session(session || null).lean() : [];
    const categoryMap = new Map(categories.map((category) => [String(category._id), category.name]));
    const productMap = new Map(products.map((product) => [String(product._id), product]));
    const items = requested.map((item) => {
      const product: any = productMap.get(item.productId); const price = Number(product.sellPrice) || 0;
      return { productId: item.productId, productCode: product.code, productName: product.name, productType: product.productType || (product.categoryId ? categoryMap.get(String(product.categoryId)) : ''), brandId: product.brandId, unit: product.unit || '', categoryId: product.categoryId ? String(product.categoryId) : null, categoryName: product.categoryId ? categoryMap.get(String(product.categoryId)) || '' : '', qty: item.qty, price, lineTotal: price * item.qty, lineType: InvoiceLineType.SALE, originalPrice: price };
    });
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    let discountAmount = 0; let promotion: any = null; let voucher: any = null; let eligibleItems: any[] = [];

    if (dto.voucherCode?.trim()) {
      if (!dto.customerId) throw new BadRequestException('Voucher chỉ áp dụng cho khách hàng CRM');
      voucher = await this.voucherModel.findOne({ code: dto.voucherCode.trim().toUpperCase(), customerId: dto.customerId, status: VoucherStatus.ACTIVE, isDeleted: false }).session(session || null).lean();
      if (!voucher) throw new ConflictException('Voucher không tồn tại, không thuộc khách hàng hoặc đã được sử dụng');
      promotion = await this.promotionModel.findOne({ _id: voucher.promotionId, isDeleted: false }).session(session || null).lean();
      const now = new Date();
      if (!promotion || promotion.status !== PromotionStatus.ACTIVE || now < promotion.startAt || now > promotion.endAt || now > voucher.expiresAt) throw new ConflictException('Chương trình hoặc voucher không còn hiệu lực');
      if (subtotal < promotion.minOrderValue) throw new ConflictException('Hóa đơn chưa đạt giá trị tối thiểu của chương trình');
      const categoryIds = new Set((promotion.categoryIds || []).map(String)); const productIds = new Set((promotion.productIds || []).map(String));
      const eligible = items.filter((item) => promotion.scope === PromotionScope.ALL
        || (promotion.scope === PromotionScope.CATEGORY && item.categoryId && categoryIds.has(item.categoryId))
        || (promotion.scope === PromotionScope.PRODUCTS && productIds.has(item.productId))
        || (promotion.scope === PromotionScope.PRODUCT_TYPE && String(item.productType).toLocaleLowerCase('vi') === String(promotion.productType).toLocaleLowerCase('vi')));
      const eligibleAmount = eligible.reduce((sum, item) => sum + item.lineTotal, 0);
      if (eligibleAmount <= 0) throw new ConflictException('Không có sản phẩm nào đủ điều kiện áp dụng voucher');
      discountAmount = promotion.discountType === DiscountType.PERCENT
        ? eligibleAmount * promotion.discountValue / 100
        : promotion.discountValue;
      if (promotion.maxDiscount > 0) discountAmount = Math.min(discountAmount, promotion.maxDiscount);
      discountAmount = Math.min(Math.round(discountAmount), eligibleAmount);
      let allocated = 0;
      eligibleItems = eligible.map((item, index) => {
        const amount = index === eligible.length - 1 ? discountAmount - allocated : Math.round(discountAmount * item.lineTotal / eligibleAmount);
        allocated += amount; return { productId: item.productId, eligibleAmount: item.lineTotal, discountAmount: amount };
      });
    }
    const grandTotal = subtotal - discountAmount;
    return { items, subtotal, discountAmount, grandTotal, promotion, voucher, eligibleItems };
  }

  async preview(dto: InvoicePreviewDto) {
    const calculated = await this.calculate(dto);
    return { data: {
      subtotal: calculated.subtotal, discountAmount: calculated.discountAmount, grandTotal: calculated.grandTotal,
      promotion: calculated.promotion ? { id: String(calculated.promotion._id), code: calculated.promotion.code, name: calculated.promotion.name, voucherCode: calculated.voucher.code, discountType: calculated.promotion.discountType, discountValue: calculated.promotion.discountValue, maxDiscount: calculated.promotion.maxDiscount, scope: calculated.promotion.scope } : null,
      eligibleItems: calculated.eligibleItems,
    } };
  }

  async giftPromotionsPreview(dto: GiftPromotionPreviewDto) {
    const calculated = await this.calculate({ ...dto });
    return { data: await this.ruleEngine.preview(calculated.items) };
  }

  async applyGiftPromotion(dto: ApplyGiftPromotionDto) {
    const calculated = await this.calculate({ ...dto });
    const applied = await this.ruleEngine.apply(dto.promotionId, calculated.items, dto.giftSelections);
    return { data: { subtotal: calculated.subtotal, discountAmount: 0, grandTotal: calculated.subtotal, promotionApplication: { promotionId: String(applied.promotion._id), promotionCode: applied.promotion.code, promotionName: applied.promotion.name, applicationCount: applied.applicationCount, matchedConditions: applied.matchedConditions, gifts: applied.gifts }, items: [...calculated.items, ...applied.gifts.map((gift) => ({ ...gift, price: 0, originalPrice: gift.sellPrice, lineTotal: 0, lineType: InvoiceLineType.GIFT }))] } };
  }

  private normalizedPayments(dto: CreateInvoiceDto) {
    const map = new Map<PaymentMethod, any>();
    for (const payment of dto.payments || []) {
      if (!Object.values(PaymentMethod).includes(payment.method) || !Number.isFinite(Number(payment.amount)) || Number(payment.amount) < 0) throw new BadRequestException('Thông tin thanh toán không hợp lệ');
      const existing = map.get(payment.method);
      map.set(payment.method, existing ? { ...existing, amount: existing.amount + Number(payment.amount), referenceCode: payment.referenceCode || existing.referenceCode } : { ...payment, amount: Number(payment.amount) });
    }
    return [...map.values()].filter((payment) => payment.amount > 0);
  }

  private dayParts(date: Date) {
    const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    return `${shifted.getUTCFullYear()}${String(shifted.getUTCMonth() + 1).padStart(2, '0')}${String(shifted.getUTCDate()).padStart(2, '0')}`;
  }

  async create(dto: CreateInvoiceDto, actor: Actor = {}): Promise<any> {
    if (dto.sourceType === 'truck' && !dto.truckId) throw new BadRequestException('Phải chọn xe tải khi xuất từ xe');
    if (!Types.ObjectId.isValid(dto.salespersonId)) throw new BadRequestException('salespersonId không hợp lệ');
    const date = dto.date ? new Date(dto.date) : new Date();
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Ngày hóa đơn không hợp lệ');
    const payments = this.normalizedPayments(dto);
    if ((dto.promotionApplications || []).length > 1) throw new BadRequestException('Mỗi hóa đơn chỉ được áp dụng một chương trình tặng quà');
    const session = await this.connection.startSession(); let response: any;
    try {
      await session.withTransaction(async () => {
        const salesperson: any = await this.userModel.findOne({ _id: dto.salespersonId, role: RoleEnum.STAFF, status: UserStatus.ACTIVE, isDeleted: false }).session(session);
        if (!salesperson) throw new BadRequestException('Nhân viên bán hàng không hoạt động hoặc không tồn tại');
        const customer: any = dto.customerId ? await this.customerModel.findOne({ _id: dto.customerId, isDeleted: false }).session(session) : null;
        if (dto.customerId && !customer) throw new BadRequestException('Khách hàng không tồn tại');
        const calculated = await this.calculate(dto, session);
        const giftRequest = dto.promotionApplications?.[0];
        const giftApplication = giftRequest ? await this.ruleEngine.apply(giftRequest.promotionId, calculated.items, giftRequest.giftSelections, session, false) : null;
        const giftLines = giftApplication ? giftApplication.gifts.map((gift) => ({ ...gift, price: 0, originalPrice: gift.sellPrice, lineTotal: 0, lineType: InvoiceLineType.GIFT })) : [];
        const inventoryLines = [...calculated.items, ...giftLines];
        const paidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
        if (paidAmount > calculated.grandTotal) throw new BadRequestException('Số tiền thanh toán không được vượt tổng hóa đơn');
        const debtAmount = calculated.grandTotal - paidAmount;
        if (!customer && debtAmount > 0) throw new ConflictException('Khách lẻ phải thanh toán đủ');
        if (dto.allowDebtLimitOverride && actor.role !== RoleEnum.ADMIN) throw new ForbiddenException('Chỉ quản trị viên được phép duyệt vượt hạn mức công nợ');
        if (dto.allowDebtLimitOverride && !dto.debtOverrideReason?.trim()) throw new BadRequestException('Phải nhập lý do duyệt vượt hạn mức công nợ');
        if (customer?.debtLimit > 0 && customer.debt + debtAmount > customer.debtLimit && !dto.allowDebtLimitOverride) {
          throw new ConflictException({ code: 'CUSTOMER_DEBT_LIMIT_EXCEEDED', message: 'Hóa đơn làm vượt hạn mức công nợ', details: { currentDebt: customer.debt, invoiceDebt: debtAmount, projectedDebt: customer.debt + debtAmount, debtLimit: customer.debtLimit, exceededAmount: customer.debt + debtAmount - customer.debtLimit } });
        }
        const day = this.dayParts(date);
        const counter: any = await this.counterModel.findOneAndUpdate({ key: `INVOICE_${day}` }, { $inc: { sequence: 1 } }, { upsert: true, new: true, session });
        const code = dto.code?.trim().toUpperCase() || `HD-${day.slice(2)}-${String(counter.sequence).padStart(6, '0')}`;
        if (await this.model.exists({ code }).session(session)) throw new ConflictException('Mã hóa đơn đã tồn tại');
        const movementInputs: any[] = [];
        if (dto.sourceType === 'warehouse') {
          for (const item of inventoryLines) {
            const before: any = await this.productModel.findOneAndUpdate({ _id: item.productId, isDeleted: false, stock: { $gte: item.qty } }, { $inc: { stock: -item.qty } }, { new: false, session });
            if (!before) throw new ConflictException({ code: item.lineType === InvoiceLineType.GIFT ? 'INSUFFICIENT_GIFT_STOCK' : 'INSUFFICIENT_STOCK', message: item.lineType === InvoiceLineType.GIFT ? 'Sản phẩm quà không đủ tồn kho' : 'Số lượng tồn kho không đủ', details: { productId: item.productId, requestedQuantity: item.qty } });
            movementInputs.push({ productId: item.productId, type: item.lineType === InvoiceLineType.GIFT ? InventoryMovementType.PROMOTION_GIFT_FROM_WAREHOUSE : InventoryMovementType.WAREHOUSE_SALE, quantityChange: -item.qty, quantityBefore: before.stock, quantityAfter: before.stock - item.qty, sourceType: InventoryLocationType.WAREHOUSE });
          }
        } else {
          const truck = await this.truckModel.findOne({ _id: dto.truckId, isDeleted: false }).session(session);
          if (!truck) throw new NotFoundException('Không tìm thấy xe tải');
          for (const item of inventoryLines) {
            const before: any = await this.truckModel.findOneAndUpdate({ _id: dto.truckId, inventory: { $elemMatch: { productId: item.productId, qty: { $gte: item.qty } } } }, { $inc: { 'inventory.$.qty': -item.qty } }, { new: false, session });
            if (!before) throw new ConflictException({ code: item.lineType === InvoiceLineType.GIFT ? 'INSUFFICIENT_GIFT_STOCK' : 'INSUFFICIENT_TRUCK_STOCK', message: item.lineType === InvoiceLineType.GIFT ? 'Sản phẩm quà không đủ trên xe' : 'Số lượng hàng trên xe không đủ', details: { truckId: dto.truckId, productId: item.productId, requestedQuantity: item.qty } });
            const available = before.inventory.find((entry) => String(entry.productId) === item.productId)?.qty || 0;
            movementInputs.push({ productId: item.productId, type: item.lineType === InvoiceLineType.GIFT ? InventoryMovementType.PROMOTION_GIFT_FROM_TRUCK : InventoryMovementType.TRUCK_SALE, quantityChange: -item.qty, quantityBefore: available, quantityAfter: available - item.qty, sourceType: InventoryLocationType.TRUCK, sourceTruckId: dto.truckId });
          }
          await this.truckModel.updateOne({ _id: dto.truckId }, { $pull: { inventory: { qty: { $lte: 0 } } } }, { session });
        }
        const paymentStatus = paidAmount === 0 ? InvoicePaymentStatus.UNPAID : paidAmount < calculated.grandTotal ? InvoicePaymentStatus.PARTIAL : InvoicePaymentStatus.PAID;
        const invoice: any = (await this.model.create([{
          code, date, customer: customer?.name || dto.customer || 'Khách lẻ', customerId: customer?._id,
          sourceType: dto.sourceType, truckId: dto.truckId, note: dto.note, items: inventoryLines,
          subtotal: calculated.subtotal, discountAmount: calculated.discountAmount, grandTotal: calculated.grandTotal, totalAmount: calculated.grandTotal,
          payments, paidAmount, debtAmount, paymentStatus, debtLimitOverridden: Boolean(dto.allowDebtLimitOverride), debtOverrideReason: dto.debtOverrideReason?.trim(),
          promotionId: calculated.promotion?._id, promotionCode: calculated.promotion?.code, promotionName: calculated.promotion?.name,
          voucherId: calculated.voucher?._id, voucherCode: calculated.voucher?.code, discountType: calculated.promotion?.discountType, discountValue: calculated.promotion?.discountValue,
          promotionApplications: giftApplication ? [{ promotionId: giftApplication.promotion._id, promotionCode: giftApplication.promotion.code, promotionName: giftApplication.promotion.name, applicationCount: giftApplication.applicationCount, matchedConditions: giftApplication.matchedConditions, gifts: giftApplication.gifts }] : [],
          salespersonId: salesperson._id, salespersonCode: salesperson.employeeCode || '', salespersonName: salesperson.fullName || salesperson.username,
          createdBy: actor.id || undefined,
        }], { session }))[0];
        const activation: any = giftApplication && customer ? await this.activations.createForInvoice({ promotion: giftApplication.promotion, invoice, customer, salesperson, date }, session) : null;
        if (activation) await this.model.updateOne({ _id: invoice._id, 'promotionApplications.promotionId': giftApplication.promotion._id }, { $set: { 'promotionApplications.$.activationId': String(activation._id), 'promotionApplications.$.activationCode': activation.code } }, { session });
        if (calculated.voucher) {
          const claimed = await this.voucherModel.findOneAndUpdate({ _id: calculated.voucher._id, status: VoucherStatus.ACTIVE }, { status: VoucherStatus.USED, usedAt: new Date(), orderReference: code, invoiceId: String(invoice._id) }, { new: true, session });
          if (!claimed) throw new ConflictException('Voucher đã được sử dụng bởi giao dịch khác');
          await this.promotionModel.updateOne({ _id: calculated.promotion._id }, { $inc: { used: 1 } }, { session });
        }
        if (giftApplication) await this.promotionModel.updateOne({ _id: giftApplication.promotion._id }, { $inc: { used: 1 } }, { session });
        if (customer && debtAmount > 0) {
          const debtFilter: any = { _id: customer._id, isDeleted: false };
          if (!dto.allowDebtLimitOverride && customer.debtLimit > 0) debtFilter.$expr = { $lte: [{ $add: ['$debt', debtAmount] }, '$debtLimit'] };
          const debtUpdated = await this.customerModel.findOneAndUpdate(debtFilter, { $inc: { debt: debtAmount } }, { new: true, session });
          if (!debtUpdated) throw new ConflictException({ code: 'CUSTOMER_DEBT_LIMIT_EXCEEDED', message: 'Công nợ khách hàng vừa thay đổi và đã vượt hạn mức' });
        }
        await this.movements.recordMany(movementInputs.map((movement) => ({ ...movement, referenceType: 'INVOICE', referenceId: String(invoice._id), referenceCode: code })), session);
        response = { data: { id: String(invoice._id), code, subtotal: calculated.subtotal, discountAmount: calculated.discountAmount, grandTotal: calculated.grandTotal, paidAmount, debtAmount, paymentStatus, promotionActivations: activation ? [{ id: String(activation._id), code: activation.code, status: activation.status }] : [] } };
      });
      return response;
    } finally { await session.endSession(); }
  }

  private async invoiceFilter(query: InvoiceQueryDto): Promise<any> {
    const filter: any = { isDeleted: false };
    if (query.salespersonId) filter.salespersonId = query.salespersonId;
    if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
    if (query.from || query.to) { filter.date = {}; if (query.from) filter.date.$gte = vietnamDateBoundary(query.from, false); if (query.to) filter.date.$lte = vietnamDateBoundary(query.to, true); }
    if (query.search?.trim()) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = { $regex: escaped, $options: 'i' };
      const [customers, activations] = await Promise.all([
        this.customerModel.find({ isDeleted: false, $or: [{ code: regex }, { name: regex }, { phone: regex }] }).select('_id').limit(500).lean(),
        this.activationModel.find({ isDeleted: false, code: regex }).select('invoiceId').limit(500).lean(),
      ]);
      filter.$or = [{ code: regex }, { customer: regex }, { customerId: { $in: customers.map((item: any) => item._id) } }, { _id: { $in: activations.map((item: any) => item.invoiceId) } }, { 'promotionApplications.activationCode': regex }];
    }
    return filter;
  }

  async findAll(query: InvoiceQueryDto = {}): Promise<any> {
    const page = Math.max(1, Number(query.page) || 1); const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter = await this.invoiceFilter(query);
    const [rows, total] = await Promise.all([this.model.find(filter).select('-__v').sort({ date: -1 }).skip((page - 1) * limit).limit(limit).populate('customerId', 'code name phone').populate('salespersonId', 'employeeCode fullName').lean(), this.model.countDocuments(filter)]);
    const invoiceIds = rows.map((row: any) => row._id); const activations: any[] = invoiceIds.length ? await this.activationModel.find({ invoiceId: { $in: invoiceIds }, isDeleted: false }).select('invoiceId code status activatedAt').lean() : [];
    const byInvoice = new Map<string, any[]>(); for (const activation of activations) { const key = String(activation.invoiceId); byInvoice.set(key, [...(byInvoice.get(key) || []), activation]); }
    return { data: rows.map((row: any) => ({ ...row, id: String(row._id), activationCodes: byInvoice.get(String(row._id)) || [] })), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async summary(query: InvoiceQueryDto): Promise<any> {
    const filter = await this.invoiceFilter({ ...query, search: undefined, page: undefined, limit: undefined });
    const [values, customers, activationCount] = await Promise.all([
      this.model.aggregate([{ $match: filter }, { $group: { _id: null, invoiceCount: { $sum: 1 }, grossRevenue: { $sum: '$subtotal' }, discountAmount: { $sum: '$discountAmount' }, netRevenue: { $sum: '$grandTotal' }, paidAmount: { $sum: '$paidAmount' }, debtAmount: { $sum: '$debtAmount' } } }]),
      this.model.distinct('customerId', { ...filter, customerId: { $ne: null } }),
      this.activationModel.countDocuments({ isDeleted: false, status: PromotionActivationStatus.ACTIVE, ...(query.salespersonId ? { salespersonId: query.salespersonId } : {}), ...((query.from || query.to) ? { activatedAt: { ...(query.from ? { $gte: vietnamDateBoundary(query.from, false) } : {}), ...(query.to ? { $lte: vietnamDateBoundary(query.to, true) } : {}) } } : {}) }),
    ]);
    const row = values[0] || {};
    return { data: { invoiceCount: row.invoiceCount || 0, grossRevenue: row.grossRevenue || 0, discountAmount: row.discountAmount || 0, netRevenue: row.netRevenue || 0, paidAmount: row.paidAmount || 0, debtAmount: row.debtAmount || 0, uniqueCustomers: customers.length, promotionActivationCount: activationCount } };
  }

  async findOne(id: ID | string): Promise<any> {
    const doc = await this.model.findOne({ _id: id, isDeleted: false }).populate('customerId', 'code name phone').populate('truckId', 'code name licensePlate').populate('salespersonId', 'employeeCode fullName').lean();
    if (!doc) throw new NotFoundException('Không tìm thấy hóa đơn');
    return { data: doc };
  }
}
