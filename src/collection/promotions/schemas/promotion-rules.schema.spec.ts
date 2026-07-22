import { buildSchema } from '@typegoose/typegoose';
import { Promotions, PromotionType, RewardRepeatMode } from './promotions.schema';

describe('promotion rule schema compatibility', () => {
  const schema = buildSchema(Promotions);

  it('keeps discount fields while adding gift rules', () => {
    expect(schema.path('discountType')).toBeDefined();
    expect(schema.path('discountValue')).toBeDefined();
    expect(schema.path('conditionGroups')).toBeDefined();
    expect(schema.path('giftGroups')).toBeDefined();
  });

  it('supports voucher and gift promotion types', () => {
    expect(schema.path('type').options.enum).toEqual(expect.arrayContaining([
      PromotionType.VOUCHER,
      PromotionType.BUY_X_GET_Y,
      PromotionType.BUNDLE_GIFT,
    ]));
    expect(schema.path('repeatMode').options.default).toBe(RewardRepeatMode.MULTIPLE);
  });
});
