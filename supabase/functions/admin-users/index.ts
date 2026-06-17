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
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:5173";

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase Edge Function environment variables.");
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header.");
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData.user) {
      throw new Error("Invalid session.");
    }

    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, active")
      .eq("id", callerData.user.id)
      .single();

    if (profileError || callerProfile?.role !== "admin" || !callerProfile.active) {
      throw new Error("Only active admins can manage user accounts.");
    }

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
        throw profileInsertError;
      }

      return json({ ok: true, userId: createdUser.user.id });
    }

    if (payload.action === "reset-password") {
      const { error: resetError } = await adminClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl}/reset-password`,
      });

      if (resetError) {
        throw resetError;
      }

      return json({ ok: true });
    }

    throw new Error("Unsupported admin action.");
  } catch (error) {
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
