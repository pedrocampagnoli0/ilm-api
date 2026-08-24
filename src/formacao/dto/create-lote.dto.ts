import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLoteDto {
  @ApiProperty()
  @IsUUID()
  evento_id!: string;

  @ApiProperty({ description: 'Posição do lote dentro do evento (1, 2, 3...)' })
  @IsInt()
  @Min(1)
  ordem!: number;

  @ApiProperty({ example: '1º lote' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nome!: string;

  @ApiProperty({
    description:
      'Preço em centavos. No pacote em grupo é o valor TOTAL do pacote, não o unitário.',
    example: 10000,
  })
  @IsInt()
  @Min(1)
  preco_centavos!: number;

  @ApiProperty({ description: 'YYYY-MM-DD — vira expiration_date no checkout' })
  @IsDateString()
  ate!: string;

  @ApiPropertyOptional({
    default: 1,
    description:
      'Quantas vagas uma compra deste lote ocupa. >1 é o pacote institucional.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  vagas_por_compra?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Pacote institucional normalmente é negociado — deixe false.',
  })
  @IsOptional()
  @IsBoolean()
  visivel_no_site?: boolean;

  @ApiPropertyOptional({
    description:
      'Link legado criado à mão no painel do PagBank. Vende, mas não conta vaga. Lotes novos devem ter o checkout criado pela API (fase 4).',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  checkout_url?: string | null;
}
