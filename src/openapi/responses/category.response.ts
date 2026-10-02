import { ApiProperty } from '@nestjs/swagger';

// Espelha categorySelect (src/categories/categories.service.ts).
export class CategoryResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Financeiro' })
  name: string;

  @ApiProperty({ example: true })
  active: boolean;
}

// category dentro de ticketSelect: só id e name.
export class CategorySummaryResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Financeiro' })
  name: string;
}
