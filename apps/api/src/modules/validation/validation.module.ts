import { Global, Module } from '@nestjs/common';
import { SchemaValidationService } from './schema-validation.service';

/**
 * Global module exposing server-side JSON Schema validation to any feature
 * module (form publish checks, submission validation).
 */
@Global()
@Module({
  providers: [SchemaValidationService],
  exports: [SchemaValidationService],
})
export class ValidationModule {}
