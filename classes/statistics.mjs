import axios from "axios";
import logger from '#classes/logger.mjs';
import env_variables from '#root/env_data/env.json' assert { type: 'json' };
import keys from '#root/env_data/listing_keys.json' assert { type: 'json' };

export default {
	updateListing: async (servers, shards, users, players) => {
    await topgg(servers, shards).then(logger.info, logger.warn);

    await discordbotlist(servers, users, players).then(logger.info, logger.warn);

    await discords(servers).then(logger.info, logger.warn);

    await botlistme(servers, shards).then(logger.info, logger.warn);

    await botsgg(servers, shards).then(logger.info, logger.warn);

    await discordlistgg(servers).then(logger.info, logger.warn);

    await discordbotlisteu(servers).then(logger.info, logger.warn);
	}
}

async function topgg(servers, shards)
{
  if(!keys["topgg"]) return "No token for Top.gg";
  return new Promise(async (resolve, reject) => {
    await axios({
      url: `https://top.gg/api/bots/${env_variables.bot_id}/stats`,
      method: "POST",
      headers: {
        "Authorization": keys["topgg"]
      },
      data: "server_count=" + servers + "&shard_count=" + shards
    }).then(function(){
      resolve('Top.gg statistics actualized');
    }, function() {
      reject('Top.gg statistics actualization failed');
    });
  });
}

async function discordbotlist(servers, users, players)
{
  if(!keys["discordbotlist"]) return "No token for Discordbotlist.com";
  return new Promise(async (resolve, reject) => {
    await axios({
      url: `https://discordbotlist.com/api/v1/bots/${env_variables.bot_id}/stats`,
      method: "POST",
      headers: {
        "Authorization": keys["discordbotlist"]
      },
      data: "users=" + users + "&guilds=" + servers + "&voice_connections=" + players
    }).then(function(){
      resolve('Discordbotlist.com statistics actualized');
    }, function() {
      reject('Discordbotlist.com statistics actualization failed');
    });
  });
}

async function discords(servers)
{
  if(!keys["discords"]) return "No token for Discords.com";
  return new Promise(async (resolve, reject) => {
    await axios({
      url: `https://discords.com/bots/api/bot/${env_variables.bot_id}`,
      method: "POST",
      headers: {
        "Authorization": keys["discords"]
      },
      data: "server_count=" + servers
    }).then(function(){
      resolve('Discords.com statistics actualized');
    }, function() {
      reject('Discords.com statistics actualization failed');
    });
  });
}

async function botlistme(servers, shards)
{
  if(!keys["botlistme"]) return "No token for Botlist.me";
  return new Promise(async (resolve, reject) => {
    await axios({
      url: `https://api.botlist.me/api/v1/bots/${env_variables.bot_id}/stats`,
      method: "POST",
      headers: {
        "Authorization": keys["botlistme"]
      },
      data: "server_count=" + servers + "&shard_count=" + shards
    }).then(function(){
      resolve('Botlist.me statistics actualized');
    }, function() {
      reject('Botlist.me statistics actualization failed');
    });
  });
}

async function botsgg(servers, shards)
{
  if(!keys["botsgg"]) return "No token for Discord.bots.gg";
  return new Promise(async (resolve, reject) => {
    await axios({
      url: `https://discord.bots.gg/api/v1/bots/${env_variables.bot_id}/stats`,
      method: "POST",
      headers: {
        "Authorization": keys["botsgg"]
      },
      data: {guildCount: servers, shardCount: shards}
    }).then(function(){
      resolve('Discord.bots.gg statistics actualized');
    }, function() {
      reject('Discord.bots.gg statistics actualization failed');
    });
  });
}

async function discordlistgg(servers)
{
  if(!keys["discordlistgg"]) return "No token for Discordlist.gg";
  return new Promise(async (resolve, reject) => {
    await axios({
      url: `https://api.discordlist.gg/v0/bots/${env_variables.bot_id}/guilds`,
      method: "PUT",
      headers: {
        "Authorization": "Bearer " + keys["discordlistgg"]
      },
      params: {
        count: servers
      }
    }).then(function(){
      resolve('Discordlist.gg statistics actualized');
    }, function() {
      reject('Discordlist.gg statistics actualization failed');
    });
  });
}

async function discordbotlisteu(servers)
{
  if(!keys["discordbotlisteu"]) return "No token for Discord-botlist.eu";
  return new Promise(async (resolve, reject) => {
    await axios({
      url: "https://api.discord-botlist.eu/v1/update",
      method: "PATCH",
      headers: {
        "Authorization": "Bearer " + keys["discordbotlisteu"]
      },
      data: {serverCount: servers}
    }).then(function(){
      resolve('Discord-botlist.eu statistics actualized');
    }, function() {
      reject('Discord-botlist.eu statistics actualization failed');
    });
  });
}