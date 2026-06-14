import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env["GROQ_API_KEY"] });

const conversationHistory: Map<string, Groq.Chat.ChatCompletionMessageParam[]> = new Map();

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

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 300,
      messages: history,
    });

    const reply = response.choices[0]?.message?.content ?? "Sorry, I couldn't get a response. Try again!";
    history.push({ role: "assistant", content: reply });

    return reply;
  } catch (err) {
    console.error("Groq error:", err);
    return "Sorry, something went wrong. Try again!";
  }
}
