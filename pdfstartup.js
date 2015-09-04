// pdfmonitor.js
//
// Description		: Monitor the JDE output queue and whenever a change (new report) is detected trigger 
//			: further processing checks.
// Author		: Paul Green
// Dated		: 2015-08-03
//
// Synopsis
// --------
// This program starts when the container starts and constantly monitors the JDE PDF output queue for change.
// This program replaces the old style shell monitor program as use of sshfs is too heavy on cpu resource on the AIX
// enterprise server due to encryption overhead.
// When a change is detected control is passed to the pdfhandler which performs further checks to see if any logo related
// processing is required.
// This process uses date from last entry in the Audit file to keep the query count light - the query count is taken
// frequently and when a change is detected that triggers further processing. 
// The query uses the last date from the audit file to limit the query count - Audit entries are written on startup and
// whenever a PDF file is procesed - the count is not important it is simply a mechanism to detect change i.e. new 
// PDF's arriving in the JDE output queue)

var oracledb = require("oracledb");
var logger = require("./common/logger");
var audit = require("./common/audit.js");
var lock = require("./common/lock.js");
var async = require("async");
var exec = require("child_process").exec;

var numRows = 1;
var pollInterval = 2;
var serverTimeOffset = 5;

var credentials = {user: process.env.DB_USER, password: process.env.DB_PWD, connectString: process.env.DB_NAME};
var hostname = process.env.HOSTNAME;

var previousPdf = "";

// Docker container Hostname is used for Audit logging and lock file control so if not available there is a problem.

if (typeof(hostname) === "undefined" || hostname === "") {
    logger.error("pdfmonitor.js needs environment variable Hostname to be defined");
    logger.error("This should always be available in docker containers - something is wrong - Aborting!");
    process.exit(1);
} else {
    logger.info("Docker Container Hostname is : " + hostname);
}

// If Container has just started then record fact in Audit log

logger.info("---------- START MONITORING PDF QUEUE -----------");
audit.createAuditEntry('pdfmonitor', 'pdfstartup.js', hostname, 'Start Monitoring');


// Get Oracle DB connection to re-use 
oracledb.getConnection( credentials, function(err, connection)
{
	if (err) { logger.error("Oracle DB Connection Failure"); return;	}

	// Only interested in processing PDF files that have appeared in the PrintQueue since last run of this process
	// This query grabs the last date from Audit Log first as starting point for processing
	recursive(connection, logger, credentials);
});

// Check, process, sleep briefly then call itself to repeat
function recursive(connection, logger, credentials) {
    var begin = new Date();
    
    logger.info("Checking initiated : " + begin);

    queryJdeAuditLog(connection, begin);

};



// Need date and time of last processed PDF file by this program as starting point for this process run  

function queryJdeAuditLog(connection, begin) 
{

	var query = "SELECT paupmj, paupmt, pasawlatm FROM testdta.F559859 WHERE PAFNDFUF2 <> 'pdfmonitor' ORDER BY pasawlatm DESC";

	connection.execute(query, [], { resultSet: true }, function(err, result) 
	{
		if (err) { logger.error(err.message) };
		fetchRowsFromJdeAuditLogRS( connection, result.resultSet, numRows, audit, begin );	
	}); 
}


// Process results from Audit Log Query but only actually getting one record here
 
function fetchRowsFromJdeAuditLogRS(connection, resultSet, numRows, audit, begin)
{
  resultSet.getRows( numRows, function(err, rows)
  {
   	if (err)
	{
        	resultSet.close(function(err)
		{
			if (err)
			{
				logger.error(err.message);
				connection.release(function(err)
				{
					if (err) { logger.error(err.message); }
				});
			}
		}); 
      	} else if (rows.length == 0)
	{
		resultSet.close(function(err)
		{
			if (err)
			{
				logger.error(err.message);
				connection.release(function(err)
				{
					if (err) { logger.error(err.message); }
				});
			}
		});
	} else if (rows.length > 0)
	{
		
		// Last audit entry retrieved
		// Process continues by querying the JDE Job Control Master file for eligible PDF's to process

		var record = rows[0];
		logger.debug(record);
		queryJdeJobControl(connection, record, begin);
		
	}
  });
}



// Query the JDE Job Control Master file to fetch all PDF files generated since last audit entry
// Only select PDF jobs that are registered for post PDF processing e.g. R5542565 Invoice Print

function queryJdeJobControl(connection, record, begin) 
{

	// Issue with server clocks JDE and Linux being slightly out - approx 2.5 minutes.
	// This will be rectified but in case it happens again or times drift slightly in future 
	// Adjust query search date and time backwards by Offset - say 5 minutes - to allow for slightly different clock times
	// and to ensure a PDF completing on JDE when this query runs is still included

	var auditTimestamp = record[2];
	var result = audit.adjustTimestampByMinutes(auditTimestamp, - serverTimeOffset);
	logger.info(result);
	var jdedate = result.jdeDate;
	var jdetime = result.jdeTime;

	var query = "SELECT jcfndfuf2, jcactdate, jcacttime, jcprocessid FROM testdta.F556110 ";
	query += " WHERE jcjobsts = 'D' AND jcfuno = 'UBE' AND jcactdate >= ";
	query += jdedate;
	query += " AND RTRIM(SUBSTR(jcfndfuf2, 0, INSTR(jcfndfuf2, '_') - 1), ' ') in ( SELECT RTRIM(crpgm, ' ') FROM testdta.F559890 WHERE crcfgsid = 'PDFHANDLER') ";
	query += " ORDER BY jcactdate DESC, jcacttime DESC";

	logger.info(query);

	connection.execute(query, [], { resultSet: true }, function(err, result) 
	{
		if (err) { logger.error(err.message) };

		fetchRowsFromRS( connection, result.resultSet, numRows, audit, begin );	

	}); 
}


// Process results of query on JDE Job Control file 

function fetchRowsFromRS(connection, resultSet, numRows, audit, begin) {

    var latestRow = null;
    var latestPdf = null;

    resultSet.getRows( numRows, function(err, rows) {
       if ( err ) { resultSet.close( function( err ) { logger.error( err.message ); oracleConnectionRelease(); })
        } else if ( rows.length == 0 ) { 
		resultSet.close( function ( err) {
			if ( err ) { logger.error(err.message); oracleConnectionRelease(); }
			});
        } else if ( rows.length > 0 ) {
            
            // Query has returned record
            latestRow = rows[0];
            latestPdf = latestRow[0];
            logger.debug( "Latest UBE is : " + latestRow );

		logger.debug(" Previous UBE PDF is : " + previousPdf);
		logger.debug(" Latest UBE PDF is : " + latestPdf);

            // Compare count of eligible PDF files if different from last then we have a change so check and process in detail 
            if ( previousPdf === latestPdf ) {
                logger.debug( "No Change detected");
            } else {
                logger.info( " ");
                logger.info( "          >>>>  CHANGE detected  <<<<");
                logger.info( " ");
                previousPdf = latestPdf;

                // Process files in detail here 
		// ......

            }
            
            // Read next record
            // fetchRowsFromRS( connection, resultSet, numRows, audit );

           var finish = new Date();
           logger.info("Checking completed : " + finish + " took " + (finish - begin) + " milliseconds"  );

           // Sleep briefly then repeat check (monitor)
           setTimeout( function() { recursive( connection, logger, credentials ) } , 3000  );


        }
    }); 
}

function oracleConnectionRelease( connection ) {

    logger.debug("Releasing Connection");
    connection.release( function ( err ) {
        if ( err ) {
            logger.error( err.message );
        }
    });

}



