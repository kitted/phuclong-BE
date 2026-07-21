import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ID } from 'src/core/interfaces/id.interface';

export class InvoiceItemDto {
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

export class CreateInvoiceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  date: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  customer: string;

  @ApiProperty({ required: false })
  @IsOptional()
  customerId?: ID | string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  paidAmount?: number;

  @ApiProperty({ enum: ['warehouse', 'truck'] })
  @IsEnum(['warehouse', 'truck'])
  @IsNotEmpty()
  sourceType: string;

  @ApiProperty({ required: false })
  @IsOptional()
  truckId?: ID | string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  note?: string;

  @ApiProperty()
  @IsNumber()
  totalAmount: number;

  @ApiProperty({ type: [InvoiceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];
}
