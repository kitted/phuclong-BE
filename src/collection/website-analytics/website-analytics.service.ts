import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { ReturnModelType } from '@typegoose/typegoose';
import {
  WebsiteAnalyticsEvents,
  WebsiteEventType,
  WebsiteLandingLeads,
} from './schemas/website-analytics.schema';
import {
  CreateWebsiteLandingLeadDto,
  TrackWebsiteEventDto,
  WebsiteAnalyticsQueryDto,
} from './dtos/website-analytics.dto';

const trim = (value: unknown, max = 140) => String(value || '').trim().slice(0, max);

@Injectable()
export class WebsiteAnalyticsService {
  constructor(
    @InjectModel(WebsiteAnalyticsEvents)
    private readonly events: ReturnModelType<typeof WebsiteAnalyticsEvents>,
    @InjectModel(WebsiteLandingLeads)
    private readonly leads: ReturnModelType<typeof WebsiteLandingLeads>,
  ) {}

  private safeMetadata(input?: Record<string, any>): Record<string, string | number | boolean> {
    const result: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(input || {}).slice(0, 20)) {
      const safeKey = trim(key, 60);
      if (!safeKey || !['string', 'number', 'boolean'].includes(typeof value)) continue;
      result[safeKey] = typeof value === 'string' ? trim(value, 300) : value;
    }
    return result;
  }

  async track(dto: TrackWebsiteEventDto, userAgent?: string, headerReferrer?: string) {
    if (!Object.values(WebsiteEventType).includes(dto.eventType))
      throw new BadRequestException('Event tracking không hợp lệ');
    if (!trim(dto.sessionId, 100) || !trim(dto.landingKey, 80))
      throw new BadRequestException('Thiếu sessionId hoặc landingKey');
    const duplicate = await this.events.findOne({
      eventType: dto.eventType,
      landingKey: trim(dto.landingKey, 80),
      sessionId: trim(dto.sessionId, 100),
      createdAt: { $gte: new Date(Date.now() - 2000) },
    }).select('_id').lean();
    if (duplicate) return { data: { id: duplicate._id, accepted: true, deduplicated: true } };
    const data = await this.events.create({
      eventType: dto.eventType,
      landingKey: trim(dto.landingKey, 80),
      pagePath: trim(dto.pagePath || '/', 300),
      sessionId: trim(dto.sessionId, 100),
      visitorId: trim(dto.visitorId, 100) || undefined,
      source: trim(dto.source, 100) || 'direct',
      medium: trim(dto.medium, 100) || undefined,
      campaign: trim(dto.campaign, 140) || undefined,
      content: trim(dto.content, 140) || undefined,
      term: trim(dto.term, 140) || undefined,
      sale: trim(dto.sale, 100) || undefined,
      product: trim(dto.product, 100) || undefined,
      model: trim(dto.model, 100) || undefined,
      referrer: trim(dto.referrer || headerReferrer, 500) || undefined,
      deviceType: trim(dto.deviceType, 30) || 'unknown',
      userAgent: trim(userAgent, 500) || undefined,
      metadata: this.safeMetadata(dto.metadata),
    });
    return { data: { id: data.id, accepted: true } };
  }

  async createLead(dto: CreateWebsiteLandingLeadDto) {
    const phone = trim(dto.phone, 20).replace(/\D/g, '').replace(/^84(?=\d{9}$)/, '0');
    if (!trim(dto.name, 120) || phone.length < 9 || phone.length > 11 || !trim(dto.sessionId, 100) || !trim(dto.landingKey, 80))
      throw new BadRequestException('Tên hoặc số điện thoại không hợp lệ');
    const duplicate = await this.leads.findOne({ phone, sessionId: trim(dto.sessionId, 100), landingKey: trim(dto.landingKey, 80), createdAt: { $gte: new Date(Date.now() - 5 * 60000) } }).lean();
    if (duplicate) return { data: { id: duplicate._id, status: duplicate.status, createdAt: duplicate.createdAt, deduplicated: true } };
    const data = await this.leads.create({
      name: trim(dto.name, 120), phone, province: trim(dto.province, 100) || undefined,
      role: trim(dto.role, 60) || undefined, landingKey: trim(dto.landingKey, 80),
      sessionId: trim(dto.sessionId, 100), source: trim(dto.source, 100) || 'direct',
      medium: trim(dto.medium, 100) || undefined, campaign: trim(dto.campaign, 140) || undefined,
      content: trim(dto.content, 140) || undefined, sale: trim(dto.sale, 100) || undefined,
    });
    return { data: { id: data.id, status: data.status, createdAt: data.createdAt } };
  }

  private period(query: WebsiteAnalyticsQueryDto) {
    const to = query.to ? new Date(`${query.to}T23:59:59.999+07:00`) : new Date();
    const from = query.from ? new Date(`${query.from}T00:00:00.000+07:00`) : new Date(to.getTime() - 29 * 86400000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to)
      throw new BadRequestException('Khoảng thời gian không hợp lệ');
    if (to.getTime() - from.getTime() > 366 * 86400000)
      throw new BadRequestException('Chỉ hỗ trợ báo cáo tối đa 366 ngày');
    return { from, to };
  }

  async report(query: WebsiteAnalyticsQueryDto): Promise<any> {
    const { from, to } = this.period(query);
    const filter: any = { createdAt: { $gte: from, $lte: to }, isDeleted: { $ne: true } };
    if (query.landingKey) filter.landingKey = query.landingKey;
    const leadFilter: any = { ...filter };
    const [eventCounts, sources, campaigns, devices, daily, sessions, visitors, leadCount, recentLeads] = await Promise.all([
      this.events.aggregate([{ $match: filter }, { $group: { _id: '$eventType', value: { $sum: 1 } } }]),
      this.events.aggregate([{ $match: { ...filter, eventType: WebsiteEventType.PAGE_VIEW } }, { $group: { _id: { source: { $ifNull: ['$source', 'direct'] }, medium: { $ifNull: ['$medium', ''] } }, visits: { $sum: 1 }, sessions: { $addToSet: '$sessionId' } } }, { $project: { _id: 0, source: '$_id.source', medium: '$_id.medium', visits: 1, uniqueSessions: { $size: '$sessions' } } }, { $sort: { visits: -1 } }, { $limit: 20 }]),
      this.events.aggregate([{ $match: { ...filter, eventType: WebsiteEventType.PAGE_VIEW } }, { $group: { _id: { $ifNull: ['$campaign', '(không có)'] }, visits: { $sum: 1 }, sessions: { $addToSet: '$sessionId' } } }, { $project: { _id: 0, campaign: '$_id', visits: 1, uniqueSessions: { $size: '$sessions' } } }, { $sort: { visits: -1 } }, { $limit: 20 }]),
      this.events.aggregate([{ $match: { ...filter, eventType: WebsiteEventType.PAGE_VIEW } }, { $group: { _id: { $ifNull: ['$deviceType', 'unknown'] }, value: { $sum: 1 } } }, { $project: { _id: 0, name: '$_id', value: 1 } }, { $sort: { value: -1 } }]),
      this.events.aggregate([{ $match: { ...filter, eventType: WebsiteEventType.PAGE_VIEW } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } }, visits: { $sum: 1 }, sessions: { $addToSet: '$sessionId' } } }, { $project: { _id: 0, date: '$_id', visits: 1, uniqueSessions: { $size: '$sessions' } } }, { $sort: { date: 1 } }]),
      this.events.distinct('sessionId', filter),
      this.events.distinct('visitorId', { ...filter, visitorId: { $nin: [null, ''] } }),
      this.leads.countDocuments(leadFilter),
      this.leads.find(leadFilter).sort({ createdAt: -1 }).limit(20).lean(),
    ]);
    const counts = Object.fromEntries(eventCounts.map((row) => [row._id, row.value]));
    const visits = Number(counts[WebsiteEventType.PAGE_VIEW] || 0);
    const forms = Number(counts[WebsiteEventType.FORM_SUBMIT] || leadCount || 0);
    const value = (eventType: WebsiteEventType) => Number(counts[eventType] || 0);
    return { data: {
      period: { from, to },
      summary: { visits, uniqueSessions: sessions.length, uniqueVisitors: visitors.length, qrVisits: value(WebsiteEventType.QR_VISIT), leads: leadCount, conversionRate: visits ? Math.round((forms / visits) * 10000) / 100 : 0 },
      funnel: [
        { event: WebsiteEventType.PAGE_VIEW, label: 'Lượt vào trang', value: visits },
        { event: WebsiteEventType.PRODUCT_DETAIL_VIEW, label: 'Xem sâu sản phẩm', value: value(WebsiteEventType.PRODUCT_DETAIL_VIEW) },
        { event: WebsiteEventType.VIDEO_PLAY, label: 'Phát video', value: value(WebsiteEventType.VIDEO_PLAY) },
        { event: WebsiteEventType.OFFER_VIEW, label: 'Xem gói test', value: value(WebsiteEventType.OFFER_VIEW) },
        { event: WebsiteEventType.ZALO_CLICK, label: 'Bấm Zalo', value: value(WebsiteEventType.ZALO_CLICK) },
        { event: WebsiteEventType.FORM_SUBMIT, label: 'Gửi form', value: forms },
      ], sources, campaigns, devices, daily, recentLeads,
    } };
  }
}
