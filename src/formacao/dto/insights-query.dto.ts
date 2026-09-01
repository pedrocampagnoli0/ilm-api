import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class InsightsQueryDto {
  @ApiPropertyOptional({
    default: true,
    description:
      'Inclui as inscrições de cortesia nos números de venda. Desligado, o ticket médio passa a medir só o que foi pago e a faixa de R$ 0,00 some do painel de preços. A ocupação das turmas (vendidas/restantes) conta as cortesias nos dois modos: são cadeiras ocupadas.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  incluir_cortesias?: boolean;
}
