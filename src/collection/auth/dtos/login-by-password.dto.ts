import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class LoginByPasswordDto {
  @ApiProperty({ required: true, type: String, example: 'admin' })
  @IsString()
  username: string;

  @ApiProperty({ required: true, type: String, example: 'Abc@123' })
  @IsString()
  @Length(6, 12)
  password: string;
}
