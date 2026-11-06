-- An export belongs to a user, and the rules about a user's exports (one idempotency key, a limit of running ones)
-- hold across every location the user works at. The export_jobs policy shows a request one location's exports, so
-- these two checks run as the function's owner. They take no dealer or user argument: they read the request's own
-- settings, so a caller can only ask about itself, and only a yes/no or a number leaves.
CREATE FUNCTION export_key_in_use(p_key text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM export_jobs
      WHERE dealer_id = NULLIF(current_setting('app.dealer_id', true), '')::uuid
        AND owner_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        AND idempotency_key = p_key)
  $$;--> statement-breakpoint
CREATE FUNCTION export_active_count(p_statuses text[]) RETURNS bigint
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT count(*) FROM export_jobs
    WHERE dealer_id = NULLIF(current_setting('app.dealer_id', true), '')::uuid
      AND owner_id = NULLIF(current_setting('app.user_id', true), '')::uuid
      AND status = ANY (p_statuses)
  $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION export_key_in_use(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION export_active_count(text[]) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION export_key_in_use(text) TO dealership_api_user;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION export_active_count(text[]) TO dealership_api_user;
