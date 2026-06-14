import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const DATA_FILE = path.resolve(DATA_DIR, "bot-data.json");

interface BotData {
  talkChannels: Record<string, string[]>;
}

function loadData(): BotData {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(DATA_FILE)) return { talkChannels: {} };
    return JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return { talkChannels: {} };
  }
}

function saveData(data: BotData): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function getTalkChannels(guildId: string): string[] {
  const data = loadData();
  return data.talkChannels[guildId] ?? [];
}

export function addTalkChannel(guildId: string, channelId: string): void {
  const data = loadData();
  if (!data.talkChannels[guildId]) data.talkChannels[guildId] = [];
  if (!data.talkChannels[guildId].includes(channelId)) {
    data.talkChannels[guildId].push(channelId);
  }
  saveData(data);
}

export function removeTalkChannel(guildId: string, channelId: string): boolean {
  const data = loadData();
  if (!data.talkChannels[guildId]) return false;
  const before = data.talkChannels[guildId].length;
  data.talkChannels[guildId] = data.talkChannels[guildId].filter(
    (id) => id !== channelId
  );
  saveData(data);
  return data.talkChannels[guildId].length < before;
}
