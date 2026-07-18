import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    required: true,
    type: String,
    example: '0123',
  })
  @IsString()
  reset_token: string;
}
