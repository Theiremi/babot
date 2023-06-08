'use strict';

const Discord = await import('discord.js');
import logger from '#classes/logger.mjs';
import I18n from '#classes/locales.js';
const i18n = new I18n('user_config');

class UserConfig {
	#client
	constructor(client)
	{
		this.#client = client
	}

	options()
	{
		return [
			{
				name: "dashboard",
				description: i18n.get("dashboard.command_description"),
				descriptionLocalizations: i18n.all("dashboard.command_description"),
				type: 1,
				dmPermission: true
			},
			{
				name: "settings",
				description: i18n.get("settings.command_description"),
				descriptionLocalizations: i18n.all("settings.command_description"),
				type: 1,
				dmPermission: true
			}
		];
	}

	async interactionCreate(interaction)
	{
		//----- Chat Interactions -----//
		if(interaction.isChatInputCommand())
		{
			if(!['dashboard', 'settings'].includes(interaction.commandName)) return;

      if(interaction.commandName === 'dashboard')
	    {
	    	logger.info('Command `dashboard` received', [{tag: "u", value: interaction.user.id}]);
	      await interaction.deferReply();

	      const user_golden = await this.#client.stored_data.isUserGolden(interaction.user.id);
	      const user_profile = await this.#client.stored_data.profile(interaction.user.id);
	      const user_config = await this.#client.stored_data.hGetAll(`user:${interaction.user.id}:config`);

	      if(user_config === false)
	      {
	      	logger.warn('Settings function broken in `dashboard`', [{tag: "u", value: interaction.user.id}]);
	        await interaction.reply({content: i18n.get('errors.settings', interaction.locale), ephemeral: true});
	        return;
	      }

	      let dash_embed = new Discord.EmbedBuilder()
	        .setColor([0x62, 0xD5, 0xE9])
	        .setThumbnail(interaction.user.avatarURL())
	        .setTitle((user_golden ? "<:golden:1065239445625917520>" : "") + i18n.place(i18n.get("dashboard.panel_title", interaction.locale), {username: interaction.user.username}))
	        .setFields([
	          {name: i18n.get("dashboard.is_premium_label", interaction.locale), value: user_golden ? i18n.get("dashboard.is_golden", interaction.locale) : i18n.get("dashboard.is_normal", interaction.locale), inline: true},
	          {name: "Profile", value: i18n.get("dashboard.user_profile_" + user_profile, interaction.locale), inline: true},
	          {name: "Can be trolled ?", value: user_config.limited_troll ? "No" : "Yes", inline: false},
	          {name: i18n.get("dashboard.playlists_label", interaction.locale), value: "Coming a day or another", inline: false}
	        ])
	      let dash_components = [
	        new Discord.ActionRowBuilder().addComponents([
	          new Discord.ButtonBuilder()
	            .setCustomId("settings")
	            .setStyle(2)
	            .setEmoji({name: "setting", id: "1065258170144018432"})
	            .setLabel(i18n.get("dashboard.settings_btn", interaction.locale))
	        ])
	      ];

	      await interaction.editReply({embeds: [dash_embed], components: dash_components});
	      return;
	    }
	    else if(interaction.commandName === 'settings')
	    {
	      logger.info('Command `settings` received', [{tag: "u", value: interaction.user.id}]);
	      await interaction.reply(await this.#generate_user_settings(interaction.user, interaction.locale));
	      return;
	    }
	    else await interaction.reply({content: i18n.get('errors.unknown_subcommand', interaction.locale), ephemeral: true });
	    return;
		}
		else if(interaction.isButton())
		{
			if(!['settings'].includes(interaction.customId) &&
      	!interaction.customId.startsWith('btn_disable_troll_')) return;

			if(interaction.customId === "settings")
      {
        await interaction.reply(await this.#generate_user_settings(interaction.user, interaction.locale));
        return;
      }

      else if(interaction.customId.startsWith('btn_disable_troll_'))
      {
        const panel_id = interaction.customId.split('_').splice(-1)[0];
        if(panel_id !== interaction.user.id)
        {
        	logger.notice('Settings panel used by an unathorized user', [{tag: "u", value: interaction.user.id}]);
          await interaction.reply({content: i18n.get('settings.not_authorized_user', interaction.locale), ephemeral: true});
          return;
        }
        const limited_troll = await this.#client.stored_data.hGet(`user:${interaction.user.id}:config`, 'trollDisabled');

        if(limited_troll) limited_troll = false;
        else limited_troll = true;
        await this.#client.stored_data.hSet(`user:${interaction.user.id}:config`, 'trollDisabled', limited_troll);
        await interaction.update(await this.#generate_user_settings(interaction.user, interaction.locale));
      }
		}
	}

	async #generate_user_settings(user, locale)
	{
	  const user_config = await this.#client.stored_data.get(user.id, 0, 'config')
	  if(user_config === false)
	  {
	  	logger.warn('Settings function broken in generate_user_settings`', [{tag: "u", value: interaction.user.id}]);
	    return {content: i18n.get('errors.settings_panel_fail', locale), ephemeral: true};
	  }

	  let settings_embed = new Discord.EmbedBuilder()
	    .setColor([0x62, 0xD5, 0xE9])
	    .setTitle(i18n.place(i18n.get("settings.panel_title", locale), {username: user.username}))
	    .setDescription(i18n.get("settings.panel_content", locale));
	  let settings_components = [
	    new Discord.ActionRowBuilder().addComponents([
	      new Discord.ButtonBuilder()
	        .setCustomId("btn_disable_troll_" + user.id)
	        .setStyle(user_config.limited_troll ? 3 : 2)
	        .setLabel(i18n.get("settings.disable_troll_btn", locale))
	    ])
	  ];
	  
	  return {embeds: [settings_embed], components: settings_components, ephemeral: true};
	}
}

export default UserConfig;