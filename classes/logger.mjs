import chalk from 'chalk';
import fs from 'fs';
import * as url from 'url';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const exposed_functions = {
  "debug": (sections, msg) =>
  {
    log("DEBUG ", "#26A269", sections, msg);
  },
  "info": (sections, msg) =>
  {
    log(" INFO ", "#7AADEA", sections, msg);
  },
  "notice": (sections, msg) =>
  {
    log("NOTICE", "#2A7BDE", sections, msg);
  },
  "warn": (sections, msg) =>
  {
    log(" WARN ", "#E9AD0C", sections, msg);
  },
  "error": (sections, msg) =>
  {
    log("ERROR ", "#F66151", sections, msg);
  },
  "fatal": (sections, msg) =>
  {
    log("FATAL ", "#C01C28", sections, msg);
  }
}
export default exposed_functions;
//module.exports = exposed_functions;


function log(type, color, sections, msg)
{
  if(typeof sections === "string" && msg === undefined)
  {
    msg = sections;
    sections = [];
  }
  else if(typeof sections === "string" && typeof msg === "object")
  {
    const temp = msg;
    msg = sections;
    sections = temp;
  }
  else if(typeof sections === "string" && typeof msg === "string")
  {
    sections = [{tag: "c", value: sections}];
  }

  let date = new Date();
  let msg_formatted = ('[' + date.getFullYear() + '/' +
    ("0" + (date.getMonth() + 1)).slice(-2) + '/' +
    ("0" + date.getDate()).slice(-2) + ' ' +
    ("0" + date.getHours()).slice(-2) + ':' +
    ("0" + date.getMinutes()).slice(-2) + ':' +
    ("0" + date.getSeconds()).slice(-2) + ']');
  msg_formatted += " - " + type + " - ";

  for(let e of sections)
  {
    msg_formatted += '[' + e.tag + ':' + e.value + ']';
  }
  msg_formatted += sections.length ? ' ' : '';

  let msg_formatted_colored = msg_formatted + chalk.bold(msg) + '\n';
  msg_formatted += msg + '\n';
  

  msg_formatted_colored = chalk.hex(color)(msg_formatted_colored);

  process.stdout.write(msg_formatted_colored);

  fs.appendFile(__dirname + "/../env_data/babot.log", msg_formatted,
    function (err) {
    if (err) throw err;
  });
}