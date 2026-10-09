import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RadarAssessoraDto {
  @ApiProperty({ type: [String], description: 'IDs dos municípios (máx. 500)' })
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  municipio_ids!: string[];
}
