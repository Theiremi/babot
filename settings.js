const fsc = require('fs');
const fs = fsc.promises;

module.exports = class Settings {
	constructor()
	{
		if(!fsc.existsSync(process.cwd() + '/env_data/users'))
		{
			fsc.mkdirSync(process.cwd() + '/env_data/users')
		}

		if(!fsc.existsSync(process.cwd() + '/env_data/guilds'))
		{
			fsc.mkdirSync(process.cwd() + '/env_data/guilds')
		}
	}

	async get(id, type, file)
	{
		let folder = ""
		if(type === 0) folder = process.cwd() + '/env_data/users/'
		else if(type === 1) folder = process.cwd() + '/env_data/guilds/'
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
		if(type === 0) folder = process.cwd() + '/env_data/users/'
		else if(type === 1) folder = process.cwd() + '/env_data/guilds/'
		else return false;

		if(!fsc.existsSync(folder + id)) await fs.mkdir(folder + id);

		if(!['config', 'xp'].includes(file)) return false;
		await fs.writeFile(folder + id + '/' + file, JSON.stringify(content));

		return true;
	}

	async canTroll(from, to)
	{
		let to_config = await this.get(to, 0, 'config');
		if(to_config === false) return false;

		if(to_config.limited_troll)
		{
			let from_level = await this.level(from);
			if(from_level >= 2)
			{
				return true;
			}
			else return false;
		}
		else
		{
			return true;
		}
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

	async pointsCount(id)
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
	}

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

	async level(id)
	{
		let config = await this.get(id, 0, 'config');
		if(config === false) return false;
		if(config.golden)
		{
			return 3;
		}

		let total_xp = await this.pointsCount(id);
		if(total_xp === false) return false;
		if(total_xp >= 1000)
		{
			return 2;
		}
		if(total_xp >= 500)
		{
			return 1;
		}
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