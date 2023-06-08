const Discord = await import('discord.js');
const Builders = await import('@discordjs/builders');
import logger from '#classes/logger.mjs';
import I18n from '#classes/locales.js';
const i18n = new I18n('privacy');

class Privacy {
	#client;
	constructor(client)
	{
		this.#client = client;
	}

	options()
	{
		return [
			new Builders.SlashCommandBuilder()
			.setName('privacy')
			.setDescription(i18n.get("command_description"))
			.setDescriptionLocalizations(i18n.all("command_description"))
			.setDMPermission(true)
			.addSubcommand(subcommand => 
			  subcommand.setName('policy')
				.setDescription(i18n.get("policy.description"))
				.setDescriptionLocalizations(i18n.all("policy.description"))
			)
			.addSubcommand(subcommand => 
			  subcommand.setName('retrieve')
				.setDescription(i18n.get("retrieve.description"))
				.setDescriptionLocalizations(i18n.all("retrieve.description"))
			)
			.addSubcommand(subcommand => 
			  subcommand.setName('delete')
				.setDescription(i18n.get("delete.description"))
				.setDescriptionLocalizations(i18n.all("delete.description"))
			)
		];
	}

	async interactionCreate(interaction)
	{
		//----- Chat Interactions -----//
		if(interaction.isChatInputCommand())
		{
			if(!['privacy'].includes(interaction.commandName)) return;

			const subcommand = interaction.options.getSubcommand();
			logger.info('Command `privacy` -> `' + subcommand + '` received', [{tag: "u", value: interaction.user.id}]);

			if(subcommand === 'policy')
			{
				await interaction.reply({
				  ephemeral: true,
				  embeds: [{
						title: i18n.get('policy.embed_title', interaction.locale),
						description: i18n.get('policy.embed_content', interaction.locale),
						footer: {
						  text: i18n.get('embed_footer', interaction.locale)
						}
				  }],
				  components: [
				  	new Discord.ActionRowBuilder().addComponents([
				  		new Discord.ButtonBuilder()
				  			.setLabel('Privacy Policy')
				  			.setURL('https://babot.theireply.fr/privacy_policy.html')
				  			.setStyle(5)
				  			.setEmoji("📃")
				  	])
				  ]
				});
			}
			else if(subcommand === 'retrieve')
			{
				await interaction.reply({
					ephemeral: true,
					embeds: [{
						title: i18n.get('retrieve.embed_title', interaction.locale),
						description: i18n.get('retrieve.embed_content', interaction.locale),
						footer: {
						  text: i18n.get('.embed_footer', interaction.locale)
						}
					}],
					components: [
						new Discord.ActionRowBuilder().addComponents([
							new Discord.ButtonBuilder()
								.setCustomId("privacy_retrieve")
								.setStyle(3)
								.setLabel(i18n.get('yes', interaction.locale)),
							new Discord.ButtonBuilder()
								.setCustomId("privacy_cancel")
								.setStyle(4)
								.setLabel(i18n.get('no', interaction.locale))
						])
					]
				});
			}
			else if(subcommand === 'delete')
			{
				await interaction.reply({
				  ephemeral: true,
				  embeds: [{
						title: i18n.get('delete.embed_title', interaction.locale),
						description: i18n.get('delete.embed_content', interaction.locale),
						footer: {
						  text: i18n.get('privacy.embed_footer', interaction.locale)
						}
				  }],
				  components: [
				  	new Discord.ActionRowBuilder().addComponents([
							new Discord.ButtonBuilder()
								.setCustomId("privacy_delete")
								.setStyle(4)
								.setLabel(i18n.get('delete.btn_yes', interaction.locale)),
							new Discord.ButtonBuilder()
								.setCustomId("privacy_cancel")
								.setStyle(3)
								.setLabel(i18n.get('delete.btn_no', interaction.locale))
						])
				  ]
				});
			}
			else await interaction.reply({content: i18n.get('errors.unknown_subcommand', interaction.locale), ephemeral: true });
			return;
		}
		else if(interaction.isButton())
		{
			if(!['privacy_cancel', 'privacy_delete', 'privacy_retrieve'].includes(interaction.customId)) return;

			if(interaction.customId === "privacy_cancel")
      {
        await interaction.update({
          embeds: [{
            title: i18n.get("cancel.embed_title", interaction.locale),
            description: i18n.get("cancel.embed_content", interaction.locale),
            footer: {
              text: i18n.get("embed_footer", interaction.locale)
            }
          }],
          components: []
        });
        return;
      }

      else if(interaction.customId === "privacy_delete")
      {
        await this.#client.stored_data.erase(interaction.user.id);

        await interaction.update({
          embeds: [{
            title: i18n.get("delete.embed_title", interaction.locale),
            description: i18n.get("delete.success", interaction.locale),
            footer: {
              text: i18n.get("embed_footer", interaction.locale)
            }
          }],
          components: []
        });
        return;
      }
      else if(interaction.customId === "privacy_retrieve")
      {
        await interaction.deferUpdate();
        let dm_channel = await interaction.user.createDM();
        let archive = await this.#client.stored_data.compress(interaction.user.id).catch(() => false);
        if(archive !== false)
        {
          await dm_channel.send({
            content: i18n.get("retrieve.dm_message", interaction.locale),
            files: [new Discord.AttachmentBuilder(archive, {name: "BaBot_data-" + interaction.user.id + ".zip"})]
          });
        }

        await interaction.editReply({
          embeds: [{
            title: i18n.get("retrieve.embed_title", interaction.locale),
            description: archive ? i18n.get("retrieve.success", interaction.locale) : i18n.get("retrieve.fail", interaction.locale),
            footer: {
              text: i18n.get("embed_footer", interaction.locale)
            }
          }],
          components: []
        });
        return;
      }
		}
	}
}

export default Privacy;