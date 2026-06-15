const conversationHistory: Map<string, { role: string; content: string }[]> = new Map();

export async function getAIReply(userId: string, message: string): Promise<string> {
  try {
    const apiKey = process.env["GROQ_API_KEY"];
    if (!apiKey) {
      console.error("GROQ_API_KEY is not set!");
      return "Sorry, the AI key isn't configured. Ask the bot owner to fix it!";
    }

    if (!conversationHistory.has(userId)) {
      conversationHistory.set(userId, []);
    }

    const history = conversationHistory.get(userId)!;
    history.push({ role: "user", content: message });

    if (history.length > 20) {
      history.splice(0, 2);
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 300,
        messages: history,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Groq API error:", res.status, err);
      return "Sorry, something went wrong with the AI. Try again!";
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    const reply = data.choices[0]?.message?.content ?? "No response from AI.";
    history.push({ role: "assistant", content: reply });

    return reply;
  } catch (err) {
    console.error("AI fetch error:", err);
    return "Sorry, something went wrong. Try again!";
  }
}
