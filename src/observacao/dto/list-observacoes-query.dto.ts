import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListObservacoesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  municipio_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  usuario_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pessoa_perfil?: string;
}
