
// process record.............

	} else if (rows.length > 0)
	{

		// Query read has returned a record so we have a valid eligible PDF file to process

		var record = rows[0];

		// Multiple pdfhandler processes could be running so need to establish exclusive rights to 
		// process this PDF file - if not simply move onto next eligible PDF file to process.

		lock.gainExclusivity(record, hostname, connection, processLockedPdfFile);		
		
		// Read next record 

        	fetchRowsFromRS(connection, resultSet, numRows, audit);
	}
  });
}




// Called when exclusive lock has been successfully placed to process the PDF file

function processLockedPdfFile(connection, record) 
{

	console.log(record[0] + ' >>>>> Lock established');

	// Check this PDF file has definitely not yet been processed by any other pdfHandler instance
	// that may be running concurrently

	var query = "SELECT COUNT(*) FROM testdta.F559859 WHERE pafndfuf2 = '";
	query += record[0] + "'";

	connection.execute(query, [], { }, function(err, result) 
	{
		if (err) { console.log(err.message); return; };

		var countRec = result.rows[0];
		var count = countRec[0];

		if ( count > 0 ) {
			console.log(record[0] + ' >>>>> Already Processed - Releasing Lock.');
			lock.removeLock(record, hostname);

		} else {
			console.log(record[0] + ' >>>>> Processing Now.');
			// This PDF file has not yet been processed and we have the lock so process it now.	

			processPDF(record);
		}

	}); 
}




// Exclusive use / lock of PDF file established so free to process the file here.

function processPDF(record) 
{

	var jcfndfuf2 = record[0];
	var jcactdate = record[1];
	var jcacttime = record[2];
	var jcprocessid = record[3];
	var genkey = jcactdate + ' ' + jcacttime;
	var parms = null;

	// Make parameters available to any function in series
	parms = {'jcfndfuf2': jcfndfuf2, 'record': record, 'genkey': genkey, 'hostname': hostname};

	async.series([
			function (cb) { createBackupDir(parms, cb) }, 
			function (cb) { backupPdfFile(parms, cb) }, 	
			function (cb) { copyPdfToWorkDir(parms, cb) }, 
			function (cb) { applyLogo(parms, cb) }, 
			function (cb) { replaceJdePdfWithLogoVersion(parms, cb) },
			function (cb) { createAuditEntry(parms, cb) },
			function (cb) { removeLock(parms, cb) }
			], function (cb) { allDone(parms, cb) }
	);


}




function createBackupDir(parms, cb) {

	var cmd = 'mkdir -p /home/shareddata/backup';

	console.log('Processing PDF ' + parms.jcfndfuf2 + ' - Create Backup Directory');
	console.log(cmd);
	exec(cmd, function(error, stdout, stderr) {
		if (error !== null) {
				cb(error, cmd + ' - Failed');
			} else {
				cb(null, cmd + ' - Done');
			}
		}
	);

}



// Make a backup copy of the original JDE PDF file - just in case we need the untouched original
// These can be purged inline with the normal JDE PrintQueue - currentlt PDF's older than approx 2 months

function backupPdfFile(parms, cb) {

	var cmd = 'cp /home/pdfdata/' + parms.jcfndfuf2 + ' /home/shareddata/backup/' + parms.jcfndfuf2;

	console.log('Processing PDF ' + parms.jcfndfuf2 + ' - Copy JDE PDF file to Backup Directory');
	console.log(cmd);
	exec(cmd, function(error, stdout, stderr) {
		if (error !== null) {
				cb(error, cmd + ' - Failed');
			} else {
				cb(null, cmd + ' - Done');
			}
		}
	);

}



// Make a working copy of the original JDE PDF file - this will have logos added to each page
 
function copyPdfToWorkDir(parms, cb) {

	var cmd = 'cp /home/pdfdata/' + parms.jcfndfuf2 + ' /home/shareddata/' + parms.jcfndfuf2.trim() + '_ORIGINAL';

	console.log('Processing PDF ' + parms.jcfndfuf2 + ' - Copy JDE PDF file to work Directory');
	console.log(cmd);
	exec(cmd, function(error, stdout, stderr) {
		if (error !== null) {
				cb(error, cmd + ' - Failed');
			} else {
				cb(null, cmd + ' - Done');
			}
		}
	);
}



// Apply logo to working copy of JDE PDF file

function applyLogo(parms, cb) {

	var pdfInput = '/home/shareddata/' + parms.jcfndfuf2.trim() + '_ORIGINAL';
	var pdfOutput = '/home/shareddata/' + parms.jcfndfuf2;
	var cmd = 'node ./src/pdfaddlogo.js ' + pdfInput + ' ' + pdfOutput ;

	console.log('Processing PDF ' + parms.jcfndfuf2 + ' - Apply Logo to JDE PDF in Work Directory');
	console.log(cmd);
	exec(cmd, function(error, stdout, stderr) {
		if (error !== null) {
				cb(error, cmd + ' - Failed');
			} else {
				cb(null, cmd + ' - Done');
			}
		}
	);
}



// Replace original JDE PDF File in PrintQueue with amended PDF incuding logos

function replaceJdePdfWithLogoVersion(parms, cb) {

	var pdfWithLogos = '/home/shareddata/' + parms.jcfndfuf2;
	var jdePrintQueue = '/home/pdfdata/' + parms.jcfndfuf2;
	var cmd = 'mv ' + pdfWithLogos + ' ' + jdePrintQueue;

	console.log('Processing PDF ' + parms.jcfndfuf2 + ' - Replace JDE PDF with modified Logo version');
	console.log(cmd);
 	exec(cmd, function(error, stdout, stderr) {
		if (error !== null) {
				cb(error, cmd + ' - Failed');
			} else {
				cb(null, cmd + ' - Done');
			}
		}
	);
}




function createAuditEntry(parms, cb) {

	console.log('Processing PDF ' + parms.jcfndfuf2 + ' - Write Audit Record');

	// Cretae Audit entry for this Processed record
	audit.createAuditEntry(parms.jcfndfuf2, parms.genkey, parms.hostname, 'PROCESSED - LOGO');

	cb(null, 'Lock Released');

}


function removeLock(parms, cb) {

	console.log('Processing PDF ' + parms.jcfndfuf2 + ' - Release Lock');
	lock.removeLock(parms.record, parms.hostname);
	console.log('Processing PDF ' + parms.jcfndfuf2 + ' - Lock Released');

	cb(null, 'Lock Released');

}


function allDone(err, results) {

	console.log('ALL DONE');

}


