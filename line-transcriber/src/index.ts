import { Hono } from "hono";
import { ElevenLabsClient } from "elevenlabs";

const app = new Hono();

app.post("/webhook", async (c) => {
  const env = c.env as Cloudflare.Env;
  const bodyText = await c.req.text();
  const signature = c.req.header("x-line-signature") || "";

  const valid = await validateSignature(
    env.LINE_CHANNEL_SECRET,
    bodyText,
    signature
  );
  if (!valid) {
    return c.text("Invalid signature", 401);
  }

  const body = JSON.parse(bodyText);
  const events = body.events || [];

  const responses = await Promise.all(
    events.map((event: any) => handleEvent(event, env))
  );
  console.log({ responses });
  return c.text("OK");
});

async function validateSignature(
  secret: string,
  body: string,
  signature: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const bodyData = encoder.encode(body);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, bodyData);
  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return expectedSignature === signature;
}

async function handleEvent(event: any, env: Env): Promise<Response | void> {
  console.log({ event });
  const message = event.message;
  const replyToken = event.replyToken;

  if (!message || !["audio", "video"].includes(message.type)) {
    return replyText(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [
      "Please send an audio or video message.",
    ]);
  }

  // Start loading animation
  await fetch("https://api.line.me/v2/bot/chat/loading/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      chatId: event.source.userId,
    }),
  });

  const contentUrl = `https://api-data.line.me/v2/bot/message/${message.id}/content`;
  const mediaResponse = await fetch(contentUrl, {
    headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
  });
  const mediaBlob = await mediaResponse.arrayBuffer();

  const client = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
  const result = await client.speechToText.convert({
    file: mediaBlob,
    model_id: "scribe_v1", // 'scribe_v1_experimental' is also available for new, experimental features
    tag_audio_events: false,
  });

  const transcription = result.text || "Could not transcribe the message.";
  const languageCode = result.language_code;
  return replyText(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, [
    `[${languageCode}]: ${transcription}`,
  ]);
}

async function replyText(
  token: string,
  replyToken: string,
  messages: string[]
): Promise<Response> {
  const payload = JSON.stringify({
    replyToken,
    messages: messages.map((text) => ({ type: "text", text })),
  });

  return fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: payload,
  });
}

export default app;
