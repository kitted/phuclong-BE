import {
  IsNotEmpty,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsMongoId,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { ID } from 'src/core/interfaces/id.interface';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ required: false }) @IsString() @IsOptional() barcode?: string;
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  productType?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() brandId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: false }) @IsString() @IsOptional() imageUrl?: string;
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  websiteProductId?: string;
  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  plusExCoinEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsMongoId() // Đảm bảo ID truyền lên đúng định dạng MongoDB ObjectId
  @IsOptional()
  categoryId?: ID | string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiProperty({ required: false })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  costPrice?: number;

  @ApiProperty({ required: false })
  @Type(() => Number)
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
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  @IsArray()
  rows: Record<string, unknown>[];
}

export class ProductListQueryDto {
  @ApiProperty({ required: false }) @IsOptional() search?: string;
  @ApiProperty({ required: false, default: 1 }) @IsOptional() page?: string;
  @ApiProperty({ required: false, default: 20 }) @IsOptional() limit?: string;
}
