import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ExchangeCodeDto {
  /**
   * The one-time code from the SSO redirect. 32 random bytes as base64url, so
   * the cap is generous but bounded — an unauthenticated endpoint should not
   * accept an arbitrarily large string.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  code: string;
}
