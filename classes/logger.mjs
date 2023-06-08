import chalk from 'chalk';
import fs from 'fs';
import axios from "axios";
import * as url from 'url';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
import env_variables from '#root/env_data/env.json' assert { type: 'json' };

let report_levels = [], webhook = "";
const exposed_functions = {
  "debug": (msg, sections) =>
  {
    log("DEBUG ", "#26A269", msg, sections);
  },
  "info": (msg, sections) =>
  {
    log(" INFO ", "#7AADEA", msg, sections);
  },
  "notice": (msg, sections) =>
  {
    log("NOTICE", "#2A7BDE", msg, sections);
  },
  "warn": (msg, sections) =>
  {
    log(" WARN ", "#E9AD0C", msg, sections);
  },
  "error": (msg, sections) =>
  {
    log("ERROR ", "#F66151", msg, sections);
  },
  "fatal": (msg, sections) =>
  {
    log("FATAL ", "#C01C28", msg, sections);
  }
}
export default exposed_functions;
//module.exports = exposed_functions;


function log(type, color, msg, sections)
{
  if(msg instanceof Error)
  {
    msg = msg.stack;
  }
  if(typeof msg !== "string")
  {
    exposed_functions.warn("Unknown msg argument received : " + msg);
    return;
  }

  if(sections === undefined) sections = [];
  if(typeof sections !== "object")
  {
    exposed_functions.warn("Unknown sections argument received : " + sections);
    return;
  }
  if(["ERROR ", " WARN ", "FATAL "].includes(type)) report(type, msg, color);

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

async function report(type, msg, color)
{
  if(env_variables.webhook_return == "") return;

  await axios({
    url: env_variables.webhook_return + "?wait=true",
    method: "POST",
    data: {
      username: "BaBot crashs",
      embeds: [{
        title: "BaBot : " + type,
        description: "```" + msg + "```",
        color: parseInt(color.substring(1), 16)
      }]
    }
  }).then(function(){
  }, function() {
  });
}