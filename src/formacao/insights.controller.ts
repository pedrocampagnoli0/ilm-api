import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import { InsightsService } from './insights.service.js';
import { InsightsQueryDto } from './dto/insights-query.dto.js';

@ApiTags('Formações — insights (admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/formacoes')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('insights')
  @ApiOperation({
    summary: 'Números de venda das formações: ritmo, projeção, meios de pagamento e alertas',
    description:
      'Tudo calculado sobre formacao_venda, sempre filtrando ambiente = producao. Nada é consultado no PagBank em tempo de tela. `incluir_cortesias=false` recorta as inscrições gratuitas dos números de venda; a ocupação das turmas conta as cortesias nos dois modos.',
  })
  gerar(@CurrentUser() user: AuthenticatedUser, @Query() query: InsightsQueryDto) {
    return this.insights.gerar(user, query);
  }
}
