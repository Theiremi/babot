const fsc = require('fs');
const fs = fsc.promises;
const worker_threads = require('worker_threads');
const Voice = require('@discordjs/voice');
const Builders = require('@discordjs/builders');
const child_process = require('child_process');
const axios = require('axios');
const prism = require('prism-media');
//const { PlayerTransform } = require('./ffmpeg_transform.js');
const Settings = require(process.cwd() + '/settings.js');
const I18n = require(process.cwd() + '/locales.js');
const settings = new Settings();
const i18n = new I18n('player');

module.exports = class Player {
	#_guilds_play_data = {};
	#_discord;
	#_client;
	#_log_function
	#_locales;
	#_shutdown = false;
	constructor(discord, client, log)
	{
		this.#_discord = discord;
		this.#_client = client;
		this.#_log_function = log;
	}

	async options()//Works
	{
		let song_choices = (await fs.readdir(__dirname + '/soundboard')).map((x) => { return {name: x.split('.')[0], value: x} })

		let player_commands = [];
		player_commands.push(new Builders.SlashCommandBuilder());
		player_commands[0].setName("player");
		player_commands[0].setDescription(i18n.get("chatinputcommands.player"));
		player_commands[0].setDescriptionLocalizations(i18n.all("chatinputcommands.player"));
		player_commands[0].setDMPermission(false);

		player_commands[1] = new Builders.SlashCommandBuilder();
		player_commands[1].setName("troll");
		player_commands[1].setDescription(i18n.get("chatinputcommands.troll"));
		player_commands[1].setDescriptionLocalizations(i18n.all("chatinputcommands.troll"));
		player_commands[1].setDMPermission(false);
		player_commands[1].addUserOption((option) => {
			option.setName('user');
			option.setDescription(i18n.get("chatinputcommands.troll_user"));
			option.setRequired(true);
			return option;
		});
		player_commands[1].addStringOption((option) => {
			option.setName('song');
			option.setDescription(i18n.get("chatinputcommands.troll_song"));
			option.addChoices(...song_choices);
			option.setRequired(true);
			return option;
		});
		player_commands[1].addNumberOption((option) => {
			option.setName('volume');
			option.setDescription(i18n.get("chatinputcommands.troll_volume"));
			option.setRequired(false);
			option.setMinValue(1);
			option.setMaxValue(10_000);
			return option;
		});

		return player_commands.map(x => x.toJSON());
	}

	playerCount()
	{
		return Object.values(this.#_guilds_play_data).filter(x => x !== undefined).length;
	}

	async configure(interaction)
	{
		await interaction.reply(await this.#generatePlayerSettingsInterface(interaction.guildId, 0, interaction.locale));
	}

	async interactionCreate(interaction)
	{
		//----- Chat Interactions -----//
		if(interaction.isChatInputCommand())
		{
			if(!['player', 'troll'].includes(interaction.commandName)) return false;

			if(!interaction.inGuild() || interaction.member == undefined)//The user is in a guild, and a Guildmember object for this user exists
			{
				await interaction.reply({ephemeral: true, content: i18n.get("errors.guild_only", interaction.locale)});
				return;
			}

			this.#_log_function('Player', '[' + interaction.guildId + '] Command `' + interaction.commandName + '` received from user ' + interaction.user.tag);
			if(interaction.commandName === 'player')//Ask for a player to be displayed
			{
				if(interaction.member.voice.channelId === null)
				{
					await interaction.reply({ephemeral: true, content: i18n.get("errors.not_in_voice_channel", interaction.locale)});
					return;
				}

				if(!this.#isObjectValid(interaction.guildId))
				{
					this.#_log_function('Player-player', '[' + interaction.guildId + '] No existing player, creating a new one');
					let channel_permissions = interaction.member.voice.channel.permissionsFor(interaction.guild.members.me, true);
					if(!interaction.member.voice.channel.viewable ||
						!channel_permissions.has(this.#_discord.PermissionsBitField.Flags.ViewChannel) ||
						!channel_permissions.has(this.#_discord.PermissionsBitField.Flags.Connect))//Connection to this channel is theorically allowed
					{
						await interaction.reply({ephemeral: true, content: i18n.get("errors.join", interaction.locale)});
						return;
					}
					else if(!interaction.member.voice.channel.speakable ||
						!channel_permissions.has(this.#_discord.PermissionsBitField.Flags.Speak))//Speaking is allowed
					{
						await interaction.reply({ephemeral: true, content: i18n.get("errors.speak", interaction.locale)});
						return;
					}
					if(!interaction.member.voice.channel.joinable)//Channel is joinable : not full or we have permission to override this
					{
						await interaction.reply({ephemeral: true, content: i18n.get("errors.full", interaction.locale)});
						return;
					}
					let config = await settings.get(interaction.guildId, 1, 'config');
					if(config === false)
					{
						await interaction.reply({content: i18n.get('errors.settings', interaction.locale), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
						return;
					}
					await this.#initializeObject(interaction.guildId, interaction.member.voice.channelId, false, config.locale, interaction.member.id);
					settings.addXP(interaction.user.id, 100);
				}

				if(this.#_guilds_play_data[interaction.guildId].voice_connection.joinConfig.channelId !== interaction.member.voice.channelId)
				{
					await interaction.reply({ephemeral: true, content: i18n.get("errors.already_used", interaction.locale)});
					return;
				}

				if(!this.#isObjectValid(interaction.guildId))
				{
					await interaction.reply({ephemeral: true, content: i18n.get("errors.unknown_player_error", interaction.locale)});
					return;
				}

				if(await settings.isGuildGolden(interaction.guildId)) this.#_log_function('Player-player', '[' + interaction.guildId + '] Wow, a golden player spawned !');
				await interaction.reply(await this.#generatePlayerInterface(interaction.guildId)).catch((e) => {console.log('Probably useless error 4 : ' + e)});
				let player_message = await interaction.fetchReply().catch(() => false);
				if(player_message !== false)this.#_guilds_play_data[interaction.guildId].player_interfaces.push(player_message);
			}
			else if(interaction.commandName === 'troll')
			{
				await interaction.deferReply({ephemeral: true}).catch(e => console.log('deferReply error : ' + e));
				if(!interaction.options.getMember('user') || !interaction.options.getString('song'))
				{
					interaction.editReply({ content: i18n.get("errors.user_not_found", interaction.locale), ephemeral: true }).catch((e) => { console.log('editReply error : ' + e)});
					return;
				}

				let target = interaction.options.getMember('user');
				if(target.voice.channelId === null)
				{
					interaction.editReply({ content: i18n.get("errors.user_not_in_voice_channel", interaction.locale), ephemeral: true }).catch((e) => { console.log('editReply error : ' + e)});
					return;
				}

				if(!await settings.canTroll(target.user.id))
				{
					interaction.editReply({ content: i18n.get("errors.dont_disturb", interaction.locale), ephemeral: true }).catch((e) => { console.log('editReply error : ' + e)});
					return;
				}

				if(!fsc.existsSync(__dirname + '/soundboard/' + interaction.options.getString('song')))
				{
					interaction.editReply({ content: i18n.get("errors.song_not_found", interaction.locale), ephemeral: true }).catch((e) => { console.log('editReply error : ' + e)});
					return;
				}

				this.#_log_function('Player-troll', '[' + interaction.guildId + '] User ' + target.user.tag + ' targeted by troll ' + interaction.options.getString('song') + ' with volume ' + interaction.options.getNumber('volume'));

				let previous_connection = false;
				if(this.#isObjectValid(interaction.guildId))
				{
					if(this.#_guilds_play_data[interaction.guildId].voice_connection.joinConfig.channelId !== interaction.member.voice.channelId)
					{
						interaction.editReply({content: i18n.get("errors.player_already_used", interaction.locale), ephemeral: true }).catch((e) => { console.log('editReply error : ' + e)});
						return;
					}

					previous_connection = this.#_guilds_play_data[interaction.guildId].voice_connection.joinConfig.channelId;

					try
					{
						this.#_guilds_play_data[interaction.guildId].voice_connection.destroy();
					}
					catch(e)
					{
						console.log(e);
					}
					
				}

				//--- TROLL RESOURCE ---//
				let troll_volume = false;
				if(interaction.options.getNumber('volume') != undefined)
				{
					if(interaction.options.getNumber('volume') >= 1 && interaction.options.getNumber('volume') <= 10000)
					{
						troll_volume = interaction.options.getNumber('volume') / 100;
					}
				}
				let troll_resource = Voice.createAudioResource(fsc.createReadStream(__dirname + '/soundboard/' + interaction.options.getString('song')), {inlineVolume: troll_volume ? true : false});
				if(troll_volume) troll_resource.volume.setVolume(troll_volume);
				//---//

				//--- TROLL PLAYER ---//
				let troll_player = new Voice.AudioPlayer({noSubscriber: Voice.NoSubscriberBehavior.Pause});
				troll_player.on('error', function(e) {
					console.log(e);
				});

				troll_player.play(troll_resource);
				//---//

				//--- TROLL VOICE ---//
				let troll_connection = Voice.joinVoiceChannel({
					adapterCreator: (await this.#_client.guilds.fetch(interaction.guildId)).voiceAdapterCreator,
					guildId: interaction.guildId,
					channelId: target.voice.channelId,
					selfDeaf: false,
					selfMute: false
				});

				let this_class = this;
				if(previous_connection)
				{
					troll_player.addListener(Voice.AudioPlayerStatus.Idle, async () => {
						troll_connection.destroy();
						await this_class.#initializeObject(interaction.guildId, previous_connection, true);
					});
				}
				else
				{
					troll_player.addListener(Voice.AudioPlayerStatus.Idle, async () => {
						troll_connection.destroy();
					});
				}

				troll_connection.subscribe(troll_player);
				//---//

				interaction.editReply({content: i18n.get("troll_success", interaction.locale)}).catch((e) => { console.log('editReply error : ' + e)});
				settings.addXP(interaction.user.id, 50);
			}
		}
		//-----//

		//----- Buttons Interactions -----//
		else if(interaction.isButton())
		{
			if(!['btn_restart', 'btn_last', 'btn_play', 'btn_pause', 'btn_next', 'btn_volume', 'loop', 'unloop', 'shuffle', 'unshuffle', 'queue', 'open_modal_add', 'hide', 'stop', 'leave', 'initial_duck', 'btn_inactive_leave', 'btn_stay', 'btn_stay_forever', 'owner_settings'].includes(interaction.customId) &&
				!interaction.customId.startsWith('btn_queue_page_') &&
				!interaction.customId.startsWith('btn_queue_play_') &&
				!interaction.customId.startsWith('btn_queue_remove_') &&
				!interaction.customId.startsWith('global_config_') &&
				!interaction.customId.startsWith('session_config_')) return false;

			this.#_log_function('Player', '[' + interaction.guildId + '] Command `' + interaction.customId + '` received from user ' + interaction.user.tag);

			if(!interaction.inGuild() && interaction.member != undefined)//The user is in a guild, and a Guildmember object for this user exists
			{
				await interaction.reply({ephemeral: true, content: i18n.get("errors.guild_only", interaction.locale)});
				return;
			}

			if(interaction.customId.startsWith("global_config_"))
			{
				let target_btn = interaction.customId.substring(14);
				if(!['restart', 'last', 'play', 'pause', 'next', 'volume', 'loop', 'shuffle', 'open_modal_add', 'hide', 'stop', 'leave', 'owner_settings'].includes(target_btn)) return;

				let config = await settings.get(interaction.guildId, 1, 'config');
		        if(config === false)
		        {
		          await interaction.reply({content: i18n.get('errors.settings', interaction.locale), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
		          return;
		        }

		        if(!config.permissions) config.permissions = {};
		        if(config.permissions[target_btn]) config.permissions[target_btn] = false;
		        else config.permissions[target_btn] = true;
		        await settings.set(interaction.guildId, 1, 'config', config);
		        await interaction.update(await this.#generatePlayerSettingsInterface(interaction.guildId, 0, interaction.locale)).catch((e) => {console.log('update error : ' + e)});
		        return;
			}


			if(!this.#isObjectValid(interaction.guildId))
			{
				interaction.reply({content: i18n.get("errors.no_player", interaction.locale), ephemeral: true});
				return;
			}

			if(interaction.customId === "btn_inactive_leave")
			{
				if(this.#_guilds_play_data[interaction.guildId].inactive_timer !== false)
				{
					await interaction.update({content: i18n.get("response_msg.leave", this.#_guilds_play_data[interaction.guildId].locale), embeds: [], components: []}).catch((e) => {console.log('update error : ' + e)});
					this.#destroyObject(interaction.guildId);
				}
				else await interaction.reply({ephemeral: true, content: i18n.get("errors.not_alone", interaction.locale)});
				return;
			}
			if(interaction.customId === "btn_stay")
			{
				if(this.#_guilds_play_data[interaction.guildId].inactive_timer !== false)
				{
					clearTimeout(this.#_guilds_play_data[interaction.guildId].inactive_timer);
					this.#_guilds_play_data[interaction.guildId].inactive_timer = false;

					await interaction.reply({ephemeral: true, content: i18n.get("response_msg.stay_until_user", interaction.locale)});

					await this.#updatePlayerInterface(interaction.guildId);
				}
				else await interaction.reply({ephemeral: true, content: i18n.get("errors.not_alone", interaction.locale)});
				return;
			}
			if(interaction.customId === "btn_stay_forever")
			{
				if(this.#_guilds_play_data[interaction.guildId].inactive_timer === false)
				{
					await interaction.reply({ephemeral: true, content: i18n.get("errors.not_alone", interaction.locale)});
					return;
				}

				if(await settings.level(interaction.user.id) < 3 && !await settings.isGuildGolden(interaction.guildId))
				{
					await interaction.reply({ephemeral: true, content: i18n.get("response_msg.golden_level", interaction.locale)});
					return;
				}

				clearTimeout(this.#_guilds_play_data[interaction.guildId].inactive_timer);
				this.#_guilds_play_data[interaction.guildId].inactive_timer = false;
				this.#_guilds_play_data[interaction.guildId].force_active = true;

				await interaction.reply({ephemeral: true, content: i18n.get("response_msg.stay_forever", interaction.locale)});

				await this.#updatePlayerInterface(interaction.guildId);
				return;
			}


			if(interaction.member.voice.channelId !== this.#_guilds_play_data[interaction.guildId].voice_connection.joinConfig.channelId)
			{
				await interaction.reply({content: i18n.get("errors.not_my_channel", interaction.locale), ephemeral: true});
				return;
			}


			if(interaction.customId.startsWith("session_config_"))
			{
				let target_btn = interaction.customId.substring(15);
				if(!['restart', 'last', 'play', 'pause', 'next', 'volume', 'loop', 'shuffle', 'open_modal_add', 'hide', 'stop', 'leave'].includes(target_btn)) return;

		        if(this.#_guilds_play_data[interaction.guildId].permissions[target_btn]) this.#_guilds_play_data[interaction.guildId].permissions[target_btn] = false;
		        else this.#_guilds_play_data[interaction.guildId].permissions[target_btn] = true;
		        await interaction.update(await this.#generatePlayerSettingsInterface(interaction.guildId, 1, interaction.locale)).catch((e) => {console.log('update error : ' + e)});
		        return;
			}

			else if(interaction.customId === "btn_restart")//Works
			{
				if(!await this.#checkPermission("restart", interaction)) return;
				if(this.#get_song(interaction.guildId) !== undefined)
				{
					await this.#play_song(interaction.guildId);
				}
				await interaction.update(await this.#generatePlayerInterface(interaction.guildId)).catch(e => console.log('update error : ' + e));
				settings.addXP(interaction.user.id, 10);
			}
			else if(interaction.customId === "btn_last")//Works
			{
				if(!await this.#checkPermission("last", interaction)) return;
				this.#prev_song(interaction.guildId);
				await interaction.update(await this.#generatePlayerInterface(interaction.guildId)).catch(e => console.log('update error : ' + e));
				settings.addXP(interaction.user.id, 5);
			}
			else if(interaction.customId === "btn_play")//Works
			{
				if(!await this.#checkPermission("play", interaction)) return;
				this.#_guilds_play_data[interaction.guildId].player.unpause(true);
				this.#_guilds_play_data[interaction.guildId].is_playing = true;
				await interaction.update(await this.#generatePlayerInterface(interaction.guildId)).catch(e => console.log('update error : ' + e));
				settings.addXP(interaction.user.id, 10);
			}
			else if(interaction.customId === "btn_pause")//Works
			{
				if(!await this.#checkPermission("play", interaction)) return;
				this.#_guilds_play_data[interaction.guildId].player.pause(true);
				this.#_guilds_play_data[interaction.guildId].is_playing = false;
				await interaction.update(await this.#generatePlayerInterface(interaction.guildId)).catch((e) => { console.log('Update error : ' + e)});
				settings.addXP(interaction.user.id, 10);
			}
			else if(interaction.customId === "btn_next")//Works
			{
				if(!await this.#checkPermission("next", interaction)) return;
				this.#next_song(interaction.guildId, true);
				await interaction.update(await this.#generatePlayerInterface(interaction.guildId)).catch(e => console.log('update error : ' + e));
				settings.addXP(interaction.user.id, 5);
			}
			else if(interaction.customId === "btn_volume")//Works
			{
				if(!await this.#checkPermission("volume", interaction)) return;
				let player_interface = await this.#generatePlayerInterface(interaction.guildId);
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
							{label: '10000 %', value: "10000", emoji: {name: "💀"}, default: this.#_guilds_play_data[interaction.guildId].volume === 100}
						])
				]));
				await interaction.update(player_interface).catch(e => console.log('update error : ' + e));
			}

			else if(interaction.customId === "loop")//Works
			{
				if(!await this.#checkPermission("loop", interaction)) return;
				this.#_guilds_play_data[interaction.guildId].loop = true;
				await interaction.update(await this.#generatePlayerInterface(interaction.guildId)).catch(e => console.log('update error : ' + e));
				settings.addXP(interaction.user.id, 20);
			}
			else if(interaction.customId === "unloop")//Works
			{
				if(!await this.#checkPermission("loop", interaction)) return;
				this.#_guilds_play_data[interaction.guildId].loop = false;
				await interaction.update(await this.#generatePlayerInterface(interaction.guildId)).catch(e => console.log('update error : ' + e));
			}
			else if(interaction.customId === "shuffle")//Works
			{
				if(!await this.#checkPermission("shuffle", interaction)) return;
				this.#_guilds_play_data[interaction.guildId].shuffle = true;
				await interaction.update(await this.#generatePlayerInterface(interaction.guildId)).catch(e => console.log('update error : ' + e));
				settings.addXP(interaction.user.id, 20);
			}
			else if(interaction.customId === "unshuffle")//Works
			{
				if(!await this.#checkPermission("unshuffle", interaction)) return;
				this.#_guilds_play_data[interaction.guildId].shuffle = false;
				await interaction.update(await this.#generatePlayerInterface(interaction.guildId)).catch(e => console.log('update error : ' + e));
			}
			else if(interaction.customId === "queue")
			{
				await interaction.reply(await this.#generateQueueInterface(interaction.guildId)).catch(e => console.log('update error : ' + e));
				settings.addXP(interaction.user.id, 10);
			}
			else if(interaction.customId === "open_modal_add")//Works
			{
				if(!await this.#checkPermission("open_modal_add", interaction)) return;
				interaction.showModal(new this.#_discord.ModalBuilder().addComponents([
					new this.#_discord.ActionRowBuilder().addComponents([
						new this.#_discord.TextInputBuilder()
							.setCustomId("link")
							.setPlaceholder(i18n.get("add_song_modal.placeholder", interaction.locale))
							.setStyle(1)
							.setLabel(i18n.get("add_song_modal.label", interaction.locale))
					])
				])
				.setCustomId("modal_add")
				.setTitle(i18n.get("add_song_modal.title", interaction.locale))
				).catch(e => console.log('showModal error : ' + e));
			}

			else if(interaction.customId === "hide")//To test
			{
				if(!await this.#checkPermission("hide", interaction)) return;
				for(let message in this.#_guilds_play_data[interaction.guildId].player_interfaces)
				{
					if(this.#_guilds_play_data[interaction.guildId].player_interfaces[message] === interaction.message.id)
					{
						this.#_guilds_play_data[interaction.guildId].player_interfaces.splice(message, 1);
						break;
					}
				}
				await interaction.message.delete().catch((e) => { console.log('Delete message error : ' + e)});
				await interaction.reply({content: i18n.get("response_msg.hide", interaction.locale), ephemeral: true}).catch((e) => { console.log('reply error : ' + e)});
				settings.addXP(interaction.user.id, 20);
			}
			else if(interaction.customId === "stop")
			{
				if(!await this.#checkPermission("stop", interaction)) return;
				if(this.#get_song(interaction.guildId) !== undefined)
				{
					this.#_guilds_play_data[interaction.guildId].player.stop();
				}
				this.#_guilds_play_data[interaction.guildId].queue = [];
				this.#_guilds_play_data[interaction.guildId].current_track = 0;
				await interaction.update(await this.#generatePlayerInterface(interaction.guildId)).catch((e) => {console.log('update error : ' + e)});
				settings.addXP(interaction.user.id, 20);
			}
			else if(interaction.customId === "leave")
			{
				if(!await this.#checkPermission("leave", interaction)) return;
				await interaction.update({content: i18n.get("response_msg.leave", this.#_guilds_play_data[interaction.guildId].locale), embeds: [], components: []}).catch((e) => {console.log('update error : ' + e)});
				this.#destroyObject(interaction.guildId);
				settings.addXP(interaction.user.id, 50);
			}

			else if(interaction.customId.startsWith("btn_queue_page_"))
			{
				let new_page = parseInt(interaction.customId.split('_').splice(-1));

				if(!isNaN(new_page))
				{
					await interaction.update(this.#generateQueueInterface(interaction.guildId, new_page)).catch(e => console.log('update error : ' + e));
				}
			}
			else if(interaction.customId.startsWith("btn_queue_play_"))
			{
				if(!await this.#checkPermission("play", interaction)) return;
				let new_song = parseInt(interaction.customId.split('_').splice(-1)[0]);

				if(!isNaN(new_song))
				{
					if(this.#get_song(interaction.guildId, new_song, true))
					{
						this.#_guilds_play_data[interaction.guildId].current_track = new_song;
						await this.#play_song(interaction.guildId);
						await this.#updatePlayerInterface(interaction.guildId);
						settings.addXP(interaction.user.id, 30);
					}
					await interaction.update(this.#generateQueueInterface(interaction.guildId)).catch((e) => {console.log('update error : ' + e)});
				}
			}
			else if(interaction.customId.startsWith("btn_queue_remove_"))
			{
				if(!await this.#checkPermission("stop", interaction)) return;
				let song = parseInt(interaction.customId.split('_').splice(-1)[0]);

				if(!isNaN(song))
				{
					if(this.#get_song(interaction.guildId, song, true))
					{
						this.#_guilds_play_data[interaction.guildId].queue.splice(song, 1);
						settings.addXP(interaction.user.id, 40);

						if(this.#_guilds_play_data[interaction.guildId].current_track === song)
						{
							if(this.#get_song(interaction.guildId))
							{
								await this.#play_song(interaction.guildId);
							}
							else
							{
								this.#_guilds_play_data[interaction.guildId].player.stop();
							}

							await this.#updatePlayerInterface(interaction.guildId);
						}
					}
					await interaction.update(this.#generateQueueInterface(interaction.guildId)).catch(e => console.log('update error : ' + e));
				}
			}

			else if(interaction.customId === "owner_settings")
			{
				if(interaction.member.id !== this.#_guilds_play_data[interaction.guildId].owner)
				{
					await interaction.reply({allowedMentions: {}, content: i18n.place(i18n.get('errors.owner_only', interaction.locale), {username: (await this.#_client.users.fetch(this.#_guilds_play_data[interaction.guildId].owner).catch(() => undefined))?.toString()}), ephemeral: true});
					return;
				}
				await interaction.reply(await this.#generatePlayerSettingsInterface(interaction.guildId, 1, interaction.locale))
			}

			else if(interaction.customId === "initial_duck")
			{
				await interaction.reply({content: 'Quack !'});
			}
			else await interaction.reply({content: i18n.get("errors.interaction", interaction.locale), ephemeral: true});
		}
		//-----//

		//----- Modal Interactions -----//
		else if(interaction.isModalSubmit())
		{
			if(!['modal_add'].includes(interaction.customId)) return false;

			if(!this.#isObjectValid(interaction.guildId))
			{
				interaction.reply({content: i18n.get("errors.no_player", interaction.locale), ephemeral: true});
				return;
			}
			if(!interaction.inGuild() && interaction.member != undefined)//The user is in a guild, and a Guildmember object for this user exists
			{
				await interaction.reply({ephemeral: true, content: i18n.get("errors.guild_only", interaction.locale)});
				return;
			}
			if(interaction.member.voice.channelId !== this.#_guilds_play_data[interaction.guildId].voice_connection.joinConfig.channelId)
			{
				await interaction.reply({content: i18n.get("errors.not_my_channel", interaction.locale), ephemeral: true});
				return;
			}

			this.#_log_function('Player', '[' + interaction.guildId + '] Command `' + interaction.customId + '` received from user ' + interaction.user.tag);
			//--- Add song to queue ---//
			if(interaction.customId === "modal_add")//Works
			{
				if(!await this.#checkPermission("open_modal_add", interaction)) return;
				let value = interaction.fields.getTextInputValue('link');
				if(value == undefined)
				{
					await interaction.reply({content: i18n.get("add_song_modal.enter_song", interaction.locale), ephemeral: true});
					return;
				}

				if(value.startsWith('https://') || value.startsWith('radio://'))//It's a link
				{
					await interaction.deferReply({ephemeral: true}).catch((e) => {console.log('deferReply error : ' + e)});
					this.#_log_function('Player-modal_add', '[' + interaction.guildId + '] Link "' + value + '" given');
					let current_song_before = this.#get_song(interaction.guildId);

					let return_message = await this.#add_in_queue(interaction.guildId, value).catch((e) =>
					{
						if(interaction.isRepliable()) interaction.editReply({content: '❌ ' + e}).catch((e) => { console.log('editReply error : ' + e)});
						return false;
					});

					if(return_message !== false)
					{
						if(interaction.isRepliable()) interaction.editReply({content: '✅ ' + return_message}).catch((e) => { console.log('editReply error : ' + e)});
						settings.addXP(interaction.user.id, 10);
					}
				}
				else
				{
					if(value.length > 250)
					{
						interaction.reply({content: i18n.get("add_song_modal.search_too_long", interaction.locale), ephemeral: true});
						return;
					}
					await interaction.deferReply().catch(e => console.log('deferReply error : ' + e));
					this.#_log_function('Player-modal_add', '[' + interaction.guildId + '] Search term "' + value + '" given');
					let yt = await yt_search(value);
					let displayed_yt = "";
					if(yt === false)
					{
						displayed_yt = "*Youtube search API rate limit has been reached. Try using links until I fix this issue*\n"
						yt = [];
					}
					else displayed_yt = yt.map((x, i) => (i+1) + ". [" + x.name + "](" + x.link + ")\n").join('');
					let options_yt = yt.map((x, i) => { return {label: (i+1) + ". " + x.name.substring(0, 50), value: x.link, description: "Youtube Search"}});

					let radios = await radio_search(value);
					let displayed_radios = radios.map((x, i) => (i+1) + ". [" + x.name + "](" + x.link + ")\n").join('');
					let options_radios = radios.map((x, i) => { return {label: (i+1) + ". " + x.name.substring(0, 50), value: x.link, description: "Radio Search"}});

					let search_embed = new this.#_discord.EmbedBuilder()
						.setColor([0x62, 0xD5, 0xE9])
						.setTitle('Search results for "' + value + '"')
						.setDescription("**Youtube**\n" + (displayed_yt !== "" ? displayed_yt : 'No song found\n') +
							"**Radios**\n" + (displayed_radios !== "" ? displayed_radios : 'No radios found')
						);

					let search_select_list = [];
					if(options_yt.concat(options_radios).length > 0)
					{
						search_select_list.push(new this.#_discord.ActionRowBuilder().addComponents([
							new this.#_discord.StringSelectMenuBuilder()
								.setCustomId("select_add_song")
								.setPlaceholder(i18n.get("add_song_modal.search_placeholder", this.#_guilds_play_data[interaction.guildId].locale))
								.addOptions(options_yt.concat(options_radios))
						]));
					}
					search_select_list.push(new this.#_discord.ActionRowBuilder().addComponents([
						new this.#_discord.ButtonBuilder()
							.setCustomId("close_any")
							.setLabel(i18n.get("buttons.cancel", this.#_guilds_play_data[interaction.guildId].locale))
							.setStyle(4)
					]));
					interaction.editReply({content: '', embeds: [search_embed], components: search_select_list}).catch((e) => { console.log('editReply error : ' + e)});
				}
			}
			//---//
			else interaction.reply({content: i18n.get("errors.interaction", interaction.locale), ephemeral: true});
		}
		//-----//

		//----- Select menus interactions -----//
		else if(interaction.isStringSelectMenu())
		{
			if(!['select_volume', 'select_add_song', 'select_queue_song'].includes(interaction.customId)) return false;
			if(!this.#isObjectValid(interaction.guildId))
			{
				interaction.reply({content: i18n.get("errors.no_player", interaction.locale), ephemeral: true});
				return;
			}
			if(!interaction.inGuild() && interaction.member != undefined)//The user is in a guild, and a Guildmember object for this user exists
			{
				await interaction.reply({ephemeral: true, content: i18n.get("errors.guild_only", interaction.locale)});
				return;
			}
			if(interaction.member.voice.channelId !== this.#_guilds_play_data[interaction.guildId].voice_connection.joinConfig.channelId)
			{
				await interaction.reply({content: i18n.get("errors.not_my_channel", interaction.locale), ephemeral: true});
				return;
			}

			this.#_log_function('Player', '[' + interaction.guildId + '] Command `' + interaction.customId + '` received from user ' + interaction.user.tag);
			if(interaction.customId === "select_volume")//Works
			{
				if(!await this.#checkPermission("volume", interaction)) return;
				if(['20', '40', '60', '80', '100', '150', '200', '250', '500', '1000', '10000'].includes(interaction.values[0]))
				{
					this.#_log_function('Player-song', '[' + interaction.guildId + '] Change volume from ' + (this.#_guilds_play_data[interaction.guildId].volume * 100) + '% to ' + interaction.values[0] + '%');
					this.#_guilds_play_data[interaction.guildId].volume = parseInt(interaction.values[0]) / 100;
					if(this.#get_song(interaction.guildId) !== undefined)
					{
						this.#_guilds_play_data[interaction.guildId].volumeTransformer.setVolume(this.#_guilds_play_data[interaction.guildId].volume);
						/*this.#_guilds_play_data[interaction.guildId].transformer.changeSettings({volume: this.#_guilds_play_data[interaction.guildId].volume});
						let resource = Voice.createAudioResource(this.#_guilds_play_data[interaction.guildId].transformer.pipe(new prism.opus.OggDemuxer()), {inputType: "opus"});
						this.#_guilds_play_data[interaction.guildId].player.play(resource);*/
					}

					await interaction.update(await this.#generatePlayerInterface(interaction.guildId)).catch(e => console.log('update error : ' + e));
					settings.addXP(interaction.user.id, 10);
				}
				else await interaction.reply({content: i18n.get("errors.interaction", interaction.locale), ephemeral: true});
			}
			else if(interaction.customId === "select_add_song")
			{
				if(!await this.#checkPermission("open_modal_add", interaction)) return;
				this.#_log_function('Player-modal_add', '[' + interaction.guildId + '] Link "' + interaction.values[0] + '" selected'); 
				await interaction.message.delete().catch((e) => { console.log('Probably useless error 5 : ' + e)});
				await interaction.deferReply({ephemeral: true}).catch((e) => {console.log('deferReply error : ' + e)});

				let return_message = await this.#add_in_queue(interaction.guildId, interaction.values[0]).catch((e) =>
				{
					interaction.editReply({content: '❌ ' + e}).catch((e) => { console.log('editReply error : ' + e)});
					return false;
				});

				if(return_message !== false)
				{
					await interaction.editReply({content: '✅ ' + return_message}).catch((e) => { console.log('editReply error : ' + e)});
					settings.addXP(interaction.user.id, 5);
				}
			}
			else if(interaction.customId === "select_queue_song")
			{
				await interaction.update(this.#generateQueueInterface(interaction.guildId, 0, parseInt(interaction.values[0]))).catch(e => console.log('update error : ' + e));
			}
			else interaction.reply({content: i18n.get("errors.interaction", interaction.locale), ephemeral: true});
		}
		//-----//
	}

	async voiceStateUpdate(voiceState)
	{
		if(this.#isObjectValid(voiceState.guild.id))
		{
			let channel = await this.#_client.channels.fetch(this.#_guilds_play_data[voiceState.guild.id].voice_connection.joinConfig.channelId).catch(e => e);
			if(channel instanceof Error) return;

			for(let e of channel.members)
			{
				e = e[1];
				if(!e.user.bot)
				{
					if(this.#_guilds_play_data[voiceState.guild.id].inactive_timer !== false)
					{
						this.#_log_function('Player-object', '[' + voiceState.guild.id + '] I\'m back with some people finally');
						clearTimeout(this.#_guilds_play_data[voiceState.guild.id].inactive_timer);
						this.#_guilds_play_data[voiceState.guild.id].inactive_timer = false;

						await this.#updatePlayerInterface(voiceState.guild.id);
					}
					return;
				}
			}
			if(this.#_guilds_play_data[voiceState.guild.id].force_active !== true && this.#_guilds_play_data[voiceState.guild.id].inactive_timer === false)
			{
				this.#_log_function('Player-object', '[' + voiceState.guild.id + '] Starting inactivity counter');
				this.#_guilds_play_data[voiceState.guild.id].inactive_timer = setTimeout(function(ctx, guild_id) {
					if(ctx.#isObjectValid(guild_id))
					{
						ctx.#updatePlayerInterface(guild_id, {content: i18n.get("response_msg.inactivity", ctx.#_guilds_play_data[voiceState.guild.id].locale), embeds: [], components: []});
						ctx.#destroyObject(guild_id);
					}
				}, 60000*20, this, voiceState.guild.id);
				await this.#updatePlayerInterface(voiceState.guild.id);
			}
		}
	}

	async shutdownRequest(timestamp)
	{
		this.#_shutdown = timestamp;
	}
	//-----//

	//----- Guild object management -----//
	async #initializeObject(guild_id, channel_id, only_connection = false, locale, owner)//Works
	{
		if((!this.#isObjectValid(guild_id) && !only_connection) ||
			(only_connection &&
			this.#_guilds_play_data[guild_id] !== undefined &&
			this.#_guilds_play_data[guild_id].player !== undefined))
		{
			this.#_log_function('Player-object', '[' + guild_id + '] New player object created in channel ' + channel_id);

			if(!only_connection)
			{
				this.#_guilds_play_data[guild_id] = {
					locale: locale,
					owner: owner,
					voice_connection: undefined,
					player: undefined,
					player_subscription: undefined,
					volumeTransformer: undefined,
					permissions: [],
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
					shuffle: false,
					inactive_timer: false,
					force_active: false,
					player_interfaces: [
						/*Message,
						...*/
					]
				};
			}
			let this_class = this;

			this.#_guilds_play_data[guild_id].voice_connection = Voice.joinVoiceChannel({
				adapterCreator: (await this.#_client.guilds.fetch(guild_id)).voiceAdapterCreator,
				guildId: guild_id,
				channelId: channel_id,
				selfDeaf: true,
				selfMute: false
			});

			this.#_guilds_play_data[guild_id].voice_connection.addListener(Voice.VoiceConnectionStatus.Disconnected, async function() {
				try {
					await Voice.entersState(this_class.#_guilds_play_data[guild_id].voice_connection,
						Voice.VoiceConnectionStatus.Ready,
						5000
					);
				}
				catch (e)
				{
					this_class.#destroyObject(guild_id);
				}
			});

			if(only_connection)
			{
				this.#_guilds_play_data[guild_id].player_subscription = this.#_guilds_play_data[guild_id].voice_connection.subscribe(this.#_guilds_play_data[guild_id].player);
			}
			else
			{
				this.#_guilds_play_data[guild_id].player = new Voice.AudioPlayer({noSubscriber: Voice.NoSubscriberBehavior.Pause, maxMissedFrames: 50});
				this.#_guilds_play_data[guild_id].player.addListener(Voice.AudioPlayerStatus.Idle, () => {this_class.#next_song(guild_id)});
				this.#_guilds_play_data[guild_id].player.on('error', function() { this_class.#destroyObject(guild_id); })
				this.#_guilds_play_data[guild_id].player_subscription = this.#_guilds_play_data[guild_id].voice_connection.subscribe(this.#_guilds_play_data[guild_id].player);
			}
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
		try
		{
			if(this.#_guilds_play_data[guild_id].inactive_timer !== false)
			{
				clearTimeout(this.#_guilds_play_data[guild_id].inactive_timer);
			}
			this.#_guilds_play_data[guild_id].voice_connection.destroy();
		}
		catch(e)
		{
			console.log(e);
		}
		
		delete this.#_guilds_play_data[guild_id];
	}

	//----- Player interface management -----//
	async #generatePlayerInterface(guild_id)//Works
	{
		if(this.#isObjectValid(guild_id))
		{
			let used_locale = this.#_guilds_play_data[guild_id].locale;
			let player_interface_components = [];
			if(this.#_guilds_play_data[guild_id]?.inactive_timer !== false)
			{
				player_interface_components.push(
					new this.#_discord.ActionRowBuilder().addComponents([
						new this.#_discord.ButtonBuilder()
							.setCustomId("undefined")
							.setEmoji({name: "❗"})
							.setLabel(i18n.get("buttons.label_inactive", used_locale))
							.setStyle(2)
							.setDisabled(true),
						new this.#_discord.ButtonBuilder()
							.setCustomId("btn_inactive_leave")
							.setLabel(i18n.get("buttons.inactive_leave", used_locale))
							.setStyle(3),
						new this.#_discord.ButtonBuilder()
							.setCustomId("btn_stay")
							.setLabel(i18n.get("buttons.stay", used_locale))
							.setStyle(4),
						new this.#_discord.ButtonBuilder()
							.setCustomId("btn_stay_forever")
							.setEmoji({name: "golden", id: "1065239445625917520"})
							.setLabel(i18n.get("buttons.stay_forever", used_locale))
							.setStyle(2)
				]));
			}
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
						.setStyle(1),
					new this.#_discord.ButtonBuilder()
						.setCustomId(this.#_guilds_play_data[guild_id]?.is_playing ? "btn_pause" : "btn_play")
						.setEmoji({name: this.#_guilds_play_data[guild_id]?.is_playing ? "⏸️" : "▶️"})
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
						.setCustomId(this.#_guilds_play_data[guild_id]?.loop ? "unloop" : "loop")
						.setEmoji({name: "🔁"})
						.setStyle(this.#_guilds_play_data[guild_id]?.loop ? 3 : 2)
						.setDisabled(this.#get_song(guild_id) ? false : true),
					new this.#_discord.ButtonBuilder()
						.setCustomId(this.#_guilds_play_data[guild_id]?.shuffle ? "unshuffle" : "shuffle")
						.setEmoji({name: "🔀"})
						.setStyle(this.#_guilds_play_data[guild_id]?.shuffle ? 3 : 2),
					new this.#_discord.ButtonBuilder()
						.setCustomId("queue")
						.setLabel(i18n.get("buttons.queue", used_locale))
						.setStyle(2),
					new this.#_discord.ButtonBuilder()
						.setCustomId("open_modal_add")
						.setLabel(i18n.get("buttons.add_song", used_locale))
						.setStyle(3),
				]),
				new this.#_discord.ActionRowBuilder().addComponents([
					new this.#_discord.ButtonBuilder()
						.setCustomId("hide")
						.setLabel(i18n.get("buttons.hide", used_locale))
						.setStyle(2),
					new this.#_discord.ButtonBuilder()
						.setCustomId("stop")
						.setLabel(i18n.get("buttons.stop", used_locale))
						.setStyle(4),
					new this.#_discord.ButtonBuilder()
						.setCustomId("leave")
						.setLabel(i18n.get("buttons.leave", used_locale))
						.setStyle(4),
					new this.#_discord.ButtonBuilder()
						.setCustomId("owner_settings")
						.setLabel(i18n.get("buttons.owner_settings", used_locale))
						.setStyle(2)
				])
			);

			let player_embed = new this.#_discord.EmbedBuilder()
				.setColor((await settings.isGuildGolden(guild_id)) ? [0xFF, 0xD7, 0x00] : [0x62, 0xD5, 0xE9])

			if(this.#get_song(guild_id) !== undefined)
			{
				player_embed.setTitle(i18n.place(i18n.get("player_embed.title_play", used_locale), {song_name: this.#get_song(guild_id).name}));
				player_embed.setURL(this.#get_song(guild_id).link);
				player_embed.setImage(this.#get_song(guild_id).thumbnail);
				if(this.#_shutdown !== false) player_embed.setDescription(i18n.place(i18n.get("player_embed.restart_msg", used_locale), {timestamp: this.#_shutdown}));
				//player_embed.setFooter({text: "If you experience lags, please report these with `/feedback` to help to apply a fix"});
			}
			else
			{
				player_embed.setTitle(i18n.get("player_embed.title_idle", used_locale));
				player_embed.setDescription(i18n.get("player_embed.description_idle", used_locale));
				player_embed.setThumbnail('https://www.theireply.fr/babot/image_flou.jpg');
			}

			return {content: '', embeds: [player_embed], components: player_interface_components}
		}

		return {content: '❌ I can\'t generate the interface, because Theirémi is stupid'}
	}

	async #generatePlayerSettingsInterface(guild_id, config_mode = 0, locale)//Works
	{
		let cmd_prfx = config_mode === 1 ? "session_" : "global_"
		let guild_permissions = (await settings.get(guild_id, 1, 'config')).permissions;
		let displayed_permissions = config_mode === 1 ? this.#_guilds_play_data[guild_id].permissions : guild_permissions;
		let change_permission = config_mode === 1 ? !guild_permissions?.owner_settings : true;
		let player_interface_components = [];
		const color = (perm) => {
			if(config_mode === 0) return guild_permissions[perm];
			if(!change_permission) return guild_permissions[perm];
			if(guild_permissions[perm]) return true;
			return displayed_permissions[perm];
		}
		const disabled = (perm) => {
			if(config_mode === 0) return false;
			if(guild_permissions[perm]) return true;
			if(change_permission) return false;
			return true;
		}

		player_interface_components.push(
			new this.#_discord.ActionRowBuilder().addComponents([
				new this.#_discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_restart")
					.setEmoji({name: "↩️"})
					.setStyle(color("restart") ? 4 : 3)
					.setDisabled(disabled("restart")),
				new this.#_discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_last")
					.setEmoji({name: "⏮️"})
					.setStyle(color("last") ? 4 : 3)
					.setDisabled(disabled("last")),
				new this.#_discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_play")
					.setEmoji({name: "▶️"})
					.setStyle(color("play") ? 4 : 3)
					.setDisabled(disabled("play")),
				new this.#_discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_next")
					.setEmoji({name: "⏭️"})
					.setStyle(color("next") ? 4 : 3)
					.setDisabled(disabled("next")),
				new this.#_discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_volume")
					.setEmoji({name: "🔉"})
					.setStyle(color("volume") ? 4 : 3)
					.setDisabled(disabled("volume")),
			]),
			new this.#_discord.ActionRowBuilder().addComponents([
				new this.#_discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_loop")
					.setEmoji({name: "🔁"})
					.setStyle(color("loop") ? 4 : 3)
					.setDisabled(disabled("loop")),
				new this.#_discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_shuffle")
					.setEmoji({name: "🔀"})
					.setStyle(color("shuffle") ? 4 : 3)
					.setDisabled(disabled("shuffle")),
				new this.#_discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_queue")
					.setLabel(i18n.get("buttons.queue", locale))
					.setStyle(2)
					.setDisabled(true),
				new this.#_discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_open_modal_add")
					.setLabel(i18n.get("buttons.add_song", locale))
					.setStyle(color("open_modal_add") ? 4 : 3)
					.setDisabled(disabled("open_modal_add")),
			]),
			new this.#_discord.ActionRowBuilder().addComponents([
				new this.#_discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_hide")
					.setLabel(i18n.get("buttons.hide", locale))
					.setStyle(color("hide") ? 4 : 3)
					.setDisabled(disabled("hide")),
				new this.#_discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_stop")
					.setLabel(i18n.get("buttons.stop", locale))
					.setStyle(color("stop") ? 4 : 3)
					.setDisabled(disabled("stop")),
				new this.#_discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_leave")
					.setLabel(i18n.get("buttons.leave", locale))
					.setStyle(color("leave") ? 4 : 3)
					.setDisabled(disabled("leave")),
				new this.#_discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_owner_settings")
					.setLabel(i18n.get("buttons.owner_settings", locale))
					.setStyle(color("owner_settings") ? 4 : 3)
					.setDisabled(Boolean(config_mode) || disabled("owner_settings")),
			])
		);

		let player_embed = new this.#_discord.EmbedBuilder()
			.setColor([0xed, 0x42, 0x45])

		if(config_mode === 0) player_embed.setTitle(i18n.get("player_embed.title_configure_global", locale));
		else player_embed.setTitle(i18n.get("player_embed.title_configure_session", locale));
		player_embed.setDescription(i18n.get("player_embed.description_configure", locale));
		player_embed.setThumbnail('https://babot.theireply.fr/config_perms.png');

		return {content: '', ephemeral: true, embeds: [player_embed], components: player_interface_components}
	}

	async #checkPermission(command, interaction)
	{
		let guild_permissions = (await settings.get(interaction.guildId, 1, 'config')).permissions;
		if(guild_permissions === undefined) guild_permissions = {};
		if(!guild_permissions.owner_settings)
		{
			if(!guild_permissions[command])
			{
				if(!this.#_guilds_play_data[interaction.guildId].permissions[command])
				{
					return true;
				}
				else
				{
					if(this.#_guilds_play_data.owner === interaction.member.id) return true;
					await interaction.reply({ephemeral: true, content: i18n.get("errors.disabled_by_owner", interaction.locale)})
					return false;
				}
			}
			else
			{
				if(interaction.member.permissions.has(this.#_discord.PermissionsBitField.Flags.ManageGuild)) return true;
				await interaction.reply({ephemeral: true, content: i18n.get("errors.disabled_by_admin", interaction.locale)})
				return false;
			}
		}
		else
		{
			if(!guild_permissions[command])
			{
				return true;
			}
			else
			{
				if(interaction.member.permissions.has(this.#_discord.PermissionsBitField.Flags.ManageGuild)) return true;
				await interaction.reply({ephemeral: true, content: i18n.get("errors.disabled_by_admin", interaction.locale)})
				return false;
			}
		}
	}

	async #updatePlayerInterface(guild_id, custom_message = undefined)//To test
	{
		return;
		for(let message of this.#_guilds_play_data[guild_id].player_interfaces)
		{
			let success = await message.edit(custom_message === undefined ? await this.#generatePlayerInterface(guild_id) : custom_message).catch((e) => { return false; });
			if(!success)
			{
				this.#_log_function('Player-interface', '[' + guild_id + '] Deleted interface message removed from the internal list');
				let current_pos = this.#_guilds_play_data[guild_id].player_interfaces.indexOf(message);
				if(current_pos !== -1) this.#_guilds_play_data[guild_id].player_interfaces.splice(current_pos, 1);
			}
		}
	}

	#generateQueueInterface(guild_id, page = 0, selected_song = -1)
	{
		if(this.#isObjectValid(guild_id))
		{
			if(page === 0 && selected_song !== -1) page = Math.floor(selected_song / 20);
			let queue_portion = this.#_guilds_play_data[guild_id].queue.slice(20 * page, 20 * (page+1));
			let page_quantity = Math.ceil(this.#_guilds_play_data[guild_id].queue.length / 20);
			let queue = queue_portion.map((x, i) => {
				let gras = ""
				if(i === selected_song - page * 20) gras = "**";
				return gras + ((20 * page + i+1) + ". [" + x.name + "](" + x.link + ")").slice(0, 200) + gras + "\n"
			}).join('');
			if(queue === "") queue = i18n.get("queue_embed.no_song", this.#_guilds_play_data[guild_id].locale)
			let queue_embed = new this.#_discord.EmbedBuilder()
				.setColor([0x62, 0xD5, 0xE9])
				.setTitle(i18n.get("queue_embed.title", this.#_guilds_play_data[guild_id].locale))
				.setDescription(queue);

			let components_queue = [];
			if(selected_song >= 0 && selected_song >= 20 * page && selected_song < 20 * (page+1))
			{
				components_queue.push(new this.#_discord.ActionRowBuilder().addComponents([
					new this.#_discord.ButtonBuilder()
						.setCustomId("btn_queue_play_" + selected_song)
						.setStyle(3)
						.setLabel(i18n.get("buttons.queue_play", this.#_guilds_play_data[guild_id].locale))
						.setDisabled(false),
					new this.#_discord.ButtonBuilder()
						.setCustomId("btn_queue_remove_" + selected_song)
						.setStyle(4)
						.setLabel(i18n.get("buttons.queue_remove", this.#_guilds_play_data[guild_id].locale))
						.setDisabled(false),
					new this.#_discord.ButtonBuilder()
						.setCustomId("btn_queue_page_reset_" + page)
						.setStyle(2)
						.setLabel(i18n.get("buttons.queue_unselect", this.#_guilds_play_data[guild_id].locale))
						.setDisabled(false)
				]));
			}
			else
			{
				components_queue.push(new this.#_discord.ActionRowBuilder().addComponents([
					new this.#_discord.StringSelectMenuBuilder()
						.setCustomId("select_queue_song")
						.setOptions(queue_portion.length > 0 ? queue_portion.map((x, i) => { return {label: (20 * page + i+1) + ". " + x.name.substring(0, 50), value: (20 * page + i) + "", description: undefined}}) : [{label: "undefined", value: "undefined"}])
						.setMaxValues(1)
						.setMinValues(1)
						.setPlaceholder(i18n.get("queue_embed.select_song", this.#_guilds_play_data[guild_id].locale))
						.setDisabled(queue_portion.length > 0 ? false : true)
				]));
			}

			components_queue.push(new this.#_discord.ActionRowBuilder().addComponents([
				new this.#_discord.ButtonBuilder()
					.setCustomId("btn_queue_page_prev_" + (page > 0 ? page - 1 : 0))
					.setStyle(1)
					.setEmoji({name: "⬅️"})
					.setDisabled(page > 0 ? false : true),
				new this.#_discord.ButtonBuilder()
					.setCustomId("initial_duck")
					.setStyle(2)
					.setDisabled(true)
					.setLabel(i18n.place(i18n.get("queue_embed.page", this.#_guilds_play_data[guild_id].locale), {current: page+1, total: Math.ceil(this.#_guilds_play_data[guild_id].queue.length / 20)})),
				new this.#_discord.ButtonBuilder()
					.setCustomId("btn_queue_page_next_" + (page < page_quantity - 1 ? page + 1 : page_quantity - 1))
					.setStyle(1)
					.setEmoji({name: "➡️"})
					.setDisabled(page < page_quantity - 1 ? false : true),
				new this.#_discord.ButtonBuilder()
					.setCustomId("close_any")
					.setStyle(4)
					.setLabel(i18n.get("buttons.queue_hide", this.#_guilds_play_data[guild_id].locale))
			]));

			return {content: '', embeds: [queue_embed], components: components_queue};
		}
		return {content: '❌ I can\'t generate the queue interface, because Theirémi have done an error'}
	}
	//-----//

	//----- Song management -----//
	#add_in_queue(guild_id, link, force_search = false)//To test
	{
		return new Promise(async (resolve, reject) => {
			if(this.#isObjectValid(guild_id))
			{
				if(link.startsWith('https://') || force_search)//It's a link
				{
					if(link.match(/(?:https?:\/\/)?(?:www\.)?youtu\.?be(?:\.com)?\/?.*(?:watch|embed)?(?:.*v=|v\/|\/)([\w\-_]+)\&?/) || force_search)
					{
						if(link.match(/[\?|&]list=([^#\&\?]+)/) && !force_search)//Is a playlist
						{
							this.#_log_function('Player-queue', '[' + guild_id + '] Processing youtube playlist ' + link);
							let playlist_items = await resolve_yt_playlist(link.match(/[\?|&]list=([^#\&\?]+)/)[1]);
							if(playlist_items === false) return reject('This playlist is unavailable');
							if(playlist_items === []) return reject('This playlist is empty');

							resolve('Your playlist is being processed. You music will start very soon !');
							for(let video of playlist_items)
							{
								if(!this.#isObjectValid(guild_id)) break;
								await this.#add_in_queue(guild_id, video).catch((e) => { console.log('Probably useless error 2 : ' + e)});
							}
						}
						else
						{
							let return_resolve = await resolve_yt_video(link, force_search);
							if(return_resolve !== false)
							{
								this.#_log_function('Player-queue', '[' + guild_id + '] Video ' + link + ' from youtube added to queue');
								let current_song_before = this.#get_song(guild_id);

								if(!this.#isObjectValid(guild_id)) return;
								this.#_guilds_play_data[guild_id].queue.push(return_resolve);
								if(current_song_before === undefined)
								{
									await this.#play_song(guild_id);
									await this.#updatePlayerInterface(guild_id);
								}

								resolve('Your music has been added to queue');
							}
							else return reject('This video is unavailable');
						}
					}
					else if(link.match(/https:\/\/www\.deezer\.com(?:\/[a-zA-Z-]{1,5})?\/(track|playlist|album)\/(\d+)/))
					{
						let matches = link.match(/https:\/\/www\.deezer\.com\/(track|playlist|album)\/(\d+)/);
						let music_data_query = await axios({url: "https://api.deezer.com/" + matches[1] + "/" + matches[2],
							method: 'get'
						});

						console.log(music_data_query.data);
						if(music_data_query.data === undefined) return reject('This music/playlist is unavailable');

						if(matches[1] === "track")
						{
							this.#_log_function('Player-queue', '[' + guild_id + '] Music ' + link + ' from deezer added to queue');
							this.#add_in_queue(guild_id, music_data_query.data.title + " " + music_data_query.data.artist.name + " music", true).then(function(){
								resolve('Your music has been added to queue');
							}, function(){
								return reject('This music is unavailable');
							});
							
							return;
						}
						else if(matches[1] === "playlist" || matches[1] === "album")
						{
							this.#_log_function('Player-queue', '[' + guild_id + '] Processing deezer playlist ' + link);
							resolve('Your playlist is being processed. You music will start very soon !')
							for(let e of music_data_query.data.tracks.data)
							{
								if(!this.#isObjectValid(guild_id)) break;
								await this.#add_in_queue(guild_id, e.title + " " + e.artist.name + " music", true).catch((e) => { console.log('Probably useless error 3 : ' + e)});
							}
						}
						else return reject('How do you do that ?');
					}
					else if(link.match(/https:\/\/deezer\.page\.link\/([0-9a-zA-Z]+)/))
					{
						let unshorten = await axios({url: link,
							method: 'get',
							maxRedirects: 0,
							validateStatus: x => x === 302
						});

						this.#add_in_queue(guild_id, unshorten.headers.location).then(resolve, reject);
					}
					else if(link.match(/https:\/\/open\.spotify\.com\/(track|playlist|album)\/([0-9A-Za-z]+)/))
					{
						let spotify_auth_query = await axios({
							url: "https://accounts.spotify.com/api/token",
							method: 'POST',
							headers: {
								'Authorization': 'Basic ' + Buffer.from("cc16fd3f4b1a4108ab771c35bfc5291c:373553be22a745ce8e37759c299869d0").toString('base64')
							},
							data: "grant_type=client_credentials"
						});
						//console.log(spotify_auth_query.data);

						let matches = link.match(/https:\/\/open\.spotify\.com\/(track|playlist|album)\/([0-9A-Za-z]+)/);
						let music_data_query = await axios({url: "https://api.spotify.com/v1/" + matches[1] + "s/" + matches[2],
							method: 'get',
							headers: {
								'Authorization': 'Bearer ' + spotify_auth_query.data.access_token
							}
						});

						//console.log(music_data_query.data);
						if(music_data_query.data === undefined) return reject('This music/playlist is unavailable');

						if(matches[1] === "track")
						{
							this.#_log_function('Player-queue', '[' + guild_id + '] Music ' + link + ' from spotify added to queue');
							this.#add_in_queue(guild_id, music_data_query.data.name + " " + music_data_query.data.artists[0].name + " music", true).then(function(){
								resolve('Your music has been added to queue');
							}, function(){
								return reject('This music is unavailable');
							});
							
							return;
						}
						else if(matches[1] === "playlist" || matches[1] === "album")
						{
							this.#_log_function('Player-queue', '[' + guild_id + '] Processing spotify playlist ' + link);
							resolve('Your playlist is being processed. You music will start very soon !')
							for(let e of music_data_query.data.tracks.items)
							{
								if(!this.#isObjectValid(guild_id)) break;
								let track_name = "";
								let artist_name = "";
								if(e.track !== undefined)
								{
									track_name = e.track.name;
									artist_name = e.track.artists[0].name
								}
								else
								{
									track_name = e.name;
									artist_name = e.artists[0].name
								}
								await this.#add_in_queue(guild_id, track_name + " " + artist_name + " music", true).catch((e) => { console.log('Probably useless error 3 : ' + e)});
							}
						}
						return reject('Spotify support will be released in the 1.1.1 version. See `/changelog`');
					}
					else return reject('This platform is not supported right now, but feel free to propose it using </feedback:1060125997359448064> !');
				}
				else if(link.startsWith('radio://'))
				{
					let raw_radio_file = await fs.readFile(__dirname + '/radios.json', {encoding: 'utf-8'});
					if(isJsonString(raw_radio_file))
					{
						let all_radios = JSON.parse(raw_radio_file);
						let selected_radio = all_radios.find(x => 'radio://' + x.id === link);

						if(selected_radio !== undefined)
						{
							let current_song_before = this.#get_song(guild_id);
							this.#_guilds_play_data[guild_id].queue.push({
								link: selected_radio.link,
								play_link: selected_radio.play_link,
								name: selected_radio.name,
								thumbnail: selected_radio.thumbnail,
								play_headers: {}
							});

							if(current_song_before === undefined) await this.#play_song(guild_id);
							await this.#updatePlayerInterface(guild_id);

							resolve('Your radio has been added to queue');
						}
						else return reject('This radio does not exist');
					}
					else return reject('Radios metadata are corrupted, Theirémi have some debugging to do');
				}
				else return reject('Error');
			}
		});
	}
	async #next_song(guild_id, force = false)//To test
	{
		if(this.#get_song(guild_id) !== undefined)
		{
			if(this.#_guilds_play_data[guild_id].shuffle && !force) this.#_guilds_play_data[guild_id].current_track = Math.floor(Math.random() * this.#_guilds_play_data[guild_id].queue.length);
			else if(!this.#_guilds_play_data[guild_id].loop || force) this.#_guilds_play_data[guild_id].current_track++;
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

	#get_song(guild_id, pos = 0, absolute = false)//To test
	{
		if(this.#_guilds_play_data[guild_id] !== undefined)
		{
			if((absolute ? 0 : this.#_guilds_play_data[guild_id].current_track) + pos >= 0)
			{
				return this.#_guilds_play_data[guild_id].queue[(absolute ? 0 : this.#_guilds_play_data[guild_id].current_track) + pos] !== undefined ? this.#_guilds_play_data[guild_id].queue[(absolute ? 0 : this.#_guilds_play_data[guild_id].current_track) + pos] : undefined;
			}
		}
		return undefined;
	}

	async #play_song(guild_id)//Works
	{
		return new Promise(async (resolve, reject) => {
			if(this.#get_song(guild_id) !== undefined)
			{
				let link = this.#get_song(guild_id).link;
				this.#_log_function('Player-song', '[' + guild_id + '] Playing ' + link + ' at volume ' + this.#_guilds_play_data[guild_id].volume);

				this.#_guilds_play_data[guild_id].request_controller = new AbortController();
				let play_link_process = await axios({
					url: this.#get_song(guild_id).play_link,
					method: 'get',
					responseType: 'stream',
					headers: Object.assign(this.#get_song(guild_id).play_headers, {"Accept-Encoding": "deflate, br"}),
					signal: this.#_guilds_play_data[guild_id].request_controller.signal
				}).catch((e) => {
					console.log(e);
					this.#_log_function('Player-song', '[' + guild_id + '] Error fetching song');
				});
				if(play_link_process === undefined) return false;

				let transcoder = new prism.FFmpeg({args: [
					'-analyzeduration', '0',
					'-loglevel', '0',
					'-f', 's16le',
					'-ar', '48000',
					'-ac', '2',
					'-s:a', '240'
				]});
				this.#_guilds_play_data[guild_id].volumeTransformer = new prism.VolumeTransformer({type: 's16le', volume: this.#_guilds_play_data[guild_id].volume});
				let encoder = new prism.opus.Encoder({channels: 2, rate: 48000, frameSize: 960});

				let resource = Voice.createAudioResource(play_link_process.data.pipe(transcoder).pipe(this.#_guilds_play_data[guild_id].volumeTransformer).pipe(encoder), {inputType: "opus"});
				/*resource.playStream.on('data', function(data)
				{
					//console.log(data.length);
				})*/
				
				/*this.#_guilds_play_data[guild_id].transformer = new PlayerTransform({
					volume: this.#_guilds_play_data[guild_id].volume
				});
				let resource = Voice.createAudioResource(play_link_process.data.pipe(this.#_guilds_play_data[guild_id].transformer).pipe(new prism.opus.OggDemuxer()), {inputType: "opus"});*/
				
				this.#_guilds_play_data[guild_id].player.play(resource);

				this.#_guilds_play_data[guild_id].is_playing = true;
			}
			resolve();
		});
	}
	//-----//
}

//----- YOUTUBE UTILITIES -----//
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
			safeSearch: 'strict'
		},
		validateStatus: function (status) {
			return status >= 200 && status < 500;
		}
	});

	if(video_data.data.error !== undefined) return false;
	return video_data.data.items.map((x) => {return {name: x.snippet.title, link: "https://www.youtube.com/watch?v=" + x.id.videoId}});
}

async function resolve_yt_video(link, search)
{
	if(search || link.match(/(?:https?:\/\/)?(?:www\.)?youtu\.?be(?:\.com)?\/?.*(?:watch|embed)?(?:.*v=|v\/|\/)([\w\-_]+)\&?/))
	{
		let video_data_process = await spawnAsync('yt-dlp', ['-f', 'bestaudio', '--default-search', 'auto', '--no-playlist', '-J', link], {encoding: 'utf-8'});
		if(video_data_process.stderr !== "") console.log(video_data_process.stderr);
		if(!isJsonString(video_data_process.stdout)) return false;

		let video_data = JSON.parse(video_data_process.stdout);
		if(video_data == undefined) return false;

		if(video_data.entries !== undefined && video_data._type === "playlist") video_data = video_data.entries[0];
		if(video_data &&
			video_data.original_url &&
			video_data.requested_downloads &&
			video_data.title &&
			video_data.thumbnail &&
			video_data.age_limit === 0)
		{
			return {
				link: video_data.original_url,
				play_link: video_data.requested_downloads[0].url,
				name: video_data.title,
				thumbnail: video_data.thumbnail,
				play_headers: video_data.requested_downloads[0].http_headers
			};
		}
		else return false;
	}
}

async function resolve_yt_playlist(playlist_id)
{
	let video_data = await axios({url: "https://www.googleapis.com/youtube/v3/playlistItems",
		method: 'get',
		headers: {
			"Accept-Encoding": "deflate, br"
		},
		params: {
			key: "AIzaSyDAAk5CiS6FfmAg1r5ClftdooAIB-nomdQ",
			part: "snippet",
			maxResults: 50,
			playlistId: playlist_id
		},
		validateStatus: function (status) {
			return status >= 200 && status < 500;
		}
	});
	if(video_data.data.error !== undefined) return false;
	return video_data.data.items.map((x) => "https://www.youtube.com/watch?v=" + x.snippet.resourceId.videoId);
}
//-----//

//----- SOUNDCLOUD UTILITIES -----//
async function sc_search(term)
{
	let video_data = await axios({url: "https://api-v2.soundcloud.com/search/tracks",
		method: 'get',
		headers: {
			"Accept-Encoding": "deflate, br",
			"User-Agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:108.0) Gecko/20100101 Firefox/108.0",
			"Accept": "application/json, text/javascript"
		},
		params: {
			sc_a_id: "3d1709b864256e6701c60bcc16d925c0c43328fa",
			user_id: "27375-340005-10682-566993",
			client_id: "ZQvaVYuPpe0Pg7Ga7V24qFseYl6eTK73",
			limit: 5,
			q: term,
		},
		validateStatus: function (status) {
			return status >= 200 && status < 500;
		}
	});

	if(video_data.data.error !== undefined) return false;
	return video_data.data.collection.map((x) => {return {name: x.title, link: x.permalink_url}});
}

async function resolve_sc_music(link)
{
	if(link.match(/(?:https?:\/\/)?(?:www\.)?youtu\.?be(?:\.com)?\/?.*(?:watch|embed)?(?:.*v=|v\/|\/)([\w\-_]+)\&?/))
	{
		let video_data_process = await spawnAsync('yt-dlp', ['-f', 'bestaudio', '--default-search', 'auto', '--no-playlist', '-J', link], {encoding: 'utf-8'});
		if(video_data_process.stderr !== "") console.log(video_data_process.stderr);
		if(!isJsonString(video_data_process.stdout)) return false;

		let video_data = JSON.parse(video_data_process.stdout);
		if(video_data === undefined) return false;

		if(video_data.entries !== undefined && video_data._type === "playlist") video_data = video_data.entries[0];
		if(video_data &&
			video_data._type === "video" &&
			video_data.original_url &&
			video_data.requested_downloads &&
			video_data.title &&
			video_data.thumbnail)
		{
			return {
				link: video_data.original_url,
				play_link: video_data.requested_downloads[0].url,
				name: video_data.title,
				thumbnail: video_data.thumbnail,
				play_headers: video_data.requested_downloads[0].http_headers
			};
		}
		else return false;
	}
}

async function resolve_sc_playlist(playlist_id)
{
	let video_data = await axios({url: "https://www.googleapis.com/youtube/v3/playlistItems",
		method: 'get',
		headers: {
			"Accept-Encoding": "deflate, br"
		},
		params: {
			key: "AIzaSyDAAk5CiS6FfmAg1r5ClftdooAIB-nomdQ",
			part: "snippet",
			maxResults: 50,
			playlistId: playlist_id
		},
		validateStatus: function (status) {
			return status >= 200 && status < 500;
		}
	});
	if(video_data.data.error !== undefined) return false;
	return video_data.data.items.map((x) => "https://www.youtube.com/watch?v=" + x.snippet.resourceId.videoId);
}
//-----//

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

async function spawnAsync(command, args, options)
{
	return new Promise(async (resolve, reject) => {
		let worker = new worker_threads.Worker(
			"let data = require('worker_threads').workerData;\
			let spawn = require('child_process').spawnSync;\
			let spawn_process = spawn(data.command, data.args, data.options);\
			require('worker_threads').parentPort.postMessage({stdout: spawn_process.stdout, stderr: spawn_process.stderr});\
			"
		, {
			eval: true,
			workerData: {command, args, options}
		});
		worker.on('message', function (msg)
		{
			resolve(msg);
		});
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