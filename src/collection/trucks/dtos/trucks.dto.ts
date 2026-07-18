import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ID } from 'src/core/interfaces/id.interface';

export class CreateTruckDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  licensePlate: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  driver?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false, enum: ['active', 'inactive'] })
  @IsEnum(['active', 'inactive'])
  @IsOptional()
  status?: string;
}

export class UpdateTruckDto extends CreateTruckDto {}

export class TruckItemDto {
  @ApiProperty()
  @IsNotEmpty()
  productId: string;

  @ApiProperty()
  @IsNumber()
  qty: number;
}

export class LoadGoodsDto {
  @ApiProperty({ type: [TruckItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TruckItemDto)
  items: TruckItemDto[];
}

export class ReturnGoodsDto extends LoadGoodsDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  note?: string;
}
