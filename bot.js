'use strict';

const si = require('systeminformation');
const fs = require('fs');
const axios = require('axios');
const Discord = require('discord.js');
const Builders = require('@discordjs/builders');
const Player = require('./player/index.js');
const Status = require('./statusbot/index.js');
const Settings = require(process.cwd() + '/settings.js');
const I18n = require(__dirname + '/locales.js');
const client = new Discord.Client({
  intents: [Discord.IntentsBitField.Flags.Guilds,
    //Discord.IntentsBitField.Flags.GuildPresences,
    Discord.IntentsBitField.Flags.GuildVoiceStates,
    //Discord.IntentsBitField.Flags.GuildMessages,
    //Discord.IntentsBitField.Flags.MessageContent
  ],
  presence: {activities: [{name: "Starting... It will take time for BaBot to be fully functional", type: 3}]}
});

const i18n = new I18n('main');
const client_settings = new Settings();
const player = new Player(Discord, client, log);
const status = new Status(Discord, client, log);
const settings = require(__dirname + '/env_data/env.json');

let custom_status = [//List of all status randomly displayed by the bot
  ["/changelog : version 1.4.0 released", 3],
  ["/help start", 3],
  ["pls don't let me alone in your voice channels 🥺", 3],
  ["want to help BaBot ? Look how with '/help contribute'", 3],
  //["Working together, BaBot can became even better. Join the support server -> https://discord.gg/zssHymr656", 3]
]

let total_players = 0;
let uptime = Math.round(Date.now() / 1000);//Used to determine uptime when stats is executed
client.on('ready', async () => {
  //--- NAMING BOT ---//
  if(settings.dev) log('Main', 'Warning : BaBot is running in development mode');

  log('Main', `Logged in as ${client.user.tag}!`);
  if(client.user.username != settings.name)
  {
    await client.user.setUsername(settings.name);
    log('Main', 'Changing username...');
    log('Main', `Logged in as ${client.user.tag}!`);
  }
  //---//

  //--- CRASH HANDLING ---//
  if(!settings.dev && fs.existsSync(__dirname + '/env_data/crash.sts'))//If a crash occured and this instance is in production mode
  {
    //Report error with a webhook to a channel in the server
    await axios({
      url: "https://discord.com/api/webhooks/1059898884232593528/YdW_Kx2a63gzU_vKTCbFRinGEI_-thRPelL8-TcHd9hk_G1eY_Z4nhiVdNRTBA5bgvGM?wait=true",
      method: "POST",
      headers: {
        'Accept-Encoding': 'deflate, br'
      },
      data: {username: "BaBot crashs", embeds: [{title: "BaBot has crashed", description: await fs.promises.readFile(__dirname + '/env_data/crash.sts', {encoding: 'utf-8'}), color: 0x2f3136}]}
    }).then(function(){
      log('Main-error', 'Error sent to the server');
    }, function(e) {
      //console.log(e);
      log('Main-error', 'Error when logging error on the server');
    });

    await fs.promises.unlink(__dirname + '/env_data/crash.sts');//Delete informations about the crash to avoid repeating this code on the next launch
    await client.user.setPresence({activities: [{name: "/known_issues : BaBot ran into a problem and needs to restart. The problem should be fixed very soon", type: 3}]});//Inform the users about the crash
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

  client.application.commands.create(status.options());

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
    .addSubcommand(subcommand => 
      subcommand.setName('player')
        .setDescription(i18n.get("config.player.description"))
        .setDescriptionLocalizations(i18n.all("config.player.description"))
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
    .addSubcommand(subcommand => 
      subcommand.setName('level')
        .setDescription(i18n.get("help.level_description"))
        .setDescriptionLocalizations(i18n.all("help.level_description"))
    )
    .addSubcommand(subcommand => 
      subcommand.setName('start')
        .setDescription(i18n.get("help.start_description"))
        .setDescriptionLocalizations(i18n.all("help.start_description"))
    )
    .addSubcommand(subcommand => 
      subcommand.setName('donator')
        .setDescription(i18n.get("help.donator_description"))
        .setDescriptionLocalizations(i18n.all("help.donator_description"))
    )
    .addSubcommand(subcommand => 
      subcommand.setName('contribute')
        .setDescription(i18n.get("help.contribute_description"))
        .setDescriptionLocalizations(i18n.all("help.contribute_description"))
    )
    .addSubcommand(subcommand => 
      subcommand.setName('faq')
        .setDescription(i18n.get("help.faq_description"))
        .setDescriptionLocalizations(i18n.all("help.faq_description"))
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
  if(settings.banned_users.includes(interaction.user.id))
  {
    await interaction.reply({content: i18n.place(i18n.get('errors.user_banned', interaction.locale), {name: settings.name}), ephemeral: true }).catch((e) => { console.log('reply error : ' + e)});
    return;
  }
  if(interaction.isChatInputCommand())
  {
    if(interaction.commandName === 'changelog')
    {
      log('Main', 'Command `changelog` received from user ' + interaction.user.tag);

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
      log('Main', 'Command `known_issues` received from user ' + interaction.user.tag);

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
      log('Main-stats', 'Command `stats` received from user ' + interaction.user.tag);
      await interaction.deferReply();

      await interaction.editReply({content: "", embeds: [
        {
          color: 0x2f3136,
          title: i18n.place(i18n.get("stats.title", interaction.locale), {name: settings.name}),
          description: i18n.place(i18n.get("stats.content", interaction.locale), {
            servers_count: (await client.shard.fetchClientValues('guilds.cache.size').catch(() => {return []})).reduce((acc, guildCount) => acc + guildCount, 0),
            shards_count: client.shard.count,
            shard: client.shard.ids[0] + 1,
            total_players: total_players,
            shard_players: player.playerCount(),
            uptime: uptime,
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
      return;
    }
    else if(interaction.commandName === 'feedback')
    {
      log('Main-feedback', 'Command `feedback` received from user ' + interaction.user.tag);

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
      log('Main-privacy', 'Command `privacy` -> `' + subcommand + '` received from user ' + interaction.user.tag);

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
      log('Main-user', 'Command `dashboard` received from user ' + interaction.user.tag);
      let user_level = await client_settings.level(interaction.user.id);
      let level_name = "";
      let emoji_level = ""
      switch(user_level)
      {
        case 0:
          emoji_level = "<:level1:1065239400549724281>";
          level_name = "1";
          break;
        case 1:
          emoji_level = "<:level2:1065239416798453921>";
          level_name = "2";
          break;
        case 2:
          emoji_level = "<:level3:1065239432321568848>";
          level_name = "3";
          break;
        case 3:
          emoji_level = "<:golden:1065239445625917520>";
          level_name = "**Golden**";
          break;
      }
      let dash_embed = new Discord.EmbedBuilder()
        .setColor([0x2f, 0x31, 0x36])
        .setTitle(i18n.place(i18n.get("dashboard.panel_title", interaction.locale), {username: interaction.user.username}))
        .setDescription(i18n.get("dashboard.panel_description", interaction.locale))
        .setFields([
          {name: i18n.get("dashboard.level_label", interaction.locale), value: i18n.place(i18n.get("dashboard.level_content", interaction.locale), {emoji: emoji_level, level: level_name, points: await client_settings.pointsCount(interaction.user.id)}), inline: true},
          {name: "XP", value: (await client_settings.XPCount(interaction.user.id)).toString(10), inline: true},
          {name: i18n.get("dashboard.leaderboard_label", interaction.locale), value: i18n.place(i18n.get("dashboard.leaderboard_content", interaction.locale), {pos: await client_settings.leaderboardPosition(interaction.user.id)}), inline: true},
          {name: i18n.get("dashboard.playlists_label", interaction.locale), value: "Coming soon", inline: false}
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
      log('Main-user', 'Command `settings` received from user ' + interaction.user.tag);
      await interaction.reply(await generate_user_settings(interaction.user, interaction.locale)).catch((e) => {console.log('reply error : ' + e)});
      return;
    }

    else if(interaction.commandName === 'config')
    {
      let subcommand = interaction.options.getSubcommand();
      if(subcommand == undefined)
      {
        await interaction.reply({ content: i18n.get('errors.missing_subcommand', interaction.locale), ephemeral: true }).catch((e) => { console.log('reply error : ' + e)});
        return;
      }
      log('Main-config', 'Command `config` -> `' + subcommand + '` received from user ' + interaction.user.tag);

      if(!interaction.member.permissions.has(Discord.PermissionsBitField.Flags.ManageGuild))//Ne peut pas manage la guild
      {
        await interaction.reply({ content: i18n.get('errors.not_admin', interaction.locale), ephemeral: true }).catch((e) => { console.log('reply error : ' + e)});
        return;
      }

      if(subcommand === 'player')
      {
        player.configure(interaction);
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

          config.locale = choosen_locale;
          await client_settings.set(interaction.guildId, 1, 'config', config);
          await interaction.reply({content: i18n.place(i18n.get('config.languages.change_done', interaction.locale), {language: choosen_locale}), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
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
      let subcommand = interaction.options.getSubcommand();
      if(subcommand == undefined)
      {
        await interaction.reply({ content: i18n.get('errors.missing_subcommand', interaction.locale), ephemeral: true }).catch((e) => { console.log('reply error : ' + e)});
        return;
      }
      log('Main-privacy', 'Command `help` -> `' + subcommand + '` received from user ' + interaction.user.tag);

      if(subcommand === 'level')
      {
        await interaction.reply({
          content: '',
          embeds: [{
            title: i18n.get("help.level.title", interaction.locale),
            color: 0x2f3136,
            description: i18n.get("help.level.description", interaction.locale),
            fields: [
              {name: i18n.get("help.level.field_1.name", interaction.locale), value: i18n.get("help.level.field_1.value", interaction.locale)},
              {name: i18n.get("help.level.field_2.name", interaction.locale), value: i18n.get("help.level.field_2.value", interaction.locale)},
              {name: i18n.get("help.level.field_3.name", interaction.locale), value: i18n.get("help.level.field_3.value", interaction.locale)},
              {name: i18n.get("help.level.field_4.name", interaction.locale), value: i18n.get("help.level.field_4.value", interaction.locale)}
            ]
          }]
        }).catch((e) => { console.log('reply error : ' + e)});
      }
      else if(subcommand === 'donator')
      {
        await interaction.reply({
          content: '',
          embeds: [{
            title: i18n.get("help.donator.title", interaction.locale),
            color: 0x2f3136,
            description: i18n.get("help.donator.description", interaction.locale),
            fields: [
              {name: i18n.get("help.donator.field_1.name", interaction.locale), value: i18n.get("help.donator.field_1.value", interaction.locale)},
              {name: i18n.get("help.donator.field_2.name", interaction.locale), value: i18n.get("help.donator.field_2.value", interaction.locale)},
              {name: i18n.get("help.donator.field_3.name", interaction.locale), value: i18n.get("help.donator.field_3.value", interaction.locale)},
              {name: i18n.get("help.donator.field_4.name", interaction.locale), value: i18n.get("help.donator.field_4.value", interaction.locale)}
            ],
          }],
          components: [
            new Discord.ActionRowBuilder().addComponents([
              new Discord.ButtonBuilder()
                .setStyle(5)
                .setEmoji({name: "golden", id: "1065239445625917520"})
                .setLabel(i18n.get("help.donator.tip_button", interaction.locale))
                .setURL('https://patreon.com/user?u=85252153')
            ])
          ]
        }).catch((e) => { console.log('reply error : ' + e)});
      }
      else if(subcommand === 'start')
      {
        await interaction.reply({
          content: '',
          embeds: [{
            title: i18n.get("help.start.title", interaction.locale),
            color: 0x2f3136,
            description: i18n.get("help.start.description", interaction.locale),
            fields: [
              {name: i18n.get("help.start.field_1.name", interaction.locale), value: i18n.get("help.start.field_1.value", interaction.locale)},
              {name: i18n.get("help.start.field_2.name", interaction.locale), value: i18n.get("help.start.field_2.value", interaction.locale)},
              {name: i18n.get("help.start.field_3.name", interaction.locale), value: i18n.get("help.start.field_3.value", interaction.locale)},
              {name: i18n.get("help.start.field_4.name", interaction.locale), value: i18n.get("help.start.field_4.value", interaction.locale)}
            ]
          }]
        }).catch((e) => { console.log('reply error : ' + e)});
      }
       else if(subcommand === 'contribute')
      {
        await interaction.reply({
          content: '',
          embeds: [{
            title: i18n.get("help.contribute.title", interaction.locale),
            color: 0x2f3136,
            description: i18n.get("help.contribute.description", interaction.locale),
            footer :{
              text: i18n.get("help.contribute.footer", interaction.locale)
            }
          }]
        }).catch((e) => { console.log('reply error : ' + e)});
      }
      else if(subcommand === 'faq')
      {
        await interaction.reply({
          content: '',
          embeds: [{
            title: i18n.get("help.faq.title", interaction.locale),
            color: 0x2f3136,
            description: i18n.get("help.faq.description", interaction.locale),
            fields: [
              {name: i18n.get("help.faq.field_1.name", interaction.locale), value: i18n.get("help.faq.field_1.value", interaction.locale)},
              {name: i18n.get("help.faq.field_2.name", interaction.locale), value: i18n.get("help.faq.field_2.value", interaction.locale)},
              {name: i18n.get("help.faq.field_3.name", interaction.locale), value: i18n.get("help.faq.field_3.value", interaction.locale)}
            ]
          }]
        }).catch((e) => { console.log('reply error : ' + e)});
      }
      else await interaction.reply({ content: i18n.get('errors.unknown_subcommand', interaction.locale), ephemeral: true }).catch((e) => { console.log('reply error : ' + e)});
      return;
    }
    //---//
  }
  else if(interaction.isButton())
  {
    if(['privacy_cancel', 'privacy_delete', 'privacy_retrieve', 'settings', 'close_any'].includes(interaction.customId) ||
      interaction.customId.startsWith('btn_disable_troll_'))
    {
      log('Main-root', 'Command `' + interaction.customId + '` received from user ' + interaction.user.tag);
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
        let panel_id = interaction.customId.split('_').splice(-1)[0];
        if(panel_id !== interaction.user.id)
        {
          await interaction.reply({content: i18n.get('errors.settings.not_authorized_user', interaction.locale), ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
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
          url: "https://discord.com/api/webhooks/1059898884232593528/YdW_Kx2a63gzU_vKTCbFRinGEI_-thRPelL8-TcHd9hk_G1eY_Z4nhiVdNRTBA5bgvGM?wait=true",
          method: "POST",
          headers: {
            'Accept-Encoding': 'deflate, br'
          },
          data: {username: "Feedback about BaBot", embeds: [{title: "New feedback", description: interaction.fields.getTextInputValue('feedback'), author: {name: interaction.user.tag + '(' + interaction.user.id + ')', iconURL: interaction.user.avatarURL()}, color: 0x2f3136}]}
      }).then(function(){
          log('Main-feedback', 'New feedback logged in the server');
      }, function(e) {
          log('Main-feedback', 'Error when logging feedback of ' + interaction.user.tag + '(' + interaction.user.id + ')');
          log('Main-feedback', 'Feedback content : ' + interaction.fields.getTextInputValue('feedback'));
      });

      await interaction.reply({content: i18n.get('feedback.submitted', interaction.locale), ephemeral: true}).catch(e => console.log('reply error : ' + e));
      client_settings.addXP(interaction.user.id, 250);
      return;
    }
  }

  player.interactionCreate(interaction);
  status.interactionCreate(interaction);
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
  log('Main', 'Added in a new guild : ' + guild.id + ' - ' + guild.name + ' | Members : ' + guild.approximateMemberCount + ', Online : ' + guild.approximatePresenceCount);

  await update_stats();
});
client.on('guildDelete', async (guild) => {
 if(!guild.available) return false;
  log('Main', 'I\'m no longer in this guild : ' + guild.id + ' - ' + guild.name);

  await update_stats();
});

client.on('voiceStateUpdate', async (oldVoiceState, newVoiceState) => {
  player.voiceStateUpdate(newVoiceState);
});

//----- ENTRY POINT -----//
(async () => {
  client.login(settings.token);
  log('Main', 'Environment variables loaded');
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
    .setColor([0x2f, 0x31, 0x36])
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
  
  return {embeds: [settings_embed], components: settings_components};
}



async function update_stats()//Executed when guilds count change or bot is restarted
{
  if(settings.dev) return;//Only update stats on websites and others in production mode
  let guild_count = (await client.shard.fetchClientValues('guilds.cache.size').catch(() => {return []})).reduce((acc, guildCount) => acc + guildCount, 0);
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
    log('Main', 'Data actualized on top.gg');
  }, function(e) {
    //console.log(e);
    log('Main', 'Error when actualizing data on top.gg');
  });

  await axios({
    url: "https://discords.com/bots/api/bot/1052586565395828778",
    method: "POST",
    headers: {
      "Authorization": "9604351c653db893e258136cefaef5e239879e57653d019b0af9feb2910a37d3bd59eb4d89a77dd6002df11e2c38fd6c0074a257d9ecd74602a17c7ac3d8dd2a"
    },
    data: "server_count=" + guild_count
  }).then(function(){
    log('Main', 'Data actualized on discords.com');
  }, function(e) {
    //console.log(e);
    log('Main', 'Error when actualizing data on discords.com');
  });

  await axios({
    url: "https://discordbotlist.com/api/v1/bots/1052586565395828778/stats",
    method: "POST",
    headers: {
      Authorization: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0IjoxLCJpZCI6IjEwNTI1ODY1NjUzOTU4Mjg3NzgiLCJpYXQiOjE2NzQ3NTg0Nzl9.0VS2pg8rcm1_Vgj_D5ayOKiXooRGT77xaocejvykU0g"
    },
    data: "users=" + users_count + "&guilds=" + guild_count
  }).then(function(){
    log('Main', 'Data actualized on discordbotlist.com');
  }, function(e) {
    //console.log(e);
    log('Main', 'Error when actualizing data on discordbotlist.com');
  });

  await axios({
    url: "https://api.botlist.me/api/v1/bots/1052586565395828778/stats",
    method: "POST",
    headers: {
      Authorization: "7AjY6Ql2Ra6Yu62TwhSW3pNtRfMEVL"
    },
    data: "server_count=" + guild_count + "&shard_count=" + shards_count
  }).then(function(){
    log('Main', 'Data actualized on botlist.me');
  }, function(e) {
    //console.log(e);
    log('Main', 'Error when actualizing data on botlist.me');
  });

  await axios({
    url: "https://discord.bots.gg/api/v1/bots/1052586565395828778/stats",
    method: "POST",
    headers: {
      Authorization: "eyJhbGciOiJIUzI1NiJ9.eyJhcGkiOnRydWUsImlkIjoiNDkyNzM0NDk2MjgyNTA5MzEyIiwiaWF0IjoxNjczNzc0MDQxfQ.O4EsKOE1ivZPaS7EeN0kDbe_PZU61giXyyk7s3tLsHE"
    },
    data: {guildCount: guild_count, shardCount: shards_count}
  }).then(function(){
    log('Main', 'Data actualized on discord.bots.gg');
  }, function(e) {
    //console.log(e);
    log('Main', 'Error when actualizing data on discord.bots.gg');
  });
  //---//

  //--- Stats Webhook ---//
  await axios({
    url: "https://discord.com/api/webhooks/1060989854760054845/MZqzxw-zckiVjAbpnoRLZcWKyFHFrbnnG6o-eqLDzNDFFuvGggtTVi6CBzAjfbrf6R9Q?wait=true",
    method: "POST",
    headers: {
      'Accept-Encoding': 'deflate, br'
    },
    data: {username: "BaBot statistics", embeds: [{title: "BaBot statistics update", description: "I'm now in **" + guild_count + "** servers", color: 0x2f3136}]}
  }).then(function(){
    log('Main-feedback', 'Statistics sent to the server');
  }, function(e) {
    //console.log(e);
    log('Main-feedback', 'Error when logging statistics on the server');
  });
  //---//
}

function log(code_section, msg)
{
  let date = new Date();
  let msg_formatted = ('[' + date.getFullYear() + '/' +
    ("0" + (date.getMonth() + 1)).slice(-2) + '/' +
    ("0" + date.getDate()).slice(-2) + ' ' +
    ("0" + date.getHours()).slice(-2) + ':' +
    ("0" + date.getMinutes()).slice(-2) + ':' +
    ("0" + date.getSeconds()).slice(-2) + '] ' +
    '[' + (code_section + '                    ').slice(0, 20) + '] ') + msg + '\n';

  process.stdout.write(msg_formatted);

  fs.appendFile(process.cwd() + "/env_data/babot.log", msg_formatted,
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
    let guild_count = (await client.shard.fetchClientValues('guilds.cache.size').catch(() => {return []})).reduce((acc, guildCount) => acc + guildCount, 0);
    let next_status = random_status < 1 ? [guild_count + " servers", 3] : custom_status[random_status - 1];
    await client.user.setPresence({activities: [{name: next_status[0], type: next_status[1]}]});
  }, 1000 * 60);
}

//--- Error catching ---//
//Write the error occured in crash.sts before leaving to allow the program to send it when it will restart
process.on('uncaughtException', error => {
  console.log(error);
  fs.writeFileSync(__dirname + '/env_data/crash.sts', error.name + ' : ' + error.message + '\nStack trace : ```' + error.stack + '```');
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.log(error);
  fs.writeFileSync(__dirname + '/env_data/crash.sts', error.name + ' : ' + error.message + '\nStack trace : ```' + error.stack + '```');
  process.exit(1);
});
//---//