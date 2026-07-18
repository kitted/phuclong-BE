import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ required: true, type: String, example: '123456' })
  @IsString()
  oldPassword: string;

  @ApiProperty({ required: true, type: String, example: '123456' })
  @Length(1, 12)
  @IsString()
  password: string;

  @ApiProperty({ required: true, type: String, example: '123456' })
  @Length(1, 12)
  @IsString()
  confirmPassword: string;
}
