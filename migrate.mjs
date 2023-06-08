import { createClient, commandOptions } from 'redis';
import fsc from "fs";
const fs = fsc.promises;

let redis_client = createClient({
	url: "redis://babot:cpcd6epkJIE4eWck4PE77U8ZjQSx6gro@192.168.9.200"
});
redis_client.on('connect', () => console.log("Connecting to Redis..."));
redis_client.on('ready', () => console.log("Redis connection established"));
redis_client.on('end', () => console.log("End of the Redis connection"));
await redis_client.connect();

for(const e of await fs.readdir("env_data/users"))
{
    console.log("Processing user " + e);
    const file_content = JSON.parse(await fs.readFile("env_data/users/" + e + "/config"));
    if(file_content.golden !== undefined) redis_client.HSET("user:" + e + ":config", "golden", file_content.golden ? "true" : "false");
    if(file_content.limited_troll !== undefined) redis_client.HSET("user:" + e + ":config", "trollDisabled", file_content.limited_troll ? "true" : "false");
    if(file_content.last_vote !== undefined) redis_client.HSET("user:" + e + ":config", "last_vote", file_content.last_vote);
}

for(const e of await fs.readdir("env_data/guilds"))
{
    console.log("Processing guild " + e);
    const file_content = JSON.parse(await fs.readFile("env_data/guilds/" + e + "/config"));
    if(file_content.golden !== undefined) redis_client.HSET("guild:" + e + ":config", "golden", file_content.golden === true ? "true" : "false");
    if(file_content.trollDisabled !== undefined) redis_client.HSET("guild:" + e + ":config", "trollDisabled", file_content.trollDisabled ? "true" : "false");
    if(file_content.locale !== undefined) redis_client.HSET("guild:" + e + ":config", "locale", file_content.locale);

    if(file_content.permissions)
    {
        for(const permission of Object.keys(file_content.permissions))
        {
            redis_client.HSET("guild:" + e + ":permissions", permission, file_content.permissions[permission] ? "true" : "false");
        }
    }

    if(fsc.existsSync("env_data/guilds/" + e + "/soundboard"))
    {
        for(const sound of await fs.readdir("env_data/guilds/" + e + "/soundboard"))
        {
            redis_client.HSET("guild:" + e + ":soundboard", sound.split(".")[0], await fs.readFile("env_data/guilds/" + e + "/soundboard/" + sound));
        }
    }
}