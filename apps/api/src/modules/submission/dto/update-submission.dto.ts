import { IsDateString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

export class UpdateSubmissionDto {
  @IsObject()
  @IsNotEmpty()
  data: Record<string, unknown>;

  /** Clinical time of the response (ISO-8601); see CreateSubmissionDto.effectiveAt. */
  @IsOptional()
  @IsDateString()
  effectiveAt?: string;
}
