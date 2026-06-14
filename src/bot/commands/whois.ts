import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  PermissionsBitField,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("whois")
  .setDescription("Deep dive on someone — Dyno style 🕵️")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("Who you investigatin?").setRequired(false)
  );

const KEY_PERMISSIONS: [keyof typeof PermissionsBitField.Flags, string][] = [
  ["Administrator", "⚡ Administrator"],
  ["ManageGuild", "🔧 Manage Server"],
  ["ManageChannels", "📺 Manage Channels"],
  ["ManageRoles", "🎭 Manage Roles"],
  ["ManageMessages", "💬 Manage Messages"],
  ["BanMembers", "🔨 Ban Members"],
  ["KickMembers", "👟 Kick Members"],
  ["MuteMembers", "🔇 Mute Members"],
  ["MentionEveryone", "📢 Mention Everyone"],
  ["ManageNicknames", "✏️ Manage Nicknames"],
  ["ManageWebhooks", "🔗 Manage Webhooks"],
  ["ViewAuditLog", "📋 View Audit Log"],
];

export async function execute(interaction: ChatInputCommandInteraction) {
  const targetUser = interaction.options.getUser("user") ?? interaction.user;
  const guild = interaction.guild;

  let member: GuildMember | null = null;
  if (guild) {
    member = await guild.members.fetch(targetUser.id).catch(() => null);
  }

  const keyPerms = member
    ? KEY_PERMISSIONS.filter(([flag]) =>
        member!.permissions.has(PermissionsBitField.Flags[flag])
      ).map(([, label]) => label)
    : [];

  const roleList =
    member?.roles.cache
      .filter((r) => r.id !== guild?.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => r.toString())
      .slice(0, 15)
      .join(" ") ?? "None";

  const isOwner = guild?.ownerId === targetUser.id;
  const badges: string[] = [];
  if (isOwner) badges.push("👑 Server Owner");
  if (targetUser.bot) badges.push("🤖 Bot");
  if (member?.premiumSince) badges.push("🚀 Server Booster");

  const embed = new EmbedBuilder()
    .setColor(member?.displayColor || 0xe74c3c)
    .setAuthor({
      name: `${targetUser.tag} — Who is this?`,
      iconURL: targetUser.displayAvatarURL(),
    })
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "🆔 User", value: `${targetUser} (${targetUser.id})`, inline: false },
      { name: "📅 Account Created", value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R> (<t:${Math.floor(targetUser.createdTimestamp / 1000)}:D>)`, inline: false },
    )
    .setFooter({ text: `GangBot • Whois | Requested by ${interaction.user.tag}` })
    .setTimestamp();

  if (member) {
    embed.addFields(
      { name: "📆 Joined Server", value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R> (<t:${Math.floor(member.joinedAt.getTime() / 1000)}:D>)` : "Unknown", inline: false },
    );

    if (member.nickname) {
      embed.addFields({ name: "📝 Nickname", value: member.nickname, inline: true });
    }

    if (badges.length > 0) {
      embed.addFields({ name: "🏅 Badges", value: badges.join(" • "), inline: false });
    }

    embed.addFields(
      { name: `🎭 Roles [${member.roles.cache.size - 1}]`, value: roleList || "None", inline: false },
    );

    if (keyPerms.length > 0) {
      embed.addFields({
        name: "🔑 Key Permissions",
        value: keyPerms.join(" • "),
        inline: false,
      });
    }
  }

  await interaction.reply({ embeds: [embed] });
}
