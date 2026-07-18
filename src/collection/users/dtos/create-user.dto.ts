import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { RoleEnum } from '../interfaces/role.enum';

export class CreateUserDto {
  @ApiProperty({
    required: true,
    type: String,
    example: 'Marcus',
  })
  @IsString()
  username: string;

  @ApiProperty({
    required: true,
    type: String,
    example: 'pass',
  })
  @IsString()
  password: string;

  @ApiPropertyOptional({
    required: false,
    enum: RoleEnum,
    example: RoleEnum.STAFF,
  })
  @IsOptional()
  @IsEnum(RoleEnum)
  role?: RoleEnum;
}
