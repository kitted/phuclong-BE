import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ID } from 'src/core/interfaces/id.interface';
import { ImportStatus } from '../schemas/imports.schema';

export class ImportItemDto {
  @ApiProperty()
  @IsNotEmpty()
  productId: string;

  @ApiProperty()
  @IsNumber()
  qty: number;

  @ApiProperty()
  @IsNumber()
  price: number;
}

export class CreateImportDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ required: false })
  @IsOptional()
  supplierId?: ID | string;

  @ApiProperty({ required: false, enum: ImportStatus })
  @IsEnum(ImportStatus)
  @IsOptional()
  status?: ImportStatus;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  note?: string;

  @ApiProperty()
  @IsNumber()
  totalAmount: number;

  @ApiProperty({ type: [ImportItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportItemDto)
  items: ImportItemDto[];
}
export class ChangeImportStatusDto {
  @IsEnum(ImportStatus) status: ImportStatus;
  @IsOptional() @IsString() reason?: string;
}
