import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAssessoraMetaDto {
  @ApiProperty() @IsInt() @Min(1) meta_semanal!: number;
  @ApiProperty() @IsInt() @Min(1) limite_verde!: number;
  @ApiProperty() @IsInt() @Min(1) limite_amarelo!: number;
}
