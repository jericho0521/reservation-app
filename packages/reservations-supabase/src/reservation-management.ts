import type { ReservationManagementRepository } from "@reservation-platform/api";

export const RESERVATION_MANAGEMENT_TOKENS_TABLE = "platform_reservation_management_tokens";
export const READ_MANAGED_RESERVATION_RPC = "read_managed_reservation";
export const CANCEL_MANAGED_RESERVATION_RPC = "cancel_managed_reservation";

type QueryResult = { data: unknown; error: unknown | null };
interface ManagementQueryBuilder {
  insert(rows: unknown): ManagementQueryBuilder;
  select(columns?: string): ManagementQueryBuilder;
  single(): Promise<QueryResult>;
}
export interface ReservationManagementSupabaseClient {
  from(table: string): ManagementQueryBuilder;
  rpc(name: string, params?: Record<string, unknown>): Promise<QueryResult>;
}

export function createSupabaseReservationManagementRepository(
  client: ReservationManagementSupabaseClient,
): ReservationManagementRepository {
  return {
    async issue(input) {
      return normalize(await client.from(RESERVATION_MANAGEMENT_TOKENS_TABLE)
        .insert([{
          booking_id: input.bookingId,
          token_hash: input.tokenHash,
          expires_at: input.expiresAt,
        }])
        .select("id")
        .single());
    },
    async read(input) {
      return normalize(await client.rpc(READ_MANAGED_RESERVATION_RPC, {
        p_public_slug: input.publicSlug,
        p_token_hash: input.tokenHash,
      }));
    },
    async cancel(input) {
      return normalize(await client.rpc(CANCEL_MANAGED_RESERVATION_RPC, {
        p_public_slug: input.publicSlug,
        p_token_hash: input.tokenHash,
      }));
    },
  };
}

function normalize(result: QueryResult) {
  return {
    data: result.data,
    ...(result.error ? { error: result.error } : {}),
  };
}
