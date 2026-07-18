import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { Categories } from './schemas/categories.schema';
import { ReturnModelType } from '@typegoose/typegoose';
import { CreateCategoryDto, UpdateCategoryDto } from './dtos/categories.dto';
import { ID } from 'src/core/interfaces/id.interface';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Categories)
    private readonly model: ReturnModelType<typeof Categories>,
  ) {}

  async create(dto: CreateCategoryDto) {
    return await this.model.create(dto);
  }

  async findAll() {
    return await this.model.find({ isDeleted: false });
  }

  async findOne(id: ID | string) {
    const doc = await this.model.findOne({ _id: id, isDeleted: false });
    if (!doc) throw new NotFoundException('Không tìm thấy danh mục');
    return doc;
  }

  async update(id: ID | string, dto: UpdateCategoryDto) {
    const doc = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      dto,
      { new: true },
    );
    if (!doc) throw new NotFoundException('Không tìm thấy danh mục');
    return doc;
  }

  async remove(id: ID | string) {
    const doc = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Không tìm thấy danh mục');
    return doc;
  }
}
