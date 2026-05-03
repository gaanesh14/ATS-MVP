-- ============================================
-- Seed: a confirmed Super Admin user (manual bootstrap)
-- Run this in Supabase SQL Editor.
-- Safe to re-run — updates the password if the user already exists.
-- ============================================
--
-- Why this exists:
--   Without a confirmed user in auth.users, the /login page can't actually
--   sign anyone in. This script creates one with email_confirmed_at already
--   set, so you can log in immediately — no inbox needed.
--
-- Pre-requisite migrations:
--   1. docs/schema-migration-team-members.sql  (creates team_members)
--   2. docs/schema-migration-auth-link.sql     (adds auth_user_id column)
--
-- Edit the v_email / v_password / v_name lines below before running.

do $$
declare
  v_email    text := 'admin@photonx.com';     -- ←← edit me
  v_password text := 'PhotonX@2026';          -- ←← edit me (min 8 chars)
  v_name     text := 'Photon Admin';          -- ←← edit me
  v_user_id  uuid;
begin
  -- 1) Look up an existing auth user with this email; reuse if found.
  select id into v_user_id from auth.users where email = v_email;

  if v_user_id is null then
    -- Create a brand-new auth user.
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token,
      email_change_token_new, email_change
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),                                    -- email_confirmed_at
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', v_name),
      now(), now(),
      '', '', '', ''
    );

    -- The "identity" row is what password sign-in actually authenticates
    -- against. Skipping this leaves the user technically present but unable
    -- to sign in.
    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    values (
      v_user_id::text,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email',
      now(), now(), now()
    );
  else
    -- User already exists — just reset password + confirm email.
    update auth.users
       set encrypted_password = crypt(v_password, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at         = now()
     where id = v_user_id;
  end if;

  -- 2) Promote / upsert in team_members.
  insert into public.team_members
        (auth_user_id, email, name, role, status, title, joined_at)
  values (v_user_id, v_email, v_name, 'super_admin', 'active', 'Founder', now())
  on conflict (email) do update
     set auth_user_id = excluded.auth_user_id,
         role         = 'super_admin',
         status       = 'active',
         name         = coalesce(team_members.name, excluded.name),
         joined_at    = coalesce(team_members.joined_at, now());

  raise notice 'Super admin ready — email=% id=%', v_email, v_user_id;
end $$;
