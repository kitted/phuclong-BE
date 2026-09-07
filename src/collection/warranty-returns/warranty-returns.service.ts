import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { Connection, Types } from 'mongoose';
import { getConnectionToken, InjectModel } from 'nestjs-typegoose';
import { Products } from '../products/schemas/products.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { Users } from '../users/schemas/users.schema';
import { WebsiteProducts } from '../website-orders/schemas/website-products.schema';
import {
  InventoryLocationType,
  InventoryMovements,
  InventoryMovementType,
} from '../inventory/schemas/inventory-movement.schema';
import {
  NotificationType,
  Notifications,
} from '../notifications/schemas/notifications.schema';
import {
  CancelWarrantyReturnDto,
  CompleteWarrantyReturnDto,
  CreateWarrantyReturnDto,
  WarrantyReturnQueryDto,
} from './dtos/warranty-returns.dto';
import {
  WarrantyResolution,
  WarrantyReturnCounters,
  WarrantyReturns,
  WarrantyReturnStatus,
  WarrantySourceType,
} from './schemas/warranty-returns.schema';

type Actor = { id: string; name?: string };

@Injectable()
export class WarrantyReturnsService {
  constructor(
    @InjectModel(WarrantyReturns)
    private readonly model: ReturnModelType<typeof WarrantyReturns>,
    @InjectModel(WarrantyReturnCounters)
    private readonly counters: ReturnModelType<typeof WarrantyReturnCounters>,
    @InjectModel(Products)
    private readonly products: ReturnModelType<typeof Products>,
    @InjectModel(Trucks)
    private readonly trucks: ReturnModelType<typeof Trucks>,
    @InjectModel(Users)
    private readonly users: ReturnModelType<typeof Users>,
    @InjectModel(WebsiteProducts)
    private readonly websiteProducts: ReturnModelType<typeof WebsiteProducts>,
    @InjectModel(InventoryMovements)
    private readonly movements: ReturnModelType<typeof InventoryMovements>,
    @InjectModel(Notifications)
    private readonly notifications: ReturnModelType<typeof Notifications>,
    @Inject(getConnectionToken()) private readonly connection: Connection,
  ) {}

  private fail(code: string, message: string): never {
    throw new BadRequestException({ code, message });
  }

  private regex(value: string) {
    return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  private async actor(input: Actor, session?: any): Promise<Actor> {
    if (!input.id || !Types.ObjectId.isValid(input.id)) return input;
    const user: any = await this.users
      .findOne({ _id: input.id, isDeleted: false })
      .select('fullName username employeeCode')
      .session(session || null)
      .lean();
    return {
      id: input.id,
      name:
        input.name || user?.fullName || user?.username || user?.employeeCode,
    };
  }

  private dateKey(date = new Date()) {
    return date
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
      .replaceAll('-', '');
  }

  private async nextCode(session: any) {
    const key = this.dateKey();
    const counter: any = await this.counters.findOneAndUpdate(
      { key },
      { $inc: { sequence: 1 } },
      { upsert: true, new: true, session },
    );
    return `BH-${key.slice(2)}-${String(counter.sequence).padStart(5, '0')}`;
  }

  private validateInput(dto: CreateWarrantyReturnDto) {
    if (dto.sourceType === WarrantySourceType.TRUCK && !dto.sourceTruckId)
      this.fail(
        'WARRANTY_TRUCK_REQUIRED',
        'Vui lòng chọn xe trả hàng bảo hành',
      );
    const productIds = dto.items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length)
      this.fail(
        'WARRANTY_DUPLICATE_PRODUCT',
        'Mỗi sản phẩm chỉ được xuất hiện một lần trong phiếu bảo hành',
      );
  }

  private async productRows(dto: CreateWarrantyReturnDto, session: any) {
    const ids = dto.items.map((item) => item.productId);
    const [products, websiteProducts]: any[] = await Promise.all([
      this.products
        .find({ _id: { $in: ids }, isDeleted: false })
        .session(session)
        .lean(),
      this.websiteProducts
        .find({
          inventoryProductId: { $in: ids },
          isDeleted: { $ne: true },
        })
        .select('inventoryProductId imageUrls')
        .session(session)
        .lean(),
    ]);
    if (products.length !== ids.length)
      this.fail(
        'WARRANTY_PRODUCT_NOT_FOUND',
        'Có hàng hóa không tồn tại hoặc đã bị xóa',
      );
    const websiteImages = new Map(
      websiteProducts.map((item: any) => [
        String(item.inventoryProductId),
        (item.imageUrls || []).find(Boolean),
      ]),
    );
    return new Map(
      products.map((product: any) => [
        String(product._id),
        {
          ...product,
          imageUrl: product.imageUrl || websiteImages.get(String(product._id)),
        },
      ]),
    );
  }

  async create(dto: CreateWarrantyReturnDto, actorInput: Actor): Promise<any> {
    this.validateInput(dto);
    const existing: any = await this.model
      .findOne({ idempotencyKey: dto.idempotencyKey })
      .lean();
    if (existing) return { data: existing, idempotent: true };
    const session = await this.connection.startSession();
    let result: any;
    try {
      await session.withTransaction(async () => {
        const actor = await this.actor(actorInput, session);
        const productMap = await this.productRows(dto, session);
        const truck: any =
          dto.sourceType === WarrantySourceType.TRUCK
            ? await this.trucks
                .findOne({ _id: dto.sourceTruckId, isDeleted: false })
                .session(session)
            : null;
        if (dto.sourceType === WarrantySourceType.TRUCK && !truck)
          throw new NotFoundException('Không tìm thấy xe trả hàng bảo hành');
        const code = await this.nextCode(session);
        const warrantyId = new Types.ObjectId();
        const items: any[] = [];
        const movementRows: any[] = [];
        for (const input of dto.items) {
          const product: any = productMap.get(input.productId);
          let before = 0;
          if (dto.sourceType === WarrantySourceType.WAREHOUSE) {
            const liveProduct: any = await this.products
              .findOne({ _id: input.productId, isDeleted: false })
              .session(session);
            before = Number(liveProduct.stock || 0);
            if (before < input.quantity)
              throw new ConflictException({
                code: 'WARRANTY_STOCK_NOT_ENOUGH',
                message: `Kho chỉ còn ${before} ${product.unit || ''} ${product.name}`,
              });
            liveProduct.stock = before - input.quantity;
            await liveProduct.save({ session });
          } else {
            const inventory: any = truck.inventory.find(
              (item: any) => String(item.productId) === input.productId,
            );
            before = Number(inventory?.qty || 0);
            if (before < input.quantity)
              throw new ConflictException({
                code: 'WARRANTY_STOCK_NOT_ENOUGH',
                message: `Xe chỉ còn ${before} ${product.unit || ''} ${product.name}`,
              });
            inventory.qty = before - input.quantity;
          }
          items.push({
            productId: product._id,
            productCode: product.code,
            productName: product.name,
            imageUrl: product.imageUrl,
            unit: product.unit,
            quantity: input.quantity,
            issue: input.issue.trim(),
            serialNumber: input.serialNumber?.trim() || undefined,
            note: input.note?.trim() || undefined,
          });
          movementRows.push({
            productId: product._id,
            type:
              dto.sourceType === WarrantySourceType.WAREHOUSE
                ? InventoryMovementType.WARRANTY_OUT_FROM_WAREHOUSE
                : InventoryMovementType.WARRANTY_OUT_FROM_TRUCK,
            quantityChange: -input.quantity,
            quantityBefore: before,
            quantityAfter: before - input.quantity,
            sourceType:
              dto.sourceType === WarrantySourceType.WAREHOUSE
                ? InventoryLocationType.WAREHOUSE
                : InventoryLocationType.TRUCK,
            sourceTruckId: truck?._id,
            referenceType: 'WARRANTY_RETURN',
            referenceId: String(warrantyId),
            referenceCode: code,
            createdBy: actor.id,
            reason: dto.reason.trim(),
          });
        }
        if (truck) await truck.save({ session });
        if (movementRows.length)
          await this.movements.insertMany(movementRows, { session });
        const document: any = (
          await this.model.create(
            [
              {
                _id: warrantyId,
                code,
                idempotencyKey: dto.idempotencyKey,
                sourceType: dto.sourceType,
                sourceTruckId: truck?._id,
                sourceTruckCode: truck?.code,
                sourceTruckName: truck?.name,
                sourceTruckLicensePlate: truck?.licensePlate,
                items,
                totalQuantity: items.reduce(
                  (sum, item) => sum + item.quantity,
                  0,
                ),
                customerName: dto.customerName?.trim() || undefined,
                customerPhone: dto.customerPhone?.trim() || undefined,
                supplierName: dto.supplierName?.trim() || undefined,
                reason: dto.reason.trim(),
                note: dto.note?.trim() || undefined,
                status: WarrantyReturnStatus.RECEIVED,
                createdBy: actor.id,
                createdByName: actor.name,
              },
            ],
            { session },
          )
        )[0];
        await this.notifications.create(
          [
            {
              type: NotificationType.WARRANTY_RETURN_CREATED,
              title: 'Phiếu hàng bảo hành mới',
              message: `${code} · ${items.length} mặt hàng · ${document.totalQuantity} sản phẩm`,
              audience: 'ADMIN',
              entityType: 'WARRANTY_RETURN',
              entityId: String(warrantyId),
              entityCode: code,
            },
          ],
          { session },
        );
        result = document.toObject();
      });
    } catch (error: any) {
      if (error?.code === 11000 && error?.keyPattern?.idempotencyKey) {
        const document = await this.model
          .findOne({ idempotencyKey: dto.idempotencyKey })
          .lean();
        return { data: document, idempotent: true };
      }
      throw error;
    } finally {
      await session.endSession();
    }
    return { data: result };
  }

  async findAll(query: WarrantyReturnQueryDto): Promise<any> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter: any = { isDeleted: false };
    if (query.status) filter.status = query.status;
    if (query.sourceType) filter.sourceType = query.sourceType;
    if (query.sourceTruckId) filter.sourceTruckId = query.sourceTruckId;
    if (query.search?.trim()) {
      const regex = this.regex(query.search.trim());
      filter.$or = [
        { code: regex },
        { customerName: regex },
        { customerPhone: regex },
        { supplierName: regex },
        { 'items.productCode': regex },
        { 'items.productName': regex },
      ];
    }
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from)
        filter.createdAt.$gte = new Date(`${query.from}T00:00:00+07:00`);
      if (query.to)
        filter.createdAt.$lte = new Date(`${query.to}T23:59:59.999+07:00`);
    }
    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.model.countDocuments(filter),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async summary(): Promise<any> {
    const rows: any[] = await this.model
      .find({ isDeleted: false })
      .select('sourceType status totalQuantity')
      .lean();
    const active = rows.filter(
      (row) =>
        ![
          WarrantyReturnStatus.COMPLETED,
          WarrantyReturnStatus.CANCELLED,
        ].includes(row.status),
    );
    return {
      data: {
        totalDocuments: rows.length,
        activeDocuments: active.length,
        processingDocuments: active.filter(
          (row) => row.status === WarrantyReturnStatus.PROCESSING,
        ).length,
        activeQuantity: active.reduce(
          (sum, row) => sum + Number(row.totalQuantity || 0),
          0,
        ),
        warehouseDocuments: rows.filter(
          (row) => row.sourceType === WarrantySourceType.WAREHOUSE,
        ).length,
        truckDocuments: rows.filter(
          (row) => row.sourceType === WarrantySourceType.TRUCK,
        ).length,
      },
    };
  }

  async findOne(id: string): Promise<any> {
    const document = await this.model
      .findOne({ _id: id, isDeleted: false })
      .lean();
    if (!document)
      throw new NotFoundException('Không tìm thấy phiếu hàng bảo hành');
    return { data: document };
  }

  async start(id: string, actorInput: Actor): Promise<any> {
    const actor = await this.actor(actorInput);
    const document = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false, status: WarrantyReturnStatus.RECEIVED },
      {
        $set: {
          status: WarrantyReturnStatus.PROCESSING,
          processingAt: new Date(),
          processingBy: actor.id,
          processingByName: actor.name,
        },
      },
      { new: true },
    );
    if (!document)
      throw new ConflictException(
        'Phiếu không còn ở trạng thái có thể bắt đầu xử lý',
      );
    return { data: document };
  }

  private async putBack(
    document: any,
    destination: WarrantyResolution,
    actor: Actor,
    reason: string,
    session: any,
  ) {
    if (destination === WarrantyResolution.DISPOSED) return;
    const returnToTruck =
      destination === WarrantyResolution.RETURN_TO_SOURCE &&
      document.sourceType === WarrantySourceType.TRUCK;
    const truck: any = returnToTruck
      ? await this.trucks
          .findOne({ _id: document.sourceTruckId, isDeleted: false })
          .session(session)
      : null;
    if (returnToTruck && !truck)
      throw new ConflictException({
        code: 'WARRANTY_SOURCE_TRUCK_NOT_FOUND',
        message: 'Xe nguồn không còn tồn tại; hãy chọn nhập hàng về kho chính',
      });
    for (const item of document.items) {
      const product: any = await this.products
        .findOne({ _id: item.productId, isDeleted: false })
        .session(session);
      if (!product)
        throw new ConflictException({
          code: 'WARRANTY_PRODUCT_NOT_FOUND',
          message: `Sản phẩm ${item.productCode} không còn tồn tại`,
        });
      let before = 0;
      if (returnToTruck) {
        const inventory: any = truck.inventory.find(
          (row: any) => String(row.productId) === String(item.productId),
        );
        before = Number(inventory?.qty || 0);
        if (inventory) inventory.qty = before + item.quantity;
        else
          truck.inventory.push({
            productId: item.productId,
            qty: item.quantity,
          });
      } else {
        before = Number(product.stock || 0);
        product.stock = before + item.quantity;
        await product.save({ session });
      }
      await this.movements.create(
        [
          {
            productId: item.productId,
            type: returnToTruck
              ? InventoryMovementType.WARRANTY_RETURN_TO_TRUCK
              : InventoryMovementType.WARRANTY_RETURN_TO_WAREHOUSE,
            quantityChange: item.quantity,
            quantityBefore: before,
            quantityAfter: before + item.quantity,
            destinationType: returnToTruck
              ? InventoryLocationType.TRUCK
              : InventoryLocationType.WAREHOUSE,
            destinationTruckId: returnToTruck ? truck._id : undefined,
            referenceType: 'WARRANTY_RETURN',
            referenceId: String(document._id),
            referenceCode: document.code,
            createdBy: actor.id,
            reason,
          },
        ],
        { session },
      );
    }
    if (truck) await truck.save({ session });
  }

  async complete(
    id: string,
    dto: CompleteWarrantyReturnDto,
    actorInput: Actor,
  ): Promise<any> {
    const session = await this.connection.startSession();
    let result: any;
    try {
      await session.withTransaction(async () => {
        const actor = await this.actor(actorInput, session);
        const document: any = await this.model
          .findOne({
            _id: id,
            isDeleted: false,
            status: {
              $in: [
                WarrantyReturnStatus.RECEIVED,
                WarrantyReturnStatus.PROCESSING,
              ],
            },
          })
          .session(session);
        if (!document)
          throw new ConflictException(
            'Phiếu đã hoàn tất, đã hủy hoặc không còn tồn tại',
          );
        await this.putBack(
          document,
          dto.resolution,
          actor,
          dto.note.trim(),
          session,
        );
        document.status = WarrantyReturnStatus.COMPLETED;
        document.resolution = dto.resolution;
        document.resolutionNote = dto.note.trim();
        document.completedAt = new Date();
        document.completedBy = actor.id;
        document.completedByName = actor.name;
        await document.save({ session });
        await this.notifications.create(
          [
            {
              type: NotificationType.WARRANTY_RETURN_COMPLETED,
              title: 'Đã hoàn tất hàng bảo hành',
              message: document.code,
              audience: 'ADMIN',
              entityType: 'WARRANTY_RETURN',
              entityId: String(document._id),
              entityCode: document.code,
            },
          ],
          { session },
        );
        result = document.toObject();
      });
    } finally {
      await session.endSession();
    }
    return { data: result };
  }

  async cancel(
    id: string,
    dto: CancelWarrantyReturnDto,
    actorInput: Actor,
  ): Promise<any> {
    const session = await this.connection.startSession();
    let result: any;
    try {
      await session.withTransaction(async () => {
        const actor = await this.actor(actorInput, session);
        const document: any = await this.model
          .findOne({
            _id: id,
            isDeleted: false,
            status: {
              $in: [
                WarrantyReturnStatus.RECEIVED,
                WarrantyReturnStatus.PROCESSING,
              ],
            },
          })
          .session(session);
        if (!document)
          throw new ConflictException(
            'Phiếu đã hoàn tất, đã hủy hoặc không còn tồn tại',
          );
        await this.putBack(
          document,
          WarrantyResolution.RETURN_TO_SOURCE,
          actor,
          `Hủy phiếu: ${dto.reason.trim()}`,
          session,
        );
        document.status = WarrantyReturnStatus.CANCELLED;
        document.cancelReason = dto.reason.trim();
        document.cancelledAt = new Date();
        document.cancelledBy = actor.id;
        await document.save({ session });
        result = document.toObject();
      });
    } finally {
      await session.endSession();
    }
    return { data: result };
  }
}
