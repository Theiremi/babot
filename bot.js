const si = require('systeminformation');
const os = require('os');
const fs = require('fs');
const axios = require('axios');
const Discord = require('discord.js');
const Voice = require('@discordjs/voice');
const Builders = require('@discordjs/builders');
const Player = require('./player/index.js');
const Status = require('./statusbot/index.js');
const client = new Discord.Client({intents: [Discord.IntentsBitField.Flags.Guilds,
  Discord.IntentsBitField.Flags.GuildPresences,
  Discord.IntentsBitField.Flags.GuildVoiceStates,
  Discord.IntentsBitField.Flags.GuildMessages,
  Discord.IntentsBitField.Flags.MessageContent
  ]});
const player = new Player(Discord, client, log);
const status = new Status(Discord, client, log);

let custom_status = [
  ["certification coming in up to 3 weeks : no more than 250 servers allowed before (Discord fault, not mine)", 3],
  ["/changelog : version 1.1.1 released", 3],
  //["BaBot can crash quite often due of its young age, but all errors are patched in up to 8 hours", 3],
  ["as BaBot is free, one of the best way to help is to send your /feedback. Feel free to say anything ! (new platform, troll songs, report a problem...)", 3],
  ["I hope this link works -> https://discord.gg/zssHymr656", 3],
  ["Working together, BaBot can became even better. Join the support server -> https://discord.gg/zssHymr656", 3]
]

let uptime = Math.round(Date.now() / 1000);
client.on('ready', async () => {
  //--- NAMING BOT ---//
  log('Main', `Logged in as ${client.user.tag}!`);
  if(client.user.username != 'BaBot')
  {
    await client.user.setUsername('BaBot');
    log('Main', 'Changing username...');
    log('Main', `Logged in as ${client.user.tag}!`);
  }
  //---//

  //--- CRASH HANDLING ---//
  if(fs.existsSync(__dirname + '/crash.sts'))
  {
    await axios({
      url: "https://discord.com/api/webhooks/1059898884232593528/YdW_Kx2a63gzU_vKTCbFRinGEI_-thRPelL8-TcHd9hk_G1eY_Z4nhiVdNRTBA5bgvGM?wait=true",
      method: "POST",
      headers: {
        'Accept-Encoding': 'deflate, br'
      },
      data: {username: "BaBot crashs", embeds: [{title: "BaBot has crashed", description: await fs.promises.readFile(__dirname + '/crash.sts', {encoding: 'utf-8'}), color: 0x2f3136}]}
    }).then(function(){
      log('Main-error', 'Error sent to the server');
    }, function(e) {
      //console.log(e);
      log('Main-error', 'Error when logging error on the server');
    });
    await fs.promises.unlink(__dirname + '/crash.sts');
    await client.user.setPresence({activities: [{name: "/known_issues : BaBot ran into a problem and needs to restart. The problem should be fixed very soon", type: 3}]});
    setTimeout(function() {
      update_status();
    }, 1000 * 60 * 5);
  }
  else
  {
    update_status();
  }
  //---//

  //--- BOT STATS ---//
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
  for(let e of await player.options())
  {
    client.application.commands.create(e);
  }
  client.application.commands.create(status.options());
  client.application.commands.create({name: "changelog", description: "Display history of change applied to BaBot", type: 1, dmPermission: true});
  client.application.commands.create({name: "known_issues", description: "List of all issues in BaBot waiting to be fixed", type: 1, dmPermission: true});
  client.application.commands.create({name: "feedback", description: "Send a feedback to the developer", type: 1, dmPermission: true});
  client.application.commands.create({name: "stats", description: "See general statistics about BaBot", type: 1, dmPermission: true});
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
  //---//

  //--- POSTING RULES ---//
  /*(await (await client.guilds.fetch("1059795604517167164")).channels.fetch('1059795606215860306')).send({content: "", embeds: [
    new Discord.EmbedBuilder()
      .setColor([0, 0, 0])
      .setTitle("Rules")
      .setDescription(await fs.promises.readFile('rules_en.txt', {encoding: 'utf-8'}))
  ]})*/
  //---//
});

client.on('interactionCreate', async (interaction) => {
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

      if(fs.existsSync(__dirname + '/known_issues.json'))
      {
        let file_content = await fs.promises.readFile(__dirname + '/known_issues.json', {encoding: 'utf-8'});

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
    //---//
  }
  else if(interaction.isButton())
  {
    if(['privacy_cancel', 'privacy_delete', 'privacy_retrieve'].includes(interaction.customId))
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
          console.log(e);
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
    message.cleanContent.toLowerCase().indexOf('stuck') !== -1)
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

console.log(fs.readFileSync(__dirname + '/token', {encoding: 'utf-8'}));
client.login(fs.readFileSync(__dirname + '/token', {encoding: 'utf-8'}).replace('\n', ''));//Official
//client.login('MTA0MTc1NjAzNDE3NzQ0MTg1Mg.G3ggUx.wRtAiJzd55zJHRykz3IG2Rfbg78zhpwTpXmPc0');//Testing

async function update_stats()
{
  let guild_count = (await client.shard.fetchClientValues('guilds.cache.size')).reduce((acc, guildCount) => acc + guildCount, 0);
  let users_count = (await client.shard.fetchClientValues('users.cache.size')).reduce((acc, guildCount) => acc + guildCount, 0);
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
    data: "server_count=" + guild_count
  }).then(function(){
    log('Main', 'Data actualized on botlist.me');
  }, function(e) {
    //console.log(e);
    log('Main', 'Error when actualizing data on botlist.me');
  });

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

  fs.appendFile(__dirname + "/babot.log", msg_formatted,
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

function update_status()
{
  setInterval(async () => {
    let random_status = Math.floor(Math.random() * (custom_status.length + 3));
    let guild_count = (await client.shard.fetchClientValues('guilds.cache.size')).reduce((acc, guildCount) => acc + guildCount, 0);
    let next_status = random_status < 3 ? [(250 - guild_count) + " guilds slot remaining", 3] : custom_status[random_status - 3];
    await client.user.setPresence({activities: [{name: next_status[0], type: next_status[1]}]});
  }, 1000 * 60);
}

process.on('uncaughtException', error => {
  console.log(error);
  fs.writeFileSync(__dirname + '/crash.sts', error.name + ' : ' + error.message + '\nStack trace : ```' + error.stack + '```');
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.log(error);
  fs.writeFileSync(__dirname + '/crash.sts', error.name + ' : ' + error.message + '\nStack trace : ```' + error.stack + '```');
  process.exit(1);
});