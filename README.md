# IC Broadcast Center

Minimal React + Supabase system for managing internal broadcast announcements.

## Features

- Role-based access for Admin, Leader, and CS.
- Admin can create accounts and send password reset emails through a Supabase Edge Function.
- Admin and Leader can manage CS names and Skypebot groups.
- Admin and Leader can draft, edit, and publish broadcasts.
- Published broadcasts receive random IDs like `ICB-GK9TWE`.
- CS can copy generated Skypebot HTML and BO8.2 plain text.
- CS marks a broadcast completed globally by selecting a CS name.
- Admin and Leader can review completed broadcasts.
- Search by Broadcast ID.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_APP_URL=http://localhost:5173
```

3. Run the SQL in `supabase/schema.sql` inside your Supabase SQL editor.

4. Create the first admin manually in Supabase Auth. Then insert their profile using `supabase/first-admin.sql`.

   Important: Supabase Auth users and app profiles are separate. The app cannot load a user until `public.profiles` has a row with the same UUID as the Auth user.

5. Deploy the Edge Function:

```bash
supabase functions deploy admin-users
supabase secrets set APP_URL=http://localhost:5173
```

6. Start the app:

```bash
npm run dev
```

## Supabase notes

The Edge Function uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which Supabase provides to functions. `APP_URL` controls the password reset redirect.

The frontend never receives the service role key.
