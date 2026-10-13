import { Types } from 'mongoose';
import { CustomerReturnsService } from './customer-returns.service';
import { ReturnCondition } from './schemas/customer-returns.schema';

describe('CustomerReturnsService zero-price returns', () => {
  const baseDto = () => ({
    customerId: new Types.ObjectId().toString(),
    destinationTruckId: new Types.ObjectId().toString(),
    idempotencyKey: 'return-zero-price-test',
    items: [
      {
        productId: new Types.ObjectId().toString(),
        qty: 2,
        returnUnitPrice: 0,
        condition: ReturnCondition.GOOD,
      },
    ],
    settlement: {
      debtReductionAmount: 0,
      refunds: [],
    },
    reason: 'Nhận lại hàng nhưng không hoàn tiền',
  });

  it('accepts a return whose total value is 0đ', async () => {
    const service: any = Object.create(CustomerReturnsService.prototype);

    const result = await service.preview(baseDto());

    expect(result.data.returnAmount).toBe(0);
    expect(result.data.refundAmount).toBe(0);
    expect(result.data.lines[0]).toEqual(
      expect.objectContaining({
        qty: 2,
        returnUnitPrice: 0,
        lineReturnAmount: 0,
      }),
    );
    expect(result.data.settlement).toEqual({
      debtReductionAmount: 0,
      refunds: [],
    });
  });

  it('accepts price 0đ against an old selling price when a reason is supplied', async () => {
    const service: any = Object.create(CustomerReturnsService.prototype);
    const dto = baseDto();
    (dto.items[0] as any).previousUnitPrice = 100000;
    (dto as any).priceAdjustmentReason = 'Hàng lỗi, chỉ nhận lại tồn kho';

    const result = await service.preview(dto as any);

    expect(result.data.returnAmount).toBe(0);
    expect(result.data.previousReferenceAmount).toBe(200000);
    expect(result.data.priceDifferenceAmount).toBe(-200000);
  });

  it('keeps the selected return time in preview', async () => {
    const service: any = Object.create(CustomerReturnsService.prototype);
    const dto = baseDto();
    (dto as any).date = '2026-10-10T08:30:00.000Z';

    const result = await service.preview(dto as any);

    expect(result.data.date).toEqual(new Date('2026-10-10T08:30:00.000Z'));
  });
});
