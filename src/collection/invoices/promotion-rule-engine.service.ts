import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { ClientSession } from 'mongoose';
import { Products } from '../products/schemas/products.schema';
import { ConditionCombination, GiftSelectionMode, Promotions, PromotionConditionMetric, PromotionConditionOperator, PromotionProductScope, PromotionStatus, PromotionType, RewardRepeatMode } from '../promotions/schemas/promotions.schema';

type CartItem = { productId: string; qty: number; price: number; lineTotal: number; categoryId?: string | null; productType?: string; brandId?: string };
type Selection = { groupCode: string; items: Array<{ productId: string; qty: number }> };

@Injectable()
export class PromotionRuleEngineService {
  constructor(
    @InjectModel(Promotions) private readonly promotionModel: ReturnModelType<typeof Promotions>,
    @InjectModel(Products) private readonly productModel: ReturnModelType<typeof Products>,
  ) {}

  private matches(item: CartItem, rule: any) {
    if (rule.scope === PromotionProductScope.ALL) return true;
    if (rule.scope === PromotionProductScope.PRODUCTS) return (rule.productIds || []).map(String).includes(item.productId);
    if (rule.scope === PromotionProductScope.CATEGORY) return item.categoryId && (rule.categoryIds || []).map(String).includes(item.categoryId);
    if (rule.scope === PromotionProductScope.PRODUCT_TYPE) return String(item.productType || '').toLocaleLowerCase('vi') === String(rule.productType || '').toLocaleLowerCase('vi');
    if (rule.scope === PromotionProductScope.BRAND) return item.brandId && (rule.brandIds || []).map(String).includes(item.brandId);
    return false;
  }

  private points(items: CartItem[], promotion: any) {
    return (promotion.contributionRules || []).reduce((total, rule) => {
      const matched = items.filter((item) => this.matches(item, rule));
      const quantity = Math.min(matched.reduce((sum, item) => sum + item.qty, 0), rule.maxQuantity ?? Number.MAX_SAFE_INTEGER);
      return total + Math.floor(quantity / rule.quantityPerUnit) * rule.contributionPoints;
    }, 0);
  }

  private conditionResult(condition: any, items: CartItem[], promotion: any) {
    const matched = items.filter((item) => this.matches(item, condition));
    let value: number;
    if (condition.metric === PromotionConditionMetric.POINT) value = this.points(items, promotion);
    else {
      const values = (condition.allowMixedBrands === false || condition.groupKey === 'brandId')
        ? [...matched.reduce((groups, item) => { const key = item.brandId || '__NO_BRAND__'; groups.set(key, [...(groups.get(key) || []), item]); return groups; }, new Map<string, CartItem[]>()).values()]
        : [matched];
      value = Math.max(0, ...values.map((group) => condition.metric === PromotionConditionMetric.QUANTITY ? group.reduce((sum, item) => sum + item.qty, 0) : group.reduce((sum, item) => sum + item.lineTotal, 0)));
    }
    const threshold = condition.metric === PromotionConditionMetric.QUANTITY ? condition.minimumQuantity : condition.metric === PromotionConditionMetric.AMOUNT ? condition.minimumAmount : condition.minimumPoints;
    const eligible = condition.operator === PromotionConditionOperator.EXACT ? value === threshold : value >= threshold;
    const count = eligible ? (promotion.repeatMode === RewardRepeatMode.MULTIPLE && condition.operator !== PromotionConditionOperator.EXACT ? Math.floor(value / threshold) : 1) : 0;
    return { metric: condition.metric, value, threshold, eligible, applicationCount: count, missing: Math.max(0, threshold - value) };
  }

  private evaluate(promotion: any, items: CartItem[]) {
    const groups = (promotion.conditionGroups || []).map((group) => {
      const conditions = group.conditions.map((condition) => this.conditionResult(condition, items, promotion));
      const eligible = group.combination === ConditionCombination.ANY ? conditions.some((x) => x.eligible) : conditions.every((x) => x.eligible);
      const counts = conditions.filter((x) => x.eligible).map((x) => x.applicationCount);
      const applicationCount = eligible ? (group.combination === ConditionCombination.ANY ? Math.max(...counts) : Math.min(...counts)) : 0;
      return { combination: group.combination, eligible, applicationCount, conditions };
    });
    let applicationCount = groups.length && groups.every((group) => group.eligible) ? Math.min(...groups.map((group) => group.applicationCount)) : 0;
    if (promotion.repeatMode === RewardRepeatMode.ONCE && applicationCount > 0) applicationCount = 1;
    if (promotion.maxApplicationsPerInvoice) applicationCount = Math.min(applicationCount, promotion.maxApplicationsPerInvoice);
    return { eligible: applicationCount > 0, applicationCount, matchedConditions: groups };
  }

  private async giftOptions(promotion: any, items: CartItem[], session?: ClientSession) {
    const purchasedIds = items.map((item) => item.productId);
    const ids = [...new Set((promotion.giftGroups || []).flatMap((group) => group.selectionMode === GiftSelectionMode.SAME_AS_PURCHASED ? purchasedIds : (group.productIds || []).map(String)))];
    const products: any[] = ids.length ? await this.productModel.find({ _id: { $in: ids }, isDeleted: false }).select('code name unit stock costPrice sellPrice').session(session || null).lean() : [];
    const map = new Map(products.map((product) => [String(product._id), product]));
    return { map, groups: (promotion.giftGroups || []).map((group) => ({ group, optionIds: group.selectionMode === GiftSelectionMode.SAME_AS_PURCHASED ? purchasedIds : (group.productIds || []).map(String) })) };
  }

  async preview(items: CartItem[], session?: ClientSession) {
    const now = new Date();
    const promotions: any[] = await this.promotionModel.find({ type: { $in: [PromotionType.BUY_X_GET_Y, PromotionType.BUNDLE_GIFT] }, status: PromotionStatus.ACTIVE, startAt: { $lte: now }, endAt: { $gte: now }, isDeleted: false }).session(session || null).lean();
    const eligiblePromotions: any[] = []; const nearlyEligiblePromotions: any[] = [];
    for (const promotion of promotions) {
      const result = this.evaluate(promotion, items);
      if (result.eligible) {
        const options = await this.giftOptions(promotion, items, session);
        eligiblePromotions.push({ promotionId: String(promotion._id), code: promotion.code, name: promotion.name, applicationCount: result.applicationCount, matchedConditions: result.matchedConditions, giftGroups: options.groups.map(({ group, optionIds }) => ({ groupCode: group.code, name: group.name, selectionMode: group.selectionMode, requiredQuantity: group.giftQuantity * result.applicationCount, options: optionIds.map((id) => options.map.get(id)).filter(Boolean).map((product) => ({ productId: String(product._id), code: product.code, name: product.name, availableStock: product.stock || 0 })) })) });
      } else {
        const missing = Math.min(...result.matchedConditions.flatMap((group) => group.conditions.filter((x) => !x.eligible).map((x) => x.missing)), Number.MAX_SAFE_INTEGER);
        nearlyEligiblePromotions.push({ promotionId: String(promotion._id), code: promotion.code, name: promotion.name, missingQuantity: Number.isFinite(missing) ? missing : null, message: Number.isFinite(missing) ? `Cần thêm ${missing} để đủ điều kiện nhận quà` : 'Chưa đủ điều kiện nhận quà' });
      }
    }
    return { eligiblePromotions, nearlyEligiblePromotions };
  }

  async apply(promotionId: string, items: CartItem[], selections: Selection[], session?: ClientSession, validateWarehouseStock = true) {
    const now = new Date();
    const promotion: any = await this.promotionModel.findOne({ _id: promotionId, type: { $in: [PromotionType.BUY_X_GET_Y, PromotionType.BUNDLE_GIFT] }, status: PromotionStatus.ACTIVE, startAt: { $lte: now }, endAt: { $gte: now }, isDeleted: false }).session(session || null).lean();
    if (!promotion) throw new ConflictException('Chương trình tặng quà không hoạt động');
    const result = this.evaluate(promotion, items);
    if (!result.eligible) throw new ConflictException('Giỏ hàng không còn đủ điều kiện nhận quà');
    const options = await this.giftOptions(promotion, items, session); const selectionMap = new Map((selections || []).map((selection) => [selection.groupCode.trim().toUpperCase(), selection.items]));
    const gifts: any[] = [];
    for (const { group, optionIds } of options.groups) {
      const required = group.giftQuantity * result.applicationCount; let selected = selectionMap.get(group.code) || [];
      if (group.selectionMode === GiftSelectionMode.ALL) selected = optionIds.map((productId) => ({ productId, qty: required }));
      if (!selected.length) throw new BadRequestException(`Chưa chọn quà cho nhóm ${group.code}`);
      if (selected.some((item) => !optionIds.includes(item.productId) || !Number.isInteger(item.qty) || item.qty < 1)) throw new BadRequestException(`Lựa chọn quà nhóm ${group.code} không hợp lệ`);
      if (group.selectionMode === GiftSelectionMode.CHOOSE_ONE && new Set(selected.map((item) => item.productId)).size !== 1) throw new BadRequestException(`Nhóm ${group.code} chỉ được chọn một sản phẩm`);
      if (group.allowMixedProducts === false && new Set(selected.map((item) => item.productId)).size > 1) throw new BadRequestException(`Nhóm ${group.code} không cho phép trộn quà`);
      const expectedQuantity = group.selectionMode === GiftSelectionMode.ALL ? required * optionIds.length : required;
      if (selected.reduce((sum, item) => sum + item.qty, 0) !== expectedQuantity) throw new BadRequestException(`Nhóm ${group.code} phải chọn đúng ${expectedQuantity} sản phẩm`);
      for (const item of selected) {
        const product: any = options.map.get(item.productId);
        if (!product || (validateWarehouseStock && product.stock < item.qty)) throw new ConflictException({ code: 'INSUFFICIENT_GIFT_STOCK', message: `Quà ${product?.name || item.productId} không đủ tồn`, details: { productId: item.productId, availableStock: product?.stock || 0, requestedQuantity: item.qty } });
        gifts.push({ groupCode: group.code, productId: item.productId, productCode: product.code, productName: product.name, unit: product.unit || '', qty: item.qty, costPrice: product.costPrice || 0, sellPrice: product.sellPrice || 0 });
      }
    }
    return { promotion, applicationCount: result.applicationCount, matchedConditions: result.matchedConditions, gifts };
  }
}
