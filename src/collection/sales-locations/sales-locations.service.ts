import { Injectable } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { InjectModel } from 'nestjs-typegoose';
import { Types } from 'mongoose';
import { vietnamDateBoundary } from '../trucks/truck-transfer-date';
import { CreateSalesLocationDto } from './dtos/sales-locations.dto';
import {
  SalesLocations,
  SalesLocationSource,
} from './schemas/sales-locations.schema';

export type RoutePoint = {
  latitude: number;
  longitude: number;
  capturedAt: Date | string;
  accuracy?: number;
  speed?: number;
  heading?: number;
};

const radians = (value: number) => (value * Math.PI) / 180;

export function distanceKm(from: RoutePoint, to: RoutePoint): number {
  const earthRadius = 6371;
  const latitude = radians(to.latitude - from.latitude);
  const longitude = radians(to.longitude - from.longitude);
  const value =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitude / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function summarizeRoute(points: RoutePoint[]) {
  let totalDistanceKm = 0;
  let segment = 0;
  const routePoints = points.map((point, index) => {
    if (index > 0) {
      const previous = points[index - 1];
      const gapMs =
        new Date(point.capturedAt).getTime() -
        new Date(previous.capturedAt).getTime();
      const gapDistance = distanceKm(previous, point);
      if (gapMs > 30 * 60 * 1000 || gapMs < 0 || gapDistance > 5) segment += 1;
      else totalDistanceKm += gapDistance;
    }
    return { ...point, segment };
  });
  const firstCapturedAt = points[0]?.capturedAt || null;
  const lastCapturedAt = points[points.length - 1]?.capturedAt || null;
  const durationMinutes =
    firstCapturedAt && lastCapturedAt
      ? Math.max(
          0,
          Math.round(
            (new Date(lastCapturedAt).getTime() -
              new Date(firstCapturedAt).getTime()) /
              60000,
          ),
        )
      : 0;
  return {
    pointCount: points.length,
    firstCapturedAt,
    lastCapturedAt,
    durationMinutes,
    distanceKm: Number(totalDistanceKm.toFixed(2)),
    points: routePoints,
  };
}

@Injectable()
export class SalesLocationsService {
  constructor(
    @InjectModel(SalesLocations)
    private readonly model: ReturnModelType<typeof SalesLocations>,
  ) {}

  private period(date: string) {
    return {
      from: vietnamDateBoundary(date, false),
      to: vietnamDateBoundary(date, true),
      timezone: 'Asia/Ho_Chi_Minh',
    };
  }

  async capture(dto: CreateSalesLocationDto, actor: any): Promise<any> {
    const capturedAt = new Date(dto.capturedAt);
    const now = Date.now();
    if (
      Number.isNaN(capturedAt.getTime()) ||
      capturedAt.getTime() > now + 5 * 60 * 1000 ||
      capturedAt.getTime() < now - 24 * 60 * 60 * 1000
    ) {
      return { data: { accepted: false, reason: 'INVALID_CAPTURE_TIME' } };
    }
    const latest: any = await this.model
      .findOne({ salespersonId: actor.id, isDeleted: false })
      .sort({ capturedAt: -1 })
      .lean();
    if (latest) {
      const elapsed =
        capturedAt.getTime() - new Date(latest.capturedAt).getTime();
      const movedKm = distanceKm(latest, dto);
      if (elapsed >= 0 && elapsed < 60_000 && movedKm < 0.02) {
        return { data: { accepted: false, reason: 'DUPLICATE_POINT' } };
      }
    }
    const point: any = await this.model.create({
      salespersonId: new Types.ObjectId(actor.id),
      salespersonName: actor.name || actor.username || 'Nhân viên',
      salespersonCode: actor.employeeCode,
      latitude: dto.latitude,
      longitude: dto.longitude,
      coordinates: {
        type: 'Point',
        coordinates: [dto.longitude, dto.latitude],
      },
      accuracy: dto.accuracy,
      speed: dto.speed,
      heading: dto.heading,
      source: dto.source || SalesLocationSource.STAFF_HOME,
      capturedAt,
    });
    return { data: { accepted: true, id: String(point._id), capturedAt } };
  }

  private async points(date: string, salespersonId?: string): Promise<any[]> {
    const period = this.period(date);
    const filter: any = {
      isDeleted: false,
      capturedAt: { $gte: period.from, $lte: period.to },
    };
    if (salespersonId) filter.salespersonId = new Types.ObjectId(salespersonId);
    return this.model.find(filter).sort({ capturedAt: 1, _id: 1 }).lean();
  }

  async daily(date: string, salespersonId?: string): Promise<any> {
    const rows = await this.points(date);
    const grouped = new Map<string, any[]>();
    rows.forEach((row: any) => {
      const key = String(row.salespersonId);
      grouped.set(key, [...(grouped.get(key) || []), row]);
    });
    const summaries = [...grouped.entries()]
      .map(([id, points]) => {
        const summary = summarizeRoute(points);
        return {
          salespersonId: id,
          salespersonName: points[0]?.salespersonName,
          salespersonCode: points[0]?.salespersonCode,
          pointCount: summary.pointCount,
          firstCapturedAt: summary.firstCapturedAt,
          lastCapturedAt: summary.lastCapturedAt,
          durationMinutes: summary.durationMinutes,
          distanceKm: summary.distanceKm,
        };
      })
      .sort((left, right) =>
        String(left.salespersonName).localeCompare(
          String(right.salespersonName),
          'vi',
        ),
      );
    const selectedRows = salespersonId ? grouped.get(salespersonId) || [] : [];
    const selectedSummary = summarizeRoute(selectedRows);
    return {
      data: {
        date,
        period: this.period(date),
        summaries,
        route: salespersonId
          ? {
              salespersonId,
              salespersonName: selectedRows[0]?.salespersonName,
              salespersonCode: selectedRows[0]?.salespersonCode,
              ...selectedSummary,
            }
          : null,
        vehicleRoutes: {
          status: 'PLANNED',
          message: 'Dữ liệu tuyến xe sẽ được tích hợp ở giai đoạn sau',
          routes: [],
        },
      },
    };
  }

  async mine(date: string, actorId: string): Promise<any> {
    const rows = await this.points(date, actorId);
    return { data: { date, ...summarizeRoute(rows) } };
  }
}
