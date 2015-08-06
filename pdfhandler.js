// pdfhandler.js
//
// Description		: Query JDE for recent completed jobs that require post PDF handling.
// Author		: Paul Green
// Dated		: 2015-08-03
//
// Synopsis
// --------
// Called from pdfhandler.sh on startup and when changes are detected in the monitored JDE output queue.
// Performs a query on the JDE Job Control file looking for recently completed PDF output files where the UBE name 
// matches report names that require post PDF processing.
// Use date and time from last entry in the Audit file to keep the query light and only consider recent PDF files not yet processed
// by any other containers that may be running.

var oracledb = require('oracledb');
var audit = require('./common/audit.js');
var lock = require('./common/lock.js');

var credentials = {user: 'test_user', password: 'test_user', connectString: 'jdetest'};
var numRows = 1;
var startupflag = "";
var hostname = "";

// Expect Start up Flag and Hostname to be passed
var startupflag = process.argv[2];
var hostname = process.argv[3];

// If hostname (container Id) not passed then Abort with error - something seriously wrong.

if (typeof(hostname) === 'undefined' || hostname === '') {
	console.log(' ');
	console.log('--------- ERROR ----------');
	console.log('pdfhandler.js needs 2 parameters: (1) StartUp flag and (2) Hostname to be passed');
	console.log('These should always be passed by calling program pdfmonitor.sh - something is wrong!');
	process.exit(1);
}

// If Container has just started then record fact in Audit log

if (startupflag === 'S') {
	console.log('---------- START MONITORING PDF QUEUE -----------');
	audit.createAuditEntry('pdfmonitor.sh', 'pdfhandler.js', hostname, 'Start Monitoring');
}


// Get Oracle DB connection 
oracledb.getConnection( credentials, function(err, connection)
{
	if (err) { console.log('Oracle DB Connection Failure'); return;	}

	// Only interested in processing PDF files that have appeared in the PrintQueue since last run of this process
	// This query grabs the last date and time from Audit Log first as starting point for processing
	queryJdeAuditLog(connection);

});



// Need date and time of last processed PDF file by this program as starting point for this process run  

function queryJdeAuditLog(connection) 
{
	console.log('>>>>> Query the F559859 <<<<<');

	var query = "SELECT paupmj, paupmt FROM testdta.F559859 ORDER BY pasawlatm DESC";

	connection.execute(query, [], { resultSet: true }, function(err, result) 
	{
		if (err) { console.log(err.message) };
		fetchRowsFromJdeAuditLogRS( connection, result.resultSet, numRows, audit );	
	}); 
}


// Process results from Audit Log Query but only actually getting one record here
 
function fetchRowsFromJdeAuditLogRS(connection, resultSet, numRows, audit)
{
  resultSet.getRows( numRows, function(err, rows)
  {
   	if (err)
	{
        	resultSet.close(function(err)
		{
			if (err)
			{
				console.log(err.message);
				connection.release(function(err)
				{
					if (err) { console.log(err.message); }
				});
			}
		}); 
      	} else if (rows.length == 0)
	{
		resultSet.close(function(err)
		{
			if (err)
			{
				console.log(err.message);
				connection.release(function(err)
				{
					if (err) { console.log(err.message); }
				});
			}
		});
	} else if (rows.length > 0)
	{
		
		 console.log('>>>>> Start Processing results from Query of F559859 <<<<<');

		// Last audit entry retrieved
		// Process continues by querying the JDE Job Control Master file for eligible PDF's to process

		var record = rows[0];
		console.log('##########Only want 1st record so here it is');
		console.log ('##########' + record);
		queryJdeJobControl(connection, record);
		
	}
  });
}



// Query the JDE Job Control Master file to fetch all PDF files generated since last audit entry
// Only select PDF jobs that are registered for post PDF processing e.g. R5542565 Invoice Print

function queryJdeJobControl(connection, record) 
{
	console.log('>>>>> Query the F556110 <<<<<');
	console.log('Use this date and time to restrict:' + record);

	var query = "SELECT jcfndfuf2, jcactdate, jcacttime, jcprocessid FROM testdta.F556110 WHERE jcjobsts = 'D'";
	query += " AND jcactdate >= ";
	query += record[0];
	query += " AND jcacttime >= ";
	query += record[1];
	query += " AND RTRIM(SUBSTR(jcfndfuf2, 0, INSTR(jcfndfuf2, '_') - 1), ' ') in ( SELECT RTRIM(ppfbdube, ' ') FROM testdta.F559850 ) ";

	console.log(query);

	connection.execute(query, [], { resultSet: true }, function(err, result) 
	{
		if (err) { console.log(err.message) };
		fetchRowsFromRS( connection, result.resultSet, numRows, audit );	
	}); 
}


// Process query results for JDE Job Control Master file could be none, one or many
// Could be one or many results here but 

function fetchRowsFromRS(connection, resultSet, numRows, audit)
{
  console.log('>>>>> Start Processing results from Query of F556110 <<<<<');
  resultSet.getRows( numRows, function(err, rows)
  {
   	if (err)
	{
        	resultSet.close(function(err)
		{
			if (err)
			{
				console.log(err.message);
				connection.release(function(err)
				{
					if (err) { console.log(err.message); }
				});
			}
		}); 
      	} else if (rows.length == 0)
	{
		resultSet.close(function(err)
		{
			if (err)
			{
				console.log(err.message);
				connection.release(function(err)
				{
					if (err) { console.log(err.message); }
				});
			}
		});
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
			console.log(record[0] + ' >>>>> Already Processed - ignoring.');
		} else {
			console.log(record[0] + ' >>>>> Processing Now.');
			// This PDF file has not yet been processed and we have the lock so process it now.	

			processPDF(record);
		}

		// Always remove lock
		
		lock.removeLock(record, hostname);
		console.log(record[0] + ' >>>>> Lock released.....');

	}); 
}




// Establish exclusivity then process PDF file

function processPDF(record) 
{

	var jcfndfuf2 = record[0];
	var jcactdate = record[1];
	var jcacttime = record[2];
	var jcprocessid = record[3];
	var genkey = jcactdate + ' ' + jcacttime;


	// Lock in place so go ahead and write Audit entry then process this PDF file
	console.log(record[0] + ' >>>>> Write Audit record');
	audit.createAuditEntry(jcfndfuf2, genkey, hostname, 'Start Processing');
		
	console.log(record[0] + ' >>>>> Copy PDF file from JDE PrintQueue to CENTOS for processing');

	console.log(record[0] + ' >>>>> Apply Logo');

	console.log(record[0] + ' >>>>> Copy PDF with Logo back to JDE PrintQueue');

}




