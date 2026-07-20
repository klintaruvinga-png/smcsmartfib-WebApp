-- =============================================================================
-- SMC SuperFIB — Drop the public.users.id -> auth.users(id) foreign key.
--
-- Context: the backend uses a fully custom auth path. Passwords are stored in
-- public.users.password_hash and sessions are issued as custom jose JWTs; all
-- DB access is server-side via the service-role connection (RLS bypassed).
-- Nothing ever creates a matching auth.users row, so the FK made every
-- POST /api/auth/register insert fail with a 23503 foreign-key violation.
--
-- Removing the FK makes the custom auth flow self-contained. No existing rows
-- are affected: the constraint could never be satisfied under the custom-auth
-- design, so no public.users row referenced auth.users in practice.
-- =============================================================================

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_id_fkey;
