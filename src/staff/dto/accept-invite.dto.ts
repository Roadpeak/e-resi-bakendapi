import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  password: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  lastName: string;

  /** Required: the team sees each other's faces in the dashboard header. */
  @ApiProperty({ description: 'Profile photo URL from POST /staff/invite/:token/photo' })
  @IsUrl({ require_tld: false }, { message: 'Add a profile photo to continue' })
  avatarUrl: string;
}
