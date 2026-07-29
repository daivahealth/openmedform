import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Self-service signup: creates a brand-new tenant (organization) and its first
 * TENANT_ADMIN. See docs/security/AUTH-AND-RBAC.md.
 */
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  organizationName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;
}
