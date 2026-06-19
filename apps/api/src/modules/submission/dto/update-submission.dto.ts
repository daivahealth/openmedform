import { IsNotEmpty, IsObject } from 'class-validator';

export class UpdateSubmissionDto {
  @IsObject()
  @IsNotEmpty()
  data: Record<string, unknown>;
}
