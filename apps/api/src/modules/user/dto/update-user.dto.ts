import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;

  @IsOptional()
  @IsEnum(['TENANT_ADMIN', 'FORM_DESIGNER', 'CLINICIAN', 'VIEWER'], {
    message: 'role must be one of: TENANT_ADMIN, FORM_DESIGNER, CLINICIAN, VIEWER',
  })
  role?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
