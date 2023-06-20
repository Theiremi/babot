//----- MJS patches -----//
import * as url from 'url';
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
//-----//

import { EventEmitter } from 'events';
import fsc from 'fs';
const fs = fsc.promises;
import path from 'path';
import worker_threads from 'worker_threads';
import Discord from 'discord.js';
import * as Voice from '@discordjs/voice';
import * as Builders from '@discordjs/builders';
import child_process from 'child_process';
import axios from 'axios';
import prism from 'prism-media';
//const { PlayerTransform } from './ffmpeg_transform.js');
import I18n from '#classes/locales.js';
import miscs from '#classes/miscs.js';
import styles from './styles.json' assert {type: "json"};
import tip_list from './tips.json' assert {type: "json"};
const i18n = new I18n('player');
import babot_env from '#root/env_data/env.json' assert {type: "json"};
import logger from '#classes/logger.mjs';
const Filter = (await miscs.importIfExists(__dirname + '../../../filters/index.js', 'pcm-effects')).default;
import ReadableString from '#classes/readableString.mjs';
import Readable from 'stream';


let search_cache = {list: {}, index: 0};
let tip_index = 0;

export default class Player extends EventEmitter {
	#_guilds_play_data = {};
	#_client;
	#_shutdown = false;

	constructor(client)
	{
		super();
		this.#_client = client;

		setInterval(() => {
			tip_index++;
			if(tip_index >= tip_list.length) tip_index = 0;
		}, 60*1000*5);
	}

	async options()//Works
	{
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
			option.setName('target');
			option.setDescription(i18n.get("chatinputcommands.troll_user"));
			option.setDescriptionLocalizations(i18n.all("chatinputcommands.troll_user"));
			option.setRequired(true);
			return option;
		});
		player_commands[1].addStringOption((option) => {
			option.setName('song');
			option.setDescription(i18n.get("chatinputcommands.troll_song"));
			option.setDescriptionLocalizations(i18n.all("chatinputcommands.troll_song"));
			option.setAutocomplete(true);
			//option.addChoices(...song_choices);
			option.setRequired(true);
			return option;
		});
		player_commands[1].addNumberOption((option) => {
			option.setName('volume');
			option.setDescription(i18n.get("chatinputcommands.troll_volume"));
			option.setDescriptionLocalizations(i18n.all("chatinputcommands.troll_volume"));
			option.setRequired(false);
			option.setMinValue(1);
			option.setMaxValue(10_000);
			return option;
		});

		player_commands.push(new Builders.SlashCommandBuilder()
			.setName('quickplay')
			.setDescription(i18n.get("chatinputcommands.quickplay"))
			.setDescriptionLocalizations(i18n.all("chatinputcommands.quickplay"))
			.setDMPermission(false)
			.addStringOption(option => option
				.setName('search_or_link')
				.setDescription(i18n.get("chatinputcommands.quickplay_link"))
				.setDescriptionLocalizations(i18n.all("chatinputcommands.quickplay_link"))
				.setMaxLength(250)
				.setRequired(true)
			)
		);

		return player_commands.map(x => x.toJSON());
	}

	emergencyShutdown()
	{
		for(let e of Object.values(this.#_guilds_play_data))
		{
			if(e.ffmpeg_process) e.ffmpeg_process.destroy();
		}
	}

	playerCount()
	{
		return Object.values(this.#_guilds_play_data).filter(x => x !== undefined).length;
	}

	async configure(interaction)
	{
		await interaction.reply(await this.#generatePlayerSettingsInterface(interaction.guildId, 0, interaction.locale)).catch(e => console.log('reply error : ' + e));
	}

	async interactionCreate(interaction)
	{
		if(interaction.isMessageContextMenuCommand()) console.log(interaction, interaction.targetMessage);
		//----- Chat Interactions -----//
		if(interaction.isChatInputCommand())
		{
			if(!['player', 'troll', 'quickplay'].includes(interaction.commandName)) return false;

			if(!interaction.inGuild() || interaction.member == undefined)//The user is in a guild, and a Guildmember object for this user exists
			{
				logger.warn('Command `' + interaction.commandName + '` received outside of a guild');
				await interaction.reply({ephemeral: true, content: i18n.get("errors.guild_only", interaction.locale)});
				return;
			}

			logger.info('Command `' + interaction.commandName + '` received', [{tag: "u", value: interaction.user.id}, {tag: "g", value: interaction.guildId}]);
			if(interaction.commandName === 'player')//Ask for a player to be displayed
			{
				if(await this.spawnPlayer(interaction))
				{
					if(await this.#_client.stored_data.isGuildGolden(interaction.guildId)) logger.notice('Wow, a golden player spawned !', [{tag: "g", value: interaction.guildId}]);
					await interaction.reply(await this.#generatePlayerInterface(interaction.guildId));
					let player_message = await interaction.fetchReply().catch(() => false);
					if(player_message !== false) this.#_guilds_play_data[interaction.guildId]?.player_interfaces?.push(player_message);
				}
			}
			if(interaction.commandName === 'quickplay')//Ask for a player to be displayed
			{
				if(await this.spawnPlayer(interaction))
				{
					const value = interaction.options.getString('search_or_link');
					await this.#link_or_search_input(interaction, value);
				}
			}
			else if(interaction.commandName === 'troll')
			{
				await interaction.deferReply({ephemeral: true});
				if(!interaction.options.getMember('target') || !interaction.options.getString('song'))
				{
					logger.warn('A parameter is missing in the troll command', [{tag: "g", value: interaction.guildId}]);
					interaction.editReply({ content: i18n.get("errors.user_not_found", interaction.locale), ephemeral: true });
					return;
				}

				let target = interaction.options.getMember('target');
				if(target.voice.channelId === null)
				{
					logger.notice('The targeted user isn\'t in a voice channel', [{tag: "g", value: interaction.guildId}]);
					interaction.editReply({ content: i18n.get("errors.user_not_in_voice_channel", interaction.locale), ephemeral: true });
					return;
				}

				let cantroll = await this.#_client.stored_data.canTroll(interaction.guildId, target.user.id)
				if(cantroll === 1)
				{
					logger.notice('Troll disabled in the server', [{tag: "g", value: interaction.guildId}]);
					interaction.editReply({ content: i18n.get("errors.troll_disabled_guild", interaction.locale), ephemeral: true });
					return;
				}
				else if(cantroll === 2)
				{
					logger.notice('Troll disabled by the targeted user', [{tag: "g", value: interaction.guildId}]);
					interaction.editReply({ content: i18n.get("errors.dont_disturb", interaction.locale), ephemeral: true });
					return;
				}

				let troll_song = interaction.options.getString('song');
				troll_song = await this.#resolveTrollSong(interaction.guildId, troll_song);
				if(troll_song === false)
				{
					logger.notice('The selected troll song doesn\'t exists : ' + troll_song, [{tag: "g", value: interaction.guildId}]);
					interaction.editReply({ content: i18n.get("errors.song_not_found", interaction.locale), ephemeral: true });
					return;
				}

				logger.info('User ' + target.user.tag + ' targeted by troll ' + interaction.options.getString('song') + ' with volume ' + interaction.options.getNumber('volume'), [{tag: "g", value: interaction.guildId}]);

				let previous_connection = false;
				if(this.#isObjectValid(interaction.guildId))
				{
					if(this.#_guilds_play_data[interaction.guildId].voice_connection.joinConfig.channelId !== interaction.member.voice.channelId)
					{
						logger.notice('Can\'t troll because a player is being used', [{tag: "g", value: interaction.guildId}]);
						interaction.editReply({content: i18n.get("errors.player_already_used", interaction.locale), ephemeral: true });
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
				const resource_buffer = await this.#_client.stored_data.hGetBuffer(troll_song.split('/')[0], troll_song.split('/')[1]);
				let troll_resource = Voice.createAudioResource(new ReadableString(resource_buffer), {inlineVolume: troll_volume ? true : false});
				if(troll_volume) troll_resource.volume.setVolume(troll_volume);
				//---//

				//--- TROLL PLAYER ---//
				let troll_player = new Voice.AudioPlayer({noSubscriber: Voice.NoSubscriberBehavior.Pause});
				troll_player.on('error', function(e) {
					console.log(e);
				});

				troll_player.play(troll_resource);
				//---//

				await this.#vote_wait(interaction, 10);

				//--- TROLL VOICE ---//
				let troll_connection = Voice.joinVoiceChannel({
					adapterCreator: (await this.#_client.guilds.fetch(interaction.guildId)).voiceAdapterCreator,
					guildId: interaction.guildId,
					channelId: target.voice.channelId,
					selfDeaf: true,
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

				interaction.editReply({content: i18n.get("troll_success", interaction.locale), embeds: [], components: []});
			}
		}
		//-----//

		//----- Autocomplete interaction -----//
		else if(interaction.isAutocomplete())
		{
			if(!['troll'].includes(interaction.commandName)) return false;

			if(interaction.commandName === "troll")
			{
				let input_field = interaction.options.getString('song');
				let song_choices = await this.#getTrollList(interaction.guildId);
				song_choices.sort(() => 0.5 - Math.random());
				song_choices = song_choices.slice(0, 25);
				song_choices = song_choices.filter(x => x.name.toLowerCase().indexOf(input_field.toLowerCase()) !== -1)

				await interaction.respond(song_choices);
			}
		}
		//-----//

		//----- Buttons Interactions -----//
		else if(interaction.isButton())
		{
			if(!['btn_restart', 'btn_previous', 'btn_backward', 'btn_play', 'btn_pause', 'btn_forward', 'btn_next', 'btn_volume', 'loop', 'unloop', 'shuffle', 'unshuffle', 'queue', 'open_modal_add', 'hide', 'stop', 'leave', 'initial_duck', 'btn_inactive_leave', 'btn_stay', 'btn_stay_forever', 'owner_settings'].includes(interaction.customId) &&
				!interaction.customId.startsWith('btn_queue_page_') &&
				!interaction.customId.startsWith('btn_queue_play_') &&
				!interaction.customId.startsWith('btn_queue_remove_') &&
				!interaction.customId.startsWith('global_config_') &&
				!interaction.customId.startsWith('session_config_')) return false;

			logger.info('Command `' + interaction.customId + '` received', [{tag: "u", value: interaction.user.id}, {tag: "g", value: interaction.guildId}]);

			if(!interaction.inGuild() && interaction.member != undefined)//The user is in a guild, and a Guildmember object for this user exists
			{
				await interaction.reply({ephemeral: true, content: i18n.get("errors.guild_only", interaction.locale)});
				return;
			}

			if(interaction.customId.startsWith("global_config_"))
			{
				let target_btn = interaction.customId.substring(14);
				if(!['restart', 'forward', 'backward', 'previous', 'play', 'pause', 'next', 'volume', 'loop', 'shuffle', 'open_modal_add', 'hide', 'stop', 'leave', 'owner_settings'].includes(target_btn)) return;

				let permission = await this.#_client.stored_data.hGet(`guild:${interaction.guildId}:permissions`, target_btn);

		        permission = permission ? false : true;
		        logger.info('Set ' + target_btn + ' in the server to ' + (permission ? "disabled" : "enabled"), [{tag: "g", value: interaction.guildId}]);
		        await this.#_client.stored_data.hSet(`guild:${interaction.guildId}:permissions`, target_btn, permission);
		        await interaction.update(await this.#generatePlayerSettingsInterface(interaction.guildId, 0, interaction.locale)).catch((e) => {console.log('update error : ' + e)});
		        return;
			}


			if(!this.#isObjectValid(interaction.guildId))
			{
				interaction.reply({content: i18n.get("errors.no_player", interaction.locale), ephemeral: true}).catch(e => console.log('reply error : ' + e));
				return;
			}

			if(interaction.customId === "btn_inactive_leave")
			{
				if(this.#_guilds_play_data[interaction.guildId].inactive_timer !== false)
				{
					await interaction.update({content: i18n.get("response_msg.leave", this.#_guilds_play_data[interaction.guildId].locale), embeds: [], components: []}).catch((e) => {console.log('update error : ' + e)});
					this.#destroyObject(interaction.guildId);
				}
				else await interaction.reply({ephemeral: true, content: i18n.get("errors.not_alone", interaction.locale)}).catch(e => console.log('reply error : ' + e));
				return;
			}
			if(interaction.customId === "btn_stay")
			{
				if(this.#_guilds_play_data[interaction.guildId].inactive_timer !== false)
				{
					clearTimeout(this.#_guilds_play_data[interaction.guildId].inactive_timer);
					this.#_guilds_play_data[interaction.guildId].inactive_timer = false;

					await interaction.reply({ephemeral: true, content: i18n.get("response_msg.stay_until_user", interaction.locale)}).catch(e => console.log('reply error : ' + e));

					await this.#updatePlayerInterface(interaction.guildId);
				}
				else await interaction.reply({ephemeral: true, content: i18n.get("errors.not_alone", interaction.locale)}).catch(e => console.log('reply error : ' + e));
				return;
			}
			if(interaction.customId === "btn_stay_forever")
			{
				if(this.#_guilds_play_data[interaction.guildId].inactive_timer === false)
				{
					await interaction.reply({ephemeral: true, content: i18n.get("errors.not_alone", interaction.locale)}).catch(e => console.log('reply error : ' + e));
					return;
				}

				if(!await this.#_client.stored_data.isGolden(interaction.guildId, interaction.user.id))
				{
					await interaction.reply({ephemeral: true, content: i18n.get("response_msg.golden_level", interaction.locale)}).catch(e => console.log('reply error : ' + e));
					return;
				}

				clearTimeout(this.#_guilds_play_data[interaction.guildId].inactive_timer);
				this.#_guilds_play_data[interaction.guildId].inactive_timer = false;
				this.#_guilds_play_data[interaction.guildId].force_active = true;

				await interaction.reply({ephemeral: true, content: i18n.get("response_msg.stay_forever", interaction.locale)}).catch(e => console.log('reply error : ' + e));

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
				if(!['restart', 'forward', 'backward', 'previous', 'play', 'pause', 'next', 'volume', 'loop', 'shuffle', 'open_modal_add', 'hide', 'stop', 'leave'].includes(target_btn)) return;

		        if(this.#_guilds_play_data[interaction.guildId].permissions[target_btn]) this.#_guilds_play_data[interaction.guildId].permissions[target_btn] = false;
		        else this.#_guilds_play_data[interaction.guildId].permissions[target_btn] = true;
		        logger.info('Set ' + target_btn + ' in the player to ' + (this.#_guilds_play_data[interaction.guildId].permissions[target_btn] ? "disabled" : "enabled"), [{tag: "g", value: interaction.guildId}]);
		        await interaction.update(await this.#generatePlayerSettingsInterface(interaction.guildId, 1, interaction.locale)).catch((e) => {console.log('update error : ' + e)});
		        return;
			}

			else if(interaction.customId === "btn_restart")//Works
			{
				if(!await this.#checkPermission("restart", interaction)) return;
				if(this.#get_song(interaction.guildId) !== undefined)
				{
					this.#play_song(interaction.guildId);
				}
				await interaction.update(await this.#generatePlayerInterface(interaction.guildId)).catch(e => console.log('update error : ' + e));
			}
			else if(interaction.customId === "btn_previous")//Works
			{
				if(!await this.#checkPermission("previous", interaction)) return;
				this.#prev_song(interaction.guildId);
				await interaction.update({}).catch(e => console.log('update error : ' + e));
			}
			else if(interaction.customId === "btn_backward")//Works
			{
				if(!await this.#checkPermission("backward", interaction)) return;
				if(this.#_guilds_play_data?.[interaction.guildId]?.filters)
				{
					this.#_guilds_play_data?.[interaction.guildId]?.filters.backward(10);
				}
				await interaction.update({}).catch(e => console.log('update error : ' + e));
			}
			else if(interaction.customId === "btn_play")//Works
			{
				if(!await this.#checkPermission("play", interaction)) return;
				this.#_guilds_play_data[interaction.guildId].player.unpause(true);
				this.#_guilds_play_data[interaction.guildId].is_playing = true;
				await interaction.update(await this.#generatePlayerInterface(interaction.guildId)).catch(e => console.log('update error : ' + e));
			}
			else if(interaction.customId === "btn_pause")//Works
			{
				if(!await this.#checkPermission("play", interaction)) return;
				this.#_guilds_play_data[interaction.guildId].player.pause(true);
				this.#_guilds_play_data[interaction.guildId].is_playing = false;
				await interaction.update(await this.#generatePlayerInterface(interaction.guildId)).catch((e) => { console.log('Update error : ' + e)});
			}
			else if(interaction.customId === "btn_forward")//Works
			{
				if(!await this.#checkPermission("for", interaction)) return;
				if(this.#_guilds_play_data?.[interaction.guildId]?.filters)
				{
					this.#_guilds_play_data?.[interaction.guildId]?.filters.forward(30);
				}
				await interaction.update({}).catch(e => console.log('update error : ' + e));
			}
			else if(interaction.customId === "btn_next")//Works
			{
				if(!await this.#checkPermission("next", interaction)) return;
				this.#next_song(interaction.guildId, false);
				await interaction.update({});
			}
			else if(interaction.customId === "btn_volume")//Works
			{//5jwe0
				if(!await this.#checkPermission("volume", interaction)) return;
				let player_interface = await this.#generatePlayerInterface(interaction.guildId);
				let used_style = this.#_guilds_play_data[interaction.guildId].style;
				player_interface.components.push(new Discord.ActionRowBuilder().addComponents([
					new Discord.StringSelectMenuBuilder()
						.setCustomId("select_volume")
						.setPlaceholder('Choose your volume level')
						.addOptions([
							{label: '20 %', value: "20", emoji: this.#emojiStyle("volume_low", used_style), default: this.#_guilds_play_data[interaction.guildId].volume === 0.2},
							{label: '40 %', value: "40", emoji: this.#emojiStyle("volume_low", used_style), default: this.#_guilds_play_data[interaction.guildId].volume === 0.4},
							{label: '60 %', value: "60", emoji: this.#emojiStyle("volume_medium", used_style), default: this.#_guilds_play_data[interaction.guildId].volume === 0.6},
							{label: '80 %', value: "80", emoji: this.#emojiStyle("volume_high", used_style), default: this.#_guilds_play_data[interaction.guildId].volume === 0.8},
							{label: '100 %', value: "100", emoji: this.#emojiStyle("volume_high", used_style), default: this.#_guilds_play_data[interaction.guildId].volume === 1},
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
			}
			else if(interaction.customId === "open_modal_add")//Works
			{
				if(!await this.#checkPermission("open_modal_add", interaction)) return;
				interaction.showModal(new Discord.ModalBuilder().addComponents([
					new Discord.ActionRowBuilder().addComponents([
						new Discord.TextInputBuilder()
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
				await interaction.reply({content: i18n.get("response_msg.hide", interaction.locale), ephemeral: true});
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
			}
			else if(interaction.customId === "leave")
			{
				if(!await this.#checkPermission("leave", interaction)) return;
				await interaction.update({content: i18n.get("response_msg.leave", this.#_guilds_play_data[interaction.guildId].locale), embeds: [], components: []}).catch((e) => {console.log('update error : ' + e)});
				this.#destroyObject(interaction.guildId);
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
					await interaction.update(this.#generateQueueInterface(interaction.guildId));
				}
			}

			else if(interaction.customId === "owner_settings")
			{
				if(interaction.member.id !== this.#_guilds_play_data[interaction.guildId].owner)
				{
					await interaction.reply({allowedMentions: {}, content: i18n.get('errors.owner_only', interaction.locale, {username: (await this.#_client.users.fetch(this.#_guilds_play_data[interaction.guildId].owner).catch(() => undefined))?.toString()}), ephemeral: true});
					return;
				}
				await interaction.reply(await this.#generatePlayerSettingsInterface(interaction.guildId, 1, interaction.locale));
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

			logger.info('Command `' + interaction.customId + '` received', [{tag: "u", value: interaction.user.id}, {tag: "g", value: interaction.guildId}]);
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

				this.#link_or_search_input(interaction, value);
			}
			//---//
			else interaction.reply({content: i18n.get("errors.interaction", interaction.locale), ephemeral: true});
		}
		//-----//

		//----- Select menus interactions -----//
		else if(interaction.isStringSelectMenu())
		{
			if(!['select_volume', 'select_add_song', 'select_queue_song', 'global_player_style', 'session_player_style'].includes(interaction.customId)) return false;
			logger.info('Command `' + interaction.customId + '` received', [{tag: "u", value: interaction.user.id}, {tag: "g", value: interaction.guildId}]);

			if(!interaction.inGuild() && interaction.member != undefined)//The user is in a guild, and a Guildmember object for this user exists
			{
				await interaction.reply({ephemeral: true, content: i18n.get("errors.guild_only", interaction.locale)}).catch(e => console.log('reply error : ' + e));
				return;
			}

			if(interaction.customId === "global_player_style")
			{
		        logger.info('Set style of the server to ' + interaction.values[0], [{tag: "g", value: interaction.guildId}]);
		        await this.#_client.stored_data.hSet(`guild:${interaction.guildId}:config`, 'style', interaction.values[0]);
		        await interaction.update(await this.#generatePlayerSettingsInterface(interaction.guildId, 0, interaction.locale));
		        return;
			}

			if(!this.#isObjectValid(interaction.guildId))
			{
				interaction.reply({content: i18n.get("errors.no_player", interaction.locale), ephemeral: true}).catch(e => console.log('reply error : ' + e));
				return;
			}

			if(interaction.customId === "session_player_style")
			{
		        this.#_guilds_play_data[interaction.guildId].style = interaction.values[0];
		        logger.info('Set style of the player to ' + this.#_guilds_play_data[interaction.guildId].style, [{tag: "g", value: interaction.guildId}]);
		        await interaction.update(await this.#generatePlayerSettingsInterface(interaction.guildId, 1, interaction.locale));
		        await this.#updatePlayerInterface(interaction.guildId);
		        return;
			}

			if(interaction.member.voice.channelId !== this.#_guilds_play_data[interaction.guildId].voice_connection.joinConfig.channelId)
			{
				await interaction.reply({content: i18n.get("errors.not_my_channel", interaction.locale), ephemeral: true}).catch(e => console.log('reply error : ' + e));
				return;
			}

			if(interaction.customId === "select_volume")//Works
			{
				if(!await this.#checkPermission("volume", interaction)) return;
				if(['20', '40', '60', '80', '100', '150', '200', '250', '500', '1000', '10000'].includes(interaction.values[0]))
				{
					logger.info('Change volume from ' + (this.#_guilds_play_data[interaction.guildId].volume * 100) + '% to ' + interaction.values[0] + '%', [{tag: "g", value: interaction.guildId}]);
					this.#_guilds_play_data[interaction.guildId].volume = parseInt(interaction.values[0]) / 100;
					if(this.#get_song(interaction.guildId) !== undefined &&
						this.#_guilds_play_data[interaction.guildId].filters)
					{
						this.#_guilds_play_data[interaction.guildId].filters.setVolume(this.#_guilds_play_data[interaction.guildId].volume);
						/*this.#_guilds_play_data[interaction.guildId].transformer.changeSettings({volume: this.#_guilds_play_data[interaction.guildId].volume});
						let resource = Voice.createAudioResource(this.#_guilds_play_data[interaction.guildId].transformer.pipe(new prism.opus.OggDemuxer()), {inputType: "opus"});
						this.#_guilds_play_data[interaction.guildId].player.play(resource);*/
					}

					await interaction.update(await this.#generatePlayerInterface(interaction.guildId)).catch(e => console.log('update error : ' + e));
				}
				else await interaction.reply({content: i18n.get("errors.interaction", interaction.locale), ephemeral: true}).catch(e => console.log('reply error : ' + e));
			}
			else if(interaction.customId === "select_add_song")
			{
				if(search_cache.list[interaction.values[0]] === undefined)
				{
					interaction.reply({content: i18n.get('errors.search_cache_error')});
					return;
				}
				const song_link = search_cache.list[interaction.values[0]];
				delete search_cache.list[interaction.values[0]];
				if(!await this.#checkPermission("open_modal_add", interaction)) return;
				logger.info('Link "' + song_link + '" selected', [{tag: "g", value: interaction.guildId}]); 
				await interaction.message.delete().catch((e) => { console.log('Probably useless error 5 : ' + e)});
				await interaction.deferReply({ephemeral: true});

				let return_message = await this.#add_in_queue(interaction.guildId, song_link).catch((e) =>
				{
					interaction.editReply({content: '❌ ' + e}).catch((e) => { console.log('editReply error : ' + e)});
					return false;
				});

				if(return_message !== false)
				{
					await interaction.editReply({content: '✅ ' + return_message}).catch((e) => { console.log('editReply error : ' + e)});
				}
			}
			else if(interaction.customId === "select_queue_song")
			{
				await interaction.update(this.#generateQueueInterface(interaction.guildId, 0, parseInt(interaction.values[0]))).catch(e => console.log('update error : ' + e));
			}
			else interaction.reply({content: i18n.get("errors.interaction", interaction.locale), ephemeral: true}).catch(e => console.log('reply error : ' + e));
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
						logger.info('I\'m back with some people finally', [{tag: "g", value: voiceState.guild.id}]);
						clearTimeout(this.#_guilds_play_data[voiceState.guild.id].inactive_timer);
						this.#_guilds_play_data[voiceState.guild.id].inactive_timer = false;

						await this.#updatePlayerInterface(voiceState.guild.id);
					}
					return;
				}
			}
			if(this.#_guilds_play_data[voiceState.guild.id].force_active !== true && this.#_guilds_play_data[voiceState.guild.id].inactive_timer === false)
			{
				logger.info('Starting inactivity counter', [{tag: "g", value: voiceState.guild.id}]);
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

	async #getTrollList(guild_id)
	{
		let song_choices = (await this.#_client.stored_data.hKeys(`guild:${guild_id}:soundboard`)).map((x) => { return {name: x, value: x} });

		return song_choices.concat((await this.#_client.stored_data.hKeys('global:soundboard')).map((x) => { return {name: x, value: x} }));
	}

	async #resolveTrollSong(guild_id, input)
	{
		if(await this.#_client.stored_data.hExists(`guild:${guild_id}:soundboard`, input)) return `guild:${guild_id}:soundboard/` + input;
		if(await this.#_client.stored_data.hExists('global:soundboard', input)) return 'global:soundboard/' + input;
		return false;
	}

	async shutdownRequest(timestamp)
	{
		this.#_shutdown = timestamp;
	}
	//-----//

	//----- Guild object management -----//
	async spawnPlayer(interaction)
	{
		if(interaction.member.voice.channelId === null)
		{
			logger.notice('This user isn\'t in a voice channel', [{tag: "u", value: interaction.user.id}, {tag: "g", value: interaction.guildId}]);
			await interaction.reply({ephemeral: true, content: i18n.get("errors.not_in_voice_channel", interaction.locale)});
			return false;
		}

		if(!this.#isObjectValid(interaction.guildId))
		{
			logger.info('No existing player, creating a new one', [{tag: "g", value: interaction.guildId}]);
			let channel_permissions = interaction.member.voice.channel.permissionsFor(interaction.guild.members.me, true);
			if(!interaction.member.voice.channel.viewable ||
				!channel_permissions.has(Discord.PermissionsBitField.Flags.ViewChannel) ||
				!channel_permissions.has(Discord.PermissionsBitField.Flags.Connect))//Connection to this channel is theorically allowed
			{
				logger.notice('I don\'t have permission to connect to the voice channel', [{tag: "g", value: interaction.guildId}]);
				await interaction.reply({ephemeral: true, content: i18n.get("errors.join", interaction.locale)});
				return false;
			}
			else if(!interaction.member.voice.channel.speakable ||
				!channel_permissions.has(Discord.PermissionsBitField.Flags.Speak))//Speaking is allowed
			{
				logger.notice('I don\'t have permission to speak in the voice channel', [{tag: "g", value: interaction.guildId}]);
				await interaction.reply({ephemeral: true, content: i18n.get("errors.speak", interaction.locale)});
				return false;
			}
			if(!interaction.member.voice.channel.joinable)//Channel is joinable : not full or we have permission to override this
			{
				logger.notice('The voice channel is full', [{tag: "g", value: interaction.guildId}]);
				await interaction.reply({ephemeral: true, content: i18n.get("errors.full", interaction.locale)});
				return false;
			}
			const config = await this.#_client.stored_data.hGetAll(`guild:${interaction.guildId}:config`);
			await this.#initializeObject(interaction.guildId, interaction.member.voice.channelId, false, config.locale, interaction.member.id, config.style);
		}

		if(this.#_guilds_play_data[interaction.guildId].voice_connection.joinConfig.channelId !== interaction.member.voice.channelId)
		{
			logger.notice('I\'m already used', [{tag: "g", value: interaction.guildId}]);
			await interaction.reply({ephemeral: true, content: i18n.get("errors.already_used", interaction.locale)});
			return false;
		}

		if(!this.#isObjectValid(interaction.guildId))
		{
			logger.warn('Unknown player error', [{tag: "g", value: interaction.guildId}]);
			await interaction.reply({ephemeral: true, content: i18n.get("errors.unknown_player_error", interaction.locale)});
			return false;
		}

		return true;
	}
	async #initializeObject(guild_id, channel_id, only_connection = false, locale, owner, style)//Works
	{
		if((!this.#isObjectValid(guild_id) && !only_connection) ||
			(only_connection &&
			this.#_guilds_play_data[guild_id] !== undefined &&
			this.#_guilds_play_data[guild_id].player !== undefined))
		{
			logger.info('New player object created in channel ' + channel_id, [{tag: "g", value: guild_id}]);

			if(!only_connection)
			{
				this.#_guilds_play_data[guild_id] = {
					locale: locale,
					owner: owner,
					style: style || "flash",
					voice_connection: undefined,
					player: undefined,
					player_subscription: undefined,
					filters: undefined,
					ffmpeg_process: undefined,
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
					],
					update_interfaces: setInterval((() => {
						if(this.#get_song(guild_id))
						{
							this.#updatePlayerInterface(guild_id);
						}
					}).bind(this), 10000)
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
			clearInterval(this.#_guilds_play_data[guild_id].update_interfaces);

			this.#cleanPlayResources(guild_id);
			this.#_guilds_play_data[guild_id].voice_connection.destroy();
		}
		catch(e)
		{
			console.log(e);
		}
		
		logger.info('Session destroyed', [{tag: "g", value: guild_id}]);
		delete this.#_guilds_play_data[guild_id];
	}

	async #link_or_search_input(interaction, value)
	{
		if(value.startsWith('https://') || value.startsWith('radio://'))//It's a link
		{
			await interaction.deferReply({ephemeral: true});
			logger.info('Link "' + value + '" given', [{tag: "g", value: interaction.guildId}]);
			let current_song_before = this.#get_song(interaction.guildId);

			let return_message = await this.#add_in_queue(interaction.guildId, value).catch((e) =>
			{
				if(interaction.isRepliable()) interaction.editReply({content: '❌ ' + e});
				return false;
			});

			if(return_message !== false)
			{
				if(interaction.isRepliable()) interaction.editReply({content: '✅ ' + return_message});
			}

			return "link";
		}
		else
		{
			if(value.length > 250)
			{
				interaction.reply({content: i18n.get("add_song_modal.search_too_long", interaction.locale), ephemeral: true});
				return;
			}
			await interaction.deferReply();
			logger.info('Search term "' + value + '" given', [{tag: "g", value: interaction.guildId}]);
			let yt = await yt_search(value);
			let displayed_yt = "";
			if(yt === false)
			{
				displayed_yt = "*Youtube search API rate limit has been reached. Try using links until I fix this issue*\n"
				yt = [];
			}
			else displayed_yt = yt.map((x, i) => (i+1) + ". [" + x.name + "](" + x.link + ")\n").join('');
			let options_yt = yt.map((x, i) => { return {label: (i+1) + ". " + x.name.substring(0, 50), value: x.cache_id.toString(), description: "Youtube Search"}});

			let sc = await sc_search(value);
			let displayed_sc = ""
			if(sc === false)
			{
				displayed_sc = "*The SoundCloud search API is unavailable :cry:*\n"
				sc = [];
			}
			else displayed_sc = sc.map((x, i) => (i+1) + ". [" + x.name + "](" + x.link + ")\n").join('');
			let options_sc = sc.map((x, i) => { return {label: (i+1) + ". " + x.name.substring(0, 50), value: x.cache_id.toString(), description: "SoundCloud Search"}});

			let radios = await radio_search(value);
			let displayed_radios = radios.map((x, i) => (i+1) + ". [" + x.name + "](" + x.link + ")\n").join('');
			let options_radios = radios.map((x, i) => { return {label: (i+1) + ". " + x.name.substring(0, 50), value: x.cache_id.toString(), description: "Radio Search"}});

			let search_embed = new Discord.EmbedBuilder()
				.setColor([0x62, 0xD5, 0xE9])
				.setTitle('Search results for "' + value + '"')
				.setDescription("**Youtube**\n" + (displayed_yt !== "" ? displayed_yt : 'No song found\n') +
					"**SoundCloud**\n" + (displayed_sc !== "" ? displayed_sc : 'No song found\n') +
					"**Radios**\n" + (displayed_radios !== "" ? displayed_radios : 'No radios found')
				);

			let search_select_list = [];
			if(options_yt.concat(options_sc).concat(options_radios).length > 0)
			{
				search_select_list.push(new Discord.ActionRowBuilder().addComponents([
					new Discord.StringSelectMenuBuilder()
						.setCustomId("select_add_song")
						.setPlaceholder(i18n.get("add_song_modal.search_placeholder", this.#_guilds_play_data[interaction.guildId].locale))
						.addOptions(options_yt.concat(options_sc).concat(options_radios))
				]));
			}
			search_select_list.push(new Discord.ActionRowBuilder().addComponents([
				new Discord.ButtonBuilder()
					.setCustomId("close_any")
					.setLabel(i18n.get("buttons.cancel", this.#_guilds_play_data[interaction.guildId].locale))
					.setStyle(4)
			]));
			await this.#vote_wait(interaction, 5);
			await interaction.editReply({content: '', embeds: [search_embed], components: search_select_list});
			return "search";
		}
	}

	//----- Player interface management -----//
	async #generatePlayerInterface(guild_id)//Works
	{
		if(this.#isObjectValid(guild_id))
		{
			let used_locale = this.#_guilds_play_data[guild_id].locale;
			let used_style = this.#_guilds_play_data[guild_id].style;
			let player_interface_components = [];
			if(this.#_guilds_play_data[guild_id]?.inactive_timer !== false)
			{
				player_interface_components.push(
					new Discord.ActionRowBuilder().addComponents([
						new Discord.ButtonBuilder()
							.setCustomId("undefined")
							.setEmoji({name: "❗"})
							.setLabel(i18n.get("buttons.label_inactive", used_locale))
							.setStyle(2)
							.setDisabled(true),
						new Discord.ButtonBuilder()
							.setCustomId("btn_inactive_leave")
							.setLabel(i18n.get("buttons.inactive_leave", used_locale))
							.setStyle(3),
						new Discord.ButtonBuilder()
							.setCustomId("btn_stay")
							.setLabel(i18n.get("buttons.stay", used_locale))
							.setStyle(4),
						new Discord.ButtonBuilder()
							.setCustomId("btn_stay_forever")
							.setEmoji({name: "golden", id: "1065239445625917520"})
							.setLabel(i18n.get("buttons.stay_forever", used_locale))
							.setStyle(2)
				]));
			}
			player_interface_components.push(
				new Discord.ActionRowBuilder().addComponents([
					new Discord.ButtonBuilder()
						.setCustomId("btn_restart")
						.setEmoji(this.#emojiStyle("restart", used_style))
						.setStyle(2),
					new Discord.ButtonBuilder()
						.setCustomId("btn_previous")
						.setEmoji(this.#emojiStyle("previous", used_style))
						.setStyle(1),
					/*new Discord.ButtonBuilder()
						.setCustomId("btn_backward")
						.setEmoji(this.#emojiStyle("backward", used_style))
						.setLabel('-10 sec')
						.setStyle(1)
						.setDisabled(this.#get_song(guild_id) ? false : true),*/
					new Discord.ButtonBuilder()
						.setCustomId(this.#_guilds_play_data[guild_id]?.is_playing ? "btn_pause" : "btn_play")
						.setEmoji(this.#_guilds_play_data[guild_id]?.is_playing ? this.#emojiStyle("pause", used_style) : this.#emojiStyle("play", used_style))
						.setStyle(1)
						.setDisabled(this.#get_song(guild_id) ? false : true),
					/*new Discord.ButtonBuilder()
						.setCustomId("btn_forward")
						.setEmoji(this.#emojiStyle("forward", used_style))
						.setLabel('+30 sec')
						.setStyle(1)
						.setDisabled(this.#get_song(guild_id) ? false : true),*/
					new Discord.ButtonBuilder()
						.setCustomId("btn_next")
						.setEmoji(this.#emojiStyle("next", used_style))
						.setStyle(1),
					new Discord.ButtonBuilder()
						.setCustomId("queue")
						//.setLabel(i18n.get("buttons.queue", used_locale))
						.setEmoji(this.#emojiStyle("queue", used_style))
						.setStyle(2),
				]),
				new Discord.ActionRowBuilder().addComponents([
					new Discord.ButtonBuilder()
						.setCustomId(this.#_guilds_play_data[guild_id]?.loop ? "unloop" : "loop")
						.setEmoji(this.#emojiStyle("loop", used_style))
						.setStyle(this.#_guilds_play_data[guild_id]?.loop ? 3 : 2)
						.setDisabled(this.#get_song(guild_id) ? false : true),
					new Discord.ButtonBuilder()
						.setCustomId(this.#_guilds_play_data[guild_id]?.shuffle ? "unshuffle" : "shuffle")
						.setEmoji(this.#emojiStyle("shuffle", used_style))
						.setStyle(this.#_guilds_play_data[guild_id]?.shuffle ? 3 : 2),
					new Discord.ButtonBuilder()
						.setCustomId("stop")
						.setEmoji(this.#emojiStyle("stop", used_style))
						.setStyle(4),
					new Discord.ButtonBuilder()
						.setCustomId("btn_volume")
						.setEmoji(this.#emojiStyle("volume", used_style))
						.setStyle(2),
					new Discord.ButtonBuilder()
						.setCustomId("open_modal_add")
						.setLabel(i18n.get("buttons.add_song", used_locale))
						.setEmoji(this.#emojiStyle("add_song", used_style))
						.setStyle(3),
					
				]),
				new Discord.ActionRowBuilder().addComponents([
					new Discord.ButtonBuilder()
						.setCustomId("leave")
						//.setLabel(i18n.get("buttons.leave", used_locale))
						.setEmoji(this.#emojiStyle("leave", used_style))
						.setStyle(4),
					new Discord.ButtonBuilder()
						.setCustomId("hide")
						//.setLabel(i18n.get("buttons.hide", used_locale))
						.setEmoji(this.#emojiStyle("hide", used_style))
						.setStyle(2),
					new Discord.ButtonBuilder()
						.setCustomId("owner_settings")
						.setLabel(i18n.get("buttons.owner_settings", used_locale))
						.setEmoji(this.#emojiStyle("owner_settings", used_style))
						.setStyle(2),
				])
			);

			let player_embed = new Discord.EmbedBuilder()
				.setColor((await this.#_client.stored_data.isGuildGolden(guild_id)) ? [0xFF, 0xD7, 0x00] : [0x62, 0xD5, 0xE9])
				.setFooter({text: "Tip : " + tip_list[tip_index]});

			if(this.#get_song(guild_id) !== undefined)
			{
				player_embed.setTitle(i18n.place(i18n.get("player_embed.title_play", used_locale), {song_name: this.#get_song(guild_id).name}));
				player_embed.setURL(this.#get_song(guild_id).link);
				player_embed.setImage(this.#get_song(guild_id).thumbnail);
				const elapsed =	this.#_guilds_play_data[guild_id]?.filters?.length;
				const total =	this.#get_song(guild_id).duration;
				const cursor = (await this.#_client.stored_data.isGuildGolden(guild_id)) ? "🔸" : "🔹";
				const cursor_pos = Math.min(Math.round(30*elapsed/total), 30);
				let description = format_duration(elapsed) + " " + "=".repeat(cursor_pos) + cursor + "=".repeat(30 - cursor_pos) + " " + format_duration(total)
				if(this.#_shutdown !== false) description += "\n" + i18n.place(i18n.get("player_embed.restart_msg", used_locale), {timestamp: this.#_shutdown});
				player_embed.setDescription(description);
			}
			else
			{
				player_embed.setTitle(i18n.get("player_embed.title_idle", used_locale));
				player_embed.setDescription(i18n.get("player_embed.description_idle", used_locale));
				player_embed.setImage('https://babot.theireply.fr/player_help.png');
			}

			return {content: '', embeds: [player_embed], components: player_interface_components}
		}

		return {content: '❌ I can\'t generate the interface, because Theirémi'}
	}

	async #generatePlayerSettingsInterface(guild_id, config_mode = 0, locale)//Works
	{
		let cmd_prfx = config_mode === 1 ? "session_" : "global_";
		let guild_settings = (await this.#_client.stored_data.hGetAll(`guild:${guild_id}:config`));
		let guild_permissions = (await this.#_client.stored_data.hGetAll(`guild:${guild_id}:permissions`));
		let displayed_permissions = config_mode === 1 ? this.#_guilds_play_data[guild_id].permissions : guild_permissions;
		let change_permission = config_mode === 1 ? !guild_permissions?.owner_settings : true;
		let player_interface_components = [];
		let used_style = config_mode === 1 ? this.#_guilds_play_data[guild_id].style : guild_settings.style;
		const color = (perm) => {
			if(config_mode === 0) return guild_permissions[perm];//If global configuration return actual permission state
			if(!change_permission) return guild_permissions[perm];
			if(guild_permissions[perm]) return true;//If the feature is disabled in the server, return the disabled color
			return displayed_permissions[perm];//Return the current state of the permission for the session
		}
		const disabled = (perm) => {
			if(config_mode === 0) return false;
			if(guild_permissions[perm]) return true;
			if(change_permission) return false;
			return true;
		}

		player_interface_components.push(
			new Discord.ActionRowBuilder().addComponents([
				new Discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_restart")
					.setEmoji(this.#emojiStyle("restart", used_style))
					.setStyle(color("restart") ? 4 : 3)
					.setDisabled(disabled("restart")),
				new Discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_previous")
					.setEmoji(this.#emojiStyle("previous", used_style))
					.setStyle(color("previous") ? 4 : 3)
					.setDisabled(disabled("previous")),
				new Discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_play")
					.setEmoji(this.#emojiStyle("play", used_style))
					.setStyle(color("play") ? 4 : 3)
					.setDisabled(disabled("play")),
				new Discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_next")
					.setEmoji(this.#emojiStyle("next", used_style))
					.setStyle(color("next") ? 4 : 3)
					.setDisabled(disabled("next")),
				new Discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_stop")
					.setEmoji(this.#emojiStyle("stop", used_style))
					.setStyle(color("stop") ? 4 : 3)
					.setDisabled(disabled("stop")),
			]),
			new Discord.ActionRowBuilder().addComponents([
				new Discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_volume")
					.setEmoji(this.#emojiStyle("volume", used_style))
					.setStyle(color("volume") ? 4 : 3)
					.setDisabled(disabled("volume")),
				new Discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_loop")
					.setEmoji(this.#emojiStyle("loop", used_style))
					.setStyle(color("loop") ? 4 : 3)
					.setDisabled(disabled("loop")),
				new Discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_shuffle")
					.setEmoji(this.#emojiStyle("shuffle", used_style))
					.setStyle(color("shuffle") ? 4 : 3)
					.setDisabled(disabled("shuffle")),
				new Discord.ButtonBuilder()
					.setCustomId("undefined")
					.setLabel(i18n.get("buttons.queue", locale))
					.setEmoji(this.#emojiStyle("queue", used_style))
					.setStyle(2)
					.setDisabled(true),
				new Discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_open_modal_add")
					.setLabel(i18n.get("buttons.add_song", locale))
					.setEmoji(this.#emojiStyle("add_song", used_style))
					.setStyle(color("open_modal_add") ? 4 : 3)
					.setDisabled(disabled("open_modal_add")),
			]),
			new Discord.ActionRowBuilder().addComponents([
				new Discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_leave")
					.setLabel(i18n.get("buttons.leave", locale))
					.setEmoji(this.#emojiStyle("leave", used_style))
					.setStyle(color("leave") ? 4 : 3)
					.setDisabled(disabled("leave")),
				new Discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_hide")
					.setLabel(i18n.get("buttons.hide", locale))
					.setEmoji(this.#emojiStyle("hide", used_style))
					.setStyle(color("hide") ? 4 : 3)
					.setDisabled(disabled("hide")),
				new Discord.ButtonBuilder()
					.setCustomId(cmd_prfx + "config_owner_settings")
					.setLabel(i18n.get("buttons.owner_settings", locale))
					.setEmoji(this.#emojiStyle("owner_settings", used_style))
					.setStyle(color("owner_settings") ? 4 : 3)
					.setDisabled(Boolean(config_mode) || disabled("owner_settings")),
			]),
			new Discord.ActionRowBuilder().addComponents([
				new Discord.StringSelectMenuBuilder()
					.setCustomId(cmd_prfx + "player_style")
					.setMinValues(1)
					.setMaxValues(1)
					.setPlaceholder(i18n.get("player_embed.style_placeholder", locale))
					.setOptions(
						{label: "Flash", emoji: this.#emojiStyle("play", "flash"), value: "flash", default: used_style === "flash", description: i18n.place(i18n.get("credits.flaticon", locale), {artist: "nawicon"})},
						{label: "Line", emoji: this.#emojiStyle("play", "line"), value: "line", default: used_style === "line", description: i18n.place(i18n.get("credits.flaticon", locale), {artist: "Pixel perfect"})},
						{label: "Grey", emoji: this.#emojiStyle("play", "grey"), value: "grey", default: used_style === "grey", description: i18n.place(i18n.get("credits.flaticon", locale), {artist: "Freepik"})},
						{label: "Discord", emoji: this.#emojiStyle("play", "discord"), value: "discord", default: used_style === "discord"}
					)
			]),
			new Discord.ActionRowBuilder().addComponents([
				new Discord.ButtonBuilder()
					.setCustomId("undefined2")
					.setLabel(i18n.get("player_embed.configure_msg", locale))
					.setEmoji({name: "⚠"})
					.setStyle(1)
					.setDisabled(true)
			])
		);

		let player_embed = new Discord.EmbedBuilder()
			.setColor([0xed, 0x42, 0x45])

		if(config_mode === 0) player_embed.setTitle(i18n.get("player_embed.title_configure_global", locale));
		else player_embed.setTitle(i18n.get("player_embed.title_configure_session", locale));
		player_embed.setDescription(i18n.get("player_embed.description_configure", locale));
		if(config_mode === 0) player_embed.setThumbnail('https://babot.theireply.fr/config_perms.png');
		else player_embed.setThumbnail('https://babot.theireply.fr/config_perms_player.png');

		return {content: '', ephemeral: true, embeds: [player_embed], components: player_interface_components}
	}

	#emojiStyle(command, style = undefined)
	{
		if(style === undefined) style = "flash";
		if(styles[style])
		{
			if(styles[style][command])
			{
				return styles[style][command]
			}
		}
		return {};
	}

	async #checkPermission(command, interaction)
	{
		let guild_permissions = (await this.#_client.stored_data.hGetAll(`guild:${interaction.guildId}:permissions`));
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
					if(this.#_guilds_play_data[interaction.guildId].owner === interaction.member.id) return true;
					await interaction.reply({ephemeral: true, content: i18n.get("errors.disabled_by_owner", interaction.locale)}).catch(e => console.log('reply error : ' + e));
					return false;
				}
			}
			else
			{
				if(interaction.member.permissions.has(Discord.PermissionsBitField.Flags.ManageGuild)) return true;
				await interaction.reply({ephemeral: true, content: i18n.get("errors.disabled_by_admin", interaction.locale)}).catch(e => console.log('reply error : ' + e));
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
				if(interaction.member.permissions.has(Discord.PermissionsBitField.Flags.ManageGuild)) return true;
				await interaction.reply({ephemeral: true, content: i18n.get("errors.disabled_by_admin", interaction.locale)}).catch(e => console.log('reply error : ' + e));
				return false;
			}
		}
	}

	async #updatePlayerInterface(guild_id, custom_message = undefined)//To test
	{
		if(!this.#isObjectValid(guild_id)) return;
		for(let message of this.#_guilds_play_data[guild_id].player_interfaces)
		{
			let success = await message.edit(custom_message === undefined ? await this.#generatePlayerInterface(guild_id) : custom_message).catch((e) => { return false; });
			if(!success && this.#isObjectValid(guild_id))
			{
				logger.info('Deleted interface message removed from the internal list', [{tag: "g", value: guild_id}]);
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

			let used_style = this.#_guilds_play_data[guild_id].style;
			let queue_embed = new Discord.EmbedBuilder()
				.setColor([0x62, 0xD5, 0xE9])
				.setTitle(i18n.get("queue_embed.title", this.#_guilds_play_data[guild_id].locale))
				.setDescription(queue);

			let components_queue = [];
			if(selected_song >= 0 && selected_song >= 20 * page && selected_song < 20 * (page+1))
			{
				components_queue.push(new Discord.ActionRowBuilder().addComponents([
					new Discord.ButtonBuilder()
						.setCustomId("btn_queue_play_" + selected_song)
						.setStyle(3)
						.setEmoji(this.#emojiStyle("play_now", used_style))
						.setLabel(i18n.get("buttons.queue_play", this.#_guilds_play_data[guild_id].locale))
						.setDisabled(false),
					new Discord.ButtonBuilder()
						.setCustomId("btn_queue_remove_" + selected_song)
						.setStyle(4)
						.setEmoji(this.#emojiStyle("remove", used_style))
						.setLabel(i18n.get("buttons.queue_remove", this.#_guilds_play_data[guild_id].locale))
						.setDisabled(false),
					new Discord.ButtonBuilder()
						.setCustomId("btn_queue_page_reset_" + page)
						.setStyle(2)
						.setLabel(i18n.get("buttons.queue_unselect", this.#_guilds_play_data[guild_id].locale))
						.setDisabled(false)
				]));
			}
			else
			{
				components_queue.push(new Discord.ActionRowBuilder().addComponents([
					new Discord.StringSelectMenuBuilder()
						.setCustomId("select_queue_song")
						.setOptions(queue_portion.length > 0 ? queue_portion.map((x, i) => { return {label: (20 * page + i+1) + ". " + x.name.substring(0, 50), value: (20 * page + i) + "", description: undefined}}) : [{label: "undefined", value: "undefined"}])
						.setMaxValues(1)
						.setMinValues(1)
						.setPlaceholder(i18n.get("queue_embed.select_song", this.#_guilds_play_data[guild_id].locale))
						.setDisabled(queue_portion.length > 0 ? false : true)
				]));
			}

			components_queue.push(new Discord.ActionRowBuilder().addComponents([
				new Discord.ButtonBuilder()
					.setCustomId("btn_queue_page_prev_" + (page > 0 ? page - 1 : 0))
					.setStyle(1)
					.setEmoji({name: "⬅️"})
					.setDisabled(page > 0 ? false : true),
				new Discord.ButtonBuilder()
					.setCustomId("undefined")
					.setStyle(2)
					.setDisabled(true)
					.setLabel(i18n.place(i18n.get("queue_embed.page", this.#_guilds_play_data[guild_id].locale), {current: page+1, total: Math.ceil(this.#_guilds_play_data[guild_id].queue.length / 20)})),
				new Discord.ButtonBuilder()
					.setCustomId("btn_queue_page_next_" + (page < page_quantity - 1 ? page + 1 : page_quantity - 1))
					.setStyle(1)
					.setEmoji({name: "➡️"})
					.setDisabled(page < page_quantity - 1 ? false : true),
				new Discord.ButtonBuilder()
					.setCustomId("close_any")
					.setStyle(4)
					.setLabel(i18n.get("buttons.queue_hide", this.#_guilds_play_data[guild_id].locale))
			]));

			return {content: '', embeds: [queue_embed], components: components_queue};
		}
		return {content: '❌ I can\'t generate the queue interface, because Theirémi have done an error'}
	}
	//-----//

	async #vote_wait(interaction, delay)
	{
		if(!(await this.#_client.stored_data.haveVoted(interaction.user.id)) && !(await this.#_client.stored_data.isGolden(interaction.guildId, interaction.user.id)))
		{
			logger.info("User facing a vote delay", [{tag: "u", value: interaction.user.id}, {tag: "g", value: interaction.guildId}]);
			await interaction.editReply({
				content: "", embeds: [
					new Discord.EmbedBuilder()
						.setTitle(i18n.place(i18n.get("wait_vote_embed.title", interaction.locale), {timestamp: Math.round(Date.now()/1000 + delay)}))
						.setDescription(i18n.get("wait_vote_embed.description", interaction.locale))
						.setFooter({text: i18n.get("wait_vote_embed.footer", interaction.locale)})
						.setColor([0xFF, 0xd7, 0x00])
				],
				components: [
					new Discord.ActionRowBuilder().addComponents([
						new Discord.ButtonBuilder()
							.setLabel(i18n.get("wait_vote_embed.btn_vote", interaction.locale))
							.setEmoji({name: "topgg", id: "1086595934219161600"})
							.setStyle(5)
							.setURL("https://top.gg/bot/1052586565395828778/vote")
					])
				]
			}).catch((e) => { console.log('editReply error : ' + e)});
			await miscs.sleep(delay * 1000);
		}
	}

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
							logger.info('Processing youtube playlist ' + link, [{tag: "g", value: guild_id}]);
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
								logger.info('Video ' + link + ' from youtube added to queue', [{tag: "g", value: guild_id}]);
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
						}).catch(() => {return false});

						console.log(music_data_query?.data);
						if(music_data_query?.data === undefined) return reject('This music/playlist is unavailable');

						if(matches[1] === "track")
						{
							logger.info('Music ' + link + ' from deezer added to queue', [{tag: "g", value: guild_id}]);
							this.#add_in_queue(guild_id, music_data_query.data.title + " " + music_data_query.data.artist.name + " music", true).then(function(){
								resolve('Your music has been added to queue');
							}, function(){
								return reject('This music is unavailable');
							});
							
							return;
						}
						else if(matches[1] === "playlist" || matches[1] === "album")
						{
							logger.info('Processing deezer playlist ' + link, [{tag: "g", value: guild_id}]);
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
						}).catch(() => {return false});
						if(unshorten?.headers?.location === undefined) return reject('This link cannot be processed');

						this.#add_in_queue(guild_id, unshorten.headers.location).then(resolve, reject);
					}
					else if(link.match(/https:\/\/open\.spotify\.com\/(track|playlist|album)\/([0-9A-Za-z]+)/))
					{
						let spotify_auth_query = await axios({
							url: "https://accounts.spotify.com/api/token",
							method: 'POST',
							headers: {
								'Authorization': 'Basic ' + Buffer.from(babot_env.spotify_api_key).toString('base64')
							},
							data: "grant_type=client_credentials"
						}).catch(() => {return false});
						if(spotify_auth_query === false) return reject('The Spotify API seems to doesn\'t work, please report the issue using `/feedback`');

						let matches = link.match(/https:\/\/open\.spotify\.com\/(track|playlist|album)\/([0-9A-Za-z]+)/);
						let music_data_query = await axios({url: "https://api.spotify.com/v1/" + matches[1] + "s/" + matches[2],
							method: 'get',
							headers: {
								'Authorization': 'Bearer ' + spotify_auth_query.data.access_token
							}
						}).catch(() => {return false});

						//console.log(music_data_query.data);
						if(music_data_query?.data === undefined) return reject('This music/playlist is unavailable');

						if(matches[1] === "track")
						{
							logger.info('Music ' + link + ' from spotify added to queue', [{tag: "g", value: guild_id}]);
							this.#add_in_queue(guild_id, music_data_query.data.name + " " + music_data_query.data.artists[0].name + " music", true).then(function(){
								resolve('Your music has been added to queue');
							}, function(){
								return reject('This music is unavailable');
							});
							
							return;
						}
						else if(matches[1] === "playlist" || matches[1] === "album")
						{
							logger.info('Processing spotify playlist ' + link, [{tag: "g", value: guild_id}]);
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
					}
					else if(link.match(/^https:\/\/soundcloud.com\//))
					{
						if(link.match(/\.com\/[a-zA-Z0-9_-]+\/sets\//))//Is a playlist
						{
							reject('SoundCloud playlists are not supported :cry:');
						}
						else
						{
							let return_resolve = await resolve_sc_music(link);
							if(return_resolve !== false)
							{
								logger.info('Video ' + link + ' from soundcloud added to queue', [{tag: "g", value: guild_id}]);
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
							else return reject('This music is unavailable');
						}
					}
					else return reject('This platform is not supported right now, but feel free to propose it using </feedback:1060125997359448064> !');
				}
				else if(link.startsWith('radio://'))
				{
					let raw_radio_file = await fs.readFile(__dirname + '/radios.json', {encoding: 'utf-8'});
					if(miscs.isJsonString(raw_radio_file))
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
								play_headers: {},
								duration: Infinity
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
			this.#cleanPlayResources(guild_id);
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
				let song = this.#get_song(guild_id);
				logger.info('Playing ' + song.link + ' at volume ' + this.#_guilds_play_data[guild_id].volume, [{tag: "g", value: guild_id}]);

				await this.#cleanPlayResources(guild_id);
				this.#_guilds_play_data[guild_id].player_abort = new AbortController()

				//----- AUDIO STREAM CHAIN -----//
				//--- STEP 1 : Get the audio ---//
				let stream;
				if(song.play_link.startsWith("file:///"))
				{
					if(!fsc.existsSync(song.play_link.replace("file://", "")))
					{
						logger.info('Error fetching song : ' + song.play_link, [{tag: "g", value: guild_id}]);
						stream = fsc.createReadStream(path.join(__dirname, 'error_sound.wav'));
					}
					else stream = fsc.createReadStream(song.play_link.replace("file://", ""));
				}
				else
				{
					let play_link_process = await axios({
						signal: this.#_guilds_play_data[guild_id].player_abort.signal,
						url: this.#get_song(guild_id).play_link,
						method: 'get',
						responseType: 'stream',
						headers: Object.assign(this.#get_song(guild_id).play_headers, {"Accept-Encoding": "deflate, br"})
					}).catch((e) => {
						console.log(e);
						logger.info('Error fetching song', [{tag: "g", value: guild_id}]);
					});

					if(play_link_process === undefined) stream = fsc.createReadStream(path.join(__dirname, 'error_sound.wav'));
					else stream = play_link_process.data;
				}
				//---//

				//--- STEP 2 : Transform the audio
				this.#_guilds_play_data[guild_id].ffmpeg_process = child_process.spawn('ffmpeg', [
					'-i', '-',
					'-analyzeduration', '0',
					'-loglevel', '0',
					'-f', 's16le',
					'-ar', '48000',
					'-ac', '2',
					'pipe:1'
				], {
					signal: this.#_guilds_play_data[guild_id].player_abort.signal,
					killSignal: "SIGKILL",
					shell: false,
					windowsHide: true
				});
				this.#_guilds_play_data[guild_id].ffmpeg_process.on('error', (e) => {
					if(e.name === "AbortError")
					{
						logger.notice('FFmpeg process aborted', [{tag: "g", value: guild_id}])
					}
					else
					{
						logger.warn('FFmpeg error : ' + e.name + ' : ' + e.message + '\n' + e.stack, [{tag: "g", value: guild_id}])
					}
				});

				this.#_guilds_play_data[guild_id].ffmpeg_process.stdin.on('error', () => {});
				stream.on('close', (function(){
					//this.#_guilds_play_data[guild_id].ffmpeg_process.kill('SIGKILL');
				}).bind(this))
				stream.pipe(this.#_guilds_play_data[guild_id].ffmpeg_process.stdin);
				//---//

				//----- STEP 3 : Apply filters -----//
				this.#_guilds_play_data[guild_id].filters = new Filter('s16le', 48000);
				this.#_guilds_play_data[guild_id].filters.setVolume(this.#_guilds_play_data[guild_id].volume);
				this.#_guilds_play_data[guild_id].ffmpeg_process.stdout.pipe(this.#_guilds_play_data[guild_id].filters);
				//---//

				//--- STEP 4 : Encoding in opus ---//
				let encoder = new prism.opus.Encoder({channels: 2, rate: 48000, frameSize: 960});
				encoder.setBitrate(192000);
				this.#_guilds_play_data[guild_id].filters.pipe(encoder);
				//---//

				//--- STEP 5 : Sending the audio ---//
				let resource = Voice.createAudioResource(encoder, {inputType: "opus"});
				this.#_guilds_play_data[guild_id].player.play(resource);

				this.#_guilds_play_data[guild_id].is_playing = true;
				//---//
				//-----//
			}
			resolve();
		});
	}

	#cleanPlayResources(guild_id)
	{
		if(this.#isObjectValid(guild_id))
		{
			if(this.#_guilds_play_data[guild_id]?.player_abort !== undefined)
			{
				this.#_guilds_play_data[guild_id]?.player_abort.abort();
			}

			if(this.#_guilds_play_data[guild_id]?.resource !== undefined)
			{
				while(this.#_guilds_play_data[guild_id]?.resource.readable)
				{
					this.#_guilds_play_data[guild_id]?.resource.read();
				}
			}
		}
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
			key: babot_env.youtube_api_key,
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
	}).catch(() => {return false});
	if(video_data === false) return false;

	if(video_data?.data?.error !== undefined) return false;
	return video_data.data.items.map((x) => {
		search_cache.index++;
		search_cache.list[search_cache.index] = "https://www.youtube.com/watch?v=" + x.id.videoId;
		return {name: x.snippet.title, link: "https://www.youtube.com/watch?v=" + x.id.videoId, cache_id: search_cache.index}
	});
}

async function resolve_yt_video(link, search = false)
{
	if(search || link.match(/(?:https?:\/\/)?(?:www\.)?youtu\.?be(?:\.com)?\/?.*(?:watch|embed)?(?:.*v=|v\/|\/)([\w\-_]+)\&?/))
	{
		let video_data_process = await spawnAsync('yt-dlp', ['-f', 'bestaudio', '--default-search', 'auto', '--no-playlist', '-J', link], {encoding: 'utf-8'});
		if(video_data_process.stderr !== "") console.log(video_data_process.stderr);
		if(!miscs.isJsonString(video_data_process.stdout)) return false;

		let video_data = JSON.parse(video_data_process.stdout);
		if(video_data == undefined) return false;

		if(video_data.entries !== undefined && video_data._type === "playlist")
		{
			video_data = video_data.entries[0];
			if(video_data == undefined) return false;
		}
		if(video_data &&
			video_data.original_url &&
			video_data.requested_downloads &&
			video_data.title &&
			video_data.thumbnail &&
			video_data.duration &&
			video_data.age_limit === 0)
		{
			return {
				link: video_data.original_url,
				play_link: video_data.requested_downloads[0].url,
				name: video_data.title,
				thumbnail: video_data.thumbnail,
				play_headers: video_data.requested_downloads[0].http_headers,
				duration: video_data.duration
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
			key: babot_env.youtube_api_key,
			part: "snippet",
			maxResults: 50,
			playlistId: playlist_id
		},
		validateStatus: function (status) {
			return status >= 200 && status < 500;
		}
	}).catch(() => {return false});
	if(video_data === false) return false;

	if(video_data?.data?.error !== undefined) return false;
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
			client_id: babot_env.soundcloud_api_key,
			limit: 5,
			q: term,
		},
		validateStatus: function (status) {
			return status >= 200 && status < 500;
		}
	}).catch(() => {return false});
	if(video_data === false) return false;

	if(video_data.data.error !== undefined) return false;
	if(video_data.data.collection === undefined) return false;
	return video_data.data.collection.map((x) => {
		search_cache.index++
		search_cache.list[search_cache.index] = x.permalink_url;
		return {name: x.title, link: x.permalink_url, cache_id: search_cache.index}
	});
}

async function resolve_sc_music(link)
{
	if(link.match(/^https:\/\/soundcloud.com\//))
	{
		let video_data_process = await spawnAsync('yt-dlp', ['-f', 'bestaudio', '--default-search', 'auto', '--no-playlist', '-J', link], {encoding: 'utf-8'});
		if(video_data_process.stderr !== "") console.log(video_data_process.stderr);
		if(!miscs.isJsonString(video_data_process.stdout)) return false;

		let video_data = JSON.parse(video_data_process.stdout);
		if(video_data === undefined) return false;

		if(video_data &&
			video_data._type === "video" &&
			video_data.original_url &&
			video_data.requested_downloads &&
			video_data.title &&
			video_data.thumbnail &&
			video_data.duration)
		{
			let temp_filename = video_data.title.replaceAll(/[^a-z0-9]/gi, '_').toLowerCase();
			spawnAsync('yt-dlp', ['-f', 'bestaudio', '--default-search', 'auto', '--no-playlist', '-o', '/tmp/' + temp_filename, link], {encoding: 'utf-8'});
			let retry_count = 0;
			while(!fsc.existsSync("/tmp/" + temp_filename))
			{
				await miscs.sleep(200);
				if(retry_count >= 100) break;
				retry_count++;
			}
			return {
				link: video_data.original_url,
				play_link: "file:///tmp/" + temp_filename,
				name: video_data.title,
				thumbnail: video_data.thumbnail,
				play_headers: video_data.requested_downloads[0].http_headers,
				duration: video_data.duration
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
			key: babot_env.youtube_api_key,
			part: "snippet",
			maxResults: 50,
			playlistId: playlist_id
		},
		validateStatus: function (status) {
			return status >= 200 && status < 500;
		}
	}).catch(() => {return false});
	if(video_data === false) return false;

	if(video_data.data.error !== undefined) return false;
	return video_data.data.items.map((x) => "https://www.youtube.com/watch?v=" + x.snippet.resourceId.videoId);
}
//-----//

async function radio_search(term)
{
	let raw_radio_file = await fs.readFile(__dirname + '/radios.json', {encoding: 'utf-8'});
	if(miscs.isJsonString(raw_radio_file))
	{
		let all_radios = JSON.parse(raw_radio_file);
		let filtered_radios = all_radios.filter(x => x.name.toLowerCase().indexOf(term.toLowerCase()) !== -1);

		return filtered_radios.map((x) => {
			search_cache.index++
			search_cache.list[search_cache.index] = 'radio://' + x.id;
			return {name: x.name, link: 'radio://' + x.id, cache_id: search_cache.index}
		});
	}
	return [];
}

async function spawnAsync(command, args, options)
{
	return new Promise(async (resolve, reject) => {
		let stdout = "", stderr = "";
		let worker = new worker_threads.Worker(
			"const worker = require('worker_threads');\
			const data = worker.workerData;\
			let spawn = require('child_process').spawn;\
			let spawn_process = spawn(data.command, data.args, data.options);\
			spawn_process.stdout.setEncoding('utf-8');\
			spawn_process.stderr.setEncoding('utf-8');\
			spawn_process.stdout.on('data', function(data) {\
				worker.parentPort.postMessage({stdout: data});\
			});\
			spawn_process.stderr.on('data', function(data) {\
				worker.parentPort.postMessage({stderr: data});\
			});"
		, {
			eval: true,
			workerData: {command, args, options}
		});
		worker.on('message', function (msg)
		{
			if(msg.stdout !== undefined)
			{
				stdout += msg.stdout;
			}
			if(msg.stderr !== undefined)
			{
				stderr += msg.stderr;
			}
		});
		worker.on('exit', function() {
			resolve({stdout, stderr});
		})
	});
}

function format_duration(through)
{
	if(through === Infinity) return "∞";
	through = Math.floor(through);
	let output = [];
	output.push(("0" + (through % 60)).slice(-2));

	through = Math.floor(through / 60);
	output.push(through % 60);

	through = Math.floor(through / 24);
	if(through % 24) output.push(through % 24);

	if(Math.floor(through / 365)) output.push(Math.floor(through / 365));

	output.reverse();
	return output.join(':');
}

function bufferToStream(binary) {
    return new Readable({
        read() {
            this.push(binary);
            this.push(null);
        }
    });
}