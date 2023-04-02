'use strict';
//----- MJS patches -----//
import * as url from 'url';
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
//-----//

//----- General dependencies -----//
import si from 'systeminformation';
import fs from 'fs';
import axios from 'axios';
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
import logger from './classes/logger.mjs';
import Player from './modules/player/index.mjs';
import Help from './modules/help/index.mjs';
import Config from './modules/config/index.mjs';
const client_settings = new (await import('./classes/settings.js')).default();
const i18n = new (await import('./classes/locales.js')).default('main');
import env_variables from './env_data/env.json' assert { type: 'json' };

const help = new Help();
const player = new Player(client);
const config = new Config(player.configure.bind(player));
player.on('error', e => report_error(e.name + ' : ' + e.message + '\nStack trace : ```' + e.stack + '```'));
//-----//

let custom_status = [//List of all status randomly displayed by the bot
  ["version 1.6.0 : /changelog", 3],
  ["/help", 3],
  ["pls don't let me alone in your voice channels 🥺", 3],
  ["want to help BaBot ? Look how in /help -> Contribute", 3],
  ["customize your experience with the player themes ! (only 2 for now, 5 others coming soon)", 3]
]

let total_players = 0;
//----- REGISTERING CLIENT EVENTS -----//
process.on('warning', (name, message, stack) => {logger.warn(name + " : " + message + "\n" + stack)});
//client.on('debug', logger.debug);
client.on('warn', logger.warn);
client.on('error', (e) => {
  logger.error(e.name + ' : ' + e.message + '\n' + e.stack);
  report_error(e.name + ' : ' + e.message + '\n`' +
    e.fileName + ':' + e.lineNumber + ':' + e.columnNumber +
    '`\nStack trace : ```' + e.stack + '```')
});
client.on('invalidated', () => {logger.fatal("Session invalidated !!!"); process.exit(1)});

//-----//
client.on('ready', async () => {
  //--- NAMING BOT ---//
  logger.info('Main', `Logged in as ${client.user.tag}!`);
  if(client.user.username != env_variables.name)
  {
    await client.user.setUsername(env_variables.name);
    logger.info('Main', 'Changing username...');
    logger.info('Main', `Logged in as ${client.user.tag}!`);
  }
  //---//

  //--- CRASH HANDLING ---//
  if(fs.existsSync(__dirname + '/env_data/crash.sts'))//If a crash occured
  {
    const crash_details = await fs.promises.readFile(__dirname + '/env_data/crash.sts', {encoding: 'utf-8'});//Retrieve the error details
    await fs.promises.unlink(__dirname + '/env_data/crash.sts');//Delete informations about the crash to avoid repeating this code on the next launch
    await report_error(crash_details);

    await client.user.setPresence({activities: [{name: "BaBot ran into a problem and needed to restart. Please send infos about the crash with /feedback", type: 3}]});//Inform the users about the crash
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
  logger.info('Main', 'I\'m the shard ' + (client.shard.ids[0] + 1) + '/' + client.shard.count + ' and I operate in ' + client.shard.mode + ' mode in ' + client.guilds.cache.size + ' guilds');
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
  for(let e of help.options())
  {
    client.application.commands.create(e);
  }
  for(let e of config.options())
  {
    client.application.commands.create(e);
  }

  //Global chat commands
  client.application.commands.create({name: "changelog", description: i18n.get("changelog.command_description"), descriptionLocalizations: i18n.all("changelog.command_description"), type: 1, dmPermission: true});
  //client.application.commands.create({name: "known_issues", description: i18n.get("known_issues.command_description"), descriptionLocalizations: i18n.all("known_issues.command_description"), type: 1, dmPermission: true});
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
      logger.info([{tag: "u", value: interaction.user.id}], 'Command `changelog` received');

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
      logger.info([{tag: "u", value: interaction.user.id}], 'Command `known_issues` received');

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
      const ping = Date.now() - interaction.createdTimestamp;
      logger.info([{tag: "u", value: interaction.user.id}], 'Command `stats` received');
      await interaction.deferReply();

      await interaction.editReply({content: "", embeds: [
        {
          color: 0x2b2d31,
          title: i18n.place(i18n.get("stats.title", interaction.locale), {name: env_variables.name}),
          description: i18n.place(i18n.get("stats.content", interaction.locale), {
            servers_count: (await asyncTimeout(client.shard.fetchClientValues('guilds.cache.size'), 10000).catch(() => {return []})).reduce((acc, guildCount) => acc + guildCount, 0),
            shards_count: client.shard.count,
            shard: client.shard.ids[0] + 1,
            ping,
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
        logger.info([], "Shard " + (i + "     ").substring(0, 7) + " : " + shard_running);
      }
      //---//
      return;
    }
    else if(interaction.commandName === 'feedback')
    {
      logger.info([{tag: "u", value: interaction.user.id}], 'Command `feedback` received');

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
      logger.info([{tag: "u", value: interaction.user.id}], 'Command `privacy` -> `' + subcommand + '` received');

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
      logger.info([{tag: "u", value: interaction.user.id}], 'Command `dashboard` received');
      let user_golden = await client_settings.isUserGolden(interaction.user.id);
      const user_profile = await client_settings.profile(interaction.user.id);

      const user_config = await client_settings.get(interaction.user.id, 0, 'config');
      if(user_config === false)
      {
        await interaction.reply({content: i18n.get('errors.settings', interaction.locale), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
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

      await interaction.editReply({embeds: [dash_embed], components: dash_components}).catch((e) => {console.log('reply error : ' + e)});
      return;
    }
    else if(interaction.commandName === 'settings')
    {
      logger.info([{tag: "u", value: interaction.user.id}], 'Command `settings` received');
      await interaction.reply(await generate_user_settings(interaction.user, interaction.locale)).catch((e) => {console.log('reply error : ' + e)});
      return;
    }
    //---//
  }
  else if(interaction.isButton())
  {
    if(['privacy_cancel', 'privacy_delete', 'privacy_retrieve', 'settings', 'close_any', 'disable_troll'].includes(interaction.customId) ||
      interaction.customId.startsWith('btn_disable_troll_') ||
      interaction.customId.startsWith('delete_troll_'))
    {
      logger.info([{tag: "u", value: interaction.user.id}], 'Command `' + interaction.customId + '` received');
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
          logger.info([], 'New feedback logged in the server');
      }, function(e) {
          logger.info([], 'Error when logging feedback of ' + interaction.user.tag + '(' + interaction.user.id + ')');
          logger.info([], 'Feedback content : ' + interaction.fields.getTextInputValue('feedback'));
      });

      await interaction.reply({content: i18n.get('feedback.submitted', interaction.locale), ephemeral: true}).catch(e => console.log('reply error : ' + e));
      client_settings.addXP(interaction.user.id, 250);
      return;
    }
  }

  player.interactionCreate(interaction);
  help.interactionCreate(interaction);
  config.interactionCreate(interaction);
});

client.on('guildCreate', async (guild) => {
  guild = await guild.fetch();
  logger.info([{tag: 'g', value: guild.id}], 'Added in a new guild : ' + guild.id + ' - ' + guild.name + ' | Members : ' + guild.approximateMemberCount + ', Online : ' + guild.approximatePresenceCount);

  await update_stats();
});
client.on('guildDelete', async (guild) => {
 if(!guild.available) return false;
  logger.info([{tag: 'g', value: guild.id}], 'I\'m no longer in this guild : ' + guild.id + ' - ' + guild.name);

  await update_stats();
});

client.on('voiceStateUpdate', async (oldVoiceState, newVoiceState) => {
  player.voiceStateUpdate(newVoiceState);
});

//----- ENTRY POINT -----//
(async () => {
  client.login(env_variables.token);
  logger.info([], 'Environment variables loaded');
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
    logger.info([], 'Data actualized on top.gg');
  }, function(e) {
    //console.log(e);
    logger.info([], 'Error when actualizing data on top.gg');
  });

  await axios({
    url: "https://discords.com/bots/api/bot/1052586565395828778",
    method: "POST",
    headers: {
      "Authorization": "9604351c653db893e258136cefaef5e239879e57653d019b0af9feb2910a37d3bd59eb4d89a77dd6002df11e2c38fd6c0074a257d9ecd74602a17c7ac3d8dd2a"
    },
    data: "server_count=" + guild_count
  }).then(function(){
    logger.info([], 'Data actualized on discords.com');
  }, function(e) {
    //console.log(e);
    logger.info([], 'Error when actualizing data on discords.com');
  });

  await axios({
    url: "https://discordbotlist.com/api/v1/bots/1052586565395828778/stats",
    method: "POST",
    headers: {
      Authorization: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0IjoxLCJpZCI6IjEwNTI1ODY1NjUzOTU4Mjg3NzgiLCJpYXQiOjE2NzQ3NTg0Nzl9.0VS2pg8rcm1_Vgj_D5ayOKiXooRGT77xaocejvykU0g"
    },
    data: "users=" + users_count + "&guilds=" + guild_count
  }).then(function(){
    logger.info([], 'Data actualized on discordbotlist.com');
  }, function(e) {
    //console.logger.info(e);
    logger.info([], 'Error when actualizing data on discordbotlist.com');
  });

  await axios({
    url: "https://api.botlist.me/api/v1/bots/1052586565395828778/stats",
    method: "POST",
    headers: {
      Authorization: "7AjY6Ql2Ra6Yu62TwhSW3pNtRfMEVL"
    },
    data: "server_count=" + guild_count + "&shard_count=" + shards_count
  }).then(function(){
    logger.info([], 'Data actualized on botlist.me');
  }, function(e) {
    //console.log(e);
    logger.info([], 'Error when actualizing data on botlist.me');
  });

  await axios({
    url: "https://discord.bots.gg/api/v1/bots/1052586565395828778/stats",
    method: "POST",
    headers: {
      Authorization: "eyJhbGciOiJIUzI1NiJ9.eyJhcGkiOnRydWUsImlkIjoiNDkyNzM0NDk2MjgyNTA5MzEyIiwiaWF0IjoxNjczNzc0MDQxfQ.O4EsKOE1ivZPaS7EeN0kDbe_PZU61giXyyk7s3tLsHE"
    },
    data: {guildCount: guild_count, shardCount: shards_count}
  }).then(function(){
    logger.info([], 'Data actualized on discord.bots.gg');
  }, function(e) {
    //console.log(e);
    logger.info([], 'Error when actualizing data on discord.bots.gg');
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
    logger.info([], 'Statistics sent to the server');
  }, function(e) {
    //console.log(e);
    logger.info([], 'Error when logging statistics on the server');
  });
  //---//
}

async function report_error(error)
{
  if(env_variables.webhook_return == "")
  {
    logger.error(error);
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
    logger.warn('An error has been sent on the error webhook');
  }, function(e) {
    //console.log(e);
    logger.error('Failed to send an error on the error webhook');
    logger.error(e);
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
process.on('uncaughtException', onError);

function onError(error)
{
  logger.fatal(error.message + " : more infos on the error webhook");
  fs.writeFileSync(__dirname + '/env_data/crash.sts', error.name + ' : ' + error.message + '\n`' +
    error.fileName + ':' + error.lineNumber + ':' + error.columnNumber +
    '`\nStack trace : ```' + error.stack + '```');
  process.exit(1);
}
//---//