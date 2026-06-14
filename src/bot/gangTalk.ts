const gangOpeners = [
  "aye fam,",
  "on god,",
  "no cap,",
  "bruh,",
  "sheesh,",
  "gang gang,",
  "lowkey,",
  "fr fr,",
  "deadass,",
  "ight listen,",
  "real talk,",
  "my guy,",
  "yo,",
  "fasho,",
  "bet,",
];

const gangClosers = [
  "no cap 🧢",
  "on god 🙏",
  "fr fr",
  "gang 💯",
  "deadass",
  "feel me?",
  "know what im sayin",
  "sheesh 😤",
  "fasho fasho",
  "you already know",
  "straight up",
  "period.",
  "💪",
  "we out here",
  "100 💯",
];

const gangReactions = [
  "that's bussin bussin ong",
  "we don't move like that round here",
  "gang been saw that coming",
  "bro said what he said",
  "aight we ain't lackin tho",
  "that's the vibe fasho",
  "on the block that's facts",
  "my gang already knew",
  "bro really said that? sheesh",
  "ain't no way bro really said that",
  "big facts on everything",
  "word to the hood",
  "gang don't play like that",
  "that ain't it chief",
  "we built different round here",
  "the gang already on it",
  "we move in silence",
  "big drip no slip",
  "stay solid out here",
  "keep it a buck fifty",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function makeGangReply(message: string): string {
  const opener = pick(gangOpeners);
  const reaction = pick(gangReactions);
  const closer = pick(gangClosers);

  const shortened =
    message.length > 40 ? message.slice(0, 40).trimEnd() + "..." : message;

  const templates = [
    `${opener} "${shortened}" — ${reaction}, ${closer}`,
    `${opener} ${reaction} 😤 ${closer}`,
    `bruh said "${shortened}" 💀 ${reaction}, ${closer}`,
    `${opener} ${reaction}. ${closer}`,
    `gang heard "${shortened}" and said ${reaction}, ${closer}`,
  ];

  return pick(templates);
}

export function makeGangResponse(): string {
  const opener = pick(gangOpeners);
  const reaction = pick(gangReactions);
  const closer = pick(gangClosers);
  return `${opener} ${reaction}, ${closer}`;
}
