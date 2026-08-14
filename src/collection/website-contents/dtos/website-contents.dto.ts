import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsMongoId, IsOptional, IsString, IsUrl, Matches, MaxLength, Min } from 'class-validator';
import { WebsiteContentStatus, WebsiteContentType } from '../schemas/website-contents.schema';
import { WebsiteSettingType } from '../schemas/website-settings.schema';

export class CreateWebsiteContentDto {
  @IsString() @MaxLength(250) title: string;
  @IsString() @MaxLength(250) slug: string;
  @IsEnum(WebsiteContentType) type: WebsiteContentType;
  @IsOptional() @IsMongoId() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(1000) excerpt?: string;
  @IsString() @MaxLength(200000) contentHtml: string;
  @IsOptional() @IsUrl({ require_protocol: true }) coverImageUrl?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) hashtags?: string[];
  @IsOptional() @IsEnum(WebsiteContentStatus) status?: WebsiteContentStatus;
  @IsOptional() @IsBoolean() requiresCustomerVerification?: boolean;
  @IsOptional() @IsDateString() publishedAt?: string;
}

export class UpdateWebsiteContentDto {
  @IsOptional() @IsString() @MaxLength(250) title?: string;
  @IsOptional() @IsString() @MaxLength(250) slug?: string;
  @IsOptional() @IsEnum(WebsiteContentType) type?: WebsiteContentType;
  @IsOptional() @IsMongoId() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(1000) excerpt?: string;
  @IsOptional() @IsString() @MaxLength(200000) contentHtml?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) coverImageUrl?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) hashtags?: string[];
  @IsOptional() @IsEnum(WebsiteContentStatus) status?: WebsiteContentStatus;
  @IsOptional() @IsBoolean() requiresCustomerVerification?: boolean;
  @IsOptional() @IsDateString() publishedAt?: string;
}

export class WebsiteContentQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(WebsiteContentType) type?: WebsiteContentType;
  @IsOptional() @IsMongoId() categoryId?: string;
  @IsOptional() @IsEnum(WebsiteContentStatus) status?: WebsiteContentStatus;
  @IsOptional() @IsString() hashtag?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean()
  requiresCustomerVerification?: boolean;
  @IsOptional() page?: string;
  @IsOptional() limit?: string;
}

export class AccessWebsiteContentDto {
  @IsString() customerCode: string;
  @IsString() phone: string;
}

export class CreateWebsiteContentCategoryDto {
  @IsString() @MaxLength(200) name: string;
  @IsString() @MaxLength(200) slug: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) imageUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateWebsiteContentCategoryDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(200) slug?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) imageUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class CreateWebsiteSettingDto {
  @IsString() @Matches(/^[A-Z0-9_.-]+$/i) @MaxLength(100) key: string;
  @IsString() @MaxLength(200) label: string;
  @IsString() @MaxLength(100) group: string;
  @IsEnum(WebsiteSettingType) type: WebsiteSettingType;
  @IsString() @MaxLength(200000) value: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateWebsiteSettingDto {
  @IsOptional() @IsString() @Matches(/^[A-Z0-9_.-]+$/i) @MaxLength(100) key?: string;
  @IsOptional() @IsString() @MaxLength(200) label?: string;
  @IsOptional() @IsString() @MaxLength(100) group?: string;
  @IsOptional() @IsEnum(WebsiteSettingType) type?: WebsiteSettingType;
  @IsOptional() @IsString() @MaxLength(200000) value?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}
