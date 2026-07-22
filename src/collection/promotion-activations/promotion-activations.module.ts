import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { PromotionActivationCounters, PromotionActivations } from './schemas/promotion-activations.schema';
import { PromotionActivationsService } from './promotion-activations.service';
@Module({ imports: [TypegooseModule.forFeature([PromotionActivations, PromotionActivationCounters])], providers: [PromotionActivationsService], exports: [PromotionActivationsService, TypegooseModule] })
export class PromotionActivationsModule {}
