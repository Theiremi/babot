const Discord = require('discord.js');
const fs = require('fs');

(async () => {
	if(fs.existsSync(__dirname + '/env_data/env.json'))
	{
		let settings_file = await fs.promises.readFile(__dirname + '/env_data/env.json', {encoding: 'utf-8'});

		if(isJsonString(settings_file))
		{
			let settings = JSON.parse(settings_file);
			let manager = new Discord.ShardingManager('bot.js', {token: settings.token, totalShards: settings.shards});
			manager.on('shardCreate', async function(shard){
				console.log('ShardManager / Shard ' + shard.id + ' started')
			})
			manager.spawn();
			console.log('ShardManager / Environment variables loaded');
		}
		else console.log('ShardManager / ERROR : Environment file isn\'t JSON valid');
	}
	else console.log('ShardManager / ERROR : Environment file not found');
})();


function isJsonString(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}