import { PromotionRuleEngineService } from './promotion-rule-engine.service';
import { ConditionCombination, PromotionConditionMetric, PromotionConditionOperator, PromotionProductScope, RewardRepeatMode } from '../promotions/schemas/promotions.schema';

describe('PromotionRuleEngineService conditions', () => {
  const engine = new PromotionRuleEngineService({} as any, {} as any);
  const condition = (overrides: Record<string, unknown> = {}) => ({
    metric: PromotionConditionMetric.QUANTITY,
    operator: PromotionConditionOperator.AT_LEAST,
    scope: PromotionProductScope.CATEGORY,
    categoryIds: ['oil'],
    minimumQuantity: 10,
    allowMixedBrands: true,
    ...overrides,
  });
  const item = (qty: number, lineTotal = qty * 100, brandId = 'A') => ({ productId: `p-${brandId}`, categoryId: 'oil', brandId, qty, price: 100, lineTotal });

  it('repeats rewards by threshold multiples', () => {
    const result = (engine as any).evaluate({ repeatMode: RewardRepeatMode.MULTIPLE, conditionGroups: [{ combination: ConditionCombination.ALL, conditions: [condition()] }] }, [item(26)]);
    expect(result.applicationCount).toBe(2);
  });

  it('supports ANY quantity or amount conditions', () => {
    const result = (engine as any).evaluate({ repeatMode: RewardRepeatMode.MULTIPLE, conditionGroups: [{ combination: ConditionCombination.ANY, conditions: [condition({ minimumQuantity: 20 }), condition({ metric: PromotionConditionMetric.AMOUNT, minimumAmount: 4000 })] }] }, [item(10, 5000)]);
    expect(result.eligible).toBe(true);
    expect(result.applicationCount).toBe(1);
  });

  it('does not mix brands when the rule requires one brand', () => {
    const result = (engine as any).evaluate({ repeatMode: RewardRepeatMode.MULTIPLE, conditionGroups: [{ combination: ConditionCombination.ALL, conditions: [condition({ allowMixedBrands: false })] }] }, [item(6, 600, 'A'), item(6, 600, 'B')]);
    expect(result.eligible).toBe(false);
  });
});
