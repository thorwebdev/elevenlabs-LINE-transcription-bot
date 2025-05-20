# Build a Serverless LINE Transcription Bot with Cloudflare Workers and ElevenLabs Scribe (Hono + TypeScript)

In this guide, you'll build a serverless LINE bot that transcribes **audio**, **video files**, and **voice messages** using **ElevenLabs Scribe**, deployed on **Cloudflare Workers** with **TypeScript** and the **Hono** web framework.

## What You Will Build

A LINE bot that:

- Accepts audio, video, or voice messages
- Sends them to ElevenLabs Scribe for transcription
- Replies with the transcribed text

## Prerequisites

- A **LINE Messaging API channel**
- An **ElevenLabs API key** with Scribe access
- **Node.js**, **npm**, and **Wrangler CLI** installed
- A **Cloudflare account**

---

## 1. Set Up Your LINE Channel

Follow the [official LINE setup guide](https://developers.line.biz/console/) to create your channel.
Note your **Channel Secret** and **Channel Access Token**.

---

## 2. Initialize Your Worker

```bash
npm install -g wrangler
wrangler init line-transcriber --type=webpack
cd line-transcriber
```

During setup, choose **TypeScript** when prompted.

---

## 3. Install Dependencies

Install the Hono framework and types:

```bash
npm install hono
npm install --save-dev @cloudflare/workers-types @line/bot-sdk
```

Update your `tsconfig.json`:

```json
"types": ["@cloudflare/workers-types"]
```

---

## 4. Implement the Transcription Bot with Hono

Replace `src/index.ts` with:

```ts
import { Hono } from "hono";

const app = new Hono();

app.post("/webhook", async (c) => {
  const env = c.env as Env;
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

  await Promise.all(events.map((event: any) => handleEvent(event, env)));
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
  const message = event.message;
  const replyToken = event.replyToken;

  if (!message || !["audio", "video"].includes(message.type)) {
    return replyText(
      env.LINE_CHANNEL_ACCESS_TOKEN,
      replyToken,
      "Please send an audio or video message."
    );
  }

  const contentUrl = `https://api-data.line.me/v2/bot/message/${message.id}/content`;
  const mediaResponse = await fetch(contentUrl, {
    headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
  });
  const mediaBlob = await mediaResponse.arrayBuffer();

  const scribeResponse = await fetch(
    "https://api.elevenlabs.io/v1/speech-to-text",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.ELEVENLABS_API_KEY}`,
        "Content-Type": "application/octet-stream",
      },
      body: mediaBlob,
    }
  );

  if (!scribeResponse.ok) {
    const error = await scribeResponse.text();
    return replyText(
      env.LINE_CHANNEL_ACCESS_TOKEN,
      replyToken,
      `Transcription failed: ${error}`
    );
  }

  const result = await scribeResponse.json();
  const transcription =
    result.transcription || "Could not transcribe the message.";
  return replyText(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, transcription);
}

async function replyText(
  token: string,
  replyToken: string,
  text: string
): Promise<Response> {
  const payload = JSON.stringify({
    replyToken,
    messages: [{ type: "text", text }],
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

type Env = {
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  ELEVENLABS_API_KEY: string;
};
```

---

## 5. Configure Environment Variables

Update `wrangler.toml`:

```toml
name = "line-transcriber"
main = "src/index.ts"
compatibility_date = "2025-05-15"

[vars]
LINE_CHANNEL_SECRET = "<your-line-channel-secret>"
LINE_CHANNEL_ACCESS_TOKEN = "<your-line-channel-access-token>"
ELEVENLABS_API_KEY = "<your-elevenlabs-api-key>"
```

---

## 6. Deploy Your Worker

```bash
wrangler publish
```

---

## 7. Register Your Webhook in LINE Console

- Go to **Messaging API** settings in the LINE Developers Console.
- Set the **Webhook URL** to:

  ```
  https://your-worker-name.your-subdomain.workers.dev/webhook
  ```

- Enable the **Webhook**.

---

## 8. Test Your Bot

1. Add your bot as a friend.
2. Send an **audio message**, **voice message**, or **video message**.
3. The bot will reply with the **transcribed text**.

---

## Recap

You have successfully built a **serverless transcription bot for LINE**, capable of:

- Accepting audio, voice, and video messages
- Transcribing them using **ElevenLabs Scribe**
- Responding with the **transcribed text**

---

## Next Steps

- **Handle More Media Types**
  Expand to support other file types or text messages.

- **Integrate with Other APIs**
  Use ElevenLabs voice synthesis to read back the transcription.

- **Deploy to Custom Domains**
  Configure Cloudflare DNS and Workers for branded URLs.

- **Secure Production Deployment**
  Validate media file sizes and add error handling.
