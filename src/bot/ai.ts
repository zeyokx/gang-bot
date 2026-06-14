import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });

const SYSTEM_PROMPT = `You are a Discord bot that talks exclusively like a street gang member. 
Rules:
- Always respond in gang/street slang (no cap, fr fr, on god, sheesh, fam, gang, deadass, bussin, etc.)
- Keep responses SHORT — 1-3 sentences max
- Be hype, expressive, and use emojis occasionally (💯 🔫 😤 💀 🙏)
- React to what the user actually said — don't ignore their message
- Never break character, never talk formally
- If someone asks a question, answer it but in gang talk
- Don't be offensive or use slurs — keep it fun and hype`;

const conversationHistory: Map<string, OpenAI.Chat.ChatCompletionMessageParam[]> = new Map();

export async function getGangAIReply(userId: string, message: string): Promise<string> {
  try {
    if (!conversationHistory.has(userId)) {
      conversationHistory.set(userId, []);
    }

    const history = conversationHistory.get(userId)!;

    history.push({ role: "user", content: message });

    if (history.length > 20) {
      history.splice(0, 2);
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 150,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
      ],
    });

    const reply = response.choices[0]?.message?.content ?? makeGangFallback();

    history.push({ role: "assistant", content: reply });

    return reply;
  } catch (err) {
    console.error("OpenAI error:", err);
    return makeGangFallback();
  }
}

function makeGangFallback(): string {
  const fallbacks = [
    "aye fam my brain glitched fr fr 💀 try again no cap",
    "sheesh something went wrong on my end gang 😤 hit me again",
    "bruh I lagged out, on god try that again 💯",
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)]!;
}
