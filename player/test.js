let problem = "https://rr3---sn-n4g-gon6.googlevideo.com/videoplayback?expire=1672960906&ei=Kge3Y-KCEsb5xN8P05e1kAM&ip=78.115.237.66&id=o-AAvIUvs2Bm9bYE-aTkj6Vf7XnXHrwl1bbJBb60mnQCRJ&itag=251&source=youtube&requiressl=yes&mh=Xe&mm=31%2C29&mn=sn-n4g-gon6%2Csn-n4g-jqbed&ms=au%2Crdu&mv=m&mvi=3&pl=23&initcwndbps=2232500&spc=zIddbBhH56pBTezpP-hRdxvEIBRB4AQ&vprv=1&svpuc=1&mime=audio%2Fwebm&gir=yes&clen=133429078&dur=7171.041&lmt=1571206334727539&mt=1672938810&fvip=1&keepalive=yes&fexp=24007246&c=ANDROID&txp=5511222&sparams=expire%2Cei%2Cip%2Cid%2Citag%2Csource%2Crequiressl%2Cspc%2Cvprv%2Csvpuc%2Cmime%2Cgir%2Cclen%2Cdur%2Clmt&sig=AOq0QJ8wRgIhAO7_C_8ljEbPFgd4smJ_g9XRZ9SkPRmzScmwLUsZuAbgAiEAtJVPfugAM6qoa5VAgECwIRwMfgRT4ReR2tDzuWEJnjw%3D&lsparams=mh%2Cmm%2Cmn%2Cms%2Cmv%2Cmvi%2Cpl%2Cinitcwndbps&lsig=AG3C_xAwRAIgfNVANRw8PHvHrpMPpesE1MReGKM4p0EzdLuvex9LdZcCIG1w_xmbY1bB5bBFfPXol3uyaGUovU39bm6RiOv8OlPD";
let fine = "https://rr2---sn-n4g-gon6.googlevideo.com/videoplayback?expire=1672961048&ei=uAe3Y_qWCZOgvdIPkPCIgAM&ip=78.115.237.66&id=o-AIYLtdzBa9TZoNA153znUqrWM-Fv4aZY2K_HFyWvJj78&itag=251&source=youtube&requiressl=yes&mh=K5&mm=31%2C29&mn=sn-n4g-gon6%2Csn-n4g-jqber&ms=au%2Crdu&mv=m&mvi=2&pl=23&initcwndbps=2300000&spc=zIddbOp77WfnjANlp2p5Rdqy6VA3qSA&vprv=1&svpuc=1&mime=audio%2Fwebm&gir=yes&clen=534563525&dur=36000.000&lmt=1503762008995191&mt=1672939057&fvip=1&keepalive=yes&fexp=24007246&c=ANDROID&sparams=expire%2Cei%2Cip%2Cid%2Citag%2Csource%2Crequiressl%2Cspc%2Cvprv%2Csvpuc%2Cmime%2Cgir%2Cclen%2Cdur%2Clmt&sig=AOq0QJ8wRQIhAKyr4mh43vYsPgCM3ZFAvTLfmX3j9ta_jKHr-Sk_QE0tAiA142mBNyHKgs94LRgo5hJeK2oefWOL8H8kKclAjj46ng%3D%3D&lsparams=mh%2Cmm%2Cmn%2Cms%2Cmv%2Cmvi%2Cpl%2Cinitcwndbps&lsig=AG3C_xAwRgIhAI5KG7gNTXfgRHBvq0YVmT5o6LWdviVhJ8s5_W245qf0AiEA6MjEU1nkmL1UhvntXYHA7vgLeh4CKMVDczqRQlm6DFE%3D";
let fine2 = "https://rr3---sn-n4g-gon6.googlevideo.com/videoplayback?expire=1673069586&ei=sq-4Y5X7DojWxN8Pvr-9CA&ip=78.115.237.66&id=o-APWN405Gwh6b9dmKn198FV0y6SuXAtW2jnj1VXgW2jF7&itag=251&source=youtube&requiressl=yes&mh=Xe&mm=31%2C29&mn=sn-n4g-gon6%2Csn-n4g-jqbed&ms=au%2Crdu&mv=m&mvi=3&pl=23&initcwndbps=1480000&spc=zIddbMQQ-F_KqhGGZF4vHD1nW4gOXdQ&vprv=1&svpuc=1&mime=audio%2Fwebm&gir=yes&clen=133429078&dur=7171.041&lmt=1571206334727539&mt=1673047537&fvip=1&keepalive=yes&fexp=24007246&c=ANDROID&txp=5511222&sparams=expire%2Cei%2Cip%2Cid%2Citag%2Csource%2Crequiressl%2Cspc%2Cvprv%2Csvpuc%2Cmime%2Cgir%2Cclen%2Cdur%2Clmt&sig=AOq0QJ8wRgIhAJaoOl-oxcUBLNfOgjUHZhZi2Ffj899etNnZzGEuaQtAAiEA5qW-rEGZvlOaBexaSsHYoA_sjKRS-aAwV5d1xXKcXxA%3D&lsparams=mh%2Cmm%2Cmn%2Cms%2Cmv%2Cmvi%2Cpl%2Cinitcwndbps&lsig=AG3C_xAwRAIgXenuaIMvF0UavqRVsSOIO2aOIoCzrFiAq_1ICwuWkIMCIGOY7qtW9aIa6jbpodD1QBtOd2uzIEOZzMp3g-grN-hH";

const axios = require('axios');
const fs = require('fs');
const prism = require('prism-media');

(async () => {
	let play_link_process = await axios({
		url: fine2,
		method: 'get',
		responseType: 'stream',
		validateStatus: (x) => {return x >=200 && x < 500}
	});

	play_link_process.data.on('data', function(){
		console.log('Received data');
	});

	//play_link_process.data.pipe(fs.createWriteStream('download_test.tst'));

	let time = Date.now();
	const transcoder = new prism.FFmpeg({args: [
		'-analyzeduration', '0',
		'-loglevel', '0',
		'-f', 's16le',
		//'-ar', '48000',
		'-ac', '2',
	]});

	let volumeTransformer = new prism.VolumeTransformer({type: 's16le', volume: 1});

	play_link_process.data.pipe(transcoder).pipe(volumeTransformer)

	console.log(Date.now() - time);
})();