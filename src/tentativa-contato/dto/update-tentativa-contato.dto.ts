import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTentativaContatoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  usuario_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  pessoa_nome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pessoa_perfil?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  data?: string;

  @ApiPropertyOptional({ enum: ['whatsapp', 'email', 'telefone', 'meet'] })
  @IsOptional()
  @IsEnum(['whatsapp', 'email', 'telefone', 'meet'])
  canal?: 'whatsapp' | 'email' | 'telefone' | 'meet';

  @ApiPropertyOptional({ enum: ['falou', 'sem_resposta', 'remarcou', 'cancelou'] })
  @IsOptional()
  @IsEnum(['falou', 'sem_resposta', 'remarcou', 'cancelou'])
  resultado?: 'falou' | 'sem_resposta' | 'remarcou' | 'cancelou';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}
