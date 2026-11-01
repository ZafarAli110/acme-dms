export interface UserContextResponseDto {
  userId: string;
  dealerId: string;
  locationId: string | null;
  permissions: readonly string[];
}
