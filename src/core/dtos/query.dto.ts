import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export enum sortTypeEnum {
  desc = 'desc',
  asc = 'asc',
}
export class QueryDto {
  @ApiPropertyOptional({ type: Number, default: 10 })
  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  limit: number;

  @ApiPropertyOptional({ type: Number, default: 1 })
  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  page: number;

  @ApiPropertyOptional({
    type: String,
    default: 'createdAt',
  })
  @IsString()
  @IsOptional()
  sortBy: string;

  @ApiPropertyOptional({
    enum: sortTypeEnum,
    default: sortTypeEnum.asc,
  })
  @IsOptional()
  @IsEnum(sortTypeEnum)
  sortType: sortTypeEnum;

  @ApiPropertyOptional({
    type: String,
  })
  @IsString()
  @IsOptional()
  searchBy: string;
}
