
var oracledb = require("oracledb");
var logger = require("./common/logger");
var audit = require("./common/audit.js");
var lock = require("./common/lock.js");
var async = require("async");
var exec = require("child_process").exec;
var sleep = require("sleep");

var credentials = {user: "test_user", password: "test_user", connectString: "jdetest"};
var numRows = 1;
var pollInterval = 2;
var hostname = process.env.HOSTNAME;


logger.info("Start Checking");
logger.info("Query Database");
logger.info("Change Detected");
logger.info("No Change Detected Sleep 2 seconds then try again");



while (true) {

    logger.debug("Do Check");

    
    logger.debug("Sleep : ");
    sleep.sleep(pollInterval);
}






// Need date and time of last processed PDF file by this program as starting point for this process run  

function queryJdeAuditLog(connection) 
{

	var query = "SELECT paupmj, paupmt, pasawlatm FROM testdta.F559859 ORDER BY pasawlatm DESC";

	connection.execute(query, [], { resultSet: true }, function(err, result) 
	{
		if (err) { logger.debug(err.message) };
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
				logger.debug(err.message);
				connection.release(function(err)
				{
					if (err) { logger.log(err.message); }
				});
			}
		}); 
      	} else if (rows.length == 0)
	{
		resultSet.close(function(err)
		{
			if (err)
			{
				logger.log(err.message);
				connection.release(function(err)
				{
					if (err) { logger.log(err.message); }
				});
			}
		});
	} else if (rows.length > 0)
	{
		
		// Last audit entry retrieved
		// Process continues by querying the JDE Job Control Master file for eligible PDF's to process

		var record = rows[0];
		queryJdeJobControl(connection, record);
		
	}
  });
}



// Query the JDE Job Control Master file to fetch all PDF files generated since last audit entry
// Only select PDF jobs that are registered for post PDF processing e.g. R5542565 Invoice Print

function queryJdeJobControl(connection, record) 
{

	// Issue with server clocks JDE and Linux being slightly out - approx 2.5 minutes.
	// This will be rectified but in case it happens again or times drift slightly in future 
	// Adjust query search date and time backwards by 5 minutes to allow for slightly different clock times
	// and to ensure a PDF completing on JDE when this query runs is still included

	var auditTimestamp = record[2];
	var result = audit.adjustTimestampByMinutes(auditTimestamp, -5);
	console.log(result);
	var jdedate = result.jdeDate;
	var jdetime = result.jdeTime;

	var query = "SELECT jcfndfuf2, jcactdate, jcacttime, jcprocessid FROM testdta.F556110 WHERE jcjobsts = 'D' AND jcfuno = 'UBE'";
	query += " AND jcactdate >= ";
	query += jdedate;
	query += " AND jcacttime >= ";
	query += jdetime;
	query += " AND RTRIM(SUBSTR(jcfndfuf2, 0, INSTR(jcfndfuf2, '_') - 1), ' ') in ( SELECT RTRIM(ppfbdube, ' ') FROM testdta.F559850 ) ";

	logger.log(query);

	connection.execute(query, [], { resultSet: true }, function(err, result) 
	{
		if (err) { logger.log(err.message) };
		fetchRowsFromRS( connection, result.resultSet, numRows, audit );	
	}); 
}






