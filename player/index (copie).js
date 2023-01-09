const fs = require('fs').promises;
const Voice = require('@discordjs/voice');
const Builders = require('@discordjs/builders');
const child_process = require('child_process');
const axios = require('axios');

module.exports = class Player {
	#_players = {};
	/*
	{
		"guild_id": {
			player: player,
			current_track: 0,
			start_playing: 0,
			queue: [
				{
					name: "",
					link: "",
					play_link: "",
					thumbnail: "",
					duration: ""
				},
			]
		}
	}
	*/
	#_guilds_play_data = {};
	#_discord;
	#_client;
	constructor(discord, client)
	{
		this.#_discord = discord;
		this.#_client = client;
	}

	options()//Works
	{
		let player_commands = new Builders.SlashCommandBuilder();
		player_commands.setName("player");
		player_commands.setDescription("Interface du lecteur de son");

		return player_commands.toJSON();
	}

	async interactionCreate(interaction)
	{
		//----- Chat Interactions -----//
		if(interaction.isChatInputCommand())
		{
			if(!interaction.inGuild() || interaction.member == undefined)//The user is in a guild, and a Guildmember object for this user exists
			{
				await interaction.reply({ephemeral: true, content: '❌ You can only use this command in a guild'});
				return;
			}

			if(interaction.commandName === 'player')//Ask for a player to be displayed
			{
				if(interaction.member.voice.channelId === undefined)
				{
					await interaction.reply({ephemeral: true, content: '❌ Please join a voice channel'});
					return;
				}

				if(!this.#isObjectValid(interaction.guildId))
				{
					
					let channel_permissions = interaction.member.voice.channel.permissionsFor(interaction.guild.members.me, true);
					if(!interaction.member.voice.channel.viewable ||
						!channel_permissions.has(this.#_discord.PermissionsBitField.Flags.ViewChannel) ||
						!channel_permissions.has(this.#_discord.PermissionsBitField.Flags.Connect))//Connection to this channel is theorically allowed
					{
						await interaction.reply({ephemeral: true, content: '❌ I\'m not allowed to join your voice channel'});
						return;
					}
					else if(!interaction.member.voice.channel.speakable ||
						!channel_permissions.has(this.#_discord.PermissionsBitField.Flags.Speak))//Speaking is allowed
					{
						await interaction.reply({ephemeral: true, content: '❌ I\'m not allowed to speak in your voice channel'});
						return;
					}
					if(!interaction.member.voice.channel.joinable)//Channel is joinable : not fulle or we have permission to override this
					{
						await interaction.reply({ephemeral: true, content: '❌ Your voice channel is full (I need the "Move members" permission to override this)'});
						return;
					}

					await this.#initializeObject(interaction.guildId, interaction.member.voice.channelId);
				}
					
				if(this.#_guilds_play_data[interaction.guildId].voice_connection.joinConfig.channelId !== interaction.member.voice.channelId)
				{
					await interaction.reply({ephemeral: true, content: '❌ I\'m already used in an other channel'});
					return;
				}

				await interaction.reply(this.#generatePlayerInterface(interaction.guildId));
				this.#_guilds_play_data[interaction.guildId].player_interfaces.push(await interaction.fetchReply());
			}
		}
		//-----//

		//----- Buttons Interactions -----//
		else if(interaction.isButton())
		{
			if(!this.#isObjectValid(interaction.guildId))
			{
				interaction.reply({content: '❌ I\'m no longer in a vocal channel. Start a new playing session with the command `/player`', ephemeral: true});
				return;
			}
			if(!interaction.inGuild() && interaction.member != undefined)//The user is in a guild, and a Guildmember object for this user exists
			{
				await interaction.reply({ephemeral: true, content: '❌ You can only use this command in a guild'});
				return;
			}
			if(interaction.member.voice.channelId !== this.#_guilds_play_data[interaction.guildId].voice_connection.joinConfig.channelId)
			{
				await interaction.reply({content: '❌ You can\'t control me if you\'re not in my channel', ephemeral: true});
				return;
			}


			if(interaction.customId === "btn_restart")//Works
			{
				if(this.#get_song(interaction.guildId) !== undefined)
				{
					await this.#play_song(interaction.guildId);
				}
				await interaction.update(this.#generatePlayerInterface(interaction.guildId));
			}
			else if(interaction.customId === "btn_last")//Works
			{
				this.#prev_song(interaction.guildId);
				await interaction.update(this.#generatePlayerInterface(interaction.guildId));
			}
			else if(interaction.customId === "btn_play")//Works
			{
				this.#_guilds_play_data[interaction.guildId].player.unpause(true);
				this.#_guilds_play_data[interaction.guildId].is_playing = true;
				await interaction.update(this.#generatePlayerInterface(interaction.guildId))
			}
			else if(interaction.customId === "btn_pause")//Works
			{
				this.#_guilds_play_data[interaction.guildId].player.pause(true);
				this.#_guilds_play_data[interaction.guildId].is_playing = false;
				await interaction.update(this.#generatePlayerInterface(interaction.guildId))
			}
			else if(interaction.customId === "btn_next")//Works
			{
				this.#next_song(interaction.guildId, true);
				await interaction.update(this.#generatePlayerInterface(interaction.guildId));
			}
			else if(interaction.customId === "btn_volume")//Works
			{
				let player_interface = this.#generatePlayerInterface(interaction.guildId);
				player_interface.components.push(new this.#_discord.ActionRowBuilder().addComponents([
					new this.#_discord.StringSelectMenuBuilder()
						.setCustomId("select_volume")
						.setPlaceholder('Choose your volume level')
						.addOptions([
							{label: '20 %', value: "20", emoji: {name: "🔈"}, default: this.#_guilds_play_data[interaction.guildId].volume === 0.2},
							{label: '40 %', value: "40", emoji: {name: "🔈"}, default: this.#_guilds_play_data[interaction.guildId].volume === 0.4},
							{label: '60 %', value: "60", emoji: {name: "🔉"}, default: this.#_guilds_play_data[interaction.guildId].volume === 0.6},
							{label: '80 %', value: "80", emoji: {name: "🔊"}, default: this.#_guilds_play_data[interaction.guildId].volume === 0.8},
							{label: '100 %', value: "100", emoji: {name: "🔊"}, default: this.#_guilds_play_data[interaction.guildId].volume === 1},
							{label: '150 %', value: "150", emoji: {name: "📢"}, default: this.#_guilds_play_data[interaction.guildId].volume === 1.5},
							{label: '200 %', value: "200", emoji: {name: "📢"}, default: this.#_guilds_play_data[interaction.guildId].volume === 2},
							{label: '250 %', value: "250", emoji: {name: "📢"}, default: this.#_guilds_play_data[interaction.guildId].volume === 2.5},
							{label: '500 %', value: "500", emoji: {name: "💥"}, default: this.#_guilds_play_data[interaction.guildId].volume === 5},
							{label: '1000 %', value: "1000", emoji: {name: "💥"}, default: this.#_guilds_play_data[interaction.guildId].volume === 10},
							{label: '10000 %', value: "10000", emoji: {name: "💀"}, default: this.#_guilds_play_data[interaction.guildId].volume === 100, description: "Adieu les oreilles"}
						])
				]));
				await interaction.update(player_interface);
			}
			else if(interaction.customId === "loop")//Works
			{
				this.#_guilds_play_data[interaction.guildId].loop = true;
				await interaction.update(this.#generatePlayerInterface(interaction.guildId));
			}
			else if(interaction.customId === "unloop")//Works
			{
				this.#_guilds_play_data[interaction.guildId].loop = false;
				await interaction.update(this.#generatePlayerInterface(interaction.guildId));
			}
			else if(interaction.customId === "open_modal_add")//Works
			{
				interaction.showModal(new this.#_discord.ModalBuilder().addComponents([
					new this.#_discord.ActionRowBuilder().addComponents([
						new this.#_discord.TextInputBuilder()
							.setCustomId("link")
							.setPlaceholder('Enter a link or a search term')
							.setStyle(1)
							.setLabel('Song / Playlist')
					])
				])
				.setCustomId("modal_add")
				.setTitle('Add a song')
				);
			}
			else if(interaction.customId === "queue")//Works
			{
				let queue = this.#_guilds_play_data[interaction.guildId].queue.map((x, i) => { return (i+1) + ". [" + x.name + "](" + x.link + ")\n"}).join('');
				if(queue === "") queue = "No song in queue"
				let queue_embed = new this.#_discord.EmbedBuilder()
					.setColor([0x62, 0xD5, 0xE9])
					.setTitle('Queue')
					.setDescription("" + queue + '');
				await interaction.reply({content: '', embeds: [queue_embed], ephemeral: true});
			}
			else if(interaction.customId === "stop")//To test
			{
				if(this.#get_song(interaction.guildId) !== undefined)
				{
					this.#_guilds_play_data[interaction.guildId].player.stop();
				}
				this.#_guilds_play_data[interaction.guildId].queue = [];
				this.#_guilds_play_data[interaction.guildId].current_track = 0;
				await interaction.update(this.#generatePlayerInterface(interaction.guildId));
			}
			else if(interaction.customId === "leave")//To test
			{
				this.#destroyObject(interaction.guildId);
				await interaction.update({content: 'Thank you for using BaBot ! See you next time with the command `/player` !', embeds: [], components: []});
			}
			else if(interaction.customId === "btn_cancel_search")//To test
			{
				await interaction.message.delete();
				await interaction.reply({content: '✅ Search canceled', ephemeral: true});
			}
			else await interaction.reply({content: '❌ How do you do that ?', ephemeral: true});
		}
		//-----//

		//----- Modal Interactions -----//
		else if(interaction.isModalSubmit())
		{
			if(!this.#isObjectValid(interaction.guildId))
			{
				interaction.reply({content: '❌ I\'m no longer in a vocal channel. Start a new playing session with the command `/player`', ephemeral: true});
				return;
			}
			if(!interaction.inGuild() && interaction.member != undefined)//The user is in a guild, and a Guildmember object for this user exists
			{
				await interaction.reply({ephemeral: true, content: '❌ You can only use this command in a guild'});
				return;
			}
			if(interaction.member.voice.channelId !== this.#_guilds_play_data[interaction.guildId].voice_connection.joinConfig.channelId)
			{
				await interaction.reply({content: '❌ You can\'t control me if you\'re not in my channel', ephemeral: true});
				return;
			}

			//--- Add song to queue ---//
			if(interaction.customId === "modal_add")//Works
			{
				let value = interaction.fields.getTextInputValue('link');
				if(value == undefined)
				{
					await interaction.reply({content: '❌ You need to input one or multiple links or search terms', ephemeral: true});
					return;
				}
				await interaction.deferReply();

				if(value.startsWith('https://') || value.startsWith('radio://'))//It's a link
				{
					let current_song_before = this.#get_song(interaction.guildId);

					let return_message = await this.#add_in_queue(interaction.guildId, value)
					if(return_message === true)
					{
						if(current_song_before === undefined) await this.#play_song(interaction.guildId);

						interaction.editReply({content: '✅ Video/playlist added to queue'});
						this.#updatePlayerInterface(interaction.guildId);
					}
					else interaction.editReply({content: '❌ ' + return_message});
				}
				else
				{
					let yt = await yt_search(value);
					let displayed_yt = yt.map((x, i) => (i+1) + ". [" + x.name + "](" + x.link + ")\n").join('');
					let options_yt = yt.map((x, i) => { return {label: (i+1) + ". " + x.name.substring(0, 50), value: x.link, description: "Youtube Search"}});

					let radios = await radio_search(value);
					let displayed_radios = radios.map((x, i) => (i+1) + ". [" + x.name + "](" + x.link + ")\n").join('');
					let options_radios = radios.map((x, i) => { return {label: (i+1) + ". " + x.name.substring(0, 50), value: x.link, description: "Radio Search"}});

					let search_embed = new this.#_discord.EmbedBuilder()
						.setColor([0x62, 0xD5, 0xE9])
						.setTitle('Search results for "' + value + '"')
						.setDescription("**Youtube**\n" + (displayed_yt !== "" ? displayed_yt : 'No song found') +
							"**Radios**\n" + (displayed_radios !== "" ? displayed_radios : 'No radios found')
						);

					let search_select_list = [
						new this.#_discord.ActionRowBuilder().addComponents([
							new this.#_discord.StringSelectMenuBuilder()
								.setCustomId("select_add_song")
								.setPlaceholder('Choose your desired song')
								.addOptions(options_yt.concat(options_radios))
						]),
						new this.#_discord.ActionRowBuilder().addComponents([
							new this.#_discord.ButtonBuilder()
								.setCustomId("btn_cancel_search")
								.setLabel('Cancel')
								.setStyle(4)
						])
					];
					interaction.editReply({content: '', embeds: [search_embed], components: search_select_list});
				}
			}
			//---//
			else interaction.reply({content: '❌ How do you do that ?', ephemeral: true});
		}
		//-----//

		//----- Select menus interactions -----//
		else if(interaction.isStringSelectMenu())
		{
			if(!this.#isObjectValid(interaction.guildId))
			{
				interaction.reply({content: '❌ I\'m no longer in a vocal channel. Start a new playing session with the command `/player`', ephemeral: true});
				return;
			}
			if(!interaction.inGuild() && interaction.member != undefined)//The user is in a guild, and a Guildmember object for this user exists
			{
				await interaction.reply({ephemeral: true, content: '❌ You can only use this command in a guild'});
				return;
			}
			if(interaction.member.voice.channelId !== this.#_guilds_play_data[interaction.guildId].voice_connection.joinConfig.channelId)
			{
				await interaction.reply({content: '❌ You can\'t control me if you\'re not in my channel', ephemeral: true});
				return;
			}

			if(interaction.customId === "select_volume")//Works
			{
				if(['20', '40', '60', '80', '100', '150', '200', '250', '500', '1000', '10000'].includes(interaction.values[0]))
				{
					this.#_guilds_play_data[interaction.guildId].volume = parseInt(interaction.values[0]) / 100;
					if(this.#get_song(interaction.guildId) !== undefined)
					{
						this.#_guilds_play_data[interaction.guildId].resource.volume.setVolume(this.#_guilds_play_data[interaction.guildId].volume);
					}

					await interaction.update(this.#generatePlayerInterface(interaction.guildId));
				}
				else await interaction.reply({content: '❌ How do you do that ?', ephemeral: true});
			}
			else if(interaction.customId === "select_add_song")
			{
				await interaction.message.delete();
				await interaction.deferReply({ephemeral: true});

				let current_song_before = this.#get_song(interaction.guildId);
				let return_message = await this.#add_in_queue(interaction.guildId, interaction.values[0])
				if(return_message === true)
				{
					if(current_song_before === undefined) await this.#play_song(interaction.guildId);

					await interaction.editReply({content: '✅ Video/playlist added to queue'});
					await this.#updatePlayerInterface(interaction.guildId);
				}
				else interaction.editReply({content: '❌ ' + return_message});
			}
			else interaction.reply({content: '❌ How do you do that ?', ephemeral: true});
		}
		//-----//
		else await interaction.reply({content: '❌ How do you do that ?', ephemeral: true});
	}
	//-----//

	//----- Guild object management -----//
	async #initializeObject(guild_id, channel_id)//Works
	{
		if(this.#_guilds_play_data[guild_id] === undefined)
		{
			this.#_guilds_play_data[guild_id] = {
				voice_connection: false,
				player: false,
				resource: false,
				queue: [
					/*{
						name: "",
						link: "",
						thumbnail: "",
						duration: "",
						play_link: "",
					},
					...*/
				],
				current_track: 0,
				is_playing: false,
				volume: 1,
				loop: false,
				player_interfaces: [
					/*Message,
					...*/
				]
			};
			let this_class = this;

			this.#_guilds_play_data[guild_id].voice_connection = Voice.joinVoiceChannel({
				adapterCreator: (await this.#_client.guilds.fetch(guild_id)).voiceAdapterCreator,
				guildId: guild_id,
				channelId: channel_id,
				selfDeaf: false,
				selfMute: false
			});

			this.#_guilds_play_data[guild_id].voice_connection.once(Voice.VoiceConnectionStatus.Disconnected, function() {
				this_class.#destroyObject(guild_id);
			});

			this.#_guilds_play_data[guild_id].player = new Voice.AudioPlayer({noSubscriber: Voice.NoSubscriberBehavior.Pause});
			this.#_guilds_play_data[guild_id].player.addListener(Voice.AudioPlayerStatus.Idle, () => {this_class.#next_song(guild_id)});
			this.#_guilds_play_data[guild_id].player.on('error', function() { this_class.#destroyObject(guild_id); })
			this.#_guilds_play_data[guild_id].voice_connection.subscribe(this.#_guilds_play_data[guild_id].player);
		}
	}

	#isObjectValid(guild_id)
	{
		if(this.#_guilds_play_data[guild_id] !== undefined)
		{
			if(this.#_guilds_play_data[guild_id].voice_connection !== undefined &&
				this.#_guilds_play_data[guild_id].player !== undefined)
			{
				return true;
			}
		}
		return false;
	}

	#destroyObject(guild_id)
	{
		this.#_guilds_play_data[guild_id].voice_connection.destroy();
		this.#_guilds_play_data[guild_id] = undefined;
	}

	//----- Player interface management -----//
	#generatePlayerInterface(guild_id)//Works
	{
		if(this.#_guilds_play_data[guild_id] !== undefined)
		{
			let player_interface_components = [];
			player_interface_components.push(
				new this.#_discord.ActionRowBuilder().addComponents([
					new this.#_discord.ButtonBuilder()
						.setCustomId("btn_restart")
						.setEmoji({name: "↩️"})
						.setStyle(2)
						.setDisabled(this.#get_song(guild_id) ? false : true),
					new this.#_discord.ButtonBuilder()
						.setCustomId("btn_last")
						.setEmoji({name: "⏮️"})
						.setStyle(1)
						.setDisabled(false),
					new this.#_discord.ButtonBuilder()
						.setCustomId(this.#_guilds_play_data[guild_id].is_playing ? "btn_pause" : "btn_play")
						.setEmoji({name: this.#_guilds_play_data[guild_id].is_playing ? "⏸️" : "▶️"})
						.setStyle(1)
						.setDisabled(this.#get_song(guild_id) ? false : true),
					new this.#_discord.ButtonBuilder()
						.setCustomId("btn_next")
						.setEmoji({name: "⏭️"})
						.setStyle(1),
					new this.#_discord.ButtonBuilder()
						.setCustomId("btn_volume")
						.setEmoji({name: "🔉"})
						.setStyle(2),
				]),
				new this.#_discord.ActionRowBuilder().addComponents([
					new this.#_discord.ButtonBuilder()
						.setCustomId(this.#_guilds_play_data[guild_id].loop ? "unloop" : "loop")
						.setEmoji({name: this.#_guilds_play_data[guild_id].loop ? "➡️" : "🔁"})
						.setStyle(2)
						.setDisabled(this.#get_song(guild_id) ? false : true),
					new this.#_discord.ButtonBuilder()
						.setCustomId("shuffle")
						.setEmoji({name: "🔀"})
						.setStyle(2).setDisabled(false),
					new this.#_discord.ButtonBuilder()
						.setCustomId("queue")
						.setLabel('Queue')
						.setStyle(2),
					new this.#_discord.ButtonBuilder()
						.setCustomId("open_modal_add")
						.setLabel('Add song')
						.setStyle(3),
				]),
				new this.#_discord.ActionRowBuilder().addComponents([
					new this.#_discord.ButtonBuilder()
						.setCustomId("hide")
						.setLabel('Hide')
						.setStyle(2).setDisabled(true),
					new this.#_discord.ButtonBuilder()
						.setCustomId("stop")
						.setLabel('Stop')
						.setStyle(4),
					new this.#_discord.ButtonBuilder()
						.setCustomId("leave")
						.setLabel('Quit')
						.setStyle(4),
				])
			);

			let player_embed = new this.#_discord.EmbedBuilder()
				.setColor([0x62, 0xD5, 0xE9])

			if(this.#get_song(guild_id) !== undefined)
			{
				player_embed.setTitle("Playing \"" + this.#get_song(guild_id).name + "\"");
				player_embed.setURL(this.#get_song(guild_id).link);
				player_embed.setImage(this.#get_song(guild_id).thumbnail)
			}
			else
			{
				player_embed.setTitle("Currently playing anything");
				player_embed.setDescription("Add a music in the queue to start listening");
			}

			return {content: '', embeds: [player_embed], components: player_interface_components}
		}

		return {content: '❌ I can\'t generate the interface, because Theirémi is stupid'}
	}

	async #updatePlayerInterface(guild_id)//To test
	{
		for(let message of this.#_guilds_play_data[guild_id].player_interfaces)
		{
			await message.edit(this.#generatePlayerInterface(guild_id))
		}
	}
	//-----//

	//----- Song management -----//
	async #add_in_queue(guild_id, link)//To test
	{
		if(link.startsWith('https://'))//It's a link
		{
			if(link.match(/(?:https?:\/\/)?(?:www\.)?youtu\.?be(?:\.com)?\/?.*(?:watch|embed)?(?:.*v=|v\/|\/)([\w\-_]+)\&?/))
			{
				let video_data_process = await spawnAsync('yt-dlp', ['-f', 'bestaudio', '--default-search', 'auto', '-J', link], {encoding: 'utf-8'});
				console.log(video_data_process.stderr);
				if(isJsonString(video_data_process.stdout))
				{
					let video_data = JSON.parse(video_data_process.stdout);
					if(video_data._type === "video")
					{
						this.#_guilds_play_data[guild_id].queue.push({
							link: video_data.original_url,
							play_link: video_data.requested_downloads[0].url,
							name: video_data.title,
							thumbnail: video_data.thumbnail
						});
					}
					else if(video_data._type === "playlist")
					{
						for(let video of video_data.entries)
						{
							this.#_guilds_play_data[guild_id].queue.push({
								link: video.original_url,
								play_link: video.requested_downloads[0].url,
								name: video.title,
								thumbnail: video.thumbnail
							});
						}
					}

					return true;
				}
				else return 'This video/playlist is unavailable';
			}
			else return 'Nothing is implemented to work with this link';
		}
		else if(link.startsWith('radio://'))
		{
			let raw_radio_file = await fs.readFile(__dirname + '/radios.json', {encoding: 'utf-8'});
			if(isJsonString(raw_radio_file))
			{
				let all_radios = JSON.parse(raw_radio_file);
				let selected_radio = all_radios.find(x => 'radio://' + x.id === link);

				this.#_guilds_play_data[guild_id].queue.push({
					link: selected_radio.link,
					play_link: selected_radio.play_link,
					name: selected_radio.name,
					thumbnail: selected_radio.thumbnail
				});

				return true;
			}
			else return 'Radios metadata are corrupted, Theirémi the dev is incompetent';
		}
		else return 'Error';
	}
	async #next_song(guild_id, force = false)//To test
	{
		if(this.#get_song(guild_id) !== undefined)
		{
			if(!this.#_guilds_play_data[guild_id].loop || force) this.#_guilds_play_data[guild_id].current_track++;
			if(this.#get_song(guild_id) !== undefined)
			{
				await this.#play_song(guild_id);
			}
			else
			{
				this.#_guilds_play_data[guild_id].player.stop();
			}
			this.#updatePlayerInterface(guild_id)
		}
	}
	async #prev_song(guild_id)//To test
	{
		if(this.#_guilds_play_data[guild_id].current_track > 0)
		{
			this.#_guilds_play_data[guild_id].current_track--;
			if(this.#get_song(guild_id) !== undefined)
			{
				await this.#play_song(guild_id);
			}

			this.#updatePlayerInterface(guild_id)
		}
	}

	#get_song(guild_id, pos = 0)//To test
	{
		if(this.#_guilds_play_data[guild_id] !== undefined)
		{
			if(this.#_guilds_play_data[guild_id].current_track + pos >= 0)
			{
				return this.#_guilds_play_data[guild_id].queue[this.#_guilds_play_data[guild_id].current_track + pos] !== undefined ? this.#_guilds_play_data[guild_id].queue[this.#_guilds_play_data[guild_id].current_track + pos] : undefined;
			}
		}
		return undefined;
	}

	#play_song(guild_id)//Works
	{
		return new Promise(async (resolve, reject) => {
			if(this.#get_song(guild_id) !== undefined)
			{
				let play_link_process = await axios({url: this.#get_song(guild_id).play_link, method: 'get', responseType: 'stream'});

				this.#_guilds_play_data[guild_id].resource = Voice.createAudioResource(play_link_process.data, {inlineVolume: true});
				this.#_guilds_play_data[guild_id].resource.volume.setVolume(this.#_guilds_play_data[guild_id].volume);
				this.#_guilds_play_data[guild_id].player.play(this.#_guilds_play_data[guild_id].resource);

				this.#_guilds_play_data[guild_id].is_playing = true;
			}
			resolve();
		});
	}
	//-----//
}

async function yt_search(term)
{
	let video_data = await axios({url: "https://www.googleapis.com/youtube/v3/search",
		method: 'get',
		headers: {
			"Accept-Encoding": "deflate, br"
		},
		params: {
			key: "AIzaSyDAAk5CiS6FfmAg1r5ClftdooAIB-nomdQ",
			part: "snippet",
			maxResults: 5,
			order: "relevance",
			q: term,
			type: "video",
		}
	});
	return video_data.data.items.map((x) => {return {name: x.snippet.title, link: "https://www.youtube.com/watch?v=" + x.id.videoId}});
}

async function radio_search(term)
{
	let raw_radio_file = await fs.readFile(__dirname + '/radios.json', {encoding: 'utf-8'});
	if(isJsonString(raw_radio_file))
	{
		let all_radios = JSON.parse(raw_radio_file);
		let filtered_radios = all_radios.filter(x => x.name.toLowerCase().indexOf(term.toLowerCase()) !== -1);

		return filtered_radios.map((x) => { return {name: x.name, link: 'radio://' + x.id}});
	}
	return [];
}

function spawnAsync(command, args, options)
{
	return new Promise((resolve, reject) => {
		let stdout_data = "";
		let stderr_data = "";
		let spawn_process = child_process.spawn(command, args, options);
		spawn_process.stdout.on('data', function(data) {
			stdout_data += data.toString('utf-8');
		});
		spawn_process.stderr.on('data', function(data) {
			stderr_data += data.toString('utf-8');
		});
		spawn_process.on('close', function() {
			resolve({stdout: stdout_data, stderr: stderr_data});
		})
	});
}


function isJsonString(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}