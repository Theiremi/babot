const Discord = await import('discord.js');
const Builders = await import('@discordjs/builders');
import logger from '#classes/logger.mjs';
import I18n from '#classes/locales.js';
const i18n = new I18n('help');

class Help {
	constructor()
	{
	}

	options()
	{
		return [
			new Builders.SlashCommandBuilder()
				.setName('help')
				.setDescription(i18n.get("command_description"))
				.setDescriptionLocalizations(i18n.all("command_description"))
				.setDMPermission(true)
				.addStringOption(option => option
					.setName('section')
					.setDescription(i18n.get("section_description"))
					.setDescriptionLocalizations(i18n.all("section_description"))
					.setRequired(false)
					.addChoices(...[
						{name: i18n.get("sections.start"), name_localizations: i18n.all("sections.start"), value: "start"},
						{name: i18n.get("sections.faq"), name_localizations: i18n.all("sections.faq"), value: "faq"},
						{name: i18n.get("sections.player"), name_localizations: i18n.all("sections.player"), value: "player"},
						{name: i18n.get("sections.troll"), name_localizations: i18n.all("sections.troll"), value: "troll"},
						{name: i18n.get("sections.golden"), name_localizations: i18n.all("sections.golden"), value: "golden"},
						{name: i18n.get("sections.contribute"), name_localizations: i18n.all("sections.contribute"), value: "contribute"}
					])
				)
		];
	}

	async interactionCreate(interaction)
	{
		//----- Chat Interactions -----//
		if(interaction.isChatInputCommand())
		{
			if(!['help'].includes(interaction.commandName)) return;
			logger.info('Command `help` received', [{tag: "u", value: interaction.user.id}]);

			let section = interaction.options.getString('section') ?? "start";
			await interaction.reply(this.#generate_help(section, interaction.locale)).catch(logger.error);
		}
		else if(interaction.isStringSelectMenu())
		{
			if(!["help_section"].includes(interaction.customId)) return;
			logger.info('SelectMenu `help_section` received', [{tag: "u", value: interaction.user.id}]);

			if(!interaction?.values[0]) return;

			if(!['start', 'faq', 'player', 'troll', 'contribute', 'golden'].includes(interaction.values[0])) return;

			await interaction.update(this.#generate_help(interaction.values[0], interaction.locale));
			return;
		}
	}

	#generate_help(section, locale)
	{
	  let returned_embed = {};
	  let returned_components = [];
	  returned_components.push(new Discord.ActionRowBuilder().addComponents([
	    new Discord.StringSelectMenuBuilder()
	      .setCustomId("help_section")
	      .setMinValues(1)
	      .setMaxValues(1)
	      .setPlaceholder("How the hell have you managed to display this sentence ?!")
	      .setOptions(...[
	        {label: i18n.get("sections.start", locale), value: "start", default: section === "start", emoji: {name: "🤔"}},
	        {label: i18n.get("sections.faq", locale), value: "faq", default: section === "faq", emoji: {name: "❓"}},
	        {label: i18n.get("sections.player", locale), value: "player", default: section === "player", emoji: {name: "lineplay_now", id: "1071121142020046920"}},
	        {label: i18n.get("sections.troll", locale), value: "troll", default: section === "troll", emoji: {name: "🤪"}},
	        {label: i18n.get("sections.golden", locale), value: "golden", default: section === "golden", emoji: {name: "golden", id: "1065239445625917520"}},
	        {label: i18n.get("sections.contribute", locale), value: "contribute", default: section === "contribute", emoji: {name: "🫵"}}
	      ])
	  ]));

	  if(section === 'golden')
	  {
	    returned_embed = {
	      title: i18n.get("golden.title", locale),
	      color: 0x62D5E9,
	      description: i18n.get("golden.description", locale),
	      fields: [
	        {name: i18n.get("golden.field_1.name", locale), value: i18n.get("golden.field_1.value", locale)},
	        {name: i18n.get("golden.field_2.name", locale), value: i18n.get("golden.field_2.value", locale)},
	        {name: i18n.get("golden.field_3.name", locale), value: i18n.get("golden.field_3.value", locale)},
	        {name: i18n.get("golden.field_4.name", locale), value: i18n.get("golden.field_4.value", locale)}
	      ],
	    };
	    returned_components.push(new Discord.ActionRowBuilder().addComponents([
	      new Discord.ButtonBuilder()
	        .setStyle(5)
	        .setEmoji({name: "golden", id: "1065239445625917520"})
	        .setLabel(i18n.get("golden.tip_button", locale))
	        .setURL('https://patreon.com/user?u=85252153')
	    ]));
	  }
	  else if(section === 'start')
	  {
	    returned_embed = {
	      title: i18n.get("start.title", locale),
	      color: 0x62D5E9,
	      description: i18n.get("start.description", locale),
	      fields: [
	        {name: i18n.get("start.field_1.name", locale), value: i18n.get("start.field_1.value", locale)},
	        {name: i18n.get("start.field_2.name", locale), value: i18n.get("start.field_2.value", locale)},
	        {name: i18n.get("start.field_3.name", locale), value: i18n.get("start.field_3.value", locale)},
	        {name: i18n.get("start.field_4.name", locale), value: i18n.get("start.field_4.value", locale)}
	      ]
	    }
	  }
	  else if(section === 'player')
	  {
	    returned_embed = {
	      title: i18n.get("player.title", locale),
	      color: 0x62D5E9,
	      description: i18n.get("player.description", locale),
	      image: {url: "https://babot.theireply.fr/player_demo2.png"},
	      fields: [
	        {name: i18n.get("player.field_1.name", locale), value: i18n.get("player.field_1.value", locale)},
	        {name: i18n.get("player.field_2.name", locale), value: i18n.get("player.field_2.value", locale)},
	        {name: i18n.get("player.field_3.name", locale), value: i18n.get("player.field_3.value", locale)}
	      ]
	    }
	  }
	  else if(section === 'troll')
	  {
	    returned_embed = {
	      title: i18n.get("troll.title", locale),
	      color: 0x62D5E9,
	      description: i18n.get("troll.description", locale),
	      fields: [
	        {name: i18n.get("troll.field_1.name", locale), value: i18n.get("troll.field_1.value", locale)},
	        {name: i18n.get("troll.field_2.name", locale), value: i18n.get("troll.field_2.value", locale)},
	        {name: i18n.get("troll.field_3.name", locale), value: i18n.get("troll.field_3.value", locale)}
	      ]
	    }
	  }
	  else if(section === 'contribute')
	  {
	    returned_embed = {
	      title: i18n.get("contribute.title", locale),
	      color: 0x62D5E9,
	      description: i18n.get("contribute.description", locale),
	      footer :{
	        text: i18n.get("contribute.footer", locale)
	      }
	    }
	  }
	  else if(section === 'faq')
	  {
	    returned_embed = {
	      title: i18n.get("faq.title", locale),
	      color: 0x62D5E9,
	      description: i18n.get("faq.description", locale),
	      fields: [
	        {name: i18n.get("faq.field_1.name", locale), value: i18n.get("faq.field_1.value", locale)},
	        {name: i18n.get("faq.field_2.name", locale), value: i18n.get("faq.field_2.value", locale)},
	        {name: i18n.get("faq.field_3.name", locale), value: i18n.get("faq.field_3.value", locale)}
	      ]
	    }
	  }
	  else return {content: i18n.get("errors.help_not_found", locale), embeds: [], components: returned_components};
	  return {content: "", embeds: [returned_embed], components: returned_components};
	}
}

export default Help;