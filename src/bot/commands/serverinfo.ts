import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("serverinfo")
  .setDescription("Get the rundown on this server, fam 🔍");

export async function execute(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild as Guild;
  await guild.fetch();

  const owner = await guild.fetchOwner().catch(() => null);
  const channels = guild.channels.cache;
  const textChannels = channels.filter((c) => c.isTextBased()).size;
  const voiceChannels = channels.filter((c) => c.isVoiceBased()).size;
  const roles = guild.roles.cache.size - 1;

  const verificationLevels: Record<number, string> = {
    0: "None",
    1: "Low",
    2: "Medium",
    3: "High",
    4: "Very High",
  };

  const boostTier: Record<number, string> = {
    0: "No Boost",
    1: "Level 1 🚀",
    2: "Level 2 🚀🚀",
    3: "Level 3 🚀🚀🚀",
  };

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`🏙️ ${guild.name} — Server Info`)
    .setThumbnail(guild.iconURL() ?? null)
    .addFields(
      { name: "👑 Owner", value: owner ? `${owner.user.tag}` : "Unknown", inline: true },
      { name: "🆔 Server ID", value: guild.id, inline: true },
      { name: "📅 Created", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
      { name: "👥 Members", value: `${guild.memberCount}`, inline: true },
      { name: "💬 Text Channels", value: `${textChannels}`, inline: true },
      { name: "🔊 Voice Channels", value: `${voiceChannels}`, inline: true },
      { name: "🎭 Roles", value: `${roles}`, inline: true },
      { name: "🔒 Verification", value: verificationLevels[guild.verificationLevel] ?? "Unknown", inline: true },
      { name: "🚀 Boost", value: `${boostTier[guild.premiumTier] ?? "None"} (${guild.premiumSubscriptionCount ?? 0} boosts)`, inline: true },
    )
    .setFooter({ text: "GangBot • Server Info", iconURL: interaction.client.user?.displayAvatarURL() })
    .setTimestamp();

  if (guild.banner) {
    embed.setImage(guild.bannerURL({ size: 512 }) ?? null);
  }

  await interaction.reply({ embeds: [embed] });
}
