const Discord = require('discord.js');

let manager = new Discord.ShardingManager('bot.js', {token: 'MTA1MjU4NjU2NTM5NTgyODc3OA.G93V0r.a3M_yHzx08EzM5lWq5_AyMHRKq9pqzIbWdA93o'});
manager.spawn();