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
var audit = require('./common/audit.js')

var credentials = {user: 'test_user', password: 'test_user', connectString: 'jdetest'};
var numRows = 1;
var startupflag = "";
var hostname = "";

// Expect Start up Flag and Hostname to be passed
startupflag = process.argv[2];
hostname = process.argv[3];
console.log('Arg 1 : ' + startupflag);
console.log('Arg 2 : ' + hostname);

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
	console.log('START MONITORING PDF QUEUE');
	audit.createAuditEntry('pdfmonitor.sh', 'pdfhandler.js', hostname, 'Start Monitoring');
}

oracledb.getConnection( credentials, function(err, connection)
{
	if (err) { console.log('Oracle DB Connection Failure'); return;	}

	var query = "SELECT jcfndfuf2, jcactdate, jcacttime, jcprocessid FROM testdta.F556110 \
                     WHERE jcjobsts = 'D' AND jcsbmdate >= 115215 \
                     AND RTRIM(SUBSTR(jcfndfuf2, 0, INSTR(jcfndfuf2, '_') - 1), ' ') in ( SELECT RTRIM(ppfbdube, ' ') \
                     FROM testdta.F559850 ) ";
	
	conn = connection;
	
	connection.execute(query, [], { resultSet: true }, function(err, result) 
	{
		if (err) { console.log(err.message) };
		fetchRowsFromRS( connection, result.resultSet, numRows, audit );	
	}); 
});


function fetchRowsFromRS(connection, resultSet, numRows, audit)
{
  console.log('IN fetchRowsFromRS');
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
					if (err)
					{
						console.log(err.message);
					}
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
					if (err)
					{
						console.log(err.message);
					}
				});
			}
		});
	} else if (rows.length > 0)
	{
		var record = rows[0];
		var jcfndfuf2 = record[0];
		var jcactdate = record[1];
		var jcacttime = record[2];
		var jcprocessid = record[3];
		var genkey = jcactdate + ' ' + jcacttime;
		console.log(record);
		console.log(record[0]);
		console.log('----------------');

		audit.createAuditEntry(jcfndfuf2, genkey, hostname, 'Start Processing');

        	fetchRowsFromRS(connection, resultSet, numRows, audit);
	}
  });
}






