//----- MJS patches -----//
import * as url from 'url';
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
//-----//

const Discord = await import('discord.js');
import logger from '#classes/logger.mjs';
import fs from 'fs';
import axios from 'axios';
import si from 'systeminformation';
import miscs from '#classes/miscs.js';
import I18n from '#classes/locales.js';
const i18n = new I18n('misc');
import env_variables from '#root/env_data/env.json' assert { type: 'json' };

class Misc {
	total_players = 0;
	local_players;
	#client;
	constructor(client, local_players)
	{
		this.#client = client;
		this.local_players = local_players
	}

	options()
	{
		return [
			{
				name: "changelog",
				description: i18n.get("changelog.command_description"),
				descriptionLocalizations: i18n.all("changelog.command_description"),
				type: 1,
				dmPermission: true
			},
			{
				name: "feedback",
				description: i18n.get("feedback.command_description"),
				descriptionLocalizations: i18n.all("feedback.command_description"),
				type: 1,
				dmPermission: true
			},
			{
				name: "stats",
				description: i18n.get("stats.command_description"),
				descriptionLocalizations: i18n.all("stats.command_description"),
				type: 1,
				dmPermission: true
			},
			{
				name: "known_issues",
				description: i18n.get("known_issues.command_description"),
				descriptionLocalizations: i18n.all("known_issues.command_description"),
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
			if(!['changelog', "feedback", "known_issues", "stats"].includes(interaction.commandName)) return;
			logger.info('Command `' + interaction.commandName + '` received', [{tag: "u", value: interaction.user.id}]);

			if(interaction.commandName === 'changelog')
	    {
	      if(fs.existsSync(__dirname + '/changelog.json'))
	      {
	        let file_content = await fs.promises.readFile(__dirname + '/changelog.json', {encoding: 'utf-8'});
	        if(miscs.isJsonString(file_content))
	        {
	          file_content = JSON.parse(file_content);

	          let fields = [];
	          for(let e of file_content.slice(-10))
	          {
	            let commits = e.commits.map(x => '- ' + x + '\n').join('');
	            fields.push({inline: false, name: e.version, value: commits});
	          }

	          await interaction.reply({content: "", embeds: [{color: 0x2f3136, fields: fields, title: "BaBot changelog"}]});
	        }
	        else await interaction.reply({content: i18n.get("changelog.corrupted", interaction.locale)});
	      }
	      else await interaction.reply({content: i18n.get("changelog.not_found", interaction.locale)});
	      return;
	    }

	    else if(interaction.commandName === 'known_issues')
	    {
	      await interaction.reply({content: i18n.get("known_issues.content", interaction.locale)});
	      return;
	    }

	    else if(interaction.commandName === 'stats')
	    {
	      const ping = Date.now() - interaction.createdTimestamp;
	      await interaction.deferReply();

	      await interaction.editReply({content: "", embeds: [
	        {
	          color: 0x2b2d31,
	          title: i18n.place(i18n.get("stats.title", interaction.locale), {name: env_variables.name}),
	          description: i18n.place(i18n.get("stats.content", interaction.locale), {
	            servers_count: (await miscs.asyncTimeout(this.#client.shard.fetchClientValues('guilds.cache.size'), 10000).catch(() => {return []})).reduce((acc, guildCount) => acc + guildCount, 0),
	            shards_count: this.#client.shard.count,
	            shard: this.#client.shard.ids[0],
	            ping,
	            total_players: this.total_players,
	            shard_players: this.local_players(),
	            uptime: Math.round((Date.now() - this.#client.uptime)/1000),
	            used_ram: (Math.round((await si.mem()).active/10000000) / 100),
	            total_ram: (Math.round((await si.mem()).total/10000000) / 100),
	            cpu_usage: (Math.round((await si.currentLoad()).currentLoad * 10) / 10),
	            avg_temp: (Math.round((await si.cpuTemperature()).main * 10) / 10),
	            max_temp: (Math.round((await si.cpuTemperature()).max * 10) / 10)
	          }),
	          footer: {
	            text: i18n.get("stats.footer_text", interaction.locale)
	          }
	        }
	      ]});

	      //--- Internal stats ---//
	      for(let i = 0; i < this.#client?.shard?.count; i++)
	      {
	        const shard_running = await miscs.asyncTimeout(this.#client.shard.broadcastEval((client) => { return client.isReady() ? "Running" : "Stopped"}, {shard: i}), 2000).catch(() => "No response");
	        logger.info("Shard " + (i + "     ").substring(0, 7) + " : " + shard_running);
	      }
	      //---//
	      return;
	    }
	    else if(interaction.commandName === 'feedback')
	    {
	      interaction.showModal(new Discord.ModalBuilder().addComponents([
	        new Discord.ActionRowBuilder().addComponents([
	          new Discord.TextInputBuilder()
	            .setCustomId("feedback")
	            .setPlaceholder(i18n.get('feedback.modal_placeholder', interaction.locale))
	            .setStyle(2)
	            .setLabel(i18n.get('feedback.modal_textinput_label', interaction.locale))
	        ])
	      ])
	      .setCustomId("modal_feedback")
	      .setTitle(i18n.get('feedback.modal_title', interaction.locale))
	      );
	      return;
	    } 
	    else await interaction.reply({content: i18n.get('errors.interaction', interaction.locale), ephemeral: true });
			return;
		}
		else if(interaction.isModalSubmit())
	  {
	    if(interaction.customId !== "modal_feedback") return;

      await axios({
          url: env_variables.webhook_return + "?wait=true",
          method: "POST",
          data: {username: "Feedback about BaBot", embeds: [{title: "New feedback", description: interaction.fields.getTextInputValue('feedback'), author: {name: interaction.user.tag + '(' + interaction.user.id + ')', iconURL: interaction.user.avatarURL()}, color: 0x2b2d31}]}
      }).then(function(){
          logger.info('New feedback logged in the server');
      }, function(e) {
          logger.info('Error when logging feedback of ' + interaction.user.tag + '(' + interaction.user.id + ')');
          logger.info('Feedback content : ' + interaction.fields.getTextInputValue('feedback'));
      });

      await interaction.reply({content: i18n.get('feedback.submitted', interaction.locale), ephemeral: true});
      return;
    }
	}
}

export default Misc;