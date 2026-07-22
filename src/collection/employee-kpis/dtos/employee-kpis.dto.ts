import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { EmployeeKpiMetric, EmployeeKpiStatus } from '../schemas/employee-kpis.schema';
export class EmployeeKpiTargetDto {
  @IsEnum(EmployeeKpiMetric) metric: EmployeeKpiMetric;
  @IsNumber() @Min(0) targetValue: number;
  @IsOptional() @IsString() promotionId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) productIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) categoryIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) brandIds?: string[];
  @IsOptional() @IsString() productType?: string;
  @IsOptional() @IsBoolean() includeGiftLines?: boolean;
}
export class CreateEmployeeKpiDto {
  @IsOptional() @IsString() name?: string;
  @IsString() employeeId: string;
  @IsDateString() from: string;
  @IsDateString() to: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => EmployeeKpiTargetDto) targets: EmployeeKpiTargetDto[];
  @IsOptional() @IsEnum(EmployeeKpiStatus) status?: EmployeeKpiStatus;
  @IsOptional() @IsString() note?: string;
}
export class UpdateEmployeeKpiDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EmployeeKpiTargetDto) targets?: EmployeeKpiTargetDto[];
  @IsOptional() @IsEnum(EmployeeKpiStatus) status?: EmployeeKpiStatus;
  @IsOptional() @IsString() note?: string;
}
export class EmployeeKpiQueryDto {
  @IsOptional() @IsString() search?: string; @IsOptional() @IsString() employeeId?: string; @IsOptional() @IsEnum(EmployeeKpiStatus) status?: EmployeeKpiStatus;
  @IsOptional() @IsString() from?: string; @IsOptional() @IsString() to?: string;
  @IsOptional() @Type(() => Number) @Min(1) page = 1; @IsOptional() @Type(() => Number) @Min(1) @Max(100) limit = 20;
}
export class LeaderboardQueryDto { @IsDateString() from: string; @IsDateString() to: string; @IsEnum(EmployeeKpiMetric) metric: EmployeeKpiMetric; }
export class ChangeEmployeeKpiStatusDto { @IsEnum(EmployeeKpiStatus) status: EmployeeKpiStatus; @IsOptional() @IsString() note?: string; }
export class EmployeeKpiEvidenceQueryDto {
  @Type(() => Number) @Min(0) targetIndex = 0;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @Min(1) @Max(100) limit = 20;
}
