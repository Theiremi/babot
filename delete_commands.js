const { REST, Routes } = require('discord.js');
const { bot_id, token } = require(__dirname + '/env_data/env.json');
const rest = new REST({ version: '10' }).setToken(token);

rest.put(Routes.applicationCommands(bot_id), { body: [] })
	.then(() => console.log('Successfully deleted all application commands.'))
	.catch(console.error);
