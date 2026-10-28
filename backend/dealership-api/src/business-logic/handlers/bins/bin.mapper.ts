import type {BinResponseDto} from '#dto/bins/bin-response.dto';
import type {Bin} from '#persistence/schema/index';

export function toBinResponseDto(bin: Bin): BinResponseDto {
  return {id: bin.id, code: bin.code, description: bin.description};
}
