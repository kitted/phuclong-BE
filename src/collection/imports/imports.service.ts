import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { getConnectionToken, InjectModel } from 'nestjs-typegoose';
import { Imports, ImportStatus } from './schemas/imports.schema';
import { Products } from '../products/schemas/products.schema';
import { ReturnModelType } from '@typegoose/typegoose';
import { ChangeImportStatusDto, CreateImportDto } from './dtos/imports.dto';
import { ID } from 'src/core/interfaces/id.interface';
import { InventoryMovementsService } from '../inventory/inventory-movements.service';
import {
  InventoryLocationType,
  InventoryMovementType,
} from '../inventory/schemas/inventory-movement.schema';
import { Connection } from 'mongoose';

@Injectable()
export class ImportsService {
  constructor(
    @InjectModel(Imports)
    private readonly model: ReturnModelType<typeof Imports>,
    @InjectModel(Products)
    private readonly productModel: ReturnModelType<typeof Products>,
    private readonly movements: InventoryMovementsService,
    @Inject(getConnectionToken()) private readonly connection: Connection,
  ) {}

  async create(dto: CreateImportDto) {
    const existing = await this.model.findOne({
      code: dto.code,
      isDeleted: false,
    });
    if (existing) throw new BadRequestException('Mã phiếu nhập đã tồn tại');

    // Verify products exist
    for (const item of dto.items) {
      const p = await this.productModel.findOne({
        _id: item.productId,
        isDeleted: false,
      });
      if (!p)
        throw new BadRequestException(
          `Sản phẩm ${item.productId} không tồn tại`,
        );
    }

    const requestedStatus = dto.status || ImportStatus.PENDING;
    const created = await this.model.create({
      ...dto,
      status: ImportStatus.PENDING,
    });
    if (requestedStatus === ImportStatus.RECEIVED)
      return this.changeStatus(
        String(created._id),
        { status: ImportStatus.RECEIVED },
        undefined,
      );
    if (requestedStatus !== ImportStatus.PENDING)
      throw new BadRequestException(
        'Phiếu mới chỉ có thể ở trạng thái PENDING hoặc RECEIVED',
      );
    return created;
  }

  async changeStatus(id: string, dto: ChangeImportStatusDto, actorId?: string) {
    if (![ImportStatus.RECEIVED, ImportStatus.RETURNED].includes(dto.status))
      throw new BadRequestException(
        'Chuyển trạng thái phiếu nhập không hợp lệ',
      );
    if (dto.status === ImportStatus.RETURNED && !dto.reason?.trim())
      throw new BadRequestException('Phải nhập lý do hoàn nhà cung cấp');
    const session = await this.connection.startSession();
    let response: any;
    try {
      await session.withTransaction(async () => {
        const expected =
          dto.status === ImportStatus.RECEIVED
            ? ImportStatus.PENDING
            : ImportStatus.RECEIVED;
        const doc: any = await this.model
          .findOne({ _id: id, isDeleted: false, status: expected })
          .session(session);
        if (!doc)
          throw new ConflictException({
            code: 'IMPORT_STATUS_TRANSITION_INVALID',
            message:
              dto.status === ImportStatus.RECEIVED
                ? 'Phiếu không tồn tại, không ở trạng thái chờ nhận hoặc đã được nhận'
                : 'Chỉ phiếu đã nhận mới được hoàn nhà cung cấp',
          });
        const movementRows: any[] = [];
        for (const item of doc.items) {
          const qty = Number(item.qty || 0);
          if (dto.status === ImportStatus.RECEIVED) {
            const product: any = await this.productModel.findOneAndUpdate(
              { _id: item.productId, isDeleted: false },
              { $inc: { stock: qty } },
              { new: false, session },
            );
            if (!product)
              throw new ConflictException('Sản phẩm không còn tồn tại');
            const before = Number(product.stock || 0);
            movementRows.push({
              productId: item.productId,
              type: InventoryMovementType.IMPORT,
              quantityChange: qty,
              quantityBefore: before,
              quantityAfter: before + qty,
              destinationType: InventoryLocationType.WAREHOUSE,
            });
          } else {
            const product: any = await this.productModel.findOneAndUpdate(
              { _id: item.productId, isDeleted: false, stock: { $gte: qty } },
              { $inc: { stock: -qty } },
              { new: false, session },
            );
            if (!product)
              throw new ConflictException({
                code: 'IMPORT_RETURN_STOCK_NOT_ENOUGH',
                message: 'Kho không còn đủ hàng để hoàn nhà cung cấp',
                productId: String(item.productId),
              });
            const before = Number(product.stock || 0);
            movementRows.push({
              productId: item.productId,
              type: InventoryMovementType.RETURN_TO_SUPPLIER,
              quantityChange: -qty,
              quantityBefore: before,
              quantityAfter: before - qty,
              sourceType: InventoryLocationType.WAREHOUSE,
            });
          }
        }
        await this.movements.recordMany(
          movementRows.map((row) => ({
            ...row,
            referenceType:
              dto.status === ImportStatus.RECEIVED ? 'IMPORT' : 'IMPORT_RETURN',
            referenceId: String(doc._id),
            referenceCode: doc.code,
            createdBy: actorId,
          })),
          session,
        );
        doc.status = dto.status;
        if (dto.status === ImportStatus.RECEIVED) {
          doc.receivedAt = new Date();
          doc.receivedBy = actorId;
        } else {
          doc.returnedAt = new Date();
          doc.returnedBy = actorId;
          doc.returnReason = dto.reason.trim();
        }
        await doc.save({ session });
        response = doc;
      });
      return response;
    } finally {
      await session.endSession();
    }
  }

  async findAll() {
    return await this.model
      .find({ isDeleted: false })
      .sort({ date: -1, createdAt: -1, _id: -1 })
      .populate('supplierId')
      .populate('items.productId');
  }

  async findOne(id: ID | string) {
    const doc = await this.model
      .findOne({ _id: id, isDeleted: false })
      .populate('supplierId')
      .populate('items.productId');
    if (!doc) throw new NotFoundException('Không tìm thấy phiếu nhập');
    return doc;
  }
}
