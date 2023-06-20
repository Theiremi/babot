'use strict';
//----- MJS patches -----//
import * as url from 'url';
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
//-----//

//----- General dependencies -----//
import fs from 'fs';
import axios from 'axios';
import Discord from 'discord.js';
import CustomClient from '#classes/customClient.mjs';
import * as Builders from '@discordjs/builders';

const client = new CustomClient({
  intents: [Discord.IntentsBitField.Flags.Guilds,
    Discord.IntentsBitField.Flags.GuildVoiceStates,
  ],
  presence: {activities: [{name: "Starting... It will take time for BaBot to be fully functional", type: 3}]}
});
//-----//

//----- Local dependencies -----//
import logger from './classes/logger.mjs';
import miscs from '#classes/miscs.js';
import Player from './modules/player/index.mjs';
import Help from './modules/help/index.mjs';
import Config from './modules/config/index.mjs';
import Privacy from './modules/privacy/index.mjs';
import UserConfig from './modules/user_config/index.mjs';
import Misc from './modules/misc/index.mjs';
const i18n = new (await import('./classes/locales.js')).default('main');

const help = new Help();
const player = new Player(client);
const config = new Config(client, player.configure.bind(player));
const privacy = new Privacy(client);
const user_config = new UserConfig(client);
const misc = new Misc(client, player.playerCount.bind(player));
player.on('error', e => logger.error);
//-----//

let custom_status = [//List of all status randomly displayed by the bot
  ["version 1.7.0 : /changelog", 3],
  ["/help", 3],
  ["pls don't let me alone in your voice channels 🥺", 3],
  ["want to help BaBot ? Look how in /help -> Contribute", 3],
  ["You have the feeling that BaBot is slow ? Let me know with /feedback 🥹", 3]
]

let total_players = 0;
//----- REGISTERING CLIENT EVENTS -----//
process.on('warning', (name, message, stack) => {logger.warn(name + " : " + message + "\n" + stack)});
//client.on('debug', logger.debug);
client.on('warn', logger.warn);
//client.on('error', (e) => logger.error(e.stack));
client.on('invalidated', () => {logger.fatal("Session invalidated !!!"); process.exit(1)});

//-----//
client.on('ready', async () => {
  //--- NAMING BOT ---//
  logger.info(`Logged in as ${client.user.tag}!`);
  if(client.user.username != client.env.name)
  {
    await client.user.setUsername(client.env.name);
    logger.info('Changing username...');
    logger.info(`Logged in as ${client.user.tag}!`);
  }
  //---//

  //--- CRASH HANDLING ---//
  if(fs.existsSync(__dirname + '/env_data/crash.sts'))//If a crash occured
  {
    const crash_details = await fs.promises.readFile(__dirname + '/env_data/crash.sts', {encoding: 'utf-8'});//Retrieve the error details
    await fs.promises.unlink(__dirname + '/env_data/crash.sts');//Delete informations about the crash to avoid repeating this code on the next launch
    logger.fatal(crash_details);

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
  logger.info('I\'m the shard ' + client.shard.ids[0] + '/' + (client.shard.count-1) + ' and I operate in ' + client.shard.mode + ' mode in ' + client.guilds.cache.size + ' guilds');
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
        misc.total_players = msg.count;
      }
    })
  }
  //---//

  //--- DEFINING COMMANDS ---//
  for(let e of await player.options()) client.application.commands.create(e);
  for(let e of help.options()) client.application.commands.create(e);
  for(let e of config.options()) client.application.commands.create(e);
  for(let e of privacy.options()) client.application.commands.create(e);
  for(let e of user_config.options()) client.application.commands.create(e);
  for(let e of misc.options()) client.application.commands.create(e);

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
  if(client.env.banned_users.includes(interaction.user.id))//Block interaction is user is banned
  {
    await interaction.reply({content: i18n.place(i18n.get('errors.user_banned', interaction.locale), {name: client.env.name}), ephemeral: true }).catch((e) => { console.log('reply error : ' + e)});
    return;
  }
  if(interaction.isChatInputCommand())//Interaction coming from a slash command
  {
      
    //---//
  }
  else if(interaction.isButton())
  {
    if(['close_any'].includes(interaction.customId))
    {
      logger.info('Command `' + interaction.customId + '` received', [{tag: "u", value: interaction.user.id}]);
      if(interaction.customId === "close_any")
      {
        await interaction.update({content: 'Closing message...', ephemeral: true}).catch((e) => {console.log('update error : ' + e)});
        await interaction.message.delete().catch((e) => {console.log('delete error : ' + e)});
      }
    }
  }

  player.interactionCreate(interaction).catch(logger.error);
  help.interactionCreate(interaction).catch(logger.error);
  config.interactionCreate(interaction).catch(logger.error);
  privacy.interactionCreate(interaction).catch(logger.error);
  user_config.interactionCreate(interaction).catch(logger.error);
  misc.interactionCreate(interaction).catch(logger.error);
});

client.on('guildCreate', async (guild) => {
  guild = await guild.fetch();
  logger.info('Added in a new guild : ' + guild.id + ' - ' + guild.name + ' | Members : ' + guild.approximateMemberCount + ', Online : ' + guild.approximatePresenceCount, [{tag: 'g', value: guild.id}]);

  await update_stats();
});
client.on('guildDelete', async (guild) => {
 if(!guild.available) return false;
  logger.info('I\'m no longer in this guild : ' + guild.id + ' - ' + guild.name, [{tag: 'g', value: guild.id}]);

  await update_stats();
});

client.on('voiceStateUpdate', async (oldVoiceState, newVoiceState) => {
  player.voiceStateUpdate(newVoiceState);
});

//----- ENTRY POINT -----//
client.login(client.env.token);
logger.info('Environment variables loaded');
//-----//


async function update_stats()//Executed when guilds count change or bot is restarted
{
  if(client.env.webhook_statistics == undefined) return;//Only update stats on websites and others in production mode
  let guild_count = (await miscs.asyncTimeout(client.shard.fetchClientValues('guilds.cache.size'), 1000).catch(() => {return []})).reduce((acc, guildCount) => acc + guildCount, 0);

  //--- Stats Webhook ---//
  await axios({
    url: client.env.webhook_statistics + "?wait=true",
    method: "POST",
    data: {username: "BaBot statistics", embeds: [{title: "BaBot statistics update", description: "I'm now in **" + guild_count + "** servers", color: 0x2f3136}]}
  }).then(function(){
    logger.info('New server count sent on the statistics webhook');
  }, function(e) {
    logger.warn('Failed to send server count on the statistics webhook');
  });
  //---//
}

function update_status()//Change status of the bot every minute
{
  setInterval(async () => {
    let random_status = Math.floor(Math.random() * (custom_status.length + 1));
    let guild_count = (await miscs.asyncTimeout(client.shard.fetchClientValues('guilds.cache.size'), 15000).catch(() => {return []})).reduce((acc, guildCount) => acc + guildCount, 0);
    let next_status = random_status < 1 ? [guild_count + " servers", 3] : custom_status[random_status - 1];
    await client.user.setPresence({activities: [{name: next_status[0], type: next_status[1]}]});
  }, 60000 * 5);
}

//--- Error catching ---//
//Write the error occured in crash.sts before leaving to allow the program to send it when it will restart
process.on('uncaughtException', onError);

function onError(error)
{
  fs.writeFileSync(__dirname + '/env_data/crash.sts', error.stack);
  process.exit(1);
}
//---//