import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLogDto {
  @ApiProperty()
  @IsString()
  email!: string;

  @ApiProperty({ enum: ['sucesso', 'falha'] })
  @IsEnum(['sucesso', 'falha'])
  resultado!: 'sucesso' | 'falha';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  erro_detalhe?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ip?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  user_agent?: string;
}
