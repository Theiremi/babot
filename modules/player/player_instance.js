const worker_threads = require('worker_threads');
const Voice = require('@discordjs/voice');

if(!worker_threads.isMainThread)
{
	console.error("I need to run in a Worker !");
	process.exit(1);
}

let options = worker_threads.workerData;
let resources = {};
initialize();

worker_threads.parentPort.on('message', function(msg){
	if(!typeof msg === "object") return;
	if(msg.action === undefined) return;

	if(msg.action === "start")
	{
		if(msg.link === undefined ||
			msg.volume === undefined ||
			msg.headers === undefined) return;

		let play_link_process = await axios({
			url: msg.link,
			method: 'get',
			responseType: 'stream',
			headers: msg.headers
		}).catch((e) => {
			console.log('Player-song', '[' + options.guild_id + '] Error fetching song');
		});

		const transcoder = new prism.FFmpeg({args: [
			'-analyzeduration', '0',
			'-loglevel', '0',
			'-f', 's16le',
			'-ar', '48000',
			'-ac', '2',
			'-s:a', '240'
		]});

		resources.volumeTransformer = new prism.VolumeTransformer({type: 's16le', volume: msg.volume});
		let encoder = new prism.opus.Encoder({channels: 2, rate: 48000, frameSize: 960});
		let resource = Voice.createAudioResource(play_link_process.data.pipe(transcoder).pipe(resources.volumeTransformer).pipe(encoder), {inputType: "opus"});
		
		resources.player.play(resource);
	}
	else if(msg.action === "play")
	{
		resources.player.unpause(true);
	}
	else if(msg.action === "pause")//Works
	{
		resources.player.pause(true);
	}
	else if(msg.action === "stop")
	{
		resources.player.stop();
	}
	else if(msg.action === "volume")
	{
		if(resources.volumeTransformer !== undefined) resources.volumeTransformer.setVolume(msg.volume);
	}
	else if(msg.action === "leave")
	{
		destroyObject();
	}
});


function initialize(only_connection = false)
{
	if(isObjectValid() || (only_connection &&
		resources !== undefined &&
		resources.player !== undefined &&
		resources.player_subscription !== undefined))
	{
		resources.voice_connection = Voice.joinVoiceChannel({
			adapterCreator: options.voiceAdapterCreator,
			guildId: options.guild_id,
			channelId: options.channel_id,
			selfDeaf: true,
			selfMute: false
		});

		resources.voice_connection.addListener(Voice.VoiceConnectionStatus.Disconnected, async function() {
			try {
				await Voice.entersState(resources.voice_connection,
					Voice.VoiceConnectionStatus.Ready,
					5000
				);
			}
			catch (e)
			{
				destroyObject();
			}
		});

		if(only_connection)
		{
			resources.player_subscription = resources.voice_connection.subscribe(resources.player);
		}
		else
		{
			resources.player = new Voice.AudioPlayer({noSubscriber: Voice.NoSubscriberBehavior.Pause});
			resources.player.addListener(Voice.AudioPlayerStatus.Idle, () => {??????????});
			resources.player.on('error', function() { destroyObject(); })
			resources.player_subscription = resources.voice_connection.subscribe(resources.player);
		}
	}
}

function destroyObject()
{
	try
	{
		resources.voice_connection.destroy();
	}
	catch(e)
	{
		console.log(e);
	}
	
	process.exit(0);
}