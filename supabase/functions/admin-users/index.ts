import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AdminPayload = {
  action: "create" | "reset-password";
  email: string;
  password?: string;
  name?: string;
  role?: "admin" | "leader" | "cs";
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:5173";

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Missing Supabase Edge Function environment variables.");
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header.");
    }

    // 1. Authenticate the caller using their own JWT to preserve RLS context
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: callerData, error: callerError } = await userClient.auth.getUser();
    if (callerError || !callerData.user) {
      throw new Error(`Invalid session: ${callerError?.message || 'Token verification failed'}`);
    }

    // 2. Fetch the profile using the user's client
    const { data: callerProfile, error: profileError } = await userClient
      .from("profiles")
      .select("role, active")
      .eq("id", callerData.user.id)
      .single();

    // If the database fails, tell us EXACTLY why instead of hiding it
    if (profileError) {
      throw new Error(`Database Error (Profile Fetch): ${profileError.message}`);
    }

    // Now we can safely check the admin status
    if (callerProfile?.role !== "admin" || !callerProfile.active) {
      throw new Error(`Unauthorized: Caller role is '${callerProfile?.role}', active state is ${callerProfile?.active}.`);
    }

    // 3. Create the admin client ONLY for elevated Auth API operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      }
    });

    const payload = (await request.json()) as AdminPayload;
    const email = payload.email?.trim().toLowerCase();

    if (!email) {
      throw new Error("Email is required.");
    }

    if (payload.action === "create") {
      if (!payload.password || !payload.name || !payload.role) {
        throw new Error("Name, role, and temporary password are required.");
      }

      const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: payload.password,
        email_confirm: true,
        user_metadata: {
          name: payload.name,
          role: payload.role,
        },
      });

      if (createError || !createdUser.user) {
        throw createError ?? new Error("User was not created.");
      }

      const { error: profileInsertError } = await adminClient.from("profiles").insert({
        id: createdUser.user.id,
        email,
        name: payload.name.trim(),
        role: payload.role,
        active: true,
      });

      if (profileInsertError) {
        // Rollback the auth user creation if profile insert fails
        await adminClient.auth.admin.deleteUser(createdUser.user.id);
        throw new Error(`Database Error (Profile Insert): ${profileInsertError.message}`);
      }

      return json({ ok: true, userId: createdUser.user.id });
    }

    if (payload.action === "reset-password") {
      const { error: resetError } = await adminClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl}/reset-password`,
      });

      if (resetError) {
        throw new Error(`Reset password error: ${resetError.message}`);
      }

      return json({ ok: true });
    }

    throw new Error("Unsupported admin action.");
  } catch (error) {
    // Send the real, un-swallowed error message back to the frontend alert
    return json({ error: error instanceof Error ? error.message : "Unexpected error." }, 400);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}