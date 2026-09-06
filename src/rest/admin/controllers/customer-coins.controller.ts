import { Body, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import {
  CustomerCoinQueryDto,
  RedeemCustomerCoinDto,
  UpdateProductCoinSettingDto,
} from '../../../collection/customer-coins/dtos/customer-coins.dto';
import { CustomerCoinsService } from '../../../collection/customer-coins/customer-coins.service';
import { ID } from '../../../core/interfaces/id.interface';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { AdminOnly } from '../decorators/admin-only';
import { WarehouseController } from '../decorators/warehouse';

@WarehouseController(['customer-coins'])
export class CustomerCoinsController {
  constructor(private readonly service: CustomerCoinsService) {}

  private actor(request: AuthRequest) {
    const user: any = request.user;
    const value = user?._doc || user || {};
    return {
      id: String(value.id || value._id || ''),
      name: value.fullName || value.name || value.username || 'Nhân viên',
    };
  }

  @Get()
  @ApiOperation({ summary: 'List customer coin balances' })
  customers(@Query() query: CustomerCoinQueryDto) {
    return this.service.customersList(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Analyze earned and used coins by period' })
  summary(@Query() query: CustomerCoinQueryDto) {
    return this.service.summary(query);
  }

  @Get('products')
  @ApiOperation({ summary: 'List products eligible for PlusEx coin' })
  products(@Query() query: CustomerCoinQueryDto) {
    return this.service.productSettings(query);
  }

  @Post('backfill')
  @AdminOnly()
  @ApiOperation({ summary: 'Accrue coins for historical active invoices' })
  backfill(@Query('limit') limit?: string) {
    return this.service.backfillHistoricalInvoices(Number(limit) || 500);
  }

  @Patch('products/:id')
  @AdminOnly()
  @ApiOperation({ summary: 'Enable or disable PlusEx coin for a product' })
  updateProduct(
    @Param('id', ParseIdPipe) id: ID,
    @Body() dto: UpdateProductCoinSettingDto,
  ) {
    return this.service.updateProductSetting(String(id), dto.plusExCoinEnabled);
  }

  @Get('customers/:id')
  @ApiOperation({ summary: 'Customer coin balances and ledger by period' })
  detail(
    @Param('id', ParseIdPipe) id: ID,
    @Query() query: CustomerCoinQueryDto,
  ) {
    return this.service.customerDetail(String(id), query);
  }

  @Post('customers/:id/redeem')
  @ApiOperation({ summary: 'Redeem customer coin with idempotency' })
  redeem(
    @Param('id', ParseIdPipe) id: ID,
    @Body() dto: RedeemCustomerCoinDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.redeem(String(id), dto, this.actor(request));
  }
}
