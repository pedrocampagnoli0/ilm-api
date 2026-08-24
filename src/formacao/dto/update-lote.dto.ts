import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * `evento_id` não entra: mover um lote de evento reescreveria o vínculo das vendas.
 *
 * `preco_centavos` e `ate` ficam congelados dentro do checkout no PagBank — não há
 * endpoint de edição de checkout. Editá-los num lote que já tem `checkout_id` exige
 * inativar o link e criar outro; ver LoteService.update.
 */
export class UpdateLoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  ordem?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  preco_centavos?: number;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  ate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  vagas_por_compra?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  visivel_no_site?: boolean;

  @ApiPropertyOptional({ description: 'Link legado. Ver CreateLoteDto.' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  checkout_url?: string | null;
}
