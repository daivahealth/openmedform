import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { FormType } from '@prisma/client';

/**
 * Body of `POST /api/conversions` (multipart — `file` itself is consumed by the
 * interceptor and never reaches this class).
 *
 * Every value arrives as text, so booleans are parsed from strings rather than
 * declared as booleans. The global ValidationPipe runs with
 * `forbidNonWhitelisted`, so any field the client sends that is not declared
 * here is a 400 — this class is the contract, not just documentation.
 */
export class StartConversionDto {
  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  /**
   * Same metadata the describe-a-form route collects, so a form created from a
   * file lands in the list as complete as one created from a description.
   * Optional on the wire (the pipeline has no use for it until the form row is
   * written); the web dialog asks for it up front.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsEnum(FormType)
  formType?: FormType;

  /**
   * Opt in to parsing an HTML mock-up's scripts. Multipart carries no JSON
   * types, so this is the literal text: anything that is not an explicit yes
   * leaves scripts untouched.
   */
  @IsOptional()
  @IsString()
  extractScriptConfig?: string;

  /**
   * Accepted and ignored. The engine choice went away with Form.io (see
   * ADR-004) but older clients still put it in the form data, and with
   * `forbidNonWhitelisted` an undeclared field would 400 their upload.
   */
  @IsOptional()
  @IsString()
  engine?: string;
}
