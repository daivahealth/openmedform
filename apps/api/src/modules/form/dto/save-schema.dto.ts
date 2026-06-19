import { IsNotEmpty, IsObject } from 'class-validator';

export class SaveSchemaDto {
  @IsObject()
  @IsNotEmpty()
  schema: Record<string, unknown>;
}
