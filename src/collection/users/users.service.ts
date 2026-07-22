import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { Users } from './schemas/users.schema';
import { ReturnModelType } from '@typegoose/typegoose';
import { ID } from 'src/core/interfaces/id.interface';
import * as bcrypt from 'bcrypt';
import { RoleEnum } from './interfaces/role.enum';
import { JwtPayload } from '../auth/interfaces/jwtPayload.interface';
import { ChangePasswordDto } from '../auth/dtos/change-password.dto';
import { Logger } from '@nestjs/common'; // Thêm import này
import { ChangeUserStatusDto, CreateUserDto, UpdateUserDto, UserListQueryDto } from './dtos/create-user.dto';
import { UserStatus } from './schemas/users.schema';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { vietnamDateBoundary } from '../trucks/truck-transfer-date';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name); // Tạo instance logger
  constructor(
    @InjectModel(Users)
    private readonly userModel: ReturnModelType<typeof Users>,
    @InjectModel(Invoices)
    private readonly invoiceModel: ReturnModelType<typeof Invoices>,
  ) {}

  async getTest() {
    return 'abc';
  }

  async findUserForLogin(username: string) {
    return await this.getByLogin(username);
  }

  async getByLogin(username: string) {
    return await this.userModel.findOne({
      username: username.trim(),
      isDeleted: false,
      status: { $ne: UserStatus.INACTIVE },
    }).select('+password');
  }

  async findById(id: ID | string) {
    return await this.userModel.findOne({
      _id: id,
      isDeleted: false,
      status: { $ne: UserStatus.INACTIVE },
    });
  }

  async getProfile(id: ID) {
    const tmp = [
      {
        $match: {
          $expr: {
            $eq: ['$_id', { $toObjectId: id }],
          },
          isDeleted: false,
          status: { $ne: UserStatus.INACTIVE },
        },
      },
      {
        $project: {
          password: 0,
        },
      },
    ];

    const rs = await this.userModel.aggregate(tmp);

    if (rs.length > 0) {
      return rs[0];
    }
    return;
  }

  async findAdmin() {
    return this.userModel.findOne({
      username: 'admin',
      role: RoleEnum.ADMIN,
      isDeleted: false,
    });
  }

  async createAdmin(dto: { username: string; password: string }) {
    const newUser = new this.userModel({ ...dto, role: RoleEnum.ADMIN });
    newUser.password = await bcrypt.hash(dto.password, 10);

    const created: any = await newUser.save();

    return await this.findById(created._id);
  }

  async changePassword(jwt: JwtPayload, dto: ChangePasswordDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new HttpException(
        'Tài khoản nhập lại không chính xác!',
        HttpStatus.BAD_REQUEST,
      );
    }

    const user = await this.userModel.findOne({ _id: jwt.id, isDeleted: false, status: UserStatus.ACTIVE }).select('+password');
    if (!user) throw new HttpException('Không tìm thấy User!', HttpStatus.BAD_REQUEST);
    // if (!user || user.role === RoleEnum.ADMIN) {
    //   throw new HttpException('Không tìm thấy User!', HttpStatus.BAD_REQUEST);
    // }

    const match = await bcrypt.compare(dto.oldPassword, user.password);

    if (!match) {
      throw new HttpException('Sai mật khẩu!', HttpStatus.UNAUTHORIZED);
    }
    const password = await bcrypt.hash(dto.password, 10);

    await this.userModel.findByIdAndUpdate(
      jwt.id,
      { password },
    );
    return this.findById(jwt.id);
  }

  private async nextEmployeeCode() {
    const latest = await this.userModel.findOne({ employeeCode: /^NV-\d+$/ }).sort({ employeeCode: -1 }).select('employeeCode').lean();
    const next = Number(latest?.employeeCode?.match(/\d+$/)?.[0] || 0) + 1;
    return `NV-${String(next).padStart(3, '0')}`;
  }

  async create(payload: CreateUserDto): Promise<any> {
    const username = payload.username.trim();
    if (!username || !payload.password || payload.password.length < 6) throw new BadRequestException('Tên đăng nhập và mật khẩu tối thiểu 6 ký tự là bắt buộc');
    if (await this.userModel.exists({ username, isDeleted: false })) throw new ConflictException('Tên đăng nhập đã tồn tại');
    const employeeCode = payload.employeeCode?.trim().toUpperCase() || await this.nextEmployeeCode();
    if (await this.userModel.exists({ employeeCode })) throw new ConflictException('Mã nhân viên đã tồn tại');
    const password = await bcrypt.hash(payload.password, 10);
    const created = await this.userModel.create({
      ...payload,
      username,
      employeeCode,
      role: payload.role || RoleEnum.STAFF,
      status: UserStatus.ACTIVE,
      email: payload.email?.trim().toLowerCase() || undefined,
      password,
    });
    return { data: await this.userModel.findById(created._id) };
  }

  private pagination(value: string | undefined, fallback: number, max?: number) {
    const parsed = Number(value || fallback);
    if (!Number.isInteger(parsed) || parsed < 1 || (max && parsed > max)) throw new BadRequestException('Tham số phân trang không hợp lệ');
    return parsed;
  }

  async findAllAdmin(query: UserListQueryDto): Promise<any> {
    const page = this.pagination(query.page, 1); const limit = this.pagination(query.limit, 20, 100);
    const filter: any = { isDeleted: false };
    if (query.role) filter.role = query.role;
    if (query.status) filter.status = query.status;
    if (query.search?.trim()) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = ['employeeCode', 'username', 'fullName', 'phone', 'email'].map((field) => ({ [field]: { $regex: escaped, $options: 'i' } }));
    }
    const [users, totalItems] = await Promise.all([
      this.userModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.userModel.countDocuments(filter),
    ]);
    return {
      data: users.map((user: any) => ({ ...user, id: String(user._id) })),
      meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  async getAdminSummary() {
    const rows = await this.userModel.find({ isDeleted: false }).select('role status lastLoginAt').lean();
    return { data: {
      totalEmployees: rows.length,
      active: rows.filter((item) => item.status !== UserStatus.INACTIVE).length,
      inactive: rows.filter((item) => item.status === UserStatus.INACTIVE).length,
      admins: rows.filter((item) => item.role === RoleEnum.ADMIN).length,
      staff: rows.filter((item) => item.role === RoleEnum.STAFF).length,
      loggedIn: rows.filter((item) => Boolean(item.lastLoginAt)).length,
    } };
  }

  async findOneAdmin(id: string) {
    const user = await this.userModel.findOne({ _id: id, isDeleted: false }).lean();
    if (!user) throw new NotFoundException('Không tìm thấy nhân viên');
    return { data: { ...user, id: String(user._id) } };
  }

  async updateAdmin(id: string, dto: UpdateUserDto): Promise<any> {
    const current = await this.userModel.findOne({ _id: id, isDeleted: false });
    if (!current) throw new NotFoundException('Không tìm thấy nhân viên');
    const update: any = { ...dto };
    if (dto.role && !Object.values(RoleEnum).includes(dto.role)) throw new BadRequestException('Vai trò không hợp lệ');
    if (current.role === RoleEnum.ADMIN && dto.role && dto.role !== RoleEnum.ADMIN) await this.assertAdminRemains(current);
    if (dto.username) {
      update.username = dto.username.trim();
      if (await this.userModel.exists({ username: update.username, _id: { $ne: id }, isDeleted: false })) throw new ConflictException('Tên đăng nhập đã tồn tại');
    }
    if (dto.employeeCode) {
      update.employeeCode = dto.employeeCode.trim().toUpperCase();
      if (await this.userModel.exists({ employeeCode: update.employeeCode, _id: { $ne: id } })) throw new ConflictException('Mã nhân viên đã tồn tại');
    }
    if (dto.email !== undefined) update.email = dto.email?.trim().toLowerCase() || undefined;
    if (dto.password) {
      if (dto.password.length < 6) throw new BadRequestException('Mật khẩu phải có ít nhất 6 ký tự');
      update.password = await bcrypt.hash(dto.password, 10);
    } else delete update.password;
    const user = await this.userModel.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    return { data: user };
  }

  private async assertAdminRemains(user: Users) {
    if (user.role !== RoleEnum.ADMIN || user.status === UserStatus.INACTIVE) return;
    const activeAdmins = await this.userModel.countDocuments({ role: RoleEnum.ADMIN, status: { $ne: UserStatus.INACTIVE }, isDeleted: false });
    if (activeAdmins <= 1) throw new ConflictException('Không thể khóa hoặc xóa quản trị viên hoạt động cuối cùng');
  }

  async changeAdminStatus(id: string, dto: ChangeUserStatusDto, currentUserId?: string) {
    if (!Object.values(UserStatus).includes(dto.status)) throw new BadRequestException('Trạng thái tài khoản không hợp lệ');
    if (id === currentUserId && dto.status === UserStatus.INACTIVE) throw new ForbiddenException('Không thể tự khóa tài khoản đang đăng nhập');
    const user = await this.userModel.findOne({ _id: id, isDeleted: false });
    if (!user) throw new NotFoundException('Không tìm thấy nhân viên');
    if (dto.status === UserStatus.INACTIVE) await this.assertAdminRemains(user);
    user.status = dto.status;
    await user.save();
    return { data: await this.userModel.findById(id) };
  }

  async removeAdmin(id: string, currentUserId?: string) {
    if (id === currentUserId) throw new ForbiddenException('Không thể tự xóa tài khoản đang đăng nhập');
    const user = await this.userModel.findOne({ _id: id, isDeleted: false });
    if (!user) throw new NotFoundException('Không tìm thấy nhân viên');
    await this.assertAdminRemains(user);
    user.isDeleted = true; user.deletedAt = new Date(); user.status = UserStatus.INACTIVE;
    await user.save();
    return { data: { id: String(user._id), deleted: true } };
  }

  async markLogin(id: string) {
    await this.userModel.updateOne({ _id: id }, { lastLoginAt: new Date() });
  }

  async salesKpi(id: string, from?: string, to?: string) {
    if (!await this.userModel.exists({ _id: id, isDeleted: false })) throw new NotFoundException('Không tìm thấy nhân viên');
    const filter: any = { salespersonId: id, isDeleted: false };
    if (from || to) { filter.date = {}; if (from) filter.date.$gte = vietnamDateBoundary(from, false); if (to) filter.date.$lte = vietnamDateBoundary(to, true); }
    const invoices: any[] = await this.invoiceModel.find(filter).select('customerId subtotal discountAmount grandTotal totalAmount paidAmount debtAmount').lean();
    const grossRevenue = invoices.reduce((sum, item) => sum + (item.subtotal ?? item.totalAmount ?? 0), 0);
    const discountAmount = invoices.reduce((sum, item) => sum + (item.discountAmount || 0), 0);
    const netRevenue = invoices.reduce((sum, item) => sum + (item.grandTotal ?? item.totalAmount ?? 0), 0);
    return { data: { invoiceCount: invoices.length, grossRevenue, discountAmount, netRevenue, paidAmount: invoices.reduce((sum, item) => sum + (item.paidAmount || 0), 0), debtAmount: invoices.reduce((sum, item) => sum + (item.debtAmount ?? Math.max(0, (item.totalAmount || 0) - (item.paidAmount || 0))), 0), averageInvoiceValue: invoices.length ? Math.round(netRevenue / invoices.length) : 0, uniqueCustomers: new Set(invoices.map((item) => item.customerId && String(item.customerId)).filter(Boolean)).size } };
  }

  async wakeup() {
    console.log('wake up ... ');
    this.logger.log('wake up ...'); // Ghi log
    return await this.userModel.find({ isDeleted: false });
  }
}
