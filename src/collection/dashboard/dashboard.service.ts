import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { Products } from '../products/schemas/products.schema';
import { Imports } from '../imports/schemas/imports.schema';
import {
  Invoices,
  InvoiceLineType,
  InvoicePaymentStatus,
  PaymentMethod,
} from '../invoices/schemas/invoices.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { Customers } from '../customers/schemas/customers.schema';
import {
  DebtPayments,
  DebtPaymentStatus,
} from '../debt-payments/schemas/debt-payments.schema';
import {
  Promotions,
  PromotionStatus,
  Vouchers,
  VoucherStatus,
} from '../promotions/schemas/promotions.schema';
import {
  PromotionActivations,
  PromotionActivationStatus,
} from '../promotion-activations/schemas/promotion-activations.schema';
import { Users, UserStatus } from '../users/schemas/users.schema';
import {
  EmployeeKpis,
  EmployeeKpiStatus,
} from '../employee-kpis/schemas/employee-kpis.schema';
import {
  TruckTransfers,
  TruckTransferType,
} from '../trucks/schemas/truck-transfers.schema';
import {
  AuditLogs,
  AuditLogStatus,
} from '../audit-logs/schemas/audit-logs.schema';
import {
  DashboardPeriodQueryDto,
  NewCustomerCareExportDto,
  ReportGranularity,
} from './dtos/dashboard.dto';
import { resolveReportPeriod } from './report-period';
import { RoleEnum } from '../users/interfaces/role.enum';
import { WebsiteProducts } from '../website-orders/schemas/website-products.schema';
import { Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
export type DashboardActor = { id?: string; role?: RoleEnum };
@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Products) private products: ReturnModelType<typeof Products>,
    @InjectModel(WebsiteProducts)
    private websiteProducts: ReturnModelType<typeof WebsiteProducts>,
    @InjectModel(Imports) private imports: ReturnModelType<typeof Imports>,
    @InjectModel(Invoices) private invoices: ReturnModelType<typeof Invoices>,
    @InjectModel(Trucks) private trucksModel: ReturnModelType<typeof Trucks>,
    @InjectModel(Customers)
    private customers: ReturnModelType<typeof Customers>,
    @InjectModel(DebtPayments)
    private debtPayments: ReturnModelType<typeof DebtPayments>,
    @InjectModel(Promotions)
    private promotionsModel: ReturnModelType<typeof Promotions>,
    @InjectModel(Vouchers) private vouchers: ReturnModelType<typeof Vouchers>,
    @InjectModel(PromotionActivations)
    private activations: ReturnModelType<typeof PromotionActivations>,
    @InjectModel(Users) private users: ReturnModelType<typeof Users>,
    @InjectModel(EmployeeKpis)
    private kpis: ReturnModelType<typeof EmployeeKpis>,
    @InjectModel(TruckTransfers)
    private transfers: ReturnModelType<typeof TruckTransfers>,
    @InjectModel(AuditLogs) private audit: ReturnModelType<typeof AuditLogs>,
  ) {}
  private scope(query: DashboardPeriodQueryDto, actor: DashboardActor) {
    if (actor.role === RoleEnum.STAFF) return actor.id;
    return query.salespersonId;
  }
  private invoiceFilter(
    query: DashboardPeriodQueryDto,
    actor: DashboardActor,
    from: Date,
    to: Date,
  ) {
    const filter: any = {
      isDeleted: false,
      status: { $ne: 'REVERSED' },
      date: { $gte: from, $lte: to },
    };
    const salespersonId = this.scope(query, actor);
    if (salespersonId) filter.salespersonId = salespersonId;
    if (query.truckId) filter.truckId = query.truckId;
    if (query.sourceType) filter.sourceType = query.sourceType;
    if (query.customerId) filter.customerId = query.customerId;
    if (query.promotionId)
      filter.$or = [
        { promotionId: query.promotionId },
        { 'promotionApplications.promotionId': query.promotionId },
      ];
    return filter;
  }
  private initialPaid(invoice: any) {
    if (
      invoice.initialPaidAmount !== undefined &&
      invoice.initialPaidAmount !== null
    )
      return Number(invoice.initialPaidAmount);
    return (invoice.payments || []).reduce(
      (sum: number, payment: any) => sum + Number(payment.amount || 0),
      0,
    );
  }
  private salesValues(rows: any[]) {
    let grossRevenue = 0,
      discountAmount = 0,
      netRevenue = 0,
      collectedAmount = 0,
      creditSales = 0,
      saleCOGS = 0,
      promotionGiftCost = 0;
    const customers = new Set<string>();
    for (const row of rows) {
      grossRevenue += Number(row.subtotal || 0);
      discountAmount += Number(row.discountAmount || 0);
      netRevenue += Number(row.grandTotal ?? row.totalAmount ?? 0);
      const paid = this.initialPaid(row);
      collectedAmount += paid;
      creditSales +=
        row.initialDebtAmount !== undefined
          ? Number(row.initialDebtAmount)
          : Math.max(0, Number(row.grandTotal || 0) - paid);
      if (row.customerId) customers.add(String(row.customerId));
      for (const item of row.items || []) {
        const cost = Number(item.costPrice || 0) * Number(item.qty || 0);
        if (item.lineType === InvoiceLineType.GIFT) promotionGiftCost += cost;
        else saleCOGS += cost;
      }
    }
    const cogs = saleCOGS + promotionGiftCost,
      grossProfit = netRevenue - cogs;
    return {
      invoiceCount: rows.length,
      grossRevenue,
      discountAmount,
      netRevenue,
      averageInvoiceValue: rows.length
        ? Math.round(netRevenue / rows.length)
        : 0,
      collectedAmount,
      creditSales,
      saleCOGS,
      promotionGiftCost,
      cogs,
      grossProfit,
      grossMarginPercent: netRevenue
        ? Math.round((grossProfit / netRevenue) * 10000) / 100
        : 0,
      uniqueCustomers: customers.size,
    };
  }
  private metric(
    value: number,
    previousValue: number,
    direction: 'POSITIVE' | 'NEGATIVE' = 'POSITIVE',
  ) {
    const changeValue = value - previousValue;
    return {
      value,
      previousValue,
      changeValue,
      changePercent:
        previousValue === 0
          ? value > 0
            ? 100
            : 0
          : Math.round((changeValue / Math.abs(previousValue)) * 10000) / 100,
      trend: changeValue > 0 ? 'UP' : changeValue < 0 ? 'DOWN' : 'FLAT',
      direction,
    };
  }
  private async collectedDebt(
    from: Date,
    to: Date,
    salespersonId?: string,
  ): Promise<{ total: number; rows: Array<{ date: Date; amount: number }> }> {
    const receipts: any[] = await this.debtPayments
      .find({
        isDeleted: false,
        status: DebtPaymentStatus.ACTIVE,
        date: { $gte: from, $lte: to },
      })
      .lean();
    if (!salespersonId)
      return {
        total: receipts.reduce((sum, row) => sum + Number(row.amount || 0), 0),
        rows: receipts.map((row) => ({ date: row.date, amount: row.amount })),
      };
    const invoiceIds = [
      ...new Set(
        receipts.flatMap((receipt) =>
          receipt.allocations.map((allocation) => String(allocation.invoiceId)),
        ),
      ),
    ];
    const owned = new Set(
      (
        await this.invoices
          .find({ _id: { $in: invoiceIds }, salespersonId, isDeleted: false })
          .select('_id')
          .lean()
      ).map((invoice: any) => String(invoice._id)),
    );
    const rows = receipts
      .map((receipt) => ({
        date: receipt.date,
        amount: receipt.allocations
          .filter((allocation) => owned.has(String(allocation.invoiceId)))
          .reduce((sum, allocation) => sum + allocation.amount, 0),
      }))
      .filter((row) => row.amount > 0);
    return { total: rows.reduce((sum, row) => sum + row.amount, 0), rows };
  }
  async getStats() {
    const [
      totalProducts,
      outOfStock,
      lowStock,
      imports,
      invoices,
      activeTrucks,
    ] = await Promise.all([
      this.products.countDocuments({ isDeleted: false }),
      this.products.countDocuments({ isDeleted: false, stock: { $lte: 0 } }),
      this.products.countDocuments({
        isDeleted: false,
        stock: { $gt: 0 },
        $expr: { $lte: ['$stock', '$minStock'] },
      }),
      this.imports.aggregate([
        {
          $match: {
            isDeleted: false,
            status: { $in: ['RECEIVED', 'completed'] },
          },
        },
        { $group: { _id: null, value: { $sum: '$totalAmount' } } },
      ]),
      this.invoices.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: null, value: { $sum: '$grandTotal' } } },
      ]),
      this.trucksModel.countDocuments({ isDeleted: false, status: 'active' }),
    ]);
    return {
      totalProducts,
      outOfStock,
      lowStock,
      totalImportValue: imports[0]?.value || 0,
      totalSaleValue: invoices[0]?.value || 0,
      activeTrucks,
    };
  }
  async overview(
    query: DashboardPeriodQueryDto,
    actor: DashboardActor,
  ): Promise<any> {
    const period = resolveReportPeriod(query);
    const salesperson = this.scope(query, actor);
    const [
      currentRows,
      previousRows,
      products,
      trucks,
      outstanding,
      currentDebtReceipts,
      previousDebtReceipts,
    ] = await Promise.all([
      this.invoices
        .find(this.invoiceFilter(query, actor, period.from, period.to))
        .lean(),
      this.invoices
        .find(
          this.invoiceFilter(
            query,
            actor,
            period.compareFrom,
            period.compareTo,
          ),
        )
        .lean(),
      this.products
        .find({ isDeleted: false })
        .select('stock minStock costPrice')
        .lean(),
      this.trucksModel.find({ isDeleted: false }).select('inventory').lean(),
      actor.role === RoleEnum.ADMIN
        ? this.customers.aggregate([
            { $match: { isDeleted: false } },
            { $group: { _id: null, value: { $sum: '$debt' } } },
          ])
        : Promise.resolve([]),
      this.collectedDebt(period.from, period.to, salesperson),
      this.collectedDebt(period.compareFrom, period.compareTo, salesperson),
    ]);
    const current = this.salesValues(currentRows),
      previous = this.salesValues(previousRows);
    current.collectedAmount += currentDebtReceipts.total;
    previous.collectedAmount += previousDebtReceipts.total;
    const warehouseQuantity = products.reduce(
        (sum, product) => sum + Number(product.stock || 0),
        0,
      ),
      warehouseValue = products.reduce(
        (sum, product) =>
          sum + Number(product.stock || 0) * Number(product.costPrice || 0),
        0,
      );
    const costMap = new Map(
      products.map((product: any) => [
        String(product._id),
        Number(product.costPrice || 0),
      ]),
    );
    const truckQuantity = trucks.reduce(
        (sum, truck) =>
          sum +
          (truck.inventory || []).reduce(
            (value, item) => value + Number(item.qty || 0),
            0,
          ),
        0,
      ),
      truckValue = trucks.reduce(
        (sum, truck) =>
          sum +
          (truck.inventory || []).reduce(
            (value, item) =>
              value +
              Number(item.qty || 0) *
                (costMap.get(String(item.productId)) || 0),
            0,
          ),
        0,
      );
    const financial = actor.role === RoleEnum.ADMIN;
    return {
      data: {
        period,
        sales: {
          invoiceCount: this.metric(
            current.invoiceCount,
            previous.invoiceCount,
          ),
          grossRevenue: this.metric(
            current.grossRevenue,
            previous.grossRevenue,
          ),
          discountAmount: this.metric(
            current.discountAmount,
            previous.discountAmount,
            'NEGATIVE',
          ),
          netRevenue: this.metric(current.netRevenue, previous.netRevenue),
          averageInvoiceValue: this.metric(
            current.averageInvoiceValue,
            previous.averageInvoiceValue,
          ),
          collectedAmount: this.metric(
            current.collectedAmount,
            previous.collectedAmount,
          ),
          creditSales: this.metric(
            current.creditSales,
            previous.creditSales,
            'NEGATIVE',
          ),
          currentOutstandingDebt: financial
            ? { value: outstanding[0]?.value || 0, direction: 'NEGATIVE' }
            : undefined,
          cogs: financial
            ? this.metric(current.cogs, previous.cogs, 'NEGATIVE')
            : undefined,
          promotionGiftCost: financial
            ? this.metric(
                current.promotionGiftCost,
                previous.promotionGiftCost,
                'NEGATIVE',
              )
            : undefined,
          grossProfit: financial
            ? this.metric(current.grossProfit, previous.grossProfit)
            : undefined,
          grossMarginPercent: financial
            ? this.metric(
                current.grossMarginPercent,
                previous.grossMarginPercent,
              )
            : undefined,
        },
        inventory: financial
          ? {
              warehouseQuantity,
              warehouseValue,
              truckQuantity,
              truckValue,
              totalQuantity: warehouseQuantity + truckQuantity,
              totalValue: warehouseValue + truckValue,
              outOfStockCount: products.filter((p) => p.stock <= 0).length,
              lowStockCount: products.filter(
                (p) => p.stock > 0 && p.stock <= p.minStock,
              ).length,
            }
          : undefined,
      },
    };
  }
  private bucket(date: Date, granularity: ReportGranularity) {
    const d = new Date(date.getTime() + 25200000);
    if (granularity === ReportGranularity.MONTH)
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (granularity === ReportGranularity.WEEK) {
      const day = d.getUTCDay() || 7;
      const monday = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 1),
      );
      return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
    }
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  async salesTrend(
    query: DashboardPeriodQueryDto,
    actor: DashboardActor,
  ): Promise<any> {
    const period = resolveReportPeriod(query);
    const [rows, receipts]: any[] = await Promise.all([
      this.invoices
        .find(this.invoiceFilter(query, actor, period.from, period.to))
        .lean(),
      this.collectedDebt(period.from, period.to, this.scope(query, actor)),
    ]);
    const map = new Map<string, any>();
    for (const row of rows) {
      const key = this.bucket(row.date, period.granularity);
      const entry = map.get(key) || {
        key,
        label: key,
        invoiceCount: 0,
        netRevenue: 0,
        collectedAmount: 0,
        creditSales: 0,
        grossProfit: 0,
      };
      const values = this.salesValues([row]);
      entry.invoiceCount++;
      entry.netRevenue += values.netRevenue;
      entry.collectedAmount += values.collectedAmount;
      entry.creditSales += values.creditSales;
      entry.grossProfit += values.grossProfit;
      map.set(key, entry);
    }
    for (const receipt of receipts.rows) {
      const key = this.bucket(receipt.date, period.granularity);
      const entry = map.get(key) || {
        key,
        label: key,
        invoiceCount: 0,
        netRevenue: 0,
        collectedAmount: 0,
        creditSales: 0,
        grossProfit: 0,
      };
      entry.collectedAmount += receipt.amount;
      map.set(key, entry);
    }
    return {
      data: [...map.values()].sort((a, b) => a.key.localeCompare(b.key)),
      period,
    };
  }
  async debtSummary(
    query: DashboardPeriodQueryDto,
    actor: DashboardActor,
  ): Promise<any> {
    if (actor.role !== RoleEnum.ADMIN)
      throw new BadRequestException(
        'Chỉ admin được xem tổng hợp công nợ toàn hệ thống',
      );
    const now = new Date();
    const [customers, unpaidInvoices, partialInvoices, overdue] =
      await Promise.all([
        this.customers
          .find({ isDeleted: false })
          .select('code name phone debt debtLimit storefrontImage')
          .sort({ debt: -1 })
          .lean(),
        this.invoices.countDocuments({
          isDeleted: false,
          paymentStatus: InvoicePaymentStatus.UNPAID,
        }),
        this.invoices.countDocuments({
          isDeleted: false,
          paymentStatus: InvoicePaymentStatus.PARTIAL,
        }),
        this.invoices
          .find({
            isDeleted: false,
            debtAmount: { $gt: 0 },
            paymentDueDate: { $lt: now },
          })
          .select('debtAmount')
          .lean(),
      ]);
    return {
      data: {
        outstandingDebt: customers.reduce(
          (sum, item) => sum + Number(item.debt || 0),
          0,
        ),
        warningCustomers: customers.filter(
          (item) => item.debtLimit > 0 && item.debt >= item.debtLimit,
        ).length,
        unpaidInvoices,
        partialInvoices,
        overdueInvoices: overdue.length,
        overdueAmount: overdue.reduce(
          (sum, item) => sum + Number(item.debtAmount || 0),
          0,
        ),
        topDebtors: customers
          .filter((item) => item.debt > 0)
          .slice(0, 10)
          .map((item: any) => ({
            customerId: String(item._id),
            customerCode: item.code,
            customerName: item.name,
            phone: item.phone,
            storefrontImage: item.storefrontImage,
            debt: item.debt,
            debtLimit: item.debtLimit,
            exceededAmount: Math.max(0, item.debt - (item.debtLimit || 0)),
          })),
      },
    };
  }
  async inventoryAlerts(query: DashboardPeriodQueryDto): Promise<any> {
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const type = query.type || 'LOW_STOCK';
    const slowDays = Math.max(1, Number(query.slowMovingDays) || 60);
    let filter: any = { isDeleted: false };
    if (type === 'OUT_OF_STOCK') filter.stock = { $lte: 0 };
    else if (type === 'LOW_STOCK') {
      filter.stock = { $gt: 0 };
      filter.$expr = { $lte: ['$stock', '$minStock'] };
    } else if (type === 'SLOW_MOVING') {
      const sold = await this.invoices.distinct('items.productId', {
        isDeleted: false,
        date: { $gte: new Date(Date.now() - slowDays * 86400000) },
        'items.lineType': InvoiceLineType.SALE,
      });
      filter.stock = { $gt: 0 };
      filter._id = { $nin: sold };
    } else throw new BadRequestException('Loại cảnh báo tồn kho không hợp lệ');
    const data = await this.products
      .find(filter)
      .select('code name unit stock minStock costPrice')
      .sort({ stock: 1 })
      .limit(limit)
      .lean();
    return {
      data: data.map((item: any) => ({
        id: String(item._id),
        ...item,
        inventoryValue: item.stock * item.costPrice,
      })),
      meta: { type, limit, slowMovingDays: slowDays },
    };
  }
  async newCustomers(
    query: DashboardPeriodQueryDto,
    actor: DashboardActor,
  ): Promise<any> {
    const days = Math.min(365, Math.max(1, Number(query.days) || 45));
    const limit = Math.min(500, Math.max(1, Number(query.limit) || 200));
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400000);
    const customerDocs: any[] = await this.customers
      .find({
        isDeleted: false,
        code: { $type: 'string', $ne: '' },
        $or: [
          { createdAt: { $gte: from, $lte: to } },
          { 'codeHistory.changedAt': { $gte: from, $lte: to } },
        ],
      })
      .select(
        'code name phone phones address source segment createdAt codeHistory interactions',
      )
      .lean();
    const qualifiedCustomers = customerDocs.map((customer: any) => {
      const codeEvents = (customer.codeHistory || [])
        .filter((entry: any) => {
          const changedAt = new Date(entry.changedAt);
          return changedAt >= from && changedAt <= to;
        })
        .sort(
          (left: any, right: any) =>
            new Date(right.changedAt).getTime() -
            new Date(left.changedAt).getTime(),
        );
      const createdAt = new Date(customer.createdAt);
      const createdInPeriod = createdAt >= from && createdAt <= to;
      const latestCodeEvent = codeEvents[0];
      const codeChangedAt = latestCodeEvent
        ? new Date(latestCodeEvent.changedAt)
        : null;
      const qualifiedAt =
        codeChangedAt && (!createdInPeriod || codeChangedAt > createdAt)
          ? codeChangedAt
          : createdAt;
      const qualificationReason =
        qualifiedAt === codeChangedAt
          ? latestCodeEvent?.oldCode
            ? 'CODE_CHANGED'
            : 'CODE_ASSIGNED'
          : 'CREATED';
      return { customer, qualifiedAt, qualificationReason };
    });
    const customerIds = qualifiedCustomers.map((item) => item.customer._id);
    const match: any = {
      isDeleted: false,
      status: { $ne: 'REVERSED' },
      date: { $gte: from, $lte: to },
      customerId: { $in: customerIds },
    };
    const salespersonId = this.scope(query, actor);
    if (salespersonId && Types.ObjectId.isValid(salespersonId))
      match.salespersonId = new Types.ObjectId(salespersonId);
    const count =
      query.invoiceCount === '1' || query.invoiceCount === '2'
        ? Number(query.invoiceCount)
        : undefined;
    const invoices: any[] = await this.invoices
      .find(match)
      .select(
        'code date createdAt customerId customerCode customerName customerPhone grandTotal totalAmount salespersonName',
      )
      .sort({ date: -1, createdAt: -1 })
      .lean();
    const invoicesByCustomer = new Map<string, any[]>();
    invoices.forEach((invoice: any) => {
      const key = String(invoice.customerId || '');
      invoicesByCustomer.set(key, [
        ...(invoicesByCustomer.get(key) || []),
        invoice,
      ]);
    });
    const keyword = String(query.search || '')
      .trim()
      .toLocaleLowerCase('vi');
    const data = qualifiedCustomers
      .map(({ customer, qualifiedAt, qualificationReason }) => {
        const customerInvoices = (
          invoicesByCustomer.get(String(customer._id)) || []
        ).filter((invoice: any) => new Date(invoice.date) >= qualifiedAt);
        const invoiceCount = customerInvoices.length;
        if (
          count ? invoiceCount !== count : invoiceCount < 1 || invoiceCount > 2
        )
          return null;
        const latest = customerInvoices[0];
        const first = customerInvoices[customerInvoices.length - 1];
        const careInteractions = (customer.interactions || [])
          .filter(
            (interaction: any) => interaction.context === 'NEW_CUSTOMER_CARE',
          )
          .sort(
            (left: any, right: any) =>
              new Date(right.occurredAt || right.at).getTime() -
              new Date(left.occurredAt || left.at).getTime(),
          );
        const latestCareInteraction = careInteractions[0];
        return {
          id: String(customer._id),
          customerCode: customer.code || latest?.customerCode,
          customerName: customer.name || latest?.customerName || 'Khách hàng',
          phone:
            customer.phone || customer.phones?.[0] || latest?.customerPhone,
          address: customer.address,
          source: customer.source,
          segment: customer.segment,
          customerCreatedAt: customer.createdAt,
          customerQualifiedAt: qualifiedAt,
          qualificationReason,
          invoiceCount,
          totalRevenue: customerInvoices.reduce(
            (sum, invoice) =>
              sum + Number(invoice.grandTotal ?? invoice.totalAmount ?? 0),
            0,
          ),
          firstInvoiceAt: first?.date,
          latestInvoiceAt: latest?.date,
          latestInvoiceCode: latest?.code,
          salespersonNames: [
            ...new Set(
              customerInvoices
                .map((invoice) => invoice.salespersonName)
                .filter(Boolean),
            ),
          ],
          careInteractionCount: careInteractions.length,
          latestCareInteraction: latestCareInteraction
            ? {
                occurredAt:
                  latestCareInteraction.occurredAt || latestCareInteraction.at,
                purpose: latestCareInteraction.purpose,
                outcome: latestCareInteraction.outcome,
                action: latestCareInteraction.action,
                result: latestCareInteraction.result,
                note: latestCareInteraction.note,
                followUpRequired: latestCareInteraction.followUpRequired,
                nextFollowUpAt: latestCareInteraction.nextFollowUpAt,
                createdBy: latestCareInteraction.createdBy,
              }
            : null,
        };
      })
      .filter(Boolean)
      .filter((item) =>
        keyword
          ? `${item.customerCode || ''} ${item.customerName || ''} ${item.phone || ''}`
              .toLocaleLowerCase('vi')
              .includes(keyword)
          : true,
      )
      .sort(
        (left: any, right: any) =>
          new Date(right.latestInvoiceAt).getTime() -
          new Date(left.latestInvoiceAt).getTime(),
      )
      .slice(0, limit);
    return {
      data,
      meta: {
        days,
        from,
        to,
        invoiceCount: query.invoiceCount || 'ALL',
        total: data.length,
        candidateCount: qualifiedCustomers.length,
      },
    };
  }

  async exportNewCustomerCare(
    query: NewCustomerCareExportDto,
    actor: DashboardActor,
  ): Promise<Buffer> {
    const report = await this.newCustomers(
      { ...query, limit: '500', search: undefined },
      actor,
    );
    const requestedIds = new Set(
      (query.customerIds || []).filter((value) =>
        Types.ObjectId.isValid(value),
      ),
    );
    const customers = (report.data || []).filter(
      (customer: any) => !requestedIds.size || requestedIds.has(customer.id),
    );
    const ids = customers.map((customer: any) => customer.id);
    const customerDocs: any[] = ids.length
      ? await this.customers
          .find({ _id: { $in: ids }, isDeleted: false })
          .select('interactions')
          .lean()
      : [];
    const interactionMap = new Map(
      customerDocs.map((customer) => [String(customer._id), customer]),
    );
    const actorIds = [
      ...new Set(
        customerDocs.flatMap((customer) =>
          (customer.interactions || [])
            .filter(
              (interaction: any) => interaction.context === 'NEW_CUSTOMER_CARE',
            )
            .map((interaction: any) => String(interaction.createdBy || ''))
            .filter((value: string) => Types.ObjectId.isValid(value)),
        ),
      ),
    ];
    const actors: any[] = actorIds.length
      ? await this.users
          .find({ _id: { $in: actorIds } })
          .select('fullName username employeeCode')
          .lean()
      : [];
    const actorMap = new Map(
      actors.map((user) => [String(user._id), user.fullName || user.username]),
    );
    const purposeLabels: Record<string, string> = {
      WELCOME: 'Chào hỏi & làm quen',
      AFTER_SALE: 'Hỏi thăm sau mua hàng',
      NEEDS: 'Tìm hiểu nhu cầu',
      COMPLAINT: 'Tiếp nhận vấn đề',
      OTHER: 'Nội dung khác',
    };
    const outcomeLabels: Record<string, string> = {
      POSITIVE: 'Phản hồi tốt',
      NEUTRAL: 'Đã trao đổi',
      NEEDS_SUPPORT: 'Cần hỗ trợ',
      CALL_BACK: 'Hẹn gọi lại',
      NO_ANSWER: 'Không nghe máy',
      WRONG_NUMBER: 'Sai số',
      NOT_INTERESTED: 'Chưa quan tâm',
    };
    const qualificationLabels: Record<string, string> = {
      CREATED: 'Mới thêm vào hệ thống',
      CODE_ASSIGNED: 'Mới được cấp mã',
      CODE_CHANGED: 'Được gán/đổi từ mã cũ',
    };
    const rows = customers.flatMap((customer: any) => {
      const interactions = (interactionMap.get(customer.id)?.interactions || [])
        .filter(
          (interaction: any) =>
            interaction.context === 'NEW_CUSTOMER_CARE' &&
            new Date(interaction.occurredAt || interaction.at) >=
              new Date(customer.customerQualifiedAt),
        )
        .sort(
          (left: any, right: any) =>
            new Date(right.occurredAt || right.at).getTime() -
            new Date(left.occurredAt || left.at).getTime(),
        );
      const base = {
        customerCode: customer.customerCode || '',
        customerName: customer.customerName || '',
        phone: customer.phone || '',
        qualifiedAt: new Date(customer.customerQualifiedAt),
        qualification:
          qualificationLabels[customer.qualificationReason] || 'Khách mới',
        invoiceCount: customer.invoiceCount,
        revenue: customer.totalRevenue,
      };
      if (!interactions.length)
        return [
          {
            ...base,
            careStatus: 'CHƯA GỌI',
            occurredAt: null,
            purpose: '',
            outcome: '',
            action: '',
            note: '',
            followUp: '',
            nextFollowUpAt: null,
            actorName: '',
          },
        ];
      return interactions.map((interaction: any) => ({
        ...base,
        careStatus: interaction.followUpRequired
          ? 'CẦN GỌI LẠI'
          : 'ĐÃ CHĂM SÓC',
        occurredAt: new Date(interaction.occurredAt || interaction.at),
        purpose:
          purposeLabels[interaction.purpose] || interaction.purpose || '',
        outcome:
          outcomeLabels[interaction.outcome] || interaction.outcome || '',
        action: interaction.action || '',
        note: interaction.note || interaction.result || '',
        followUp: interaction.followUpRequired ? 'CÓ' : 'KHÔNG',
        nextFollowUpAt: interaction.nextFollowUpAt
          ? new Date(interaction.nextFollowUpAt)
          : null,
        actorName: actorMap.get(String(interaction.createdBy)) || '',
      }));
    });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Phúc Long';
    const sheet = workbook.addWorksheet('CSKH mới 45 ngày', {
      views: [{ state: 'frozen', ySplit: 4 }],
    });
    sheet.mergeCells('A1:Q1');
    sheet.getCell('A1').value = 'BÁO CÁO TƯƠNG TÁC KHÁCH HÀNG MỚI';
    sheet.getCell('A1').font = {
      bold: true,
      size: 18,
      color: { argb: 'FFFFFFFF' },
    };
    sheet.getCell('A1').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    sheet.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF173F64' },
    };
    sheet.getRow(1).height = 30;
    sheet.mergeCells('A2:Q2');
    sheet.getCell('A2').value =
      `Khách tạo/cấp/đổi mã trong ${report.meta.days} ngày và phát sinh 1–2 đơn · Xuất lúc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;
    sheet.getCell('A2').font = { italic: true, color: { argb: 'FF475569' } };
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    const columns = [
      ['STT', 'index', 7],
      ['MÃ KH', 'customerCode', 16],
      ['TÊN KHÁCH HÀNG', 'customerName', 30],
      ['SỐ ĐIỆN THOẠI', 'phone', 18],
      ['NGÀY VÀO NHÓM', 'qualifiedAt', 16],
      ['LÝ DO VÀO NHÓM', 'qualification', 24],
      ['SỐ ĐƠN', 'invoiceCount', 10],
      ['DOANH THU', 'revenue', 18],
      ['TRẠNG THÁI CSKH', 'careStatus', 18],
      ['THỜI GIAN GỌI', 'occurredAt', 20],
      ['MỤC ĐÍCH', 'purpose', 24],
      ['KẾT QUẢ', 'outcome', 20],
      ['NỘI DUNG TRAO ĐỔI', 'action', 42],
      ['GHI CHÚ', 'note', 36],
      ['GỌI LẠI', 'followUp', 12],
      ['THỜI GIAN GỌI LẠI', 'nextFollowUpAt', 22],
      ['NGƯỜI THỰC HIỆN', 'actorName', 22],
    ];
    const headerRow = sheet.getRow(4);
    columns.forEach(([header, key, width], index) => {
      sheet.getColumn(index + 1).key = String(key);
      sheet.getColumn(index + 1).width = Number(width);
      headerRow.getCell(index + 1).value = header;
    });
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF315F50' },
      };
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
    });
    rows.forEach((row: any, index: number) => {
      const excelRow = sheet.addRow({ ...row, index: index + 1 });
      excelRow.alignment = { vertical: 'top', wrapText: true };
      if (row.careStatus === 'CHƯA GỌI')
        excelRow.getCell('careStatus').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFEBEE' },
        };
      if (row.careStatus === 'CẦN GỌI LẠI')
        excelRow.getCell('careStatus').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF3E0' },
        };
    });
    sheet.autoFilter = { from: 'A4', to: 'Q4' };
    ['qualifiedAt', 'occurredAt', 'nextFollowUpAt'].forEach((key) => {
      sheet.getColumn(key).numFmt = 'dd/mm/yyyy hh:mm';
    });
    sheet.getColumn('phone').numFmt = '@';
    sheet.getColumn('revenue').numFmt = '#,##0';
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  async topProducts(
    query: DashboardPeriodQueryDto,
    actor: DashboardActor,
  ): Promise<any> {
    const period = resolveReportPeriod(query);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const rows: any[] = await this.invoices
      .find(this.invoiceFilter(query, actor, period.from, period.to))
      .select('subtotal discountAmount items')
      .lean();
    const map = new Map<string, any>();
    for (const invoice of rows)
      for (const item of invoice.items || [])
        if (item.lineType === InvoiceLineType.SALE) {
          if (
            (query.productId && String(item.productId) !== query.productId) ||
            (query.categoryId && String(item.categoryId) !== query.categoryId)
          )
            continue;
          const key = String(item.productId),
            entry = map.get(key) || {
              productId: key,
              code: item.productCode,
              name: item.productName,
              unit: item.unit,
              quantity: 0,
              grossRevenue: 0,
              discountAllocated: 0,
              netRevenue: 0,
              cogs: 0,
              grossProfit: 0,
            };
          const discount = invoice.subtotal
            ? (Number(invoice.discountAmount || 0) *
                Number(item.lineTotal || 0)) /
              invoice.subtotal
            : 0;
          entry.quantity += item.qty;
          entry.grossRevenue += item.lineTotal;
          entry.discountAllocated += discount;
          entry.netRevenue += item.lineTotal - discount;
          entry.cogs += Number(item.costPrice || 0) * item.qty;
          entry.grossProfit = entry.netRevenue - entry.cogs;
          map.set(key, entry);
        }
    const productIds = [...map.keys()].filter((id) => id && id !== 'undefined');
    const [productImages, websiteProducts] = productIds.length
      ? await Promise.all([
          this.products
            .find({ _id: { $in: productIds } })
            .select('imageUrl')
            .lean(),
          this.websiteProducts
            .find({
              isDeleted: { $ne: true },
              inventoryProductId: { $in: productIds },
            })
            .select('inventoryProductId imageUrls')
            .lean(),
        ])
      : [[], []];
    const adminImages = new Map(
      productImages.map((product: any) => [
        String(product._id),
        product.imageUrl,
      ]),
    );
    const websiteImages = new Map(
      websiteProducts.map((product: any) => [
        String(product.inventoryProductId),
        (product.imageUrls || []).find(Boolean),
      ]),
    );
    for (const [id, row] of map)
      row.imageUrl = adminImages.get(id) || websiteImages.get(id) || undefined;
    const sort = query.sortBy === 'QUANTITY' ? 'quantity' : 'netRevenue';
    return {
      data: [...map.values()].sort((a, b) => b[sort] - a[sort]).slice(0, limit),
      period,
    };
  }
  async trucks(
    query: DashboardPeriodQueryDto,
    actor: DashboardActor,
  ): Promise<any> {
    const period = resolveReportPeriod(query);
    const [trucks, products, invoices, transfers] = await Promise.all([
      this.trucksModel.find({ isDeleted: false }).lean(),
      this.products.find({ isDeleted: false }).select('costPrice').lean(),
      this.invoices
        .find({
          ...this.invoiceFilter(query, actor, period.from, period.to),
          sourceType: 'truck',
        })
        .select('truckId grandTotal')
        .lean(),
      this.transfers
        .find({
          isDeleted: false,
          type: TruckTransferType.TRUCK_TO_TRUCK,
          date: { $gte: period.from, $lte: period.to },
        })
        .lean(),
    ]);
    const costs = new Map(
      products.map((p: any) => [String(p._id), Number(p.costPrice || 0)]),
    );
    const ranking = new Map<string, any>();
    for (const invoice of invoices) {
      const key = String(invoice.truckId);
      const row = ranking.get(key) || {
        truckId: key,
        invoiceCount: 0,
        revenue: 0,
      };
      row.invoiceCount++;
      row.revenue += invoice.grandTotal;
      ranking.set(key, row);
    }
    const inventoryQuantity = trucks.reduce(
        (sum, truck) => sum + truck.inventory.reduce((v, i) => v + i.qty, 0),
        0,
      ),
      inventoryValue = trucks.reduce(
        (sum, truck) =>
          sum +
          truck.inventory.reduce(
            (v, i) => v + i.qty * (costs.get(String(i.productId)) || 0),
            0,
          ),
        0,
      );
    return {
      data: {
        totalTrucks: trucks.length,
        activeTrucks: trucks.filter((t) => t.status === 'active').length,
        trucksWithoutDriver: trucks.filter((t) => !t.driverId).length,
        trucksWithInventory: trucks.filter((t) =>
          t.inventory.some((i) => i.qty > 0),
        ).length,
        inventoryQuantity,
        inventoryValue,
        truckRevenue: invoices.reduce((s, i) => s + i.grandTotal, 0),
        truckInvoiceCount: invoices.length,
        truckToTruckTransfers: transfers.length,
        ranking: [...ranking.values()]
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, Number(query.limit) || 10),
      },
      period,
    };
  }
  async customerMetrics(
    query: DashboardPeriodQueryDto,
    actor: DashboardActor,
  ): Promise<any> {
    const period = resolveReportPeriod(query);
    const invoiceFilter = this.invoiceFilter(
      query,
      actor,
      period.from,
      period.to,
    );
    const [customers, invoices] = await Promise.all([
      this.customers.find({ isDeleted: false }).lean(),
      this.invoices.find(invoiceFilter).select('customerId').lean(),
    ]);
    const counts = new Map<string, number>();
    for (const invoice of invoices)
      if (invoice.customerId)
        counts.set(
          String(invoice.customerId),
          (counts.get(String(invoice.customerId)) || 0) + 1,
        );
    return {
      data: {
        totalCustomers: customers.length,
        newCustomers: customers.filter(
          (c) => c.createdAt >= period.from && c.createdAt <= period.to,
        ).length,
        leads: customers.filter((c) => c.source === 'LEAD').length,
        legacyCustomers: customers.filter((c) => c.source === 'LEGACY').length,
        zaloConnected: customers.filter((c) => c.zaloConnected).length,
        customersWithDebt: customers.filter((c) => c.debt > 0).length,
        warningCustomers: customers.filter(
          (c) => c.debtLimit > 0 && c.debt >= c.debtLimit,
        ).length,
        customersWithInvoices: counts.size,
        returningCustomers: [...counts.values()].filter((count) => count >= 2)
          .length,
        returningRatePercent: counts.size
          ? Math.round(
              ([...counts.values()].filter((count) => count >= 2).length /
                counts.size) *
                10000,
            ) / 100
          : 0,
      },
      period,
    };
  }
  async promotionMetrics(
    query: DashboardPeriodQueryDto,
    actor: DashboardActor,
  ): Promise<any> {
    const period = resolveReportPeriod(query);
    const filter = this.invoiceFilter(query, actor, period.from, period.to);
    filter.$or = [
      { promotionId: { $ne: null } },
      { 'promotionApplications.0': { $exists: true } },
    ];
    const [programs, usedVouchers, activations, invoices] = await Promise.all([
      this.promotionsModel.find({ isDeleted: false }).lean(),
      this.vouchers.countDocuments({
        isDeleted: false,
        status: VoucherStatus.USED,
      }),
      this.activations
        .find({
          isDeleted: false,
          status: PromotionActivationStatus.ACTIVE,
          activatedAt: { $gte: period.from, $lte: period.to },
          ...(this.scope(query, actor)
            ? { salespersonId: this.scope(query, actor) }
            : {}),
        })
        .lean(),
      this.invoices.find(filter).lean(),
    ]);
    const giftCost = invoices.reduce(
        (sum, invoice) =>
          sum +
          invoice.items
            .filter((item) => item.lineType === InvoiceLineType.GIFT)
            .reduce((v, item) => v + Number(item.costPrice || 0) * item.qty, 0),
        0,
      ),
      revenue = invoices.reduce((s, i) => s + i.grandTotal, 0),
      discount = invoices.reduce((s, i) => s + i.discountAmount, 0),
      cost = discount + giftCost;
    return {
      data: {
        activePrograms: programs.filter(
          (p) => p.status === PromotionStatus.ACTIVE,
        ).length,
        scheduledPrograms: programs.filter(
          (p) => p.status === PromotionStatus.SCHEDULED,
        ).length,
        usedVouchers,
        activeActivationCodes: activations.length,
        promotionRevenue: revenue,
        discountAmount: discount,
        giftCost,
        promotionCost: cost,
        revenueROI: cost
          ? Math.round(((revenue - cost) / cost) * 10000) / 100
          : 0,
      },
      period,
    };
  }
  async employeeMetrics(
    query: DashboardPeriodQueryDto,
    actor: DashboardActor,
  ): Promise<any> {
    const period = resolveReportPeriod(query);
    const employeeId = this.scope(query, actor);
    const [users, kpis, invoices, activations] = await Promise.all([
      this.users
        .find({
          isDeleted: false,
          role: RoleEnum.STAFF,
          status: UserStatus.ACTIVE,
        })
        .lean(),
      this.kpis
        .find({
          isDeleted: false,
          ...(employeeId ? { employeeId } : {}),
          from: { $lte: period.to },
          to: { $gte: period.from },
        })
        .lean(),
      this.invoices
        .find(this.invoiceFilter(query, actor, period.from, period.to))
        .select('salespersonId salespersonCode salespersonName grandTotal')
        .lean(),
      this.activations
        .find({
          isDeleted: false,
          status: PromotionActivationStatus.ACTIVE,
          activatedAt: { $gte: period.from, $lte: period.to },
          ...(employeeId ? { salespersonId: employeeId } : {}),
        })
        .lean(),
    ]);
    const map = new Map<string, any>();
    for (const invoice of invoices) {
      const key = String(invoice.salespersonId),
        row = map.get(key) || {
          employeeId: key,
          employeeCode: invoice.salespersonCode,
          employeeName: invoice.salespersonName,
          invoiceCount: 0,
          revenue: 0,
          activationCount: 0,
        };
      row.invoiceCount++;
      row.revenue += invoice.grandTotal;
      map.set(key, row);
    }
    for (const activation of activations) {
      const key = String(activation.salespersonId),
        row = map.get(key) || {
          employeeId: key,
          employeeCode: activation.salespersonCode,
          employeeName: activation.salespersonName,
          invoiceCount: 0,
          revenue: 0,
          activationCount: 0,
        };
      row.activationCount++;
      map.set(key, row);
    }
    return {
      data: {
        activeEmployees: users.length,
        activeKpis: kpis.filter((k) => k.status === EmployeeKpiStatus.ACTIVE)
          .length,
        completedKpis: kpis.filter(
          (k) => k.status === EmployeeKpiStatus.COMPLETED,
        ).length,
        topRevenue: [...map.values()]
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, Number(query.limit) || 10),
        topActivations: [...map.values()]
          .sort((a, b) => b.activationCount - a.activationCount)
          .slice(0, Number(query.limit) || 10),
      },
      period,
    };
  }
  async systemHealth(
    query: DashboardPeriodQueryDto,
    actor: DashboardActor,
  ): Promise<any> {
    if (actor.role !== RoleEnum.ADMIN)
      throw new BadRequestException('Chỉ admin được xem sức khỏe hệ thống');
    const period = resolveReportPeriod(query);
    const logs = await this.audit
      .find({
        isDeleted: false,
        occurredAt: { $gte: period.from, $lte: period.to },
      })
      .select(
        'status httpStatus action durationMs method path actorFullName occurredAt',
      )
      .sort({ occurredAt: -1 })
      .lean();
    return {
      data: {
        failedRequests: logs.filter((l) => l.status === AuditLogStatus.FAILED)
          .length,
        serverErrors: logs.filter((l) => l.httpStatus >= 500).length,
        failedLogins: logs.filter(
          (l) => l.action === 'LOGIN' && l.status === AuditLogStatus.FAILED,
        ).length,
        slowRequests: logs.filter((l) => l.durationMs >= 1000).length,
        recentDestructiveActivities: logs
          .filter(
            (l) => ['DELETE'].includes(l.action) || /cancel|hủy/i.test(l.path),
          )
          .slice(0, 20),
      },
      period,
    };
  }
}
