import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/** Global audit logging, available to every feature module. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
