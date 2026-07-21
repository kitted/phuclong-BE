import { Injectable } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { InjectModel } from 'nestjs-typegoose';
import {
  InventoryMovements,
  InventoryMovementType,
  InventoryLocationType,
} from './schemas/inventory-movement.schema';

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

  async record(input: RecordMovementInput) {
    return this.model.create(input);
  }

  async recordMany(inputs: RecordMovementInput[]) {
    if (!inputs.length) return [];
    return this.model.insertMany(inputs);
  }
}
