import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListEventosQueryDto {
  @ApiPropertyOptional({
    description: 'Filtra por publicado. Ausente = todos.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  publicado?: boolean;

  @ApiPropertyOptional({
    enum: ['futuros', 'passados', 'todos'],
    default: 'todos',
    description: 'Recorte por data do evento.',
  })
  @IsOptional()
  @IsIn(['futuros', 'passados', 'todos'])
  quando?: 'futuros' | 'passados' | 'todos';
}
