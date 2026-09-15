import {
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class PatientContextDto {
  patientName?: string;
  patientMrn?: string;
  age?: string;
  gender?: string;
  encounterId?: string;
  encounterType?: string;
  department?: string;
  consultantName?: string;
  admissionDate?: string;
}

export class CreateSubmissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  patientMrn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  encounterId?: string;

  @IsOptional()
  @IsObject()
  patientContext?: PatientContextDto;

  /**
   * When the readings were TAKEN (ISO-8601), if the client knows — a nurse
   * back-charting the 14:00 round at 14:20. Defaults at completion to a field
   * flagged `omf.effectiveAt` in the form, else the row's creation time.
   */
  @IsOptional()
  @IsDateString()
  effectiveAt?: string;
}
