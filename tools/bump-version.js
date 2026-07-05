const fs = require("fs");
const path = require("path");

function pad2(value) {
  return String(value).padStart(2, "0");
}

const now = new Date();
const yyyy = String(now.getFullYear());
const mm = pad2(now.getMonth() + 1);
const dd = pad2(now.getDate());
const hh = pad2(now.getHours());
const min = pad2(now.getMinutes());

const version = `${yyyy}.${mm}.${dd}.${hh}${min}`;
const build = `${yyyy}${mm}${dd}-${hh}${min}`;
const versionPath = path.resolve(__dirname, "..", "assets", "version.js");

const content = `window.APP = {
  version: "${version}",
  build: "${build}"
};

window.APP_VERSION = window.APP.version;
`;

fs.writeFileSync(versionPath, content, "utf8");
console.log(version);
