import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("fakeban")
  .setDescription("PRETEND ban someone (it's fake, chill 😂)")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((opt) =>
    opt.setName("user").setDescription("Who you faking to ban?").setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName("reason").setDescription("Reason for the fake ban").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") ?? "No reason given (still fake tho)";

  const gangReasons = [
    "was snitchin 🐀",
    "violated the code 💀",
    "was movin too sus",
    "talked crazy to the gang",
    "had no drip whatsoever",
    "wasn't built like that",
  ];

  const displayReason =
    reason === "No reason given (still fake tho)"
      ? gangReasons[Math.floor(Math.random() * gangReasons.length)]!
      : reason;

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("🔨 Member Banned")
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "Banned User", value: `${target.tag} (${target.id})`, inline: true },
      { name: "Banned By", value: `${interaction.user.tag}`, inline: true },
      { name: "Reason", value: displayReason },
    )
    .setFooter({ text: "GangBot Moderation" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  await interaction.followUp({
    content: `> ⚠️ **(THIS IS A FAKE BAN — ${target} is still in the server, lmaooo 💀)**`,
  });
}
