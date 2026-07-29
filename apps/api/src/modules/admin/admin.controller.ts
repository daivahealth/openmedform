import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
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

  /**
   * Raise (or reset, with null) a user's form creation quota. Quotas are
   * enforced in FormService on every creation path.
   */
  @Patch('users/:userId/form-limit')
  updateFormLimit(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: { formLimit: number | null },
  ) {
    const limit = body?.formLimit ?? null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 10000)) {
      throw new BadRequestException(
        'formLimit must be an integer between 1 and 10000, or null to reset to the default.',
      );
    }
    return this.admin.updateUserFormLimit(userId, limit);
  }
}
