import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { createHash, randomBytes } from 'crypto';
import { Types } from 'mongoose';
import { Products } from '../products/schemas/products.schema';
import { Categories } from '../categories/schemas/categories.schema';
import { Customers } from '../customers/schemas/customers.schema';
import { Users } from '../users/schemas/users.schema';
import {
  AssignWebsiteOrderDto,
  ChangeWebsiteOrderStatusDto,
  ConvertWebsiteOrderDto,
  CreateWebsiteOrderDto,
  WebsiteOrderAdminQueryDto,
} from './dtos/website-orders.dto';
import {
  WebsiteCustomerType,
  WebsiteOrderCounters,
  WebsiteOrders,
  WebsiteOrderStatus,
  WebsiteOrderConversionStatus,
  WebsitePaymentMethod,
  WebsitePaymentStatus,
} from './schemas/website-orders.schema';
import { InvoicesService } from '../invoices/invoices.service';
import { Invoices, PaymentMethod } from '../invoices/schemas/invoices.schema';
import { RoleEnum } from '../users/interfaces/role.enum';
import { WebsiteProductCategories, WebsiteProducts } from './schemas/website-products.schema';

@Injectable()
export class WebsiteOrdersService {
  constructor(
    @InjectModel(WebsiteOrders) private readonly orders: ReturnModelType<typeof WebsiteOrders>,
    @InjectModel(WebsiteOrderCounters) private readonly counters: ReturnModelType<typeof WebsiteOrderCounters>,
    @InjectModel(Products) private readonly products: ReturnModelType<typeof Products>,
    @InjectModel(Categories) private readonly categories: ReturnModelType<typeof Categories>,
    @InjectModel(Customers) private readonly customers: ReturnModelType<typeof Customers>,
    @InjectModel(Users) private readonly users: ReturnModelType<typeof Users>,
    @InjectModel(Invoices) private readonly invoices: ReturnModelType<typeof Invoices>,
    @InjectModel(WebsiteProducts) private readonly websiteProducts: ReturnModelType<typeof WebsiteProducts>,
    @InjectModel(WebsiteProductCategories) private readonly websiteCategories: ReturnModelType<typeof WebsiteProductCategories>,
    private readonly invoicesService: InvoicesService,
  ) {}

  private normalizePhone(value: string): string {
    return String(value || '').replace(/\D/g, '');
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async nextCode(): Promise<string> {
    const date = new Date();
    const day = `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const counter = await this.counters.findOneAndUpdate(
      { key: `WEBSITE_ORDER_${day}` },
      { $inc: { sequence: 1 } },
      { upsert: true, new: true },
    );
    return `WEB-${day}-${String(counter.sequence).padStart(5, '0')}`;
  }

  async catalog(q: any): Promise<any> {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 24));
    const filter: any = { isDeleted: false, isActive: true };
    if (q.categoryId) {
      if (!Types.ObjectId.isValid(q.categoryId))
        throw new BadRequestException({
          code: 'INVALID_CATEGORY_ID',
          message:
            'categoryId phải là id MongoDB được trả về từ API /public/website/categories',
        });
      filter.categoryId = q.categoryId;
    }
    if (q.search?.trim()) {
      const escaped = q.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ code: new RegExp(escaped, 'i') }, { name: new RegExp(escaped, 'i') }];
    }
    const [rows, total] = await Promise.all([
      this.websiteProducts.find(filter).select('_id code name categoryId unit sellPrice slug shortDescription imageUrls inventoryProductId').sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.websiteProducts.countDocuments(filter),
    ]);
    return {
      data: rows.map((p: any) => ({
        ...p,
        id: String(p._id),
        categoryId: p.categoryId ? String(p.categoryId) : null,
        available: true,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async publicProduct(identifier: string): Promise<any> {
    const byId = /^[a-f\d]{24}$/i.test(identifier);
    const filter: any = { isDeleted: false, isActive: true, ...(byId ? { _id: identifier } : { slug: identifier.toLowerCase() }) };
    const product: any = await this.websiteProducts.findOne(filter).select('_id code name categoryId unit sellPrice slug shortDescription descriptionHtml imageUrls inventoryProductId').lean();
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm trên website');
    return {
      data: {
        ...product,
        id: String(product._id),
        categoryId: product.categoryId ? String(product.categoryId) : null,
        available: true,
      },
    };
  }

  async publicCategories(): Promise<any> {
    const data = await this.websiteCategories
      .find({ isDeleted: false, isActive: true })
      .select('_id name slug description imageUrl sortOrder')
      .sort({ name: 1 })
      .lean();
    return {
      data: data.map((category: any) => ({
        ...category,
        id: String(category._id),
      })),
    };
  }

  async adminProducts(q: any): Promise<any> {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const filter: any = { isDeleted: false };
    if (q.search?.trim()) {
      const escaped = q.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ code: new RegExp(escaped, 'i') }, { name: new RegExp(escaped, 'i') }];
    }
    if (q.mapped === 'true') filter.inventoryProductId = { $exists: true, $ne: null };
    if (q.mapped === 'false') filter.$and = [{ $or: [{ inventoryProductId: null }, { inventoryProductId: { $exists: false } }] }];
    const [data, total] = await Promise.all([
      this.websiteProducts.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.websiteProducts.countDocuments(filter),
    ]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async mapInventoryProduct(id: string, inventoryProductId: string): Promise<any> {
    const inventoryProduct = await this.products.findOne({ _id: inventoryProductId, isDeleted: false }).select('_id code name unit').lean();
    if (!inventoryProduct) throw new BadRequestException('Hàng hóa BO không tồn tại');
    const doc = await this.websiteProducts.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: { inventoryProductId } },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Không tìm thấy sản phẩm website');
    return { data: { ...doc.toObject(), inventoryProduct } };
  }

  async verifyCustomer(code: string, phone: string): Promise<any> {
    const normalized = this.normalizePhone(phone);
    const customer = await this.customers.findOne({
      code: code.trim(),
      isDeleted: false,
      $or: [{ phone: normalized }, { phones: normalized }, { phone: phone.trim() }, { phones: phone.trim() }],
    }).select('_id code name phone phones').lean();
    if (!customer) throw new UnauthorizedException('Mã khách hàng hoặc số điện thoại không đúng');
    return { data: { customerId: String((customer as any)._id), customerCode: customer.code, customerName: customer.name, phone: customer.phone || normalized, invoicePoints: 0, productPoints: 0 } };
  }

  async create(dto: CreateWebsiteOrderDto): Promise<any> {
    if (!Array.isArray(dto?.items) || !dto.items.length)
      throw new BadRequestException('Đơn hàng phải có ít nhất một sản phẩm');
    const ids = dto.items.map((item) => item.productId);
    const invalidIds = ids.filter((id) => !Types.ObjectId.isValid(id));
    if (invalidIds.length)
      throw new BadRequestException({
        code: 'INVALID_PRODUCT_ID',
        message:
          'productId phải là id MongoDB được trả về từ API /public/website/products',
        invalidProductIds: [...new Set(invalidIds)],
      });
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Sản phẩm trong đơn không được trùng dòng');
    const products = await this.websiteProducts.find({ _id: { $in: ids }, isDeleted: false, isActive: true }).lean();
    if (products.length !== ids.length) throw new BadRequestException('Có sản phẩm không tồn tại hoặc đã ngừng kinh doanh');
    let customerId: string | undefined;
    if (dto.customerType === WebsiteCustomerType.EXISTING) {
      if (!dto.customerCode) throw new BadRequestException('Khách cũ phải cung cấp mã khách hàng');
      const verified = await this.verifyCustomer(dto.customerCode, dto.customerPhone);
      customerId = verified.data.customerId;
    }
    const productMap = new Map(products.map((p: any) => [String(p._id), p]));
    const items = dto.items.map((item) => {
      const product: any = productMap.get(item.productId);
      const unitPrice = Number(product.sellPrice) || 0;
      return { websiteProductId: item.productId, inventoryProductId: product.inventoryProductId, productCode: product.code, productName: product.name, unit: product.unit, quantity: item.quantity, unitPrice, lineTotal: unitPrice * item.quantity };
    });
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const accessToken = randomBytes(24).toString('hex');
    const code = await this.nextCode();
    const status = WebsiteOrderStatus.PENDING;
    const order = await this.orders.create({
      code,
      customerType: dto.customerType,
      customerId,
      customerName: dto.customerName.trim(),
      customerPhone: this.normalizePhone(dto.customerPhone),
      customerEmail: dto.customerEmail?.trim(),
      deliveryAddress: dto.deliveryAddress.trim(),
      customerNote: dto.customerNote?.trim(),
      items,
      subtotal,
      discountAmount: 0,
      shippingFee: 0,
      totalAmount: subtotal,
      paymentMethod: dto.paymentMethod,
      paymentStatus: WebsitePaymentStatus.UNPAID,
      status,
      accessTokenHash: this.hash(accessToken),
      statusHistory: [{ status, at: new Date(), note: 'Đơn hàng được tạo từ website' }],
    });
    return { data: { order: this.publicOrder(order.toObject()), accessToken, simulatedPayment: dto.paymentMethod === WebsitePaymentMethod.VNPAY_SIMULATED ? { method: 'VNPAY_SIMULATED', confirmEndpoint: `/public/website-orders/${code}/payments/simulate-success` } : null } };
  }

  private publicOrder(order: any): any {
    const { accessTokenHash, isDeleted, deletedAt, deletedBy, ...safe } = order;
    return safe;
  }

  private async ownedOrder(code: string, token: string): Promise<any> {
    if (!token) throw new UnauthorizedException('Thiếu mã truy cập đơn hàng');
    const order = await this.orders.findOne({ code, isDeleted: false }).select('+accessTokenHash');
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    if (order.accessTokenHash !== this.hash(token)) throw new UnauthorizedException('Mã truy cập đơn hàng không đúng');
    return order;
  }

  async publicDetail(code: string, token: string): Promise<any> {
    const order = await this.ownedOrder(code, token);
    return { data: this.publicOrder(order.toObject()) };
  }

  async simulatePayment(code: string, token: string): Promise<any> {
    const order = await this.ownedOrder(code, token);
    if (order.paymentMethod !== WebsitePaymentMethod.VNPAY_SIMULATED) throw new BadRequestException('Đơn hàng không chọn thanh toán VNPay giả lập');
    if (order.status === WebsiteOrderStatus.CANCELLED) throw new BadRequestException('Đơn hàng đã bị hủy');
    order.paymentStatus = WebsitePaymentStatus.PAID_SIMULATED;
    await order.save();
    return { data: this.publicOrder(order.toObject()) };
  }

  async adminList(q: WebsiteOrderAdminQueryDto): Promise<any> {
    const page = Math.max(1, Number(q.page) || 1), limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const filter: any = { isDeleted: false };
    if (q.status) filter.status = q.status;
    if (q.assignedSaleId) filter.assignedSaleId = q.assignedSaleId;
    if (q.from || q.to) { filter.createdAt = {}; if (q.from) filter.createdAt.$gte = new Date(q.from); if (q.to) filter.createdAt.$lte = new Date(q.to); }
    if (q.search?.trim()) { const escaped = q.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.$or = [{ code: new RegExp(escaped, 'i') }, { customerName: new RegExp(escaped, 'i') }, { customerPhone: new RegExp(escaped, 'i') }]; }
    const [data, total] = await Promise.all([this.orders.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), this.orders.countDocuments(filter)]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async adminDetail(id: string): Promise<any> {
    const doc = await this.orders.findOne({ _id: id, isDeleted: false }).lean();
    if (!doc) throw new NotFoundException('Không tìm thấy đơn hàng website');
    return { data: doc };
  }

  async assign(id: string, dto: AssignWebsiteOrderDto, actorId: string): Promise<any> {
    const sale = await this.users.findOne({ _id: dto.saleId, isDeleted: false }).select('_id').lean();
    if (!sale) throw new BadRequestException('Sale được phân công không tồn tại');
    const now = new Date();
    const doc = await this.orders.findOneAndUpdate(
      { _id: id, isDeleted: false, status: { $nin: [WebsiteOrderStatus.COMPLETED, WebsiteOrderStatus.CANCELLED] } },
      { $set: { assignedSaleId: dto.saleId, assignedAt: now, assignedBy: actorId, status: WebsiteOrderStatus.ASSIGNED }, $push: { statusHistory: { status: WebsiteOrderStatus.ASSIGNED, at: now, by: actorId, note: dto.note } } },
      { new: true },
    );
    if (!doc) throw new BadRequestException('Không thể phân công đơn ở trạng thái hiện tại');
    return { data: doc };
  }

  async changeStatus(id: string, dto: ChangeWebsiteOrderStatusDto, actorId: string): Promise<any> {
    const allowed: Record<WebsiteOrderStatus, WebsiteOrderStatus[]> = {
      PENDING: [WebsiteOrderStatus.CONFIRMED, WebsiteOrderStatus.CANCELLED],
      CONFIRMED: [WebsiteOrderStatus.ASSIGNED, WebsiteOrderStatus.PROCESSING, WebsiteOrderStatus.CANCELLED],
      ASSIGNED: [WebsiteOrderStatus.PROCESSING, WebsiteOrderStatus.CANCELLED],
      PROCESSING: [WebsiteOrderStatus.SHIPPING, WebsiteOrderStatus.CANCELLED],
      SHIPPING: [WebsiteOrderStatus.COMPLETED, WebsiteOrderStatus.CANCELLED],
      COMPLETED: [], CANCELLED: [],
    };
    const order = await this.orders.findOne({ _id: id, isDeleted: false });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng website');
    if (!allowed[order.status]?.includes(dto.status)) throw new BadRequestException(`Không thể chuyển trạng thái từ ${order.status} sang ${dto.status}`);
    order.status = dto.status;
    order.statusHistory.push({ status: dto.status, at: new Date(), by: actorId, note: dto.note });
    await order.save();
    return { data: order };
  }

  async convertToInvoice(id: string, dto: ConvertWebsiteOrderDto, actorId: string): Promise<any> {
    if (dto.sourceType === 'truck' && !dto.truckId)
      throw new BadRequestException('Phải chọn xe khi xuất hàng từ xe');
    const initial: any = await this.orders.findOne({ _id: id, isDeleted: false }).lean();
    if (!initial) throw new NotFoundException('Không tìm thấy đơn hàng website');
    if (initial.status === WebsiteOrderStatus.CANCELLED)
      throw new BadRequestException('Không thể tạo hóa đơn từ đơn đã hủy');
    if (initial.invoiceId)
      return { data: { orderId: String(initial._id), orderCode: initial.code, invoiceId: initial.invoiceId, invoiceCode: initial.invoiceCode, alreadyConverted: true } };

    const salespersonId = dto.salespersonId || initial.assignedSaleId;
    if (!salespersonId) throw new BadRequestException('Phải phân công sale trước khi tạo hóa đơn');
    const keyHash = this.hash(dto.idempotencyKey.trim());
    const invoiceCode = `HD-${initial.code}`;

    const existingInvoice: any = await this.invoices.findOne({ code: invoiceCode, isDeleted: false }).select('_id code').lean();
    if (existingInvoice) {
      const reconciled: any = await this.orders.findOneAndUpdate(
        { _id: id, isDeleted: false, invoiceId: { $exists: false } },
        { $set: { invoiceId: String(existingInvoice._id), invoiceCode: existingInvoice.code, conversionStatus: WebsiteOrderConversionStatus.COMPLETED, convertedAt: new Date(), convertedBy: actorId }, $unset: { conversionError: 1 } },
        { new: true },
      );
      return { data: { orderId: id, orderCode: initial.code, invoiceId: String(existingInvoice._id), invoiceCode: existingInvoice.code, alreadyConverted: true, reconciled: Boolean(reconciled) } };
    }

    if (
      initial.conversionStatus === WebsiteOrderConversionStatus.PROCESSING &&
      initial.conversionIdempotencyKeyHash !== keyHash
    ) throw new BadRequestException({ code: 'WEBSITE_ORDER_CONVERSION_IN_PROGRESS', message: 'Đơn hàng đang được chuyển thành hóa đơn' });

    const reserved = await this.orders.findOneAndUpdate(
      {
        _id: id,
        isDeleted: false,
        invoiceId: { $exists: false },
        $or: [
          { conversionStatus: { $exists: false } },
          { conversionStatus: WebsiteOrderConversionStatus.FAILED },
          { conversionStatus: WebsiteOrderConversionStatus.PROCESSING, conversionIdempotencyKeyHash: keyHash },
        ],
      },
      { $set: { conversionStatus: WebsiteOrderConversionStatus.PROCESSING, conversionIdempotencyKeyHash: keyHash, conversionStartedAt: new Date(), convertedBy: actorId }, $unset: { conversionError: 1 } },
      { new: true },
    );
    if (!reserved) throw new BadRequestException('Đơn hàng đã được xử lý hoặc đang được xử lý bởi yêu cầu khác');

    try {
      const payments = dto.payments || (
        initial.paymentStatus === WebsitePaymentStatus.PAID_SIMULATED
          ? [{ method: PaymentMethod.BANK_TRANSFER, amount: initial.totalAmount, referenceCode: `VNPAY-SIM-${initial.code}`, note: 'Thanh toán VNPay giả lập từ website' }]
          : []
      );
      const invoice = await this.invoicesService.create(
        {
          code: invoiceCode,
          customerId: initial.customerType === WebsiteCustomerType.EXISTING ? initial.customerId : undefined,
          newCustomer: initial.customerType === WebsiteCustomerType.NEW ? { name: initial.customerName, phone: initial.customerPhone, address: initial.deliveryAddress, note: `Tạo từ đơn website ${initial.code}` } : undefined,
          sourceType: dto.sourceType,
          truckId: dto.truckId,
          salespersonId,
          items: initial.items.map((item: any) => {
            if (!item.inventoryProductId)
              throw new BadRequestException({ code: 'WEBSITE_PRODUCT_NOT_MAPPED', message: `Sản phẩm website ${item.productCode} chưa được map với hàng hóa BO` });
            return { productId: item.inventoryProductId, qty: item.quantity, unitPriceOverride: item.unitPrice };
          }),
          payments,
          voucherCode: dto.voucherCode,
          note: `Chuyển từ đơn website ${initial.code}${initial.customerNote ? ` - ${initial.customerNote}` : ''}`,
        },
        { id: actorId, role: RoleEnum.ADMIN },
      );
      const now = new Date();
      const nextStatus = [
        WebsiteOrderStatus.PENDING,
        WebsiteOrderStatus.CONFIRMED,
        WebsiteOrderStatus.ASSIGNED,
      ].includes(initial.status)
        ? WebsiteOrderStatus.PROCESSING
        : initial.status;
      const orderUpdate: any = {
        $set: {
          invoiceId: invoice.data.id,
          invoiceCode: invoice.data.code,
          conversionStatus: WebsiteOrderConversionStatus.COMPLETED,
          convertedAt: now,
          convertedBy: actorId,
          status: nextStatus,
        },
        $unset: { conversionError: 1 },
      };
      if (nextStatus !== initial.status)
        orderUpdate.$push = {
          statusHistory: {
            status: nextStatus,
            at: now,
            by: actorId,
            note: `Đã tạo hóa đơn ${invoice.data.code}`,
          },
        };
      const updated = await this.orders.findOneAndUpdate(
        { _id: id, isDeleted: false, invoiceId: { $exists: false }, conversionIdempotencyKeyHash: keyHash },
        orderUpdate,
        { new: true },
      );
      if (!updated) throw new BadRequestException('Hóa đơn đã tạo nhưng không thể liên kết đơn hàng; hãy tải lại để hệ thống đối chiếu');
      return { data: { orderId: id, orderCode: initial.code, invoiceId: invoice.data.id, invoiceCode: invoice.data.code, invoice: invoice.data, alreadyConverted: false } };
    } catch (error) {
      const recovered: any = await this.invoices.findOne({ code: invoiceCode, isDeleted: false }).select('_id code').lean();
      if (recovered) {
        await this.orders.updateOne(
          { _id: id, isDeleted: false },
          { $set: { invoiceId: String(recovered._id), invoiceCode: recovered.code, conversionStatus: WebsiteOrderConversionStatus.COMPLETED, convertedAt: new Date(), convertedBy: actorId }, $unset: { conversionError: 1 } },
        );
        return { data: { orderId: id, orderCode: initial.code, invoiceId: String(recovered._id), invoiceCode: recovered.code, alreadyConverted: true, reconciled: true } };
      }
      await this.orders.updateOne(
        { _id: id, conversionIdempotencyKeyHash: keyHash, invoiceId: { $exists: false } },
        { $set: { conversionStatus: WebsiteOrderConversionStatus.FAILED, conversionError: error instanceof Error ? error.message : 'Không thể tạo hóa đơn' } },
      );
      throw error;
    }
  }
}
