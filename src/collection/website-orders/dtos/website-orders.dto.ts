import { Type } from 'class-transformer';
import {
  ArrayUnique,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { InvoicePaymentDto } from '../../invoices/dtos/invoices.dto';
import {
  WebsiteCustomerType,
  WebsiteOrderStatus,
  WebsitePaymentMethod,
} from '../schemas/website-orders.schema';

export class WebsiteOrderItemDto {
  @IsMongoId() productId: string;
  @IsInt() @Min(1) quantity: number;
}

export class CreateWebsiteOrderDto {
  @IsEnum(WebsiteCustomerType) customerType: WebsiteCustomerType;
  @IsOptional() @IsString() customerCode?: string;
  @IsString() @MaxLength(200) customerName: string;
  @IsString() @MaxLength(30) customerPhone: string;
  @IsOptional() @IsEmail() customerEmail?: string;
  @IsString() @MaxLength(500) deliveryAddress: string;
  @IsOptional() @IsString() @MaxLength(1000) customerNote?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => WebsiteOrderItemDto)
  items: WebsiteOrderItemDto[];
  @IsEnum(WebsitePaymentMethod) paymentMethod: WebsitePaymentMethod;
}

export class VerifyWebsiteCustomerDto {
  @IsString() customerCode: string;
  @IsString() phone: string;
}

export class WebsiteOrderAdminQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(WebsiteOrderStatus) status?: WebsiteOrderStatus;
  @IsOptional() @IsMongoId() assignedSaleId?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() page?: string;
  @IsOptional() limit?: string;
}

export class AssignWebsiteOrderDto {
  @IsMongoId() saleId: string;
  @IsOptional() @IsString() note?: string;
}

export class ChangeWebsiteOrderStatusDto {
  @IsEnum(WebsiteOrderStatus) status: WebsiteOrderStatus;
  @IsOptional() @IsString() note?: string;
}

export class ConvertWebsiteOrderDto {
  @IsEnum(['warehouse', 'truck']) sourceType: 'warehouse' | 'truck';
  @IsOptional() @IsMongoId() truckId?: string;
  @IsOptional() @IsMongoId() salespersonId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InvoicePaymentDto)
  payments?: InvoicePaymentDto[];
  @IsOptional() @IsString() voucherCode?: string;
  @IsString() @MaxLength(200) idempotencyKey: string;
}

export class MapWebsiteProductDto {
  @IsOptional() @IsMongoId() inventoryProductId?: string | null;
}

export class CreateWebsiteProductDto {
  @IsString() @IsNotEmpty() @MaxLength(100) code: string;
  @IsString() @IsNotEmpty() @MaxLength(250) name: string;
  @IsString() @IsNotEmpty() @MaxLength(250) slug: string;
  @IsOptional() @IsMongoId() categoryId?: string | null;
  @IsOptional() @IsString() @MaxLength(100) unit?: string;
  @IsNumber() @Min(0) sellPrice: number;
  @IsOptional() @IsString() @MaxLength(1000) shortDescription?: string;
  @IsOptional() @IsString() @MaxLength(200000) descriptionHtml?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsUrl({ require_protocol: true }, { each: true }) imageUrls?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateWebsiteProductDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) code?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(250) name?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(250) slug?: string;
  @IsOptional() @IsMongoId() categoryId?: string | null;
  @IsOptional() @IsString() @MaxLength(100) unit?: string;
  @IsOptional() @IsNumber() @Min(0) sellPrice?: number;
  @IsOptional() @IsString() @MaxLength(1000) shortDescription?: string;
  @IsOptional() @IsString() @MaxLength(200000) descriptionHtml?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsUrl({ require_protocol: true }, { each: true }) imageUrls?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}
