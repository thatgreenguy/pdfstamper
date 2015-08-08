// 
var async = require('async');
var doze = require('sleep');
var sys = require('sys');
var exec = require('child_process').exec;


var cmd_backupdir = 'mkdir -p /home/shareddata/backup';
var cmd_copypdfbackup = 'cp /home/pdfdata/R5542565_FRXSOS01_181525_PDF /home/shareddata/backup/R5542565_FRXSOS01_181525_PDF';
var cmd_copypdfwork = 'cp /home/pdfdata/R5542565_FRXSOS01_181525_PDF /home/shareddata/R5542565_FRXSOS01_181525_PDF';

//exec(cmd_backupdir, handleResults);
//exec(cmd_copypdfbackup, handleResults);
//exec(cmd_copypdfwork, handleResults);

async.series([step1, step2, step3, step4], alldone);
console.log('well im here!!!!!!! and exiting');



// Function definitions
function handleResults(error, stdout, stdin) 
{
	sys.print('stdout: ' + stdout);
	sys.print('stderr: ' + error);
	if (error !== null) 
	{
		console.log('exec error: ' + error);
	}
}


function step1(done) {

	console.log('Step 1');
	done(null, 'done 1');	
	
}

function step2(done) {
	
	console.log('Step 2 now sleep 5');
	doze.sleep(5);
	done(null, 'done 2');	
}

function step3(done) {

	console.log('Step 3');	
	done(null, 'done 3');	
}

function step4(done) {

	console.log('Step 4');
	done(null, 'done 4');	
	
}

function alldone(err, result) {

	console.log('---- ALL done----');
	console.log(result);
}
