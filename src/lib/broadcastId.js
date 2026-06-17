const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createBroadcastId() {
  let code = "";

  for (let index = 0; index < 6; index += 1) {
    const randomIndex = crypto.getRandomValues(new Uint32Array(1))[0] % ALPHABET.length;
    code += ALPHABET[randomIndex];
  }

  return `ICB-${code}`;
}

export async function createUniqueBroadcastId(supabase) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const broadcastId = createBroadcastId();
    const { data, error } = await supabase
      .from("announcements")
      .select("id")
      .eq("broadcast_id", broadcastId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return broadcastId;
    }
  }

  throw new Error("Could not generate a unique broadcast ID. Please try again.");
}
