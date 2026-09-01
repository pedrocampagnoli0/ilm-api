import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEventoDto {
  @ApiProperty({
    description:
      'Identificador permanente. Liga o evento às vendas já registradas — não pode mudar depois que a turma entra no ar.',
    example: 'goiania-2026-10-03',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug deve ser minúsculo, sem acentos, separado por hífens',
  })
  slug!: string;

  @ApiProperty({ example: 'Goiânia – GO' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  cidade!: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @IsDateString()
  data!: string;

  @ApiProperty({ example: 'Auditório da CDL Goiânia' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  local!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  endereco!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  como_chegar?: string | null;

  @ApiProperty({
    description:
      'Capacidade da turma. Obrigatória desde 24/08/2026: o selo é calculado por ' +
      'percentual de vagas livres (30%), e sem capacidade não há denominador.',
    example: 50,
  })
  @IsInt()
  @Min(1)
  vagas!: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  publicado?: boolean;
}
