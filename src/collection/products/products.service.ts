import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { Products } from './schemas/products.schema';
import { ReturnModelType } from '@typegoose/typegoose';
import { CreateProductDto, UpdateProductDto } from './dtos/products.dto';
import { ID } from 'src/core/interfaces/id.interface';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Products)
    private readonly model: ReturnModelType<typeof Products>,
  ) {}

  async create(dto: CreateProductDto) {
    const existing = await this.model.findOne({ code: dto.code, isDeleted: false });
    if (existing) throw new BadRequestException('Mã sản phẩm đã tồn tại');
    return await this.model.create(dto);
  }

  async findAll() {
    return await this.model.find({ isDeleted: false })
      .populate('categoryId', 'name')
      .populate('supplierId', 'name');
  }

  async findOne(id: ID | string) {
    const doc = await this.model.findOne({ _id: id, isDeleted: false })
      .populate('categoryId', 'name')
      .populate('supplierId', 'name');
    if (!doc) throw new NotFoundException('Không tìm thấy sản phẩm');
    return doc;
  }

  async update(id: ID | string, dto: UpdateProductDto) {
    if (dto.code) {
      const existing = await this.model.findOne({ code: dto.code, _id: { $ne: id }, isDeleted: false });
      if (existing) throw new BadRequestException('Mã sản phẩm đã tồn tại');
    }
    const doc = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      dto,
      { new: true },
    );
    if (!doc) throw new NotFoundException('Không tìm thấy sản phẩm');
    return doc;
  }

  async remove(id: ID | string) {
    const doc = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Không tìm thấy sản phẩm');
    return doc;
  }
}
