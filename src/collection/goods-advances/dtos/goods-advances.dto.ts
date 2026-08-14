import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { GoodsAdvanceStatus } from '../schemas/goods-advances.schema';
export class GoodsAdvanceItemDto {
  @IsMongoId() productId: string;
  @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsString() note?: string;
}
export class CreateGoodsAdvanceDto {
  @IsOptional() @IsDateString() date?: string;
  @IsMongoId() employeeId: string;
  @IsMongoId() truckId: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsAdvanceItemDto)
  items: GoodsAdvanceItemDto[];
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() issues?: string;
  @IsOptional() @IsString() warehouseIssuerName?: string;
  @IsOptional() @IsString() advanceRecipientName?: string;
  @IsOptional() @IsEnum(GoodsAdvanceStatus) status?: GoodsAdvanceStatus;
}
export class UpdateGoodsAdvanceDto extends CreateGoodsAdvanceDto {}
export class ChangeGoodsAdvanceStatusDto {
  @IsEnum(GoodsAdvanceStatus) status: GoodsAdvanceStatus;
  @IsOptional() @IsString() reason?: string;
}
export class GoodsAdvanceQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(GoodsAdvanceStatus) status?: GoodsAdvanceStatus;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() page?: string;
  @IsOptional() limit?: string;
}
