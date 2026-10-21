// Geeft het beheer een eenmalige upload-URL voor een foto of video in de bucket menu-media,
// maar alleen met een geldige beheersessie (zie menu_login / menu_session_ok).
// De browser uploadt daarna zelf rechtstreeks naar die URL, ook grote video's.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Alleen POST" });

  let body: { token?: unknown; ext?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Ongeldige aanvraag" });
  }
  const ext = String(body.ext ?? "").toLowerCase();
  if (!TYPES[ext]) return json(400, { error: "Dit bestandstype is niet toegestaan" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: ok, error } = await supabase.rpc("menu_session_ok", { p_token: String(body.token ?? "") });
  if (error) return json(500, { error: "Controle van de sessie mislukt" });
  if (!ok) return json(401, { error: "Niet ingelogd" });

  const path = crypto.randomUUID().replaceAll("-", "") + ext;
  const bucket = supabase.storage.from("menu-media");
  const { data, error: signError } = await bucket.createSignedUploadUrl(path);
  if (signError || !data) return json(500, { error: "Upload voorbereiden mislukt" });

  return json(200, {
    uploadUrl: data.signedUrl,
    contentType: TYPES[ext],
    publicUrl: bucket.getPublicUrl(path).data.publicUrl,
  });
});
