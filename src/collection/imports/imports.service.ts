import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { Imports } from './schemas/imports.schema';
import { Products } from '../products/schemas/products.schema';
import { ReturnModelType } from '@typegoose/typegoose';
import { CreateImportDto } from './dtos/imports.dto';
import { ID } from 'src/core/interfaces/id.interface';
import { InventoryMovementsService } from '../inventory/inventory-movements.service';
import { InventoryLocationType, InventoryMovementType } from '../inventory/schemas/inventory-movement.schema';

@Injectable()
export class ImportsService {
  constructor(
    @InjectModel(Imports)
    private readonly model: ReturnModelType<typeof Imports>,
    @InjectModel(Products)
    private readonly productModel: ReturnModelType<typeof Products>,
    private readonly movements: InventoryMovementsService,
  ) {}

  async create(dto: CreateImportDto) {
    const existing = await this.model.findOne({ code: dto.code, isDeleted: false });
    if (existing) throw new BadRequestException('Mã phiếu nhập đã tồn tại');

    // Verify products exist
    for (const item of dto.items) {
      const p = await this.productModel.findOne({ _id: item.productId, isDeleted: false });
      if (!p) throw new BadRequestException(`Sản phẩm ${item.productId} không tồn tại`);
    }

    const created = await this.model.create(dto);

    // Increase stock in warehouse
    if (dto.status !== 'cancelled') {
      for (const item of dto.items) {
        const product = await this.productModel.findOneAndUpdate(
          { _id: item.productId },
          { $inc: { stock: item.qty } },
          { new: false },
        );
        const before = product?.stock || 0;
        await this.movements.record({
          productId: item.productId,
          type: InventoryMovementType.IMPORT,
          quantityChange: item.qty,
          quantityBefore: before,
          quantityAfter: before + item.qty,
          destinationType: InventoryLocationType.WAREHOUSE,
          referenceType: 'IMPORT',
          referenceId: String(created._id),
          referenceCode: created.code,
        });
      }
    }

    return created;
  }

  async findAll() {
    return await this.model.find({ isDeleted: false })
      .sort({ date: -1, createdAt: -1, _id: -1 })
      .populate('supplierId')
      .populate('items.productId');
  }

  async findOne(id: ID | string) {
    const doc = await this.model.findOne({ _id: id, isDeleted: false })
      .populate('supplierId')
      .populate('items.productId');
    if (!doc) throw new NotFoundException('Không tìm thấy phiếu nhập');
    return doc;
  }
}
