import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { getConnectionToken, InjectModel } from 'nestjs-typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { Invoices, InvoiceLineType, InvoicePaymentStatus, InvoiceStatus, PaymentMethod } from './schemas/invoices.schema';
import { InvoiceCounters } from './schemas/invoice-counter.schema';
import { Products } from '../products/schemas/products.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { CustomerCodeStatus, CustomerSegment, CustomerSource, Customers } from '../customers/schemas/customers.schema';
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
import { CustomerDebtLedger, DebtLedgerDirection, DebtLedgerType } from '../debt-payments/schemas/customer-debt-ledger.schema';
import { DebtPaymentCounters, DebtPayments, DebtPaymentStatus } from '../debt-payments/schemas/debt-payments.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notifications.schema';
import * as ExcelJS from 'exceljs';

type Actor = { id?: string; role?: RoleEnum };

export function resolveInvoiceSalespersonId(requestedId: string | undefined, actor: Actor): string {
  if (actor.role === RoleEnum.STAFF) {
    if (!actor.id || !Types.ObjectId.isValid(actor.id)) throw new ForbiddenException('Không xác định được tài khoản nhân viên hiện tại');
    if (requestedId && String(requestedId) !== String(actor.id)) throw new ForbiddenException('Nhân viên chỉ được tạo hóa đơn dưới chính tài khoản của mình');
    return String(actor.id);
  }
  if (!requestedId) throw new BadRequestException('Vui lòng chọn nhân viên bán hàng');
  if (!Types.ObjectId.isValid(requestedId)) throw new BadRequestException('salespersonId không hợp lệ');
  return String(requestedId);
}

export function calculateInvoiceDebtAllocation(receivedAmount: number, grandTotal: number, customerDebtBefore: number) {
  const paidAmount = Math.min(receivedAmount, grandTotal);
  const existingDebtPaidAmount = Math.min(customerDebtBefore, Math.max(0, receivedAmount - grandTotal));
  const debtAmount = Math.max(0, grandTotal - paidAmount);
  return { paidAmount, existingDebtPaidAmount, debtAmount, customerDebtAfter: customerDebtBefore + debtAmount - existingDebtPaidAmount };
}

export function canViewAllCompanyInvoices(user: { role?: RoleEnum; canViewAllInvoices?: boolean }) {
  return user.role === RoleEnum.ADMIN || (user.role === RoleEnum.STAFF && user.canViewAllInvoices === true);
}

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
    @InjectModel(CustomerDebtLedger) private readonly debtLedgerModel: ReturnModelType<typeof CustomerDebtLedger>,
    @InjectModel(DebtPayments) private readonly debtPaymentModel: ReturnModelType<typeof DebtPayments>,
    @InjectModel(DebtPaymentCounters) private readonly debtPaymentCounterModel: ReturnModelType<typeof DebtPaymentCounters>,
    private readonly movements: InventoryMovementsService,
    private readonly ruleEngine: PromotionRuleEngineService,
    private readonly activations: PromotionActivationsService,
    private readonly notifications: NotificationsService,
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

  private async calculate(dto: InvoicePreviewDto, session?: ClientSession, actorId?: string) {
    if (!Array.isArray(dto.items) || !dto.items.length) throw new BadRequestException('Hóa đơn phải có ít nhất một sản phẩm');
    const requested = dto.items.map((item) => {
      if (!Types.ObjectId.isValid(item.productId) || !Number.isInteger(item.qty) || item.qty < 1) throw new BadRequestException('Sản phẩm hoặc số lượng không hợp lệ');
      if (item.unitPriceOverride !== undefined && (!Number.isFinite(Number(item.unitPriceOverride)) || Number(item.unitPriceOverride) <= 0)) throw new BadRequestException('Giá bán tùy chỉnh phải lớn hơn 0');
      return { productId: item.productId, qty: item.qty, unitPriceOverride: item.unitPriceOverride === undefined ? undefined : Number(item.unitPriceOverride) };
    });
    const productIds = [...new Set(requested.map((item) => item.productId))];
    const products: any[] = await this.productModel.find({ _id: { $in: productIds }, isDeleted: false }).session(session || null).lean();
    if (products.length !== productIds.length) throw new BadRequestException('Một hoặc nhiều sản phẩm không tồn tại');
    const categoryIds = [...new Set(products.map((product) => product.categoryId && String(product.categoryId)).filter(Boolean))];
    const categories: any[] = categoryIds.length ? await this.categoryModel.find({ _id: { $in: categoryIds }, isDeleted: false }).select('name').session(session || null).lean() : [];
    const categoryMap = new Map(categories.map((category) => [String(category._id), category.name]));
    const productMap = new Map(products.map((product) => [String(product._id), product]));
    const items = requested.map((item) => {
      const product: any = productMap.get(item.productId); const catalogPrice = Number(product.sellPrice) || 0;
      const unitPriceOverride = item.unitPriceOverride; const price = unitPriceOverride ?? catalogPrice;
      return { productId: item.productId, productCode: product.code, productName: product.name, productType: product.productType || (product.categoryId ? categoryMap.get(String(product.categoryId)) : ''), brandId: product.brandId, unit: product.unit || '', categoryId: product.categoryId ? String(product.categoryId) : null, categoryName: product.categoryId ? categoryMap.get(String(product.categoryId)) || '' : '', qty: item.qty, catalogPrice, price, priceOverridden: unitPriceOverride !== undefined, unitPriceOverride, priceOverriddenBy: unitPriceOverride !== undefined ? actorId : undefined, lineTotal: price * item.qty, lineType: InvoiceLineType.SALE, originalPrice: catalogPrice, costPrice: Number(product.costPrice) || 0 };
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

  private async directGiftLines(gifts: Array<{ productId: string; qty: number }> | undefined, session: ClientSession) {
    if (!gifts?.length) return [];
    const requested = this.mergeItems(gifts);
    const products: any[] = await this.productModel.find({ _id: { $in: requested.map((item) => item.productId) }, isDeleted: false }).session(session).lean();
    if (products.length !== requested.length) throw new BadRequestException('Một hoặc nhiều sản phẩm quà tặng không tồn tại');
    const productMap = new Map(products.map((product) => [String(product._id), product]));
    return requested.map((item) => {
      const product: any = productMap.get(item.productId);
      return { productId: item.productId, productCode: product.code, productName: product.name, unit: product.unit || '', qty: item.qty, catalogPrice: Number(product.sellPrice) || 0, price: 0, priceOverridden: false, originalPrice: Number(product.sellPrice) || 0, costPrice: Number(product.costPrice) || 0, lineTotal: 0, lineType: InvoiceLineType.GIFT };
    });
  }

  async preview(dto: InvoicePreviewDto) {
    const calculated = await this.calculate(dto);
    return { data: {
      subtotal: calculated.subtotal, discountAmount: calculated.discountAmount, grandTotal: calculated.grandTotal,
      promotion: calculated.promotion ? { id: String(calculated.promotion._id), code: calculated.promotion.code, name: calculated.promotion.name, voucherCode: calculated.voucher.code, discountType: calculated.promotion.discountType, discountValue: calculated.promotion.discountValue, maxDiscount: calculated.promotion.maxDiscount, scope: calculated.promotion.scope } : null,
      eligibleItems: calculated.eligibleItems, items: calculated.items,
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

  private splitPayments(payments: any[], invoiceAmount: number) {
    let invoiceRemaining = invoiceAmount;
    const invoicePayments: any[] = []; const debtPayments: any[] = [];
    for (const payment of payments) {
      const invoicePart = Math.min(invoiceRemaining, payment.amount);
      const debtPart = payment.amount - invoicePart;
      if (invoicePart > 0) invoicePayments.push({ ...payment, amount: invoicePart });
      if (debtPart > 0) debtPayments.push({ ...payment, amount: debtPart });
      invoiceRemaining -= invoicePart;
    }
    return { invoicePayments, debtPayments };
  }

  async create(dto: CreateInvoiceDto, actor: Actor = {}): Promise<any> {
    const salespersonId = resolveInvoiceSalespersonId(dto.salespersonId, actor);
    if (dto.customerId && dto.newCustomer) throw new BadRequestException('Không được gửi đồng thời customerId và newCustomer');
    if (dto.newCustomer && !dto.newCustomer.name?.trim()) throw new BadRequestException('Tên khách hàng mới là bắt buộc');
    if (dto.sourceType === 'truck' && !dto.truckId) throw new BadRequestException('Phải chọn xe tải khi xuất từ xe');
    const date = dto.date ? new Date(dto.date) : new Date();
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Ngày hóa đơn không hợp lệ');
    const payments = this.normalizedPayments(dto);
    if ((dto.promotionApplications || []).length > 1) throw new BadRequestException('Mỗi hóa đơn chỉ được áp dụng một chương trình tặng quà');
    if (dto.gifts?.length && dto.promotionApplications?.length) throw new BadRequestException('Không thể dùng đồng thời quà tặng trực tiếp và chương trình tặng quà');
    const session = await this.connection.startSession(); let response: any;
    try {
      await session.withTransaction(async () => {
        const salesperson: any = await this.userModel.findOne({ _id: salespersonId, role: RoleEnum.STAFF, status: UserStatus.ACTIVE, isDeleted: false }).session(session);
        if (!salesperson) throw new BadRequestException('Nhân viên bán hàng không hoạt động hoặc không tồn tại');
        let customer: any = dto.customerId ? await this.customerModel.findOne({ _id: dto.customerId, isDeleted: false }).session(session) : null;
        if (dto.customerId && !customer) throw new BadRequestException('Khách hàng không tồn tại');
        if (dto.newCustomer) {
          const phones = String(dto.newCustomer.phone || '').split(/[,;|/]+/).map((phone) => phone.replace(/\D/g, '')).filter(Boolean).map((phone) => phone.startsWith('0') ? phone : `0${phone}`).filter((phone, index, values) => values.indexOf(phone) === index);
          customer = (await this.customerModel.create([{
            name: dto.newCustomer.name.trim(),
            phone: phones.join(', ') || undefined,
            phones,
            address: dto.newCustomer.address?.trim() || undefined,
            note: dto.newCustomer.note?.trim() || undefined,
            source: CustomerSource.NEW,
            segment: CustomerSegment.NEW_CUSTOMER,
            codeStatus: CustomerCodeStatus.UNASSIGNED,
            debt: 0,
            debtLimit: 0,
          }], { session }))[0];
        }
        const calculated = await this.calculate(dto, session, actor.id);
        const directGiftLines = await this.directGiftLines(dto.gifts, session);
        const giftRequest = dto.promotionApplications?.[0];
        const giftApplication = giftRequest ? await this.ruleEngine.apply(giftRequest.promotionId, calculated.items, giftRequest.giftSelections, session, false) : null;
        const giftLines = giftApplication ? giftApplication.gifts.map((gift) => ({ ...gift, catalogPrice: gift.sellPrice, price: 0, priceOverridden: false, originalPrice: gift.sellPrice, lineTotal: 0, lineType: InvoiceLineType.GIFT })) : [];
        const inventoryLines = [...calculated.items, ...giftLines, ...directGiftLines];
        const receivedAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
        if (dto.applyExcessToDebt && !customer) throw new BadRequestException('Chỉ khách hàng CRM mới được thanh toán kèm trừ nợ cũ');
        if (!dto.applyExcessToDebt && receivedAmount > calculated.grandTotal) throw new BadRequestException('Số tiền thanh toán không được vượt tổng hóa đơn');
        if (dto.applyExcessToDebt && receivedAmount > calculated.grandTotal + Number(customer?.debt || 0)) throw new BadRequestException('Số tiền nhận vượt tổng hóa đơn và công nợ cũ');
        const allocation = calculateInvoiceDebtAllocation(receivedAmount, calculated.grandTotal, Number(customer?.debt || 0));
        const paidAmount = allocation.paidAmount;
        const existingDebtPaidAmount = dto.applyExcessToDebt ? allocation.existingDebtPaidAmount : 0;
        const debtAmount = allocation.debtAmount;
        const customerDebtAfter = customer ? Number(customer.debt || 0) + debtAmount - existingDebtPaidAmount : 0;
        const split = this.splitPayments(payments, paidAmount);
        if (!customer && debtAmount > 0) throw new ConflictException('Khách lẻ phải thanh toán đủ');
        if (dto.allowDebtLimitOverride && !dto.debtOverrideReason?.trim()) throw new BadRequestException('Phải nhập lý do cho khách mua vượt hạn mức công nợ');
        if (customer?.debtLimit > 0 && customerDebtAfter > customer.debtLimit && !dto.allowDebtLimitOverride) {
          throw new ConflictException({ code: 'CUSTOMER_DEBT_LIMIT_EXCEEDED', message: 'Hóa đơn làm vượt hạn mức công nợ', details: { currentDebt: customer.debt, invoiceDebt: debtAmount, existingDebtPaidAmount, projectedDebt: customerDebtAfter, debtLimit: customer.debtLimit, exceededAmount: customerDebtAfter - customer.debtLimit } });
        }
        const day = this.dayParts(date);
        const counter: any = await this.counterModel.findOneAndUpdate({ key: `INVOICE_${day}` }, { $inc: { sequence: 1 } }, { upsert: true, new: true, session });
        const code = dto.code?.trim().toUpperCase() || `HD-${day.slice(2)}-${String(counter.sequence).padStart(6, '0')}`;
        if (await this.model.exists({ code }).session(session)) throw new ConflictException('Mã hóa đơn đã tồn tại');
        let giftCode: string | undefined;
        if (directGiftLines.length) {
          const giftCounter: any = await this.counterModel.findOneAndUpdate({ key: `INVOICE_GIFT_${day}` }, { $inc: { sequence: 1 } }, { upsert: true, new: true, session });
          giftCode = `QT-${day.slice(2)}-${String(giftCounter.sequence).padStart(4, '0')}`;
        }
        const movementInputs: any[] = [];
        const inventoryGroups = new Map<string, any[]>();
        for (const item of inventoryLines) inventoryGroups.set(String(item.productId), [...(inventoryGroups.get(String(item.productId)) || []), item]);
        if (dto.sourceType === 'warehouse') {
          for (const [productId, lines] of inventoryGroups) {
            const totalQty = lines.reduce((sum, item) => sum + item.qty, 0);
            const before: any = await this.productModel.findOneAndUpdate({ _id: productId, isDeleted: false, stock: { $gte: totalQty } }, { $inc: { stock: -totalQty } }, { new: false, session });
            if (!before) throw new ConflictException({ code: lines.some((item) => item.lineType === InvoiceLineType.GIFT) ? 'INSUFFICIENT_GIFT_STOCK' : 'INSUFFICIENT_STOCK', message: 'Tổng số lượng bán và quà vượt tồn kho', details: { productId, requestedQuantity: totalQty } });
            let quantityBefore = before.stock;
            for (const item of lines) { const quantityAfter = quantityBefore - item.qty; movementInputs.push({ productId, type: item.lineType === InvoiceLineType.GIFT ? (directGiftLines.length ? InventoryMovementType.INVOICE_GIFT_FROM_WAREHOUSE : InventoryMovementType.PROMOTION_GIFT_FROM_WAREHOUSE) : InventoryMovementType.WAREHOUSE_SALE, quantityChange: -item.qty, quantityBefore, quantityAfter, sourceType: InventoryLocationType.WAREHOUSE }); quantityBefore = quantityAfter; }
          }
        } else {
          const truck = await this.truckModel.findOne({ _id: dto.truckId, isDeleted: false }).session(session);
          if (!truck) throw new NotFoundException('Không tìm thấy xe tải');
          for (const [productId, lines] of inventoryGroups) {
            const totalQty = lines.reduce((sum, item) => sum + item.qty, 0);
            const before: any = await this.truckModel.findOneAndUpdate({ _id: dto.truckId, inventory: { $elemMatch: { productId, qty: { $gte: totalQty } } } }, { $inc: { 'inventory.$.qty': -totalQty } }, { new: false, session });
            if (!before) throw new ConflictException({ code: lines.some((item) => item.lineType === InvoiceLineType.GIFT) ? 'INSUFFICIENT_GIFT_STOCK' : 'INSUFFICIENT_TRUCK_STOCK', message: 'Tổng số lượng bán và quà vượt tồn kho trên xe', details: { truckId: dto.truckId, productId, requestedQuantity: totalQty } });
            let quantityBefore = before.inventory.find((entry) => String(entry.productId) === productId)?.qty || 0;
            for (const item of lines) { const quantityAfter = quantityBefore - item.qty; movementInputs.push({ productId, type: item.lineType === InvoiceLineType.GIFT ? (directGiftLines.length ? InventoryMovementType.INVOICE_GIFT_FROM_TRUCK : InventoryMovementType.PROMOTION_GIFT_FROM_TRUCK) : InventoryMovementType.TRUCK_SALE, quantityChange: -item.qty, quantityBefore, quantityAfter, sourceType: InventoryLocationType.TRUCK, sourceTruckId: dto.truckId }); quantityBefore = quantityAfter; }
          }
          await this.truckModel.updateOne({ _id: dto.truckId }, { $pull: { inventory: { qty: { $lte: 0 } } } }, { session });
        }
        const paymentStatus = paidAmount === 0 ? InvoicePaymentStatus.UNPAID : paidAmount < calculated.grandTotal ? InvoicePaymentStatus.PARTIAL : InvoicePaymentStatus.PAID;
        const paymentDueDate = dto.paymentDueDate ? new Date(dto.paymentDueDate) : dto.paymentTermDays ? new Date(date.getTime() + dto.paymentTermDays * 86400000) : undefined;
        const invoice: any = (await this.model.create([{
          code, giftCode, date, customer: customer?.name || dto.customer || 'Khách lẻ', customerId: customer?._id,
          customerCode: customer?.code, customerCodeStatus: customer?.codeStatus, customerName: customer?.name, customerPhone: customer?.phone,
          sourceType: dto.sourceType, truckId: dto.truckId, note: dto.note, items: inventoryLines,
          subtotal: calculated.subtotal, discountAmount: calculated.discountAmount, grandTotal: calculated.grandTotal, totalAmount: calculated.grandTotal,
          payments: split.invoicePayments, paidAmount, receivedAmount, existingDebtPaidAmount, debtAmount, initialPaidAmount: paidAmount, initialDebtAmount: debtAmount, customerDebtBefore: customer ? Number(customer.debt || 0) : 0, customerDebtAfter, paymentStatus, paymentDueDate, paymentTermDays: dto.paymentTermDays, debtLimitOverridden: Boolean(dto.allowDebtLimitOverride), debtOverrideReason: dto.debtOverrideReason?.trim(),
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
        let debtPaymentCode: string | undefined;
        if (customer && (debtAmount > 0 || existingDebtPaidAmount > 0)) {
          const netDebtChange = debtAmount - existingDebtPaidAmount;
          const debtFilter: any = { _id: customer._id, isDeleted: false, debt: Number(customer.debt || 0) };
          if (!dto.allowDebtLimitOverride && customer.debtLimit > 0) debtFilter.$expr = { $lte: [{ $add: ['$debt', netDebtChange] }, '$debtLimit'] };
          const debtUpdated = await this.customerModel.findOneAndUpdate(debtFilter, { $inc: { debt: netDebtChange } }, { new: true, session });
          if (!debtUpdated) throw new ConflictException({ code: 'CUSTOMER_DEBT_CHANGED', message: 'Công nợ khách hàng vừa thay đổi, vui lòng thử lại' });
          if (debtAmount > 0) {
            await this.debtLedgerModel.create([{ customerId: customer._id, customerCode: customer.code, type: DebtLedgerType.INVOICE_DEBT, direction: DebtLedgerDirection.INCREASE, amount: debtAmount, previousDebt: customer.debt || 0, increaseAmount: debtAmount, decreaseAmount: 0, balanceAfter: Number(customer.debt || 0) + debtAmount, previousDebtLimit: customer.debtLimit || 0, debtLimitAfter: customer.debtLimit || 0, occurredAt: date, effectiveAt: date, referenceType: 'INVOICE', referenceId: String(invoice._id), referenceCode: code, invoiceId: invoice._id, createdBy: actor.id }], { session });
          }
          if (existingDebtPaidAmount > 0) {
            const collector: any = await this.userModel.findOne({ _id: actor.id, isDeleted: false, status: { $ne: UserStatus.INACTIVE }, role: { $in: [RoleEnum.ADMIN, RoleEnum.STAFF] } }).select('_id employeeCode fullName username role').session(session).lean();
            if (!collector) throw new ForbiddenException('Tài khoản người thu không còn hoạt động');
            const receiptCounter: any = await this.debtPaymentCounterModel.findOneAndUpdate({ key: `DEBT_PAYMENT_${day.slice(2)}` }, { $inc: { sequence: 1 } }, { upsert: true, new: true, session });
            debtPaymentCode = `PTCN-${day.slice(2)}-${String(receiptCounter.sequence).padStart(6, '0')}`;
            const receiptId = new Types.ObjectId(); let remaining = existingDebtPaidAmount; const allocations: any[] = [];
            const oldInvoices: any[] = await this.model.find({ customerId: customer._id, debtAmount: { $gt: 0 }, isDeleted: false }).sort({ date: 1, _id: 1 }).session(session).lean();
            for (const oldInvoice of oldInvoices) {
              if (remaining <= 0) break;
              const debtBefore = Number(oldInvoice.debtAmount || 0); const allocated = Math.min(remaining, debtBefore); const debtAfter = debtBefore - allocated; const paidAfter = Number(oldInvoice.paidAmount || 0) + allocated;
              const result = await this.model.updateOne({ _id: oldInvoice._id, debtAmount: debtBefore, isDeleted: false }, { $set: { debtAmount: debtAfter, paidAmount: paidAfter, paymentStatus: debtAfter === 0 ? InvoicePaymentStatus.PAID : InvoicePaymentStatus.PARTIAL }, $push: { debtPayments: { receiptId: String(receiptId), receiptCode: debtPaymentCode, amount: allocated, paidAt: date } } }, { session });
              if (result.modifiedCount !== 1) throw new ConflictException('Công nợ hóa đơn cũ vừa thay đổi, vui lòng thử lại');
              allocations.push({ invoiceId: oldInvoice._id, invoiceCode: oldInvoice.code, amount: allocated, debtBefore, debtAfter }); remaining -= allocated;
            }
            await this.debtPaymentModel.create([{ _id: receiptId, code: debtPaymentCode, date, customerId: customer._id, customerCode: customer.code, customerName: customer.name, customerPhone: customer.phone || '', amount: existingDebtPaidAmount, payments: split.debtPayments, allocations, unallocatedAmount: remaining, customerDebtBefore: customer.debt || 0, customerDebtAfter: Math.max(0, Number(customer.debt || 0) - existingDebtPaidAmount), note: `Thu nợ cũ cùng hóa đơn ${code}`, collectorId: collector._id, collectorCode: collector.employeeCode, collectorName: collector.fullName || collector.username, createdBy: collector._id, createdByRole: collector.role }], { session });
            await this.model.updateOne({ _id: invoice._id }, { $set: { debtPaymentId: String(receiptId), debtPaymentCode } }, { session });
            await this.debtLedgerModel.create([{ customerId: customer._id, customerCode: customer.code, type: DebtLedgerType.DEBT_PAYMENT, direction: DebtLedgerDirection.DECREASE, amount: existingDebtPaidAmount, previousDebt: Number(customer.debt || 0) + debtAmount, increaseAmount: 0, decreaseAmount: existingDebtPaidAmount, balanceAfter: customerDebtAfter, previousDebtLimit: customer.debtLimit || 0, debtLimitAfter: customer.debtLimit || 0, occurredAt: date, effectiveAt: date, referenceType: 'DEBT_PAYMENT', referenceId: String(receiptId), referenceCode: debtPaymentCode, debtPaymentId: receiptId, createdBy: String(collector._id), note: `Thu nợ cũ cùng hóa đơn ${code}` }], { session });
          }
        }
        await this.movements.recordMany(movementInputs.map((movement) => ({ ...movement, referenceType: 'INVOICE', referenceId: String(invoice._id), referenceCode: code })), session);
        response = { data: { id: String(invoice._id), code, giftCode, customer: customer ? { id: String(customer._id), code: customer.code || null, codeStatus: customer.codeStatus || CustomerCodeStatus.UNASSIGNED, name: customer.name } : null, items: inventoryLines, subtotal: calculated.subtotal, discountAmount: calculated.discountAmount, grandTotal: calculated.grandTotal, paidAmount, receivedAmount, existingDebtPaidAmount, debtAmount, customerDebtBefore: customer ? Number(customer.debt || 0) : 0, customerDebtAfter, debtPaymentCode, paymentStatus, promotionActivations: activation ? [{ id: String(activation._id), code: activation.code, status: activation.status }] : [] } };
      });
      await this.notifications.create({ type: NotificationType.INVOICE_CREATED, title: 'Hóa đơn mới', message: `Đã tạo hóa đơn ${response.data.code}`, entityType: 'INVOICE', entityId: response.data.id, entityCode: response.data.code, staffRecipientId: salespersonId }).catch(() => undefined);
      return response;
    } finally { await session.endSession(); }
  }

  async reverse(id: string, reasonValue: string, actor: Actor = {}): Promise<any> {
    const reason = String(reasonValue || '').trim();
    if (!reason) throw new BadRequestException('Phải nhập lý do hoàn hóa đơn');
    if (actor.role !== RoleEnum.ADMIN || !actor.id) throw new ForbiddenException('Chỉ quản trị viên được hoàn hóa đơn');
    const session = await this.connection.startSession(); let response: any;
    try {
      await session.withTransaction(async () => {
        const invoice: any = await this.model.findOneAndUpdate(
          { _id: id, isDeleted: false, status: { $ne: InvoiceStatus.REVERSED } },
          { $set: { status: InvoiceStatus.REVERSED, reversedAt: new Date(), reversedBy: actor.id, reversalReason: reason } },
          { new: false, session },
        );
        if (!invoice) throw new ConflictException({ code: 'INVOICE_ALREADY_REVERSED_OR_NOT_FOUND', message: 'Hóa đơn không tồn tại hoặc đã được hoàn' });
        const linkedReceiptId = invoice.debtPaymentId ? String(invoice.debtPaymentId) : undefined;
        const allocatedReceipt = await this.debtPaymentModel.findOne({
          isDeleted: false, status: DebtPaymentStatus.ACTIVE, 'allocations.invoiceId': invoice._id,
          ...(linkedReceiptId ? { _id: { $ne: linkedReceiptId } } : {}),
        }).session(session).lean();
        if (allocatedReceipt) throw new ConflictException({ code: 'INVOICE_HAS_DEBT_PAYMENT_ALLOCATIONS', message: 'Hãy hủy phiếu thu đã phân bổ cho hóa đơn trước khi hoàn' });

        const reversalMovements: any[] = [];
        for (const item of invoice.items || []) {
          if (invoice.sourceType === 'warehouse') {
            const before: any = await this.productModel.findOneAndUpdate({ _id: item.productId, isDeleted: false }, { $inc: { stock: item.qty } }, { new: false, session });
            if (!before) throw new ConflictException('Không thể hoàn hàng về kho');
            reversalMovements.push({ productId: item.productId, type: InventoryMovementType.INVOICE_REVERSAL_TO_WAREHOUSE, quantityChange: item.qty, quantityBefore: before.stock, quantityAfter: before.stock + item.qty, destinationType: InventoryLocationType.WAREHOUSE });
          } else {
            const truck: any = await this.truckModel.findOne({ _id: invoice.truckId, isDeleted: false }).session(session);
            if (!truck) throw new ConflictException('Xe nguồn của hóa đơn không còn tồn tại');
            const entry = (truck.inventory || []).find((value) => String(value.productId) === String(item.productId));
            const quantityBefore = Number(entry?.qty || 0);
            if (entry) await this.truckModel.updateOne({ _id: truck._id, 'inventory.productId': item.productId }, { $inc: { 'inventory.$.qty': item.qty } }, { session });
            else await this.truckModel.updateOne({ _id: truck._id }, { $push: { inventory: { productId: item.productId, qty: item.qty } } }, { session });
            reversalMovements.push({ productId: item.productId, type: InventoryMovementType.INVOICE_REVERSAL_TO_TRUCK, quantityChange: item.qty, quantityBefore, quantityAfter: quantityBefore + item.qty, destinationType: InventoryLocationType.TRUCK, destinationTruckId: truck._id });
          }
        }

        let linkedReceipt: any = null;
        if (linkedReceiptId) {
          linkedReceipt = await this.debtPaymentModel.findOneAndUpdate(
            { _id: linkedReceiptId, status: DebtPaymentStatus.ACTIVE, isDeleted: false },
            { $set: { status: DebtPaymentStatus.CANCELLED, cancelledBy: actor.id, cancelledAt: new Date(), cancelReason: `Hoàn hóa đơn ${invoice.code}: ${reason}` } },
            { new: false, session },
          );
          if (linkedReceipt) {
            for (const allocation of linkedReceipt.allocations || []) {
              const old: any = await this.model.findOne({ _id: allocation.invoiceId, isDeleted: false }).session(session);
              if (!old) throw new ConflictException('Không thể khôi phục công nợ hóa đơn từ phiếu thu liên kết');
              const debtAmount = Number(old.debtAmount || 0) + allocation.amount;
              const paidAmount = Math.max(0, Number(old.paidAmount || 0) - allocation.amount);
              await this.model.updateOne({ _id: old._id }, { $set: { debtAmount, paidAmount, paymentStatus: paidAmount === 0 ? InvoicePaymentStatus.UNPAID : InvoicePaymentStatus.PARTIAL }, $pull: { debtPayments: { receiptId: linkedReceiptId } } }, { session });
            }
          }
        }
        const debtIncreaseFromReceipt = Number(linkedReceipt?.amount || 0);
        const remainingInvoiceDebt = Number(invoice.debtAmount || 0);
        const netDebtChange = debtIncreaseFromReceipt - remainingInvoiceDebt;
        if (invoice.customerId && netDebtChange !== 0) {
          const customer: any = await this.customerModel.findOneAndUpdate({ _id: invoice.customerId, isDeleted: false, debt: { $gte: Math.max(0, remainingInvoiceDebt - debtIncreaseFromReceipt) } }, { $inc: { debt: netDebtChange } }, { new: true, session });
          if (!customer) throw new ConflictException('Không thể cập nhật công nợ khi hoàn hóa đơn');
          await this.debtLedgerModel.create([{ customerId: invoice.customerId, customerCode: invoice.customerCode, type: DebtLedgerType.ADJUSTMENT, direction: netDebtChange > 0 ? DebtLedgerDirection.INCREASE : DebtLedgerDirection.DECREASE, amount: Math.abs(netDebtChange), previousDebt: customer.debt - netDebtChange, increaseAmount: Math.max(0, netDebtChange), decreaseAmount: Math.max(0, -netDebtChange), balanceAfter: customer.debt, occurredAt: new Date(), effectiveAt: new Date(), referenceType: 'INVOICE_REVERSAL', referenceId: String(invoice._id), referenceCode: invoice.code, invoiceId: invoice._id, createdBy: actor.id, note: reason }], { session });
        }
        if (invoice.voucherId) await this.voucherModel.updateOne({ _id: invoice.voucherId, invoiceId: String(invoice._id) }, { $set: { status: VoucherStatus.ACTIVE }, $unset: { usedAt: 1, orderReference: 1, invoiceId: 1 } }, { session });
        await this.activationModel.updateMany({ invoiceId: invoice._id, status: PromotionActivationStatus.ACTIVE }, { $set: { status: PromotionActivationStatus.REVOKED, statusReason: reason, statusChangedAt: new Date(), statusChangedBy: actor.id } }, { session });
        const day = this.dayParts(new Date());
        const counter: any = await this.counterModel.findOneAndUpdate({ key: `INVOICE_REVERSAL_${day}` }, { $inc: { sequence: 1 } }, { upsert: true, new: true, session });
        const reversalCode = `HT-${day.slice(2)}-${String(counter.sequence).padStart(6, '0')}`;
        await this.model.updateOne({ _id: invoice._id }, { $set: { reversalCode }, $unset: { giftCode: 1 } }, { session });
        await this.movements.recordMany(reversalMovements.map((movement) => ({ ...movement, referenceType: 'INVOICE_REVERSAL', referenceId: String(invoice._id), referenceCode: reversalCode, createdBy: actor.id })), session);
        response = { data: { id: String(invoice._id), code: invoice.code, status: InvoiceStatus.REVERSED, reversalCode, reversalReason: reason } };
      });
      await this.notifications.create({ type: NotificationType.INVOICE_REVERSED, title: 'Hoàn hóa đơn', message: `Đã hoàn hóa đơn ${response.data.code}`, entityType: 'INVOICE', entityId: response.data.id, entityCode: response.data.code }).catch(() => undefined);
      return response;
    } finally { await session.endSession(); }
  }

  private async resolveInvoiceReadScope(actor: Actor) {
    if (!actor.id || !Types.ObjectId.isValid(actor.id)) throw new ForbiddenException('Không xác định được tài khoản hiện tại');
    const current: any = await this.userModel.findOne({ _id: actor.id, isDeleted: false, status: { $ne: UserStatus.INACTIVE } }).select('_id role canViewAllInvoices').lean();
    if (!current) throw new ForbiddenException('Tài khoản không còn hoạt động');
    return {
      id: String(current._id),
      role: current.role as RoleEnum,
      canViewAll: canViewAllCompanyInvoices(current),
    };
  }

  private async invoiceFilter(query: InvoiceQueryDto, actor: Actor = {}): Promise<any> {
    const filter: any = { isDeleted: false, status: { $ne: InvoiceStatus.REVERSED } };
    const access = await this.resolveInvoiceReadScope(actor);
    if (!access.canViewAll) filter.salespersonId = access.id;
    else if (query.salespersonId) filter.salespersonId = query.salespersonId;
    if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
    if (query.from || query.to) { filter.date = {}; if (query.from) filter.date.$gte = vietnamDateBoundary(query.from, false); if (query.to) filter.date.$lte = vietnamDateBoundary(query.to, true); }
    if (query.search?.trim()) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = { $regex: escaped, $options: 'i' };
      const [customers, activations] = await Promise.all([
        this.customerModel.find({ isDeleted: false, $or: [{ code: regex }, { name: regex }, { phone: regex }] }).select('_id').limit(500).lean(),
        this.activationModel.find({ isDeleted: false, code: regex }).select('invoiceId').limit(500).lean(),
      ]);
      filter.$or = [{ code: regex }, { customer: regex }, { customerCode: regex }, { customerName: regex }, { customerPhone: regex }, { customerId: { $in: customers.map((item: any) => item._id) } }, { _id: { $in: activations.map((item: any) => item.invoiceId) } }, { 'promotionApplications.activationCode': regex }];
    }
    return filter;
  }

  async findAll(query: InvoiceQueryDto = {}, actor: Actor = {}): Promise<any> {
    const page = Math.max(1, Number(query.page) || 1); const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter = await this.invoiceFilter(query, actor);
    const [rows, total] = await Promise.all([this.model.find(filter).select('-__v').sort({ date: -1, createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('customerId', 'code name phone phones address').populate('salespersonId', 'employeeCode fullName').lean(), this.model.countDocuments(filter)]);
    const invoiceIds = rows.map((row: any) => row._id); const activations: any[] = invoiceIds.length ? await this.activationModel.find({ invoiceId: { $in: invoiceIds }, isDeleted: false }).select('invoiceId code status activatedAt').lean() : [];
    const byInvoice = new Map<string, any[]>(); for (const activation of activations) { const key = String(activation.invoiceId); byInvoice.set(key, [...(byInvoice.get(key) || []), activation]); }
    return { data: rows.map((row: any) => ({ ...row, id: String(row._id), activationCodes: byInvoice.get(String(row._id)) || [] })), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async timeline(query: InvoiceQueryDto = {}, actor: Actor = {}): Promise<any> {
    const { invoiceFilter, receiptFilter } = await this.timelineFilters(query, actor);
    const page = Math.max(1, Number(query.page) || 1); const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const documents = await this.timelineDocuments(invoiceFilter, receiptFilter);
    const total = documents.length;
    return { data: documents.slice((page - 1) * limit, page * limit), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  private async timelineFilters(query: InvoiceQueryDto, actor: Actor): Promise<{ invoiceFilter: any; receiptFilter: any }> {
    const access = await this.resolveInvoiceReadScope(actor);
    const invoiceFilter: any = { isDeleted: false };
    const receiptFilter: any = { isDeleted: false };
    const salespersonId = access.canViewAll ? query.salespersonId : access.id;
    if (salespersonId) { invoiceFilter.salespersonId = salespersonId; receiptFilter.collectorId = salespersonId; }
    if (query.paymentStatus) { invoiceFilter.paymentStatus = query.paymentStatus; receiptFilter._id = { $exists: false }; }
    if (query.from || query.to) {
      invoiceFilter.date = {}; receiptFilter.date = {};
      if (query.from) { invoiceFilter.date.$gte = vietnamDateBoundary(query.from, false); receiptFilter.date.$gte = invoiceFilter.date.$gte; }
      if (query.to) { invoiceFilter.date.$lte = vietnamDateBoundary(query.to, true); receiptFilter.date.$lte = invoiceFilter.date.$lte; }
    }
    if (query.search?.trim()) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const regex = { $regex: escaped, $options: 'i' };
      invoiceFilter.$or = [{ code: regex }, { customer: regex }, { customerCode: regex }, { customerName: regex }, { customerPhone: regex }, { salespersonCode: regex }, { salespersonName: regex }, { 'promotionApplications.activationCode': regex }];
      receiptFilter.$or = [{ code: regex }, { customerCode: regex }, { customerName: regex }, { customerPhone: regex }, { collectorCode: regex }, { collectorName: regex }, { 'allocations.invoiceCode': regex }];
    }
    return { invoiceFilter, receiptFilter };
  }

  private async timelineDocuments(invoiceFilter: any, receiptFilter: any): Promise<any[]> {
    const [invoices, receipts] = await Promise.all([
      this.model.find(invoiceFilter).select('-__v').populate('customerId', 'code name phone phones address').populate('salespersonId', 'employeeCode fullName').lean(),
      this.debtPaymentModel.find(receiptFilter).select('-__v').lean(),
    ]);
    const documents = [
      ...invoices.map((invoice: any) => ({ ...invoice, id: String(invoice._id), documentType: 'INVOICE' })),
      ...receipts.map((receipt: any) => ({ ...receipt, id: String(receipt._id), documentType: 'DEBT_PAYMENT' })),
    ].sort((left: any, right: any) => {
      const dateDifference = new Date(right.date || right.createdAt).getTime() - new Date(left.date || left.createdAt).getTime();
      return dateDifference || String(right._id).localeCompare(String(left._id));
    });
    return documents;
  }

  async export(query: InvoiceQueryDto = {}, actor: Actor = {}): Promise<Buffer> {
    const { invoiceFilter, receiptFilter } = await this.timelineFilters({ ...query, page: undefined, limit: undefined }, actor);
    const documents = await this.timelineDocuments(invoiceFilter, receiptFilter);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Phuc Long'; workbook.created = new Date();
    const invoicesSheet = workbook.addWorksheet('Danh sách hóa đơn', { views: [{ state: 'frozen', ySplit: 1 }] });
    invoicesSheet.columns = [
      { header: 'STT', key: 'number', width: 7 }, { header: 'Loại chứng từ', key: 'documentType', width: 22 }, { header: 'Mã chứng từ', key: 'code', width: 22 }, { header: 'Ngày giờ', key: 'date', width: 20 },
      { header: 'Mã khách hàng', key: 'customerCode', width: 17 }, { header: 'Tên khách hàng', key: 'customerName', width: 30 }, { header: 'Số điện thoại', key: 'customerPhone', width: 17 }, { header: 'Nhân viên', key: 'employee', width: 24 },
      { header: 'Hàng hóa', key: 'products', width: 48 }, { header: 'Tổng tiền hàng', key: 'grandTotal', width: 18 }, { header: 'Số tiền thanh toán (3)', key: 'receivedAmount', width: 22 }, { header: 'Nợ cũ (2)', key: 'customerDebtBefore', width: 16 },
      { header: 'Công nợ còn lại', key: 'customerDebtAfter', width: 20 }, { header: 'Trạng thái', key: 'status', width: 22 }, { header: 'Ghi chú', key: 'note', width: 36 },
    ];
    let productNumber = 0; const productRows: any[] = [];
    documents.forEach((doc: any, index) => {
      const receipt = doc.documentType === 'DEBT_PAYMENT'; const customer: any = doc.customerId && typeof doc.customerId === 'object' ? doc.customerId : {};
      const items: any[] = receipt ? [{ productId: 'DEBT_PAYMENT', productName: 'THANH TOÁN CÔNG NỢ', unit: 'Lần', qty: 1, price: 0, lineTotal: Number(doc.amount || 0), lineType: InvoiceLineType.SALE }] : (doc.items || []);
      const reversed = doc.status === InvoiceStatus.REVERSED || Boolean(doc.reversedAt);
      const receivedAmount = receipt ? Number(doc.amount || 0) : Number(doc.receivedAmount ?? doc.paidAmount ?? 0);
      invoicesSheet.addRow({ number: index + 1, documentType: receipt ? 'Thanh toán công nợ' : 'Hóa đơn bán hàng', code: doc.code || '', date: new Date(doc.date || doc.createdAt), customerCode: doc.customerCode || customer.code || '', customerName: doc.customerName || customer.name || doc.customer || 'Khách lẻ', customerPhone: doc.customerPhone || customer.phone || '', employee: doc.salespersonName || doc.collectorName || doc.salespersonId?.fullName || '', products: items.map((item) => `${item.productName || 'Sản phẩm'} x ${Number(item.qty || 0)}${item.lineType === InvoiceLineType.GIFT ? ' (Quà tặng)' : ''}`).join('; '), grandTotal: receipt ? 0 : Number(doc.grandTotal ?? doc.totalAmount ?? 0), receivedAmount, customerDebtBefore: Number(doc.customerDebtBefore || 0), customerDebtAfter: Number(doc.customerDebtAfter ?? (receipt ? 0 : doc.debtAmount) ?? 0), status: reversed ? 'Đã hoàn' : receipt ? (doc.status === DebtPaymentStatus.CANCELLED ? 'Phiếu thu đã hủy' : 'Đã thu công nợ') : doc.paymentStatus === InvoicePaymentStatus.PAID ? 'Đã thanh toán' : doc.paymentStatus === InvoicePaymentStatus.PARTIAL ? 'Thanh toán một phần' : 'Chưa thanh toán', note: doc.note || '' });
      for (const item of items) { productNumber += 1; productRows.push({ number: productNumber, code: doc.code || '', date: new Date(doc.date || doc.createdAt), customerCode: doc.customerCode || customer.code || '', customerName: doc.customerName || customer.name || doc.customer || 'Khách lẻ', productCode: item.productCode || '', productName: item.productName || 'Sản phẩm', classification: item.productId === 'DEBT_PAYMENT' ? 'Thanh toán công nợ' : item.lineType === InvoiceLineType.GIFT ? 'Quà tặng' : 'Hàng bán', unit: item.unit || '', quantity: Number(item.qty || 0), catalogPrice: Number(item.catalogPrice ?? item.originalPrice ?? item.price ?? 0), price: Number(item.price || 0), lineTotal: Number(item.lineTotal || 0), invoiceTotal: receipt ? 0 : Number(doc.grandTotal ?? doc.totalAmount ?? 0), receivedAmount, customerDebtAfter: Number(doc.customerDebtAfter ?? doc.debtAmount ?? 0) }); }
    });
    const productsSheet = workbook.addWorksheet('Sản phẩm đã bán', { views: [{ state: 'frozen', ySplit: 1 }] });
    productsSheet.columns = [
      { header: 'STT', key: 'number', width: 7 }, { header: 'Mã chứng từ', key: 'code', width: 22 }, { header: 'Ngày giờ', key: 'date', width: 20 }, { header: 'Mã khách hàng', key: 'customerCode', width: 17 }, { header: 'Tên khách hàng', key: 'customerName', width: 30 },
      { header: 'Mã sản phẩm', key: 'productCode', width: 18 }, { header: 'Tên sản phẩm', key: 'productName', width: 36 }, { header: 'Phân loại', key: 'classification', width: 20 }, { header: 'Đơn vị', key: 'unit', width: 12 }, { header: 'Số lượng', key: 'quantity', width: 12 },
      { header: 'Giá niêm yết', key: 'catalogPrice', width: 18 }, { header: 'Giá bán', key: 'price', width: 18 }, { header: 'Thành tiền', key: 'lineTotal', width: 18 }, { header: 'Tổng hóa đơn', key: 'invoiceTotal', width: 18 }, { header: 'Số tiền thanh toán (3)', key: 'receivedAmount', width: 22 }, { header: 'Công nợ còn lại', key: 'customerDebtAfter', width: 20 },
    ];
    productsSheet.addRows(productRows);
    for (const sheet of [invoicesSheet, productsSheet]) { sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } }; sheet.getRow(1).alignment = { vertical: 'middle' }; sheet.autoFilter = { from: 'A1', to: sheet.getRow(1).getCell(sheet.columnCount).address }; }
    invoicesSheet.getColumn('date').numFmt = 'dd/mm/yyyy hh:mm'; productsSheet.getColumn('date').numFmt = 'dd/mm/yyyy hh:mm';
    for (const key of ['grandTotal', 'receivedAmount', 'customerDebtBefore', 'customerDebtAfter']) invoicesSheet.getColumn(key).numFmt = '#,##0';
    for (const key of ['quantity', 'catalogPrice', 'price', 'lineTotal', 'invoiceTotal', 'receivedAmount', 'customerDebtAfter']) productsSheet.getColumn(key).numFmt = '#,##0';
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async summary(query: InvoiceQueryDto, actor: Actor = {}): Promise<any> {
    const filter = await this.invoiceFilter({ ...query, search: undefined, page: undefined, limit: undefined }, actor);
    const [values, customers, activationCount] = await Promise.all([
      this.model.aggregate([{ $match: filter }, { $group: { _id: null, invoiceCount: { $sum: 1 }, grossRevenue: { $sum: '$subtotal' }, discountAmount: { $sum: '$discountAmount' }, netRevenue: { $sum: '$grandTotal' }, paidAmount: { $sum: '$paidAmount' }, debtAmount: { $sum: '$debtAmount' } } }]),
      this.model.distinct('customerId', { ...filter, customerId: { $ne: null } }),
      this.activationModel.countDocuments({ isDeleted: false, status: PromotionActivationStatus.ACTIVE, ...(filter.salespersonId ? { salespersonId: filter.salespersonId } : {}), ...((query.from || query.to) ? { activatedAt: { ...(query.from ? { $gte: vietnamDateBoundary(query.from, false) } : {}), ...(query.to ? { $lte: vietnamDateBoundary(query.to, true) } : {}) } } : {}) }),
    ]);
    const row = values[0] || {};
    return { data: { invoiceCount: row.invoiceCount || 0, grossRevenue: row.grossRevenue || 0, discountAmount: row.discountAmount || 0, netRevenue: row.netRevenue || 0, paidAmount: row.paidAmount || 0, debtAmount: row.debtAmount || 0, uniqueCustomers: customers.length, promotionActivationCount: activationCount } };
  }

  async findOne(id: ID | string, actor: Actor = {}): Promise<any> {
    const access = await this.resolveInvoiceReadScope(actor);
    const doc = await this.model.findOne({ _id: id, isDeleted: false, ...(!access.canViewAll ? { salespersonId: access.id } : {}) }).populate('customerId', 'code name phone phones address').populate('truckId', 'code name licensePlate').populate('salespersonId', 'employeeCode fullName').lean();
    if (!doc) throw new NotFoundException('Không tìm thấy hóa đơn');
    return { data: doc };
  }
}
