import { Injectable } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { InjectModel } from 'nestjs-typegoose';
import {
  InventoryMovements,
  InventoryMovementType,
  InventoryLocationType,
} from './schemas/inventory-movement.schema';
import { ClientSession } from 'mongoose';

export interface RecordMovementInput {
  productId: string;
  type: InventoryMovementType;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  sourceType?: InventoryLocationType;
  sourceTruckId?: string;
  destinationType?: InventoryLocationType;
  destinationTruckId?: string;
  referenceType?: string;
  referenceId?: string;
  referenceCode?: string;
  createdBy?: string;
}

@Injectable()
export class InventoryMovementsService {
  constructor(
    @InjectModel(InventoryMovements)
    private readonly model: ReturnModelType<typeof InventoryMovements>,
  ) {}

  async record(input: RecordMovementInput, session?: ClientSession) {
    if (session) return (await this.model.create([input], { session }))[0];
    return this.model.create(input);
  }

  async recordMany(inputs: RecordMovementInput[], session?: ClientSession) {
    if (!inputs.length) return [];
    return this.model.insertMany(inputs, session ? { session } : undefined);
  }
}
