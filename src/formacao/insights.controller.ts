import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import { InsightsService } from './insights.service.js';

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
      'Tudo calculado sobre formacao_venda, sempre filtrando ambiente = producao. Nada é consultado no PagBank em tempo de tela.',
  })
  gerar(@CurrentUser() user: AuthenticatedUser) {
    return this.insights.gerar(user);
  }
}
