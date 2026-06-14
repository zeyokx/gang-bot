import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
} from "discord.js";
import { addTalkChannel, removeTalkChannel, getTalkChannels } from "../storage.js";

export const data = new SlashCommandBuilder()
  .setName("setchanneltalk")
  .setDescription("Set a channel where the bot will talk gang 🔫")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a channel for the bot to talk in")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("The channel to enable gang talk in")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a channel from gang talk")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("The channel to disable gang talk in")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List all gang talk channels")
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "This command can only be used in a server, fam. 🙅", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "add") {
    const channel = interaction.options.getChannel("channel", true) as TextChannel;

    const botMember = interaction.guild?.members.me;
    if (!botMember?.permissionsIn(channel).has(PermissionFlagsBits.SendMessages)) {
      await interaction.reply({
        content: `Aye, I ain't got talk permission in ${channel}, fam. Give me **Send Messages** perms first. 🚫`,
        ephemeral: true,
      });
      return;
    }

    addTalkChannel(guildId, channel.id);
    await interaction.reply({
      content: `Bet 🤙 Gang talk is now ON in ${channel}. I'll be spittin facts in there. No cap 🧢`,
    });

  } else if (sub === "remove") {
    const channel = interaction.options.getChannel("channel", true) as TextChannel;
    const removed = removeTalkChannel(guildId, channel.id);
    if (removed) {
      await interaction.reply({
        content: `Aight, I'm chilling in ${channel} now. Gang talk OFF. 🤫`,
      });
    } else {
      await interaction.reply({
        content: `Bruh, that channel wasn't even in the list. ${channel} ain't a gang talk channel, fam. 💀`,
        ephemeral: true,
      });
    }

  } else if (sub === "list") {
    const channels = getTalkChannels(guildId);
    if (channels.length === 0) {
      await interaction.reply({
        content: "No cap, ain't no gang talk channels set up yet. Use `/setchanneltalk add` to get started, fam. 👀",
        ephemeral: true,
      });
    } else {
      const list = channels.map((id) => `<#${id}>`).join("\n");
      await interaction.reply({
        content: `Gang talk active in these channels, no cap:\n${list}`,
        ephemeral: true,
      });
    }
  }
}
