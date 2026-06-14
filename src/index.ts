import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  REST,
  Routes,
  type SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Message,
  PermissionFlagsBits,
  type TextChannel,
} from "discord.js";
import { getTalkChannels } from "./bot/storage.js";
import { makeGangReply, makeGangResponse } from "./bot/gangTalk.js";

import * as setchanneltalk from "./bot/commands/setchanneltalk.js";
import * as fakeban from "./bot/commands/fakeban.js";
import * as serverinfo from "./bot/commands/serverinfo.js";
import * as userinfo from "./bot/commands/userinfo.js";
import * as whois from "./bot/commands/whois.js";

interface Command {
  data: SlashCommandBuilder | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const commands: Collection<string, Command> = new Collection();
const commandModules: Command[] = [setchanneltalk, fakeban, serverinfo, userinfo, whois];
for (const mod of commandModules) commands.set(mod.data.name, mod);

const token = process.env["DISCORD_BOT_TOKEN"];
if (!token) {
  console.error("DISCORD_BOT_TOKEN is not set!");
  process.exit(1);
}

async function registerCommands(clientId: string) {
  const rest = new REST().setToken(token!);
  const body = commandModules.map((m) => m.data.toJSON());
  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log("Slash commands registered.");
  } catch (err) {
    console.error("Failed to register commands:", err);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`Bot online as ${c.user.tag} 🔫`);
  await registerCommands(c.user.id);
});

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;
  if (!message.guildId) return;

  const talkChannels = getTalkChannels(message.guildId);
  if (!talkChannels.includes(message.channel.id)) return;

  const channel = message.channel as TextChannel;
  const botMember = message.guild?.members.me;
  if (!botMember?.permissionsIn(channel).has(PermissionFlagsBits.SendMessages)) return;

  try {
    const reply = message.content ? makeGangReply(message.content) : makeGangResponse();
    await message.reply(reply);
  } catch (err) {
    console.error("Error sending gang reply:", err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Command error [${interaction.commandName}]:`, err);
    const msg = { content: "Bruh something broke on my end 💀 Try again fam.", ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

client.login(token);
