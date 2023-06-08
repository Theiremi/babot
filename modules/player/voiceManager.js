const worker_threads = require('worker_threads');

class VoiceManager {
	constructor()
	{
		this.connections = new Map();
	}

	initForGuild(guild_id)
	{
		this.connections.set(guild_id, new Worker('guild_voice.js'));
		this.connections.get(guild_id).on('message', ((msg) => { this._voiceMessage(guild_id, msg)} ).bind(this));
	}

	joinVoiceChannel(guild_id, options)
	{

	}
}