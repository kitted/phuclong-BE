import {
  IsNotEmpty, IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsMongoId,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { ID } from 'src/core/interfaces/id.interface';

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ required: false }) @IsString() @IsOptional() barcode?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() productType?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() brandId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: false })
  @IsMongoId() // Đảm bảo ID truyền lên đúng định dạng MongoDB ObjectId
  @IsOptional()
  categoryId?: ID | string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  costPrice?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  sellPrice?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  minStock?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  stock?: number;

  @ApiProperty({ required: false })
  @IsMongoId() // Đảm bảo ID truyền lên đúng định dạng MongoDB ObjectId
  @IsOptional()
  supplierId?: ID | string;
}

// PartialType sẽ kế thừa toàn bộ CreateProductDto và tự động chuyển mọi trường thành Optional
export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ImportProductsDto {
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  @IsArray()
  rows: Record<string, unknown>[];
}

export class ProductListQueryDto {
  @ApiProperty({ required: false }) @IsOptional() search?: string;
  @ApiProperty({ required: false, default: 1 }) @IsOptional() page?: string;
  @ApiProperty({ required: false, default: 20 }) @IsOptional() limit?: string;
}
