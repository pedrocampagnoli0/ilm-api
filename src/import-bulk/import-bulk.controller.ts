import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import { ImportBulkService } from './import-bulk.service.js';
import { ListBatchesQueryDto } from './dto/list-batches-query.dto.js';

@ApiTags('Import Bulk')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('import-batches')
export class ImportBulkController {
  constructor(private readonly importBulkService: ImportBulkService) {}

  @Get()
  @ApiOperation({ summary: 'Listar batches de importação' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListBatchesQueryDto,
  ) {
    return this.importBulkService.findAll(user, query);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Logs de um batch de importação' })
  findLogs(@Param('id', ParseUUIDPipe) id: string) {
    return this.importBulkService.findOneLogs(id);
  }

  @Post('execute')
  @ApiOperation({ summary: 'Executar importação em lote' })
  execute(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { municipio_id: string; rows: Record<string, unknown>[] },
  ) {
    return this.importBulkService.execute(user, body);
  }

  @Post('undo/:id')
  @ApiOperation({ summary: 'Desfazer importação' })
  undo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.importBulkService.undo(user, id);
  }
}
