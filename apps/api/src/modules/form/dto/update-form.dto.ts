import { IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { FormType } from '@prisma/client';

export class UpdateFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(FormType)
  formType?: FormType;
}
