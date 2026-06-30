import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { plainToInstance, Transform, Type } from 'class-transformer';

class ConversationMessage {
  @IsString()
  role: string;

  @IsString()
  content: string;
}

function parseJsonString(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

export class RefineFormAgentDto {
  @Transform(({ value }) => parseJsonString(value))
  @IsObject()
  @IsOptional()
  currentSchema?: Record<string, unknown>;

  @IsString()
  @MinLength(3)
  instruction: string;

  @Transform(({ value }) => {
    const parsed = parseJsonString(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => plainToInstance(ConversationMessage, item));
    }
    return parsed;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationMessage)
  @IsOptional()
  conversationHistory?: ConversationMessage[];

  @IsString()
  @IsOptional()
  provider?: string;
}
