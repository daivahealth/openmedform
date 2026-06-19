import { IsString, IsOptional, MinLength } from 'class-validator';

export class GenerateFormDto {
  @IsString()
  @MinLength(5)
  prompt: string;

  @IsString()
  @IsOptional()
  provider?: string;

  @IsString()
  @IsOptional()
  category?: string;
}
