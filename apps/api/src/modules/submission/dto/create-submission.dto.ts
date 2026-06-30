import {
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
}
