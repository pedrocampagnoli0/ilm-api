import { PartialType } from '@nestjs/swagger';
import { CreateTurmaDto } from './create-turma.dto.js';

export class UpdateTurmaDto extends PartialType(CreateTurmaDto) {}
