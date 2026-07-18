import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ID } from 'src/core/interfaces/id.interface';

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: false })
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
  @IsOptional()
  supplierId?: ID | string;
}

export class UpdateProductDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
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
  @IsOptional()
  supplierId?: ID | string;
}
