import { createClient, commandOptions } from 'redis';
import fs from "fs/promises";

let redis_client = createClient({
	url: "redis://babot:cpcd6epkJIE4eWck4PE77U8ZjQSx6gro@192.168.9.200"
});
redis_client.on('connect', () => console.log("Connecting to Redis..."));
redis_client.on('ready', () => console.log("Redis connection established"));
redis_client.on('end', () => console.log("End of the Redis connection"));
await redis_client.connect();

for(const e of await fs.readdir("."))
{
    console.log("Adding file " + e);
    redis_client.HSET("global:soundboard", e.split(".")[0], await fs.readFile(e));
    //await fs.writeFile('temp_' + e, await redis_client.HGET(commandOptions({ returnBuffers: true }), "global:soundboard", e.split(".")[0]));
}
