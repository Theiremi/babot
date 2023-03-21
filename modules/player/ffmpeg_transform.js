const { Transform, PassThrough } = require('stream');
const prism = require('prism-media');

class PlayerTransform extends Transform {
	#_ffmpeg;
	#change = false;
	#output = new PassThrough();
	constructor(options) {
		super(options);

		this.changeSettings(options);
	}

	_transform(chunk, encoding, callback)
	{
		console.log('test3');
		this.#_ffmpeg.write(chunk);
		callback();
	}

	changeSettings(options)
	{
		this.#_ffmpeg = new prism.FFmpeg({args: [
			'-analyzeduration', '0',
			'-loglevel', '0',
			'-f', 'opus',
			'-ac', '2',
			'-q:a', '0',
			'-filter:a', 'volume=' + (options.volume !== undefined ? options.volume : 1)
		]});

		let this_class = this;
		this.#_ffmpeg.on('data', function(chunk){
			console.log('test2');
			this_class.push(chunk);
		});

		setInterval(function(){ this_class.#change = !this_class.#change;}, 5000);
	}

	changeStream(old_stream, new_stream)
	{

	}
}

module.exports = { PlayerTransform };