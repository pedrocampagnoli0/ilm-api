import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/**
 * `slug` não entra de propósito: ele é o que liga o evento às vendas já registradas.
 * Trocá-lo silenciosamente órfã o histórico.
 */
export class UpdateEventoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  cidade?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  data?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  local?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  endereco?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  como_chegar?: string | null;

  @ApiPropertyOptional({ description: 'HH:MM (24h). Padrão 08:00.', example: '08:00' })
  @IsOptional()
  @Matches(HORA, { message: 'hora_inicio deve estar no formato HH:MM' })
  hora_inicio?: string;

  @ApiPropertyOptional({ description: 'HH:MM (24h). Padrão 17:00.', example: '17:00' })
  @IsOptional()
  @Matches(HORA, { message: 'hora_fim deve estar no formato HH:MM' })
  hora_fim?: string;

  @ApiPropertyOptional({
    description:
      'Capacidade da turma. Não bloqueia pagamento em curso — ver overbooking. ' +
      'Não aceita null: desde 24/08/2026 a capacidade é obrigatória, porque o selo ' +
      'é calculado por percentual de vagas livres.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  vagas?: number;

}
