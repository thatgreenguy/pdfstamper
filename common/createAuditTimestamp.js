//
//
//
var ds = '-';
var ts = ':';
var pad = '0';
var d = new Date();
var timestamp = "";

timestamp = d.getFullYear() + ds + (pad + d.getMonth()).slice(-2) + ds + (pad + d.getDay()).slice(-2)
		+ ' T ' + (pad + d.getHours()).slice(-2) + ts + (pad + d.getMinutes()).slice(-2) + ts
		+ (pad + d.getSeconds()).slice(-2) + ' ' + d.getTime();

console.log(timestamp);

