import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ListSessoesQueryDto {
  @ApiProperty()
  @IsUUID()
  avaliacao_id!: string;

  @ApiProperty()
  @IsUUID()
  turma_id!: string;
}
