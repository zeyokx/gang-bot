import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GROQ_KEY = process.env.GROQ_API_KEY;

if (!TOKEN) { console.error("No DISCORD_BOT_TOKEN"); process.exit(1); }
if (!GROQ_KEY) { console.error("No GROQ_API_KEY"); process.exit(1); }

const talkChannels = new Map();
const history = new Map();

function getChannels(guildId) {
  if (!talkChannels.has(guildId)) talkChannels.set(guildId, new Set());
  return talkChannels.get(guildId);
}

async function ask(userId, text) {
  if (!history.has(userId)) history.set(userId, []);
  const h = history.get(userId);
  h.push({ role: "user", content: text });
  if (h.length > 20) h.splice(0, 2);

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: 400, messages: h })
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Groq error:", res.status, err);
    throw new Error("Groq " + res.status);
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content ?? "No response.";
  h.push({ role: "assistant", content: reply });
  return reply;
}

const commands = [
  new SlashCommandBuilder().setName("resetbot").setDescription("Reset the bot state and verify it is online"),
  new SlashCommandBuilder().setName("setchanneltalk")
    .setDescription("Manage auto-reply channels")
    .addSubcommand(s => s.setName("add").setDescription("Auto-reply in a channel").addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)))
    .addSubcommand(s => s.setName("remove").setDescription("Stop auto-reply in a channel").addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("List auto-reply channels")),
  new SlashCommandBuilder().setName("fakeban")
    .setDescription("Fake ban a user (joke)")
    .addUserOption(o => o.setName("user").setDescription("User to fake ban").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),
  new SlashCommandBuilder().setName("serverinfo").setDescription("Show server info"),
  new SlashCommandBuilder().setName("userinfo").setDescription("Show user info").addUserOption(o => o.setName("user").setDescription("User (defaults to you)")),
  new SlashCommandBuilder().setName("whois").setDescription("Who is this user?").addUserOption(o => o.setName("user").setDescription("User").setRequired(true)),
];

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once("ready", async (c) => {
  console.log("Bot online as " + c.user.tag);
  try {
    await new REST().setToken(TOKEN).put(Routes.applicationCommands(c.user.id), { body: commands.map(cmd => cmd.toJSON()) });
    console.log("Slash commands registered.");
  } catch (e) { console.error("Command register error:", e); }
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot || !msg.guildId) return;
  const botMember = msg.guild?.members.me;
  if (!botMember?.permissionsIn(msg.channel).has(PermissionFlagsBits.SendMessages)) return;

  const mentioned = client.user && msg.mentions.users.has(client.user.id);
  const inTalkCh = getChannels(msg.guildId).has(msg.channel.id);
  if (!mentioned && !inTalkCh) return;

  const content = msg.content.replace(/<@!?\d+>/g, "").trim();
  if (!content) return;

  try {
    await msg.channel.sendTyping();
    const reply = await ask(msg.author.id, content);
    await msg.reply(reply);
  } catch (e) {
    console.error("Reply error:", e);
    await msg.reply("Something went wrong, try again in a sec!").catch(() => {});
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const name = interaction.commandName;

  try {
    if (name === "resetbot") {
      history.clear();
      talkChannels.clear();
      await interaction.reply("✅ Bot reset! All conversation history and talk channels cleared. I'm fully online and working.");

    } else if (name === "setchanneltalk") {
      const sub = interaction.options.getSubcommand();
      const channels = getChannels(interaction.guildId);
      if (sub === "add") {
        const ch = interaction.options.getChannel("channel");
        channels.add(ch.id);
        await interaction.reply("✅ <#" + ch.id + "> added — I'll auto-reply to all messages there.");
      } else if (sub === "remove") {
        const ch = interaction.options.getChannel("channel");
        channels.delete(ch.id);
        await interaction.reply("✅ <#" + ch.id + "> removed.");
      } else {
        if (channels.size === 0) return await interaction.reply("No talk channels set. Use `/setchanneltalk add` to add one.");
        await interaction.reply("Talk channels: " + [...channels].map(id => "<#" + id + ">").join(", "));
      }

    } else if (name === "fakeban") {
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      await interaction.reply("🔨 **" + user.username + "** has been banned.\n> **Reason:** " + reason + "\n*(This is a joke ban)*");

    } else if (name === "serverinfo") {
      const g = interaction.guild;
      await g.fetch();
      const embed = new EmbedBuilder()
        .setTitle(g.name).setThumbnail(g.iconURL())
        .addFields(
          { name: "Members", value: String(g.memberCount), inline: true },
          { name: "Owner", value: "<@" + g.ownerId + ">", inline: true },
          { name: "Created", value: "<t:" + Math.floor(g.createdTimestamp / 1000) + ":R>", inline: true }
        ).setColor(0x5865F2);
      await interaction.reply({ embeds: [embed] });

    } else if (name === "userinfo" || name === "whois") {
      const user = interaction.options.getUser("user") ?? interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const embed = new EmbedBuilder()
        .setTitle(user.username).setThumbnail(user.displayAvatarURL())
        .addFields(
          { name: "ID", value: user.id, inline: true },
          { name: "Joined Discord", value: "<t:" + Math.floor(user.createdTimestamp / 1000) + ":R>", inline: true },
          { name: "Joined Server", value: member ? "<t:" + Math.floor(member.joinedTimestamp / 1000) + ":R>" : "N/A", inline: true }
        ).setColor(0x57F287);
      await interaction.reply({ embeds: [embed] });
    }
  } catch (e) {
    console.error("Command error [" + name + "]:", e);
    const m = { content: "Something broke, try again!", ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(m).catch(() => {});
    else await interaction.reply(m).catch(() => {});
  }
});

client.login(TOKEN);
