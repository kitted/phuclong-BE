import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
export class DailyManualAdjustmentDto {
  @IsString() type: string;
  @IsString() label: string;
  @IsNumber() amount: number;
  @IsOptional() @IsString() note?: string;
}
export class CreateDailyReportDto {
  @IsDateString() date: string;
  @IsMongoId() salespersonId: string;
  @IsOptional() @IsString() area?: string;
  @IsOptional() @IsString() performerName?: string;
  @IsOptional() @IsString() vehicle?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyManualAdjustmentDto)
  manualAdjustments?: DailyManualAdjustmentDto[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() issues?: string;
}
export class UpdateDailyReportDto {
  @IsOptional() @IsString() area?: string;
  @IsOptional() @IsString() performerName?: string;
  @IsOptional() @IsString() vehicle?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyManualAdjustmentDto)
  manualAdjustments?: DailyManualAdjustmentDto[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() issues?: string;
}
export class DailyReportQueryDto {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsMongoId() salespersonId?: string;
  @IsOptional() page?: string;
  @IsOptional() limit?: string;
}
export class DailyReportPreviewQueryDto {
  @IsDateString() date: string;
  @IsMongoId() salespersonId: string;
}
