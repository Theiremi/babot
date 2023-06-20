'use strict';

import logger from '#classes/logger.mjs';
import AdmZip from 'adm-zip';
import { createClient, commandOptions } from 'redis';

export default class Settings {
	#initialized = false;
	redis_client;
	constructor(redis_addr)
	{
		//redis[s]://[[username][:password]@][host][:port][/db-number]
		this.redis_client = createClient({
			url: redis_addr
		});
		this.redis_client.on('connect', () => logger.info("Connecting to Redis..."));
		this.redis_client.on('ready', () => logger.info("Redis connection established"));
		this.redis_client.on('end', () => logger.warn("End of the Redis connection"));
		this.redis_client.on('reconnecting', () => logger.notice("Reconnecting to Redis..."));
		this.redis_client.on('error', logger.error);
	}

	async init()
	{
		await this.redis_client.connect();
	}

	parse_in(data)
	{
		if(data === true)  return "true";
		if(data === false) return "false";
		return data;
	}

	parse_out(data)
	{
		if(data === "true")  return true;
		if(data === "false") return false;
		return data;
	}

	async hGet(id, field)
	{
		return this.parse_out(await this.redis_client.HGET(id, field));
	}

	async hGetBuffer(id, field)
	{
		return await this.redis_client.HGET(commandOptions({ returnBuffers: true }), id, field);
	}

	async hGetAll(id)
	{
		let return_array = await this.redis_client.HGETALL(id);
		for(let i of Object.keys(return_array))
		{
			return_array[i] = this.parse_out(return_array[i]);
		}
		return return_array;
	}

	async hSet(id, field, content)
	{
		return await this.redis_client.HSET(id, field, this.parse_in(content));
	}

	async hDel(id, field, content)
	{
		return await this.redis_client.HDEL(id, field);
	}

	async hLen(id)
	{
		return await this.redis_client.HLEN(id);
	}

	async hKeys(id)
	{
		return await this.redis_client.HKEYS(id);
	}

	async hExists(id, field)
	{
		return await this.redis_client.HEXISTS(id, field);
	}

	async addTrollSong(id, file, content)
	{
		return this.hSet(`guild:${id}:soundboard`, file, content);
	}

	async erase(id)
	{
		if(typeof id !== "string" || id.length <= 0) return false;

		for(const key of this.redis_client.scanIterator({ MATCH: `${id}*` }))
		{
			await this.redis_client.DEL(key);
		}
		return;
	}

	async compress(id)
	{
		return new Promise((async function(resolve, reject) {
			if(typeof id !== "string" || id.length <= 0) return false;

			const archive = new AdmZip();
			for await (const key of this.redis_client.scanIterator({ MATCH: `*:${id}:*`, COUNT: 100000 }))
			{
				archive.addFile(key.split(':').splice(-1)[0], Buffer.from(JSON.stringify(await this.hGetAll(key))));
			}

			archive.toBuffer(resolve, reject);
		}).bind(this));
	}

	async addXP(id, quantity)
	{
		/*let xp = await this.get(id, 0, 'xp');
		if(xp === false) return false;

		let today = Math.floor(Date.now() / (1000*86400));
		if(xp[today]) xp[today].points += quantity
		else xp[today] = {points: quantity};
		return this.set(id, 0, 'xp', xp)*/
	}

	/*async pointsCount(id)
	{
		let xp = await this.get(id, 0, 'xp');
		if(xp === false) return false;

		let today = Math.floor(Date.now() / (1000*86400));
		let total_xp = 0;
		for(let i = today-6; i <= today; i++)
		{
			if(xp[i]) total_xp += xp[i].points;
		}

		return total_xp
	}*/

	/*async XPCount(id)
	{
		let xp = await this.get(id, 0, 'xp');
		if(xp === false) return false;

		let total_xp = 0;
		for(let e of Object.values(xp))
		{
			if(e.points) total_xp += e.points;
		}

		return total_xp
	}*/

	/*async level(id)
	{
		let config = await this.get(id, 0, 'config');
		if(config === false) return false;
		if(config.golden)
		{
			return 3;
		}

		let total_xp = await this.pointsCount(id);
		if(total_xp === false) return false;
		if(total_xp >= 2500)
		{
			return 2;
		}
		if(total_xp >= 750)
		{
			return 1;
		}
		return 0;
	}*/

	/*async leaderboardPosition(id)
	{
		let leaderboard = [];
		let users_profiles = await fs.readdir(root + '/env_data/users/')
		for(let e of users_profiles)
		{
			let xp_user = await this.XPCount(e);
			if(xp_user !== false)
			{
				leaderboard.push([e, xp_user]);
			}
		}
		leaderboard.sort((a, b) => b[1]-a[1]);
		leaderboard = leaderboard.map(x => x[0]);

		let position = leaderboard.indexOf(id)
		if(position !== -1)
		{
			return position+1;
		}
		return false;
	}*/

	async canTroll(guild, to_user)
	{
		const trollDisabled = await this.hGet(`guild:${guild}:config`, 'trollDisabled');

		if(trollDisabled)
		{
			return 1;
		}

		const trollDisabledUser = await this.hGet(`user:${to_user}:config`, 'trollDisabled');

		if(trollDisabledUser)
		{
			return 2;
		}
		else
		{
			return true;
		}
	}

	async addTrollSong(guild_id, name, content)
	{
		this.hSet(`guild:${guild_id}:soundboard`, name, content);
	}

	async isGuildGolden(id)
	{
		const golden = await this.hGet(`guild:${id}:config`, 'golden');

		if(golden)
		{
			if(golden === true) return true;
			const golden_user = await this.hGet(`guild:${golden}:config`, 'golden');
			if(golden_user === true)
			{
				return true;
			}
		}
		return false;
	}

	async isUserGolden(id)
	{
		const golden_user = await this.hGet(`guild:${id}:config`, 'golden');
		if(golden_user) return true;
		return false;
	}

	async isGolden(guild, user)
	{
		if(await this.isGuildGolden(guild)) return true;
		if(await this.isUserGolden(user)) return true;
		return false;
	}

	async haveVoted(user)
	{
		return true;
		const last_vote = await this.hGet(`guild:${id}:config`, 'last_vote');

		if(last_vote !== undefined)
		{
			if(last_vote + 86400*3 > Math.round(Date.now() / 1000))
			{
				return true;
			}
		}
		return false;
	}

	async profile(user)
	{
		return 0;
	}

	async log_actions()
	{

	}
}


function isJsonString(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}