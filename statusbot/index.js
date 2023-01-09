const fs = require('fs').promises;
const fsc = require('fs');
const Builders = require('@discordjs/builders');

module.exports = class Status {
	#_last_presence = {};
	#_discord;
	#_client;
	#_log_function

	constructor(discord, client, log)
	{
		this.#_discord = discord;
		this.#_client = client;
		this.#_log_function = log;
	}

	options() {
		let player_commands = new Builders.SlashCommandBuilder();
		player_commands.setName("statushistory");
		player_commands.setDescription("Display the entire recorded status history of the selected person");
		player_commands.setDescriptionLocalization('fr', "Ensemble des statuts de l'utilisateur sélectionné");
		player_commands.setDescriptionLocalization('en-US', "Display the entire recorded status history of the selected person");
		player_commands.addUserOption((option) => {
			option.setName('user');
			option.setDescription('Targeted user');
			option.setDescriptionLocalization('fr', 'Utilisateur sélectionné');
			option.setDescriptionLocalization('en-US', 'Targeted user');
			option.setRequired(false);
			return option;
		});

		return player_commands.toJSON();
	}

	async presenceUpdate(oldUser, newUser)
	{
		if(!newUser.equals(this.#_last_presence))
		{
			this.#_last_presence = newUser;

			if(!fsc.existsSync(__dirname + '/discord_logging/status/' + newUser.userId))
			{
				await fs.appendFile(__dirname + '/discord_logging/status/' + newUser.userId, "", {encoding: 'utf-8'});
			}
			/*if(!fsc.existsSync(__dirname + '/discord_logging/online/' + newUser.userId))
			{
				await fs.appendFile(__dirname + '/discord_logging/online/' + newUser.userId, "", {encoding: 'utf-8'});
			}*/
			if(oldUser == undefined) return;

			if(typeof(oldUser.clientStatus) === 'object' && typeof(newUser.clientStatus) === 'object')
			{
				if(oldUser.clientStatus.web != newUser.clientStatus.web ||
					oldUser.clientStatus.desktop != newUser.clientStatus.desktop ||
					oldUser.clientStatus.mobile != newUser.clientStatus.mobile)
				{
					//this.#_log_function('Status', '[' + newUser.guild.id + '] Status change for user ' + newUser.user.tag);
					await fs.appendFile(__dirname + '/discord_logging/online/' + newUser.userId,
						JSON.stringify({timestamp: Math.round(Date.now() / 1000), status: newUser.status, devices: newUser.clientStatus}) + "\n",
						{encoding: 'utf-8'}
					);
				}
			}

			let status_file_content = (await fs.readFile(__dirname + '/discord_logging/status/' + newUser.userId, {encoding: 'utf-8'})).split('\n');
			status_file_content = status_file_content.filter(e => isJsonString(e));
			let oldStatus = status_file_content.length != 0 ? JSON.parse(status_file_content.slice(-1)[0]) : { emoji: {}};
			let newStatus = newUser.activities.filter(e => e.type == 4 ? true : false)[0];
			if(newStatus === undefined) newStatus = {};
			newStatus.emoji = newStatus.emoji == undefined ? {} : newStatus.emoji;

			if((oldStatus.state !== newStatus.state ||
				oldStatus.emoji.id !== newStatus.emoji.id ||
				oldStatus.emoji.name !== newStatus.emoji.name) && newStatus.state != undefined)
			{
				//this.#_log_function('Status', '[' + newUser.guild.id + '] Custom state change for ' + newUser.user.tag);
				let emoji_formatted = {};
				if(newStatus.emoji.id != undefined) emoji_formatted.id = newStatus.emoji.id;
				if(newStatus.emoji.name != undefined) emoji_formatted.name = newStatus.emoji.name;
				if(newStatus.emoji.url != undefined) emoji_formatted.url = newStatus.emoji.url;
				if(newStatus.emoji.identifier != undefined) emoji_formatted.identifier = newStatus.emoji.identifier;
				if(newStatus.emoji.animated != undefined) emoji_formatted.animated = newStatus.emoji.animated;

				await fs.appendFile(__dirname + '/discord_logging/status/' + newUser.userId,
					JSON.stringify({timestamp: Math.round(Date.now() / 1000),
						state: newStatus.state,
						emoji: emoji_formatted}) + "\n",
					{encoding: 'utf-8'}
				);
			}
		}
	}

	async interactionCreate(interaction) {
		if(interaction.isChatInputCommand())
		{
			if(interaction.commandName === 'statushistory')
			{
				let target_user;
				if(interaction.options.getMember('user') != null)//If a user is specified, target him
				{
					target_user = interaction.options.getMember('user');
				}
				else//Else, target the current user
				{
					target_user = interaction.member;
				}
				let file_content = "";
				if(fsc.existsSync(__dirname + '/discord_logging/status/' + target_user.id))
				{
					file_content = await fs.readFile(__dirname + '/discord_logging/status/' + target_user.id, {encoding: 'utf-8'});
				}

				let embeds = [];
				if(file_content !== "")
				{
					file_content = file_content.split('\n');

					let embeds_fields = [];
					while(file_content.length > 0)
					{
						embeds_fields.push(file_content.splice(0, 25));
					}
					
					for(let embed of embeds_fields)
					{
						let temp_fields = [];
						for(let field of embed)
						{
							if(isJsonString(field))
							{
								field = JSON.parse(field);
								let emoji = "";
								if(field.emoji.name != undefined)
								{
									if(field.emoji.id != undefined)
									{
										emoji = '<:' + field.emoji.name + ':' + field.emoji.id + '>'
									}
									else
									{
										emoji = field.emoji.name;
									}
								}
								let field_value = emoji + field.state
								temp_fields.push({inline: false,
									name: field.timestamp != undefined ? '<t:' + field.timestamp + ':R>' : "Unknown date",
									value: field_value == "" ? "{Status Removed}" : field_value
								});
							}
							else
							{
								//temp_fields.push({inline: false, name: "{Corrupted}", value: "{Corrupted status}"});
							}
						}
						embeds.push({title: target_user.user.tag + ' status history', fields: temp_fields, color: 0x3ba55d});
					}
				}
				else
				{
					embeds.push({title: target_user.user.tag + ' status history', content: "No history found for this user", color: 0x3ba55d});
				}
				console.log(embeds);
				interaction.reply({embeds: embeds});
			}
		}
	}
}

function isJsonString(str) {
		try {
				JSON.parse(str);
		} catch (e) {
				return false;
		}
		return true;
}