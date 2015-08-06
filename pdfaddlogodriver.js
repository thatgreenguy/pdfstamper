// pdfaddlogodriver.js 

var hummus = require('hummus');
var exec = require('child_process').exec;

// Create writer and then a copying context so the number of pages can be determined
var pdfWriter = hummus.createWriterToModify('/src/shareddata/R5542565_PJGTST801_181312_PDF',{modifiedFilePath:'/src/shareddata/well.pdf'});
var cmd = "";

// create a copying context, so we can copy the page dictionary, and modify its contents + resources dict
var cpyCxt = pdfWriter.createPDFCopyingContextForModifiedFile();
var pageCount = cpyCxt.getSourceDocumentParser().getPagesCount()-1;
cpyXct = null;
pdfWriter = null;

// Show Page Cuont
console.log("Pages : " + pageCount);

for ( var i = 0; i < pageCount ; i++ ) {

	// console.log("Page : " + i);
	cmd = "node /src/pdfaddlogo.js " + i;
	console.log(cmd);

	exec(cmd, function(err, stdo, stde) {});


}

