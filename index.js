const Discord = require('discord.js');
const fs = require('fs');

let manager = new Discord.ShardingManager('bot.js', {token: fs.readFileSync(__dirname + '/token', {encoding: 'utf-8'}).replace('\n', '')});
manager.spawn();