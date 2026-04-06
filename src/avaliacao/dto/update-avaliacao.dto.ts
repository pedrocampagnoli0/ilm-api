import { PartialType } from '@nestjs/swagger';
import { CreateAvaliacaoDto } from './create-avaliacao.dto.js';

export class UpdateAvaliacaoDto extends PartialType(CreateAvaliacaoDto) {}
