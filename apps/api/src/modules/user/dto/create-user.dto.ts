import { IsEmail, IsEnum, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName: string;

  @IsEnum(['TENANT_ADMIN', 'FORM_DESIGNER', 'CLINICIAN', 'VIEWER'], {
    message: 'role must be one of: TENANT_ADMIN, FORM_DESIGNER, CLINICIAN, VIEWER',
  })
  role: string;
}
