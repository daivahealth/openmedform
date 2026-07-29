import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

/**
 * Operator console endpoints. Restricted to SUPER_ADMIN by the global
 * RolesGuard via @Roles; a tenant admin or lower receives 403.
 */
@Controller('admin')
@Roles('SUPER_ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  getStats() {
    return this.admin.getStats();
  }
}
