import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { WebsiteEventType } from '../schemas/website-analytics.schema';

export class TrackWebsiteEventDto {
  @IsEnum(WebsiteEventType) eventType: WebsiteEventType;
  @IsString() @MaxLength(80) landingKey: string;
  @IsString() @MaxLength(300) pagePath: string;
  @IsString() @MaxLength(100) sessionId: string;
  @IsOptional() @IsString() @MaxLength(100) visitorId?: string;
  @IsOptional() @IsString() @MaxLength(100) source?: string;
  @IsOptional() @IsString() @MaxLength(100) medium?: string;
  @IsOptional() @IsString() @MaxLength(140) campaign?: string;
  @IsOptional() @IsString() @MaxLength(140) content?: string;
  @IsOptional() @IsString() @MaxLength(140) term?: string;
  @IsOptional() @IsString() @MaxLength(100) sale?: string;
  @IsOptional() @IsString() @MaxLength(100) product?: string;
  @IsOptional() @IsString() @MaxLength(100) model?: string;
  @IsOptional() @IsString() @MaxLength(500) referrer?: string;
  @IsOptional() @IsString() @MaxLength(30) deviceType?: string;
  @IsOptional() @IsObject() metadata?: Record<string, any>;
}

export class CreateWebsiteLandingLeadDto {
  @IsString() @MaxLength(120) name: string;
  @IsString() @MaxLength(20) phone: string;
  @IsOptional() @IsString() @MaxLength(100) province?: string;
  @IsOptional() @IsString() @MaxLength(60) role?: string;
  @IsString() @MaxLength(80) landingKey: string;
  @IsString() @MaxLength(100) sessionId: string;
  @IsOptional() @IsString() @MaxLength(100) source?: string;
  @IsOptional() @IsString() @MaxLength(100) medium?: string;
  @IsOptional() @IsString() @MaxLength(140) campaign?: string;
  @IsOptional() @IsString() @MaxLength(140) content?: string;
  @IsOptional() @IsString() @MaxLength(100) sale?: string;
}

export class WebsiteAnalyticsQueryDto {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() @MaxLength(80) landingKey?: string;
}
