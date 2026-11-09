import type { ListTotalDto } from "#dto/paging/list-total.dto";

/** How many customers a search and filter match: exact, about, or many (ACME-129). */
export type CustomerCountResponseDto = ListTotalDto;
