import { Body, Get, Param, Patch, Query } from '@nestjs/common';
import { MapWebsiteProductDto } from '../../../collection/website-orders/dtos/website-orders.dto';
import { WebsiteOrdersService } from '../../../collection/website-orders/website-orders.service';
import { ID } from '../../../core/interfaces/id.interface';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { AdminOnly } from '../decorators/admin-only';
import { WarehouseController } from '../decorators/warehouse';

@WarehouseController(['website-products'])
export class WebsiteProductsController {
  constructor(private readonly service: WebsiteOrdersService) {}
  @Get() @AdminOnly() list(@Query() query: any): Promise<any> { return this.service.adminProducts(query); }
  @Patch(':id/map-inventory') @AdminOnly()
  map(@Param('id', ParseIdPipe) id: ID, @Body() dto: MapWebsiteProductDto): Promise<any> {
    return this.service.mapInventoryProduct(String(id), dto.inventoryProductId);
  }
}
