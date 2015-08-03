// doit 


var pdf = require('pdfkit');
var fs = require('fs');

var doc = new pdf();

doc.pipe(fs.createWriteStream('../data/out/test1.pdf'));

doc.text('Here is a test...');

doc.end();

