import {
  IsString,
  IsOptional,
  IsObject,
  IsArray,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ConversationMessage {
  @IsString()
  role: string;

  @IsString()
  content: string;
}

export class RefineFormDto {
  @IsObject()
  currentSchema: Record<string, unknown>;

  @IsString()
  @MinLength(3)
  instruction: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationMessage)
  @IsOptional()
  conversationHistory?: ConversationMessage[];

  @IsString()
  @IsOptional()
  provider?: string;
}
