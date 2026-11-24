import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegistrarAcessoPaginaDto {
  @ApiProperty({
    example: '/docente/turma/:id',
    description: 'Rota normalizada (IDs trocados por :id)',
  })
  @IsString()
  @MaxLength(200)
  @Matches(/^\/[\w\-/:]*$/)
  pagina!: string;
}

export class ResumoAcessoPaginaQueryDto {
  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @IsDateString()
  date_to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  municipio_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([
    'professor',
    'coordenacao',
    'diretor',
    'secretaria',
    'administrador',
    'ilm',
    'visitante',
  ])
  perfil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  pagina?: string;
}
