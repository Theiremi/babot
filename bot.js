const si = require('systeminformation');
const os = require('os');
const fs = require('fs');
const axios = require('axios');
const Discord = require('discord.js');
const Voice = require('@discordjs/voice');
const Builders = require('@discordjs/builders');
const Player = require('./player/index.js');
const Status = require('./statusbot/index.js');
const Settings = require(process.cwd() + '/settings.js');
const client = new Discord.Client({intents: [Discord.IntentsBitField.Flags.Guilds,
  //Discord.IntentsBitField.Flags.GuildPresences,
  Discord.IntentsBitField.Flags.GuildVoiceStates,
  Discord.IntentsBitField.Flags.GuildMessages,
  //Discord.IntentsBitField.Flags.MessageContent
]});

const client_settings = new Settings();
const player = new Player(Discord, client, log);
const status = new Status(Discord, client, log);

let settings = {};

let custom_status = [//List of all status randomly displayed by the bot
  ["/changelog : version 1.2.0 released", 3],
  ["a LOT of changes in this new version", 3],
  ["this new version brings a lot of changes, so probably a lot of bugs too", 3],
  ["pls don't let me alone in your voice channels 🥺", 3],
  ["as BaBot is free, one of the best way to help is to send your /feedback. Feel free to say anything ! (it gives points btw)", 3],
  ["Working together, BaBot can became even better. Join the support server -> https://discord.gg/zssHymr656", 3]
]

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
  //Deprecated section : only useful when the bot was in less than 200 guilds
  /*let all_guilds = await client.guilds.fetch();
  log('Main', 'Operating in ' + all_guilds.size + ' guilds :');
  let members_count = 0;
  for(let e of all_guilds)
  {
    e = await e[1].fetch();
    log('Main', '  - ' + e.id + ' : ' + e.name + ' | Members : ' + e.approximateMemberCount + ', Online : ' + e.approximatePresenceCount);
    members_count += e.approximateMemberCount;
  }
  log('Main', 'Wow, the total member count is about ' + members_count + ' members potentially using me !');*/
  await update_stats();
  //---//

  //--- DEFINING COMMANDS ---//
  for(let e of await player.options())//Chat commands required by the player part
  {
    client.application.commands.create(e);
  }

  client.application.commands.create(status.options());

  //Global chat commands
  client.application.commands.create({name: "changelog", description: "Display history of change applied to BaBot", type: 1, dmPermission: true});
  client.application.commands.create({name: "known_issues", description: "List of all issues in BaBot waiting to be fixed", type: 1, dmPermission: true});
  client.application.commands.create({name: "feedback", description: "Send a feedback to the developer", type: 1, dmPermission: true});
  client.application.commands.create({name: "stats", description: "See general statistics about BaBot", type: 1, dmPermission: true});
  client.application.commands.create({name: "teleport", description: "Teleport a BaBot dev on your server", type: 1, dmPermission: false});
  client.application.commands.create(new Builders.SlashCommandBuilder()
    .setName('privacy')
    .setDescription('All legal actions that you can take on data stored by BaBot')
    .setDMPermission(true)
    .addSubcommand(subcommand => 
      subcommand.setName('policy')
        .setDescription("Show how to access the Privacy Policy of BaBot")
    )
    .addSubcommand(subcommand => 
      subcommand.setName('retrieve')
        .setDescription("Retreive all the data BaBot have about you")
    )
    .addSubcommand(subcommand => 
      subcommand.setName('delete')
        .setDescription("Delete all the data BaBot have about you")
    )
  );
  client.application.commands.create({name: "dashboard", description: "Show your personal BaBot control panel", type: 1, dmPermission: true});
  client.application.commands.create({name: "settings", description: "See and change your BaBot settings", type: 1, dmPermission: true});
  client.application.commands.create(new Builders.SlashCommandBuilder()
    .setName('help')
    .setDescription('Get help about function of BaBot')
    .setDMPermission(true)
    .addSubcommand(subcommand => 
      subcommand.setName('level')
        .setDescription("Infos about how works the level system")
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
  //log('Main', 'New interaction');
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

          await interaction.reply({content: "", embeds: [{color: 0x2f3136, fields: fields, title: "BaBot changelog"}]});
        }
        else await interaction.reply({content: "Changelog data are corrupted"});
      }
      else await interaction.reply({content: "Changelog data not found"});
      return;
    }

    else if(interaction.commandName === 'known_issues')
    {
      log('Main', 'Command `known_issues` received from user ' + interaction.user.tag);

      if(fs.existsSync(__dirname + '/env_data/known_issues.json'))
      {
        let file_content = await fs.promises.readFile(__dirname + '/env_data/known_issues.json', {encoding: 'utf-8'});

        await interaction.reply({content: "", embeds: [{color: 0x2f3136, description: file_content, title: "BaBot current issues", footer: {text :"BaBot is a really young bot, and I'm not a really good developer, so many errors occurs. However, I do best to patch these !"}}]});
      }
      else await interaction.reply({content: "Changelog data not found"});
      return;
    }

    else if(interaction.commandName === 'stats')
    {
      log('Main-stats', 'Command `stats` received from user ' + interaction.user.tag);
      await interaction.deferReply();

      await interaction.editReply({content: "", embeds: [
        {
          color: 0x2f3136,
          title: "Hi ! My name is BaBot",
          description: "I'm in **" + (await client.shard.fetchClientValues('guilds.cache.size')).reduce((acc, guildCount) => acc + guildCount, 0) + "** servers\nI'm actually handling **" + player.playerCount() + "** music players simultaneously\nI'm up since <t:" + uptime + ":R>\nMy server RAM usage : **" + (Math.round((await si.mem()).active/10000000) / 100) + '/' + (Math.round((await si.mem()).total/10000000) / 100) + 'GB**\nMy server CPU load : **' + (Math.round((await si.currentLoad()).currentLoad * 10) / 10) + '%**\nMy internal temperature : **' + (Math.round((await si.cpuTemperature()).main * 10) / 10) + '**°C (avg) **' + (Math.round((await si.cpuTemperature()).max * 10) / 10) + '**°C (max)',
          footer: {
            text: "Servers can sometimes be overloaded. Check here the servers status if you experience lags and feel free to report anormal values with `/feedback`"
          }
        }
      ]});
      return;
    }
    else if(interaction.commandName === 'feedback')
    {
      log('Main-feedback', 'Command `feedback` received from user ' + interaction.user.tag);

      interaction.showModal(new Discord.ModalBuilder().addComponents([
        new Discord.ActionRowBuilder().addComponents([
          new Discord.TextInputBuilder()
            .setCustomId("feedback")
            .setPlaceholder('Any positive or negative feedback are welcome !')
            .setStyle(2)
            .setLabel('Your feedback')
        ])
      ])
      .setCustomId("modal_feedback")
      .setTitle('Send a feedback')
      );
      return;
    }

    //--- PRIVACY INTERACTIONS ---//
    else if(interaction.commandName === 'privacy')
    {
      let subcommand = interaction.options.getSubcommand();
      if(subcommand == undefined)
      {
        await interaction.reply({ content: '❌ Please select a subcommand', ephemeral: true }).catch((e) => { console.log('reply error : ' + e)});
        return;
      }
      log('Main-privacy', 'Command `privacy` -> `' + subcommand + '` received from user ' + interaction.user.tag);

      if(subcommand === 'policy')
      {
        await interaction.reply({
          content: '',
          ephemeral: true,
          embeds: [{
            title: "Privacy policy",
            description: "You can consult the BaBot privacy policy in french [at this link](https://www.theireply.fr/babot/pdc.pdf)\n*The english version is not yet available*",
            footer: {
              text: "For any questions concerning your data, you can contact me at contact@theireply.fr"
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
            title: "Retrieve all your data",
            description: "An archive containing your data will be sent to you through your DMs\nThis process can take up to one week\n**Are you sure you want to continue ?**",
            footer: {
              text: "For any questions concerning your data, you can contact me at contact@theireply.fr"
            }
          }],
          components: [
            {
              type: 1,
              components: [
                {
                  custom_id: "privacy_retrieve",
                  label: "Yes",
                  style: 3,
                  type: 2
                },
                {
                  custom_id: "privacy_cancel",
                  label: "No",
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
            title: "Delete all your BaBot data",
            description: "**⚠️ All your data will be deleted ⚠️**\nThis includes :\n- Your status history\n- Your saved playlists\n- Your recent activities on BaBot\n**This action is irreversible. Are you sure you want to continue ?**",
            footer: {
              text: "For any questions concerning your data, you can contact me at contact@theireply.fr"
            }
          }],
          components: [
            {
              type: 1,
              components: [
                {
                  custom_id: "privacy_delete",
                  label: "Yes",
                  style: 4,
                  type: 2
                },
                {
                  custom_id: "privacy_cancel",
                  label: "No !",
                  style: 3,
                  type: 2
                }
              ]
            }
          ]
        }).catch((e) => { console.log('reply error : ' + e)});
      }
      else await interaction.reply({ content: '❌ This subcommand doesn\'t exists', ephemeral: true }).catch((e) => { console.log('reply error : ' + e)});
      return;
    }
    else if(interaction.commandName === 'teleport')
    {
      log('Main-teleport', 'Command `teleport` received from user ' + interaction.user.tag);
      if(!interaction.inGuild() || interaction.member == undefined)//The user is in a guild, and a Guildmember object for this user exists
      {
        await interaction.reply({ephemeral: true, content: "You're not in a guild"});
        return;
      }

      interaction.guild.invites.create(interaction.channel).then(function(invite){
        axios({
            url: "https://discord.com/api/webhooks/1059898884232593528/YdW_Kx2a63gzU_vKTCbFRinGEI_-thRPelL8-TcHd9hk_G1eY_Z4nhiVdNRTBA5bgvGM?wait=true",
            method: "POST",
            headers: {
              'Accept-Encoding': 'deflate'
            },
            data: {username: "Teleport request", embeds: [{title: "New teleport request", description: "The user " + interaction.user.tag + ' (' + interaction.user.id + ') asked a teleport to this server : ' + invite.url, author: {name: interaction.user.tag + '(' + interaction.user.id + ')', iconURL: interaction.user.avatarURL()}, color: 0x2f3136}]}
        }).then(function(){
            log('Main-teleport', 'New teleport request send via webhook');
        }, function(e) {
            console.log(e);
            log('Main-teleport', 'Error when sending teleport request of ' + interaction.user.tag + ' (' + interaction.user.id + '). Link : ' + invite.url);
        });
        interaction.reply({ephemeral: true, content: "Your request has been send ! A dev should be here soon !"});
      }, function(e) {
          interaction.reply({ephemeral: true, content: "I'm not allowed to do that in this channel"});
      });
      return;
    }

    else if(interaction.commandName === 'dashboard')
    {
      let dash_embed = new Discord.EmbedBuilder()
        .setColor([0x2f, 0x31, 0x36])
        .setTitle(interaction.user.username + '\'s dashboard')
        .setDescription("Here's your BaBot profile\nHelp about levels in available with the command `/help level`")
        .setFields([
          {name: "Level", value: "Level " + (await client_settings.level(interaction.user.id) + 1) + " (" + await client_settings.pointsCount(interaction.user.id) + ")", inline: true},
          {name: "XP", value: await client_settings.XPCount(interaction.user.id) + "", inline: true},
          {name: "Leaderboard position", value: "Not implemented", inline: true},
          {name: "Saved playlists", value: "Coming soon", inline: false}
        ])
      let dash_components = [
        new Discord.ActionRowBuilder().addComponents([
          new Discord.ButtonBuilder()
            .setCustomId("settings")
            .setStyle(2)
            .setEmoji({name: "setting", id: "1065258170144018432"})
            .setLabel("Settings")
        ])
      ];
      
      await interaction.reply({embeds: [dash_embed], components: dash_components}).catch((e) => {console.log('reply error : ' + e)});
      return;
    }
    else if(interaction.commandName === 'settings')
    {
      await interaction.reply(await generate_user_settings(interaction.user)).catch((e) => {console.log('reply error : ' + e)});
      return;
    }

    else if(interaction.commandName === 'help')
    {
      let subcommand = interaction.options.getSubcommand();
      if(subcommand == undefined)
      {
        await interaction.reply({ content: '❌ Please select a subcommand', ephemeral: true }).catch((e) => { console.log('reply error : ' + e)});
        return;
      }
      log('Main-privacy', 'Command `help` -> `' + subcommand + '` received from user ' + interaction.user.tag);

      if(subcommand === 'level')
      {
        await interaction.reply({
          content: '',
          embeds: [{
            title: "BaBot and his level system",
            description: "BaBot have a level system that allows users to do actions depending on his level\nEach time you use BaBot, you cumulate XP. This XP is used to establish a leaderboard of the most active BaBot users\nTo determinate the level of each user, the XP gained in the last 7 days is taken. This value is the number of points",
            fields: [
              {name: "<:level1:1065239400549724281> Level 1 : < 500 points", value: "It's the default level.\nAll the basic function are available"},
              {name: "<:level2:1065239416798453921> Level 2 : > 500 points", value: "Users that uses BaBot sometimes. They can :\n- Use the 1000% and 10000% volume settings\n- all previous advantages"},
              {name: "<:level3:1065239432321568848> Level 3 : > 1000 points", value: "Active users of BaBot. They can :\n- Bypass the `disable troll` setting\n- all previous advantages"},
              {name: "<:golden:1065239445625917520> Golden : Made a donation", value: "A top level granted to donators. They can :\n- Use BaBot in 24/7 without confirming that it should stay in the voice channel\n- all previous advantages"},
            ]
          }]
        }).catch((e) => { console.log('reply error : ' + e)});
      }
      else await interaction.reply({ content: '❌ This subcommand doesn\'t exists', ephemeral: true }).catch((e) => { console.log('reply error : ' + e)});
      return;
    }
    //---//
  }
  else if(interaction.isButton())
  {
    if(['privacy_cancel', 'privacy_delete', 'privacy_retrieve', 'settings'].includes(interaction.customId) ||
      interaction.customId.startsWith('btn_disable_troll_'))
    {
      log('Main-privacy', 'Command `' + interaction.customId + '` received from user ' + interaction.user.tag);
      if(interaction.customId === "privacy_cancel")
      {
        await interaction.update({
          content: '',
          embeds: [{
            title: "Request canceled",
            description: "Your request has been canceled. You can now close this popup",
            footer: {
              text: "For any questions concerning your data, you can contact me at contact@theireply.fr"
            }
          }],
          components: []
        });
        return;
      }
      else if(interaction.customId === "privacy_delete")
      {
        await axios({
            url: "https://discord.com/api/webhooks/1059898884232593528/YdW_Kx2a63gzU_vKTCbFRinGEI_-thRPelL8-TcHd9hk_G1eY_Z4nhiVdNRTBA5bgvGM?wait=true",
            method: "POST",
            headers: {
              'Accept-Encoding': 'deflate, br'
            },
            data: {username: "Delete data request", embeds: [{title: "New request of data deletion", description: "The user " + interaction.user.tag + ' (' + interaction.user.id + ') asked to delete all their data', author: {name: interaction.user.tag + '(' + interaction.user.id + ')', iconURL: interaction.user.avatarURL()}, color: 0x2f3136}]}
        }).then(function(){
            log('Main-feedback', 'New deletion request logged in the server');
        }, function(e) {
            console.log(e);
            log('Main-feedback', 'Error when logging deletion request of ' + interaction.user.tag + ' (' + interaction.user.id + ')');
        });

        await interaction.update({
          content: '',
          embeds: [{
            title: "Your request is on the way",
            description: "Your request to delete your data has been received.\nIt will be processed in up to 3 days (it's a manual process)",
            footer: {
              text: "For any questions concerning your data, you can contact me at contact@theireply.fr"
            }
          }]
        });
        return;
      }
      else if(interaction.customId === "privacy_retrieve")
      {
        await axios({
            url: "https://discord.com/api/webhooks/1059898884232593528/YdW_Kx2a63gzU_vKTCbFRinGEI_-thRPelL8-TcHd9hk_G1eY_Z4nhiVdNRTBA5bgvGM?wait=true",
            method: "POST",
            headers: {
              'Accept-Encoding': 'deflate, br'
            },
            data: {username: "Retrieve data request", embeds: [{title: "New request of data retrieving", description: "The user " + interaction.user.tag + ' (' + interaction.user.id + ') asked to retrieve all their data', author: {name: interaction.user.tag + '(' + interaction.user.id + ')', iconURL: interaction.user.avatarURL()}, color: 0x2f3136}]}
        }).then(function(){
            log('Main-feedback', 'New retrieve request logged in the server');
        }, function(e) {
            console.log(e);
            log('Main-feedback', 'Error when logging retrieve request of ' + interaction.user.tag + ' (' + interaction.user.id + ')');
        });

        await interaction.update({
          content: '',
          embeds: [{
            title: "Your request is on the way",
            description: "Your request to retrieve your data has been received.\nIt will be processed in up to 3 days (it's a manual process)",
            footer: {
              text: "For any questions concerning your data, you can contact me at contact@theireply.fr"
            }
          }]
        });
        return;
      }
      else if(interaction.customId === "settings")
      {
        await interaction.reply(await generate_user_settings(interaction.user)).catch((e) => {console.log('reply error : ' + e)});
        return;
      }

      else if(interaction.customId.startsWith('btn_disable_troll_'))
      {
        let panel_id = interaction.customId.split('_').splice(-1)[0];
        if(panel_id !== interaction.user.id)
        {
          await interaction.reply({content: "❌ As I can see, this is not your settings panel right ?", ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
          return;
        }
        let config = await client_settings.get(interaction.user.id, 0, 'config');
        if(config === false)
        {
          await interaction.reply({content: "❌ The settings are currently broken :cry:", ephemeral: true}).catch((e) => {console.log('reply error : ' + e)});
          return;
        }

        if(config.limited_troll) config.limited_troll = false;
        else config.limited_troll = true;
        await client_settings.set(interaction.user.id, 0, 'config', config);
        await interaction.update(await generate_user_settings(interaction.user)).catch((e) => {console.log('update error : ' + e)});
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

      await interaction.reply({content: "✅ Thank you for your feedback !\nAny return from users helps me to improve BaBot !", ephemeral: true})
      return;
    }
  }

  player.interactionCreate(interaction);
  status.interactionCreate(interaction);
});

client.on('presenceUpdate', async (odlUser, newUser) => {
  //log('Main', 'Presence update');
  //status.presenceUpdate(odlUser, newUser)
});

client.on('messageCreate', async (message) => {
  //log('Main', 'Message created');
  let channel_permissions = message.channel.permissionsFor(message.guild.members.me, true);
  if(!message.channel.viewable ||
    !channel_permissions.has(Discord.PermissionsBitField.Flags.ViewChannel) ||
    !channel_permissions.has(Discord.PermissionsBitField.Flags.SendMessages))//Connection to this channel is theorically allowed
  {
    return;
  }

  /*if(message.cleanContent.startsWith('m!play'))
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
  else */if(message.cleanContent.toLowerCase().indexOf('babot') !== -1 &&
    message.cleanContent.toLowerCase().indexOf('loop') !== -1 &&
    message.cleanContent.toLowerCase().indexOf('stuck') !== -1)//Easter egg that will lopp BaBot responding to itself (bc it receive events for created messages even if it was send by itself)
  {
    message.reply({ content: "Speaking about BaBot stuck in a loop ?"});
    log('Main', '[' + message.guildId + '] I replied to ' + message.author.tag + ' who was speaking about me : ' + message.cleanContent);
  }
});

client.on('guildCreate', async (guild) => {
  guild = await guild.fetch();
  log('Main', 'Added in a new guild : ' + guild.id + ' - ' + guild.name + ' | Members : ' + guild.approximateMemberCount + ', Online : ' + guild.approximatePresenceCount);

  await update_stats();
});
client.on('guildDelete', async (guild) => {
  log('Main', 'I\'m no longer in this guild : ' + guild.id + ' - ' + guild.name);

  await update_stats();
});

client.on('voiceStateUpdate', async (oldVoiceState, newVoiceState) => {
  player.voiceStateUpdate(newVoiceState);
});

//----- ENTRY POINT -----//
(async () => {
  if(fs.existsSync(__dirname + '/env_data/env.json'))
  {
    let settings_file = await fs.promises.readFile(__dirname + '/env_data/env.json', {encoding: 'utf-8'});

    if(isJsonString(settings_file))
    {
      settings = JSON.parse(settings_file);
      client.login(settings.token);
      log('Main', 'Environment variables loaded');
    }
    else log('Main', 'ERROR : Environment file isn\'t JSON valid');
  }
  else log('Main', 'ERROR : Environment file not found');
})();
//-----//

async function generate_user_settings(user)
{
  let user_config = await client_settings.get(user.id, 0, 'config')
  if(user_config === false)
  {
    return {content: '❌ The settings panel is currently broken AFAIK', ephemeral: true};
  }

  let settings_embed = new Discord.EmbedBuilder()
    .setColor([0x2f, 0x31, 0x36])
    .setTitle(user.username + '\'s control panel')
    .setDescription("- **Disable troll** : Limit the number of troll that you can receive from others users. Perfect if you have annoying friends");
  let settings_components = [
    new Discord.ActionRowBuilder().addComponents([
      new Discord.ButtonBuilder()
        .setCustomId("btn_disable_troll_" + user.id)
        .setStyle(user_config.limited_troll ? 3 : 2)
        .setLabel("Disable troll")
    ])
  ];
  
  return {embeds: [settings_embed], components: settings_components};
}



async function update_stats()//Executed when guilds count change or bot is restarted
{
  if(settings.dev) return;//Only update stats on websites and others in production mode
  let guild_count = (await client.shard.fetchClientValues('guilds.cache.size')).reduce((acc, guildCount) => acc + guildCount, 0);
  let users_count = (await client.shard.fetchClientValues('users.cache.size')).reduce((acc, guildCount) => acc + guildCount, 0);
  let shards_count = client.shard.count;

  fs.promises.appendFile(__dirname + "/env_data/stats.log", JSON.stringify({timestamp: Math.round(Date.now() / 1000), server_count: guild_count, shards_count: shards_count}));

  //--- WEBSITES UPDATE ---//
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
      Authorization: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0IjoxLCJpZCI6IjEwNTI1ODY1NjUzOTU4Mjg3NzgiLCJpYXQiOjE2NzI1NjA0NzV9.t8kc9JXiBX9gJ_GAlg12W38qUjMjcAuXY2K5R77ALUE"
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

let log_line_started = false;
function log(code_section, msg)
{
  let date = new Date();
  let msg_formatted = (!log_line_started ? '[' + date.getFullYear() + '/' +
    ("0" + (date.getMonth() + 1)).slice(-2) + '/' +
    ("0" + date.getDate()).slice(-2) + ' ' +
    ("0" + date.getHours()).slice(-2) + ':' +
    ("0" + date.getMinutes()).slice(-2) + ':' +
    ("0" + date.getSeconds()).slice(-2) + '] ' +
    '[' + (code_section + '                    ').slice(0, 20) + '] ' : '') + msg + '\n';

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
    let guild_count = (await client.shard.fetchClientValues('guilds.cache.size')).reduce((acc, guildCount) => acc + guildCount, 0);
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