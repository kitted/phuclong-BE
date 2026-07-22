import { Body, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { WarehouseController } from '../decorators/warehouse';
import { InvoicesService } from 'src/collection/invoices/invoices.service';
import { ApplyGiftPromotionDto, CreateInvoiceDto, GiftPromotionPreviewDto, InvoicePreviewDto, InvoiceQueryDto } from 'src/collection/invoices/dtos/invoices.dto';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';

@WarehouseController(['invoices'])
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @ApiOperation({ summary: 'Create invoice' })
  @Post()
  async create(@Body() dto: CreateInvoiceDto, @Req() request: AuthRequest) {
    const user: any = request.user;
    return await this.service.create(dto, {
      id: String(user?.id || user?._id || user?._doc?._id || ''),
      role: user?.role || user?._doc?.role,
    });
  }

  @ApiOperation({ summary: 'Preview server-calculated invoice totals and voucher' })
  @Post('preview')
  preview(@Body() dto: InvoicePreviewDto) {
    return this.service.preview(dto);
  }

  @ApiOperation({ summary: 'Find eligible and nearly eligible gift promotions' })
  @Post('promotions/preview')
  giftPromotionsPreview(@Body() dto: GiftPromotionPreviewDto) {
    return this.service.giftPromotionsPreview(dto);
  }

  @ApiOperation({ summary: 'Validate gift selection and preview promotion application' })
  @Post('promotions/apply')
  applyGiftPromotion(@Body() dto: ApplyGiftPromotionDto) {
    return this.service.applyGiftPromotion(dto);
  }

  @ApiOperation({ summary: 'Get all invoices' })
  @Get()
  async findAll(@Query() query: InvoiceQueryDto): Promise<any> {
    return await this.service.findAll(query);
  }

  @ApiOperation({ summary: 'Get filtered invoice revenue summary' })
  @Get('summary')
  summary(@Query() query: InvoiceQueryDto): Promise<any> { return this.service.summary(query); }

  @ApiOperation({ summary: 'Get invoice by ID' })
  @Get(':id')
  async findOne(@Param('id', ParseIdPipe) id: ID): Promise<any> {
    return await this.service.findOne(id);
  }
}
