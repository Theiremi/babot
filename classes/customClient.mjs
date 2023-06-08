'use strict'

import Discord from 'discord.js';
import ClientSettings from '#classes/settings.mjs';
import env from '#root/env_data/env.json' assert { type: 'json' };

export default class extends Discord.Client {
	constructor(options)
	{
		super(options);

		this.env = env;
		this.stored_data = new ClientSettings(env?.redis_url);
		this.stored_data.init();
	}
}