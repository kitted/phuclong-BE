import { Body, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import {
  CancelWarrantyReturnDto,
  CompleteWarrantyReturnDto,
  CreateWarrantyReturnDto,
  WarrantyReturnQueryDto,
} from '../../../collection/warranty-returns/dtos/warranty-returns.dto';
import { WarrantyReturnsService } from '../../../collection/warranty-returns/warranty-returns.service';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { AdminOnly } from '../decorators/admin-only';
import { WarehouseController } from '../decorators/warehouse';

@WarehouseController(['warranty-returns'])
@AdminOnly()
export class WarrantyReturnsController {
  constructor(private readonly service: WarrantyReturnsService) {}

  private actor(req: AuthRequest) {
    const value: any = req.user;
    const user = value?._doc || value || {};
    return {
      id: String(user.id || user._id || ''),
      name: user.fullName || user.name || user.username,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách phiếu hàng bảo hành' })
  list(@Query() query: WarrantyReturnQueryDto): Promise<any> {
    return this.service.findAll(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Tổng hợp hàng bảo hành' })
  summary(): Promise<any> {
    return this.service.summary();
  }

  @Post()
  @ApiOperation({ summary: 'Nhận hàng bảo hành từ kho hoặc xe' })
  create(
    @Body() dto: CreateWarrantyReturnDto,
    @Req() req: AuthRequest,
  ): Promise<any> {
    return this.service.create(dto, this.actor(req));
  }

  @Get(':id')
  detail(@Param('id', ParseIdPipe) id: string): Promise<any> {
    return this.service.findOne(id);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Bắt đầu xử lý bảo hành' })
  start(
    @Param('id', ParseIdPipe) id: string,
    @Req() req: AuthRequest,
  ): Promise<any> {
    return this.service.start(id, this.actor(req));
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Hoàn tất và xử lý tồn hàng bảo hành' })
  complete(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: CompleteWarrantyReturnDto,
    @Req() req: AuthRequest,
  ): Promise<any> {
    return this.service.complete(id, dto, this.actor(req));
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Hủy phiếu và hoàn hàng lại nguồn' })
  cancel(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: CancelWarrantyReturnDto,
    @Req() req: AuthRequest,
  ): Promise<any> {
    return this.service.cancel(id, dto, this.actor(req));
  }
}
