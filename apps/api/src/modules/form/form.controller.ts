import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { FormService } from './form.service';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { SaveSchemaDto } from './dto/save-schema.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/jwt-payload.interface';

@Controller('forms')
export class FormController {
  constructor(private readonly formService: FormService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateFormDto) {
    return this.formService.create(user.tenantId, user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.formService.findAll(user.tenantId);
  }

  @Get('slug/:slug')
  findBySlug(
    @CurrentUser() user: RequestUser,
    @Param('slug') slug: string,
  ) {
    return this.formService.findBySlug(user.tenantId, slug);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formService.findOne(user.tenantId, id);
  }

  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFormDto,
  ) {
    return this.formService.update(user.tenantId, id, dto);
  }

  @Put(':id/schema')
  saveSchema(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveSchemaDto,
  ) {
    return this.formService.saveSchema(user.tenantId, id, dto.schema);
  }

  @Post(':id/publish')
  publish(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formService.publish(user.tenantId, id);
  }

  @Post(':id/clone')
  clone(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formService.clone(user.tenantId, user.userId, id);
  }

  @Delete(':id')
  archive(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formService.archive(user.tenantId, id);
  }
}
