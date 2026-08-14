import { Body, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { CreateWebsiteOrderDto, VerifyWebsiteCustomerDto } from '../../../collection/website-orders/dtos/website-orders.dto';
import { WebsiteOrdersService } from '../../../collection/website-orders/website-orders.service';
import { PublicController } from '../decorators/swagger';
import { AccessWebsiteContentDto, WebsiteContentQueryDto } from '../../../collection/website-contents/dtos/website-contents.dto';
import { WebsiteContentsService } from '../../../collection/website-contents/website-contents.service';

@PublicController(['website'])
export class WebsiteController {
  constructor(private readonly service: WebsiteOrdersService, private readonly contents: WebsiteContentsService) {}

  @Get('categories') categories(): Promise<any> { return this.service.publicCategories(); }
  @Get('products') products(@Query() q: any): Promise<any> { return this.service.catalog(q); }
  @Get('products/:identifier') product(@Param('identifier') identifier: string): Promise<any> { return this.service.publicProduct(identifier); }
  @Post('customers/verify') verify(@Body() dto: VerifyWebsiteCustomerDto): Promise<any> { return this.service.verifyCustomer(dto.customerCode, dto.phone); }
  @Post('orders') createOrder(@Body() dto: CreateWebsiteOrderDto): Promise<any> { return this.service.create(dto); }
  @Get('orders/:code') order(@Param('code') code: string, @Headers('x-order-token') token: string): Promise<any> { return this.service.publicDetail(code, token); }
  @Post('orders/:code/payments/simulate-success') simulate(@Param('code') code: string, @Headers('x-order-token') token: string): Promise<any> { return this.service.simulatePayment(code, token); }
  @Get('contents') contentList(@Query() q: WebsiteContentQueryDto): Promise<any> { return this.contents.publicList(q); }
  @Get('contents/:slug') content(@Param('slug') slug: string): Promise<any> { return this.contents.publicDetail(slug); }
  @Post('contents/:slug/access') contentAccess(@Param('slug') slug: string, @Body() dto: AccessWebsiteContentDto): Promise<any> { return this.contents.access(slug, dto.customerCode, dto.phone); }
  @Get('content-categories') contentCategories(): Promise<any> { return this.contents.listCategories(true); }
  @Get('config') config(@Query('group') group?: string): Promise<any> { return this.contents.listSettings(true, group); }
}
