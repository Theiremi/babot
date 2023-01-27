const Discord = require('discord.js');
const fs = require('fs');
const schedule = require('node-schedule');
const settings = require(__dirname + '/env_data/env.json');

let shards_players = {}
let manager = new Discord.ShardingManager('bot.js', {token: settings.token, mode: 'worker', totalShards: settings.shards});
manager.on('shardCreate', async function(shard){
	console.log('ShardManager / Shard ' + shard.id + ' started');
	shard.on('message', function(msg){
		if(msg.action === "player_count")
		{
			shards_players[shard.id] = msg.count;
		}
	})
});
manager.spawn();
setInterval(async function(){
	await manager.broadcast({action: "player_count"});
	await sleep(2_000);
	await manager.broadcast({action: "total_player_count", count: Object.values(shards_players).reduce((acc, guildCount) => acc + guildCount, 0)});
}, 60000)
const job = schedule.scheduleJob('0 */1 * * *', async function() {
	let player_count = Object.values(shards_players).reduce((acc, guildCount) => acc + guildCount, 0);
	let guild_count = (await manager.fetchClientValues('guilds.cache.size').catch(() => {return []})).reduce((acc, guildCount) => acc + guildCount, 0);

	fs.promises.appendFile(__dirname + "/env_data/stats.log", JSON.stringify({timestamp: Math.round(Date.now() / 1000), server_count: guild_count, player_count: player_count}) + '\n');

	if(fs.existsSync(__dirname + '/env_data/restart'))
	{
		let stop_timestamp = parseInt(await fs.readFileSync(__dirname + '/env_data/restart'));
		if(stop_timestamp > (Date.now() / 1000))
		{
			let time_left = stop_timestamp*1000 - Date.now();
			setTimeout(process.exit, time_left, 0);
			manager.broadcast({action: "scheduled_restart", timestamp: stop_timestamp});
			console.log('ShardManager / restart scheduled to ' + stop_timestamp + ' (' + (time_left/1000) + ' seconds)');

			fs.unlinkSync(__dirname + '/env_data/restart');
		}
	}
});

function sleep(ms) {
  return new Promise((resolve) => {
	setTimeout(resolve, ms);
  });
}