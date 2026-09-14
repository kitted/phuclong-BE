import { BadRequestException } from '@nestjs/common';
import { TruckStockSyncService } from './truck-stock-sync.service';
import { TruckStockCheckStatus } from './schemas/truck-stock-checks.schema';

describe('TruckStockSyncService stock-check decisions', () => {
  const service: any = Object.create(TruckStockSyncService.prototype);

  it('allows adding a catalog product that is not yet on the truck', () => {
    const blockers = service.blockers({
      items: [
        {
          productId: '507f1f77bcf86cd799439011',
          productCode: 'PLUSEX1L',
          status: TruckStockCheckStatus.NOT_ON_TRUCK,
          actualQuantity: 20,
        },
      ],
    });

    expect(blockers).toEqual([]);
  });

  it('allows missing file rows and validates explicit deletion choices', () => {
    const candidateId = '507f1f77bcf86cd799439011';
    const check = {
      items: [
        {
          productId: candidateId,
          productCode: 'OLDITEM',
          status: TruckStockCheckStatus.MISSING_FROM_FILE,
        },
      ],
    };

    expect(service.blockers(check)).toEqual([]);
    expect(
      service.selectedDeletionIds(check, [candidateId, candidateId]),
    ).toEqual([candidateId]);
    expect(() =>
      service.selectedDeletionIds(check, ['507f191e810c19729de860ea']),
    ).toThrow(BadRequestException);
  });

  it('still blocks unknown catalog codes', () => {
    const blockers = service.blockers({
      items: [
        {
          productCode: 'UNKNOWN',
          status: TruckStockCheckStatus.UNKNOWN,
          actualQuantity: 1,
        },
      ],
    });

    expect(blockers).toHaveLength(1);
    expect(blockers[0].productCode).toBe('UNKNOWN');
  });
});
