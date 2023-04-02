import si from 'systeminformation';

console.log(Date.now() / 1000)
console.log(Math.round((await si.mem()).active/10000000) / 100)
console.log(Date.now() / 1000)
console.log(Math.round((await si.mem()).total/10000000) / 100)
console.log(Date.now() / 1000)
console.log(Math.round((await si.currentLoad()).currentLoad * 10) / 10)
console.log(Date.now() / 1000)
console.log(Math.round((await si.cpuTemperature()).main * 10) / 10)
console.log(Date.now() / 1000)
console.log(Math.round((await si.cpuTemperature()).max * 10) / 10)
console.log(Date.now() / 1000)