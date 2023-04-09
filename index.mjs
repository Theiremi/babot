'use strict';

import Discord from 'discord.js';
import fs from 'fs';
import schedule from 'node-schedule';
import settings from '#root/env_data/env.json' assert {type: "json"};
import logger from '#classes/logger.mjs';
import stats from '#classes/statistics.mjs';
import miscs from '#classes/miscs.js';

let shards_players = {};
let manager = new Discord.ShardingManager('bot.mjs', {token: settings.token, mode: 'worker', totalShards: settings.shards, execArgv: ['--inspect']});
manager.on('shardCreate', async function(shard){
	logger.info('ShardManager / Shard ' + shard.id + ' started');
	shard.on('death', () => {logger.error('ShardManager / Shard ' + shard.id + ' died')});
	shard.on('disconnect', () => {logger.error('ShardManager / Shard ' + shard.id + ' disconnected and won\'t restart')});
	shard.on('reconnecting', () => {logger.warn('ShardManager / Shard ' + shard.id + ' reconnecting')});
	shard.on('message', function(msg){
		if(msg.action === "player_count")
		{
			shards_players[shard.id] = msg.count;
		}
	})
});
manager.spawn({timeout: 120_000, delay: 2_000}).catch((e) => console.log(e));
setInterval(async function(){
	await manager.broadcast({action: "player_count"});
	await miscs.sleep(2_000);
	await manager.broadcast({action: "total_player_count", count: Object.values(shards_players).reduce((acc, guildCount) => acc + guildCount, 0)});
}, 60000);

//----- Periodic actions ------//
const job = schedule.scheduleJob('*/30 * * * *', async function() {
	const player_count = Object.values(shards_players).reduce((acc, guildCount) => acc + guildCount, 0);
	const guild_count = (await miscs.asyncTimeout(manager.fetchClientValues('guilds.cache.size'), 15000).catch(() => {return []})).reduce((acc, guildCount) => acc + guildCount, 0);
	const users_count = (await fs.promises.readdir("./env_data/users").catch(() => [])).length;
	const shards_count = manager.totalShards;

	await stats.updateListing(guild_count, shards_count, users_count, player_count);
	fs.promises.appendFile("./env_data/stats.log", JSON.stringify({timestamp: Math.round(Date.now() / 1000), server_count: guild_count, player_count: player_count}) + '\n');

	console.log("Checking restart file...");
	if(fs.existsSync('./env_data/restart'))
	{
		console.log("It exists");
		let stop_timestamp = parseInt(await fs.readFileSync('./env_data/restart'));
		if(stop_timestamp > (Date.now() / 1000))
		{
			let time_left = stop_timestamp*1000 - Date.now();
			setTimeout(process.exit, time_left, 0);
			manager.broadcast({action: "scheduled_restart", timestamp: stop_timestamp});
			console.log('ShardManager / restart scheduled to ' + stop_timestamp + ' (' + (time_left/1000) + ' seconds)');

			fs.unlinkSync('./env_data/restart');
		}
	}
});
//-----//