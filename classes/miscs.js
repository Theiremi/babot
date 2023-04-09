module.exports = {
	asyncTimeout: async (fun, time) =>
	{
	  return Promise.race([
	    fun,
	    new Promise(async (resolve, reject) => {setTimeout(reject, time)})
	  ])
	},

	isJsonString: (str) => {
	    try {
	        JSON.parse(str);
	    } catch (e) {
	        return false;
	    }
	    return true;
	},

	sleep: (ms) => {
	  return new Promise((resolve) => {
		setTimeout(resolve, ms);
	  });
	},

	importIfExists: async (...modules) => {
	  for (let m of modules) {
	    try {
	      return await import(m);
	    } catch (error) {
	      // pass and try next file
	    }
	  }
	  throw('None of the provided modules exist.')
	}
}