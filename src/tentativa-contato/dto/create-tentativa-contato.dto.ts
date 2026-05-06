import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTentativaContatoDto {
  @ApiProperty()
  @IsUUID()
  municipio_id!: string;

  @ApiPropertyOptional({ description: 'Portal user ID; null for external contact' })
  @IsOptional()
  @IsUUID()
  usuario_id?: string;

  @ApiPropertyOptional({ description: 'Required when usuario_id is not set' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  pessoa_nome?: string;

  @ApiPropertyOptional({
    enum: ['professor', 'coordenacao', 'diretor', 'semed', 'outro'],
    description: 'Required when usuario_id is not set',
  })
  @IsOptional()
  @IsString()
  pessoa_perfil?: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @IsDateString()
  data!: string;

  @ApiProperty({ enum: ['whatsapp', 'email', 'telefone', 'meet'] })
  @IsEnum(['whatsapp', 'email', 'telefone', 'meet'])
  canal!: 'whatsapp' | 'email' | 'telefone' | 'meet';

  @ApiProperty({ enum: ['falou', 'sem_resposta', 'remarcou', 'cancelou'] })
  @IsEnum(['falou', 'sem_resposta', 'remarcou', 'cancelou'])
  resultado!: 'falou' | 'sem_resposta' | 'remarcou' | 'cancelou';

  @ApiPropertyOptional({ description: 'Free-form note (≤500 chars)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}
