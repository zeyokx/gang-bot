import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });

const conversationHistory: Map<string, OpenAI.Chat.ChatCompletionMessageParam[]> = new Map();

export async function getAIReply(userId: string, message: string): Promise<string> {
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
      max_tokens: 300,
      messages: history,
    });

    const reply = response.choices[0]?.message?.content ?? "Sorry, I couldn't get a response. Try again!";
    history.push({ role: "assistant", content: reply });

    return reply;
  } catch (err) {
    console.error("OpenAI error:", err);
    return "Sorry, something went wrong. Try again!";
  }
}
