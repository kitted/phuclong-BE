import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { Trucks } from './schemas/trucks.schema';
import { Products } from '../products/schemas/products.schema';
import { ReturnModelType } from '@typegoose/typegoose';
import { CreateTruckDto, UpdateTruckDto, LoadGoodsDto, ReturnGoodsDto } from './dtos/trucks.dto';
import { ID } from 'src/core/interfaces/id.interface';
import { InventoryMovementsService } from '../inventory/inventory-movements.service';
import { InventoryLocationType, InventoryMovementType } from '../inventory/schemas/inventory-movement.schema';

@Injectable()
export class TrucksService {
  constructor(
    @InjectModel(Trucks)
    private readonly model: ReturnModelType<typeof Trucks>,
    @InjectModel(Products)
    private readonly productModel: ReturnModelType<typeof Products>,
    private readonly movements: InventoryMovementsService,
  ) {}

  async create(dto: CreateTruckDto) {
    return await this.model.create(dto);
  }

  async findAll() {
    return await this.model.find({ isDeleted: false })
      .populate('inventory.productId');
  }

  async findOne(id: ID | string) {
    const doc = await this.model.findOne({ _id: id, isDeleted: false })
      .populate('inventory.productId');
    if (!doc) throw new NotFoundException('Không tìm thấy xe tải');
    return doc;
  }

  async update(id: ID | string, dto: UpdateTruckDto) {
    const doc = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      dto,
      { new: true },
    );
    if (!doc) throw new NotFoundException('Không tìm thấy xe tải');
    return doc;
  }

  async remove(id: ID | string) {
    const doc = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Không tìm thấy xe tải');
    return doc;
  }

  async loadGoods(id: ID | string, dto: LoadGoodsDto) {
    const truck = await this.model.findOne({ _id: id, isDeleted: false });
    if (!truck) throw new NotFoundException('Không tìm thấy xe tải');

    // 1. Validate all stock in warehouse
    for (const item of dto.items) {
      const p = await this.productModel.findOne({ _id: item.productId, isDeleted: false });
      if (!p) throw new BadRequestException(`Sản phẩm ${item.productId} không tồn tại`);
      if (p.stock < item.qty) {
        throw new BadRequestException(`Sản phẩm ${p.name} không đủ tồn kho (còn ${p.stock})`);
      }
    }

    // 2. Process
    for (const item of dto.items) {
      const product = await this.productModel.findById(item.productId).lean();
      const before = product?.stock || 0;
      // Decrease warehouse stock
      await this.productModel.updateOne(
        { _id: item.productId },
        { $inc: { stock: -item.qty } }
      );

      // Increase truck stock
      const invIdx = truck.inventory.findIndex(i => i.productId.toString() === item.productId);
      if (invIdx > -1) {
        truck.inventory[invIdx].qty += item.qty;
      } else {
        truck.inventory.push({ productId: item.productId as any, qty: item.qty });
      }
      await this.movements.record({
        productId: item.productId,
        type: InventoryMovementType.TRANSFER_TO_TRUCK,
        quantityChange: -item.qty,
        quantityBefore: before,
        quantityAfter: before - item.qty,
        sourceType: InventoryLocationType.WAREHOUSE,
        destinationType: InventoryLocationType.TRUCK,
        destinationTruckId: String(truck._id),
        referenceType: 'TRUCK_LOAD',
        referenceId: String(truck._id),
        referenceCode: truck.code,
      });
    }

    return await truck.save();
  }

  async returnGoods(id: ID | string, dto: ReturnGoodsDto) {
    const truck = await this.model.findOne({ _id: id, isDeleted: false });
    if (!truck) throw new NotFoundException('Không tìm thấy xe tải');

    for (const item of dto.items) {
      const invIdx = truck.inventory.findIndex(i => i.productId.toString() === item.productId);
      if (invIdx === -1 || truck.inventory[invIdx].qty < item.qty) {
        throw new BadRequestException(`Sản phẩm ${item.productId} không đủ trên xe`);
      }
    }

    for (const item of dto.items) {
      const product = await this.productModel.findById(item.productId).lean();
      const before = product?.stock || 0;
      // Increase warehouse stock
      await this.productModel.updateOne(
        { _id: item.productId },
        { $inc: { stock: item.qty } }
      );

      // Decrease truck stock
      const invIdx = truck.inventory.findIndex(i => i.productId.toString() === item.productId);
      truck.inventory[invIdx].qty -= item.qty;
      if (truck.inventory[invIdx].qty === 0) {
        truck.inventory.splice(invIdx, 1);
      }
      await this.movements.record({
        productId: item.productId,
        type: InventoryMovementType.RETURN_FROM_TRUCK,
        quantityChange: item.qty,
        quantityBefore: before,
        quantityAfter: before + item.qty,
        sourceType: InventoryLocationType.TRUCK,
        sourceTruckId: String(truck._id),
        destinationType: InventoryLocationType.WAREHOUSE,
        referenceType: 'TRUCK_RETURN',
        referenceId: String(truck._id),
        referenceCode: truck.code,
      });
    }

    // TODO: We could save dto.note to a TruckReturns collection for logging

    return await truck.save();
  }
}
