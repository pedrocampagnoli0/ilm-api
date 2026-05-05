import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListContatosPrincipaisQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  municipio_id?: string;
}
