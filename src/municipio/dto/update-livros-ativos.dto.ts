import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateLivrosAtivosDto {
  @ApiProperty({ type: [String], description: 'IDs of livros to activate for this municipio' })
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  livro_ids!: string[];
}
