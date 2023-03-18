'use strict';
//----- MJS patches -----//
import * as url from 'url';
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
//-----//

//----- General dependencies -----//
import si from 'systeminformation';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileTypeFromBuffer } from 'file-type';
import Discord from 'discord.js';
import * as Builders from '@discordjs/builders';

const client = new Discord.Client({
  intents: [Discord.IntentsBitField.Flags.Guilds,
    //Discord.IntentsBitField.Flags.GuildPresences,
    Discord.IntentsBitField.Flags.GuildVoiceStates,
    //Discord.IntentsBitField.Flags.GuildMessages,
    //Discord.IntentsBitField.Flags.MessageContent
  ],
  presence: {activities: [{name: "Starting... It will take time for BaBot to be fully functional", type: 3}]}
});
//-----//

//----- Local dependencies -----//
import Player from './player/index.js';
//const Status = await import('./statusbot/index.js');
const client_settings = new (await import(__dirname + '/settings.js')).default();
const i18n = new (await import(__dirname + '/locales.js')).default('main');
import env_variables from './env_data/env.json' assert { type: 'json' };

const player = new Player(Discord, client, log);
player.on('error', e => report_error(e.name + ' : ' + e.message + '\nStack trace : ```' + e.stack + '```'));

//const status = new Status(Discord, client, log);
//-----//

let custom_status = [//List of all status randomly displayed by the bot
  ["/changelog : version 1.4.6 released", 3],
  ["/help", 3],
  ["pls don't let me alone in your voice channels 🥺", 3],
  ["want to help BaBot ? Look how in /help -> Contribute", 3],
  ["customize your experience with the player themes ! (only 2 for now, 5 others coming soon)", 3]
]

let total_players = 0;
client.on('ready', async () => {
  //--- NAMING BOT ---//
  log('Main', `Logged in as ${client.user.tag}!`);
  if(client.user.username != env_variables.name)
  {
    await client.user.setUsername(env_variables.name);
    log('Main', 'Changing username...');
    log('Main', `Logged in as ${client.user.tag}!`);
  }
  //---//

  //--- CRASH HANDLING ---//
  if(fs.existsSync(__dirname + '/env_data/crash.sts'))//If a crash occured
  {
    const crash_details = await fs.promises.readFile(__dirname + '/env_data/crash.sts', {encoding: 'utf-8'});//Retrieve the error details
    await fs.promises.unlink(__dirname + '/env_data/crash.sts');//Delete informations about the crash to avoid repeating this code on the next launch
    await report_error(crash_details);

    await client.user.setPresence({activities: [{name: "/known_issues : BaBot ran into a problem and needed to restart. Please send infos about the crash with /feedback", type: 3}]});//Inform the users about the crash
    setTimeout(function() {
      update_status();
    }, 1000 * 60 * 5);//After 5 minutes, start to display random status as usual
  }
  else
  {
    update_status();//If no crashs occured, start to display random status immediatly
  }
  //---//

  //--- BOT STATS ---//
  log('Main', 'I\'m the shard ' + (client.shard.ids[0] + 1) + '/' + client.shard.count + ' and I operate in ' + client.shard.mode + ' mode in ' + client.guilds.cache.size + ' guilds');
  //await update_stats();//Activating this introduces a lot of strange things
  if(client.shard.mode === 'worker')
  {
    client.shard.parentPort.on('message', function(msg) {
      if(msg.action === "scheduled_restart")
      {
        player.shutdownRequest(msg.timestamp);
      }
      else if(msg.action === "player_count")
      {
        client.shard.send({action: "player_count", count: player.playerCount()});
      }
      else if(msg.action === "total_player_count")
      {
        total_players = msg.count;
      }
    })
  }
  //---//

  //--- DEFINING COMMANDS ---//
  for(let e of await player.options())//Chat commands required by the player part
  {
    client.application.commands.create(e);
  }

  //client.application.commands.create(status.options());

  //Global chat commands
  client.application.commands.create({name: "changelog", description: i18n.get("changelog.command_description"), descriptionLocalizations: i18n.all("changelog.command_description"), type: 1, dmPermission: true});
  client.application.commands.create({name: "known_issues", description: i18n.get("known_issues.command_description"), descriptionLocalizations: i18n.all("known_issues.command_description"), type: 1, dmPermission: true});
  client.application.commands.create({name: "feedback", description: i18n.get("feedback.command_description"), descriptionLocalizations: i18n.all("feedback.command_description"), type: 1, dmPermission: true});
  client.application.commands.create({name: "stats", description: i18n.get("stats.command_description"), descriptionLocalizations: i18n.all("stats.command_description"), type: 1, dmPermission: true});
  client.application.commands.create(new Builders.SlashCommandBuilder()
    .setName('privacy')
    .setDescription(i18n.get("privacy.command_description"))
    .setDescriptionLocalizations(i18n.all("privacy.command_description"))
    .setDMPermission(true)
    .addSubcommand(subcommand => 
      subcommand.setName('policy')
        .setDescription(i18n.get("privacy.policy.description"))
        .setDescriptionLocalizations(i18n.all("privacy.policy.description"))
    )
    .addSubcommand(subcommand => 
      subcommand.setName('retrieve')
        .setDescription(i18n.get("privacy.retrieve.description"))
        .setDescriptionLocalizations(i18n.all("privacy.retrieve.description"))
    )
    .addSubcommand(subcommand => 
      subcommand.setName('delete')
        .setDescription(i18n.get("privacy.delete.description"))
        .setDescriptionLocalizations(i18n.all("privacy.delete.description"))
    )
  );
  client.application.commands.create({name: "dashboard", description: i18n.get("dashboard.command_description"), descriptionLocalizations: i18n.all("dashboard.command_description"), type: 1, dmPermission: true});
  client.application.commands.create({name: "settings", description: i18n.get("settings.command_description"), descriptionLocalizations: i18n.all("settings.command_description"), type: 1, dmPermission: true});
  client.application.commands.create(new Builders.SlashCommandBuilder()
    .setName('config')
    .setDescription(i18n.get("config.command_description"))
    .setDescriptionLocalizations(i18n.all("config.command_description"))
    .setDMPermission(false)
    .setDefaultMemberPermissions(0x0000000000000020)
    .addSubcommand(subcommand => 
      subcommand.setName('player')
        .setDescription(i18n.get("config.player.description"))
        .setDescriptionLocalizations(i18n.all("config.player.description"))
    )
    .addSubcommand(subcommand => 
      subcommand.setName('troll')
        .setDescription(i18n.get("config.troll.description"))
        .setDescriptionLocalizations(i18n.all("config.troll.description"))
        .addAttachmentOption(option => 
          option.setName('add_troll_song')
            .setDescription(i18n.get("config.troll.add_troll"))
            .setDescriptionLocalizations(i18n.all("config.troll.add_troll"))
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName('language')
        .setDescription(i18n.get("config.languages.description"))
        .setDescriptionLocalizations(i18n.all("config.language.description"))
        .addStringOption((option) => {
          option.setName('locale')
            .setDescription(i18n.get("config.languages.locale_description"))
            .setDescriptionLocalizations(i18n.all("config.languages.locale_description"))
            .setRequired(true)
          for(let e of i18n.supported())
          {
            option.addChoices({name: i18n.get("config.languages.locales." + e), name_localizations: i18n.all("config.languages.locales." + e), value: e});
          }
          option.addChoices({name: i18n.get("config.languages.locales.not_mine"), name_localizations: i18n.all("config.languages.locales.not_mine"), value: "not_mine"});

          return option;
        })
    )
  );
  client.application.commands.create(new Builders.SlashCommandBuilder()
    .setName('help')
    .setDescription(i18n.get("help.command_description"))
    .setDescriptionLocalizations(i18n.all("help.command_description"))
    .setDMPermission(true)
    .addStringOption(option => option
      .setName('section')
      .setDescription(i18n.get("help.section_description"))
      .setDescriptionLocalizations(i18n.all("help.section_description"))
      .setRequired(false)
      .addChoices(...[
        {name: i18n.get("help.sections.start"), name_localizations: i18n.all("help.sections.start"), value: "start"},
        {name: i18n.get("help.sections.faq"), name_localizations: i18n.all("help.sections.faq"), value: "faq"},
        {name: i18n.get("help.sections.player"), name_localizations: i18n.all("help.sections.player"), value: "player"},
        {name: i18n.get("help.sections.troll"), name_localizations: i18n.all("help.sections.troll"), value: "troll"},
        {name: i18n.get("help.sections.golden"), name_localizations: i18n.all("help.sections.golden"), value: "golden"},
        {name: i18n.get("help.sections.contribute"), name_localizations: i18n.all("help.sections.contribute"), value: "contribute"}
      ])
    )
  );
  //---//

  //--- POSTING RULES ---//
  //Old code to display rules of the support server
  /*(await (await client.guilds.fetch("1059795604517167164")).channels.fetch('1059795606215860306')).send({content: "", embeds: [
    new Discord.EmbedBuilder()
      .setColor([0, 0, 0])
      .setTitle("Rules")
      .setDescription(await fs.promises.readFile('rules_en.txt', {encoding: 'utf-8'}))
  ]})*/
  //---//
});

client.on('interactionCreate', async (interaction) => {//When user interact with the bot
  if(env_variables.banned_users.includes(interaction.user.id))//Block interaction is user is banned
  {
    await interaction.reply({content: i18n.place(i18n.get('errors.user_banned', interaction.locale), {name: env_variables.name}), ephemeral: true }).catch((e) => { console.log('reply error : ' + e)});
    return;
  }
  if(interaction.isChatInputCommand())//Interaction coming from a slash command
  {
    if(interaction.commandName === 'changelog')
    {
      log([{tag: "u", value: interaction.user.id}], 'Command `changelog` received');

      if(fs.existsSync(__dirname + '/changelog.json'))
      {
        let file_content = await fs.promises.readFile(__dirname + '/changelog.json', {encoding: 'utf-8'});
        if(isJsonString(file_content))
        {
          file_content = JSON.parse(file_content);

          let fields = [];
          for(let e of file_content.slice(-10))
          {
            let commits = e.commits.map(x => '- ' + x + '\n').join('');
            fields.push({inline: false, name: e.version, value: commits});
          }

          await interaction.reply({content: "", embeds: [{color: 0x2f3136, fields: fields, title: "BaBot changelog"}]}).catch(e => console.log('reply error : ' + e));
          client_settings.addXP(interaction.user.id, 50);
        }
        else await interaction.reply({content: i18n.get("changelog.corrupted", interaction.locale)}).catch(e => console.log('reply error : ' + e));
      }
      else await interaction.reply({content: i18n.get("changelog.not_found", interaction.locale)}).catch(e => console.log('reply error : ' + e));
      return;
    }

    else if(interaction.commandName === 'known_issues')
    {
      log([{tag: "u", value: interaction.user.id}], 'Command `known_issues` received');

      if(fs.existsSync(__dirname + '/env_data/known_issues.json'))
      {
        let file_content = await fs.promises.readFile(__dirname + '/env_data/known_issues.json', {encoding: 'utf-8'});

        await interaction.reply({content: "", embeds: [{color: 0x2f3136, description: file_content, title: "BaBot current issues", footer: {text :"BaBot is a really young bot, and I'm not a really good developer, so many errors occurs. However, I do best to patch these !"}}]}).catch(e => console.log('reply error : ' + e));
      }
      else await interaction.reply({content: i18n.get("known_issues.not_found", interaction.locale)}).catch(e => console.log('reply error : ' + e));
      return;
    }

    else if(interaction.commandName === 'stats')
    {
      log([{tag: "u", value: interaction.user.id}], 'Command `stats` received');
      await interaction.deferReply();

      await interaction.editReply({content: "", embeds: [
        {
          color: 0x2f3136,
          title: i18n.place(i18n.get("stats.title", interaction.locale), {name: env_variables.name}),
          description: i18n.place(i18n.get("stats.content", interaction.locale), {
            servers_count: (await asyncTimeout(client.shard.fetchClientValues('guilds.cache.size'), 10000).catch(() => {return []})).reduce((acc, guildCount) => acc + guildCount, 0),
            shards_count: client.shard.count,
            shard: client.shard.ids[0] + 1,
            total_players: total_players,
            shard_players: player.playerCount(),
            uptime: Math.round((Date.now() - client.uptime)/1000),
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
      client_settings.addXP(interaction.user.id, 25);

      //--- Internal stats ---//
      for(let i = 0; i < client?.shard?.count; i++)
      {
        const shard_running = await asyncTimeout(client.shard.broadcastEval((client) => { return client.isReady() ? "Running" : "Stopped"}, {shard: i}), 2000).catch(() => "No response");
        log([], "Shard " + (i + "     ").substring(0, 7) + " : " + shard_running);
      }
      //---//
      return;
    }
    else if(interaction.commandName === 'feedback')
    {
      log([{tag: "u", value: interaction.user.id}], 'Command `feedback` received');

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

    //--- PRIVACY INTERACTIONS ---//
    else if(interaction.commandName === 'privacy')
    {
      let subcommand = interaction.options.getSubcommand();
      if(subcommand == undefined)
      {
        await interaction.reply({ content: i18n.get('errors.missing_subcommand', interaction.locale), ephemeral: true }).catch((e) => { console.log('reply error : ' + e)});
        return;
      }
      log([{tag: "u", value: interaction.user.id}], 'Command `privacy` -> `' + subcommand + '` received');

      if(subcommand === 'policy')
      {
        await interaction.reply({
          content: '',
          ephemeral: true,
          embeds: [{
            title: i18n.get('privacy.policy.embed_title', interaction.locale),
            description: i18n.get('privacy.policy.embed_content', interaction.locale),
            footer: {
              text: i18n.get('privacy.embed_footer', interaction.locale)
            }
          }]
        }).catch((e) => { console.log('reply error : ' + e)});
      }
      else if(subcommand === 'retrieve')
      {
        await interaction.reply({
          content: '',
          ephemeral: true,
          embeds: [{
            title: i18n.get('privacy.retrieve.embed_title', interaction.locale),
            description: i18n.get('privacy.retrieve.embed_content', interaction.locale),
            footer: {
              text: i18n.get('privacy.embed_footer', interaction.locale)
            }
          }],
          components: [
            {
              type: 1,
              components: [
                {
                  custom_id: "privacy_retrieve",
                  label: i18n.get('privacy.retrieve.btn_yes', interaction.locale),
                  style: 3,
                  type: 2
                },
                {
                  custom_id: "privacy_cancel",
                  label: i18n.get('privacy.retrieve.btn_no', interaction.locale),
                  style: 4,
                  type: 2
                }
              ]
            }
          ]
        }).catch((e) => { console.log('reply error : ' + e)});
      }
      else if(subcommand === 'delete')
      {
        await interaction.reply({
          content: '',
          ephemeral: true,
          embeds: [{
            title: i18n.get('privacy.delete.embed_title', interaction.locale),
            description: i18n.get('privacy.delete.embed_content', interaction.locale),
            footer: {
              text: i18n.get('privacy.embed_footer', interaction.locale)
            }
          }],
          components: [
            {
              type: 1,
              components: [
                {
                  custom_id: "privacy_delete",
                  label: i18n.get('privacy.delete.btn_yes', interaction.locale),
                  style: 4,
                  type: 2
                },
                {
                  custom_id: "privacy_cancel",
                  label: i18n.get('privacy.delete.btn_no', interaction.locale),
                  style: 3,
                  type: 2
                }
              ]
            }
          ]
        }).catch((e) => { console.log('reply error : ' + e)});
      }
      else await interaction.reply({ content: i18n.get('errors.unknown_subcommand', interaction.locale), ephemeral: true }).catch((e) => { console.log('reply error : ' + e)});
      return;
    }

    else if(interaction.commandName === 'dashboard')
    {
      await interaction.deferReply().catch(e => console.log('deferReply error : ' + e));
      log([{tag: "u", value: interaction.user.id}], 'Command `dashboard` received');
      let user_golden = await client_settings.isUserGolden(interaction.user.id);

      let dash_embed = new Discord.EmbedBuilder()
        .setColor([0x62, 0xD5, 0xE9])
        .setThumbnail(interaction.user.avatarURL())
        .setTitle((user_golden ? "<:golden:1065239445625917520>" : "") + i18n.place(i18n.get("dashboard.panel_title", interaction.locale), {username: interaction.user.username}))
        .setFields([
          {name: "XP", value: (await client_settings.XPCount(interaction.user.id)).toString(10), inline: true},
          {name: i18n.get("dashboard.leaderboard_label", interaction.locale), value: i18n.place(i18n.get("dashboard.leaderboard_content", interaction.locale), {pos: await client_settings.leaderboardPosition(interaction.user.id)}), inline: true},
          {name: i18n.get("dashboard.is_premium_label", interaction.locale), value: user_golden ? i18n.get("dashboard.is_golden", interaction.locale) : i18n.get("dashboard.is_normal", interaction.locale), inline: false},
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

      await interaction.editReply({embeds: [dash_embed], components: dash_components}).catch((e) => {console.log('reply error : ' + e)});
      return;
    }
    else if(interaction.commandName === 'settings')
    {
      log([{tag: "u", value: interaction.user.id}], 'Command `settings` received');
      await interaction.reply(await generate_user_settings(interaction.user, interaction.locale)).catch((e) => {console.log('reply error : ' + e)});
      return;
    }

    else if(interaction.commandName === 'config')
    {
      if(!interaction.inGuild() || interaction.member === undefined)//The user is in a guild, and a Guildmember object for this user exists
      {
        await interaction.reply({ephemeral: true, content: i18n.get("errors.guild_only", interaction.locale)});
        return;
      }

      let subcommand = interaction.options.getSubcommand();
      if(subcommand == undefined)
      {
        await interaction.reply({ content: i18n.get('errors.missing_subcommand', interaction.locale), ephemeral: true }).catch((e) => { console.log('reply error : ' + e)});
        return;
      }
      log([{tag: "u", value: interaction.user.id}, {tag: "g", value: interaction.guildId}], 'Command `config` -> `' + subcommand + '` received');

      if(!interaction.member.permissions.has(Discord.PermissionsBitField.Flags.ManageGuild))//Ne peut pas manage la guild
      {
        await interaction.reply({ content: i18n.get('errors.not_admin', interaction.locale), ephemeral: true }).catch((e) => { console.log('reply error : ' + e)});
        return;
      }

      if(subcommand === 'player')
      {
        player.configure(interaction);
      }
      else if(subcommand === 'troll')
      {
        const new_troll_song = interaction?.options?.getAttachment("add_troll_song");
        if(new_troll_song != null)
        {
          const nb_songs = (await fs.promises.readdir(path.join(__dirname, '/env_data/guilds/', interaction.guildId, '/soundboard/')).catch(() => [])).length;
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

          await interaction.editReply({content: i18n.place(i18n.get("config.troll.song_uploaded", interaction.locale), {song: song_name})}).catch((e) => {console.log('editReply error : ' + e)});
        }
        else
        {
          await interaction.reply(await generate_troll_config(interaction.guildId, interaction.user.id, interaction.locale)).catch((e) => {console.log('reply error : ' + e)});
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

          log([{tag: "g", value: interaction.guildId}], 'Set language of the server to ' + choosen_locale);
          config.locale = choosen_locale;
          await client_settings.set(interaction.guildId, 1, 'config', config);
          await interaction.reply({content: i18n.place(i18n.get('config.languages.change_done', interaction.locale), {language: i18n.get("config.languages.locales." + choosen_locale, interaction.locale)}), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
        }
        else
        {
          await interaction.reply({content: i18n.get('config.languages.language_doesnt_exists', interaction.locale), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
        }
      }
      else await interaction.reply({ content: i18n.get('errors.unknown_subcommand', interaction.locale), ephemeral: true }).catch((e) => { console.log('reply error : ' + e)});
      return;
    }

    else if(interaction.commandName === 'help')
    {
      log([{tag: "u", value: interaction.user.id}], 'Command `help` received');

      let section = interaction.options.getString('section') ?? "start";

      await interaction.reply(generate_help(section, interaction.locale)).catch(e => console.log("reply error : " + e));
    }
    //---//
  }
  else if(interaction.isButton())
  {
    if(['privacy_cancel', 'privacy_delete', 'privacy_retrieve', 'settings', 'close_any', 'disable_troll'].includes(interaction.customId) ||
      interaction.customId.startsWith('btn_disable_troll_') ||
      interaction.customId.startsWith('delete_troll_'))
    {
      log([{tag: "u", value: interaction.user.id}], 'Command `' + interaction.customId + '` received');
      if(interaction.customId === "close_any")
      {
        await interaction.update({content: 'Closing message...', ephemeral: true}).catch((e) => {console.log('update error : ' + e)});
        await interaction.message.delete().catch((e) => {console.log('delete error : ' + e)});
      }

      else if(interaction.customId === "privacy_cancel")
      {
        await interaction.update({
          content: '',
          embeds: [{
            title: i18n.get("privacy.cancel.embed_title", interaction.locale),
            description: i18n.get("privacy.cancel.embed_content", interaction.locale),
            footer: {
              text: i18n.get("privacy.embed_footer", interaction.locale)
            }
          }],
          components: []
        });
        return;
      }
      else if(interaction.customId === "privacy_delete")
      {
        let delete_return = client_settings.erase(interaction.user.id, 0);

        await interaction.update({
          content: '',
          embeds: [{
            title: i18n.get("privacy.delete.embed_title", interaction.locale),
            description: delete_return ? i18n.get("privacy.delete.success", interaction.locale) : i18n.get("privacy.delete.fail", interaction.locale),
            footer: {
              text: i18n.get("privacy.embed_footer", interaction.locale)
            }
          }],
          components: []
        });
        return;
      }
      else if(interaction.customId === "privacy_retrieve")
      {
        await interaction.deferUpdate({ephemeral: true});
        let dm_channel = await interaction.user.createDM();
        let archive = await client_settings.compress(interaction.user.id, 0).catch(() => false);
        if(archive !== false)
        {
          await dm_channel.send({
            content: i18n.get("privacy.retrieve.dm_message", interaction.locale),
            files: [new Discord.AttachmentBuilder(archive, {name: "BaBot_data-" + interaction.user.id + ".zip"})]
          });
        }

        await interaction.editReply({
          content: '',
          embeds: [{
            title: i18n.get("privacy.retrieve.embed_title", interaction.locale),
            description: archive ? i18n.get("privacy.retrieve.success", interaction.locale) : i18n.get("privacy.retrieve.fail", interaction.locale),
            footer: {
              text: i18n.get("privacy.embed_footer", interaction.locale)
            }
          }],
          components: []
        });
        return;
      }
      else if(interaction.customId === "settings")
      {
        await interaction.reply(await generate_user_settings(interaction.user, interaction.locale)).catch((e) => {console.log('reply error : ' + e)});
        return;
      }

      else if(interaction.customId.startsWith('btn_disable_troll_'))
      {
        const panel_id = interaction.customId.split('_').splice(-1)[0];
        if(panel_id !== interaction.user.id)
        {
          await interaction.reply({content: i18n.get('settings.not_authorized_user', interaction.locale), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
          return;
        }
        let config = await client_settings.get(interaction.user.id, 0, 'config');
        if(config === false)
        {
          await interaction.reply({content: i18n.get('errors.settings_panel_fail', interaction.locale), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
          return;
        }

        if(config.limited_troll) config.limited_troll = false;
        else config.limited_troll = true;
        await client_settings.set(interaction.user.id, 0, 'config', config);
        await interaction.update(await generate_user_settings(interaction.user, interaction.locale)).catch((e) => {console.log('update error : ' + e)});
      }
      else if(interaction.customId === "disable_troll")
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
        await interaction.update(await generate_troll_config(interaction.guildId, interaction.user.id, interaction.locale)).catch((e) => {console.log('update error : ' + e)});
      }

      else if(interaction.customId.startsWith('delete_troll_'))
      {
        if(!interaction.inGuild() || interaction.guildId === undefined)
        {
          await interaction.reply({ephemeral: true, content: i18n.get("errors.guild_only", interaction.locale)});
          return;
        }

        const troll_index = interaction.customId.split('_').splice(-1)[0];
        const troll_songs = await fs.promises.readdir(path.join(__dirname, '/env_data/guilds/', interaction.guildId, '/soundboard/')).catch(() => [])
        if(troll_songs[troll_index-1] === undefined)
        {
          await interaction.reply({content: i18n.get('errors.settings', interaction.locale), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
          return;
        }

        if(!fs.existsSync(path.join(__dirname, '/env_data/guilds/', interaction.guildId, '/soundboard/', troll_songs[troll_index-1])))
        {
          await interaction.reply({content: i18n.get('errors.settings', interaction.locale), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
          return;
        }
        await fs.promises.unlink(path.join(__dirname, '/env_data/guilds/', interaction.guildId, '/soundboard/', troll_songs[troll_index-1])).catch((e) => console.log('Failed to delete troll song ' + troll_songs[troll_index-1] + ' : ' + e));

        await interaction.update(await generate_troll_config(interaction.guildId, interaction.user.id, interaction.locale)).catch((e) => {console.log('update error : ' + e)});
      }
    }
  }
  else if(interaction.isStringSelectMenu())
  {
    if(interaction.customId === "help_section")
    {
      if(!interaction?.values[0]) return;

      if(!['start', 'faq', 'player', 'troll', 'contribute', 'golden'].includes(interaction.values[0])) return;

      await interaction.update(generate_help(interaction.values[0], interaction.locale));
      return;
    }
  }
  else if(interaction.isModalSubmit())
  {
    if(interaction.customId === "modal_feedback")
    {
      await axios({
          url: env_variables.webhook_return + "?wait=true",
          method: "POST",
          headers: {
            'Accept-Encoding': 'deflate, br'
          },
          data: {username: "Feedback about BaBot", embeds: [{title: "New feedback", description: interaction.fields.getTextInputValue('feedback'), author: {name: interaction.user.tag + '(' + interaction.user.id + ')', iconURL: interaction.user.avatarURL()}, color: 0x2f3136}]}
      }).then(function(){
          log([], 'New feedback logged in the server');
      }, function(e) {
          log([], 'Error when logging feedback of ' + interaction.user.tag + '(' + interaction.user.id + ')');
          log([], 'Feedback content : ' + interaction.fields.getTextInputValue('feedback'));
      });

      await interaction.reply({content: i18n.get('feedback.submitted', interaction.locale), ephemeral: true}).catch(e => console.log('reply error : ' + e));
      client_settings.addXP(interaction.user.id, 250);
      return;
    }
  }

  player.interactionCreate(interaction);
  //status.interactionCreate(interaction);
});
/*
client.on('presenceUpdate', async (odlUser, newUser) => {
  //log('Main', 'Presence update');
  //status.presenceUpdate(odlUser, newUser)
});*/

/*
client.on('messageCreate', async (message) => {
  return;
  //log('Main', 'Message created');
  let channel_permissions = message.channel.permissionsFor(message.guild.members.me, true);
  if(!message.channel.viewable ||
    !channel_permissions.has(Discord.PermissionsBitField.Flags.ViewChannel) ||
    !channel_permissions.has(Discord.PermissionsBitField.Flags.SendMessages))//Connection to this channel is theorically allowed
  {
    return;
  }

  if(message.cleanContent.startsWith('m!play'))
  {
    log('Main', '[' + message.guildId + '] I made my publicity to ' + message.author.tag);
    console.log(message.cleanContent);
    message.reply({ content: "", embeds: [{
      author: {
        name: "BaBot",
        icon_url: "https://cdn.discordapp.com/avatars/1052586565395828778/e8f7c98d2d287fabb7a6d9f7292364b1.png"
      },
      thumbnail: {
        url: "https://cdn.discordapp.com/avatars/1052586565395828778/e8f7c98d2d287fabb7a6d9f7292364b1.png"
      },
      color: 0x2f3136,
      title: "Pourquoi pas BaBot ?",
      url: "https://discord.com/api/oauth2/authorize?client_id=1052586565395828778&permissions=277062208576&scope=bot",
      description: "Babot est capable de jouer votre musique préférée, mais possède des fonctions avancées accessibles à tous :\n" +
        "- Changement du volume\n- Interface simple et intuitive\n- Peut **réellement** jouer n'importe quelle musique\n" +
        "**Vous n'avez plus qu'une seule commande à retenir : `/player` !**",
      footer: {
        text: "Ceci est un mesage de BaBot"
      }
    }]});
  }
  else if(message.cleanContent.toLowerCase().indexOf('babot') !== -1 &&
    message.cleanContent.toLowerCase().indexOf('loop') !== -1 &&
    message.cleanContent.toLowerCase().indexOf('stuck') !== -1)//Easter egg that will lopp BaBot responding to itself (bc it receive events for created messages even if it was send by itself)
  {
    message.reply({ content: "Speaking about BaBot stuck in a loop ?"});
    log('Main', '[' + message.guildId + '] I replied to ' + message.author.tag + ' who was speaking about me : ' + message.cleanContent);
  }
});*/

client.on('guildCreate', async (guild) => {
  guild = await guild.fetch();
  log([{tag: 'g', value: guild.id}], 'Added in a new guild : ' + guild.id + ' - ' + guild.name + ' | Members : ' + guild.approximateMemberCount + ', Online : ' + guild.approximatePresenceCount);

  await update_stats();
});
client.on('guildDelete', async (guild) => {
 if(!guild.available) return false;
  log([{tag: 'g', value: guild.id}], 'I\'m no longer in this guild : ' + guild.id + ' - ' + guild.name);

  await update_stats();
});

client.on('voiceStateUpdate', async (oldVoiceState, newVoiceState) => {
  player.voiceStateUpdate(newVoiceState);
});

//----- ENTRY POINT -----//
(async () => {
  client.login(env_variables.token);
  log([], 'Environment variables loaded');
})();
//-----//

async function generate_user_settings(user, locale)
{
  let user_config = await client_settings.get(user.id, 0, 'config')
  if(user_config === false)
  {
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

async function generate_troll_config(guild_id, user_id, locale)
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
  for(let e of await fs.promises.readdir(path.join(__dirname, '/env_data/guilds/', guild_id, '/soundboard/')).catch(() => []))
  {
    count++;
    custom_troll.push("**" + count + ".** " + e.split('.')[0]);
    if(count <= 5)
    {
      delete_buttons.push(new Discord.ButtonBuilder()
        .setStyle(4)
        .setCustomId("delete_troll_" + count)
        .setLabel(i18n.place(i18n.get("config.troll.delete_button", locale), {pos: count}))
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
        custom_troll.push("**" + count + ".** " + i18n.get("config.troll.empty_troll_slot"));
      }
      else
      {
        custom_troll.push("**" + count + ".** " + i18n.get("config.troll.locked_troll_slot"));
      }
    }
    else
    {
      custom_troll.push("**" + count + ".** " + i18n.get("config.troll.empty_troll_slot"));
    }
  }

  let troll_settings_embed = new Discord.EmbedBuilder()
  .setColor([0x2b, 0x2d, 0x31])

  troll_settings_embed.setTitle(i18n.get("config.troll.embed_title", locale));
  troll_settings_embed.setDescription(
    i18n.place(
      i18n.get("config.troll.embed_description", locale), {
        trollDisabled: (guild_config.trollDisabled ? i18n.get("config.troll.trollDisabled_text") : i18n.get("config.troll.trollEnabled_text")),
        trollSongs: custom_troll.join('\n')
      }
    )
  );
  let config_components = [
    new Discord.ActionRowBuilder().addComponents([
      new Discord.ButtonBuilder()
        .setCustomId("disable_troll")
        .setStyle(guild_config.trollDisabled ? 4 : 3)
        .setLabel(i18n.get(guild_config.trollDisabled ? "config.troll.enable_troll_btn" : "config.troll.disable_troll_btn", locale))
    ]),
  ];
  if(edit_buttons.length) config_components.push(new Discord.ActionRowBuilder().addComponents(edit_buttons));
  if(delete_buttons.length) config_components.push(new Discord.ActionRowBuilder().addComponents(delete_buttons));

  return {content: '', embeds: [troll_settings_embed], components: config_components, ephemeral: true};
}


function generate_help(section, locale)
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
        {label: i18n.get("help.sections.start", locale), value: "start", default: section === "start", emoji: {name: "🤔"}},
        {label: i18n.get("help.sections.faq", locale), value: "faq", default: section === "faq", emoji: {name: "❓"}},
        {label: i18n.get("help.sections.player", locale), value: "player", default: section === "player", emoji: {name: "lineplay_now", id: "1071121142020046920"}},
        {label: i18n.get("help.sections.troll", locale), value: "troll", default: section === "troll", emoji: {name: "🤪"}},
        {label: i18n.get("help.sections.golden", locale), value: "golden", default: section === "golden", emoji: {name: "golden", id: "1065239445625917520"}},
        {label: i18n.get("help.sections.contribute", locale), value: "contribute", default: section === "contribute", emoji: {name: "🫵"}}
      ])
  ]));
  if(section === 'golden')
  {
    returned_embed = {
      title: i18n.get("help.golden.title", locale),
      color: 0x62D5E9,
      description: i18n.get("help.golden.description", locale),
      fields: [
        {name: i18n.get("help.golden.field_1.name", locale), value: i18n.get("help.golden.field_1.value", locale)},
        {name: i18n.get("help.golden.field_2.name", locale), value: i18n.get("help.golden.field_2.value", locale)},
        {name: i18n.get("help.golden.field_3.name", locale), value: i18n.get("help.golden.field_3.value", locale)},
        {name: i18n.get("help.golden.field_4.name", locale), value: i18n.get("help.golden.field_4.value", locale)}
      ],
    };
    returned_components.push(new Discord.ActionRowBuilder().addComponents([
      new Discord.ButtonBuilder()
        .setStyle(5)
        .setEmoji({name: "golden", id: "1065239445625917520"})
        .setLabel(i18n.get("help.golden.tip_button", locale))
        .setURL('https://patreon.com/user?u=85252153')
    ]));
  }
  else if(section === 'start')
  {
    returned_embed = {
      title: i18n.get("help.start.title", locale),
      color: 0x62D5E9,
      description: i18n.get("help.start.description", locale),
      fields: [
        {name: i18n.get("help.start.field_1.name", locale), value: i18n.get("help.start.field_1.value", locale)},
        {name: i18n.get("help.start.field_2.name", locale), value: i18n.get("help.start.field_2.value", locale)},
        {name: i18n.get("help.start.field_3.name", locale), value: i18n.get("help.start.field_3.value", locale)},
        {name: i18n.get("help.start.field_4.name", locale), value: i18n.get("help.start.field_4.value", locale)}
      ]
    }
  }
  else if(section === 'player')
  {
    returned_embed = {
      title: i18n.get("help.player.title", locale),
      color: 0x62D5E9,
      description: i18n.get("help.player.description", locale),
      image: {url: "https://babot.theireply.fr/player_demo2.png"},
      fields: [
        {name: i18n.get("help.player.field_1.name", locale), value: i18n.get("help.player.field_1.value", locale)},
        {name: i18n.get("help.player.field_2.name", locale), value: i18n.get("help.player.field_2.value", locale)},
        {name: i18n.get("help.player.field_3.name", locale), value: i18n.get("help.player.field_3.value", locale)}
      ]
    }
  }
  else if(section === 'troll')
  {
    returned_embed = {
      title: i18n.get("help.troll.title", locale),
      color: 0x62D5E9,
      description: i18n.get("help.troll.description", locale),
      fields: [
        {name: i18n.get("help.troll.field_1.name", locale), value: i18n.get("help.troll.field_1.value", locale)},
        {name: i18n.get("help.troll.field_2.name", locale), value: i18n.get("help.troll.field_2.value", locale)},
        {name: i18n.get("help.troll.field_3.name", locale), value: i18n.get("help.troll.field_3.value", locale)}
      ]
    }
  }
  else if(section === 'contribute')
  {
    returned_embed = {
      title: i18n.get("help.contribute.title", locale),
      color: 0x62D5E9,
      description: i18n.get("help.contribute.description", locale),
      footer :{
        text: i18n.get("help.contribute.footer", locale)
      }
    }
  }
  else if(section === 'faq')
  {
    returned_embed = {
      title: i18n.get("help.faq.title", locale),
      color: 0x62D5E9,
      description: i18n.get("help.faq.description", locale),
      fields: [
        {name: i18n.get("help.faq.field_1.name", locale), value: i18n.get("help.faq.field_1.value", locale)},
        {name: i18n.get("help.faq.field_2.name", locale), value: i18n.get("help.faq.field_2.value", locale)},
        {name: i18n.get("help.faq.field_3.name", locale), value: i18n.get("help.faq.field_3.value", locale)}
      ]
    }
  }
  else return {content: i18n.get("errors.help_not_found", locale), embeds: [], components: returned_components};
  return {content: "", embeds: [returned_embed], components: returned_components};
}



async function update_stats()//Executed when guilds count change or bot is restarted
{
  if(env_variables.webhook_statistics == undefined) return;//Only update stats on websites and others in production mode
  let guild_count = (await asyncTimeout(client.shard.fetchClientValues('guilds.cache.size'), 1000).catch(() => {return []})).reduce((acc, guildCount) => acc + guildCount, 0);
  let users_count = await client_settings.count(0);
  let shards_count = client.shard.count;

  //--- WEBSITES UPDATE ---//
  await axios({
    url: "https://top.gg/api/bots/1052586565395828778/stats",
    method: "POST",
    headers: {
      "Authorization": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEwNTI1ODY1NjUzOTU4Mjg3NzgiLCJib3QiOnRydWUsImlhdCI6MTY3NDg0MzEzMX0.KzozhjgAXyzCeFFQ6ULxmSffXhyr8IXPYIkjQO5EbqI"
    },
    data: "server_count=" + guild_count + "&shard_count=" + shards_count
  }).then(function(){
    log([], 'Data actualized on top.gg');
  }, function(e) {
    //console.log(e);
    log([], 'Error when actualizing data on top.gg');
  });

  await axios({
    url: "https://discords.com/bots/api/bot/1052586565395828778",
    method: "POST",
    headers: {
      "Authorization": "9604351c653db893e258136cefaef5e239879e57653d019b0af9feb2910a37d3bd59eb4d89a77dd6002df11e2c38fd6c0074a257d9ecd74602a17c7ac3d8dd2a"
    },
    data: "server_count=" + guild_count
  }).then(function(){
    log([], 'Data actualized on discords.com');
  }, function(e) {
    //console.log(e);
    log([], 'Error when actualizing data on discords.com');
  });

  await axios({
    url: "https://discordbotlist.com/api/v1/bots/1052586565395828778/stats",
    method: "POST",
    headers: {
      Authorization: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0IjoxLCJpZCI6IjEwNTI1ODY1NjUzOTU4Mjg3NzgiLCJpYXQiOjE2NzQ3NTg0Nzl9.0VS2pg8rcm1_Vgj_D5ayOKiXooRGT77xaocejvykU0g"
    },
    data: "users=" + users_count + "&guilds=" + guild_count
  }).then(function(){
    log([], 'Data actualized on discordbotlist.com');
  }, function(e) {
    //console.log(e);
    log([], 'Error when actualizing data on discordbotlist.com');
  });

  await axios({
    url: "https://api.botlist.me/api/v1/bots/1052586565395828778/stats",
    method: "POST",
    headers: {
      Authorization: "7AjY6Ql2Ra6Yu62TwhSW3pNtRfMEVL"
    },
    data: "server_count=" + guild_count + "&shard_count=" + shards_count
  }).then(function(){
    log([], 'Data actualized on botlist.me');
  }, function(e) {
    //console.log(e);
    log([], 'Error when actualizing data on botlist.me');
  });

  await axios({
    url: "https://discord.bots.gg/api/v1/bots/1052586565395828778/stats",
    method: "POST",
    headers: {
      Authorization: "eyJhbGciOiJIUzI1NiJ9.eyJhcGkiOnRydWUsImlkIjoiNDkyNzM0NDk2MjgyNTA5MzEyIiwiaWF0IjoxNjczNzc0MDQxfQ.O4EsKOE1ivZPaS7EeN0kDbe_PZU61giXyyk7s3tLsHE"
    },
    data: {guildCount: guild_count, shardCount: shards_count}
  }).then(function(){
    log([], 'Data actualized on discord.bots.gg');
  }, function(e) {
    //console.log(e);
    log([], 'Error when actualizing data on discord.bots.gg');
  });
  //---//

  //--- Stats Webhook ---//
  await axios({
    url: env_variables.webhook_statistics + "?wait=true",
    method: "POST",
    headers: {
      'Accept-Encoding': 'deflate, br'
    },
    data: {username: "BaBot statistics", embeds: [{title: "BaBot statistics update", description: "I'm now in **" + guild_count + "** servers", color: 0x2f3136}]}
  }).then(function(){
    log([], 'Statistics sent to the server');
  }, function(e) {
    //console.log(e);
    log([], 'Error when logging statistics on the server');
  });
  //---//
}

async function report_error(error)
{
  if(env_variables.webhook_return == "")
  {
    console.log(error);
    return;
  }
  await axios({
    url: env_variables.webhook_return + "?wait=true",
    method: "POST",
    headers: {
      'Accept-Encoding': 'deflate, br'
    },
    data: {username: "BaBot crashs", embeds: [{title: "BaBot has crashed", description: error, color: 0x2f3136}]}
  }).then(function(){
    log('Main-error', 'Error sent to the server');
  }, function(e) {
    //console.log(e);
    log('Main-error', 'Error when logging error on the server');
  });
}

function log(sections, msg)
{
  if(typeof sections === "string") sections = [{tag: "c", value: sections}];
  let date = new Date();
  let msg_formatted = ('[' + date.getFullYear() + '/' +
    ("0" + (date.getMonth() + 1)).slice(-2) + '/' +
    ("0" + date.getDate()).slice(-2) + ' ' +
    ("0" + date.getHours()).slice(-2) + ':' +
    ("0" + date.getMinutes()).slice(-2) + ':' +
    ("0" + date.getSeconds()).slice(-2) + ']');
  for(let e of sections)
  {
    msg_formatted += '[' + e.tag + ':' + e.value + ']'
  }
  msg_formatted += ' ' + msg + '\n';

  process.stdout.write(msg_formatted);

  fs.appendFile(__dirname + "/env_data/babot.log", msg_formatted,
    function (err) {
    if (err) throw err;
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

function update_status()//Change status of the bot every minute
{
  setInterval(async () => {
    let random_status = Math.floor(Math.random() * (custom_status.length + 1));
    let guild_count = (await asyncTimeout(client.shard.fetchClientValues('guilds.cache.size'), 15000).catch(() => {return []})).reduce((acc, guildCount) => acc + guildCount, 0);
    let next_status = random_status < 1 ? [guild_count + " servers", 3] : custom_status[random_status - 1];
    await client.user.setPresence({activities: [{name: next_status[0], type: next_status[1]}]});
  }, 1000 * 60);
}

async function asyncTimeout(fun, time)
{
  return Promise.race([
    fun,
    new Promise(async (resolve, reject) => {setTimeout(reject, time)})
  ])
}

//--- Error catching ---//
//Write the error occured in crash.sts before leaving to allow the program to send it when it will restart
//process.on('uncaughtException', onError);
//process.on('unhandledRejection', onError);

function onError(error)
{
  console.error(error);
  fs.writeFileSync(__dirname + '/env_data/crash.sts', error.name + ' : ' + error.message + '\nStack trace : ```' + error.stack + '```');

  process.exit(1);
}
//---//