import { Type } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class DocumentSafetyDateQueryDto {
  @IsDateString()
  date: string;
}

export class DocumentSafetyHistoryQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit = 20;
}

export class ReverseDocumentDayDto {
  @IsDateString()
  date: string;

  @IsString()
  @MinLength(5)
  reason: string;

  @IsString()
  confirmation: string;

  @IsString()
  @MinLength(8)
  idempotencyKey: string;
}
