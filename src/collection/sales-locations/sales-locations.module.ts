import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { SalesLocations } from './schemas/sales-locations.schema';
import { SalesLocationsService } from './sales-locations.service';

@Module({
  imports: [TypegooseModule.forFeature([SalesLocations])],
  providers: [SalesLocationsService],
  exports: [SalesLocationsService],
})
export class SalesLocationsModule {}
