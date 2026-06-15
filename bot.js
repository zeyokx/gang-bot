import {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle
} from "discord.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GROQ_KEY = process.env.GROQ_API_KEY;
if (!TOKEN) { console.error("No DISCORD_BOT_TOKEN"); process.exit(1); }

// ─── Economy Storage ──────────────────────────────────────────────────────────
const economy = new Map(); // `${guildId}:${userId}` -> { wallet, bank, lastDaily, lastWork, lastCrime, lastBeg, lastRob }

function getUser(guildId, userId) {
  const key = `${guildId}:${userId}`;
  if (!economy.has(key)) economy.set(key, { wallet: 1000, bank: 0, lastDaily: 0, lastWork: 0, lastCrime: 0, lastBeg: 0, lastRob: 0 });
  return economy.get(key);
}

function saveUser(guildId, userId, data) {
  economy.set(`${guildId}:${userId}`, data);
}

const COIN = "🪙";

function fmt(n) { return `${COIN} **${n.toLocaleString()}**`; }

function parseBet(input, wallet) {
  if (input === "all" || input === "max") return wallet;
  const n = parseInt(input);
  return isNaN(n) ? null : n;
}

function cooldownMsg(name, ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60), sec = s % 60;
  return `⏳ **${name}** is on cooldown! Come back in **${m > 0 ? m + "m " : ""}${sec > 0 ? sec + "s" : ""}**.`;
}

// ─── AI Chat ──────────────────────────────────────────────────────────────────
const chatHistory = new Map();
const talkChannels = new Map();

function getTalkChannels(guildId) {
  if (!talkChannels.has(guildId)) talkChannels.set(guildId, new Set());
  return talkChannels.get(guildId);
}

async function ask(userId, text) {
  if (!GROQ_KEY) throw new Error("No GROQ_API_KEY");
  if (!chatHistory.has(userId)) chatHistory.set(userId, []);
  const h = chatHistory.get(userId);
  h.push({ role: "user", content: text });
  if (h.length > 20) h.splice(0, 2);
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "llama-3.1-8b-instant", max_tokens: 400, messages: h })
  });
  if (!res.ok) { const e = await res.text(); console.error("Groq error:", res.status, e); throw new Error("Groq " + res.status); }
  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content ?? "No response.";
  h.push({ role: "assistant", content: reply });
  return reply;
}

// ─── Blackjack Helpers ────────────────────────────────────────────────────────
const BJ_SUITS = ["♠", "♥", "♦", "♣"];
const BJ_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const activeBJ = new Map(); // messageId -> game state

function newDeck() {
  const deck = [];
  for (const s of BJ_SUITS) for (const r of BJ_RANKS) deck.push({ s, r });
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}

function cardVal(r) { return r === "A" ? 11 : ["J","Q","K"].includes(r) ? 10 : parseInt(r); }

function handVal(hand) {
  let val = hand.reduce((a, c) => a + cardVal(c.r), 0);
  let aces = hand.filter(c => c.r === "A").length;
  while (val > 21 && aces-- > 0) val -= 10;
  return val;
}

function handStr(hand) { return hand.map(c => `\`${c.r}${c.s}\``).join(" "); }

function bjEmbed(game, ended = false) {
  const pVal = handVal(game.player);
  const dVal = handVal(game.dealer);
  const embed = new EmbedBuilder().setColor(ended ? (game.result > 0 ? 0x57F287 : game.result < 0 ? 0xED4245 : 0xFEE75C) : 0x5865F2);
  embed.setTitle("🃏 Blackjack");
  embed.addFields(
    { name: `Dealer's Hand ${ended ? `(${dVal})` : ""}`, value: ended ? handStr(game.dealer) : `\`${game.dealer[0].r}${game.dealer[0].s}\` \`??\`` },
    { name: `Your Hand (${pVal})`, value: handStr(game.player) },
    { name: "Bet", value: fmt(game.bet), inline: true }
  );
  if (ended) {
    const msg = game.result > 0 ? `✅ You win ${fmt(game.result)}!` : game.result < 0 ? `❌ You lose ${fmt(-game.result)}!` : `🟡 Push — bet returned!`;
    embed.setDescription(msg);
  }
  return embed;
}

function bjRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("bj_hit").setLabel("Hit").setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId("bj_stand").setLabel("Stand").setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId("bj_double").setLabel("Double Down").setStyle(ButtonStyle.Secondary).setDisabled(disabled)
  );
}

// ─── Slots ────────────────────────────────────────────────────────────────────
const SLOT_EMOJIS = ["🍒", "🍋", "🍊", "🍇", "🔔", "💎", "7️⃣"];
const SLOT_MULT   = { "🍒": 3, "🍋": 4, "🍊": 5, "🍇": 6, "🔔": 8, "💎": 15, "7️⃣": 30 };

function spin() { return Array.from({ length: 3 }, () => SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)]); }

function slotsResult(reels, bet) {
  const [a, b, c] = reels;
  if (a === b && b === c) return { mult: SLOT_MULT[a], desc: "🎉 **JACKPOT!** Three of a kind!" };
  if (a === b || b === c || a === c) return { mult: 1.5, desc: "✨ Two of a kind!" };
  return { mult: 0, desc: "💸 No match. Better luck next time!" };
}

// ─── Commands ─────────────────────────────────────────────────────────────────
const commands = [
  // Economy
  new SlashCommandBuilder().setName("balance").setDescription("Check your balance").addUserOption(o => o.setName("user").setDescription("User (default: you)")),
  new SlashCommandBuilder().setName("daily").setDescription("Claim your daily reward"),
  new SlashCommandBuilder().setName("work").setDescription("Work for coins (1h cooldown)"),
  new SlashCommandBuilder().setName("beg").setDescription("Beg for coins (2min cooldown)"),
  new SlashCommandBuilder().setName("crime").setDescription("Commit a crime for coins (2h cooldown)"),
  new SlashCommandBuilder().setName("rob").setDescription("Rob another user's wallet").addUserOption(o => o.setName("user").setDescription("User to rob").setRequired(true)),
  new SlashCommandBuilder().setName("deposit").setDescription("Deposit coins into your bank").addStringOption(o => o.setName("amount").setDescription('Amount or "all"').setRequired(true)),
  new SlashCommandBuilder().setName("withdraw").setDescription("Withdraw coins from your bank").addStringOption(o => o.setName("amount").setDescription('Amount or "all"').setRequired(true)),
  new SlashCommandBuilder().setName("give").setDescription("Give coins to someone").addUserOption(o => o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Richest users in this server"),
  // Gambling
  new SlashCommandBuilder().setName("coinflip").setDescription("Flip a coin — double or nothing").addStringOption(o => o.setName("amount").setDescription('Amount or "all"').setRequired(true)).addStringOption(o => o.setName("side").setDescription("heads or tails").addChoices({ name: "Heads", value: "heads" }, { name: "Tails", value: "tails" })),
  new SlashCommandBuilder().setName("slots").setDescription("Spin the slot machine").addStringOption(o => o.setName("amount").setDescription('Amount or "all"').setRequired(true)),
  new SlashCommandBuilder().setName("blackjack").setDescription("Play blackjack against the dealer").addStringOption(o => o.setName("amount").setDescription('Amount or "all"').setRequired(true)),
  // Misc
  new SlashCommandBuilder().setName("resetbot").setDescription("Reset bot state"),
  new SlashCommandBuilder().setName("setchanneltalk").setDescription("Manage AI auto-reply channels")
    .addSubcommand(s => s.setName("add").setDescription("Add channel").addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)))
    .addSubcommand(s => s.setName("remove").setDescription("Remove channel").addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("List channels")),
  new SlashCommandBuilder().setName("fakeban").setDescription("Fake ban a user (joke)").addUserOption(o => o.setName("user").setDescription("User").setRequired(true)).addStringOption(o => o.setName("reason").setDescription("Reason")),
  new SlashCommandBuilder().setName("serverinfo").setDescription("Show server info"),
  new SlashCommandBuilder().setName("userinfo").setDescription("Show user info").addUserOption(o => o.setName("user").setDescription("User")),
];

// ─── Client ───────────────────────────────────────────────────────────────────
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

// ─── Message Handler (AI Chat) ────────────────────────────────────────────────
client.on("messageCreate", async (msg) => {
  if (msg.author.bot || !msg.guildId) return;
  const botMember = msg.guild?.members.me;
  if (!botMember?.permissionsIn(msg.channel).has(PermissionFlagsBits.SendMessages)) return;
  const mentioned = client.user && msg.mentions.users.has(client.user.id);
  const inTalkCh = getTalkChannels(msg.guildId).has(msg.channel.id);
  if (!mentioned && !inTalkCh) return;
  const content = msg.content.replace(/<@!?\d+>/g, "").trim();
  if (!content) return;
  try {
    await msg.channel.sendTyping();
    const reply = await ask(msg.author.id, content);
    await msg.reply(reply);
  } catch (e) {
    console.error("AI error:", e);
    await msg.reply("AI is taking a break, try again in a moment!").catch(() => {});
  }
});

// ─── Interaction Handler ──────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  // Blackjack buttons
  if (interaction.isButton() && ["bj_hit", "bj_stand", "bj_double"].includes(interaction.customId)) {
    const game = activeBJ.get(interaction.message.id);
    if (!game) return interaction.reply({ content: "This game has expired.", ephemeral: true });
    if (game.userId !== interaction.user.id) return interaction.reply({ content: "This isn't your game!", ephemeral: true });

    const u = getUser(game.guildId, game.userId);
    const action = interaction.customId;

    if (action === "bj_hit" || (action === "bj_double" && game.player.length === 2)) {
      if (action === "bj_double") {
        const extra = Math.min(game.bet, u.wallet);
        u.wallet -= extra;
        game.bet += extra;
        saveUser(game.guildId, game.userId, u);
      }
      game.player.push(game.deck.pop());
      const pVal = handVal(game.player);

      if (pVal > 21 || action === "bj_double") {
        // Bust or double = auto-stand
        if (pVal <= 21) {
          while (handVal(game.dealer) < 17) game.dealer.push(game.deck.pop());
        }
        const dVal = handVal(game.dealer);
        let result = 0;
        if (pVal > 21) result = -game.bet;
        else if (dVal > 21 || pVal > dVal) result = game.bet;
        else if (pVal < dVal) result = -game.bet;
        u.wallet += game.bet + result;
        saveUser(game.guildId, game.userId, u);
        game.result = result;
        activeBJ.delete(interaction.message.id);
        return interaction.update({ embeds: [bjEmbed(game, true)], components: [bjRow(true)] });
      }

      if (handVal(game.player) === 21) {
        while (handVal(game.dealer) < 17) game.dealer.push(game.deck.pop());
        const dVal = handVal(game.dealer);
        const result = dVal === 21 ? 0 : game.bet;
        u.wallet += game.bet + result;
        saveUser(game.guildId, game.userId, u);
        game.result = result;
        activeBJ.delete(interaction.message.id);
        return interaction.update({ embeds: [bjEmbed(game, true)], components: [bjRow(true)] });
      }

      return interaction.update({ embeds: [bjEmbed(game)], components: [bjRow()] });
    }

    if (action === "bj_stand") {
      while (handVal(game.dealer) < 17) game.dealer.push(game.deck.pop());
      const pVal = handVal(game.player), dVal = handVal(game.dealer);
      let result = 0;
      if (dVal > 21 || pVal > dVal) result = game.bet;
      else if (pVal < dVal) result = -game.bet;
      u.wallet += game.bet + result;
      saveUser(game.guildId, game.userId, u);
      game.result = result;
      activeBJ.delete(interaction.message.id);
      return interaction.update({ embeds: [bjEmbed(game, true)], components: [bjRow(true)] });
    }
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName: name, guildId, user } = interaction;

  try {
    // ── Balance ──────────────────────────────────────────────────────────────
    if (name === "balance") {
      const target = interaction.options.getUser("user") ?? user;
      const u = getUser(guildId, target.id);
      const embed = new EmbedBuilder()
        .setTitle(`💰 ${target.username}'s Balance`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: "👝 Wallet", value: fmt(u.wallet), inline: true },
          { name: "🏦 Bank", value: fmt(u.bank), inline: true },
          { name: "💎 Total", value: fmt(u.wallet + u.bank), inline: true }
        ).setColor(0xF1C40F);
      return interaction.reply({ embeds: [embed] });
    }

    // ── Daily ────────────────────────────────────────────────────────────────
    if (name === "daily") {
      const u = getUser(guildId, user.id);
      const now = Date.now(), cd = 24 * 60 * 60 * 1000;
      if (now - u.lastDaily < cd) return interaction.reply({ content: cooldownMsg("Daily", cd - (now - u.lastDaily)), ephemeral: true });
      const reward = Math.floor(Math.random() * 501) + 500;
      u.wallet += reward; u.lastDaily = now;
      saveUser(guildId, user.id, u);
      const embed = new EmbedBuilder().setColor(0xF1C40F)
        .setTitle("📅 Daily Reward")
        .setDescription(`You claimed your daily reward of ${fmt(reward)}!\n🏦 New balance: ${fmt(u.wallet + u.bank)}`);
      return interaction.reply({ embeds: [embed] });
    }

    // ── Work ─────────────────────────────────────────────────────────────────
    if (name === "work") {
      const u = getUser(guildId, user.id);
      const now = Date.now(), cd = 60 * 60 * 1000;
      if (now - u.lastWork < cd) return interaction.reply({ content: cooldownMsg("Work", cd - (now - u.lastWork)), ephemeral: true });
      const jobs = ["drove a taxi", "delivered pizzas", "fixed computers", "walked dogs", "cleaned offices", "coded a website", "tutored students", "mowed lawns"];
      const job = jobs[Math.floor(Math.random() * jobs.length)];
      const reward = Math.floor(Math.random() * 401) + 100;
      u.wallet += reward; u.lastWork = now;
      saveUser(guildId, user.id, u);
      const embed = new EmbedBuilder().setColor(0x2ECC71)
        .setTitle("💼 Work")
        .setDescription(`You **${job}** and earned ${fmt(reward)}!\n💼 Wallet: ${fmt(u.wallet)}`);
      return interaction.reply({ embeds: [embed] });
    }

    // ── Beg ──────────────────────────────────────────────────────────────────
    if (name === "beg") {
      const u = getUser(guildId, user.id);
      const now = Date.now(), cd = 2 * 60 * 1000;
      if (now - u.lastBeg < cd) return interaction.reply({ content: cooldownMsg("Beg", cd - (now - u.lastBeg)), ephemeral: true });
      u.lastBeg = now;
      if (Math.random() < 0.3) {
        saveUser(guildId, user.id, u);
        return interaction.reply("🙏 You begged but no one gave you anything. Sad.");
      }
      const reward = Math.floor(Math.random() * 200) + 1;
      u.wallet += reward;
      saveUser(guildId, user.id, u);
      const givers = ["a kind stranger", "a rich guy passing by", "someone who felt sorry for you", "a child from their piggy bank"];
      return interaction.reply(`🙏 ${givers[Math.floor(Math.random() * givers.length)]} gave you ${fmt(reward)}!`);
    }

    // ── Crime ────────────────────────────────────────────────────────────────
    if (name === "crime") {
      const u = getUser(guildId, user.id);
      const now = Date.now(), cd = 2 * 60 * 60 * 1000;
      if (now - u.lastCrime < cd) return interaction.reply({ content: cooldownMsg("Crime", cd - (now - u.lastCrime)), ephemeral: true });
      u.lastCrime = now;
      const crimes = ["robbed a convenience store", "hacked a database", "picked pockets", "counterfeited money", "ran a scam", "stole a car"];
      const crime = crimes[Math.floor(Math.random() * crimes.length)];
      if (Math.random() < 0.4) {
        const fine = Math.floor(Math.random() * 201) + 100;
        u.wallet = Math.max(0, u.wallet - fine);
        saveUser(guildId, user.id, u);
        const embed = new EmbedBuilder().setColor(0xED4245).setTitle("💀 Crime Failed")
          .setDescription(`You tried to ${crime} but got caught!\n**Fine:** ${fmt(fine)}\n💼 Wallet: ${fmt(u.wallet)}`);
        return interaction.reply({ embeds: [embed] });
      }
      const reward = Math.floor(Math.random() * 601) + 200;
      u.wallet += reward;
      saveUser(guildId, user.id, u);
      const embed = new EmbedBuilder().setColor(0x57F287).setTitle("😈 Crime Successful")
        .setDescription(`You **${crime}** and got away with ${fmt(reward)}!\n💼 Wallet: ${fmt(u.wallet)}`);
      return interaction.reply({ embeds: [embed] });
    }

    // ── Rob ──────────────────────────────────────────────────────────────────
    if (name === "rob") {
      const target = interaction.options.getUser("user");
      if (target.id === user.id) return interaction.reply({ content: "You can't rob yourself.", ephemeral: true });
      if (target.bot) return interaction.reply({ content: "You can't rob bots.", ephemeral: true });
      const u = getUser(guildId, user.id);
      const t = getUser(guildId, target.id);
      const now = Date.now(), cd = 2 * 60 * 60 * 1000;
      if (now - u.lastRob < cd) return interaction.reply({ content: cooldownMsg("Rob", cd - (now - u.lastRob)), ephemeral: true });
      if (t.wallet < 100) return interaction.reply({ content: `💸 **${target.username}** is broke — not worth it.`, ephemeral: true });
      u.lastRob = now;
      if (Math.random() < 0.5) {
        const fine = Math.floor(Math.random() * 201) + 100;
        u.wallet = Math.max(0, u.wallet - fine);
        saveUser(guildId, user.id, u);
        return interaction.reply(`🚔 You got caught robbing **${target.username}** and paid a fine of ${fmt(fine)}!`);
      }
      const stolen = Math.floor(t.wallet * (Math.random() * 0.2 + 0.1));
      t.wallet -= stolen; u.wallet += stolen;
      saveUser(guildId, user.id, u); saveUser(guildId, target.id, t);
      return interaction.reply(`🔫 You robbed **${target.username}** for ${fmt(stolen)}!`);
    }

    // ── Deposit ───────────────────────────────────────────────────────────────
    if (name === "deposit") {
      const u = getUser(guildId, user.id);
      const input = interaction.options.getString("amount");
      const amount = parseBet(input, u.wallet);
      if (!amount || amount <= 0) return interaction.reply({ content: "Enter a valid amount or `all`.", ephemeral: true });
      if (amount > u.wallet) return interaction.reply({ content: `You only have ${fmt(u.wallet)} in your wallet.`, ephemeral: true });
      u.wallet -= amount; u.bank += amount;
      saveUser(guildId, user.id, u);
      return interaction.reply(`🏦 Deposited ${fmt(amount)} into your bank!\n👝 Wallet: ${fmt(u.wallet)} | 🏦 Bank: ${fmt(u.bank)}`);
    }

    // ── Withdraw ──────────────────────────────────────────────────────────────
    if (name === "withdraw") {
      const u = getUser(guildId, user.id);
      const input = interaction.options.getString("amount");
      const amount = parseBet(input, u.bank);
      if (!amount || amount <= 0) return interaction.reply({ content: "Enter a valid amount or `all`.", ephemeral: true });
      if (amount > u.bank) return interaction.reply({ content: `You only have ${fmt(u.bank)} in your bank.`, ephemeral: true });
      u.bank -= amount; u.wallet += amount;
      saveUser(guildId, user.id, u);
      return interaction.reply(`👝 Withdrew ${fmt(amount)} from your bank!\n👝 Wallet: ${fmt(u.wallet)} | 🏦 Bank: ${fmt(u.bank)}`);
    }

    // ── Give ──────────────────────────────────────────────────────────────────
    if (name === "give") {
      const target = interaction.options.getUser("user");
      if (target.id === user.id) return interaction.reply({ content: "You can't give to yourself.", ephemeral: true });
      if (target.bot) return interaction.reply({ content: "You can't give to bots.", ephemeral: true });
      const amount = interaction.options.getInteger("amount");
      const u = getUser(guildId, user.id);
      if (amount > u.wallet) return interaction.reply({ content: `You only have ${fmt(u.wallet)} in your wallet.`, ephemeral: true });
      const t = getUser(guildId, target.id);
      u.wallet -= amount; t.wallet += amount;
      saveUser(guildId, user.id, u); saveUser(guildId, target.id, t);
      return interaction.reply(`💸 **${user.username}** gave ${fmt(amount)} to **${target.username}**!`);
    }

    // ── Leaderboard ───────────────────────────────────────────────────────────
    if (name === "leaderboard") {
      const guildEntries = [];
      for (const [key, data] of economy.entries()) {
        const [g, u] = key.split(":");
        if (g === guildId) guildEntries.push({ userId: u, total: data.wallet + data.bank });
      }
      guildEntries.sort((a, b) => b.total - a.total);
      if (guildEntries.length === 0) return interaction.reply("No one has any money yet!");
      const top = guildEntries.slice(0, 10);
      const medals = ["🥇", "🥈", "🥉"];
      const lines = top.map((e, i) => `${medals[i] ?? `**${i + 1}.**`} <@${e.userId}> — ${fmt(e.total)}`);
      const embed = new EmbedBuilder().setTitle("🏆 Server Leaderboard").setDescription(lines.join("\n")).setColor(0xF1C40F);
      return interaction.reply({ embeds: [embed] });
    }

    // ── Coinflip ──────────────────────────────────────────────────────────────
    if (name === "coinflip") {
      const u = getUser(guildId, user.id);
      const bet = parseBet(interaction.options.getString("amount"), u.wallet);
      if (!bet || bet <= 0) return interaction.reply({ content: "Enter a valid bet or `all`.", ephemeral: true });
      if (bet > u.wallet) return interaction.reply({ content: `You only have ${fmt(u.wallet)} in your wallet.`, ephemeral: true });
      const side = interaction.options.getString("side") ?? (Math.random() < 0.5 ? "heads" : "tails");
      const result = Math.random() < 0.5 ? "heads" : "tails";
      const won = result === side;
      u.wallet += won ? bet : -bet;
      saveUser(guildId, user.id, u);
      const embed = new EmbedBuilder()
        .setColor(won ? 0x57F287 : 0xED4245)
        .setTitle(won ? "🪙 You Won!" : "🪙 You Lost!")
        .setDescription(`The coin landed on **${result}** ${result === "heads" ? "👑" : "🔵"}\nYou chose **${side}**\n${won ? `✅ Won ${fmt(bet)}` : `❌ Lost ${fmt(bet)}`}\n💼 Wallet: ${fmt(u.wallet)}`);
      return interaction.reply({ embeds: [embed] });
    }

    // ── Slots ─────────────────────────────────────────────────────────────────
    if (name === "slots") {
      const u = getUser(guildId, user.id);
      const bet = parseBet(interaction.options.getString("amount"), u.wallet);
      if (!bet || bet <= 0) return interaction.reply({ content: "Enter a valid bet or `all`.", ephemeral: true });
      if (bet > u.wallet) return interaction.reply({ content: `You only have ${fmt(u.wallet)} in your wallet.`, ephemeral: true });
      const reels = spin();
      const { mult, desc } = slotsResult(reels, bet);
      const winnings = Math.floor(bet * mult);
      u.wallet += winnings - bet;
      saveUser(guildId, user.id, u);
      const embed = new EmbedBuilder()
        .setColor(mult > 1 ? 0x57F287 : 0xED4245)
        .setTitle("🎰 Slot Machine")
        .setDescription(`┃ ${reels.join(" ┃ ")} ┃\n\n${desc}\n${mult > 0 ? `✅ Won ${fmt(winnings)} (${mult}x)` : `❌ Lost ${fmt(bet)}`}\n💼 Wallet: ${fmt(u.wallet)}`);
      return interaction.reply({ embeds: [embed] });
    }

    // ── Blackjack ─────────────────────────────────────────────────────────────
    if (name === "blackjack") {
      const u = getUser(guildId, user.id);
      const bet = parseBet(interaction.options.getString("amount"), u.wallet);
      if (!bet || bet <= 0) return interaction.reply({ content: "Enter a valid bet or `all`.", ephemeral: true });
      if (bet > u.wallet) return interaction.reply({ content: `You only have ${fmt(u.wallet)} in your wallet.`, ephemeral: true });
      u.wallet -= bet;
      saveUser(guildId, user.id, u);
      const deck = newDeck();
      const player = [deck.pop(), deck.pop()];
      const dealer = [deck.pop(), deck.pop()];
      const game = { userId: user.id, guildId, bet, deck, player, dealer, result: 0 };
      const pVal = handVal(player);
      // Natural blackjack
      if (pVal === 21) {
        while (handVal(dealer) < 17) dealer.push(deck.pop());
        const dVal = handVal(dealer);
        const result = dVal === 21 ? 0 : Math.floor(bet * 1.5);
        u.wallet += bet + result;
        saveUser(guildId, user.id, u);
        game.result = result;
        const embed = bjEmbed(game, true);
        return interaction.reply({ embeds: [embed], components: [bjRow(true)] });
      }
      const msg = await interaction.reply({ embeds: [bjEmbed(game)], components: [bjRow()], fetchReply: true });
      activeBJ.set(msg.id, game);
      // Auto-expire after 5 minutes
      setTimeout(() => {
        if (activeBJ.has(msg.id)) {
          activeBJ.delete(msg.id);
          u.wallet += bet; // refund
          saveUser(guildId, user.id, u);
        }
      }, 5 * 60 * 1000);
      return;
    }

    // ── Reset Bot ─────────────────────────────────────────────────────────────
    if (name === "resetbot") {
      chatHistory.clear(); talkChannels.clear();
      return interaction.reply("✅ Bot reset! Conversation history and talk channels cleared.");
    }

    // ── Set Channel Talk ──────────────────────────────────────────────────────
    if (name === "setchanneltalk") {
      const sub = interaction.options.getSubcommand();
      const channels = getTalkChannels(guildId);
      if (sub === "add") {
        const ch = interaction.options.getChannel("channel");
        channels.add(ch.id);
        return interaction.reply(`✅ <#${ch.id}> added — I'll auto-reply there.`);
      } else if (sub === "remove") {
        const ch = interaction.options.getChannel("channel");
        channels.delete(ch.id);
        return interaction.reply(`✅ <#${ch.id}> removed.`);
      } else {
        if (channels.size === 0) return interaction.reply("No talk channels set.");
        return interaction.reply("Talk channels: " + [...channels].map(id => `<#${id}>`).join(", "));
      }
    }

    // ── Fake Ban ──────────────────────────────────────────────────────────────
    if (name === "fakeban") {
      const target = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      return interaction.reply(`🔨 **${target.username}** has been banned.\n> **Reason:** ${reason}\n*(This is a joke ban)*`);
    }

    // ── Server Info ───────────────────────────────────────────────────────────
    if (name === "serverinfo") {
      const g = interaction.guild;
      await g.fetch();
      const embed = new EmbedBuilder().setTitle(g.name).setThumbnail(g.iconURL())
        .addFields(
          { name: "Members", value: String(g.memberCount), inline: true },
          { name: "Owner", value: `<@${g.ownerId}>`, inline: true },
          { name: "Created", value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true }
        ).setColor(0x5865F2);
      return interaction.reply({ embeds: [embed] });
    }

    // ── User Info ─────────────────────────────────────────────────────────────
    if (name === "userinfo") {
      const target = interaction.options.getUser("user") ?? user;
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      const embed = new EmbedBuilder().setTitle(target.username).setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: "ID", value: target.id, inline: true },
          { name: "Joined Discord", value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
          { name: "Joined Server", value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "N/A", inline: true }
        ).setColor(0x57F287);
      return interaction.reply({ embeds: [embed] });
    }

  } catch (e) {
    console.error(`Command error [${name}]:`, e);
    const m = { content: "Something broke — try again!", ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(m).catch(() => {});
    else await interaction.reply(m).catch(() => {});
  }
});

client.login(TOKEN);
