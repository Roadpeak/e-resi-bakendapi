import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReplyInquiryDto {
  @ApiProperty({ example: 'Thank you for your interest. We have 2BR units available from KES 12.5M.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;
}
