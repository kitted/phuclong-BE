import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { getConnectionToken, InjectModel } from 'nestjs-typegoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { Invoices, InvoicePaymentStatus, PaymentMethod } from './schemas/invoices.schema';
import { InvoiceCounters } from './schemas/invoice-counter.schema';
import { Products } from '../products/schemas/products.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { Customers } from '../customers/schemas/customers.schema';
import { Users, UserStatus } from '../users/schemas/users.schema';
import { DiscountType, Promotions, PromotionScope, PromotionStatus, Vouchers, VoucherStatus } from '../promotions/schemas/promotions.schema';
import { CreateInvoiceDto, InvoicePreviewDto } from './dtos/invoices.dto';
import { InventoryMovementsService } from '../inventory/inventory-movements.service';
import { InventoryLocationType, InventoryMovementType } from '../inventory/schemas/inventory-movement.schema';
import { RoleEnum } from '../users/interfaces/role.enum';
import { ID } from '../../core/interfaces/id.interface';
import { Categories } from '../categories/schemas/categories.schema';

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
    private readonly movements: InventoryMovementsService,
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
      return { productId: item.productId, productCode: product.code, productName: product.name, productType: product.productType || (product.categoryId ? categoryMap.get(String(product.categoryId)) : ''), unit: product.unit || '', categoryId: product.categoryId ? String(product.categoryId) : null, qty: item.qty, price, lineTotal: price * item.qty };
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
    const session = await this.connection.startSession(); let response: any;
    try {
      await session.withTransaction(async () => {
        const salesperson: any = await this.userModel.findOne({ _id: dto.salespersonId, role: RoleEnum.STAFF, status: UserStatus.ACTIVE, isDeleted: false }).session(session);
        if (!salesperson) throw new BadRequestException('Nhân viên bán hàng không hoạt động hoặc không tồn tại');
        const customer: any = dto.customerId ? await this.customerModel.findOne({ _id: dto.customerId, isDeleted: false }).session(session) : null;
        if (dto.customerId && !customer) throw new BadRequestException('Khách hàng không tồn tại');
        const calculated = await this.calculate(dto, session);
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
          for (const item of calculated.items) {
            const before: any = await this.productModel.findOneAndUpdate({ _id: item.productId, isDeleted: false, stock: { $gte: item.qty } }, { $inc: { stock: -item.qty } }, { new: false, session });
            if (!before) throw new ConflictException({ code: 'INSUFFICIENT_STOCK', message: 'Số lượng tồn kho không đủ', details: { productId: item.productId, requestedQuantity: item.qty } });
            movementInputs.push({ productId: item.productId, type: InventoryMovementType.WAREHOUSE_SALE, quantityChange: -item.qty, quantityBefore: before.stock, quantityAfter: before.stock - item.qty, sourceType: InventoryLocationType.WAREHOUSE });
          }
        } else {
          const truck = await this.truckModel.findOne({ _id: dto.truckId, isDeleted: false }).session(session);
          if (!truck) throw new NotFoundException('Không tìm thấy xe tải');
          for (const item of calculated.items) {
            const before: any = await this.truckModel.findOneAndUpdate({ _id: dto.truckId, inventory: { $elemMatch: { productId: item.productId, qty: { $gte: item.qty } } } }, { $inc: { 'inventory.$.qty': -item.qty } }, { new: false, session });
            if (!before) throw new ConflictException({ code: 'INSUFFICIENT_TRUCK_STOCK', message: 'Số lượng hàng trên xe không đủ', details: { truckId: dto.truckId, productId: item.productId, requestedQuantity: item.qty } });
            const available = before.inventory.find((entry) => String(entry.productId) === item.productId)?.qty || 0;
            movementInputs.push({ productId: item.productId, type: InventoryMovementType.TRUCK_SALE, quantityChange: -item.qty, quantityBefore: available, quantityAfter: available - item.qty, sourceType: InventoryLocationType.TRUCK, sourceTruckId: dto.truckId });
          }
          await this.truckModel.updateOne({ _id: dto.truckId }, { $pull: { inventory: { qty: { $lte: 0 } } } }, { session });
        }
        const paymentStatus = paidAmount === 0 ? InvoicePaymentStatus.UNPAID : paidAmount < calculated.grandTotal ? InvoicePaymentStatus.PARTIAL : InvoicePaymentStatus.PAID;
        const invoice: any = (await this.model.create([{
          code, date, customer: customer?.name || dto.customer || 'Khách lẻ', customerId: customer?._id,
          sourceType: dto.sourceType, truckId: dto.truckId, note: dto.note, items: calculated.items,
          subtotal: calculated.subtotal, discountAmount: calculated.discountAmount, grandTotal: calculated.grandTotal, totalAmount: calculated.grandTotal,
          payments, paidAmount, debtAmount, paymentStatus, debtLimitOverridden: Boolean(dto.allowDebtLimitOverride), debtOverrideReason: dto.debtOverrideReason?.trim(),
          promotionId: calculated.promotion?._id, promotionCode: calculated.promotion?.code, promotionName: calculated.promotion?.name,
          voucherId: calculated.voucher?._id, voucherCode: calculated.voucher?.code, discountType: calculated.promotion?.discountType, discountValue: calculated.promotion?.discountValue,
          salespersonId: salesperson._id, salespersonCode: salesperson.employeeCode || '', salespersonName: salesperson.fullName || salesperson.username,
          createdBy: actor.id || undefined,
        }], { session }))[0];
        if (calculated.voucher) {
          const claimed = await this.voucherModel.findOneAndUpdate({ _id: calculated.voucher._id, status: VoucherStatus.ACTIVE }, { status: VoucherStatus.USED, usedAt: new Date(), orderReference: code, invoiceId: String(invoice._id) }, { new: true, session });
          if (!claimed) throw new ConflictException('Voucher đã được sử dụng bởi giao dịch khác');
          await this.promotionModel.updateOne({ _id: calculated.promotion._id }, { $inc: { used: 1 } }, { session });
        }
        if (customer && debtAmount > 0) {
          const debtFilter: any = { _id: customer._id, isDeleted: false };
          if (!dto.allowDebtLimitOverride && customer.debtLimit > 0) debtFilter.$expr = { $lte: [{ $add: ['$debt', debtAmount] }, '$debtLimit'] };
          const debtUpdated = await this.customerModel.findOneAndUpdate(debtFilter, { $inc: { debt: debtAmount } }, { new: true, session });
          if (!debtUpdated) throw new ConflictException({ code: 'CUSTOMER_DEBT_LIMIT_EXCEEDED', message: 'Công nợ khách hàng vừa thay đổi và đã vượt hạn mức' });
        }
        await this.movements.recordMany(movementInputs.map((movement) => ({ ...movement, referenceType: 'INVOICE', referenceId: String(invoice._id), referenceCode: code })), session);
        response = { data: { id: String(invoice._id), code, subtotal: calculated.subtotal, discountAmount: calculated.discountAmount, grandTotal: calculated.grandTotal, paidAmount, debtAmount, paymentStatus } };
      });
      return response;
    } finally { await session.endSession(); }
  }

  async findAll(): Promise<any> {
    return this.model.find({ isDeleted: false }).select('-__v').sort({ date: -1 }).populate('customerId', 'code name phone').populate('salespersonId', 'employeeCode fullName').lean();
  }

  async findOne(id: ID | string): Promise<any> {
    const doc = await this.model.findOne({ _id: id, isDeleted: false }).populate('customerId', 'code name phone').populate('truckId', 'code name licensePlate').populate('salespersonId', 'employeeCode fullName').lean();
    if (!doc) throw new NotFoundException('Không tìm thấy hóa đơn');
    return { data: doc };
  }
}
