import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Chave fechada porque o valor existe para ser contado. Espelha o CHECK do banco. */
export const ORIGENS_GRATUIDADE = [
  'voucher',
  'multiplicadora',
  'parceria',
  'equipe',
  'outro',
] as const;

export type OrigemGratuidade = (typeof ORIGENS_GRATUIDADE)[number];

/**
 * Inscrição de cortesia: quem entra sem passar pelo checkout.
 *
 * Voucher, multiplicadora vinda de outra formação, convite de parceria, palestrante.
 * Ocupa vaga como qualquer inscrição — o que muda é que o valor é zero e existe um
 * motivo declarado para não ter havido pagamento.
 */
export class CreateInscricaoDto {
  @ApiProperty({ example: 'Maria da Silva' })
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nome!: string;

  @ApiProperty({ example: 'maria@escola.com.br' })
  @IsEmail({}, { message: 'E-mail inválido.' })
  @MaxLength(200)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiPropertyOptional({
    description:
      'Celular com DDD. Guardado como veio; a formatação é responsabilidade da tela.',
    example: '(62) 99999-8888',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : null,
  )
  celular?: string | null;

  @ApiProperty({
    enum: ORIGENS_GRATUIDADE,
    description: 'Por que a pessoa não pagou.',
  })
  @IsIn(ORIGENS_GRATUIDADE, {
    message: `A origem da gratuidade deve ser uma de: ${ORIGENS_GRATUIDADE.join(', ')}.`,
  })
  gratuidade_origem!: OrigemGratuidade;

  @ApiPropertyOptional({
    description:
      'Detalhe livre do caso — "voucher da CDL Goiânia", "multiplicadora turma 2025". Obrigatório quando a origem é "outro".',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : null,
  )
  observacao?: string | null;

  @ApiPropertyOptional({
    description:
      'Lote a que a cortesia se refere, quando faz sentido registrar. Opcional: cortesia normalmente não sai de nenhum lote.',
  })
  @IsOptional()
  @IsUUID()
  lote_id?: string | null;

  @ApiPropertyOptional({
    default: 1,
    description: 'Quantas vagas esta inscrição ocupa. >1 para cortesia institucional.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  vagas?: number;
}
