const fsc = require('fs');
const fs = fsc.promises;
const path = require("path");
const AdmZip = require('adm-zip');
const root = path.join(__dirname, '..');
const babot_env = require('#root/env_data/env.json');

module.exports = class Settings {
	constructor()
	{
		if(!fsc.existsSync(root + '/env_data/users'))
		{
			fsc.mkdirSync(root + '/env_data/users')
		}

		if(!fsc.existsSync(root + '/env_data/guilds'))
		{
			fsc.mkdirSync(root + '/env_data/guilds')
		}
	}

	async get(id, type, file)
	{
		let folder = ""
		if(type === 0) folder = root + '/env_data/users/'
		else if(type === 1) folder = root + '/env_data/guilds/'
		else return false;

		if(!fsc.existsSync(folder + id)) await fs.mkdir(folder + id);

		if(!['config', 'xp'].includes(file)) return false;
		if(!fsc.existsSync(folder + id + '/' + file)) await fs.writeFile(folder + id + '/' + file, "{}");

		let file_content = await fs.readFile(folder + id + '/' + file);
		if(!isJsonString(file_content)) return {};
		return JSON.parse(file_content);
	}

	async set(id, type, file, content)
	{
		let folder = ""
		if(type === 0) folder = root + '/env_data/users/'
		else if(type === 1) folder = root + '/env_data/guilds/'
		else return false;

		if(!fsc.existsSync(folder + id)) await fs.mkdir(folder + id);

		if(!['config', 'xp'].includes(file)) return false;
		await fs.writeFile(folder + id + '/' + file, JSON.stringify(content));

		return true;
	}

	async addTrollSong(id, file, content)
	{
		const folder = root + '/env_data/guilds/'

		if(!fsc.existsSync(folder + id)) await fs.mkdir(folder + id);
		if(!fsc.existsSync(folder + id + '/soundboard/')) await fs.mkdir(folder + id + '/soundboard/');

		await fs.writeFile(folder + id + '/soundboard/' + file, content);
		return true;
	}

	async erase(id, type)
	{
		let folder = ""
		if(type === 0) folder = root + '/env_data/users/'
		else if(type === 1) folder = root + '/env_data/guilds/'
		else return false;

		if(!fsc.existsSync(folder + id)) return true;

		let erase_command = await fs.rm(folder + id, {recursive: true}).catch(() => false);
		return erase_command !== false ? true : false;
	}

	async compress(id, type)
	{
		return new Promise(function(resolve, reject) {
			let folder = ""
			if(type === 0) folder = root + '/env_data/users/'
			else if(type === 1) folder = root + '/env_data/guilds/'
			else {
				reject(false);
				return;
			}

			if(!fsc.existsSync(folder + id)) {
				reject(false);
				return;
			}

			let archive = new AdmZip();
			archive.addLocalFolder(folder + id, '');
			archive.toBuffer(resolve, reject);
		});
	}

	async addXP(id, quantity)
	{
		let xp = await this.get(id, 0, 'xp');
		if(xp === false) return false;

		let today = Math.floor(Date.now() / (1000*86400));
		if(xp[today]) xp[today].points += quantity
		else xp[today] = {points: quantity};
		return this.set(id, 0, 'xp', xp)
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

	async XPCount(id)
	{
		let xp = await this.get(id, 0, 'xp');
		if(xp === false) return false;

		let total_xp = 0;
		for(let e of Object.values(xp))
		{
			if(e.points) total_xp += e.points;
		}

		return total_xp
	}

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

	async leaderboardPosition(id)
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
	}

	async canTroll(guild, to_user)
	{
		let guild_config = await this.get(guild, 1, 'config');
		if(guild_config === false) return false;

		if(guild_config.trollDisabled)
		{
			return 1;
		}

		let to_config = await this.get(to_user, 0, 'config');
		if(to_config === false) return false;

		if(to_config.limited_troll)
		{
			return 2;
		}
		else
		{
			return true;
		}
	}

	async isGuildGolden(id)
	{
		let config = await this.get(id, 1, 'config');
		if(config === false) return false;

		if(config.golden)
		{
			for(let e of config.golden)
			{
				if(e === true) return true;
				let user_config = await this.get(e, 0, 'config');
				if(user_config !== false)
				{
					if(user_config.extended_servers)
					{
						if(user_config.extended_servers.includes(id))
						{
							return true;
						}
					}
				}
			}
		}
		return false;
	}

	async isUserGolden(id)
	{
		let config = await this.get(id, 0, 'config');
		if(config === false) return false;
		if(config.golden) return true;
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
		let config = await this.get(user, 0, 'config');
		if(config === false) return false;

		if(config.last_vote !== undefined)
		{
			if(config.last_vote + 86400*3 > Math.round(Date.now() / 1000))
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
}


function isJsonString(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}