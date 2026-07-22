import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { RoleEnum } from '../interfaces/role.enum';
import { UserStatus } from '../schemas/users.schema';

export class CreateUserDto {
  @ApiProperty({
    required: true,
    type: String,
    example: 'Marcus',
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    required: true,
    type: String,
    example: 'pass',
  })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({
    required: false,
    enum: RoleEnum,
    example: RoleEnum.STAFF,
  })
  @IsOptional()
  @IsEnum(RoleEnum)
  role?: RoleEnum;

  @ApiPropertyOptional() @IsOptional() @IsString() fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employeeCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class UserListQueryDto {
  @ApiPropertyOptional({ enum: RoleEnum }) @IsOptional() @IsEnum(RoleEnum) role?: RoleEnum;
  @ApiPropertyOptional({ enum: UserStatus }) @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @ApiPropertyOptional() @IsOptional() search?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() page?: string;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() limit?: string;
}

export class ChangeUserStatusDto {
  @ApiProperty({ enum: UserStatus }) @IsEnum(UserStatus) status: UserStatus;
}
