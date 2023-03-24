//----- MJS patches -----//
import * as url from 'url';
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const root = path.join(__dirname, '../..');
//-----//

const Discord = await import('discord.js');
const Builders = await import('@discordjs/builders');
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileTypeFromBuffer } from 'file-type';
const client_settings = new (await import('#classes/settings.js')).default();
import logger from '#classes/logger.mjs';
import I18n from '#classes/locales.js';
const i18n = new I18n('config');

class Config {
	#player_configure;
	constructor(player_configure)
	{
		this.#player_configure = player_configure;
	}

	options()
	{
		return [
			new Builders.SlashCommandBuilder()
		    .setName('config')
		    .setDescription(i18n.get("command_description"))
		    .setDescriptionLocalizations(i18n.all("command_description"))
		    .setDMPermission(false)
		    .setDefaultMemberPermissions(0x0000000000000020)
		    .addSubcommand(subcommand => 
		      subcommand.setName('player')
		        .setDescription(i18n.get("player.description"))
		        .setDescriptionLocalizations(i18n.all("player.description"))
		    )
		    .addSubcommand(subcommand => 
		      subcommand.setName('troll')
		        .setDescription(i18n.get("troll.description"))
		        .setDescriptionLocalizations(i18n.all("troll.description"))
		        .addAttachmentOption(option => 
		          option.setName('add_troll_song')
		            .setDescription(i18n.get("troll.add_troll"))
		            .setDescriptionLocalizations(i18n.all("troll.add_troll"))
		            .setRequired(false)
		        )
		    )
		    .addSubcommand(subcommand =>
		      subcommand.setName('language')
		        .setDescription(i18n.get("languages.description"))
		        .setDescriptionLocalizations(i18n.all("language.description"))
		        .addStringOption((option) => {
		          option.setName('locale')
		            .setDescription(i18n.get("languages.locale_description"))
		            .setDescriptionLocalizations(i18n.all("languages.locale_description"))
		            .setRequired(true)
		          for(let e of i18n.supported())
		          {
		            option.addChoices({name: i18n.get("languages.locales." + e), name_localizations: i18n.all("languages.locales." + e), value: e});
		          }
		          option.addChoices({name: i18n.get("languages.locales.not_mine"), name_localizations: i18n.all("languages.locales.not_mine"), value: "not_mine"});

		          return option;
		        })
		    )
		];
	}

	async interactionCreate(interaction)
	{
		//----- Chat Interactions -----//
		if(interaction.isChatInputCommand())
		{
			if(!['config'].includes(interaction.commandName)) return;
      if(!interaction.inGuild() || interaction.member === undefined)//The user is in a guild, and a Guildmember object for this user exists
      {
        await interaction.reply({ephemeral: true, content: i18n.get("errors.guild_only", interaction.locale)});
        return;
      }

      const subcommand = interaction.options.getSubcommand();
      logger.info([{tag: "u", value: interaction.user.id}, {tag: "g", value: interaction.guildId}], 'Command `config` -> `' + subcommand + '` received');

      if(!interaction.member.permissions.has(Discord.PermissionsBitField.Flags.ManageGuild))//Ne peut pas manage la guild
      {
        await interaction.reply({ content: i18n.get('errors.not_admin', interaction.locale), ephemeral: true }).catch((e) => { console.log('reply error : ' + e)});
        return;
      }

      if(subcommand === 'player')
      {
        this.#player_configure(interaction);
      }
      else if(subcommand === 'troll')
      {
        const new_troll_song = interaction?.options?.getAttachment("add_troll_song");
        if(new_troll_song != null)
        {
          const nb_songs = (await fs.promises.readdir(path.join(root, '/env_data/guilds/', interaction.guildId, '/soundboard/')).catch(() => [])).length;
          console.log(nb_songs);
          if(nb_songs >= 2)
          {
            if(await client_settings.isGolden(interaction.guildId, interaction.user.id))
            {
              if(nb_songs >= 5)
              {
                await interaction.reply({content: i18n.get("errors.troll_limit_golden", interaction.locale), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
                return;
              }
            }
            else
            {
              await interaction.reply({content: i18n.get("errors.troll_limit_normal", interaction.locale), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
              return;
            }
          }

          if(!new_troll_song.name ||
            !new_troll_song.attachment ||
            !new_troll_song.size)
          {
            await interaction.reply({content: i18n.get("errors.troll_attachment_fail", interaction.locale), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
            return;
          }
          if(new_troll_song.size > 5242880)
          {
            await interaction.reply({content: i18n.get("errors.troll_file_too_big", interaction.locale), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
            return;
          }

          await interaction.deferReply({ephemeral: true}).catch(e => console.log("deferReply error : " + e));

          const file_retrieved = await axios(new_troll_song.url, {
            responseType: 'arraybuffer'
          }).catch(() => {return false});
          if(file_retrieved === false || file_retrieved?.data === undefined)
          {
            await interaction.editReply({content: i18n.get("errors.troll_file_unavailable", interaction.locale)}).catch((e) => {console.log('editReply error : ' + e)});
            return;
          }

          const test_result = await fileTypeFromBuffer(file_retrieved.data)
          console.log(test_result);
          if(!test_result?.mime?.startsWith('audio/'))
          {
            await interaction.editReply({content: i18n.get("errors.troll_not_song", interaction.locale)}).catch((e) => {console.log('editReply error : ' + e)});
            return;
          }
          console.log(path.parse(new_troll_song.name).name);

          const song_name = path.parse(new_troll_song.name).name.replace(/[^ a-z0-9éèà&#@\]\[{}()_-]/gi, "_");
          await client_settings.addTrollSong(interaction.guildId, song_name, file_retrieved.data);

          await interaction.editReply({content: i18n.place(i18n.get("troll.song_uploaded", interaction.locale), {song: song_name})}).catch((e) => {console.log('editReply error : ' + e)});
        }
        else
        {
          await interaction.reply(await this.#generate_troll_config(interaction.guildId, interaction.user.id, interaction.locale)).catch((e) => {console.log('reply error : ' + e)});
        }
        return;
      }
      else if(subcommand === 'language')
      {
        let choosen_locale = interaction.options.getString("locale", true);

        if(i18n.exists(choosen_locale))
        {
          let config = await client_settings.get(interaction.guildId, 1, 'config');
          if(config === false)
          {
            await interaction.reply({content: i18n.get('errors.settings', interaction.locale), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
            return;
          }

          logger.info([{tag: "g", value: interaction.guildId}], 'Set language of the server to ' + choosen_locale);
          config.locale = choosen_locale;
          await client_settings.set(interaction.guildId, 1, 'config', config);
          await interaction.reply({content: i18n.place(i18n.get('languages.change_done', interaction.locale), {language: i18n.get("languages.locales." + choosen_locale, interaction.locale)}), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
        }
        else
        {
          await interaction.reply({content: i18n.get('languages.language_doesnt_exists', interaction.locale), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
        }
      }
      else await interaction.reply({ content: i18n.get('errors.unknown_subcommand', interaction.locale), ephemeral: true }).catch((e) => { console.log('reply error : ' + e)});
      return;
		}
		else if(interaction.isButton())
		{
			if(interaction.customId === "disable_troll")
      {
        let config = await client_settings.get(interaction.guildId, 1, 'config');
        if(config === false)
        {
          await interaction.reply({content: i18n.get('errors.settings_panel_fail', interaction.locale), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
          return;
        }

        if(config.trollDisabled) config.trollDisabled = false;
        else config.trollDisabled = true;
        await client_settings.set(interaction.guildId, 1, 'config', config);
        await interaction.update(await this.#generate_troll_config(interaction.guildId, interaction.user.id, interaction.locale)).catch((e) => {console.log('update error : ' + e)});
      }

      else if(interaction.customId.startsWith('delete_troll_'))
      {
        if(!interaction.inGuild() || interaction.guildId === undefined)
        {
          await interaction.reply({ephemeral: true, content: i18n.get("errors.guild_only", interaction.locale)});
          return;
        }

        const troll_index = interaction.customId.split('_').splice(-1)[0];
        const troll_songs = await fs.promises.readdir(path.join(root, '/env_data/guilds/', interaction.guildId, '/soundboard/')).catch(() => [])
        if(troll_songs[troll_index-1] === undefined)
        {
          await interaction.reply({content: i18n.get('errors.settings', interaction.locale), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
          return;
        }

        if(!fs.existsSync(path.join(root, '/env_data/guilds/', interaction.guildId, '/soundboard/', troll_songs[troll_index-1])))
        {
          await interaction.reply({content: i18n.get('errors.settings', interaction.locale), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
          return;
        }
        await fs.promises.unlink(path.join(root, '/env_data/guilds/', interaction.guildId, '/soundboard/', troll_songs[troll_index-1])).catch((e) => console.log('Failed to delete troll song ' + troll_songs[troll_index-1] + ' : ' + e));

        await interaction.update(await this.#generate_troll_config(interaction.guildId, interaction.user.id, interaction.locale)).catch((e) => {console.log('update error : ' + e)});
      }
		}
	}

	async #generate_troll_config(guild_id, user_id, locale)
	{
	  let guild_config = await client_settings.get(guild_id, 1, 'config')
	  if(guild_config === false)
	  {
	    return {content: i18n.get('errors.settings_panel_fail', locale), ephemeral: true};
	  }

	  let custom_troll = [];
	  let delete_buttons = [];
	  let edit_buttons = [];
	  let count = 0;
	  for(let e of await fs.promises.readdir(path.join(root, '/env_data/guilds/', guild_id, '/soundboard/')).catch(() => []))
	  {
	    count++;
	    custom_troll.push("**" + count + ".** " + e.split('.')[0]);
	    if(count <= 5)
	    {
	      delete_buttons.push(new Discord.ButtonBuilder()
	        .setStyle(4)
	        .setCustomId("delete_troll_" + count)
	        .setLabel(i18n.place(i18n.get("troll.delete_button", locale), {pos: count}))
	        .setEmoji({name: "delete", id: "1082771385253888102"})
	      );

	      /*edit_buttons.push(new Discord.ButtonBuilder()
	        .setStyle(1)
	        .setCustomId("edit_troll_" + count)
	        .setLabel(i18n.place(i18n.get("config.troll.edit_button", locale), {pos: count}))
	        .setEmoji({name: "edit", id: "1082771386898059304"})
	      );*/
	    }
	  }
	  while(custom_troll.length < 5)
	  {
	    count++;
	    if(count > 2)
	    {
	      if(await client_settings.isGolden(guild_id, user_id))
	      {
	        custom_troll.push("**" + count + ".** " + i18n.get("troll.empty_troll_slot"));
	      }
	      else
	      {
	        custom_troll.push("**" + count + ".** " + i18n.get("troll.locked_troll_slot"));
	      }
	    }
	    else
	    {
	      custom_troll.push("**" + count + ".** " + i18n.get("troll.empty_troll_slot"));
	    }
	  }

	  let troll_settings_embed = new Discord.EmbedBuilder()
	  .setColor([0x2b, 0x2d, 0x31])

	  troll_settings_embed.setTitle(i18n.get("troll.embed_title", locale));
	  troll_settings_embed.setDescription(
	    i18n.place(
	      i18n.get("troll.embed_description", locale), {
	        trollDisabled: (guild_config.trollDisabled ? i18n.get("troll.trollDisabled_text") : i18n.get("troll.trollEnabled_text")),
	        trollSongs: custom_troll.join('\n')
	      }
	    )
	  );
	  let config_components = [
	    new Discord.ActionRowBuilder().addComponents([
	      new Discord.ButtonBuilder()
	        .setCustomId("disable_troll")
	        .setStyle(guild_config.trollDisabled ? 4 : 3)
	        .setLabel(i18n.get(guild_config.trollDisabled ? "troll.enable_troll_btn" : "troll.disable_troll_btn", locale))
	    ]),
	  ];
	  if(edit_buttons.length) config_components.push(new Discord.ActionRowBuilder().addComponents(edit_buttons));
	  if(delete_buttons.length) config_components.push(new Discord.ActionRowBuilder().addComponents(delete_buttons));

	  return {content: '', embeds: [troll_settings_embed], components: config_components, ephemeral: true};
	}
}

export default Config;