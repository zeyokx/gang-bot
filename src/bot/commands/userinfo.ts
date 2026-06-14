import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("userinfo")
  .setDescription("Get info on a member, no cap 👀")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("Who you wanna check on?").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const targetUser = interaction.options.getUser("user") ?? interaction.user;
  const guild = interaction.guild;

  let member: GuildMember | null = null;
  if (guild) {
    member = await guild.members.fetch(targetUser.id).catch(() => null);
  }

  const statusEmoji: Record<string, string> = {
    online: "🟢 Online",
    idle: "🟡 Idle",
    dnd: "🔴 Do Not Disturb",
    offline: "⚫ Offline",
  };

  const presence = member?.presence?.status ?? "offline";

  const roles =
    member?.roles.cache
      .filter((r) => r.id !== guild?.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => r.toString())
      .slice(0, 10)
      .join(", ") ?? "None";

  const embed = new EmbedBuilder()
    .setColor(member?.displayColor || 0x2ecc71)
    .setTitle(`👤 ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "🏷️ Tag", value: targetUser.tag, inline: true },
      { name: "🆔 User ID", value: targetUser.id, inline: true },
      { name: "🤖 Bot?", value: targetUser.bot ? "Yes 🤖" : "No 👤", inline: true },
      { name: "📅 Account Created", value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:D>`, inline: true },
    )
    .setFooter({ text: "GangBot • User Info" })
    .setTimestamp();

  if (member) {
    embed.addFields(
      { name: "📆 Joined Server", value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:D>` : "Unknown", inline: true },
      { name: "📶 Status", value: statusEmoji[presence] ?? "⚫ Offline", inline: true },
      { name: "🎖️ Highest Role", value: member.roles.highest.toString(), inline: true },
      { name: `🎭 Roles (${member.roles.cache.size - 1})`, value: roles || "None" },
    );

    if (member.nickname) {
      embed.addFields({ name: "📝 Nickname", value: member.nickname, inline: true });
    }
  }

  await interaction.reply({ embeds: [embed] });
}
