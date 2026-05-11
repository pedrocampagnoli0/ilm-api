import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReuniaoPessoaInputDto {
  @ApiPropertyOptional({ description: 'Portal user ID if pessoa is a portal user' })
  @IsOptional()
  @IsUUID()
  usuario_id?: string;

  @ApiPropertyOptional({ description: 'Required when usuario_id is not set (external contact)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({ enum: ['coordenacao', 'diretor', 'professor', 'semed', 'outro'], description: 'Required when usuario_id is not set' })
  @IsOptional()
  @IsString()
  perfil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  presente?: boolean;
}

export class RecorrenciaInputDto {
  @ApiProperty({ enum: ['semanal', 'quinzenal', 'mensal', 'mensal-semana'] })
  @IsEnum(['semanal', 'quinzenal', 'mensal', 'mensal-semana'])
  regra!: 'semanal' | 'quinzenal' | 'mensal' | 'mensal-semana';

  @ApiProperty({ description: 'YYYY-MM-DD inclusive' })
  @IsDateString()
  ate!: string;

  @ApiProperty({ description: 'Days of week (0=Sun … 6=Sat)', example: [1, 3] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  dias_semana!: number[];

  @ApiProperty({ description: 'HH:MM (24h)' })
  @Matches(/^[0-2]\d:[0-5]\d$/)
  hora_inicio!: string;

  @ApiPropertyOptional({ description: 'Only for mensal-semana: 1-4 (Nth) or 5 (last)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  semana_do_mes?: 1 | 2 | 3 | 4 | 5;
}

export class CreateReuniaoDto {
  @ApiPropertyOptional({ description: 'Optional only when tipo=generica' })
  @IsOptional()
  @IsUUID()
  municipio_id?: string;

  @ApiProperty({ enum: ['1:1-professor', 'gestao', 'generica'] })
  @IsEnum(['1:1-professor', 'gestao', 'generica'])
  tipo!: '1:1-professor' | 'gestao' | 'generica';

  @ApiPropertyOptional({ description: 'ISO timestamp — required when not recorrente' })
  @IsOptional()
  @IsISO8601()
  inicio?: string;

  @ApiProperty({ description: 'Duration in minutes (multiples of 15, ≥15)' })
  @IsInt()
  @Min(15)
  @Max(720)
  duracao_min!: number;

  @ApiPropertyOptional({ description: 'Free-text title (used by tipo=generica, e.g. "Viagem", "Formação")' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  titulo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  link?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  aconteceu?: boolean;

  @ApiProperty({ type: [ReuniaoPessoaInputDto], description: 'May be empty for tipo=generica' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReuniaoPessoaInputDto)
  pessoas!: ReuniaoPessoaInputDto[];

  @ApiPropertyOptional({ type: RecorrenciaInputDto, description: 'When set, server expands to a series of occurrences' })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecorrenciaInputDto)
  recorrencia?: RecorrenciaInputDto;
}
