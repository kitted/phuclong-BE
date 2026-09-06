import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getConnectionToken, InjectModel } from 'nestjs-typegoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { Connection, Types } from 'mongoose';
import { Customers } from '../customers/schemas/customers.schema';
import { Products } from '../products/schemas/products.schema';
import { InvoiceLineType, Invoices } from '../invoices/schemas/invoices.schema';
import { WebsiteProducts } from '../website-orders/schemas/website-products.schema';
import { resolveReportPeriod } from '../dashboard/report-period';
import {
  CustomerCoinQueryDto,
  RedeemCustomerCoinDto,
} from './dtos/customer-coins.dto';
import {
  CustomerCoinCounters,
  CustomerCoinLedgers,
  CustomerCoinTransactionType,
  CustomerCoinType,
} from './schemas/customer-coins.schema';

type CoinActor = { id?: string; name?: string };

export function calculateCustomerCoinAwards(
  grandTotal: number,
  items: any[],
  eligibleProductIds: Iterable<string>,
) {
  const eligibleIds = new Set(eligibleProductIds);
  const products = (items || [])
    .filter(
      (item: any) =>
        item.lineType !== InvoiceLineType.GIFT &&
        eligibleIds.has(String(item.productId)),
    )
    .map((item: any) => ({
      productId: String(item.productId),
      productCode: item.productCode,
      productName: item.productName,
      quantity: Number(item.qty) || 0,
      amount: Math.max(0, Math.floor(Number(item.lineTotal) || 0)),
    }));
  return {
    invoiceCoin: Math.max(0, Math.floor(Number(grandTotal) || 0)),
    plusExCoin: products.reduce(
      (total: number, item: any) => total + item.amount,
      0,
    ),
    products,
  };
}

@Injectable()
export class CustomerCoinsService {
  constructor(
    @InjectModel(CustomerCoinLedgers)
    private readonly ledgers: ReturnModelType<typeof CustomerCoinLedgers>,
    @InjectModel(CustomerCoinCounters)
    private readonly counters: ReturnModelType<typeof CustomerCoinCounters>,
    @InjectModel(Customers)
    private readonly customers: ReturnModelType<typeof Customers>,
    @InjectModel(Products)
    private readonly products: ReturnModelType<typeof Products>,
    @InjectModel(Invoices)
    private readonly invoices: ReturnModelType<typeof Invoices>,
    @InjectModel(WebsiteProducts)
    private readonly websiteProducts: ReturnModelType<typeof WebsiteProducts>,
    @Inject(getConnectionToken()) private readonly connection: Connection,
  ) {}

  private balanceField(type: CustomerCoinType): string {
    return type === CustomerCoinType.INVOICE
      ? 'invoiceCoinBalance'
      : 'plusExCoinBalance';
  }

  private period(query: CustomerCoinQueryDto) {
    return resolveReportPeriod({
      period: query.period,
      anchor: query.anchor,
      from: query.from,
      to: query.to,
      timezone: query.timezone,
    });
  }

  async awardInvoice(invoice: any, session: any): Promise<any> {
    if (!invoice?.customerId) return { invoiceCoin: 0, plusExCoin: 0 };
    const customer: any = await this.customers
      .findOne({ _id: invoice.customerId, isDeleted: false })
      .session(session);
    if (!customer) return { invoiceCoin: 0, plusExCoin: 0 };

    const saleItems = (invoice.items || []).filter(
      (item: any) => item.lineType !== InvoiceLineType.GIFT,
    );
    const eligible = await this.products
      .find({
        _id: { $in: saleItems.map((item: any) => item.productId) },
        isDeleted: false,
        plusExCoinEnabled: true,
      })
      .select('_id')
      .session(session)
      .lean();
    const calculated = calculateCustomerCoinAwards(
      invoice.grandTotal,
      saleItems,
      eligible.map((item: any) => String(item._id)),
    );
    const { invoiceCoin, plusExCoin, products: productLines } = calculated;
    const awards = [
      {
        coinType: CustomerCoinType.INVOICE,
        amount: invoiceCoin,
        products: [],
      },
      {
        coinType: CustomerCoinType.PLUSEX,
        amount: plusExCoin,
        products: productLines,
      },
    ].filter((award) => award.amount > 0);

    for (const award of awards) {
      const field = this.balanceField(award.coinType);
      const updated: any = await this.customers.findOneAndUpdate(
        { _id: customer._id, isDeleted: false },
        { $inc: { [field]: award.amount } },
        { new: true, session },
      );
      await this.ledgers.create(
        [
          {
            eventKey: `INVOICE:${invoice._id}:${award.coinType}`,
            customerId: customer._id,
            customerCode: customer.code,
            customerName: customer.name,
            coinType: award.coinType,
            transactionType: CustomerCoinTransactionType.EARN,
            change: award.amount,
            balanceAfter: Number(updated?.[field] || 0),
            invoiceId: invoice._id,
            invoiceCode: invoice.code,
            products: award.products,
            occurredAt: invoice.date || new Date(),
          },
        ],
        { session },
      );
    }
    return { invoiceCoin, plusExCoin };
  }

  async reverseInvoice(
    invoice: any,
    actor: CoinActor,
    session: any,
  ): Promise<void> {
    if (!invoice?.customerId) return;
    const earns: any[] = await this.ledgers
      .find({
        invoiceId: invoice._id,
        transactionType: CustomerCoinTransactionType.EARN,
        isDeleted: false,
      })
      .session(session)
      .lean();
    for (const earn of earns) {
      const field = this.balanceField(earn.coinType);
      const amount = Math.abs(Number(earn.change) || 0);
      if (!amount) continue;
      const updated: any = await this.customers.findOneAndUpdate(
        { _id: invoice.customerId, isDeleted: false },
        { $inc: { [field]: -amount } },
        { new: true, session },
      );
      if (!updated) continue;
      await this.ledgers.create(
        [
          {
            eventKey: `INVOICE_REVERSAL:${invoice._id}:${earn.coinType}`,
            customerId: invoice.customerId,
            customerCode: invoice.customerCode,
            customerName: invoice.customerName || invoice.customer,
            coinType: earn.coinType,
            transactionType: CustomerCoinTransactionType.REVERSAL,
            change: -amount,
            balanceAfter: Number(updated[field] || 0),
            invoiceId: invoice._id,
            invoiceCode: invoice.code,
            products: earn.products || [],
            reason: invoice.reversalReason,
            occurredAt: new Date(),
            createdBy: actor.id || undefined,
            createdByName: actor.name,
          },
        ],
        { session },
      );
    }
  }

  async customersList(query: CustomerCoinQueryDto): Promise<any> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter: any = { isDeleted: false };
    if (query.search?.trim()) {
      const regex = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ code: regex }, { name: regex }, { phone: regex }];
    }
    const [rows, total] = await Promise.all([
      this.customers
        .find(filter)
        .select(
          'code name phone storefrontImage invoiceCoinBalance plusExCoinBalance',
        )
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.customers.countDocuments(filter),
    ]);
    return {
      data: rows,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async summary(query: CustomerCoinQueryDto): Promise<any> {
    const period = this.period(query);
    const match: any = {
      isDeleted: false,
      occurredAt: { $gte: period.from, $lte: period.to },
    };
    if (query.coinType) match.coinType = query.coinType;
    const [totals = {}, timeline, balances = {}, byTypeRows] =
      await Promise.all([
        this.ledgers
          .aggregate([
            { $match: match },
            {
              $group: {
                _id: null,
                earned: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          '$transactionType',
                          CustomerCoinTransactionType.EARN,
                        ],
                      },
                      '$change',
                      0,
                    ],
                  },
                },
                reversed: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          '$transactionType',
                          CustomerCoinTransactionType.REVERSAL,
                        ],
                      },
                      { $abs: '$change' },
                      0,
                    ],
                  },
                },
                redeemed: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          '$transactionType',
                          CustomerCoinTransactionType.REDEEM,
                        ],
                      },
                      { $abs: '$change' },
                      0,
                    ],
                  },
                },
                netChange: { $sum: '$change' },
                transactions: { $sum: 1 },
              },
            },
          ])
          .then((rows) => rows[0]),
        this.ledgers.aggregate([
          { $match: match },
          {
            $group: {
              _id: {
                date: {
                  $dateToString: {
                    date: '$occurredAt',
                    format: '%Y-%m-%d',
                    timezone: 'Asia/Ho_Chi_Minh',
                  },
                },
                coinType: '$coinType',
              },
              earned: {
                $sum: {
                  $cond: [
                    {
                      $eq: [
                        '$transactionType',
                        CustomerCoinTransactionType.EARN,
                      ],
                    },
                    '$change',
                    0,
                  ],
                },
              },
              netChange: { $sum: '$change' },
            },
          },
          { $sort: { '_id.date': 1 } },
        ]),
        this.customers
          .aggregate([
            { $match: { isDeleted: false } },
            {
              $group: {
                _id: null,
                invoiceCoin: { $sum: { $ifNull: ['$invoiceCoinBalance', 0] } },
                plusExCoin: { $sum: { $ifNull: ['$plusExCoinBalance', 0] } },
                customers: { $sum: 1 },
              },
            },
          ])
          .then((rows) => rows[0]),
        this.ledgers.aggregate([
          { $match: match },
          {
            $group: {
              _id: '$coinType',
              earned: {
                $sum: {
                  $cond: [
                    {
                      $eq: [
                        '$transactionType',
                        CustomerCoinTransactionType.EARN,
                      ],
                    },
                    '$change',
                    0,
                  ],
                },
              },
              reversed: {
                $sum: {
                  $cond: [
                    {
                      $eq: [
                        '$transactionType',
                        CustomerCoinTransactionType.REVERSAL,
                      ],
                    },
                    { $abs: '$change' },
                    0,
                  ],
                },
              },
              redeemed: {
                $sum: {
                  $cond: [
                    {
                      $eq: [
                        '$transactionType',
                        CustomerCoinTransactionType.REDEEM,
                      ],
                    },
                    { $abs: '$change' },
                    0,
                  ],
                },
              },
              netChange: { $sum: '$change' },
            },
          },
        ]),
      ]);
    return {
      data: {
        period: { type: period.type, from: period.from, to: period.to },
        balances,
        summary: {
          earned: Number((totals as any)?.earned || 0),
          reversed: Number((totals as any)?.reversed || 0),
          redeemed: Number((totals as any)?.redeemed || 0),
          netChange: Number((totals as any)?.netChange || 0),
          transactions: Number((totals as any)?.transactions || 0),
        },
        byType: Object.fromEntries(
          byTypeRows.map((item: any) => [item._id, item]),
        ),
        timeline: timeline.map((item: any) => ({
          date: item._id.date,
          coinType: item._id.coinType,
          earned: item.earned,
          netChange: item.netChange,
        })),
      },
    };
  }

  async customerDetail(
    customerId: string,
    query: CustomerCoinQueryDto,
  ): Promise<any> {
    const customer: any = await this.customers
      .findOne({ _id: customerId, isDeleted: false })
      .select(
        'code name phone storefrontImage invoiceCoinBalance plusExCoinBalance',
      )
      .lean();
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    const period = this.period(query);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter: any = {
      customerId: new Types.ObjectId(customerId),
      isDeleted: false,
      occurredAt: { $gte: period.from, $lte: period.to },
    };
    if (query.coinType) filter.coinType = query.coinType;
    const [ledger, total, earned] = await Promise.all([
      this.ledgers
        .find(filter)
        .sort({ occurredAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.ledgers.countDocuments(filter),
      this.ledgers.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$coinType',
            earned: {
              $sum: {
                $cond: [
                  {
                    $eq: ['$transactionType', CustomerCoinTransactionType.EARN],
                  },
                  '$change',
                  0,
                ],
              },
            },
            netChange: { $sum: '$change' },
          },
        },
      ]),
    ]);
    return {
      data: {
        customer,
        period: { type: period.type, from: period.from, to: period.to },
        earned: Object.fromEntries(earned.map((item: any) => [item._id, item])),
        ledger,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    };
  }

  async productSettings(query: CustomerCoinQueryDto): Promise<any> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter: any = { isDeleted: false };
    if (query.search?.trim()) {
      const regex = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ code: regex }, { name: regex }, { barcode: regex }];
    }
    const [rows, total] = await Promise.all([
      this.products
        .find(filter)
        .select('code name imageUrl unit sellPrice plusExCoinEnabled')
        .sort({ plusExCoinEnabled: -1, name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.products.countDocuments(filter),
    ]);
    const linked = await this.websiteProducts
      .find({
        isDeleted: { $ne: true },
        inventoryProductId: { $in: rows.map((item: any) => item._id) },
      })
      .select('inventoryProductId imageUrls')
      .lean();
    const websiteImages = new Map(
      linked.map((item: any) => [
        String(item.inventoryProductId),
        (item.imageUrls || []).find(Boolean),
      ]),
    );
    const data = rows.map((item: any) => ({
      ...item,
      imageUrl: item.imageUrl || websiteImages.get(String(item._id)) || '',
    }));
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async updateProductSetting(
    productId: string,
    enabled: boolean,
  ): Promise<any> {
    const data = await this.products.findOneAndUpdate(
      { _id: productId, isDeleted: false },
      { $set: { plusExCoinEnabled: enabled } },
      { new: true },
    );
    if (!data) throw new NotFoundException('Không tìm thấy sản phẩm');
    return { data };
  }

  async redeem(
    customerId: string,
    dto: RedeemCustomerCoinDto,
    actor: CoinActor,
  ): Promise<any> {
    const session = await this.connection.startSession();
    let response: any;
    try {
      await session.withTransaction(async () => {
        const eventKey = `REDEEM:${customerId}:${dto.idempotencyKey}`;
        const existing: any = await this.ledgers
          .findOne({ eventKey })
          .session(session)
          .lean();
        if (existing) {
          response = { data: existing, idempotent: true };
          return;
        }
        const field = this.balanceField(dto.coinType);
        const customer: any = await this.customers.findOneAndUpdate(
          {
            _id: customerId,
            isDeleted: false,
            [field]: { $gte: dto.amount },
          },
          { $inc: { [field]: -dto.amount } },
          { new: true, session },
        );
        if (!customer)
          throw new ConflictException(
            'Khách hàng không tồn tại hoặc không đủ điểm để đổi',
          );
        const date = new Date();
        const day = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Ho_Chi_Minh',
          year: '2-digit',
          month: '2-digit',
          day: '2-digit',
        })
          .format(date)
          .replace(/-/g, '');
        const counter: any = await this.counters.findOneAndUpdate(
          { key: `COIN_REDEEM_${day}` },
          { $inc: { sequence: 1 } },
          { upsert: true, new: true, session },
        );
        const redemptionCode = `DOI-${day}-${String(counter.sequence).padStart(5, '0')}`;
        const ledger: any = (
          await this.ledgers.create(
            [
              {
                eventKey,
                idempotencyKey: dto.idempotencyKey,
                customerId: customer._id,
                customerCode: customer.code,
                customerName: customer.name,
                coinType: dto.coinType,
                transactionType: CustomerCoinTransactionType.REDEEM,
                change: -dto.amount,
                balanceAfter: Number(customer[field] || 0),
                redemptionCode,
                reason: dto.reason.trim(),
                occurredAt: date,
                createdBy: actor.id || undefined,
                createdByName: actor.name,
              },
            ],
            { session },
          )
        )[0];
        response = { data: ledger };
      });
      return response;
    } finally {
      await session.endSession();
    }
  }

  async backfillHistoricalInvoices(limitValue = 500): Promise<any> {
    const limit = Math.min(2000, Math.max(1, Number(limitValue) || 500));
    const candidates: any[] = await this.invoices
      .find({
        isDeleted: { $ne: true },
        status: { $ne: 'REVERSED' },
        customerId: { $ne: null },
        invoiceCoinEarned: { $exists: false },
      })
      .sort({ date: 1, _id: 1 })
      .limit(limit)
      .lean();
    let processed = 0;
    let invoiceCoin = 0;
    let plusExCoin = 0;
    for (const candidate of candidates) {
      const session = await this.connection.startSession();
      try {
        await session.withTransaction(async () => {
          const invoice: any = await this.invoices
            .findOne({
              _id: candidate._id,
              invoiceCoinEarned: { $exists: false },
              status: { $ne: 'REVERSED' },
              isDeleted: { $ne: true },
            })
            .session(session);
          if (!invoice) return;
          const earned = await this.awardInvoice(invoice, session);
          await this.invoices.updateOne(
            { _id: invoice._id },
            {
              $set: {
                invoiceCoinEarned: earned.invoiceCoin,
                plusExCoinEarned: earned.plusExCoin,
              },
            },
            { session },
          );
          processed += 1;
          invoiceCoin += earned.invoiceCoin;
          plusExCoin += earned.plusExCoin;
        });
      } finally {
        await session.endSession();
      }
    }
    const remaining = await this.invoices.countDocuments({
      isDeleted: { $ne: true },
      status: { $ne: 'REVERSED' },
      customerId: { $ne: null },
      invoiceCoinEarned: { $exists: false },
    });
    return {
      data: { processed, invoiceCoin, plusExCoin, remaining, limit },
    };
  }

  async publicRedeem(
    customerCode: string,
    phone: string,
    dto: RedeemCustomerCoinDto,
  ): Promise<any> {
    const normalizedPhone = String(phone || '')
      .replace(/\D/g, '')
      .replace(/^84(?=\d{9}$)/, '0');
    const customer: any = await this.customers
      .findOne({
        code: String(customerCode || '').trim(),
        isDeleted: false,
        $or: [
          { phone: normalizedPhone },
          { phones: normalizedPhone },
          { phone: String(phone || '').trim() },
          { phones: String(phone || '').trim() },
        ],
      })
      .select('_id')
      .lean();
    if (!customer)
      throw new NotFoundException(
        'Mã khách hàng hoặc số điện thoại không đúng',
      );
    return this.redeem(String(customer._id), dto, { name: 'Website' });
  }
}
