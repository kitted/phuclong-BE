import { Type } from 'class-transformer';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { LeadInteractionResult } from '../schemas/leads.schema';

export class LeadLocationDto {
  @Type(() => Number) @IsLatitude() latitude: number;
  @Type(() => Number) @IsLongitude() longitude: number;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}
export class CreateLeadDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @IsString() @IsNotEmpty() @MaxLength(30) phone: string;
  @IsOptional() @IsString() @MaxLength(200) contactName?: string;
  @IsOptional() @IsString() @MaxLength(120) businessType?: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @ValidateNested() @Type(() => LeadLocationDto) location: LeadLocationDto;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @Matches(/^#[0-9A-Fa-f]{6}$/) color?: string;
}
export class UpdateLeadDto extends CreateLeadDto {}
export class LeadQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: 'ALL' | 'OPEN' | 'CONVERTED';
  @IsOptional() @Type(() => Number) page?: number = 1;
  @IsOptional() @Type(() => Number) limit?: number = 50;
}
export class CreateLeadInteractionDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) note: string;
  @IsOptional() @IsEnum(LeadInteractionResult) result?: LeadInteractionResult;
}
