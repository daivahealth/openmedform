import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSubmissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  patientMrn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  encounterId?: string;
}
